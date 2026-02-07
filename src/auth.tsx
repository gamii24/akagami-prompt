import { Hono } from 'hono'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'

type Bindings = {
  DB: D1Database;
  RESEND_API_KEY: string;
}

const auth = new Hono<{ Bindings: Bindings }>()

// Helper: Hash password
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Helper: Generate verification token
function generateToken(): string {
  return crypto.randomUUID()
}

// Helper: Send verification email
async function sendVerificationEmail(email: string, token: string, resendApiKey: string) {
  const verificationUrl = `https://akagami-prompt.pages.dev/verify?token=${token}`
  
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Akagami Prompt <onboarding@resend.dev>',
      to: email,
      subject: 'メール認証 - Akagami Prompt',
      html: `
        <h2>Akagami Promptへようこそ！</h2>
        <p>以下のリンクをクリックしてメールアドレスを認証してください：</p>
        <p><a href="${verificationUrl}">${verificationUrl}</a></p>
        <p>このリンクは24時間有効です。</p>
      `
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Email sending failed: ${error}`)
  }

  return response.json()
}

// API: Register
auth.post('/register', async (c) => {
  const { email, password, nickname } = await c.req.json()

  // Validation
  if (!email || !password || !nickname) {
    return c.json({ error: 'メールアドレス、パスワード、ニックネームを入力してください' }, 400)
  }

  if (password.length < 8) {
    return c.json({ error: 'パスワードは8文字以上にしてください' }, 400)
  }

  try {
    // Check if user exists
    const existing = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email).first()

    if (existing) {
      return c.json({ error: 'このメールアドレスは既に登録されています' }, 400)
    }

    // Check if nickname exists
    const existingNickname = await c.env.DB.prepare(
      'SELECT id FROM users WHERE nickname = ?'
    ).bind(nickname).first()

    if (existingNickname) {
      return c.json({ error: 'このニックネームは既に使用されています' }, 400)
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Generate verification token
    const verificationToken = generateToken()
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // Insert user
    await c.env.DB.prepare(`
      INSERT INTO users (email, password_hash, nickname, verification_token, verification_token_expiry)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      email,
      passwordHash,
      nickname,
      verificationToken,
      tokenExpiry.toISOString()
    ).run()

    // Send verification email
    await sendVerificationEmail(email, verificationToken, c.env.RESEND_API_KEY)

    return c.json({
      success: true,
      message: '登録が完了しました。メールを確認して認証を完了してください。'
    })
  } catch (error) {
    console.error('Registration error:', error)
    return c.json({ error: '登録に失敗しました' }, 500)
  }
})

// API: Verify email
auth.get('/verify', async (c) => {
  const token = c.req.query('token')

  if (!token) {
    return c.json({ error: 'トークンが無効です' }, 400)
  }

  try {
    // Find user with token
    const user = await c.env.DB.prepare(`
      SELECT id, verification_token_expiry 
      FROM users 
      WHERE verification_token = ? AND is_verified = 0
    `).bind(token).first()

    if (!user) {
      return c.json({ error: '無効なトークンまたは既に認証済みです' }, 400)
    }

    // Check token expiry
    const expiry = new Date(user.verification_token_expiry as string)
    if (expiry < new Date()) {
      return c.json({ error: 'トークンの有効期限が切れています' }, 400)
    }

    // Update user
    await c.env.DB.prepare(`
      UPDATE users 
      SET is_verified = 1, verification_token = NULL, verification_token_expiry = NULL
      WHERE id = ?
    `).bind(user.id).run()

    return c.json({
      success: true,
      message: 'メール認証が完了しました！ログインしてください。'
    })
  } catch (error) {
    console.error('Verification error:', error)
    return c.json({ error: '認証に失敗しました' }, 500)
  }
})

// API: Login
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json()

  if (!email || !password) {
    return c.json({ error: 'メールアドレスとパスワードを入力してください' }, 400)
  }

  try {
    // Find user
    const user = await c.env.DB.prepare(`
      SELECT id, password_hash, nickname, is_verified 
      FROM users 
      WHERE email = ?
    `).bind(email).first()

    if (!user) {
      return c.json({ error: 'メールアドレスまたはパスワードが正しくありません' }, 401)
    }

    // Check if verified
    if (!user.is_verified) {
      return c.json({ error: 'メールアドレスが認証されていません' }, 401)
    }

    // Verify password
    const passwordHash = await hashPassword(password)
    if (passwordHash !== user.password_hash) {
      return c.json({ error: 'メールアドレスまたはパスワードが正しくありません' }, 401)
    }

    // Create session
    const sessionToken = generateToken()
    const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

    await c.env.DB.prepare(`
      INSERT INTO user_sessions (user_id, session_token, expires_at)
      VALUES (?, ?, ?)
    `).bind(user.id, sessionToken, expiryDate.toISOString()).run()

    // Set cookie
    setCookie(c, 'session_token', sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    })

    return c.json({
      success: true,
      user: {
        id: user.id,
        nickname: user.nickname,
        email: email
      }
    })
  } catch (error) {
    console.error('Login error:', error)
    return c.json({ error: 'ログインに失敗しました' }, 500)
  }
})

// API: Logout
auth.post('/logout', async (c) => {
  const sessionToken = getCookie(c, 'session_token')

  if (sessionToken) {
    try {
      await c.env.DB.prepare(
        'DELETE FROM user_sessions WHERE session_token = ?'
      ).bind(sessionToken).run()
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  deleteCookie(c, 'session_token')
  return c.json({ success: true })
})

// API: Get current user
auth.get('/me', async (c) => {
  const sessionToken = getCookie(c, 'session_token')

  if (!sessionToken) {
    return c.json({ error: 'ログインしていません' }, 401)
  }

  try {
    // Find session
    const session = await c.env.DB.prepare(`
      SELECT s.user_id, s.expires_at, u.nickname, u.email
      FROM user_sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.session_token = ?
    `).bind(sessionToken).first()

    if (!session) {
      deleteCookie(c, 'session_token')
      return c.json({ error: 'セッションが無効です' }, 401)
    }

    // Check expiry
    const expiry = new Date(session.expires_at as string)
    if (expiry < new Date()) {
      deleteCookie(c, 'session_token')
      await c.env.DB.prepare(
        'DELETE FROM user_sessions WHERE session_token = ?'
      ).bind(sessionToken).run()
      return c.json({ error: 'セッションの有効期限が切れています' }, 401)
    }

    return c.json({
      user: {
        id: session.user_id,
        nickname: session.nickname,
        email: session.email
      }
    })
  } catch (error) {
    console.error('Get user error:', error)
    return c.json({ error: 'ユーザー情報の取得に失敗しました' }, 500)
  }
})

export default auth
