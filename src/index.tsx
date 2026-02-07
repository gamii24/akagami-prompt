import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import auth from './auth'
import submissions from './submissions'

type Bindings = {
  DB: D1Database;
  R2: R2Bucket;
  SUBMISSIONS_R2: R2Bucket;
  RESEND_API_KEY: string;
}

const app = new Hono<{ Bindings: Bindings }>()

// Mount auth and submissions routes
app.route('/api/auth', auth)
app.route('/api/submissions', submissions)

// Enable CORS
app.use('/api/*', cors())

// Serve favicon (public site)
app.get('/favicon.svg', (c) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#E75556" rx="20"/>
  <text x="50" y="70" font-family="Arial, sans-serif" font-size="60" font-weight="bold" fill="white" text-anchor="middle">A</text>
</svg>`;
  return c.body(svg, 200, {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'public, max-age=31536000'
  });
})

// Serve admin favicon (admin page)
app.get('/admin-favicon.svg', (c) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#E75556" rx="20"/>
  <g fill="white" transform="translate(50, 50)">
    <path d="M0,-20 L5,-17 L5,-10 L10,-8 L14,-12 L19,-9 L17,-4 L23,0 L17,4 L19,9 L14,12 L10,8 L5,10 L5,17 L0,20 L-5,17 L-5,10 L-10,8 L-14,12 L-19,9 L-17,4 L-23,0 L-17,-4 L-19,-9 L-14,-12 L-10,-8 L-5,-10 L-5,-17 Z M0,-8 A8,8 0 1,1 0,8 A8,8 0 1,1 0,-8 Z"/>
  </g>
</svg>`;
  return c.body(svg, 200, {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'public, max-age=31536000'
  });
})

// Serve OGP image
app.get('/ogp-image.png', (c) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#FFF5F5;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#FEE2E2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bgGradient)"/>
  <circle cx="100" cy="100" r="60" fill="#E75556" opacity="0.1"/>
  <circle cx="1100" cy="530" r="80" fill="#E75556" opacity="0.1"/>
  <g transform="translate(100, 200)">
    <rect x="0" y="0" width="80" height="80" fill="#E75556" rx="16"/>
    <text x="40" y="62" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="white" text-anchor="middle">A</text>
    <text x="110" y="40" font-family="Arial, sans-serif" font-size="42" font-weight="bold" fill="#1F2937">Akagami Prompt</text>
    <text x="110" y="75" font-family="Arial, sans-serif" font-size="28" fill="#6B7280">働く女性を助ける画像生成</text>
  </g>
  <text x="100" y="380" font-family="Arial, sans-serif" font-size="24" fill="#374151">ビジネスシーンで使える画像生成プロンプトを共有</text>
  <text x="100" y="420" font-family="Arial, sans-serif" font-size="22" fill="#6B7280">プロフェッショナルなビジネスポートレート、プレゼン資料、</text>
  <text x="100" y="455" font-family="Arial, sans-serif" font-size="22" fill="#6B7280">アイコン写真など、AI画像生成プロンプトが満載</text>
  <text x="100" y="550" font-family="Arial, sans-serif" font-size="20" fill="#E75556" font-weight="bold">akagami-prompt.pages.dev</text>
</svg>`;
  return c.body(svg, 200, {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'public, max-age=31536000'
  });
})

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// API routes
app.get('/api/prompts', async (c) => {
  const { DB } = c.env
  const category = c.req.query('category')
  const forMen = c.req.query('for_men')
  
  let query = `
    SELECT p.*, c.name as category_name 
    FROM prompts p 
    LEFT JOIN categories c ON p.category_id = c.id
  `
  
  const conditions = []
  const bindings = []
  
  if (category) {
    conditions.push('c.name = ?')
    bindings.push(category)
  }
  
  if (forMen === 'true') {
    conditions.push('p.for_men = 1')
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }
  
  query += ' ORDER BY p.created_at DESC'
  
  const result = bindings.length > 0 
    ? await DB.prepare(query).bind(...bindings).all()
    : await DB.prepare(query).all()
  
  return c.json(result.results)
})

app.get('/api/categories', async (c) => {
  const { DB } = c.env
  const result = await DB.prepare('SELECT * FROM categories ORDER BY id').all()
  return c.json(result.results)
})

// Increment copy count
app.post('/api/prompts/:id/copy', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  
  await DB.prepare(`
    UPDATE prompts 
    SET copy_count = copy_count + 1 
    WHERE id = ?
  `).bind(id).run()
  
  return c.json({ success: true })
})

// API: Get active speech bubble messages
app.get('/api/speech-bubble-messages', async (c) => {
  const { DB } = c.env
  const result = await DB.prepare(`
    SELECT message 
    FROM speech_bubble_messages 
    WHERE is_active = 1 
    ORDER BY display_order
  `).all()
  return c.json(result.results.map(r => r.message))
})

// Admin API - Get all speech bubble messages
app.get('/api/admin-51adc6a8e924b23431240a1156034bae/speech-messages', async (c) => {
  const { DB } = c.env
  const result = await DB.prepare(`
    SELECT * FROM speech_bubble_messages 
    ORDER BY display_order, id
  `).all()
  return c.json(result.results)
})

// Admin API - Create speech bubble message
app.post('/api/admin-51adc6a8e924b23431240a1156034bae/speech-messages', async (c) => {
  const { DB } = c.env
  const { message } = await c.req.json()
  
  const result = await DB.prepare(`
    INSERT INTO speech_bubble_messages (message, display_order)
    VALUES (?, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM speech_bubble_messages))
  `).bind(message).run()
  
  return c.json({ success: true, id: result.meta.last_row_id })
})

// Admin API - Update speech bubble message
app.put('/api/admin-51adc6a8e924b23431240a1156034bae/speech-messages/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  const { message, is_active, display_order } = await c.req.json()
  
  await DB.prepare(`
    UPDATE speech_bubble_messages 
    SET message = ?, is_active = ?, display_order = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(message, is_active ? 1 : 0, display_order, id).run()
  
  return c.json({ success: true })
})

// Admin API - Delete speech bubble message
app.delete('/api/admin-51adc6a8e924b23431240a1156034bae/speech-messages/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  
  await DB.prepare('DELETE FROM speech_bubble_messages WHERE id = ?').bind(id).run()
  
  return c.json({ success: true })
})

// Admin API - Get prompt by ID
app.get('/api/admin-51adc6a8e924b23431240a1156034bae/prompts/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  
  // Get prompt details
  const prompt = await DB.prepare(`
    SELECT p.*, c.name as category_name 
    FROM prompts p 
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `).bind(id).first()
  
  if (!prompt) {
    return c.json({ error: 'Prompt not found' }, 404)
  }
  
  // Get prompt images
  const images = await DB.prepare(`
    SELECT * FROM prompt_images 
    WHERE prompt_id = ? 
    ORDER BY display_order
  `).bind(id).all()
  
  return c.json({
    ...prompt,
    images: images.results
  })
})

app.get('/api/prompts/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  
  // Get prompt details
  const prompt = await DB.prepare(`
    SELECT p.*, c.name as category_name 
    FROM prompts p 
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `).bind(id).first()
  
  if (!prompt) {
    return c.json({ error: 'Prompt not found' }, 404)
  }
  
  // Get prompt images
  const images = await DB.prepare(`
    SELECT * FROM prompt_images 
    WHERE prompt_id = ? 
    ORDER BY display_order
  `).bind(id).all()
  
  // Get feedbacks
  const feedbacks = await DB.prepare(`
    SELECT * FROM feedbacks 
    WHERE prompt_id = ? 
    ORDER BY created_at DESC
  `).bind(id).all()
  
  return c.json({
    ...prompt,
    images: images.results,
    feedbacks: feedbacks.results
  })
})

app.post('/api/feedbacks', async (c) => {
  const { DB } = c.env
  const { prompt_id, author_name, comment, image_url } = await c.req.json()
  
  if (!prompt_id || !author_name) {
    return c.json({ error: 'prompt_id and author_name are required' }, 400)
  }
  
  const result = await DB.prepare(`
    INSERT INTO feedbacks (prompt_id, author_name, comment, image_url)
    VALUES (?, ?, ?, ?)
  `).bind(prompt_id, author_name, comment || null, image_url || null).run()
  
  return c.json({ success: true, id: result.meta.last_row_id })
})

// Admin API - Categories
app.post('/api/admin-51adc6a8e924b23431240a1156034bae/categories', async (c) => {
  const { DB } = c.env
  const { name } = await c.req.json()
  
  if (!name) {
    return c.json({ error: 'name is required' }, 400)
  }
  
  try {
    const result = await DB.prepare(`
      INSERT INTO categories (name) VALUES (?)
    `).bind(name).run()
    
    return c.json({ success: true, id: result.meta.last_row_id })
  } catch (error) {
    return c.json({ error: 'Category already exists or database error' }, 400)
  }
})

app.put('/api/admin-51adc6a8e924b23431240a1156034bae/categories/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  const { name } = await c.req.json()
  
  if (!name) {
    return c.json({ error: 'name is required' }, 400)
  }
  
  await DB.prepare(`
    UPDATE categories SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(name, id).run()
  
  return c.json({ success: true })
})

app.delete('/api/admin-51adc6a8e924b23431240a1156034bae/categories/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  
  await DB.prepare(`DELETE FROM categories WHERE id = ?`).bind(id).run()
  
  return c.json({ success: true })
})

// Admin API - Prompts
app.post('/api/admin-51adc6a8e924b23431240a1156034bae/prompts', async (c) => {
  const { DB } = c.env
  const { title, prompt_text, category_id, image_url, image_urls, for_men } = await c.req.json()
  
  if (!title || !prompt_text || !category_id || !image_url) {
    return c.json({ error: 'title, prompt_text, category_id, and image_url are required' }, 400)
  }
  
  // Insert prompt
  const result = await DB.prepare(`
    INSERT INTO prompts (title, prompt_text, image_url, category_id, for_men)
    VALUES (?, ?, ?, ?, ?)
  `).bind(title, prompt_text, image_url, category_id, for_men ? 1 : 0).run()
  
  const promptId = result.meta.last_row_id
  
  // Insert additional images if provided
  if (image_urls && Array.isArray(image_urls) && image_urls.length > 0) {
    for (let i = 0; i < image_urls.length; i++) {
      await DB.prepare(`
        INSERT INTO prompt_images (prompt_id, image_url, display_order)
        VALUES (?, ?, ?)
      `).bind(promptId, image_urls[i], i).run()
    }
  }
  
  return c.json({ success: true, id: promptId })
})

app.put('/api/admin-51adc6a8e924b23431240a1156034bae/prompts/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  const { title, prompt_text, category_id, image_url, image_urls, for_men } = await c.req.json()
  
  if (!title || !prompt_text || !category_id || !image_url) {
    return c.json({ error: 'title, prompt_text, category_id, and image_url are required' }, 400)
  }
  
  // Update prompt
  await DB.prepare(`
    UPDATE prompts 
    SET title = ?, prompt_text = ?, image_url = ?, category_id = ?, for_men = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(title, prompt_text, image_url, category_id, for_men ? 1 : 0, id).run()
  
  // Delete old images
  await DB.prepare(`DELETE FROM prompt_images WHERE prompt_id = ?`).bind(id).run()
  
  // Insert new images if provided
  if (image_urls && Array.isArray(image_urls) && image_urls.length > 0) {
    for (let i = 0; i < image_urls.length; i++) {
      await DB.prepare(`
        INSERT INTO prompt_images (prompt_id, image_url, display_order)
        VALUES (?, ?, ?)
      `).bind(id, image_urls[i], i).run()
    }
  }
  
  return c.json({ success: true })
})

app.delete('/api/admin-51adc6a8e924b23431240a1156034bae/prompts/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  
  await DB.prepare(`DELETE FROM prompts WHERE id = ?`).bind(id).run()
  
  return c.json({ success: true })
})

// Admin API - Image Upload (simulate)
app.post('/api/admin-51adc6a8e924b23431240a1156034bae/upload', async (c) => {
  const { R2 } = c.env
  const formData = await c.req.formData()
  const file = formData.get('file')
  
  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file uploaded' }, 400)
  }
  
  try {
    const arrayBuffer = await file.arrayBuffer()
    const filename = `${Date.now()}-${file.name}`
    
    await R2.put(filename, arrayBuffer, {
      httpMetadata: {
        contentType: file.type
      }
    })
    
    // Return a placeholder URL (in production, use your R2 bucket URL)
    const imageUrl = `/api/images/${filename}`
    
    return c.json({ success: true, url: imageUrl })
  } catch (error) {
    return c.json({ error: 'Upload failed' }, 500)
  }
})

// Serve uploaded images
app.get('/api/images/:filename', async (c) => {
  const { R2 } = c.env
  const filename = c.req.param('filename')
  
  try {
    const object = await R2.get(filename)
    
    if (!object) {
      return c.notFound()
    }
    
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000'
      }
    })
  } catch (error) {
    return c.notFound()
  }
})

