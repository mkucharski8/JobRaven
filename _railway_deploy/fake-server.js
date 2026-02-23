/**
 * Fałszywy serwer auth – zwraca 200 i token JWT podpisany INNYM sekretem.
 * Aplikacja przy weryfikacji JWT (prawidłowy sekret) odrzuci token i nie zaloguje użytkownika.
 * Uruchom: node server/fake-server.js   (port 3001)
 * Aplikację uruchom z: set JOBRAVEN_SERVER_URL=http://localhost:3001  (Windows) lub JOBRAVEN_SERVER_URL=http://localhost:3001 npm run electron (cross-env)
 */
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')

const app = express()
const PORT = 3001
const FAKE_JWT_SECRET = 'fake-server-wrong-secret'

app.use(cors())
app.use(express.json())

app.post('/api/auth/login', (req, res) => {
  const { email } = req.body || {}
  const license_token = jwt.sign(
    { sub: email || 'fake@test.com', valid: true, expires_at: null, plan: 'pro' },
    FAKE_JWT_SECRET,
    { expiresIn: '1h' }
  )
  res.json({
    ok: true,
    user: { email: email || 'fake@test.com', display_name: 'Fake User' },
    license: { valid: true },
    license_token
  })
})

app.listen(PORT, () => {
  console.log(`[FAKE SERVER] Nasłuch na http://localhost:${PORT} – zwraca token z innym sekretem (logowanie powinno się nie udać).`)
})
