import fs from 'fs'
import path from 'path'
import PDFDocument from 'pdfkit'

type PDFDoc = InstanceType<typeof PDFDocument>

/** Resolve logo path and return { buffer, pathForPdf } – pathForPdf is the first existing path for PDFKit fallback. */
function loadLogo(logoPath: string | null | undefined): { buffer: Buffer | null; pathForPdf: string | null } {
  const out: { buffer: Buffer | null; pathForPdf: string | null } = { buffer: null, pathForPdf: null }
  if (!logoPath || typeof logoPath !== 'string') return out
  const raw = String(logoPath).trim()
  if (!raw) return out

  let p = raw
  if (p.startsWith('file:///')) p = p.slice(8)
  else if (p.startsWith('file://')) p = p.slice(7)
  p = p.replace(/\//g, path.sep)
  const candidates: string[] = [p, path.normalize(p)]
  if (!path.isAbsolute(p)) candidates.push(path.resolve(process.cwd(), p))
  try {
    const decoded = decodeURIComponent(raw)
    if (decoded !== raw) candidates.push(decoded.replace(/\//g, path.sep))
  } catch { /* ignore */ }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        if (!out.pathForPdf) out.pathForPdf = candidate
        const buf = fs.readFileSync(candidate)
        if (buf && buf.length > 0) {
          out.buffer = buf
          return out
        }
      }
    } catch { /* try next */ }
  }

  if (process.env.NODE_ENV !== 'production' && !out.buffer) {
    console.warn('[invoice PDF] Logo path set but file not found:', raw)
  }
  return out
}

type OrderRecord = {
  id: number
  client_id: number
  client_short_name: string
  order_number: string | null
  invoice_number: string | null
  invoice_date: string | null
  invoice_sale_date?: string | null
  payment_due_at: string | null
  received_at: string
  specialization: string | null
  specialization_name: string | null
  language_pair_label: string | null
  invoice_description?: string | null
  translation_type?: 'oral' | 'written' | null
  service_name?: string | null
  include_service_on_invoice?: number | null
  include_language_pair_on_invoice?: number | null
  include_invoice_description_on_invoice?: number | null
  unit_name: string
  quantity: number
  rate_per_unit: number
  amount: number
  oral_duration?: number | null
  oral_rate?: number | null
  oral_net?: number | null
  oral_gross?: number | null
  order_vat_rate?: number | null
  order_vat_code?: string | null
  rate_currency?: string | null
}
type ClientRecord = {
  id: number
  name: string
  short_name: string
  street: string | null
  building: string | null
  local: string | null
  postal_code: string | null
  city: string | null
  country: string | null
  country_code?: string | null
  address_extra: string | null
  nip: string | null
  phone: string | null
}

function formatDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Kod kraju (np. PL) → nazwa w języku faktury (Polska / Poland). */
function countryCodeToLabel(code: string | null | undefined, lang: 'pl' | 'en'): string {
  const c = (code ?? '').trim().toUpperCase()
  if (!c || c.length !== 2) return c || ''
  try {
    const dn = new Intl.DisplayNames([lang === 'pl' ? 'pl-PL' : 'en'], { type: 'region' })
    return dn.of(c) ?? c
  } catch {
    return c
  }
}

function countryToLabel(country: string | null | undefined, countryCode: string | null | undefined, lang: 'pl' | 'en'): string {
  const fromCode = countryCodeToLabel(countryCode, lang)
  if (fromCode) return fromCode
  const raw = (country ?? '').trim()
  if (!raw) return ''
  // Legacy rows may store translated country name instead of code.
  const asCode = countryCodeToLabel(raw, lang)
  if (asCode) return asCode
  try {
    const targetDn = new Intl.DisplayNames([lang === 'pl' ? 'pl-PL' : 'en'], { type: 'region' })
    const plDn = new Intl.DisplayNames(['pl-PL'], { type: 'region' })
    const enDn = new Intl.DisplayNames(['en'], { type: 'region' })
    for (let a = 65; a <= 90; a += 1) {
      for (let b = 65; b <= 90; b += 1) {
        const code = String.fromCharCode(a) + String.fromCharCode(b)
        const plName = plDn.of(code)
        const enName = enDn.of(code)
        if ((plName && plName.toLowerCase() === raw.toLowerCase()) || (enName && enName.toLowerCase() === raw.toLowerCase())) {
          return targetDn.of(code) ?? raw
        }
      }
    }
  } catch {
    // ignore and keep raw label
  }
  return raw
}

