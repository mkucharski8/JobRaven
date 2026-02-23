/**
 * Prosty magazyn użytkowników i licencji w pliku JSON (na razie lokalny/wirtualny).
 * W produkcji zastąpić bazą (PostgreSQL itd.).
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const DATA_DIR = process.env.JOBRAVEN_DATA_DIR || process.env.DATA_DIR || path.join(__dirname, 'data')
const USERS_FILE = path.join(DATA_DIR, 'users.json')
const LICENSES_FILE = path.join(DATA_DIR, 'licenses.json')
const ORGANIZATIONS_FILE = path.join(DATA_DIR, 'organizations.json')
const NOTICES_FILE = path.join(DATA_DIR, 'notices.json')
const NOTICE_READS_FILE = path.join(DATA_DIR, 'notice_reads.json')

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readUsers() {
  ensureDir()
  if (!fs.existsSync(USERS_FILE)) return []
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function writeUsers(users) {
  ensureDir()
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8')
}

function readLicenses() {
  ensureDir()
  if (!fs.existsSync(LICENSES_FILE)) return []
  try {
    const raw = fs.readFileSync(LICENSES_FILE, 'utf8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function writeLicenses(licenses) {
  ensureDir()
  fs.writeFileSync(LICENSES_FILE, JSON.stringify(licenses, null, 2), 'utf8')
}

function readOrganizations() {
  ensureDir()
  if (!fs.existsSync(ORGANIZATIONS_FILE)) return []
  try {
    const raw = fs.readFileSync(ORGANIZATIONS_FILE, 'utf8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function writeOrganizations(orgs) {
  ensureDir()
  fs.writeFileSync(ORGANIZATIONS_FILE, JSON.stringify(orgs, null, 2), 'utf8')
}

function readNotices() {
  ensureDir()
  if (!fs.existsSync(NOTICES_FILE)) return []
  try {
    const raw = fs.readFileSync(NOTICES_FILE, 'utf8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function writeNotices(notices) {
  ensureDir()
  fs.writeFileSync(NOTICES_FILE, JSON.stringify(notices, null, 2), 'utf8')
}

function addNotice({ title, body }) {
  const notices = readNotices()
  const id = 'n-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
  const created_at = new Date().toISOString()
  const date = created_at.slice(0, 10)
  notices.unshift({ id, title: String(title || '').trim() || 'Bez tytułu', body: String(body ?? '').trim(), date, created_at })
  writeNotices(notices)
  return { id, title: notices[0].title, body: notices[0].body, date, created_at }
}

function updateNotice(id, { title, body }) {
  const notices = readNotices()
  const idx = notices.findIndex(n => n.id === id)
  if (idx === -1) return { ok: false, error: 'NOT_FOUND' }
  if (title !== undefined) notices[idx].title = String(title).trim() || 'Bez tytułu'
  if (body !== undefined) notices[idx].body = String(body ?? '').trim()
  writeNotices(notices)
  return { ok: true, notice: notices[idx] }
}

function deleteNotice(id) {
  const notices = readNotices().filter(n => n.id !== id)
  if (notices.length === readNotices().length) return { ok: false, error: 'NOT_FOUND' }
  writeNotices(notices)
  return { ok: true }
}

function readNoticeReads() {
  ensureDir()
  if (!fs.existsSync(NOTICE_READS_FILE)) return []
  try {
    const raw = fs.readFileSync(NOTICE_READS_FILE, 'utf8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function writeNoticeReads(reads) {
  ensureDir()
  fs.writeFileSync(NOTICE_READS_FILE, JSON.stringify(reads, null, 2), 'utf8')
}

/** Zapisuje odczyt komunikatu przez użytkownika (user_id z serwera). */
function addNoticeRead(noticeId, userId) {
  const reads = readNoticeReads()
  reads.push({ notice_id: String(noticeId), user_id: userId, read_at: new Date().toISOString() })
  writeNoticeReads(reads)
  return { ok: true }
}

