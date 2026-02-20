/**
 * Serwer zarządzania użytkownikami i licencjami (lokalny/wirtualny).
 * Uruchom: npm run start  (w folderze server) lub z roota: npm run server
 * Domyślnie nasłuchuje na http://localhost:3000
 * Panel admina: http://localhost:3000/admin
 */
require('dotenv').config()

// Nie dopuść do crasha przy nieobsłużonym błędzie – loguj i odpowiadaj 500 w requestach
process.on('unhandledRejection', (reason, promise) => {
  console.error('[JobRaven] unhandledRejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[JobRaven] uncaughtException:', err && err.message, err && err.stack)
})

const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const express = require('express')
const { marked } = require('marked')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const { registerUser, loginUser, changePassword, changeDisplayName, seedIfNeeded, getUsersWithLicenses, getOrganizationsForAdmin, setUserDisabled, setUserLicense, setUserLastLicenseVerification, setUserLastLogin, deleteUser, verifyEmail, resendVerificationEmail, createPasswordResetToken, resetPasswordWithToken, readNotices, addNotice, updateNotice, deleteNotice, addNoticeRead, getNoticeReadStats, getUsersOverTime } = require('./store')
const { sendMail, verificationLink, resetPasswordLink, verifySmtpConnection } = require('./mail')
const { getVerificationEmail, getResendVerificationEmail, getResetPasswordEmail, getVerifyEmailPage, getResetPasswordPageLabels } = require('./mailTemplates')

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    const first = typeof forwarded === 'string' ? forwarded.split(',')[0] : (forwarded[0] || '')
    const ip = first.trim()
    if (ip) return ip
  }
  return req.ip || req.socket?.remoteAddress || ''
}

function escapeHtml(s) {
  if (typeof s !== 'string') return ''
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
function escapeJsString(s) {
  if (typeof s !== 'string') return ''
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')
}

seedIfNeeded()

const app = express()
app.set('trust proxy', 1)
const PORT = process.env.PORT || 3000
const ADMIN_SECRET = process.env.JOBRAVEN_ADMIN_SECRET || process.env.ADMIN_SECRET
const JWT_SECRET = process.env.JOBRAVEN_JWT_SECRET || process.env.JWT_SECRET || 'jobraven-dev-secret-change-in-production'
const JWT_EXPIRES_IN = '1h'

// Panel admina – logowanie użytkownik/hasło (hash przechowywany, nie hasło w plain text)
const ADMIN_USERNAME = 'admin'
const ADMIN_SALT = 'jobraven-admin-2025'
const ADMIN_PASSWORD_HASH = process.env.JOBRAVEN_ADMIN_PASSWORD_HASH || 'b73e1b4e3d0b4429abbf7d267edec233fa51408eb6901ed077e79181c9efe6d0becb12acc6111f3c09b926b6aa77544b4dca99fb938819e34e96989f1df933ad'

function verifyAdminPassword(password) {
  if (!password || typeof password !== 'string') return false
  const hash = crypto.scryptSync(password, ADMIN_SALT, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(ADMIN_PASSWORD_HASH, 'hex'))
}

function signLicenseToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

function signAdminToken() {
  return jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '7d' })
}

function verifyAdminToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    return decoded && decoded.role === 'admin'
  } catch {
    return false
  }
}

app.use(cors())
app.use(express.json())

// Root – część platform (np. Railway) sprawdza GET / jako health check
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'jobraven-auth', health: '/health', admin: '/admin', help: '/help' })
})

// Health check – aplikacja może sprawdzić, czy na tym adresie działa serwer JobRaven
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'jobraven-auth' })
})
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'jobraven-auth' })
})

// Pomoc (HELP.md jako HTML) – publicznie pod /help
const HELP_PATH = path.join(__dirname, 'help.md')
function slugify (text) {
  const pl = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' }
  let s = String(text).trim().toLowerCase()
  s = s.replace(/[ąćęłńóśźż]/g, c => pl[c] || c)
  return s.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}
