import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getCountryOptions, getCountryDisplayLabel } from '../utils/vatConfig'

type ClientRow = {
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
  notes: string | null
  email: string | null
  website: string | null
  phone: string | null
  contact_person: string | null
  default_payment_days: number
  client_kind?: 'company' | 'person' | null
  vat_eu?: number
}

type Pair = { id: number; label: string; source_code?: string; target_code?: string; bidirectional?: number }
type Spec = { id: number; name: string }
type Service = { id: number; name: string }
type ClientDefaultRateRow = {
  id: number
  client_id: number
  unit_id: number
  unit_name: string
  language_pair_id: number | null
  language_pair_label: string | null
  argument_key: string | null
  argument_value: string | null
  argument2_key: string | null
  argument2_value: string | null
  argument3_key: string | null
  argument3_value: string | null
  rate: number
  currency: string
}

const emptyForm: Partial<ClientRow> = {
  name: '', short_name: '', street: '', building: '', local: '', postal_code: '', city: '', country: '', country_code: 'PL', address_extra: '',
  nip: '', notes: '', email: '', website: '', phone: '', contact_person: '', default_payment_days: 14, client_kind: 'company', vat_eu: 0
}

export default function Clients() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const editId = searchParams.get('edit')
  type ClientListRow = ClientRow & { id: number }