/** Statystyki odczytów komunikatów: dla każdego komunikatu – liczba unikalnych użytkowników i łączna liczba odczytów. */
function getNoticeReadStats() {
  const reads = readNoticeReads()
  const notices = readNotices()
  const byNotice = new Map()
  for (const r of reads) {
    const n = byNotice.get(r.notice_id) || { unique_users: new Set(), total: 0 }
    n.unique_users.add(r.user_id)
    n.total += 1
    byNotice.set(r.notice_id, n)
  }
  return notices.map(n => ({
    id: n.id,
    title: n.title || '—',
    date: n.date || n.created_at || '',
    unique_readers: (byNotice.get(n.id)?.unique_users?.size ?? 0),
    total_reads: (byNotice.get(n.id)?.total ?? 0)
  }))
}

/** Liczba użytkowników w czasie (punkty dzienne od najstarszej rejestracji). */
function getUsersOverTime() {
  const users = readUsers()
  const withDate = users
    .map(u => ({ created_at: u.created_at }))
    .filter(u => u.created_at)
  if (withDate.length === 0) return []
  const byDay = new Map()
  for (const u of withDate) {
    const day = u.created_at.slice(0, 10)
    byDay.set(day, (byDay.get(day) || 0) + 1)
  }
  const sorted = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  let cum = 0
  return sorted.map(([date, count]) => {
    cum += count
    return { date, count: cum }
  })
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

function verifyPassword(password, packedHash) {
  const parts = String(packedHash || '').split('$')
  if (parts[0] !== 'scrypt' || !parts[1] || !parts[2]) return false
  const hash = crypto.scryptSync(password, parts[1], 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(parts[2], 'hex'))
}

function nextId(users) {
  const max = users.reduce((m, u) => Math.max(m, u.id || 0), 0)
  return max + 1
}

/**
 * Rejestracja: dodaje użytkownika do pliku. Zwraca { ok, error?, user? }.
 * organizationId – organizacja przypisana do użytkownika (np. "admin").
 */
function registerUser({ email, password, displayName, organizationId }) {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized || !password || password.length < 6) {
    return { ok: false, error: 'INVALID_INPUT' }
  }
  const users = readUsers()
  if (users.some(u => (u.email || '').toLowerCase() === normalized)) {
    return { ok: false, error: 'EMAIL_TAKEN' }
  }
  const id = nextId(users)
  const orgId = String(organizationId ?? 'admin').trim() || 'admin'
  const orgs = readOrganizations()
  if (!orgs.some(o => o.id === orgId)) {
    orgs.push({ id: orgId, name: orgId })
    writeOrganizations(orgs)
  }
  const verificationToken = crypto.randomBytes(32).toString('hex')
  const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h
  const user = {
    id,
    email: normalized,
    password_hash: hashPassword(password),
    display_name: String(displayName ?? '').trim() || null,
    organization_id: orgId,
    disabled: false,
    email_verified: false,
    verification_token: verificationToken,
    verification_expires: verificationExpires,
    reset_token: null,
    reset_token_expires: null,
    created_at: new Date().toISOString()
  }
  users.push(user)
  writeUsers(users)
  const licenses = readLicenses()
  licenses.push({ user_id: id, expires_at: null, plan: 'darmowa', license_key: null, created_at: new Date().toISOString() })
  writeLicenses(licenses)
  return {
    ok: true,
    user: { id: user.id, email: user.email, display_name: user.display_name, organization_id: user.organization_id },
    verification_token: verificationToken,
    verification_expires: verificationExpires
  }
}

/**
 * Logowanie: weryfikuje hasło, zwraca { ok, error?, user?, license? }.
 */
