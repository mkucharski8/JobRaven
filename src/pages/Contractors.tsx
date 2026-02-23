import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getCountryDisplayLabel, getCountryOptions, getCountryCodeFromName } from '../utils/vatConfig'

type VatCodeDef = { code_pl: string; label_pl: string; code_en: string; label_en: string }
function getCanonicalVatCode(def: VatCodeDef): string {
  const pl = String(def.code_pl ?? '').trim().toUpperCase()
  return pl || String(def.code_en ?? '').trim().toUpperCase() || ''
}

type ContractorRow = {
  id: number
  name: string
  short_name: string
  street: string | null
  building: string | null
  local: string | null
  postal_code: string | null
  city: string | null
  country: string | null
  country_code: string | null
  address_extra: string | null
  nip: string | null
  default_payment_days?: number
  email: string | null
  website: string | null
  phone: string | null
  contact_person: string | null
  notes: string | null
  client_adds_vat?: number
  client_vat_code?: string | null
  client_vat_rate?: number | null
}

const emptyForm: Partial<ContractorRow> = {
  name: '', short_name: '', street: '', building: '', local: '', postal_code: '', city: '', country: '', country_code: '', address_extra: '',
  nip: '', default_payment_days: 14, email: '', website: '', phone: '', contact_person: '', notes: '',
  client_adds_vat: 0, client_vat_code: null, client_vat_rate: null
}

