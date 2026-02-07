import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'

type Bindings = {
  DB: D1Database;
  SUBMISSIONS_R2: R2Bucket;
}

const submissions = new Hono<{ Bindings: Bindings }>()

// Helper: Log audit event
async function logAuditEvent(
  db: D1Database,
  eventType: string,
  userId: number | null,
  ipAddress: string,
  userAgent: string,
  details: any
) {
  try {
    await db.prepare(`
      INSERT INTO audit_logs (event_type, user_id, ip_address, user_agent, details)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      eventType,
      userId,
      ipAddress,
      userAgent,
      JSON.stringify(details)
    ).run()
  } catch (error) {
    console.error('Failed to log audit event:', error)
  }
}

// Helper: Validate image file by magic number
function validateImageMagicNumber(buffer: ArrayBuffer): { valid: boolean; mimeType: string | null } {
  const arr = new Uint8Array(buffer).subarray(0, 12)
  
  // JPEG: FF D8 FF
  if (arr[0] === 0xFF && arr[1] === 0xD8 && arr[2] === 0xFF) {
    return { valid: true, mimeType: 'image/jpeg' }
  }
  
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4E && arr[3] === 0x47 &&
      arr[4] === 0x0D && arr[5] === 0x0A && arr[6] === 0x1A && arr[7] === 0x0A) {
    return { valid: true, mimeType: 'image/png' }
  }
  
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (arr[0] === 0x52 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x46 &&
      arr[8] === 0x57 && arr[9] === 0x45 && arr[10] === 0x42 && arr[11] === 0x50) {
    return { valid: true, mimeType: 'image/webp' }
  }
  
  return { valid: false, mimeType: null }
}

// Helper: Get current user from session
async function getCurrentUser(c: any) {
  const sessionToken = getCookie(c, 'session_token')

  if (!sessionToken) {
    return null
  }

  const session = await c.env.DB.prepare(`
    SELECT s.user_id, u.nickname, u.email
    FROM user_sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.session_token = ? AND s.expires_at > datetime('now')
  `).bind(sessionToken).first()

  return session ? {
    id: session.user_id,
    nickname: session.nickname,
    email: session.email
  } : null
}

// API: Upload image to R2
submissions.post('/upload', async (c) => {
  const user = await getCurrentUser(c)

  if (!user) {
    return c.json({ error: 'ログインしてください' }, 401)
  }

  try {
    const formData = await c.req.formData()
    const file = formData.get('image') as File

    if (!file) {
      return c.json({ error: '画像ファイルを選択してください' }, 400)
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: '画像ファイルはJPEG、PNG、WebP形式のみ対応しています' }, 400)
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return c.json({ error: '画像サイズは5MB以下にしてください' }, 400)
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer()
    
    // Validate by magic number
    const magicCheck = validateImageMagicNumber(arrayBuffer)
    if (!magicCheck.valid) {
      return c.json({ error: '無効な画像ファイルです' }, 400)
    }
    
    // Verify MIME type matches magic number
    if (magicCheck.mimeType !== file.type) {
      return c.json({ error: 'ファイル形式が一致しません' }, 400)
    }

    // Sanitize filename - remove special characters
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '')
    const ext = sanitizedName.split('.').pop() || 'jpg'
    const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`
    const key = `submissions/${filename}`

    // Upload to R2
    await c.env.SUBMISSIONS_R2.put(key, arrayBuffer, {
      httpMetadata: {
        contentType: magicCheck.mimeType // Use validated MIME type
      }
    })

    // Generate public URL (you may need to configure R2 public bucket)
    const imageUrl = `https://pub-YOUR-R2-ID.r2.dev/${key}`

    return c.json({ 
      success: true, 
      url: imageUrl,
      key: key
    })
  } catch (error) {
    console.error('Upload error:', error)
    return c.json({ error: '画像のアップロードに失敗しました' }, 500)
  }
})

// API: Create submission (no comment field)
submissions.post('/', async (c) => {
  const user = await getCurrentUser(c)

  if (!user) {
    return c.json({ error: 'ログインしてください' }, 401)
  }

  const { prompt_id, image_url } = await c.req.json()

  if (!prompt_id || !image_url) {
    return c.json({ error: 'プロンプトIDと画像URLが必要です' }, 400)
  }

  try {
    // Insert submission
    const result = await c.env.DB.prepare(`
      INSERT INTO user_submissions (user_id, prompt_id, image_url, is_approved)
      VALUES (?, ?, ?, 0)
    `).bind(user.id, prompt_id, image_url).run()

    return c.json({
      success: true,
      id: result.meta.last_row_id,
      message: '投稿が完了しました。管理者の承認をお待ちください。'
    })
  } catch (error) {
    console.error('Submission error:', error)
    return c.json({ error: '投稿に失敗しました' }, 500)
  }
})

// API: Get submissions for a prompt (approved only)
submissions.get('/prompt/:promptId', async (c) => {
  const promptId = c.req.param('promptId')

  try {
    const results = await c.env.DB.prepare(`
      SELECT 
        s.id,
        s.image_url,
        s.created_at,
        u.nickname as user_nickname
      FROM user_submissions s
      JOIN users u ON s.user_id = u.id
      WHERE s.prompt_id = ? AND s.is_approved = 1
      ORDER BY s.created_at DESC
      LIMIT 50
    `).bind(promptId).all()

    return c.json(results.results)
  } catch (error) {
    console.error('Get submissions error:', error)
    return c.json({ error: '投稿の取得に失敗しました' }, 500)
  }
})

