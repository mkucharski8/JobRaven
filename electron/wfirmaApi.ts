/**
 * wFirma API – tworzenie faktury.
 * Dokumentacja: https://doc.wfirma.pl (moduł invoices).
 *
 * URL: POST https://api2.wfirma.pl/invoices/add?inputFormat=json&outputFormat=json[&company_id=...]
 * Autoryzacja: nagłówki HTTP  accessKey / secretKey  (ApiKeysAuth).
 * Ciało: JSON { "invoice": { contractor, invoicecontents, … } }
 */

const WFIRMA_BASE = 'https://api2.wfirma.pl'
const REQUEST_TIMEOUT_MS = 30000
const EU_COUNTRY_PREFIXES = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR',
  'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO',
  'SE', 'SI', 'SK'
])

export type OrderLike = {
  id: number
  client_id: number
  invoice_description?: string | null
  translation_type?: 'oral' | 'written' | null
  service_name?: string | null
  include_service_on_invoice?: number | null
  include_language_pair_on_invoice?: number | null
  include_invoice_description_on_invoice?: number | null
  language_pair_label?: string | null
  unit_name: string
  quantity: number
  rate_per_unit: number
  amount: number
  oral_duration?: number | null
  oral_rate?: number | null
  oral_net?: number | null
  order_vat_rate?: number | null
  order_vat_code?: string | null
  rate_currency?: string | null
}

export type ClientLike = {
  name: string
  short_name?: string
  street: string | null
  building: string | null
  local: string | null
  postal_code: string | null
  city: string | null
  country: string | null
  country_code?: string | null
  address_extra: string | null
  nip: string | null
} | null

export type SellerLike = Record<string, string | null | undefined>

function getOrderVatRate(order: OrderLike): number {
  const hasExemption = order.order_vat_code != null && String(order.order_vat_code).trim() !== ''
  const rate = Number(order.order_vat_rate)
  if (hasExemption) return 0
  if (Number.isFinite(rate)) return rate
  return 23
}

function normalizeClientCountryCode(client: NonNullable<ClientLike>): string {
  const rawCode = String(client.country_code ?? '').trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(rawCode)) return rawCode
  const rawCountry = String(client.country ?? '').trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(rawCountry)) return rawCountry
  return ''
}

function mapWfirmaVatValue(order: OrderLike, client: NonNullable<ClientLike>): string {
  const rawCodeBase = String(order.order_vat_code ?? '').trim().toUpperCase()
  const compact = rawCodeBase.replace(/\s+/g, ' ').trim()
  const firstToken = compact.split(/[\s\-–—]/)[0] || compact
  const rawCode = firstToken === 'O'
    ? 'NP'
    : firstToken === 'E'
      ? 'ZW'
      : (firstToken === 'NP' || firstToken === 'ZW' ? firstToken : compact)
  if (rawCode) {
    if (rawCode === 'NP') {
      const clientCountryCode = normalizeClientCountryCode(client)
      const clientInEu = clientCountryCode ? EU_COUNTRY_PREFIXES.has(clientCountryCode) : false
      // wFirma vat_codes API exposes: NP (nie podl.), NPUE (nie podl. UE), ZW (zw.)
      return clientInEu ? 'NPUE' : 'NP'
    }
    if (rawCode === 'ZW') return 'ZW'
    if (rawCode === 'NIE PODL.' || rawCode === 'NIEPODL.' || rawCode === 'NIE PODL') return 'NP'
    if (rawCode === 'NIE PODL. UE' || rawCode === 'NIE PODL UE' || rawCode === 'NIEPODL.UE') return 'NPUE'
    return rawCode
  }
  return String(getOrderVatRate(order))
}

function buildContractor(client: NonNullable<ClientLike>): Record<string, unknown> {
  const street = [client.street, client.building, client.local].filter(Boolean).join(' ').trim() || '-'
  const country = (client.country_code || client.country || 'PL').toString().trim().toUpperCase()
  const nipRaw = (client.nip ?? '').toString().trim()
  const nip = nipRaw.replace(/\s/g, '')
  const shortName = (client.short_name ?? '').toString().trim()
  const zip = (client.postal_code ?? '').trim() || '00-000'
  const city = (client.city ?? '').trim() || '-'
  const vatMatch = nip.match(/^([A-Za-z]{2})([A-Za-z0-9]+)$/)
  const vatPrefix = vatMatch ? vatMatch[1].toUpperCase() : ''
  const hasEuPrefix = vatPrefix ? EU_COUNTRY_PREFIXES.has(vatPrefix) : false
  const isPolishNip = /^\d{10}$/.test(nip)
  // VIES verification only when identifier has explicit EU country prefix (e.g. DE..., BE..., PL...).
  // Without prefix (or non-EU prefix), keep "custom" to avoid forcing VIES checks.
  const taxIdType = hasEuPrefix ? 'vat' : (isPolishNip ? 'nip' : 'custom')
  return {
    name: client.name || 'Nabywca',
    ...(shortName ? { altname: shortName } : {}),
    street,
    zip,
    city,
    country: country.length === 2 ? country : 'PL',
    ...(nip ? { nip, tax_id_type: taxIdType } : {})
  }
}

