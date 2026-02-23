import fs from 'fs'
import path from 'path'
import PDFDocument from 'pdfkit'
import { getOrderValue, type ExportColumn } from './exportOrderBook'

type PDFDoc = InstanceType<typeof PDFDocument>
type OrderRow = Record<string, unknown>

const MARGIN = 40
const FONT_SIZE = 8
const HEADER_FONT_SIZE = 9
const PAD = 3
/** Wysokość jednej linii przy FONT_SIZE (pt). */
const LINE_HEIGHT = 10
/** Minimalna wysokość wiersza (1 linia). */
const MIN_ROW_HEIGHT = LINE_HEIGHT + 2 * PAD
/** Minimalna szerokość kolumny (pt). */
const MIN_COL_WIDTH = 24
/** Minimalna czcionka – jeśli treść nie mieści się, zmniejszamy do tej wartości. */
const MIN_FONT_SIZE = 5
/** Dzielnik przy liczeniu szerokości kolumny (więcej = węższe kolumny, więcej linii). */
const COL_WIDTH_DIVISOR = 2
/** Wysokość wiersza z nazwami sekcji nad nagłówkami. */
const SECTION_ROW_HEIGHT = 16
/** Odstęp pod wierszem sekcji (żeby nagłówki kolumn się mieściły). */
const SECTION_ROW_GAP = 4

/** Kolumny niewyświetlane na wydruku (status, termin płatności). */
const PDF_EXCLUDE_KEYS = new Set(['order_status', 'invoice_status', 'payment_due_at'])

/** Sekcja bez nazwy: nr rep, data, zleceniodawca (nagłówek). Wynagrodzenia (amount_net, amount_gross, oral_net, oral_gross) między ustne a odmową bez własnej sekcji. */
const REPERTORIUM_SECTION_BY_KEY: Record<string, string> = {
  order_number: 'header',
  received_at: 'header',
  client_name_address: 'header',
  document_author: 'written',
  document_name: 'written',
  document_date: 'written',
  document_number: 'written',
  source_lang_name: 'written',
  target_lang_name: 'written',
  document_form_remarks: 'written',
  repertorium_activity_type: 'written',
  quantity: 'written',
  rate_per_unit: 'written',
  extra_copies: 'written',
  completed_at: 'written',
  repertorium_notes: 'written',
  oral_date: 'oral',
  oral_place: 'oral',
  oral_duration: 'oral',
  oral_scope: 'oral',
  oral_lang: 'oral',
  oral_rate: 'oral',
  oral_notes: 'oral',
  amount_net: 'fees',
  amount_gross: 'fees',
  oral_net: 'fees',
  oral_gross: 'fees',
  refusal_date: 'refusal',
  refusal_organ: 'refusal',
  refusal_reason: 'refusal',
  payment_due_at: 'other',
}
const SECTION_LABELS: Record<string, { pl: string; en: string }> = {
  header: { pl: '', en: '' },
  written: { pl: 'Tłumaczenie pisemne', en: 'Written translation' },
  oral: { pl: 'Tłumaczenia ustne', en: 'Oral translation' },
  fees: { pl: 'Wynagrodzenie', en: 'Remuneration' },
  refusal: { pl: 'Odmowa', en: 'Refusal' },
  other: { pl: 'Inne', en: 'Other' },
}
const SECTION_BG_COLORS: Record<string, string> = {
  header: '#f1f5f9',
  written: '#dbeafe',
  oral: '#d1fae5',
  fees: '#f1f5f9',
  refusal: '#fee2e2',
  other: '#e2e8f0',
}
const TABLE_HEADER_BG = '#f1f5f9'
const TABLE_ROW_ALT_BG = '#f8fafc'
const TABLE_BORDER = '#cbd5e1'

const DATE_KEYS = new Set([
  'received_at', 'deadline_at', 'completed_at', 'document_date', 'oral_date', 'refusal_date',
  'invoice_date', 'payment_due_at'
])

