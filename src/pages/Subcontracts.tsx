import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { formatNumber } from '../utils/numberLocale'

type SubcontractRow = {
  id: number
  order_id: number
  contractor_id: number
  subcontract_number: string
  name: string | null
  notes: string | null
  order_number: string | null
  client_short_name: string
  contractor_short_name: string | null
  quantity: number
  rate_per_unit: number
  amount: number
  received_at: string | null
  deadline_at: string | null
  specialization_name: string | null
  language_pair_label: string | null
  unit_name: string
  rate_currency?: string | null
}

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString()
}

export default function Subcontracts() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const calcAmount = (quantity: number, ratePerUnit: number) => Math.round((quantity || 0) * (ratePerUnit || 0) * 100) / 100
  const [searchParams] = useSearchParams()
  const [list, setList] = useState<SubcontractRow[]>([])
  const [sortBy, setSortBy] = useState<'subcontract_number' | 'order_number' | 'received_at' | 'client' | 'contractor' | 'deadline_at' | 'amount' | 'quantity'>('received_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<{
    subcontractNumberContains: string
    nameContains: string
    orderNumberContains: string
    receivedAtFrom: string
    receivedAtTo: string
    clientNames: string[]
    contractorIds: number[]
    deadlineFrom: string
    deadlineTo: string
    specializationNames: string[]
    languagePairLabels: string[]
    unitNames: string[]
    quantityMin: string
    quantityMax: string
    amountMin: string
    amountMax: string
  }>({
    subcontractNumberContains: '',
    nameContains: '',
    orderNumberContains: '',
    receivedAtFrom: '',
    receivedAtTo: '',
    clientNames: [],
    contractorIds: [],
    deadlineFrom: '',
    deadlineTo: '',
    specializationNames: [],
    languagePairLabels: [],
    unitNames: [],
    quantityMin: '',
    quantityMax: '',
    amountMin: '',
    amountMax: ''
  })
  const [orders, setOrders] = useState<{ id: number; order_number: string | null; client_short_name: string }[]>([])
  const [contractors, setContractors] = useState<{ id: number; short_name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [addModal, setAddModal] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [addOrderId, setAddOrderId] = useState<number | null>(null)
  const [addContractorId, setAddContractorId] = useState<number | null>(null)
  const [addForm, setAddForm] = useState<{ name: string; notes: string; include_specialization: boolean; include_language_pair: boolean; include_service: boolean; description_custom_text: string; quantity: number; rate_per_unit: number; amount: number; deadline_at: string }>({ name: '', notes: '', include_specialization: true, include_language_pair: true, include_service: false, description_custom_text: '', quantity: 0, rate_per_unit: 0, amount: 0, deadline_at: '' })
  const [editForm, setEditForm] = useState<{ name: string; notes: string; include_specialization: boolean; include_language_pair: boolean; include_service: boolean; description_custom_text: string; contractor_id: number | null; quantity: number; rate_per_unit: number; amount: number; deadline_at: string }>({ name: '', notes: '', include_specialization: true, include_language_pair: true, include_service: false, description_custom_text: '', contractor_id: null, quantity: 0, rate_per_unit: 0, amount: 0, deadline_at: '' })
  const [subcontractsActionsOpenId, setSubcontractsActionsOpenId] = useState<number | null>(null)
  const actionsTriggerRef = useRef<HTMLButtonElement | null>(null)
  const actionsDropdownRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (subcontractsActionsOpenId == null || !actionsTriggerRef.current || !actionsDropdownRef.current) return
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
  }, [subcontractsActionsOpenId])

  const load = () => {
    if (!window.api) {
      setLoading(false)
      return
    }
    const subPromise = window.api.subcontracts?.list?.() ?? Promise.resolve([])
    const ordPromise = window.api.orders?.list?.() ?? Promise.resolve([])
    const contPromise = window.api.contractors?.list?.() ?? Promise.resolve([])
    Promise.allSettled([subPromise, ordPromise, contPromise]).then(([subRes, ordRes, contRes]) => {
      const subList = subRes.status === 'fulfilled' && Array.isArray(subRes.value) ? subRes.value as SubcontractRow[] : []
      const ordList = ordRes.status === 'fulfilled' && Array.isArray(ordRes.value) ? ordRes.value as { id: number; order_number: string | null; client_short_name: string }[] : []
      const contList = contRes.status === 'fulfilled' && Array.isArray(contRes.value) ? contRes.value as { id: number; short_name: string }[] : []
      setList(subList)
      setOrders(ordList)
      setContractors(contList)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (subcontractsActionsOpenId === null) return
    const onDocClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.actions-dropdown-wrap')) setSubcontractsActionsOpenId(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [subcontractsActionsOpenId])

  useEffect(() => {
    const ctId = searchParams.get('contractorId')
    if (ctId) setFilters(f => ({ ...f, contractorIds: [parseInt(ctId, 10)].filter(Boolean) }))
  }, [searchParams.get('contractorId')])

  useEffect(() => {
    if (editId == null || !window.api?.subcontracts?.get) return
    const p = window.api.subcontracts.get(editId)
    if (p && typeof p.then === 'function') {
      p.then((row: unknown) => {
        const r = row as SubcontractRow & { quantity?: number; amount?: number; deadline_at?: string | null; contractor_id?: number }
        const quantity = r.quantity ?? 0
        const ratePerUnit = r.rate_per_unit ?? 0
        const rowWithDesc = r as SubcontractRow & { include_specialization?: number | null; include_language_pair?: number | null; include_service?: number | null; description_custom_text?: string | null }
        setEditForm({
          name: rowWithDesc.name ?? '',
          notes: rowWithDesc.notes ?? '',
          include_specialization: rowWithDesc.include_specialization !== 0 && rowWithDesc.include_specialization !== false,
          include_language_pair: rowWithDesc.include_language_pair !== 0 && rowWithDesc.include_language_pair !== false,
          include_service: rowWithDesc.include_service === 1 || rowWithDesc.include_service === true,
          description_custom_text: rowWithDesc.description_custom_text ?? '',
          contractor_id: r.contractor_id ?? null,
          quantity,
          rate_per_unit: ratePerUnit,
          amount: calcAmount(quantity, ratePerUnit),
          deadline_at: r.deadline_at?.slice(0, 10) ?? ''
        })
      }).catch(() => { setEditId(null) })
    }
  }, [editId])

  const submitAdd = async () => {
    if (!window.api || addOrderId == null || addContractorId == null) return
    await window.api.subcontracts.add({
      order_id: addOrderId,
      contractor_id: addContractorId,
      name: addForm.name.trim() || null,
      notes: addForm.notes.trim() || null,
      include_specialization: addForm.include_specialization ? 1 : 0,
      include_language_pair: addForm.include_language_pair ? 1 : 0,
      include_service: addForm.include_service ? 1 : 0,
      description_custom_text: addForm.description_custom_text.trim() || null,
      quantity: addForm.quantity,
      rate_per_unit: addForm.rate_per_unit,
      amount: calcAmount(addForm.quantity, addForm.rate_per_unit),
      deadline_at: addForm.deadline_at || null
    })
    setAddModal(false)
    setAddOrderId(null)
    setAddContractorId(null)
    setAddForm({ name: '', notes: '', include_specialization: true, include_language_pair: true, include_service: false, description_custom_text: '', quantity: 0, rate_per_unit: 0, amount: 0, deadline_at: '' })
    load()
  }

  const submitEdit = async () => {
    if (!window.api || editId == null) return
    await window.api.subcontracts.update(editId, {
      name: editForm.name.trim() || null,
      notes: editForm.notes.trim() || null,
      include_specialization: editForm.include_specialization ? 1 : 0,
      include_language_pair: editForm.include_language_pair ? 1 : 0,
      include_service: editForm.include_service ? 1 : 0,
      description_custom_text: editForm.description_custom_text.trim() || null,
      contractor_id: editForm.contractor_id,
      quantity: editForm.quantity,
      rate_per_unit: editForm.rate_per_unit,
      amount: calcAmount(editForm.quantity, editForm.rate_per_unit),
      deadline_at: editForm.deadline_at || null
    })
    setEditId(null)
    load()
  }

  const deleteSubcontract = async (id: number) => {
    const okDel = confirm(t('subcontracts.deleteConfirm')); window.api?.app?.refocusWindow?.(); if (!window.api || !okDel) return
    await window.api.subcontracts.delete(id)
    if (editId === id) setEditId(null)
    load()
  }

  const uniqueClientNames = useMemo(() => [...new Set((Array.isArray(list) ? list : []).map(s => s && typeof s === 'object' ? (s as SubcontractRow).client_short_name : null).filter(Boolean))].sort() as string[], [list])
  const uniqueSpecializationNames = useMemo(() => [...new Set((Array.isArray(list) ? list : []).map(s => s && typeof s === 'object' ? (s as SubcontractRow).specialization_name : null).filter(Boolean))].sort() as string[], [list])
  const uniqueLanguagePairLabels = useMemo(() => [...new Set((Array.isArray(list) ? list : []).map(s => s && typeof s === 'object' ? (s as SubcontractRow).language_pair_label : null).filter(Boolean))].sort() as string[], [list])
  const uniqueUnitNames = useMemo(() => [...new Set((Array.isArray(list) ? list : []).map(s => s && typeof s === 'object' ? (s as SubcontractRow).unit_name : null).filter(Boolean))].sort() as string[], [list])
  const displayedList = useMemo(() => {
    let result = [...(Array.isArray(list) ? list : [])]
    const subNum = filters.subcontractNumberContains.trim().toLowerCase()
    if (subNum) result = result.filter(s => (s.subcontract_number || '').toLowerCase().includes(subNum))
    const ordNum = filters.orderNumberContains.trim().toLowerCase()
    if (ordNum) result = result.filter(s => ((s.order_number ?? '') + (s.order_id ?? '')).toLowerCase().includes(ordNum))
    const nameSub = filters.nameContains.trim().toLowerCase()
    if (nameSub) result = result.filter(s => ((s.name ?? '')).toLowerCase().includes(nameSub))
    if (filters.receivedAtFrom) result = result.filter(s => (s.received_at || '') >= filters.receivedAtFrom)
    if (filters.receivedAtTo) result = result.filter(s => (s.received_at || '') <= filters.receivedAtTo)
    if (filters.clientNames.length) result = result.filter(s => filters.clientNames.includes(s.client_short_name))
    if (filters.contractorIds.length) result = result.filter(s => filters.contractorIds.includes(s.contractor_id))
    if (filters.deadlineFrom) result = result.filter(s => (s.deadline_at || '') >= filters.deadlineFrom)
    if (filters.deadlineTo) result = result.filter(s => (s.deadline_at || '') <= filters.deadlineTo)
    if (filters.specializationNames.length) result = result.filter(s => s.specialization_name != null && filters.specializationNames.includes(s.specialization_name))
    if (filters.languagePairLabels.length) result = result.filter(s => s.language_pair_label != null && filters.languagePairLabels.includes(s.language_pair_label))
    if (filters.unitNames.length) result = result.filter(s => s.unit_name != null && filters.unitNames.includes(s.unit_name))
    const qMin = parseFloat(filters.quantityMin)
    if (!Number.isNaN(qMin)) result = result.filter(s => (s.quantity ?? 0) >= qMin)
    const qMax = parseFloat(filters.quantityMax)
    if (!Number.isNaN(qMax)) result = result.filter(s => (s.quantity ?? 0) <= qMax)
    const aMin = parseFloat(filters.amountMin)
    if (!Number.isNaN(aMin)) result = result.filter(s => (Number(s.amount) ?? 0) >= aMin)
    const aMax = parseFloat(filters.amountMax)
    if (!Number.isNaN(aMax)) result = result.filter(s => (Number(s.amount) ?? 0) <= aMax)
    result.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'subcontract_number') cmp = (a.subcontract_number || '').localeCompare(b.subcontract_number || '')
      else if (sortBy === 'order_number') cmp = (a.order_number || '').localeCompare(b.order_number || '')
      else if (sortBy === 'received_at') cmp = (a.received_at || '').localeCompare(b.received_at || '')
      else if (sortBy === 'client') cmp = (a.client_short_name || '').localeCompare(b.client_short_name || '')
      else if (sortBy === 'contractor') cmp = (a.contractor_short_name || '').localeCompare(b.contractor_short_name || '')
      else if (sortBy === 'deadline_at') cmp = (a.deadline_at || '').localeCompare(b.deadline_at || '')
      else if (sortBy === 'amount') cmp = (a.amount || 0) - (b.amount || 0)
      else if (sortBy === 'quantity') cmp = (a.quantity || 0) - (b.quantity || 0)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [list, filters, sortBy, sortDir])

  const activeFiltersCount = [
    filters.subcontractNumberContains.trim(),
    filters.orderNumberContains.trim(),
    filters.receivedAtFrom,
    filters.receivedAtTo,
    filters.clientNames.length,
    filters.contractorIds.length,
    filters.deadlineFrom,
    filters.deadlineTo,
    filters.specializationNames.length,
    filters.languagePairLabels.length,
    filters.unitNames.length,
    filters.quantityMin.trim(),
    filters.quantityMax.trim(),
    filters.amountMin.trim(),
    filters.amountMax.trim()
  ].filter(v => (typeof v === 'string' ? v.length > 0 : v > 0)).length
  const clearFilters = () => setFilters({
    subcontractNumberContains: '',
    nameContains: '',
    orderNumberContains: '',
    receivedAtFrom: '',
    receivedAtTo: '',
    clientNames: [],
    contractorIds: [],
    deadlineFrom: '',
    deadlineTo: '',
    specializationNames: [],
    languagePairLabels: [],
    unitNames: [],
    quantityMin: '',
    quantityMax: '',
    amountMin: '',
    amountMax: ''
  })

  if (loading) return <div>{t('common.loading')}</div>

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>{t('subcontracts.title')}</h1>
      <p style={{ color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '1rem' }}>{t('subcontracts.hint')}</p>

      <p style={{ marginBottom: 16 }}>
        <button type="button" className="primary" onClick={() => setAddModal(true)}>{t('subcontracts.addSubcontract')}</button>
      </p>

      {list.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{t('orderBook.sortBy')}</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} style={{ minWidth: 160 }}>
              <option value="subcontract_number">{t('subcontracts.subcontractNumber')}</option>
              <option value="order_number">{t('orders.orderNumber')}</option>
              <option value="received_at">{t('orders.receivedAt')}</option>
              <option value="client">{t('orders.client')}</option>
              <option value="contractor">{t('orders.subcontractTo')}</option>
              <option value="deadline_at">{t('orders.deadline')}</option>
              <option value="amount">{t('orders.amount')}</option>
              <option value="quantity">{t('orders.quantity')}</option>
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
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #27272a', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('subcontracts.subcontractNumber')} ({t('orderBook.filterContains')})</div>
                <input type="text" value={filters.subcontractNumberContains} onChange={e => setFilters(f => ({ ...f, subcontractNumberContains: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('subcontracts.name')} ({t('orderBook.filterContains')})</div>
                <input type="text" value={filters.nameContains} onChange={e => setFilters(f => ({ ...f, nameContains: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
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
                  value={filters.clientNames}
                  onChange={e => setFilters(f => ({ ...f, clientNames: Array.from(e.target.selectedOptions, o => o.value) }))}
                  style={{ width: '100%', minHeight: 80, maxHeight: 160 }}
                >
                  {uniqueClientNames.map(name => (
                    <option key={name} value={name}>{name}</option>
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
                  <input type="date" value={filters.deadlineFrom} onChange={e => setFilters(f => ({ ...f, deadlineFrom: e.target.value }))} title={t('orderBook.filterFrom')} style={{ flex: 1, minWidth: 100 }} />
                  <input type="date" value={filters.deadlineTo} onChange={e => setFilters(f => ({ ...f, deadlineTo: e.target.value }))} title={t('orderBook.filterTo')} style={{ flex: 1, minWidth: 100 }} />
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.specialization')}</div>
                <select
                  multiple
                  value={filters.specializationNames}
                  onChange={e => setFilters(f => ({ ...f, specializationNames: Array.from(e.target.selectedOptions, o => o.value) }))}
                  style={{ width: '100%', minHeight: 80, maxHeight: 160 }}
                >
                  {uniqueSpecializationNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.languagePair')}</div>
                <select
                  multiple
                  value={filters.languagePairLabels}
                  onChange={e => setFilters(f => ({ ...f, languagePairLabels: Array.from(e.target.selectedOptions, o => o.value) }))}
                  style={{ width: '100%', minHeight: 80, maxHeight: 160 }}
                >
                  {uniqueLanguagePairLabels.map(label => (
                    <option key={label} value={label}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.unit')}</div>
                <select
                  multiple
                  value={filters.unitNames}
                  onChange={e => setFilters(f => ({ ...f, unitNames: Array.from(e.target.selectedOptions, o => o.value) }))}
                  style={{ width: '100%', minHeight: 80, maxHeight: 160 }}
                >
                  {uniqueUnitNames.map(name => (
                    <option key={name} value={name}>{name}</option>
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
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.amount')}</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <input type="number" step="0.01" placeholder={t('orderBook.filterMin')} value={filters.amountMin} onChange={e => setFilters(f => ({ ...f, amountMin: e.target.value }))} style={{ width: 80 }} />
                  <input type="number" step="0.01" placeholder={t('orderBook.filterMax')} value={filters.amountMax} onChange={e => setFilters(f => ({ ...f, amountMax: e.target.value }))} style={{ width: 80 }} />
                </div>
              </div>
            </div>
          )}
          {activeFiltersCount > 0 && (
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.8125rem', color: '#a1a1aa' }}>
              {filters.subcontractNumberContains.trim() && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                  {t('subcontracts.subcontractNumber')}: &quot;{filters.subcontractNumberContains}&quot;
                  <button type="button" onClick={() => setFilters(f => ({ ...f, subcontractNumberContains: '' }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                </span>
              )}
              {filters.nameContains.trim() && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                  {t('subcontracts.name')}: &quot;{filters.nameContains}&quot;
                  <button type="button" onClick={() => setFilters(f => ({ ...f, nameContains: '' }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                </span>
              )}
              {filters.orderNumberContains.trim() && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                  {t('orders.orderNumber')}: &quot;{filters.orderNumberContains}&quot;
                  <button type="button" onClick={() => setFilters(f => ({ ...f, orderNumberContains: '' }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                </span>
              )}
              {(filters.receivedAtFrom || filters.receivedAtTo) && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                  {t('orders.receivedAt')}: {filters.receivedAtFrom || '…'} – {filters.receivedAtTo || '…'}
                  <button type="button" onClick={() => setFilters(f => ({ ...f, receivedAtFrom: '', receivedAtTo: '' }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                </span>
              )}
              {filters.clientNames.length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                  {t('orders.client')}: {filters.clientNames.join(', ')}
                  <button type="button" onClick={() => setFilters(f => ({ ...f, clientNames: [] }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
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
              {filters.specializationNames.length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                  {t('orders.specialization')}: {filters.specializationNames.join(', ')}
                  <button type="button" onClick={() => setFilters(f => ({ ...f, specializationNames: [] }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                </span>
              )}
              {filters.languagePairLabels.length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                  {t('orders.languagePair')}: {filters.languagePairLabels.join(', ')}
                  <button type="button" onClick={() => setFilters(f => ({ ...f, languagePairLabels: [] }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                </span>
              )}
              {filters.unitNames.length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#27272a', padding: '2px 8px', borderRadius: 6 }}>
                  {t('orders.unit')}: {filters.unitNames.join(', ')}
                  <button type="button" onClick={() => setFilters(f => ({ ...f, unitNames: [] }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
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
                  {t('orders.amount')}: {filters.amountMin || '…'} – {filters.amountMax || '…'}
                  <button type="button" onClick={() => setFilters(f => ({ ...f, amountMin: '', amountMax: '' }))} title={t('orderBook.removeFilterTag')} style={{ marginLeft: 2, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, opacity: 0.9 }} aria-label={t('orderBook.removeFilterTag')}>×</button>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {displayedList.length === 0 ? (
        <div className="card">
          <p>{t('subcontracts.noSubcontracts')}</p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('subcontracts.subcontractNumber')}</th>
                <th>{t('subcontracts.name')}</th>
                <th>{t('orders.orderNumber')}</th>
                <th>{t('orders.receivedAt')}</th>
                <th>{t('orders.client')}</th>
                <th>{t('orders.subcontractTo')}</th>
                <th>{t('orders.deadline')}</th>
                <th>{t('orders.specialization')}</th>
                <th>{t('orders.languagePair')}</th>
                <th>{t('orders.unit')}</th>
                <th>{t('orders.quantity')}</th>
                <th>{t('orders.amount')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {displayedList.map(o => (
                <tr key={o.id}>
                  <td>
                    <button
                      type="button"
                      className="link-like"
                      onClick={() => setEditId(o.id)}
                      title={t('common.edit')}
                    >
                      {o.subcontract_number}
                    </button>
                  </td>
                  <td>{o.name ?? '—'}</td>
                  <td>
                    <button type="button" className="link-like" onClick={() => navigate(`/?edit=${o.order_id}`)}>
                      {o.order_number ?? o.order_id}
                    </button>
                  </td>
                  <td>{formatDate(o.received_at)}</td>
                  <td>{o.client_short_name}</td>
                  <td>{o.contractor_short_name ?? '—'}</td>
                  <td>{formatDate(o.deadline_at)}</td>
                  <td>{o.specialization_name ?? '—'}</td>
                  <td>{o.language_pair_label ?? '—'}</td>
                  <td>{o.unit_name ?? '—'}</td>
                  <td>{o.quantity}</td>
                  <td>{formatNumber(o.amount, { minimumFractionDigits: 2 })}{o.rate_currency ? ` ${String(o.rate_currency).trim().toUpperCase()}` : ''}</td>
                  <td>
                    <div className="actions-dropdown-wrap">
                      <button type="button" className="actions-dots-trigger" onClick={(e) => { e.stopPropagation(); actionsTriggerRef.current = e.currentTarget; setSubcontractsActionsOpenId(prev => prev === o.id ? null : o.id) }} aria-expanded={subcontractsActionsOpenId === o.id} title={t('common.actions')}><span className="actions-dots" aria-hidden>⋯</span></button>
                      {subcontractsActionsOpenId === o.id && (
                        <div ref={actionsDropdownRef} className="actions-dropdown" onClick={e => e.stopPropagation()}>
                          {window.api?.export?.orderConfirmationPdfSubcontract && (
                            <button type="button" onClick={() => { window.api.export.orderConfirmationPdfSubcontract(o.id); setSubcontractsActionsOpenId(null) }}>{t('subcontracts.orderConfirmationPdf')}</button>
                          )}
                          <button type="button" onClick={() => { setEditId(o.id); setSubcontractsActionsOpenId(null) }}>{t('common.edit')}</button>
                          <button type="button" className="danger" onClick={() => { deleteSubcontract(o.id); setSubcontractsActionsOpenId(null) }}>{t('common.delete')}</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addModal && (
        <div className="card" style={{ position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 100, minWidth: 320 }}>
          <h3 style={{ marginTop: 0 }}>{t('subcontracts.addSubcontract')}</h3>
          <div className="form-group">
            <label>{t('subcontracts.selectOrder')}</label>
            <select value={addOrderId ?? ''} onChange={e => setAddOrderId(e.target.value ? parseInt(e.target.value, 10) : null)} required>
              <option value="">—</option>
              {orders.map(ord => (
                <option key={ord.id} value={ord.id}>{ord.order_number ?? ord.id} — {ord.client_short_name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>{t('subcontracts.selectContractor')}</label>
            <select value={addContractorId ?? ''} onChange={e => setAddContractorId(e.target.value ? parseInt(e.target.value, 10) : null)} required>
              <option value="">—</option>
              {contractors.map(c => (
                <option key={c.id} value={c.id}>{c.short_name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>{t('subcontracts.name')}</label>
            <input type="text" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="—" />
          </div>
          <div className="form-group">
            <label>{t('subcontracts.asDescription')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
                <input type="checkbox" checked={addForm.include_specialization} onChange={e => setAddForm(f => ({ ...f, include_specialization: e.target.checked }))} />
                {t('subcontracts.includeSpecialization')}
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
                <input type="checkbox" checked={addForm.include_language_pair} onChange={e => setAddForm(f => ({ ...f, include_language_pair: e.target.checked }))} />
                {t('subcontracts.includeLanguagePair')}
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
                <input type="checkbox" checked={addForm.include_service} onChange={e => setAddForm(f => ({ ...f, include_service: e.target.checked }))} />
                {t('subcontracts.includeService')}
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
                <input type="checkbox" checked={!!addForm.description_custom_text.trim()} onChange={e => setAddForm(f => ({ ...f, description_custom_text: e.target.checked ? f.description_custom_text : '' }))} />
                {t('subcontracts.customText')}
              </label>
            </div>
            <input type="text" value={addForm.description_custom_text} onChange={e => setAddForm(f => ({ ...f, description_custom_text: e.target.value }))} placeholder="—" style={{ marginTop: 6, width: '100%' }} />
          </div>
          <div className="form-group">
            <label>{t('subcontracts.notes')}</label>
            <textarea value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} placeholder="—" rows={4} style={{ width: '100%', resize: 'vertical', minHeight: 80 }} />
          </div>
          <div className="form-group">
            <label>{t('orders.quantity')}</label>
            <input
              type="number"
              step="any"
              value={addForm.quantity}
              onChange={e => {
                const quantity = Number(e.target.value) || 0
                setAddForm(f => ({ ...f, quantity, amount: calcAmount(quantity, f.rate_per_unit) }))
              }}
            />
          </div>
          <div className="form-group">
            <label>{t('orders.ratePerUnit')}</label>
            <input
              type="number"
              step="any"
              value={addForm.rate_per_unit}
              onChange={e => {
                const ratePerUnit = Number(e.target.value) || 0
                setAddForm(f => ({ ...f, rate_per_unit: ratePerUnit, amount: calcAmount(f.quantity, ratePerUnit) }))
              }}
            />
          </div>
          <div className="form-group">
            <label>{t('orders.amount')}</label>
            <input type="number" step="0.01" value={addForm.amount} readOnly />
          </div>
          <div className="form-group">
            <label>{t('orders.deadline')}</label>
            <input type="date" value={addForm.deadline_at} onChange={e => setAddForm(f => ({ ...f, deadline_at: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="primary" onClick={submitAdd} disabled={addOrderId == null || addContractorId == null}>{t('common.save')}</button>
            <button type="button" onClick={() => { setAddModal(false); setAddOrderId(null); setAddContractorId(null); setAddForm({ name: '', notes: '', include_specialization: true, include_language_pair: true, include_service: false, description_custom_text: '', quantity: 0, rate_per_unit: 0, amount: 0, deadline_at: '' }) }}>{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {editId != null && (
        <div className="card" style={{ position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 100, minWidth: 320 }}>
          <h3 style={{ marginTop: 0 }}>{t('subcontracts.editSubcontract')}</h3>
          <div className="form-group">
            <label>{t('subcontracts.name')} *</label>
            <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder={t('subcontracts.nameRequired')} required />
          </div>
          <div className="form-group">
            <label>{t('subcontracts.asDescription')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
                <input type="checkbox" checked={editForm.include_specialization} onChange={e => setEditForm(f => ({ ...f, include_specialization: e.target.checked }))} />
                {t('subcontracts.includeSpecialization')}
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
                <input type="checkbox" checked={editForm.include_language_pair} onChange={e => setEditForm(f => ({ ...f, include_language_pair: e.target.checked }))} />
                {t('subcontracts.includeLanguagePair')}
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
                <input type="checkbox" checked={editForm.include_service} onChange={e => setEditForm(f => ({ ...f, include_service: e.target.checked }))} />
                {t('subcontracts.includeService')}
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
                <input type="checkbox" checked={!!editForm.description_custom_text.trim()} onChange={e => setEditForm(f => ({ ...f, description_custom_text: e.target.checked ? f.description_custom_text : '' }))} />
                {t('subcontracts.customText')}
              </label>
            </div>
            <input type="text" value={editForm.description_custom_text} onChange={e => setEditForm(f => ({ ...f, description_custom_text: e.target.value }))} placeholder="—" style={{ marginTop: 6, width: '100%' }} />
          </div>
          <div className="form-group">
            <label>{t('subcontracts.notes')}</label>
            <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="—" rows={4} style={{ width: '100%', resize: 'vertical', minHeight: 80 }} />
          </div>
          <div className="form-group">
            <label>{t('subcontracts.selectContractor')}</label>
            <select value={editForm.contractor_id ?? ''} onChange={e => setEditForm(f => ({ ...f, contractor_id: e.target.value ? parseInt(e.target.value, 10) : null }))}>
              <option value="">—</option>
              {contractors.map(c => (
                <option key={c.id} value={c.id}>{c.short_name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>{t('orders.quantity')}</label>
            <input
              type="number"
              step="any"
              value={editForm.quantity}
              onChange={e => {
                const quantity = Number(e.target.value) || 0
                setEditForm(f => ({ ...f, quantity, amount: calcAmount(quantity, f.rate_per_unit) }))
              }}
            />
          </div>
          <div className="form-group">
            <label>{t('orders.ratePerUnit')}</label>
            <input
              type="number"
              step="any"
              value={editForm.rate_per_unit}
              onChange={e => {
                const ratePerUnit = Number(e.target.value) || 0
                setEditForm(f => ({ ...f, rate_per_unit: ratePerUnit, amount: calcAmount(f.quantity, ratePerUnit) }))
              }}
            />
          </div>
          <div className="form-group">
            <label>{t('orders.amount')}</label>
            <input type="number" step="0.01" value={editForm.amount} readOnly />
          </div>
          <div className="form-group">
            <label>{t('orders.deadline')}</label>
            <input type="date" value={editForm.deadline_at} onChange={e => setEditForm(f => ({ ...f, deadline_at: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="primary" onClick={submitEdit}>{t('common.save')}</button>
            <button type="button" onClick={() => setEditId(null)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
