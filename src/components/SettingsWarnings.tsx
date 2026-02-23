import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'

type WarningItem = { id: string; messageKey: string }

async function runChecks(api: typeof window.api): Promise<WarningItem[]> {
  const next: WarningItem[] = []
  if (!api?.settings?.get) return next

  const [
    company_name,
    first_name,
    last_name,
    personal_street,
    personal_city,
    personal_country,
    default_currency,
    rate_currencies,
    invoice_provider,
    seller_is_vat_payer,
    wfirma_access_key,
    wfirma_secret_key
  ] = await Promise.all([
    api.settings.get('company_name'),
    api.settings.get('first_name'),
    api.settings.get('last_name'),
    api.settings.get('personal_street'),
    api.settings.get('personal_city'),
    api.settings.get('personal_country'),
    api.settings.get('default_currency'),
    api.settings.get('rate_currencies'),
    api.settings.get('invoice_provider'),
    api.settings.get('seller_is_vat_payer'),
    api.settings.get('wfirma_access_key'),
    api.settings.get('wfirma_secret_key')
  ] as Promise<unknown>[])

  const trim = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const hasName = trim(company_name) || (trim(first_name) && trim(last_name))
  const hasAddress = trim(personal_street) && trim(personal_city) && trim(personal_country)
  if (!hasName || !hasAddress) next.push({ id: 'check1', messageKey: 'warnings.check1' })

  if (!trim(personal_country)) next.push({ id: 'taxpayer_country', messageKey: 'warnings.taxpayerCountryMissing' })

  if (api.orderBooks?.list) {
    const books = (await api.orderBooks.list()) as { id: number; archived?: number }[]
    const active = books.filter(b => !b.archived)
    if (active.length === 0) next.push({ id: 'check2', messageKey: 'warnings.check2' })
  }

  let hasAnyCurrency = false
  try {
    if (api.settings.hasRateCurrencies) {
      const v = await (api.settings.hasRateCurrencies() as Promise<boolean>).catch(() => false)
      hasAnyCurrency = v === true
    }
    if (!hasAnyCurrency) {
      const rc = rate_currencies
      let list: string[] = []
      if (Array.isArray(rc)) list = rc.filter((x: unknown) => typeof x === 'string' && (x as string).trim()) as string[]
      else if (typeof rc === 'string' && rc.trim()) {
        const parsed = JSON.parse(rc) as unknown
        if (Array.isArray(parsed)) list = parsed.filter((x: unknown) => typeof x === 'string' && (x as string).trim()) as string[]
      }
      hasAnyCurrency = list.length > 0 || String(default_currency ?? '').trim().length > 0
    }
  } catch { /* ignore */ }
  if (!hasAnyCurrency) next.push({ id: 'check3', messageKey: 'warnings.check3' })

  if (typeof api.services?.list === 'function') {
    const services = (await api.services.list()) as { id: number }[]
    if (!services?.length) next.push({ id: 'check4', messageKey: 'warnings.check4' })
    else if (typeof api.serviceVatRules?.listByService === 'function') {
      const rulesPerService = await Promise.all(services.map(s => api.serviceVatRules!.listByService(s.id).then((r: unknown) => (r as unknown[]).length)))
      const someWithoutVat = rulesPerService.some(n => n === 0)
      if (someWithoutVat) next.push({ id: 'check8', messageKey: 'warnings.check8' })
    }
  }

  if (api.unitCategories?.list) {
    const cats = (await api.unitCategories.list()) as unknown[]
    if (!cats?.length) next.push({ id: 'check5a', messageKey: 'warnings.check5a' })
  }
  if (api.units?.list) {
    const units = (await api.units.list()) as unknown[]
    if (!units?.length) next.push({ id: 'check5b', messageKey: 'warnings.check5b' })
  }

  if (api.orderBooks?.list) {
    const books = (await api.orderBooks.list()) as { id: number; view_type?: string; archived?: number; repertorium_oral_unit_id?: number | null; repertorium_page_unit_id?: number | null }[]
    const repertorium = books?.filter(b => b.view_type === 'repertorium' && !b.archived) ?? []
    if (repertorium.length > 0) {
      const missing = repertorium.some(b => b.repertorium_oral_unit_id == null && b.repertorium_page_unit_id == null)
      if (missing) next.push({ id: 'check6', messageKey: 'warnings.check6' })
    }
  }

  if (api.defaultUnitRates?.list) {
    const rates = (await api.defaultUnitRates.list()) as unknown[]
    if (!rates?.length) next.push({ id: 'check7', messageKey: 'warnings.check7' })
  }

  const defaultCurrencyVal = String(default_currency ?? '').trim()
  if (!defaultCurrencyVal) next.push({ id: 'check9', messageKey: 'warnings.check9' })

  if (String(invoice_provider ?? '').trim() === 'wfirma') {
    if (!trim(wfirma_access_key) || !trim(wfirma_secret_key)) {
      next.push({ id: 'check11', messageKey: 'warnings.wfirmaKeysMissing' })
    }
    const vatPayer = String(seller_is_vat_payer ?? '').trim()
    if (vatPayer !== '1' && vatPayer !== '0') {
      next.push({ id: 'check10', messageKey: 'warnings.sellerVatPayerNotSet' })
    }
  }

  return next
}