export default function Contractors() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const editId = searchParams.get('edit')
  const [list, setList] = useState<ContractorRow[]>([])
  const [filter, setFilter] = useState<Partial<Record<keyof ContractorRow, string>>>({})
  const [sortBy, setSortBy] = useState<keyof ContractorRow | ''>('short_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [form, setForm] = useState<Partial<ContractorRow>>(emptyForm)
  const [units, setUnits] = useState<{ id: number; name: string }[]>([])
  const [languagePairs, setLanguagePairs] = useState<{ id: number; label: string }[]>([])
  const [unitRates, setUnitRates] = useState<Record<string, number>>({}) // key: unitId_langPairId or unitId_any
  const [loading, setLoading] = useState(true)
  const [gusLoading, setGusLoading] = useState(false)
  const [gusMessage, setGusMessage] = useState<string | null>(null)
  const [showNipModal, setShowNipModal] = useState(false)
  const [modalNip, setModalNip] = useState('')
  const [contractorsActionsOpenId, setContractorsActionsOpenId] = useState<number | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [vatCodeDefs, setVatCodeDefs] = useState<VatCodeDef[]>([])
  const actionsTriggerRef = useRef<HTMLButtonElement | null>(null)
  const actionsDropdownRef = useRef<HTMLDivElement | null>(null)
  const showForm = !!editId || searchParams.get('add') === '1'

  useLayoutEffect(() => {
    if (contractorsActionsOpenId == null || !actionsTriggerRef.current || !actionsDropdownRef.current) return
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
  }, [contractorsActionsOpenId])

  const load = () => {
    if (!window.api) return
    window.api.contractors.list().then((data: unknown) => {
      setList((data as ContractorRow[]) ?? [])
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (contractorsActionsOpenId === null) return
    const onDocClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.actions-dropdown-wrap')) setContractorsActionsOpenId(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [contractorsActionsOpenId])

  useEffect(() => {
    if (!showForm || !window.api?.settings?.get) return
    window.api.settings.get('vat_code_definitions').then((raw: string | null | undefined) => {
      if (raw && typeof raw === 'string' && raw.trim()) {
        try {
          const arr = JSON.parse(raw) as unknown
          if (Array.isArray(arr)) setVatCodeDefs(arr as VatCodeDef[])
          else setVatCodeDefs([])
        } catch { setVatCodeDefs([]) }
      } else setVatCodeDefs([])
    }).catch(() => setVatCodeDefs([]))
  }, [showForm])

  useEffect(() => {
    if (!editId || !window.api) return
    window.api.contractors.get(parseInt(editId, 10)).then((row: unknown) => {
      const r = row as ContractorRow
      if (r) {
        const resolved = { ...r }
        if (!resolved.country_code && resolved.country) resolved.country_code = getCountryCodeFromName(resolved.country)
        setForm(resolved)
      }
    })
  }, [editId])

  useEffect(() => {
    if (!window.api) return
    window.api.units.list().then((u: unknown) => setUnits((u as { id: number; name: string }[])))
  }, [])

  useEffect(() => {
    if (!window.api) return
    window.api.languagePairs.list().then((p: unknown) =>
      setLanguagePairs((p as { id: number; label: string }[]).map(x => ({ id: x.id, label: x.label })))
    )
  }, [])

  useEffect(() => {
    if (!editId || !window.api) return
    const contractorId = parseInt(editId, 10)
    window.api.contractorUnitRates.list(contractorId).then((rates: unknown) => {
      const list = rates as { unit_id: number; language_pair_id: number | null; rate: number }[]
      const map: Record<string, number> = {}
      list.forEach(({ unit_id, language_pair_id, rate }) => {
        const key = `${unit_id}_${language_pair_id ?? 'any'}`
        map[key] = rate
      })
      setUnitRates(map)
    })
  }, [editId])

  const rateKey = (unitId: number, languagePairId: number | null) => `${unitId}_${languagePairId ?? 'any'}`

  const saveRate = async (unitId: number, languagePairId: number | null, rate: number) => {
    if (!editId || !window.api) return
    await window.api.contractorUnitRates.set(parseInt(editId, 10), unitId, rate, languagePairId)
    setUnitRates(prev => ({ ...prev, [rateKey(unitId, languagePairId)]: rate }))
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
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
      default_payment_days: Number(form.default_payment_days) || 14,
      email: form.email || null,
      website: form.website || null,
      phone: form.phone || null,
      contact_person: form.contact_person || null,
      notes: form.notes || null,
      client_adds_vat: form.client_adds_vat ? 1 : 0,
      client_vat_code: form.client_adds_vat && form.client_vat_code ? form.client_vat_code : null,
      client_vat_rate: form.client_adds_vat && form.client_vat_code === '' && form.client_vat_rate != null && form.client_vat_rate !== '' ? Number(form.client_vat_rate) : null
    }
    if (editId) {
      await window.api.contractors.update(parseInt(editId, 10), payload)
      setSearchParams({})
    } else {
      await window.api.contractors.add(payload)
    }
    setForm(emptyForm)
    load()
  }

  const deleteContractor = async (id: number) => {
    const okDel = confirm(t('contractors.deleteConfirm')); window.api?.app?.refocusWindow?.(); if (!window.api || !okDel) return
    await window.api.contractors.delete(id)
    load()
    if (editId === String(id)) setSearchParams({})
  }

  const fetchByNip = async (nipFromModal?: string) => {
    const nip = (nipFromModal ?? (form.nip ?? '')).trim().replace(/\s|-/g, '')
    if (!nip) {
      setGusMessage(t('contractors.fetchByNipError', { message: t('contractors.enterNipFirst') }))
      return
    }
    if (!window.api?.gus?.fetchByNip) return
    setGusLoading(true)
    setGusMessage(null)
    try {
      const result = await window.api.gus.fetchByNip(nip)
      if ('error' in result) {
        setGusMessage(result.error === 'MANUAL_ENTRY_REQUIRED' ? t('contractors.fetchByNipManualEntry') : t('contractors.fetchByNipError', { message: result.error }))
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
        country_code: (result as { country_code?: string }).country_code ?? getCountryCodeFromName(result.country) ?? prev.country_code ?? null,
        contact_person: result.contact_person || prev.contact_person || null
      }))
      setGusMessage(t('contractors.fetchByNipSuccess'))
      setShowNipModal(false)
      setModalNip('')
    } finally {
      setGusLoading(false)
    }
  }

  const submitNipModal = () => { fetchByNip(modalNip) }

  const matches = (row: ContractorRow, key: keyof ContractorRow, v: string) => {
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
    const key = sortBy as keyof ContractorRow
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

  const countryOptions = useMemo(() => getCountryOptions(i18n.language), [i18n.language])

  if (loading) return <div>{t('common.loading')}</div>

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>{t('contractors.title')}</h1>
      <p>
        <button className="primary" onClick={() => { setSearchParams({ add: '1' }); setForm(emptyForm) }}>{t('contractors.add')}</button>
      </p>
      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <form onSubmit={save}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>{editId ? t('contractors.edit') : t('contractors.add')}</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="primary">{t('common.save')}</button>
                <button type="button" onClick={() => { setSearchParams({}); setForm(emptyForm) }}>{t('common.cancel')}</button>
              </div>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <button type="button" onClick={() => setShowNipModal(true)} disabled={gusLoading} title={t('contractors.fetchByNipHint')}>
                {gusLoading ? t('contractors.fetchByNipLoading') : t('contractors.fetchByNip')}
              </button>
            </div>
            <div className="grid2">
              <div className="form-group">
                <label>{t('contractors.name')}</label>
                <input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value, short_name: f.short_name || e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>{t('contractors.shortName')}</label>
                <input value={form.short_name ?? ''} onChange={e => setForm(f => ({ ...f, short_name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>{t('contractors.street')}</label>
                <input value={form.street ?? ''} onChange={e => setForm(f => ({ ...f, street: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('contractors.building')}</label>
                <input value={form.building ?? ''} onChange={e => setForm(f => ({ ...f, building: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('contractors.local')}</label>
                <input value={form.local ?? ''} onChange={e => setForm(f => ({ ...f, local: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('contractors.postalCode')}</label>
                <input value={form.postal_code ?? ''} onChange={e => setForm(f => ({ ...f, postal_code: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('contractors.city')}</label>
                <input value={form.city ?? ''} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('contractors.country')}</label>
                <select
                  value={form.country_code ?? ''}
                  onChange={e => {
                    const code = e.target.value || null
                    const label = countryOptions.find(c => c.code === code)?.label ?? ''
                    setForm(f => ({ ...f, country_code: code ?? '', country: label || '' }))
                  }}
                >
                  <option value="">—</option>
                  {countryOptions.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>{t('contractors.defaultPaymentDays')}</label>
                <input type="number" value={form.default_payment_days ?? 14} onChange={e => setForm(f => ({ ...f, default_payment_days: parseInt(e.target.value, 10) || 14 }))} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0 }}>
                  <input type="checkbox" checked={!!form.client_adds_vat} onChange={e => setForm(f => ({ ...f, client_adds_vat: e.target.checked ? 1 : 0, client_vat_code: e.target.checked ? (f.client_vat_code ?? '') : '', client_vat_rate: e.target.checked ? (f.client_vat_rate ?? null) : null }))} />
                  {t('contractors.clientAddsVat')}
                </label>
                {form.client_adds_vat && (
                  <>
                    <span style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>{t('contractors.clientVatCode')}:</span>
                    <select value={form.client_vat_code ?? ''} onChange={e => setForm(f => ({ ...f, client_vat_code: e.target.value, client_vat_rate: e.target.value ? null : f.client_vat_rate }))} style={{ minWidth: 100 }}>
                      <option value="">{t('contractors.clientVatRate')}</option>
                      {vatCodeDefs.filter(d => getCanonicalVatCode(d)).map((d, i) => (
                        <option key={i} value={getCanonicalVatCode(d)}>{i18n.language === 'pl' ? (d.code_pl ?? '').trim() : (d.code_en ?? '').trim() || getCanonicalVatCode(d)}</option>
                      ))}
                    </select>
                    {(!form.client_vat_code || form.client_vat_code === '') && (
                      <input type="number" step="any" min={0} max={100} value={form.client_vat_rate ?? ''} onChange={e => setForm(f => ({ ...f, client_vat_rate: e.target.value === '' ? null : parseFloat(e.target.value) }))} placeholder="23" style={{ width: 64 }} />
                    )}
                  </>
                )}
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>{t('contractors.addressExtra')}</label>
                <input value={form.address_extra ?? ''} onChange={e => setForm(f => ({ ...f, address_extra: e.target.value }))} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>{t('contractors.nip')}</label>
                <input value={form.nip ?? ''} onChange={e => setForm(f => ({ ...f, nip: e.target.value }))} placeholder="10 cyfr" style={{ width: 140 }} />
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#71717a' }}>{t('contractors.fetchByNipFailureHint')}</p>
                {gusMessage && <p className={gusMessage.includes('loaded') || gusMessage.includes('załadowane') ? 'msg-success' : 'msg-error'} style={{ margin: '4px 0 0', fontSize: '0.875rem' }}>{gusMessage}</p>}
              </div>
              <div className="form-group">
                <label>{t('contractors.email')}</label>
                <input type="email" value={form.email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('contractors.website')}</label>
                <input value={form.website ?? ''} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('contractors.phone')}</label>
                <input value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('contractors.contactPerson')}</label>
                <input value={form.contact_person ?? ''} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>{t('contractors.notes')}</label>
                <textarea rows={2} value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ width: '100%' }} />
              </div>
            </div>
            {editId && units.length > 0 && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #27272a' }}>
                <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>{t('contractors.ratesPerUnit')}</h3>
                <p style={{ color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '1rem' }}>{t('contractors.ratesPerUnitHint')}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {units.map(u => (
                    <div key={u.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.75rem 1rem', background: 'var(--color-surface)' }}>
                      <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9375rem' }}>{u.name}</div>
                      <table style={{ width: '100%', maxWidth: 360 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', fontWeight: 600, fontSize: '0.8125rem', padding: '4px 8px 4px 0' }}>{t('orders.languagePair')}</th>
                            <th style={{ textAlign: 'left', fontWeight: 600, fontSize: '0.8125rem', width: 100 }}>{t('orders.ratePerUnit')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ padding: '4px 8px 4px 0', fontSize: '0.875rem' }}>{t('contractors.rateAnyDirection')}</td>
                            <td style={{ padding: 4 }}>
                              <input
                                type="number"
                                step="any"
                                value={unitRates[rateKey(u.id, null)] ?? ''}
                                onChange={e => setUnitRates(prev => ({ ...prev, [rateKey(u.id, null)]: parseFloat(e.target.value) || 0 }))}
                                onBlur={e => {
                                  const v = parseFloat((e.target as HTMLInputElement).value)
                                  if (!Number.isNaN(v) && v >= 0) saveRate(u.id, null, v)
                                }}
                                placeholder="—"
                                style={{ width: '100%', maxWidth: 120 }}
                              />
                            </td>
                          </tr>
                          {languagePairs.map(lp => (
                            <tr key={lp.id}>
                              <td style={{ padding: '4px 8px 4px 0', fontSize: '0.875rem' }}>{lp.label}</td>
                              <td style={{ padding: 4 }}>
                                <input
                                  type="number"
                                  step="any"
                                  value={unitRates[rateKey(u.id, lp.id)] ?? ''}
                                  onChange={e => setUnitRates(prev => ({ ...prev, [rateKey(u.id, lp.id)]: parseFloat(e.target.value) || 0 }))}
                                  onBlur={e => {
                                    const v = parseFloat((e.target as HTMLInputElement).value)
                                    if (!Number.isNaN(v) && v >= 0) saveRate(u.id, lp.id, v)
                                  }}
                                  placeholder="—"
                                  style={{ width: '100%', maxWidth: 120 }}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </form>
        </div>
      )}
      {showNipModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setShowNipModal(false)}>
          <div className="card" style={{ minWidth: 320 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{t('contractors.fetchByNip')}</h3>
            <p style={{ fontSize: '0.875rem', color: '#71717a', marginBottom: 12 }}>{t('contractors.fetchByNipHint')}</p>
            <div className="form-group">
              <label>{t('contractors.nip')}</label>
              <input value={modalNip} onChange={e => setModalNip(e.target.value)} placeholder="10 cyfr" style={{ width: '100%' }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitNipModal() } }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" onClick={() => { setShowNipModal(false); setModalNip('') }}>{t('common.cancel')}</button>
              <button type="button" className="primary" onClick={submitNipModal} disabled={gusLoading}>{gusLoading ? t('contractors.fetchByNipLoading') : t('common.ok')}</button>
            </div>
          </div>
        </div>
      )}
      {list.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{t('orderBook.sortBy')}</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as keyof ContractorRow)} style={{ minWidth: 160 }}>
              <option value="short_name">{t('contractors.shortName')}</option>
              <option value="name">{t('contractors.name')}</option>
              <option value="street">{t('contractors.street')}</option>
              <option value="building">{t('contractors.building')}</option>
              <option value="local">{t('contractors.local')}</option>
              <option value="city">{t('contractors.city')}</option>
              <option value="postal_code">{t('contractors.postalCode')}</option>
              <option value="country">{t('contractors.country')}</option>
              <option value="nip">{t('contractors.nip')}</option>
              <option value="default_payment_days">{t('contractors.defaultPaymentDays')}</option>
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
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('contractors.shortName')} ({t('orderBook.filterContains')})</div>
                <input type="text" value={filter.short_name ?? ''} onChange={e => setFilter(f => ({ ...f, short_name: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('contractors.name')} ({t('orderBook.filterContains')})</div>
                <input type="text" value={filter.name ?? ''} onChange={e => setFilter(f => ({ ...f, name: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('contractors.street')} ({t('orderBook.filterContains')})</div>
                <input type="text" value={filter.street ?? ''} onChange={e => setFilter(f => ({ ...f, street: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('contractors.building')} ({t('orderBook.filterContains')})</div>
                <input type="text" value={filter.building ?? ''} onChange={e => setFilter(f => ({ ...f, building: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('contractors.local')} ({t('orderBook.filterContains')})</div>
                <input type="text" value={filter.local ?? ''} onChange={e => setFilter(f => ({ ...f, local: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('contractors.city')} ({t('orderBook.filterContains')})</div>
                <input type="text" value={filter.city ?? ''} onChange={e => setFilter(f => ({ ...f, city: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('contractors.postalCode')} ({t('orderBook.filterContains')})</div>
                <input type="text" value={filter.postal_code ?? ''} onChange={e => setFilter(f => ({ ...f, postal_code: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('contractors.country')} ({t('orderBook.filterContains')})</div>
                <input type="text" value={filter.country ?? ''} onChange={e => setFilter(f => ({ ...f, country: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('contractors.nip')} ({t('orderBook.filterContains')})</div>
                <input type="text" value={filter.nip ?? ''} onChange={e => setFilter(f => ({ ...f, nip: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('contractors.defaultPaymentDays')}</div>
                <input type="text" value={filter.default_payment_days ?? ''} onChange={e => setFilter(f => ({ ...f, default_payment_days: e.target.value }))} placeholder="—" style={{ width: '100%' }} />
              </div>
            </div>
          )}
        </div>
      )}
      <div className="card table-wrap">
        {list.length === 0 ? (
          <p>{t('contractors.noContractors')}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('contractors.shortName')}</th>
                <th>{t('contractors.name')}</th>
                <th>{t('contractors.street')}</th>
                <th>{t('contractors.building')}</th>
                <th>{t('contractors.local')}</th>
                <th>{t('contractors.city')}</th>
                <th>{t('contractors.postalCode')}</th>
                <th>{t('contractors.country')}</th>
                <th>{t('contractors.nip')}</th>
                <th>{t('contractors.defaultPaymentDays')}</th>
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
                      <button type="button" className="actions-dots-trigger" onClick={(e) => { e.stopPropagation(); actionsTriggerRef.current = e.currentTarget; setContractorsActionsOpenId(prev => prev === c.id ? null : c.id) }} aria-expanded={contractorsActionsOpenId === c.id} title={t('common.actions')}><span className="actions-dots" aria-hidden>⋯</span></button>
                      {contractorsActionsOpenId === c.id && (
                        <div ref={actionsDropdownRef} className="actions-dropdown" onClick={e => e.stopPropagation()}>
                          <button type="button" onClick={() => { setSearchParams({ edit: String(c.id) }); setContractorsActionsOpenId(null) }}>{t('common.edit')}</button>
                          <button type="button" onClick={() => { navigate(`/subcontracts?contractorId=${c.id}`); setContractorsActionsOpenId(null) }}>{t('contractors.showSubcontracts')}</button>
                          <button type="button" className="danger" onClick={() => { deleteContractor(c.id); setContractorsActionsOpenId(null) }}>{t('common.delete')}</button>
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