function addHeadingIds (html) {
  return html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_, level, inner) => {
    const text = inner.replace(/<[^>]+>/g, '').trim()
    const id = slugify(text) || 'section'
    return `<h${level} id="${id}">${inner}</h${level}>`
  })
}
app.get('/help', (req, res) => {
  fs.readFile(HELP_PATH, 'utf8', (err, md) => {
    if (err) {
      res.status(404).contentType('text/html').send('<html><body><h1>Pomoc niedostępna</h1><p>Plik pomocy nie został znaleziony.</p></body></html>')
      return
    }
    let body = marked.parse(md)
    body = addHeadingIds(body)
    const html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pomoc – JobRaven</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; max-width: 720px; margin: 0 auto; padding: 24px; color: #1a1a1a; background: #fff; }
    h1 { font-size: 1.5rem; margin-top: 0; border-bottom: 1px solid #e5e5e5; padding-bottom: 8px; }
    h2 { font-size: 1.25rem; margin-top: 1.5rem; }
    h3 { font-size: 1.1rem; margin-top: 1rem; }
    h4 { font-size: 1rem; margin-top: 0.75rem; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    ul, ol { margin: 0.5rem 0; padding-left: 1.5rem; }
    table { border-collapse: collapse; width: 100%; margin: 0.75rem 0; }
    th, td { border: 1px solid #e5e5e5; padding: 6px 10px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    hr { border: none; border-top: 1px solid #e5e5e5; margin: 1.5rem 0; }
    p { margin: 0.5rem 0; }
    strong { font-weight: 600; }
  </style>
</head>
<body>
${body}
</body>
</html>`
    res.contentType('text/html').send(html)
  })
})

// Diagnostyka: sprawdzenie połączenia + wysłanie maila testowego na mkucharski8@gmail.com
const SMTP_CHECK_TEST_EMAIL = 'mkucharski8@gmail.com'
app.get('/api/smtp-check', async (req, res) => {
  try {
    const result = await verifySmtpConnection()
    if (result.ok) {
      try {
        await sendMail(
          SMTP_CHECK_TEST_EMAIL,
          'JobRaven – test wysyłki',
          '<p>To jest test wysyłki z serwera JobRaven (endpoint /api/smtp-check).</p><p>Jeśli to widzisz, maile działają.</p>',
          'To jest test wysyłki z serwera JobRaven (endpoint /api/smtp-check). Jeśli to widzisz, maile działają.'
        )
        result.sentTestTo = SMTP_CHECK_TEST_EMAIL
      } catch (mailErr) {
        result.sentTestTo = null
        result.sendTestError = mailErr && mailErr.message || String(mailErr)
      }
    }
    res.json(result)
  } catch (err) {
    res.status(500).json({ ok: false, error: err && err.message || String(err) })
  }
})

function adminAuth(req, res, next) {
  const key = req.query.key || req.get('X-Admin-Key')
  if (key && ADMIN_SECRET && key === ADMIN_SECRET) return next()
  if (key && verifyAdminToken(key)) return next()
  return res.status(401).json({ error: 'UNAUTHORIZED' })
}

// Logowanie do panelu admina (użytkownik + hasło) – zwraca JWT do użycia jako key
app.post('/api/admin/login', (req, res) => {
  try {
    const { username, password } = req.body || {}
    if (String(username || '').trim() !== ADMIN_USERNAME || !verifyAdminPassword(password)) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' })
    }
    const token = signAdminToken()
    res.json({ ok: true, token })
  } catch (err) {
    console.error('Admin login error:', err)
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' })
  }
})

const adminIndex = path.join(__dirname, 'public', 'admin', 'index.html')
app.get('/admin', (req, res) => res.sendFile(adminIndex))
app.get('/admin/', (req, res) => res.sendFile(adminIndex))
app.get('/admin/login', (req, res) => res.redirect(302, '/admin/'))
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')))

// Strona resetu hasła (link z e-maila) – treść zależna od lang w query
app.get('/reset-password', (req, res) => {
  const token = (req.query.token || '').toString().trim()
  const lang = (req.query.lang === 'en' || req.query.lang === 'pl') ? req.query.lang : 'pl'
  const L = getResetPasswordPageLabels(lang)
  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(L.title)} – JobRaven</title>
<style>body{font-family:system-ui;padding:2rem;max-width:400px;margin:0 auto;}input{width:100%;padding:8px 12px;margin:8px 0;box-sizing:border-box;}button{padding:10px 20px;background:#18181b;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-top:8px;}.error{color:#b91c1c;font-size:0.9rem;}.success{color:#166534;}</style>
</head>
<body>
<h1>${escapeHtml(L.title)}</h1>
<div id="msg"></div>
<form id="f" method="post" action="/api/auth/reset-password">
<input type="hidden" name="token" value="${token.replace(/"/g, '&quot;')}">
<label>${escapeHtml(L.passwordLabel)}</label><input type="password" name="newPassword" required minlength="6" autocomplete="new-password">
<label>${escapeHtml(L.confirmLabel)}</label><input type="password" name="confirm" required minlength="6" autocomplete="new-password">
<button type="submit">${escapeHtml(L.submit)}</button>
</form>
<script>
var f = document.getElementById('f');
var msg = document.getElementById('msg');
var L = { tokenMissing: '${escapeJsString(L.tokenMissing)}', passwordsMismatch: '${escapeJsString(L.passwordsMismatch)}', success: '${escapeJsString(L.success)}', tokenExpired: '${escapeJsString(L.tokenExpired)}', error: '${escapeJsString(L.error)}', connectionError: '${escapeJsString(L.connectionError)}' };
if (!f.querySelector('input[name="token"]').value) { msg.innerHTML = '<p class="error">' + L.tokenMissing + '</p>'; }
f.onsubmit = function(e) {
  e.preventDefault();
  if (f.newPassword.value !== f.confirm.value) { msg.innerHTML = '<p class="error">' + L.passwordsMismatch + '</p>'; return; }
  fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: f.querySelector('input[name="token"]').value, newPassword: f.newPassword.value }) })
    .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
    .then(function(x) {
      if (x.ok) { msg.innerHTML = '<p class="success">' + L.success + '</p>'; f.style.display = 'none'; }
      else { msg.innerHTML = '<p class="error">' + (x.data.error === 'TOKEN_EXPIRED' ? L.tokenExpired : (x.data.error || L.error)) + '</p>'; }
    })
    .catch(function() { msg.innerHTML = '<p class="error">' + L.connectionError + '</p>'; });
};
</script>
</body>
</html>`
  res.send(html)
})

// Rejestracja (wymaga potwierdzenia e-mail). Język maila: req.body.lang (pl|en). Zapisujemy IP i lokalizację przy rejestracji.
app.post('/api/auth/register', async (req, res) => {
  let createdUserId = null
  try {
    const { email, password, displayName, organizationId, lang } = req.body || {}
    const result = registerUser({ email, password, displayName, organizationId })
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error })
    }
    createdUserId = result.user.id
    const ip = getClientIp(req)
    const at = new Date().toISOString()
    setUserLastLogin(result.user.id, { ip: ip || null, at })
    if (ip && ip !== '127.0.0.1' && ip !== '::1' && !ip.startsWith('10.') && !ip.startsWith('192.168.') && !ip.startsWith('172.')) {
      fetch('http://ip-api.com/json/' + encodeURIComponent(ip) + '?fields=country,city,regionName')
        .then(r => r.json())
        .then(data => {
          if (data && data.country) {
            const loc = [data.city, data.regionName, data.country].filter(Boolean).join(', ')
            if (loc) setUserLastLogin(result.user.id, { location: loc })
          }
        })
        .catch(() => {})
    } else if (ip) {
      setUserLastLogin(result.user.id, { location: 'Lokalnie' })
    }
    const language = (lang === 'en' || lang === 'pl') ? lang : 'pl'
    const link = verificationLink(result.verification_token, language)
    const { subject, html } = getVerificationEmail(language, link)
    try {
      await sendMail(result.user.email, subject, html)
    } catch (mailErr) {
      console.error('Register: wysyłka maila nie powiodła się:', mailErr && mailErr.message, mailErr && mailErr.code)
      try { if (createdUserId != null) deleteUser(createdUserId) } catch (e) { console.error('Register: rollback deleteUser failed', e) }
      return res.status(500).json({ ok: false, error: 'EMAIL_SEND_FAILED' })
    }
    return res.json({ ok: true, user: result.user, message: 'EMAIL_VERIFICATION_SENT' })
  } catch (err) {
    console.error('Register error:', err && err.message, err && err.stack)
    try { if (createdUserId != null) deleteUser(createdUserId) } catch (e) { console.error('Register: rollback deleteUser failed', e) }
    return res.status(500).json({ ok: false, error: 'EMAIL_SEND_FAILED' })
  }
})

// Logowanie (weryfikacja + zwrot licencji z podpisem JWT)
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body || {}
    const result = loginUser({ email, password })
    if (!result.ok) {
      return res.status(401).json({ ok: false, error: result.error })
    }
    const license = result.license || { valid: false }
    const licensePayload = {
      sub: result.user.email,
      valid: license.valid,
      expires_at: license.expires_at || null,
      plan: license.plan || null
    }
    const license_token = signLicenseToken(licensePayload)
    res.json({ ok: true, user: result.user, license: result.license, license_token })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' })
  }
})