const [list, setList] = useState<ClientListRow[]>([])
  const [filter, setFilter] = useState<Partial<Record<keyof ClientRow, string>>>({})
  const [sortBy, setSortBy] = useState<keyof ClientListRow | ''>('short_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [form, setForm] = useState<Partial<ClientRow>>(emptyForm)
  const [units, setUnits] = useState<{ id: number; name: string }[]>([])
  const [pairs, setPairs] = useState<Pair[]>([])
  const [specializations, setSpecializations] = useState<Spec[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [clientDefaultRates, setClientDefaultRates] = useState<ClientDefaultRateRow[]>([])
  const [newDefaultRateUnit, setNewDefaultRateUnit] = useState('')
  const [newDefaultRateArguments, setNewDefaultRateArguments] = useState<Array<{ key: string; value: string }>>([
    { key: '', value: '' },
    { key: '', value: '' },
    { key: '', value: '' }
  ])
  const [newDefaultRateValue, setNewDefaultRateValue] = useState('')
  const [newDefaultRateCurrency, setNewDefaultRateCurrency] = useState('PLN')
  const [editingDefaultRate, setEditingDefaultRate] = useState<{ id: number; unit_id: number; arguments: Array<{ key: string; value: string }>; rate: string; currency: string } | null>(null)
  const [defaultCurrency, setDefaultCurrency] = useState('PLN')
  const [rateCurrencies, setRateCurrencies] = useState<string[]>(['PLN', 'EUR', 'USD', 'GBP', 'CHF'])
  const [loading, setLoading] = useState(true)
  const [gusLoading, setGusLoading] = useState(false)
  const [gusMessage, setGusMessage] = useState<string | null>(null)
  const [showNipModal, setShowNipModal] = useState(false)
  const [modalNip, setModalNip] = useState('')
  const [clientsActionsOpenId, setClientsActionsOpenId] = useState<number | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const actionsTriggerRef = useRef<HTMLButtonElement | null>(null)
  const actionsDropdownRef = useRef<HTMLDivElement | null>(null)
  const loadedClientIdRef = useRef<number | null>(null)
  const loadingClientIdRef = useRef<number | null>(null)
  const countryOptions = getCountryOptions(i18n.language)

  const load = () => {
    if (!window.api) return
    window.api.clients.list().then((data: unknown) => {
      setList((data as ClientListRow[]) ?? [])
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])
  useLayoutEffect(() => {
    if (clientsActionsOpenId == null || !actionsTriggerRef.current || !actionsDropdownRef.current) return
    const r = actionsTriggerRef.current.getBoundingClientRect()
    const el = actionsDropdownRef.current
    el.style.top = `${r.bottom + 4}px`
    el.style.left = `${r.left}px`
    const margin = 8
    const w = el.offsetWidth
    let left = r.left
    if (left + w > window.innerWidth - margin) left = window.innerWidth - w - margin
    if (left < margin) left = margin
    el.style.left = `${left}px`
  }, [clientsActionsOpenId])
  useEffect(() => {
    if (clientsActionsOpenId === null) return
    const onDocClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.actions-dropdown-wrap')) setClientsActionsOpenId(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [clientsActionsOpenId])

  useEffect(() => {
    if (!editId || !window.api) {
      if (!editId) {
        loadedClientIdRef.current = null
        loadingClientIdRef.current = null
      }
      return
    }
    const id = parseInt(editId, 10)
    if (loadedClientIdRef.current === id) return
    if (loadingClientIdRef.current === id) return
    loadingClientIdRef.current = id
    window.api.clients.get(id).then((row: unknown) => {
      loadingClientIdRef.current = null
      const r = row as ClientRow
      if (r) {
        setForm({ ...r, vat_eu: (r.vat_eu ?? 0) === 1 ? 1 : 0 })
        loadedClientIdRef.current = id
      }
    }).catch(() => { loadingClientIdRef.current = null })
  }, [editId])

  useEffect(() => {
    if (!window.api) return
    window.api.units.list().then((u: unknown) => setUnits((u as { id: number; name: string }[])))
    window.api.languagePairs.list().then((p: unknown) => setPairs((p as Pair[]) ?? []))
    window.api.specializations.list().then((s: unknown) => setSpecializations((s as Spec[]) ?? []))
    window.api.services.list().then((svc: unknown) => setServices((svc as Service[]) ?? []))
    Promise.all([
      window.api.settings.get('default_currency'),
      window.api.settings.get('rate_currencies')
    ]).then(([dc, rc]) => {
      setDefaultCurrency((dc as string) || 'PLN')
      try {
        const parsed = typeof rc === 'string' && rc.trim() ? JSON.parse(rc) : null
        const list = Array.isArray(parsed) ? parsed.filter((x: unknown) => typeof x === 'string' && x.trim()) : []
        setRateCurrencies(list.length > 0 ? list : ['PLN', 'EUR', 'USD', 'GBP', 'CHF'])
      } catch {
        setRateCurrencies(['PLN', 'EUR', 'USD', 'GBP', 'CHF'])
      }
    })
  }, [])

  useEffect(() => {
    if (!editId || !window.api?.clientDefaultUnitRates?.list) return
    const clientId = parseInt(editId, 10)
    window.api.clientDefaultUnitRates.list(clientId).then((rates: unknown) => {
      setClientDefaultRates((rates as ClientDefaultRateRow[]) ?? [])
    })
  }, [editId])

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!window.api) return
    const payload = {
      name: form.name || '',
      short_name: form.short_name || form.name || '',
      street: form.street || null,
      building: form.building || null,
      local: form.local || null,
      postal_code: form.postal_code || null,
      city: form.city || null,
      country: form.country || null,
      country_code: form.country_code || null,
      address_extra: form.address_extra || null,
      nip: form.nip || null,
      notes: form.notes || null,
      email: form.email || null,
      website: form.website || null,
      phone: form.phone || null,
      contact_person: form.contact_person || null,
      default_payment_days: Number(form.default_payment_days) || 14,
      client_kind: form.client_kind || 'company',
      vat_eu: (form.vat_eu ?? 0) ? 1 : 0
    }
    if (editId) {
      await window.api.clients.update(parseInt(editId, 10), payload)
      setSearchParams({})
    } else {
      await window.api.clients.add(payload)
      setSearchParams({})
    }
    setForm(emptyForm)
    load()
  }

  const deleteClient = async (id: number) => {
    const okDel = confirm(t('clients.deleteConfirm')); window.api?.app?.refocusWindow?.(); if (!window.api || !okDel) return
    await window.api.clients.delete(id)
    load()
    if (editId === String(id)) setSearchParams({})
  }

  const fetchByNip = async (nipFromModal?: string) => {
    const nip = (nipFromModal ?? (form.nip ?? '')).trim().replace(/\s|-/g, '')
    if (!nip) {
      setGusMessage(t('clients.fetchByNipError', { message: t('clients.enterNipFirst') }))
      return
    }
    if (!window.api?.gus?.fetchByNip) return
    setGusLoading(true)
    setGusMessage(null)
    try {
      const result = await window.api.gus.fetchByNip(nip)
      if ('error' in result) {
        setGusMessage(result.error === 'MANUAL_ENTRY_REQUIRED' ? t('clients.fetchByNipManualEntry') : t('clients.fetchByNipError', { message: result.error }))
        return
      }
      setForm(prev => ({
        ...prev,
        name: result.name || prev.name,
        short_name: result.short_name || result.name || prev.short_name,
        nip: result.nip ?? nip,
        street: result.street || null,
        building: result.building || null,
        local: result.local || null,
        postal_code: result.postal_code || null,
        city: result.city || null,
        country: result.country || null,
        country_code: countryOptions.find(c => c.label.toLowerCase() === String(result.country || '').toLowerCase())?.code ?? prev.country_code ?? null,
        contact_person: result.contact_person || prev.contact_person || null
      }))
      setGusMessage(t('clients.fetchByNipSuccess'))
      setShowNipModal(false)
      setModalNip('')
    } finally {
      setGusLoading(false)
    }
  }

  const submitNipModal = () => { fetchByNip(modalNip) }

  // Te same argumenty co w Ustawieniach → Stawki domyślne (umożliwia dopasowanie stawki klienta do zleceń)
  const baseRateArgumentOptions = useMemo(() => ([
    { key: 'language_pair', label: t('orders.languagePair') },
    { key: 'oral_lang', label: t('orderBook.repertoriumOralLang') },
    { key: 'specialization', label: t('orders.specialization') },
    { key: 'service', label: t('orders.service') },
    { key: 'unit', label: t('orders.unit') },
    { key: 'repertorium_activity_type', label: t('orderBook.repertoriumActivityType') },
    { key: 'order_status', label: t('orders.orderStatus') },
    { key: 'invoice_status', label: t('orders.invoiceStatus') },
    { key: 'translation_type', label: t('orders.translationType') },
    { key: 'invoice_description', label: t('orders.additionalInvoiceDescription') },
    { key: 'document_author', label: t('orderBook.repertoriumDocumentAuthor') },
    { key: 'document_name', label: t('orderBook.repertoriumDocumentName') },
    { key: 'document_date', label: t('orderBook.repertoriumDocumentDate') },
    { key: 'document_number', label: t('orderBook.repertoriumDocumentNumber') },
    { key: 'document_form_remarks', label: t('orderBook.repertoriumDocumentFormRemarks') },
    { key: 'repertorium_notes', label: t('orderBook.repertoriumNotes') },
    { key: 'oral_date', label: t('orderBook.repertoriumOralDate') },
    { key: 'oral_place', label: t('orderBook.repertoriumOralPlace') },
    { key: 'oral_duration', label: t('orderBook.repertoriumOralDuration') },
    { key: 'oral_scope', label: t('orderBook.repertoriumOralScope') },
    { key: 'oral_notes', label: t('orderBook.repertoriumOralNotes') },
    { key: 'refusal_date', label: t('orderBook.repertoriumRefusalDate') },
    { key: 'refusal_organ', label: t('orderBook.repertoriumRefusalOrgan') },
    { key: 'refusal_reason', label: t('orderBook.repertoriumRefusalReason') },
    { key: 'order_number', label: t('orders.orderNumber') },
    { key: 'name', label: t('orders.name') },
    { key: 'received_at', label: t('orders.receivedAt') },
    { key: 'deadline', label: t('orders.deadline') },
    { key: 'completed_at', label: t('orders.completedAt') },
    { key: 'quantity', label: t('orders.quantity') },
    { key: 'amount', label: t('orders.amount') },
    { key: 'payment_due', label: t('orders.paymentDue') }
  ]), [t])
  const argumentValueOptionsByKey = useMemo(() => ({
    language_pair: pairs.map(p => ({ value: p.label, label: p.label })),
    oral_lang: pairs.map(p => ({ value: p.label, label: p.label })),
    specialization: specializations.map(s => ({ value: s.name, label: s.name })),
    service: services.map(s => ({ value: s.name, label: s.name })),
    unit: units.map(u => ({ value: u.name, label: u.name })),
    order_status: ['to_do', 'in_progress', 'completed', 'cancelled'].map(v => ({ value: v, label: t(`orders.orderStatus_${v}`) })),
    invoice_status: ['to_issue', 'issued', 'awaiting_payment', 'overdue', 'paid'].map(v => ({ value: v, label: t(`orders.invoiceStatus_${v}`) })),
    translation_type: [
      { value: 'written', label: t('orders.translationTypeWritten') },
      { value: 'oral', label: t('orders.translationTypeOral') }
    ]
  }), [pairs, specializations, services, units, t])
  const rateArgumentOptions = useMemo(() => ([
    { key: '', label: t('settings.defaultRatesAnyArgument') },
    ...baseRateArgumentOptions
  ]), [baseRateArgumentOptions, t])
  const getAllowedRateArgumentOptions = (currentIndex: number, args: Array<{ key: string; value: string }>) => {
    const selectedOther = new Set(args.map((a, idx) => idx === currentIndex ? '' : (a.key ?? '').trim()).filter(Boolean))
    return rateArgumentOptions.filter(opt => !opt.key || !selectedOther.has(opt.key))
  }
  const getRateArgumentLabel = (key: string | null) => {
    const k = (key ?? '').trim()
    const opt = rateArgumentOptions.find(o => o.key === k)
    return opt ? opt.label : (k || t('settings.defaultRatesAnyArgument'))
  }
  const getArgumentValueOptions = (argKey: string) => (argumentValueOptionsByKey as Record<string, { value: string; label: string }[]>)[argKey] ?? []

  const matches = (row: ClientListRow, key: keyof ClientRow, v: string) => {
    const val = (row[key] ?? '') as string
    return !v || String(val).toLowerCase().includes(String(v).toLowerCase())
  }
  const filteredList = useMemo(() => {
    return list.filter(row =>
      matches(row, 'street', (filter.street ?? '').trim()) &&
      matches(row, 'building', (filter.building ?? '').trim()) &&
      matches(row, 'local', (filter.local ?? '').trim()) &&
      matches(row, 'city', (filter.city ?? '').trim()) &&
      matches(row, 'postal_code', (filter.postal_code ?? '').trim()) &&
      matches(row, 'country', (filter.country ?? '').trim()) &&
      matches(row, 'nip', (filter.nip ?? '').trim()) &&
      matches(row, 'short_name', (filter.short_name ?? '').trim()) &&
      matches(row, 'name', (filter.name ?? '').trim()) &&
      ((filter.default_payment_days ?? '').trim() === '' || String(row.default_payment_days ?? '').includes((filter.default_payment_days ?? '').trim()))
    )
  }, [list, filter])
  const sortedList = useMemo(() => {
    if (!sortBy) return [...filteredList]
    const key = sortBy as keyof ClientListRow
    return [...filteredList].sort((a, b) => {
      const va = (a[key] ?? '') as string | number
      const vb = (b[key] ?? '') as string | number
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filteredList, sortBy, sortDir])

  const activeFiltersCount = [
    (filter.short_name ?? '').trim(),
    (filter.name ?? '').trim(),
    (filter.street ?? '').trim(),
    (filter.building ?? '').trim(),
    (filter.local ?? '').trim(),
    (filter.city ?? '').trim(),
    (filter.postal_code ?? '').trim(),
    (filter.country ?? '').trim(),
    (filter.nip ?? '').trim(),
    (filter.default_payment_days ?? '').trim()
  ].filter(Boolean).length
  const clearFilters = () => setFilter({
    short_name: '', name: '', street: '', building: '', local: '', postal_code: '', city: '', country: '', nip: '', default_payment_days: ''
  })

  const showForm = !!editId || searchParams.get('add') === '1'

  if (loading) return <div>{t('common.loading')}</div>

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>{t('clients.title')}</h1>
      <p>
        <button className="primary" onClick={() => { setSearchParams({ add: '1' }); setForm(emptyForm) }}>{t('clients.add')}</button>
      </p>
      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>{editId ? t('clients.edit') : t('clients.add')}</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setShowNipModal(true)} disabled={gusLoading} title={t('clients.fetchByNipHint')}>
                {gusLoading ? t('clients.fetchByNipLoading') : t('clients.fetchByNip')}
              </button>
              <button type="button" className="primary" onClick={() => save()}>{t('common.save')}</button>
              <button type="button" onClick={() => { setSearchParams({}); setForm(emptyForm) }}>{t('common.cancel')}</button>
            </div>
          </div>
          <form onSubmit={e => { e.preventDefault(); save(e) }}>
            <div className="grid2">
              <div className="form-group">
                <label>{t('clients.name')}</label>
                <input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value, short_name: f.short_name || e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>{t('clients.shortName')}</label>
                <input value={form.short_name ?? ''} onChange={e => setForm(f => ({ ...f, short_name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>{t('clients.street')}</label>
                <input value={form.street ?? ''} onChange={e => setForm(f => ({ ...f, street: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('clients.building')}</label>
                <input value={form.building ?? ''} onChange={e => setForm(f => ({ ...f, building: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('clients.local')}</label>
                <input value={form.local ?? ''} onChange={e => setForm(f => ({ ...f, local: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('clients.postalCode')}</label>
                <input value={form.postal_code ?? ''} onChange={e => setForm(f => ({ ...f, postal_code: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('clients.city')}</label>
                <input value={form.city ?? ''} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('clients.country')}</label>
                <select
                  value={form.country_code ?? ''}
                  onChange={e => {
                    const code = e.target.value || null
                    const label = countryOptions.find(c => c.code === code)?.label ?? ''
                    setForm(f => ({ ...f, country_code: code, country: label || null }))
                  }}
                >
                  <option value="">—</option>
                  {countryOptions.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>{t('clients.addressExtra')}</label>
                <input value={form.address_extra ?? ''} onChange={e => setForm(f => ({ ...f, address_extra: e.target.value }))} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>{t('clients.nip')}</label>
                <input
                  value={form.nip ?? ''}
                  onChange={e => {
                    const val = e.target.value
                    setForm(prev => {
                      const next = { ...prev, nip: val }
                      const match = val.trim().match(/^([A-Za-z]{2})[A-Za-z0-9\s\-]*$/)
                      if (match) {
                        const code = match[1].toUpperCase()
                        const opt = countryOptions.find(c => c.code === code)
                        if (opt) {
                          next.country_code = opt.code
                          next.country = opt.label
                        }
                      }
                      return next
                    })
                  }}
                  placeholder="10 cyfr"
                  style={{ width: 140 }}
                />
                {gusMessage && <p className={gusMessage.includes('loaded') || gusMessage.includes('załadowane') ? 'msg-success' : 'msg-error'} style={{ margin: '4px 0 0', fontSize: '0.875rem' }}>{gusMessage}</p>}
                {(form.vat_eu ?? 0) === 1 && (() => {
                  const nip = (form.nip ?? '').trim().replace(/\s|-/g, '')
                  const hasPrefix = nip.length >= 2 && countryOptions.some(c => c.code === nip.slice(0, 2).toUpperCase())
                  return !hasPrefix ? <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#dc2626', fontWeight: 500 }}>{t('clients.vatEuNipPrefixHint')}</p> : null
                })()}
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#71717a' }}>{t('clients.fetchByNipHint')}</p>
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#71717a' }}>{t('clients.fetchByNipFailureHint')}</p>
              </div>
              <div className="form-group">
                <label>{t('clients.defaultPaymentDays')}</label>
                <input type="number" value={form.default_payment_days ?? 14} onChange={e => setForm(f => ({ ...f, default_payment_days: parseInt(e.target.value, 10) || 14 }))} />
              </div>
              <div className="form-group">
                <label>{t('clients.type')}</label>
                <select value={form.client_kind ?? 'company'} onChange={e => setForm(f => ({ ...f, client_kind: e.target.value as 'company' | 'person' }))}>
                  <option value="company">{t('clients.typeCompany')}</option>
                  <option value="person">{t('clients.typePerson')}</option>
                </select>
              </div>
              {(form.client_kind ?? 'company') === 'company' && (
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={(form.vat_eu ?? 0) === 1}
                      onChange={e => setForm(f => ({ ...f, vat_eu: e.target.checked ? 1 : 0 }))}
                    />{' '}
                    {t('clients.vatEu')}
                  </label>
                </div>
              )}
              <div className="form-group">
                <label>{t('clients.email')}</label>
                <input type="email" value={form.email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('clients.website')}</label>
                <input value={form.website ?? ''} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('clients.phone')}</label>
                <input value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('clients.contactPerson')}</label>
                <input value={form.contact_person ?? ''} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>{t('clients.notes')}</label>
                <textarea rows={3} value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ width: '100%' }} />
              </div>
            </div>
            {editId && units.length > 0 && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #27272a' }}>
                <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>{t('clients.defaultRatesPerUnit')}</h3>
                <p style={{ color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '0.75rem' }}>{t('clients.defaultRatesPerUnitHint')}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>{t('settings.defaultRatesUnit')}</label>
                    <select value={newDefaultRateUnit} onChange={e => setNewDefaultRateUnit(e.target.value)} required>
                      <option value="">—</option>
                      {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  {newDefaultRateArguments.map((arg, idx) => {
                    const allowedOptions = getAllowedRateArgumentOptions(idx, newDefaultRateArguments)
                    const valueOptions = getArgumentValueOptions(arg.key)
                    return (
                      <div key={`new-client-arg-${idx}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>{t('settings.defaultRatesArgument')} {idx + 1}</label>
                          <select
                            value={arg.key}
                            onChange={e => setNewDefaultRateArguments(prev => prev.map((x, i) => i === idx ? { key: e.target.value, value: '' } : x))}
                            style={{ minWidth: 160 }}
                          >
                            {allowedOptions.map(o => <option key={o.key || `_any_client_new_${idx}`} value={o.key}>{o.label}</option>)}
                          </select>
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>{t('settings.defaultRatesValue')}</label>
                          {valueOptions.length ? (
                            <select
                              value={arg.value}
                              onChange={e => setNewDefaultRateArguments(prev => prev.map((x, i) => i === idx ? { ...x, value: e.target.value } : x))}
                              style={{ minWidth: 180 }}
                              disabled={!arg.key}
                            >
                              <option value="">—</option>
                              {valueOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={arg.value}
                              onChange={e => setNewDefaultRateArguments(prev => prev.map((x, i) => i === idx ? { ...x, value: e.target.value } : x))}
                              placeholder="—"
                              style={{ minWidth: 180 }}
                              disabled={!arg.key}
                            />
                          )}
                        </div>
                      </div>
                    )
                  })}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>{t('settings.defaultRatesRate')}</label>
                    <input type="number" step="0.01" min={0} value={newDefaultRateValue} onChange={e => setNewDefaultRateValue(e.target.value)} placeholder="0" style={{ width: 100 }} required />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>{t('settings.defaultRatesCurrency')}</label>
                    <select value={newDefaultRateCurrency} onChange={e => setNewDefaultRateCurrency(e.target.value || defaultCurrency)} style={{ width: 90 }}>
                      {[...new Set([...rateCurrencies, defaultCurrency].filter(Boolean))].sort().map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="primary"
                    onClick={async () => {
                      if (!window.api?.clientDefaultUnitRates?.set || !newDefaultRateUnit.trim()) return
                      const clientId = parseInt(editId, 10)
                      const unitId = parseInt(newDefaultRateUnit, 10)
                      const rate = parseFloat(newDefaultRateValue)
                      if (Number.isNaN(clientId) || Number.isNaN(unitId) || Number.isNaN(rate) || rate < 0) return
                      const argumentsList = newDefaultRateArguments
                        .map(a => ({ key: (a.key ?? '').trim(), value: (a.value ?? '').trim() }))
                        .filter(a => a.key && a.value)
                        .slice(0, 3)
                      await window.api.clientDefaultUnitRates.set(clientId, unitId, rate, newDefaultRateCurrency.trim() || 'PLN', argumentsList.length ? argumentsList : null)
                      setNewDefaultRateValue('')
                      setNewDefaultRateArguments([{ key: '', value: '' }, { key: '', value: '' }, { key: '', value: '' }])
                      const refreshed = await window.api.clientDefaultUnitRates.list(clientId) as ClientDefaultRateRow[]
                      setClientDefaultRates(refreshed ?? [])
                    }}
                  >
                    {t('common.add')}
                  </button>
                </div>
                {clientDefaultRates.length === 0 ? <p style={{ color: '#71717a' }}>—</p> : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {clientDefaultRates.map((r) => {
                      const isEditing = editingDefaultRate?.id === r.id
                      const rowArguments = [
                        {
                          key: (r.argument_key ?? '').trim() || ((r.language_pair_label ?? '').trim() ? 'language_pair' : ''),
                          value: (r.argument_value ?? '').trim() || ((r.argument_key ?? '').trim() === '' ? (r.language_pair_label ?? '') : '')
                        },
                        { key: (r.argument2_key ?? '').trim(), value: (r.argument2_value ?? '').trim() },
                        { key: (r.argument3_key ?? '').trim(), value: (r.argument3_value ?? '').trim() }
                      ].filter(a => a.key && a.value)
                      return (
                        <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                          <span><strong>{r.unit_name}</strong></span>
                          {rowArguments.length > 0 ? rowArguments.map((a, idx) => (
                            <span key={`${r.id}-arg-${idx}`} style={{ color: '#a1a1aa' }}>{getRateArgumentLabel(a.key)}: {a.value}</span>
                          )) : <span style={{ color: '#a1a1aa' }}>{t('settings.defaultRatesAnyArgument')}</span>}
                          {isEditing ? (
                            <>
                              {editingDefaultRate.arguments.map((arg, idx) => {
                                const allowedOptions = getAllowedRateArgumentOptions(idx, editingDefaultRate.arguments)
                                const valueOptions = getArgumentValueOptions(arg.key)
                                return (
                                  <span key={`edit-client-arg-${r.id}-${idx}`} style={{ display: 'contents' }}>
                                    <select value={arg.key} onChange={e => setEditingDefaultRate(prev => prev ? { ...prev, arguments: prev.arguments.map((x, i) => i === idx ? { key: e.target.value, value: '' } : x) } : null)} style={{ minWidth: 160 }}>
                                      {allowedOptions.map(o => <option key={o.key || `_any_client_edit_${idx}`} value={o.key}>{o.label}</option>)}
                                    </select>
                                    {valueOptions.length ? (
                                      <select value={arg.value} onChange={e => setEditingDefaultRate(prev => prev ? { ...prev, arguments: prev.arguments.map((x, i) => i === idx ? { ...x, value: e.target.value } : x) } : null)} style={{ minWidth: 180 }}>
                                        <option value="">—</option>
                                        {valueOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                      </select>
                                    ) : (
                                      <input type="text" value={arg.value} onChange={e => setEditingDefaultRate(prev => prev ? { ...prev, arguments: prev.arguments.map((x, i) => i === idx ? { ...x, value: e.target.value } : x) } : null)} placeholder="—" style={{ minWidth: 180 }} disabled={!arg.key} />
                                    )}
                                  </span>
                                )
                              })}
                              <input type="number" step="0.01" min={0} value={editingDefaultRate.rate} onChange={e => setEditingDefaultRate(prev => prev ? { ...prev, rate: e.target.value } : null)} placeholder="0" style={{ width: 100 }} />
                              <select value={editingDefaultRate.currency} onChange={e => setEditingDefaultRate(prev => prev ? { ...prev, currency: e.target.value || defaultCurrency } : null)} style={{ width: 90 }}>
                                {[...new Set([...rateCurrencies, defaultCurrency].filter(Boolean))].sort().map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                              <button type="button" className="primary" style={{ padding: '4px 8px' }} onClick={async () => {
                                if (!window.api?.clientDefaultUnitRates?.update || !editingDefaultRate) return
                                const rate = parseFloat(editingDefaultRate.rate)
                                if (Number.isNaN(rate) || rate < 0) return
                                await window.api.clientDefaultUnitRates.update(
                                  editingDefaultRate.id,
                                  rate,
                                  editingDefaultRate.currency.trim() || 'PLN',
                                  editingDefaultRate.arguments
                                    .map(a => ({ key: (a.key ?? '').trim(), value: (a.value ?? '').trim() }))
                                    .filter(a => a.key && a.value)
                                    .slice(0, 3)
                                )
                                const clientId = parseInt(editId, 10)
                                const refreshed = await window.api.clientDefaultUnitRates.list(clientId) as ClientDefaultRateRow[]
                                setClientDefaultRates(refreshed ?? [])
                                setEditingDefaultRate(null)
                              }}>{t('common.save')}</button>
                              <button type="button" style={{ padding: '4px 8px' }} onClick={() => setEditingDefaultRate(null)}>{t('common.cancel')}</button>
                            </>
                          ) : (
                            <>
                              <span><strong>{r.rate.toFixed(2)} {r.currency}</strong></span>
                              <button type="button" style={{ padding: '4px 8px' }} onClick={() => setEditingDefaultRate({
                                id: r.id,
                                unit_id: r.unit_id,
                                arguments: [
                                  {
                                    key: (r.argument_key ?? '').trim() || ((r.language_pair_label ?? '').trim() ? 'language_pair' : ''),
                                    value: (r.argument_value ?? '').trim() || ((r.argument_key ?? '').trim() === '' ? (r.language_pair_label ?? '') : '')
                                  },
                                  { key: (r.argument2_key ?? '').trim(), value: (r.argument2_value ?? '').trim() },
                                  { key: (r.argument3_key ?? '').trim(), value: (r.argument3_value ?? '').trim() }
                                ],
                                rate: String(r.rate),
                                currency: r.currency || defaultCurrency
                              })}>{t('common.edit')}</button>
                              <button type="button" className="danger" style={{ padding: '4px 8px' }} onClick={async () => {
                                if (!window.api?.clientDefaultUnitRates?.delete) return
                                await window.api.clientDefaultUnitRates.delete(r.id)
                                const clientId = parseInt(editId, 10)
                                const refreshed = await window.api.clientDefaultUnitRates.list(clientId) as ClientDefaultRateRow[]
                                setClientDefaultRates(refreshed ?? [])
                              }}>{t('common.delete')}</button>
                            </>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </form>
        </div>
      )}
      {showNipModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setShowNipModal(false)}>
          <div className="card" style={{ minWidth: 320 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{t('clients.fetchByNip')}</h3>
            <p style={{ fontSize: '0.875rem', color: '#71717a', marginBottom: 12 }}>{t('clients.fetchByNipHint')}</p>
            <div className="form-group">
              <label>{t('clients.nip')}</label>
              <input value={modalNip} onChange={e => setModalNip(e.target.value)} placeholder="10 cyfr" style={{ width: '100%' }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitNipModal() } }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" onClick={() => { setShowNipModal(false); setModalNip('') }}>{t('common.cancel')}</button>
              <button type="button" className="primary" onClick={submitNipModal} disabled={gusLoading}>{gusLoading ? t('clients.fetchByNipLoading') : t('common.ok')}</button>
            </div>
          </div>
        </div>
      )}
      {list.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{t('orderBook.sortBy')}</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as keyof ClientListRow)} style={{ minWidth: 160 }}>
              <option value="short_name">{t('clients.shortName')}</option>
              <option value="name">{t('clients.name')}</option>
              <option value="street">{t('clients.street')}</option>
              <option value="building">{t('clients.building')}</option>
              <option value="local">{t('clients.local')}</option>
              <option value="city">{t('clients.city')}</option>
              <option value="postal_code">{t('clients.postalCode')}</option>
              <option value="country">{t('clients.country')}</option>
              <option value="nip">{t('clients.nip')}</option>
              <option value="default_payment_days">{t('clients.defaultPaymentDays')}</option>
            </select>
            <button type="button" onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}>{sortDir === 'asc' ? '↑' : '↓'}</button>
            <button type="button" onClick={() => setFiltersOpen(o => !o)} style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {t('orderBook.addFilter')}
              {activeFiltersCount > 0 ? <span style={{ background: '#3b82f6', color: '#fff', borderRadius: 10, padding: '2px 6px', fontSize: '0.75rem', marginLeft: 4 }}>{activeFiltersCount}</span> : null}
              <span style={{ marginLeft: 4 }}>{filtersOpen ? '\u25BE' : '\u25B8'}</span>
            </button>
            {activeFiltersCount > 0 && <button type="button" onClick={clearFilters} style={{ fontSize: '0.875rem' }}>{t('orderBook.clearFilters')}</button>}
          </div>
          {filtersOpen && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border, #27272a)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('clients.shortName')} ({t('orderBook.filterContains')})</div>
                <input type="text" value={filter.short_name ?? ''} onChange={e => setFilter(f => ({ ...f, short_name: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('clients.name')} ({t('orderBook.filterContains')})</div>
                <input type="text" value={filter.name ?? ''} onChange={e => setFilter(f => ({ ...f, name: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('clients.street')} ({t('orderBook.filterContains')})</div>
                <input type="text" value={filter.street ?? ''} onChange={e => setFilter(f => ({ ...f, street: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('clients.building')} ({t('orderBook.filterContains')})</div>
                <input type="text" value={filter.building ?? ''} onChange={e => setFilter(f => ({ ...f, building: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('clients.local')} ({t('orderBook.filterContains')})</div>
                <input type="text" value={filter.local ?? ''} onChange={e => setFilter(f => ({ ...f, local: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('clients.city')} ({t('orderBook.filterContains')})</div>
                <input type="text" value={filter.city ?? ''} onChange={e => setFilter(f => ({ ...f, city: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('clients.postalCode')} ({t('orderBook.filterContains')})</div>
                <input type="text" value={filter.postal_code ?? ''} onChange={e => setFilter(f => ({ ...f, postal_code: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('clients.country')} ({t('orderBook.filterContains')})</div>
                <input type="text" value={filter.country ?? ''} onChange={e => setFilter(f => ({ ...f, country: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('clients.nip')} ({t('orderBook.filterContains')})</div>
                <input type="text" value={filter.nip ?? ''} onChange={e => setFilter(f => ({ ...f, nip: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('clients.defaultPaymentDays')}</div>
                <input type="text" value={filter.default_payment_days ?? ''} onChange={e => setFilter(f => ({ ...f, default_payment_days: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
            </div>
          )}
        </div>
      )}
      <div className="card table-wrap">
        {list.length === 0 ? (
          <p>{t('clients.noClients')}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('clients.shortName')}</th>
                <th>{t('clients.name')}</th>
                <th>{t('clients.street')}</th>
                <th>{t('clients.building')}</th>
                <th>{t('clients.local')}</th>
                <th>{t('clients.city')}</th>
                <th>{t('clients.postalCode')}</th>
                <th>{t('clients.country')}</th>
                <th>{t('clients.nip')}</th>
                <th>{t('clients.defaultPaymentDays')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedList.map(c => (
                <tr key={c.id}>
                  <td>
                    <button type="button" onClick={() => setSearchParams({ edit: String(c.id) })} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#a78bfa', fontWeight: 500, textAlign: 'left', font: 'inherit' }}>{c.short_name || '—'}</button>
                  </td>
                  <td>{c.name || '—'}</td>
                  <td>{c.street ?? '—'}</td>
                  <td>{c.building ?? '—'}</td>
                  <td>{c.local ?? '—'}</td>
                  <td>{c.city ?? '—'}</td>
                  <td>{c.postal_code ?? '—'}</td>
                  <td>{getCountryDisplayLabel(c.country, i18n.language, c.country_code)}</td>
                  <td>{c.nip ?? '—'}</td>
                  <td>{c.default_payment_days ?? '—'}</td>
                  <td>
                    <div className="actions-dropdown-wrap">
                      <button type="button" className="actions-dots-trigger" onClick={(e) => { e.stopPropagation(); actionsTriggerRef.current = e.currentTarget; setClientsActionsOpenId(prev => prev === c.id ? null : c.id) }} aria-expanded={clientsActionsOpenId === c.id} title={t('common.actions')}><span className="actions-dots" aria-hidden>⋯</span></button>
                      {clientsActionsOpenId === c.id && (
                        <div ref={actionsDropdownRef} className="actions-dropdown" onClick={e => e.stopPropagation()}>
                          <button type="button" onClick={() => { setSearchParams({ edit: String(c.id) }); setClientsActionsOpenId(null) }}>{t('common.edit')}</button>
                          <button type="button" onClick={() => { navigate(`/?clientId=${c.id}`); setClientsActionsOpenId(null) }}>{t('clients.showOrders')}</button>
                          <button type="button" className="danger" onClick={() => { deleteClient(c.id); setClientsActionsOpenId(null) }}>{t('common.delete')}</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
