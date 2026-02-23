import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { formatNumber } from '../utils/numberLocale'

type CategoryTotal = { categoryId: number | null; categoryName: string; baseUnitName: string; totalInBaseUnit: number; byUnit: { id: number; name: string; multiplier_to_base: number; order_count: number; total: number }[] }
type TotalsResult = { byCurrency: { currency: string; byCategory: CategoryTotal[] }[] }
type PaymentSummary = {
  byCurrency: {
    currency: string
    byStatus: { invoice_status: string; count: number; total: number }[]
    overdue: { count: number; total: number }
  }[]
}

type OrderRow = {
  id: number
  order_number?: string | null
  service_name?: string | null
  client_id: number
  client_short_name: string
  received_at: string
  deadline_at?: string | null
  completed_at?: string | null
  amount: number
  quantity?: number | null
  rate_per_unit?: number | null
  order_status: string
  rate_currency?: string | null
  language_pair_label: string | null
  specialization_name: string | null
  payment_due_at: string | null
  order_vat_rate?: number | null
  order_vat_code?: string | null
  unit_name?: string
  invoice_status?: string
  translation_type?: 'oral' | 'written' | null
  oral_net?: number | null
  oral_gross?: number | null
  document_author?: string | null
  document_name?: string | null
  document_date?: string | null
  document_number?: string | null
  document_form_remarks?: string | null
  repertorium_activity_type?: string | null
  repertorium_notes?: string | null
  oral_date?: string | null
  oral_place?: string | null
  oral_lang?: string | null
  oral_duration?: number | null
  oral_scope?: string | null
  oral_rate?: number | null
  oral_notes?: string | null
  refusal_date?: string | null
  refusal_organ?: string | null
  refusal_reason?: string | null
}

type EarningsRowGroup = string

const EARNINGS_VALUE_TYPE = ['net', 'vat', 'gross', 'quantity'] as const
type EarningsValueType = (typeof EARNINGS_VALUE_TYPE)[number]

const EARNINGS_AGG = ['sum', 'avg', 'max'] as const
type EarningsAgg = (typeof EARNINGS_AGG)[number]
type EarningsFilterRow = { id: string; field: string; value: string }
type EarningsGroupOption = { value: string; labelKey: string }

