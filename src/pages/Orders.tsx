import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formatNumber } from '../utils/numberLocale'
import { getVatSegment, resolveVatRule, VAT_SEGMENTS, type VatClientSegment, type VatRuleRow } from '../utils/vatConfig'

const ORDER_STATUSES = ['to_do', 'in_progress', 'completed', 'cancelled'] as const
const INVOICE_STATUSES = ['to_issue', 'issued', 'awaiting_payment', 'overdue', 'paid'] as const

type VatCodeDef = { code_pl: string; label_pl: string; code_en: string; label_en: string }
function normalizeVatCode(raw: string | null | undefined): string | null {
  const v = String(raw ?? '').trim().toUpperCase()
  if (!v) return null
  if (v === 'O') return 'NP'
  if (v === 'E') return 'ZW'
  return v
}

function getCanonicalVatCode(def: VatCodeDef): string {
  const pl = normalizeVatCode(def.code_pl)
  if (pl) return pl
  const en = normalizeVatCode(def.code_en)
  return en ?? ''
}
const DEFAULT_SERVICE_VAT_GRID: Record<VatClientSegment, { value_type: 'rate' | 'code'; rate_value: number | null; code_value: string | null }> = {
  company_domestic: { value_type: 'rate', rate_value: 23, code_value: null },
  company_eu: { value_type: 'rate', rate_value: 23, code_value: null },
  company_world: { value_type: 'rate', rate_value: 0, code_value: null },
  person_domestic: { value_type: 'rate', rate_value: 23, code_value: null },
  person_eu: { value_type: 'rate', rate_value: 23, code_value: null },
  person_world: { value_type: 'rate', rate_value: 0, code_value: null }
}

type OrderRow = {
  id: number
  client_id: number
  client_short_name: string
  client_name?: string | null
  client_street?: string | null
  client_building?: string | null
  client_local?: string | null
  client_postal_code?: string | null
  client_city?: string | null
  client_country?: string | null
  contractor_id: number | null
  contractor_short_name: string | null
  order_number: string | null
  name: string | null
  received_at: string
  deadline_at: string | null
  completed_at: string | null
  specialization: string | null
  specialization_id: number | null
  specialization_name: string | null
  language_pair_id: number | null
  language_pair_label: string | null
  source_lang_name?: string | null
  target_lang_name?: string | null
  source_lang_code?: string | null
  target_lang_code?: string | null
  unit_id: number
  unit_name: string
  quantity: number
  rate_per_unit: number
  amount: number
  order_status: string
  invoice_status: string
  invoice_number: string | null
  invoice_date: string | null
  invoice_sale_date?: string | null
  payment_due_at: string | null
  book_id: number
  repertorium_description?: string | null
  document_author?: string | null
  document_name?: string | null
  document_date?: string | null
  document_number?: string | null
  document_form_remarks?: string | null
  extra_copies?: number | null
  repertorium_notes?: string | null
  repertorium_activity_type?: string | null
  oral_date?: string | null
  oral_place?: string | null
  oral_lang?: string | null
  oral_duration?: number | null
  oral_scope?: string | null
  oral_rate?: number | null
  oral_net?: number | null
  oral_gross?: number | null
  oral_notes?: string | null
  refusal_date?: string | null
  refusal_organ?: string | null
  refusal_reason?: string | null
  service_id?: number | null
  order_vat_rate?: number | null
  order_vat_code?: string | null
  translation_type?: 'oral' | 'written' | null
  rate_currency?: string | null
  invoice_provider_source?: string | null
  invoice_description?: string | null
  include_invoice_description_on_invoice?: number | null
  include_service_on_invoice?: number | null
  include_language_pair_on_invoice?: number | null
}

function formatInvoiceNumberByPattern(format: string, nextNr: number): string {
  const y = new Date().getFullYear()
  const mm = String(new Date().getMonth() + 1).padStart(2, '0')
  return format
    .replace('{YYYY}', String(y))
    .replace('{YY}', String(y).slice(-2))
    .replace('{MM}', mm)
    .replace('{NR}', String(nextNr))
    .replace('{nr}', String(nextNr).padStart(4, '0'))
}

function computeNextInternalInvoiceNumberFromOrders(
  rows: OrderRow[],
  format: string
): string {
  const latestLocal = [...rows]
    .filter(r => String(r.invoice_provider_source ?? '').trim().toLowerCase() === 'local')
    .filter(r => r.invoice_number != null && String(r.invoice_number).trim() !== '')
    .sort((a, b) => b.id - a.id)[0]
  if (!latestLocal) return formatInvoiceNumberByPattern(format, 1)
  const raw = String(latestLocal.invoice_number ?? '').trim()
  const m = raw.match(/(\d+)\s*$/)
  const nextNr = m ? (parseInt(m[1], 10) + 1) : 1
  return formatInvoiceNumberByPattern(format, nextNr >= 1 ? nextNr : 1)
}

/** Waluty do wyboru przy stawce (stawki domyślne + ustawienie) */

/** Kolumny eksportu – uproszczony widok (jak tabela w UI). labelKey = klucz i18n dla nagłówka. */
const EXPORT_COLUMNS_SIMPLIFIED: { key: string; labelKey: string }[] = [
  { key: 'order_number', labelKey: 'orders.orderNumber' },
  { key: 'name', labelKey: 'orders.name' },
  { key: 'received_at', labelKey: 'orders.receivedAt' },
  { key: 'client_short_name', labelKey: 'orders.client' },
  { key: 'contractor_short_name', labelKey: 'orderBook.subcontractsColumn' },
  { key: 'deadline_at', labelKey: 'orders.deadline' },
  { key: 'completed_at', labelKey: 'orders.completedAt' },
  { key: 'specialization_name', labelKey: 'orders.specialization' },
  { key: 'language_pair_label', labelKey: 'orders.languagePair' },
  { key: 'unit_name', labelKey: 'orders.unit' },
  { key: 'quantity', labelKey: 'orders.quantity' },
  { key: 'amount_net', labelKey: 'orderBook.amountNet' },
  { key: 'amount_vat', labelKey: 'orderBook.amountVat' },
  { key: 'amount_gross', labelKey: 'orderBook.amountGross' },
  { key: 'order_status', labelKey: 'orders.orderStatus' },
  { key: 'invoice_status', labelKey: 'orders.invoiceStatus' },
  { key: 'payment_due_at', labelKey: 'orders.paymentDue' }
]

/** Kolumny domyślne w widoku niestandardowym – można je ukrywać i przywracać (key = identyfikator). */
export const DEFAULT_COLUMNS_FOR_CUSTOM_VIEW: { key: string; labelKey: string }[] = [
  { key: 'order_number', labelKey: 'orders.orderNumber' },
  { key: 'name', labelKey: 'orders.name' },
  { key: 'received_at', labelKey: 'orders.receivedAt' },
  { key: 'client', labelKey: 'orders.client' },
  { key: 'subcontracts', labelKey: 'orderBook.subcontractsColumn' },
  { key: 'deadline', labelKey: 'orders.deadline' },
  { key: 'completed_at', labelKey: 'orders.completedAt' },
  { key: 'specialization', labelKey: 'orders.specialization' },
  { key: 'language_pair', labelKey: 'orders.languagePair' },
  { key: 'unit', labelKey: 'orders.unit' },
  { key: 'quantity', labelKey: 'orders.quantity' },
  { key: 'amount_net', labelKey: 'orderBook.amountNet' },
  { key: 'amount_vat', labelKey: 'orderBook.amountVat' },
  { key: 'amount_gross', labelKey: 'orderBook.amountGross' },
  { key: 'order_status', labelKey: 'orders.orderStatus' },
  { key: 'invoice_status', labelKey: 'orders.invoiceStatus' },
  { key: 'payment_due', labelKey: 'orders.paymentDue' }
]

/** Opcje sortowania w widoku uproszczonym (nierep) – te same kolumny co w filtrach. */
const SIMPLIFIED_SORT_OPTIONS: { value: string; labelKey: string }[] = [
  { value: 'order_number', labelKey: 'orders.orderNumber' },
  { value: 'received_at', labelKey: 'orders.receivedAt' },
  { value: 'client', labelKey: 'orders.client' },
  { value: 'subcontracts', labelKey: 'orderBook.subcontractsColumn' },
  { value: 'deadline_at', labelKey: 'orders.deadline' },
  { value: 'completed_at', labelKey: 'orders.completedAt' },
  { value: 'specialization', labelKey: 'orders.specialization' },
  { value: 'language_pair', labelKey: 'orders.languagePair' },
  { value: 'unit', labelKey: 'orders.unit' },
  { value: 'quantity', labelKey: 'orders.quantity' },
  { value: 'amount', labelKey: 'orderBook.amountNet' },
  { value: 'amount_gross', labelKey: 'orderBook.amountGross' },
  { value: 'order_status', labelKey: 'orders.orderStatus' },
  { value: 'invoice_status', labelKey: 'orders.invoiceStatus' },
  { value: 'payment_due_at', labelKey: 'orders.paymentDue' }
]

/** Kolumny eksportu – widok repertorium (jak tabela w UI). Kolejność: nagłówek, tł. pisemne (bez wynagrodzeń), ustne (zakres przed językami; wynagrodzenia przeniesione poniżej), wynagrodzenia (bez sekcji), odmowa, status. */
const EXPORT_COLUMNS_REPERTORIUM: { key: string; labelKey: string }[] = [
  { key: 'order_number', labelKey: 'orderBook.repertoriumNrRep' },
  { key: 'received_at', labelKey: 'orderBook.repertoriumOrderDate' },
  { key: 'client_name_address', labelKey: 'orderBook.repertoriumClientNameAddress' },
  { key: 'document_author', labelKey: 'orderBook.repertoriumDocumentAuthor' },
  { key: 'document_name', labelKey: 'orderBook.repertoriumDocumentName' },
  { key: 'document_date', labelKey: 'orderBook.repertoriumDocumentDate' },
  { key: 'document_number', labelKey: 'orderBook.repertoriumDocumentNumber' },
  { key: 'document_form_remarks', labelKey: 'orderBook.repertoriumDocumentFormRemarks' },
  { key: 'source_lang_name', labelKey: 'orderBook.repertoriumSourceLang' },
  { key: 'repertorium_activity_type', labelKey: 'orderBook.repertoriumActivityType' },
  { key: 'target_lang_name', labelKey: 'orderBook.repertoriumTargetLang' },
  { key: 'quantity', labelKey: 'orderBook.repertoriumPagesCount' },
  { key: 'rate_per_unit', labelKey: 'orderBook.repertoriumRatePerPage' },
  { key: 'extra_copies', labelKey: 'orderBook.repertoriumExtraCopies' },
  { key: 'completed_at', labelKey: 'orderBook.repertoriumReturnDate' },
  { key: 'repertorium_notes', labelKey: 'orderBook.repertoriumNotes' },
  { key: 'oral_date', labelKey: 'orderBook.repertoriumOralDate' },
  { key: 'oral_place', labelKey: 'orderBook.repertoriumOralPlace' },
  { key: 'oral_duration', labelKey: 'orderBook.repertoriumOralDuration' },
  { key: 'oral_scope', labelKey: 'orderBook.repertoriumOralScope' },
  { key: 'oral_lang', labelKey: 'orderBook.repertoriumOralLang' },
  { key: 'oral_rate', labelKey: 'orderBook.repertoriumOralRate' },
  { key: 'oral_notes', labelKey: 'orderBook.repertoriumOralNotes' },
  { key: 'amount_net', labelKey: 'orderBook.repertoriumFeeNet' },
  { key: 'amount_gross', labelKey: 'orderBook.repertoriumFeeGross' },
  { key: 'oral_net', labelKey: 'orderBook.repertoriumFeeNet' },
  { key: 'oral_gross', labelKey: 'orderBook.repertoriumFeeGross' },
  { key: 'refusal_date', labelKey: 'orderBook.repertoriumRefusalDate' },
  { key: 'refusal_organ', labelKey: 'orderBook.repertoriumRefusalOrgan' },
  { key: 'refusal_reason', labelKey: 'orderBook.repertoriumRefusalReason' },
  { key: 'order_status', labelKey: 'orders.orderStatus' },
  { key: 'invoice_status', labelKey: 'orders.invoiceStatus' },
  { key: 'payment_due_at', labelKey: 'orders.paymentDue' }
]

/** Opcje sortowania w repertorium – te same kolumny co w filtrach (po nich sortujemy). */
const REPERTORIUM_SORT_OPTIONS: { value: string; labelKey: string }[] = [
  { value: 'order_number', labelKey: 'orderBook.repertoriumNrRep' },
  { value: 'received_at', labelKey: 'orderBook.repertoriumOrderDate' },
  { value: 'client', labelKey: 'orderBook.repertoriumClientNameAddress' },
  { value: 'document_author', labelKey: 'orderBook.repertoriumDocumentAuthor' },
  { value: 'document_name', labelKey: 'orderBook.repertoriumDocumentName' },
  { value: 'document_date', labelKey: 'orderBook.repertoriumDocumentDate' },
  { value: 'document_number', labelKey: 'orderBook.repertoriumDocumentNumber' },
  { value: 'language_pair', labelKey: 'orders.languagePair' },
  { value: 'document_form_remarks', labelKey: 'orderBook.repertoriumDocumentFormRemarks' },
  { value: 'repertorium_activity_type', labelKey: 'orderBook.repertoriumActivityType' },
  { value: 'quantity', labelKey: 'orderBook.repertoriumPagesCount' },
  { value: 'rate_per_unit', labelKey: 'orderBook.repertoriumRatePerPage' },
  { value: 'extra_copies', labelKey: 'orderBook.repertoriumExtraCopies' },
  { value: 'amount', labelKey: 'orderBook.repertoriumFeeNet' },
  { value: 'amount_gross', labelKey: 'orderBook.repertoriumFeeGross' },
  { value: 'completed_at', labelKey: 'orderBook.repertoriumReturnDate' },
  { value: 'repertorium_notes', labelKey: 'orderBook.repertoriumNotes' },
  { value: 'oral_date', labelKey: 'orderBook.repertoriumOralDate' },
  { value: 'oral_place', labelKey: 'orderBook.repertoriumOralPlace' },
  { value: 'oral_lang', labelKey: 'orderBook.repertoriumOralLang' },
  { value: 'oral_duration', labelKey: 'orderBook.repertoriumOralDuration' },
  { value: 'oral_scope', labelKey: 'orderBook.repertoriumOralScope' },
  { value: 'oral_rate', labelKey: 'orderBook.repertoriumOralRate' },
  { value: 'oral_net', labelKey: 'orderBook.repertoriumOralNet' },
  { value: 'oral_gross', labelKey: 'orderBook.repertoriumOralGross' },
  { value: 'oral_notes', labelKey: 'orderBook.repertoriumOralNotes' },
  { value: 'refusal_date', labelKey: 'orderBook.repertoriumRefusalDate' },
  { value: 'refusal_organ', labelKey: 'orderBook.repertoriumRefusalOrgan' },
  { value: 'refusal_reason', labelKey: 'orderBook.repertoriumRefusalReason' },
  { value: 'order_status', labelKey: 'orders.orderStatus' },
  { value: 'invoice_status', labelKey: 'orders.invoiceStatus' },
  { value: 'payment_due_at', labelKey: 'orders.paymentDue' }
]

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString()
}

/** Data + godzina (DD.MM.YYYY HH:mm) – dla deadline */
function formatDateTime(s: string | null) {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  const date = d.toLocaleDateString()
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  if (s.length <= 10) return date
  if (h === '00' && m === '00') return date
  return `${date} ${h}:${m}`
}

