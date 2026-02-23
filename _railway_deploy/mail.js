/**
 * Wysyłka e-maili (weryfikacja, reset hasła).
 * Na Railway używaj Mailgun API (HTTPS) – porty SMTP 587/465 są blokowane na planach Free/Hobby.
 * Lokalnie możesz używać SMTP (np. dpoczta.pl) lub Mailgun API.
 */
const nodemailer = require('nodemailer')

const MAIL_FROM = process.env.MAIL_FROM || process.env.JOBRAVEN_MAIL_FROM || 'noreply@jobraven.local'
const BASE_URL = process.env.BASE_URL || process.env.JOBRAVEN_BASE_URL || 'http://localhost:3000'

// Mailgun API (HTTPS) – działa na Railway; nie wymaga portów SMTP
const MAILGUN_API_KEY_RAW = (process.env.MAILGUN_API_KEY || process.env.JOBRAVEN_MAILGUN_API_KEY || '').trim()
// Nowe klucze Mailgun mają format z myślnikami (np. xxx-xxxxxxxx-xxxxxxxx) – używaj as-is. Stare klucze (krótki hex) dopisz key-.
const MAILGUN_API_KEY = MAILGUN_API_KEY_RAW
  ? (MAILGUN_API_KEY_RAW.startsWith('key-') || MAILGUN_API_KEY_RAW.includes('-')
    ? MAILGUN_API_KEY_RAW
    : 'key-' + MAILGUN_API_KEY_RAW)
  : ''
const MAILGUN_DOMAIN = (process.env.MAILGUN_DOMAIN || process.env.JOBRAVEN_MAILGUN_DOMAIN || '').trim()
const useMailgunApi = !!(MAILGUN_API_KEY && MAILGUN_DOMAIN)

const SMTP_HOST_RAW = process.env.SMTP_HOST || process.env.JOBRAVEN_SMTP_HOST
const SMTP_HOST = typeof SMTP_HOST_RAW === 'string' ? SMTP_HOST_RAW.replace(/:[\d]+$/, '').trim() : ''
const SMTP_PORT = parseInt(process.env.SMTP_PORT || process.env.JOBRAVEN_SMTP_PORT || '587', 10)
const SMTP_SECURE = process.env.SMTP_SECURE === '1' || process.env.SMTP_SECURE === 'true'
const SMTP_USER = process.env.SMTP_USER || process.env.JOBRAVEN_SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS || process.env.JOBRAVEN_SMTP_PASS
const SMTP_INSECURE = process.env.JOBRAVEN_SMTP_INSECURE === '1' || process.env.SMTP_INSECURE === '1'

let transporter = null
if (!useMailgunApi && SMTP_HOST && SMTP_USER && SMTP_PASS) {
  const isPort587 = SMTP_PORT === 587
  transporter = nodemailer.createTransport({
    host: SMTP_HOST.trim(),
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    requireTLS: isPort587,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { rejectUnauthorized: !SMTP_INSECURE }
  })
  console.log('[Mail] SMTP skonfigurowany:', SMTP_HOST + ':' + SMTP_PORT)
} else if (useMailgunApi) {
  console.log('[Mail] Mailgun API skonfigurowany (domena:', MAILGUN_DOMAIN + ')')
} else {
  console.log('[Mail] Mail nie skonfigurowany – linki będą w konsoli serwera')
}

const MAIL_SEND_TIMEOUT_MS = 20000

async function sendMailViaMailgunApi(to, subject, html, text) {
  const url = `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`
  const auth = Buffer.from('api:' + MAILGUN_API_KEY).toString('base64')
  const textBody = text || (html ? html.replace(/<[^>]+>/g, ' ').trim() : '')
  const params = new URLSearchParams()
  params.set('from', MAIL_FROM)
  params.set('to', to)
  params.set('subject', subject)
  params.set('text', textBody)
  if (html) params.set('html', html)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), MAIL_SEND_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + auth,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString(),
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    const body = await res.text()
    if (!res.ok) {
      const err = new Error(body || res.statusText || 'Mailgun API error')
      err.code = 'MAILGUN_API_ERROR'
      err.status = res.status
      err.response = body.slice(0, 300)
      throw err
    }
  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') throw new Error('SMTP_TIMEOUT')
    throw err
  }
}

async function sendMail(to, subject, html, text) {
  if (useMailgunApi) {
    try {
      await sendMailViaMailgunApi(to, subject, html, text)
      return
    } catch (err) {
      console.error('[Mail] Błąd wysyłki (Mailgun API):', err && err.message || err)
      throw err
    }
  }
  if (transporter) {
    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SMTP_TIMEOUT')), MAIL_SEND_TIMEOUT_MS)
      )
      await Promise.race([
        transporter.sendMail({
          from: MAIL_FROM,
          to,
          subject,
          html: html || text,
          text: text || (html ? html.replace(/<[^>]+>/g, ' ').trim() : '')
        }),
        timeout
      ])
      return
    } catch (err) {
      console.error('[Mail] Błąd wysyłki:', err && err.message || err)
      throw err
    }
  }
  console.log('[Mail] Mail nie skonfigurowany – nie wysłano do:', to, '| Subject:', subject)
  const extractLinks = (h) => {
    const m = (h || '').match(/href="([^"]+)"/g)
    return m ? m.map(x => x.replace(/href="|"/g, '')) : []
  }
  const links = extractLinks(html)
  if (links.length) console.log('[Mail] Link (tylko w konsoli):', links[0])
  const err = new Error('SMTP_NOT_CONFIGURED')
  err.code = 'SMTP_NOT_CONFIGURED'
  throw err
}

function verificationLink(token, lang) {
  const l = (lang === 'en' || lang === 'pl') ? lang : 'pl'
  return `${BASE_URL}/verify-email?token=${encodeURIComponent(token)}&lang=${l}`
}

function resetPasswordLink(token, lang) {
  const l = (lang === 'en' || lang === 'pl') ? lang : 'pl'
  return `${BASE_URL}/reset-password?token=${encodeURIComponent(token)}&lang=${l}`
}

async function verifyMailgunApi() {
  const url = 'https://api.mailgun.net/v3/domains'
  const auth = Buffer.from('api:' + MAILGUN_API_KEY).toString('base64')
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: 'Basic ' + auth },
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    const body = await res.text()
    if (res.ok) return { ok: true }
    return { ok: false, error: body || res.statusText, code: res.status, response: body.slice(0, 200) }
  } catch (err) {
    clearTimeout(timeoutId)
    const msg = err.name === 'AbortError' ? 'Timeout' : (err.message || String(err))
    console.error('[Mail] Mailgun API verify failed:', msg)
    return { ok: false, error: msg }
  }
}

function verifySmtpConnection() {
  if (useMailgunApi) return verifyMailgunApi()
  if (!transporter) return Promise.resolve({ ok: false, error: 'SMTP_NOT_CONFIGURED' })
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ ok: false, error: 'SMTP_TIMEOUT' })
    }, 15000)
    transporter.verify((err) => {
      clearTimeout(timeout)
      if (err) {
        const msg = err.message || String(err)
        const code = err.code || err.responseCode
        const response = err.response
        console.error('[Mail] verify failed:', msg, code || '', response || '')
        resolve({ ok: false, error: msg, code: code || undefined, response: response ? String(response).slice(0, 200) : undefined })
      } else resolve({ ok: true })
    })
  })
}

module.exports = { sendMail, verificationLink, resetPasswordLink, BASE_URL, verifySmtpConnection }