function buildInvoiceContent(order: OrderLike, client: NonNullable<ClientLike>): Record<string, unknown> {
  const isOral = order.translation_type === 'oral' && (order.oral_net != null || order.oral_rate != null)
  const qty = isOral ? (Number(order.oral_duration) || 1) : (Number(order.quantity) || 0)
  const unitPrice = isOral ? (Number(order.oral_rate) || 0) : (Number(order.rate_per_unit) || 0)
  const vatValue = mapWfirmaVatValue(order, client)
  const parts: string[] = []
  if (order.include_invoice_description_on_invoice && order.invoice_description) {
    parts.push(String(order.invoice_description).trim())
  }
  if (order.include_language_pair_on_invoice && order.language_pair_label) {
    parts.push(String(order.language_pair_label).trim())
  }
  if (order.include_service_on_invoice && order.service_name) {
    parts.push(String(order.service_name).trim())
  }
  const name = parts.length
    ? parts.join(' – ')
    : (order.invoice_description || order.service_name || 'Usługa tłumaczeniowa').toString().trim() || 'Usługa'
  const unit = (order.unit_name || 'szt.').trim()
  return {
    invoicecontent: {
      name,
      count: qty,
      unit,
      price: unitPrice,
      vat: vatValue
    }
  }
}

function buildInvoiceBody(
  orders: OrderLike[],
  client: ClientLike,
  invoiceNumber: string,
  invoiceDate: string,
  paymentDue: string,
  saleDate?: string | null,
  notes?: string | null,
  isVatPayer?: boolean,
  contractorId?: number | null,
  companyAccountId?: number | null
): Record<string, unknown> {
  if (!client) throw new Error('Brak danych nabywcy (klienta).')
  const currencies = Array.from(new Set(
    orders
      .map(o => String(o.rate_currency ?? '').trim().toUpperCase())
      .filter(Boolean)
  ))
  if (currencies.length > 1) {
    throw new Error(`Wszystkie pozycje faktury muszą mieć tę samą walutę (wykryto: ${currencies.join(', ')}).`)
  }
  const invoiceCurrency = currencies[0] ?? 'PLN'
  const invoicecontents = orders.map(order => buildInvoiceContent(order, client))
  const invoice: Record<string, unknown> = {
    type: isVatPayer !== false ? 'normal' : 'bill',
    paymentmethod: 'transfer',
    paymentdate: paymentDue,
    date: invoiceDate,
    invoicecontents
  }
  if (contractorId != null && contractorId > 0) {
    invoice.contractor_id = contractorId
  } else {
    invoice.contractor = buildContractor(client)
  }
  if (companyAccountId != null && companyAccountId > 0) {
    invoice.company_account_id = companyAccountId
  }
  if (saleDate && saleDate.trim()) invoice.disposaldate = saleDate.trim()
  if (invoiceNumber.trim()) invoice.fullnumber = invoiceNumber.trim()
  // W wFirma brak pola currency oznacza PLN. Dla walut obcych trzeba wysłać currency jawnie.
  if (invoiceCurrency !== 'PLN') invoice.currency = invoiceCurrency
  if (notes && notes.trim()) {
    const text = notes.trim()
    invoice.description = text
    invoice.register_description = text
  }
  return invoice
}

function buildUrl(path: string, companyId?: string | null): string {
  const url = new URL(path, WFIRMA_BASE)
  url.searchParams.set('inputFormat', 'json')
  url.searchParams.set('outputFormat', 'json')
  if (companyId && String(companyId).trim()) {
    url.searchParams.set('company_id', String(companyId).trim())
  }
  return url.toString()
}

/** URL do pobrania PDF (bez outputFormat=json). */
function buildDownloadUrl(path: string, companyId?: string | null): string {
  const url = new URL(path, WFIRMA_BASE)
  if (companyId && String(companyId).trim()) {
    url.searchParams.set('company_id', String(companyId).trim())
  }
  return url.toString()
}