// Potwierdzenie e-maila (link z maila). Język strony: query lang (pl|en)
app.get('/verify-email', (req, res) => {
  const token = req.query.token
  const lang = (req.query.lang === 'en' || req.query.lang === 'pl') ? req.query.lang : 'pl'
  const result = verifyEmail(token)
  const { title, text } = getVerifyEmailPage(lang, result.ok)
  const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body style="font-family:system-ui;padding:2rem;max-width:480px;margin:0 auto;"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p></body></html>`
  res.status(result.ok ? 200 : 400).send(html)
})

app.post('/api/auth/verify-email', (req, res) => {
  try {
    const { token } = req.body || {}
    const result = verifyEmail(token)
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' })
  }
})

// Ponowne wysłanie linku weryfikacyjnego. Język maila: req.body.lang (pl|en)
app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const { email, lang } = req.body || {}
    const result = resendVerificationEmail(email)
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error })
    const language = (lang === 'en' || lang === 'pl') ? lang : 'pl'
    const link = verificationLink(result.verification_token, language)
    const { subject, html } = getResendVerificationEmail(language, link)
    try {
      await sendMail(email, subject, html)
    } catch (mailErr) {
      console.error('Resend verification: wysyłka maila nie powiodła się:', mailErr)
      return res.status(500).json({ ok: false, error: 'EMAIL_SEND_FAILED' })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('Resend verification error:', err)
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' })
  }
})

// Prośba o reset hasła (wysyłka linku e-mailem). Język maila: req.body.lang (pl|en)
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email, lang } = req.body || {}
    const result = createPasswordResetToken(email)
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error })
    }
    const language = (lang === 'en' || lang === 'pl') ? lang : 'pl'
    const link = resetPasswordLink(result.reset_token, language)
    const { subject, html } = getResetPasswordEmail(language, link)
    const emailToSend = typeof email === 'string' ? email.trim() : (req.body && req.body.email ? String(req.body.email).trim() : '')
    try {
      await sendMail(emailToSend || result.email, subject, html)
    } catch (mailErr) {
      console.error('Forgot password: wysyłka maila nie powiodła się:', mailErr)
      return res.status(500).json({ ok: false, error: 'EMAIL_SEND_FAILED' })
    }
    res.json({ ok: true, message: 'RESET_EMAIL_SENT' })
  } catch (err) {
    console.error('Forgot password error:', err)
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' })
  }
})

// Ustawienie nowego hasła (token z linku w e-mailu)
app.post('/api/auth/reset-password', (req, res) => {
  try {
    const { token, newPassword } = req.body || {}
    const result = resetPasswordWithToken(token, newPassword)
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' })
  }
})

// Zmiana hasła (email + obecne hasło + nowe hasło, gdy użytkownik jest zalogowany)
app.post('/api/auth/change-password', (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body || {}
    const result = changePassword({ email, currentPassword, newPassword })
    if (!result.ok) {
      const status = result.error === 'INVALID_CREDENTIALS' ? 401 : 400
      return res.status(status).json({ ok: false, error: result.error })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('Change password error:', err)
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' })
  }
})

// Zmiana loginu (nazwy wyświetlanej). Wymaga obecnego hasła. Nie dostępne offline.
app.post('/api/auth/change-display-name', (req, res) => {
  try {
    const { email, currentPassword, newDisplayName } = req.body || {}
    const result = changeDisplayName({ email, currentPassword, newDisplayName })
    if (!result.ok) {
      const status = result.error === 'INVALID_CREDENTIALS' ? 401 : 400
      return res.status(status).json({ ok: false, error: result.error })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('Change display name error:', err)
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' })
  }
})

// Kto jest zalogowany – Bearer JWT (license_token). Zwraca organization_id oraz dane licencji (do okresowej weryfikacji).
app.get('/api/auth/me', (req, res) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ error: 'NO_TOKEN' })
    let decoded
    try {
      decoded = jwt.verify(token, JWT_SECRET)
    } catch {
      return res.status(401).json({ error: 'INVALID_TOKEN' })
    }
    const email = decoded.sub
    if (!email) return res.status(401).json({ error: 'INVALID_TOKEN' })
    const users = require('./store').readUsers()
    const licenses = require('./store').readLicenses()
    const user = users.find(u => (u.email || '').toLowerCase() === String(email).toLowerCase())
    if (!user || user.disabled) return res.status(401).json({ error: 'USER_NOT_FOUND' })
    const userLicenses = licenses.filter(l => l.user_id === user.id).sort((a, b) => (a.expires_at && b.expires_at) ? new Date(b.expires_at) - new Date(a.expires_at) : (a.expires_at ? 1 : -1))
    const active = userLicenses[0]
    const license_valid = !!(active && (active.expires_at == null || new Date(active.expires_at) > new Date()))
    const license_plan = active?.plan || 'darmowa'
    const license_expires_at = active?.expires_at ?? null
    const licensePayload = { sub: user.email, valid: license_valid, expires_at: license_expires_at, plan: license_plan }
    const license_token = signLicenseToken(licensePayload)
    setUserLastLicenseVerification(user.id)
    res.json({
      user_id: user.id,
      email: user.email,
      organization_id: (user.organization_id || 'admin').trim() || 'admin',
      license_valid,
      license_plan,
      license_expires_at,
      license_token
    })
  } catch (err) {
    console.error('Auth me error:', err)
    res.status(500).json({ error: 'SERVER_ERROR' })
  }
})

// Sprawdzenie licencji (email w nagłówku; odpowiedź z podpisem JWT)
app.get('/api/license/check', (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.query.token
  if (!token) {
    return res.status(401).json({ valid: false, error: 'NO_TOKEN' })
  }
  const email = token
  const licenses = require('./store').readLicenses()
  const users = require('./store').readUsers()
  const user = users.find(u => (u.email || '').toLowerCase() === email.toLowerCase())
  if (!user || user.disabled) return res.status(401).json({ valid: false })
  const userLicenses = licenses.filter(l => l.user_id === user.id).sort((a, b) => (a.expires_at && b.expires_at) ? new Date(b.expires_at) - new Date(a.expires_at) : (a.expires_at ? 1 : -1))
  const active = userLicenses[0]
  const valid = active && (active.expires_at == null || new Date(active.expires_at) > new Date())
  const payload = { sub: user.email, valid, expires_at: active?.expires_at || null, plan: active?.plan || null }
  const license_token = signLicenseToken(payload)
  res.json({ valid, expires_at: active?.expires_at, plan: active?.plan || null, license_token })
})

// Komunikaty dla użytkowników aplikacji (publiczny odczyt)
app.get('/api/notices', (req, res) => {
  try {
    const notices = readNotices()
    res.json({ notices })
  } catch (err) {
    console.error('Notices error:', err)
    res.status(500).json({ notices: [] })
  }
})

// Odczyt komunikatu przez użytkownika (Bearer JWT – sub = email)
app.post('/api/notices/:id/read', (req, res) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ ok: false, error: 'NO_TOKEN' })
    let decoded
    try {
      decoded = jwt.verify(token, JWT_SECRET)
    } catch {
      return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' })
    }
    const email = decoded.sub
    if (!email) return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' })
    const users = require('./store').readUsers()
    const user = users.find(u => (u.email || '').toLowerCase() === String(email).toLowerCase())
    if (!user || user.disabled) return res.status(401).json({ ok: false, error: 'USER_NOT_FOUND' })
    const noticeId = String(req.params.id || '').trim()
    if (!noticeId) return res.status(400).json({ ok: false, error: 'INVALID_ID' })
    const notices = readNotices()
    if (!notices.some(n => n.id === noticeId)) return res.status(404).json({ ok: false, error: 'NOTICE_NOT_FOUND' })
    addNoticeRead(noticeId, user.id)
    res.json({ ok: true })
  } catch (err) {
    console.error('Notice read error:', err)
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' })
  }
})

// Panel admina – statystyki
app.get('/api/admin/stats', adminAuth, (req, res) => {
  try {
    const users = getUsersWithLicenses()
    const totalUsers = users.length
    const usersOverTime = getUsersOverTime()
    const noticeStats = getNoticeReadStats()
    res.json({ totalUsers, usersOverTime, noticeStats })
  } catch (err) {
    console.error('Admin stats error:', err)
    res.status(500).json({ error: 'SERVER_ERROR' })
  }
})

// Panel admina – wymagany klucz gdy ustawiony JOBRAVEN_ADMIN_SECRET lub ADMIN_SECRET
app.get('/api/admin/users', adminAuth, (req, res) => {
  try {
    const users = getUsersWithLicenses()
    res.json({ users })
  } catch (err) {
    console.error('Admin users error:', err)
    res.status(500).json({ error: 'SERVER_ERROR' })
  }
})

app.get('/api/admin/organizations', adminAuth, (req, res) => {
  try {
    const organizations = getOrganizationsForAdmin()
    res.json({ organizations })
  } catch (err) {
    console.error('Admin organizations error:', err)
    res.status(500).json({ error: 'SERVER_ERROR' })
  }
})

// Wysyłka maila testowego (panel admina / diagnostyka SMTP)
app.post('/api/admin/send-test-email', adminAuth, async (req, res) => {
  try {
    const to = (req.body && req.body.to) ? String(req.body.to).trim() : ''
    if (!to) return res.status(400).json({ ok: false, error: 'Podaj adres (pole to).' })
    const html = '<p>To jest test wysyłki z serwera JobRaven. Jeśli to widzisz, SMTP działa poprawnie.</p>'
    await sendMail(to, 'Test JobRaven – SMTP', html)
    res.json({ ok: true, message: 'Wysłano mail testowy na ' + to })
  } catch (err) {
    console.error('Test email error:', err)
    res.status(500).json({ ok: false, error: 'EMAIL_SEND_FAILED', detail: err.message || String(err) })
  }
})

app.get('/api/admin/notices', adminAuth, (req, res) => {
  try {
    const notices = readNotices()
    res.json({ notices })
  } catch (err) {
    console.error('Admin notices error:', err)
    res.status(500).json({ error: 'SERVER_ERROR' })
  }
})

app.post('/api/admin/notices', adminAuth, (req, res) => {
  try {
    const { title, body } = req.body || {}
    const notice = addNotice({ title, body })
    res.status(201).json({ ok: true, notice })
  } catch (err) {
    console.error('Admin add notice error:', err)
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' })
  }
})

app.patch('/api/admin/notices/:id', adminAuth, (req, res) => {
  try {
    const id = String(req.params.id || '').trim()
    if (!id) return res.status(400).json({ ok: false, error: 'INVALID_ID' })
    const { title, body } = req.body || {}
    const result = updateNotice(id, { title, body })
    if (!result.ok) return res.status(404).json({ ok: false, error: result.error })
    res.json({ ok: true, notice: result.notice })
  } catch (err) {
    console.error('Admin update notice error:', err)
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' })
  }
})

app.delete('/api/admin/notices/:id', adminAuth, (req, res) => {
  try {
    const id = String(req.params.id || '').trim()
    if (!id) return res.status(400).json({ ok: false, error: 'INVALID_ID' })
    const result = deleteNotice(id)
    if (!result.ok) return res.status(404).json({ ok: false, error: result.error })
    res.json({ ok: true })
  } catch (err) {
    console.error('Admin delete notice error:', err)
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' })
  }
})

app.patch('/api/admin/users/:id', adminAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'INVALID_ID' })
    const { disabled, license: licenseUpdate, last_license_verification_at: verificationAt } = req.body || {}
    if (disabled !== undefined) {
      const r = setUserDisabled(id, disabled)
      if (!r.ok) return res.status(404).json({ error: r.error })
    }
    if (licenseUpdate && typeof licenseUpdate === 'object') {
      const r = setUserLicense(id, licenseUpdate)
      if (!r.ok) return res.status(404).json({ error: r.error })
    }
    if (verificationAt !== undefined) {
      const iso = typeof verificationAt === 'string' && verificationAt.trim() ? verificationAt.trim() : null
      const r = setUserLastLicenseVerification(id, iso || new Date().toISOString())
      if (!r.ok) return res.status(404).json({ error: r.error })
    }
    const users = getUsersWithLicenses()
    const user = users.find(u => u.id === id)
    res.json({ ok: true, user })
  } catch (err) {
    console.error('Admin PATCH user error:', err)
    res.status(500).json({ error: 'SERVER_ERROR' })
  }
})

app.delete('/api/admin/users/:id', adminAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'INVALID_ID' })
    const r = deleteUser(id)
    if (!r.ok) return res.status(404).json({ error: r.error })
    res.json({ ok: true })
  } catch (err) {
    console.error('Admin DELETE user error:', err)
    res.status(500).json({ error: 'SERVER_ERROR' })
  }
})

// Nieobsłużone żądania API – zawsze JSON (żeby uniknąć NOT_JSON przy 404)
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', path: req.path })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`JobRaven server: nasłuch na porcie ${PORT} (0.0.0.0)`)
  console.log(`Panel admina: /admin`)
})