type Props = {
  minimized?: boolean
  onMinimize?: () => void
  onWarningsCountChange?: (n: number) => void
}

export default function SettingsWarnings({ minimized = false, onMinimize, onWarningsCountChange }: Props) {
  const { t } = useTranslation()
  const location = useLocation()
  const [warnings, setWarnings] = useState<WarningItem[]>([])
  const [loading, setLoading] = useState(true)

  const refreshChecks = (): Promise<void> => {
    if (!window.api) return Promise.resolve()
    return runChecks(window.api)
      .then(list => {
        setWarnings(list)
        onWarningsCountChange?.(list.length)
      })
      .catch(() => setWarnings([])) as Promise<void>
  }

  useEffect(() => {
    if (!window.api) {
      setLoading(false)
      return
    }
    refreshChecks().finally(() => setLoading(false))
  }, [location.pathname, onWarningsCountChange])

  useEffect(() => {
    const handler = () => refreshChecks()
    window.addEventListener('jobraven:db-changed', handler)
    return () => window.removeEventListener('jobraven:db-changed', handler)
  }, [onWarningsCountChange])

  if (loading) return null
  if (warnings.length === 0) {
    onWarningsCountChange?.(0)
    return null
  }

  if (minimized) return null

  return (
    <div
      role="region"
      aria-label={t('warnings.title')}
      style={{
        marginBottom: '1rem',
        padding: '12px 16px',
        border: '1px solid #ca8a04',
        borderRadius: 8,
        background: 'rgba(234, 179, 8, 0.12)',
        color: 'var(--color-text)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ flexShrink: 0, marginTop: 2 }} aria-hidden>⚠</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <strong style={{ display: 'block', marginBottom: 6, fontSize: '0.95rem' }}>{t('warnings.title')}</strong>
            {onMinimize && (
              <button type="button" onClick={onMinimize} style={{ fontSize: '0.85rem' }}>
                {t('warnings.minimize')}
              </button>
            )}
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {warnings.map(w => (
              <li key={w.id} style={{ marginBottom: 4 }}>
                {t(w.messageKey)}
              </li>
            ))}
          </ul>
          <Link to="/settings" style={{ display: 'inline-block', marginTop: 8, fontSize: '0.9rem' }}>
            {t('warnings.goToSettings')} →
          </Link>
        </div>
      </div>
    </div>
  )
}

/** Link do rozwinięcia checklisty (w stopce obok Komunikatów lub pod nimi gdy zminimalizowany). */
export function SettingsWarningsNavLink({
  count,
  onExpand,
  inline = false
}: {
  count: number
  onExpand: () => void
  inline?: boolean
}) {
  const { t } = useTranslation()
  if (count <= 0) return null
  return (
    <button
      type="button"
      onClick={onExpand}
      style={{
        ...(inline ? {} : { width: '100%', marginBottom: 8, textAlign: 'left' }),
        background: 'rgba(234, 179, 8, 0.14)',
        border: '1px solid #ca8a04',
        borderRadius: inline ? 6 : 8,
        padding: inline ? '4px 10px' : '8px 12px',
        color: '#b45309',
        cursor: 'pointer',
        fontSize: inline ? '0.8rem' : '0.9rem',
        fontWeight: 500
      }}
    >
      {t('warnings.linkUnderMessages')} ({count})
    </button>
  )
}