function buildHeaders(accessKey: string, secretKey: string, appKey?: string): Record<string, string> {
  const access = (accessKey || '').trim()
  const secret = (secretKey || '').trim()
  const app = (appKey || '').trim()
  if (!access || !secret) throw new Error('Brak klucza Access lub Secret wFirma. Ustaw oba w Ustawieniach → Faktury.')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    accessKey: access,
    secretKey: secret
  }
  if (app) headers.appKey = app
  return headers
}

function extractErrorMessage(data: unknown, text: string, status: number): string {
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
    if (Array.isArray(obj.errors)) {
      return (obj.errors as Array<{ message?: string }>).map(e => e.message || '').filter(Boolean).join('; ')
    }
    const status_ = obj.status as Record<string, unknown> | undefined
    if (status_) {
      const msg = status_.message ?? status_.description ?? status_.error
      if (typeof msg === 'string') return msg
    }
    const response = obj.response as Record<string, unknown> | undefined
    if (response && typeof response.message === 'string') return response.message
  }
  return text.slice(0, 300) || `wFirma HTTP ${status}`
}

/** Wyciąga pełny komunikat błędu z odpowiedzi API (status.code !== OK). */
function formatStatusError(data: unknown): string {
  if (typeof data !== 'object' || data === null) return 'wFirma: ERROR'
  const obj = data as Record<string, unknown>
  const status = obj.status as Record<string, unknown> | undefined
  const code = status?.code != null ? String(status.code) : 'ERROR'
  const msg =
    status?.message ?? status?.description ?? status?.error ?? (status?.response as Record<string, unknown>)?.message
    ?? obj.message ?? obj.error
  const msgStr = typeof msg === 'string' ? msg.trim() : ''
  if (msgStr) return `wFirma: ${code} – ${msgStr}`
  if (Array.isArray(obj.errors) && obj.errors.length > 0) {
    const parts = (obj.errors as Array<{ message?: string }>).map(e => e.message || '').filter(Boolean)
    if (parts.length) return `wFirma: ${code} – ${parts.join('; ')}`
  }
  const details = obj.details ?? status?.details
  if (typeof details === 'object' && details !== null && !Array.isArray(details)) {
    const parts = Object.entries(details as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`)
    if (parts.length) return `wFirma: ${code} – ${parts.join('; ')}`
  }
  const firstKey = Object.keys(obj).find(k => k !== 'status')
  const firstBlock = firstKey ? (obj[firstKey] as Record<string, unknown>) : null
  const inv = firstBlock?.invoice as Record<string, unknown> | undefined
  const errs = inv?.errors as Record<string, { error?: { message?: string } }> | undefined
  if (errs && typeof errs === 'object') {
    const firstErr = Object.values(errs)[0]?.error?.message
    if (typeof firstErr === 'string' && firstErr.trim()) return `wFirma: ${code} – ${firstErr.trim()}`
  }
  const contractor = inv?.contractor as Record<string, unknown> | undefined
  const contractorErrs = contractor?.errors as Record<string, { error?: { message?: string } }> | undefined
  if (contractorErrs && typeof contractorErrs === 'object') {
    const firstErr = Object.values(contractorErrs)[0]?.error?.message
    if (typeof firstErr === 'string' && firstErr.trim()) return `wFirma: ${code} – ${firstErr.trim()}`
  }
  return `wFirma: ${code}`
}

function normalizeNip(v: unknown): string {
  return String(v ?? '').replace(/\s/g, '').trim()
}

function pickContractorNip(contractor: Record<string, unknown>): string {
  const nipDirect = normalizeNip(contractor.nip)
  if (nipDirect) return nipDirect
  const details = contractor.contractor_detail as Record<string, unknown> | undefined
  const nipDetails = normalizeNip(details?.nip)
  if (nipDetails) return nipDetails
  const detailsCamel = contractor.contractorDetail as Record<string, unknown> | undefined
  return normalizeNip(detailsCamel?.nip)
}

/** Pobiera ID kontrahenta z odpowiedzi (find lub add). */
function parseContractorIdFromResponse(data: unknown, expectedNip?: string): number | null {
  if (typeof data !== 'object' || data === null) return null
  const obj = data as Record<string, unknown>
  const expected = normalizeNip(expectedNip)
  const candidateIds: Array<{ id: number; nip: string }> = []

  const pushCandidate = (contractor: Record<string, unknown> | undefined) => {
    if (!contractor) return
    const rawId = contractor.id
    const id = (typeof rawId === 'number' && rawId > 0)
      ? rawId
      : (typeof rawId === 'string' && /^\d+$/.test(rawId) ? parseInt(rawId, 10) : null)
    if (!id) return
    candidateIds.push({ id, nip: pickContractorNip(contractor) })
  }

  const contractorsAny = obj.contractors
  if (Array.isArray(contractorsAny) && contractorsAny.length > 0) {
    for (const row of contractorsAny) {
      pushCandidate((row as Record<string, unknown>)?.contractor as Record<string, unknown> | undefined)
    }
  }
  if (typeof contractorsAny === 'object' && contractorsAny !== null) {
    const contractorsObj = contractorsAny as Record<string, unknown>
    const keys = Object.keys(contractorsObj).filter(k => /^\d+$/.test(k))
    for (const k of keys) {
      const row = contractorsObj[k] as Record<string, unknown>
      pushCandidate(row?.contractor as Record<string, unknown> | undefined)
    }
  }
  const numKey = Object.keys(obj).find(k => k !== 'status' && /^\d+$/.test(k))
  const block = numKey ? (obj[numKey] as Record<string, unknown>) : null
  pushCandidate(block?.contractor as Record<string, unknown> | undefined)

  if (expected) {
    const exact = candidateIds.find(c => c.nip === expected)
    return exact?.id ?? null
  }
  if (candidateIds.length) return candidateIds[0].id
  return null
}

function parseInvoiceNumberFromResponse(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const obj = data as Record<string, unknown>
  const invoicesAny = obj.invoices
  let invoiceObj: Record<string, unknown> | undefined

  if (Array.isArray(invoicesAny) && invoicesAny.length > 0) {
    invoiceObj = invoicesAny[0]?.invoice as Record<string, unknown> | undefined
  } else if (typeof invoicesAny === 'object' && invoicesAny !== null) {
    const invoicesObj = invoicesAny as Record<string, unknown>
    const firstKey = Object.keys(invoicesObj).find(k => /^\d+$/.test(k))
    if (firstKey) {
      invoiceObj = (invoicesObj[firstKey] as Record<string, unknown>)?.invoice as Record<string, unknown> | undefined
    }
  }

  if (!invoiceObj) {
    const firstKey = Object.keys(obj).find(k => k !== 'status' && /^\d+$/.test(k))
    const firstBlock = firstKey ? (obj[firstKey] as Record<string, unknown>) : null
    invoiceObj = firstBlock?.invoice as Record<string, unknown> | undefined
  }

  const raw = invoiceObj?.fullnumber ?? invoiceObj?.number
  return (typeof raw === 'string' && raw.trim()) ? raw.trim() : null
}

/** Wyciąga obiekt faktury z odpowiedzi API (find) – do odczytu id i fullnumber. */
function getInvoiceFromFindResponse(data: unknown): Record<string, unknown> | null {
  if (typeof data !== 'object' || data === null) return null
  const obj = data as Record<string, unknown>
  const invoicesAny = obj.invoices
  let invoiceObj: Record<string, unknown> | undefined

  if (Array.isArray(invoicesAny) && invoicesAny.length > 0) {
    invoiceObj = invoicesAny[0]?.invoice as Record<string, unknown> | undefined
  } else if (typeof invoicesAny === 'object' && invoicesAny !== null) {
    const invoicesObj = invoicesAny as Record<string, unknown>
    const firstKey = Object.keys(invoicesObj).find(k => /^\d+$/.test(k))
    if (firstKey) {
      invoiceObj = (invoicesObj[firstKey] as Record<string, unknown>)?.invoice as Record<string, unknown> | undefined
    }
  }

  if (!invoiceObj) {
    const firstKey = Object.keys(obj).find(k => k !== 'status' && /^\d+$/.test(k))
    const firstBlock = firstKey ? (obj[firstKey] as Record<string, unknown>) : null
    invoiceObj = firstBlock?.invoice as Record<string, unknown> | undefined
  }

  return invoiceObj ?? null
}

/** Wyciąga ID faktury z odpowiedzi API (find). */
function parseInvoiceIdFromResponse(data: unknown): number | null {
  const invoiceObj = getInvoiceFromFindResponse(data)
  if (!invoiceObj) return null
  const raw = invoiceObj.id
  if (typeof raw === 'number' && raw > 0) return raw
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return parseInt(raw, 10)
  return null
}

function normalizeFullnumberForCompare(v: string): string {
  return v.replace(/\s+/g, ' ').trim()
}

/**
 * Znajduje fakturę w wFirma po pełnym numerze. Zwraca ID faktury albo rzuca błąd.
 * Używa formatu jak w oficjalnym PHP (invoices.parameters.conditions["0"].condition). Weryfikuje, że zwrócona faktura ma ten sam numer.
 */
export async function findInvoiceIdByFullNumber(params: {
  fullNumber: string
  accessKey: string
  secretKey: string
  appKey?: string
  companyId?: string | null
}): Promise<number> {
  const { fullNumber, accessKey, secretKey, appKey, companyId } = params
  const num = (fullNumber ?? '').toString().trim()
  if (!num) throw new Error('Brak numeru faktury do wyszukania w wFirma.')
  const url = buildUrl('/invoices/find', companyId)
  const headers = buildHeaders(accessKey, secretKey, appKey)

  // Format jak w zmilonas/wfirma-php-api: pojedynczy obiekt, conditions z kluczami "0","1",...
  const bodyVariants: Array<Record<string, unknown>> = [
    { invoices: { parameters: { page: 1, limit: 100, conditions: { '0': { condition: { field: 'fullnumber', operator: 'eq', value: num } } } } } },
    { invoices: { parameters: { page: 1, limit: 100, conditions: { '0': { condition: { field: 'number', operator: 'eq', value: num } } } } } },
    { invoices: { parameters: { page: 1, limit: 100, conditions: { '0': { condition: { field: 'Invoice.fullnumber', operator: 'eq', value: num } } } } } }
  ]

  let lastData: unknown = null
  let lastErr: Error | null = null

  for (const body of bodyVariants) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      })
      clearTimeout(timeout)
      const text = await res.text()
      let data: unknown = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        lastErr = new Error(res.ok ? 'Nieprawidłowa odpowiedź wFirma (find invoice).' : `wFirma: ${res.status} – ${text.slice(0, 200)}`)
        continue
      }
      lastData = data
      if (!res.ok) {
        lastErr = new Error(extractErrorMessage(data, text, res.status))
        continue
      }
      const statusObj = (data as Record<string, unknown>)?.status as Record<string, unknown> | undefined
      if (statusObj?.code && statusObj.code !== 'OK') {
        lastErr = new Error(formatStatusError(data))
        continue
      }
      const id = parseInvoiceIdFromResponse(data)
      if (id == null) {
        lastErr = new Error(`wFirma: nie znaleziono faktury o numerze „${num}".`)
        continue
      }
      const invoiceObj = getInvoiceFromFindResponse(data)
      const returnedFullnumber = invoiceObj?.fullnumber ?? invoiceObj?.number
      const returnedNum = (typeof returnedFullnumber === 'string' && returnedFullnumber.trim())
        ? normalizeFullnumberForCompare(returnedFullnumber)
        : ''
      if (returnedNum && normalizeFullnumberForCompare(num) !== returnedNum) {
        throw new Error(`wFirma zwróciło inną fakturę („${returnedNum}”) niż szukana „${num}". Sprawdź format numeru w API.`)
      }
      return id
    } catch (err) {
      clearTimeout(timeout)
      if (err instanceof Error && err.message.includes('zwróciło inną fakturę')) throw err
      lastErr = err instanceof Error ? err : new Error(String(err))
    }
  }

  // Fallback: API ignoruje warunek – pobieramy listę stronami i szukamy po fullnumber po stronie klienta
  const numNorm = normalizeFullnumberForCompare(num)
  const parseInvoiceList = (data: unknown): Array<Record<string, unknown>> => {
    const list: Array<Record<string, unknown>> = []
    const invoicesAny = (data as Record<string, unknown>)?.invoices
    if (Array.isArray(invoicesAny)) {
      for (const row of invoicesAny) {
        const inv = (row as Record<string, unknown>)?.invoice as Record<string, unknown> | undefined
        if (inv) list.push(inv)
      }
    } else if (typeof invoicesAny === 'object' && invoicesAny !== null) {
      const obj = invoicesAny as Record<string, unknown>
      for (const k of Object.keys(obj)) {
        if (!/^\d+$/.test(k)) continue
        const row = obj[k] as Record<string, unknown>
        const inv = row?.invoice as Record<string, unknown> | undefined
        if (inv) list.push(inv)
      }
    }
    return list
  }

  for (let page = 1; page <= 20; page++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const fallbackBody = { invoices: { parameters: { page, limit: 100 } } }
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(fallbackBody),
        signal: controller.signal
      })
      clearTimeout(timeout)
      const text = await res.text()
      let data: unknown = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        if (page === 1 && lastErr) throw lastErr
        break
      }
      if (!res.ok) {
        if (page === 1) throw (lastErr || new Error(extractErrorMessage(data, text, res.status)))
        break
      }
      const statusObj = (data as Record<string, unknown>)?.status as Record<string, unknown> | undefined
      if (statusObj?.code && statusObj.code !== 'OK') {
        if (page === 1) throw (lastErr || new Error(formatStatusError(data)))
        break
      }
      const list = parseInvoiceList(data)
      for (const inv of list) {
        const fn = inv.fullnumber ?? inv.number
        const s = (typeof fn === 'string' && fn.trim()) ? normalizeFullnumberForCompare(fn) : ''
        if (s === numNorm) {
          const rawId = inv.id
          const id = (typeof rawId === 'number' && rawId > 0) ? rawId : (typeof rawId === 'string' && /^\d+$/.test(rawId) ? parseInt(rawId, 10) : null)
          if (id != null) return id
        }
      }
      if (list.length < 100) break
    } catch (err) {
      clearTimeout(timeout)
      if (err instanceof Error && err.message.includes('zwróciło inną fakturę')) throw err
      if (page === 1 && lastErr) throw lastErr
      throw err
    }
  }

  throw new Error(`wFirma: nie znaleziono faktury o numerze „${num}".`)
}