const EARNINGS_SIMPLIFIED_GROUPS: EarningsGroupOption[] = [
  { value: 'order_number', labelKey: 'orders.orderNumber' },
  { value: 'received_at', labelKey: 'orders.receivedAt' },
  { value: 'client', labelKey: 'orders.client' },
  { value: 'deadline_at', labelKey: 'orders.deadline' },
  { value: 'completed_at', labelKey: 'orders.completedAt' },
  { value: 'service', labelKey: 'orders.service' },
  { value: 'specialization', labelKey: 'orders.specialization' },
  { value: 'language_pair', labelKey: 'orders.languagePair' },
  { value: 'unit', labelKey: 'orders.unit' },
  { value: 'quantity', labelKey: 'orders.quantity' },
  { value: 'rate_per_unit', labelKey: 'orders.ratePerUnit' },
  { value: 'amount', labelKey: 'orderBook.amountNet' },
  { value: 'amount_gross', labelKey: 'orderBook.amountGross' },
  { value: 'order_status', labelKey: 'orders.orderStatus' },
  { value: 'invoice_status', labelKey: 'orders.invoiceStatus' },
  { value: 'payment_due_at', labelKey: 'orders.paymentDue' }
]
const EARNINGS_REPERTORIUM_GROUPS: EarningsGroupOption[] = [
  { value: 'order_number', labelKey: 'orderBook.repertoriumNrRep' },
  { value: 'received_at', labelKey: 'orderBook.repertoriumOrderDate' },
  { value: 'client', labelKey: 'orderBook.repertoriumClientNameAddress' },
  { value: 'unit', labelKey: 'orders.unit' },
  { value: 'language_pair', labelKey: 'orders.languagePair' },
  { value: 'document_author', labelKey: 'orderBook.repertoriumDocumentAuthor' },
  { value: 'document_name', labelKey: 'orderBook.repertoriumDocumentName' },
  { value: 'document_date', labelKey: 'orderBook.repertoriumDocumentDate' },
  { value: 'document_number', labelKey: 'orderBook.repertoriumDocumentNumber' },
  { value: 'document_form_remarks', labelKey: 'orderBook.repertoriumDocumentFormRemarks' },
  { value: 'repertorium_activity_type', labelKey: 'orderBook.repertoriumActivityType' },
  { value: 'quantity', labelKey: 'orderBook.repertoriumPagesCount' },
  { value: 'rate_per_unit', labelKey: 'orderBook.repertoriumRatePerPage' },
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
const EMPTY_EARNINGS_FILTERS: EarningsFilterRow[] = []

function getYear(d: string | null) { return d ? d.slice(0, 4) : '' }
function getMonthKey(d: string | null) { return d ? d.slice(0, 7) : '' }

function formatMoney(n: number) {
  return formatNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatMoneyByCurrency(n: number, currency: string) {
  return `${formatMoney(n)} ${currency}`
}

function formatReportValue(valueType: EarningsValueType, n: number, currency: string) {
  return valueType === 'quantity' ? formatNumber(n) : formatMoneyByCurrency(n, currency)
}


/** Dla analityki: netto/VAT/brutto — pisemne z amount, ustne z oral_net/oral_gross (wynagrodzenie = pobrane). */
function orderEarnings(o: OrderRow, vatPct: number): { net: number; vat: number; gross: number } {
  const isOral = o.translation_type === 'oral' && (o.oral_net != null || o.oral_gross != null)
  if (isOral) {
    const net = Number(o.oral_net) || 0
    const gross = Number(o.oral_gross) || 0
    const vat = Math.round((gross - net) * 100) / 100
    return { net, vat, gross }
  }
  const net = Number(o.amount) || 0
  const hasExemption = o.order_vat_code != null && String(o.order_vat_code).trim() !== ''
  const orderVatRate = Number(o.order_vat_rate)
  const rowVatPct = hasExemption ? 0 : (Number.isFinite(orderVatRate) ? orderVatRate / 100 : vatPct)
  const vat = Math.round(net * rowVatPct * 100) / 100
  const gross = net + vat
  return { net, vat, gross }
}

/** Ilość do raportu: dla ustnych używaj czasu trwania, dla pisemnych ilości. */
function orderQuantity(o: OrderRow): number {
  if (o.translation_type === 'oral' && o.oral_duration != null) return Number(o.oral_duration) || 0
  return Number(o.quantity) || 0
}

function orderCurrency(o: OrderRow): string {
  const c = String((o as { rate_currency?: string | null }).rate_currency ?? '').trim().toUpperCase()
  return c || 'PLN'
}

export default function Analytics() {
  const { t } = useTranslation()
  const [totals, setTotals] = useState<TotalsResult | null>(null)
  const [payments, setPayments] = useState<PaymentSummary | null>(null)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [, setClients] = useState<{ id: number; short_name: string }[]>([])
  const [books, setBooks] = useState<{ id: number; name: string; view_type?: string }[]>([])
  const [analyticsBookId, setAnalyticsBookId] = useState<string>('')
  const [analyticsCurrencyFilter, setAnalyticsCurrencyFilter] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [vatRate, setVatRate] = useState(23)

  // Earnings report (raport zarobków) – wiele poziomów wierszy (zagnieżdżenie jak w tabeli przestawnej)
  const [earningsDateBasis, setEarningsDateBasis] = useState<'received_at' | 'payment_due_at'>('received_at')
  const [earningsValueType, setEarningsValueType] = useState<EarningsValueType>('net')
  const [earningsAgg, setEarningsAgg] = useState<EarningsAgg>('sum')
  const [earningsRowGroupsByBook, setEarningsRowGroupsByBook] = useState<Record<string, EarningsRowGroup[]>>({})
  const [earningsStackedChart, setEarningsStackedChart] = useState(false)
  const [earningsFiltersByBook, setEarningsFiltersByBook] = useState<Record<string, EarningsFilterRow[]>>({})

  const earningsBookKey = analyticsBookId || '__all__'
  const earningsFilters = earningsFiltersByBook[earningsBookKey] ?? EMPTY_EARNINGS_FILTERS
  const earningsRowGroups = earningsRowGroupsByBook[earningsBookKey] ?? ['client']

  const setEarningsFilters = (updater: EarningsFilterRow[] | ((prev: EarningsFilterRow[]) => EarningsFilterRow[])) => {
    setEarningsFiltersByBook(prev => {
      const current = prev[earningsBookKey] ?? EMPTY_EARNINGS_FILTERS
      const next = typeof updater === 'function' ? updater(current) : updater
      return { ...prev, [earningsBookKey]: next }
    })
  }
  const setEarningsRowGroups = (updater: EarningsRowGroup[] | ((prev: EarningsRowGroup[]) => EarningsRowGroup[])) => {
    setEarningsRowGroupsByBook(prev => {
      const current = prev[earningsBookKey] ?? ['client']
      const next = typeof updater === 'function' ? updater(current) : updater
      return { ...prev, [earningsBookKey]: next }
    })
  }

  useEffect(() => {
    if (!window.api) return
    const bookId = analyticsBookId ? parseInt(analyticsBookId, 10) : undefined
    Promise.all([
      window.api.orderBooks?.list?.() ?? Promise.resolve([]),
      window.api.analytics.totals(bookId),
      window.api.analytics.paymentSummary(bookId),
      window.api.orders.list(bookId),
      window.api.clients.list(),
      window.api.settings?.get?.('vat_rate') ?? Promise.resolve(null)
    ]).then(([bList, tRes, pRes, oList, cList, vat]) => {
      setBooks((bList as { id: number; name: string; view_type?: string }[]) || [])
      const raw = tRes as TotalsResult & Record<string, unknown> & { byCategory?: CategoryTotal[] }
      const normalized: TotalsResult = Array.isArray(raw?.byCurrency)
        ? { byCurrency: raw.byCurrency }
        : { byCurrency: Array.isArray(raw?.byCategory) ? [{ currency: 'PLN', byCategory: raw.byCategory }] : [] }
      setTotals(normalized)
      const pRaw = pRes as PaymentSummary & Record<string, unknown> & {
        byStatus?: { invoice_status: string; count: number; total: number }[]
        overdue?: { count: number; total: number }
      }
      const normalizedPayments: PaymentSummary = Array.isArray(pRaw?.byCurrency)
        ? { byCurrency: pRaw.byCurrency }
        : {
            byCurrency: Array.isArray(pRaw?.byStatus)
              ? [{ currency: 'PLN', byStatus: pRaw.byStatus, overdue: pRaw.overdue ?? { count: 0, total: 0 } }]
              : []
          }
      setPayments(normalizedPayments)
      setOrders((oList as OrderRow[]).filter(o => o.order_status !== 'cancelled'))
      setClients((cList as { id: number; short_name: string }[]))
      const vatNum = parseFloat(String(vat ?? '23')) || 23
      setVatRate(vatNum)
      setLoading(false)
    })
  }, [analyticsBookId])

  const availableCurrencies = useMemo(() => {
    const set = new Set<string>()
    totals?.byCurrency?.forEach(g => set.add(g.currency))
    payments?.byCurrency?.forEach(g => set.add(g.currency))
    orders.forEach(o => set.add(orderCurrency(o)))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [totals?.byCurrency, payments?.byCurrency, orders])

  const totalsByCurrencyFiltered = useMemo(() => {
    if (!totals?.byCurrency) return []
    if (!analyticsCurrencyFilter) return totals.byCurrency
    return totals.byCurrency.filter(g => g.currency === analyticsCurrencyFilter)
  }, [totals?.byCurrency, analyticsCurrencyFilter])

  const paymentsByCurrencyFiltered = useMemo(() => {
    if (!payments?.byCurrency) return []
    if (!analyticsCurrencyFilter) return payments.byCurrency
    return payments.byCurrency.filter(g => g.currency === analyticsCurrencyFilter)
  }, [payments?.byCurrency, analyticsCurrencyFilter])

  // ——— Earnings report (raport zarobków) ———
  const earningsDateField = earningsDateBasis === 'payment_due_at' ? 'payment_due_at' : 'received_at'

  const selectedEarningsBook = useMemo(() => {
    if (!analyticsBookId) return null
    return books.find(b => String(b.id) === analyticsBookId) ?? null
  }, [books, analyticsBookId])

  const translateInvoiceStatus = (status: string | null | undefined): string => {
    const raw = String(status ?? '')
    if (!raw) return '—'
    const i18nKey = `orders.invoiceStatus_${raw}`
    const translated = t(i18nKey)
    if (translated !== i18nKey) return translated
    if (raw === 'to_invoice') return t('analytics.toInvoice')
    return raw
  }
  const translateOrderStatus = (status: string | null | undefined): string => {
    const raw = String(status ?? '')
    if (!raw) return '—'
    const i18nKey = `orders.orderStatus_${raw}`
    const translated = t(i18nKey)
    return translated !== i18nKey ? translated : raw
  }

  const currentReportGroupOptions = useMemo(() => {
    const uniq = (arr: EarningsGroupOption[]) => {
      const seen = new Set<string>()
      return arr.filter(opt => {
        if (seen.has(opt.value)) return false
        seen.add(opt.value)
        return true
      })
    }
    const attrsForView = (view?: string) => view === 'repertorium' ? EARNINGS_REPERTORIUM_GROUPS : EARNINGS_SIMPLIFIED_GROUPS
    if (selectedEarningsBook) return uniq(attrsForView(selectedEarningsBook.view_type))
    const views = Array.from(new Set(books.map(b => b.view_type || 'simplified')))
    if (views.length <= 1) return uniq(attrsForView(views[0]))
    const left = new Set(EARNINGS_SIMPLIFIED_GROUPS.map(o => o.value))
    const right = new Set(EARNINGS_REPERTORIUM_GROUPS.map(o => o.value))
    const intersection = [...left].filter(v => right.has(v))
    const attrs = EARNINGS_SIMPLIFIED_GROUPS.filter(o => intersection.includes(o.value))
    return uniq(attrs)
  }, [books, selectedEarningsBook])

  const optionLabelKeyByValue = useMemo(() => {
    const map: Record<string, string> = {}
    for (const opt of currentReportGroupOptions) map[opt.value] = opt.labelKey
    return map
  }, [currentReportGroupOptions])

  const rawGroupValue = (o: OrderRow, group: string): string => {
    const dt = String(o[earningsDateField as keyof OrderRow] ?? '')
    const { gross } = orderEarnings(o, vatRate / 100)
    switch (group) {
      case 'client': return o.client_short_name || ''
      case 'year': return getYear(dt)
      case 'month': return getMonthKey(dt)
      case 'name': return String((o as { name?: string | null }).name ?? '').trim()
      case 'order_number': return o.order_number?.trim() || String(o.id)
      case 'received_at': return o.received_at || ''
      case 'deadline_at': return o.deadline_at || ''
      case 'completed_at': return o.completed_at || ''
      case 'service': return String(o.service_name ?? (o as { name?: string | null }).name ?? '').trim()
      case 'specialization': return o.specialization_name || ''
      case 'language_pair': return o.language_pair_label || o.oral_lang || ''
      case 'unit': return o.unit_name || ''
      case 'quantity': return String(o.quantity ?? '')
      case 'rate_per_unit': return String(o.rate_per_unit ?? '')
      case 'amount': return String(o.amount ?? '')
      case 'amount_gross': return String(gross ?? '')
      case 'order_status': return o.order_status || ''
      case 'invoice_status': return o.invoice_status || ''
      case 'payment_due_at': return o.payment_due_at || ''
      case 'document_author': return o.document_author || ''
      case 'document_name': return o.document_name || ''
      case 'document_date': return o.document_date || ''
      case 'document_number': return o.document_number || ''
      case 'document_form_remarks': return o.document_form_remarks || ''
      case 'repertorium_activity_type': return o.repertorium_activity_type || ''
      case 'repertorium_notes': return o.repertorium_notes || ''
      case 'oral_date': return o.oral_date || ''
      case 'oral_place': return o.oral_place || ''
      case 'oral_lang': return o.oral_lang || ''
      case 'oral_duration': return String(o.oral_duration ?? '')
      case 'oral_scope': return o.oral_scope || ''
      case 'oral_rate': return String(o.oral_rate ?? '')
      case 'oral_net': return String(o.oral_net ?? '')
      case 'oral_gross': return String(o.oral_gross ?? '')
      case 'oral_notes': return o.oral_notes || ''
      case 'refusal_date': return o.refusal_date || ''
      case 'refusal_organ': return o.refusal_organ || ''
      case 'refusal_reason': return o.refusal_reason || ''
      default: return ''
    }
  }
  const displayGroupValue = (group: string, raw: string): string => {
    if (!raw) return '—'
    if (group === 'order_status') return translateOrderStatus(raw)
    if (group === 'invoice_status') return translateInvoiceStatus(raw)
    return raw
  }

  const availableGroupOptions = useMemo(() => currentReportGroupOptions, [currentReportGroupOptions])

  const allowedEarningsRowGroups = useMemo(() => availableGroupOptions.map(o => o.value), [availableGroupOptions])
  const earningsRowGroupLabel = (g: string): string => t(optionLabelKeyByValue[g] ?? g)
  const earningsRowGroupOptions = useMemo(
    () => availableGroupOptions.map(o => ({ value: o.value, label: t(o.labelKey) })),
    [availableGroupOptions, t]
  )
  const earningsFilterOptionsByGroup = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const opt of availableGroupOptions) {
      const set = new Set<string>()
      for (const o of orders) {
        const v = rawGroupValue(o, opt.value).trim()
        if (v) set.add(v)
      }
      out[opt.value] = Array.from(set).sort((a, b) => a.localeCompare(b))
    }
    return out
  }, [availableGroupOptions, orders, earningsDateField, vatRate])
  const earningsFilteredOrders = useMemo(() => {
    let list = orders
    if (earningsDateBasis === 'payment_due_at') list = list.filter(o => o.payment_due_at)
    for (const row of earningsFilters) {
      if (!row.field || !row.value) continue
      list = list.filter(o => rawGroupValue(o, row.field) === row.value)
    }
    if (analyticsCurrencyFilter) list = list.filter(o => orderCurrency(o) === analyticsCurrencyFilter)
    return list
  }, [orders, earningsDateBasis, earningsFilters, earningsDateField, vatRate, analyticsCurrencyFilter])

  const earningsRowKeyPart = (o: OrderRow, group: string): string => displayGroupValue(group, rawGroupValue(o, group))

  const buildPivotData = (inputOrders: OrderRow[]) => {
    if (earningsRowGroups.length === 0) return []
    const vatPct = vatRate / 100
    const sep = '\u241f'
    const groups = new Map<string, { keyParts: string[]; net: number[]; vat: number[]; gross: number[]; quantity: number[] }>()
    for (const o of inputOrders) {
      const keyParts = earningsRowGroups.map(g => earningsRowKeyPart(o, g))
      const key = keyParts.join(sep)
      const cur = groups.get(key) ?? { keyParts, net: [], vat: [], gross: [], quantity: [] }
      const { net, vat, gross } = orderEarnings(o, vatPct)
      const quantity = orderQuantity(o)
      cur.net.push(net)
      cur.vat.push(vat)
      cur.gross.push(gross)
      cur.quantity.push(quantity)
      groups.set(key, cur)
    }
    const agg = (arr: number[], type: EarningsAgg): number => {
      if (arr.length === 0) return 0
      if (type === 'sum') return Math.round(arr.reduce((a, b) => a + b, 0) * 100) / 100
      if (type === 'avg') return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100
      return Math.round(Math.max(...arr) * 100) / 100
    }
    const rows = Array.from(groups.entries()).map(([, v]) => ({
      keyParts: v.keyParts,
      name: v.keyParts.join(' → '),
      net: agg(v.net, earningsAgg),
      vat: agg(v.vat, earningsAgg),
      gross: agg(v.gross, earningsAgg),
      quantity: agg(v.quantity, earningsAgg),
      count: v.net.length
    }))
    rows.sort((a, b) => {
      for (let i = 0; i < Math.max(a.keyParts.length, b.keyParts.length); i++) {
        const pa = a.keyParts[i] ?? ''
        const pb = b.keyParts[i] ?? ''
        const c = pa.localeCompare(pb)
        if (c !== 0) return c
      }
      return 0
    })
    return rows
  }

  const earningsByCurrency = useMemo(() => {
    const byCurrency = new Map<string, OrderRow[]>()
    for (const o of earningsFilteredOrders) {
      const c = orderCurrency(o)
      if (!byCurrency.has(c)) byCurrency.set(c, [])
      byCurrency.get(c)!.push(o)
    }
    return Array.from(byCurrency.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([currency, list]) => {
        const rows = buildPivotData(list)
        const chartData = rows.map(row => ({
          ...row,
          value: earningsValueType === 'net'
            ? row.net
            : earningsValueType === 'vat'
              ? row.vat
              : earningsValueType === 'gross'
                ? row.gross
                : row.quantity
        }))
        return { currency, rows, chartData }
      })
  }, [earningsFilteredOrders, earningsValueType, earningsRowGroups, earningsAgg, vatRate])

  const earningsPivotData = useMemo(
    () => earningsByCurrency.flatMap(g => g.rows.map(r => ({ ...r, name: `[${g.currency}] ${r.name}` }))),
    [earningsByCurrency]
  )
  const earningsChartData = useMemo(
    () => earningsByCurrency.flatMap(g => g.chartData.map(r => ({ ...r, name: `[${g.currency}] ${r.name}` }))),
    [earningsByCurrency]
  )

  useEffect(() => {
    setEarningsRowGroups(prev => {
      const filtered = prev.filter(g => allowedEarningsRowGroups.includes(g))
      return filtered.length ? filtered : ['client']
    })
    setEarningsFilters(prev => prev.filter(row => allowedEarningsRowGroups.includes(row.field)))
  }, [earningsBookKey, allowedEarningsRowGroups])

  if (loading) return <div>{t('common.loading')}</div>

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>{t('analytics.title')}</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>{t('settings.orderBooks')}:</label>
          <select value={analyticsBookId} onChange={e => setAnalyticsBookId(e.target.value)} style={{ minWidth: 180 }}>
            <option value="">{t('analytics.allBooks')}</option>
            {books.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>{t('settings.currency')}:</label>
          <select value={analyticsCurrencyFilter} onChange={e => setAnalyticsCurrencyFilter(e.target.value)} style={{ minWidth: 120 }}>
            <option value="">{t('analytics.allCurrencies')}</option>
            {availableCurrencies.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{t('analytics.bookAppliesToAllSections')}</span>
      </div>

      <section className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>{t('analytics.statistics')}</h2>
        {totals && totalsByCurrencyFiltered.length > 0 ? (
          totalsByCurrencyFiltered.map((group) => (
            <div key={group.currency} style={{ marginBottom: '1.25rem' }}>
              {analyticsCurrencyFilter ? null : <h3 style={{ margin: '0 0 10px' }}>{t('settings.currency')}: {group.currency}</h3>}
              {group.byCategory.map((cat) => (
                <div key={`${group.currency}_${cat.categoryId ?? 'uncategorized'}`} style={{ marginBottom: '1.25rem' }}>
                  <p style={{ fontSize: '1.125rem' }}>
                    {t('analytics.totalInBaseUnit', { unit: cat.baseUnitName })}{cat.categoryName ? ` — ${cat.categoryName}` : ''}: <strong>{formatNumber(cat.totalInBaseUnit)}</strong>
                  </p>
                  <table style={{ maxWidth: 500 }}>
                    <thead>
                      <tr>
                        <th>{t('analytics.byUnit')}</th>
                        <th>{t('analytics.orderCount')}</th>
                        <th>{t('analytics.totalQuantity')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cat.byUnit.map((u) => (
                        <tr key={`${group.currency}_${u.id}`}>
                          <td>{u.name}</td>
                          <td>{u.order_count ?? 0}</td>
                          <td>{formatNumber(u.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ))
        ) : totals ? (
          <p style={{ fontSize: '1rem' }}>{t('analytics.noTotals')}</p>
        ) : null}
      </section>

      <section className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>{t('analytics.payments')}</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: -4, marginBottom: 8 }}>
          {t('analytics.paymentsHint')}
        </p>
        {payments && (
          <>
            {paymentsByCurrencyFiltered.map((group) => (
              <div key={group.currency} style={{ marginBottom: '1rem' }}>
                {analyticsCurrencyFilter ? null : <h3 style={{ margin: '0 0 10px' }}>{t('settings.currency')}: {group.currency}</h3>}
                {group.overdue.count > 0 && (
                  <p className="msg-error" style={{ marginBottom: '1rem', fontWeight: 600 }}>
                    {t('analytics.overdue')}: {group.overdue.count} — {formatMoneyByCurrency(group.overdue.total, group.currency)}
                  </p>
                )}
                {group.byStatus.filter(row => row.count > 0).length > 0 ? (
                  <table style={{ maxWidth: 500 }}>
                    <thead>
                      <tr>
                        <th>{t('analytics.byStatus')}</th>
                        <th>{t('analytics.count')}</th>
                        <th>{t('analytics.total')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.byStatus.filter(row => row.count > 0).map(row => (
                        <tr key={`${group.currency}_${row.invoice_status}`}>
                          <td>{t(`orders.invoiceStatus_${row.invoice_status}`)}</td>
                          <td>{row.count}</td>
                          <td>{formatMoneyByCurrency(row.total, group.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{t('analytics.noOrdersByStatus')}</p>
                )}
              </div>
            ))}
          </>
        )}
      </section>

      <section className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>{t('analytics.reports')}</h2>
          {earningsPivotData.length > 0 && window.api?.export?.earningsReportXlsx && (
            <button
              type="button"
              onClick={async () => {
                const valueCol = earningsValueType === 'net'
                  ? t('orderBook.amountNet')
                  : earningsValueType === 'vat'
                    ? t('orderBook.amountVat')
                    : earningsValueType === 'gross'
                      ? t('orderBook.amountGross')
                      : t('orders.quantity')
                const aggCol = earningsAgg === 'sum' ? t('analytics.earningsSum') : earningsAgg === 'avg' ? t('analytics.earningsAvg') : t('analytics.earningsMax')
                const multiCurrency = earningsByCurrency.length > 1
                const exportRowGroupLabelsBase = earningsRowGroups.map(g => earningsRowGroupLabel(g))
                const exportRowGroupLabels = multiCurrency ? [t('settings.currency'), ...exportRowGroupLabelsBase] : exportRowGroupLabelsBase
                const exportTableData = multiCurrency
                  ? earningsByCurrency.flatMap(group => group.rows.map(row => ({ ...row, keyParts: [group.currency, ...row.keyParts], name: `[${group.currency}] ${row.name}` })))
                  : earningsPivotData
                const exportChartData = multiCurrency
                  ? earningsByCurrency.flatMap(group => group.chartData.map(row => ({ ...row, name: `[${group.currency}] ${row.name}` })))
                  : earningsChartData
                await window.api!.export!.earningsReportXlsx({
                  tableData: exportTableData,
                  chartData: exportChartData,
                  rowGroupLabels: exportRowGroupLabels,
                  labels: {
                    rowLabel: t('analytics.earningsRowLabel'),
                    count: t('analytics.count'),
                    valueColumn: `${aggCol} (${valueCol})`,
                    sheetTable: 'Tabela',
                    sheetChart: 'Dane wykresu',
                    net: t('orderBook.amountNet'),
                    vat: t('orderBook.amountVat'),
                    gross: t('orderBook.amountGross')
                  }
                })
              }}
            >
              {t('analytics.exportReportXls')}
            </button>
          )}
        </div>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: 8, marginBottom: 12 }}>
          {t('analytics.earningsReportHint')}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: '0.875rem' }}>{t('analytics.earningsDateBasis')}</label>
            <select value={earningsDateBasis} onChange={e => setEarningsDateBasis(e.target.value as 'received_at' | 'payment_due_at')}>
              <option value="received_at">{t('analytics.earningsByOrderDate')}</option>
              <option value="payment_due_at">{t('analytics.earningsByPaymentDue')}</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('analytics.earningsRowLevels')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
              {earningsRowGroups.map((gr, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{idx + 1}.</span>
                  <select
                    value={gr}
                    onChange={e => {
                      const v = e.target.value as EarningsRowGroup
                      setEarningsRowGroups(prev => prev.map((g, i) => (i === idx ? v : g)))
                    }}
                  >
                    {earningsRowGroupOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {earningsRowGroups.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setEarningsRowGroups(prev => prev.filter((_, i) => i !== idx))}
                      title={t('common.delete')}
                      style={{ padding: '4px 8px', fontSize: '0.875rem' }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const next = allowedEarningsRowGroups.find(g => !earningsRowGroups.includes(g)) ?? allowedEarningsRowGroups[0] ?? 'client'
                  setEarningsRowGroups(prev => [...prev, next])
                }}
                style={{ padding: '6px 12px', fontSize: '0.875rem' }}
              >
                {t('analytics.earningsAddLevel')}
              </button>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: '0.875rem' }}>{t('analytics.earningsValueColumn')}</label>
            <select value={earningsValueType} onChange={e => setEarningsValueType(e.target.value as EarningsValueType)}>
              <option value="net">{t('orderBook.amountNet')}</option>
              <option value="vat">{t('orderBook.amountVat')}</option>
              <option value="gross">{t('orderBook.amountGross')}</option>
              <option value="quantity">{t('orders.quantity')}</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: '0.875rem' }}>{t('analytics.earningsAggregation')}</label>
            <select value={earningsAgg} onChange={e => setEarningsAgg(e.target.value as EarningsAgg)}>
              <option value="sum">{t('analytics.earningsSum')}</option>
              <option value="avg">{t('analytics.earningsAvg')}</option>
              <option value="max">{t('analytics.earningsMax')}</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={earningsStackedChart}
                onChange={e => setEarningsStackedChart(e.target.checked)}
                disabled={earningsValueType === 'quantity'}
              />
              <span>{t('analytics.earningsStackedChart')}</span>
            </label>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <strong style={{ fontSize: '0.875rem' }}>{t('analytics.earningsFilters')}</strong>
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            {earningsFilters.map((row, idx) => (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '32px minmax(180px, 1fr) minmax(180px, 1fr) auto', gap: 8, alignItems: 'end' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', alignSelf: 'center' }}>{idx + 1}.</span>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>{t('analytics.filterField')}</label>
                  <select
                    value={row.field}
                    onChange={e => setEarningsFilters(prev => prev.map(r => r.id === row.id ? { ...r, field: e.target.value, value: '' } : r))}
                  >
                    <option value="">—</option>
                    {availableGroupOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>{t('analytics.filterValue')}</label>
                  <select
                    value={row.value}
                    onChange={e => setEarningsFilters(prev => prev.map(r => r.id === row.id ? { ...r, value: e.target.value } : r))}
                    disabled={!row.field}
                  >
                    <option value="">—</option>
                    {row.field && (earningsFilterOptionsByGroup[row.field] ?? []).map(v => (
                      <option key={v} value={v}>{displayGroupValue(row.field, v)}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setEarningsFilters(prev => prev.filter(r => r.id !== row.id))}
                  title={t('common.delete')}
                  style={{ padding: '8px 10px', fontSize: '0.875rem', alignSelf: 'end' }}
                >
                  ×
                </button>
              </div>
            ))}
            <div>
              <button
                type="button"
                onClick={() => {
                  const firstField = availableGroupOptions[0]?.value ?? ''
                  setEarningsFilters(prev => [...prev, { id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, field: firstField, value: '' }])
                }}
                style={{ padding: '6px 12px', fontSize: '0.875rem' }}
              >
                {t('analytics.earningsAddFilter')}
              </button>
            </div>
          </div>
        </div>

        {earningsByCurrency.length > 0 ? (
          <>
            {earningsByCurrency.map((group) => (
              <div key={group.currency} style={{ marginBottom: 20 }}>
                {analyticsCurrencyFilter ? null : <h3 style={{ margin: '0 0 10px' }}>{t('settings.currency')}: {group.currency}</h3>}
                <div className="table-wrap" style={{ marginBottom: 16, overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        {earningsRowGroups.map((g, i) => (
                          <th key={i}>{earningsRowGroupLabel(g)}</th>
                        ))}
                        <th>{t('analytics.count')}</th>
                        <th>
                          {earningsAgg === 'sum' ? t('analytics.earningsSum') : earningsAgg === 'avg' ? t('analytics.earningsAvg') : t('analytics.earningsMax')}
                          {' '}
                          ({earningsValueType === 'net'
                            ? t('orderBook.amountNet')
                            : earningsValueType === 'vat'
                              ? t('orderBook.amountVat')
                              : earningsValueType === 'gross'
                                ? t('orderBook.amountGross')
                                : t('orders.quantity')})
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row, rowIdx) => {
                        const prev = rowIdx > 0 ? group.rows[rowIdx - 1] : null
                        return (
                          <tr key={row.keyParts.join('\u241f') + rowIdx}>
                            {earningsRowGroups.map((_, i) => (
                              <td key={i}>{!prev || prev.keyParts[i] !== row.keyParts[i] ? row.keyParts[i] : ''}</td>
                            ))}
                            <td>{row.count}</td>
                            <td>
                              {formatReportValue(
                                earningsValueType,
                                earningsValueType === 'net'
                                  ? row.net
                                  : earningsValueType === 'vat'
                                    ? row.vat
                                    : earningsValueType === 'gross'
                                      ? row.gross
                                      : row.quantity,
                                group.currency
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ width: '100%', height: 360 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={group.chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={v => formatNumber(v)} />
                      <Tooltip formatter={(v: number | undefined) => [formatReportValue(earningsValueType, v ?? 0, group.currency), t('analytics.total')]} labelFormatter={l => String(l)} />
                      {earningsStackedChart && earningsValueType !== 'quantity' ? (
                        <>
                          <Bar dataKey="net" stackId="a" fill="#3b82f6" name={t('orderBook.amountNet')} radius={[0, 0, 0, 0]} />
                          <Bar dataKey="vat" stackId="a" fill="#8b5cf6" name={t('orderBook.amountVat')} radius={[4, 4, 0, 0]} />
                          <Legend />
                        </>
                      ) : (
                        <Bar
                          dataKey="value"
                          fill="#3b82f6"
                          radius={[4, 4, 0, 0]}
                          name={earningsValueType === 'net'
                            ? t('orderBook.amountNet')
                            : earningsValueType === 'vat'
                              ? t('orderBook.amountVat')
                              : earningsValueType === 'gross'
                                ? t('orderBook.amountGross')
                                : t('orders.quantity')}
                        />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="table-wrap" style={{ marginTop: 12, overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>{t('analytics.earningsRowLabel')}</th>
                        <th>{t('analytics.count')}</th>
                        <th>{t('orderBook.amountNet')}</th>
                        <th>{t('orderBook.amountVat')}</th>
                        <th>{t('orderBook.amountGross')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.chartData.map((row, i) => (
                        <tr key={row.keyParts.join('\u241f') + i}>
                          <td>{row.name}</td>
                          <td>{row.count}</td>
                          <td>{formatMoneyByCurrency(row.net, group.currency)}</td>
                          <td>{formatMoneyByCurrency(row.vat, group.currency)}</td>
                          <td>{formatMoneyByCurrency(row.gross, group.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </>
        ) : (
          <p style={{ color: '#71717a' }}>{t('analytics.earningsNoData')}</p>
        )}
      </section>
    </div>
  )
}
