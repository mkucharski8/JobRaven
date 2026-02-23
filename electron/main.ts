import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import jwt from 'jsonwebtoken'
import { autoUpdater } from 'electron-updater'
import * as XLSX from 'xlsx'
import { initDb, linkDatabaseFileToCurrentSession, dbApi, getDbSchemaVersion, getUnitsServicesPresetData, loadPresetFromFile, applyPresetData, clearUnitsServicesCategories, verifyCurrentUserPassword, ensurePredefinedSettings } from './db'
import { fetchCompanyByNip } from './gusApi'
import { writeOrderConfirmationPdfToFile, writeOrderConfirmationPdfForSubcontractToFile } from './orderConfirmationPdf'
import { writeInvoicePdfToFile, writeInvoicePdfMultiToFile } from './invoicePdf'
import { writeOrderBookPdfToBuffer } from './orderBookPdf'
import { createInvoiceFromOrder, listCompanyAccounts as wfirmaListCompanyAccounts, testConnection as wfirmaTestConnection, findInvoiceIdByFullNumber, downloadInvoicePdf } from './wfirmaApi'
import { getOrderValue, type ExportColumn } from './exportOrderBook'
import { AUTH_SERVER_DEFAULT } from './build-config.generated'

const EU_COUNTRY_CODES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE'
])

function normalizeCountryCode(v: unknown): string | null {
  const s = String(v ?? '').trim().toUpperCase()
  return s || null
}

function getClientVatSegment(
  client: { client_kind?: unknown; country_code?: unknown; vat_eu?: unknown },
  taxpayerCountryCode?: string | null
): 'company_domestic' | 'company_eu' | 'company_world' | 'person_domestic' | 'person_eu' | 'person_world' {
  const isCompany = String(client.client_kind ?? 'company').toLowerCase() !== 'person'
  const cc = normalizeCountryCode(client.country_code)
  const taxpayer = normalizeCountryCode(taxpayerCountryCode)
  const domestic = !!cc && !!taxpayer && cc === taxpayer
  const clientInEu = !!cc && EU_COUNTRY_CODES.has(cc) || Number(client.vat_eu ?? 0) === 1
  if (domestic) return isCompany ? 'company_domestic' : 'person_domestic'
  if (clientInEu) return isCompany ? 'company_eu' : 'person_eu'
  return isCompany ? 'company_world' : 'person_world'
}

function resolveVatRuleForOrder(
  order: Record<string, unknown>,
  client: Record<string, unknown> | null,
  taxpayerCountryCode?: string | null
): Record<string, unknown> {
  if (!client) return order
  const serviceId = Number(order.service_id)
  if (!Number.isFinite(serviceId) || serviceId <= 0) return order
  const rules = dbApi.serviceVatRules.listByService(serviceId) as Array<{
    client_segment: string
    country_code?: string | null
    value_type: 'rate' | 'code'
    rate_value?: number | null
    code_value?: string | null
  }>
  if (!Array.isArray(rules) || rules.length === 0) return order
  const seg = getClientVatSegment(client, taxpayerCountryCode)
  const clientCc = normalizeCountryCode(client.country_code)
  const exact = clientCc
    ? rules.find(r => r.client_segment === seg && normalizeCountryCode(r.country_code) === clientCc)
    : undefined
  const base = rules.find(r => r.client_segment === seg && !normalizeCountryCode(r.country_code))
  const resolved = exact ?? base
  if (!resolved) return order
  if (resolved.value_type === 'code') {
    return { ...order, order_vat_code: resolved.code_value ?? null, order_vat_rate: 0 }
  }
  if (resolved.value_type === 'rate' && resolved.rate_value != null) {
    return { ...order, order_vat_code: null, order_vat_rate: resolved.rate_value }
  }
  return order
}

/** PDFKit szuka fontów w __dirname/data (Helvetica.afm). Faktury używają NotoSans (PL). Kopiujemy oba z node_modules jeśli brakuje. */
function ensurePdfKitData(): void {
  const dataDir = path.join(__dirname, 'data')
  const rootCandidates = [
    path.join(__dirname, '..'),
    process.cwd()
  ]

  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

    if (!fs.existsSync(path.join(dataDir, 'Helvetica.afm'))) {
      const pdfkitData = rootCandidates
        .map((root) => path.join(root, 'node_modules', 'pdfkit', 'js', 'data'))
        .find((d) => fs.existsSync(path.join(d, 'Helvetica.afm')))
      if (pdfkitData) {
        for (const name of fs.readdirSync(pdfkitData)) {
          const srcFile = path.join(pdfkitData, name)
          if (fs.statSync(srcFile).isFile()) fs.copyFileSync(srcFile, path.join(dataDir, name))
        }
      }
    }

    if (!fs.existsSync(path.join(dataDir, 'NotoSans-Regular.ttf'))) {
      const notoSansFonts = rootCandidates
        .map((root) => path.join(root, 'node_modules', 'notosans-fontface', 'fonts'))
        .find((d) => fs.existsSync(path.join(d, 'NotoSans-Regular.ttf')))
      if (notoSansFonts) {
        for (const name of ['NotoSans-Regular.ttf', 'NotoSans-Bold.ttf']) {
          const src = path.join(notoSansFonts, name)
          if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dataDir, name))
        }
      }
    }
  } catch (_) { /* ignore */ }
}

// Lokalizacja danych: przy pierwszym uruchomieniu pytamy użytkownika; wybór w bootstrap (LocalAppData)
let needDataFolderPicker = false
if (process.platform === 'win32') {
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local')
  const bootstrapDir = path.join(localAppData, 'JobRaven')
  const dataPathFile = path.join(bootstrapDir, 'data-path.json')
  try {
    fs.mkdirSync(bootstrapDir, { recursive: true })
  } catch { /* nop */ }
  let userDataDir = bootstrapDir
  try {
    if (fs.existsSync(dataPathFile)) {
      const raw = fs.readFileSync(dataPathFile, 'utf8')
      const obj = JSON.parse(raw) as { path?: string }
      const p = typeof obj?.path === 'string' ? obj.path.trim() : ''
      if (p && fs.existsSync(p)) userDataDir = p
      else needDataFolderPicker = true
    } else {
      needDataFolderPicker = true
    }
  } catch {
    needDataFolderPicker = true
  }
  const sessionDataPath = path.join(bootstrapDir, 'session')
  const chromiumCachePath = path.join(bootstrapDir, 'Cache')
  try {
    fs.mkdirSync(sessionDataPath, { recursive: true })
    fs.mkdirSync(chromiumCachePath, { recursive: true })
  } catch { /* nop */ }
  app.setPath('userData', userDataDir)
  app.setPath('sessionData', sessionDataPath)
  app.commandLine.appendSwitch('disk-cache-dir', chromiumCachePath)
  app.disableHardwareAcceleration()
}

// Tylko jedna instancja aplikacji – drugie uruchomienie pokaże istniejące okno zamiast otwierać nowe.
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

let mainWindow: BrowserWindow | null = null

type AuthMetaOrg = { id: string; name: string; db_file: string }
/** Sesja po logowaniu – dane z serwera; last_verified_at do okresowej weryfikacji licencji (6/7 dni offline). */
type AuthMetaSession = {
  user_id: number; org_id: string; email: string; display_name: string | null; role: string; license_token?: string
  license_plan?: string; license_valid?: boolean; license_expires_at?: string | null; last_verified_at?: string
} | null

const LICENSE_VERIFICATION_DAYS = 7
const LICENSE_WARNING_DAYS = 6
/** Interwał weryfikacji licencji w sesji: 7 dni. */
const LICENSE_CHECK_INTERVAL_SECONDS = 7 * 24 * 60 * 60 // 7 dni

function isPaidPlan(plan: string | undefined): boolean {
  const p = (plan || '').trim().toLowerCase()
  return p !== '' && p !== 'darmowa'
}

function getDaysSinceVerified(lastVerifiedAt: string | undefined): number {
  if (!lastVerifiedAt) return Infinity
  const t = new Date(lastVerifiedAt).getTime()
  if (!Number.isFinite(t)) return Infinity
  return (Date.now() - t) / (24 * 60 * 60 * 1000)
}
type AuthMeta = {
  session: AuthMetaSession
  organizations: AuthMetaOrg[]
}

function authMetaPath(): string {
  return path.join(app.getPath('userData'), 'auth-meta.json')
}