// Home page
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Akagami Prompt - 働く女性を助ける画像生成プロンプト集</title>
        <meta name="description" content="ビジネスシーンで使える画像生成プロンプトを共有。プロフェッショナルなビジネスポートレート、プレゼン資料、アイコン写真など、働く女性の日常をサポートするAI画像生成プロンプトが満載。">
        <link rel="icon" type="image/svg+xml" href="/favicon.svg">
        
        <!-- Google Fonts - Rounded Gothic -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@300;400;500&display=swap" rel="stylesheet">
        
        <!-- Open Graph / Facebook / Threads -->
        <meta property="og:type" content="website">
        <meta property="og:url" content="https://akagami-prompt.pages.dev/">
        <meta property="og:title" content="Akagami Prompt - 働く女性を助ける画像生成プロンプト集">
        <meta property="og:description" content="ビジネスシーンで使える画像生成プロンプトを共有。プロフェッショナルなビジネスポートレート、プレゼン資料、アイコン写真など、働く女性の日常をサポート。">
        <meta property="og:image" content="https://akagami-prompt.pages.dev/ogp-image.png">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="630">
        <meta property="og:locale" content="ja_JP">
        <meta property="og:site_name" content="Akagami Prompt">
        
        <!-- Twitter / Threads optimized -->
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:url" content="https://akagami-prompt.pages.dev/">
        <meta name="twitter:title" content="Akagami Prompt - 働く女性を助ける画像生成プロンプト集">
        <meta name="twitter:description" content="ビジネスシーンで使える画像生成プロンプトを共有。働く女性の日常をサポートするAI画像生成プロンプトが満載。">
        <meta name="twitter:image" content="https://akagami-prompt.pages.dev/ogp-image.png">
        
        <!-- Google Analytics 4 -->
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-K00PV68PRE"></script>
        <script>
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-K00PV68PRE', {
            page_title: 'Akagami Prompt - トップページ',
            page_location: window.location.href
          });
        </script>
        
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
          
          /* Skeleton Loading Animation */
          @keyframes shimmer {
            0% {
              background-position: -1000px 0;
            }
            100% {
              background-position: 1000px 0;
            }
          }
          @keyframes bounce {
            0%, 100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-3px);
            }
          }
          @keyframes wiggle {
            0%, 100% {
              transform: rotate(0deg);
            }
            25% {
              transform: rotate(-5deg);
            }
            75% {
              transform: rotate(5deg);
            }
          }
          @keyframes buttonPress {
            0% {
              transform: scale(1);
            }
            50% {
              transform: scale(0.95);
            }
            100% {
              transform: scale(1);
            }
          }
          .skeleton {
            background: linear-gradient(
              90deg,
              #f0f0f0 0%,
              #f8f8f8 20%,
              #f0f0f0 40%,
              #f0f0f0 100%
            );
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite ease-in-out;
            border-radius: 0.5rem;
          }
          @keyframes shimmer {
            0% {
              background-position: -200% 0;
            }
            100% {
              background-position: 200% 0;
            }
          }
          .skeleton-card {
            aspect-ratio: 4/5;
            overflow: hidden;
            border-radius: 0.5rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            animation: fadeIn 0.3s ease-out;
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .skeleton-button {
            height: 40px;
            border-radius: 0.5rem;
          }
          
          .category-scroll {
            display: flex;
            gap: 0.5rem;
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none; /* Firefox */
            -ms-overflow-style: none; /* IE and Edge */
            padding-bottom: 0.5rem;
          }
          .category-scroll::-webkit-scrollbar {
            display: none; /* Chrome, Safari, Opera */
          }
          .category-btn {
            flex-shrink: 0;
            padding: 0.5rem 1.25rem;
            border-radius: 9999px;
            border: 1px solid #e5e7eb;
            background: white;
            color: #6b7280;
            font-size: 0.875rem;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: pointer;
            white-space: nowrap;
            position: relative;
            overflow: hidden;
          }
          .category-btn::before {
            content: '';
            position: absolute;
            bottom: 0;
            left: 50%;
            width: 0;
            height: 2px;
            background: var(--accent-color);
            transition: all 0.3s;
            transform: translateX(-50%);
          }
          .category-btn:hover {
            border-color: var(--accent-color);
            color: var(--accent-color);
            transform: translateY(-2px);
          }
          .category-btn:hover::before {
            width: 80%;
          }
          .category-btn.active {
            background-color: var(--accent-color);
            color: white;
            border-color: var(--accent-color);
            animation: buttonPulse 0.3s ease-out;
          }
          .category-btn.active::before {
            width: 0;
          }
          @keyframes buttonPulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
          }
          .grid-container {
            display: grid;
            gap: 1.5rem;
          }
          /* Desktop grid layouts - user selectable */
          @media (min-width: 769px) {
            .grid-container.cols-5 {
              grid-template-columns: repeat(5, 1fr);
            }
            .grid-container.cols-8 {
              grid-template-columns: repeat(8, 1fr);
            }
            .grid-container.cols-10 {
              grid-template-columns: repeat(10, 1fr);
            }
          }
          /* Mobile always 2 columns */
          @media (max-width: 768px) {
            .grid-container {
              grid-template-columns: repeat(2, 1fr);
            }
          }
          /* Grid column switcher buttons */
          .grid-switcher {
            display: flex;
            gap: 0.5rem;
            align-items: center;
          }
          .grid-btn {
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            border: 2px solid #e5e7eb;
            background: white;
            color: #6b7280;
            font-size: 0.875rem;
            cursor: pointer;
            transition: all 0.2s;
          }
          .grid-btn:hover {
            border-color: var(--accent-color);
            color: var(--accent-color);
            transform: translateY(-2px);
          }
          .grid-btn:active {
            animation: buttonPress 0.2s ease;
          }
          .grid-btn.active {
            background-color: var(--accent-color);
            color: white;
            border-color: var(--accent-color);
          }
          @media (max-width: 768px) {
            .grid-switcher {
              display: none;
            }
          }
          .prompt-card {
            border-radius: 0.5rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
            background: white;
            position: relative;
            animation: fadeInUp 0.5s ease-out backwards;
          }
          .prompt-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
            transition: left 0.5s;
            pointer-events: none;
          }
          .prompt-card:hover {
            transform: translateY(-8px);
            box-shadow: 0 12px 24px rgba(233, 75, 111, 0.2);
          }
          .prompt-card:hover::before {
            left: 100%;
          }
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(30px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .prompt-image-wrapper {
            aspect-ratio: 4/5;
            overflow: hidden;
            cursor: pointer;
            position: relative;
          }
          .prompt-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .prompt-image-wrapper:hover .prompt-image {
            transform: scale(1.08);
          }
          .prompt-footer {
            padding: 0.75rem;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .copy-btn {
            background-color: var(--accent-color);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            width: 100%;
            font-family: 'Rounded Mplus 1c', 'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'メイリオ', Meiryo, sans-serif;
            position: relative;
            overflow: hidden;
          }
          .copy-btn::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            border-radius: 50%;
            background: rgba(255,255,255,0.3);
            transform: translate(-50%, -50%);
            transition: width 0.6s, height 0.6s;
          }
          .copy-btn:active::after {
            width: 300px;
            height: 300px;
          }
          .copy-btn:hover {
            background-color: #d04445;
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
          }
          .copy-btn:active {
            transform: scale(0.95);
          }
          /* Responsive copy button height based on grid columns */
          .cols-5 .copy-btn {
            padding: 0.4rem 1rem;
            font-size: 0.875rem;
          }
          .cols-8 .copy-btn {
            padding: 0.3rem 0.75rem;
            font-size: 0.75rem;
          }
          .cols-10 .copy-btn {
            padding: 0.25rem 0.5rem;
            font-size: 0.7rem;
          }
          /* Hide copy button on mobile */
          @media (max-width: 768px) {
            .prompt-footer {
              display: none;
            }
          }
          
          /* Speech bubble for copy feedback */
          .speech-bubble {
            position: fixed;
            background: white;
            color: #374151;
            padding: 12px 20px;
            border-radius: 24px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            font-size: 14px;
            font-weight: 500;
            pointer-events: none;
            z-index: 10000;
            animation: bubble-float 2s ease-out forwards;
            white-space: nowrap;
          }
          .speech-bubble::after {
            content: '';
            position: absolute;
            bottom: -8px;
            left: 50%;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 8px solid transparent;
            border-right: 8px solid transparent;
            border-top: 8px solid white;
            filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.1));
          }
          @keyframes bubble-float {
            0% {
              opacity: 0;
              transform: translateY(20px) scale(0.8);
            }
            10% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
            90% {
              opacity: 1;
              transform: translateY(-30px) scale(1);
            }
            100% {
              opacity: 0;
              transform: translateY(-50px) scale(0.9);
            }
          }
          
          /* Sparkle effect for copy button */
          .sparkle-container {
            position: fixed;
            pointer-events: none;
            z-index: 9999;
          }
          .sparkle {
            position: absolute;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            animation: sparkle-float 1s ease-out forwards;
          }
          @keyframes sparkle-float {
            0% {
              opacity: 1;
              transform: translate(0, 0) scale(1) rotate(0deg);
            }
            100% {
              opacity: 0;
              transform: translate(var(--tx), var(--ty)) scale(0.3) rotate(360deg);
            }
          }
          .sparkle-star {
            position: absolute;
            font-size: 20px;
            animation: sparkle-star-float 1.2s ease-out forwards;
          }
          @keyframes sparkle-star-float {
            0% {
              opacity: 1;
              transform: translate(0, 0) scale(1) rotate(0deg);
            }
            100% {
              opacity: 0;
              transform: translate(var(--tx), var(--ty)) scale(0.5) rotate(720deg);
            }
          }
        </style>
    </head>
    <body class="bg-white">
        <!-- Header -->
        <header class="accent-bg text-white py-6 shadow-md">
            <div class="max-w-7xl mx-auto px-4">
                <div class="flex items-center justify-between">
                    <h1 class="text-3xl font-bold">
                        <a href="/" class="flex items-center hover:opacity-80 transition-opacity cursor-pointer" style="text-decoration: none; color: inherit;">
                            <i class="fas fa-sparkles mr-2"></i>
                            Akagami Prompt
                        </a>
                    </h1>
                    <div class="flex items-center gap-4">
                        <a href="/how-to-use" class="text-white hover:opacity-80 transition flex items-center group">
                            <i class="fas fa-book-open mr-2 group-hover:animate-[wiggle_0.5s_ease-in-out]"></i>
                            <span class="hidden sm:inline">使い方</span>
                        </a>
                        <!-- Auth section -->
                        <div id="auth-section">
                            <a href="/login" class="text-white hover:opacity-80 transition flex items-center">
                                <i class="fas fa-sign-in-alt mr-2"></i>
                                <span class="hidden sm:inline">ログイン</span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </header>

        <!-- Mobile How-to Link (visible only on mobile) -->
        <div class="md:hidden bg-gray-50 border-b border-gray-200 py-2">
            <div class="max-w-7xl mx-auto px-4 text-center">
                <a href="/how-to-use" class="text-sm text-gray-600 hover:text-pink-600 transition inline-flex items-center justify-center">
                    <i class="fas fa-book-open text-xs mr-1"></i>
                    使い方はこちら
                </a>
            </div>
        </div>

        <!-- Category Filter -->
        <div class="max-w-7xl mx-auto px-4 py-4">
            <div class="category-scroll">
                <button onclick="filterCategory('')" class="category-btn active" data-category="">
                    すべて
                </button>
                <div id="category-buttons" style="display: contents;"></div>
                <button onclick="toggleForMenFilter()" id="for-men-filter-btn" class="category-btn" style="background: #3B82F6; color: white; margin-left: 8px;">
                    <i class="fas fa-heart mr-1"></i>男性も使用可
                </button>
            </div>
        </div>
        
        <!-- Search Bar and Grid Switcher -->
        <div class="max-w-7xl mx-auto px-4 pb-4">
            <div class="flex items-center gap-4">
                <div class="relative flex-1">
                    <input 
                        type="text" 
                        id="search-input" 
                        placeholder="プロンプトを検索（タイトル・プロンプトテキスト）" 
                        class="w-full px-4 py-3 pl-12 border-2 border-gray-300 rounded-lg focus:border-accent-color focus:outline-none transition"
                        oninput="searchPrompts()"
                    />
                    <i class="fas fa-search absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    <button 
                        id="clear-search" 
                        onclick="clearSearch()" 
                        class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition hidden"
                    >
                        <i class="fas fa-times-circle text-xl"></i>
                    </button>
                </div>
                
                <!-- Sort Options -->
                <div class="flex items-center gap-2">
                    <label for="sort-select" class="text-sm text-gray-600 whitespace-nowrap">並び順:</label>
                    <select id="sort-select" onchange="changeSortOrder()" 
                            class="px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-color focus:outline-none text-sm">
                        <option value="newest">新着順</option>
                        <option value="popular">人気順</option>
                    </select>
                </div>
                
                <!-- Grid Column Switcher (PC only) -->
                <div class="grid-switcher">
                    <span class="text-sm text-gray-600">表示:</span>
                    <button onclick="changeGridColumns(5)" class="grid-btn active" data-cols="5">
                        <i class="fas fa-th mr-1"></i>5列
                    </button>
                    <button onclick="changeGridColumns(8)" class="grid-btn" data-cols="8">
                        <i class="fas fa-th mr-1"></i>8列
                    </button>
                    <button onclick="changeGridColumns(10)" class="grid-btn" data-cols="10">
                        <i class="fas fa-th mr-1"></i>10列
                    </button>
                </div>
            </div>
            <div id="search-results-count" class="mt-2 text-sm text-gray-600 hidden"></div>
        </div>

        <!-- Prompts Grid -->
        <main class="max-w-7xl mx-auto px-4 pb-12">
            <div id="prompts-grid" class="grid-container cols-5">
                <!-- Skeleton Loading (Initial) -->
                <div class="skeleton-card skeleton"></div>
                <div class="skeleton-card skeleton"></div>
                <div class="skeleton-card skeleton"></div>
                <div class="skeleton-card skeleton"></div>
                <div class="skeleton-card skeleton"></div>
                <div class="skeleton-card skeleton" style="display: none;"></div>
                <div class="skeleton-card skeleton" style="display: none;"></div>
                <div class="skeleton-card skeleton" style="display: none;"></div>
                <div class="skeleton-card skeleton" style="display: none;"></div>
                <div class="skeleton-card skeleton" style="display: none;"></div>
            </div>
        </main>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
          let allPrompts = [];
          let categories = [];
          let speechBubbleMessages = []; // Messages loaded from API
          
          // Load speech bubble messages from API
          async function loadSpeechBubbleMessages() {
            try {
              const response = await axios.get('/api/speech-bubble-messages');
              speechBubbleMessages = response.data;
              // Fallback to default if no messages
              if (speechBubbleMessages.length === 0) {
                speechBubbleMessages = ['ありがとう', '楽しんで', 'AIって最高'];
              }
            } catch (error) {
              console.error('Failed to load speech bubble messages:', error);
              speechBubbleMessages = ['ありがとう', '楽しんで', 'AIって最高'];
            }
          }
          
          // Create speech bubble with random message
          function createSpeechBubble(x, y) {
            if (speechBubbleMessages.length === 0) {
              return; // No messages available
            }
            
            const message = speechBubbleMessages[Math.floor(Math.random() * speechBubbleMessages.length)];
            
            const bubble = document.createElement('div');
            bubble.className = 'speech-bubble';
            bubble.textContent = message;
            bubble.style.left = x + 'px';
            bubble.style.top = (y - 60) + 'px';
            bubble.style.transform = 'translateX(-50%)';
            
            document.body.appendChild(bubble);
            
            setTimeout(() => {
              bubble.remove();
            }, 2000);
          }
          
          // Create sparkle effect
          function createSparkleEffect(x, y) {
            const container = document.createElement('div');
            container.className = 'sparkle-container';
            container.style.left = x + 'px';
            container.style.top = y + 'px';
            document.body.appendChild(container);
            
            // Colorful palette
            const colors = [
              ['#FF6B6B', '#FF8E53'], // Red-Orange
              ['#4ECDC4', '#44A08D'], // Teal-Green
              ['#A8E6CF', '#56CCF2'], // Mint-Blue
              ['#FFD93D', '#F9CA24'], // Yellow
              ['#FF6348', '#FF4757'], // Red
              ['#A29BFE', '#6C5CE7'], // Purple
              ['#FD79A8', '#E84393'], // Pink
              ['#55EFC4', '#00D2D3'], // Turquoise
              ['#74B9FF', '#0984E3'], // Blue
              ['#FAB1A0', '#E17055'], // Peach
            ];
            
            // Create sparkles (circles)
            const sparkleCount = 15;
            for (let i = 0; i < sparkleCount; i++) {
              const sparkle = document.createElement('div');
              sparkle.className = 'sparkle';
              
              // Random color from palette
              const colorPair = colors[Math.floor(Math.random() * colors.length)];
              const gradient = \`radial-gradient(circle, \${colorPair[0]} 0%, \${colorPair[1]} 50%, transparent 70%)\`;
              sparkle.style.background = gradient;
              sparkle.style.boxShadow = \`0 0 10px \${colorPair[0]}, 0 0 20px \${colorPair[1]}\`;
              
              // Random direction and distance
              const angle = (Math.PI * 2 * i) / sparkleCount;
              const distance = 50 + Math.random() * 50;
              const tx = Math.cos(angle) * distance;
              const ty = Math.sin(angle) * distance;
              
              sparkle.style.setProperty('--tx', tx + 'px');
              sparkle.style.setProperty('--ty', ty + 'px');
              
              container.appendChild(sparkle);
            }
            
            // Create star symbols (✨⭐💫🌟⭐)
            const starSymbols = ['✨', '⭐', '💫', '🌟', '⭐', '✨', '💖', '💙'];
            starSymbols.forEach((symbol, i) => {
              const star = document.createElement('div');
              star.className = 'sparkle-star';
              star.textContent = symbol;
              
              // Random color for text shadow
              const colorPair = colors[Math.floor(Math.random() * colors.length)];
              star.style.textShadow = \`0 0 10px \${colorPair[0]}, 0 0 20px \${colorPair[1]}\`;
              
              // Random direction and distance
              const angle = Math.random() * Math.PI * 2;
              const distance = 60 + Math.random() * 80;
              const tx = Math.cos(angle) * distance;
              const ty = Math.sin(angle) * distance;
              
              star.style.setProperty('--tx', tx + 'px');
              star.style.setProperty('--ty', ty + 'px');
              
              container.appendChild(star);
            });
            
            // Remove after animation
            setTimeout(() => {
              container.remove();
            }, 1200);
          }
          
          // Show skeleton loading
          function showSkeletonLoading() {
            const grid = document.getElementById('prompts-grid');
            grid.innerHTML = \`
              <div class="skeleton-card skeleton"></div>
              <div class="skeleton-card skeleton"></div>
              <div class="skeleton-card skeleton"></div>
              <div class="skeleton-card skeleton"></div>
              <div class="skeleton-card skeleton"></div>
              <div class="skeleton-card skeleton"></div>
              <div class="skeleton-card skeleton"></div>
              <div class="skeleton-card skeleton"></div>
              <div class="skeleton-card skeleton"></div>
              <div class="skeleton-card skeleton"></div>
            \`;
          }

          // Load categories
          async function loadCategories() {
            try {
              const response = await axios.get('/api/categories');
              categories = response.data;
              
              const container = document.getElementById('category-buttons');
              categories.forEach(cat => {
                const btn = document.createElement('button');
                btn.className = 'category-btn';
                btn.textContent = cat.name;
                btn.dataset.category = cat.name;
                btn.onclick = () => filterCategory(cat.name);
                container.appendChild(btn);
              });
            } catch (error) {
              console.error('Error loading categories:', error);
            }
          }

          // Load prompts
          async function loadPrompts(category = '') {
            // Show skeleton loading
            showSkeletonLoading();
            
            try {
              const url = category ? \`/api/prompts?category=\${encodeURIComponent(category)}\` : '/api/prompts';
              const response = await axios.get(url);
              allPrompts = response.data;
              
              // Apply sorting
              sortPrompts();
              
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
          function renderPrompts(promptsToRender = null) {
            const grid = document.getElementById('prompts-grid');
            const prompts = promptsToRender || allPrompts;
            
            if (prompts.length === 0) {
              grid.innerHTML = \`
                <div class="col-span-full text-center py-12">
                  <i class="fas fa-inbox text-4xl text-gray-400"></i>
                  <p class="mt-4 text-gray-600">プロンプトが見つかりません</p>
                </div>
              \`;
              return;
            }

            grid.innerHTML = prompts.map(prompt => {
              return \`
              <div class="prompt-card">
                <div class="prompt-image-wrapper" onclick="location.href='/prompt/\${prompt.id}'">
                  <img src="\${prompt.image_url}" alt="\${prompt.title}" class="prompt-image" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22500%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22400%22 height=%22500%22/%3E%3Ctext fill=%22%239ca3af%22 font-family=%22sans-serif%22 font-size=%2224%22 text-anchor=%22middle%22 x=%22200%22 y=%22250%22%3ENo Image%3C/text%3E%3C/svg%3E'">
                  \${prompt.for_men ? '<div class="absolute top-2 right-2 text-white text-lg" style="color: #3B82F6; text-shadow: 0 2px 4px rgba(0,0,0,0.2);"><i class="fas fa-heart"></i></div>' : ''}
                </div>
                <div class="prompt-footer">
                  <button class="copy-btn text-white px-4 rounded text-sm font-semibold uppercase" data-prompt-id="\${prompt.id}">
                    Copy
                  </button>
                </div>
              </div>
              \`;
            }).join('');
          }

          // Copy prompt to clipboard using event delegation
          document.addEventListener('click', async function(event) {
            const copyBtn = event.target.closest('.copy-btn');
            if (copyBtn && copyBtn.dataset.promptId) {
              event.stopPropagation();
              event.preventDefault();
              
              const promptId = copyBtn.dataset.promptId;
              const prompt = allPrompts.find(p => p.id == promptId);
              
              if (!prompt) {
                alert('プロンプトが見つかりません');
                return;
              }
              
              try {
                // Try clipboard API
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  await navigator.clipboard.writeText(prompt.prompt_text);
                } else {
                  // Fallback for older browsers
                  const textArea = document.createElement('textarea');
                  textArea.value = prompt.prompt_text;
                  textArea.style.position = 'fixed';
                  textArea.style.left = '-999999px';
                  document.body.appendChild(textArea);
                  textArea.select();
                  document.execCommand('copy');
                  document.body.removeChild(textArea);
                }
                
                // Increment copy count
                try {
                  await axios.post(\`/api/prompts/\${promptId}/copy\`);
                } catch (err) {
                  console.error('Failed to increment copy count:', err);
                }
                
                // Google Analytics event tracking
                if (typeof gtag !== 'undefined') {
                  gtag('event', 'copy_prompt', {
                    event_category: 'engagement',
                    event_label: prompt.title,
                    value: promptId
                  });
                }
                
                // Show sparkle effect
                const rect = copyBtn.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                createSparkleEffect(x, y);
                createSpeechBubble(x, y);
                
                const originalHTML = copyBtn.innerHTML;
                copyBtn.innerHTML = 'Copied!';
                setTimeout(() => {
                  copyBtn.innerHTML = originalHTML;
                }, 2000);
              } catch (error) {
                console.error('Copy error:', error);
                alert('コピーに失敗しました: ' + (error.message || 'Unknown error'));
              }
            }
          });

          // Search prompts
          let searchTimeout;
          let currentCategory = '';
          let currentSortOrder = 'newest'; // 'newest' or 'popular'
          let forMenFilterActive = false; // 男性向けフィルター状態
          
          function toggleForMenFilter() {
            forMenFilterActive = !forMenFilterActive;
            const btn = document.getElementById('for-men-filter-btn');
            
            if (forMenFilterActive) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
            
            // フィルター適用
            applyFilters();
            
            // Google Analytics tracking
            if (typeof gtag !== 'undefined') {
              gtag('event', 'toggle_for_men_filter', {
                event_category: 'engagement',
                event_label: forMenFilterActive ? 'on' : 'off'
              });
            }
          }
          
          function applyFilters() {
            let filtered = allPrompts;
            
            // カテゴリフィルター
            if (currentCategory) {
              filtered = filtered.filter(p => p.category_id == currentCategory);
            }
            
            // 男性向けフィルター
            if (forMenFilterActive) {
              filtered = filtered.filter(p => p.for_men);
            }
            
            // ソート
            if (currentSortOrder === 'popular') {
              filtered = filtered.sort((a, b) => (b.copy_count || 0) - (a.copy_count || 0));
            } else {
              filtered = filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            }
            
            renderPrompts(filtered);
          }
          
          function searchPrompts() {
            clearTimeout(searchTimeout);
            const searchInput = document.getElementById('search-input');
            const clearBtn = document.getElementById('clear-search');
            const resultsCount = document.getElementById('search-results-count');
            const searchTerm = searchInput.value.trim().toLowerCase();
            
            // Show/hide clear button
            if (searchTerm) {
              clearBtn.classList.remove('hidden');
            } else {
              clearBtn.classList.add('hidden');
              resultsCount.classList.add('hidden');
            }
            
            // Debounce search
            searchTimeout = setTimeout(() => {
              if (searchTerm) {
                // Filter allPrompts by search term
                const filtered = allPrompts.filter(prompt => {
                  return prompt.title.toLowerCase().includes(searchTerm) ||
                         prompt.prompt_text.toLowerCase().includes(searchTerm);
                });
                
                // Show results count
                resultsCount.textContent = \`\${filtered.length}件のプロンプトが見つかりました\`;
                resultsCount.classList.remove('hidden');
                
                // Render filtered results
                renderPrompts(filtered);
                
                // Google Analytics event tracking
                if (typeof gtag !== 'undefined') {
                  gtag('event', 'search_prompts', {
                    event_category: 'engagement',
                    event_label: searchTerm,
                    value: filtered.length
                  });
                }
              } else {
                // Reset to current category filter
                loadPrompts(currentCategory);
              }
            }, 300);
          }
          
          function clearSearch() {
            const searchInput = document.getElementById('search-input');
            const clearBtn = document.getElementById('clear-search');
            const resultsCount = document.getElementById('search-results-count');
            
            searchInput.value = '';
            clearBtn.classList.add('hidden');
            resultsCount.classList.add('hidden');
            
            // Reset to current category filter
            loadPrompts(currentCategory);
            
            // Focus back to input
            searchInput.focus();
          }
          
          // Change grid columns (PC only)
          function changeGridColumns(cols) {
            const grid = document.getElementById('prompts-grid');
            
            // Remove all column classes
            grid.classList.remove('cols-5', 'cols-8', 'cols-10');
            
            // Add selected column class
            grid.classList.add(\`cols-\${cols}\`);
            
            // Update button states
            document.querySelectorAll('.grid-btn').forEach(btn => {
              btn.classList.remove('active');
              if (btn.dataset.cols == cols) {
                btn.classList.add('active');
              }
            });
            
            // Save preference to localStorage
            localStorage.setItem('gridColumns', cols);
            
            // Google Analytics event tracking
            if (typeof gtag !== 'undefined') {
              gtag('event', 'change_grid_columns', {
                event_category: 'engagement',
                event_label: \`\${cols}列\`,
                value: cols
              });
            }
          }
          
          function changeSortOrder() {
            const select = document.getElementById('sort-select');
            currentSortOrder = select.value;
            
            // Google Analytics event tracking
            if (typeof gtag !== 'undefined') {
              gtag('event', 'change_sort_order', {
                event_category: 'engagement',
                event_label: currentSortOrder === 'popular' ? '人気順' : '新着順',
                value: currentSortOrder
              });
            }
            
            applyFilters();
          }
          
          function sortPrompts() {
            if (currentSortOrder === 'popular') {
              // Sort by copy_count (descending), then by id (descending) for ties
              allPrompts.sort((a, b) => {
                if (b.copy_count !== a.copy_count) {
                  return b.copy_count - a.copy_count;
                }
                return b.id - a.id;
              });
            } else {
              // Sort by id (descending) - newest first
              allPrompts.sort((a, b) => b.id - a.id);
            }
          }
          
          // Load grid preference from localStorage on page load
          function loadGridPreference() {
            const savedCols = localStorage.getItem('gridColumns');
            if (savedCols) {
              changeGridColumns(parseInt(savedCols));
            }
          }
          
          // Filter by category
          function filterCategory(category) {
            // Update active button (男性向けボタン以外)
            document.querySelectorAll('.category-btn:not(#for-men-filter-btn)').forEach(btn => {
              btn.classList.remove('active');
            });
            event.currentTarget.classList.add('active');
            
            // Store current category
            currentCategory = category;
            
            // Clear search when changing category
            const searchInput = document.getElementById('search-input');
            const clearBtn = document.getElementById('clear-search');
            const resultsCount = document.getElementById('search-results-count');
            searchInput.value = '';
            clearBtn.classList.add('hidden');
            resultsCount.classList.add('hidden');
            
            // Google Analytics event tracking
            if (typeof gtag !== 'undefined') {
              gtag('event', 'filter_category', {
                event_category: 'navigation',
                event_label: category || 'すべて'
              });
            }
            
            applyFilters();
          }

          // Check authentication status
          async function checkAuth() {
            try {
              const response = await axios.get('/api/auth/me');
              const user = response.data.user;
              document.getElementById('auth-section').innerHTML = \`
                <div class="flex items-center gap-2">
                  <a href="/mypage" class="text-white hover:opacity-80 transition flex items-center">
                    <i class="fas fa-user-circle mr-1"></i>
                    <span class="hidden sm:inline">\${user.nickname}</span>
                  </a>
                </div>
              \`;
            } catch (error) {
              // Not logged in - show login link (already in HTML)
            }
          }

          // Initialize
          checkAuth();
          loadGridPreference();
          loadSpeechBubbleMessages();
          loadCategories();
          loadPrompts();
        </script>

        <!-- About Section -->
        <section class="max-w-4xl mx-auto px-4 py-16 mb-8">
            <div class="bg-gradient-to-br from-pink-50 to-purple-50 rounded-2xl p-8 md:p-12 shadow-sm border border-pink-100">
                <div class="text-center space-y-6">
                    <div class="inline-block">
                        <div class="w-16 h-1 bg-gradient-to-r from-pink-400 to-purple-400 rounded-full mb-6 mx-auto"></div>
                    </div>
                    
                    <p class="text-gray-700 leading-relaxed text-base md:text-lg">
                        <span class="font-semibold text-pink-600">楽して時短して画像をつくろう！</span>
                    </p>
                    
                    <p class="text-gray-700 leading-relaxed text-base md:text-lg">
                        考える時間がなくても、
                    </p>
                    
                    <p class="text-gray-700 leading-relaxed text-base md:text-lg">
                        <span class="font-semibold text-purple-600">迷わず使える画像生成プロンプト</span>を配布！
                    </p>
                    
                    <div class="inline-block">
                        <div class="w-16 h-1 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full mt-6 mx-auto"></div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Footer -->
        <footer class="accent-bg text-white py-8 mt-16">
            <div class="max-w-7xl mx-auto px-4">
                <div class="flex flex-col items-center space-y-4">
                    <h3 class="text-lg font-semibold">Follow Me</h3>
                    <div class="flex space-x-6">
                        <a href="https://www.threads.com/@akagami0124" target="_blank" rel="noopener noreferrer" 
                           class="text-white hover:opacity-80 transition-all duration-300 hover:scale-110 flex flex-col items-center space-y-1"
                           aria-label="Threads 1">
                            <div class="relative">
                                <i class="fab fa-threads text-2xl"></i>
                                <i class="fas fa-star text-xs absolute -top-1 -right-1 animate-pulse" style="color: #FFD700;"></i>
                            </div>
                            <span class="text-xs">Threads 1</span>
                        </a>
                        <a href="https://www.threads.com/@akagami_sns" target="_blank" rel="noopener noreferrer" 
                           class="text-white hover:opacity-80 transition-all duration-300 hover:scale-110 flex flex-col items-center space-y-1"
                           aria-label="Threads 2">
                            <div class="relative">
                                <i class="fab fa-threads text-2xl"></i>
                                <i class="fas fa-briefcase text-xs absolute -top-1 -right-1 animate-pulse" style="color: #4ECDC4;"></i>
                            </div>
                            <span class="text-xs">Threads 2</span>
                        </a>
                        <a href="https://www.instagram.com/akagami_sns/" target="_blank" rel="noopener noreferrer" 
                           class="text-white hover:opacity-80 transition-all duration-300 hover:scale-110 hover:rotate-6 flex flex-col items-center space-y-1"
                           aria-label="Instagram">
                            <i class="fab fa-instagram text-2xl"></i>
                            <span class="text-xs">Instagram</span>
                        </a>
                        <a href="https://www.youtube.com/@akagami_sns" target="_blank" rel="noopener noreferrer" 
                           class="text-white hover:opacity-80 transition-all duration-300 hover:scale-110 flex flex-col items-center space-y-1"
                           aria-label="YouTube">
                            <i class="fab fa-youtube text-2xl"></i>
                            <span class="text-xs">YouTube</span>
                        </a>
                    </div>
                    <p class="text-sm text-gray-200 mt-4">© 2026 Akagami Prompt. All rights reserved.</p>
                    
                    <!-- Akagami.net Link -->
                    <div class="mt-6 pt-4 border-t border-white/20">
                        <a href="https://akagami.net" target="_blank" rel="noopener noreferrer" 
                           class="inline-flex items-center justify-center bg-white text-pink-600 font-semibold px-6 py-3 rounded-lg hover:bg-pink-50 transition-all duration-300 hover:scale-105 shadow-lg">
                            <i class="fas fa-external-link-alt mr-2"></i>
                            Akagami.net で他のサービスも見る
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    </body>
    </html>
  `)
})

