import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { formatNumber } from '../utils/numberLocale'
import wfirmaBadge from '../assets/wfirma-badge.svg'

type InvoiceRow = {
  id: number
  client_id?: number
  order_number: string | null
  client_short_name: string
  invoice_number: string | null
  invoice_date: string | null
  invoice_sale_date?: string | null
  payment_due_at: string | null
  amount: number
  translation_type?: 'oral' | 'written' | null
  oral_net?: number | null
  invoice_status: string
  invoice_notes?: string | null
  invoice_bank_account_id?: number | null
  rate_currency?: string | null
  invoice_provider_source?: string | null
  order_vat_rate?: number | null
  order_vat_code?: string | null
}

function orderNet(o: InvoiceRow): number {
  if (o.translation_type === 'oral' && o.oral_net != null) return Number(o.oral_net)
  return Number(o.amount) || 0
}

function orderVat(o: InvoiceRow): number {
  const net = orderNet(o)
  const hasExemption = o.order_vat_code != null && String(o.order_vat_code).trim() !== ''
  if (hasExemption) return 0
  const rate = Number(o.order_vat_rate)
  if (!Number.isFinite(rate)) return net * 0.23
  return (net * rate) / 100
}

function orderGross(o: InvoiceRow): number {
  return orderNet(o) + orderVat(o)
}

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString()
}

type BankAccount = { id: number; bank_name: string; account_number: string; swift: string; currency: string; is_default: number }

