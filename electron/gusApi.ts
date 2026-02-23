import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

/**
 * Pobieranie danych firmy po NIP:
 * 1. Próba z rejestru VAT (wl-api.mf.gov.pl)
 * 2. Przy błędzie – GUS BIR (natywne wywołania SOAP, bez Pythona)
 * 3. Przy ponownym błędzie – komunikat, żeby wprowadzić dane ręcznie.
 */

const VAT_API_BASE = 'https://wl-api.mf.gov.pl/api'

export type CompanyFromVat = {
  name: string
  short_name: string
  nip: string
  street: string
  building: string
  local: string
  postal_code: string
  city: string
  country: string
  regon: string | null
  statusVat: string
  /** When API returns person name (sole proprietor), we put it here and leave name empty for user to enter business name */
  contact_person: string
}

/**
 * Parse Polish address string.
 * Examples:
 *   "UL. EXAMPLE 77/100, 00-001 WARSZAWA" → street="UL. EXAMPLE", building="77", local="100", postal_code="00-001", city="WARSZAWA"
 *   "ALEJA NIEPODLEGŁOŚCI 208, 00-925 WARSZAWA" → street="ALEJA NIEPODLEGŁOŚCI", building="208", local="", ...
 */
function parseAddress(addr: string | null): { street: string; building: string; local: string; postal_code: string; city: string } {
  const empty = { street: '', building: '', local: '', postal_code: '', city: '' }
  if (!addr || !addr.trim()) return empty
  const parts = addr.split(',').map(p => p.trim())
  if (parts.length < 2) {
    const streetPart = addr.trim()
    const { street, building, local } = parseStreetLine(streetPart)
    return { ...empty, street, building, local }
  }
  const streetPart = parts[0]
  const postalCityPart = parts[1]
  const postalMatch = postalCityPart.match(/(\d{2}-\d{3})\s*(.*)/)
  const postal_code = postalMatch ? postalMatch[1] : ''
  const city = postalMatch ? postalMatch[2].trim() : postalCityPart
  const { street, building, local } = parseStreetLine(streetPart)
  return { street, building, local, postal_code, city }
}

/** Heuristic: true if name looks like "First Last" (sole proprietor) not a company name. */
function isPersonName(name: string): boolean {
  if (!name || name.length > 80) return false
  const lower = name.toLowerCase()
  const companySuffixes = [' s.a.', ' sa ', ' sp. z o.o.', ' sp.z o.o.', ' spółka ', ' zoo ', ' s.c.', ' s.j.', ' s.k.', ' s.p.', ' sp. k.', ' fundacja ', ' stowarzyszenie ', ' z o.o.', ' zo.o.']
  if (companySuffixes.some(s => lower.includes(s))) return false
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length > 3) return false
  if (words.length <= 1) return false
  return true
}

/** Extract street name, building no. and unit no. (e.g. "77/100") from first part of address. */
function parseStreetLine(streetPart: string): { street: string; building: string; local: string } {
  const trimmed = streetPart.trim()
  if (!trimmed) return { street: '', building: '', local: '' }
  // Match at end: optional spaces, building number (digits + optional letter), optional /unit (e.g. 77/100)
  const match = trimmed.match(/\s+(\d+[a-zA-Z]?)\s*(?:\/\s*(\d+[a-zA-Z]?))?\s*$/)
  if (match) {
    const street = trimmed.slice(0, match.index).trim()
    const building = match[1] || ''
    const local = match[2] || ''
    return { street, building, local }
  }
  return { street: trimmed, building: '', local: '' }
}

/** Krok 1: pobierz z rejestru VAT. */
async function fetchFromVatRegister(cleanedNip: string): Promise<CompanyFromVat | { error: string }> {
  const date = new Date().toISOString().slice(0, 10)
  const url = `${VAT_API_BASE}/search/nip/${cleanedNip}?date=${date}`
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    let errMsg = `HTTP ${res.status}`
    try {
      const json = JSON.parse(text)
      if (json.message) errMsg = json.message
    } catch {
      if (text.length < 200) errMsg = text
    }
    return { error: errMsg }
  }
  const data = await res.json()
  const subject = data?.result?.subject
  if (!subject) {
    return { error: 'Company not found in VAT register' }
  }
  const addr = subject.workingAddress || subject.residenceAddress || ''
  const { street, building, local, postal_code, city } = parseAddress(addr)
  const rawName = (subject.name || '').trim()
  const isLikelyPersonName = isPersonName(rawName)
  // Never clear company name in form fill; for sole proprietors keep both fields.
  const name = rawName
  const contact_person = isLikelyPersonName ? rawName : ''
  const shortName = name
    ? (name.length > 30 ? name.slice(0, 27) + '…' : name)
    : (rawName.length > 30 ? rawName.slice(0, 27) + '…' : rawName)
  return {
    name,
    short_name: shortName,
    nip: subject.nip || cleanedNip,
    street,
    building,
    local,
    postal_code,
    city,
    country: 'Poland',
    regon: subject.regon || null,
    statusVat: subject.statusVat || '',
    contact_person
  }
}