// Prompt detail page
app.get('/prompt/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  
  // プロンプトデータを取得してOGPに使用
  const prompt = await DB.prepare(`
    SELECT p.*, c.name as category_name
    FROM prompts p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `).bind(id).first()
  
  // OGP用のデータ準備
  const ogTitle = prompt ? `${prompt.title} | Akagami Prompt` : 'Akagami Prompt - プロンプト詳細'
  const ogDescription = prompt ? `${prompt.prompt_text.substring(0, 100)}...` : 'ビジネスシーンで使える画像生成プロンプト'
  const ogImage = prompt?.image_url && prompt.image_url.startsWith('http') 
    ? prompt.image_url 
    : prompt?.image_url 
      ? `https://akagami-prompt.pages.dev${prompt.image_url}` 
      : 'https://akagami-prompt.pages.dev/ogp-image.png'
  const ogUrl = `https://akagami-prompt.pages.dev/prompt/${id}`
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${ogTitle}</title>
        <meta name="description" content="${ogDescription}">
        <link rel="icon" type="image/svg+xml" href="/favicon.svg">
        
        <!-- Google Fonts - Rounded Gothic -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@300;400;500&display=swap" rel="stylesheet">
        
        <!-- Open Graph / Facebook / Threads -->
        <meta property="og:type" content="article">
        <meta property="og:url" content="${ogUrl}">
        <meta property="og:title" content="${ogTitle}">
        <meta property="og:description" content="${ogDescription}">
        <meta property="og:image" content="${ogImage}">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="630">
        <meta property="og:locale" content="ja_JP">
        <meta property="og:site_name" content="Akagami Prompt">
        
        <!-- Twitter / Threads optimized -->
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:url" content="${ogUrl}">
        <meta name="twitter:title" content="${ogTitle}">
        <meta name="twitter:description" content="${ogDescription}">
        <meta name="twitter:image" content="${ogImage}">
        
        <!-- Google Analytics 4 -->
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-K00PV68PRE"></script>
        <script>
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-K00PV68PRE', {
            page_title: '${ogTitle}',
            page_location: window.location.href
          });
        </script>
        
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
          
          /* Skeleton Loading Animation */
          @keyframes shimmer {
            0% {
              background-position: -1000px 0;
            }
            100% {
              background-position: 1000px 0;
            }
          }
          .skeleton {
            background: linear-gradient(to right, #f0f0f0 0%, #e0e0e0 20%, #f0f0f0 40%, #f0f0f0 100%);
            background-size: 2000px 100%;
            animation: shimmer 2s infinite linear;
            border-radius: 0.5rem;
          }
          .skeleton-title {
            height: 36px;
            width: 60%;
            margin-bottom: 16px;
          }
          .skeleton-text {
            height: 20px;
            margin-bottom: 12px;
          }
          .skeleton-text-short {
            height: 20px;
            width: 80%;
            margin-bottom: 12px;
          }
          .skeleton-image {
            aspect-ratio: 4/5;
            border-radius: 0.5rem;
          }
          .skeleton-button {
            height: 44px;
            width: 120px;
            border-radius: 0.5rem;
          }
          
          .image-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 1rem;
          }
          @media (max-width: 1280px) {
            .image-grid {
              grid-template-columns: repeat(4, 1fr);
            }
          }
          @media (max-width: 1024px) {
            .image-grid {
              grid-template-columns: repeat(4, 1fr);
            }
          }
          @media (max-width: 768px) {
            .image-grid {
              grid-template-columns: repeat(2, 1fr);
            }
          }
          .image-item {
            aspect-ratio: 4/5;
            overflow: hidden;
            border-radius: 0.5rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
          }
          .image-item:hover {
            transform: translateY(-4px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          }
          .image-item img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          /* Lightbox styles */
          .lightbox {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0);
            z-index: 9999;
            justify-content: center;
            align-items: center;
            transition: background-color 0.3s ease;
          }
          .lightbox.active {
            display: flex;
            background-color: rgba(0, 0, 0, 0.95);
            animation: fadeIn 0.3s ease;
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .lightbox-content {
            position: relative;
            max-width: 90%;
            max-height: 90%;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .lightbox-image {
            max-width: 100%;
            max-height: 90vh;
            object-fit: contain;
            border-radius: 0.5rem;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            animation: zoomIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
          @keyframes zoomIn {
            from {
              transform: scale(0.8);
              opacity: 0;
            }
            to {
              transform: scale(1);
              opacity: 1;
            }
          }
          .lightbox-close {
            position: absolute;
            top: 20px;
            right: 20px;
            background: white;
            color: #333;
            border: none;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 24px;
            display: flex;
            justify-content: center;
            align-items: center;
            transition: all 0.2s;
            z-index: 10000;
          }
          .lightbox-close:hover {
            background-color: var(--accent-color);
            color: white;
            transform: scale(1.1);
          }
          .lightbox-nav {
            position: absolute;
            background: rgba(255, 255, 255, 0.9);
            color: #333;
            border: none;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 24px;
            display: flex;
            justify-content: center;
            align-items: center;
            transition: all 0.2s;
            top: 50%;
            transform: translateY(-50%);
          }
          .lightbox-nav:hover {
            background-color: var(--accent-color);
            color: white;
            transform: translateY(-50%) scale(1.1);
          }
          .lightbox-prev {
            left: 20px;
          }
          .lightbox-next {
            right: 20px;
          }
          .lightbox-counter {
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(255, 255, 255, 0.9);
            color: #333;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: bold;
          }
          .copy-btn {
            background-color: var(--accent-color);
            transition: all 0.2s;
          }
          .copy-btn:hover {
            background-color: #d04445;
          }
          .submit-btn {
            background-color: var(--accent-color);
            transition: all 0.2s;
          }
          .submit-btn:hover {
            background-color: #d04445;
          }
          
          /* Detail page copy button */
          .copy-btn-detail {
            background-color: var(--accent-color);
            transition: all 0.2s;
            font-family: 'Rounded Mplus 1c', 'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'メイリオ', Meiryo, sans-serif;
            padding: 0.6rem 1.5rem; /* py-3の0.8倍: 3 * 0.25rem * 0.8 = 0.6rem */
          }
          .copy-btn-detail:hover {
            background-color: #d04445;
          }
          
          /* Sparkle effect for copy button */
          .sparkle-container {
            position: fixed;
            pointer-events: none;
            z-index: 9999;
          }
          .sparkle {
            position: absolute;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            animation: sparkle-float 1s ease-out forwards;
          }
          @keyframes sparkle-float {
            0% {
              opacity: 1;
              transform: translate(0, 0) scale(1) rotate(0deg);
            }
            100% {
              opacity: 0;
              transform: translate(var(--tx), var(--ty)) scale(0.3) rotate(360deg);
            }
          }
          .sparkle-star {
            position: absolute;
            font-size: 20px;
            animation: sparkle-star-float 1.2s ease-out forwards;
          }
          @keyframes sparkle-star-float {
            0% {
              opacity: 1;
              transform: translate(0, 0) scale(1) rotate(0deg);
            }
            100% {
              opacity: 0;
              transform: translate(var(--tx), var(--ty)) scale(0.5) rotate(720deg);
            }
          }
        </style>
    </head>
    <body class="bg-white">
        <!-- Header -->
        <header class="accent-bg text-white py-4 shadow-md">
            <div class="max-w-6xl mx-auto px-4">
                <a href="/" class="inline-flex items-center text-white hover:opacity-80 transition">
                    <i class="fas fa-arrow-left mr-2"></i>
                    戻る
                </a>
            </div>
        </header>

        <!-- Mobile How-to Link (visible only on mobile) -->
        <div class="md:hidden bg-gray-50 border-b border-gray-200 py-2">
            <div class="max-w-6xl mx-auto px-4 text-center">
                <a href="/how-to-use" class="text-sm text-gray-600 hover:text-pink-600 transition inline-flex items-center justify-center">
                    <i class="fas fa-book-open text-xs mr-1"></i>
                    使い方はこちら
                </a>
            </div>
        </div>

        <main class="max-w-6xl mx-auto px-4 py-8">
            <!-- Loading Skeleton -->
            <div id="loading">
                <div class="skeleton skeleton-title"></div>
                <div class="image-grid mb-8">
                    <div class="skeleton skeleton-image"></div>
                    <div class="skeleton skeleton-image"></div>
                    <div class="skeleton skeleton-image"></div>
                    <div class="skeleton skeleton-image"></div>
                </div>
                <div class="bg-gray-50 rounded-lg p-6 mb-8">
                    <div class="skeleton skeleton-text mb-3" style="width: 120px; height: 24px;"></div>
                    <div class="skeleton skeleton-text"></div>
                    <div class="skeleton skeleton-text"></div>
                    <div class="skeleton skeleton-text-short"></div>
                </div>
            </div>

            <!-- Content -->
            <div id="content" class="hidden">
                <!-- Title -->
                <div class="mb-6">
                    <h1 id="prompt-title" class="text-3xl font-bold text-gray-800 mb-2"></h1>
                    <div id="for-men-badge" class="hidden inline-flex items-center text-white text-sm px-3 py-1 rounded-full" style="background: #3B82F6;">
                        <i class="fas fa-heart mr-1"></i>男性も使用可
                    </div>
                </div>

                <!-- Copy Buttons (at the top, above images) -->
                <div class="mb-6 flex gap-3">
                    <div class="flex-1">
                        <!-- Mobile Copy Button -->
                        <button id="copy-prompt-btn-mobile" class="copy-btn text-white w-full py-3 rounded-lg font-semibold uppercase md:hidden">
                            COPY
                        </button>
                        <!-- Desktop Copy Button -->
                        <button id="copy-prompt-btn" class="copy-btn text-white w-full py-3 rounded-lg font-semibold uppercase hidden md:block">
                            COPY
                        </button>
                    </div>
                    <!-- Submit Button -->
                    <button id="submit-btn" onclick="openSubmitModal()" class="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold uppercase transition hidden">
                        <i class="fas fa-upload mr-2"></i>投稿
                    </button>
                </div>

                <!-- User Submissions Gallery -->
                <div id="submissions-gallery" class="mb-8 hidden">
                    <h3 class="text-xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-images mr-2 accent-text"></i>みんなの投稿
                    </h3>
                    <div id="submissions-list" class="grid grid-cols-2 md:grid-cols-4 gap-4"></div>
                </div>

                <!-- Images Grid (4:5 ratio) -->
                <div id="images-grid" class="image-grid mb-8"></div>

                <!-- Prompt Section -->
                <div class="bg-gray-50 rounded-lg p-6 mb-8 shadow-sm">
                    <div class="flex items-start justify-between gap-4">
                        <div class="flex-1">
                            <h2 class="text-lg font-bold text-gray-800 mb-3">プロンプト</h2>
                            <p id="prompt-text" class="text-gray-700 whitespace-pre-wrap leading-relaxed"></p>
                        </div>
                    </div>
                </div>
            </div>
        </main>

        <!-- Lightbox -->
        <div id="lightbox" class="lightbox">
            <button class="lightbox-close" onclick="closeLightbox()">
                <i class="fas fa-times"></i>
            </button>
            <button class="lightbox-nav lightbox-prev" onclick="navigateLightbox(-1)">
                <i class="fas fa-chevron-left"></i>
            </button>
            <div class="lightbox-content">
                <img id="lightbox-image" class="lightbox-image" src="" alt="拡大画像">
            </div>
            <button class="lightbox-nav lightbox-next" onclick="navigateLightbox(1)">
                <i class="fas fa-chevron-right"></i>
            </button>
            <div class="lightbox-counter">
                <span id="lightbox-counter"></span>
            </div>
        </div>

        <!-- Submission Modal -->
        <div id="submit-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50" onclick="closeSubmitModal()">
            <div class="bg-white rounded-lg p-8 max-w-md w-full mx-4" onclick="event.stopPropagation()">
                <h2 class="text-2xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-upload mr-2 accent-text"></i>画像を投稿
                </h2>
                <p class="text-sm text-gray-600 mb-4">このプロンプトを使って生成した画像を投稿してください</p>
                
                <form id="submit-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">画像を選択</label>
                        <input type="file" id="submit-image" accept="image/*" required
                            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500">
                        <p class="text-xs text-gray-500 mt-1">最大5MB、JPEG/PNG/WebP</p>
                    </div>
                    
                    <div id="image-preview" class="hidden">
                        <img id="preview-img" class="w-full h-48 object-cover rounded-lg">
                    </div>

                    <div class="flex gap-3">
                        <button type="submit" class="flex-1 accent-bg text-white py-3 rounded-lg font-semibold hover:opacity-90">
                            投稿する
                        </button>
                        <button type="button" onclick="closeSubmitModal()" class="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50">
                            キャンセル
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
          const promptId = ${id};
          let promptData = null;
          let lightboxImages = [];
          let currentLightboxIndex = 0;
          let speechBubbleMessages = []; // Messages loaded from API

          // Load speech bubble messages from API
          async function loadSpeechBubbleMessages() {
            try {
              const response = await axios.get('/api/speech-bubble-messages');
              speechBubbleMessages = response.data;
              if (speechBubbleMessages.length === 0) {
                speechBubbleMessages = ['ありがとう', '楽しんで', 'AIって最高'];
              }
            } catch (error) {
              console.error('Failed to load speech bubble messages:', error);
              speechBubbleMessages = ['ありがとう', '楽しんで', 'AIって最高'];
            }
          }

          // Create speech bubble with random message
          function createSpeechBubble(x, y) {
            if (speechBubbleMessages.length === 0) {
              return;
            }
            
            const message = speechBubbleMessages[Math.floor(Math.random() * speechBubbleMessages.length)];
            
            const bubble = document.createElement('div');
            bubble.className = 'speech-bubble';
            bubble.textContent = message;
            bubble.style.left = x + 'px';
            bubble.style.top = (y - 60) + 'px';
            bubble.style.transform = 'translateX(-50%)';
            
            document.body.appendChild(bubble);
            
            setTimeout(() => {
              bubble.remove();
            }, 2000);
          }

          // Create sparkle effect
          function createSparkleEffect(x, y) {
            const container = document.createElement('div');
            container.className = 'sparkle-container';
            container.style.left = x + 'px';
            container.style.top = y + 'px';
            document.body.appendChild(container);
            
            // Colorful palette
            const colors = [
              ['#FF6B6B', '#FF8E53'], // Red-Orange
              ['#4ECDC4', '#44A08D'], // Teal-Green
              ['#A8E6CF', '#56CCF2'], // Mint-Blue
              ['#FFD93D', '#F9CA24'], // Yellow
              ['#FF6348', '#FF4757'], // Red
              ['#A29BFE', '#6C5CE7'], // Purple
              ['#FD79A8', '#E84393'], // Pink
              ['#55EFC4', '#00D2D3'], // Turquoise
              ['#74B9FF', '#0984E3'], // Blue
              ['#FAB1A0', '#E17055'], // Peach
            ];
            
            // Create sparkles (circles)
            const sparkleCount = 15;
            for (let i = 0; i < sparkleCount; i++) {
              const sparkle = document.createElement('div');
              sparkle.className = 'sparkle';
              
              // Random color from palette
              const colorPair = colors[Math.floor(Math.random() * colors.length)];
              const gradient = \`radial-gradient(circle, \${colorPair[0]} 0%, \${colorPair[1]} 50%, transparent 70%)\`;
              sparkle.style.background = gradient;
              sparkle.style.boxShadow = \`0 0 10px \${colorPair[0]}, 0 0 20px \${colorPair[1]}\`;
              
              // Random direction and distance
              const angle = (Math.PI * 2 * i) / sparkleCount;
              const distance = 50 + Math.random() * 50;
              const tx = Math.cos(angle) * distance;
              const ty = Math.sin(angle) * distance;
              
              sparkle.style.setProperty('--tx', tx + 'px');
              sparkle.style.setProperty('--ty', ty + 'px');
              
              container.appendChild(sparkle);
            }
            
            // Create star symbols (✨⭐💫🌟⭐)
            const starSymbols = ['✨', '⭐', '💫', '🌟', '⭐', '✨', '💖', '💙'];
            starSymbols.forEach((symbol, i) => {
              const star = document.createElement('div');
              star.className = 'sparkle-star';
              star.textContent = symbol;
              
              // Random color for text shadow
              const colorPair = colors[Math.floor(Math.random() * colors.length)];
              star.style.textShadow = \`0 0 10px \${colorPair[0]}, 0 0 20px \${colorPair[1]}\`;
              
              // Random direction and distance
              const angle = Math.random() * Math.PI * 2;
              const distance = 60 + Math.random() * 80;
              const tx = Math.cos(angle) * distance;
              const ty = Math.sin(angle) * distance;
              
              star.style.setProperty('--tx', tx + 'px');
              star.style.setProperty('--ty', ty + 'px');
              
              container.appendChild(star);
            });
            
            // Remove after animation
            setTimeout(() => {
              container.remove();
            }, 1200);
          }

          // Load prompt details
          async function loadPrompt() {
            try {
              const response = await axios.get(\`/api/prompts/\${promptId}\`);
              promptData = response.data;
              renderPrompt();
              document.getElementById('loading').classList.add('hidden');
              document.getElementById('content').classList.remove('hidden');
            } catch (error) {
              console.error('Error loading prompt:', error);
              document.getElementById('loading').innerHTML = \`
                <i class="fas fa-exclamation-circle text-4xl accent-text"></i>
                <p class="mt-4 text-gray-600">プロンプトの読み込みに失敗しました</p>
                <a href="/" class="mt-4 inline-block accent-text hover:underline">
                  <i class="fas fa-arrow-left mr-1"></i>トップページに戻る
                </a>
              \`;
            }
          }

          // Render prompt details
          function renderPrompt() {
            // Title
            document.getElementById('prompt-title').textContent = promptData.title;
            
            // Show for-men badge if applicable
            const forMenBadge = document.getElementById('for-men-badge');
            if (promptData.for_men) {
              forMenBadge.classList.remove('hidden');
            } else {
              forMenBadge.classList.add('hidden');
            }

            // Images grid
            const imagesGrid = document.getElementById('images-grid');
            const allImages = [];
            
            // Add thumbnail as first image
            if (promptData.image_url) {
              allImages.push({ image_url: promptData.image_url });
            }
            
            // Add additional images
            if (promptData.images && promptData.images.length > 0) {
              allImages.push(...promptData.images);
            }
            
            // Store images for lightbox
            lightboxImages = allImages.map(img => img.image_url);
            
            if (allImages.length > 0) {
              imagesGrid.innerHTML = allImages.map((img, index) => \`
                <div class="image-item" onclick="openLightbox(\${index})">
                  <img src="\${img.image_url}" alt="生成画像" 
                    onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22500%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22400%22 height=%22500%22/%3E%3Ctext fill=%22%239ca3af%22 font-family=%22sans-serif%22 font-size=%2224%22 text-anchor=%22middle%22 x=%22200%22 y=%22250%22%3ENo Image%3C/text%3E%3C/svg%3E'">
                </div>
              \`).join('');
            } else {
              imagesGrid.innerHTML = '<p class="text-gray-500 col-span-full">画像がありません</p>';
            }

            // Prompt text
            document.getElementById('prompt-text').textContent = promptData.prompt_text;
          }

          // Copy prompt text
          async function copyPromptText(event) {
            try {
              await navigator.clipboard.writeText(promptData.prompt_text);
              const btn = event.currentTarget;
              const originalHTML = btn.innerHTML;
              btn.innerHTML = 'Copied!';
              setTimeout(() => {
                btn.innerHTML = originalHTML;
              }, 2000);
            } catch (error) {
              console.error('Copy error:', error);
              alert('コピーに失敗しました');
            }
          }

          // Copy button event listener using event delegation
          document.addEventListener('click', async function(event) {
            // Check if click target is the copy button or its child element (both desktop and mobile)
            const copyBtn = event.target.closest('#copy-prompt-btn, #copy-prompt-btn-mobile');
            if (copyBtn) {
              event.preventDefault();
              event.stopPropagation();
              
              try {
                // Check if promptData is loaded
                if (!promptData || !promptData.prompt_text) {
                  alert('プロンプトを読み込み中です。もう一度お試しください。');
                  return;
                }
                
                // Try to copy to clipboard
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  await navigator.clipboard.writeText(promptData.prompt_text);
                } else {
                  // Fallback for older browsers
                  const textArea = document.createElement('textarea');
                  textArea.value = promptData.prompt_text;
                  textArea.style.position = 'fixed';
                  textArea.style.left = '-999999px';
                  document.body.appendChild(textArea);
                  textArea.select();
                  document.execCommand('copy');
                  document.body.removeChild(textArea);
                }
                
                // Increment copy count
                try {
                  await axios.post(\`/api/prompts/\${promptData.id}/copy\`);
                } catch (err) {
                  console.error('Failed to increment copy count:', err);
                }
                
                // Google Analytics event tracking
                if (typeof gtag !== 'undefined') {
                  gtag('event', 'copy_prompt_detail', {
                    event_category: 'engagement',
                    event_label: promptData.title,
                    value: promptData.id
                  });
                }
                
                // Show sparkle effect
                const rect = copyBtn.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                createSparkleEffect(x, y);
                createSpeechBubble(x, y);
                
                // Update button UI
                const originalHTML = copyBtn.innerHTML;
                copyBtn.innerHTML = 'Copied!';
                setTimeout(() => {
                  copyBtn.innerHTML = originalHTML;
                }, 2000);
              } catch (error) {
                console.error('Copy error:', error);
                alert('コピーに失敗しました: ' + (error.message || 'Unknown error'));
              }
            }
          });

          // Lightbox functions
          function openLightbox(index) {
            currentLightboxIndex = index;
            updateLightbox();
            document.getElementById('lightbox').classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Google Analytics event tracking
            if (typeof gtag !== 'undefined') {
              gtag('event', 'open_lightbox', {
                event_category: 'engagement',
                event_label: promptData.title,
                value: index
              });
            }
          }

          function closeLightbox() {
            document.getElementById('lightbox').classList.remove('active');
            document.body.style.overflow = '';
          }

          function navigateLightbox(direction) {
            currentLightboxIndex += direction;
            if (currentLightboxIndex < 0) {
              currentLightboxIndex = lightboxImages.length - 1;
            } else if (currentLightboxIndex >= lightboxImages.length) {
              currentLightboxIndex = 0;
            }
            updateLightbox();
          }

          function updateLightbox() {
            const lightboxImage = document.getElementById('lightbox-image');
            const lightboxCounter = document.getElementById('lightbox-counter');
            
            lightboxImage.src = lightboxImages[currentLightboxIndex];
            lightboxCounter.textContent = \`\${currentLightboxIndex + 1} / \${lightboxImages.length}\`;
          }

          // Close lightbox on background click
          document.getElementById('lightbox').addEventListener('click', function(event) {
            if (event.target === this) {
              closeLightbox();
            }
          });

          // Close lightbox on ESC key
          document.addEventListener('keydown', function(event) {
            const lightbox = document.getElementById('lightbox');
            if (lightbox.classList.contains('active')) {
              if (event.key === 'Escape') {
                closeLightbox();
              } else if (event.key === 'ArrowLeft') {
                navigateLightbox(-1);
              } else if (event.key === 'ArrowRight') {
                navigateLightbox(1);
              }
            }
          });

          // Submission functions
          async function checkAuthForSubmit() {
            try {
              await axios.get('/api/auth/me');
              document.getElementById('submit-btn').classList.remove('hidden');
            } catch (error) {
              // Not logged in - hide submit button
            }
          }

          function openSubmitModal() {
            document.getElementById('submit-modal').classList.remove('hidden');
            document.getElementById('submit-modal').classList.add('flex');
          }

          function closeSubmitModal() {
            document.getElementById('submit-modal').classList.add('hidden');
            document.getElementById('submit-modal').classList.remove('flex');
            document.getElementById('submit-form').reset();
            document.getElementById('image-preview').classList.add('hidden');
          }

          // Preview image
          document.getElementById('submit-image').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = function(e) {
                document.getElementById('preview-img').src = e.target.result;
                document.getElementById('image-preview').classList.remove('hidden');
              };
              reader.readAsDataURL(file);
            }
          });

          // Submit form
          document.getElementById('submit-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const fileInput = document.getElementById('submit-image');
            const file = fileInput.files[0];
            
            if (!file) {
              alert('画像を選択してください');
              return;
            }

            try {
              // Upload image
              const formData = new FormData();
              formData.append('image', file);
              
              const uploadResponse = await axios.post('/api/submissions/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
              });

              // Create submission
              await axios.post('/api/submissions', {
                prompt_id: promptId,
                image_url: uploadResponse.data.url
              });

              alert('投稿が完了しました！管理者の承認をお待ちください。');
              closeSubmitModal();
              loadSubmissions();
            } catch (error) {
              console.error(error);
              alert(error.response?.data?.error || '投稿に失敗しました');
            }
          });

          async function loadSubmissions() {
            try {
              const response = await axios.get(\`/api/submissions/prompt/\${promptId}\`);
              const submissions = response.data;

              if (submissions.length === 0) {
                document.getElementById('submissions-gallery').classList.add('hidden');
                return;
              }

              document.getElementById('submissions-gallery').classList.remove('hidden');
              document.getElementById('submissions-list').innerHTML = submissions.map(sub => \`
                <div class="relative group">
                  <img src="\${sub.image_url}" class="w-full h-48 object-cover rounded-lg shadow hover:shadow-lg transition cursor-pointer"
                    onclick="openSubmissionLightbox('\${sub.image_url}')">
                  <div class="absolute bottom-2 left-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">
                    by \${sub.user_nickname}
                  </div>
                </div>
              \`).join('');
            } catch (error) {
              console.error('Failed to load submissions:', error);
            }
          }

          function openSubmissionLightbox(url) {
            document.getElementById('lightbox-image').src = url;
            document.getElementById('lightbox').classList.add('active');
            document.getElementById('lightbox-counter').textContent = '';
          }

          // Initialize
          checkAuthForSubmit();
          loadSpeechBubbleMessages();
          loadPrompt();
          loadSubmissions();
        </script>

        <!-- Footer -->
        <footer class="accent-bg text-white py-8 mt-16">
            <div class="max-w-7xl mx-auto px-4">
                <div class="flex flex-col items-center space-y-4">
                    <h3 class="text-lg font-semibold">Follow Me</h3>
                    <div class="flex space-x-6">
                        <a href="https://www.threads.com/@akagami0124" target="_blank" rel="noopener noreferrer" 
                           class="text-white hover:opacity-80 transition-all duration-300 hover:scale-110 flex flex-col items-center space-y-1"
                           aria-label="Threads 1">
                            <div class="relative">
                                <i class="fab fa-threads text-2xl"></i>
                                <i class="fas fa-star text-xs absolute -top-1 -right-1 animate-pulse" style="color: #FFD700;"></i>
                            </div>
                            <span class="text-xs">Threads 1</span>
                        </a>
                        <a href="https://www.threads.com/@akagami_sns" target="_blank" rel="noopener noreferrer" 
                           class="text-white hover:opacity-80 transition-all duration-300 hover:scale-110 flex flex-col items-center space-y-1"
                           aria-label="Threads 2">
                            <div class="relative">
                                <i class="fab fa-threads text-2xl"></i>
                                <i class="fas fa-briefcase text-xs absolute -top-1 -right-1 animate-pulse" style="color: #4ECDC4;"></i>
                            </div>
                            <span class="text-xs">Threads 2</span>
                        </a>
                        <a href="https://www.instagram.com/akagami_sns/" target="_blank" rel="noopener noreferrer" 
                           class="text-white hover:opacity-80 transition-all duration-300 hover:scale-110 hover:rotate-6 flex flex-col items-center space-y-1"
                           aria-label="Instagram">
                            <i class="fab fa-instagram text-2xl"></i>
                            <span class="text-xs">Instagram</span>
                        </a>
                        <a href="https://www.youtube.com/@akagami_sns" target="_blank" rel="noopener noreferrer" 
                           class="text-white hover:opacity-80 transition-all duration-300 hover:scale-110 flex flex-col items-center space-y-1"
                           aria-label="YouTube">
                            <i class="fab fa-youtube text-2xl"></i>
                            <span class="text-xs">YouTube</span>
                        </a>
                    </div>
                    <p class="text-sm text-gray-200 mt-4">© 2026 Akagami Prompt. All rights reserved.</p>
                    
                    <!-- Akagami.net Link -->
                    <div class="mt-6 pt-4 border-t border-white/20">
                        <a href="https://akagami.net" target="_blank" rel="noopener noreferrer" 
                           class="inline-flex items-center justify-center bg-white text-pink-600 font-semibold px-6 py-3 rounded-lg hover:bg-pink-50 transition-all duration-300 hover:scale-105 shadow-lg">
                            <i class="fas fa-external-link-alt mr-2"></i>
                            Akagami.net で他のサービスも見る
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    </body>
    </html>
  `)
})

// Admin page - Secure random URL
app.get('/admin-51adc6a8e924b23431240a1156034bae', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Akagami Prompt - 管理画面</title>
        <link rel="icon" type="image/svg+xml" href="/admin-favicon.svg">
        
        <!-- Google Analytics 4 -->
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-K00PV68PRE"></script>
        <script>
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-K00PV68PRE', {
            page_title: 'Akagami Prompt - 管理画面',
            page_location: window.location.href
          });
        </script>
        
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
          .tab-btn.active {
            background-color: var(--accent-color);
            color: white;
          }
          .submit-btn {
            background-color: var(--accent-color);
            transition: all 0.2s;
          }
          .submit-btn:hover {
            background-color: #d04445;
          }
          .delete-btn {
            color: var(--accent-color);
            transition: all 0.2s;
          }
          .delete-btn:hover {
            background-color: var(--accent-color);
            color: white;
          }
        </style>
    </head>
    <body class="bg-gray-50">
        <!-- Header -->
        <header class="accent-bg text-white py-6 shadow-md">
            <div class="max-w-7xl mx-auto px-4">
                <div class="flex items-center justify-between">
                    <h1 class="text-3xl font-bold">
                        <i class="fas fa-tools mr-2"></i>
                        Akagami Prompt - 管理画面
                    </h1>
                    <a href="/" class="text-white hover:opacity-80 transition">
                        <i class="fas fa-home mr-2"></i>
                        サイトを見る
                    </a>
                </div>
            </div>
        </header>

        <!-- Mobile How-to Link (visible only on mobile) -->
        <div class="md:hidden bg-gray-50 border-b border-gray-200 py-2">
            <div class="max-w-7xl mx-auto px-4 text-center">
                <a href="/how-to-use" class="text-sm text-gray-600 hover:text-pink-600 transition inline-flex items-center justify-center">
                    <i class="fas fa-book-open text-xs mr-1"></i>
                    使い方はこちら
                </a>
            </div>
        </div>

        <!-- Tabs -->
        <div class="max-w-7xl mx-auto px-4 py-6">
            <div class="flex gap-2 mb-6 border-b-2 border-gray-200">
                <button onclick="switchTab('prompts')" class="tab-btn active px-6 py-3 font-medium transition rounded-t-lg" id="tab-prompts">
                    <i class="fas fa-images mr-2"></i>プロンプト管理
                </button>
                <button onclick="switchTab('categories')" class="tab-btn px-6 py-3 font-medium transition rounded-t-lg text-gray-600 hover:bg-gray-100" id="tab-categories">
                    <i class="fas fa-tags mr-2"></i>カテゴリ管理
                </button>
                <button onclick="switchTab('messages')" class="tab-btn px-6 py-3 font-medium transition rounded-t-lg text-gray-600 hover:bg-gray-100" id="tab-messages">
                    <i class="fas fa-comment-dots mr-2"></i>吹き出しメッセージ
                </button>
                <button onclick="switchTab('submissions')" class="tab-btn px-6 py-3 font-medium transition rounded-t-lg text-gray-600 hover:bg-gray-100" id="tab-submissions">
                    <i class="fas fa-images mr-2"></i>投稿承認
                </button>
            </div>

            <!-- Prompts Tab -->
            <div id="content-prompts" class="tab-content">
                <!-- Add Prompt Form -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h2 class="text-xl font-bold text-gray-800 mb-4" id="form-title">
                        <i class="fas fa-plus-circle mr-2 accent-text"></i>
                        <span id="form-title-text">プロンプト追加</span>
                    </h2>
                    <form id="prompt-form" class="space-y-4">
                        <input type="hidden" id="prompt-id" value="">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">タイトル</label>
                            <input type="text" id="prompt-title" required
                                class="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-color focus:outline-none"
                                placeholder="プロンプトのタイトル">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">カテゴリ</label>
                            <select id="prompt-category" required
                                class="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-color focus:outline-none">
                                <option value="">選択してください</option>
                            </select>
                        </div>
                        <div>
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" id="prompt-for-men"
                                    class="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                <span class="text-sm font-medium text-gray-700">
                                    <i class="fas fa-heart mr-1 text-cyan-400"></i>
                                    男性も使用可能なプロンプト
                                </span>
                            </label>
                            <p class="text-xs text-gray-500 mt-1 ml-7">チェックすると男性も使用可フィルターで表示されます</p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">プロンプト本文</label>
                            <textarea id="prompt-text" rows="6" required
                                class="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-color focus:outline-none"
                                placeholder="プロンプトの内容を入力してください"></textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">サムネイル画像</label>
                            <div class="space-y-2">
                                <input type="file" id="thumbnail-file" accept="image/*"
                                    class="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-color focus:outline-none">
                                <div id="thumbnail-preview" class="hidden">
                                    <img id="thumbnail-preview-img" class="w-32 h-40 object-cover rounded-lg border-2 border-gray-200">
                                </div>
                                <input type="url" id="prompt-thumbnail" required
                                    class="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-color focus:outline-none"
                                    placeholder="画像をアップロード or URLを入力" readonly>
                                <p class="text-xs text-gray-500">一覧ページと詳細ページの1枚目に表示される画像 (アップロードすると自動的にURLが入ります)</p>
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">
                                詳細ページ追加画像 (最大4枚)
                            </label>
                            <p class="text-xs text-gray-500 mb-3">詳細ページの2枚目以降に表示される画像 (サムネイルが自動的に1枚目になります)</p>
                            <div class="space-y-3">
                                <!-- Image 1 -->
                                <div class="flex gap-2 items-start">
                                    <div class="flex-1">
                                        <input type="file" id="detail-file-1" accept="image/*"
                                            class="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-color focus:outline-none text-sm">
                                    </div>
                                    <div id="detail-preview-1" class="hidden">
                                        <img id="detail-img-1" class="w-20 h-24 object-cover rounded-lg border-2 border-gray-200">
                                    </div>
                                    <input type="hidden" id="detail-url-1" value="">
                                </div>
                                <!-- Image 2 -->
                                <div class="flex gap-2 items-start">
                                    <div class="flex-1">
                                        <input type="file" id="detail-file-2" accept="image/*"
                                            class="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-color focus:outline-none text-sm">
                                    </div>
                                    <div id="detail-preview-2" class="hidden">
                                        <img id="detail-img-2" class="w-20 h-24 object-cover rounded-lg border-2 border-gray-200">
                                    </div>
                                    <input type="hidden" id="detail-url-2" value="">
                                </div>
                                <!-- Image 3 -->
                                <div class="flex gap-2 items-start">
                                    <div class="flex-1">
                                        <input type="file" id="detail-file-3" accept="image/*"
                                            class="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-color focus:outline-none text-sm">
                                    </div>
                                    <div id="detail-preview-3" class="hidden">
                                        <img id="detail-img-3" class="w-20 h-24 object-cover rounded-lg border-2 border-gray-200">
                                    </div>
                                    <input type="hidden" id="detail-url-3" value="">
                                </div>
                                <!-- Image 4 -->
                                <div class="flex gap-2 items-start">
                                    <div class="flex-1">
                                        <input type="file" id="detail-file-4" accept="image/*"
                                            class="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-color focus:outline-none text-sm">
                                    </div>
                                    <div id="detail-preview-4" class="hidden">
                                        <img id="detail-img-4" class="w-20 h-24 object-cover rounded-lg border-2 border-gray-200">
                                    </div>
                                    <input type="hidden" id="detail-url-4" value="">
                                </div>
                            </div>
                        </div>
                        <button type="submit" class="submit-btn text-white px-8 py-3 rounded-lg font-medium w-full" id="submit-btn">
                            <i class="fas fa-save mr-2"></i><span id="submit-btn-text">プロンプトを追加</span>
                        </button>
                        <button type="button" onclick="cancelEdit()" class="hidden w-full px-8 py-3 rounded-lg font-medium border-2 border-gray-300 text-gray-700 hover:bg-gray-50" id="cancel-btn">
                            <i class="fas fa-times mr-2"></i>キャンセル
                        </button>
                    </form>
                </div>

                <!-- Prompts List -->
                <div class="bg-white rounded-lg shadow-md p-6">
                    <h2 class="text-xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-list mr-2 accent-text"></i>
                        登録済みプロンプト
                    </h2>
                    <div id="prompts-list" class="space-y-3">
                        <div class="text-center py-8 text-gray-500">
                            <i class="fas fa-spinner fa-spin text-2xl"></i>
                            <p class="mt-2">読み込み中...</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Categories Tab -->
            <div id="content-categories" class="tab-content hidden">
                <!-- Add Category Form -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h2 class="text-xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-plus-circle mr-2 accent-text"></i>
                        カテゴリ追加
                    </h2>
                    <form id="category-form" class="flex gap-3">
                        <input type="text" id="category-name" required
                            class="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-color focus:outline-none"
                            placeholder="カテゴリ名を入力">
                        <button type="submit" class="submit-btn text-white px-6 py-2 rounded-lg font-medium">
                            <i class="fas fa-plus mr-2"></i>追加
                        </button>
                    </form>
                </div>

                <!-- Categories List -->
                <div class="bg-white rounded-lg shadow-md p-6">
                    <h2 class="text-xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-list mr-2 accent-text"></i>
                        登録済みカテゴリ
                    </h2>
                    <div id="categories-list" class="space-y-3">
                        <div class="text-center py-8 text-gray-500">
                            <i class="fas fa-spinner fa-spin text-2xl"></i>
                            <p class="mt-2">読み込み中...</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Speech Messages Tab -->
            <div id="content-messages" class="tab-content hidden">
                <!-- Add Message Form -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h2 class="text-xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-plus-circle mr-2 accent-text"></i>
                        メッセージ追加
                    </h2>
                    <form id="message-form" class="flex gap-3">
                        <input type="text" id="message-text" required
                            class="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-color focus:outline-none"
                            placeholder="吹き出しメッセージを入力（例: ありがとう）">
                        <button type="submit" class="submit-btn text-white px-6 py-2 rounded-lg font-medium">
                            <i class="fas fa-plus mr-2"></i>追加
                        </button>
                    </form>
                </div>

                <!-- Messages List -->
                <div class="bg-white rounded-lg shadow-md p-6">
                    <h2 class="text-xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-list mr-2 accent-text"></i>
                        登録済みメッセージ
                    </h2>
                    <div id="messages-list" class="space-y-3">
                        <div class="text-center py-8 text-gray-500">
                            <i class="fas fa-spinner fa-spin text-2xl"></i>
                            <p class="mt-2">読み込み中...</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Submissions Tab -->
            <div id="content-submissions" class="tab-content hidden">
                <!-- Pending Submissions -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h2 class="text-xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-clock mr-2 accent-text"></i>
                        承認待ち投稿
                    </h2>
                    <div id="pending-submissions-list" class="space-y-4">
                        <div class="text-center py-8 text-gray-500">
                            <i class="fas fa-spinner fa-spin text-2xl"></i>
                            <p class="mt-2">読み込み中...</p>
                        </div>
                    </div>
                </div>

                <!-- Approved Submissions -->
                <div class="bg-white rounded-lg shadow-md p-6">
                    <h2 class="text-xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-check-circle mr-2 accent-text"></i>
                        承認済み投稿
                    </h2>
                    <div id="approved-submissions-list" class="space-y-4">
                        <div class="text-center py-8 text-gray-500">
                            <i class="fas fa-spinner fa-spin text-2xl"></i>
                            <p class="mt-2">読み込み中...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
          // Admin API base path - keep this secret
          const ADMIN_API_BASE = '/api/admin-51adc6a8e924b23431240a1156034bae';
          
          let categories = [];
          let prompts = [];
          let editingCategoryId = null;

          // Switch tabs
          function switchTab(tab) {
            // Update tab buttons
            document.querySelectorAll('.tab-btn').forEach(btn => {
              btn.classList.remove('active', 'accent-bg', 'text-white');
              btn.classList.add('text-gray-600', 'hover:bg-gray-100');
            });
            document.getElementById(\`tab-\${tab}\`).classList.add('active', 'accent-bg', 'text-white');
            document.getElementById(\`tab-\${tab}\`).classList.remove('text-gray-600', 'hover:bg-gray-100');

            // Update content
            document.querySelectorAll('.tab-content').forEach(content => {
              content.classList.add('hidden');
            });
            document.getElementById(\`content-\${tab}\`).classList.remove('hidden');
          }

          // Load categories
          async function loadCategories() {
            try {
              const response = await axios.get('/api/categories');
              categories = response.data;
              renderCategories();
              updateCategorySelect();
            } catch (error) {
              console.error('Error loading categories:', error);
            }
          }

          // Render categories
          function renderCategories() {
            const list = document.getElementById('categories-list');
            
            if (categories.length === 0) {
              list.innerHTML = '<p class="text-gray-500 text-center py-8">カテゴリがありません</p>';
              return;
            }

            list.innerHTML = categories.map(cat => \`
              <div class="flex items-center justify-between p-4 border-2 border-gray-200 rounded-lg hover:border-accent-color transition">
                <div class="flex items-center gap-3">
                  <i class="fas fa-tag accent-text"></i>
                  <span class="font-medium text-gray-800" id="cat-name-\${cat.id}">\${cat.name}</span>
                  <input type="text" id="cat-edit-\${cat.id}" value="\${cat.name}" 
                    class="hidden px-3 py-1 border-2 border-accent-color rounded">
                </div>
                <div class="flex gap-2">
                  <button onclick="editCategory(\${cat.id})" id="cat-edit-btn-\${cat.id}"
                    class="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded transition">
                    <i class="fas fa-edit mr-1"></i>編集
                  </button>
                  <button onclick="saveCategory(\${cat.id})" id="cat-save-btn-\${cat.id}"
                    class="hidden text-green-600 hover:bg-green-50 px-3 py-1 rounded transition">
                    <i class="fas fa-save mr-1"></i>保存
                  </button>
                  <button onclick="cancelEditCategory(\${cat.id})" id="cat-cancel-btn-\${cat.id}"
                    class="hidden text-gray-600 hover:bg-gray-50 px-3 py-1 rounded transition">
                    キャンセル
                  </button>
                  <button onclick="deleteCategory(\${cat.id})" 
                    class="delete-btn px-3 py-1 rounded border-2 border-accent-color transition">
                    <i class="fas fa-trash mr-1"></i>削除
                  </button>
                </div>
              </div>
            \`).join('');
          }

          // Edit category
          function editCategory(id) {
            editingCategoryId = id;
            document.getElementById(\`cat-name-\${id}\`).classList.add('hidden');
            document.getElementById(\`cat-edit-\${id}\`).classList.remove('hidden');
            document.getElementById(\`cat-edit-btn-\${id}\`).classList.add('hidden');
            document.getElementById(\`cat-save-btn-\${id}\`).classList.remove('hidden');
            document.getElementById(\`cat-cancel-btn-\${id}\`).classList.remove('hidden');
          }

          // Cancel edit category
          function cancelEditCategory(id) {
            editingCategoryId = null;
            document.getElementById(\`cat-name-\${id}\`).classList.remove('hidden');
            document.getElementById(\`cat-edit-\${id}\`).classList.add('hidden');
            document.getElementById(\`cat-edit-btn-\${id}\`).classList.remove('hidden');
            document.getElementById(\`cat-save-btn-\${id}\`).classList.add('hidden');
            document.getElementById(\`cat-cancel-btn-\${id}\`).classList.add('hidden');
          }

          // Save category
          async function saveCategory(id) {
            const name = document.getElementById(\`cat-edit-\${id}\`).value.trim();
            
            if (!name) {
              alert('カテゴリ名を入力してください');
              return;
            }

            try {
              await axios.put(\`\${ADMIN_API_BASE}/categories/\${id}\`, { name });
              await loadCategories();
              editingCategoryId = null;
              alert('カテゴリを更新しました');
            } catch (error) {
              alert('更新に失敗しました');
            }
          }

          // Delete category
          async function deleteCategory(id) {
            if (!confirm('このカテゴリを削除してもよろしいですか?')) {
              return;
            }

            try {
              await axios.delete(\`\${ADMIN_API_BASE}/categories/\${id}\`);
              await loadCategories();
              alert('カテゴリを削除しました');
            } catch (error) {
              alert('削除に失敗しました');
            }
          }

          // Update category select
          function updateCategorySelect() {
            const select = document.getElementById('prompt-category');
            select.innerHTML = '<option value="">選択してください</option>' + 
              categories.map(cat => \`<option value="\${cat.id}">\${cat.name}</option>\`).join('');
          }

          // Load prompts
          async function loadPrompts() {
            try {
              const response = await axios.get('/api/prompts');
              prompts = response.data;
              renderPrompts();
            } catch (error) {
              console.error('Error loading prompts:', error);
            }
          }

          // Render prompts
          function renderPrompts() {
            const list = document.getElementById('prompts-list');
            
            if (prompts.length === 0) {
              list.innerHTML = '<p class="text-gray-500 text-center py-8">プロンプトがありません</p>';
              return;
            }

            list.innerHTML = prompts.map(prompt => \`
              <div class="flex items-center gap-4 p-4 border-2 border-gray-200 rounded-lg hover:border-accent-color transition">
                <img src="\${prompt.image_url}" alt="\${prompt.title}" 
                  class="w-20 h-20 object-cover rounded"
                  onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22100%22 height=%22100%22/%3E%3C/svg%3E'">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <h3 class="font-bold text-gray-800">\${prompt.title}</h3>
                    \${prompt.for_men ? '<span class="bg-cyan-400 text-white text-xs px-2 py-0.5 rounded-full"><i class="fas fa-heart mr-1"></i>男性も使用可</span>' : ''}
                  </div>
                  <p class="text-sm text-gray-600 line-clamp-1">\${prompt.prompt_text}</p>
                  <div class="flex items-center gap-3 mt-1">
                    <span class="text-xs text-gray-500">
                      <i class="fas fa-tag mr-1"></i>\${prompt.category_name}
                    </span>
                    <span class="text-xs text-gray-500">
                      <i class="fas fa-copy mr-1"></i>コピー: <strong>\${prompt.copy_count || 0}回</strong>
                    </span>
                  </div>
                </div>
                <div class="flex gap-2">
                  <a href="/prompt/\${prompt.id}" target="_blank"
                    class="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded transition">
                    <i class="fas fa-eye mr-1"></i>表示
                  </a>
                  <button onclick="editPrompt(\${prompt.id})" 
                    class="text-green-600 hover:bg-green-50 px-3 py-1 rounded transition">
                    <i class="fas fa-edit mr-1"></i>編集
                  </button>
                  <button onclick="deletePrompt(\${prompt.id})" 
                    class="delete-btn px-3 py-1 rounded border-2 border-accent-color transition">
                    <i class="fas fa-trash mr-1"></i>削除
                  </button>
                </div>
              </div>
            \`).join('');
          }

          // Delete prompt
          async function deletePrompt(id) {
            if (!confirm('このプロンプトを削除してもよろしいですか?')) {
              return;
            }

            try {
              await axios.delete(\`\${ADMIN_API_BASE}/prompts/\${id}\`);
              await loadPrompts();
              alert('プロンプトを削除しました');
            } catch (error) {
              alert('削除に失敗しました');
            }
          }

          // Edit prompt
          async function editPrompt(id) {
            try {
              const response = await axios.get(\`\${ADMIN_API_BASE}/prompts/\${id}\`);
              const prompt = response.data;

              // Fill form
              document.getElementById('prompt-id').value = prompt.id;
              document.getElementById('prompt-title').value = prompt.title;
              document.getElementById('prompt-category').value = prompt.category_id;
              document.getElementById('prompt-text').value = prompt.prompt_text;
              document.getElementById('prompt-thumbnail').value = prompt.image_url;
              document.getElementById('prompt-for-men').checked = prompt.for_men || false;

              // Show thumbnail preview
              if (prompt.image_url) {
                document.getElementById('thumbnail-preview-img').src = prompt.image_url;
                document.getElementById('thumbnail-preview').classList.remove('hidden');
              }

              // Fill image URLs and show previews
              if (prompt.images && prompt.images.length > 0) {
                for (let i = 0; i < Math.min(prompt.images.length, 4); i++) {
                  const img = prompt.images[i];
                  const index = i + 1;
                  
                  // Set URL
                  document.getElementById(\`detail-url-\${index}\`).value = img.image_url;
                  
                  // Show preview
                  document.getElementById(\`detail-img-\${index}\`).src = img.image_url;
                  document.getElementById(\`detail-preview-\${index}\`).classList.remove('hidden');
                }
              }

              // Update form UI
              document.getElementById('form-title-text').textContent = 'プロンプト編集';
              document.getElementById('submit-btn-text').textContent = '更新する';
              document.getElementById('cancel-btn').classList.remove('hidden');

              // Scroll to form
              document.getElementById('form-title').scrollIntoView({ behavior: 'smooth' });
            } catch (error) {
              alert('プロンプトの読み込みに失敗しました');
            }
          }

          // Cancel edit
          function cancelEdit() {
            document.getElementById('prompt-form').reset();
            document.getElementById('prompt-id').value = '';
            document.getElementById('prompt-for-men').checked = false;
            document.getElementById('thumbnail-preview').classList.add('hidden');
            
            // Clear detail image previews
            for (let i = 1; i <= 4; i++) {
              document.getElementById(\`detail-url-\${i}\`).value = '';
              document.getElementById(\`detail-preview-\${i}\`).classList.add('hidden');
            }
            
            document.getElementById('form-title-text').textContent = 'プロンプト追加';
            document.getElementById('submit-btn-text').textContent = 'プロンプトを追加';
            document.getElementById('cancel-btn').classList.add('hidden');
          }

          // Compress image before upload
          async function compressImage(file, maxWidth, maxHeight, quality = 0.8) {
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              
              reader.onload = (e) => {
                const img = new Image();
                
                img.onload = () => {
                  // Calculate new dimensions (maintain aspect ratio)
                  let width = img.width;
                  let height = img.height;
                  
                  if (width > maxWidth || height > maxHeight) {
                    const widthRatio = maxWidth / width;
                    const heightRatio = maxHeight / height;
                    const ratio = Math.min(widthRatio, heightRatio);
                    
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                  }
                  
                  // Create canvas and compress
                  const canvas = document.createElement('canvas');
                  canvas.width = width;
                  canvas.height = height;
                  
                  const ctx = canvas.getContext('2d');
                  ctx.drawImage(img, 0, 0, width, height);
                  
                  // Convert to blob
                  canvas.toBlob(
                    (blob) => {
                      if (blob) {
                        // Create new file with original name
                        const compressedFile = new File([blob], file.name, {
                          type: 'image/jpeg',
                          lastModified: Date.now()
                        });
                        resolve(compressedFile);
                      } else {
                        reject(new Error('Canvas to Blob conversion failed'));
                      }
                    },
                    'image/jpeg',
                    quality
                  );
                };
                
                img.onerror = () => reject(new Error('Image load failed'));
                img.src = e.target.result;
              };
              
              reader.onerror = () => reject(new Error('File read failed'));
              reader.readAsDataURL(file);
            });
          }

          // Upload image
          async function uploadImage(file) {
            const formData = new FormData();
            formData.append('file', file);

            try {
              const response = await axios.post('/api/admin-51adc6a8e924b23431240a1156034bae/upload', formData, {
                headers: {
                  'Content-Type': 'multipart/form-data'
                }
              });
              return response.data.url;
            } catch (error) {
              console.error('Upload error:', error);
              throw error;
            }
          }

          // Handle thumbnail upload
          document.getElementById('thumbnail-file').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
              // Show loading
              const btn = e.target;
              btn.disabled = true;
              
              // Show preview
              const reader = new FileReader();
              reader.onload = (e) => {
                document.getElementById('thumbnail-preview-img').src = e.target.result;
                document.getElementById('thumbnail-preview').classList.remove('hidden');
              };
              reader.readAsDataURL(file);

              // Compress image (max 800x1000px for 4:5 ratio)
              const compressedFile = await compressImage(file, 800, 1000, 0.85);
              
              console.log(\`Original: \${(file.size / 1024).toFixed(2)}KB → Compressed: \${(compressedFile.size / 1024).toFixed(2)}KB\`);

              // Upload
              const url = await uploadImage(compressedFile);
              document.getElementById('prompt-thumbnail').value = url;
              alert('サムネイル画像をアップロードしました');
              
              btn.disabled = false;
            } catch (error) {
              alert('アップロードに失敗しました');
              console.error(error);
              e.target.disabled = false;
            }
          });

          // Handle detail images upload (individual)
          for (let i = 1; i <= 4; i++) {
            document.getElementById(\`detail-file-\${i}\`).addEventListener('change', async (e) => {
              const file = e.target.files[0];
              if (!file) return;

              try {
                // Show loading
                const btn = e.target;
                btn.disabled = true;
                
                // Show preview
                const reader = new FileReader();
                reader.onload = (e) => {
                  document.getElementById(\`detail-img-\${i}\`).src = e.target.result;
                  document.getElementById(\`detail-preview-\${i}\`).classList.remove('hidden');
                };
                reader.readAsDataURL(file);

                // Compress image (max 1200x1500px for 4:5 ratio)
                const compressedFile = await compressImage(file, 1200, 1500, 0.85);
                
                console.log(\`Detail \${i} - Original: \${(file.size / 1024).toFixed(2)}KB → Compressed: \${(compressedFile.size / 1024).toFixed(2)}KB\`);

                // Upload
                const url = await uploadImage(compressedFile);
                document.getElementById(\`detail-url-\${i}\`).value = url;
                alert(\`画像\${i}をアップロードしました\`);
                
                btn.disabled = false;
              } catch (error) {
                alert('アップロードに失敗しました');
                console.error(error);
                e.target.disabled = false;
              }
            });
          }

          // Submit category form
          document.getElementById('category-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('category-name').value.trim();
            
            if (!name) {
              alert('カテゴリ名を入力してください');
              return;
            }

            try {
              await axios.post('/api/admin-51adc6a8e924b23431240a1156034bae/categories', { name });
              await loadCategories();
              document.getElementById('category-form').reset();
              alert('カテゴリを追加しました');
            } catch (error) {
              alert('追加に失敗しました。カテゴリ名が重複している可能性があります。');
            }
          });

          // Submit prompt form
          document.getElementById('prompt-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const promptId = document.getElementById('prompt-id').value;
            const title = document.getElementById('prompt-title').value.trim();
            const categoryId = document.getElementById('prompt-category').value;
            const promptText = document.getElementById('prompt-text').value.trim();
            const thumbnail = document.getElementById('prompt-thumbnail').value.trim();
            const forMen = document.getElementById('prompt-for-men').checked;

            if (!title || !categoryId || !promptText || !thumbnail) {
              alert('すべての必須項目を入力してください');
              return;
            }

            // Collect detail image URLs
            const imageUrls = [];
            for (let i = 1; i <= 4; i++) {
              const url = document.getElementById(\`detail-url-\${i}\`).value.trim();
              if (url) {
                imageUrls.push(url);
              }
            }

            try {
              if (promptId) {
                // Update existing prompt
                await axios.put(\`\${ADMIN_API_BASE}/prompts/\${promptId}\`, {
                  title,
                  category_id: parseInt(categoryId),
                  prompt_text: promptText,
                  image_url: thumbnail,
                  image_urls: imageUrls,
                  for_men: forMen
                });
                alert('プロンプトを更新しました');
              } else {
                // Create new prompt
                await axios.post('/api/admin-51adc6a8e924b23431240a1156034bae/prompts', {
                  title,
                  category_id: parseInt(categoryId),
                  prompt_text: promptText,
                  image_url: thumbnail,
                  image_urls: imageUrls,
                  for_men: forMen
                });
                alert('プロンプトを追加しました');
              }

              await loadPrompts();
              cancelEdit();
            } catch (error) {
              alert(promptId ? '更新に失敗しました' : '追加に失敗しました');
              console.error(error);
            }
          });

          // Speech Bubble Messages Management
          let speechMessages = [];

          async function loadSpeechMessages() {
            try {
              const response = await axios.get(\`\${ADMIN_API_BASE}/speech-messages\`);
              speechMessages = response.data;
              renderSpeechMessages();
            } catch (error) {
              console.error('Error loading speech messages:', error);
            }
          }

          function renderSpeechMessages() {
            const list = document.getElementById('messages-list');
            
            if (speechMessages.length === 0) {
              list.innerHTML = '<p class="text-gray-500 text-center py-8">メッセージがありません</p>';
              return;
            }

            list.innerHTML = speechMessages.map(msg => \`
              <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                <div class="flex items-center gap-4 flex-1">
                  <div class="speech-bubble-preview bg-white px-4 py-2 rounded-full shadow text-sm">
                    \${msg.message}
                  </div>
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" \${msg.is_active ? 'checked' : ''} 
                      onchange="toggleMessageActive(\${msg.id}, this.checked)"
                      class="w-4 h-4 accent-color rounded">
                    <span class="text-sm text-gray-600">有効</span>
                  </label>
                </div>
                <button onclick="deleteSpeechMessage(\${msg.id})" 
                  class="text-red-600 hover:text-red-800 px-3 py-2 rounded hover:bg-red-50 transition">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            \`).join('');
          }

          document.getElementById('message-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const messageText = document.getElementById('message-text').value.trim();

            if (!messageText) {
              alert('メッセージを入力してください');
              return;
            }

            try {
              await axios.post(\`\${ADMIN_API_BASE}/speech-messages\`, { message: messageText });
              document.getElementById('message-form').reset();
              await loadSpeechMessages();
              alert('メッセージを追加しました！');
            } catch (error) {
              console.error('Error adding message:', error);
              alert('追加に失敗しました');
            }
          });

          async function toggleMessageActive(id, isActive) {
            try {
              const message = speechMessages.find(m => m.id === id);
              await axios.put(\`\${ADMIN_API_BASE}/speech-messages/\${id}\`, {
                message: message.message,
                is_active: isActive,
                display_order: message.display_order
              });
              await loadSpeechMessages();
            } catch (error) {
              console.error('Error updating message:', error);
              alert('更新に失敗しました');
            }
          }

          async function deleteSpeechMessage(id) {
            if (!confirm('このメッセージを削除しますか？')) return;

            try {
              await axios.delete(\`\${ADMIN_API_BASE}/speech-messages/\${id}\`);
              await loadSpeechMessages();
              alert('メッセージを削除しました');
            } catch (error) {
              console.error('Error deleting message:', error);
              alert('削除に失敗しました');
            }
          }

          // Load submissions for admin
          async function loadSubmissions() {
            try {
              const [pendingRes, approvedRes] = await Promise.all([
                axios.get(\`\${ADMIN_API_BASE.replace('admin-51adc6a8e924b23431240a1156034bae', 'submissions')}/admin/list?status=pending\`),
                axios.get(\`\${ADMIN_API_BASE.replace('admin-51adc6a8e924b23431240a1156034bae', 'submissions')}/admin/list?status=approved\`)
              ]);
              
              renderPendingSubmissions(pendingRes.data);
              renderApprovedSubmissions(approvedRes.data);
            } catch (error) {
              console.error('Error loading submissions:', error);
              document.getElementById('pending-submissions-list').innerHTML = 
                '<p class="text-red-500 text-center py-8">読み込みに失敗しました</p>';
              document.getElementById('approved-submissions-list').innerHTML = 
                '<p class="text-red-500 text-center py-8">読み込みに失敗しました</p>';
            }
          }

          function renderPendingSubmissions(submissions) {
            const list = document.getElementById('pending-submissions-list');
            
            if (submissions.length === 0) {
              list.innerHTML = '<p class="text-gray-500 text-center py-8">承認待ち投稿はありません</p>';
              return;
            }

            list.innerHTML = submissions.map(sub => \`
              <div class="border-2 border-gray-200 rounded-lg p-4 hover:border-accent-color transition">
                <div class="flex items-start gap-4">
                  <div class="w-32 h-32 flex-shrink-0">
                    <img src="\${sub.image_url}" alt="投稿画像" 
                      class="w-full h-full object-cover rounded-lg shadow">
                  </div>
                  <div class="flex-1">
                    <div class="flex items-center gap-3 mb-2">
                      <span class="font-semibold text-gray-800">
                        <i class="fas fa-user mr-1 text-gray-600"></i>\${sub.user_nickname}
                      </span>
                      <span class="text-xs text-gray-500">
                        <i class="fas fa-clock mr-1"></i>\${new Date(sub.created_at).toLocaleString('ja-JP')}
                      </span>
                    </div>
                    <div class="mb-2">
                      <a href="/prompt/\${sub.prompt_id}" target="_blank" 
                        class="text-blue-600 hover:underline text-sm">
                        <i class="fas fa-link mr-1"></i>プロンプト: \${sub.prompt_title}
                      </a>
                    </div>
                    <div class="flex gap-2">
                      <button onclick="approveSubmission(\${sub.id})" 
                        class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition">
                        <i class="fas fa-check mr-1"></i>承認
                      </button>
                      <button onclick="rejectSubmission(\${sub.id})" 
                        class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition">
                        <i class="fas fa-times mr-1"></i>却下
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            \`).join('');
          }

          function renderApprovedSubmissions(submissions) {
            const list = document.getElementById('approved-submissions-list');
            
            if (submissions.length === 0) {
              list.innerHTML = '<p class="text-gray-500 text-center py-8">承認済み投稿はありません</p>';
              return;
            }

            list.innerHTML = submissions.map(sub => \`
              <div class="border-2 border-gray-200 rounded-lg p-4 hover:border-gray-300 transition">
                <div class="flex items-start gap-4">
                  <div class="w-32 h-32 flex-shrink-0">
                    <img src="\${sub.image_url}" alt="投稿画像" 
                      class="w-full h-full object-cover rounded-lg shadow">
                  </div>
                  <div class="flex-1">
                    <div class="flex items-center gap-3 mb-2">
                      <span class="font-semibold text-gray-800">
                        <i class="fas fa-user mr-1 text-gray-600"></i>\${sub.user_nickname}
                      </span>
                      <span class="text-xs text-gray-500">
                        <i class="fas fa-clock mr-1"></i>\${new Date(sub.created_at).toLocaleString('ja-JP')}
                      </span>
                      <span class="text-xs text-green-600 font-semibold">
                        <i class="fas fa-check-circle mr-1"></i>承認済み
                      </span>
                    </div>
                    <div class="mb-2">
                      <a href="/prompt/\${sub.prompt_id}" target="_blank" 
                        class="text-blue-600 hover:underline text-sm">
                        <i class="fas fa-link mr-1"></i>プロンプト: \${sub.prompt_title}
                      </a>
                    </div>
                    <button onclick="deleteAdminSubmission(\${sub.id})" 
                      class="text-red-600 hover:bg-red-50 px-3 py-1 rounded transition">
                      <i class="fas fa-trash mr-1"></i>削除
                    </button>
                  </div>
                </div>
              </div>
            \`).join('');
          }

          async function approveSubmission(id) {
            if (!confirm('この投稿を承認しますか？')) return;

            try {
              await axios.put(\`\${ADMIN_API_BASE.replace('admin-51adc6a8e924b23431240a1156034bae', 'submissions')}/admin/\${id}/approve\`);
              await loadSubmissions();
              alert('投稿を承認しました！');
            } catch (error) {
              console.error('Error approving submission:', error);
              alert('承認に失敗しました');
            }
          }

          async function rejectSubmission(id) {
            if (!confirm('この投稿を却下して削除しますか？')) return;

            try {
              await axios.delete(\`\${ADMIN_API_BASE.replace('admin-51adc6a8e924b23431240a1156034bae', 'submissions')}/admin/\${id}\`);
              await loadSubmissions();
              alert('投稿を却下しました');
            } catch (error) {
              console.error('Error rejecting submission:', error);
              alert('却下に失敗しました');
            }
          }

          async function deleteAdminSubmission(id) {
            if (!confirm('この投稿を削除しますか？')) return;

            try {
              await axios.delete(\`\${ADMIN_API_BASE.replace('admin-51adc6a8e924b23431240a1156034bae', 'submissions')}/admin/\${id}\`);
              await loadSubmissions();
              alert('投稿を削除しました');
            } catch (error) {
              console.error('Error deleting submission:', error);
              alert('削除に失敗しました');
            }
          }

          // Initialize
          loadCategories();
          loadPrompts();
          loadSpeechMessages();
          loadSubmissions();
        </script>

        <!-- Footer -->
        <footer class="accent-bg text-white py-8 mt-16">
            <div class="max-w-7xl mx-auto px-4">
                <div class="flex flex-col items-center space-y-4">
                    <h3 class="text-lg font-semibold">Follow Me</h3>
                    <div class="flex space-x-6">
                        <a href="https://www.threads.com/@akagami0124" target="_blank" rel="noopener noreferrer" 
                           class="text-white hover:opacity-80 transition-all duration-300 hover:scale-110 flex flex-col items-center space-y-1"
                           aria-label="Threads 1">
                            <div class="relative">
                                <i class="fab fa-threads text-2xl"></i>
                                <i class="fas fa-star text-xs absolute -top-1 -right-1 animate-pulse" style="color: #FFD700;"></i>
                            </div>
                            <span class="text-xs">Threads 1</span>
                        </a>
                        <a href="https://www.threads.com/@akagami_sns" target="_blank" rel="noopener noreferrer" 
                           class="text-white hover:opacity-80 transition-all duration-300 hover:scale-110 flex flex-col items-center space-y-1"
                           aria-label="Threads 2">
                            <div class="relative">
                                <i class="fab fa-threads text-2xl"></i>
                                <i class="fas fa-briefcase text-xs absolute -top-1 -right-1 animate-pulse" style="color: #4ECDC4;"></i>
                            </div>
                            <span class="text-xs">Threads 2</span>
                        </a>
                        <a href="https://www.instagram.com/akagami_sns/" target="_blank" rel="noopener noreferrer" 
                           class="text-white hover:opacity-80 transition-all duration-300 hover:scale-110 hover:rotate-6 flex flex-col items-center space-y-1"
                           aria-label="Instagram">
                            <i class="fab fa-instagram text-2xl"></i>
                            <span class="text-xs">Instagram</span>
                        </a>
                        <a href="https://www.youtube.com/@akagami_sns" target="_blank" rel="noopener noreferrer" 
                           class="text-white hover:opacity-80 transition-all duration-300 hover:scale-110 flex flex-col items-center space-y-1"
                           aria-label="YouTube">
                            <i class="fab fa-youtube text-2xl"></i>
                            <span class="text-xs">YouTube</span>
                        </a>
                    </div>
                    <p class="text-sm text-gray-200 mt-4">© 2026 Akagami Prompt. All rights reserved.</p>
                    
                    <!-- Akagami.net Link -->
                    <div class="mt-6 pt-4 border-t border-white/20">
                        <a href="https://akagami.net" target="_blank" rel="noopener noreferrer" 
                           class="inline-flex items-center justify-center bg-white text-pink-600 font-semibold px-6 py-3 rounded-lg hover:bg-pink-50 transition-all duration-300 hover:scale-105 shadow-lg">
                            <i class="fas fa-external-link-alt mr-2"></i>
                            Akagami.net で他のサービスも見る
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    </body>
    </html>
  `)
})