export default function Invoices() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  useEffect(() => {}, [navigate])
  const [orders, setOrders] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sortBy, setSortBy] = useState<'invoice_date' | 'client' | 'amount'>('invoice_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  // PDF export modal
  const [pdfModal, setPdfModal] = useState<{ orderIds: number[] } | null>(null)
  const [pdfNotes, setPdfNotes] = useState('')
  const [pdfIncludeNotes, setPdfIncludeNotes] = useState(false)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<number | 0>(0)
  const [editInvoiceModal, setEditInvoiceModal] = useState<{ orderIds: number[]; invoice_number: string; invoice_date: string; invoice_sale_date: string; payment_due_at: string; invoice_notes: string; invoice_bank_account_id: number } | null>(null)
  const [invoiceProvider, setInvoiceProvider] = useState<string | null>(null)
  const [invoicesActionsOpenKey, setInvoicesActionsOpenKey] = useState<string | null>(null)
  const [selectedInvoiceKeys, setSelectedInvoiceKeys] = useState<Set<string>>(new Set())
  const [batchExporting, setBatchExporting] = useState(false)
  const actionsTriggerRef = useRef<HTMLButtonElement | null>(null)
  const actionsDropdownRef = useRef<HTMLDivElement | null>(null)

  const toggleSelectInvoice = (rowKey: string) => {
    setSelectedInvoiceKeys(prev => {
      const next = new Set(prev)
      if (next.has(rowKey)) next.delete(rowKey)
      else next.add(rowKey)
      return next
    })
  }

  useLayoutEffect(() => {
    if (invoicesActionsOpenKey === null || !actionsTriggerRef.current || !actionsDropdownRef.current) return
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
  }, [invoicesActionsOpenKey])

  const load = () => {
    if (!window.api) return
    window.api.orders.list().then((data: unknown) => {
      const all = data as (InvoiceRow & { invoice_number?: string | null })[]
      const issued = all.filter(o => o.invoice_number != null && o.invoice_number !== '')
      setOrders(issued)
      setLoading(false)
    })
    window.api.settings?.get?.('invoice_provider').then((v: unknown) => {
      setInvoiceProvider(typeof v === 'string' ? v : null)
    }).catch(() => setInvoiceProvider(null))
    window.api.bankAccounts?.list?.().then((list: unknown) => {
      setBankAccounts(Array.isArray(list) ? list as BankAccount[] : [])
    }).catch(() => {})
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (invoicesActionsOpenKey === null) return
    const onDocClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.actions-dropdown-wrap')) setInvoicesActionsOpenKey(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [invoicesActionsOpenKey])

  const openPdfModal = async (orderIds: number[]) => {
    setPdfModal({ orderIds })
    const firstOrder = orders.find(o => o.id === orderIds[0]) as InvoiceRow | undefined
    const fromOrderNotes = firstOrder?.invoice_notes ?? ''
    const fromOrderBankId = firstOrder?.invoice_bank_account_id ?? 0
    let defaultNotes = (fromOrderNotes && fromOrderNotes.trim()) ? fromOrderNotes : ''
    if (!defaultNotes) {
      try {
        const listRaw = (await window.api?.settings?.get?.('invoice_notes_list')) as string | null | undefined
        if (listRaw && typeof listRaw === 'string' && listRaw.trim()) {
          const list = JSON.parse(listRaw)
          if (Array.isArray(list) && list.length > 0) defaultNotes = list.filter((x: unknown) => typeof x === 'string').join('\n')
        }
      } catch { /* ignore */ }
      if (!defaultNotes) defaultNotes = ((await window.api?.settings?.get?.('invoice_notes')) as string) ?? ''
    }
    setPdfNotes(defaultNotes)
    setPdfIncludeNotes(!!defaultNotes?.trim())
    const ba = bankAccounts.length > 0 ? bankAccounts : (await window.api?.bankAccounts?.list?.() ?? []) as BankAccount[]
    if (ba.length > 0) setBankAccounts(ba)
    const def = fromOrderBankId ? ba.find(b => b.id === fromOrderBankId) : null
    setSelectedBankAccountId(def ? def.id : (ba.find(b => b.is_default === 1)?.id ?? 0))
  }

  const exportPdf = async () => {
    if (!pdfModal) return
    const extra: { notes?: string; bankAccountId?: number } = {}
    if (pdfIncludeNotes && pdfNotes.trim()) extra.notes = pdfNotes.trim()
    if (selectedBankAccountId) extra.bankAccountId = selectedBankAccountId
    if (pdfModal.orderIds.length > 1 && window.api?.export?.invoicePdfMulti) {
      await window.api.export.invoicePdfMulti(pdfModal.orderIds, extra)
    } else {
      await window.api?.export?.invoicePdf?.(pdfModal.orderIds[0], extra)
    }
    setPdfModal(null)
  }

  const filtered = useMemo(() => {
    let list = [...orders]
    if (filterStatus) list = list.filter(o => o.invoice_status === filterStatus)
    if (filterDateFrom) list = list.filter(o => (o.invoice_date || '') >= filterDateFrom)
    if (filterDateTo) list = list.filter(o => (o.invoice_date || '') <= filterDateTo)
    list.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'invoice_date') cmp = (a.invoice_date || '').localeCompare(b.invoice_date || '')
      else if (sortBy === 'client') cmp = (a.client_short_name || '').localeCompare(b.client_short_name || '')
      else if (sortBy === 'amount') cmp = orderGross(a) - orderGross(b)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [orders, filterStatus, filterDateFrom, filterDateTo, sortBy, sortDir])

  /** Grupowanie po (invoice_number, client_id) – jedna faktura = jedna pozycja w tabeli, wiele zleceń = wiele pozycji na PDF. */
  const groupedInvoices = useMemo(() => {
    const map = new Map<string, { invoice_number: string; invoice_date: string | null; payment_due_at: string | null; client_short_name: string; totalNet: number; totalVat: number; totalGross: number; invoice_status: string; orderIds: number[]; hasWfirmaSource: boolean }>()
    for (const o of filtered) {
      const key = `${o.invoice_number ?? ''}\t${(o as InvoiceRow).client_id ?? ''}`
      const net = orderNet(o as InvoiceRow)
      const vat = orderVat(o as InvoiceRow)
      const gross = orderGross(o as InvoiceRow)
      const existing = map.get(key)
      if (existing) {
        existing.totalNet += net
        existing.totalVat += vat
        existing.totalGross += gross
        existing.orderIds.push(o.id)
        existing.hasWfirmaSource = existing.hasWfirmaSource || o.invoice_provider_source === 'wfirma' || (!o.invoice_provider_source && invoiceProvider === 'wfirma')
      } else {
        map.set(key, {
          invoice_number: o.invoice_number ?? '—',
          invoice_date: o.invoice_date ?? null,
          payment_due_at: o.payment_due_at ?? null,
          client_short_name: o.client_short_name ?? '—',
          totalNet: net,
          totalVat: vat,
          totalGross: gross,
          invoice_status: o.invoice_status ?? 'issued',
          orderIds: [o.id],
          hasWfirmaSource: o.invoice_provider_source === 'wfirma' || (!o.invoice_provider_source && invoiceProvider === 'wfirma')
        })
      }
    }
    return Array.from(map.values())
  }, [filtered, invoiceProvider])

  const totals = useMemo(() => {
    return groupedInvoices.reduce(
      (s, g) => ({ net: s.net + g.totalNet, vat: s.vat + g.totalVat, gross: s.gross + g.totalGross }),
      { net: 0, vat: 0, gross: 0 }
    )
  }, [groupedInvoices])

  const toggleSelectAllInvoices = () => {
    if (selectedInvoiceKeys.size >= groupedInvoices.length) {
      setSelectedInvoiceKeys(new Set())
    } else {
      setSelectedInvoiceKeys(new Set(groupedInvoices.map(g => `${g.invoice_number}-${g.client_short_name}-${g.orderIds.join(',')}`)))
    }
  }
  const selectedGroups = useMemo(() => {
    return groupedInvoices.filter(g => selectedInvoiceKeys.has(`${g.invoice_number}-${g.client_short_name}-${g.orderIds.join(',')}`))
  }, [groupedInvoices, selectedInvoiceKeys])

  const batchPrintInvoices = async () => {
    if (selectedGroups.length === 0) {
      alert(t('invoices.noInvoicesSelected'))
      return
    }
    if (!window.api?.dialog?.chooseDirectory || typeof window.api?.export?.invoicePdfToPath !== 'function') return
    const folder = await window.api.dialog.chooseDirectory()
    if (!folder) return
    setBatchExporting(true)
    const extra: { notes?: string; bankAccountId?: number } = {}
    const firstOrder = orders.find(o => o.id === selectedGroups[0]?.orderIds[0]) as InvoiceRow | undefined
    if (firstOrder?.invoice_provider_source !== 'wfirma' && bankAccounts.length > 0) {
      const def = firstOrder?.invoice_bank_account_id ? bankAccounts.find(b => b.id === firstOrder.invoice_bank_account_id) : null
      if (def) extra.bankAccountId = def.id
      else {
        const defaultBa = bankAccounts.find(b => b.is_default === 1)
        if (defaultBa) extra.bankAccountId = defaultBa.id
      }
    }
    let ok = 0
    let fail = 0
    for (const g of selectedGroups) {
      const safeName = String(g.invoice_number === '—' ? g.orderIds[0] : g.invoice_number).replace(/[/\\?%*:|"]/g, '-').trim() || 'faktura'
      const filePath = folder + '/' + safeName + '.pdf'
      const success = await window.api.export.invoicePdfToPath(g.orderIds, filePath, extra)
      if (success) ok++
      else fail++
    }
    setBatchExporting(false)
    setSelectedInvoiceKeys(new Set())
    if (fail > 0) alert(t('invoices.batchExportSomeFailed', { ok, fail }))
    else if (ok > 0) alert(t('invoices.batchExportDone', { count: ok }))
  }

  if (loading) return <div>{t('common.loading')}</div>

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>{t('invoices.title')}</h1>
      <p style={{ color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '1rem' }}>{t('invoices.hint')}</p>

      {orders.length === 0 ? (
        <div className="card">
          <p>{t('invoices.noInvoices')}</p>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>{t('orderBook.sortBy')}</span>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
                <option value="invoice_date">{t('orders.invoiceDate')}</option>
                <option value="client">{t('orders.client')}</option>
                <option value="amount">{t('orders.amount')}</option>
              </select>
              <button type="button" onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}>{sortDir === 'asc' ? '↑' : '↓'}</button>
              <button type="button" onClick={() => setFiltersOpen(o => !o)} style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {t('orderBook.addFilter')}
                {(filterStatus || filterDateFrom || filterDateTo) ? (
                  <span style={{ background: '#3b82f6', color: '#fff', borderRadius: 10, padding: '2px 6px', fontSize: '0.75rem', marginLeft: 4 }}>
                    {(filterStatus ? 1 : 0) + (filterDateFrom ? 1 : 0) + (filterDateTo ? 1 : 0)}
                  </span>
                ) : null}
                <span style={{ marginLeft: 4 }}>{filtersOpen ? '\u25BE' : '\u25B8'}</span>
              </button>
              {(filterStatus || filterDateFrom || filterDateTo) && (
                <button type="button" onClick={() => { setFilterStatus(''); setFilterDateFrom(''); setFilterDateTo('') }} style={{ fontSize: '0.875rem' }}>{t('orderBook.clearFilters')}</button>
              )}
              {(typeof window.api?.export?.invoicePdfToPath === 'function' && window.api?.dialog?.chooseDirectory) && (
              <>
                <button type="button" className="primary" onClick={batchPrintInvoices} disabled={batchExporting || selectedGroups.length === 0} style={{ marginLeft: 12 }}>
                  {batchExporting ? t('common.loading') : t('invoices.printSelected')} {selectedGroups.length > 0 ? `(${selectedGroups.length})` : ''}
                </button>
                {selectedGroups.length > 0 && (
                  <>
                    <button type="button" className="danger" onClick={async () => {
                      const count = selectedGroups.length
                      const msg = t('invoices.removeSelectedConfirm', { count })
                      const ok = confirm(msg)
                      window.api?.app?.refocusWindow?.()
                      if (!ok || !window.api) return
                      for (const g of selectedGroups) {
                        for (const id of g.orderIds) await window.api.orders.clearInvoice(id)
                      }
                      setSelectedInvoiceKeys(new Set())
                      load()
                    }}>{t('invoices.removeSelected')} ({selectedGroups.length})</button>
                    <button type="button" onClick={() => setSelectedInvoiceKeys(new Set())}>{t('invoices.deselectAll')}</button>
                  </>
                )}
              </>
            )}
            </div>
            {filtersOpen && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border, #e5e7eb)', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('orders.invoiceStatus')}</div>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="">—</option>
                    <option value="issued">{t('orders.invoiceStatus_issued')}</option>
                    <option value="awaiting_payment">{t('orders.invoiceStatus_awaiting_payment')}</option>
                    <option value="overdue">{t('orders.invoiceStatus_overdue')}</option>
                    <option value="paid">{t('orders.invoiceStatus_paid')}</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('invoices.filterDateFrom')}</div>
                  <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} title={t('invoices.filterDateFrom')} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>{t('invoices.filterDateTo')}</div>
                  <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} title={t('invoices.filterDateTo')} />
                </div>
              </div>
            )}
          </div>
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  {(typeof window.api?.export?.invoicePdfToPath === 'function' && window.api?.dialog?.chooseDirectory) && (
                    <th style={{ width: 40 }}>
                      <input type="checkbox" checked={groupedInvoices.length > 0 && selectedInvoiceKeys.size >= groupedInvoices.length} onChange={toggleSelectAllInvoices} title={t('invoices.selectAll')} aria-label={t('invoices.selectAll')} />
                    </th>
                  )}
                  <th>{t('orders.invoiceNumber')}</th>
                  <th>{t('orders.invoiceDate')}</th>
                  <th>{t('orders.client')}</th>
                  <th>{t('orders.net')}</th>
                  <th>{t('orders.vat')}</th>
                  <th>{t('orders.gross')}</th>
                  <th>{t('invoices.positions')}</th>
                  <th>{t('orders.paymentDue')}</th>
                  <th>{t('orders.invoiceStatus')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {groupedInvoices.map(g => {
                  const rowKey = `${g.invoice_number}-${g.client_short_name}-${g.orderIds.join(',')}`
                  const isSelected = selectedInvoiceKeys.has(rowKey)
                  return (
                  <tr key={rowKey}>
                    {(typeof window.api?.export?.invoicePdfToPath === 'function' && window.api?.dialog?.chooseDirectory) && (
                      <td>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelectInvoice(rowKey)} aria-label={g.invoice_number} />
                      </td>
                    )}
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span>{g.invoice_number}</span>
                        {g.hasWfirmaSource && (
                          <img src={wfirmaBadge} alt="wFirma" title="wFirma" width={14} height={14} style={{ display: 'inline-block', opacity: 0.95 }} />
                        )}
                      </span>
                    </td>
                    <td>{formatDate(g.invoice_date)}</td>
                    <td>{g.client_short_name}</td>
                    <td>{formatNumber(g.totalNet)}</td>
                    <td>{formatNumber(g.totalVat)}</td>
                    <td>{formatNumber(g.totalGross)}</td>
                    <td>{g.orderIds.length}</td>
                    <td>{formatDate(g.payment_due_at)}</td>
                    <td><span className={`badge ${g.invoice_status}`}>{t(`orders.invoiceStatus_${g.invoice_status}`)}</span></td>
                    <td>
                      <div className="actions-dropdown-wrap">
                        <button type="button" className="actions-dots-trigger" onClick={(e) => { e.stopPropagation(); actionsTriggerRef.current = e.currentTarget; setInvoicesActionsOpenKey(prev => prev === rowKey ? null : rowKey) }} aria-expanded={invoicesActionsOpenKey === rowKey} title={t('common.actions')}><span className="actions-dots" aria-hidden>⋯</span></button>
                        {invoicesActionsOpenKey === rowKey && (
                          <div ref={actionsDropdownRef} className="actions-dropdown" onClick={e => e.stopPropagation()}>
                            {((typeof window.api?.export?.invoicePdfMulti === 'function') || (typeof window.api?.export?.invoicePdf === 'function')) && (
                              <button type="button" onClick={() => {
                                setInvoicesActionsOpenKey(null)
                                const firstOrder = orders.find(o => o.id === g.orderIds[0])
                                const exportFromWfirma = firstOrder?.invoice_provider_source === 'wfirma'
                                if (exportFromWfirma) {
                                  if (g.orderIds.length > 1 && window.api?.export?.invoicePdfMulti) void window.api.export.invoicePdfMulti(g.orderIds)
                                  else void window.api?.export?.invoicePdf?.(g.orderIds[0])
                                } else openPdfModal(g.orderIds)
                              }}>{t('invoices.exportPdf')}</button>
                            )}
                            <button type="button" onClick={() => {
                              setInvoicesActionsOpenKey(null)
                              const first = orders.find(o => o.id === g.orderIds[0]) as InvoiceRow | undefined
                              setEditInvoiceModal({
                                orderIds: g.orderIds,
                                invoice_number: g.invoice_number === '—' ? '' : g.invoice_number,
                                invoice_date: g.invoice_date ? g.invoice_date.slice(0, 10) : '',
                                invoice_sale_date: first?.invoice_sale_date ? first.invoice_sale_date.slice(0, 10) : '',
                                payment_due_at: g.payment_due_at ? g.payment_due_at.slice(0, 10) : '',
                                invoice_notes: first?.invoice_notes ?? '',
                                invoice_bank_account_id: first?.invoice_bank_account_id ?? 0
                              })
                            }}>{t('common.edit')}</button>
                            <button type="button" className="danger" onClick={async () => {
                              setInvoicesActionsOpenKey(null)
                              const provider = (await window.api?.settings?.get?.('invoice_provider')) as string | null | undefined
                              const msg = provider === 'wfirma' ? `${t('orders.removeInvoiceConfirm')}\n\n${t('orders.removeInvoiceWfirmaHint')}` : t('orders.removeInvoiceConfirm')
                              const okInv = confirm(msg)
                              window.api?.app?.refocusWindow?.()
                              if (!okInv || !window.api) return
                              for (const id of g.orderIds) await window.api.orders.clearInvoice(id)
                              load()
                            }}>{t('orders.removeInvoice')}</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
            {groupedInvoices.length > 0 && (
              <p style={{ marginTop: '1rem', fontWeight: 600 }}>
                {t('analytics.total')}: {t('orders.net')} {formatNumber(totals.net)} · {t('orders.vat')} {formatNumber(totals.vat)} · {t('orders.gross')} {formatNumber(totals.gross)} ({groupedInvoices.length} {t('invoices.invoicesCount')})
              </p>
            )}
          </div>
        </>
      )}

      {/* Modal eksportu PDF z opcjami uwag i konta bankowego */}
      {pdfModal && (
        <div className="card" style={{ position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 100, minWidth: 380, maxWidth: 500 }}>
          <h3 style={{ marginTop: 0 }}>{t('invoices.exportPdf')}</h3>

          {/* Uwagi */}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={pdfIncludeNotes} onChange={e => setPdfIncludeNotes(e.target.checked)} />
              {t('invoices.includeNotes')}
            </label>
            {pdfIncludeNotes && (
              <textarea
                value={pdfNotes}
                onChange={e => setPdfNotes(e.target.value)}
                rows={3}
                style={{ width: '100%', marginTop: 6, resize: 'vertical' }}
                placeholder={t('settings.invoiceNotesPlaceholder')}
              />
            )}
          </div>

          {/* Konto bankowe */}
          {bankAccounts.length > 0 && (
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>{t('invoices.bankAccount')}</label>
              <select value={selectedBankAccountId} onChange={e => setSelectedBankAccountId(Number(e.target.value))}>
                <option value={0}>— {t('invoices.noBankAccount')} —</option>
                {bankAccounts.map(ba => (
                  <option key={ba.id} value={ba.id}>
                    {ba.bank_name ? `${ba.bank_name} (${ba.currency})` : `${ba.account_number.slice(0, 20)}… (${ba.currency})`}
                    {ba.is_default ? ` ★` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="primary" onClick={exportPdf}>{t('invoices.exportPdf')}</button>
            <button type="button" onClick={() => setPdfModal(null)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {/* Modal edycji faktury (nr, data, termin płatności, konto, uwagi) */}
      {editInvoiceModal && (
        <div className="card" style={{ position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 100, minWidth: 400, maxWidth: 520 }}>
          <h3 style={{ marginTop: 0 }}>{t('invoices.editInvoice')}</h3>
          <div className="form-group">
            <label>{t('orders.invoiceNumber')}</label>
            <input
              value={editInvoiceModal.invoice_number}
              onChange={e => setEditInvoiceModal(prev => prev ? { ...prev, invoice_number: e.target.value } : null)}
              placeholder="FV/2025/01"
              style={{ width: '100%' }}
            />
          </div>
          <div className="form-group">
            <label>{t('orders.invoiceDate')}</label>
            <input
              type="date"
              value={editInvoiceModal.invoice_date}
              onChange={e => setEditInvoiceModal(prev => prev ? { ...prev, invoice_date: e.target.value } : null)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="form-group">
            <label>{t('orders.saleDate')}</label>
            <input
              type="date"
              value={editInvoiceModal.invoice_sale_date}
              onChange={e => setEditInvoiceModal(prev => prev ? { ...prev, invoice_sale_date: e.target.value } : null)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="form-group">
            <label>{t('orders.paymentDue')}</label>
            <input
              type="date"
              value={editInvoiceModal.payment_due_at}
              onChange={e => setEditInvoiceModal(prev => prev ? { ...prev, payment_due_at: e.target.value } : null)}
              style={{ width: '100%' }}
            />
          </div>
          {bankAccounts.length > 0 && (
            <div className="form-group">
              <label>{t('invoices.bankAccount')}</label>
              <select
                value={editInvoiceModal.invoice_bank_account_id || ''}
                onChange={e => setEditInvoiceModal(prev => prev ? { ...prev, invoice_bank_account_id: e.target.value ? Number(e.target.value) : 0 } : null)}
                style={{ width: '100%' }}
              >
                <option value="">— {t('invoices.noBankAccount')} —</option>
                {bankAccounts.map(ba => (
                  <option key={ba.id} value={ba.id}>
                    {ba.bank_name ? `${ba.bank_name} (${ba.currency})` : `${ba.account_number.slice(0, 20)}… (${ba.currency})`}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="form-group">
            <label>{t('invoices.includeNotes')}</label>
            <textarea
              value={editInvoiceModal.invoice_notes}
              onChange={e => setEditInvoiceModal(prev => prev ? { ...prev, invoice_notes: e.target.value } : null)}
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
              placeholder={t('settings.invoiceNotesPlaceholder')}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="primary"
              onClick={async () => {
                if (!editInvoiceModal || !window.api) return
                const { orderIds, invoice_number, invoice_date, invoice_sale_date, payment_due_at, invoice_notes, invoice_bank_account_id } = editInvoiceModal
                for (const id of orderIds) {
                  await window.api.orders.update(id, {
                    invoice_number: invoice_number.trim() || null,
                    invoice_date: invoice_date || null,
                    invoice_sale_date: invoice_sale_date || null,
                    payment_due_at: payment_due_at || null,
                    invoice_notes: invoice_notes.trim() || null,
                    invoice_bank_account_id: invoice_bank_account_id || null
                  })
                }
                setEditInvoiceModal(null)
                load()
              }}
            >
              {t('common.save')}
            </button>
            <button type="button" onClick={() => setEditInvoiceModal(null)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