/**
 * Pobiera PDF faktury z wFirma po ID. Zwraca buffer PDF. Przy błędzie rzuca (bez fallbacku).
 */
export async function downloadInvoicePdf(params: {
  invoiceId: number
  accessKey: string
  secretKey: string
  appKey?: string
  companyId?: string | null
}): Promise<Buffer> {
  const { invoiceId, accessKey, secretKey, appKey, companyId } = params
  const url = buildDownloadUrl(`/invoices/download/${invoiceId}`, companyId)
  const headers: Record<string, string> = {
    Accept: 'application/pdf',
    accessKey: (accessKey || '').trim(),
    secretKey: (secretKey || '').trim()
  }
  if ((appKey || '').trim()) headers.appKey = (appKey || '').trim()
  if (!headers.accessKey || !headers.secretKey) throw new Error('Brak klucza Access lub Secret wFirma. Ustaw oba w Ustawieniach → Faktury.')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) {
      const text = await res.text()
      let msg = `wFirma: HTTP ${res.status}`
      try {
        const data = text ? JSON.parse(text) : null
        msg = extractErrorMessage(data, text, res.status)
      } catch {
        if (text.length < 300) msg = text || msg
      }
      throw new Error(msg)
    }
    const buf = await res.arrayBuffer()
    return Buffer.from(buf)
  } catch (err) {
    clearTimeout(timeout)
    if (err instanceof Error) throw err
    throw new Error(String(err))
  }
}

