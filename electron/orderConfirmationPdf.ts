import fs from 'fs'
import path from 'path'
import PDFDocument from 'pdfkit'

type PDFDoc = InstanceType<typeof PDFDocument>

type OrderRecord = {
  id: number
  client_id: number
  client_short_name: string
  order_number: string | null
  received_at: string
  deadline_at: string | null
  specialization: string | null
  specialization_name: string | null
  language_pair_label: string | null
  unit_name: string
  quantity: number
  rate_per_unit: number
  amount: number
  order_vat_rate?: number | null
  order_vat_code?: string | null
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
  address_extra: string | null
  nip: string | null
  phone: string | null
}

function formatDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

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

function formatMoney(n: number): string {
  return Number(n).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatMoneyWithCurrency(n: number, currency: string | null | undefined): string {
  const cur = (currency && String(currency).trim()) || 'PLN'
  return `${formatMoney(n)} ${cur.toUpperCase()}`
}

export function buildOrderConfirmationPdf(
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
    vat_rate: string
  },
  lang: 'pl' | 'en',
  fonts: { normal: string; bold: string }
): void {
  const defaultVatRate = parseFloat(settings.vat_rate || '23') || 23
  const hasExemption = order.order_vat_code != null && String(order.order_vat_code).trim() !== ''
  const orderVatRate = Number(order.order_vat_rate)
  const vatRate = hasExemption ? 0 : (Number.isFinite(orderVatRate) ? orderVatRate : defaultVatRate)
  const net = Number(order.amount) || 0
  const vat = (net * vatRate) / 100
  const gross = net + vat
  const showVatLine = vatRate > 0 || (order.order_vat_code != null && String(order.order_vat_code).trim() !== '')

  const t = lang === 'pl' ? {
    title: 'Potwierdzenie zlecenia',
    orderNo: 'Nr zlecenia',
    dateReceived: 'Data przyjęcia',
    deadline: 'Termin realizacji',
    seller: 'Wykonawca',
    buyer: 'Zleceniodawca',
    desc: 'Opis',
    qty: 'Ilość',
    unit: 'Jedn.',
    price: 'Cena jedn.',
    value: 'Wartość',
    net: 'Razem netto',
    vatLabel: 'VAT',
    gross: 'Razem brutto',
    noVat: 'Zwolnienie z VAT'
  } : {
    title: 'Order Confirmation (Purchase Order)',
    orderNo: 'Order no.',
    dateReceived: 'Date received',
    deadline: 'Deadline',
    seller: 'Vendor',
    buyer: 'Buyer',
    desc: 'Description',
    qty: 'Qty',
    unit: 'Unit',
    price: 'Unit price',
    value: 'Amount',
    net: 'Total net',
    vatLabel: 'VAT',
    gross: 'Total gross',
    noVat: 'VAT exempt'
  }

  let y = 50

  doc.fontSize(18).font(fonts.bold)
  doc.text(t.title, 50, y)
  y = doc.y + 14

  doc.fontSize(10).font(fonts.normal)
  doc.text(`${t.orderNo}: ${order.order_number ?? order.id}`, 50, y)
  y += 14
  doc.text(`${t.dateReceived}: ${formatDate(order.received_at)}`, 50, y)
  if (order.deadline_at) {
    y += 14
    doc.text(`${t.deadline}: ${formatDate(order.deadline_at)}`, 50, y)
  }
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
    const buyerAddr = [
      client.street,
      [client.building, client.local].filter(Boolean).join(' / '),
      [client.postal_code, client.city].filter(Boolean).join(' '),
      client.country,
      client.address_extra
    ].filter(Boolean).join(', ')
    if (buyerAddr) { doc.text(buyerAddr, 50, y); y = doc.y + 2 }
    if (client.nip) { doc.text(`NIP: ${client.nip}`, 50, y); y = doc.y + 2 }
  }
  y += 16

  const desc = [order.specialization_name ?? order.specialization, order.language_pair_label].filter(Boolean).join(' · ') || (lang === 'pl' ? 'Usługa tłumaczeniowa' : 'Translation service')

  const tableTop = y
  doc.font(fonts.bold).fontSize(9)
  doc.text(t.desc, 50, y)
  doc.text(t.qty, 320, y)
  doc.text(t.unit, 370, y)
  doc.text(t.price, 420, y)
  doc.text(t.value, 480, y)
  y += 12
  doc.moveTo(50, y).lineTo(550, y).stroke()
  y += 8
  doc.font(fonts.normal).fontSize(9)
  doc.text(desc, 50, y, { width: 260 })
  const line1Y = y
  doc.text(String(order.quantity), 320, line1Y)
  doc.text(order.unit_name, 370, line1Y)
  doc.text(formatMoney(order.rate_per_unit ?? 0), 420, line1Y)
  doc.text(formatMoney(net), 480, line1Y)
  y = Math.max(doc.y, line1Y) + 10

  doc.moveTo(50, y).lineTo(550, y).stroke()
  y += 10
  doc.text(t.net, 350, y)
  doc.text(formatMoney(net), 480, y)
  y += 14
  if (showVatLine) {
    doc.text(`${t.vatLabel} (${vatRate}%)`, 350, y)
    doc.text(formatMoney(vat), 480, y)
    y += 14
  } else {
    doc.fontSize(8).text(`(${t.noVat})`, 350, y)
    y += 14
  }
  doc.font('Helvetica-Bold').text(t.gross, 350, y)
  doc.text(formatMoney(gross), 480, y)
}