const NUMBER_KEYS = new Set([
  'quantity', 'rate_per_unit', 'amount_net', 'amount_vat', 'amount_gross',
  'oral_duration', 'oral_rate', 'oral_net', 'oral_gross', 'extra_copies'
])

function formatDateVal(v: unknown): string {
  if (v == null) return '—'
  const s = String(v).trim()
  if (!s) return '—'
  try {
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { /* ignore */ }
  return s
}

function formatNumberVal(v: unknown): string {
  if (v == null) return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return String(v).trim() || '—'
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatCellDisplay(value: unknown, key: string): string {
  if (value == null) return '—'
  if (DATE_KEYS.has(key)) return formatDateVal(value)
  if (NUMBER_KEYS.has(key)) return formatNumberVal(value)
  return String(value).trim() || '—'
}

/** Czy zlecenie ma dane odmowy (repertorium). */
function hasRefusalData(o: OrderRow): boolean {
  const v = (k: string) => {
    const x = o[k]
    return x != null && String(x).trim() !== ''
  }
  return v('refusal_date') || v('refusal_organ') || v('refusal_reason')
}

/**
 * Wartość do wyświetlenia w komórce: w nieużywanej sekcji zwraca null → "—".
 * Nieużywane: ustne przy pisemnym, pisemne przy ustnym, odmowa przy braku danych.
 */
function getCellDisplayValue(o: OrderRow, colKey: string, vatRate: number): unknown {
  const sectionKey = REPERTORIUM_SECTION_BY_KEY[colKey]
  if (sectionKey === 'oral' && o.translation_type !== 'oral') return null
  if (sectionKey === 'written' && o.translation_type === 'oral') return null
  if (sectionKey === 'refusal' && !hasRefusalData(o)) return null
  return getOrderValue(o, colKey, vatRate)
}

/**
 * Zawijanie tylko na granicach wyrazów (bez dzielenia słów).
 * Nowe linie w tekście traktowane jak spacje.
 */
function getWrappedLines(
  doc: PDFDoc,
  text: string,
  boxWidth: number,
  fontName: string,
  fontSize: number
): string[] {
  const str = (text.trim() || '—').replace(/\s+/g, ' ').replace(/\n/g, ' ')
  if (!str) return ['—']
  doc.font(fontName).fontSize(fontSize)
  const words = str.split(' ').filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word
    const w = doc.widthOfString(candidate)
    if (w <= boxWidth) {
      current = candidate
    } else {
      if (current) lines.push(current)
      const wordW = doc.widthOfString(word)
      current = wordW <= boxWidth ? word : ''
      if (wordW > boxWidth) lines.push(word)
    }
  }
  if (current) lines.push(current)
  return lines
}

/**
 * Zwraca rozmiar czcionki, przy którym żadna linia nie jest szersza niż boxWidth (bez clipowania).
 */
function getFontSizeToFit(
  doc: PDFDoc,
  text: string,
  boxWidth: number,
  fontName: string,
  maxFontSize: number
): number {
  let size = maxFontSize
  doc.font(fontName)
  while (size >= MIN_FONT_SIZE) {
    doc.fontSize(size)
    const lines = getWrappedLines(doc, text, boxWidth, fontName, size)
    let fits = true
    for (const line of lines) {
      if (doc.widthOfString(line) > boxWidth) {
        fits = false
        break
      }
    }
    if (fits) return size
    size -= 1
  }
  return MIN_FONT_SIZE
}

/** Wysokość tekstu po zawinięciu (z tym samym rozmiarem czcionki co przy rysowaniu – po ewentualnym zmniejszeniu). */
function measureCellHeight(
  doc: PDFDoc,
  text: string,
  cellWidth: number,
  fontSize: number,
  fontName: string
): number {
  const size = getFontSizeToFit(doc, text, cellWidth, fontName, fontSize)
  const lines = getWrappedLines(doc, text, cellWidth, fontName, size)
  return lines.length * LINE_HEIGHT
}

/** Rysuje treść komórki: zawijanie na granicach wyrazów, w razie potrzeby zmniejsza czcionkę, żeby wszystko się zmieściło (bez przycinania). */
function drawCellText(
  doc: PDFDoc,
  text: string,
  x: number,
  y: number,
  boxWidth: number,
  boxHeight: number,
  fontSize: number,
  fontName: string
): void {
  const size = getFontSizeToFit(doc, text, boxWidth, fontName, fontSize)
  const lines = getWrappedLines(doc, text, boxWidth, fontName, size)
  doc.font(fontName).fontSize(size)
  for (let i = 0; i < lines.length; i++) {
    doc.text(lines[i], x, y + i * LINE_HEIGHT, { lineBreak: false })
  }
}

/** Szerokość najdłuższego słowa w tekście (po podziale na wyrazy). */
function maxWordWidth(doc: PDFDoc, text: string, fontName: string, fontSize: number): number {
  const str = (text.trim() || '—').replace(/\s+/g, ' ').replace(/\n/g, ' ')
  if (!str) return 0
  doc.font(fontName).fontSize(fontSize)
  const words = str.split(' ').filter(Boolean)
  let maxW = 0
  for (const word of words) {
    const w = doc.widthOfString(word)
    if (w > maxW) maxW = w
  }
  return maxW
}

/**
 * Szerokości kolumn: dopasowane do treści, przy tym min. szerokość = najdłuższe pojedyncze słowo w kolumnie (żeby nic nie wchodziło na sąsiednią komórkę).
 */
function computeColumnWidths(
  doc: PDFDoc,
  orders: OrderRow[],
  columns: ExportColumn[],
  vatRate: number,
  fonts: { normal: string; bold: string }
): number[] {
  doc.font(fonts.bold).fontSize(HEADER_FONT_SIZE)
  doc.font(fonts.normal).fontSize(FONT_SIZE)
  const widths: number[] = []
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]
    let maxOneLine = 0
    let maxWord = 0
    const headerW = doc.font(fonts.bold).fontSize(HEADER_FONT_SIZE).widthOfString(columns[i].label)
    const headerWordW = maxWordWidth(doc, columns[i].label, fonts.bold, HEADER_FONT_SIZE)
    if (headerW > maxOneLine) maxOneLine = headerW
    if (headerWordW > maxWord) maxWord = headerWordW
    for (const o of orders) {
      const raw = getOrderValue(o, col.key, vatRate)
      const val = formatCellDisplay(raw, col.key)
      const w = doc.font(fonts.normal).fontSize(FONT_SIZE).widthOfString(val)
      const wordW = maxWordWidth(doc, val, fonts.normal, FONT_SIZE)
      if (w > maxOneLine) maxOneLine = w
      if (wordW > maxWord) maxWord = wordW
    }
    const contentMin = Math.max(maxOneLine / COL_WIDTH_DIVISOR, maxWord)
    const colW = Math.max(MIN_COL_WIDTH, contentMin + 2 * PAD)
    widths.push(colW)
  }
  return widths
}