function loginUser({ email, password }) {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized || !password) {
    return { ok: false, error: 'INVALID_INPUT' }
  }
  const users = readUsers()
  const user = users.find(u => (u.email || '').toLowerCase() === normalized)
  if (!user || !verifyPassword(password, user.password_hash)) {
    return { ok: false, error: 'INVALID_CREDENTIALS' }
  }
  if (user.disabled) {
    return { ok: false, error: 'ACCOUNT_DISABLED' }
  }
  if (user.email_verified === false) {
    return { ok: false, error: 'EMAIL_NOT_VERIFIED' }
  }
  const licenses = readLicenses()
  const active = licenses
    .filter(l => l.user_id === user.id)
    .sort((a, b) => (a.expires_at && b.expires_at) ? new Date(b.expires_at) - new Date(a.expires_at) : (a.expires_at ? 1 : -1))[0]
  const valid = active && (active.expires_at == null || new Date(active.expires_at) > new Date())
  return {
    ok: true,
    user: { id: user.id, email: user.email, display_name: user.display_name, organization_id: user.organization_id || 'admin' },
    license: active ? { valid, expires_at: active.expires_at, plan: active.plan || 'darmowa', license_key: active.license_key || null } : { valid: false }
  }
}

const REQUIRED_ORGANIZATIONS = [{ id: 'admin', name: 'admin' }, { id: 'admin2', name: 'admin2' }]

function ensureOrganizations() {
  let orgs = readOrganizations()
  const byId = new Map(orgs.map(o => [o.id, o]))
  let changed = false
  for (const o of REQUIRED_ORGANIZATIONS) {
    if (!byId.has(o.id)) {
      orgs.push(o)
      byId.set(o.id, o)
      changed = true
    }
  }
  if (changed) writeOrganizations(orgs)
  return orgs
}

/**
 * Seed: organizacje (admin, admin2), jeden użytkownik domyślny jeśli brak użytkowników.
 * Przy starcie czyści z pliku organizacje bez użytkowników.
 */
function seedIfNeeded() {
  ensureOrganizations()
  removeUnusedOrganizations()
  const orgs = readOrganizations()
  const licenses = readLicenses()
  let licenseChanged = false
  licenses.forEach(l => {
    if (l.plan === 'trial') { l.plan = 'darmowa'; licenseChanged = true }
    if (l.license_key === undefined) { l.license_key = null; licenseChanged = true }
    if (l.expires_at != null) { l.expires_at = null; licenseChanged = true }
  })
  if (licenseChanged) writeLicenses(licenses)
  if (orgs.length <= 1) {
    const target = [{ id: 'admin', name: 'admin' }, { id: 'admin2', name: 'admin2' }]
    if (orgs.length === 0) writeOrganizations(target)
    else if (!orgs.some(o => o.id === 'admin2')) writeOrganizations(target)
  }
  const users = readUsers()
  if (users.length > 0) return
  const seedUsers = [
    { id: 1, email: 'mkucharski8@gmail.com', password: '123456', display_name: 'Admin', organization_id: 'admin' },
    { id: 2, email: 'admin2@localhost', password: '123456', display_name: 'Admin 2', organization_id: 'admin2' }
  ]
  const seedLicenses = []
  for (const s of seedUsers) {
    users.push({
      id: s.id,
      email: s.email,
      password_hash: hashPassword(s.password),
      display_name: s.display_name,
      organization_id: s.organization_id,
      disabled: false,
      email_verified: true,
      verification_token: null,
      verification_expires: null,
      reset_token: null,
      reset_token_expires: null,
      created_at: new Date().toISOString()
    })
    seedLicenses.push({ user_id: s.id, expires_at: null, plan: 'darmowa', license_key: null, created_at: new Date().toISOString() })
  }
  writeUsers(users)
  writeLicenses(seedLicenses)
}

/**
 * Lista użytkowników z podsumowaniem i licencjami (dla panelu admina, bez hasła).
 */
function licenseValid(l) {
  return l.expires_at == null || new Date(l.expires_at) > new Date()
}