/**
 * Znajduje kontrahenta w wFirma po NIP lub dodaje nowego. Zwraca ID kontrahenta albo null (wtedy faktura użyje inline contractor).
 */
async function ensureContractorId(
  client: NonNullable<ClientLike>,
  accessKey: string,
  secretKey: string,
  appKey: string | undefined,
  companyId: string | null | undefined
): Promise<number | null> {
  const nip = (client.nip ?? '').toString().trim().replace(/\s/g, '')
  const contractor = buildContractor(client)
  const urlFind = buildUrl('/contractors/find', companyId)
  const urlAdd = buildUrl('/contractors/add', companyId)
  const headers = buildHeaders(accessKey, secretKey, appKey)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const tryFindByNip = async (): Promise<number | null> => {
    if (nip.length < 10) return null
    const findPayloads: unknown[] = [
      [{ contractors: { parameters: { page: 1, limit: 1, conditions: { condition: { field: 'nip', operator: 'eq', value: nip } } } } }],
      [{ contractors: { parameters: { page: 1, limit: 1, conditions: { condition: [{ field: 'nip', operator: 'eq', value: nip }] } } } }],
      [{ contractors: { parameters: { page: 1, limit: 1, conditions: { condition: { field: 'ContractorDetail.nip', operator: 'eq', value: nip } } } } }],
      [{ contractors: { parameters: { page: 1, limit: 1, conditions: { condition: [{ field: 'ContractorDetail.nip', operator: 'eq', value: nip }] } } } }]
    ]

    for (const payload of findPayloads) {
      const resFind = await fetch(urlFind, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      })
      const textFind = await resFind.text()
      if (!resFind.ok) continue
      let dataFind: unknown = null
      try {
        dataFind = textFind ? JSON.parse(textFind) : null
      } catch {
        continue
      }
      const status = (dataFind as Record<string, unknown>)?.status as Record<string, unknown> | undefined
      if (status?.code && status.code !== 'OK') continue
      const id = parseContractorIdFromResponse(dataFind, nip)
      if (id != null) return id
    }
    return null
  }
  try {
    const foundBeforeAdd = await tryFindByNip()
    if (foundBeforeAdd != null) {
      console.log('[wFirma] contractor found by NIP, id =', foundBeforeAdd)
      clearTimeout(timeout)
      return foundBeforeAdd
    }

    const bodyAdd = [{ contractor }]
    const resAdd = await fetch(urlAdd, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyAdd),
      signal: controller.signal
    })
    clearTimeout(timeout)
    const textAdd = await resAdd.text()
    if (!resAdd.ok) {
      console.warn('[wFirma] contractors/add failed:', resAdd.status, textAdd.slice(0, 300))
      return null
    }
    const dataAdd = textAdd ? JSON.parse(textAdd) : null
    const status = (dataAdd as Record<string, unknown>)?.status as Record<string, unknown> | undefined
    if (status?.code && status.code !== 'OK') {
      // Częsty przypadek: kontrahent już istnieje (np. konflikt NIP). Wtedy robimy ponowne find po NIP.
      const foundAfterAdd = await tryFindByNip()
      if (foundAfterAdd != null) {
        console.log('[wFirma] contractor found after add fallback, id =', foundAfterAdd)
        return foundAfterAdd
      }
      console.warn('[wFirma] contractors/add status:', status.code)
      return null
    }
    const addedId = parseContractorIdFromResponse(dataAdd, nip)
    if (addedId != null) {
      console.log('[wFirma] contractor added, id =', addedId)
      return addedId
    }
    // Fallback: część odpowiedzi add nie zwraca bezpośrednio ID.
    const foundAfterSuccessAdd = await tryFindByNip()
    if (foundAfterSuccessAdd != null) {
      console.log('[wFirma] contractor found after successful add, id =', foundAfterSuccessAdd)
      return foundAfterSuccessAdd
    }
    return null
  } catch (err) {
    clearTimeout(timeout)
    console.warn('[wFirma] ensureContractorId error:', err)
    return null
  }
}

