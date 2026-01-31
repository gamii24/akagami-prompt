import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database;
  R2: R2Bucket;
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// API routes
app.get('/api/prompts', async (c) => {
  const { DB } = c.env
  const category = c.req.query('category')
  
  let query = `
    SELECT p.*, c.name as category_name 
    FROM prompts p 
    LEFT JOIN categories c ON p.category_id = c.id
  `
  
  if (category) {
    query += ` WHERE c.name = ?`
    const result = await DB.prepare(query).bind(category).all()
    return c.json(result.results)
  }
  
  const result = await DB.prepare(query + ' ORDER BY p.created_at DESC').all()
  return c.json(result.results)
})

app.get('/api/categories', async (c) => {
  const { DB } = c.env
  const result = await DB.prepare('SELECT * FROM categories ORDER BY id').all()
  return c.json(result.results)
})

// Home page
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>プロンプト管理サイト</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
          :root {
            --accent-color: #E75556;
          }
          .accent-bg {
            background-color: var(--accent-color);
          }
          .accent-text {
            color: var(--accent-color);
          }
          .accent-border {
            border-color: var(--accent-color);
          }
          .hover-accent:hover {
            background-color: var(--accent-color);
            color: white;
          }
          .grid-container {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 1.5rem;
          }
          @media (max-width: 1280px) {
            .grid-container {
              grid-template-columns: repeat(4, 1fr);
            }
          }
          @media (max-width: 1024px) {
            .grid-container {
              grid-template-columns: repeat(3, 1fr);
            }
          }
          @media (max-width: 768px) {
            .grid-container {
              grid-template-columns: repeat(2, 1fr);
            }
          }
          @media (max-width: 640px) {
            .grid-container {
              grid-template-columns: repeat(1, 1fr);
            }
          }
          .prompt-card {
            aspect-ratio: 1;
            position: relative;
            overflow: hidden;
            border-radius: 0.5rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            transition: transform 0.2s;
          }
          .prompt-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          }
          .prompt-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .prompt-overlay {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);
            padding: 1rem;
            color: white;
          }
          .copy-btn {
            background-color: var(--accent-color);
            transition: all 0.2s;
          }
          .copy-btn:hover {
            background-color: #d04445;
            transform: scale(1.05);
          }
        </style>
    </head>
    <body class="bg-white">
        <!-- Header -->
        <header class="accent-bg text-white py-6 shadow-md">
            <div class="max-w-7xl mx-auto px-4">
                <h1 class="text-3xl font-bold">
                    <i class="fas fa-sparkles mr-2"></i>
                    プロンプト管理サイト
                </h1>
            </div>
        </header>

        <!-- Category Filter -->
        <div class="max-w-7xl mx-auto px-4 py-6">
            <div class="flex flex-wrap gap-3 mb-6">
                <button onclick="filterCategory('')" class="px-4 py-2 rounded-full border-2 border-gray-300 hover-accent transition category-btn active">
                    すべて
                </button>
                <div id="category-buttons"></div>
            </div>
        </div>

        <!-- Prompts Grid -->
        <main class="max-w-7xl mx-auto px-4 pb-12">
            <div id="prompts-grid" class="grid-container">
                <div class="col-span-full text-center py-12">
                    <i class="fas fa-spinner fa-spin text-4xl accent-text"></i>
                    <p class="mt-4 text-gray-600">読み込み中...</p>
                </div>
            </div>
        </main>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
          let allPrompts = [];
          let categories = [];

          // Load categories
          async function loadCategories() {
            try {
              const response = await axios.get('/api/categories');
              categories = response.data;
              
              const container = document.getElementById('category-buttons');
              categories.forEach(cat => {
                const btn = document.createElement('button');
                btn.className = 'px-4 py-2 rounded-full border-2 border-gray-300 hover-accent transition category-btn';
                btn.textContent = cat.name;
                btn.onclick = () => filterCategory(cat.name);
                container.appendChild(btn);
              });
            } catch (error) {
              console.error('Error loading categories:', error);
            }
          }

          // Load prompts
          async function loadPrompts(category = '') {
            try {
              const url = category ? \`/api/prompts?category=\${encodeURIComponent(category)}\` : '/api/prompts';
              const response = await axios.get(url);
              allPrompts = response.data;
              renderPrompts();
            } catch (error) {
              console.error('Error loading prompts:', error);
              document.getElementById('prompts-grid').innerHTML = \`
                <div class="col-span-full text-center py-12">
                  <i class="fas fa-exclamation-circle text-4xl accent-text"></i>
                  <p class="mt-4 text-gray-600">プロンプトの読み込みに失敗しました</p>
                </div>
              \`;
            }
          }

          // Render prompts
          function renderPrompts() {
            const grid = document.getElementById('prompts-grid');
            
            if (allPrompts.length === 0) {
              grid.innerHTML = \`
                <div class="col-span-full text-center py-12">
                  <i class="fas fa-inbox text-4xl text-gray-400"></i>
                  <p class="mt-4 text-gray-600">プロンプトがまだありません</p>
                </div>
              \`;
              return;
            }

            grid.innerHTML = allPrompts.map(prompt => {
              const escapedText = prompt.prompt_text.replace(/'/g, "\\\\'").replace(/"/g, '\\\\"');
              return \`
              <div class="prompt-card">
                <img src="\${prompt.image_url}" alt="\${prompt.title}" class="prompt-image" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22400%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22400%22 height=%22400%22/%3E%3Ctext fill=%22%239ca3af%22 font-family=%22sans-serif%22 font-size=%2224%22 text-anchor=%22middle%22 x=%22200%22 y=%22200%22%3ENo Image%3C/text%3E%3C/svg%3E'">
                <div class="prompt-overlay">
                  <h3 class="font-bold text-sm mb-2 line-clamp-2">\${prompt.title}</h3>
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs bg-white/20 px-2 py-1 rounded">\${prompt.category_name}</span>
                    <button onclick="copyPrompt(\${prompt.id}, '\${escapedText}')" class="copy-btn text-white px-3 py-1 rounded text-xs font-medium">
                      <i class="fas fa-copy mr-1"></i>コピー
                    </button>
                  </div>
                </div>
                <a href="/prompt/\${prompt.id}" class="absolute inset-0"></a>
              </div>
              \`;
            }).join('');
          }

          // Copy prompt to clipboard
          async function copyPrompt(id, text) {
            event.stopPropagation();
            event.preventDefault();
            try {
              await navigator.clipboard.writeText(text);
              const btn = event.currentTarget;
              const originalHTML = btn.innerHTML;
              btn.innerHTML = '<i class="fas fa-check mr-1"></i>コピー完了！';
              setTimeout(() => {
                btn.innerHTML = originalHTML;
              }, 2000);
            } catch (error) {
              alert('コピーに失敗しました');
            }
          }

          // Filter by category
          function filterCategory(category) {
            // Update active button
            document.querySelectorAll('.category-btn').forEach(btn => {
              btn.classList.remove('active', 'accent-bg', 'text-white', 'border-transparent');
              btn.classList.add('border-gray-300');
            });
            event.currentTarget.classList.add('active', 'accent-bg', 'text-white', 'border-transparent');
            event.currentTarget.classList.remove('border-gray-300');
            
            loadPrompts(category);
          }

          // Initialize
          loadCategories();
          loadPrompts();
        </script>
    </body>
    </html>
  `)
})

export default app