function getUsersWithLicenses() {
  const users = readUsers()
  const licenses = readLicenses()
  return users.map(u => {
    const userLicenses = licenses
      .filter(l => l.user_id === u.id)
      .sort((a, b) => (a.expires_at && b.expires_at) ? new Date(b.expires_at) - new Date(a.expires_at) : (a.expires_at ? 1 : -1))
    const active = userLicenses.find(l => licenseValid(l))
    const { password_hash, ...rest } = u
    return {
      ...rest,
      disabled: !!u.disabled,
      last_license_verification_at: u.last_license_verification_at ?? null,
      last_login_at: u.last_login_at ?? null,
      licenses: userLicenses.map(l => ({
        expires_at: l.expires_at,
        plan: l.plan || 'darmowa',
        license_key: l.license_key || null,
        valid: licenseValid(l)
      })),
      active_license: active ? { expires_at: active.expires_at, plan: active.plan || 'darmowa', license_key: active.license_key || null } : null
    }
  })
}

function setUserLastLicenseVerification(userId, isoDate) {
  const idNum = typeof userId === 'number' ? userId : parseInt(String(userId), 10)
  if (!Number.isFinite(idNum)) return { ok: false, error: 'USER_NOT_FOUND' }
  const users = readUsers()
  const u = users.find(x => Number(x.id) === idNum)
  if (!u) return { ok: false, error: 'USER_NOT_FOUND' }
  u.last_license_verification_at = isoDate || new Date().toISOString()
  writeUsers(users)
  return { ok: true }
}

/**
 * Zapisuje IP i lokalizację użytkownika przy rejestracji (IP, czas, opcjonalnie lokalizacja z geo po IP).
 * Wywołaj po utworzeniu konta. location można uzupełnić asynchronicznie (np. z ip-api.com).
 */
function setUserLastLogin(userId, { ip, at, location } = {}) {
  const idNum = typeof userId === 'number' ? userId : parseInt(String(userId), 10)
  if (!Number.isFinite(idNum)) return { ok: false, error: 'USER_NOT_FOUND' }
  const users = readUsers()
  const u = users.find(x => Number(x.id) === idNum)
  if (!u) return { ok: false, error: 'USER_NOT_FOUND' }
  if (ip !== undefined) u.last_login_ip = ip == null ? null : String(ip).trim() || null
  if (at !== undefined) u.last_login_at = at == null ? null : String(at).trim() || null
  if (location !== undefined) u.last_login_location = location == null ? null : String(location).trim() || null
  writeUsers(users)
  return { ok: true }
}

function setUserDisabled(userId, disabled) {
  const idNum = typeof userId === 'number' ? userId : parseInt(String(userId), 10)
  if (!Number.isFinite(idNum)) return { ok: false, error: 'USER_NOT_FOUND' }
  const users = readUsers()
  const u = users.find(x => Number(x.id) === idNum)
  if (!u) return { ok: false, error: 'USER_NOT_FOUND' }
  u.disabled = !!disabled
  writeUsers(users)
  return { ok: true }
}

function setUserLicense(userId, { plan, expires_at, license_key }) {
  const idNum = typeof userId === 'number' ? userId : parseInt(String(userId), 10)
  if (!Number.isFinite(idNum)) return { ok: false, error: 'USER_NOT_FOUND' }
  const licenses = readLicenses()
  const userLicenses = licenses.filter(l => Number(l.user_id) === idNum).sort((a, b) => (a.expires_at && b.expires_at) ? new Date(b.expires_at) - new Date(a.expires_at) : (a.expires_at ? 1 : -1))
  const target = userLicenses[0]
  const nextExpires = (val) => {
    if (val === undefined || val === null || val === '') return null
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }
  if (target) {
    if (plan !== undefined) target.plan = String(plan)
    if (expires_at !== undefined) target.expires_at = nextExpires(expires_at)
    if (license_key !== undefined) target.license_key = license_key === null || license_key === '' ? null : String(license_key)
  } else {
    const iso = nextExpires(expires_at) ?? null
    licenses.push({ user_id: idNum, expires_at: iso, plan: plan || 'darmowa', license_key: license_key === null || license_key === '' ? null : String(license_key), created_at: new Date().toISOString() })
  }
  writeLicenses(licenses)
  return { ok: true }
}