type ContractorRecord = {
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
  client_adds_vat?: number | boolean
  client_vat_code?: string | null
  client_vat_rate?: number | null
}

export type SubcontractDescriptionOptions = {
  include_specialization?: number | boolean
  include_language_pair?: number | boolean
  include_service?: number | boolean
  description_custom_text?: string | null
}

/** PO dla podzlecenia: VAT z danych wykonawcy (usługobiorca dolicza VAT – kod lub stawka %). */
export function buildOrderConfirmationPdfForSubcontract(
  doc: PDFDoc,
  order: OrderRecord & { rate_currency?: string | null; specialization_name?: string | null; specialization?: string | null; language_pair_label?: string | null; service_name?: string | null },
  contractor: ContractorRecord | null,
  settings: { company_name: string; first_name: string; last_name: string; personal_nip: string; personal_street: string; personal_building: string; personal_local: string; personal_postal_code: string; personal_city: string; personal_country: string; personal_address_extra: string; personal_phone: string; vat_rate: string },
  lang: 'pl' | 'en',
  fonts: { normal: string; bold: string },
  notes?: string | null,
  descriptionOptions?: SubcontractDescriptionOptions | null
): void {
  const currency = (order.rate_currency && String(order.rate_currency).trim()) || 'PLN'
  const incSpec = descriptionOptions?.include_specialization !== 0 && descriptionOptions?.include_specialization !== false
  const incLp = descriptionOptions?.include_language_pair !== 0 && descriptionOptions?.include_language_pair !== false
  const incSvc = descriptionOptions?.include_service === 1 || descriptionOptions?.include_service === true
  const customText = descriptionOptions?.description_custom_text != null && String(descriptionOptions.description_custom_text).trim() !== '' ? String(descriptionOptions.description_custom_text).trim() : null
  const net = Number(order.amount) || 0
  let vatRate: number
  let vat: number
  let gross: number
  let clientVatDisplay: string | null = null
  let showVatLine: boolean
  if (contractor && (contractor.client_adds_vat as number)) {
    const defaultVatRate = parseFloat(settings.vat_rate || '23') || 23
    const code = contractor.client_vat_code != null && String(contractor.client_vat_code).trim() !== ''
    const rateVal = contractor.client_vat_rate != null ? Number(contractor.client_vat_rate) : NaN
    if (code) {
      vatRate = 0
      clientVatDisplay = String(contractor.client_vat_code).trim()
    } else if (Number.isFinite(rateVal) && rateVal >= 0) {
      vatRate = rateVal
      clientVatDisplay = `${vatRate}%`
    } else {
      vatRate = defaultVatRate
      clientVatDisplay = `${vatRate}%`
    }
    vat = (net * vatRate) / 100
    gross = net + vat
    showVatLine = vatRate > 0 || clientVatDisplay != null
  } else {
    // Wykonawca nie nalicza VAT — na podzleceniu VAT w ogóle się nie pokazuje/nie nalicza
    vatRate = 0
    vat = 0
    gross = net
    showVatLine = false
  }
  const t = lang === 'pl' ? { title: 'Potwierdzenie zlecenia', orderNo: 'Nr podzlecenia', dateReceived: 'Data przyjęcia', deadline: 'Termin realizacji', seller: 'Wykonawca', buyer: 'Zleceniodawca', desc: 'Opis', qty: 'Ilość', unit: 'Jedn.', price: 'Cena jedn.', value: 'Wartość', net: 'Razem netto', vatLabel: 'VAT', gross: 'Razem brutto', noVat: 'Zwolnienie z VAT', clientAddsVat: 'Usługobiorca dolicza VAT' } : { title: 'Order Confirmation (Purchase Order)', orderNo: 'Subcontract no.', dateReceived: 'Date received', deadline: 'Deadline', seller: 'Vendor', buyer: 'Ordering party', desc: 'Description', qty: 'Qty', unit: 'Unit', price: 'Unit price', value: 'Amount', net: 'Total net', vatLabel: 'VAT', gross: 'Total gross', noVat: 'VAT exempt', clientAddsVat: 'Buyer adds VAT' }
  let y = 50
  doc.fontSize(18).font(fonts.bold)
  doc.text(t.title, 50, y)
  y = doc.y + 14
  doc.fontSize(10).font(fonts.normal)
  doc.text(`${t.orderNo}: ${(order as OrderRecord & { subcontract_number?: string }).subcontract_number ?? order.order_number ?? order.id}`, 50, y)
  y += 14
  doc.text(`${t.dateReceived}: ${formatDate(order.received_at)}`, 50, y)
  if (order.deadline_at) { y += 14; doc.text(`${t.deadline}: ${formatDate(order.deadline_at)}`, 50, y) }
  y += 20
  doc.font(fonts.bold).fontSize(9).text(t.seller + ':', 50, y)
  y = doc.y + 2
  const vendorName = contractor?.name || contractor?.short_name || '—'
  doc.font(fonts.normal).fontSize(9).text(vendorName, 50, y)
  y = doc.y + 2
  if (contractor) {
    const countryLabel = (contractor.country_code && String(contractor.country_code).trim()) ? countryCodeToLabel(contractor.country_code, lang) : (contractor.country ?? '')
    const addr = [contractor.street, [contractor.building, contractor.local].filter(Boolean).join(' / '), [contractor.postal_code, contractor.city].filter(Boolean).join(' '), countryLabel, contractor.address_extra].filter(Boolean).join(', ')
    if (addr) { doc.text(addr, 50, y); y = doc.y + 2 }
    if (contractor.nip) { doc.text(`NIP: ${contractor.nip}`, 50, y); y = doc.y + 2 }
    if (contractor.phone) { doc.text(contractor.phone, 50, y); y = doc.y + 2 }
  }
  y += 10
  doc.font(fonts.bold).fontSize(9).text(t.buyer + ':', 50, y)
  y = doc.y + 2
  const buyerName = (settings.company_name || `${settings.first_name || ''} ${settings.last_name || ''}`).trim() || '—'
  doc.font(fonts.normal).fontSize(9).text(buyerName, 50, y)
  y = doc.y + 2
  const buyerCountryLabel = countryCodeToLabel(settings.personal_country, lang)
  const buyerAddr = [settings.personal_street, [settings.personal_building, settings.personal_local].filter(Boolean).join(' / '), [settings.personal_postal_code, settings.personal_city].filter(Boolean).join(' '), buyerCountryLabel, settings.personal_address_extra].filter(Boolean).join(', ')
  if (buyerAddr) { doc.text(buyerAddr, 50, y); y = doc.y + 2 }
  if (settings.personal_nip) { doc.text(`NIP: ${settings.personal_nip}`, 50, y); y = doc.y + 2 }
  if (settings.personal_phone) { doc.text(settings.personal_phone, 50, y); y = doc.y + 2 }
  y += 16
  const descParts: string[] = []
  if (incSpec) descParts.push(order.specialization_name ?? order.specialization ?? '')
  if (incLp) descParts.push(order.language_pair_label ?? '')
  if (incSvc) descParts.push((order as { service_name?: string | null }).service_name ?? '')
  if (customText) descParts.push(customText)
  const desc = descParts.filter(Boolean).join(' · ') || (lang === 'pl' ? 'Usługa tłumaczeniowa' : 'Translation service')
  doc.font(fonts.bold).fontSize(9)
  doc.text(t.desc, 50, y)
  doc.text(t.qty, 320, y)
  doc.text(t.unit, 370, y)
  doc.text(t.price, 420, y)
  doc.text(t.value, 480, y)
  y += 12
  doc.moveTo(50, y).lineTo(550, y).stroke()
  y += 8
  doc.font(fonts.normal).fontSize(9)
  doc.text(desc, 50, y, { width: 260 })
  const line1Y = y
  doc.text(String(order.quantity), 320, line1Y)
  doc.text(order.unit_name, 370, line1Y)
  doc.text(formatMoneyWithCurrency(order.rate_per_unit ?? 0, currency), 420, line1Y)
  doc.text(formatMoneyWithCurrency(net, currency), 480, line1Y)
  y = Math.max(doc.y, line1Y) + 10
  doc.moveTo(50, y).lineTo(550, y).stroke()
  y += 10
  doc.text(t.net, 350, y)
  doc.text(formatMoneyWithCurrency(net, currency), 480, y)
  y += 14
  if (showVatLine) { doc.text(`${t.vatLabel} (${vatRate}%)`, 350, y); doc.text(formatMoneyWithCurrency(vat, currency), 480, y); y += 14 } else { doc.fontSize(8).text(`(${t.noVat})`, 350, y); y += 14 }
  doc.font(fonts.bold).text(t.gross, 350, y)
  doc.text(formatMoneyWithCurrency(gross, currency), 480, y)
  if (clientVatDisplay != null && clientVatDisplay !== '') {
    y += 14
    doc.font(fonts.normal).fontSize(9).text(`${t.clientAddsVat}: ${clientVatDisplay}`, 50, y)
  }
  if (notes != null && String(notes).trim() !== '') {
    y += 16
    doc.font(fonts.bold).fontSize(9).text(lang === 'pl' ? 'Uwagi:' : 'Notes:', 50, y)
    y = doc.y + 4
    doc.font(fonts.normal).fontSize(9).text(String(notes).trim(), 50, y, { width: 500 })
  }
}