/** Data w formacie polskim (DD.MM.YYYY) – wymóg MS dla repertorium */
function formatDatePL(s: string | null) {
  if (!s) return '—'
  const d = new Date(s)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}.${month}.${year}`
}

/** Nazwisko (nazwa) i adres zleceniodawcy – zgodnie ze szablonem MS */
function repertoriumClientNameAddress(o: OrderRow): string {
  const name = o.client_name || o.client_short_name || ''
  const addrParts = [o.client_street, [o.client_building, o.client_local].filter(Boolean).join(' '), o.client_postal_code, o.client_city, o.client_country].filter(Boolean)
  const addr = addrParts.join(', ')
  return addr ? `${name}, ${addr}` : name || '—'
}

function formatMoney(n: number) {
  return formatNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Kwota z dopiskiem waluty (np. "150,00 PLN") – bez osobnej kolumny waluty */
function formatMoneyWithCurrency(n: number, currency: string) {
  const num = formatNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return currency ? `${num} ${currency.trim()}` : num
}

const ORDERBOOK_COLUMN_WIDTHS_KEY = 'jobraven_orderbook_column_widths'
const FORM_FIELD_SUGGESTIONS_KEY = 'jobraven_form_field_suggestions_v1'
const COL_RESIZE_MIN = 48
const COL_RESIZE_MAX = 600

/** Kolumny repertorium zawsze przypięte z lewej (numer, data, zleceniodawca) – tylko środek się przewija. */
const REPERTORIUM_STICKY_LEFT_KEYS = ['order_number', 'received_at', 'client_name_address'] as const

/** Sekcja repertorium po kluczu kolumny. Wynagrodzenia (amount_net, amount_gross, oral_net, oral_gross) między ustne a odmową, bez własnej sekcji. */
const REPERTORIUM_SECTION_BY_KEY: Record<string, string> = {
  order_number: 'header', received_at: 'header', client_name_address: 'header',
  document_author: 'written', document_name: 'written', document_date: 'written', document_number: 'written',
  source_lang_name: 'written', target_lang_name: 'written', document_form_remarks: 'written',
  repertorium_activity_type: 'written', quantity: 'written', rate_per_unit: 'written', extra_copies: 'written',
  completed_at: 'written', repertorium_notes: 'written',
  oral_date: 'oral', oral_place: 'oral', oral_duration: 'oral', oral_scope: 'oral', oral_lang: 'oral',
  oral_rate: 'oral', oral_notes: 'oral',
  amount_net: 'fees', amount_gross: 'fees', oral_net: 'fees', oral_gross: 'fees',
  refusal_date: 'refusal', refusal_organ: 'refusal', refusal_reason: 'refusal',
}
function hasRefusalData(o: OrderRow): boolean {
  const v = (k: string) => (o as Record<string, unknown>)[k] != null && String((o as Record<string, unknown>)[k]).trim() !== ''
  return v('refusal_date') || v('refusal_organ') || v('refusal_reason')
}
/** Czy w tabeli repertorium komórka ma być pusta (kreski) – sekcja nieużywana. Sekcja fees zawsze aktywna (pokazujemy wartości lub —). */
function isRepertoriumSectionInactive(o: OrderRow, key: string): boolean {
  const section = REPERTORIUM_SECTION_BY_KEY[key]
  const tt = o.translation_type
  if (section === 'fees') return false
  if (section === 'oral' && tt !== 'oral') return true
  if (section === 'written' && tt === 'oral') return true
  if (section === 'refusal' && !hasRefusalData(o)) return true
  return false
}

/** Nazwa języka wg UI: z tłumaczenia (pl/en) gdy jest klucz, inaczej nazwa z bazy */
function langNameForUi(code: string | null | undefined, name: string | null | undefined, t: (key: string) => string): string {
  if (!code?.trim()) return name?.trim() || '—'
  const key = `languageNames.${code.trim().toUpperCase()}`
  const translated = t(key)
  return (translated !== key ? translated : null) ?? name?.trim() ?? '—'
}

export default function Orders() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const editId = searchParams.get('edit')
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [clients, setClients] = useState<{ id: number; short_name: string }[]>([])
  const [contractors, setContractors] = useState<{ id: number; short_name: string }[]>([])
  const [specializations, setSpecializations] = useState<{ id: number; name: string }[]>([])
  const [services, setServices] = useState<{ id: number; name: string; vat_rate?: number | null }[]>([])
  const [units, setUnits] = useState<{ id: number; name: string }[]>([])
  const [pairs, setPairs] = useState<{ id: number; label: string }[]>([])
  const [books, setBooks] = useState<{ id: number; name: string; view_type: string; sort_order: number; archived?: number; repertorium_oral_unit_id?: number | null; repertorium_page_unit_id?: number | null }[]>([])
  const [bookId, setBookId] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  type FormState = Partial<Omit<OrderRow, 'unit_id'>> & { client_id?: number; unit_id?: number | null; language_pair_id?: number | null; contractor_id?: number | null; specialization_id?: number | null; book_id?: number; service_id?: number | null }
  const [form, setForm] = useState<FormState>({
    received_at: new Date().toISOString().slice(0, 10),
    order_status: 'to_do',
    invoice_status: 'to_issue',
    quantity: 0,
    rate_per_unit: 0,
    amount: 0,
    include_service_on_invoice: 1,
    include_language_pair_on_invoice: 1,
    include_invoice_description_on_invoice: 1
  })
  const [addServiceModal, setAddServiceModal] = useState(false)
  const [newServiceName, setNewServiceName] = useState('')
  const [newServiceVatGrid, setNewServiceVatGrid] = useState<Record<VatClientSegment, { value_type: 'rate' | 'code'; rate_value: number | null; code_value: string | null }>>(() => ({ ...DEFAULT_SERVICE_VAT_GRID }))
  const [newServiceVatCodeDefs, setNewServiceVatCodeDefs] = useState<VatCodeDef[]>([])
  const [addSpecModal, setAddSpecModal] = useState(false)
  const [newSpecName, setNewSpecName] = useState('')
  const [addPairModal, setAddPairModal] = useState(false)
  const [newPairSourceId, setNewPairSourceId] = useState('')
  const [newPairTargetId, setNewPairTargetId] = useState('')
  const [newPairBidirectional, setNewPairBidirectional] = useState(false)
  const [languages, setLanguages] = useState<{ id: number; code: string; name: string }[]>([])
  const sortedLanguages = useMemo(() => {
    return [...languages].sort((a, b) => {
      const aLabel = `${a.code} (${a.name})`
      const bLabel = `${b.code} (${b.name})`
      return aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base' })
    })
  }, [languages])
    const [sortBy, setSortBy] = useState<string>('received_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [columnPickerOpen, setColumnPickerOpen] = useState(false)
  const [filters, setFilters] = useState<{
    orderNumberContains: string
    nameContains: string
    clientIds: number[]
    contractorIds: number[]
    receivedAtFrom: string
    receivedAtTo: string
    deadlineFrom: string
    deadlineTo: string
    completedAtFrom: string
    completedAtTo: string
    specializationIds: number[]
    languagePairIds: number[]
    unitIds: number[]
    quantityMin: string
    quantityMax: string
    amountMin: string
    amountMax: string
    orderStatuses: string[]
    invoiceStatuses: string[]
    paymentDueFrom: string
    paymentDueTo: string
    oralDateFrom: string
    oralDateTo: string
    oralNetMin: string
    oralNetMax: string
    documentAuthorContains: string
    documentNameContains: string
    documentDateFrom: string
    documentDateTo: string
    documentNumberContains: string
    documentFormRemarksContains: string
    activityTypeContains: string
    ratePerPageMin: string
    ratePerPageMax: string
    extraCopiesMin: string
    extraCopiesMax: string
    amountGrossMin: string
    amountGrossMax: string
    notesContains: string
    oralPlaceContains: string
    oralLangContains: string
    oralDurationMin: string
    oralDurationMax: string
    oralScopeContains: string
    oralRateMin: string
    oralRateMax: string
    oralGrossMin: string
    oralGrossMax: string
    oralNotesContains: string
    refusalDateFrom: string
    refusalDateTo: string
    refusalOrganContains: string
    refusalReasonContains: string
  }>({
    orderNumberContains: '',
    nameContains: '',
    clientIds: [],
    contractorIds: [],
    receivedAtFrom: '',
    receivedAtTo: '',
    deadlineFrom: '',
    deadlineTo: '',
    completedAtFrom: '',
    completedAtTo: '',
    specializationIds: [],
    languagePairIds: [],
    unitIds: [],
    quantityMin: '',
    quantityMax: '',
    amountMin: '',
    amountMax: '',
    orderStatuses: [],
    invoiceStatuses: [],
    paymentDueFrom: '',
    paymentDueTo: '',
    oralDateFrom: '',
    oralDateTo: '',
    oralNetMin: '',
    oralNetMax: '',
    documentAuthorContains: '',
    documentNameContains: '',
    documentDateFrom: '',
    documentDateTo: '',
    documentNumberContains: '',
    documentFormRemarksContains: '',
    activityTypeContains: '',
    ratePerPageMin: '',
    ratePerPageMax: '',
    extraCopiesMin: '',
    extraCopiesMax: '',
    amountGrossMin: '',
    amountGrossMax: '',
    notesContains: '',
    oralPlaceContains: '',
    oralLangContains: '',
    oralDurationMin: '',
    oralDurationMax: '',
    oralScopeContains: '',
    oralRateMin: '',
    oralRateMax: '',
    oralGrossMin: '',
    oralGrossMax: '',
    oralNotesContains: '',
    refusalDateFrom: '',
    refusalDateTo: '',
    refusalOrganContains: '',
    refusalReasonContains: ''
  })
  const [orderBookView, setOrderBookView] = useState<'simplified' | 'repertorium' | 'custom'>('simplified')
  const [customColumns, setCustomColumns] = useState<{ id: number; name: string; col_type: string; sort_order: number }[]>([])
  const [customValues, setCustomValues] = useState<Record<number, string | null>>({})
  const [allCustomValues, setAllCustomValues] = useState<Record<number, Record<number, string | null>>>({})
  const [hiddenDefaultColumns, setHiddenDefaultColumns] = useState<string[]>([])
  const [issueModal, setIssueModal] = useState<{ orderId: number } | { orderIds: number[] } | null>(null)
  const [issueInvoiceProvider, setIssueInvoiceProvider] = useState<'internal' | 'wfirma'>('internal')
  const [issueNumber, setIssueNumber] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [issueSaleDate, setIssueSaleDate] = useState('')
  const [issuePaymentDue, setIssuePaymentDue] = useState('')
  const [issueNoteTemplates, setIssueNoteTemplates] = useState<string[]>([])
  const [issueNoteSelected, setIssueNoteSelected] = useState<boolean[]>([])
  const [issueNotesExtra, setIssueNotesExtra] = useState('')
  const [issueBankAccountId, setIssueBankAccountId] = useState<number | 0>(0)
  const [issueBankAccounts, setIssueBankAccounts] = useState<{ id: number; bank_name: string; account_number: string; swift: string; currency: string; is_default: number }[]>([])
  const [issueWfirmaCompanyAccountId, setIssueWfirmaCompanyAccountId] = useState<number | 0>(0)
  const [issueWfirmaCompanyAccounts, setIssueWfirmaCompanyAccounts] = useState<Array<{ id: number; account_number: string; bank_name?: string; name?: string; currency?: string }>>([])
  const [issueWfirmaAccountsLoading, setIssueWfirmaAccountsLoading] = useState(false)
  const [issueWfirmaAccountsMessage, setIssueWfirmaAccountsMessage] = useState<string | null>(null)
  const [vatRate, setVatRate] = useState(23)
  const [defaultCurrency, setDefaultCurrency] = useState('PLN')
  const [rateCurrencies, setRateCurrencies] = useState<string[]>(['PLN', 'EUR', 'USD', 'GBP', 'CHF'])
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([])
  const [formFieldSuggestions, setFormFieldSuggestions] = useState<Record<string, string[]>>(() => {
    try {
      const raw = localStorage.getItem(FORM_FIELD_SUGGESTIONS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string[]>
        if (parsed && typeof parsed === 'object') return parsed
      }
    } catch (_) { /* ignore */ }
    return {}
  })
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(ORDERBOOK_COLUMN_WIDTHS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, number>
        if (parsed && typeof parsed === 'object') return parsed
      }
    } catch (_) { /* ignore */ }
    return {}
  })
  const colResizeRef = useRef<{ key: string; startX: number; startWidth: number; th: HTMLElement } | null>(null)
  const [repertoriumActionsOpenId, setRepertoriumActionsOpenId] = useState<number | null>(null)
  const [ordersActionsOpenId, setOrdersActionsOpenId] = useState<number | null>(null)
  const ordersActionsTriggerRef = useRef<HTMLButtonElement | null>(null)
  const ordersActionsDropdownRef = useRef<HTMLDivElement | null>(null)
  const repertoriumActionsTriggerRef = useRef<HTMLButtonElement | null>(null)
  const repertoriumActionsDropdownRef = useRef<HTMLDivElement | null>(null)
  const columnWidthsLatestRef = useRef<Record<string, number>>(columnWidths)
  const orderBookColumnKeysRef = useRef<string[]>([])

  /** Zapisana szerokość kolumny (ze stanu; zapis po mouseup). */
  const getColumnWidth = (storageKey: string): number | undefined => columnWidths[storageKey]

  const hasAnyRepertoriumColumnWidths = Object.keys(columnWidths).some(k => k.startsWith('rep_'))
  const hasAnyCustomColumnWidths = Object.keys(columnWidths).some(k => k.startsWith('custom_') || k.startsWith('custom_col_'))
  const suggestionListId = (fieldKey: string) => `form-suggest-${fieldKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`
  const rememberFieldValue = (fieldKey: string, rawValue: string | null | undefined) => {
    const value = String(rawValue ?? '').trim()
    if (value.length < 2) return
    setFormFieldSuggestions(prev => {
      const current = prev[fieldKey] ?? []
      const dedup = current.filter(v => v.toLowerCase() !== value.toLowerCase())
      const nextField = [value, ...dedup].slice(0, 100)
      const next = { ...prev, [fieldKey]: nextField }
      try {
        localStorage.setItem(FORM_FIELD_SUGGESTIONS_KEY, JSON.stringify(next))
      } catch (_) { /* ignore */ }
      return next
    })
  }
  const renderFieldDatalist = (fieldKey: string, rawQuery: string | null | undefined) => {
    const values = formFieldSuggestions[fieldKey] ?? []
    if (!values.length) return null
    const query = String(rawQuery ?? '').trim().toLowerCase()
    let filtered = values
    if (query) {
      const prefix = values.filter(v => v.toLowerCase().startsWith(query))
      const contains = values.filter(v => !v.toLowerCase().startsWith(query) && v.toLowerCase().includes(query))
      filtered = [...prefix, ...contains]
    }
    const limited = filtered.slice(0, 12)
    if (!limited.length) return null
    return (
      <datalist id={suggestionListId(fieldKey)}>
        {limited.map(v => <option key={v} value={v} />)}
      </datalist>
    )
  }

  const handleColResizeStart = (storageKey: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const th = (e.target as HTMLElement).closest('th') as HTMLElement | null
    if (!th) return
    const currentWidth = th.getBoundingClientRect().width
    colResizeRef.current = { key: storageKey, startX: e.clientX, startWidth: currentWidth, th }
    document.body.classList.add('col-resizing')
  }

  useEffect(() => {
    columnWidthsLatestRef.current = columnWidths
  }, [columnWidths])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = colResizeRef.current
      if (!r) return
      const delta = e.clientX - r.startX
      const next = Math.max(COL_RESIZE_MIN, Math.min(COL_RESIZE_MAX, r.startWidth + delta))
      r.th.style.width = `${next}px`
      r.th.style.minWidth = `${next}px`
      const table = r.th.closest('table')
      const colgroup = table?.querySelector('colgroup')
      if (colgroup) {
        const tr = r.th.closest('tr')
        const colIndex = tr ? Array.from(tr.children).indexOf(r.th) : -1
        if (colIndex >= 0 && colgroup.children[colIndex]) {
          const col = colgroup.children[colIndex] as HTMLElement
          col.style.width = `${next}px`
          col.style.minWidth = `${next}px`
        }
      }
    }
    const onUp = () => {
      const r = colResizeRef.current
      document.body.classList.remove('col-resizing')
      if (!r) return
      const currentPx = r.th.style.width ? parseFloat(r.th.style.width) : NaN
      const finalWidth = Number.isFinite(currentPx)
        ? Math.max(COL_RESIZE_MIN, Math.min(COL_RESIZE_MAX, currentPx))
        : r.startWidth
      let base: Record<string, number> = { ...columnWidthsLatestRef.current }
      const keys = orderBookColumnKeysRef.current
      const tr = r.th.closest('tr')
      const ths = tr?.querySelectorAll('th')
      if (keys.length > 0 && ths && ths.length >= keys.length + 1) {
        const captured: Record<string, number> = {}
        for (let i = 0; i < keys.length; i++) {
          const w = (ths[i + 1] as HTMLElement).getBoundingClientRect().width
          captured[keys[i]] = Math.max(COL_RESIZE_MIN, Math.min(COL_RESIZE_MAX, w))
        }
        // Zamrażamy aktualny wygląd wszystkich widocznych kolumn,
        // żeby commit po mouseup nie przeliczał ich "po nowemu".
        base = { ...base, ...captured }
      }
      const updated = { ...base, [r.key]: finalWidth }
      columnWidthsLatestRef.current = updated
      setColumnWidths(updated)
      try {
        localStorage.setItem(ORDERBOOK_COLUMN_WIDTHS_KEY, JSON.stringify(updated))
      } catch (_) { /* ignore */ }
      colResizeRef.current = null
    }
    const doc = document
    doc.addEventListener('mousemove', onMove, true)
    doc.addEventListener('mouseup', onUp, true)
    return () => {
      doc.removeEventListener('mousemove', onMove, true)
      doc.removeEventListener('mouseup', onUp, true)
    }
  }, [])

  useLayoutEffect(() => {
    if (ordersActionsOpenId == null || !ordersActionsTriggerRef.current || !ordersActionsDropdownRef.current) return
    const r = ordersActionsTriggerRef.current.getBoundingClientRect()
    const el = ordersActionsDropdownRef.current
    el.style.top = `${r.bottom + 4}px`
    el.style.left = `${r.left}px`
    const margin = 8
    const w = el.offsetWidth
    let left = r.left
    if (left + w > window.innerWidth - margin) left = window.innerWidth - w - margin
    if (left < margin) left = margin
    el.style.left = `${left}px`
  }, [ordersActionsOpenId])
  useLayoutEffect(() => {
    if (repertoriumActionsOpenId == null || !repertoriumActionsTriggerRef.current || !repertoriumActionsDropdownRef.current) return
    const r = repertoriumActionsTriggerRef.current.getBoundingClientRect()
    const el = repertoriumActionsDropdownRef.current
    el.style.top = `${r.bottom + 4}px`
    el.style.left = `${r.left}px`
    const margin = 8
    const w = el.offsetWidth
    let left = r.left
    if (left + w > window.innerWidth - margin) left = window.innerWidth - w - margin
    if (left < margin) left = margin
    el.style.left = `${left}px`
  }, [repertoriumActionsOpenId])

  const [orderSubcontracts, setOrderSubcontracts] = useState<{ id: number; subcontract_number: string; name: string | null; notes: string | null; contractor_short_name: string | null; quantity: number; amount: number; deadline_at: string | null; rate_currency?: string | null }[]>([])
  const [allSubcontractsByOrderId, setAllSubcontractsByOrderId] = useState<Map<number, { subcontract_number: string; name: string | null }[]>>(new Map())
  const [addSubcontractModal, setAddSubcontractModal] = useState(false)
  const [addSubcontractForm, setAddSubcontractForm] = useState<{ name: string; notes: string; include_specialization: boolean; include_language_pair: boolean; include_service: boolean; description_custom_text: string; contractor_id: number | null; quantity: number; rate_per_unit: number; amount: number; deadline_at: string }>({ name: '', notes: '', include_specialization: true, include_language_pair: true, include_service: false, description_custom_text: '', contractor_id: null, quantity: 0, rate_per_unit: 0, amount: 0, deadline_at: '' })
  const [formSectionOpen, setFormSectionOpen] = useState({ written: false, oral: false, refusal: false, status: false })
  const [subcontractSectionOpen, setSubcontractSectionOpen] = useState(false)
  const [hasClientRateOverride, setHasClientRateOverride] = useState(false)
  const [oralRateMessage, setOralRateMessage] = useState<string | null>(null)
  const [writtenRateMessage, setWrittenRateMessage] = useState<string | null>(null)
  const [defaultRateMessage, setDefaultRateMessage] = useState<string | null>(null)
  const toggleFormSection = (key: keyof typeof formSectionOpen) => setFormSectionOpen(prev => ({ ...prev, [key]: !prev[key] }))
  const calcSubcontractAmount = (quantity: number, rate: number) => Math.round((quantity || 0) * (rate || 0) * 100) / 100

  const formBookId = form.book_id ?? bookId ?? books[0]?.id ?? 1
  const isRepertoriumBook = books.find(b => b.id === formBookId)?.view_type === 'repertorium'
  const repertoriumOralUnitId = books.find(b => b.id === formBookId)?.repertorium_oral_unit_id ?? null
  const repertoriumPageUnitId = books.find(b => b.id === formBookId)?.repertorium_page_unit_id ?? null
  const getVatRateForService = (serviceId?: number | null) => {
    const svcVat = services.find(s => s.id === (serviceId ?? null))?.vat_rate
    const parsed = Number(svcVat)
    return Number.isFinite(parsed) ? parsed : vatRate
  }
  const getVatRateForOrder = (row: Pick<OrderRow, 'order_vat_rate' | 'order_vat_code'>) => {
    if (row.order_vat_code != null && String(row.order_vat_code).trim() !== '') return 0
    const parsed = Number(row.order_vat_rate)
    if (Number.isFinite(parsed)) return parsed
    return vatRate
  }
  const rateArgumentCandidates = useMemo(() => {
    const out: { key: string; value: string }[] = []
    const pushCandidate = (key: string, raw: unknown) => {
      const value = String(raw ?? '').trim()
      if (!key || !value) return
      if (!out.some(c => c.key === key && c.value.toLowerCase() === value.toLowerCase())) {
        out.push({ key, value })
      }
    }
    const pairLabel = form.language_pair_id != null ? (pairs.find(p => p.id === form.language_pair_id)?.label ?? '') : ''
    const specializationName = form.specialization_id != null
      ? (specializations.find(s => s.id === form.specialization_id)?.name ?? form.specialization ?? '')
      : (form.specialization ?? '')
    const serviceName = form.service_id != null
      ? (services.find(s => s.id === form.service_id)?.name ?? '')
      : ''
    const clientShortName = form.client_id != null ? (clients.find(c => c.id === form.client_id)?.short_name ?? '') : ''
    const contractorShortName = form.contractor_id != null ? (contractors.find(c => c.id === form.contractor_id)?.short_name ?? '') : ''
    const unitName = form.unit_id != null ? (units.find(u => u.id === form.unit_id)?.name ?? '') : ''
    const bookName = form.book_id != null ? (books.find(b => b.id === form.book_id)?.name ?? '') : ''

    pushCandidate('language_pair', pairLabel)
    // For oral translations, oral_lang stores the pair label — use it as language_pair fallback
    if (!pairLabel && form.oral_lang) {
      pushCandidate('language_pair', form.oral_lang)
    }
    pushCandidate('order_number', form.order_number)
    pushCandidate('name', form.name)
    pushCandidate('received_at', form.received_at)
    pushCandidate('client', clientShortName)
    pushCandidate('contractor', contractorShortName)
    pushCandidate('deadline', form.deadline_at)
    pushCandidate('completed_at', form.completed_at)
    pushCandidate('oral_lang', form.oral_lang)
    pushCandidate('repertorium_activity_type', form.repertorium_activity_type)
    pushCandidate('specialization', specializationName)
    pushCandidate('service', serviceName)
    pushCandidate('unit', unitName)
    pushCandidate('quantity', form.quantity)
    pushCandidate('amount', form.amount)
    pushCandidate('order_status', form.order_status)
    pushCandidate('invoice_status', form.invoice_status)
    pushCandidate('payment_due', form.payment_due_at)
    pushCandidate('book', bookName)
    pushCandidate('translation_type', form.translation_type)
    pushCandidate('invoice_description', form.invoice_description)
    pushCandidate('document_author', form.document_author)
    pushCandidate('document_name', form.document_name)
    pushCandidate('document_date', form.document_date)
    pushCandidate('document_number', form.document_number)
    pushCandidate('document_form_remarks', form.document_form_remarks)
    pushCandidate('repertorium_notes', form.repertorium_notes)
    pushCandidate('oral_date', form.oral_date)
    pushCandidate('oral_place', form.oral_place)
    pushCandidate('oral_duration', form.oral_duration)
    pushCandidate('oral_scope', form.oral_scope)
    pushCandidate('oral_notes', form.oral_notes)
    pushCandidate('refusal_date', form.refusal_date)
    pushCandidate('refusal_organ', form.refusal_organ)
    pushCandidate('refusal_reason', form.refusal_reason)

    for (const col of customColumns) {
      const val = customValues[col.id]
      if (val != null && String(val).trim() !== '') pushCandidate(`custom_column:${col.id}`, val)
    }
    return out
  }, [form.language_pair_id, form.order_number, form.name, form.received_at, form.client_id, form.contractor_id, form.deadline_at, form.completed_at, form.oral_lang, form.repertorium_activity_type, form.specialization_id, form.specialization, form.service_id, form.unit_id, form.quantity, form.amount, form.order_status, form.invoice_status, form.payment_due_at, form.book_id, form.translation_type, form.invoice_description, form.document_author, form.document_name, form.document_date, form.document_number, form.document_form_remarks, form.repertorium_notes, form.oral_date, form.oral_place, form.oral_duration, form.oral_scope, form.oral_notes, form.refusal_date, form.refusal_organ, form.refusal_reason, pairs, specializations, services, clients, contractors, units, books, customColumns, customValues])
  /** Formularz dodawania (nie edycji): URL add=1 LUB pusta księga – używane przy warunkowym renderze */
  void (!editId && (searchParams.get('add') === '1' || orders.length === 0))

  const load = async () => {
    try {
      if (!window.api) {
        setLoading(false)
        return
      }
      const bookList = await window.api.orderBooks.list() as { id: number; name: string; view_type: string; sort_order: number; archived?: number; repertorium_oral_unit_id?: number | null; repertorium_page_unit_id?: number | null }[]
      setBooks(bookList)
      const effectiveBookId = bookId ?? bookList[0]?.id
      if (effectiveBookId != null && bookId == null) setBookId(effectiveBookId)
      const [o, c, ct, s, svc, u, p, langList, currency, rateCurrenciesStr, subList] = await Promise.all([
        window.api.orders.list(effectiveBookId ?? undefined),
        window.api.clients.list(),
        window.api.contractors.list(),
        window.api.specializations.list(),
        window.api.services.list(),
        window.api.units.list(),
        window.api.languagePairs.list(),
        window.api.languages.list(),
        window.api.settings.get('default_currency'),
        window.api.settings.get('rate_currencies'),
        window.api.subcontracts?.list?.() ?? Promise.resolve([])
      ])
      const bookArr = bookList
      setOrders((o as OrderRow[]))
      setClients((c as { id: number; short_name: string }[]))
      setContractors((ct as { id: number; short_name: string }[]))
      setSpecializations((s as { id: number; name: string }[]))
      setServices((svc as { id: number; name: string; vat_rate?: number | null }[]) ?? [])
      setUnits((u as { id: number; name: string }[]))
      setPairs((p as { id: number; label: string }[]).map(x => ({ id: x.id, label: x.label })))
      const langArr = Array.isArray(langList) ? (langList as { id: number; code: string; name: string }[]) : []
      setLanguages(langArr)
      setVatRate(23)
      const defCur = String(currency ?? 'PLN').trim() || 'PLN'
      setDefaultCurrency(defCur)
      try {
        const parsed = typeof rateCurrenciesStr === 'string' && rateCurrenciesStr.trim() ? JSON.parse(rateCurrenciesStr) : null
        const list = Array.isArray(parsed) && parsed.length > 0 ? parsed.filter((c: unknown) => typeof c === 'string' && (c as string).trim()) : ['PLN', 'EUR', 'USD', 'GBP', 'CHF']
        setRateCurrencies(list)
      } catch {
        setRateCurrencies(['PLN', 'EUR', 'USD', 'GBP', 'CHF'])
      }
      const sel = effectiveBookId != null ? bookArr.find(b => b.id === effectiveBookId) : null
      const viewType = sel?.view_type === 'repertorium' ? 'repertorium' : sel?.view_type === 'custom' ? 'custom' : 'simplified'
      setOrderBookView(viewType)
      if (viewType === 'custom' && effectiveBookId != null && window.api?.customColumns?.listByBook) {
        window.api.customColumns.listByBook(effectiveBookId).then(async (cols: unknown) => {
          const colArr = Array.isArray(cols) ? cols as typeof customColumns : []
          setCustomColumns(colArr)
          // Load custom values for all orders in this book
          if (colArr.length > 0 && window.api?.customColumnValues?.getByOrder) {
            const oids = (Array.isArray(o) ? o as { id: number }[] : []).map(x => x.id)
            const valMap: Record<number, Record<number, string | null>> = {}
            await Promise.all(oids.map(oid =>
              window.api.customColumnValues.getByOrder(oid).then(v => { valMap[oid] = v ?? {} }).catch(() => { valMap[oid] = {} })
            ))
            setAllCustomValues(valMap)
          } else {
            setAllCustomValues({})
          }
        }).catch(() => { setCustomColumns([]); setAllCustomValues({}) })
      } else {
        setCustomColumns([])
        setAllCustomValues({})
      }
      if (effectiveBookId != null && window.api?.settings?.get) {
        window.api.settings.get(`book_${effectiveBookId}_hidden_columns`).then((val: string | null) => {
          try {
            const arr = val ? JSON.parse(val) : []
            setHiddenDefaultColumns(Array.isArray(arr) ? arr : [])
          } catch {
            setHiddenDefaultColumns([])
          }
        }).catch(() => setHiddenDefaultColumns([]))
      } else {
        setHiddenDefaultColumns([])
      }
      const subs = (Array.isArray(subList) ? subList : []) as { order_id: number; subcontract_number: string; name: string | null }[]
      const byOrderId = new Map<number, { subcontract_number: string; name: string | null }[]>()
      for (const sub of subs) {
        const arr = byOrderId.get(sub.order_id) ?? []
        arr.push({ subcontract_number: sub.subcontract_number, name: sub.name })
        byOrderId.set(sub.order_id, arr)
      }
      setAllSubcontractsByOrderId(byOrderId)
    } catch (err) {
      console.error('Orders load error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [bookId])

  useEffect(() => {
    if (addPairModal && languages.length === 0 && window.api?.languages?.list) {
      window.api.languages.list().then((list: unknown) => {
        const arr = Array.isArray(list) ? (list as { id: number; code: string; name: string }[]) : []
        setLanguages(arr)
      })
    }
  }, [addPairModal])

  useEffect(() => {
    const cId = searchParams.get('clientId')
    if (cId) setFilters(f => ({ ...f, clientIds: [parseInt(cId, 10)].filter(Boolean) }))
  }, [searchParams.get('clientId')])

  useEffect(() => {
    const ctId = searchParams.get('contractorId')
    if (ctId) setFilters(f => ({ ...f, contractorIds: [parseInt(ctId, 10)].filter(Boolean) }))
  }, [searchParams.get('contractorId')])

  useEffect(() => {
    if (form.client_id && form.unit_id && window.api?.clientDefaultUnitRates?.get) {
      const requestedCurrency = form.rate_currency
      window.api.clientDefaultUnitRates.get(form.client_id, form.unit_id, rateArgumentCandidates, requestedCurrency).then((r: unknown) => {
        const row = (r as { rate?: number; currency?: string } | null)
        const rate = row?.rate
        if (rate != null && rate > 0) {
          setHasClientRateOverride(true)
          setForm(prev => {
            const returnedCurrency = row?.currency?.trim()?.toUpperCase()
            const requested = (requestedCurrency ?? defaultCurrency)?.trim()?.toUpperCase()
            const nextCurrency = (returnedCurrency === requested ? row?.currency : null) ?? prev.rate_currency ?? requestedCurrency ?? defaultCurrency
            return {
              ...prev,
              rate_per_unit: rate,
              amount: Math.round((prev.quantity ?? 0) * rate * 100) / 100,
              rate_currency: nextCurrency
            }
          })
          setDefaultRateMessage(null)
          setWrittenRateMessage(null)
        } else {
          setHasClientRateOverride(false)
        }
      })
    } else {
      setHasClientRateOverride(false)
    }
  }, [form.client_id, form.unit_id, form.rate_currency, rateArgumentCandidates, defaultCurrency])

  const addFormInitializedRef = useRef(false)
  const addFormNameInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editId && window.api) {
      addFormInitializedRef.current = false
      const id = parseInt(editId, 10)
      window.api.orders.get(id).then((row: unknown) => {
        const r = row as OrderRow & { client_id: number; unit_id: number; contractor_id?: number | null; specialization_id?: number | null; book_id?: number }
        if (r) {
          const row = r as OrderRow & { client_id: number; unit_id: number; contractor_id?: number | null; specialization_id?: number | null; book_id?: number; invoice_description?: string | null; translation_type?: 'oral' | 'written' | null; service_id?: number | null; include_service_on_invoice?: number | null; include_language_pair_on_invoice?: number | null; include_invoice_description_on_invoice?: number | null; rate_currency?: string | null }
          setForm({
            ...row,
            client_id: row.client_id,
            unit_id: row.unit_id,
            language_pair_id: row.language_pair_id ?? null,
            contractor_id: row.contractor_id ?? null,
            specialization_id: row.specialization_id ?? null,
            book_id: row.book_id ?? 1,
            service_id: row.service_id ?? null,
            received_at: row.received_at?.slice(0, 10),
            deadline_at: row.deadline_at?.slice(0, 16) ?? '',
            completed_at: row.completed_at?.slice(0, 10) ?? '',
            payment_due_at: row.payment_due_at?.slice(0, 10) ?? '',
            document_date: row.document_date?.slice(0, 10) ?? null,
            extra_copies: row.extra_copies ?? 0,
            oral_date: (row as OrderRow).oral_date?.slice(0, 10) ?? null,
            refusal_date: (row as OrderRow).refusal_date?.slice(0, 10) ?? null,
            invoice_description: row.invoice_description ?? null,
            translation_type: row.translation_type ?? null,
            rate_currency: row.rate_currency ?? null,
            include_service_on_invoice: row.include_service_on_invoice ?? 1,
            include_language_pair_on_invoice: row.include_language_pair_on_invoice ?? 1,
            include_invoice_description_on_invoice: row.include_invoice_description_on_invoice ?? 1
          })
          setFormSectionOpen(prev => ({
            ...prev,
            written: row.translation_type === 'written',
            oral: row.translation_type === 'oral'
          }))
          // Load custom column values
          if (window.api?.customColumnValues?.getByOrder) {
            window.api.customColumnValues.getByOrder(id).then((vals: Record<number, string | null>) => setCustomValues(vals ?? {})).catch(() => setCustomValues({}))
          }
        }
      })
    } else if (searchParams.get('add') === '1') {
      const alreadyInitialized = addFormInitializedRef.current
      addFormInitializedRef.current = true
      const base = {
        received_at: new Date().toISOString().slice(0, 10),
        order_status: 'to_do' as const,
        invoice_status: 'to_issue' as const,
        quantity: 0,
        rate_per_unit: 0,
        amount: 0,
        book_id: bookId ?? books[0]?.id ?? 1,
        oral_rate: undefined as number | undefined,
        oral_net: undefined as number | null | undefined,
        translation_type: undefined as 'oral' | 'written' | undefined,
        include_service_on_invoice: 1,
        include_language_pair_on_invoice: 1,
        include_invoice_description_on_invoice: 1
      }
      setForm(alreadyInitialized
        ? prev => ({ ...base, unit_id: prev.unit_id, client_id: prev.client_id, service_id: prev.service_id, language_pair_id: prev.language_pair_id, specialization_id: prev.specialization_id })
        : () => base)
      setFormSectionOpen({ written: false, oral: false, refusal: false, status: false })
      setCustomValues({})
    } else {
      addFormInitializedRef.current = false
    }
  }, [editId, searchParams.get('add'), bookId, books])

  // Wymuszenie focusu w polu Nazwa przy formularzu dodawania (księga zwykła)
  const shouldFocusAddName = searchParams.get('add') === '1' && !isRepertoriumBook && !hiddenDefaultColumns.includes('name')
  useEffect(() => {
    if (!shouldFocusAddName) return
    const t = setTimeout(() => addFormNameInputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [shouldFocusAddName])

  // Repertorium ustne: najpierw stawka klienta, potem stawka z ustawień globalnych (jak w pisemnych)
  useEffect(() => {
    const selBook = books.find(b => b.id === (bookId ?? books[0]?.id))
    if (selBook?.view_type !== 'repertorium') return
    const effectiveOralUnitId = form.unit_id ?? repertoriumOralUnitId
    if (!form.oral_lang || !effectiveOralUnitId) {
      setOralRateMessage(null)
      return
    }
    const unitName = units.find(u => u.id === effectiveOralUnitId)?.name ?? ''
    const requestedCurrency = form.rate_currency

    const applyGlobalDefault = () => {
      if (!window.api?.defaultUnitRates?.get) return
      window.api.defaultUnitRates.get(effectiveOralUnitId, rateArgumentCandidates, requestedCurrency).then((r: { rate: number; currency: string } | undefined) => {
        if (r?.rate != null && r.rate > 0) {
          const keepCurrency = (req: string | null | undefined, ret: string | undefined) => {
            const ru = (ret ?? '')?.trim()?.toUpperCase()
            const qu = (req ?? '')?.trim()?.toUpperCase()
            return ru === qu ? ret : null
          }
          setForm(prev => (prev.rate_currency !== requestedCurrency ? prev : { ...prev, oral_rate: r.rate, rate_currency: keepCurrency(requestedCurrency, r.currency) ?? prev.rate_currency }))
          setOralRateMessage(null)
        } else {
          const msg = requestedCurrency ? t('orderBook.noDefaultRateForCurrencyAndUnit', { currency: requestedCurrency, unitName }) : t('orderBook.noDefaultRateForArgumentAndUnit', { unitName })
          setOralRateMessage(msg as string)
        }
      }).catch(() => setOralRateMessage(t('orderBook.noDefaultRateForArgumentAndUnit', { unitName }) as string))
    }

    // Najpierw stawka dla klienta (argument oral_lang jest w rateArgumentCandidates)
    if (form.client_id && window.api?.clientDefaultUnitRates?.get) {
      window.api.clientDefaultUnitRates.get(form.client_id, effectiveOralUnitId, rateArgumentCandidates, requestedCurrency).then((r: unknown) => {
        const row = (r as { rate?: number; currency?: string } | null)
        const rate = row?.rate
        if (rate != null && rate > 0) {
          const retCur = (row?.currency ?? '')?.trim()?.toUpperCase()
          const reqCur = (requestedCurrency ?? '')?.trim()?.toUpperCase()
          setForm(prev => (prev.rate_currency !== requestedCurrency ? prev : { ...prev, oral_rate: rate, rate_currency: retCur === reqCur ? (row?.currency ?? prev.rate_currency) : prev.rate_currency }))
          setOralRateMessage(null)
        } else {
          applyGlobalDefault()
        }
      }).catch(() => applyGlobalDefault())
    } else {
      applyGlobalDefault()
    }
  }, [bookId, books, repertoriumOralUnitId, form.client_id, form.unit_id, form.oral_lang, form.rate_currency, units, rateArgumentCandidates, t])

  const loadOrderSubcontracts = () => {
    if (editId && window.api?.subcontracts?.listByOrderId) {
      window.api.subcontracts.listByOrderId(parseInt(editId, 10)).then((list: unknown) => {
        setOrderSubcontracts(Array.isArray(list) ? list as { id: number; subcontract_number: string; name: string | null; notes: string | null; contractor_short_name: string | null; quantity: number; amount: number; deadline_at: string | null; rate_currency?: string | null }[] : [])
      })
    } else setOrderSubcontracts([])
  }

  useEffect(() => {
    loadOrderSubcontracts()
  }, [editId])

  useEffect(() => {
    if (!addServiceModal || !window.api?.settings?.get) return
    setNewServiceVatGrid(() => ({ ...DEFAULT_SERVICE_VAT_GRID }))
    window.api.settings.get('vat_code_definitions').then((raw: string | null | undefined) => {
      if (raw && typeof raw === 'string' && raw.trim()) {
        try {
          const arr = JSON.parse(raw) as unknown
          if (Array.isArray(arr)) setNewServiceVatCodeDefs(arr as VatCodeDef[])
          else setNewServiceVatCodeDefs([])
        } catch { setNewServiceVatCodeDefs([]) }
      } else setNewServiceVatCodeDefs([])
    }).catch(() => setNewServiceVatCodeDefs([]))
  }, [addServiceModal])

  useEffect(() => {
    if (!addSubcontractModal || !addSubcontractForm.contractor_id || !form.unit_id || !window.api?.contractorUnitRates?.get) return
    window.api.contractorUnitRates.get(addSubcontractForm.contractor_id, form.unit_id, form.language_pair_id ?? undefined).then((r: unknown) => {
      const rate = (r as { rate?: number } | undefined)?.rate
      if (rate != null && rate > 0) setAddSubcontractForm(prev => ({ ...prev, rate_per_unit: rate, amount: calcSubcontractAmount(prev.quantity ?? 0, rate) }))
    })
  }, [addSubcontractModal, addSubcontractForm.contractor_id, form.unit_id, form.language_pair_id])

  // Repertorium pisemne: stawka domyślna po jednostce, parze i walucie; po wyborze waluty matchujemy stawkę
  // Fallback: jeśli form.unit_id nie jest ustawione, użyj repertoriumPageUnitId z ustawień
  useEffect(() => {
    if (!isRepertoriumBook) return
    if (hasClientRateOverride) return
    const effectiveUnitId = form.unit_id ?? repertoriumPageUnitId
    if (!effectiveUnitId || !window.api?.defaultUnitRates?.get) {
      setWrittenRateMessage(null)
      return
    }
    const unitName = units.find(u => u.id === effectiveUnitId)?.name ?? ''
    const requestedCurrency = form.rate_currency
    window.api.defaultUnitRates.get(effectiveUnitId, rateArgumentCandidates, requestedCurrency).then((r: { rate: number; currency: string } | undefined) => {
      if (r?.rate != null && r.rate > 0) {
        const ru = (r.currency ?? '')?.trim()?.toUpperCase()
        const qu = (requestedCurrency ?? '')?.trim()?.toUpperCase()
        setForm(prev => (prev.rate_currency !== requestedCurrency ? prev : { ...prev, rate_per_unit: r.rate, amount: Math.round((prev.quantity ?? 0) * r.rate * 100) / 100, rate_currency: ru === qu ? r.currency : prev.rate_currency }))
        setWrittenRateMessage(null)
      } else {
        const msg = requestedCurrency ? t('orderBook.noDefaultRateForCurrencyAndUnit', { currency: requestedCurrency, unitName }) : t('orderBook.noDefaultRateForArgumentAndUnit', { unitName })
        setWrittenRateMessage(msg as string)
      }
    }).catch(() => setWrittenRateMessage(t('orderBook.noDefaultRateForArgumentAndUnit', { unitName }) as string))
  }, [isRepertoriumBook, hasClientRateOverride, form.unit_id, repertoriumPageUnitId, form.rate_currency, units, rateArgumentCandidates, t])

  // Formularz ogólny: stawka domyślna po jednostce i parze; komunikat gdy brak (działa przy dodawaniu i edycji)
  useEffect(() => {
    if (isRepertoriumBook) return
    if (hasClientRateOverride) return
    if (!form.unit_id || !window.api?.defaultUnitRates?.get) {
      setDefaultRateMessage(null)
      return
    }
    const unitName = units.find(u => u.id === form.unit_id)?.name ?? ''
    const requestedCurrency = form.rate_currency
    window.api.defaultUnitRates.get(form.unit_id, rateArgumentCandidates, requestedCurrency).then((r: { rate: number; currency: string } | undefined) => {
      if (r?.rate != null && r.rate > 0) {
        const ru = (r.currency ?? '')?.trim()?.toUpperCase()
        const qu = (requestedCurrency ?? '')?.trim()?.toUpperCase()
        setForm(prev => (prev.rate_currency !== requestedCurrency ? prev : { ...prev, rate_per_unit: r.rate, amount: Math.round((prev.quantity ?? 0) * r.rate * 100) / 100, rate_currency: ru === qu ? r.currency : prev.rate_currency }))
        setDefaultRateMessage(null)
      } else {
        const msg = requestedCurrency ? t('orderBook.noDefaultRateForCurrencyAndUnit', { currency: requestedCurrency, unitName }) : t('orderBook.noDefaultRateForArgumentAndUnit', { unitName })
        setDefaultRateMessage(msg as string)
      }
    }).catch(() => setDefaultRateMessage(t('orderBook.noDefaultRateForArgumentAndUnit', { unitName }) as string))
  }, [isRepertoriumBook, hasClientRateOverride, form.unit_id, form.rate_currency, units, rateArgumentCandidates, t])

  const recalcAmount = (q: number, rate: number) => {
    setForm(prev => ({ ...prev, quantity: q, rate_per_unit: rate, amount: Math.round(q * rate * 100) / 100 }))
  }

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!window.api) return
    const hasRefusalForm = !!(form.refusal_date || form.refusal_organ || form.refusal_reason)
    const isRepertoriumRefusal = isRepertoriumBook && hasRefusalForm
    const isRepertoriumOral = isRepertoriumBook && form.translation_type === 'oral'
    const hide = (key: string) => hiddenDefaultColumns.includes(key)
    if (isRepertoriumRefusal) {
      if (!hide('client') && !form.client_id) {
        alert(t('orders.clientRequired')); window.api?.app?.refocusWindow?.()
        return
      }
    } else if (isRepertoriumOral) {
      if (!hide('client') && !form.client_id) {
        alert(t('orders.clientRequired')); window.api?.app?.refocusWindow?.()
        return
      }
    } else {
      if (!hide('client') && !form.client_id) {
        alert(t('orders.clientRequired')); window.api?.app?.refocusWindow?.()
        return
      }
      if (!hide('unit') && !form.unit_id) {
        alert(t('orders.clientAndUnitRequired')); window.api?.app?.refocusWindow?.()
        return
      }
    }
    const selectedServiceId = (() => {
      const raw = form.service_id
      if (raw == null) return null
      const n = typeof raw === 'number' ? raw : Number(raw)
      return Number.isFinite(n) && n > 0 ? n : null
    })()
    if (!selectedServiceId) {
      alert(t('orders.serviceRequired')); window.api?.app?.refocusWindow?.()
      return
    }
    const nameTrim = form.name?.trim()
    if (!isRepertoriumBook && !hide('name') && !nameTrim) {
      alert(t('orders.nameRequired')); window.api?.app?.refocusWindow?.()
      return
    }
    if (isRepertoriumBook && !isRepertoriumRefusal && form.translation_type !== 'oral' && form.translation_type !== 'written') {
      alert(t('orders.translationType') + ': ' + t('orders.translationTypeOral') + ' / ' + t('orders.translationTypeWritten')); window.api?.app?.refocusWindow?.()
      return
    }
    const effectiveClientId = hide('client') ? (clients[0]?.id ?? form.client_id) : form.client_id
    void clients.find(c => c.id === effectiveClientId)
    let effectiveVatRate = getVatRateForService(selectedServiceId)
    let effectiveVatCode: string | null = null
    if (effectiveClientId && selectedServiceId && window.api?.clients?.get && window.api?.serviceVatRules?.listByService && window.api?.settings?.get) {
      try {
        const [clientRow, taxpayerCountry, rules] = await Promise.all([
          window.api.clients.get(effectiveClientId) as Promise<{ country_code?: string | null; client_kind?: string | null; vat_eu?: number | null } | null>,
          window.api.settings.get('personal_country') as Promise<string | null>,
          window.api.serviceVatRules.listByService(selectedServiceId) as Promise<VatRuleRow[]>
        ])
        const taxpayerCountryNorm = (taxpayerCountry ?? '').trim()
        if (clientRow && Array.isArray(rules) && rules.length > 0) {
          const segment = getVatSegment(clientRow, taxpayerCountryNorm || null)
          const resolved = resolveVatRule(rules, segment, clientRow.country_code)
          if (resolved) {
            if (resolved.value_type === 'rate' && resolved.rate_value != null) {
              effectiveVatRate = resolved.rate_value
              effectiveVatCode = null
            } else if (resolved.value_type === 'code') {
              effectiveVatCode = normalizeVatCode(resolved.code_value)
              effectiveVatRate = 0
            }
          }
        }
      } catch {
        // keep fallback effectiveVatRate / effectiveVatCode
      }
    }
    const effectiveUnitId = (() => {
      if (isRepertoriumBook && !isRepertoriumRefusal) {
        if (isRepertoriumOral) return repertoriumOralUnitId ?? form.unit_id ?? null
        return repertoriumPageUnitId ?? form.unit_id ?? null
      }
      if (hide('unit')) return units[0]?.id ?? form.unit_id ?? repertoriumOralUnitId ?? null
      return isRepertoriumRefusal
        ? (form.unit_id ?? units[0]?.id ?? repertoriumOralUnitId ?? null)
        : isRepertoriumOral
          ? (form.unit_id ?? repertoriumOralUnitId ?? null)
          : form.unit_id
    })()
    const payload: Record<string, unknown> = {
      client_id: effectiveClientId,
      received_at: hide('received_at') ? new Date().toISOString().slice(0, 10) : (form.received_at || new Date().toISOString().slice(0, 10)),
      deadline_at: hide('deadline') ? null : (form.deadline_at || null),
      completed_at: hide('completed_at') ? null : (form.completed_at || null),
      specialization: hide('specialization') ? null : (form.specialization_name || form.specialization || null),
      specialization_id: hide('specialization') ? null : (form.specialization_id ?? null),
      language_pair_id: hide('language_pair') ? null : (form.language_pair_id || null),
      unit_id: effectiveUnitId,
      quantity: hide('quantity') ? 0 : (Number(form.quantity) || 0),
      rate_per_unit: (['amount_net', 'amount_vat', 'amount_gross'].some(k => hide(k)) ? 0 : Number(form.rate_per_unit)) || 0,
      amount: (['amount_net', 'amount_vat', 'amount_gross'].some(k => hide(k)) ? 0 : Number(form.amount)) || 0,
      order_status: hide('order_status') ? 'to_do' : (form.order_status || 'to_do'),
      invoice_status: hide('invoice_status') ? 'to_issue' : (form.invoice_status || 'to_issue'),
      contractor_id: null,
      book_id: form.book_id ?? bookId ?? books[0]?.id ?? 1,
      name: hide('name') ? null : (isRepertoriumBook ? (nameTrim || form.repertorium_description?.trim() || null) : nameTrim || null),
      repertorium_description: form.repertorium_description ?? null,
      document_author: form.document_author ?? null,
      document_name: form.document_name ?? null,
      document_date: form.document_date ?? null,
      document_number: form.document_number ?? null,
      document_form_remarks: form.document_form_remarks ?? null,
      extra_copies: form.extra_copies ?? 0,
      repertorium_notes: form.repertorium_notes ?? null,
      repertorium_activity_type: form.repertorium_activity_type ?? null,
      oral_date: form.oral_date ?? null,
      oral_place: form.oral_place ?? null,
      oral_lang: form.oral_lang ?? null,
      oral_duration: form.oral_duration ?? null,
      oral_scope: form.oral_scope ?? null,
      oral_rate: form.oral_rate ?? null,
      oral_net: (form.oral_rate != null && form.oral_duration != null) ? Math.round((form.oral_rate * form.oral_duration) * 100) / 100 : (form.oral_net ?? null),
      oral_gross: (() => {
        const net = (form.oral_rate != null && form.oral_duration != null) ? form.oral_rate * form.oral_duration : (form.oral_net ?? null)
        if (net == null) return form.oral_gross ?? null
        return Math.round(net * (1 + effectiveVatRate / 100) * 100) / 100
      })(),
      oral_notes: form.oral_notes ?? null,
      refusal_date: form.refusal_date ?? null,
      refusal_organ: form.refusal_organ ?? null,
      refusal_reason: form.refusal_reason ?? null,
      invoice_description: form.invoice_description ?? null,
      translation_type: form.translation_type ?? null,
      rate_currency: form.rate_currency ?? defaultCurrency ?? null,
      order_vat_rate: effectiveVatRate,
      order_vat_code: effectiveVatCode,
      service_id: selectedServiceId,
      include_service_on_invoice: form.include_service_on_invoice ?? 1,
      include_language_pair_on_invoice: form.include_language_pair_on_invoice ?? 1,
      include_invoice_description_on_invoice: form.include_invoice_description_on_invoice ?? 1
    }
    if (editId) {
      payload.payment_due_at = hide('payment_due') ? null : (form.payment_due_at || null)
      payload.invoice_number = form.invoice_number ?? null
      payload.invoice_date = form.invoice_date ?? null
      payload.order_number = form.order_number ?? null
    }

    if (isRepertoriumBook && !isRepertoriumRefusal) {
      if (form.translation_type === 'written') {
        payload.oral_date = null
        payload.oral_place = null
        payload.oral_lang = null
        payload.oral_duration = null
        payload.oral_scope = null
        payload.oral_rate = null
        payload.oral_net = null
        payload.oral_gross = null
        payload.oral_notes = null
      } else if (form.translation_type === 'oral') {
        payload.document_author = null
        payload.document_name = null
        payload.document_date = null
        payload.document_number = null
        payload.document_form_remarks = null
        payload.repertorium_activity_type = null
        payload.repertorium_notes = null
        payload.extra_copies = 0
        payload.language_pair_id = null
      }
    }
    try {
      if (editId) {
        const oid = parseInt(editId, 10)
        await window.api.orders.update(oid, payload)
        if (orderBookView === 'custom' && Object.keys(customValues).length > 0 && window.api.customColumnValues?.bulkSet) {
          await window.api.customColumnValues.bulkSet(oid, customValues)
        }
        setSearchParams({})
        alert(t('orders.saved')); window.api?.app?.refocusWindow?.()
      } else {
        const newId = await window.api.orders.add(payload)
        if (orderBookView === 'custom' && Object.keys(customValues).length > 0 && window.api.customColumnValues?.bulkSet) {
          await window.api.customColumnValues.bulkSet(newId, customValues)
        }
        setSearchParams({})
        alert(t('orders.saved')); window.api?.app?.refocusWindow?.()
        // Po alert() w Electron focus znika – wymuszamy focus w polu Nazwa, żeby od razu móc wpisać kolejne zlecenie
        setTimeout(() => addFormNameInputRef.current?.focus(), 150)
      }
      setForm({ received_at: new Date().toISOString().slice(0, 10), order_status: 'to_do', invoice_status: 'to_issue', quantity: 0, rate_per_unit: 0, amount: 0, include_service_on_invoice: 1, include_language_pair_on_invoice: 1, include_invoice_description_on_invoice: 1 })
      setCustomValues({})
      load()
    } catch (err) {
      alert(t('orders.saveError') + (err instanceof Error ? ': ' + err.message : '')); window.api?.app?.refocusWindow?.()
    }
  }

  const deleteOrder = async (id: number) => {
    const okDel = confirm(t('orders.deleteConfirm')); window.api?.app?.refocusWindow?.(); if (!window.api || !okDel) return
    await window.api.orders.delete(id)
    load()
    if (editId === String(id)) setSearchParams({})
  }

  const deleteOrderBulk = async (ids: number[]) => {
    if (!window.api || ids.length === 0) return
    const okDel = confirm(t('orderBook.deleteConfirmSelected', { count: ids.length })); window.api?.app?.refocusWindow?.(); if (!okDel) return
    for (const id of ids) {
      await window.api.orders.delete(id)
    }
    setSelectedOrderIds([])
    load()
    if (editId && ids.includes(parseInt(editId, 10))) setSearchParams({})
  }

  const duplicateOrder = async (id: number) => {
    if (!window.api) return
    try {
      const row = await window.api.orders.get(id) as Record<string, unknown> | null
      if (!row) return
      const today = new Date().toISOString().slice(0, 10)
      const payload: Record<string, unknown> = {
        client_id: row.client_id,
        book_id: row.book_id ?? bookId ?? books[0]?.id ?? 1,
        unit_id: row.unit_id,
        language_pair_id: row.language_pair_id ?? null,
        specialization_id: row.specialization_id ?? null,
        specialization: row.specialization ?? null,
        contractor_id: row.contractor_id ?? null,
        received_at: today,
        deadline_at: row.deadline_at ?? null,
        completed_at: null,
        name: row.name ?? null,
        repertorium_description: row.repertorium_description ?? null,
        invoice_description: row.invoice_description ?? null,
        translation_type: row.translation_type ?? null,
        document_author: row.document_author ?? null,
        document_name: row.document_name ?? null,
        document_date: row.document_date ?? null,
        document_number: row.document_number ?? null,
        document_form_remarks: row.document_form_remarks ?? null,
        extra_copies: row.extra_copies ?? 0,
        repertorium_notes: row.repertorium_notes ?? null,
        repertorium_activity_type: row.repertorium_activity_type ?? null,
        oral_date: row.oral_date ?? null,
        oral_place: row.oral_place ?? null,
        oral_lang: row.oral_lang ?? null,
        oral_duration: row.oral_duration ?? null,
        oral_scope: row.oral_scope ?? null,
        oral_rate: row.oral_rate ?? null,
        oral_net: row.oral_net ?? null,
        oral_gross: row.oral_gross ?? null,
        oral_notes: row.oral_notes ?? null,
        refusal_date: row.refusal_date ?? null,
        refusal_organ: row.refusal_organ ?? null,
        refusal_reason: row.refusal_reason ?? null,
        quantity: Number(row.quantity) || 0,
        rate_per_unit: Number(row.rate_per_unit) || 0,
        amount: Number(row.amount) || 0,
        order_status: 'to_do',
        invoice_status: 'to_issue',
        payment_due_at: null,
        order_vat_rate: row.order_vat_rate ?? null,
        order_vat_code: row.order_vat_code ?? null,
        service_id: row.service_id ?? null,
        include_service_on_invoice: row.include_service_on_invoice ?? 1,
        include_language_pair_on_invoice: row.include_language_pair_on_invoice ?? 1,
        include_invoice_description_on_invoice: row.include_invoice_description_on_invoice ?? 1,
        rate_currency: row.rate_currency ?? null,
        invoice_notes: row.invoice_notes ?? null,
        invoice_bank_account_id: row.invoice_bank_account_id ?? null
      }
      await window.api.orders.add(payload)
      load()
      alert(t('orders.duplicated')); window.api?.app?.refocusWindow?.()
    } catch (err) {
      alert(t('orders.saveError') + (err instanceof Error ? ': ' + err.message : '')); window.api?.app?.refocusWindow?.()
    }
  }

  const openIssueModal = async (orderId: number) => {
    setIssueModal({ orderId })
    const provider = (await window.api?.settings?.get?.('invoice_provider')) as string | null | undefined
    const isWfirma = provider === 'wfirma'
    setIssueInvoiceProvider(isWfirma ? 'wfirma' : 'internal')
    const dateStr = new Date().toISOString().slice(0, 10)
    setIssueDate(dateStr)
    setIssueSaleDate(dateStr)
    setIssuePaymentDue('')
    setIssueNotesExtra('')
    setIssueBankAccountId(0)
    setIssueWfirmaCompanyAccountId(0)
    setIssueWfirmaCompanyAccounts([])
    setIssueWfirmaAccountsMessage(null)
    let list: string[] = []
    try {
      const raw = (await window.api?.settings?.get?.('invoice_notes_list')) as string | null | undefined
      const legacy = (await window.api?.settings?.get?.('invoice_notes')) as string | null | undefined
      if (raw && typeof raw === 'string' && raw.trim()) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) list = parsed.filter((x: unknown) => typeof x === 'string')
      }
      if (list.length === 0 && legacy && typeof legacy === 'string' && legacy.trim()) list = [legacy.trim()]
    } catch { /* ignore */ }
    setIssueNoteTemplates(list)
    setIssueNoteSelected(list.map(() => false))
    if (!isWfirma) {
      const fmt = await window.api?.settings?.get?.('invoice_number_format').catch(() => null)
      const format = String(fmt ?? '').trim() || 'FV/{YYYY}/{NR}'
      const num = computeNextInternalInvoiceNumberFromOrders(orders, format)
      setIssueNumber(num)
      const ba = await window.api?.bankAccounts?.list?.() ?? []
      setIssueBankAccounts(Array.isArray(ba) ? ba : [])
      const def = (Array.isArray(ba) ? ba : []).find((b: { is_default: number }) => b.is_default === 1)
      if (def) setIssueBankAccountId(def.id)
      return
    }
    setIssueNumber('')
    if (!window.api?.wfirma?.listCompanyAccounts) return
    const [access, secret, app, companyId, selectedCompanyAccountId] = await Promise.all([
      window.api?.settings?.get?.('wfirma_access_key'),
      window.api?.settings?.get?.('wfirma_secret_key'),
      window.api?.settings?.get?.('wfirma_app_key'),
      window.api?.settings?.get?.('wfirma_company_id'),
      window.api?.settings?.get?.('wfirma_company_account_id')
    ])
    const accessKey = String(access ?? '').trim()
    const secretKey = String(secret ?? '').trim()
    if (!accessKey || !secretKey) {
      setIssueWfirmaAccountsMessage(t('settings.wfirmaAccountsNeedKeys'))
      return
    }
    setIssueWfirmaAccountsLoading(true)
    try {
      const list = await window.api.wfirma.listCompanyAccounts(accessKey, secretKey, String(app ?? '').trim() || undefined, String(companyId ?? '').trim() || undefined)
      const accounts = Array.isArray(list) ? list : []
      setIssueWfirmaCompanyAccounts(accounts)
      const selectedId = parseInt(String(selectedCompanyAccountId ?? ''), 10)
      const bySetting = Number.isFinite(selectedId) ? accounts.find(a => a.id === selectedId) : undefined
      const first = accounts[0]
      setIssueWfirmaCompanyAccountId(bySetting?.id ?? first?.id ?? 0)
      if (!accounts.length) setIssueWfirmaAccountsMessage(t('settings.wfirmaAccountsEmpty'))
    } catch (e) {
      setIssueWfirmaAccountsMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setIssueWfirmaAccountsLoading(false)
    }
  }

  const openIssueModalForSelected = async () => {
    if (selectedOrderIds.length === 0) {
      alert(t('orderBook.selectAtLeastOne')); window.api?.app?.refocusWindow?.()
      return
    }
    const ordersById = new Map(orders.map(o => [o.id, o]))
    const clients = new Set(selectedOrderIds.map(id => ordersById.get(id)?.client_id).filter(Boolean))
    if (clients.size !== 1) {
      alert(t('orderBook.sameClientRequired')); window.api?.app?.refocusWindow?.()
      return
    }
    const currencies = new Set(selectedOrderIds.map(id => (ordersById.get(id) as OrderRow & { rate_currency?: string | null })?.rate_currency ?? defaultCurrency).filter(Boolean))
    if (currencies.size > 1) {
      alert(t('orderBook.sameCurrencyRequired')); window.api?.app?.refocusWindow?.()
      return
    }
    setIssueModal({ orderIds: [...selectedOrderIds] })
    const provider = (await window.api?.settings?.get?.('invoice_provider')) as string | null | undefined
    const isWfirma = provider === 'wfirma'
    setIssueInvoiceProvider(isWfirma ? 'wfirma' : 'internal')
    const dateStr = new Date().toISOString().slice(0, 10)
    setIssueDate(dateStr)
    setIssueSaleDate(dateStr)
    setIssuePaymentDue('')
    setIssueNotesExtra('')
    setIssueBankAccountId(0)
    setIssueWfirmaCompanyAccountId(0)
    setIssueWfirmaCompanyAccounts([])
    setIssueWfirmaAccountsMessage(null)
    let list: string[] = []
    try {
      const raw = (await window.api?.settings?.get?.('invoice_notes_list')) as string | null | undefined
      const legacy = (await window.api?.settings?.get?.('invoice_notes')) as string | null | undefined
      if (raw && typeof raw === 'string' && raw.trim()) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) list = parsed.filter((x: unknown) => typeof x === 'string')
      }
      if (list.length === 0 && legacy && typeof legacy === 'string' && legacy.trim()) list = [legacy.trim()]
    } catch { /* ignore */ }
    setIssueNoteTemplates(list)
    setIssueNoteSelected(list.map(() => false))
    if (!isWfirma) {
      const fmt = await window.api?.settings?.get?.('invoice_number_format').catch(() => null)
      const format = String(fmt ?? '').trim() || 'FV/{YYYY}/{NR}'
      const num = computeNextInternalInvoiceNumberFromOrders(orders, format)
      setIssueNumber(num)
      const ba = await window.api?.bankAccounts?.list?.() ?? []
      setIssueBankAccounts(Array.isArray(ba) ? ba : [])
      const def = (Array.isArray(ba) ? ba : []).find((b: { is_default: number }) => b.is_default === 1)
      if (def) setIssueBankAccountId(def.id)
      return
    }
    setIssueNumber('')
    if (!window.api?.wfirma?.listCompanyAccounts) return
    const [access, secret, app, companyId, selectedCompanyAccountId] = await Promise.all([
      window.api?.settings?.get?.('wfirma_access_key'),
      window.api?.settings?.get?.('wfirma_secret_key'),
      window.api?.settings?.get?.('wfirma_app_key'),
      window.api?.settings?.get?.('wfirma_company_id'),
      window.api?.settings?.get?.('wfirma_company_account_id')
    ])
    const accessKey = String(access ?? '').trim()
    const secretKey = String(secret ?? '').trim()
    if (!accessKey || !secretKey) {
      setIssueWfirmaAccountsMessage(t('settings.wfirmaAccountsNeedKeys'))
      return
    }
    setIssueWfirmaAccountsLoading(true)
    try {
      const list = await window.api.wfirma.listCompanyAccounts(accessKey, secretKey, String(app ?? '').trim() || undefined, String(companyId ?? '').trim() || undefined)
      const accounts = Array.isArray(list) ? list : []
      setIssueWfirmaCompanyAccounts(accounts)
      const selectedId = parseInt(String(selectedCompanyAccountId ?? ''), 10)
      const bySetting = Number.isFinite(selectedId) ? accounts.find(a => a.id === selectedId) : undefined
      const first = accounts[0]
      setIssueWfirmaCompanyAccountId(bySetting?.id ?? first?.id ?? 0)
      if (!accounts.length) setIssueWfirmaAccountsMessage(t('settings.wfirmaAccountsEmpty'))
    } catch (e) {
      setIssueWfirmaAccountsMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setIssueWfirmaAccountsLoading(false)
    }
  }

  const submitIssueInvoice = async () => {
    if (!window.api || !issueModal) return
    if (issueInvoiceProvider !== 'wfirma' && !issueNumber.trim()) return
    if (issueInvoiceProvider === 'wfirma' && !issueWfirmaCompanyAccountId) {
      alert(t('orderBook.wfirmaAccountRequired')); window.api?.app?.refocusWindow?.()
      return
    }
    const selectedNotes = issueNoteTemplates.filter((_, i) => issueNoteSelected[i]).join('\n')
    const extra = issueNotesExtra.trim()
    const notes = extra ? (selectedNotes ? selectedNotes + '\n' + extra : extra) : selectedNotes
    const opts: {
      invoice_sale_date?: string
      payment_due_at?: string
      invoice_notes?: string
      invoice_bank_account_id?: number
      wfirma_company_account_id?: number
    } = {
      invoice_sale_date: issueSaleDate.trim() || undefined,
      payment_due_at: issuePaymentDue.trim() || undefined,
      invoice_notes: notes || undefined
    }
    if (issueInvoiceProvider === 'wfirma') opts.wfirma_company_account_id = issueWfirmaCompanyAccountId || undefined
    else opts.invoice_bank_account_id = issueBankAccountId || undefined
    const submitInvoiceNumber = issueInvoiceProvider === 'wfirma' ? '' : issueNumber.trim()
    try {
      if ('orderIds' in issueModal) {
        await window.api.orders.issueInvoices(issueModal.orderIds, submitInvoiceNumber, issueDate, opts)
        setSelectedOrderIds([])
      } else {
        await window.api.orders.issueInvoice(issueModal.orderId, submitInvoiceNumber, issueDate, opts)
      }
      setIssueModal(null)
      load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      let text = issueInvoiceProvider === 'wfirma'
        ? t('settings.invoiceIssueWfirmaError') + ' ' + msg
        : msg
      if (issueInvoiceProvider === 'wfirma' && (msg.includes('płatnikiem VAT') || msg.includes('VAT payer'))) {
        text += '\n\n' + t('settings.invoiceIssueWfirmaVatPayerHint')
      }
      alert(text)
      window.api?.app?.refocusWindow?.()
    }
  }

  /** Nagłówki z UI (i18n) – ten sam zestaw kolumn co w tabeli. */
  const exportColumns = useMemo(() => {
    const config = orderBookView === 'repertorium' ? EXPORT_COLUMNS_REPERTORIUM : EXPORT_COLUMNS_SIMPLIFIED
    const cols = config.map(({ key, labelKey }) => ({ key, label: t(labelKey) }))
    if (orderBookView === 'custom') {
      for (const cc of customColumns) {
        cols.push({ key: `custom_${cc.id}`, label: cc.name })
      }
    }
    return cols
  }, [orderBookView, t, customColumns])

  const exportXls = async () => {
    if (window.api?.export?.ordersXls) await window.api.export.ordersXls(bookId, exportColumns)
  }
  const exportXlsx = async () => {
    if (window.api?.export?.ordersXlsx) await window.api.export.ordersXlsx(bookId, exportColumns)
  }
  const exportPdf = async () => {
    if (window.api?.export?.ordersPdf) await window.api.export.ordersPdf(bookId, exportColumns)
  }

  const filteredAndSortedOrders = useMemo(() => {
    let list = [...orders]
    const onum = filters.orderNumberContains.trim().toLowerCase()
    if (onum) list = list.filter(o => ((o.order_number ?? '') + (o.id ?? '')).toLowerCase().includes(onum))
    const nameSub = filters.nameContains.trim().toLowerCase()
    if (nameSub) list = list.filter(o => ((o.name ?? '')).toLowerCase().includes(nameSub))
    if (filters.clientIds.length) list = list.filter(o => filters.clientIds.includes(o.client_id))
    if (filters.contractorIds.length) list = list.filter(o => o.contractor_id != null && filters.contractorIds.includes(o.contractor_id))
    if (filters.receivedAtFrom) list = list.filter(o => (o.received_at || '') >= filters.receivedAtFrom)
    if (filters.receivedAtTo) list = list.filter(o => (o.received_at || '') <= filters.receivedAtTo)
    if (filters.deadlineFrom) list = list.filter(o => (o.deadline_at || '') >= filters.deadlineFrom)
    if (filters.deadlineTo) list = list.filter(o => (o.deadline_at || '') <= filters.deadlineTo)
    if (filters.completedAtFrom) list = list.filter(o => (o.completed_at || '') >= filters.completedAtFrom)
    if (filters.completedAtTo) list = list.filter(o => (o.completed_at || '') <= filters.completedAtTo)
    if (filters.specializationIds.length) list = list.filter(o => o.specialization_id != null && filters.specializationIds.includes(o.specialization_id))
    if (filters.languagePairIds.length) list = list.filter(o => o.language_pair_id != null && filters.languagePairIds.includes(o.language_pair_id))
    if (filters.unitIds.length) list = list.filter(o => filters.unitIds.includes(o.unit_id))
    const qMin = parseFloat(filters.quantityMin)
    if (!Number.isNaN(qMin)) list = list.filter(o => (o.quantity ?? 0) >= qMin)
    const qMax = parseFloat(filters.quantityMax)
    if (!Number.isNaN(qMax)) list = list.filter(o => (o.quantity ?? 0) <= qMax)
    const aMin = parseFloat(filters.amountMin)
    if (!Number.isNaN(aMin)) list = list.filter(o => (o.amount ?? 0) >= aMin)
    const aMax = parseFloat(filters.amountMax)
    if (!Number.isNaN(aMax)) list = list.filter(o => (o.amount ?? 0) <= aMax)
    if (filters.orderStatuses.length) list = list.filter(o => filters.orderStatuses.includes(o.order_status))
    if (filters.invoiceStatuses.length) list = list.filter(o => filters.invoiceStatuses.includes(o.invoice_status))
    if (filters.paymentDueFrom) list = list.filter(o => (o.payment_due_at || '') >= filters.paymentDueFrom)
    if (filters.paymentDueTo) list = list.filter(o => (o.payment_due_at || '') <= filters.paymentDueTo)
    const oralDateFrom = filters.oralDateFrom
    if (oralDateFrom) list = list.filter(o => ((o as OrderRow).oral_date || '') >= oralDateFrom)
    const oralDateTo = filters.oralDateTo
    if (oralDateTo) list = list.filter(o => ((o as OrderRow).oral_date || '') <= oralDateTo)
    const oralNetMin = parseFloat(filters.oralNetMin)
    if (!Number.isNaN(oralNetMin)) list = list.filter(o => ((o as OrderRow).oral_net ?? 0) >= oralNetMin)
    const oralNetMax = parseFloat(filters.oralNetMax)
    if (!Number.isNaN(oralNetMax)) list = list.filter(o => ((o as OrderRow).oral_net ?? 0) <= oralNetMax)
    if (filters.documentAuthorContains.trim()) list = list.filter(o => ((o as OrderRow).document_author ?? '').toLowerCase().includes(filters.documentAuthorContains.trim().toLowerCase()))
    if (filters.documentNameContains.trim()) list = list.filter(o => ((o as OrderRow).document_name ?? '').toLowerCase().includes(filters.documentNameContains.trim().toLowerCase()))
    if (filters.documentDateFrom) list = list.filter(o => ((o as OrderRow).document_date || '') >= filters.documentDateFrom)
    if (filters.documentDateTo) list = list.filter(o => ((o as OrderRow).document_date || '') <= filters.documentDateTo)
    if (filters.documentNumberContains.trim()) list = list.filter(o => ((o as OrderRow).document_number ?? '').toLowerCase().includes(filters.documentNumberContains.trim().toLowerCase()))
    if (filters.documentFormRemarksContains.trim()) list = list.filter(o => (((o as OrderRow).document_form_remarks ?? '') + ((o as OrderRow).repertorium_description ?? '')).toLowerCase().includes(filters.documentFormRemarksContains.trim().toLowerCase()))
    if (filters.activityTypeContains.trim()) list = list.filter(o => ((o as OrderRow).repertorium_activity_type ?? '').toLowerCase().includes(filters.activityTypeContains.trim().toLowerCase()))
    const rpMin = parseFloat(filters.ratePerPageMin)
    if (!Number.isNaN(rpMin)) list = list.filter(o => (o.rate_per_unit ?? 0) >= rpMin)
    const rpMax = parseFloat(filters.ratePerPageMax)
    if (!Number.isNaN(rpMax)) list = list.filter(o => (o.rate_per_unit ?? 0) <= rpMax)
    const exMin = parseFloat(filters.extraCopiesMin)
    if (!Number.isNaN(exMin)) list = list.filter(o => ((o as OrderRow).extra_copies ?? 0) >= exMin)
    const exMax = parseFloat(filters.extraCopiesMax)
    if (!Number.isNaN(exMax)) list = list.filter(o => ((o as OrderRow).extra_copies ?? 0) <= exMax)
    const grossMin = parseFloat(filters.amountGrossMin)
    if (!Number.isNaN(grossMin)) list = list.filter(o => {
      const net = o.amount ?? 0
      const gross = net * (1 + getVatRateForOrder(o) / 100)
      return gross >= grossMin
    })
    const grossMax = parseFloat(filters.amountGrossMax)
    if (!Number.isNaN(grossMax)) list = list.filter(o => {
      const net = o.amount ?? 0
      const gross = net * (1 + getVatRateForOrder(o) / 100)
      return gross <= grossMax
    })
    if (filters.notesContains.trim()) list = list.filter(o => ((o as OrderRow).repertorium_notes ?? '').toLowerCase().includes(filters.notesContains.trim().toLowerCase()))
    if (filters.oralPlaceContains.trim()) list = list.filter(o => ((o as OrderRow).oral_place ?? '').toLowerCase().includes(filters.oralPlaceContains.trim().toLowerCase()))
    if (filters.oralLangContains.trim()) list = list.filter(o => ((o as OrderRow).oral_lang ?? '').toLowerCase().includes(filters.oralLangContains.trim().toLowerCase()))
    const odMin = parseFloat(filters.oralDurationMin)
    if (!Number.isNaN(odMin)) list = list.filter(o => ((o as OrderRow).oral_duration ?? 0) >= odMin)
    const odMax = parseFloat(filters.oralDurationMax)
    if (!Number.isNaN(odMax)) list = list.filter(o => ((o as OrderRow).oral_duration ?? 0) <= odMax)
    if (filters.oralScopeContains.trim()) list = list.filter(o => ((o as OrderRow).oral_scope ?? '').toLowerCase().includes(filters.oralScopeContains.trim().toLowerCase()))
    const orMin = parseFloat(filters.oralRateMin)
    if (!Number.isNaN(orMin)) list = list.filter(o => ((o as OrderRow).oral_rate ?? 0) >= orMin)
    const orMax = parseFloat(filters.oralRateMax)
    if (!Number.isNaN(orMax)) list = list.filter(o => ((o as OrderRow).oral_rate ?? 0) <= orMax)
    const ogMin = parseFloat(filters.oralGrossMin)
    if (!Number.isNaN(ogMin)) list = list.filter(o => ((o as OrderRow).oral_gross ?? 0) >= ogMin)
    const ogMax = parseFloat(filters.oralGrossMax)
    if (!Number.isNaN(ogMax)) list = list.filter(o => ((o as OrderRow).oral_gross ?? 0) <= ogMax)
    if (filters.oralNotesContains.trim()) list = list.filter(o => ((o as OrderRow).oral_notes ?? '').toLowerCase().includes(filters.oralNotesContains.trim().toLowerCase()))
    if (filters.refusalDateFrom) list = list.filter(o => ((o as OrderRow).refusal_date || '') >= filters.refusalDateFrom)
    if (filters.refusalDateTo) list = list.filter(o => ((o as OrderRow).refusal_date || '') <= filters.refusalDateTo)
    if (filters.refusalOrganContains.trim()) list = list.filter(o => ((o as OrderRow).refusal_organ ?? '').toLowerCase().includes(filters.refusalOrganContains.trim().toLowerCase()))
    if (filters.refusalReasonContains.trim()) list = list.filter(o => ((o as OrderRow).refusal_reason ?? '').toLowerCase().includes(filters.refusalReasonContains.trim().toLowerCase()))
    const validRepertoriumSort = REPERTORIUM_SORT_OPTIONS.some(opt => opt.value === sortBy) ? sortBy : 'received_at'
    const validSimplifiedSort = SIMPLIFIED_SORT_OPTIONS.some(opt => opt.value === sortBy) ? sortBy : 'received_at'
    const sortKey = orderBookView === 'repertorium' ? validRepertoriumSort : validSimplifiedSort
    list.sort((a, b) => {
      let cmp = 0
      if (orderBookView === 'repertorium') {
        const oa = a as OrderRow
        const ob = b as OrderRow
        switch (sortKey) {
          case 'order_number': cmp = (a.order_number ?? '').localeCompare(b.order_number ?? ''); break
          case 'received_at': cmp = (a.received_at || '').localeCompare(b.received_at || ''); break
          case 'client': cmp = (a.client_short_name || '').localeCompare(b.client_short_name || ''); break
          case 'document_author': cmp = (oa.document_author ?? '').localeCompare(ob.document_author ?? ''); break
          case 'document_name': cmp = (oa.document_name ?? '').localeCompare(ob.document_name ?? ''); break
          case 'document_date': cmp = (oa.document_date || '').localeCompare(ob.document_date || ''); break
          case 'document_number': cmp = (oa.document_number ?? '').localeCompare(ob.document_number ?? ''); break
          case 'language_pair': cmp = (a.language_pair_label || '').localeCompare(b.language_pair_label || ''); break
          case 'document_form_remarks': cmp = (oa.document_form_remarks ?? oa.repertorium_description ?? '').localeCompare(ob.document_form_remarks ?? ob.repertorium_description ?? ''); break
          case 'repertorium_activity_type': cmp = (oa.repertorium_activity_type ?? '').localeCompare(ob.repertorium_activity_type ?? ''); break
          case 'quantity': cmp = (a.quantity ?? 0) - (b.quantity ?? 0); break
          case 'rate_per_unit': cmp = (a.rate_per_unit ?? 0) - (b.rate_per_unit ?? 0); break
          case 'extra_copies': cmp = (oa.extra_copies ?? 0) - (ob.extra_copies ?? 0); break
          case 'amount': cmp = (a.amount ?? 0) - (b.amount ?? 0); break
          case 'amount_gross': {
            const grossA = (a.amount ?? 0) * (1 + getVatRateForOrder(a) / 100)
            const grossB = (b.amount ?? 0) * (1 + getVatRateForOrder(b) / 100)
            cmp = grossA - grossB
            break
          }
          case 'completed_at': cmp = (a.completed_at || '').localeCompare(b.completed_at || ''); break
          case 'repertorium_notes': cmp = (oa.repertorium_notes ?? '').localeCompare(ob.repertorium_notes ?? ''); break
          case 'oral_date': cmp = (oa.oral_date || '').localeCompare(ob.oral_date || ''); break
          case 'oral_place': cmp = (oa.oral_place ?? '').localeCompare(ob.oral_place ?? ''); break
          case 'oral_lang': cmp = (oa.oral_lang ?? '').localeCompare(ob.oral_lang ?? ''); break
          case 'oral_duration': cmp = (oa.oral_duration ?? 0) - (ob.oral_duration ?? 0); break
          case 'oral_scope': cmp = (oa.oral_scope ?? '').localeCompare(ob.oral_scope ?? ''); break
          case 'oral_rate': cmp = (oa.oral_rate ?? 0) - (ob.oral_rate ?? 0); break
          case 'oral_net': cmp = (oa.oral_net ?? 0) - (ob.oral_net ?? 0); break
          case 'oral_gross': cmp = (oa.oral_gross ?? 0) - (ob.oral_gross ?? 0); break
          case 'oral_notes': cmp = (oa.oral_notes ?? '').localeCompare(ob.oral_notes ?? ''); break
          case 'refusal_date': cmp = (oa.refusal_date || '').localeCompare(ob.refusal_date || ''); break
          case 'refusal_organ': cmp = (oa.refusal_organ ?? '').localeCompare(ob.refusal_organ ?? ''); break
          case 'refusal_reason': cmp = (oa.refusal_reason ?? '').localeCompare(ob.refusal_reason ?? ''); break
          case 'order_status': cmp = (a.order_status || '').localeCompare(b.order_status || ''); break
          case 'invoice_status': cmp = (a.invoice_status || '').localeCompare(b.invoice_status || ''); break
          case 'payment_due_at': cmp = (a.payment_due_at || '').localeCompare(b.payment_due_at || ''); break
          default: cmp = (a.received_at || '').localeCompare(b.received_at || '')
        }
      } else {
        switch (sortKey) {
          case 'order_number': cmp = (a.order_number ?? '').localeCompare(b.order_number ?? ''); break
          case 'received_at': cmp = (a.received_at || '').localeCompare(b.received_at || ''); break
          case 'client': cmp = (a.client_short_name || '').localeCompare(b.client_short_name || ''); break
          case 'subcontracts': {
            const subsA = allSubcontractsByOrderId.get(a.id) ?? []
            const subsB = allSubcontractsByOrderId.get(b.id) ?? []
            cmp = subsA.length - subsB.length
            if (cmp === 0) cmp = (subsA[0]?.name || subsA[0]?.subcontract_number || '').localeCompare(subsB[0]?.name || subsB[0]?.subcontract_number || '')
            break
          }
          case 'deadline_at': cmp = (a.deadline_at || '').localeCompare(b.deadline_at || ''); break
          case 'completed_at': cmp = (a.completed_at || '').localeCompare(b.completed_at || ''); break
          case 'specialization': cmp = (a.specialization_name || a.specialization || '').localeCompare(b.specialization_name || b.specialization || ''); break
          case 'language_pair': cmp = (a.language_pair_label || '').localeCompare(b.language_pair_label || ''); break
          case 'unit': cmp = (a.unit_name || '').localeCompare(b.unit_name || ''); break
          case 'quantity': cmp = (a.quantity ?? 0) - (b.quantity ?? 0); break
          case 'amount': cmp = (a.amount ?? 0) - (b.amount ?? 0); break
          case 'amount_gross': {
            const grossA = (a.amount ?? 0) * (1 + getVatRateForOrder(a) / 100)
            const grossB = (b.amount ?? 0) * (1 + getVatRateForOrder(b) / 100)
            cmp = grossA - grossB
            break
          }
          case 'order_status': cmp = (a.order_status || '').localeCompare(b.order_status || ''); break
          case 'invoice_status': cmp = (a.invoice_status || '').localeCompare(b.invoice_status || ''); break
          case 'payment_due_at': cmp = (a.payment_due_at || '').localeCompare(b.payment_due_at || ''); break
          default: cmp = (a.received_at || '').localeCompare(b.received_at || '')
        }
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [orders, filters, sortBy, sortDir, orderBookView, allSubcontractsByOrderId, vatRate, services])

  /** Lista do tabeli repertorium: ta sama kolejność co filteredAndSortedOrders (sortowanie użytkownika), Lp = pozycja w liście. */
  const repertoriumDisplayList = useMemo(() => {
    if (orderBookView !== 'repertorium') return []
    return filteredAndSortedOrders.map((o, i) => ({ ...o, repertoriumLp: i + 1 }))
  }, [orderBookView, filteredAndSortedOrders])

  /** Widoczne kolumny w repertorium (do ukrywania wybranych). */
  const visibleRepertoriumColumns = useMemo(
    () => EXPORT_COLUMNS_REPERTORIUM.filter(c => !hiddenDefaultColumns.includes(c.key)),
    [hiddenDefaultColumns]
  )
  const allRepertoriumColumnsVisible = visibleRepertoriumColumns.length === EXPORT_COLUMNS_REPERTORIUM.length
  const repertoriumStickyEnabled = REPERTORIUM_STICKY_LEFT_KEYS.every(k => visibleRepertoriumColumns.some(c => c.key === k))
  /** Widok księgi niestandardowej (uproszczony lub własny): slider na dole, akcje w osobnej kolumnie, tylko nr zlecenia przypięty z lewej. */
  const customViewStickyEnabled = orderBookView === 'simplified' || orderBookView === 'custom'
  const hasAnyColumnWidths = orderBookView === 'repertorium' ? hasAnyRepertoriumColumnWidths : hasAnyCustomColumnWidths
  const repertoriumStickyLefts = useMemo(() => {
    const w1 = getColumnWidth('rep_' + REPERTORIUM_STICKY_LEFT_KEYS[0]) ?? 100
    const w2 = getColumnWidth('rep_' + REPERTORIUM_STICKY_LEFT_KEYS[1]) ?? 100
    return { c0: 0, c1: 36, c2: 36 + w1, c3: 36 + w1 + w2 }
  }, [columnWidths])
  const resetCurrentViewColumnWidths = () => {
    const next = Object.fromEntries(
      Object.entries(columnWidthsLatestRef.current).filter(([key]) => (
        orderBookView === 'repertorium'
          ? !key.startsWith('rep_')
          : !(key.startsWith('custom_') || key.startsWith('custom_col_'))
      ))
    ) as Record<string, number>
    columnWidthsLatestRef.current = next
    setColumnWidths(next)
    try {
      if (Object.keys(next).length > 0) localStorage.setItem(ORDERBOOK_COLUMN_WIDTHS_KEY, JSON.stringify(next))
      else localStorage.removeItem(ORDERBOOK_COLUMN_WIDTHS_KEY)
    } catch (_) { /* ignore */ }
  }

  /** Liczba kolumn wg sekcji (do wiersza z nagłówkami sekcji w tabeli repertorium). */
  const repertoriumSectionSpans = useMemo(() => {
    const counts: Record<string, number> = { header: 0, written: 0, oral: 0, fees: 0, refusal: 0, status: 0 }
    for (const col of visibleRepertoriumColumns) {
      const section = REPERTORIUM_SECTION_BY_KEY[col.key] ?? 'status'
      counts[section] = (counts[section] ?? 0) + 1
    }
    return counts
  }, [visibleRepertoriumColumns])

  useLayoutEffect(() => {
    if (orderBookView === 'repertorium') {
      orderBookColumnKeysRef.current = visibleRepertoriumColumns.map(c => 'rep_' + c.key)
    } else {
      orderBookColumnKeysRef.current = [
        ...DEFAULT_COLUMNS_FOR_CUSTOM_VIEW.filter(c => !hiddenDefaultColumns.includes(c.key)).map(c => 'custom_' + c.key),
        ...(orderBookView === 'custom' ? customColumns.filter(c => !hiddenDefaultColumns.includes('custom_' + c.id)).map(c => 'custom_col_' + c.id) : [])
      ]
    }
  }, [orderBookView, visibleRepertoriumColumns, hiddenDefaultColumns, customColumns])

  const activeFiltersCount = [
    filters.orderNumberContains.trim(),
    filters.nameContains.trim(),
    filters.clientIds.length,
    filters.contractorIds.length,
    filters.receivedAtFrom,
    filters.receivedAtTo,
    filters.deadlineFrom,
    filters.deadlineTo,
    filters.completedAtFrom,
    filters.completedAtTo,
    filters.specializationIds.length,
    filters.languagePairIds.length,
    filters.unitIds.length,
    filters.quantityMin.trim(),
    filters.quantityMax.trim(),
    filters.amountMin.trim(),
    filters.amountMax.trim(),
    filters.orderStatuses.length,
    filters.invoiceStatuses.length,
    filters.paymentDueFrom,
    filters.paymentDueTo,
    filters.oralDateFrom,
    filters.oralDateTo,
    filters.oralNetMin.trim(),
    filters.oralNetMax.trim(),
    filters.documentAuthorContains.trim(),
    filters.documentNameContains.trim(),
    filters.documentDateFrom,
    filters.documentDateTo,
    filters.documentNumberContains.trim(),
    filters.documentFormRemarksContains.trim(),
    filters.activityTypeContains.trim(),
    filters.ratePerPageMin.trim(),
    filters.ratePerPageMax.trim(),
    filters.extraCopiesMin.trim(),
    filters.extraCopiesMax.trim(),
    filters.amountGrossMin.trim(),
    filters.amountGrossMax.trim(),
    filters.notesContains.trim(),
    filters.oralPlaceContains.trim(),
    filters.oralLangContains.trim(),
    filters.oralDurationMin.trim(),
    filters.oralDurationMax.trim(),
    filters.oralScopeContains.trim(),
    filters.oralRateMin.trim(),
    filters.oralRateMax.trim(),
    filters.oralGrossMin.trim(),
    filters.oralGrossMax.trim(),
    filters.oralNotesContains.trim(),
    filters.refusalDateFrom,
    filters.refusalDateTo,
    filters.refusalOrganContains.trim(),
    filters.refusalReasonContains.trim()
  ].filter(v => (typeof v === 'string' ? v.length > 0 : v > 0)).length
  const clearFilters = () => setFilters({
    orderNumberContains: '',
    nameContains: '',
    clientIds: [],
    contractorIds: [],
    receivedAtFrom: '',
    receivedAtTo: '',
    deadlineFrom: '',
    deadlineTo: '',
    completedAtFrom: '',
    completedAtTo: '',
    specializationIds: [],
    languagePairIds: [],
    unitIds: [],
    quantityMin: '',
    quantityMax: '',
    amountMin: '',
    amountMax: '',
    orderStatuses: [],
    invoiceStatuses: [],
    paymentDueFrom: '',
    paymentDueTo: '',
    oralDateFrom: '',
    oralDateTo: '',
    oralNetMin: '',
    oralNetMax: '',
    documentAuthorContains: '',
    documentNameContains: '',
    documentDateFrom: '',
    documentDateTo: '',
    documentNumberContains: '',
    documentFormRemarksContains: '',
    activityTypeContains: '',
    ratePerPageMin: '',
    ratePerPageMax: '',
    extraCopiesMin: '',
    extraCopiesMax: '',
    amountGrossMin: '',
    amountGrossMax: '',
    notesContains: '',
    oralPlaceContains: '',
    oralLangContains: '',
    oralDurationMin: '',
    oralDurationMax: '',
    oralScopeContains: '',
    oralRateMin: '',
    oralRateMax: '',
    oralGrossMin: '',
    oralGrossMax: '',
    oralNotesContains: '',
    refusalDateFrom: '',
    refusalDateTo: '',
    refusalOrganContains: '',
    refusalReasonContains: ''
  })

  const showForm = !!editId || searchParams.get('add') === '1' || !orders.length
  const tableWrapRef = useRef<HTMLDivElement>(null)
  const tableScrollTopRef = useRef<HTMLDivElement>(null)
  const repertoriumActionsTableRef = useRef<HTMLTableElement>(null)
  const customActionsTableRef = useRef<HTMLTableElement>(null)
  const [tableScrollWidth, setTableScrollWidth] = useState(0)
  const tableScrollSyncingRef = useRef(false)
  const syncRepertoriumRowHeights = React.useCallback(() => {
    const mainTable = tableWrapRef.current?.querySelector('table')
    const actionsTable = repertoriumActionsTableRef.current
    if (!mainTable || !actionsTable) return
    const mainThead = mainTable.querySelector('thead')
    const actionThead = actionsTable.querySelector('thead')
    if (mainThead && actionThead) (actionThead as HTMLElement).style.height = `${(mainThead as HTMLElement).offsetHeight}px`
    const mainRows = mainTable.querySelectorAll('tbody tr')
    const actionRows = actionsTable.querySelectorAll('tbody tr')
    for (let i = 0; i < mainRows.length && i < actionRows.length; i++) {
      const h = (mainRows[i] as HTMLElement).offsetHeight
      const actionRow = actionRows[i] as HTMLElement
      const td = actionRow.querySelector('td')
      actionRow.style.height = `${h}px`
      if (td) (td as HTMLElement).style.height = `${h}px`
    }
  }, [])
  const syncCustomViewRowHeights = React.useCallback(() => {
    const mainTable = tableWrapRef.current?.querySelector('table')
    const actionsTable = customActionsTableRef.current
    if (!mainTable || !actionsTable) return
    const mainThead = mainTable.querySelector('thead')
    const actionThead = actionsTable.querySelector('thead')
    if (mainThead && actionThead) (actionThead as HTMLElement).style.height = `${(mainThead as HTMLElement).offsetHeight}px`
    const mainRows = mainTable.querySelectorAll('tbody tr')
    const actionRows = actionsTable.querySelectorAll('tbody tr')
    for (let i = 0; i < mainRows.length && i < actionRows.length; i++) {
      const h = (mainRows[i] as HTMLElement).offsetHeight
      const actionRow = actionRows[i] as HTMLElement
      const td = actionRow.querySelector('td')
      actionRow.style.height = `${h}px`
      if (td) (td as HTMLElement).style.height = `${h}px`
    }
  }, [])
  React.useLayoutEffect(() => {
    if (!repertoriumStickyEnabled || orderBookView !== 'repertorium') return
    syncRepertoriumRowHeights()
    const raf = requestAnimationFrame(() => { syncRepertoriumRowHeights() })
    const wrap = tableWrapRef.current
    const ro = wrap ? new ResizeObserver(syncRepertoriumRowHeights) : null
    if (wrap) ro!.observe(wrap)
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
    }
  }, [repertoriumStickyEnabled, orderBookView, repertoriumDisplayList.length, syncRepertoriumRowHeights])
  React.useLayoutEffect(() => {
    if (!customViewStickyEnabled || (orderBookView as string) === 'repertorium') return
    syncCustomViewRowHeights()
    const raf = requestAnimationFrame(() => { syncCustomViewRowHeights() })
    const wrap = tableWrapRef.current
    const ro = wrap ? new ResizeObserver(syncCustomViewRowHeights) : null
    if (wrap) ro!.observe(wrap)
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
    }
  }, [customViewStickyEnabled, orderBookView, filteredAndSortedOrders.length, syncCustomViewRowHeights])
  useEffect(() => {
    const wrap = tableWrapRef.current
    if (!showForm && wrap) {
      const measure = () => setTableScrollWidth(wrap.scrollWidth)
      measure()
      const t = setTimeout(measure, 150)
      const ro = new ResizeObserver(measure)
      ro.observe(wrap)
      return () => {
        clearTimeout(t)
        ro.disconnect()
      }
    }
  }, [showForm, orders.length, orderBookView, visibleRepertoriumColumns, hiddenDefaultColumns])
  useEffect(() => {
    if (repertoriumActionsOpenId === null) return
    const onDocClick = (e: MouseEvent) => {
      const t = (e.target as HTMLElement).closest('.repertorium-actions-dropdown-wrap')
      if (!t) setRepertoriumActionsOpenId(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [repertoriumActionsOpenId])
  useEffect(() => {
    if (ordersActionsOpenId === null) return
    const onDocClick = (e: MouseEvent) => {
      const t = (e.target as HTMLElement).closest('.actions-dropdown-wrap')
      if (!t) setOrdersActionsOpenId(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [ordersActionsOpenId])
  useEffect(() => {
    const wrap = tableWrapRef.current
    const top = tableScrollTopRef.current
    if (!wrap || !top) return
    const syncFromWrap = () => {
      if (tableScrollSyncingRef.current) return
      tableScrollSyncingRef.current = true
      top.scrollLeft = wrap.scrollLeft
      requestAnimationFrame(() => { tableScrollSyncingRef.current = false })
    }
    const syncFromTop = () => {
      if (tableScrollSyncingRef.current) return
      tableScrollSyncingRef.current = true
      wrap.scrollLeft = top.scrollLeft
      requestAnimationFrame(() => { tableScrollSyncingRef.current = false })
    }
    wrap.addEventListener('scroll', syncFromWrap)
    top.addEventListener('scroll', syncFromTop)
    return () => {
      wrap.removeEventListener('scroll', syncFromWrap)
      top.removeEventListener('scroll', syncFromTop)
    }
  }, [showForm, orders.length])
  const clientOptions = clients.map(c => ({ value: c.id, label: c.short_name }))
  const unitOptions = units.map(u => ({ value: u.id, label: u.name }))

  function renderRepertoriumCell(key: string, o: OrderRow & { repertoriumLp?: number }): React.ReactNode {
    const ro = o as OrderRow
    const net = o.amount ?? 0
    const vatRateOrder = getVatRateForOrder(o)
    const gross = net + (net * vatRateOrder) / 100
    const cur = ro.rate_currency ?? defaultCurrency
    if (isRepertoriumSectionInactive(ro, key)) {
      if (key === 'order_number') return <button type="button" className="link-like" onClick={() => setSearchParams({ edit: String(o.id) })} title={t('common.edit')}>{o.order_number ?? o.id}</button>
      if (key === 'received_at') return formatDatePL(o.received_at)
      if (key === 'client_name_address') return <span style={{ whiteSpace: 'pre-wrap', maxWidth: 200 }}>{repertoriumClientNameAddress(o)}</span>
      return '—'
    }
    switch (key) {
      case 'order_number': return <button type="button" className="link-like" onClick={() => setSearchParams({ edit: String(o.id) })} title={t('common.edit')}>{o.order_number ?? o.id}</button>
      case 'received_at': return formatDatePL(o.received_at)
      case 'client_name_address': return <span style={{ whiteSpace: 'pre-wrap', maxWidth: 200 }}>{repertoriumClientNameAddress(o)}</span>
      case 'document_author': return (ro.document_author ?? '—')
      case 'document_name': return (ro.document_name ?? '—')
      case 'document_date': return formatDatePL(ro.document_date ?? null)
      case 'document_number': return (ro.document_number ?? '—')
      case 'source_lang_name': return langNameForUi(ro.source_lang_code, ro.source_lang_name, t)
      case 'target_lang_name': return langNameForUi(ro.target_lang_code, ro.target_lang_name, t)
      case 'document_form_remarks': return <span style={{ whiteSpace: 'pre-wrap', maxWidth: 160 }}>{ro.document_form_remarks ?? ro.repertorium_description ?? '—'}</span>
      case 'repertorium_activity_type': return <span style={{ whiteSpace: 'pre-wrap', maxWidth: 200 }}>{ro.repertorium_activity_type ?? '—'}</span>
      case 'quantity': return (o.quantity ?? 0)
      case 'rate_per_unit': return formatMoneyWithCurrency(o.rate_per_unit ?? 0, cur)
      case 'extra_copies': return (ro.extra_copies ?? 0)
      case 'amount_net': return formatMoneyWithCurrency(net, cur)
      case 'amount_gross': return formatMoneyWithCurrency(gross, cur)
      case 'completed_at': return formatDatePL(o.completed_at)
      case 'repertorium_notes': return (ro.repertorium_notes ?? '—')
      case 'oral_date': return formatDatePL(ro.oral_date ?? null)
      case 'oral_place': return (ro.oral_place ?? '—')
      case 'oral_lang': return (ro.oral_lang ?? '—')
      case 'oral_duration': return ro.oral_duration != null ? String(ro.oral_duration) : '—'
      case 'oral_scope': return (ro.oral_scope ?? '—')
      case 'oral_rate': return ro.oral_rate != null ? formatMoneyWithCurrency(ro.oral_rate, cur) : (o.unit_name && /godz|hour|^h$/i.test(o.unit_name) ? formatMoneyWithCurrency(o.rate_per_unit ?? 0, cur) : '—')
      case 'oral_net': return ro.oral_net != null ? formatMoneyWithCurrency(ro.oral_net, cur) : (o.unit_name && /godz|hour|^h$/i.test(o.unit_name) ? formatMoneyWithCurrency((o.quantity ?? 0) * (o.rate_per_unit ?? 0), cur) : '—')
      case 'oral_gross': return (() => { const n = ro.oral_net ?? null; const g = ro.oral_gross ?? null; if (g != null) return formatMoneyWithCurrency(g, cur); if (n != null) return formatMoneyWithCurrency(Math.round(n * (1 + getVatRateForOrder(o) / 100) * 100) / 100, cur); return '—' })()
      case 'oral_notes': return (ro.oral_notes ?? '—')
      case 'refusal_date': return formatDatePL(ro.refusal_date ?? null)
      case 'refusal_organ': return (ro.refusal_organ ?? '—')
      case 'refusal_reason': return (ro.refusal_reason ?? '—')
      case 'order_status': {
        const deadline = o.deadline_at ? new Date(o.deadline_at) : null
        const isOverdue = !!deadline && deadline < new Date() && (o.order_status === 'to_do' || o.order_status === 'in_progress')
        return <>{isOverdue && <span className="overdue-exclamation" title={t('orderBook.overdueWarning')}>⚠</span>}<span className={`badge ${o.order_status}`}>{t(`orders.orderStatus_${o.order_status}`)}</span></>
      }
      case 'invoice_status': return <span className={`badge ${o.invoice_status}`}>{t(`orders.invoiceStatus_${o.invoice_status}`)}</span>
      case 'payment_due_at': return formatDatePL(o.payment_due_at)
      default: return '—'
    }
  }

  if (loading) return <div>{t('common.loading')}</div>

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>{t('orderBook.title')}</h1>
      <p style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>{t('orders.book')}</span>
        <select value={bookId ?? books[0]?.id ?? ''} onChange={e => setBookId(parseInt(e.target.value, 10))} style={{ minWidth: 160 }}>
          {books.map(b => <option key={b.id} value={b.id}>{b.name}{b.archived ? ` ${t('orderBook.archived')}` : ''}</option>)}
        </select>
        {(bookId ?? books[0]?.id) != null && (() => {
              const currentBookId = bookId ?? books[0]?.id
              const book = books.find(b => b.id === currentBookId)
              const isArchived = book?.archived === 1
              return (
                <button
                  type="button"
                  style={{ marginLeft: 8 }}
                  onClick={async () => {
                    if (!window.api?.orderBooks?.update || currentBookId == null) return
                    await window.api.orderBooks.update(currentBookId, { archived: isArchived ? 0 : 1 })
                    setBooks(prev => prev.map(b => b.id === currentBookId ? { ...b, archived: isArchived ? 0 : 1 } : b))
                  }}
                >
                  {isArchived ? t('orderBook.unarchiveBook') : t('orderBook.archiveBook')}
                </button>
              )
            })()}
      </p>
      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>{editId ? t('orders.edit') : t('orders.add')}</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="primary" onClick={() => save()}>{t('common.save')}</button>
              <button type="button" onClick={() => { setSearchParams({}); setForm({ received_at: new Date().toISOString().slice(0, 10), order_status: 'to_do', invoice_status: 'to_issue', quantity: 0, rate_per_unit: 0, amount: 0 }); setAddSubcontractModal(false) }}>{t('common.cancel')}</button>
            </div>
          </div>
          <form onSubmit={save}>
            <div style={{ display: 'contents' }}>
            <div className="grid2">
              {editId && form.order_number && !hiddenDefaultColumns.includes('order_number') && (
                <div className="form-group">
                  <label>{t('orders.orderNumber')}</label>
                  <input value={form.order_number} readOnly style={{ opacity: 0.9 }} />
                </div>
              )}
              <div className="form-group">
                <label>{t('orders.book')}</label>
                <select value={form.book_id ?? bookId ?? books[0]?.id ?? 1} onChange={e => setForm(f => ({ ...f, book_id: parseInt(e.target.value, 10) }))}>
                  {books.map(b => <option key={b.id} value={b.id}>{b.name}{b.archived ? ` ${t('orderBook.archived')}` : ''}</option>)}
                </select>
              </div>
              {!hiddenDefaultColumns.includes('client') && (
              <div className="form-group">
                <label>{isRepertoriumBook ? t('orderBook.repertoriumClientNameAddress') : t('orders.client')}</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select value={form.client_id ?? ''} onChange={e => setForm(f => ({ ...f, client_id: parseInt(e.target.value, 10) }))} required style={{ flex: 1, minWidth: 0 }}>
                    <option value="">—</option>
                    {clientOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <button
                    type="button"
                    title={t('clients.add')}
                    onClick={() => navigate('/clients?add=1')}
                    style={{ flexShrink: 0, width: 36, height: 36, padding: 0, fontSize: '1.25rem', lineHeight: 1, borderRadius: 6 }}
                  >
                    +
                  </button>
                </div>
              </div>
              )}
              {!hiddenDefaultColumns.includes('received_at') && (
              <div className="form-group">
                <label>{t('orders.receivedAt')}</label>
                <input type="date" value={form.received_at ?? ''} onChange={e => setForm(f => ({ ...f, received_at: e.target.value }))} />
              </div>
              )}
              {!hiddenDefaultColumns.includes('deadline') && (
              <div className="form-group">
                <label>{t('orders.deadline')}</label>
                <input type="datetime-local" value={form.deadline_at ?? ''} onChange={e => setForm(f => ({ ...f, deadline_at: e.target.value || null }))} />
              </div>
              )}
              {!hiddenDefaultColumns.includes('completed_at') && (
              <div className="form-group">
                <label>{isRepertoriumBook ? t('orderBook.repertoriumReturnDate') : t('orders.completedAt')}</label>
                <input type="date" value={form.completed_at ?? ''} onChange={e => setForm(f => ({ ...f, completed_at: e.target.value || null }))} />
              </div>
              )}
              {!isRepertoriumBook && !hiddenDefaultColumns.includes('name') && (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>{t('orders.name')}</label>
                  <input
                    ref={addFormNameInputRef}
                    type="text"
                    list={suggestionListId('form.name')}
                    value={form.name ?? ''}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value || undefined }))}
                    onBlur={e => rememberFieldValue('form.name', e.target.value)}
                    placeholder="—"
                  />
                  {renderFieldDatalist('form.name', form.name)}
                </div>
              )}
              {isRepertoriumBook && (
                <div style={{ display: 'contents' }}>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>{t('orders.translationType')}</label>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="translation_type"
                          checked={form.translation_type === 'oral'}
                          onChange={() => {
                            setForm(f => ({
                              ...f,
                              translation_type: 'oral',
                              document_author: null,
                              document_name: null,
                              document_date: null,
                              document_number: null,
                              document_form_remarks: null,
                              repertorium_activity_type: null,
                              repertorium_notes: null,
                              extra_copies: 0,
                              language_pair_id: null,
                              // Jednostka ustna z ustawień księgi (jak jednostka stron przy pisemnych)
                              unit_id: repertoriumOralUnitId ?? (null as number | null),
                              quantity: 0,
                              rate_per_unit: 0,
                              amount: 0,
                              // Zachowaj walutę lub ustaw domyślną, żeby od razu pobrać stawkę z ustawień
                              ...(f.rate_currency ? {} : { rate_currency: defaultCurrency })
                            }))
                            setWrittenRateMessage(null)
                            setFormSectionOpen(prev => ({ ...prev, written: false, oral: true }))
                          }}
                        />
                        {t('orders.translationTypeOral')}
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="translation_type"
                          checked={form.translation_type === 'written'}
                          onChange={() => {
                            setForm(f => ({
                              ...f,
                              translation_type: 'written',
                              // Auto-set unit to repertorium page unit from Settings
                              ...(repertoriumPageUnitId != null ? { unit_id: repertoriumPageUnitId } : {}),
                              oral_date: null,
                              oral_place: null,
                              oral_lang: null,
                              oral_duration: null,
                              oral_scope: null,
                              oral_rate: null,
                              oral_net: null,
                              oral_gross: null,
                              oral_notes: null,
                              refusal_date: null,
                              refusal_organ: null,
                              refusal_reason: null
                            }))
                            setOralRateMessage(null)
                            setFormSectionOpen(prev => ({ ...prev, written: true, oral: false }))
                          }}
                        />
                        {t('orders.translationTypeWritten')}
                      </label>
                    </div>
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>{t('orders.invoiceDescription')}</label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        list={suggestionListId('form.invoice_description')}
                        value={form.invoice_description ?? ''}
                        onChange={e => setForm(f => ({ ...f, invoice_description: e.target.value || null }))}
                        onBlur={e => rememberFieldValue('form.invoice_description', e.target.value)}
                        placeholder="—"
                        style={{ flex: 1, minWidth: 200 }}
                      />
                      {renderFieldDatalist('form.invoice_description', form.invoice_description)}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 0 }}>
                        <input type="checkbox" checked={(form.include_invoice_description_on_invoice ?? 1) === 1} onChange={e => setForm(f => ({ ...f, include_invoice_description_on_invoice: e.target.checked ? 1 : 0 }))} />
                        {t('orders.includeServiceOnInvoice')}
                      </label>
                    </div>
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>{t('orders.service')}</label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <select value={form.service_id ?? ''} onChange={e => {
                        const v = e.target.value
                        const n = v ? Number(v) : null
                        setForm(f => ({ ...f, service_id: n != null && Number.isFinite(n) && n > 0 ? n : null }))
                      }} style={{ flex: 1, minWidth: 120 }} required>
                        <option value="">—</option>
                        {services.map(svc => <option key={svc.id} value={svc.id}>{svc.name}</option>)}
                      </select>
                      <button type="button" title={t('settings.services')} onClick={() => { setNewServiceName(''); setAddServiceModal(true) }} style={{ flexShrink: 0, width: 36, height: 36, padding: 0, fontSize: '1.25rem', lineHeight: 1, borderRadius: 6 }}>+</button>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 0 }}>
                        <input type="checkbox" checked={(form.include_service_on_invoice ?? 1) === 1} onChange={e => setForm(f => ({ ...f, include_service_on_invoice: e.target.checked ? 1 : 0 }))} />
                        {t('orders.includeServiceOnInvoice')}
                      </label>
                    </div>
                  </div>
                  {form.translation_type === 'written' && (
                <div style={{ display: 'contents' }}>
                  <div
                    className="form-group"
                    style={{ gridColumn: '1 / -1', marginBottom: 4, padding: '8px 12px', background: 'var(--color-surface-elevated, #f4f4f5)', borderRadius: 8, borderLeft: '4px solid var(--color-primary, #2563eb)', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none' }}
                    onClick={() => toggleFormSection('written')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFormSection('written') } }}
                    aria-expanded={formSectionOpen.written}
                  >
                    <span style={{ display: 'inline-block', transform: formSectionOpen.written ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '0.75rem' }} aria-hidden>▶</span>
                    {t('orderBook.repertoriumSectionWritten')}
                  </div>
                  {formSectionOpen.written && (
                  <div style={{ display: 'contents' }}>
                  <div className="form-group">
                    <label>{t('orderBook.repertoriumDocumentAuthor')}</label>
                    <input
                      type="text"
                      list={suggestionListId('form.document_author')}
                      value={form.document_author ?? ''}
                      onChange={e => setForm(f => ({ ...f, document_author: e.target.value || null }))}
                      onBlur={e => rememberFieldValue('form.document_author', e.target.value)}
                      placeholder="—"
                    />
                    {renderFieldDatalist('form.document_author', form.document_author)}
                  </div>
                  <div className="form-group">
                    <label>{t('orderBook.repertoriumDocumentName')}</label>
                    <input
                      type="text"
                      list={suggestionListId('form.document_name')}
                      value={form.document_name ?? ''}
                      onChange={e => setForm(f => ({ ...f, document_name: e.target.value || null }))}
                      onBlur={e => rememberFieldValue('form.document_name', e.target.value)}
                      placeholder="—"
                    />
                    {renderFieldDatalist('form.document_name', form.document_name)}
                  </div>
                  <div className="form-group">
                    <label>{t('orderBook.repertoriumDocumentDate')}</label>
                    <input type="date" value={form.document_date ?? ''} onChange={e => setForm(f => ({ ...f, document_date: e.target.value || null }))} />
                  </div>
                  <div className="form-group">
                    <label>{t('orderBook.repertoriumDocumentNumber')}</label>
                    <input
                      type="text"
                      list={suggestionListId('form.document_number')}
                      value={form.document_number ?? ''}
                      onChange={e => setForm(f => ({ ...f, document_number: e.target.value || null }))}
                      onBlur={e => rememberFieldValue('form.document_number', e.target.value)}
                      placeholder="—"
                    />
                    {renderFieldDatalist('form.document_number', form.document_number)}
                  </div>
                  <div className="form-group">
                    <label>{t('orderBook.repertoriumDocumentFormRemarks')}</label>
                    <input
                      type="text"
                      list={suggestionListId('form.document_form_remarks')}
                      value={form.document_form_remarks ?? ''}
                      onChange={e => setForm(f => ({ ...f, document_form_remarks: e.target.value || null }))}
                      onBlur={e => rememberFieldValue('form.document_form_remarks', e.target.value)}
                      placeholder="—"
                    />
                    {renderFieldDatalist('form.document_form_remarks', form.document_form_remarks)}
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>{t('orderBook.repertoriumActivityType')}</label>
                    <input
                      type="text"
                      list={suggestionListId('form.repertorium_activity_type')}
                      value={form.repertorium_activity_type ?? ''}
                      onChange={e => setForm(f => ({ ...f, repertorium_activity_type: e.target.value || null }))}
                      onBlur={e => rememberFieldValue('form.repertorium_activity_type', e.target.value)}
                      placeholder={t('orderBook.repertoriumActivityTypePlaceholder')}
                      style={{ width: '100%' }}
                    />
                    {renderFieldDatalist('form.repertorium_activity_type', form.repertorium_activity_type)}
                  </div>
                  <div className="form-group">
                    <label>{t('orderBook.repertoriumExtraCopies')}</label>
                    <input type="number" min={0} value={form.extra_copies ?? 0} onChange={e => setForm(f => ({ ...f, extra_copies: parseInt(e.target.value, 10) || 0 }))} />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>{t('orderBook.repertoriumNotes')}</label>
                    <input
                      type="text"
                      list={suggestionListId('form.repertorium_notes')}
                      value={form.repertorium_notes ?? ''}
                      onChange={e => setForm(f => ({ ...f, repertorium_notes: e.target.value || null }))}
                      onBlur={e => rememberFieldValue('form.repertorium_notes', e.target.value)}
                      placeholder="—"
                    />
                    {renderFieldDatalist('form.repertorium_notes', form.repertorium_notes)}
                  </div>
                  {!hiddenDefaultColumns.includes('language_pair') && (
                  <div className="form-group">
                    <label>{t('orders.languagePair')}</label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select value={form.language_pair_id ?? ''} onChange={e => setForm(f => ({ ...f, language_pair_id: e.target.value ? parseInt(e.target.value, 10) : null }))} style={{ flex: 1, minWidth: 0 }}>
                        <option value="">—</option>
                        {pairs.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                      <button type="button" title={t('settings.languagePairs')} onClick={() => { setNewPairSourceId(''); setNewPairTargetId(''); setAddPairModal(true) }} style={{ flexShrink: 0, width: 36, height: 36, padding: 0, fontSize: '1.25rem', lineHeight: 1, borderRadius: 6 }}>+</button>
                    </div>
                  </div>
                  )}
                  {!hiddenDefaultColumns.includes('unit') && (
                  <div className="form-group">
                    <label>{t('orders.unit')}</label>
                    <select value={form.unit_id ?? ''} onChange={e => setForm(f => ({ ...f, unit_id: parseInt(e.target.value, 10) }))} required={!(isRepertoriumBook && ((form.refusal_date || form.refusal_organ || form.refusal_reason) || (form.translation_type as 'oral' | 'written' | null) === 'oral'))}>
                      <option value="">—</option>
                      {unitOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  )}
                  {!hiddenDefaultColumns.includes('quantity') && (
                  <div className="form-group">
                    <label>{isRepertoriumBook ? t('orderBook.repertoriumPagesCount') : t('orders.quantity')}</label>
                    <input type="number" step="any" value={form.quantity ?? 0} onChange={e => recalcAmount(Number(e.target.value), form.rate_per_unit ?? 0)} />
                  </div>
                  )}
                  {['amount_net', 'amount_vat', 'amount_gross'].some(k => !hiddenDefaultColumns.includes(k)) && (
                  <div style={{ display: 'contents' }}>
                  <div className="form-group">
                    <label>{t('orders.currency')}</label>
                    <select value={form.rate_currency ?? defaultCurrency} onChange={e => setForm(f => ({ ...f, rate_currency: e.target.value || null }))} style={{ minWidth: 80 }}>
                      {[...new Set([...rateCurrencies, defaultCurrency].filter(Boolean))].sort().map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>{isRepertoriumBook ? t('orderBook.repertoriumRatePerPage') : t('orders.ratePerUnit')}</label>
                    {writtenRateMessage && (
                      <p style={{ margin: '0 0 4px', fontSize: '0.875rem', color: 'var(--color-warning, #ca8a04)' }}>
                        {writtenRateMessage}
                        <span style={{ display: 'block', marginTop: 4 }}>{t('orderBook.noDefaultRateSetInSettingsHint')}</span>
                      </p>
                    )}
                    <input type="number" step="any" value={form.rate_per_unit ?? 0} onChange={e => recalcAmount(form.quantity ?? 0, Number(e.target.value))} />
                  </div>
                  <div className="form-group">
                    <label>{isRepertoriumBook ? t('orderBook.repertoriumFeeNet') : t('orders.amount')}</label>
                    <input type="number" step="0.01" value={form.amount ?? 0} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} />
                  </div>
                  </div>
                  )}
                  </div>
                  )}
                  </div>
                  )}

                  {form.translation_type === 'oral' && (
                <div style={{ display: 'contents' }}>
                  <div
                    className="form-group"
                    style={{ gridColumn: '1 / -1', marginTop: form.translation_type === 'oral' ? 0 : 12, marginBottom: 4, padding: '8px 12px', background: 'var(--color-surface-elevated, #f4f4f5)', borderRadius: 8, borderLeft: '4px solid var(--color-primary, #2563eb)', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none' }}
                    onClick={() => toggleFormSection('oral')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFormSection('oral') } }}
                    aria-expanded={formSectionOpen.oral}
                  >
                    <span style={{ display: 'inline-block', transform: formSectionOpen.oral ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '0.75rem' }} aria-hidden>▶</span>
                    {t('orderBook.repertoriumSectionOral')}
                  </div>
                  {formSectionOpen.oral && (
                  <div style={{ display: 'contents' }}>
                  <div className="form-group">
                    <label>{t('orderBook.repertoriumOralDate')}</label>
                    <input type="date" value={form.oral_date ?? ''} onChange={e => setForm(f => ({ ...f, oral_date: e.target.value || null }))} />
                  </div>
                  <div className="form-group">
                    <label>{t('orderBook.repertoriumOralPlace')}</label>
                    <input
                      type="text"
                      list={suggestionListId('form.oral_place')}
                      value={form.oral_place ?? ''}
                      onChange={e => setForm(f => ({ ...f, oral_place: e.target.value || null }))}
                      onBlur={e => rememberFieldValue('form.oral_place', e.target.value)}
                      placeholder="—"
                    />
                    {renderFieldDatalist('form.oral_place', form.oral_place)}
                  </div>
                  <div className="form-group">
                    <label>{t('orders.unit')}</label>
                    <select value={form.unit_id ?? repertoriumOralUnitId ?? ''} onChange={e => setForm(f => ({ ...f, unit_id: e.target.value ? parseInt(e.target.value, 10) : null }))} style={{ width: '100%', minWidth: 120 }}>
                      <option value="">—</option>
                      {unitOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>{t('orders.currency')}</label>
                    <select value={form.rate_currency ?? defaultCurrency} onChange={e => setForm(f => ({ ...f, rate_currency: e.target.value || null }))} style={{ minWidth: 80 }}>
                      {[...new Set([...rateCurrencies, defaultCurrency].filter(Boolean))].sort().map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>{t('orderBook.repertoriumOralRate')}</label>
                    {oralRateMessage && (
                      <p style={{ margin: '0 0 4px', fontSize: '0.875rem', color: 'var(--color-warning, #ca8a04)' }}>
                        {oralRateMessage}
                        <span style={{ display: 'block', marginTop: 4 }}>{t('orderBook.noDefaultRateSetInSettingsHint')}</span>
                      </p>
                    )}
                    <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-secondary, #71717a)', marginBottom: 2 }}>{t('orderBook.oralRateHint')}</span>
                    <input type="number" step="0.01" min={0} value={form.oral_rate ?? ''} onChange={e => {
                      const v = e.target.value === '' ? null : Number(e.target.value)
                      setForm(f => {
                        const net = (v ?? 0) * (f.oral_duration ?? 0) || 0
                        const gross = net ? Math.round(net * (1 + getVatRateForService(f.service_id) / 100) * 100) / 100 : null
                        return { ...f, oral_rate: v, oral_net: net || null, oral_gross: gross ?? null }
                      })
                    }} placeholder="—" />
                  </div>
                  {(() => {
                    const oralVatRate = getVatRateForService(form.service_id)
                    const oralNetVal = ((form.oral_rate ?? 0) * (form.oral_duration ?? 0) || form.oral_net) ?? 0
                    const oralGrossComputed = Math.round(oralNetVal * (1 + oralVatRate / 100) * 100) / 100
                    return (
                      <div style={{ display: 'contents' }}>
                  <div className="form-group">
                    <label>{t('orderBook.repertoriumOralDuration')}</label>
                    <input type="number" step="0.25" min={0} value={form.oral_duration ?? ''} onChange={e => {
                      const v = e.target.value === '' ? null : Number(e.target.value)
                      setForm(f => {
                        const net = (f.oral_rate ?? 0) * (v ?? 0) || 0
                        const gross = net ? Math.round(net * (1 + getVatRateForService(f.service_id) / 100) * 100) / 100 : null
                        return { ...f, oral_duration: v, oral_net: net || null, oral_gross: gross ?? null }
                      })
                    }} placeholder="—" />
                  </div>
                  <div className="form-group">
                    <label>{t('orderBook.repertoriumOralScope')}</label>
                    <input
                      type="text"
                      list={suggestionListId('form.oral_scope')}
                      value={form.oral_scope ?? ''}
                      onChange={e => setForm(f => ({ ...f, oral_scope: e.target.value || null }))}
                      onBlur={e => rememberFieldValue('form.oral_scope', e.target.value)}
                      placeholder="—"
                    />
                    {renderFieldDatalist('form.oral_scope', form.oral_scope)}
                  </div>
                  <div className="form-group">
                    <label>{t('orderBook.repertoriumOralLang')}</label>
                    {pairs.length === 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--color-text-secondary, #71717a)', fontSize: '0.9rem' }}>{t('orderBook.addPairsInSettings')}</span>
                        <button type="button" title={t('orderBook.addPairsInSettings')} onClick={() => navigate('/settings')} style={{ flexShrink: 0, width: 36, height: 36, padding: 0, fontSize: '1.25rem', lineHeight: 1, borderRadius: 6 }}>+</button>
                      </div>
                    ) : (
                      <select value={form.oral_lang ?? ''} onChange={e => { const v = e.target.value || null; setForm(f => ({ ...f, oral_lang: v })); setOralRateMessage(null); }} style={{ width: '100%', minWidth: 120 }}>
                        <option value="">—</option>
                        {form.oral_lang && !pairs.some(p => p.label === form.oral_lang) && <option value={form.oral_lang}>{form.oral_lang}</option>}
                        {pairs.map(p => <option key={p.id} value={p.label}>{p.label}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="form-group">
                    <label>{t('orderBook.repertoriumOralNet')}</label>
                    <input type="number" step="0.01" min={0} value={oralNetVal || ''} readOnly placeholder="—" style={{ opacity: 0.9 }} />
                  </div>
                  <div className="form-group">
                    <label>{t('orderBook.repertoriumOralGross')}</label>
                    <input type="number" step="0.01" min={0} value={oralNetVal ? oralGrossComputed : (form.oral_gross ?? '')} readOnly placeholder="—" style={{ opacity: 0.9 }} title={t('orderBook.oralGrossFromVat')} />
                  </div>
                      </div>
                    )
                  })()}
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>{t('orderBook.repertoriumOralNotes')}</label>
                    <input
                      type="text"
                      list={suggestionListId('form.oral_notes')}
                      value={form.oral_notes ?? ''}
                      onChange={e => setForm(f => ({ ...f, oral_notes: e.target.value || null }))}
                      onBlur={e => rememberFieldValue('form.oral_notes', e.target.value)}
                      placeholder="—"
                      style={{ width: '100%' }}
                    />
                    {renderFieldDatalist('form.oral_notes', form.oral_notes)}
                  </div>
                  </div>
                  )}
                  </div>
                  )}

                  <div
                    className="form-group"
                    style={{ gridColumn: '1 / -1', marginTop: 12, marginBottom: 4, padding: '8px 12px', background: 'var(--color-surface-elevated, #f4f4f5)', borderRadius: 8, borderLeft: '4px solid var(--color-primary, #2563eb)', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none' }}
                    onClick={() => toggleFormSection('refusal')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFormSection('refusal') } }}
                    aria-expanded={formSectionOpen.refusal}
                  >
                    <span style={{ display: 'inline-block', transform: formSectionOpen.refusal ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '0.75rem' }} aria-hidden>▶</span>
                    {t('orderBook.repertoriumSectionRefusal')}
                  </div>
                  {formSectionOpen.refusal && (
                  <div style={{ display: 'contents' }}>
                  <div className="form-group">
                    <label>{t('orderBook.repertoriumRefusalDate')}</label>
                    <input type="date" value={form.refusal_date ?? ''} onChange={e => setForm(f => ({ ...f, refusal_date: e.target.value || null }))} />
                  </div>
                  <div className="form-group">
                    <label>{t('orderBook.repertoriumRefusalOrgan')}</label>
                    <input
                      type="text"
                      list={suggestionListId('form.refusal_organ')}
                      value={form.refusal_organ ?? ''}
                      onChange={e => setForm(f => ({ ...f, refusal_organ: e.target.value || null }))}
                      onBlur={e => rememberFieldValue('form.refusal_organ', e.target.value)}
                      placeholder="—"
                    />
                    {renderFieldDatalist('form.refusal_organ', form.refusal_organ)}
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>{t('orderBook.repertoriumRefusalReason')}</label>
                    <input
                      type="text"
                      list={suggestionListId('form.refusal_reason')}
                      value={form.refusal_reason ?? ''}
                      onChange={e => setForm(f => ({ ...f, refusal_reason: e.target.value || null }))}
                      onBlur={e => rememberFieldValue('form.refusal_reason', e.target.value)}
                      placeholder="—"
                      style={{ width: '100%' }}
                    />
                    {renderFieldDatalist('form.refusal_reason', form.refusal_reason)}
                  </div>
                  </div>
                  )}

                  <div
                    className="form-group"
                    style={{ gridColumn: '1 / -1', marginTop: 12, marginBottom: 4, padding: '8px 12px', background: 'var(--color-surface-elevated, #f4f4f5)', borderRadius: 8, borderLeft: '4px solid var(--color-primary, #2563eb)', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none' }}
                    onClick={() => toggleFormSection('status')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFormSection('status') } }}
                    aria-expanded={formSectionOpen.status}
                  >
                    <span style={{ display: 'inline-block', transform: formSectionOpen.status ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '0.75rem' }} aria-hidden>▶</span>
                    {t('orderBook.repertoriumSectionStatus')}
                  </div>
                  {formSectionOpen.status && (
                  <div style={{ display: 'contents' }}>
                  {!hiddenDefaultColumns.includes('order_status') && (
                  <div className="form-group">
                    <label>{t('orders.orderStatus')}</label>
                    <select value={form.order_status ?? 'to_do'} onChange={e => setForm(f => ({ ...f, order_status: e.target.value }))}>
                      {ORDER_STATUSES.map(s => <option key={s} value={s}>{t(`orders.orderStatus_${s}`)}</option>)}
                    </select>
                  </div>
                  )}
                  {!hiddenDefaultColumns.includes('invoice_status') && (
                  <div className="form-group">
                    <label>{t('orders.invoiceStatus')}</label>
                    <select value={form.invoice_status ?? 'to_issue'} onChange={e => setForm(f => ({ ...f, invoice_status: e.target.value }))}>
                      {INVOICE_STATUSES.map(s => <option key={s} value={s}>{t(`orders.invoiceStatus_${s}`)}</option>)}
                    </select>
                  </div>
                  )}
                  {!hiddenDefaultColumns.includes('payment_due') && (
                  <div className="form-group">
                    <label>{t('orders.paymentDue')}</label>
                    <input type="date" value={form.payment_due_at ?? ''} onChange={e => setForm(f => ({ ...f, payment_due_at: e.target.value || null }))} />
                  </div>
                  )}
                  </div>
                  )}
                </div>
              )}
              {editId && (form.invoice_number != null || form.payment_due_at) && (
                <div style={{ display: 'contents' }}>
                  <div className="form-group">
                    <label>{t('orders.invoiceNumber')}</label>
                    <input value={form.invoice_number ?? ''} readOnly style={{ opacity: 0.8 }} />
                  </div>
                  <div className="form-group">
                    <label>{t('orders.paymentDue')}</label>
                    <input type="date" value={form.payment_due_at ?? ''} readOnly style={{ opacity: 0.8 }} />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <button type="button" className="danger" onClick={async () => {
                      const provider = (await window.api?.settings?.get?.('invoice_provider')) as string | null | undefined
                      const msg = provider === 'wfirma'
                        ? `${t('orders.removeInvoiceConfirm')}\n\n${t('orders.removeInvoiceWfirmaHint')}`
                        : t('orders.removeInvoiceConfirm')
                      const okRmInv = confirm(msg)
                      window.api?.app?.refocusWindow?.()
                      if (!okRmInv || !editId || !window.api) return
                      await window.api.orders.clearInvoice(parseInt(editId, 10))
                      const row = await window.api.orders.get(parseInt(editId, 10)) as OrderRow & { client_id: number; unit_id: number; contractor_id?: number | null; specialization_id?: number | null; book_id?: number }
                      if (row) setForm({
                        ...row,
                        client_id: row.client_id,
                        unit_id: row.unit_id,
                        language_pair_id: row.language_pair_id ?? null,
                        contractor_id: row.contractor_id ?? null,
                        specialization_id: row.specialization_id ?? null,
                        book_id: row.book_id ?? 1,
                        received_at: row.received_at?.slice(0, 10),
                        deadline_at: row.deadline_at?.slice(0, 16) ?? '',
                        completed_at: row.completed_at?.slice(0, 10) ?? '',
                        payment_due_at: row.payment_due_at?.slice(0, 10) ?? '',
                        document_date: row.document_date?.slice(0, 10) ?? null,
                        extra_copies: row.extra_copies ?? 0,
                        oral_date: (row as OrderRow).oral_date?.slice(0, 10) ?? null,
                        refusal_date: (row as OrderRow).refusal_date?.slice(0, 10) ?? null
                      })
                      load()
                    }}>
                      {t('orders.removeInvoice')}
                    </button>
                  </div>
                </div>
              )}
              
              {!isRepertoriumBook && (
                <div style={{ display: 'contents' }}>
              {!hiddenDefaultColumns.includes('specialization') && (
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>{t('orders.specialization')}</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select value={form.specialization_id ?? ''} onChange={e => setForm(f => ({ ...f, specialization_id: e.target.value ? parseInt(e.target.value, 10) : null }))} style={{ flex: 1, minWidth: 120 }}>
                    <option value="">—</option>
                    {specializations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button type="button" title={t('settings.specializations')} onClick={() => { setNewSpecName(''); setAddSpecModal(true) }} style={{ flexShrink: 0, width: 36, height: 36, padding: 0, fontSize: '1.25rem', lineHeight: 1, borderRadius: 6 }}>+</button>
                </div>
              </div>
              )}
              {!hiddenDefaultColumns.includes('language_pair') && (
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>{t('orders.languagePair')}</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={form.language_pair_id ?? ''} onChange={e => setForm(f => ({ ...f, language_pair_id: e.target.value ? parseInt(e.target.value, 10) : null }))} style={{ flex: 1, minWidth: 120 }}>
                    <option value="">—</option>
                    {pairs.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  <button type="button" title={t('settings.languagePairs')} onClick={() => { setNewPairSourceId(''); setNewPairTargetId(''); setAddPairModal(true) }} style={{ flexShrink: 0, width: 36, height: 36, padding: 0, fontSize: '1.25rem', lineHeight: 1, borderRadius: 6 }}>+</button>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 0 }}>
                    <input type="checkbox" checked={(form.include_language_pair_on_invoice ?? 1) === 1} onChange={e => setForm(f => ({ ...f, include_language_pair_on_invoice: e.target.checked ? 1 : 0 }))} />
                    {t('orders.includeLanguagePairOnInvoice')}
                  </label>
                </div>
              </div>
              )}
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>{t('orders.additionalInvoiceDescription')}</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    list={suggestionListId('form.invoice_description')}
                    value={form.invoice_description ?? ''}
                    onChange={e => setForm(f => ({ ...f, invoice_description: e.target.value || null }))}
                    onBlur={e => rememberFieldValue('form.invoice_description', e.target.value)}
                    placeholder="—"
                    style={{ flex: 1, minWidth: 200 }}
                  />
                  {renderFieldDatalist('form.invoice_description', form.invoice_description)}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 0 }}>
                    <input type="checkbox" checked={(form.include_invoice_description_on_invoice ?? 1) === 1} onChange={e => setForm(f => ({ ...f, include_invoice_description_on_invoice: e.target.checked ? 1 : 0 }))} />
                    {t('orders.includeServiceOnInvoice')}
                  </label>
                </div>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>{t('orders.service')}</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={form.service_id ?? ''} onChange={e => {
                    const v = e.target.value
                    const n = v ? Number(v) : null
                    setForm(f => ({ ...f, service_id: n != null && Number.isFinite(n) && n > 0 ? n : null }))
                  }} style={{ flex: 1, minWidth: 120 }} required>
                    <option value="">—</option>
                    {services.map(svc => <option key={svc.id} value={svc.id}>{svc.name}</option>)}
                  </select>
                  <button type="button" title={t('settings.services')} onClick={() => { setNewServiceName(''); setAddServiceModal(true) }} style={{ flexShrink: 0, width: 36, height: 36, padding: 0, fontSize: '1.25rem', lineHeight: 1, borderRadius: 6 }}>+</button>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 0 }}>
                    <input type="checkbox" checked={(form.include_service_on_invoice ?? 1) === 1} onChange={e => setForm(f => ({ ...f, include_service_on_invoice: e.target.checked ? 1 : 0 }))} />
                    {t('orders.includeServiceOnInvoice')}
                  </label>
                </div>
              </div>
              {!hiddenDefaultColumns.includes('unit') && (
              <div className="form-group">
                <label>{t('orders.unit')}</label>
                <select value={form.unit_id ?? ''} onChange={e => setForm(f => ({ ...f, unit_id: parseInt(e.target.value, 10) }))} required>
                  <option value="">—</option>
                  {unitOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              )}
              {!hiddenDefaultColumns.includes('quantity') && (
              <div className="form-group">
                <label>{t('orders.quantity')}</label>
                <input type="number" step="any" value={form.quantity ?? 0} onChange={e => recalcAmount(Number(e.target.value), form.rate_per_unit ?? 0)} />
              </div>
              )}
              {['amount_net', 'amount_vat', 'amount_gross'].some(k => !hiddenDefaultColumns.includes(k)) && (
              <div style={{ display: 'contents' }}>
              <div className="form-group">
                <label>{t('orders.currency')}</label>
                <select value={form.rate_currency ?? defaultCurrency} onChange={e => setForm(f => ({ ...f, rate_currency: e.target.value || null }))} style={{ minWidth: 80 }}>
                  {[...new Set([...rateCurrencies, defaultCurrency].filter(Boolean))].sort().map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{t('orders.ratePerUnit')}</label>
                {defaultRateMessage && (
                  <p style={{ margin: '0 0 4px', fontSize: '0.875rem', color: 'var(--color-warning, #ca8a04)' }}>
                    {defaultRateMessage}
                    <span style={{ display: 'block', marginTop: 4 }}>{t('orderBook.noDefaultRateSetInSettingsHint')}</span>
                  </p>
                )}
                <input type="number" step="any" value={form.rate_per_unit ?? 0} onChange={e => recalcAmount(form.quantity ?? 0, Number(e.target.value))} style={{ width: '100%' }} />
              </div>
              <div className="form-group">
                <label>{t('orders.amount')}</label>
                <input type="number" step="0.01" value={form.amount ?? 0} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} />
              </div>
              </div>
              )}
                  {!hiddenDefaultColumns.includes('order_status') && (
                  <div className="form-group">
                    <label>{t('orders.orderStatus')}</label>
                    <select value={form.order_status ?? 'to_do'} onChange={e => setForm(f => ({ ...f, order_status: e.target.value }))}>
                      {ORDER_STATUSES.map(s => <option key={s} value={s}>{t(`orders.orderStatus_${s}`)}</option>)}
                    </select>
                  </div>
                  )}
                  {!hiddenDefaultColumns.includes('invoice_status') && (
                  <div className="form-group">
                    <label>{t('orders.invoiceStatus')}</label>
                    <select value={form.invoice_status ?? 'to_issue'} onChange={e => setForm(f => ({ ...f, invoice_status: e.target.value }))}>
                      {INVOICE_STATUSES.map(s => <option key={s} value={s}>{t(`orders.invoiceStatus_${s}`)}</option>)}
                    </select>
                  </div>
                  )}
                  {!hiddenDefaultColumns.includes('payment_due') && (
                  <div className="form-group">
                    <label>{t('orders.paymentDue')}</label>
                    <input type="date" value={form.payment_due_at ?? ''} onChange={e => setForm(f => ({ ...f, payment_due_at: e.target.value || null }))} />
                  </div>
                  )}
                </div>
              )}
            {editId && !hiddenDefaultColumns.includes('subcontracts') && (
              <div style={{ marginTop: '1rem', gridColumn: '1 / -1' }}>
                <h3 style={{ marginTop: 0, marginBottom: 8 }}>{t('subcontracts.sectionTitle')}</h3>
                {orderSubcontracts.length === 0 ? (
                  <p style={{ color: '#a1a1aa', marginBottom: 8 }}>{t('subcontracts.noSubcontracts')}</p>
                ) : (
                  <div className="table-wrap" style={{ marginBottom: 8, overflowX: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>{t('subcontracts.subcontractNumber')}</th>
                          <th>{t('subcontracts.name')}</th>
                          <th>{t('orderBook.subcontractsColumn')}</th>
                          <th>{t('orders.quantity')}</th>
                          <th>{t('orders.amount')}</th>
                          <th>{t('orders.deadline')}</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderSubcontracts.map(sub => (
                          <tr key={sub.id}>
                            <td>{sub.subcontract_number}</td>
                            <td>{sub.name ?? '—'}</td>
                            <td>{sub.contractor_short_name ?? '—'}</td>
                            <td>{sub.quantity}</td>
                            <td>{formatMoney(sub.amount)}</td>
                            <td>{formatDateTime(sub.deadline_at)}</td>
                            <td>
                              <button type="button" className="danger" onClick={async () => {
                                const okSub = confirm(t('subcontracts.deleteConfirm')); window.api?.app?.refocusWindow?.(); if (!window.api?.subcontracts?.delete || !okSub) return
                                await window.api.subcontracts.delete(sub.id)
                                loadOrderSubcontracts()
                              }}>{t('common.delete')}</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <button type="button" className="primary" onClick={() => {
                  const quantity = form.quantity ?? 0
                  const ratePerUnit = form.rate_per_unit ?? 0
                  setAddSubcontractForm({
                    name: '',
                    notes: '',
                    include_specialization: true,
                    include_language_pair: true,
                    include_service: false,
                    description_custom_text: '',
                    contractor_id: null,
                    quantity,
                    rate_per_unit: ratePerUnit,
                    amount: calcSubcontractAmount(quantity, ratePerUnit),
                    deadline_at: form.deadline_at ?? ''
                  })
                  setAddSubcontractModal(true)
                }}>{t('subcontracts.addSubcontract')}</button>
              </div>
            )}
            {(() => {
              if (orderBookView !== 'custom' || customColumns.length === 0) return null
              return (
                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--color-border, #3f3f46)', paddingTop: '0.75rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem' }}>{t('settings.customColumns')}</h4>
                  <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                    {customColumns.map(col => (
                      <div key={col.id} className="form-group" style={{ marginBottom: 0 }}>
                        <label>{col.name}</label>
                        {col.col_type === 'date' ? (
                          <input type="date" value={customValues[col.id] ?? ''} onChange={e => setCustomValues(prev => ({ ...prev, [col.id]: e.target.value || null }))} />
                        ) : col.col_type === 'number' ? (
                          <input type="number" step="any" value={customValues[col.id] ?? ''} onChange={e => setCustomValues(prev => ({ ...prev, [col.id]: e.target.value || null }))} />
                        ) : (
                          <>
                            <input
                              type="text"
                              list={suggestionListId(`customValues.${col.id}`)}
                              value={customValues[col.id] ?? ''}
                              onChange={e => setCustomValues(prev => ({ ...prev, [col.id]: e.target.value || null }))}
                              onBlur={e => rememberFieldValue(`customValues.${col.id}`, e.target.value)}
                            />
                            {renderFieldDatalist(`customValues.${col.id}`, customValues[col.id])}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
            </div>
            </div>
          </form>
        </div>
      )}
      {addSpecModal && (
        <div className="card" style={{ position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 100, minWidth: 320 }}>
          <h3 style={{ marginTop: 0 }}>{t('settings.specializations')}</h3>
          <div className="form-group">
            <label>{t('settings.unitName')}</label>
            <input value={newSpecName} onChange={e => setNewSpecName(e.target.value)} placeholder={t('settings.specializationsHint')} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="primary"
              disabled={!newSpecName.trim()}
              onClick={async () => {
                if (!window.api || !newSpecName.trim()) return
                const newId = await window.api.specializations.add({ name: newSpecName.trim() }) as number
                setSpecializations(prev => [...prev, { id: newId, name: newSpecName.trim() }])
                setForm(f => ({ ...f, specialization_id: newId }))
                setAddSpecModal(false)
                setNewSpecName('')
              }}
            >
              {t('common.add')}
            </button>
            <button type="button" onClick={() => { setAddSpecModal(false); setNewSpecName('') }}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
      {addServiceModal && (() => {
        const getVatCodeCode = (def: VatCodeDef) => getCanonicalVatCode(def)
        const isUiPl = (i18n.language || '').toLowerCase().startsWith('pl')
        const getVatCodeCodeForDisplay = (def: VatCodeDef) => (isUiPl ? (def.code_pl ?? '').trim() : (def.code_en ?? '').trim()) || getVatCodeCode(def)
        const segmentLabel = (seg: VatClientSegment) => t(`settings.vatSegment${seg.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('')}`)
        const segmentTooltip = (seg: VatClientSegment) => t(`settings.vatSegment${seg.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('')}Hint`)
        const firstRateForService = () => {
          for (const seg of VAT_SEGMENTS) {
            const r = newServiceVatGrid[seg]
            if (r?.value_type === 'rate' && r.rate_value != null && Number.isFinite(r.rate_value)) return r.rate_value
          }
          return 23
        }
        return (
          <div className="card" style={{ position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)', zIndex: 100, minWidth: 420, maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>{t('settings.services')}</h3>
            <div className="form-group">
              <label>{t('orders.service')}</label>
              <input value={newServiceName} onChange={e => setNewServiceName(e.target.value)} placeholder={t('settings.servicesHint')} style={{ width: '100%' }} />
            </div>
            <p style={{ margin: '8px 0 4px', fontSize: '0.875rem', color: 'var(--color-muted, #71717a)' }}>{t('settings.vatPerService')}</p>
            <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse', marginBottom: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--color-border)' }}>{t('settings.vatPerService')}</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--color-border)', width: 90 }}>{t('settings.vatRuleRate')}</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--color-border)', width: 110 }}>{t('settings.vatRuleCode')}</th>
                </tr>
              </thead>
              <tbody>
                {VAT_SEGMENTS.map(seg => {
                  const row = newServiceVatGrid[seg]
                  const isRate = row?.value_type === 'rate'
                  return (
                    <tr key={seg}>
                      <td style={{ padding: '4px 8px', color: '#a1a1aa' }} title={segmentTooltip(seg)}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {segmentLabel(seg)}
                          <span style={{ cursor: 'help', color: '#3b82f6', fontWeight: 600, fontSize: '0.95em' }} aria-label={segmentTooltip(seg)} title={segmentTooltip(seg)}>ⓘ</span>
                        </span>
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          max={100}
                          placeholder="—"
                          style={{ width: 72 }}
                          value={isRate && row.rate_value != null ? String(row.rate_value) : ''}
                          onChange={e => {
                            const v = e.target.value.trim()
                            const num = v === '' ? null : parseFloat(v.replace(',', '.'))
                            setNewServiceVatGrid(prev => ({
                              ...prev,
                              [seg]: {
                                value_type: v === '' ? prev[seg].value_type : 'rate',
                                rate_value: v === '' ? null : (Number.isFinite(num) ? num : prev[seg].rate_value),
                                code_value: v === '' ? prev[seg].code_value : null
                              }
                            }))
                          }}
                        />
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <select
                          style={{ width: '100%', minWidth: 100 }}
                          value={!isRate && row?.code_value ? (normalizeVatCode(row.code_value) ?? '') : ''}
                          onChange={e => {
                            const code = normalizeVatCode(e.target.value) ?? null
                            setNewServiceVatGrid(prev => ({
                              ...prev,
                              [seg]: { value_type: code ? 'code' : prev[seg].value_type, rate_value: code ? null : prev[seg].rate_value, code_value: code }
                            }))
                          }}
                        >
                          <option value="">—</option>
                          {newServiceVatCodeDefs.filter(d => getVatCodeCode(d)).map((d, i) => (
                            <option key={i} value={getVatCodeCode(d)}>{getVatCodeCodeForDisplay(d)}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="primary"
                disabled={!newServiceName.trim()}
                onClick={async () => {
                  if (!window.api || !newServiceName.trim()) return
                  const defaultRate = firstRateForService()
                  const newId = await window.api.services.add({ name: newServiceName.trim(), vat_rate: defaultRate }) as number
                  const normalizedId = Number(newId)
                  if (Number.isFinite(normalizedId) && normalizedId > 0 && window.api.serviceVatRules?.upsert) {
                    for (const seg of VAT_SEGMENTS) {
                      const r = newServiceVatGrid[seg]
                      const value_type = (r?.code_value && r.code_value.trim()) ? 'code' : 'rate'
                      const rate_value = value_type === 'rate' && r?.rate_value != null && Number.isFinite(r.rate_value) ? r.rate_value : null
                      const code_value = value_type === 'code' && r?.code_value?.trim() ? r.code_value.trim() : null
                      await window.api.serviceVatRules.upsert({
                        service_id: normalizedId,
                        client_segment: seg,
                        country_code: null,
                        value_type,
                        rate_value: value_type === 'rate' ? rate_value : null,
                        code_value: value_type === 'code' ? code_value : null
                      })
                    }
                  }
                  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
                    await load()
                    const latest = await window.api.services.list() as { id: number; name: string; vat_rate?: number | null }[]
                    const byName = latest.find(s => s.name.trim().toLowerCase() === newServiceName.trim().toLowerCase())
                    if (byName?.id) {
                      setServices(latest)
                      setForm(f => ({ ...f, service_id: byName.id }))
                    }
                  } else {
                    setServices(prev => [...prev, { id: normalizedId, name: newServiceName.trim(), vat_rate: defaultRate }])
                    setForm(f => ({ ...f, service_id: normalizedId }))
                  }
                  setAddServiceModal(false)
                  setNewServiceName('')
                }}
              >
                {t('common.add')}
              </button>
              <button type="button" onClick={() => { setAddServiceModal(false); setNewServiceName('') }}>{t('common.cancel')}</button>
            </div>
          </div>
        )
      })()}
      {addPairModal && (
        <div className="card" style={{ position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 100, minWidth: 320 }}>
          <h3 style={{ marginTop: 0 }}>{t('settings.languagePairs')}</h3>
          <div className="form-group">
            <label>{t('settings.source')}</label>
            <select value={newPairSourceId} onChange={e => setNewPairSourceId(e.target.value)} required>
              <option value="">—</option>
              {sortedLanguages.map(l => <option key={l.id} value={l.id}>{l.code} ({l.name})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>{t('settings.target')}</label>
            <select value={newPairTargetId} onChange={e => setNewPairTargetId(e.target.value)} required>
              <option value="">—</option>
              {sortedLanguages.map(l => <option key={l.id} value={l.id}>{l.code} ({l.name})</option>)}
            </select>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" id="new-pair-bidirectional" checked={newPairBidirectional} onChange={e => setNewPairBidirectional(e.target.checked)} disabled={newPairSourceId === newPairTargetId && !!newPairSourceId} />
            <label htmlFor="new-pair-bidirectional" style={{ marginBottom: 0, cursor: 'pointer' }}>{t('settings.pairBidirectional')}</label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="primary"
              disabled={!newPairSourceId || !newPairTargetId}
              onClick={async () => {
                if (!window.api || !newPairSourceId || !newPairTargetId) return
                const sourceId = parseInt(newPairSourceId, 10)
                const targetId = parseInt(newPairTargetId, 10)
                const sourceLang = languages.find(l => l.id === sourceId)
                const targetLang = languages.find(l => l.id === targetId)
                const bidirectional = newPairBidirectional && sourceId !== targetId
                const label = bidirectional ? `${sourceLang?.code ?? ''} <> ${targetLang?.code ?? ''}` : `${sourceLang?.code ?? ''} > ${targetLang?.code ?? ''}`
                const newId = await window.api.languagePairs.add({ source_lang_id: sourceId, target_lang_id: targetId, label, bidirectional }) as number
                setPairs(prev => [...prev, { id: newId, label }])
                setForm(f => ({ ...f, language_pair_id: newId }))
                setAddPairModal(false)
                setNewPairSourceId('')
                setNewPairTargetId('')
                setNewPairBidirectional(false)
              }}
            >
              {t('common.add')}
            </button>
            <button type="button" onClick={() => { setAddPairModal(false); setNewPairSourceId(''); setNewPairTargetId(''); setNewPairBidirectional(false) }}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
      {addSubcontractModal && editId && (
        <div className="card" style={{ position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 100, minWidth: 320 }}>
          <h3 style={{ marginTop: 0 }}>{t('subcontracts.addSubcontract')}</h3>
          <div
            style={{ marginBottom: 8, padding: '8px 12px', background: 'var(--color-surface-elevated, #f4f4f5)', borderRadius: 8, borderLeft: '4px solid var(--color-primary, #2563eb)', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none' }}
            onClick={() => setSubcontractSectionOpen(o => !o)}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSubcontractSectionOpen(o => !o) } }}
            aria-expanded={subcontractSectionOpen}
          >
            <span style={{ display: 'inline-block', transform: subcontractSectionOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '0.75rem' }} aria-hidden>▶</span>
            {t('subcontracts.details')}
          </div>
          {subcontractSectionOpen && (
          <>
          <div className="form-group">
            <label>{t('subcontracts.selectContractor')}</label>
            <select value={addSubcontractForm.contractor_id ?? ''} onChange={e => setAddSubcontractForm(f => ({ ...f, contractor_id: e.target.value ? parseInt(e.target.value, 10) : null }))} required>
              <option value="">—</option>
              {contractors.map(c => <option key={c.id} value={c.id}>{c.short_name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>{t('subcontracts.name')} *</label>
            <input
              type="text"
              list={suggestionListId('addSubcontractForm.name')}
              value={addSubcontractForm.name}
              onChange={e => setAddSubcontractForm(f => ({ ...f, name: e.target.value }))}
              onBlur={e => rememberFieldValue('addSubcontractForm.name', e.target.value)}
              placeholder={t('subcontracts.nameRequired')}
              required
            />
            {renderFieldDatalist('addSubcontractForm.name', addSubcontractForm.name)}
          </div>
          <div className="form-group">
            <label>{t('subcontracts.asDescription')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
                <input type="checkbox" checked={addSubcontractForm.include_specialization} onChange={e => setAddSubcontractForm(f => ({ ...f, include_specialization: e.target.checked }))} />
                {t('subcontracts.includeSpecialization')}
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
                <input type="checkbox" checked={addSubcontractForm.include_language_pair} onChange={e => setAddSubcontractForm(f => ({ ...f, include_language_pair: e.target.checked }))} />
                {t('subcontracts.includeLanguagePair')}
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
                <input type="checkbox" checked={addSubcontractForm.include_service} onChange={e => setAddSubcontractForm(f => ({ ...f, include_service: e.target.checked }))} />
                {t('subcontracts.includeService')}
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
                <input type="checkbox" checked={!!addSubcontractForm.description_custom_text.trim()} onChange={e => setAddSubcontractForm(f => ({ ...f, description_custom_text: e.target.checked ? f.description_custom_text : '' }))} />
                {t('subcontracts.customText')}
              </label>
            </div>
            <input type="text" value={addSubcontractForm.description_custom_text} onChange={e => setAddSubcontractForm(f => ({ ...f, description_custom_text: e.target.value }))} placeholder="—" style={{ marginTop: 6, width: '100%' }} />
          </div>
          <div className="form-group">
            <label>{t('orders.quantity')}</label>
            <input
              type="number"
              step="any"
              value={addSubcontractForm.quantity}
              onChange={e => {
                const quantity = Number(e.target.value) || 0
                setAddSubcontractForm(f => ({ ...f, quantity, amount: calcSubcontractAmount(quantity, f.rate_per_unit) }))
              }}
            />
          </div>
          <div className="form-group">
            <label>{t('orders.ratePerUnit')}</label>
            <input
              type="number"
              step="any"
              value={addSubcontractForm.rate_per_unit}
              onChange={e => {
                const ratePerUnit = Number(e.target.value) || 0
                setAddSubcontractForm(f => ({ ...f, rate_per_unit: ratePerUnit, amount: calcSubcontractAmount(f.quantity, ratePerUnit) }))
              }}
            />
          </div>
          <div className="form-group">
            <label>{t('orders.amount')}</label>
            <input type="number" step="0.01" value={addSubcontractForm.amount} readOnly />
          </div>
          <div className="form-group">
            <label>{t('orders.deadline')}</label>
            <input type="datetime-local" value={addSubcontractForm.deadline_at} onChange={e => setAddSubcontractForm(f => ({ ...f, deadline_at: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>{t('subcontracts.notes')}</label>
            <textarea value={addSubcontractForm.notes} onChange={e => setAddSubcontractForm(f => ({ ...f, notes: e.target.value }))} placeholder="—" rows={4} style={{ width: '100%', resize: 'vertical', minHeight: 80 }} />
          </div>
          </>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="primary" onClick={async () => {
              if (!window.api?.subcontracts?.add || addSubcontractForm.contractor_id == null) return
              await window.api.subcontracts.add({ order_id: parseInt(editId, 10), contractor_id: addSubcontractForm.contractor_id, name: addSubcontractForm.name.trim() || null, notes: addSubcontractForm.notes.trim() || null, include_specialization: addSubcontractForm.include_specialization ? 1 : 0, include_language_pair: addSubcontractForm.include_language_pair ? 1 : 0, include_service: addSubcontractForm.include_service ? 1 : 0, description_custom_text: addSubcontractForm.description_custom_text.trim() || null, quantity: addSubcontractForm.quantity, rate_per_unit: addSubcontractForm.rate_per_unit, amount: addSubcontractForm.amount, deadline_at: addSubcontractForm.deadline_at || null })
              setAddSubcontractModal(false)
              loadOrderSubcontracts()
            }} disabled={addSubcontractForm.contractor_id == null}>{t('common.save')}</button>
            <button type="button" onClick={() => setAddSubcontractModal(false)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
      {!showForm && (
        <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="primary" onClick={() => setSearchParams({ add: '1' })}>{t('orders.add')}</button>
          <button onClick={exportXls}>{t('orderBook.exportCsv')}</button>
          <button onClick={exportXlsx}>{t('orderBook.exportXls')}</button>
          <button onClick={exportPdf}>{t('orderBook.exportPdf')}</button>
          {filteredAndSortedOrders.some(o => o.invoice_status === 'to_issue') && (
            <button type="button" className="primary" onClick={openIssueModalForSelected} disabled={selectedOrderIds.length === 0}>
              {t('orderBook.issueInvoiceSelected')}{selectedOrderIds.length > 0 ? ` (${selectedOrderIds.length})` : ''}
            </button>
          )}
          <button type="button" className="danger" onClick={() => deleteOrderBulk(selectedOrderIds)} disabled={selectedOrderIds.length === 0}>
            {t('orderBook.deleteSelected')}{selectedOrderIds.length > 0 ? ` (${selectedOrderIds.length})` : ''}
          </button>
          {hasAnyColumnWidths && (
            <button type="button" onClick={resetCurrentViewColumnWidths}>
              {t('orderBook.resetColumnWidths')}
            </button>
          )}
        </p>
      )}
      {orders.length > 0 && (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>{t('orderBook.sortBy')}</span>
              <select
                value={
                  orderBookView === 'repertorium'
                    ? (REPERTORIUM_SORT_OPTIONS.some(o => o.value === sortBy) ? sortBy : 'received_at')
                    : (SIMPLIFIED_SORT_OPTIONS.some(o => o.value === sortBy) ? sortBy : 'received_at')
                }
                onChange={e => setSortBy(e.target.value)}
                style={{ minWidth: 200 }}
              >
                {orderBookView === 'repertorium'
                  ? REPERTORIUM_SORT_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                    ))
                  : SIMPLIFIED_SORT_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                    ))}
              </select>
              <button type="button" onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}>{sortDir === 'asc' ? '↑' : '↓'}</button>
              <button
                type="button"
                onClick={() => setFiltersOpen(o => !o)}
                style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {t('orderBook.addFilter')}
                {activeFiltersCount > 0 ? <span style={{ background: '#3b82f6', color: '#fff', borderRadius: 10, padding: '2px 6px', fontSize: '0.75rem', marginLeft: 4 }}>{activeFiltersCount}</span> : null}
                <span style={{ marginLeft: 4 }}>{filtersOpen ? '\u25BE' : '\u25B8'}</span>
              </button>
              {activeFiltersCount > 0 && (
                <button type="button" onClick={clearFilters} style={{ fontSize: '0.875rem' }}>{t('orderBook.clearFilters')}</button>
              )}
              <button
                type="button"
                onClick={() => setColumnPickerOpen(o => !o)}
                style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {t('orderBook.columns')}
                <span style={{ marginLeft: 4 }}>{columnPickerOpen ? '\u25BE' : '\u25B8'}</span>
              </button>
            </div>
            {columnPickerOpen && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #27272a' }}>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: '0.95rem' }}>{t('orderBook.columnsVisibility')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                  {(orderBookView === 'repertorium' ? EXPORT_COLUMNS_REPERTORIUM : DEFAULT_COLUMNS_FOR_CUSTOM_VIEW).map(col => {
                    const visible = !hiddenDefaultColumns.includes(col.key)
                    return (
                      <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem' }}>
                        <input
                          type="checkbox"
                          checked={visible}
                          onChange={() => {
                            const next = visible ? [...hiddenDefaultColumns, col.key] : hiddenDefaultColumns.filter(k => k !== col.key)
                            setHiddenDefaultColumns(next)
                            const effectiveBookId = bookId ?? books[0]?.id
                            if (effectiveBookId != null && window.api?.settings?.set) {
                              window.api.settings.set(`book_${effectiveBookId}_hidden_columns`, JSON.stringify(next))
                            }
                          }}
                        />
                        {t(col.labelKey)}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
            {filtersOpen && (
              orderBookView === 'repertorium' ? (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #27272a' }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, padding: '6px 0', borderBottom: '1px solid #3f3f46', fontSize: '0.95rem' }}>{t('orderBook.repertoriumNrRep')} / {t('orderBook.repertoriumOrderDate')} / {t('orderBook.repertoriumClientNameAddress')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.orderNumber')} ({t('orderBook.filterContains')})</div>
                      <input type="text" value={filters.orderNumberContains} onChange={e => setFilters(f => ({ ...f, orderNumberContains: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumOrderDate')}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <input type="date" value={filters.receivedAtFrom} onChange={e => setFilters(f => ({ ...f, receivedAtFrom: e.target.value }))} title={t('orderBook.filterFrom')} style={{ flex: 1, minWidth: 100 }} />
                        <input type="date" value={filters.receivedAtTo} onChange={e => setFilters(f => ({ ...f, receivedAtTo: e.target.value }))} title={t('orderBook.filterTo')} style={{ flex: 1, minWidth: 100 }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.client')}</div>
                      <select multiple value={filters.clientIds.map(String)} onChange={e => setFilters(f => ({ ...f, clientIds: Array.from(e.target.selectedOptions, o => parseInt(o.value, 10)) }))} style={{ width: '100%', minHeight: 80, maxHeight: 160 }}>
                        {clients.map(c => (<option key={c.id} value={c.id}>{c.short_name}</option>))}
                      </select>
                    </div>
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 8, padding: '6px 0', borderBottom: '1px solid #3f3f46', fontSize: '0.95rem' }}>{t('orderBook.repertoriumSectionWritten')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumDocumentAuthor')}</div><input type="text" value={filters.documentAuthorContains} onChange={e => setFilters(f => ({ ...f, documentAuthorContains: e.target.value }))} placeholder={t('orderBook.filterContains')} style={{ width: '100%' }} /></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumDocumentName')}</div><input type="text" value={filters.documentNameContains} onChange={e => setFilters(f => ({ ...f, documentNameContains: e.target.value }))} placeholder={t('orderBook.filterContains')} style={{ width: '100%' }} /></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumDocumentDate')}</div><div style={{ display: 'flex', gap: 4 }}><input type="date" value={filters.documentDateFrom} onChange={e => setFilters(f => ({ ...f, documentDateFrom: e.target.value }))} title={t('orderBook.filterFrom')} style={{ flex: 1, minWidth: 100 }} /><input type="date" value={filters.documentDateTo} onChange={e => setFilters(f => ({ ...f, documentDateTo: e.target.value }))} title={t('orderBook.filterTo')} style={{ flex: 1, minWidth: 100 }} /></div></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumDocumentNumber')}</div><input type="text" value={filters.documentNumberContains} onChange={e => setFilters(f => ({ ...f, documentNumberContains: e.target.value }))} placeholder={t('orderBook.filterContains')} style={{ width: '100%' }} /></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.languagePair')}</div><select multiple value={filters.languagePairIds.map(String)} onChange={e => setFilters(f => ({ ...f, languagePairIds: Array.from(e.target.selectedOptions, o => parseInt(o.value, 10)) }))} style={{ width: '100%', minHeight: 80, maxHeight: 160 }}>{pairs.map(p => (<option key={p.id} value={p.id}>{p.label}</option>))}</select></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumDocumentFormRemarks')}</div><input type="text" value={filters.documentFormRemarksContains} onChange={e => setFilters(f => ({ ...f, documentFormRemarksContains: e.target.value }))} placeholder={t('orderBook.filterContains')} style={{ width: '100%' }} /></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumActivityType')}</div><input type="text" value={filters.activityTypeContains} onChange={e => setFilters(f => ({ ...f, activityTypeContains: e.target.value }))} placeholder={t('orderBook.filterContains')} style={{ width: '100%' }} /></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumPagesCount')}</div><div style={{ display: 'flex', gap: 4 }}><input type="number" step="any" placeholder={t('orderBook.filterMin')} value={filters.quantityMin} onChange={e => setFilters(f => ({ ...f, quantityMin: e.target.value }))} style={{ width: 80 }} /><input type="number" step="any" placeholder={t('orderBook.filterMax')} value={filters.quantityMax} onChange={e => setFilters(f => ({ ...f, quantityMax: e.target.value }))} style={{ width: 80 }} /></div></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumRatePerPage')}</div><div style={{ display: 'flex', gap: 4 }}><input type="number" step="0.01" placeholder={t('orderBook.filterMin')} value={filters.ratePerPageMin} onChange={e => setFilters(f => ({ ...f, ratePerPageMin: e.target.value }))} style={{ width: 80 }} /><input type="number" step="0.01" placeholder={t('orderBook.filterMax')} value={filters.ratePerPageMax} onChange={e => setFilters(f => ({ ...f, ratePerPageMax: e.target.value }))} style={{ width: 80 }} /></div></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumExtraCopies')}</div><div style={{ display: 'flex', gap: 4 }}><input type="number" min={0} placeholder={t('orderBook.filterMin')} value={filters.extraCopiesMin} onChange={e => setFilters(f => ({ ...f, extraCopiesMin: e.target.value }))} style={{ width: 80 }} /><input type="number" min={0} placeholder={t('orderBook.filterMax')} value={filters.extraCopiesMax} onChange={e => setFilters(f => ({ ...f, extraCopiesMax: e.target.value }))} style={{ width: 80 }} /></div></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumFeeNet')}</div><div style={{ display: 'flex', gap: 4 }}><input type="number" step="0.01" placeholder={t('orderBook.filterMin')} value={filters.amountMin} onChange={e => setFilters(f => ({ ...f, amountMin: e.target.value }))} style={{ width: 80 }} /><input type="number" step="0.01" placeholder={t('orderBook.filterMax')} value={filters.amountMax} onChange={e => setFilters(f => ({ ...f, amountMax: e.target.value }))} style={{ width: 80 }} /></div></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumFeeGross')}</div><div style={{ display: 'flex', gap: 4 }}><input type="number" step="0.01" placeholder={t('orderBook.filterMin')} value={filters.amountGrossMin} onChange={e => setFilters(f => ({ ...f, amountGrossMin: e.target.value }))} style={{ width: 80 }} /><input type="number" step="0.01" placeholder={t('orderBook.filterMax')} value={filters.amountGrossMax} onChange={e => setFilters(f => ({ ...f, amountGrossMax: e.target.value }))} style={{ width: 80 }} /></div></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumReturnDate')}</div><div style={{ display: 'flex', gap: 4 }}><input type="date" value={filters.completedAtFrom} onChange={e => setFilters(f => ({ ...f, completedAtFrom: e.target.value }))} title={t('orderBook.filterFrom')} style={{ flex: 1, minWidth: 100 }} /><input type="date" value={filters.completedAtTo} onChange={e => setFilters(f => ({ ...f, completedAtTo: e.target.value }))} title={t('orderBook.filterTo')} style={{ flex: 1, minWidth: 100 }} /></div></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumNotes')}</div><input type="text" value={filters.notesContains} onChange={e => setFilters(f => ({ ...f, notesContains: e.target.value }))} placeholder={t('orderBook.filterContains')} style={{ width: '100%' }} /></div>
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 8, padding: '6px 0', borderBottom: '1px solid #3f3f46', fontSize: '0.95rem' }}>{t('orderBook.repertoriumSectionOral')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumOralDate')}</div><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}><input type="date" value={filters.oralDateFrom} onChange={e => setFilters(f => ({ ...f, oralDateFrom: e.target.value }))} title={t('orderBook.filterFrom')} style={{ flex: 1, minWidth: 100 }} /><input type="date" value={filters.oralDateTo} onChange={e => setFilters(f => ({ ...f, oralDateTo: e.target.value }))} title={t('orderBook.filterTo')} style={{ flex: 1, minWidth: 100 }} /></div></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumOralPlace')}</div><input type="text" value={filters.oralPlaceContains} onChange={e => setFilters(f => ({ ...f, oralPlaceContains: e.target.value }))} placeholder={t('orderBook.filterContains')} style={{ width: '100%' }} /></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumOralLang')}</div><input type="text" value={filters.oralLangContains} onChange={e => setFilters(f => ({ ...f, oralLangContains: e.target.value }))} placeholder={t('orderBook.filterContains')} style={{ width: '100%' }} /></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumOralDuration')}</div><div style={{ display: 'flex', gap: 4 }}><input type="number" step="0.25" placeholder={t('orderBook.filterMin')} value={filters.oralDurationMin} onChange={e => setFilters(f => ({ ...f, oralDurationMin: e.target.value }))} style={{ width: 80 }} /><input type="number" step="0.25" placeholder={t('orderBook.filterMax')} value={filters.oralDurationMax} onChange={e => setFilters(f => ({ ...f, oralDurationMax: e.target.value }))} style={{ width: 80 }} /></div></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumOralScope')}</div><input type="text" value={filters.oralScopeContains} onChange={e => setFilters(f => ({ ...f, oralScopeContains: e.target.value }))} placeholder={t('orderBook.filterContains')} style={{ width: '100%' }} /></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumOralRate')}</div><div style={{ display: 'flex', gap: 4 }}><input type="number" step="0.01" placeholder={t('orderBook.filterMin')} value={filters.oralRateMin} onChange={e => setFilters(f => ({ ...f, oralRateMin: e.target.value }))} style={{ width: 80 }} /><input type="number" step="0.01" placeholder={t('orderBook.filterMax')} value={filters.oralRateMax} onChange={e => setFilters(f => ({ ...f, oralRateMax: e.target.value }))} style={{ width: 80 }} /></div></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumOralNet')}</div><div style={{ display: 'flex', gap: 4 }}><input type="number" step="0.01" placeholder={t('orderBook.filterMin')} value={filters.oralNetMin} onChange={e => setFilters(f => ({ ...f, oralNetMin: e.target.value }))} style={{ width: 80 }} /><input type="number" step="0.01" placeholder={t('orderBook.filterMax')} value={filters.oralNetMax} onChange={e => setFilters(f => ({ ...f, oralNetMax: e.target.value }))} style={{ width: 80 }} /></div></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumOralGross')}</div><div style={{ display: 'flex', gap: 4 }}><input type="number" step="0.01" placeholder={t('orderBook.filterMin')} value={filters.oralGrossMin} onChange={e => setFilters(f => ({ ...f, oralGrossMin: e.target.value }))} style={{ width: 80 }} /><input type="number" step="0.01" placeholder={t('orderBook.filterMax')} value={filters.oralGrossMax} onChange={e => setFilters(f => ({ ...f, oralGrossMax: e.target.value }))} style={{ width: 80 }} /></div></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumOralNotes')}</div><input type="text" value={filters.oralNotesContains} onChange={e => setFilters(f => ({ ...f, oralNotesContains: e.target.value }))} placeholder={t('orderBook.filterContains')} style={{ width: '100%' }} /></div>
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 8, padding: '6px 0', borderBottom: '1px solid #3f3f46', fontSize: '0.95rem' }}>{t('orderBook.repertoriumSectionRefusal')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumRefusalDate')}</div><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}><input type="date" value={filters.refusalDateFrom} onChange={e => setFilters(f => ({ ...f, refusalDateFrom: e.target.value }))} title={t('orderBook.filterFrom')} style={{ flex: 1, minWidth: 100 }} /><input type="date" value={filters.refusalDateTo} onChange={e => setFilters(f => ({ ...f, refusalDateTo: e.target.value }))} title={t('orderBook.filterTo')} style={{ flex: 1, minWidth: 100 }} /></div></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumRefusalOrgan')}</div><input type="text" value={filters.refusalOrganContains} onChange={e => setFilters(f => ({ ...f, refusalOrganContains: e.target.value }))} placeholder={t('orderBook.filterContains')} style={{ width: '100%' }} /></div>
                    <div><div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumRefusalReason')}</div><input type="text" value={filters.refusalReasonContains} onChange={e => setFilters(f => ({ ...f, refusalReasonContains: e.target.value }))} placeholder={t('orderBook.filterContains')} style={{ width: '100%' }} /></div>
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 8, padding: '6px 0', borderBottom: '1px solid #3f3f46', fontSize: '0.95rem' }}>{t('orderBook.repertoriumSectionStatus')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.orderStatus')}</div>
                      <select multiple value={filters.orderStatuses} onChange={e => setFilters(f => ({ ...f, orderStatuses: Array.from(e.target.selectedOptions, o => o.value) }))} style={{ width: '100%', minHeight: 80 }}>{ORDER_STATUSES.map(s => (<option key={s} value={s}>{t(`orders.orderStatus_${s}`)}</option>))}</select>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.invoiceStatus')}</div>
                      <select multiple value={filters.invoiceStatuses} onChange={e => setFilters(f => ({ ...f, invoiceStatuses: Array.from(e.target.selectedOptions, o => o.value) }))} style={{ width: '100%', minHeight: 80 }}>{INVOICE_STATUSES.map(s => (<option key={s} value={s}>{t(`orders.invoiceStatus_${s}`)}</option>))}</select>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.paymentDue')}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}><input type="date" value={filters.paymentDueFrom} onChange={e => setFilters(f => ({ ...f, paymentDueFrom: e.target.value }))} title={t('orderBook.filterFrom')} style={{ flex: 1, minWidth: 100 }} /><input type="date" value={filters.paymentDueTo} onChange={e => setFilters(f => ({ ...f, paymentDueTo: e.target.value }))} title={t('orderBook.filterTo')} style={{ flex: 1, minWidth: 100 }} /></div>
                    </div>
                  </div>
                </div>
              ) : (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #27272a', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.orderNumber')} ({t('orderBook.filterContains')})</div>
                  <input type="text" value={filters.orderNumberContains} onChange={e => setFilters(f => ({ ...f, orderNumberContains: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.receivedAt')}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <input type="date" value={filters.receivedAtFrom} onChange={e => setFilters(f => ({ ...f, receivedAtFrom: e.target.value }))} title={t('orderBook.filterFrom')} style={{ flex: 1, minWidth: 100 }} />
                    <input type="date" value={filters.receivedAtTo} onChange={e => setFilters(f => ({ ...f, receivedAtTo: e.target.value }))} title={t('orderBook.filterTo')} style={{ flex: 1, minWidth: 100 }} />
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.client')}</div>
                  <select
                    multiple
                    value={filters.clientIds.map(String)}
                    onChange={e => setFilters(f => ({ ...f, clientIds: Array.from(e.target.selectedOptions, o => parseInt(o.value, 10)) }))}
                    style={{ width: '100%', minHeight: 80, maxHeight: 160 }}
                  >
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.short_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.subcontractTo')}</div>
                  <select
                    multiple
                    value={filters.contractorIds.map(String)}
                    onChange={e => setFilters(f => ({ ...f, contractorIds: Array.from(e.target.selectedOptions, o => parseInt(o.value, 10)) }))}
                    style={{ width: '100%', minHeight: 80, maxHeight: 160 }}
                  >
                    {contractors.map(c => (
                      <option key={c.id} value={c.id}>{c.short_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.deadline')}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <input type="datetime-local" value={filters.deadlineFrom} onChange={e => setFilters(f => ({ ...f, deadlineFrom: e.target.value }))} title={t('orderBook.filterFrom')} style={{ flex: 1, minWidth: 100 }} />
                    <input type="datetime-local" value={filters.deadlineTo} onChange={e => setFilters(f => ({ ...f, deadlineTo: e.target.value }))} title={t('orderBook.filterTo')} style={{ flex: 1, minWidth: 100 }} />
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.completedAt')}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <input type="date" value={filters.completedAtFrom} onChange={e => setFilters(f => ({ ...f, completedAtFrom: e.target.value }))} title={t('orderBook.filterFrom')} style={{ flex: 1, minWidth: 100 }} />
                    <input type="date" value={filters.completedAtTo} onChange={e => setFilters(f => ({ ...f, completedAtTo: e.target.value }))} title={t('orderBook.filterTo')} style={{ flex: 1, minWidth: 100 }} />
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.specialization')}</div>
                  <select
                    multiple
                    value={filters.specializationIds.map(String)}
                    onChange={e => setFilters(f => ({ ...f, specializationIds: Array.from(e.target.selectedOptions, o => parseInt(o.value, 10)) }))}
                    style={{ width: '100%', minHeight: 80, maxHeight: 160 }}
                  >
                    {specializations.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.languagePair')}</div>
                  <select
                    multiple
                    value={filters.languagePairIds.map(String)}
                    onChange={e => setFilters(f => ({ ...f, languagePairIds: Array.from(e.target.selectedOptions, o => parseInt(o.value, 10)) }))}
                    style={{ width: '100%', minHeight: 80, maxHeight: 160 }}
                  >
                    {pairs.map(p => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.unit')}</div>
                  <select
                    multiple
                    value={filters.unitIds.map(String)}
                    onChange={e => setFilters(f => ({ ...f, unitIds: Array.from(e.target.selectedOptions, o => parseInt(o.value, 10)) }))}
                    style={{ width: '100%', minHeight: 80, maxHeight: 160 }}
                  >
                    {units.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.quantity')}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <input type="number" step="any" placeholder={t('orderBook.filterMin')} value={filters.quantityMin} onChange={e => setFilters(f => ({ ...f, quantityMin: e.target.value }))} style={{ width: 80 }} />
                    <input type="number" step="any" placeholder={t('orderBook.filterMax')} value={filters.quantityMax} onChange={e => setFilters(f => ({ ...f, quantityMax: e.target.value }))} style={{ width: 80 }} />
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.amountNet')}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <input type="number" step="0.01" placeholder={t('orderBook.filterMin')} value={filters.amountMin} onChange={e => setFilters(f => ({ ...f, amountMin: e.target.value }))} style={{ width: 80 }} />
                    <input type="number" step="0.01" placeholder={t('orderBook.filterMax')} value={filters.amountMax} onChange={e => setFilters(f => ({ ...f, amountMax: e.target.value }))} style={{ width: 80 }} />
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.orderStatus')}</div>
                  <select
                    multiple
                    value={filters.orderStatuses}
                    onChange={e => setFilters(f => ({ ...f, orderStatuses: Array.from(e.target.selectedOptions, o => o.value) }))}
                    style={{ width: '100%', minHeight: 80 }}
                  >
                    {ORDER_STATUSES.map(s => (
                      <option key={s} value={s}>{t(`orders.orderStatus_${s}`)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.invoiceStatus')}</div>
                  <select
                    multiple
                    value={filters.invoiceStatuses}
                    onChange={e => setFilters(f => ({ ...f, invoiceStatuses: Array.from(e.target.selectedOptions, o => o.value) }))}
                    style={{ width: '100%', minHeight: 80 }}
                  >
                    {INVOICE_STATUSES.map(s => (
                      <option key={s} value={s}>{t(`orders.invoiceStatus_${s}`)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.paymentDue')}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <input type="date" value={filters.paymentDueFrom} onChange={e => setFilters(f => ({ ...f, paymentDueFrom: e.target.value }))} title={t('orderBook.filterFrom')} style={{ flex: 1, minWidth: 100 }} />
                    <input type="date" value={filters.paymentDueTo} onChange={e => setFilters(f => ({ ...f, paymentDueTo: e.target.value }))} title={t('orderBook.filterTo')} style={{ flex: 1, minWidth: 100 }} />
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumOralDate')}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}><input type="date" value={filters.oralDateFrom} onChange={e => setFilters(f => ({ ...f, oralDateFrom: e.target.value }))} title={t('orderBook.filterFrom')} style={{ flex: 1, minWidth: 100 }} /><input type="date" value={filters.oralDateTo} onChange={e => setFilters(f => ({ ...f, oralDateTo: e.target.value }))} title={t('orderBook.filterTo')} style={{ flex: 1, minWidth: 100 }} /></div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orderBook.repertoriumOralNet')}</div>
                  <div style={{ display: 'flex', gap: 4 }}><input type="number" step="0.01" placeholder={t('orderBook.filterMin')} value={filters.oralNetMin} onChange={e => setFilters(f => ({ ...f, oralNetMin: e.target.value }))} style={{ width: 80 }} /><input type="number" step="0.01" placeholder={t('orderBook.filterMax')} value={filters.oralNetMax} onChange={e => setFilters(f => ({ ...f, oralNetMax: e.target.value }))} style={{ width: 80 }} /></div>
                </div>
              </div>
              )
            )}
            {activeFiltersCount > 0 && (
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.8125rem', color: '#a1a1aa' }}>
                {filters.orderNumberContains.trim() && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                    {t('orders.orderNumber')}: &quot;{filters.orderNumberContains}&quot;
                    <button type="button" onClick={() => setFilters(f => ({ ...f, orderNumberContains: '' }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                  </span>
                )}
                {filters.nameContains.trim() && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                    {t('orders.name')}: &quot;{filters.nameContains}&quot;
                    <button type="button" onClick={() => setFilters(f => ({ ...f, nameContains: '' }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                  </span>
                )}
                {(filters.receivedAtFrom || filters.receivedAtTo) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                    {t('orders.receivedAt')}: {filters.receivedAtFrom || '…'} – {filters.receivedAtTo || '…'}
                    <button type="button" onClick={() => setFilters(f => ({ ...f, receivedAtFrom: '', receivedAtTo: '' }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                  </span>
                )}
                {filters.clientIds.length > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                    {t('orders.client')}: {filters.clientIds.map(id => clients.find(c => c.id === id)?.short_name).filter(Boolean).join(', ')}
                    <button type="button" onClick={() => setFilters(f => ({ ...f, clientIds: [] }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                  </span>
                )}
                {filters.contractorIds.length > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                    {t('orders.subcontractTo')}: {filters.contractorIds.map(id => contractors.find(c => c.id === id)?.short_name).filter(Boolean).join(', ')}
                    <button type="button" onClick={() => setFilters(f => ({ ...f, contractorIds: [] }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                  </span>
                )}
                {(filters.deadlineFrom || filters.deadlineTo) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                    {t('orders.deadline')}: {filters.deadlineFrom || '…'} – {filters.deadlineTo || '…'}
                    <button type="button" onClick={() => setFilters(f => ({ ...f, deadlineFrom: '', deadlineTo: '' }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                  </span>
                )}
                {(filters.completedAtFrom || filters.completedAtTo) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                    {t('orders.completedAt')}: {filters.completedAtFrom || '…'} – {filters.completedAtTo || '…'}
                    <button type="button" onClick={() => setFilters(f => ({ ...f, completedAtFrom: '', completedAtTo: '' }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                  </span>
                )}
                {(filters.quantityMin || filters.quantityMax) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                    {t('orders.quantity')}: {filters.quantityMin || '…'} – {filters.quantityMax || '…'}
                    <button type="button" onClick={() => setFilters(f => ({ ...f, quantityMin: '', quantityMax: '' }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                  </span>
                )}
                {(filters.amountMin || filters.amountMax) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                    {t('orderBook.amountNet')}: {filters.amountMin || '…'} – {filters.amountMax || '…'}
                    <button type="button" onClick={() => setFilters(f => ({ ...f, amountMin: '', amountMax: '' }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                  </span>
                )}
                {(filters.paymentDueFrom || filters.paymentDueTo) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                    {t('orders.paymentDue')}: {filters.paymentDueFrom || '…'} – {filters.paymentDueTo || '…'}
                    <button type="button" onClick={() => setFilters(f => ({ ...f, paymentDueFrom: '', paymentDueTo: '' }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                  </span>
                )}
                {(filters.oralDateFrom || filters.oralDateTo) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                    {t('orderBook.repertoriumOralDate')}: {filters.oralDateFrom || '…'} – {filters.oralDateTo || '…'}
                    <button type="button" onClick={() => setFilters(f => ({ ...f, oralDateFrom: '', oralDateTo: '' }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                  </span>
                )}
                {(filters.oralNetMin.trim() || filters.oralNetMax.trim()) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                    {t('orderBook.repertoriumOralNet')}: {filters.oralNetMin.trim() || '…'} – {filters.oralNetMax.trim() || '…'}
                    <button type="button" onClick={() => setFilters(f => ({ ...f, oralNetMin: '', oralNetMax: '' }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                  </span>
                )}
                {filters.orderStatuses.length > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                    {t('orders.orderStatus')}: {filters.orderStatuses.map(s => t(`orders.orderStatus_${s}`)).join(', ')}
                    <button type="button" onClick={() => setFilters(f => ({ ...f, orderStatuses: [] }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                  </span>
                )}
                {filters.invoiceStatuses.length > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                    {t('orders.invoiceStatus')}: {filters.invoiceStatuses.map(s => t(`orders.invoiceStatus_${s}`)).join(', ')}
                    <button type="button" onClick={() => setFilters(f => ({ ...f, invoiceStatuses: [] }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                  </span>
                )}
                {filters.specializationIds.length > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                    {t('orders.specialization')}: {filters.specializationIds.map(id => specializations.find(s => s.id === id)?.name).filter(Boolean).join(', ')}
                    <button type="button" onClick={() => setFilters(f => ({ ...f, specializationIds: [] }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                  </span>
                )}
                {filters.languagePairIds.length > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                    {t('orders.languagePair')}: {filters.languagePairIds.map(id => pairs.find(p => p.id === id)?.label).filter(Boolean).join(', ')}
                    <button type="button" onClick={() => setFilters(f => ({ ...f, languagePairIds: [] }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                  </span>
                )}
                {filters.unitIds.length > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                    {t('orders.unit')}: {filters.unitIds.map(id => units.find(u => u.id === id)?.name).filter(Boolean).join(', ')}
                    <button type="button" onClick={() => setFilters(f => ({ ...f, unitIds: [] }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                  </span>
                )}
              </div>
            )}
          </div>
          <div className={`table-scroll-outer${orderBookView === 'repertorium' && repertoriumStickyEnabled ? ' repertorium-sticky-layout' : ''}${customViewStickyEnabled ? ' custom-view-sticky-layout' : ''}`}>
            <div className={orderBookView === 'repertorium' && repertoriumStickyEnabled ? 'repertorium-scroll-part' : customViewStickyEnabled ? 'custom-scroll-part' : undefined} style={(orderBookView === 'repertorium' && repertoriumStickyEnabled) || customViewStickyEnabled ? { flex: 1, minWidth: 0 } : undefined}>
            {!(orderBookView === 'repertorium' && repertoriumStickyEnabled) && !customViewStickyEnabled && (
            <div ref={tableScrollTopRef} className="table-scroll-top" style={{ overflowX: 'auto', overflowY: 'hidden', height: 14, marginBottom: 0 }} aria-hidden>
              <div style={{ height: 1, minWidth: Math.max(tableScrollWidth, 100) }} />
            </div>
            )}
            <div ref={tableWrapRef} className="card table-wrap">
            <table className={`${orderBookView === 'repertorium' ? 'repertorium-sections' : customViewStickyEnabled ? 'custom-view-sections' : ''}${hasAnyColumnWidths ? ' orderbook-fixed-cols' : ''}`.trim()}>
              {orderBookView === 'repertorium' && hasAnyRepertoriumColumnWidths && (
                <colgroup>
                  <col style={{ width: 36, minWidth: 36 }} />
                  {visibleRepertoriumColumns.map((col) => {
                    const w = getColumnWidth('rep_' + col.key)
                    return <col key={col.key} style={{ width: w ?? 90, minWidth: w ?? 90 }} />
                  })}
                  {!repertoriumStickyEnabled && <col style={{ width: 80, minWidth: 80 }} />}
                </colgroup>
              )}
              <thead>
                {orderBookView === 'repertorium' && allRepertoriumColumnsVisible && (
                  <tr className="repertorium-section-row">
                    <th
                      className={repertoriumStickyEnabled ? 'repertorium-sticky-left-0' : undefined}
                      style={repertoriumStickyEnabled ? { width: 36, left: repertoriumStickyLefts.c0 } : { width: 36 }}
                    ></th>
                    {repertoriumSectionSpans.header > 0 && (
                      <th
                        className={repertoriumStickyEnabled ? 'repertorium-sticky-left-header' : undefined}
                        colSpan={repertoriumSectionSpans.header}
                        style={{
                          ...(repertoriumStickyEnabled ? { left: repertoriumStickyLefts.c1 } : {}),
                          borderLeft: '2px solid var(--color-border, #3f3f46)',
                          background: 'var(--color-surface-elevated, #27272a)'
                        }}
                      ></th>
                    )}
                    {repertoriumSectionSpans.written > 0 && <th colSpan={repertoriumSectionSpans.written} style={{ borderLeft: '2px solid var(--color-border, #3f3f46)', background: 'var(--color-surface-elevated, #27272a)', padding: '6px 10px', fontWeight: 600 }}>{t('orderBook.repertoriumSectionWritten')}</th>}
                    {repertoriumSectionSpans.oral > 0 && <th colSpan={repertoriumSectionSpans.oral} style={{ borderLeft: '2px solid var(--color-border, #3f3f46)', background: 'var(--color-surface-elevated, #27272a)', padding: '6px 10px', fontWeight: 600 }}>{t('orderBook.repertoriumSectionOral')}</th>}
                    {repertoriumSectionSpans.fees > 0 && <th colSpan={repertoriumSectionSpans.fees} style={{ borderLeft: '2px solid var(--color-border, #3f3f46)', background: 'var(--color-surface-elevated, #27272a)', padding: '6px 10px', fontWeight: 600 }}>{t('orderBook.repertoriumSectionFees')}</th>}
                    {repertoriumSectionSpans.refusal > 0 && <th colSpan={repertoriumSectionSpans.refusal} style={{ borderLeft: '2px solid var(--color-border, #3f3f46)', background: 'var(--color-surface-elevated, #27272a)', padding: '6px 10px', fontWeight: 600 }}>{t('orderBook.repertoriumSectionRefusal')}</th>}
                    {repertoriumSectionSpans.status > 0 && <th colSpan={repertoriumSectionSpans.status} style={{ borderLeft: '2px solid var(--color-border, #3f3f46)', background: 'var(--color-surface-elevated, #27272a)', padding: '6px 10px', fontWeight: 600 }}>{t('orderBook.repertoriumSectionStatus')}</th>}
                    {!repertoriumStickyEnabled && <th style={{ minWidth: 80, borderLeft: '2px solid var(--color-border, #3f3f46)' }}>{t('common.actions')}</th>}
                  </tr>
                )}
                <tr>
                  {orderBookView === 'repertorium' ? (
                    <>
                      <th
                        className={repertoriumStickyEnabled ? 'repertorium-sticky-left-0' : undefined}
                        title={t('orderBook.selectForInvoice')}
                        style={repertoriumStickyEnabled ? { width: 36, left: repertoriumStickyLefts.c0 } : { width: 36 }}
                      ></th>
                      {visibleRepertoriumColumns.map((col) => {
                        const stickyIdx = repertoriumStickyEnabled ? REPERTORIUM_STICKY_LEFT_KEYS.indexOf(col.key as typeof REPERTORIUM_STICKY_LEFT_KEYS[number]) : -1
                        const stickyClass = stickyIdx >= 0 ? `repertorium-sticky-left-${stickyIdx + 1}` : undefined
                        const sepBeforeOral = col.key === 'oral_date' ? ' repertorium-sep-before-oral' : ''
                        const sepBeforeFees = col.key === 'amount_net' ? ' repertorium-sep-before-fees' : ''
                        const sepBeforeRefusal = col.key === 'refusal_date' ? ' repertorium-sep-before-refusal' : ''
                        const sepBeforeStatus = col.key === 'order_status' ? ' repertorium-sep-before-status' : ''
                        const stickyLeft = stickyIdx === 0 ? repertoriumStickyLefts.c1 : stickyIdx === 1 ? repertoriumStickyLefts.c2 : stickyIdx === 2 ? repertoriumStickyLefts.c3 : undefined
                        const savedW = getColumnWidth('rep_' + col.key)
                        const defaultStyle = stickyIdx === 0 || stickyIdx === 1 ? { minWidth: 100 } : stickyIdx === 2 ? { minWidth: 220 } : undefined
                        let style: React.CSSProperties = savedW != null ? { minWidth: savedW, width: savedW } : (defaultStyle ?? {})
                        if (stickyLeft != null) style = { ...style, left: stickyLeft }
                        return (
                          <th key={col.key} className={`${stickyClass ?? ''}${sepBeforeOral}${sepBeforeFees}${sepBeforeRefusal}${sepBeforeStatus}`.trim() || undefined} style={style}>
                            <span className="th-inner">{t(col.labelKey)}</span>
                            <div className="col-resize-handle" onMouseDown={handleColResizeStart('rep_' + col.key)} role="separator" aria-orientation="vertical" />
                          </th>
                        )
                      })}
                      {!repertoriumStickyEnabled && <th style={{ minWidth: 80, borderLeft: '2px solid var(--color-border, #3f3f46)' }}>{t('common.actions')}</th>}
                    </>
                  ) : (
                    <>
                      <th className={customViewStickyEnabled ? 'custom-sticky-left-0' : undefined} title={t('orderBook.selectForInvoice')} style={{ width: 36 }}></th>
                      {DEFAULT_COLUMNS_FOR_CUSTOM_VIEW.filter(c => !hiddenDefaultColumns.includes(c.key)).map(col => {
                        const savedW = getColumnWidth('custom_' + col.key)
                        const defaultStyle = customViewStickyEnabled && col.key === 'order_number' ? { minWidth: 100 } : undefined
                        const style = savedW != null ? { minWidth: savedW, width: savedW } : defaultStyle
                        return (
                          <th key={col.key} className={customViewStickyEnabled && col.key === 'order_number' ? 'custom-sticky-left-1' : undefined} style={style}>
                            <span className="th-inner">{t(col.labelKey)}</span>
                            <div className="col-resize-handle" onMouseDown={handleColResizeStart('custom_' + col.key)} role="separator" aria-orientation="vertical" />
                          </th>
                        )
                      })}
                      {orderBookView === 'custom' && customColumns.filter(col => !hiddenDefaultColumns.includes(`custom_${col.id}`)).map(col => {
                        const key = 'custom_col_' + col.id
                        const savedW = getColumnWidth(key)
                        const style = savedW != null ? { minWidth: savedW, width: savedW } : undefined
                        return (
                          <th key={`cc-h-${col.id}`} style={style}>
                            <span className="th-inner">{col.name}</span>
                            <div className="col-resize-handle" onMouseDown={handleColResizeStart(key)} role="separator" aria-orientation="vertical" />
                          </th>
                        )
                      })}
                      {!customViewStickyEnabled && <th style={{ minWidth: 80 }}>{t('common.actions')}</th>}
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {(orderBookView === 'repertorium' ? repertoriumDisplayList : filteredAndSortedOrders).map((o, idx) => {
                  const isInProgress = o.order_status === 'in_progress'
                  const now = new Date()
                  const deadline = o.deadline_at ? new Date(o.deadline_at) : null
                  const isOverdue = !!deadline && deadline < now && (o.order_status === 'to_do' || o.order_status === 'in_progress')
                  const rowClass = [isInProgress && 'order-row-in-progress', isOverdue && 'order-row-overdue'].filter(Boolean).join(' ')
                  const net = o.amount ?? 0
                  const vatRateOrder = getVatRateForOrder(o)
                  const vat = (net * vatRateOrder) / 100
                  const gross = net + vat
                  void (orderBookView === 'repertorium' && 'repertoriumLp' in o ? (o as OrderRow & { repertoriumLp: number }).repertoriumLp : idx + 1)
                  void (orderBookView === 'repertorium' && (o as OrderRow).repertorium_description ? (o as OrderRow).repertorium_description : [o.name, o.specialization_name ?? o.specialization, o.language_pair_label].filter(Boolean).join(' · ') || '—')
                  return (
                  <tr key={o.id} className={rowClass || undefined}>
                    {orderBookView === 'repertorium' ? (
                      <>
                        <td className={repertoriumStickyEnabled ? 'repertorium-sticky-left-0' : undefined} style={repertoriumStickyEnabled ? { left: repertoriumStickyLefts.c0 } : undefined}>
                          <input
                            type="checkbox"
                            checked={selectedOrderIds.includes(o.id)}
                            onChange={() => setSelectedOrderIds(prev => prev.includes(o.id) ? prev.filter(id => id !== o.id) : [...prev, o.id])}
                            title={o.invoice_status === 'to_issue' ? t('orderBook.selectForInvoice') : t('common.select')}
                          />
                        </td>
                        {visibleRepertoriumColumns.map(col => {
                          const stickyIdx = repertoriumStickyEnabled ? REPERTORIUM_STICKY_LEFT_KEYS.indexOf(col.key as typeof REPERTORIUM_STICKY_LEFT_KEYS[number]) : -1
                          const stickyClass = stickyIdx >= 0 ? `repertorium-sticky-left-${stickyIdx + 1}` : undefined
                          const stickyLeft = stickyIdx === 0 ? repertoriumStickyLefts.c1 : stickyIdx === 1 ? repertoriumStickyLefts.c2 : stickyIdx === 2 ? repertoriumStickyLefts.c3 : undefined
                          const sepBeforeOral = col.key === 'oral_date' ? ' repertorium-sep-before-oral' : ''
                          const sepBeforeFees = col.key === 'amount_net' ? ' repertorium-sep-before-fees' : ''
                          const sepBeforeRefusal = col.key === 'refusal_date' ? ' repertorium-sep-before-refusal' : ''
                          const sepBeforeStatus = col.key === 'order_status' ? ' repertorium-sep-before-status' : ''
                          return (
                            <td
                              key={col.key}
                              className={`${stickyClass ?? ''}${sepBeforeOral}${sepBeforeFees}${sepBeforeRefusal}${sepBeforeStatus}`.trim() || undefined}
                              style={stickyLeft != null ? { left: stickyLeft } : undefined}
                            >
                              {renderRepertoriumCell(col.key, o as OrderRow & { repertoriumLp?: number })}
                            </td>
                          )
                        })}
                        {!repertoriumStickyEnabled && (
                        <td>
                          <div className="actions-dropdown-wrap">
                            <button type="button" className="actions-dots-trigger" onClick={(e) => { e.stopPropagation(); ordersActionsTriggerRef.current = e.currentTarget; setOrdersActionsOpenId(prev => prev === o.id ? null : o.id) }} aria-expanded={ordersActionsOpenId === o.id} title={t('common.actions')}><span className="actions-dots" aria-hidden>⋯</span></button>
                            {ordersActionsOpenId === o.id && (
                              <div ref={ordersActionsDropdownRef} className="actions-dropdown" onClick={e => e.stopPropagation()}>
                                {o.invoice_status === 'to_issue' && <button type="button" className="primary" onClick={() => { openIssueModal(o.id); setOrdersActionsOpenId(null) }}>{t('orderBook.issueInvoice')}</button>}
                                <button type="button" onClick={() => { setSearchParams({ edit: String(o.id) }); setOrdersActionsOpenId(null) }}>{t('common.edit')}</button>
                                <button type="button" onClick={() => { duplicateOrder(o.id); setOrdersActionsOpenId(null) }}>{t('orders.duplicateOrder')}</button>
                                <button type="button" className="danger" onClick={() => { deleteOrder(o.id); setOrdersActionsOpenId(null) }}>{t('common.delete')}</button>
                              </div>
                            )}
                          </div>
                        </td>
                        )}
                      </>
                    ) : (
                        <>
                        <td className={customViewStickyEnabled ? 'custom-sticky-left-0' : undefined}>
                          <input
                            type="checkbox"
                            checked={selectedOrderIds.includes(o.id)}
                            onChange={() => setSelectedOrderIds(prev => prev.includes(o.id) ? prev.filter(id => id !== o.id) : [...prev, o.id])}
                            title={o.invoice_status === 'to_issue' ? t('orderBook.selectForInvoice') : t('common.select')}
                          />
                        </td>
                        {DEFAULT_COLUMNS_FOR_CUSTOM_VIEW.filter(c => !hiddenDefaultColumns.includes(c.key)).map(col => {
                          const k = col.key
                          const stickyClass = customViewStickyEnabled && k === 'order_number' ? 'custom-sticky-left-1' : undefined
                          if (k === 'order_number') return <td key={k} className={stickyClass}><button type="button" className="link-like" onClick={() => setSearchParams({ edit: String(o.id) })} title={t('common.edit')}>{o.order_number ?? o.id}</button></td>
                          if (k === 'name') return <td key={k}>{o.name ?? '—'}</td>
                          if (k === 'received_at') return <td key={k}>{formatDate(o.received_at)}</td>
                          if (k === 'client') return <td key={k}>{o.client_short_name}</td>
                          if (k === 'subcontracts') return <td key={k} style={{ whiteSpace: 'pre-wrap', maxWidth: 200 }}>{(allSubcontractsByOrderId.get(o.id) ?? []).length === 0 ? '—' : (allSubcontractsByOrderId.get(o.id) ?? []).map(s => s.name?.trim() || s.subcontract_number).join(', ')}</td>
                          if (k === 'deadline') return <td key={k}>{formatDateTime(o.deadline_at)}</td>
                          if (k === 'completed_at') return <td key={k}>{formatDate(o.completed_at)}</td>
                          if (k === 'specialization') return <td key={k}>{o.specialization_name ?? o.specialization ?? '—'}</td>
                          if (k === 'language_pair') return <td key={k}>{o.language_pair_label || '—'}</td>
                          if (k === 'unit') return <td key={k}>{o.unit_name}</td>
                          if (k === 'quantity') return <td key={k}>{o.quantity}</td>
                          if (k === 'amount_net') return <td key={k}>{formatMoney(net)}</td>
                          if (k === 'amount_vat') return <td key={k}>{formatMoney(vat)}</td>
                          if (k === 'amount_gross') return <td key={k}>{formatMoney(gross)}</td>
                          if (k === 'order_status') return <td key={k}>{isOverdue && <span className="overdue-exclamation" title={t('orderBook.overdueWarning')}>⚠</span>}<span className={`badge ${o.order_status}`}>{t(`orders.orderStatus_${o.order_status}`)}</span></td>
                          if (k === 'invoice_status') return <td key={k}><span className={`badge ${o.invoice_status}`}>{t(`orders.invoiceStatus_${o.invoice_status}`)}</span></td>
                          if (k === 'payment_due') return <td key={k}>{formatDate(o.payment_due_at)}</td>
                          return <td key={k}>—</td>
                        })}
                        {orderBookView === 'custom' && customColumns.filter(col => !hiddenDefaultColumns.includes(`custom_${col.id}`)).map(col => {
                          const val = allCustomValues[o.id]?.[col.id] ?? ''
                          return <td key={`cc-${o.id}-${col.id}`}>{col.col_type === 'date' ? formatDate(val || null) : val || '—'}</td>
                        })}
                        {!customViewStickyEnabled && (
                        <td>
                          <div className="actions-dropdown-wrap">
                            <button type="button" className="actions-dots-trigger" onClick={(e) => { e.stopPropagation(); ordersActionsTriggerRef.current = e.currentTarget; setOrdersActionsOpenId(prev => prev === o.id ? null : o.id) }} aria-expanded={ordersActionsOpenId === o.id} title={t('common.actions')}><span className="actions-dots" aria-hidden>⋯</span></button>
                            {ordersActionsOpenId === o.id && (
                              <div ref={ordersActionsDropdownRef} className="actions-dropdown" onClick={e => e.stopPropagation()}>
                                {o.invoice_status === 'to_issue' && <button type="button" className="primary" onClick={() => { openIssueModal(o.id); setOrdersActionsOpenId(null) }}>{t('orderBook.issueInvoice')}</button>}
                                <button type="button" onClick={() => { setSearchParams({ edit: String(o.id) }); setOrdersActionsOpenId(null) }}>{t('common.edit')}</button>
                                <button type="button" onClick={() => { duplicateOrder(o.id); setOrdersActionsOpenId(null) }}>{t('orders.duplicateOrder')}</button>
                                <button type="button" className="danger" onClick={() => { deleteOrder(o.id); setOrdersActionsOpenId(null) }}>{t('common.delete')}</button>
                              </div>
                            )}
                          </div>
                        </td>
                        )}
                      </>
                    )}
                  </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
            {(orderBookView === 'repertorium' && repertoriumStickyEnabled) || customViewStickyEnabled ? (
            <div ref={tableScrollTopRef} className="table-scroll-bottom" style={{ overflowX: 'auto', overflowY: 'hidden', height: 14, marginTop: 0, marginBottom: 0 }} aria-hidden>
              <div style={{ height: 1, minWidth: Math.max(tableScrollWidth, 100) }} />
            </div>
            ) : null}
            </div>
            {orderBookView === 'repertorium' && repertoriumStickyEnabled && (
              <div className="repertorium-actions-col card">
                <table ref={repertoriumActionsTableRef}>
                  <thead>
                    <tr className="repertorium-section-row"><th></th></tr>
                    <tr><th>{t('common.actions')}</th></tr>
                  </thead>
                  <tbody>
                    {repertoriumDisplayList.map((o) => {
                      const isInProgress = o.order_status === 'in_progress'
                      const deadline = o.deadline_at ? new Date(o.deadline_at) : null
                      const isOverdue = !!deadline && deadline < new Date() && (o.order_status === 'to_do' || o.order_status === 'in_progress')
                      const rowClass = [isInProgress && 'order-row-in-progress', isOverdue && 'order-row-overdue'].filter(Boolean).join(' ')
                      return (
                        <tr key={o.id} className={rowClass || undefined}>
                          <td className="repertorium-actions-cell">
                            <div className="repertorium-actions-dropdown-wrap">
                              <button
                                type="button"
                                className="repertorium-actions-trigger actions-dots-trigger"
                                onClick={(e) => { e.stopPropagation(); repertoriumActionsTriggerRef.current = e.currentTarget; setRepertoriumActionsOpenId(prev => prev === o.id ? null : o.id) }}
                                aria-expanded={repertoriumActionsOpenId === o.id}
                                title={t('common.actions')}
                              >
                                <span className="actions-dots" aria-hidden>⋯</span>
                              </button>
                              {repertoriumActionsOpenId === o.id && (
                                <div ref={repertoriumActionsDropdownRef} className="repertorium-actions-dropdown" onClick={e => e.stopPropagation()}>
                                  {o.invoice_status === 'to_issue' && (
                                    <button type="button" className="primary" onClick={() => { openIssueModal(o.id); setRepertoriumActionsOpenId(null) }}>{t('orderBook.issueInvoice')}</button>
                                  )}
                                  <button type="button" onClick={() => { setSearchParams({ edit: String(o.id) }); setRepertoriumActionsOpenId(null) }}>{t('common.edit')}</button>
                                  <button type="button" onClick={() => { duplicateOrder(o.id); setRepertoriumActionsOpenId(null) }}>{t('orders.duplicateOrder')}</button>
                                  <button type="button" className="danger" onClick={() => { deleteOrder(o.id); setRepertoriumActionsOpenId(null) }}>{t('common.delete')}</button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {customViewStickyEnabled && (
              <div className="custom-actions-col card">
                <table ref={customActionsTableRef}>
                  <thead>
                    <tr><th>{t('common.actions')}</th></tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedOrders.map((o) => {
                      const isInProgress = o.order_status === 'in_progress'
                      const deadline = o.deadline_at ? new Date(o.deadline_at) : null
                      const isOverdue = !!deadline && deadline < new Date() && (o.order_status === 'to_do' || o.order_status === 'in_progress')
                      const rowClass = [isInProgress && 'order-row-in-progress', isOverdue && 'order-row-overdue'].filter(Boolean).join(' ')
                      return (
                        <tr key={o.id} className={rowClass || undefined}>
                          <td className="custom-actions-cell">
                            <div className="custom-actions-dropdown-wrap actions-dropdown-wrap">
                              <button
                                type="button"
                                className="custom-actions-trigger actions-dots-trigger"
                                onClick={(e) => { e.stopPropagation(); ordersActionsTriggerRef.current = e.currentTarget; setOrdersActionsOpenId(prev => prev === o.id ? null : o.id) }}
                                aria-expanded={ordersActionsOpenId === o.id}
                                title={t('common.actions')}
                              >
                                <span className="actions-dots" aria-hidden>⋯</span>
                              </button>
                              {ordersActionsOpenId === o.id && (
                                <div ref={ordersActionsDropdownRef} className="actions-dropdown custom-actions-dropdown" onClick={e => e.stopPropagation()}>
                                  {o.invoice_status === 'to_issue' && <button type="button" className="primary" onClick={() => { openIssueModal(o.id); setOrdersActionsOpenId(null) }}>{t('orderBook.issueInvoice')}</button>}
                                  <button type="button" onClick={() => { setSearchParams({ edit: String(o.id) }); setOrdersActionsOpenId(null) }}>{t('common.edit')}</button>
                                  <button type="button" onClick={() => { duplicateOrder(o.id); setOrdersActionsOpenId(null) }}>{t('orders.duplicateOrder')}</button>
                                  <button type="button" className="danger" onClick={() => { deleteOrder(o.id); setOrdersActionsOpenId(null) }}>{t('common.delete')}</button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
      {issueModal && (
        <div className="card" style={{ position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 100, minWidth: 360, maxWidth: 480 }}>
          <h3 style={{ marginTop: 0 }}>
            {t('orderBook.issueInvoice')}
            {'orderIds' in issueModal && issueModal.orderIds.length > 1 ? ` (${issueModal.orderIds.length} ${t('orders.title').toLowerCase()})` : ''}
          </h3>
          {issueInvoiceProvider === 'wfirma' && (
            <>
              <p style={{ fontSize: '0.8rem', color: '#71717a', marginBottom: 8 }}>{t('orderBook.issueInvoiceWfirmaHint')}</p>
              <p style={{ fontSize: '0.8rem', color: '#71717a', marginBottom: 12 }}>{t('orderBook.issueInvoiceWfirmaTemplateHint')}</p>
            </>
          )}
          {issueInvoiceProvider !== 'wfirma' && (
            <div className="form-group">
              <label>{t('orders.invoiceNumber')}</label>
              <input value={issueNumber} onChange={e => setIssueNumber(e.target.value)} placeholder="e.g. FV/2025/01" style={{ width: '100%' }} />
            </div>
          )}
          <div className="form-group">
            <label>{t('orders.invoiceDate')}</label>
            <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div className="form-group">
            <label>{t('orders.saleDate')}</label>
            <input type="date" value={issueSaleDate} onChange={e => setIssueSaleDate(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div className="form-group">
            <label>{t('orders.paymentDue')}</label>
            <input type="date" value={issuePaymentDue} onChange={e => setIssuePaymentDue(e.target.value)} style={{ width: '100%' }} placeholder={t('orderBook.paymentDueHint')} />
          </div>
          {issueInvoiceProvider !== 'wfirma' && issueBankAccounts.length > 0 && (
            <div className="form-group">
              <label>{t('invoices.bankAccount')}</label>
              <select value={issueBankAccountId || ''} onChange={e => setIssueBankAccountId(e.target.value ? Number(e.target.value) : 0)} style={{ width: '100%' }}>
                <option value="">— {t('invoices.noBankAccount')} —</option>
                {issueBankAccounts.map((ba: { id: number; bank_name: string; account_number: string; currency: string }) => (
                  <option key={ba.id} value={ba.id}>{ba.bank_name ? `${ba.bank_name} (${ba.currency})` : `${ba.account_number.slice(0, 20)}… (${ba.currency})`}</option>
                ))}
              </select>
            </div>
          )}
          {issueInvoiceProvider === 'wfirma' && (
            <div className="form-group">
              <label>{t('settings.wfirmaCompanyAccount')}</label>
              <select value={issueWfirmaCompanyAccountId || ''} onChange={e => setIssueWfirmaCompanyAccountId(e.target.value ? Number(e.target.value) : 0)} style={{ width: '100%' }}>
                <option value="">{t('settings.wfirmaCompanyAccountAuto')}</option>
                {issueWfirmaCompanyAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name ? `${acc.name} — ` : ''}{acc.bank_name ? `${acc.bank_name}: ` : ''}{acc.account_number}{acc.currency ? ` (${acc.currency})` : ''}
                  </option>
                ))}
              </select>
              {issueWfirmaAccountsLoading && <p style={{ fontSize: '0.8rem', color: '#71717a', marginTop: 6 }}>{t('settings.wfirmaAccountsLoading')}</p>}
              {issueWfirmaAccountsMessage && <p style={{ fontSize: '0.8rem', color: '#a16207', marginTop: 6 }}>{issueWfirmaAccountsMessage}</p>}
            </div>
          )}
          <div className="form-group">
            <label>{t('settings.invoiceNotesSelect')}</label>
            {issueNoteTemplates.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                {issueNoteTemplates.map((text, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={issueNoteSelected[i] ?? false}
                      onChange={e => setIssueNoteSelected(prev => { const n = [...prev]; n[i] = e.target.checked; return n })}
                    />
                    <span style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>{text || `(${t('settings.invoiceNotesPlaceholder')})`}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.8rem', color: '#71717a', marginBottom: 8 }}>{t('settings.invoiceNotesListHint')}</p>
            )}
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>{t('settings.invoiceNotesExtra')}</label>
            <textarea value={issueNotesExtra} onChange={e => setIssueNotesExtra(e.target.value)} rows={2} style={{ width: '100%', resize: 'vertical' }} placeholder={t('settings.invoiceNotesPlaceholder')} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="primary" onClick={submitIssueInvoice} disabled={issueInvoiceProvider !== 'wfirma' && !issueNumber.trim()}>{t('common.save')}</button>
            <button type="button" onClick={() => setIssueModal(null)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
      {!loading && orders.length === 0 && !showForm && <p>{t('orders.noOrders')}</p>}
    </div>
  )
}