/**
 * Usuwa z pliku organizacje, które nie mają żadnego użytkownika.
 */
function removeUnusedOrganizations() {
  const users = readUsers()
  const orgIdsWithUsers = new Set()
  for (const u of users) {
    const id = (u.organization_id || '').trim()
    if (id) orgIdsWithUsers.add(id)
  }
  const orgs = readOrganizations()
  const kept = orgs.filter(o => orgIdsWithUsers.has(o.id))
  if (kept.length !== orgs.length) writeOrganizations(kept)
}

/**
 * Usuwa użytkownika (użytkownik + jego licencje + wpisy odczytów komunikatów).
 * Po usunięciu usuwa też z pliku organizacje, które nie mają już żadnego użytkownika.
 * userId może być liczbą lub stringiem (w JSON id bywa zapisane jako string).
 */
function deleteUser(userId) {
  const idNum = typeof userId === 'number' ? userId : parseInt(String(userId), 10)
  if (!Number.isFinite(idNum)) return { ok: false, error: 'INVALID_ID' }
  const users = readUsers()
  const idx = users.findIndex(u => Number(u.id) === idNum)
  if (idx === -1) return { ok: false, error: 'USER_NOT_FOUND' }
  users.splice(idx, 1)
  writeUsers(users)
  const licenses = readLicenses().filter(l => Number(l.user_id) !== idNum)
  writeLicenses(licenses)
  const reads = readNoticeReads().filter(r => Number(r.user_id) !== idNum)
  writeNoticeReads(reads)
  removeUnusedOrganizations()
  return { ok: true }
}

/**
 * Zmiana hasła (obecne hasło + nowe). Identyfikacja po emailu.
 */
function changePassword({ email, currentPassword, newPassword }) {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized || !currentPassword || !newPassword || newPassword.length < 6) {
    return { ok: false, error: 'INVALID_INPUT' }
  }
  const users = readUsers()
  const user = users.find(u => (u.email || '').toLowerCase() === normalized)
  if (!user) return { ok: false, error: 'USER_NOT_FOUND' }
  if (!verifyPassword(currentPassword, user.password_hash)) return { ok: false, error: 'INVALID_CREDENTIALS' }
  user.password_hash = hashPassword(newPassword)
  writeUsers(users)
  return { ok: true }
}

/**
 * Zmiana loginu (nazwy wyświetlanej, display_name). Wymaga obecnego hasła. Identyfikacja po emailu.
 */
function changeDisplayName({ email, currentPassword, newDisplayName }) {
  const normalized = String(email || '').trim().toLowerCase()
  const newName = String(newDisplayName ?? '').trim() || null
  if (!normalized || !currentPassword) {
    return { ok: false, error: 'INVALID_INPUT' }
  }
  const users = readUsers()
  const user = users.find(u => (u.email || '').toLowerCase() === normalized)
  if (!user) return { ok: false, error: 'USER_NOT_FOUND' }
  if (!verifyPassword(currentPassword, user.password_hash)) return { ok: false, error: 'INVALID_CREDENTIALS' }
  user.display_name = newName
  writeUsers(users)
  return { ok: true }
}

/**
 * Weryfikacja e-maila po tokenie z linku. Zwraca { ok, error? }.
 */
function verifyEmail(token) {
  if (!token || typeof token !== 'string') return { ok: false, error: 'INVALID_TOKEN' }
  const users = readUsers()
  const u = users.find(x => x.verification_token === token)
  if (!u) return { ok: false, error: 'INVALID_TOKEN' }
  if (u.verification_expires && new Date(u.verification_expires) < new Date()) return { ok: false, error: 'TOKEN_EXPIRED' }
  u.email_verified = true
  u.verification_token = null
  u.verification_expires = null
  writeUsers(users)
  return { ok: true }
}