// ========= GUS BIR – natywne wywołania SOAP (bez Pythona) =========

const GUS_BIR_ENDPOINT = 'https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc'
const GUS_BIR_API_KEY = 'd9d3ee105bf04a23a2e2'
const GUS_BIR_NS = 'http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl'
const execFileAsync = promisify(execFile)

/** Wyślij SOAP envelope do GUS BIR i zwróć body odpowiedzi jako tekst. */
async function gusSoapCall(action: string, body: string, extraHeaders?: Record<string, string>): Promise<string> {
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:ns="${GUS_BIR_NS}">
  <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <wsa:To>${GUS_BIR_ENDPOINT}</wsa:To>
    <wsa:Action>${action}</wsa:Action>
  </soap:Header>
  <soap:Body>${body}</soap:Body>
</soap:Envelope>`
  const headers: Record<string, string> = {
    'Content-Type': 'application/soap+xml; charset=utf-8',
    ...extraHeaders
  }
  const res = await fetch(GUS_BIR_ENDPOINT, { method: 'POST', headers, body: envelope })
  const text = await res.text()
  if (!res.ok) {
    const fault = extractTag(text, 'faultstring') || extractTag(text, 'Text') || text.slice(0, 300)
    throw new Error(`HTTP ${res.status}: ${fault}`)
  }
  return text
}

/** Wyciągnij wartość tagu z odpowiedzi XML (prosty regex – wystarczający dla GUS). */
function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, 'i')
  const m = xml.match(re)
  return m ? m[1].trim() : ''
}

/** Krok 2: pobierz z GUS BIR (natywne SOAP, zero zależności od Pythona). */
async function fetchFromGusBir(cleanedNip: string): Promise<CompanyFromVat | { error: string }> {
  let sid = ''
  try {
    // 1. Zaloguj
    const loginBody = `<ns:Zaloguj><ns:pKluczUzytkownika>${GUS_BIR_API_KEY}</ns:pKluczUzytkownika></ns:Zaloguj>`
    const loginResp = await gusSoapCall(
      `${GUS_BIR_NS}/Zaloguj`,
      loginBody
    )
    sid = extractTag(loginResp, 'ZalogujResult')
    if (!sid) {
      return { error: 'GUS BIR: nie udało się zalogować (brak SID)' }
    }

    // 2. DaneSzukajPodmioty
    const searchBody = `<ns:DaneSzukajPodmioty>
  <ns:pParametryWyszukiwania>
    <ns:Nip>${cleanedNip}</ns:Nip>
  </ns:pParametryWyszukiwania>
</ns:DaneSzukajPodmioty>`
    const searchResp = await gusSoapCall(
      `${GUS_BIR_NS}/DaneSzukajPodmioty`,
      searchBody,
      { sid }
    )
    const searchResult = extractTag(searchResp, 'DaneSzukajPodmiotyResult')
    // GUS zwraca HTML-encoded XML wewnątrz CDATA lub entity-escaped
    const decoded = searchResult
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    if (!decoded || !decoded.includes('<dane>')) {
      return { error: 'GUS BIR: brak danych dla podanego NIP' }
    }

    // 3. Parsuj <dane> elementy
    const daneMatch = decoded.match(/<dane>([\s\S]*?)<\/dane>/)
    if (!daneMatch) {
      return { error: 'GUS BIR: nie znaleziono danych w odpowiedzi' }
    }
    const dane = daneMatch[0]
    const get = (tag: string) => extractTag(dane, tag)

    const nazwa = get('Nazwa')
    const nip = get('Nip') || cleanedNip
    const regon = get('Regon') || null
    const ulica = get('Ulica')
    const nrNieruchomosci = get('NrNieruchomosci')
    const nrLokalu = get('NrLokalu')
    const kodPocztowy = get('KodPocztowy')
    const miejscowosc = get('Miejscowosc')

    const shortName = nazwa.length > 30 ? nazwa.slice(0, 27) + '…' : nazwa

    return {
      name: nazwa,
      short_name: shortName,
      nip,
      street: ulica,
      building: nrNieruchomosci,
      local: nrLokalu,
      postal_code: kodPocztowy,
      city: miejscowosc,
      country: 'Poland',
      regon,
      statusVat: '',
      contact_person: ''
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { error: `GUS BIR: ${msg}` }
  } finally {
    // 4. Wyloguj (cleanup, nie blokuj na błędzie)
    if (sid) {
      try {
        const logoutBody = `<ns:Wyloguj><ns:pIdentyfikatorSesji>${sid}</ns:pIdentyfikatorSesji></ns:Wyloguj>`
        await gusSoapCall(
          `${GUS_BIR_NS}/Wyloguj`,
          logoutBody,
          { sid }
        )
      } catch { /* ignore */ }
    }
  }
}

/**
 * Krok 2a: uruchom lokalny skrypt Python `gus.py` (jeśli dostępny).
 * To najbliższe zachowanie do ręcznego testu użytkownika.
 */
async function fetchFromLocalPythonGus(cleanedNip: string): Promise<CompanyFromVat | { error: string }> {
  const scriptPath = path.resolve(process.cwd(), 'gus.py')
  if (!fs.existsSync(scriptPath)) {
    return { error: 'Python GUS helper not found (gus.py)' }
  }

  const runners: Array<{ cmd: string; args: string[] }> = [
    { cmd: 'py', args: ['-3', '-X', 'utf8', scriptPath, cleanedNip] },
    { cmd: 'python', args: ['-X', 'utf8', scriptPath, cleanedNip] }
  ]

  let lastErr = ''
  for (const r of runners) {
    try {
      const { stdout } = await execFileAsync(r.cmd, r.args, {
        windowsHide: true,
        timeout: 20000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      })
      const lines = String(stdout ?? '').split(/\r?\n/).map(x => x.trim()).filter(Boolean)
      const payload = lines[lines.length - 1] ?? ''
      if (!payload) return { error: 'Python GUS helper returned empty response' }
      const parsed = JSON.parse(payload) as CompanyFromVat | { error: string }
      if ('error' in parsed) return { error: `Python GUS: ${parsed.error}` }
      return parsed
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  return { error: `Python GUS: ${lastErr || 'execution failed'}` }
}

/**
 * Pobiera dane firmy po NIP: najpierw Python GUS (najpełniejsze dane),
 * potem rejestr VAT, a na końcu natywne GUS SOAP jako fallback.
 */
export async function fetchCompanyByNip(nip: string): Promise<CompanyFromVat | { error: string }> {
  const cleaned = nip.replace(/\s|-/g, '')
  if (!/^\d{10}$/.test(cleaned)) {
    return { error: 'Invalid NIP (must be 10 digits)' }
  }

  let pyGusError = ''
  let vatError = ''
  let gusError = ''

  try {
    const pyGusResult = await fetchFromLocalPythonGus(cleaned)
    if (!('error' in pyGusResult)) return pyGusResult
    pyGusError = pyGusResult.error
  } catch (e) {
    pyGusError = e instanceof Error ? e.message : String(e)
  }

  try {
    const vatResult = await fetchFromVatRegister(cleaned)
    if (!('error' in vatResult)) return vatResult
    vatError = vatResult.error
  } catch (e) {
    vatError = e instanceof Error ? e.message : String(e)
  }

  try {
    const gusResult = await fetchFromGusBir(cleaned)
    if (!('error' in gusResult)) return gusResult
    gusError = gusResult.error
  } catch (e) {
    gusError = e instanceof Error ? e.message : String(e)
  }

  const details: string[] = []
  if (pyGusError) details.push(`PY-GUS: ${pyGusError}`)
  if (vatError) details.push(`VAT: ${vatError}`)
  if (gusError) details.push(`GUS: ${gusError}`)
  return { error: details.length ? details.join(' | ') : 'MANUAL_ENTRY_REQUIRED' }
}