export type CreateInvoiceParams = {
  orders: OrderLike[]
  client: ClientLike
  seller: SellerLike
  invoiceNumber: string
  invoiceDate: string
  paymentDue: string
  saleDate?: string | null
  notes?: string | null
  /** Czy sprzedawca (Twoje dane) jest płatnikiem VAT – decyduje o type: normal (VAT) vs bill (bez VAT). */
  isVatPayer?: boolean
  accessKey: string
  secretKey: string
  appKey?: string
  companyId?: string | null
  companyAccountId?: number | null
}

export async function createInvoiceFromOrder(params: CreateInvoiceParams): Promise<{ invoiceNumber: string }> {
  const { orders, client, invoiceNumber, invoiceDate, paymentDue, saleDate, notes, isVatPayer, accessKey, secretKey, appKey, companyId, companyAccountId } = params
  if (!orders.length) throw new Error('Brak zleceń do faktury.')

  let contractorId: number | null = null
  if (client) {
    contractorId = await ensureContractorId(client, accessKey, secretKey, appKey, companyId)
  }
  console.log('[wFirma] contractor id used for invoice:', contractorId)

  const invoiceData = buildInvoiceBody(orders, client, invoiceNumber, invoiceDate, paymentDue, saleDate, notes, isVatPayer, contractorId, companyAccountId)
  const url = buildUrl('/invoices/add', companyId)
  const headers = buildHeaders(accessKey, secretKey, appKey)

  const requestBody = [{ invoice: invoiceData }]

  console.log('[wFirma] POST', url)
  console.log('[wFirma] body:', JSON.stringify(requestBody, null, 2))

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    })
    clearTimeout(timeout)
    const text = await res.text()
    console.log('[wFirma] response status:', res.status)
    console.log('[wFirma] response body:', text.slice(0, 1000))

    let data: unknown
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      throw new Error(res.ok ? 'Nieprawidłowa odpowiedź z wFirma.' : `wFirma: ${res.status} – ${text.slice(0, 200)}`)
    }

    if (!res.ok) {
      throw new Error(extractErrorMessage(data, text, res.status))
    }

    const statusObj = (data as Record<string, unknown>)?.status as Record<string, unknown> | undefined
    if (statusObj?.code && statusObj.code !== 'OK') {
      console.log('[wFirma] API zwróciło błąd, pełna odpowiedź:', JSON.stringify(data, null, 2).slice(0, 1500))
      throw new Error(formatStatusError(data))
    }

    const invoiceNumberFromApi = parseInvoiceNumberFromResponse(data)
    console.log('[wFirma] invoice number from API:', invoiceNumberFromApi)

    const finalNumber = (typeof invoiceNumberFromApi === 'string' && invoiceNumberFromApi)
      ? invoiceNumberFromApi
      : invoiceNumber.trim() || '—'
    return { invoiceNumber: finalNumber }
  } catch (err) {
    clearTimeout(timeout)
    console.error('[wFirma] error:', err)
    if (err instanceof Error) throw err
    throw new Error(String(err))
  }
}

function asInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.trunc(v)
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return parseInt(v.trim(), 10)
  return null
}

type WfirmaCompanyAccount = {
  id: number
  account_number: string
  bank_name?: string
  name?: string
  currency?: string
}

function parseCompanyAccounts(data: unknown): WfirmaCompanyAccount[] {
  if (typeof data !== 'object' || data === null) return []
  const obj = data as Record<string, unknown>
  const out: WfirmaCompanyAccount[] = []
  const push = (raw: Record<string, unknown> | undefined) => {
    if (!raw) return
    const id = asInt(raw.id)
    const accountNumber = String(raw.account_number ?? raw.number ?? '').trim()
    if (!id || !accountNumber) return
    out.push({
      id,
      account_number: accountNumber,
      name: String(raw.name ?? '').trim() || undefined,
      bank_name: String(raw.bank_name ?? '').trim() || undefined,
      currency: String(raw.currency ?? '').trim() || undefined
    })
  }

  const group = obj.company_accounts
  if (Array.isArray(group)) {
    for (const row of group) {
      push((row as Record<string, unknown>)?.company_account as Record<string, unknown> | undefined)
    }
  } else if (typeof group === 'object' && group !== null) {
    const groupObj = group as Record<string, unknown>
    for (const k of Object.keys(groupObj)) {
      if (!/^\d+$/.test(k)) continue
      const row = groupObj[k] as Record<string, unknown>
      push(row?.company_account as Record<string, unknown> | undefined)
    }
  }

  for (const k of Object.keys(obj)) {
    if (!/^\d+$/.test(k)) continue
    const row = obj[k] as Record<string, unknown>
    push(row?.company_account as Record<string, unknown> | undefined)
  }
  return out
}