type SectionGroup = { sectionKey: string; label: string; startIndex: number; endIndex: number; width: number }

function getSectionGroups(columns: ExportColumn[], colWidths: number[], lang: 'pl' | 'en'): SectionGroup[] {
  const groups: SectionGroup[] = []
  let i = 0
  while (i < columns.length) {
    const key = columns[i].key
    const sectionKey = REPERTORIUM_SECTION_BY_KEY[key] ?? 'other'
    const labels = SECTION_LABELS[sectionKey] ?? SECTION_LABELS.other
    const label = lang === 'pl' ? labels.pl : labels.en
    let width = 0
    const startIndex = i
    while (i < columns.length && (REPERTORIUM_SECTION_BY_KEY[columns[i].key] ?? 'other') === sectionKey) {
      width += colWidths[i]
      i++
    }
    groups.push({ sectionKey, label, startIndex, endIndex: i, width })
  }
  return groups
}

export function buildOrderBookPdf(
  doc: PDFDoc,
  orders: OrderRow[],
  columns: ExportColumn[],
  bookName: string | null,
  lang: 'pl' | 'en',
  vatRate: number,
  fonts: { normal: string; bold: string },
  repertoriumLayout: boolean = true
): void {
  columns = columns.filter(c => !PDF_EXCLUDE_KEYS.has(c.key))
  const isPl = lang === 'pl'
  const title = isPl ? 'Księga zleceń' : 'Order book'
  const generatedAt = isPl ? 'Wygenerowano' : 'Generated'
  const pageWidth = doc.page.width
  const pageHeight = doc.page.height
  const tableWidth = pageWidth - 2 * MARGIN
  const colCount = columns.length

  const colWidths = computeColumnWidths(doc, orders, columns, vatRate, fonts)
  const totalTableWidth = colWidths.reduce((a, b) => a + b, 0)
  const scale =
    totalTableWidth <= tableWidth
      ? 1
      : Math.min(1, tableWidth / totalTableWidth)

  const sectionGroups = getSectionGroups(columns, colWidths, lang)

  let headerRowHeight = MIN_ROW_HEIGHT
  for (let i = 0; i < colCount; i++) {
    const cellW = colWidths[i] - 2 * PAD
    const h = measureCellHeight(doc, columns[i].label, cellW, HEADER_FONT_SIZE, fonts.bold) + 2 * PAD
    if (h > headerRowHeight) headerRowHeight = h
  }

  let y = MARGIN

  doc.fontSize(14).font(fonts.bold)
  doc.text(title, MARGIN, y)
  y += 20
  if (bookName) {
    doc.fontSize(10).font(fonts.normal)
    doc.text(bookName, MARGIN, y)
    y += 14
  }
  doc.fontSize(9).font(fonts.normal)
  doc.text(`${generatedAt}: ${new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, MARGIN, y)
  y += 18

  const drawSectionRowAt = (yPos: number) => {
    doc.save()
    doc.translate(MARGIN, yPos)
    doc.scale(scale, scale)
    for (let i = 0; i < colCount; i++) {
      const cw = colWidths[i]
      const x = colWidths.slice(0, i).reduce((a, b) => a + b, 0)
      const sectionKey = REPERTORIUM_SECTION_BY_KEY[columns[i].key] ?? 'other'
      const bg = SECTION_BG_COLORS[sectionKey] ?? SECTION_BG_COLORS.other
      doc.fillColor(bg).rect(x, 0, cw, SECTION_ROW_HEIGHT).fill()
    }
    doc.strokeColor(TABLE_BORDER)
    let x = 0
    for (let i = 0; i < colCount; i++) {
      doc.rect(x, 0, colWidths[i], SECTION_ROW_HEIGHT).stroke()
      x += colWidths[i]
    }
    for (const g of sectionGroups) {
      if (!g.label) continue
      const xStart = colWidths.slice(0, g.startIndex).reduce((a, b) => a + b, 0)
      const w = g.width
      if (w <= 2 * PAD) continue
      doc
        .fillColor('#0f172a')
        .font(fonts.bold)
        .fontSize(HEADER_FONT_SIZE - 1)
        .text(g.label, xStart + PAD, PAD, { width: w - 2 * PAD, align: 'center', lineBreak: false })
    }
    doc.restore()
  }

  const drawHeaderAt = (yPos: number) => {
    doc.save()
    doc.translate(MARGIN, yPos)
    doc.scale(scale, scale)
    doc.fillColor(TABLE_HEADER_BG)
    let x = 0
    for (let i = 0; i < colCount; i++) {
      doc.rect(x, 0, colWidths[i], headerRowHeight).fill()
      x += colWidths[i]
    }
    doc.strokeColor(TABLE_BORDER)
    x = 0
    for (let i = 0; i < colCount; i++) {
      doc.rect(x, 0, colWidths[i], headerRowHeight).stroke()
      x += colWidths[i]
    }
    x = 0
    const cellH = headerRowHeight - 2 * PAD
    doc.fillColor('#0f172a')
    for (let i = 0; i < colCount; i++) {
      const cw = colWidths[i]
      drawCellText(doc, columns[i].label, x + PAD, PAD, cw - 2 * PAD, cellH, HEADER_FONT_SIZE, fonts.bold)
      x += cw
    }
    doc.restore()
  }

  const getRowHeight = (o: OrderRow): number => {
    let rowH = MIN_ROW_HEIGHT
    for (let i = 0; i < colCount; i++) {
      const col = columns[i]
      const cellW = colWidths[i] - 2 * PAD
      const val = formatCellDisplay(getCellDisplayValue(o, col.key, vatRate), col.key)
      const h = measureCellHeight(doc, val, cellW, FONT_SIZE, fonts.normal) + 2 * PAD
      if (h > rowH) rowH = h
    }
    return rowH
  }

  let dataRowIndex = 0
  const drawRowAt = (yPos: number, o: OrderRow, rowHeight: number) => {
    doc.save()
    doc.translate(MARGIN, yPos)
    doc.scale(scale, scale)
    const useAltBg = dataRowIndex % 2 === 1
    if (useAltBg) {
      doc.fillColor(TABLE_ROW_ALT_BG)
      let x = 0
      for (let i = 0; i < colCount; i++) {
        doc.rect(x, 0, colWidths[i], rowHeight).fill()
        x += colWidths[i]
      }
    }
    doc.strokeColor(TABLE_BORDER)
    let x = 0
    for (let i = 0; i < colCount; i++) {
      doc.rect(x, 0, colWidths[i], rowHeight).stroke()
      x += colWidths[i]
    }
    x = 0
    const cellH = rowHeight - 2 * PAD
    doc.fillColor('#0f172a')
    for (let i = 0; i < colCount; i++) {
      const col = columns[i]
      const cw = colWidths[i]
      const raw = getCellDisplayValue(o, col.key, vatRate)
      const val = formatCellDisplay(raw, col.key)
      drawCellText(doc, val, x + PAD, PAD, cw - 2 * PAD, cellH, FONT_SIZE, fonts.normal)
      x += cw
    }
    dataRowIndex++
    doc.restore()
  }

  const hasSectionRow = repertoriumLayout && (sectionGroups.length > 1 || (sectionGroups.length === 1 && sectionGroups[0].sectionKey !== 'other'))

  if (hasSectionRow) {
    drawSectionRowAt(y)
    y += SECTION_ROW_HEIGHT * scale
    y += SECTION_ROW_GAP * scale
  }
  drawHeaderAt(y)
  y += headerRowHeight * scale

  for (const o of orders) {
    const rowHeight = getRowHeight(o)
    const rowHeightPhysical = rowHeight * scale
    if (y + rowHeightPhysical > pageHeight - MARGIN) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGIN })
      y = MARGIN
      if (hasSectionRow) {
        drawSectionRowAt(y)
        y += SECTION_ROW_HEIGHT * scale
        y += SECTION_ROW_GAP * scale
      }
      drawHeaderAt(y)
      y += headerRowHeight * scale
    }
    drawRowAt(y, o, rowHeight)
    y += rowHeightPhysical
  }
}

export function writeOrderBookPdfToBuffer(
  orders: OrderRow[],
  columns: ExportColumn[],
  bookName: string | null,
  lang: 'pl' | 'en',
  vatRate: number,
  repertoriumLayout: boolean = false
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGIN })
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
      // fallback do Helvetica (bez polskich znaków)
    }
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    buildOrderBookPdf(doc, orders, columns, bookName, lang, vatRate, fonts, repertoriumLayout)
    doc.end()
  })
}