/** Normalize organization name to a safe id (for db file name etc.). */
function slugOrgId(name: string): string {
  const s = String(name ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  return s || 'org'
}

/** Nie tworzymy lokalnych użytkowników – tylko pusta meta; logowanie wyłącznie przez serwer. */
function seedAuthMetaIfNeeded() {
  const p = authMetaPath()
  if (fs.existsSync(p)) return
  const meta: AuthMeta = {
    session: null,
    organizations: []
  }
  fs.writeFileSync(p, JSON.stringify(meta, null, 2), 'utf8')
}

function readAuthMeta(): AuthMeta {
  const p = authMetaPath()
  try {
    const raw = fs.readFileSync(p, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const s = parsed.session
    const session = s && typeof s === 'object' && s !== null && 'user_id' in s && 'org_id' in s && 'email' in s
      ? (s as AuthMetaSession)
      : null
    const organizations = Array.isArray(parsed.organizations) ? (parsed.organizations as AuthMetaOrg[]) : []
    return { session, organizations }
  } catch {
    return { session: null, organizations: [] }
  }
}

function writeAuthMeta(meta: AuthMeta) {
  fs.writeFileSync(authMetaPath(), JSON.stringify(meta, null, 2), 'utf8')
}

function setCurrentOrgDbFileFromMeta() {
  const meta = readAuthMeta()
  const currentOrgId = meta.session?.org_id
  const currentOrg = meta.organizations.find(o => o.id === currentOrgId) ?? meta.organizations[0]
  process.env.JOBRAVEN_DB_FILE = currentOrg?.db_file ?? 'jobraven.db'
}

function getAppIconPath(): string | undefined {
  const root = path.join(__dirname, '..')
  const platform = process.platform
  // Prefer generated assets/icons (from npm run icons:generate)
  if (platform === 'win32') {
    const winIco = path.join(root, 'assets', 'icons', 'icons', 'win', 'icon.ico')
    const winIcoAlt = path.join(root, 'assets', 'icons', 'win', 'icon.ico')
    if (fs.existsSync(winIco)) return winIco
    if (fs.existsSync(winIcoAlt)) return winIcoAlt
  }
  if (platform === 'linux') {
    const linuxPng = path.join(root, 'assets', 'icons', 'icons', 'png', '1024x1024.png')
    const linuxPngAlt = path.join(root, 'assets', 'icons', 'png', '1024x1024.png')
    if (fs.existsSync(linuxPng)) return linuxPng
    if (fs.existsSync(linuxPngAlt)) return linuxPngAlt
  }
  if (platform === 'darwin') {
    const macIcns = path.join(root, 'assets', 'icons', 'icons', 'mac', 'icon.icns')
    const macIcnsAlt = path.join(root, 'assets', 'icons', 'mac', 'icon.icns')
    if (fs.existsSync(macIcns)) return macIcns
    if (fs.existsSync(macIcnsAlt)) return macIcnsAlt
  }
  // Fallback: build/icon.ico (from prepare-icons) or landing PNGs
  const buildIco = path.join(root, 'build', 'icon.ico')
  const pngNoText = path.join(root, 'server', 'public', 'landing', 'logo_trans_no_text.png')
  const pngWithText = path.join(root, 'server', 'public', 'landing', 'logo_trans.png')
  if (fs.existsSync(buildIco)) return buildIco
  if (fs.existsSync(pngNoText)) return pngNoText
  if (fs.existsSync(pngWithText)) return pngWithText
  return undefined
}

function createWindow() {
  const iconPath = getAppIconPath()
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
  if (!app.isPackaged) {
    mainWindow.loadURL(devServerUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(async () => {
  if (needDataFolderPicker) {
    const { filePaths } = await dialog.showOpenDialog(null!, {
      title: 'Wybierz folder na dane aplikacji',
      message: 'Tutaj będą przechowywane baza danych i ustawienia. Możesz później kopiować ten folder (backup).',
      properties: ['openDirectory', 'createDirectory']
    })
    if (!filePaths?.length) {
      app.quit()
      return
    }
    const chosen = filePaths[0]
    try {
      fs.mkdirSync(chosen, { recursive: true })
    } catch { /* nop */ }
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local')
    const bootstrapDir = path.join(localAppData, 'JobRaven')
    fs.writeFileSync(path.join(bootstrapDir, 'data-path.json'), JSON.stringify({ path: chosen }), 'utf8')
    dialog.showMessageBox(null!, {
      type: 'info',
      title: 'Lokalizacja zapisana',
      message: 'Zamknij aplikację i uruchom ją ponownie, żeby korzystać z wybranego folderu z danymi.'
    }).then(() => app.quit())
    return
  }
  ensurePdfKitData()
  seedAuthMetaIfNeeded()
  let meta = readAuthMeta()
  if (meta.session?.license_token) {
    try {
      const base = getAuthServerUrl()
      const res = await fetch(`${base}/api/auth/me`, {
        headers: { Authorization: `Bearer ${meta.session.license_token}` }
      })
      const data = await res.json().catch(() => ({})) as {
        error?: string; organization_id?: string
        license_valid?: boolean; license_plan?: string; license_expires_at?: string | null; license_token?: string
      }
      if (res.ok && data.organization_id != null) {
        const serverOrgId = String(data.organization_id).trim() || 'admin'
        const nowIso = new Date().toISOString()
        const updatedSession = {
          ...meta.session,
          org_id: serverOrgId,
          license_token: typeof data.license_token === 'string' ? data.license_token : meta.session.license_token,
          license_plan: data.license_plan ?? meta.session.license_plan,
          license_valid: data.license_valid ?? meta.session.license_valid,
          license_expires_at: data.license_expires_at !== undefined ? data.license_expires_at : meta.session.license_expires_at,
          last_verified_at: nowIso
        }
        if (meta.session.org_id !== serverOrgId) {
          const dbFile = serverOrgId === 'admin' ? 'jobraven.db' : `jobraven_${slugOrgId(serverOrgId)}.db`
          meta = { session: updatedSession, organizations: [{ id: serverOrgId, name: serverOrgId, db_file: dbFile }] }
        } else {
          meta = { ...meta, session: updatedSession }
        }
        writeAuthMeta(meta)
      } else if (res.status === 401) {
        writeAuthMeta({ session: null, organizations: [] })
        meta = { session: null, organizations: [] }
      }
    } catch {
      /* offline lub błąd sieci – zostawiamy bieżącą meta */
    }
  }

  setCurrentOrgDbFileFromMeta()
  process.env.JOBRAVEN_ORG_ID = meta.session?.org_id ?? 'admin'
  process.env.JOBRAVEN_USER_ID = meta.session?.user_id != null ? String(meta.session.user_id) : ''
  try {
    await initDb()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'DB_ORGANIZATION_MISMATCH') {
      await dialog.showMessageBox(null!, {
        type: 'error',
        title: 'Nieprawidłowa baza danych',
        message: 'Ta baza danych należy do innej organizacji lub użytkownika. Przywróć właściwy plik bazy lub zaloguj się na właściwe konto.',
        noLink: true
      })
      app.quit()
      return
    }
    if (msg === 'DB_NOT_LINKED') {
      const orgId = process.env.JOBRAVEN_ORG_ID || 'admin'
      const userId = process.env.JOBRAVEN_USER_ID || ''
      const { response } = await dialog.showMessageBox(null!, {
        type: 'warning',
        title: 'Baza nie jest powiązana',
        message: `Ta baza danych nie jest powiązana z żadną organizacją ani użytkownikiem. Czy powiązać ją z bieżącym kontem (organizacja: ${orgId}${userId ? `, użytkownik: ${userId}` : ''})? Po powiązaniu tylko to konto będzie mogło z niej korzystać.`,
        buttons: ['Anuluj i zamknij', 'Powiąż z bieżącym kontem i uruchom ponownie'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      })
      if (response === 1) {
        try {
          await linkDatabaseFileToCurrentSession()
          app.relaunch()
          app.quit()
          return
        } catch (linkErr) {
          console.error('linkDatabaseFileToCurrentSession:', linkErr)
          await dialog.showMessageBox(null!, {
            type: 'error',
            title: 'Błąd',
            message: 'Nie udało się zapisać powiązania bazy. Sprawdź uprawnienia do pliku.',
            noLink: true
          })
          app.quit()
          return
        }
      }
      app.quit()
      return
    }
    throw err
  }
  registerIpcHandlers()
  logAuthServerUrl()
  createWindow()
  if (app.isPackaged) setupAutoUpdater()
})

let updaterUpdateAvailable = false
let updateAvailableVersion: string | null = null

const PENDING_UPDATE_FILE = 'pending_update.json'

function getPendingUpdatePath(): string {
  return path.join(app.getPath('userData'), PENDING_UPDATE_FILE)
}

function writePendingUpdateVersion(version: string | null): void {
  try {
    const p = getPendingUpdatePath()
    if (version == null || version === '') {
      if (fs.existsSync(p)) fs.unlinkSync(p)
      return
    }
    fs.writeFileSync(p, JSON.stringify({ version }, null, 2), 'utf8')
  } catch (e) {
    console.warn('[JobRaven] writePendingUpdateVersion:', e)
  }
}

function readPendingUpdateVersion(): string | null {
  try {
    const p = getPendingUpdatePath()
    if (!fs.existsSync(p)) return null
    const raw = fs.readFileSync(p, 'utf8')
    const parsed = JSON.parse(raw) as { version?: string }
    return typeof parsed.version === 'string' ? parsed.version : null
  } catch {
    return null
  }
}

function sendUpdateStatus(): void {
  mainWindow?.webContents?.send('jobraven:update-status', {
    updateAvailable: updaterUpdateAvailable,
    updateAvailableVersion: updateAvailableVersion ?? undefined
  })
}

/** Porównanie wersji semver (uproszczone): zwraca true jeśli a < b. */
function isVersionLess(a: string, b: string): boolean {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0
    const vb = pb[i] ?? 0
    if (va < vb) return true
    if (va > vb) return false
  }
  return false
}

/** Auto-update: nie pobieramy w tle; przy dostępnej aktualizacji wymuszamy pobranie i przy następnym starcie blokujemy logowanie. */
function setupAutoUpdater(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.on('update-available', (info: { version?: string }) => {
    const ver = typeof info.version === 'string' ? info.version : app.getVersion()
    updaterUpdateAvailable = true
    updateAvailableVersion = ver
    writePendingUpdateVersion(ver)
    writeAuthMeta({ session: null, organizations: [] })
    mainWindow?.webContents?.send('jobraven:session-cleared')
    mainWindow?.webContents?.send('jobraven:update-required', { version: ver })
    sendUpdateStatus()
  })
  autoUpdater.on('update-not-available', () => {
    updaterUpdateAvailable = false
    updateAvailableVersion = null
    writePendingUpdateVersion(null)
    sendUpdateStatus()
  })
  autoUpdater.on('error', (err) => {
    console.warn('[JobRaven] Auto-update check failed:', err.message)
  })
  // Sprawdzenie od razu po starcie (w tle)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 12_000)
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 60 * 60 * 1000)
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 4 * 60 * 60 * 1000)
}

/** Jeśli jest zapisana wymagana aktualizacja i bieżąca wersja jest starsza – zwraca wersję do zainstalowania. */
function getRequiredUpdateVersion(): string | null {
  const pending = readPendingUpdateVersion()
  if (!pending) return null
  const current = app.getVersion()
  if (!isVersionLess(current, pending)) {
    writePendingUpdateVersion(null)
    return null
  }
  return pending
}

/** Szybkie sprawdzenie, czy jest dostęp do sieci (GitHub). Gdy brak – nie blokujemy logowania. */
async function canReachUpdateServer(): Promise<boolean> {
  try {
    const res = await fetch('https://api.github.com/repos/mkucharski8/JobRaven/releases/latest', {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000)
    })
    return res.ok
  } catch {
    return false
  }
}

function getAuthServerUrl(): string {
  try {
    const fromEnv = process.env.JOBRAVEN_SERVER_URL ?? process.env.AUTH_SERVER_URL
    if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim().replace(/\/+$/, '')
  } catch { /* nop */ }
  return AUTH_SERVER_DEFAULT
}

function logAuthServerUrl(): void {
  try {
    console.log('[JobRaven] Auth server URL:', getAuthServerUrl())
  } catch { /* nop */ }
}

async function registerOnServer(email: string, password: string, displayName?: string | null, organizationId?: string, lang?: string): Promise<{ ok: boolean; error?: string; message?: string; user?: ServerUser }> {
  const base = getAuthServerUrl()
  try {
    const res = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName: displayName || null, organizationId: organizationId || 'admin', lang: lang === 'en' ? 'en' : 'pl' })
    })
    const data = await res.json().catch(() => ({})) as { error?: string; message?: string; user?: ServerUser }
    if (!res.ok) return { ok: false, error: data.error || 'SERVER_ERROR' }
    return { ok: true, message: data.message, user: data.user }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const code = err instanceof Error && 'code' in err ? (err as NodeJS.ErrnoException).code : ''
    console.warn('[JobRaven] Auth server register failed:', base, msg, code || '')
    return { ok: false, error: 'SERVER_UNREACHABLE' }
  }
}

const JWT_SECRET = process.env.JOBRAVEN_JWT_SECRET || process.env.JWT_SECRET || '497e78c7ae8aedc5f24a2ff09bb2e79d5aec510523ad8fab59a225969a42883a'

function verifyLicenseToken(token: string): { valid: boolean; expires_at?: string | null; plan?: string | null } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { valid?: boolean; expires_at?: string | null; plan?: string | null }
    return {
      valid: !!decoded.valid,
      expires_at: decoded.expires_at ?? null,
      plan: decoded.plan ?? null
    }
  } catch {
    return null
  }
}

type ServerUser = { id: number; email: string; display_name?: string | null; organization_id?: string }
async function loginOnServer(email: string, password: string): Promise<{ ok: boolean; error?: string; license?: { valid: boolean; expires_at?: string; plan?: string }; user?: ServerUser; license_token?: string }> {
  const base = getAuthServerUrl()
  try {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: (data.error as string) || 'SERVER_ERROR' }
    let license = data.license as { valid: boolean; expires_at?: string; plan?: string } | undefined
    const licenseToken = typeof data.license_token === 'string' ? data.license_token : undefined
    if (licenseToken) {
      const fromToken = verifyLicenseToken(licenseToken)
      if (fromToken === null) {
        return { ok: false, error: 'LICENSE_TOKEN_INVALID' }
      }
      license = { valid: fromToken.valid, expires_at: fromToken.expires_at ?? undefined, plan: fromToken.plan ?? undefined }
    }
    const user = data.user as ServerUser | undefined
    return { ok: true, license, user, license_token: licenseToken }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const code = err instanceof Error && 'code' in err ? (err as NodeJS.ErrnoException).code : ''
    console.warn('[JobRaven] Auth server login failed:', base, msg, code || '')
    return { ok: false, error: 'SERVER_UNREACHABLE' }
  }
}