// How to use page
app.get('/how-to-use', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>使い方 | Akagami Prompt</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg">
        
        <!-- Google Fonts - Rounded Gothic -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@300;400;500&display=swap" rel="stylesheet">
        
        <!-- Open Graph / Facebook / Threads -->
        <meta property="og:type" content="article">
        <meta property="og:url" content="https://akagami-prompt.pages.dev/how-to-use">
        <meta property="og:title" content="使い方 | Akagami Prompt">
        <meta property="og:description" content="Gemini専用・ナノバナナ対応の画像生成プロンプトの使い方を詳しく解説">
        <meta property="og:image" content="https://akagami-prompt.pages.dev/ogp-image.png">
        
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
          :root {
            --accent-color: #E94B6F;
          }
          body {
            font-family: 'Rounded Mplus 1c', 'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'メイリオ', Meiryo, sans-serif;
          }
          .accent-bg {
            background-color: var(--accent-color);
          }
          .accent-text {
            color: var(--accent-color);
          }
          .section-card {
            background: white;
            border-radius: 1rem;
            padding: 2rem;
            margin-bottom: 2rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          .step-number {
            width: 2.5rem;
            height: 2.5rem;
            border-radius: 50%;
            background: var(--accent-color);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            flex-shrink: 0;
          }
          .check-item {
            padding-left: 1.5rem;
            position: relative;
          }
          .check-item:before {
            content: "✓";
            position: absolute;
            left: 0;
            color: #10b981;
            font-weight: bold;
          }
          .x-item {
            padding-left: 1.5rem;
            position: relative;
          }
          .x-item:before {
            content: "✗";
            position: absolute;
            left: 0;
            color: #ef4444;
            font-weight: bold;
          }
          .warning-box {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 1rem;
            margin: 1rem 0;
            border-radius: 0.5rem;
          }
          .tip-box {
            background: #dbeafe;
            border-left: 4px solid #3b82f6;
            padding: 1rem;
            margin: 1rem 0;
            border-radius: 0.5rem;
          }
        </style>
    </head>
    <body class="bg-gray-50">
        <!-- Header -->
        <header class="text-white py-6 shadow-md" style="background-color: #F25C69;">
            <div class="max-w-4xl mx-auto px-4">
                <a href="/" class="inline-flex items-center text-white hover:opacity-80 transition">
                    <i class="fas fa-arrow-left mr-2"></i>
                    トップに戻る
                </a>
            </div>
        </header>

        <main class="max-w-4xl mx-auto px-4 py-8">
            <h1 class="text-3xl font-bold text-gray-800 mb-2">
                <i class="fas fa-book-open mr-2 accent-text"></i>
                使い方
            </h1>
            <p class="text-gray-600 mb-8">Gemini専用・ナノバナナ対応</p>

            <!-- 事前準備 -->
            <div class="section-card">
                <h2 class="text-2xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-camera mr-2 accent-text"></i>
                    事前準備
                </h2>
                
                <h3 class="text-lg font-bold text-gray-700 mb-3">必要なもの</h3>
                <ul class="space-y-2 mb-6">
                    <li class="check-item">顔がはっきり写っている写真を1枚用意</li>
                    <li class="check-item">正面より少しななめから撮影したものがベスト</li>
                    <li class="check-item">髪や輪郭が隠れていないもの</li>
                    <li class="check-item">明るい場所で撮影された写真がベスト</li>
                    <li class="x-item">サングラス、マスク、強い影は避ける</li>
                </ul>

                <div class="warning-box">
                    <h4 class="font-bold mb-2">⚠️ 写真についての重要ルール</h4>
                    <ul class="space-y-2 text-sm">
                        <li class="x-item">顔の形が変わるAI加工はNG</li>
                        <li class="x-item">別人になる系フィルターもNG</li>
                        <li class="check-item">OKなのは肌の明るさ調整、軽い美肌補正だけ</li>
                    </ul>
                    <p class="mt-3 text-sm font-bold">
                        SNOWやUlikeを使う場合は<br>
                        → 輪郭、目、鼻、口を変えない設定で<br>
                        → 肌だけ整えるのが正解
                    </p>
                    <p class="mt-3 text-sm font-bold text-red-600">
                        ここ超大事。盛るほど失敗します。悲しいけど事実です。
                    </p>
                </div>
            </div>

            <!-- 操作手順 -->
            <div class="section-card">
                <h2 class="text-2xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-list-ol mr-2 accent-text"></i>
                    操作手順
                </h2>
                
                <div class="space-y-4">
                    <div class="flex items-start gap-3">
                        <div class="step-number">1</div>
                        <p class="flex-1 pt-1">Geminiを開く</p>
                    </div>
                    <div class="flex items-start gap-3">
                        <div class="step-number">2</div>
                        <p class="flex-1 pt-1">左下の＋から、自分の写真を1枚アップロード</p>
                    </div>
                    <div class="flex items-start gap-3">
                        <div class="step-number">3</div>
                        <p class="flex-1 pt-1">画像生成アイコン（バナナマーク）をONにする</p>
                    </div>
                    <div class="flex items-start gap-3">
                        <div class="step-number">4</div>
                        <div class="flex-1">
                            <p class="mb-2">下のプロンプトをそのまま全部コピペ</p>
                            <p class="text-sm text-red-600 font-bold">※前後に自分の文章は足さない</p>
                        </div>
                    </div>
                    <div class="flex items-start gap-3">
                        <div class="step-number">5</div>
                        <p class="flex-1 pt-1 font-bold">モードは必ずプロモードで生成</p>
                    </div>
                </div>

                <div class="warning-box mt-6">
                    <h4 class="font-bold mb-2">⚠️ モードの注意</h4>
                    <ul class="space-y-2 text-sm">
                        <li class="x-item">高速モードはおすすめしません<br>
                            <span class="text-gray-600 ml-6">→ 顔が崩れやすく、再現度も下がります</span>
                        </li>
                        <li class="check-item font-bold">プロモード一択です。ケチると顔が壊れます。</li>
                    </ul>
                </div>
            </div>

            <!-- うまくいく写真のコツ -->
            <div class="section-card">
                <h2 class="text-2xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-lightbulb mr-2 accent-text"></i>
                    うまくいく写真のコツ
                </h2>
                
                <ul class="space-y-3">
                    <li class="check-item">笑顔はOK</li>
                    <li class="text-gray-700">
                        <span class="text-red-600 font-bold">ただし</span>目じりが極端に下がっている写真は<br>
                        <span class="ml-6">→ 生成後の表情が固定されやすい</span>
                    </li>
                    <li class="check-item font-bold">
                        一番安定するのは<br>
                        <span class="ml-6">→ 軽く口角が上がっている自然な表情</span>
                    </li>
                    <li class="x-item">カメラ目線を意識して、日常の顔より目をかっぴらいているのは超NG</li>
                </ul>
            </div>

            <!-- やってはいけない例 -->
            <div class="section-card">
                <h2 class="text-2xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-ban mr-2 text-red-600"></i>
                    やってはいけない例
                </h2>
                
                <ul class="space-y-2">
                    <li class="x-item">画質が荒いスクショ</li>
                    <li class="x-item">逆光で顔が暗い写真</li>
                    <li class="x-item">既にAIで作った顔画像</li>
                </ul>
            </div>

            <!-- よくある失敗と対処 -->
            <div class="section-card">
                <h2 class="text-2xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-tools mr-2 accent-text"></i>
                    よくある失敗と対処
                </h2>
                
                <div class="space-y-4">
                    <div>
                        <h4 class="font-bold text-gray-700 mb-2">❌ 顔が似ない</h4>
                        <p class="text-gray-600 ml-6">→ 写真を変えるだけで8割解決します</p>
                    </div>
                    <div>
                        <h4 class="font-bold text-gray-700 mb-2">❌ 変に若返る</h4>
                        <p class="text-gray-600 ml-6">→ 美肌補正を弱めた写真に差し替える</p>
                    </div>
                    <div>
                        <h4 class="font-bold text-gray-700 mb-2">❌ 髪型が勝手に変わる</h4>
                        <p class="text-gray-600 ml-6">→ 前髪や耳が見えている写真を使う</p>
                    </div>
                </div>

                <div class="tip-box mt-6">
                    <h4 class="font-bold mb-2">💡 生成は何回したらいい？</h4>
                    <p class="text-sm">
                        別々の自分の顔写真で4回ほど生成したら、理想のものができやすい。<br>
                        <span class="font-bold">1発で当たる方がレアです。</span>
                    </p>
                </div>
            </div>

            <!-- プロンプト一覧へ戻るボタン -->
            <div class="text-center mt-8">
                <a href="/" class="inline-block accent-bg text-white px-8 py-3 rounded-lg font-medium hover:opacity-90 transition">
                    <i class="fas fa-th mr-2"></i>
                    プロンプト一覧を見る
                </a>
            </div>
        </main>

        <!-- Footer -->
        <footer class="text-white py-8 mt-16" style="background-color: #F25C69;">
            <div class="max-w-7xl mx-auto px-4">
                <div class="flex flex-col items-center space-y-4">
                    <h3 class="text-lg font-semibold">Follow Me</h3>
                    <div class="flex space-x-6">
                        <a href="https://www.threads.com/@akagami0124" target="_blank" rel="noopener noreferrer" 
                           class="text-white hover:opacity-80 transition-all duration-300 hover:scale-110 flex flex-col items-center space-y-1"
                           aria-label="Threads 1">
                            <div class="relative">
                                <i class="fab fa-threads text-2xl"></i>
                                <i class="fas fa-star text-xs absolute -top-1 -right-1 animate-pulse" style="color: #FFD700;"></i>
                            </div>
                            <span class="text-xs">Threads 1</span>
                        </a>
                        <a href="https://www.threads.com/@akagami_sns" target="_blank" rel="noopener noreferrer" 
                           class="text-white hover:opacity-80 transition-all duration-300 hover:scale-110 flex flex-col items-center space-y-1"
                           aria-label="Threads 2">
                            <div class="relative">
                                <i class="fab fa-threads text-2xl"></i>
                                <i class="fas fa-briefcase text-xs absolute -top-1 -right-1 animate-pulse" style="color: #4ECDC4;"></i>
                            </div>
                            <span class="text-xs">Threads 2</span>
                        </a>
                        <a href="https://www.instagram.com/akagami_sns/" target="_blank" rel="noopener noreferrer" 
                           class="text-white hover:opacity-80 transition-all duration-300 hover:scale-110 hover:rotate-6 flex flex-col items-center space-y-1"
                           aria-label="Instagram">
                            <i class="fab fa-instagram text-2xl"></i>
                            <span class="text-xs">Instagram</span>
                        </a>
                        <a href="https://www.youtube.com/@akagami_sns" target="_blank" rel="noopener noreferrer" 
                           class="text-white hover:opacity-80 transition-all duration-300 hover:scale-110 flex flex-col items-center space-y-1"
                           aria-label="YouTube">
                            <i class="fab fa-youtube text-2xl"></i>
                            <span class="text-xs">YouTube</span>
                        </a>
                    </div>
                    <p class="text-sm text-gray-200 mt-4">© 2026 Akagami Prompt. All rights reserved.</p>
                    
                    <!-- Akagami.net Link -->
                    <div class="mt-6 pt-4 border-t border-white/20">
                        <a href="https://akagami.net" target="_blank" rel="noopener noreferrer" 
                           class="inline-flex items-center justify-center bg-white text-pink-600 font-semibold px-6 py-3 rounded-lg hover:bg-pink-50 transition-all duration-300 hover:scale-105 shadow-lg">
                            <i class="fas fa-external-link-alt mr-2"></i>
                            Akagami.net で他のサービスも見る
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    </body>
    </html>
  `)
})

// 404 Error Page
app.notFound((c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>404 - ページが見つかりません | Akagami Prompt</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg">
        
        <!-- Google Analytics 4 -->
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-K00PV68PRE"></script>
        <script>
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-K00PV68PRE', {
            page_title: '404 - ページが見つかりません',
            page_location: window.location.href
          });
        </script>
        
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
          :root {
            --accent-color: #E75556;
          }
          .accent-text {
            color: var(--accent-color);
          }
          .accent-bg {
            background-color: var(--accent-color);
          }
          .accent-border {
            border-color: var(--accent-color);
          }
          @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-20px); }
          }
          .float-animation {
            animation: float 3s ease-in-out infinite;
          }
        </style>
    </head>
    <body class="bg-gray-50 min-h-screen flex items-center justify-center p-4">
        <div class="max-w-2xl w-full text-center">
            <!-- 404 Icon -->
            <div class="mb-8 float-animation">
                <i class="fas fa-search text-9xl accent-text opacity-80"></i>
            </div>
            
            <!-- Error Message -->
            <h1 class="text-6xl font-bold text-gray-800 mb-4">404</h1>
            <h2 class="text-2xl font-semibold text-gray-700 mb-4">
                ページが見つかりません
            </h2>
            <p class="text-gray-600 mb-8 text-lg">
                お探しのページは存在しないか、移動した可能性があります。<br>
                URLをご確認いただくか、トップページからお探しください。
            </p>
            
            <!-- Action Buttons -->
            <div class="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                <a href="/" class="accent-bg text-white px-8 py-3 rounded-lg font-medium hover:opacity-90 transition inline-flex items-center justify-center">
                    <i class="fas fa-home mr-2"></i>
                    トップページに戻る
                </a>
                <button onclick="history.back()" class="bg-white border-2 accent-border accent-text px-8 py-3 rounded-lg font-medium hover:bg-gray-50 transition inline-flex items-center justify-center">
                    <i class="fas fa-arrow-left mr-2"></i>
                    前のページに戻る
                </button>
            </div>
            
            <!-- Popular Links -->
            <div class="bg-white rounded-lg shadow-lg p-8">
                <h3 class="text-xl font-semibold text-gray-800 mb-6">
                    <i class="fas fa-star accent-text mr-2"></i>
                    人気のページ
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <a href="/" class="text-left p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow transition">
                        <div class="font-medium text-gray-800 mb-1">
                            <i class="fas fa-lightbulb accent-text mr-2"></i>
                            プロンプト一覧
                        </div>
                        <div class="text-sm text-gray-600">
                            画像生成プロンプトを探す
                        </div>
                    </a>
                    <a href="/admin" class="text-left p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow transition">
                        <div class="font-medium text-gray-800 mb-1">
                            <i class="fas fa-cog accent-text mr-2"></i>
                            管理画面
                        </div>
                        <div class="text-sm text-gray-600">
                            プロンプトを管理する
                        </div>
                    </a>
                </div>
            </div>
            
            <!-- Footer -->
            <div class="mt-12 text-gray-500 text-sm">
                <p>
                    <i class="fas fa-question-circle mr-1"></i>
                    問題が解決しない場合は、URLが正しいかご確認ください
                </p>
            </div>
        </div>
        
        <script>
          // Google Analytics event tracking for 404
          if (typeof gtag !== 'undefined') {
            gtag('event', 'page_not_found', {
              event_category: 'error',
              event_label: window.location.pathname,
              value: 404
            });
          }
        </script>
    </body>
    </html>
  `, 404)
})

export default app