function formatMoney(n: number): string {
  return Number(n).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Dla faktury w języku EN kod kanoniczny (NP/ZW) mapujemy na O/E. Dla PL drukujemy NP/ZW. */
function vatCodeForInvoiceDisplay(storedCode: string | null | undefined, lang: 'pl' | 'en'): string {
  const c = String(storedCode ?? '').trim().toUpperCase()
  if (!c) return ''
  if (lang === 'en') {
    if (c === 'NP') return 'O'
    if (c === 'ZW') return 'E'
  }
  return c
}

function getOrderVatRateAndDisplay(order: OrderRecord, lang?: 'pl' | 'en'): { vatRate: number; vatDisplay: string } {
  const defaultVatRate = 23
  const hasExemption = order.order_vat_code != null && String(order.order_vat_code).trim() !== ''
  const orderVatRate = Number(order.order_vat_rate)
  const vatRate = hasExemption ? 0 : (Number.isFinite(orderVatRate) ? orderVatRate : defaultVatRate)
  const code = order.order_vat_code?.trim()
  const vatDisplay = code ? (vatCodeForInvoiceDisplay(code, lang ?? 'pl') || code) : `${vatRate}%`
  return { vatRate, vatDisplay }
}

type BankAccountRecord = {
  bank_name: string
  bank_address?: string
  account_number: string
  swift: string
  currency: string
} | null

/** Definicje kodów VAT (na fakturze drukujemy zawsze kod, np. NP, ZW – nie etykietę). */
type VatCodeDef = { code_pl: string; label_pl: string; code_en: string; label_en: string }

export function buildInvoicePdf(
  doc: PDFDoc,
  order: OrderRecord,
  client: ClientRecord | null,
  settings: {
    company_name: string
    first_name: string
    last_name: string
    personal_nip: string
    personal_street: string
    personal_building: string
    personal_local: string
    personal_postal_code: string
    personal_city: string
    personal_country: string
    personal_address_extra: string
    personal_phone: string
    vat_rate?: string
    invoice_logo_path?: string
  },
  lang: 'pl' | 'en',
  fonts: { normal: string; bold: string },
  notes?: string,
  bankAccount?: BankAccountRecord,
  vatCodeDefinitions?: VatCodeDef[]
): void {
  const { vatRate, vatDisplay } = getOrderVatRateAndDisplay(order, lang)
  /** Do faktury bierzemy wyłącznie wartości zapisane w zleceniu. Dla ustnych (oral): oral_rate, oral_net, oral_duration; dla pisemnych: rate_per_unit, amount, quantity. */
  const isOral = order.translation_type === 'oral' && (order.oral_net != null || order.oral_rate != null)
  const net = isOral ? (Number(order.oral_net) || 0) : (Number(order.amount) || 0)
  const vat = (net * vatRate) / 100
  const gross = net + vat
  const invQty = isOral ? (Number(order.oral_duration) || 1) : (Number(order.quantity) || 0)
  const invUnitPrice = isOral ? (Number(order.oral_rate) ?? 0) : (Number(order.rate_per_unit) ?? 0)

  const t = lang === 'pl' ? {
    title: 'Faktura',
    invoiceNo: 'Nr faktury',
    invoiceDate: 'Data wystawienia',
    saleDate: 'Data sprzedaży',
    paymentDue: 'Termin płatności',
    seller: 'Sprzedawca',
    buyer: 'Nabywca',
    desc: 'Opis',
    qty: 'Ilość',
    unit: 'Jedn.',
    price: 'Cena jedn.',
    value: 'Wartość',
    net: 'Razem netto',
    vatLabel: 'VAT',
    gross: 'Razem brutto',
    vatBreakdown: 'Rozbicie VAT',
    netShort: 'Netto',
    vatShort: 'VAT',
    grossShort: 'Brutto'
  } : {
    title: 'Invoice',
    invoiceNo: 'Invoice no.',
    invoiceDate: 'Invoice date',
    saleDate: 'Sale date',
    paymentDue: 'Payment due',
    seller: 'Seller',
    buyer: 'Buyer',
    desc: 'Description',
    qty: 'Qty',
    unit: 'Unit',
    price: 'Unit price',
    value: 'Amount',
    net: 'Total net',
    vatLabel: 'VAT',
    gross: 'Total gross',
    vatBreakdown: 'VAT breakdown',
    netShort: 'Net',
    vatShort: 'VAT',
    grossShort: 'Gross'
  }

  let y = 50

  // Logo (prawy górny róg)
  const logo = loadLogo(settings.invoice_logo_path)
  if (logo.buffer?.length || logo.pathForPdf) {
    try {
      if (logo.buffer?.length) doc.image(logo.buffer, 430, y, { fit: [110, 55] })
      else if (logo.pathForPdf) doc.image(logo.pathForPdf, 430, y, { fit: [110, 55] })
    } catch { /* ignore unsupported format */ }
  }

  doc.fontSize(18).font(fonts.bold)
  doc.text(t.title, 50, y)
  y = doc.y + 14

  doc.fontSize(10).font(fonts.normal)
  const currency = (order.rate_currency && String(order.rate_currency).trim()) ? String(order.rate_currency).trim().toUpperCase() : 'PLN'
  doc.text(`${t.invoiceNo}: ${order.invoice_number ?? '—'}`, 50, y)
  y += 14
  doc.text(`${t.invoiceDate}: ${formatDate(order.invoice_date)}`, 50, y)
  y += 14
  doc.text(`${t.saleDate}: ${formatDate(order.invoice_sale_date ?? null)}`, 50, y)
  y += 14
  doc.text(`${t.paymentDue}: ${formatDate(order.payment_due_at)}`, 50, y)
  y += 14
  doc.text(`${lang === 'pl' ? 'Waluta' : 'Currency'}: ${currency}`, 50, y)
  y += 20

  const sellerName = (settings.company_name || `${settings.first_name || ''} ${settings.last_name || ''}`).trim() || '—'
  const countryLabel = countryCodeToLabel(settings.personal_country, lang)
  const sellerAddr = [
    settings.personal_street,
    [settings.personal_building, settings.personal_local].filter(Boolean).join(' / '),
    [settings.personal_postal_code, settings.personal_city].filter(Boolean).join(' '),
    countryLabel,
    settings.personal_address_extra
  ].filter(Boolean).join(', ')

  doc.font(fonts.bold).fontSize(9).text(t.seller + ':', 50, y)
  y = doc.y + 2
  doc.font(fonts.normal).fontSize(9).text(sellerName, 50, y)
  y = doc.y + 2
  if (sellerAddr) { doc.text(sellerAddr, 50, y); y = doc.y + 2 }
  if (settings.personal_nip) { doc.text(`NIP: ${settings.personal_nip}`, 50, y); y = doc.y + 2 }
  if (settings.personal_phone) { doc.text(settings.personal_phone, 50, y); y = doc.y + 2 }
  y += 10

  doc.font(fonts.bold).fontSize(9).text(t.buyer + ':', 50, y)
  y = doc.y + 2
  const buyerName = client?.name || client?.short_name || order.client_short_name || '—'
  doc.font(fonts.normal).fontSize(9).text(buyerName, 50, y)
  y = doc.y + 2
  if (client) {
    const buyerCountry = countryToLabel(client.country, client.country_code ?? null, lang)
    const buyerAddr = [
      client.street,
      [client.building, client.local].filter(Boolean).join(' / '),
      [client.postal_code, client.city].filter(Boolean).join(' '),
      buyerCountry,
      client.address_extra
    ].filter(Boolean).join(', ')
    if (buyerAddr) { doc.text(buyerAddr, 50, y); y = doc.y + 2 }
    if (client.nip) { doc.text(`NIP: ${client.nip}`, 50, y); y = doc.y + 2 }
  }
  y += 16

  const builtFromServicePair = (() => {
    const parts: string[] = []
    if ((order.include_service_on_invoice ?? 1) === 1 && order.service_name?.trim()) parts.push(order.service_name.trim())
    if ((order.include_language_pair_on_invoice ?? 1) === 1 && order.language_pair_label?.trim()) parts.push(order.language_pair_label.trim())
    if (parts.length) return parts.join(' · ')
    return [order.specialization_name ?? order.specialization, order.language_pair_label].filter(Boolean).join(' · ') || (lang === 'pl' ? 'Usługa tłumaczeniowa' : 'Translation service')
  })()
  const desc = (order.translation_type === 'oral' || order.translation_type === 'written')
    ? (order.invoice_description?.trim() || builtFromServicePair)
    : (() => {
        let d = builtFromServicePair
        if ((order.include_invoice_description_on_invoice ?? 1) === 1 && order.invoice_description?.trim())
          d = d ? d + ' · ' + order.invoice_description.trim() : order.invoice_description.trim()
        return d
      })()

  const colDescW = 278
  const tableRight = 550
  const colStart = 328
  const colTotalW = tableRight - colStart
  const colW = Math.floor(colTotalW / 4)
  const colQtyX = colStart
  const colUnitX = colStart + colW
  const colPriceX = colStart + colW * 2
  const colValueX = colStart + colW * 3
  const colValueW = colTotalW - colW * 3
  doc.font(fonts.bold).fontSize(9)
  doc.text(t.desc, 50, y)
  doc.text(t.qty, colQtyX, y, { width: colW, align: 'right' })
  doc.text(t.unit, colUnitX, y, { width: colW, align: 'right' })
  doc.text(t.price, colPriceX, y, { width: colW, align: 'right' })
  doc.text(t.value, colValueX, y, { width: colValueW, align: 'right' })
  y += 12
  doc.moveTo(50, y).lineTo(550, y).stroke()
  y += 8
  doc.font(fonts.normal).fontSize(9)
  doc.text(desc, 50, y, { width: colDescW })
  const line1Y = y
  doc.text(String(invQty), colQtyX, line1Y, { width: colW, align: 'right' })
  doc.text(order.unit_name || (isOral ? (lang === 'pl' ? 'godz.' : 'hr') : ''), colUnitX, line1Y, { width: colW, align: 'right' })
  doc.text(formatMoney(invUnitPrice), colPriceX, line1Y, { width: colW, align: 'right' })
  doc.text(formatMoney(net), colValueX, line1Y, { width: colValueW, align: 'right' })
  y = Math.max(doc.y, line1Y) + 10

  doc.moveTo(50, y).lineTo(550, y).stroke()
  y += 10
  doc.font(fonts.bold).fontSize(9).text(t.vatBreakdown, 320, y)
  y += 12
  doc.font(fonts.bold).fontSize(8)
  doc.text(t.netShort, 390, y, { width: 50, align: 'right' })
  doc.text(t.vatShort, 445, y, { width: 50, align: 'right' })
  doc.text(t.grossShort, 500, y, { width: 50, align: 'right' })
  y += 10
  doc.font(fonts.normal).fontSize(9)
  doc.text(`${t.vatLabel} ${vatDisplay}`, 320, y, { width: 70 })
  doc.text(formatMoney(net), 390, y, { width: 50, align: 'right' })
  doc.text(formatMoney(vat), 445, y, { width: 50, align: 'right' })
  doc.text(formatMoney(gross), 500, y, { width: 50, align: 'right' })
  y += 14
  doc.moveTo(320, y).lineTo(550, y).stroke()
  y += 4
  doc.font(fonts.bold).fontSize(9)
  doc.text(t.net, 320, y, { width: 70 })
  doc.text(formatMoney(net), 390, y, { width: 50, align: 'right' })
  doc.text(formatMoney(vat), 445, y, { width: 50, align: 'right' })
  doc.text(formatMoney(gross), 500, y, { width: 50, align: 'right' })
  y = doc.y + 20

  // Konto bankowe
  if (bankAccount && bankAccount.account_number) {
    const bankTitle = lang === 'pl' ? 'Dane do przelewu' : 'Bank account'
    doc.font(fonts.bold).fontSize(9).text(bankTitle + ':', 50, y)
    y = doc.y + 2
    doc.font(fonts.normal).fontSize(9)
    if (bankAccount.bank_name) { doc.text(bankAccount.bank_name, 50, y); y = doc.y + 2 }
    if (bankAccount.bank_address && bankAccount.bank_address.trim()) { doc.text(bankAccount.bank_address.trim(), 50, y); y = doc.y + 2 }
    doc.text(bankAccount.account_number, 50, y); y = doc.y + 2
    if (bankAccount.swift) { doc.text(`SWIFT/BIC: ${bankAccount.swift}`, 50, y); y = doc.y + 2 }
    doc.text(`${lang === 'pl' ? 'Waluta' : 'Currency'}: ${bankAccount.currency}`, 50, y)
    y = doc.y + 12
  }

  // Uwagi
  if (notes && notes.trim()) {
    const notesTitle = lang === 'pl' ? 'Uwagi' : 'Notes'
    doc.font(fonts.bold).fontSize(9).text(notesTitle + ':', 50, y)
    y = doc.y + 2
    doc.font(fonts.normal).fontSize(8).text(notes.trim(), 50, y, { width: 500 })
  }
}

/** Jedna faktura z wieloma pozycjami (każde zlecenie = jedna pozycja). */
export function buildInvoicePdfMulti(
  doc: PDFDoc,
  orders: OrderRecord[],
  client: ClientRecord | null,
  settings: {
    company_name: string
    first_name: string
    last_name: string
    personal_nip: string
    personal_street: string
    personal_building: string
    personal_local: string
    personal_postal_code: string
    personal_city: string
    personal_country: string
    personal_address_extra: string
    personal_phone: string
    vat_rate: string
    invoice_logo_path?: string
  },
  lang: 'pl' | 'en',
  fonts: { normal: string; bold: string },
  notes?: string,
  bankAccount?: BankAccountRecord
): void {
  if (orders.length === 0) return
  let totalNet = 0
  let totalVat = 0
  const vatBuckets = new Map<string, { label: string; net: number; vat: number; gross: number }>()
  for (const o of orders) {
    const isOralOrder = o.translation_type === 'oral' && (o.oral_net != null || o.oral_rate != null)
    const net = isOralOrder ? (Number(o.oral_net) || 0) : (Number(o.amount) || 0)
    const { vatRate, vatDisplay } = getOrderVatRateAndDisplay(o, lang)
    const vat = (net * vatRate) / 100
    const gross = net + vat
    totalNet += net
    totalVat += vat
    const bucket = vatBuckets.get(vatDisplay) ?? { label: vatDisplay, net: 0, vat: 0, gross: 0 }
    bucket.net += net
    bucket.vat += vat
    bucket.gross += gross
    vatBuckets.set(vatDisplay, bucket)
  }
  const totalGross = totalNet + totalVat
  const vatRows = Array.from(vatBuckets.values()).sort((a, b) => a.label.localeCompare(b.label))
  const first = orders[0]
  const currencyMulti = (first.rate_currency && String(first.rate_currency).trim()) ? String(first.rate_currency).trim().toUpperCase() : 'PLN'

  const t = lang === 'pl' ? {
    title: 'Faktura',
    invoiceNo: 'Nr faktury',
    invoiceDate: 'Data wystawienia',
    saleDate: 'Data sprzedaży',
    paymentDue: 'Termin płatności',
    seller: 'Sprzedawca',
    buyer: 'Nabywca',
    desc: 'Opis',
    qty: 'Ilość',
    unit: 'Jedn.',
    price: 'Cena jedn.',
    value: 'Wartość',
    net: 'Razem netto',
    vatLabel: 'VAT',
    gross: 'Razem brutto',
    vatBreakdown: 'Rozbicie VAT',
    netShort: 'Netto',
    vatShort: 'VAT',
    grossShort: 'Brutto'
  } : {
    title: 'Invoice',
    invoiceNo: 'Invoice no.',
    invoiceDate: 'Invoice date',
    saleDate: 'Sale date',
    paymentDue: 'Payment due',
    seller: 'Seller',
    buyer: 'Buyer',
    desc: 'Description',
    qty: 'Qty',
    unit: 'Unit',
    price: 'Unit price',
    value: 'Amount',
    net: 'Total net',
    vatLabel: 'VAT',
    gross: 'Total gross',
    vatBreakdown: 'VAT breakdown',
    netShort: 'Net',
    vatShort: 'VAT',
    grossShort: 'Gross'
  }

  let y = 50

  // Logo (prawy górny róg)
  const logoMulti = loadLogo(settings.invoice_logo_path)
  if (logoMulti.buffer?.length || logoMulti.pathForPdf) {
    try {
      if (logoMulti.buffer?.length) doc.image(logoMulti.buffer, 430, y, { fit: [110, 55] })
      else if (logoMulti.pathForPdf) doc.image(logoMulti.pathForPdf, 430, y, { fit: [110, 55] })
    } catch { /* ignore */ }
  }

  doc.fontSize(18).font(fonts.bold)
  doc.text(t.title, 50, y)
  y = doc.y + 14
  doc.fontSize(10).font(fonts.normal)
  doc.text(`${t.invoiceNo}: ${first.invoice_number ?? '—'}`, 50, y)
  y += 14
  doc.text(`${t.invoiceDate}: ${formatDate(first.invoice_date)}`, 50, y)
  y += 14
  doc.text(`${t.saleDate}: ${formatDate(first.invoice_sale_date ?? null)}`, 50, y)
  y += 14
  doc.text(`${t.paymentDue}: ${formatDate(first.payment_due_at)}`, 50, y)
  y += 14
  doc.text(`${lang === 'pl' ? 'Waluta' : 'Currency'}: ${currencyMulti}`, 50, y)
  y += 20

  const sellerName = (settings.company_name || `${settings.first_name || ''} ${settings.last_name || ''}`).trim() || '—'
  const countryLabelMulti = countryCodeToLabel(settings.personal_country, lang)
  const sellerAddr = [
    settings.personal_street,
    [settings.personal_building, settings.personal_local].filter(Boolean).join(' / '),
    [settings.personal_postal_code, settings.personal_city].filter(Boolean).join(' '),
    countryLabelMulti,
    settings.personal_address_extra
  ].filter(Boolean).join(', ')
  doc.font(fonts.bold).fontSize(9).text(t.seller + ':', 50, y)
  y = doc.y + 2
  doc.font(fonts.normal).fontSize(9).text(sellerName, 50, y)
  y = doc.y + 2
  if (sellerAddr) { doc.text(sellerAddr, 50, y); y = doc.y + 2 }
  if (settings.personal_nip) { doc.text(`NIP: ${settings.personal_nip}`, 50, y); y = doc.y + 2 }
  if (settings.personal_phone) { doc.text(settings.personal_phone, 50, y); y = doc.y + 2 }
  y += 10
  doc.font(fonts.bold).fontSize(9).text(t.buyer + ':', 50, y)
  y = doc.y + 2
  const buyerName = client?.name || client?.short_name || first.client_short_name || '—'
  doc.font(fonts.normal).fontSize(9).text(buyerName, 50, y)
  y = doc.y + 2
  if (client) {
    const buyerCountry = countryToLabel(client.country, client.country_code ?? null, lang)
    const buyerAddr = [
      client.street,
      [client.building, client.local].filter(Boolean).join(' / '),
      [client.postal_code, client.city].filter(Boolean).join(' '),
      buyerCountry,
      client.address_extra
    ].filter(Boolean).join(', ')
    if (buyerAddr) { doc.text(buyerAddr, 50, y); y = doc.y + 2 }
    if (client.nip) { doc.text(`NIP: ${client.nip}`, 50, y); y = doc.y + 2 }
  }
  y += 16

  const colDescW = 278
  const tableRight = 550
  const colStart = 328
  const colTotalW = tableRight - colStart
  const colW = Math.floor(colTotalW / 4)
  const colQtyX = colStart
  const colUnitX = colStart + colW
  const colPriceX = colStart + colW * 2
  const colValueX = colStart + colW * 3
  const colValueW = colTotalW - colW * 3
  doc.font(fonts.bold).fontSize(9)
  doc.text(t.desc, 50, y)
  doc.text(t.qty, colQtyX, y, { width: colW, align: 'right' })
  doc.text(t.unit, colUnitX, y, { width: colW, align: 'right' })
  doc.text(t.price, colPriceX, y, { width: colW, align: 'right' })
  doc.text(t.value, colValueX, y, { width: colValueW, align: 'right' })
  y += 12
  doc.moveTo(50, y).lineTo(550, y).stroke()
  y += 8
  doc.font(fonts.normal).fontSize(9)
  for (const order of orders) {
    const built = (() => {
      const parts: string[] = []
      if ((order.include_service_on_invoice ?? 1) === 1 && order.service_name?.trim()) parts.push(order.service_name.trim())
      if ((order.include_language_pair_on_invoice ?? 1) === 1 && order.language_pair_label?.trim()) parts.push(order.language_pair_label.trim())
      if (parts.length) return parts.join(' · ')
      return [order.specialization_name ?? order.specialization, order.language_pair_label].filter(Boolean).join(' · ') || (lang === 'pl' ? 'Usługa tłumaczeniowa' : 'Translation service')
    })()
    const desc = (order.translation_type === 'oral' || order.translation_type === 'written')
      ? (order.invoice_description?.trim() || built)
      : (() => {
          let d = built
          if ((order.include_invoice_description_on_invoice ?? 1) === 1 && order.invoice_description?.trim())
            d = d ? d + ' · ' + order.invoice_description.trim() : order.invoice_description.trim()
          return d
        })()
    const isOralOrder = order.translation_type === 'oral' && (order.oral_net != null || order.oral_rate != null)
    const net = isOralOrder ? (Number(order.oral_net) || 0) : (Number(order.amount) || 0)
    const invQty = isOralOrder ? (Number(order.oral_duration) || 1) : (Number(order.quantity) || 0)
    const invUnitPrice = isOralOrder ? (Number(order.oral_rate) ?? 0) : (Number(order.rate_per_unit) ?? 0)
    doc.text(desc, 50, y, { width: colDescW })
    const lineY = y
    doc.text(String(invQty), colQtyX, lineY, { width: colW, align: 'right' })
    doc.text(order.unit_name || (isOralOrder ? (lang === 'pl' ? 'godz.' : 'hr') : ''), colUnitX, lineY, { width: colW, align: 'right' })
    doc.text(formatMoney(invUnitPrice), colPriceX, lineY, { width: colW, align: 'right' })
    doc.text(formatMoney(net), colValueX, lineY, { width: colValueW, align: 'right' })
    y = Math.max(doc.y, lineY) + 8
  }
  doc.moveTo(50, y).lineTo(550, y).stroke()
  y += 10
  doc.font(fonts.bold).fontSize(9).text(t.vatBreakdown, 320, y)
  y += 12
  doc.font(fonts.bold).fontSize(8)
  doc.text(t.netShort, 390, y, { width: 50, align: 'right' })
  doc.text(t.vatShort, 445, y, { width: 50, align: 'right' })
  doc.text(t.grossShort, 500, y, { width: 50, align: 'right' })
  y += 10
  doc.font(fonts.normal).fontSize(9)
  for (const row of vatRows) {
    doc.text(`${t.vatLabel} ${row.label}`, 320, y, { width: 70 })
    doc.text(formatMoney(row.net), 390, y, { width: 50, align: 'right' })
    doc.text(formatMoney(row.vat), 445, y, { width: 50, align: 'right' })
    doc.text(formatMoney(row.gross), 500, y, { width: 50, align: 'right' })
    y += 12
  }
  doc.moveTo(320, y).lineTo(550, y).stroke()
  y += 4
  doc.font(fonts.bold).fontSize(9)
  doc.text(t.net, 320, y, { width: 70 })
  doc.text(formatMoney(totalNet), 390, y, { width: 50, align: 'right' })
  doc.text(formatMoney(totalVat), 445, y, { width: 50, align: 'right' })
  doc.text(formatMoney(totalGross), 500, y, { width: 50, align: 'right' })
  y = doc.y + 20

  // Konto bankowe
  if (bankAccount && bankAccount.account_number) {
    const bankTitle = lang === 'pl' ? 'Dane do przelewu' : 'Bank account'
    doc.font(fonts.bold).fontSize(9).text(bankTitle + ':', 50, y)
    y = doc.y + 2
    doc.font(fonts.normal).fontSize(9)
    if (bankAccount.bank_name) { doc.text(bankAccount.bank_name, 50, y); y = doc.y + 2 }
    if (bankAccount.bank_address && bankAccount.bank_address.trim()) { doc.text(bankAccount.bank_address.trim(), 50, y); y = doc.y + 2 }
    doc.text(bankAccount.account_number, 50, y); y = doc.y + 2
    if (bankAccount.swift) { doc.text(`SWIFT/BIC: ${bankAccount.swift}`, 50, y); y = doc.y + 2 }
    doc.text(`${lang === 'pl' ? 'Waluta' : 'Currency'}: ${bankAccount.currency}`, 50, y)
    y = doc.y + 12
  }

  // Uwagi
  if (notes && notes.trim()) {
    const notesTitle = lang === 'pl' ? 'Uwagi' : 'Notes'
    doc.font(fonts.bold).fontSize(9).text(notesTitle + ':', 50, y)
    y = doc.y + 2
    doc.font(fonts.normal).fontSize(8).text(notes.trim(), 50, y, { width: 500 })
  }
}

export function writeInvoicePdfToFile(
  filePath: string,
  order: OrderRecord,
  client: ClientRecord | null,
  settings: Record<string, string | null>,
  lang: 'pl' | 'en',
  notes?: string,
  bankAccount?: BankAccountRecord
): Promise<void> {
  const s = {
    company_name: settings.company_name ?? '',
    first_name: settings.first_name ?? '',
    last_name: settings.last_name ?? '',
    personal_nip: settings.personal_nip ?? '',
    personal_street: settings.personal_street ?? '',
    personal_building: settings.personal_building ?? '',
    personal_local: settings.personal_local ?? '',
    personal_postal_code: settings.personal_postal_code ?? '',
    personal_city: settings.personal_city ?? '',
    personal_country: settings.personal_country ?? '',
    personal_address_extra: settings.personal_address_extra ?? '',
    personal_phone: settings.personal_phone ?? '',
    vat_rate: settings.vat_rate ?? '23',
    invoice_logo_path: settings.invoice_logo_path ?? ''
  }
  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  const fonts = { normal: 'Helvetica', bold: 'Helvetica-Bold' as const }
  try {
    const base = path.join(__dirname, 'data')
    const regular = path.join(base, 'NotoSans-Regular.ttf')
    const bold = path.join(base, 'NotoSans-Bold.ttf')
    if (fs.existsSync(regular) && fs.existsSync(bold)) {
      doc.registerFont('Body', regular)
      doc.registerFont('Body-Bold', bold)
      ;(fonts as { normal: string; bold: string }).normal = 'Body'
      ;(fonts as { normal: string; bold: string }).bold = 'Body-Bold'
    }
  } catch {
    // fallback do Helvetica
  }
  let vatCodeDefinitions: VatCodeDef[] = []
  try {
    const raw = settings.vat_code_definitions
    if (typeof raw === 'string' && raw.trim()) {
      const arr = JSON.parse(raw) as unknown
      if (Array.isArray(arr)) vatCodeDefinitions = arr as VatCodeDef[]
    }
  } catch { /* ignore */ }
  const w = fs.createWriteStream(filePath)
  doc.pipe(w)
  buildInvoicePdf(doc, order, client, s, lang, fonts, notes, bankAccount, vatCodeDefinitions)
  doc.end()
  return new Promise((resolve, reject) => {
    w.on('finish', () => resolve())
    w.on('error', reject)
    doc.on('error', reject)
  })
}

export function writeInvoicePdfMultiToFile(
  filePath: string,
  orders: OrderRecord[],
  client: ClientRecord | null,
  settings: Record<string, string | null>,
  lang: 'pl' | 'en',
  notes?: string,
  bankAccount?: BankAccountRecord
): Promise<void> {
  if (orders.length === 0) return Promise.resolve()
  const s = {
    company_name: settings.company_name ?? '',
    first_name: settings.first_name ?? '',
    last_name: settings.last_name ?? '',
    personal_nip: settings.personal_nip ?? '',
    personal_street: settings.personal_street ?? '',
    personal_building: settings.personal_building ?? '',
    personal_local: settings.personal_local ?? '',
    personal_postal_code: settings.personal_postal_code ?? '',
    personal_city: settings.personal_city ?? '',
    personal_country: settings.personal_country ?? '',
    personal_address_extra: settings.personal_address_extra ?? '',
    personal_phone: settings.personal_phone ?? '',
    vat_rate: settings.vat_rate ?? '23',
    invoice_logo_path: settings.invoice_logo_path ?? ''
  }
  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  const fonts = { normal: 'Helvetica', bold: 'Helvetica-Bold' as const }
  try {
    const base = path.join(__dirname, 'data')
    const regular = path.join(base, 'NotoSans-Regular.ttf')
    const bold = path.join(base, 'NotoSans-Bold.ttf')
    if (fs.existsSync(regular) && fs.existsSync(bold)) {
      doc.registerFont('Body', regular)
      doc.registerFont('Body-Bold', bold)
      ;(fonts as { normal: string; bold: string }).normal = 'Body'
      ;(fonts as { normal: string; bold: string }).bold = 'Body-Bold'
    }
  } catch {
    // fallback do Helvetica
  }
  const w = fs.createWriteStream(filePath)
  doc.pipe(w)
  buildInvoicePdfMulti(doc, orders, client, s, lang, fonts, notes, bankAccount)
  doc.end()
  return new Promise((resolve, reject) => {
    w.on('finish', () => resolve())
    w.on('error', reject)
    doc.on('error', reject)
  })
}