// API: Get user's own submissions
submissions.get('/my', async (c) => {
  const user = await getCurrentUser(c)

  if (!user) {
    return c.json({ error: 'ログインしてください' }, 401)
  }

  try {
    const results = await c.env.DB.prepare(`
      SELECT 
        s.id,
        s.image_url,
        s.is_approved,
        s.created_at,
        p.title as prompt_title,
        p.id as prompt_id
      FROM user_submissions s
      JOIN prompts p ON s.prompt_id = p.id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
    `).bind(user.id).all()

    return c.json(results.results)
  } catch (error) {
    console.error('Get my submissions error:', error)
    return c.json({ error: '投稿の取得に失敗しました' }, 500)
  }
})

// API: Delete own submission
submissions.delete('/:id', async (c) => {
  const user = await getCurrentUser(c)

  if (!user) {
    return c.json({ error: 'ログインしてください' }, 401)
  }

  const id = c.req.param('id')

  try {
    // Check ownership
    const submission = await c.env.DB.prepare(
      'SELECT user_id, image_url FROM user_submissions WHERE id = ?'
    ).bind(id).first()

    if (!submission) {
      return c.json({ error: '投稿が見つかりません' }, 404)
    }

    if (submission.user_id !== user.id) {
      return c.json({ error: '削除する権限がありません' }, 403)
    }

    // Delete from database
    await c.env.DB.prepare(
      'DELETE FROM user_submissions WHERE id = ?'
    ).bind(id).run()

    // TODO: Delete from R2 if needed
    // const key = extractKeyFromUrl(submission.image_url)
    // await c.env.SUBMISSIONS_R2.delete(key)

    return c.json({ success: true })
  } catch (error) {
    console.error('Delete submission error:', error)
    return c.json({ error: '削除に失敗しました' }, 500)
  }
})

// Admin APIs

// API: Get all submissions (with filter)
submissions.get('/admin/list', async (c) => {
  const status = c.req.query('status') // 'pending' or 'approved'

  try {
    let query = `
      SELECT 
        s.id,
        s.image_url,
        s.is_approved,
        s.created_at,
        u.nickname as user_nickname,
        p.title as prompt_title,
        p.id as prompt_id
      FROM user_submissions s
      JOIN users u ON s.user_id = u.id
      JOIN prompts p ON s.prompt_id = p.id
    `

    if (status === 'pending') {
      query += ' WHERE s.is_approved = 0'
    } else if (status === 'approved') {
      query += ' WHERE s.is_approved = 1'
    }

    query += ' ORDER BY s.created_at DESC'

    const results = await c.env.DB.prepare(query).all()

    return c.json(results.results)
  } catch (error) {
    console.error('Get admin submissions error:', error)
    return c.json({ error: '投稿の取得に失敗しました' }, 500)
  }
})

// API: Approve submission
submissions.put('/admin/:id/approve', async (c) => {
  const id = c.req.param('id')

  try {
    // Get submission details before approval
    const submission = await c.env.DB.prepare(
      'SELECT user_id, prompt_id FROM user_submissions WHERE id = ?'
    ).bind(id).first()

    await c.env.DB.prepare(
      'UPDATE user_submissions SET is_approved = 1 WHERE id = ?'
    ).bind(id).run()

    // Log approval event
    const ipAddress = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
    const userAgent = c.req.header('User-Agent') || 'unknown'
    
    await logAuditEvent(
      c.env.DB,
      'submission_approved',
      null, // Admin user ID (no auth system for admin yet)
      ipAddress,
      userAgent,
      { 
        submissionId: id,
        userId: submission?.user_id,
        promptId: submission?.prompt_id
      }
    )

    return c.json({ success: true })
  } catch (error) {
    console.error('Approve submission error:', error)
    return c.json({ error: '承認に失敗しました' }, 500)
  }
})

// API: Delete submission (admin)
submissions.delete('/admin/:id', async (c) => {
  const id = c.req.param('id')

  try {
    // Get submission details before deletion
    const submission = await c.env.DB.prepare(
      'SELECT user_id, prompt_id, image_url FROM user_submissions WHERE id = ?'
    ).bind(id).first()

    await c.env.DB.prepare(
      'DELETE FROM user_submissions WHERE id = ?'
    ).bind(id).run()

    // Log deletion event
    const ipAddress = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
    const userAgent = c.req.header('User-Agent') || 'unknown'
    
    await logAuditEvent(
      c.env.DB,
      'submission_deleted',
      null, // Admin user ID
      ipAddress,
      userAgent,
      { 
        submissionId: id,
        userId: submission?.user_id,
        promptId: submission?.prompt_id,
        imageUrl: submission?.image_url
      }
    )

    return c.json({ success: true })
  } catch (error) {
    console.error('Delete submission error:', error)
    return c.json({ error: '削除に失敗しました' }, 500)
  }
})

export default submissions
