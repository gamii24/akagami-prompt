import { Hono } from 'hono'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'

type Bindings = {
  DB: D1Database;
  RESEND_API_KEY: string;
}

const auth = new Hono<{ Bindings: Bindings }>()

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

// Helper: Generate random salt
function generateSalt(): string {
  const buffer = new Uint8Array(16) // 128-bit salt
  crypto.getRandomValues(buffer)
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Helper: Hash password with PBKDF2
async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  // Generate salt if not provided
  const passwordSalt = salt || generateSalt()
  
  // Convert password and salt to buffer
  const encoder = new TextEncoder()
  const passwordBuffer = encoder.encode(password)
  const saltBuffer = encoder.encode(passwordSalt)
  
  // Import key
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits']
  )
  
  // Derive key with PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000, // 100,000 iterations
      hash: 'SHA-256'
    },
    keyMaterial,
    256 // 256-bit output
  )
  
  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(derivedBits))
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  
  return { hash, salt: passwordSalt }
}

// Helper: Generate secure random token (256-bit)
function generateToken(): string {
  const buffer = new Uint8Array(32) // 256-bit token
  crypto.getRandomValues(buffer)
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
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

    // Hash password with PBKDF2
    const { hash: passwordHash, salt: passwordSalt } = await hashPassword(password)

    // Generate verification token
    const verificationToken = generateToken()
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // Insert user
    await c.env.DB.prepare(`
      INSERT INTO users (email, password_hash, password_salt, nickname, verification_token, verification_token_expiry)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      email,
      passwordHash,
      passwordSalt,
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
  
  // Get client IP address
  const ipAddress = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'

  if (!email || !password) {
    return c.json({ error: 'メールアドレスとパスワードを入力してください' }, 400)
  }

  try {
    // Check rate limiting - count failed attempts in last 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    
    const recentAttempts = await c.env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM login_attempts
      WHERE ip_address = ? 
        AND attempt_time > ?
        AND success = 0
    `).bind(ipAddress, fifteenMinutesAgo).first()
    
    if (recentAttempts && (recentAttempts.count as number) >= 5) {
      return c.json({ 
        error: 'ログイン試行回数が上限に達しました。15分後に再試行してください。' 
      }, 429) // 429 Too Many Requests
    }

    // Find user
    const user = await c.env.DB.prepare(`
      SELECT id, password_hash, password_salt, nickname, is_verified 
      FROM users 
      WHERE email = ?
    `).bind(email).first()

    if (!user) {
      // Record failed attempt
      await c.env.DB.prepare(`
        INSERT INTO login_attempts (ip_address, email, success)
        VALUES (?, ?, 0)
      `).bind(ipAddress, email).run()
      
      return c.json({ error: 'メールアドレスまたはパスワードが正しくありません' }, 401)
    }

    // Check if verified
    if (!user.is_verified) {
      // Record failed attempt
      await c.env.DB.prepare(`
        INSERT INTO login_attempts (ip_address, email, success)
        VALUES (?, ?, 0)
      `).bind(ipAddress, email).run()
      
      return c.json({ error: 'メールアドレスが認証されていません' }, 401)
    }

    // Verify password
    const { hash: passwordHash } = await hashPassword(password, user.password_salt as string)
    if (passwordHash !== user.password_hash) {
      // Record failed attempt
      await c.env.DB.prepare(`
        INSERT INTO login_attempts (ip_address, email, success)
        VALUES (?, ?, 0)
      `).bind(ipAddress, email).run()
      
      return c.json({ error: 'メールアドレスまたはパスワードが正しくありません' }, 401)
    }

    // Record successful attempt
    await c.env.DB.prepare(`
      INSERT INTO login_attempts (ip_address, email, success)
      VALUES (?, ?, 1)
    `).bind(ipAddress, email).run()

    // Get user agent
    const userAgent = c.req.header('User-Agent') || 'unknown'

    // Create session with device tracking
    const sessionToken = generateToken()
    const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

    await c.env.DB.prepare(`
      INSERT INTO user_sessions (user_id, session_token, expires_at, user_agent, ip_address, last_activity)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(user.id, sessionToken, expiryDate.toISOString(), userAgent, ipAddress).run()

    // Log successful login
    await logAuditEvent(
      c.env.DB,
      'login',
      user.id as number,
      ipAddress,
      userAgent,
      { email, success: true }
    )

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
      // Get user info before deleting session
      const session = await c.env.DB.prepare(`
        SELECT user_id FROM user_sessions WHERE session_token = ?
      `).bind(sessionToken).first()

      // Delete session
      await c.env.DB.prepare(
        'DELETE FROM user_sessions WHERE session_token = ?'
      ).bind(sessionToken).run()

      // Log logout event
      if (session) {
        const ipAddress = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
        const userAgent = c.req.header('User-Agent') || 'unknown'
        
        await logAuditEvent(
          c.env.DB,
          'logout',
          session.user_id as number,
          ipAddress,
          userAgent,
          { sessionToken: sessionToken.substring(0, 10) + '...' } // Only log part of token
        )
      }
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

    // Update last activity
    await c.env.DB.prepare(
      'UPDATE user_sessions SET last_activity = datetime(\'now\') WHERE session_token = ?'
    ).bind(sessionToken).run()

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