async function changePasswordOnServer(email: string, currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  const base = getAuthServerUrl()
  try {
    const res = await fetch(`${base}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, currentPassword, newPassword })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: (data.error as string) || 'SERVER_ERROR' }
    return { ok: true }
  } catch (err) {
    console.warn('Auth server change-password:', err)
    return { ok: false, error: 'SERVER_UNREACHABLE' }
  }
}

async function changeDisplayNameOnServer(email: string, currentPassword: string, newDisplayName: string): Promise<{ ok: boolean; error?: string }> {
  const base = getAuthServerUrl()
  try {
    const res = await fetch(`${base}/api/auth/change-display-name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, currentPassword, newDisplayName: (newDisplayName || '').trim() || null })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: (data.error as string) || 'SERVER_ERROR' }
    return { ok: true }
  } catch (err) {
    console.warn('Auth server change-display-name:', err)
    return { ok: false, error: 'SERVER_UNREACHABLE' }
  }
}

async function resendVerificationOnServer(email: string, lang?: string): Promise<{ ok: boolean; error?: string }> {
  const base = getAuthServerUrl()
  try {
    const res = await fetch(`${base}/api/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), lang: lang === 'en' ? 'en' : 'pl' })
    })
    const data = await res.json().catch(() => ({})) as { error?: string }
    if (!res.ok) return { ok: false, error: data.error || 'SERVER_ERROR' }
    return { ok: true }
  } catch (err) {
    console.warn('Auth server resend-verification:', err)
    return { ok: false, error: 'SERVER_UNREACHABLE' }
  }
}

async function forgotPasswordOnServer(email: string, lang?: string): Promise<{ ok: boolean; error?: string }> {
  const base = getAuthServerUrl()
  const url = `${base}/api/auth/forgot-password`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), lang: lang === 'en' ? 'en' : 'pl' })
    })
    const data = await res.json().catch(() => ({})) as { error?: string }
    if (!res.ok) {
      if (data.error === 'NOT_FOUND') {
        console.warn('[Auth] Reset hasła: serwer zwrócił 404. Adres:', url, '– upewnij się, że serwer JobRaven działa (npm run server) na tym adresie.')
      } else {
        console.warn('[Auth] Reset hasła:', res.status, data)
      }
      return { ok: false, error: data.error || 'SERVER_ERROR' }
    }
    return { ok: true }
  } catch (err) {
    console.warn('Auth server forgot-password:', err)
    return { ok: false, error: 'SERVER_UNREACHABLE' }
  }
}

function registerIpcHandlers() {
  const reloadDbForCurrentOrganization = async () => {
    setCurrentOrgDbFileFromMeta()
    const meta = readAuthMeta()
    process.env.JOBRAVEN_ORG_ID = meta.session?.org_id ?? 'admin'
    process.env.JOBRAVEN_USER_ID = meta.session?.user_id != null ? String(meta.session.user_id) : ''
    try {
      await initDb()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === 'DB_ORGANIZATION_MISMATCH') {
        writeAuthMeta({ session: null, organizations: [] })
        setCurrentOrgDbFileFromMeta()
        process.env.JOBRAVEN_ORG_ID = 'admin'
        process.env.JOBRAVEN_USER_ID = ''
        await initDb()
        throw new Error('DB_ORGANIZATION_MISMATCH')
      }
      throw err
    }
  }

  let lastVerificationDialogShownAt = 0
  const authFallback = {
    getSession: () => {
      const meta = readAuthMeta()
      const organizations = meta.organizations.map(o => ({ id: o.id, name: o.name }))
      if (!meta.session) {
        return { hasAnyUser: true, user: null, organizations, currentOrg: null, licenseWarning: false, secondsUntilNextCheck: null, checkIntervalSeconds: LICENSE_CHECK_INTERVAL_SECONDS }
      }
      const s = meta.session
      const org = meta.organizations.find(o => o.id === s.org_id)
      const daysSince = getDaysSinceVerified(s.last_verified_at)
      const licenseWarning = daysSince >= LICENSE_WARNING_DAYS && daysSince < LICENSE_VERIFICATION_DAYS
      const lastVerifiedMs = s.last_verified_at ? new Date(s.last_verified_at).getTime() : 0
      const nextCheckAt = lastVerifiedMs + LICENSE_CHECK_INTERVAL_SECONDS * 1000
      const secondsUntilNextCheck = nextCheckAt > 0 ? Math.max(0, Math.floor((nextCheckAt - Date.now()) / 1000)) : null
      return {
        hasAnyUser: true,
        user: { id: s.user_id, email: s.email, display_name: s.display_name, role: s.role },
        organizations,
        currentOrg: org ? { id: org.id, name: org.name } : null,
        licenseWarning,
        licenseValid: s.license_valid,
        secondsUntilNextCheck,
        checkIntervalSeconds: LICENSE_CHECK_INTERVAL_SECONDS
      }
    },
    register: async (email: string, password: string, displayName?: string | null, organizationId?: string, lang?: string) => {
      const normalizedEmail = String(email || '').trim().toLowerCase()
      const orgInput = String(organizationId ?? '').trim()
      if (!normalizedEmail || !password || password.length < 6) return { ok: false, error: 'INVALID_INPUT' }
      if (!orgInput) return { ok: false, error: 'INVALID_ORG' }
      const regResult = await registerOnServer(normalizedEmail, password, displayName, orgInput, lang)
      if (!regResult.ok) return { ok: false, error: regResult.error ?? 'SERVER_ERROR' }
      if (regResult.message === 'EMAIL_VERIFICATION_SENT') {
        return { ok: true, message: 'EMAIL_VERIFICATION_SENT', user: regResult.user ? { id: regResult.user.id, email: regResult.user.email, display_name: regResult.user.display_name ?? null, role: 'user' } : undefined }
      }
      const loginResult = await loginOnServer(normalizedEmail, password)
      if (!loginResult.ok || !loginResult.user) return { ok: false, error: loginResult.error ?? 'SERVER_ERROR' }
      const u = loginResult.user
      const orgId = (u.organization_id || orgInput).trim() || 'admin'
      const dbFile = orgId === 'admin' ? 'jobraven.db' : `jobraven_${slugOrgId(orgId)}.db`
      const nowIso = new Date().toISOString()
      const plan = loginResult.license?.plan ?? 'darmowa'
      const meta: AuthMeta = {
        session: {
          user_id: u.id, org_id: orgId, email: u.email, display_name: u.display_name ?? null, role: 'user',
          license_token: loginResult.license_token, license_plan: plan, license_valid: loginResult.license?.valid,
          license_expires_at: loginResult.license?.expires_at ?? null, last_verified_at: nowIso
        },
        organizations: [{ id: orgId, name: orgId, db_file: dbFile }]
      }
      writeAuthMeta(meta)
      try {
        await reloadDbForCurrentOrganization()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg === 'DB_ORGANIZATION_MISMATCH') return { ok: false, error: 'DB_ORGANIZATION_MISMATCH' }
        if (msg === 'DB_NOT_LINKED') return { ok: false, error: 'DB_NOT_LINKED' }
        throw e
      }
      return { ok: true, switched_org: false, user: { id: u.id, email: u.email, display_name: u.display_name ?? null, role: 'user' } }
    },
    login: async (email: string, password: string, organizationId?: string) => {
      const normalizedEmail = String(email || '').trim().toLowerCase()
      if (!normalizedEmail || !password) return { ok: false, error: 'INVALID_INPUT' }
      const serverResult = await loginOnServer(normalizedEmail, password)
      if (!serverResult.ok) return { ok: false, error: serverResult.error ?? 'SERVER_ERROR' }
      const u = serverResult.user
      if (!u || u.id == null) return { ok: false, error: 'SERVER_ERROR' }
      const orgId = (u.organization_id || 'admin').trim() || 'admin'
      if (organizationId && String(organizationId).trim() && orgId !== String(organizationId).trim()) {
        return { ok: false, error: 'INVALID_ORG' }
      }
      const dbFile = orgId === 'admin' ? 'jobraven.db' : `jobraven_${slugOrgId(orgId)}.db`
      const nowIso = new Date().toISOString()
      const plan = serverResult.license?.plan ?? 'darmowa'
      const meta: AuthMeta = {
        session: {
          user_id: u.id, org_id: orgId, email: u.email, display_name: u.display_name ?? null, role: 'user',
          license_token: serverResult.license_token, license_plan: plan, license_valid: serverResult.license?.valid,
          license_expires_at: serverResult.license?.expires_at ?? null, last_verified_at: nowIso
        },
        organizations: [{ id: orgId, name: orgId, db_file: dbFile }]
      }
      writeAuthMeta(meta)
      try {
        await reloadDbForCurrentOrganization()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg === 'DB_ORGANIZATION_MISMATCH') return { ok: false, error: 'DB_ORGANIZATION_MISMATCH' }
        if (msg === 'DB_NOT_LINKED') return { ok: false, error: 'DB_NOT_LINKED' }
        throw e
      }
      return { ok: true, switched_org: false, user: { id: u.id, email: u.email, display_name: u.display_name ?? null, role: 'user' } }
    },
    logout: () => {
      writeAuthMeta({ session: null, organizations: [] })
    },
    changePassword: async (currentPassword: string, newPassword: string) => {
      const meta = readAuthMeta()
      const email = meta.session?.email
      if (!email) return { ok: false, error: 'NOT_LOGGED_IN' }
      if (!newPassword || newPassword.length < 6) return { ok: false, error: 'INVALID_INPUT' }
      const result = await changePasswordOnServer(email, currentPassword, newPassword)
      if (!result.ok) return { ok: false, error: result.error ?? 'SERVER_ERROR' }
      return { ok: true }
    },
    changeDisplayName: async (currentPassword: string, newDisplayName: string) => {
      const meta = readAuthMeta()
      const email = meta.session?.email
      if (!email) return { ok: false, error: 'NOT_LOGGED_IN' }
      const result = await changeDisplayNameOnServer(email, currentPassword, (newDisplayName || '').trim() || '')
      if (!result.ok) return { ok: false, error: result.error ?? 'SERVER_ERROR' }
      const newName = (newDisplayName || '').trim() || null
      const nextSession = { ...meta.session!, display_name: newName }
      writeAuthMeta({ ...meta, session: nextSession })
      return { ok: true }
    },
    resendVerification: async (email: string, lang?: string) => {
      const result = await resendVerificationOnServer(email, lang)
      return result.ok ? { ok: true } : { ok: false, error: result.error ?? 'SERVER_ERROR' }
    },
    forgotPassword: async (email: string, lang?: string) => {
      const result = await forgotPasswordOnServer(email, lang)
      return result.ok ? { ok: true } : { ok: false, error: result.error ?? 'SERVER_ERROR' }
    }
  }
  const authApi = authFallback

  // Check weryfikacji licencji w sesji (co 1 s sprawdzamy, czy minął interwał; 7 dni)
  setInterval(() => {
    const win = mainWindow
    if (!win || win.isDestroyed()) return
    const meta = readAuthMeta()
    if (!meta.session?.last_verified_at) return
    const nextCheckAt = new Date(meta.session.last_verified_at).getTime() + LICENSE_CHECK_INTERVAL_SECONDS * 1000
    if (Date.now() < nextCheckAt) return
    const now = Date.now()
    if (lastVerificationDialogShownAt && now - lastVerificationDialogShownAt < 60000) return
    lastVerificationDialogShownAt = now
    dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Weryfikacja licencji',
      message: 'Czas na weryfikację licencji. Połącz się z internetem i kliknij OK, aby zweryfikować.',
      buttons: ['OK'],
      noLink: true
    }).then(({ response }) => {
      if (response !== 0) return
      const base = getAuthServerUrl()
      const token = meta.session?.license_token
      if (!token) return
      fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json().catch(() => ({})).then((data: Record<string, unknown>) => ({ res, data })))
        .then(({ res, data }: { res: Response; data: Record<string, unknown> }) => {
          if (res.ok && data.organization_id != null) {
            const nowIso = new Date().toISOString()
            const serverOrgId = String(data.organization_id).trim() || 'admin'
            const updatedSession = {
              ...meta.session!,
              org_id: serverOrgId,
              license_token: (typeof data.license_token === 'string' ? data.license_token : meta.session!.license_token) ?? meta.session!.license_token,
              license_plan: (data.license_plan as string) ?? meta.session!.license_plan,
              license_valid: data.license_valid as boolean | undefined,
              license_expires_at: data.license_expires_at !== undefined ? (data.license_expires_at as string | null) : meta.session!.license_expires_at,
              last_verified_at: nowIso
            }
            const nextMeta: AuthMeta = meta.session!.org_id !== serverOrgId
              ? { session: updatedSession, organizations: [{ id: serverOrgId, name: serverOrgId, db_file: serverOrgId === 'admin' ? 'jobraven.db' : `jobraven_${slugOrgId(serverOrgId)}.db` }] }
              : { ...meta, session: updatedSession }
            writeAuthMeta(nextMeta)
          } else {
            const w = mainWindow
            if (w && !w.isDestroyed()) {
              dialog.showMessageBox(w, {
                type: 'warning',
                title: 'Weryfikacja nieudana',
                message: 'Nie udało się zweryfikować licencji. Zostaniesz wylogowany. Połącz się z internetem i zaloguj ponownie.',
                noLink: true
              }).then(() => {
                writeAuthMeta({ session: null, organizations: [] })
                mainWindow?.webContents?.send('jobraven:session-cleared')
              }).catch(() => {})
            }
          }
        })
        .catch(() => {
          const w = mainWindow
          if (w && !w.isDestroyed()) {
            dialog.showMessageBox(w, {
              type: 'warning',
              title: 'Weryfikacja nieudana',
              message: 'Nie udało się połączyć z serwerem. Zostaniesz wylogowany. Połącz się z internetem i zaloguj ponownie.',
              noLink: true
            }).then(() => {
              writeAuthMeta({ session: null, organizations: [] })
              mainWindow?.webContents?.send('jobraven:session-cleared')
            }).catch(() => {})
          }
        })
    })
  }, 1000)

  // Auth
  ipcMain.handle('db:auth:getSession', () => authApi.getSession())
  ipcMain.handle('db:auth:register', (_, email: string, password: string, displayName?: string | null, organizationId?: string, lang?: string) => authApi.register(email, password, displayName, organizationId, lang))
  ipcMain.handle('db:auth:login', (_, email: string, password: string, organizationId?: string) => authApi.login(email, password, organizationId))
  ipcMain.handle('db:auth:logout', () => authApi.logout())
  ipcMain.handle('db:auth:changePassword', (_, currentPassword: string, newPassword: string) => authApi.changePassword(currentPassword, newPassword))
  ipcMain.handle('db:auth:changeDisplayName', (_, currentPassword: string, newDisplayName: string) => authApi.changeDisplayName(currentPassword, newDisplayName))
  ipcMain.handle('db:auth:resendVerification', (_, email: string, lang?: string) => authApi.resendVerification(email, lang))
  ipcMain.handle('db:auth:forgotPassword', (_, email: string, lang?: string) => authApi.forgotPassword(email, lang))
  ipcMain.handle('app:getDbSchemaVersion', () => getDbSchemaVersion())
  ipcMain.handle('app:ensurePredefinedSettings', (_: unknown, uiLocale: string) => {
    ensurePredefinedSettings((uiLocale || 'pl').toLowerCase().slice(0, 2))
  })
  ipcMain.handle('app:relaunch', () => {
    app.relaunch()
    app.exit(0)
  })
  ipcMain.handle('app:getNotices', async () => {
    const base = getAuthServerUrl()
    try {
      const res = await fetch(`${base}/api/notices`)
      const data = await res.json().catch(() => ({}))
      return { notices: Array.isArray((data as { notices?: unknown }).notices) ? (data as { notices: Array<{ id: string; title: string; body: string; date: string }> }).notices : [] }
    } catch {
      return { notices: [] }
    }
  })
  ipcMain.handle('app:recordNoticeRead', async (_: unknown, noticeId: string) => {
    const base = getAuthServerUrl()
    const meta = readAuthMeta()
    const token = meta.session?.license_token
    if (!token || !noticeId) return { ok: false }
    try {
      const res = await fetch(`${base}/api/notices/${encodeURIComponent(noticeId)}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      })
      const data = await res.json().catch(() => ({}))
      return { ok: res.ok && (data as { ok?: boolean }).ok === true }
    } catch {
      return { ok: false }
    }
  })
  // Po zamknięciu natywnego confirm() na Windows fokus nie wraca do treści. Wymuszenie blur→focus to naprawia.
  ipcMain.handle('app:refocusWindow', () => {
    const win = mainWindow
    if (win && !win.isDestroyed()) {
      win.blur()
      setImmediate(() => win.focus())
    }
  })
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:getUpdateStatus', () => ({
    version: app.getVersion(),
    updateAvailable: updaterUpdateAvailable,
    updateAvailableVersion: updateAvailableVersion ?? undefined
  }))
  ipcMain.handle('app:getUpdateRequired', async (): Promise<{ required: boolean; version: string | null }> => {
    const v = getRequiredUpdateVersion()
    if (!v) return { required: false, version: null }
    const online = await canReachUpdateServer()
    if (!online) {
      writePendingUpdateVersion(null)
      return { required: false, version: null }
    }
    writeAuthMeta({ session: null, organizations: [] })
    return { required: true, version: v }
  })
  ipcMain.handle('app:openUpdateDownloadUrl', () => {
    const v = updateAvailableVersion || readPendingUpdateVersion()
    const url = v
      ? `https://github.com/mkucharski8/JobRaven/releases/tag/v${v}`
      : 'https://github.com/mkucharski8/JobRaven/releases/latest'
    shell.openExternal(url)
  })
  ipcMain.handle('app:isPackaged', () => app.isPackaged)
  ipcMain.handle('app:getUpdaterDebugInfo', async (): Promise<{
    ok: boolean
    status?: number
    error?: string
    releasesCount?: number
    latestVersion?: string
    tagNames?: string[]
  }> => {
    const url = 'https://api.github.com/repos/mkucharski8/JobRaven/releases'
    try {
      const res = await fetch(url, { headers: { Accept: 'application/vnd.github.v3+json' } })
      const data = (await res.json().catch(() => [])) as Array<{ tag_name?: string; name?: string }> | { message?: string }
      if (!res.ok) {
        const msg = Array.isArray(data) ? `HTTP ${res.status}` : (data as { message?: string }).message ?? `HTTP ${res.status}`
        return { ok: false, status: res.status, error: msg }
      }
      const list = Array.isArray(data) ? data : []
      const tagNames = list.map(r => r.tag_name ?? '').filter(Boolean)
      const latestVersion = list[0]?.tag_name?.replace(/^v/, '') ?? list[0]?.name ?? undefined
      return { ok: true, status: res.status, releasesCount: list.length, latestVersion, tagNames }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      return { ok: false, error: err }
    }
  })

  // Languages
  ipcMain.handle('db:languages:list', () => dbApi.languages.list())
  ipcMain.handle('db:languages:add', (_, row) => dbApi.languages.add(row))
  ipcMain.handle('db:languages:update', (_, id, row) => dbApi.languages.update(id, row))
  ipcMain.handle('db:languages:delete', (_, id) => dbApi.languages.delete(id))

  // Language pairs
  ipcMain.handle('db:languagePairs:list', () => dbApi.languagePairs.list())
  ipcMain.handle('db:languagePairs:add', (_, row) => dbApi.languagePairs.add(row))
  ipcMain.handle('db:languagePairs:update', (_, id, row) => dbApi.languagePairs.update(id, row))
  ipcMain.handle('db:languagePairs:delete', (_, id) => dbApi.languagePairs.delete(id))

  // Unit categories
  ipcMain.handle('db:unitCategories:list', () => dbApi.unitCategories.list())
  ipcMain.handle('db:unitCategories:add', (_, row) => dbApi.unitCategories.add(row))
  ipcMain.handle('db:unitCategories:update', (_, id, row) => dbApi.unitCategories.update(id, row))
  ipcMain.handle('db:unitCategories:delete', (_, id) => dbApi.unitCategories.delete(id))

  // Units
  ipcMain.handle('db:units:list', () => dbApi.units.list())
  ipcMain.handle('db:units:add', (_, row) => dbApi.units.add(row))
  ipcMain.handle('db:units:update', (_, id, row) => dbApi.units.update(id, row))
  ipcMain.handle('db:units:delete', (_, id) => dbApi.units.delete(id))
  ipcMain.handle('db:units:setBase', (_, id) => dbApi.units.setBase(id))

  // Contractors
  ipcMain.handle('db:contractors:list', () => dbApi.contractors.list())
  ipcMain.handle('db:contractors:get', (_, id) => dbApi.contractors.get(id))
  ipcMain.handle('db:contractors:add', (_, row) => dbApi.contractors.add(row))
  ipcMain.handle('db:contractors:update', (_, id, row) => dbApi.contractors.update(id, row))
  ipcMain.handle('db:contractors:delete', (_, id) => dbApi.contractors.delete(id))

  // Specializations
  ipcMain.handle('db:specializations:list', () => dbApi.specializations.list())
  ipcMain.handle('db:specializations:add', (_, row) => dbApi.specializations.add(row))
  ipcMain.handle('db:specializations:update', (_, id, row) => dbApi.specializations.update(id, row))
  ipcMain.handle('db:specializations:delete', (_, id) => dbApi.specializations.delete(id))
  ipcMain.handle('db:services:list', () => dbApi.services.list())
  ipcMain.handle('db:services:add', (_, row) => dbApi.services.add(row))
  ipcMain.handle('db:services:update', (_, id, row) => dbApi.services.update(id, row))
  ipcMain.handle('db:services:delete', (_, id) => dbApi.services.delete(id))
  ipcMain.handle('db:serviceVatRules:listByService', (_, serviceId: number) => dbApi.serviceVatRules.listByService(serviceId))
  ipcMain.handle('db:serviceVatRules:upsert', (_, row) => dbApi.serviceVatRules.upsert(row))
  ipcMain.handle('db:serviceVatRules:delete', (_, id: number) => dbApi.serviceVatRules.delete(id))

  // Clients
  ipcMain.handle('db:clients:list', () => dbApi.clients.list())
  ipcMain.handle('db:clients:get', (_, id) => dbApi.clients.get(id))
  ipcMain.handle('db:clients:add', (_, row) => dbApi.clients.add(row))
  ipcMain.handle('db:clients:update', (_, id, row) => dbApi.clients.update(id, row))
  ipcMain.handle('db:clients:delete', (_, id) => dbApi.clients.delete(id))

  // Order books
  ipcMain.handle('db:orderBooks:list', () => dbApi.orderBooks.list())
  ipcMain.handle('db:orderBooks:get', (_, id: number) => dbApi.orderBooks.get(id))
  ipcMain.handle('db:orderBooks:add', (_, row) => dbApi.orderBooks.add(row))
  ipcMain.handle('db:orderBooks:update', (_, id: number, row) => dbApi.orderBooks.update(id, row))
  ipcMain.handle('db:orderBooks:delete', (_, id: number) => dbApi.orderBooks.delete(id))

  // Orders
  ipcMain.handle('db:orders:list', (_, bookId?: number) => dbApi.orders.list(bookId))
  ipcMain.handle('db:orders:get', (_, id) => dbApi.orders.get(id))
  ipcMain.handle('db:orders:add', (_, row) => dbApi.orders.add(row))
  ipcMain.handle('db:orders:update', (_, id, row) => dbApi.orders.update(id, row))
  ipcMain.handle('db:orders:delete', (_, id) => dbApi.orders.delete(id))
  ipcMain.handle('db:orders:deleteAllButFirstInBook', (_, bookId: number) => dbApi.orders.deleteAllButFirstInBook(bookId))
  ipcMain.handle('db:orders:issueInvoice', async (_, id: number, invoice_number: string, invoice_date: string, opts?: { invoice_sale_date?: string | null; payment_due_at?: string | null; invoice_notes?: string | null; invoice_bank_account_id?: number | null; wfirma_company_account_id?: number | null }) => {
    const provider = dbApi.settings.get('invoice_provider')
    console.log('[issueInvoice] provider =', JSON.stringify(provider))
    if (provider === 'wfirma') {
      const order = dbApi.orders.get(id) as Record<string, unknown> | null
      if (!order || !order.client_id) throw new Error('Zlecenie lub klient nie istnieje.')
      const client = dbApi.clients.get(order.client_id as number) as Record<string, unknown> | null
      const taxpayerCountry = dbApi.settings.get('personal_country')
      const orderWithResolvedVat = resolveVatRuleForOrder(order, client, taxpayerCountry)
      const sellerKeys = ['company_name', 'first_name', 'last_name', 'personal_nip', 'personal_street', 'personal_building', 'personal_local', 'personal_postal_code', 'personal_city', 'personal_country', 'personal_address_extra']
      const seller: Record<string, string | null> = {}
      for (const k of sellerKeys) seller[k] = dbApi.settings.get(k)
      let paymentDue = opts?.payment_due_at ?? null
      if (paymentDue == null && invoice_date) {
        const clientRow = dbApi.clients.get(order.client_id as number) as { default_payment_days?: number } | null
        const days = clientRow?.default_payment_days ?? 14
        const due = new Date(invoice_date)
        due.setDate(due.getDate() + days)
        paymentDue = due.toISOString().slice(0, 10)
      }
      const accessKey = dbApi.settings.get('wfirma_access_key') ?? ''
      const secretKey = dbApi.settings.get('wfirma_secret_key') ?? ''
      const appKey = dbApi.settings.get('wfirma_app_key') ?? ''
      const companyId = dbApi.settings.get('wfirma_company_id')
      const companyAccountIdRaw = dbApi.settings.get('wfirma_company_account_id')
      const companyAccountIdFromSettings = companyAccountIdRaw && /^\d+$/.test(String(companyAccountIdRaw).trim())
        ? parseInt(String(companyAccountIdRaw).trim(), 10)
        : undefined
      const companyAccountId = opts?.wfirma_company_account_id
        ?? companyAccountIdFromSettings
      const sellerIsVatPayer = dbApi.settings.get('seller_is_vat_payer') === '1'
      let notesForWfirma = (opts?.invoice_notes ?? '').trim() || undefined
      const { invoiceNumber: numberFromApi } = await createInvoiceFromOrder({
        orders: [orderWithResolvedVat as never],
        client: client as never,
        seller,
        invoiceNumber: invoice_number,
        invoiceDate: invoice_date,
        paymentDue: paymentDue ?? invoice_date,
        saleDate: opts?.invoice_sale_date ?? undefined,
        notes: notesForWfirma,
        isVatPayer: sellerIsVatPayer,
        accessKey,
        secretKey,
        appKey,
        companyId: companyId ?? undefined,
        companyAccountId
      })
      dbApi.orders.issueInvoice(id, numberFromApi, invoice_date, { ...opts, invoice_provider_source: 'wfirma' })
      return
    }
    dbApi.orders.issueInvoice(id, invoice_number, invoice_date, { ...opts, invoice_provider_source: 'local' })
  })
  ipcMain.handle('db:orders:issueInvoices', async (_, orderIds: number[], invoice_number: string, invoice_date: string, opts?: { invoice_sale_date?: string | null; payment_due_at?: string | null; invoice_notes?: string | null; invoice_bank_account_id?: number | null; wfirma_company_account_id?: number | null }) => {
    const provider = dbApi.settings.get('invoice_provider')
    if (provider === 'wfirma') {
      const orders = orderIds.map((id: number) => dbApi.orders.get(id) as Record<string, unknown> | null).filter(Boolean) as Record<string, unknown>[]
      if (orders.length !== orderIds.length) throw new Error('Nie znaleziono wszystkich zleceń.')
      const clientId = orders[0].client_id as number
      if (orders.some((o: Record<string, unknown>) => o.client_id !== clientId)) throw new Error('Wszystkie zlecenia muszą być tego samego klienta.')
      const client = dbApi.clients.get(clientId) as Record<string, unknown> | null
      const taxpayerCountry = dbApi.settings.get('personal_country')
      const ordersWithResolvedVat = orders.map(o => resolveVatRuleForOrder(o, client, taxpayerCountry))
      const sellerKeys = ['company_name', 'first_name', 'last_name', 'personal_nip', 'personal_street', 'personal_building', 'personal_local', 'personal_postal_code', 'personal_city', 'personal_country', 'personal_address_extra']
      const seller: Record<string, string | null> = {}
      for (const k of sellerKeys) seller[k] = dbApi.settings.get(k)
      let paymentDue = opts?.payment_due_at ?? null
      if (paymentDue == null && invoice_date) {
        const clientRow = dbApi.clients.get(clientId) as { default_payment_days?: number } | null
        const days = clientRow?.default_payment_days ?? 14
        const due = new Date(invoice_date)
        due.setDate(due.getDate() + days)
        paymentDue = due.toISOString().slice(0, 10)
      }
      const accessKey = dbApi.settings.get('wfirma_access_key') ?? ''
      const secretKey = dbApi.settings.get('wfirma_secret_key') ?? ''
      const appKey = dbApi.settings.get('wfirma_app_key') ?? ''
      const companyId = dbApi.settings.get('wfirma_company_id')
      const companyAccountIdRaw = dbApi.settings.get('wfirma_company_account_id')
      const companyAccountIdFromSettings = companyAccountIdRaw && /^\d+$/.test(String(companyAccountIdRaw).trim())
        ? parseInt(String(companyAccountIdRaw).trim(), 10)
        : undefined
      const companyAccountId = opts?.wfirma_company_account_id
        ?? companyAccountIdFromSettings
      const sellerIsVatPayer = dbApi.settings.get('seller_is_vat_payer') === '1'
      let notesForWfirma = (opts?.invoice_notes ?? '').trim() || undefined
      const { invoiceNumber: numberFromApi } = await createInvoiceFromOrder({
        orders: ordersWithResolvedVat as never[],
        client: client as never,
        seller,
        invoiceNumber: invoice_number,
        invoiceDate: invoice_date,
        paymentDue: paymentDue ?? invoice_date,
        saleDate: opts?.invoice_sale_date ?? undefined,
        notes: notesForWfirma,
        isVatPayer: sellerIsVatPayer,
        accessKey,
        secretKey,
        appKey,
        companyId: companyId ?? undefined,
        companyAccountId
      })
      dbApi.orders.issueInvoices(orderIds, numberFromApi, invoice_date, { ...opts, invoice_provider_source: 'wfirma' })
      return
    }
    dbApi.orders.issueInvoices(orderIds, invoice_number, invoice_date, { ...opts, invoice_provider_source: 'local' })
  })
  ipcMain.handle('db:orders:clearInvoice', (_, id: number) => dbApi.orders.clearInvoice(id))
  ipcMain.handle('db:orders:nextInvoiceNumber', (_, providerSource?: 'local' | 'wfirma') => dbApi.orders.nextInvoiceNumber(providerSource))

  // Subcontracts
  ipcMain.handle('db:subcontracts:list', () => {
    try {
      return dbApi.subcontracts.list()
    } catch (e) {
      console.error('db:subcontracts:list', e)
      return []
    }
  })
  ipcMain.handle('db:subcontracts:get', (_, id: number) => dbApi.subcontracts.get(id))
  ipcMain.handle('db:subcontracts:add', (_, row) => dbApi.subcontracts.add(row))
  ipcMain.handle('db:subcontracts:update', (_, id: number, row) => dbApi.subcontracts.update(id, row))
  ipcMain.handle('db:subcontracts:delete', (_, id: number) => dbApi.subcontracts.delete(id))
  ipcMain.handle('db:subcontracts:listByOrderId', (_, orderId: number) => dbApi.subcontracts.listByOrderId(orderId))
  ipcMain.handle('db:subcontracts:nextSubcontractNumber', () => dbApi.subcontracts.nextSubcontractNumber())

  // Client default rates per unit
  ipcMain.handle('db:clientUnitRates:list', (_, clientId: number) => dbApi.clientUnitRates.list(clientId))
  ipcMain.handle('db:clientUnitRates:get', (_, clientId: number, unitId: number, preferredCurrency?: string | null) => dbApi.clientUnitRates.get(clientId, unitId, preferredCurrency))
  ipcMain.handle('db:clientUnitRates:set', (_, clientId: number, unitId: number, rate: number, currency?: string | null) => dbApi.clientUnitRates.set(clientId, unitId, rate, currency))
  ipcMain.handle('db:clientDefaultUnitRates:list', (_, clientId: number) => dbApi.clientDefaultUnitRates.list(clientId))
  ipcMain.handle('db:clientDefaultUnitRates:get', (_, clientId: number, unitId: number, argumentCandidates?: { key: string; value?: string | null }[] | null, preferredCurrency?: string | null) => dbApi.clientDefaultUnitRates.get(clientId, unitId, argumentCandidates, preferredCurrency))
  ipcMain.handle('db:clientDefaultUnitRates:set', (_, clientId: number, unitId: number, rate: number, currency: string, argumentsList?: { key: string; value?: string | null }[] | { key: string; value?: string | null } | null) => dbApi.clientDefaultUnitRates.set(clientId, unitId, rate, currency, argumentsList))
  ipcMain.handle('db:clientDefaultUnitRates:update', (_, id: number, rate: number, currency: string, argumentsList?: { key: string; value?: string | null }[] | { key: string; value?: string | null } | null) => dbApi.clientDefaultUnitRates.update(id, rate, currency, argumentsList))
  ipcMain.handle('db:clientDefaultUnitRates:delete', (_, id: number) => dbApi.clientDefaultUnitRates.delete(id))

  ipcMain.handle('db:contractorUnitRates:list', (_, contractorId: number) => dbApi.contractorUnitRates.list(contractorId))
  ipcMain.handle('db:contractorUnitRates:get', (_, contractorId: number, unitId: number, languagePairId?: number | null) => dbApi.contractorUnitRates.get(contractorId, unitId, languagePairId))
  ipcMain.handle('db:contractorUnitRates:set', (_, contractorId: number, unitId: number, rate: number, languagePairId?: number | null) => dbApi.contractorUnitRates.set(contractorId, unitId, rate, languagePairId))

  ipcMain.handle('db:defaultUnitRates:list', () => dbApi.defaultUnitRates.list())
  ipcMain.handle('db:defaultUnitRates:get', (_, unitId: number, argumentCandidates?: { key: string; value?: string | null }[] | null, preferredCurrency?: string | null) => dbApi.defaultUnitRates.get(unitId, argumentCandidates, preferredCurrency))
  ipcMain.handle('db:defaultUnitRates:set', (_, unitId: number, rate: number, currency: string, argumentsList?: { key: string; value?: string | null }[] | { key: string; value?: string | null } | null) => dbApi.defaultUnitRates.set(unitId, rate, currency, argumentsList))
  ipcMain.handle('db:defaultUnitRates:update', (_, id: number, rate: number, currency: string, argumentsList?: { key: string; value?: string | null }[] | { key: string; value?: string | null } | null) => dbApi.defaultUnitRates.update(id, rate, currency, argumentsList))
  ipcMain.handle('db:defaultUnitRates:delete', (_, id: number) => dbApi.defaultUnitRates.delete(id))

  // Settings
  ipcMain.handle('db:settings:get', (_, key) => dbApi.settings.get(key))
  ipcMain.handle('db:settings:set', (_, key, value) => dbApi.settings.set(key, value))
  ipcMain.handle('db:settings:hasRateCurrencies', () => dbApi.settings.hasRateCurrencies())

  ipcMain.handle('settings:exportUnitsServicesPreset', async (_, uiLocale: string) => {
    try {
      const locale = (String(uiLocale ?? 'pl').toLowerCase().slice(0, 2)) || 'pl'
      const data = getUnitsServicesPresetData(locale)
      const win = mainWindow ?? BrowserWindow.getFocusedWindow()
      const defaultPath = path.join(app.getPath('documents'), `jobraven-preset-${locale}.json`)
      const { filePath } = await dialog.showSaveDialog(win ?? undefined, {
        defaultPath,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (!filePath) return { ok: false, canceled: true }
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
      return { ok: true, path: filePath }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('settings:restorePredefinedPreset', async (_, uiLocale: string) => {
    try {
      const locale = (String(uiLocale ?? 'pl').toLowerCase().slice(0, 2)) || 'pl'
      const preset = loadPresetFromFile(locale)
      if (!preset) return { ok: false, error: 'PRESET_NOT_FOUND' }
      const clearResult = clearUnitsServicesCategories()
      if (!clearResult.ok) return clearResult
      applyPresetData(preset)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('settings:clearPredefinedPreset', async (_, password: string) => {
    if (!verifyCurrentUserPassword(password ?? '')) {
      return { ok: false, error: 'INVALID_PASSWORD' }
    }
    return clearUnitsServicesCategories()
  })

  ipcMain.handle('settings:verifyPassword', async (_, password: string) => {
    return { ok: verifyCurrentUserPassword(password ?? '') }
  })

  ipcMain.handle('wfirma:testConnection', async (_, accessKey: string, secretKey: string, appKey?: string, companyId?: string | null) => {
    const result = await wfirmaTestConnection({ accessKey: accessKey ?? '', secretKey: secretKey ?? '', appKey: appKey ?? '', companyId })
    return result
  })
  ipcMain.handle('wfirma:listCompanyAccounts', async (_, accessKey: string, secretKey: string, appKey?: string, companyId?: string | null) => {
    const result = await wfirmaListCompanyAccounts({ accessKey: accessKey ?? '', secretKey: secretKey ?? '', appKey: appKey ?? '', companyId })
    return result
  })

  // Custom columns
  ipcMain.handle('db:customColumns:listByBook', (_, bookId: number) => dbApi.customColumns.listByBook(bookId))
  ipcMain.handle('db:customColumns:add', (_, row) => dbApi.customColumns.add(row))
  ipcMain.handle('db:customColumns:update', (_, id: number, row) => dbApi.customColumns.update(id, row))
  ipcMain.handle('db:customColumns:delete', (_, id: number) => dbApi.customColumns.delete(id))

  // Custom column values
  ipcMain.handle('db:customColumnValues:getByOrder', (_, orderId: number) => dbApi.customColumnValues.getByOrder(orderId))
  ipcMain.handle('db:customColumnValues:set', (_, orderId: number, columnId: number, value: string | null) => dbApi.customColumnValues.set(orderId, columnId, value))
  ipcMain.handle('db:customColumnValues:bulkSet', (_, orderId: number, values: Record<number, string | null>) => dbApi.customColumnValues.bulkSet(orderId, values))

  // Bank accounts
  ipcMain.handle('db:bankAccounts:list', () => dbApi.bankAccounts.list())
  ipcMain.handle('db:bankAccounts:get', (_, id: number) => dbApi.bankAccounts.get(id))
  ipcMain.handle('db:bankAccounts:add', (_, row) => dbApi.bankAccounts.add(row))
  ipcMain.handle('db:bankAccounts:update', (_, id: number, row) => dbApi.bankAccounts.update(id, row))
  ipcMain.handle('db:bankAccounts:delete', (_, id: number) => dbApi.bankAccounts.delete(id))
  ipcMain.handle('db:bankAccounts:setDefault', (_, id: number) => dbApi.bankAccounts.setDefault(id))

  // Folder danych (baza, ustawienia) – ścieżka, zmiana, otwórz w eksploratorze
  ipcMain.handle('app:getDataFolderPath', () => app.getPath('userData'))
  ipcMain.handle('app:openDataFolder', async () => {
    const dir = app.getPath('userData')
    const result = await shell.openPath(dir)
    return result ? { ok: false, error: result } : { ok: true }
  })
  ipcMain.handle('app:setDataFolderPath', async (_, newPath: string) => {
    if (process.platform !== 'win32') return { ok: false, error: 'NOT_SUPPORTED' }
    const p = path.normalize(String(newPath ?? '').trim())
    if (!p) return { ok: false, error: 'EMPTY_PATH' }
    try {
      if (!fs.existsSync(p)) return { ok: false, error: 'PATH_NOT_FOUND' }
      const stat = fs.statSync(p)
      if (!stat.isDirectory()) return { ok: false, error: 'NOT_A_DIRECTORY' }
    } catch {
      return { ok: false, error: 'PATH_NOT_FOUND' }
    }
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local')
    const bootstrapDir = path.join(localAppData, 'JobRaven')
    try {
      fs.mkdirSync(bootstrapDir, { recursive: true })
      fs.writeFileSync(path.join(bootstrapDir, 'data-path.json'), JSON.stringify({ path: p }), 'utf8')
      return { ok: true, needRestart: true }
    } catch (err) {
      console.error('setDataFolderPath:', err)
      return { ok: false, error: 'WRITE_FAILED' }
    }
  })
  ipcMain.handle('app:chooseDataFolder', async () => {
    if (process.platform !== 'win32') return { ok: false, error: 'NOT_SUPPORTED' }
    const { filePaths } = await dialog.showOpenDialog(mainWindow ?? null!, {
      title: 'Wybierz folder na dane aplikacji',
      message: 'Tutaj będą przechowywane baza danych i ustawienia. Po zmianie wymagany jest restart aplikacji.',
      properties: ['openDirectory', 'createDirectory']
    })
    if (!filePaths?.length) return { ok: false, canceled: true }
    const chosen = path.normalize(filePaths[0])
    try {
      fs.mkdirSync(chosen, { recursive: true })
    } catch { /* nop */ }
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local')
    const bootstrapDir = path.join(localAppData, 'JobRaven')
    try {
      fs.mkdirSync(bootstrapDir, { recursive: true })
      fs.writeFileSync(path.join(bootstrapDir, 'data-path.json'), JSON.stringify({ path: chosen }), 'utf8')
      return { ok: true, path: chosen, needRestart: true }
    } catch (err) {
      console.error('chooseDataFolder:', err)
      return { ok: false, error: 'WRITE_FAILED' }
    }
  })

  // Dialog: open file (for logo selection etc.)
  ipcMain.handle('dialog:openFile', async (_, opts?: { filters?: { name: string; extensions: string[] }[]; title?: string }) => {
    const win = mainWindow ?? undefined
    const result = await dialog.showOpenDialog(win!, {
      title: opts?.title ?? 'Select file',
      properties: ['openFile'],
      filters: opts?.filters ?? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg'] }]
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  // Logo na fakturze: kopiuj wybrany plik do userData, żeby ścieżka była trwała (nie znikała przy aktualizacji Office itd.)
  ipcMain.handle('settings:setInvoiceLogo', async (_, sourcePath: string | null) => {
    if (!sourcePath || typeof sourcePath !== 'string') {
      dbApi.settings.set('invoice_logo_path', '')
      return ''
    }
    const src = path.normalize(sourcePath.trim())
    if (!fs.existsSync(src)) {
      dbApi.settings.set('invoice_logo_path', '')
      return ''
    }
    const ext = path.extname(src).toLowerCase() || '.png'
    const safeExt = /^\.(png|jpe?g|gif|bmp|webp)$/i.test(ext) ? ext : '.png'
    const userData = app.getPath('userData')
    const destPath = path.join(userData, `invoice_logo${safeExt}`)
    try {
      fs.copyFileSync(src, destPath)
      dbApi.settings.set('invoice_logo_path', destPath)
      return destPath
    } catch (err) {
      console.error('Copy invoice logo:', err)
      dbApi.settings.set('invoice_logo_path', '')
      return ''
    }
  })

  // Analytics
  ipcMain.handle('db:analytics:totals', (_e, bookId?: number) => dbApi.analytics.totals(bookId))
  ipcMain.handle('db:analytics:paymentSummary', (_e, bookId?: number) => dbApi.analytics.paymentSummary(bookId))

  // Polish VAT register (GUS / Wykaz podatników VAT)
  ipcMain.handle('gus:fetchByNip', (_, nip: string) => fetchCompanyByNip(nip))

  // Export to CSV – nagłówki i kolumny z UI (frontend przekazuje columns: { key, label }[])
  ipcMain.handle('export:ordersXls', async (_, bookId?: number, columns?: ExportColumn[]) => {
    try {
      const orders = dbApi.orders.list(bookId) as Record<string, unknown>[]
      const vatRate = 23
      const cols = Array.isArray(columns) && columns.length > 0 ? columns : [
        { key: 'order_number', label: 'Nr zlecenia' },
        { key: 'client_short_name', label: 'Klient' },
        { key: 'received_at', label: 'Data przyjęcia' },
        { key: 'deadline_at', label: 'Termin' },
        { key: 'specialization_name', label: 'Specjalizacja' },
        { key: 'language_pair_label', label: 'Para językowa' },
        { key: 'unit_name', label: 'Jednostka' },
        { key: 'quantity', label: 'Ilość' },
        { key: 'amount_net', label: 'Netto' },
        { key: 'amount_gross', label: 'Brutto' },
        { key: 'order_status', label: 'Status' },
        { key: 'invoice_status', label: 'Faktura' },
        { key: 'payment_due_at', label: 'Termin płatności' }
      ]
      const escape = (v: unknown) => (v == null ? '' : String(v).replace(/"/g, '""'))
      const headerLine = cols.map(c => `"${escape(c.label)}"`).join(',')
      const row = (o: Record<string, unknown>) => cols.map(c => `"${escape(getOrderValue(o, c.key, vatRate))}"`).join(',')
      const csv = [headerLine, ...orders.map(o => row(o))].join('\r\n')
      const win = mainWindow ?? undefined
      const defaultPath = path.join(app.getPath('documents'), 'ksiega-zlecen.csv')
      const { filePath } = await dialog.showSaveDialog(win as any, { defaultPath, filters: [{ name: 'CSV', extensions: ['csv'] }] })
      if (filePath) fs.writeFileSync(filePath, csv, 'utf8')
      return !!filePath
    } catch (err) {
      console.error('Export orders XLS/CSV:', err)
      const msg = err instanceof Error ? err.message : String(err)
      dialog.showErrorBox('Błąd eksportu', `Nie udało się wyeksportować księgi do CSV.\n\nSzczegóły: ${msg}`)
      return false
    }
  })

  // Export analytics report to Excel (.xlsx)
  ipcMain.handle('export:analyticsXlsx', async (_, data: { name: string; amount: number; count: number }[]) => {
    try {
      const rows = Array.isArray(data) ? data : []
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Raport')
      const win = mainWindow ?? undefined
      const defaultPath = path.join(app.getPath('documents'), 'raport-analityka.xlsx')
      const { filePath } = await dialog.showSaveDialog(win as any, { defaultPath, filters: [{ name: 'Excel', extensions: ['xlsx'] }] })
      if (filePath) {
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
        fs.writeFileSync(filePath, buf)
      }
      return !!filePath
    } catch (err) {
      console.error('Export analytics XLSX:', err)
      const msg = err instanceof Error ? err.message : String(err)
      dialog.showErrorBox('Błąd eksportu', `Nie udało się wyeksportować raportu do Excel.\n\nSzczegóły: ${msg}`)
      return false
    }
  })

  // Export earnings report (raport zarobków) to Excel: table + chart data sheets (wielopoziomowe wiersze)
  ipcMain.handle('export:earningsReportXlsx', async (_, payload: {
    tableData: { name: string; keyParts?: string[]; count: number; net: number; vat: number; gross: number }[]
    chartData: { name: string; net: number; vat: number; gross: number; value?: number }[]
    rowGroupLabels?: string[]
    labels: { rowLabel: string; count: string; valueColumn: string; sheetTable: string; sheetChart: string; net: string; vat: string; gross: string }
  }) => {
    try {
    const tableData = Array.isArray(payload?.tableData) ? payload.tableData : []
    const chartData = Array.isArray(payload?.chartData) ? payload.chartData : []
    const rowGroupLabels = Array.isArray(payload?.rowGroupLabels) ? payload.rowGroupLabels : []
    const labels = payload?.labels ?? { rowLabel: 'Grupa', count: 'Liczba', valueColumn: 'Wartość', sheetTable: 'Tabela', sheetChart: 'Dane wykresu', net: 'Netto', vat: 'VAT', gross: 'Brutto' }
    const useNested = rowGroupLabels.length > 0 && tableData.some((r: { keyParts?: string[] }) => r.keyParts?.length)
    const tableRows = tableData.map((row: { name: string; keyParts?: string[]; count: number; net: number; vat: number; gross: number }) => {
      if (useNested && row.keyParts && row.keyParts.length > 0) {
        const obj: Record<string, string | number> = {}
        rowGroupLabels.forEach((h, i) => { obj[h] = row.keyParts![i] ?? '' })
        obj[labels.count] = row.count
        obj[labels.net] = row.net
        obj[labels.vat] = row.vat
        obj[labels.gross] = row.gross
        return obj
      }
      return {
        [labels.rowLabel]: row.name,
        [labels.count]: row.count,
        [labels.net]: row.net,
        [labels.vat]: row.vat,
        [labels.gross]: row.gross
      }
    })
    const chartRows = chartData.map(row => ({
      [labels.rowLabel]: row.name,
      [labels.net]: row.net,
      [labels.vat]: row.vat,
      [labels.gross]: row.gross,
      ...(row.value != null ? { [labels.valueColumn]: row.value } : {})
    }))
    const wsTable = XLSX.utils.json_to_sheet(tableRows.length ? tableRows : [{ [labels.rowLabel]: '', [labels.count]: '', [labels.net]: '', [labels.vat]: '', [labels.gross]: '' }])
    const wsChart = XLSX.utils.json_to_sheet(chartRows.length ? chartRows : [{ [labels.rowLabel]: '', [labels.net]: '', [labels.vat]: '', [labels.gross]: '' }])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsTable, labels.sheetTable.length ? labels.sheetTable : 'Tabela')
    XLSX.utils.book_append_sheet(wb, wsChart, labels.sheetChart.length ? labels.sheetChart : 'Dane wykresu')
    const win = mainWindow ?? undefined
    const defaultPath = path.join(app.getPath('documents'), 'raport-zarobkow.xlsx')
    const { filePath } = await dialog.showSaveDialog(win as any, { defaultPath, filters: [{ name: 'Excel', extensions: ['xlsx'] }] })
    if (filePath) {
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
      fs.writeFileSync(filePath, buf)
    }
    return !!filePath
    } catch (err) {
      console.error('Export earnings report XLSX:', err)
      const msg = err instanceof Error ? err.message : String(err)
      dialog.showErrorBox('Błąd eksportu', `Nie udało się wyeksportować raportu zarobków do Excel.\n\nSzczegóły: ${msg}`)
      return false
    }
  })

  // Export to Excel (.xlsx) – nagłówki z UI
  ipcMain.handle('export:ordersXlsx', async (_, bookId?: number, columns?: ExportColumn[]) => {
    try {
      const orders = dbApi.orders.list(bookId) as Record<string, unknown>[]
      const vatRate = 23
      const cols = Array.isArray(columns) && columns.length > 0 ? columns : [
      { key: 'order_number', label: 'Nr zlecenia' },
      { key: 'client_short_name', label: 'Klient' },
      { key: 'received_at', label: 'Data przyjęcia' },
      { key: 'deadline_at', label: 'Termin' },
      { key: 'specialization_name', label: 'Specjalizacja' },
      { key: 'language_pair_label', label: 'Para językowa' },
      { key: 'unit_name', label: 'Jednostka' },
      { key: 'quantity', label: 'Ilość' },
      { key: 'amount_net', label: 'Netto' },
      { key: 'amount_gross', label: 'Brutto' },
      { key: 'order_status', label: 'Status' },
      { key: 'invoice_status', label: 'Faktura' },
      { key: 'payment_due_at', label: 'Termin płatności' }
    ]
    const rows = orders.map(o => {
      const obj: Record<string, unknown> = {}
      cols.forEach(c => { obj[c.label] = getOrderValue(o, c.key, vatRate) ?? '' })
      return obj
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Order book')
    const win = mainWindow ?? undefined
    const defaultPath = path.join(app.getPath('documents'), 'ksiega-zlecen.xlsx')
    const { filePath } = await dialog.showSaveDialog(win as any, { defaultPath, filters: [{ name: 'Excel', extensions: ['xlsx'] }] })
    if (filePath) {
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
      fs.writeFileSync(filePath, buf)
    }
    return !!filePath
    } catch (err) {
      console.error('Export orders XLSX:', err)
      const msg = err instanceof Error ? err.message : String(err)
      dialog.showErrorBox('Błąd eksportu', `Nie udało się wyeksportować księgi do Excel.\n\nSzczegóły: ${msg}`)
      return false
    }
  })

  // Export order book to PDF – nagłówki z UI, układ jak w aplikacji
  ipcMain.handle('export:ordersPdf', async (_, bookId?: number, columns?: ExportColumn[]) => {
    try {
      const orders = dbApi.orders.list(bookId) as Record<string, unknown>[]
      const book = bookId != null ? (dbApi.orderBooks.get(bookId) as { name?: string } | null) : null
      const bookName = book?.name ?? null
      const vatRate = 23
      const uiLang = dbApi.settings.get('ui_language')
      const lang = (uiLang === 'pl' ? 'pl' : 'en') as 'pl' | 'en'
      let cols = Array.isArray(columns) && columns.length > 0 ? columns : [
        { key: 'order_number', label: 'Nr zlecenia' },
        { key: 'client_short_name', label: 'Klient' },
        { key: 'received_at', label: 'Data przyjęcia' },
        { key: 'amount_net', label: 'Netto' },
        { key: 'amount_gross', label: 'Brutto' },
        { key: 'order_status', label: 'Status' },
        { key: 'invoice_status', label: 'Faktura' },
        { key: 'payment_due_at', label: 'Termin płatności' }
      ]
      cols = cols.filter((c: { key: string }) => c.key !== 'order_status' && c.key !== 'invoice_status' && c.key !== 'payment_due_at')
      const repertoriumLayout = bookId != null && (dbApi.orderBooks.get(bookId) as { view_type?: string } | null)?.view_type === 'repertorium'
      const buf = await writeOrderBookPdfToBuffer(orders, cols, bookName, lang, vatRate, repertoriumLayout)
      const safeName = (bookName || 'order-book').replace(/[/\\?%*:|"]/g, '-').trim() || 'order-book'
      const defaultName = `ksiega-zlecen-${safeName}.pdf`
      const win = mainWindow ?? undefined
      const { filePath } = await dialog.showSaveDialog(win as any, { defaultPath: defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
      if (filePath) fs.writeFileSync(filePath, buf)
      return !!filePath
    } catch (err) {
      console.error('Error exporting order book PDF:', err)
      const msg = err instanceof Error ? err.message : String(err)
      dialog.showErrorBox('Błąd eksportu PDF', `Nie udało się wygenerować księgi zleceń w PDF.\n\nSzczegóły: ${msg}`)
      return false
    }
  })

  // Export order confirmation (Purchase Order) as PDF
  ipcMain.handle('export:orderConfirmationPdf', async (_, orderId: number) => {
    try {
      const order = dbApi.orders.get(orderId) as Record<string, unknown> | null
      if (!order || !order.client_id) return false
      const client = dbApi.clients.get(order.client_id as number) as Record<string, unknown> | null
      const keys = [
        'company_name', 'first_name', 'last_name', 'personal_nip', 'personal_street', 'personal_building',
        'personal_local', 'personal_postal_code', 'personal_city', 'personal_country', 'personal_address_extra',
        'personal_phone', 'ui_language'
      ]
      const settings: Record<string, string | null> = {}
      for (const k of keys) settings[k] = dbApi.settings.get(k)
      const lang = (settings.ui_language === 'pl' ? 'pl' : 'en') as 'pl' | 'en'
      const safeNum = String(order.order_number ?? orderId).replace(/[/\\?%*:|"]/g, '-')
      const defaultName = `potwierdzenie-zlecenia-${safeNum}.pdf`
      const win = mainWindow ?? undefined
      const { filePath } = await dialog.showSaveDialog(win as any, {
        defaultPath: defaultName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (!filePath) return false
      await writeOrderConfirmationPdfToFile(filePath, order as never, client as never, settings, lang)
      return true
    } catch (err) {
      console.error('Error exporting order confirmation PDF:', err)
      const msg = err instanceof Error ? err.message : String(err)
      dialog.showErrorBox('Błąd eksportu PDF', `Nie udało się wygenerować Potwierdzenia zlecenia.\n\nSzczegóły: ${msg}`)
      return false
    }
  })

  // Export order confirmation PDF for a subcontract (by subcontract id)
  ipcMain.handle('export:orderConfirmationPdfSubcontract', async (_, subcontractId: number) => {
    try {
      const sub = dbApi.subcontracts.get(subcontractId) as Record<string, unknown> | null
      if (!sub || !sub.order_id) return false
      const order = dbApi.orders.get(sub.order_id as number) as Record<string, unknown> | null
      const contractor = dbApi.contractors.get(sub.contractor_id as number) as Record<string, unknown> | null
      if (!order) return false
      const keys = ['company_name', 'first_name', 'last_name', 'personal_nip', 'personal_street', 'personal_building', 'personal_local', 'personal_postal_code', 'personal_city', 'personal_country', 'personal_address_extra', 'personal_phone', 'ui_language']
      const settings: Record<string, string | null> = {}
      for (const k of keys) settings[k] = dbApi.settings.get(k)
      const lang = (settings.ui_language === 'pl' ? 'pl' : 'en') as 'pl' | 'en'
      const orderForPdf = { ...order, subcontract_number: sub.subcontract_number, quantity: sub.quantity ?? order.quantity, rate_per_unit: sub.rate_per_unit ?? order.rate_per_unit, amount: sub.amount ?? order.amount, received_at: sub.received_at ?? order.received_at, deadline_at: sub.deadline_at ?? order.deadline_at, rate_currency: order.rate_currency ?? null }
      const safeNum = String(sub.subcontract_number ?? subcontractId).replace(/[/\\?%*:|"]/g, '-')
      const defaultName = `potwierdzenie-podzlecenia-${safeNum}.pdf`
      const win = mainWindow ?? undefined
      const { filePath } = await dialog.showSaveDialog(win as any, { defaultPath: defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
      if (!filePath) return false
      const descOpts = {
        include_specialization: (sub.include_specialization as number) ?? 1,
        include_language_pair: (sub.include_language_pair as number) ?? 1,
        include_service: (sub.include_service as number) ?? 0,
        description_custom_text: (sub.description_custom_text as string) ?? null
      }
      await writeOrderConfirmationPdfForSubcontractToFile(filePath, orderForPdf as never, contractor as never, settings, lang, (sub.notes as string) ?? null, descOpts as never)
      return true
    } catch (err) {
      console.error('Error exporting subcontract PO PDF:', err)
      const msg = err instanceof Error ? err.message : String(err)
      dialog.showErrorBox('Błąd eksportu PDF', msg)
      return false
    }
  })

  // Export invoice as PDF
  ipcMain.handle('export:invoicePdf', async (_, orderId: number, extra?: { notes?: string; bankAccountId?: number }) => {
    try {
      const order = dbApi.orders.get(orderId) as Record<string, unknown> | null
      if (!order || !order.client_id || !order.invoice_number) return false
      const safeNum = String(order.invoice_number ?? orderId).replace(/[/\\?%*:|"]/g, '-')
      const defaultName = `faktura-${safeNum}.pdf`
      const win = mainWindow ?? undefined
      const { filePath } = await dialog.showSaveDialog(win as any, {
        defaultPath: defaultName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (!filePath) return false

      const source = order.invoice_provider_source as string | null | undefined
      if (source === 'wfirma') {
        const accessKey = dbApi.settings.get('wfirma_access_key') ?? ''
        const secretKey = dbApi.settings.get('wfirma_secret_key') ?? ''
        const appKey = dbApi.settings.get('wfirma_app_key') ?? ''
        const companyId = dbApi.settings.get('wfirma_company_id')
        const invoiceNumber = String(order.invoice_number ?? '').trim()
        if (!invoiceNumber) {
          dialog.showErrorBox('Błąd eksportu PDF', 'Brak numeru faktury w zamówieniu.')
          return false
        }
        const invoiceId = await findInvoiceIdByFullNumber({ fullNumber: invoiceNumber, accessKey, secretKey, appKey, companyId })
        const pdfBuffer = await downloadInvoicePdf({ invoiceId, accessKey, secretKey, appKey, companyId })
        fs.writeFileSync(filePath, pdfBuffer)
        return true
      }

      const client = dbApi.clients.get(order.client_id as number) as Record<string, unknown> | null
      const keys = [
        'company_name', 'first_name', 'last_name', 'personal_nip', 'personal_street', 'personal_building',
        'personal_local', 'personal_postal_code', 'personal_city', 'personal_country', 'personal_address_extra',
        'personal_phone', 'ui_language', 'invoice_logo_path', 'invoice_notes', 'vat_code_definitions'
      ]
      const settings: Record<string, string | null> = {}
      for (const k of keys) settings[k] = dbApi.settings.get(k)
      const lang = (settings.ui_language === 'pl' ? 'pl' : 'en') as 'pl' | 'en'
      const notes = extra?.notes ?? (order.invoice_notes as string | null) ?? undefined
      const bankId = extra?.bankAccountId ?? (order.invoice_bank_account_id as number | null) ?? undefined
      const bankAccount = bankId ? dbApi.bankAccounts.get(bankId) : null
      await writeInvoicePdfToFile(filePath, order as never, client as never, settings, lang, notes, bankAccount as never)
      return true
    } catch (err) {
      console.error('Error exporting invoice PDF:', err)
      const msg = err instanceof Error ? err.message : String(err)
      dialog.showErrorBox('Błąd eksportu PDF', `Nie udało się wygenerować faktury w PDF.\n\nSzczegóły: ${msg}`)
      return false
    }
  })

  // Export one invoice PDF with multiple positions (same invoice_number)
  ipcMain.handle('export:invoicePdfMulti', async (_, orderIds: number[], extra?: { notes?: string; bankAccountId?: number }) => {
    try {
      if (!Array.isArray(orderIds) || orderIds.length === 0) return false
      const orders = orderIds.map((id: number) => dbApi.orders.get(id) as Record<string, unknown> | null).filter(Boolean) as Record<string, unknown>[]
      if (orders.length !== orderIds.length) return false
      const clientId = orders[0].client_id as number
      const invNum = orders[0].invoice_number as string
      if (!clientId || !invNum) return false
      if (orders.some((o: Record<string, unknown>) => o.client_id !== clientId || o.invoice_number !== invNum)) return false
      const safeNum = String(invNum).replace(/[/\\?%*:|"]/g, '-')
      const defaultName = `faktura-${safeNum}.pdf`
      const win = mainWindow ?? undefined
      const { filePath } = await dialog.showSaveDialog(win as any, {
        defaultPath: defaultName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (!filePath) return false

      const source = orders[0].invoice_provider_source as string | null | undefined
      if (source === 'wfirma') {
        const accessKey = dbApi.settings.get('wfirma_access_key') ?? ''
        const secretKey = dbApi.settings.get('wfirma_secret_key') ?? ''
        const appKey = dbApi.settings.get('wfirma_app_key') ?? ''
        const companyId = dbApi.settings.get('wfirma_company_id')
        const invoiceNumber = String(invNum).trim()
        const invoiceId = await findInvoiceIdByFullNumber({ fullNumber: invoiceNumber, accessKey, secretKey, appKey, companyId })
        const pdfBuffer = await downloadInvoicePdf({ invoiceId, accessKey, secretKey, appKey, companyId })
        fs.writeFileSync(filePath, pdfBuffer)
        return true
      }

      const client = dbApi.clients.get(clientId) as Record<string, unknown> | null
      const keys = [
        'company_name', 'first_name', 'last_name', 'personal_nip', 'personal_street', 'personal_building',
        'personal_local', 'personal_postal_code', 'personal_city', 'personal_country', 'personal_address_extra',
        'personal_phone', 'ui_language', 'invoice_logo_path', 'invoice_notes', 'vat_code_definitions'
      ]
      const settings: Record<string, string | null> = {}
      for (const k of keys) settings[k] = dbApi.settings.get(k)
      const lang = (settings.ui_language === 'pl' ? 'pl' : 'en') as 'pl' | 'en'
      const firstOrder = orders[0] as { invoice_notes?: string | null; invoice_bank_account_id?: number | null }
      const notes = extra?.notes ?? firstOrder?.invoice_notes ?? undefined
      const bankId = extra?.bankAccountId ?? firstOrder?.invoice_bank_account_id ?? undefined
      const bankAccount = bankId ? dbApi.bankAccounts.get(bankId) : null
      await writeInvoicePdfMultiToFile(filePath, orders as never[], client as never, settings, lang, notes, bankAccount as never)
      return true
    } catch (err) {
      console.error('Error exporting invoice PDF (multi):', err)
      const msg = err instanceof Error ? err.message : String(err)
      dialog.showErrorBox('Błąd eksportu PDF', `Nie udało się wygenerować faktury w PDF.\n\nSzczegóły: ${msg}`)
      return false
    }
  })

  // Write one invoice PDF to given path (no dialog). For batch export.
  ipcMain.handle('export:invoicePdfToPath', async (_, orderIds: number[], filePath: string, extra?: { notes?: string; bankAccountId?: number }) => {
    try {
      if (!Array.isArray(orderIds) || orderIds.length === 0 || typeof filePath !== 'string' || !filePath.trim()) return false
      const orders = orderIds.map((id: number) => dbApi.orders.get(id) as Record<string, unknown> | null).filter(Boolean) as Record<string, unknown>[]
      if (orders.length !== orderIds.length) return false
      const order = orders[0]
      const clientId = order.client_id as number
      const invNum = order.invoice_number as string
      if (!clientId || !invNum) return false
      if (orders.length > 1 && orders.some((o: Record<string, unknown>) => o.client_id !== clientId || o.invoice_number !== invNum)) return false

      const source = order.invoice_provider_source as string | null | undefined
      if (source === 'wfirma') {
        const accessKey = dbApi.settings.get('wfirma_access_key') ?? ''
        const secretKey = dbApi.settings.get('wfirma_secret_key') ?? ''
        const appKey = dbApi.settings.get('wfirma_app_key') ?? ''
        const companyId = dbApi.settings.get('wfirma_company_id')
        const invoiceNumber = String(invNum).trim()
        const invoiceId = await findInvoiceIdByFullNumber({ fullNumber: invoiceNumber, accessKey, secretKey, appKey, companyId })
        const pdfBuffer = await downloadInvoicePdf({ invoiceId, accessKey, secretKey, appKey, companyId })
        fs.writeFileSync(filePath, pdfBuffer)
        return true
      }

      const client = dbApi.clients.get(clientId) as Record<string, unknown> | null
      const keys = [
        'company_name', 'first_name', 'last_name', 'personal_nip', 'personal_street', 'personal_building',
        'personal_local', 'personal_postal_code', 'personal_city', 'personal_country', 'personal_address_extra',
        'personal_phone', 'ui_language', 'invoice_logo_path', 'invoice_notes', 'vat_code_definitions'
      ]
      const settings: Record<string, string | null> = {}
      for (const k of keys) settings[k] = dbApi.settings.get(k)
      const lang = (settings.ui_language === 'pl' ? 'pl' : 'en') as 'pl' | 'en'
      const firstOrder = orders[0] as { invoice_notes?: string | null; invoice_bank_account_id?: number | null }
      const notes = extra?.notes ?? firstOrder?.invoice_notes ?? undefined
      const bankId = extra?.bankAccountId ?? firstOrder?.invoice_bank_account_id ?? undefined
      const bankAccount = bankId ? dbApi.bankAccounts.get(bankId) : null
      if (orders.length === 1) {
        await writeInvoicePdfToFile(filePath, order as never, client as never, settings, lang, notes, bankAccount as never)
      } else {
        await writeInvoicePdfMultiToFile(filePath, orders as never[], client as never, settings, lang, notes, bankAccount as never)
      }
      return true
    } catch (err) {
      console.error('Error writing invoice PDF to path:', err)
      return false
    }
  })

  // Choose folder for batch export (returns folder path or null)
  ipcMain.handle('dialog:chooseDirectory', async () => {
    const win = mainWindow ?? undefined
    const { filePaths } = await dialog.showOpenDialog(win as any, { properties: ['openDirectory'] })
    return filePaths != null && filePaths.length > 0 ? filePaths[0] : null
  })
}

app.on('window-all-closed', () => app.quit())