export async function listCompanyAccounts(params: {
  accessKey: string
  secretKey: string
  appKey?: string
  companyId?: string | null
}): Promise<WfirmaCompanyAccount[]> {
  const { accessKey, secretKey, appKey, companyId } = params
  const a = (accessKey || '').trim()
  const s = (secretKey || '').trim()
  if (!a || !s) {
    throw new Error('Wpisz Access key i Secret key.')
  }
  const url = buildUrl('/company_accounts/find', companyId)
  const headers = buildHeaders(accessKey, secretKey, appKey)
  delete headers['Content-Type']
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal })
    clearTimeout(timeout)
    const text = await res.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      if (!res.ok) throw new Error(`wFirma: ${res.status} – ${text.slice(0, 200)}`)
      return []
    }
    if (!res.ok) throw new Error(extractErrorMessage(data, text, res.status))
    const statusObj = (data as Record<string, unknown>)?.status as Record<string, unknown> | undefined
    if (statusObj?.code && statusObj.code !== 'OK') throw new Error(formatStatusError(data))
    return parseCompanyAccounts(data)
  } catch (err) {
    clearTimeout(timeout)
    if (err instanceof Error) throw err
    throw new Error(String(err))
  }
}

export async function testConnection(params: {
  accessKey: string
  secretKey: string
  appKey?: string
  companyId?: string | null
}): Promise<{ ok: boolean; message: string }> {
  const { accessKey, secretKey, appKey, companyId } = params
  const a = (accessKey || '').trim()
  const s = (secretKey || '').trim()
  if (!a || !s) {
    return { ok: false, message: 'Wpisz Access key i Secret key.' }
  }
  const url = buildUrl('/company_accounts/find', companyId)
  const headers = buildHeaders(accessKey, secretKey, appKey)
  delete headers['Content-Type']
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal })
    clearTimeout(timeout)
    const text = await res.text()
    if (res.ok) {
      return { ok: true, message: 'OK' }
    }
    let msg = `HTTP ${res.status}`
    try {
      const data = text ? JSON.parse(text) : null
      msg = extractErrorMessage(data, text, res.status)
    } catch {
      if (text.length < 200) msg = text
    }
    return { ok: false, message: msg }
  } catch (err) {
    clearTimeout(timeout)
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, message: message || 'Błąd sieci lub timeout.' }
  }
}