export function writeOrderConfirmationPdfToFile(
  filePath: string,
  order: OrderRecord,
  client: ClientRecord | null,
  settings: Record<string, string | null>,
  lang: 'pl' | 'en'
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
    vat_rate: settings.vat_rate ?? '23'
  }
  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  // domyślne fonty PDF (Helvetica) – fallback
  const fonts = { normal: 'Helvetica', bold: 'Helvetica-Bold' as const }
  // Jeśli użytkownik dostarczy TTF-y z polskimi znakami, podłącz je
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
    // jeśli nie ma fontów TTF – zostajemy przy Helvetica
  }
  const w = fs.createWriteStream(filePath)
  doc.pipe(w)
  buildOrderConfirmationPdf(doc, order, client, s, lang, fonts)
  doc.end()
  return new Promise((resolve, reject) => {
    w.on('finish', () => resolve())
    w.on('error', reject)
    doc.on('error', reject)
  })
}

export function writeOrderConfirmationPdfForSubcontractToFile(
  filePath: string,
  order: OrderRecord & { subcontract_number?: string; rate_currency?: string | null },
  contractor: ContractorRecord | null,
  settings: Record<string, string | null>,
  lang: 'pl' | 'en',
  notes?: string | null,
  descriptionOptions?: SubcontractDescriptionOptions | null
): Promise<void> {
  const s = { company_name: settings.company_name ?? '', first_name: settings.first_name ?? '', last_name: settings.last_name ?? '', personal_nip: settings.personal_nip ?? '', personal_street: settings.personal_street ?? '', personal_building: settings.personal_building ?? '', personal_local: settings.personal_local ?? '', personal_postal_code: settings.personal_postal_code ?? '', personal_city: settings.personal_city ?? '', personal_country: settings.personal_country ?? '', personal_address_extra: settings.personal_address_extra ?? '', personal_phone: settings.personal_phone ?? '', vat_rate: settings.vat_rate ?? '23' }
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
  } catch { /* fallback */ }
  const w = fs.createWriteStream(filePath)
  doc.pipe(w)
  buildOrderConfirmationPdfForSubcontract(doc, order, contractor, s, lang, fonts, notes, descriptionOptions)
  doc.end()
  return new Promise((resolve, reject) => {
    w.on('finish', () => resolve())
    w.on('error', reject)
    doc.on('error', reject)
  })
}