/**
 * Wyślij ponownie link weryfikacyjny. Zwraca { ok, error?, verification_token?, verification_expires? }.
 */
function resendVerificationEmail(email) {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) return { ok: false, error: 'INVALID_INPUT' }
  const users = readUsers()
  const u = users.find(x => (x.email || '').toLowerCase() === normalized)
  if (!u) return { ok: false, error: 'USER_NOT_FOUND' }
  if (u.email_verified !== false) return { ok: false, error: 'ALREADY_VERIFIED' }
  const verificationToken = crypto.randomBytes(32).toString('hex')
  const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  u.verification_token = verificationToken
  u.verification_expires = verificationExpires
  writeUsers(users)
  return { ok: true, verification_token: verificationToken, verification_expires: verificationExpires }
}

/**
 * Utworzenie tokenu resetu hasła. Zwraca { ok, error?, reset_token?, reset_token_expires? }.
 */
function createPasswordResetToken(email) {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) return { ok: false, error: 'INVALID_INPUT' }
  const users = readUsers()
  const u = users.find(x => (x.email || '').toLowerCase() === normalized)
  if (!u) return { ok: false, error: 'USER_NOT_FOUND' }
  if (u.disabled) return { ok: false, error: 'ACCOUNT_DISABLED' }
  const resetToken = crypto.randomBytes(32).toString('hex')
  const resetExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1h
  u.reset_token = resetToken
  u.reset_token_expires = resetExpires
  writeUsers(users)
  return { ok: true, reset_token: resetToken, reset_token_expires: resetExpires }
}

/**
 * Ustawienie nowego hasła na podstawie tokenu resetu. Zwraca { ok, error? }.
 */
function resetPasswordWithToken(token, newPassword) {
  if (!token || typeof token !== 'string') return { ok: false, error: 'INVALID_TOKEN' }
  if (!newPassword || newPassword.length < 6) return { ok: false, error: 'INVALID_INPUT' }
  const users = readUsers()
  const u = users.find(x => x.reset_token === token)
  if (!u) return { ok: false, error: 'INVALID_TOKEN' }
  if (u.reset_token_expires && new Date(u.reset_token_expires) < new Date()) return { ok: false, error: 'TOKEN_EXPIRED' }
  u.password_hash = hashPassword(newPassword)
  u.reset_token = null
  u.reset_token_expires = null
  writeUsers(users)
  return { ok: true }
}

/**
 * Lista organizacji do panelu: tylko te, które mają co najmniej jednego użytkownika.
 * Źródła: plik organizations.json + organization_id użytkowników, potem filtracja.
 */
function getOrganizationsForAdmin() {
  const orgs = readOrganizations()
  const byId = new Map(orgs.map(o => [o.id, o]))
  const users = readUsers()
  const orgIdsWithUsers = new Set()
  for (const u of users) {
    const id = (u.organization_id || '').trim()
    if (id) {
      orgIdsWithUsers.add(id)
      if (!byId.has(id)) byId.set(id, { id, name: id })
    }
  }
  return Array.from(byId.values()).filter(o => orgIdsWithUsers.has(o.id))
}

module.exports = {
  readUsers,
  writeUsers,
  readLicenses,
  writeLicenses,
  readOrganizations,
  writeOrganizations,
  ensureOrganizations,
  removeUnusedOrganizations,
  getOrganizationsForAdmin,
  registerUser,
  loginUser,
  changePassword,
  changeDisplayName,
  seedIfNeeded,
  getUsersWithLicenses,
  setUserLastLicenseVerification,
  setUserLastLogin,
  setUserDisabled,
  setUserLicense,
  deleteUser,
  verifyEmail,
  resendVerificationEmail,
  createPasswordResetToken,
  resetPasswordWithToken,
  readNotices,
  addNotice,
  updateNotice,
  deleteNotice,
  addNoticeRead,
  getNoticeReadStats,
  getUsersOverTime
}
