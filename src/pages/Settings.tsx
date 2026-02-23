import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { formatNumber } from '../utils/numberLocale'
import { VAT_SEGMENTS, type VatClientSegment, type VatRuleRow, getCountryOptions } from '../utils/vatConfig'

/** Widely used languages: code + name for "Add from list" in Settings */
export const PREDEFINED_LANGUAGES: { code: string; name: string }[] = [
  { code: 'EN', name: 'English' },
  { code: 'PL', name: 'Polish' },
  { code: 'DE', name: 'German' },
  { code: 'FR', name: 'French' },
  { code: 'ES', name: 'Spanish' },
  { code: 'IT', name: 'Italian' },
  { code: 'NL', name: 'Dutch' },
  { code: 'PT', name: 'Portuguese' },
  { code: 'RU', name: 'Russian' },
  { code: 'UK', name: 'Ukrainian' },
  { code: 'CS', name: 'Czech' },
  { code: 'SK', name: 'Slovak' },
  { code: 'HU', name: 'Hungarian' },
  { code: 'RO', name: 'Romanian' },
  { code: 'BG', name: 'Bulgarian' },
  { code: 'HR', name: 'Croatian' },
  { code: 'SL', name: 'Slovenian' },
  { code: 'SV', name: 'Swedish' },
  { code: 'DA', name: 'Danish' },
  { code: 'NO', name: 'Norwegian' },
  { code: 'FI', name: 'Finnish' },
  { code: 'EL', name: 'Greek' },
  { code: 'TR', name: 'Turkish' },
  { code: 'JA', name: 'Japanese' },
  { code: 'ZH', name: 'Chinese' },
  { code: 'AR', name: 'Arabic' }
]

/** UI languages supported by the app (for Settings dropdown) */
export const UI_LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'pl', name: 'Polski' }
]

/** Kolumny domyślne w widoku niestandardowym – można je ukrywać i przywracać (spójne z Orders). */
const DEFAULT_COLUMNS_FOR_CUSTOM: { key: string; labelKey: string }[] = [
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

type Lang = { id: number; code: string; name: string }
type Pair = { id: number; source_lang_id: number; target_lang_id: number; label: string; source_code: string; target_code: string; bidirectional?: number }
type Unit = { id: number; name: string; multiplier_to_base: number; is_base: number; unit_category_id?: number | null; unit_category_ids?: number[]; category_name?: string | null; category_base_rate?: number; category_currency?: string }
type UnitCategory = { id: number; name: string; base_rate?: number; currency?: string; sort_order: number; base_unit_id?: number | null; base_unit_name?: string | null; oral_unit_id?: number | null; page_unit_id?: number | null }
type Spec = { id: number; name: string }
type Service = { id: number; name: string; vat_rate?: number | null }
/** Jedna koncepcja VAT: w PL kod + etykieta, w EN inny kod + etykieta (np. NP<>O, ZW<>E). W UI pokazujemy tylko bieżący język. */
type VatCodeDef = { code_pl: string; label_pl: string; code_en: string; label_en: string }
type DefaultRateRow = {
  id: number
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

function CollapsibleSection({ id, title, open, onToggle, last, children }: { id: string; title: string; open: boolean; onToggle: (id: string) => void; last?: boolean; children: React.ReactNode }) {
  return (
    <section className="card" style={{ marginBottom: last ? 0 : '0.35rem' }}>
      <h2
        style={{ marginTop: 0, marginBottom: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none', padding: '1px 0' }}
        onClick={() => onToggle(id)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(id); } }}
        aria-expanded={open}
      >
        <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '0.75rem' }} aria-hidden>▶</span>
        {title}
      </h2>
      {open && <div style={{ marginTop: '0.35rem' }}>{children}</div>}
    </section>
  )
}

export default function Settings() {
  const { t, i18n } = useTranslation()
  const [languages, setLanguages] = useState<Lang[]>([])
  const [pairs, setPairs] = useState<Pair[]>([])
  const [specializations, setSpecializations] = useState<Spec[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [companyName, setCompanyName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [personalNip, setPersonalNip] = useState('')
  const [sellerIsVatPayer, setSellerIsVatPayer] = useState<'1' | '0' | ''>('')
  const [personalStreet, setPersonalStreet] = useState('')
  const [personalBuilding, setPersonalBuilding] = useState('')
  const [personalLocal, setPersonalLocal] = useState('')
  const [personalPostalCode, setPersonalPostalCode] = useState('')
  const [personalCity, setPersonalCity] = useState('')
  const [personalCountry, setPersonalCountry] = useState('')
  const [personalAddressExtra, setPersonalAddressExtra] = useState('')
  const [personalPhone, setPersonalPhone] = useState('')
  const [defaultCurrency, setDefaultCurrency] = useState('')
  const [rateCurrencies, setRateCurrencies] = useState<string[]>(['PLN', 'EUR', 'USD', 'GBP', 'CHF'])
  const [newCurrency, setNewCurrency] = useState('')
  const [uiLanguage, setUiLanguage] = useState('en')
  const [uiTheme, setUiTheme] = useState<'default' | 'high_contrast'>('default')
  const [navIconScale, setNavIconScale] = useState(100)
  const [uiScale, setUiScale] = useState(100)
  const [orderBooks, setOrderBooks] = useState<{ id: number; name: string; view_type: string; sort_order: number; archived?: number; order_number_format?: string | null; repertorium_oral_unit_id?: number | null; repertorium_page_unit_id?: number | null }[]>([])
  const [newBookName, setNewBookName] = useState('')
  const [newBookViewType, setNewBookViewType] = useState<'simplified' | 'repertorium' | 'custom'>('simplified')
  const [newBookOrderNumberFormat, setNewBookOrderNumberFormat] = useState('Z/{YYYY}/{NR}')
  const [customColumnsMap, setCustomColumnsMap] = useState<Record<number, { id: number; name: string; col_type: string; sort_order: number }[]>>({})
  const [newColName, setNewColName] = useState('')
  const [newColType, setNewColType] = useState<'text' | 'date' | 'number'>('text')
  const [newColBookId, setNewColBookId] = useState<number | null>(null)
  const [editingBookId, setEditingBookId] = useState<number | null>(null)
  const [editingBookName, setEditingBookName] = useState('')
  const editingBookNameInputRef = useRef<HTMLInputElement | null>(null)
  void editingBookNameInputRef
  const [hiddenDefaultColumnsByBook, setHiddenDefaultColumnsByBook] = useState<Record<number, string[]>>({})
  const [invoiceNumberFormat, setInvoiceNumberFormat] = useState('FV/{YYYY}/{NR}')
  const [invoiceProvider, setInvoiceProvider] = useState<'internal' | 'wfirma'>('internal')
  const [wfirmaAccessKey, setWfirmaAccessKey] = useState('')
  const [wfirmaSecretKey, setWfirmaSecretKey] = useState('')
  const [wfirmaAppKey, setWfirmaAppKey] = useState('')
  const [wfirmaCompanyId, setWfirmaCompanyId] = useState('')
  const [wfirmaCompanyAccountId, setWfirmaCompanyAccountId] = useState('')
  const [wfirmaCompanyAccounts, setWfirmaCompanyAccounts] = useState<Array<{ id: number; account_number: string; bank_name?: string; name?: string; currency?: string }>>([])
  const [wfirmaAccountsLoading, setWfirmaAccountsLoading] = useState(false)
  const [wfirmaAccountsMessage, setWfirmaAccountsMessage] = useState<string | null>(null)
  const [wfirmaTestLoading, setWfirmaTestLoading] = useState(false)
  const [wfirmaTestMessage, setWfirmaTestMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [invoiceLogoPath, setInvoiceLogoPath] = useState('')
  const [invoiceNotesList, setInvoiceNotesList] = useState<string[]>([])
  const [bankAccounts, setBankAccounts] = useState<{ id: number; bank_name: string; bank_address: string; account_number: string; swift: string; currency: string; is_default: number }[]>([])
  const [newBankName, setNewBankName] = useState('')
  const [newBankAddress, setNewBankAddress] = useState('')
  const [newBankAccount, setNewBankAccount] = useState('')
  const [newBankSwift, setNewBankSwift] = useState('')
  const [newBankCurrency, setNewBankCurrency] = useState('PLN')
  const [subcontractNumberFormat, setSubcontractNumberFormat] = useState('PZ/{YYYY}/{NR}')
  const [specName, setSpecName] = useState('')
  const [serviceName, setServiceName] = useState('')
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null)
  const [editingServiceName, setEditingServiceName] = useState('')
  const [serviceVatRulesByService, setServiceVatRulesByService] = useState<Record<number, VatRuleRow[]>>({})
  /** Wpis w toku (serviceId-segment) → wartość; po zapisie usuwamy, żeby wyświetlić wartość z reguł */
  const [pendingServiceVatRate, setPendingServiceVatRate] = useState<Record<string, string>>({})
  const [vatCodeDefs, setVatCodeDefs] = useState<VatCodeDef[]>([])
  const [newVatCode, setNewVatCode] = useState('')
  const [newVatCodeLabel, setNewVatCodeLabel] = useState('')
  const [taxpayerLookupLoading, setTaxpayerLookupLoading] = useState(false)
  const [taxpayerLookupMessage, setTaxpayerLookupMessage] = useState<string | null>(null)
  const [showTaxpayerNipModal, setShowTaxpayerNipModal] = useState(false)
  const [taxpayerModalNip, setTaxpayerModalNip] = useState('')
  const [loading, setLoading] = useState(true)
  const [langCode, setLangCode] = useState('')
  const [langName, setLangName] = useState('')
  const [pairSource, setPairSource] = useState('')
  const [pairTarget, setPairTarget] = useState('')
  const [pairBidirectional, setPairBidirectional] = useState(false)
  const [unitName, setUnitName] = useState('')
  const [unitMultiplier, setUnitMultiplier] = useState(1)
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null)
  const [editingUnitName, setEditingUnitName] = useState('')
  const [editingMultiplier, setEditingMultiplier] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [defaultRates, setDefaultRates] = useState<DefaultRateRow[]>([])
  const [newDefaultRateUnit, setNewDefaultRateUnit] = useState('')
  const [newDefaultRateArguments, setNewDefaultRateArguments] = useState<Array<{ key: string; value: string }>>([
    { key: '', value: '' },
    { key: '', value: '' },
    { key: '', value: '' }
  ])
  const [newDefaultRateValue, setNewDefaultRateValue] = useState('')
  const [newDefaultRateCurrency, setNewDefaultRateCurrency] = useState('PLN')
  const [editingDefaultRate, setEditingDefaultRate] = useState<{ id: number; unit_id: number; arguments: Array<{ key: string; value: string }>; rate: string; currency: string } | null>(null)
  const [unitCategories, setUnitCategories] = useState<UnitCategory[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [dataFolderPath, setDataFolderPath] = useState('')
  const [dataFolderMessage, setDataFolderMessage] = useState<string | null>(null)

  const [authSession, setAuthSession] = useState<{ user: { id: number; email: string; display_name?: string | null; role: string } | null; currentOrg: { id: string; name: string } | null }>({ user: null, currentOrg: null })
  const [licenseCheckCountdown, setLicenseCheckCountdown] = useState<{ secondsUntilNextCheck: number | null; checkIntervalSeconds: number; licenseValid?: boolean } | null>(null)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [changePasswordCurrent, setChangePasswordCurrent] = useState('')
  const [changePasswordNew, setChangePasswordNew] = useState('')
  const [changePasswordConfirm, setChangePasswordConfirm] = useState('')
  const [changePasswordMessage, setChangePasswordMessage] = useState<string | null>(null)
  const [showChangeLogin, setShowChangeLogin] = useState(false)
  const [changeLoginPassword, setChangeLoginPassword] = useState('')
  const [changeLoginNew, setChangeLoginNew] = useState('')
  const [changeLoginMessage, setChangeLoginMessage] = useState<string | null>(null)
  const [showUpdaterDebug, setShowUpdaterDebug] = useState(false)
  const [updaterDebugInfo, setUpdaterDebugInfo] = useState<{ ok: boolean; status?: number; error?: string; releasesCount?: number; latestVersion?: string; tagNames?: string[] } | null>(null)
  const [updaterDebugLoading, setUpdaterDebugLoading] = useState(false)
  const [showClearPredefinedModal, setShowClearPredefinedModal] = useState(false)
  const [predefinedModalMode, setPredefinedModalMode] = useState<'restore' | 'clear'>('clear')
  const [clearPredefinedPassword, setClearPredefinedPassword] = useState('')
  const [clearPredefinedLoading, setClearPredefinedLoading] = useState(false)
  const SECTION_IDS = ['programSettings', 'userData', 'personal', 'orderBooks', 'subcontracts', 'specializations', 'services', 'invoices', 'languages', 'currencies', 'languagePairs', 'units', 'defaultRates'] as const
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(SECTION_IDS.map(id => [id, false])))
  const toggleSection = (id: string) => setSectionOpen(prev => ({ ...prev, [id]: !(prev[id] ?? false) }))

  useEffect(() => {
    window.api?.app?.getDataFolderPath?.()?.then((p: string) => setDataFolderPath(p ?? '')).catch(() => {})
  }, [])
  useEffect(() => {
    window.api?.app?.isPackaged?.().then((p: boolean) => setShowUpdaterDebug(!p)).catch(() => {})
  }, [])
  useEffect(() => {
    const tick = () => {
      window.api?.auth?.getSession?.().then((s: { secondsUntilNextCheck?: number | null; checkIntervalSeconds?: number; licenseValid?: boolean }) => {
        if (s?.checkIntervalSeconds !== undefined) {
          setLicenseCheckCountdown({
            secondsUntilNextCheck: s.secondsUntilNextCheck ?? null,
            checkIntervalSeconds: s.checkIntervalSeconds,
            licenseValid: s.licenseValid
          })
        } else {
          setLicenseCheckCountdown(null)
        }
      }).catch(() => setLicenseCheckCountdown(null))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  const countryOptions = getCountryOptions(i18n.language)
  const resolveCountryCode = (raw: unknown): string => {
    const value = String(raw ?? '').trim()
    if (!value) return ''
    if (/^[A-Z]{2}$/i.test(value)) return value.toUpperCase()
    const normalized = value.toLowerCase()
    const all = [
      ...getCountryOptions('pl'),
      ...getCountryOptions('en')
    ]
    const byLabel = all.find(c => c.label.toLowerCase() === normalized)
    return byLabel?.code ?? ''
  }

  const load = () => {
    if (!window.api) {
      setLoading(false)
      return
    }
    Promise.all([
      window.api.languages.list(),
      window.api.languagePairs.list(),
      window.api.specializations.list(),
      window.api.services.list(),
      window.api.unitCategories?.list?.() ?? Promise.resolve([]),
      window.api.units.list(),
      window.api.settings.get('company_name'),
      window.api.settings.get('first_name'),
      window.api.settings.get('last_name'),
      window.api.settings.get('personal_nip'),
      window.api.settings.get('personal_street'),
      window.api.settings.get('personal_building'),
      window.api.settings.get('personal_local'),
      window.api.settings.get('personal_postal_code'),
      window.api.settings.get('personal_city'),
      window.api.settings.get('personal_country'),
      window.api.settings.get('personal_address_extra'),
      window.api.settings.get('personal_phone'),
      window.api.settings.get('seller_is_vat_payer'),
      window.api.settings.get('vat_code_definitions'),
      window.api.settings.get('ui_language'),
      window.api.settings.get('ui_theme'),
      window.api.orderBooks?.list?.() ?? Promise.resolve([]),
      window.api.defaultUnitRates?.list?.() ?? Promise.resolve([]),
      window.api.settings.get('order_number_format'),
      window.api.settings.get('invoice_number_format'),
      window.api.settings.get('invoice_provider'),
      window.api.settings.get('wfirma_access_key'),
      window.api.settings.get('wfirma_secret_key'),
      window.api.settings.get('wfirma_app_key'),
      window.api.settings.get('wfirma_company_id'),
      window.api.settings.get('wfirma_company_account_id'),
      window.api.settings.get('subcontract_number_format'),
      window.api.settings.get('rate_currencies'),
      window.api.settings.get('default_currency'),
      window.api.settings.get('invoice_logo_path'),
      window.api.settings.get('invoice_notes_list'),
      window.api.settings.get('invoice_notes'),
      window.api.bankAccounts?.list?.() ?? Promise.resolve([])
    ]).then(([l, p, s, svcList, catList, u, company, fname, lname, pnip, pstreet, pbuilding, plocal, ppostal, pcity, pcountry, pextra, pphone, sellerIsVatPayerRaw, vatCodeDefsRaw, lang, theme, bookList, defaultRatesList, _ordFmt, invFmt, invProvider, wfirmaAccess, wfirmaSecret, wfirmaApp, wfirmaCompanyId, wfirmaCompanyAccountIdRaw, subFmt, rateCurrenciesStr, defaultCurrencyStr, logoPath, notesListVal, notesValLegacy, bankAccountsList]) => {
      setLanguages((l as Lang[]))
      setPairs((p as Pair[]))
      setSpecializations((s as Spec[]))
      const nextServices = (svcList as Service[]) ?? []
      setServices(nextServices)
      setUnitCategories((catList as UnitCategory[]) ?? [])
      setUnits((u as Unit[]))
      setCompanyName((company as string) ?? '')
      setFirstName((fname as string) ?? '')
      setLastName((lname as string) ?? '')
      setPersonalNip((pnip as string) ?? '')
      const raw = (sellerIsVatPayerRaw as string) ?? ''
      setSellerIsVatPayer(raw === '1' ? '1' : raw === '0' ? '0' : '')
      setPersonalStreet((pstreet as string) ?? '')
      setPersonalBuilding((pbuilding as string) ?? '')
      setPersonalLocal((plocal as string) ?? '')
      setPersonalPostalCode((ppostal as string) ?? '')
      setPersonalCity((pcity as string) ?? '')
      const pcountryVal = (pcountry as string) ?? ''
      const opts = getCountryOptions(lang as string)
      const normalizedCountry = (() => {
        const v = String(pcountryVal).trim()
        if (!v) return ''
        if (/^[A-Z]{2}$/i.test(v)) return v.toUpperCase()
        const byLabel = opts.find(o => o.label === v)
        return byLabel ? byLabel.code : v
      })()
      setPersonalCountry(normalizedCountry)
      setPersonalAddressExtra((pextra as string) ?? '')
      setPersonalPhone((pphone as string) ?? '')
      try {
        const parsedCodes = typeof vatCodeDefsRaw === 'string' && vatCodeDefsRaw.trim() ? JSON.parse(vatCodeDefsRaw) : null
        const rawList = Array.isArray(parsedCodes) && parsedCodes.length ? (parsedCodes as unknown[]) : null
        const migrated: VatCodeDef[] = rawList
          ? rawList.map((row: unknown) => {
              const r = row as Record<string, unknown>
              if (r.code_pl != null && r.code_en != null) return row as VatCodeDef
              const code = String(r.code ?? '').trim()
              const pl = String(r.label_pl ?? '').trim()
              const en = String(r.label_en ?? '').trim()
              const codeEn = code === 'NP' ? 'O' : code === 'ZW' ? 'E' : code
              return { code_pl: code || '', label_pl: pl || '', code_en: codeEn || '', label_en: en || '' } as VatCodeDef
            })
          : []
        setVatCodeDefs(migrated.length ? migrated : [
          { code_pl: 'NP', label_pl: 'Nie podlega', code_en: 'O', label_en: 'Outside of scope' },
          { code_pl: 'ZW', label_pl: 'Zwolnione', code_en: 'E', label_en: 'VAT-Exempt' }
        ])
      } catch {
        setVatCodeDefs([
          { code_pl: 'NP', label_pl: 'Nie podlega', code_en: 'O', label_en: 'Outside of scope' },
          { code_pl: 'ZW', label_pl: 'Zwolnione', code_en: 'E', label_en: 'VAT-Exempt' }
        ])
      }
      try {
        const defaultList = ['PLN', 'EUR', 'USD', 'GBP', 'CHF']
        const parsed = typeof rateCurrenciesStr === 'string' && rateCurrenciesStr.trim() ? JSON.parse(rateCurrenciesStr) : null
        const list = Array.isArray(parsed) && parsed.length > 0 ? parsed.filter((c: unknown) => typeof c === 'string' && (c as string).trim()) : defaultList
        setRateCurrencies(list)
        if (list.length > 0 && (!Array.isArray(parsed) || parsed.length === 0) && window.api?.settings?.set) {
          window.api.settings.set('rate_currencies', JSON.stringify(list))
        }
      } catch {
        const defaultList = ['PLN', 'EUR', 'USD', 'GBP', 'CHF']
        setRateCurrencies(defaultList)
        if (window.api?.settings?.set) window.api.settings.set('rate_currencies', JSON.stringify(defaultList))
      }
      setDefaultCurrency(defaultCurrencyStr != null && typeof defaultCurrencyStr === 'string' ? defaultCurrencyStr : '')
      setUiLanguage((lang as string) ?? 'en')
      const themeVal = (theme as string) === 'high_contrast' ? 'high_contrast' : 'default'
      setUiTheme(themeVal)
      if (typeof document !== 'undefined') document.documentElement.dataset.theme = themeVal === 'high_contrast' ? 'high-contrast' : 'default'
      window.api.settings.get('nav_icon_scale').then((v: unknown) => {
        const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : 100
        setNavIconScale(Number.isNaN(n) ? 100 : Math.min(130, Math.max(60, n)))
      }).catch(() => {})
      window.api.settings.get('ui_scale').then((v: unknown) => {
        const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : 100
        setUiScale(Number.isNaN(n) ? 100 : Math.min(130, Math.max(80, n)))
      }).catch(() => {})
      const mappedBooks = ((bookList as Record<string, unknown>[] | null) ?? []).map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        name: String(row.name ?? ''),
        view_type: String(row.view_type ?? 'simplified'),
        sort_order: Number(row.sort_order ?? 0),
        archived: row.archived != null ? Number(row.archived) : undefined,
        order_number_format: row.order_number_format != null && row.order_number_format !== '' ? String(row.order_number_format) : null,
        repertorium_oral_unit_id: (() => { const v = row.repertorium_oral_unit_id; if (v == null || v === '') return null; const n = Number(v); return Number.isNaN(n) ? null : n; })(),
        repertorium_page_unit_id: (() => { const v = row.repertorium_page_unit_id; if (v == null || v === '') return null; const n = Number(v); return Number.isNaN(n) ? null : n; })()
      }))
      // Read repertorium unit settings directly from settings store as THE source of truth
      // IMPORTANT: setOrderBooks is called only ONCE — after overlay is applied — to avoid race conditions
      const repertoriumBooks = mappedBooks.filter(bk => bk.view_type === 'repertorium')
      if (repertoriumBooks.length > 0 && window.api?.settings?.get) {
        const settingsPromises = repertoriumBooks.flatMap(bk => [
          window.api.settings.get(`order_book_${bk.id}_repertorium_oral_unit_id`).then((v: unknown) => ({ bookId: bk.id, field: 'oral' as const, value: v })),
          window.api.settings.get(`order_book_${bk.id}_repertorium_page_unit_id`).then((v: unknown) => ({ bookId: bk.id, field: 'page' as const, value: v }))
        ])
        Promise.all(settingsPromises).then(results => {
          for (const r of results) {
            const idx = mappedBooks.findIndex(x => x.id === r.bookId)
            if (idx === -1) continue
            const raw = r.value as string | null
            const n = raw != null && raw !== '' ? parseInt(String(raw), 10) : null
            const val = n != null && !Number.isNaN(n) ? n : null
            if (r.field === 'oral') mappedBooks[idx] = { ...mappedBooks[idx], repertorium_oral_unit_id: val }
            else mappedBooks[idx] = { ...mappedBooks[idx], repertorium_page_unit_id: val }
          }
          setOrderBooks(mappedBooks)
        }).catch(() => {
          setOrderBooks(mappedBooks)
        })
      } else {
        setOrderBooks(mappedBooks)
      }
      setDefaultRates((defaultRatesList as DefaultRateRow[]) ?? [])
      setInvoiceNumberFormat((invFmt as string) ?? 'FV/{YYYY}/{NR}')
      setInvoiceProvider((invProvider as string) === 'wfirma' ? 'wfirma' : 'internal')
      setWfirmaAccessKey((wfirmaAccess as string) ?? '')
      setWfirmaSecretKey((wfirmaSecret as string) ?? '')
      setWfirmaAppKey((wfirmaApp as string) ?? '')
      setWfirmaCompanyId((wfirmaCompanyId as string) ?? '')
      setWfirmaCompanyAccountId((wfirmaCompanyAccountIdRaw as string) ?? '')
      setInvoiceLogoPath((logoPath as string) ?? '')
      ;(() => {
        let list: string[] = []
        try {
          const raw = notesListVal as string | null | undefined
          if (raw && typeof raw === 'string' && raw.trim()) {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed)) list = parsed.filter((x: unknown) => typeof x === 'string')
          }
        } catch { /* ignore */ }
        if (list.length === 0 && notesValLegacy && typeof notesValLegacy === 'string' && String(notesValLegacy).trim()) list = [String(notesValLegacy).trim()]
        setInvoiceNotesList(list)
      })()
      setBankAccounts((bankAccountsList as typeof bankAccounts) ?? [])
      setSubcontractNumberFormat((subFmt as string) ?? 'PZ/{YYYY}/{NR}')
      const finishLoading = () => setLoading(false)
      if (window.api?.serviceVatRules?.listByService && nextServices.length > 0) {
        Promise.all(nextServices.map(svc => window.api.serviceVatRules.listByService(svc.id).then(rows => ({ serviceId: svc.id, rows })))).then(results => {
          const map: Record<number, VatRuleRow[]> = {}
          results.forEach(r => { map[r.serviceId] = (r.rows as VatRuleRow[]) ?? [] })
          setServiceVatRulesByService(map)
          finishLoading()
        }).catch(() => {
          setServiceVatRulesByService({})
          finishLoading()
        })
      } else {
        setServiceVatRulesByService({})
        finishLoading()
      }
      // Load custom columns for custom-type books
      const books = (bookList as { id: number; view_type: string }[]) ?? []
      const customBooks = books.filter(b => b.view_type === 'custom')
      if (customBooks.length > 0 && window.api?.customColumns?.listByBook) {
        Promise.all(customBooks.map(b => window.api.customColumns.listByBook(b.id).then(cols => ({ bookId: b.id, cols })))).then(results => {
          const map: Record<number, { id: number; name: string; col_type: string; sort_order: number }[]> = {}
          for (const r of results) map[r.bookId] = r.cols as { id: number; name: string; col_type: string; sort_order: number }[]
          setCustomColumnsMap(map)
        })
      }
      if (customBooks.length > 0 && window.api?.settings?.get) {
        Promise.all(customBooks.map(b => window.api.settings.get(`book_${b.id}_hidden_columns`).then(val => ({ bookId: b.id, val })))).then(results => {
          const hiddenByBook: Record<number, string[]> = {}
          for (const r of results) {
            try {
              hiddenByBook[r.bookId] = r.val ? JSON.parse(r.val) : []
              if (!Array.isArray(hiddenByBook[r.bookId])) hiddenByBook[r.bookId] = []
            } catch {
              hiddenByBook[r.bookId] = []
            }
          }
          setHiddenDefaultColumnsByBook(hiddenByBook)
        })
      } else {
        setHiddenDefaultColumnsByBook({})
      }
    }).catch(() => setLoading(false))
  }

  const loadWfirmaCompanyAccounts = async () => {
    if (!window.api?.wfirma?.listCompanyAccounts) return
    const access = wfirmaAccessKey.trim()
    const secret = wfirmaSecretKey.trim()
    if (!access || !secret) {
      setWfirmaAccountsMessage(t('settings.wfirmaAccountsNeedKeys'))
      setWfirmaCompanyAccounts([])
      return
    }
    setWfirmaAccountsMessage(null)
    setWfirmaAccountsLoading(true)
    try {
      const list = await window.api.wfirma.listCompanyAccounts(access, secret, wfirmaAppKey.trim() || undefined, wfirmaCompanyId.trim() || undefined)
      setWfirmaCompanyAccounts(Array.isArray(list) ? list : [])
      if (!Array.isArray(list) || list.length === 0) {
        setWfirmaAccountsMessage(t('settings.wfirmaAccountsEmpty'))
      }
    } catch (e) {
      setWfirmaCompanyAccounts([])
      setWfirmaAccountsMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setWfirmaAccountsLoading(false)
    }
  }

  useEffect(() => {
    if (invoiceProvider !== 'wfirma') return
    if (!wfirmaAccessKey.trim() || !wfirmaSecretKey.trim()) return
    loadWfirmaCompanyAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceProvider])

  const notifyChecklist = () => window.dispatchEvent(new CustomEvent('jobraven:db-changed'))

  useEffect(() => { load() }, [])
  const refreshSession = useCallback(() => {
    window.api?.auth?.getSession?.().then(s => {
      if (s) setAuthSession({ user: s.user ?? null, currentOrg: s.currentOrg ?? null })
    }).catch(() => {})
  }, [])
  useEffect(() => {
    refreshSession()
  }, [refreshSession])

  const addLang = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!window.api || !langCode.trim()) return
    await window.api.languages.add({ code: langCode.trim().toUpperCase(), name: langName.trim() || langCode.trim() })
    setLangCode('')
    setLangName('')
    load()
  }

  const deleteLang = async (id: number) => {
    if (!window.api) return
    await window.api.languages.delete(id)
    load()
  }

  const addPair = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!window.api || !pairSource || !pairTarget) return
    const sourceId = parseInt(pairSource, 10)
    const targetId = parseInt(pairTarget, 10)
    const src = languages.find(l => l.id === sourceId)
    const tgt = languages.find(l => l.id === targetId)
    const label = pairBidirectional && sourceId !== targetId
      ? `${src?.code ?? ''} <> ${tgt?.code ?? ''}`
      : `${src?.code ?? ''} > ${tgt?.code ?? ''}`
    await window.api.languagePairs.add({
      source_lang_id: sourceId,
      target_lang_id: targetId,
      label,
      bidirectional: pairBidirectional && sourceId !== targetId
    })
    setPairSource('')
    setPairTarget('')
    load()
  }

  const deletePair = async (id: number) => {
    if (!window.api) return
    await window.api.languagePairs.delete(id)
    load()
  }

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!window.api?.unitCategories?.add || !newCategoryName.trim()) return
    await window.api.unitCategories.add({ name: newCategoryName.trim() })
    setNewCategoryName('')
    load()
  }

  const addUnit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!window.api || !unitName.trim()) return
    await window.api.units.add({
      name: unitName.trim(),
      multiplier_to_base: unitMultiplier,
      is_base: 0
    })
    setUnitName('')
    setUnitMultiplier(1)
    load()
  }

  const _setBaseUnit = async (id: number) => {
    if (!window.api) return
    await window.api.units.setBase(id)
    load()
  }
  void _setBaseUnit

  const deleteUnit = async (id: number) => {
    if (!window.api) return
    await window.api.units.delete(id)
    load()
  }

  const saveUiLanguage = (code: string) => {
    setUiLanguage(code)
    window.api?.settings.set('ui_language', code)
    i18n.changeLanguage(code)
  }

  const addLangFromPredefined = async (code: string, name: string) => {
    if (!window.api) return
    const exists = languages.some(l => l.code.toUpperCase() === code.toUpperCase())
    if (exists) return
    await window.api.languages.add({ code: code.toUpperCase(), name })
    load()
  }

  const startEditUnit = (u: Unit) => {
    setEditingUnitId(u.id)
    setEditingUnitName(u.name)
    setEditingMultiplier(String(u.multiplier_to_base))
  }

  const saveUnitEdit = async () => {
    if (editingUnitId == null || !window.api) return
    const num = Number(editingMultiplier)
    const name = editingUnitName.trim()
    if (name && !Number.isNaN(num) && num > 0) {
      await window.api.units.update(editingUnitId, { name, multiplier_to_base: num })
      load()
    }
    setEditingUnitId(null)
    setEditingUnitName('')
    setEditingMultiplier('')
  }

  const cancelEditUnit = () => {
    setEditingUnitId(null)
    setEditingUnitName('')
    setEditingMultiplier('')
  }

  const startEditCategory = (category: UnitCategory) => {
    setEditingCategoryId(category.id)
    setEditingCategoryName(category.name)
  }

  const saveCategoryEdit = async () => {
    if (editingCategoryId == null || !window.api?.unitCategories?.update) return
    const name = editingCategoryName.trim()
    if (!name) return
    await window.api.unitCategories.update(editingCategoryId, { name })
    setEditingCategoryId(null)
    setEditingCategoryName('')
    load()
  }

  const cancelEditCategory = () => {
    setEditingCategoryId(null)
    setEditingCategoryName('')
  }

  const addSpec = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!window.api || !specName.trim()) return
    await window.api.specializations.add({ name: specName.trim() })
    setSpecName('')
    load()
  }

  const deleteSpec = async (id: number) => {
    if (!window.api) return
    await window.api.specializations.delete(id)
    load()
  }

  const addService = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!window.api || !serviceName.trim()) return
    await window.api.services.add({ name: serviceName.trim() })
    setServiceName('')
    load()
  }

  const updateService = async (id: number) => {
    if (!window.api || !editingServiceName.trim()) return
    await window.api.services.update(id, { name: editingServiceName.trim() })
    setEditingServiceId(null)
    setEditingServiceName('')
    load()
  }

  const deleteService = async (id: number) => {
    if (!window.api) return
    await window.api.services.delete(id)
    load()
  }

  const fetchTaxpayerByNip = async (nipFromModal?: string) => {
    const nip = (nipFromModal ?? personalNip).trim().replace(/\s|-/g, '')
    if (!nip) {
      setTaxpayerLookupMessage(t('clients.fetchByNipError', { message: t('clients.enterNipFirst') }) as string)
      return
    }
    if (!window.api?.gus?.fetchByNip) return
    setTaxpayerLookupLoading(true)
    setTaxpayerLookupMessage(null)
    try {
      const result = await window.api.gus.fetchByNip(nip)
      if ('error' in result) {
        setTaxpayerLookupMessage((result.error === 'MANUAL_ENTRY_REQUIRED'
          ? t('clients.fetchByNipManualEntry')
          : t('clients.fetchByNipError', { message: result.error })) as string)
        return
      }
      const countryCode = resolveCountryCode(result.country) || personalCountry || ''
      setCompanyName(result.name || companyName)
      setPersonalNip(result.nip || personalNip)
      setPersonalStreet(result.street || '')
      setPersonalBuilding(result.building || '')
      setPersonalLocal(result.local || '')
      setPersonalPostalCode(result.postal_code || '')
      setPersonalCity(result.city || '')
      setPersonalCountry(countryCode)
      window.api.settings.set('company_name', result.name || companyName)
      window.api.settings.set('personal_nip', result.nip || personalNip)
      window.api.settings.set('personal_street', result.street || '')
      window.api.settings.set('personal_building', result.building || '')
      window.api.settings.set('personal_local', result.local || '')
      window.api.settings.set('personal_postal_code', result.postal_code || '')
      window.api.settings.set('personal_city', result.city || '')
      window.api.settings.set('personal_country', countryCode)
      setTaxpayerLookupMessage(t('clients.fetchByNipSuccess') as string)
      setShowTaxpayerNipModal(false)
      setTaxpayerModalNip('')
    } finally {
      setTaxpayerLookupLoading(false)
    }
  }

  const submitTaxpayerNipModal = () => { fetchTaxpayerByNip(taxpayerModalNip) }

  const isUiPl = (i18n.language || '').toLowerCase().startsWith('pl')
  const normalizeLegacyVatCode = (raw: string | null | undefined): string => {
    const v = String(raw ?? '').trim().toUpperCase()
    if (!v) return ''
    if (v === 'O') return 'NP'
    if (v === 'E') return 'ZW'
    return v
  }
  /** Kanoniczny kod VAT używany w regułach i zamówieniach (NP/ZW lub inny techniczny). */
  const getVatCodeCode = (def: VatCodeDef) => {
    const plCode = String(def.code_pl ?? '').trim().toUpperCase()
    if (plCode) return plCode
    return normalizeLegacyVatCode(def.code_en)
  }
  /** Kod do wyświetlenia w UI: w PL → code_pl (NP, ZW), w EN → code_en (O, E). */
  const getVatCodeCodeForDisplay = (def: VatCodeDef) => (isUiPl ? (def.code_pl ?? '').trim() : (def.code_en ?? '').trim()) || getVatCodeCode(def)
  /** W PL: etykieta polska. W EN: etykieta angielska. */
  const getVatCodeLabel = (def: VatCodeDef) => (isUiPl ? (def.label_pl || '').trim() : (def.label_en || '').trim())
  /** Zapisany kod (NP/O/ZW/E) → kanoniczny kod (NP/ZW) do selecta i zapisu. */
  const resolveStoredVatCodeToCurrent = (stored: string | null | undefined) => {
    if (!stored?.trim()) return ''
    const current = normalizeLegacyVatCode(stored)
    const def = vatCodeDefs.find(d => {
      const pl = String(d.code_pl ?? '').trim().toUpperCase()
      const en = normalizeLegacyVatCode(d.code_en)
      return pl === current || en === current
    })
    return def ? getVatCodeCode(def) : current
  }

  const segmentLabel = (segment: VatClientSegment) => {
    const map: Record<VatClientSegment, string> = {
      company_domestic: t('settings.vatSegmentCompanyDomestic'),
      company_eu: t('settings.vatSegmentCompanyEu'),
      company_world: t('settings.vatSegmentCompanyWorld'),
      person_domestic: t('settings.vatSegmentPersonDomestic'),
      person_eu: t('settings.vatSegmentPersonEu'),
      person_world: t('settings.vatSegmentPersonWorld')
    }
    return map[segment]
  }

  const segmentTooltip = (segment: VatClientSegment) => {
    const map: Record<VatClientSegment, string> = {
      company_domestic: t('settings.vatSegmentCompanyDomesticHint'),
      company_eu: t('settings.vatSegmentCompanyEuHint'),
      company_world: t('settings.vatSegmentCompanyWorldHint'),
      person_domestic: t('settings.vatSegmentPersonDomesticHint'),
      person_eu: t('settings.vatSegmentPersonEuHint'),
      person_world: t('settings.vatSegmentPersonWorldHint')
    }
    return map[segment]
  }

  const saveVatCodeDefs = (next: VatCodeDef[]) => {
    setVatCodeDefs(next)
    window.api?.settings?.set('vat_code_definitions', JSON.stringify(next))
  }

  // Przy otwarciu sekcji Usługi zawsze przeładuj reguły VAT z bazy – wtedy tabela ma aktualne dane
  useEffect(() => {
    if (!(sectionOpen.services ?? false) || services.length === 0 || !window.api?.serviceVatRules?.listByService) return
    Promise.all(services.map(svc => window.api.serviceVatRules.listByService(svc.id).then((rows: unknown) => ({ serviceId: svc.id, rows })))).then(results => {
      const map: Record<number, VatRuleRow[]> = {}
      results.forEach(r => { map[r.serviceId] = (r.rows as VatRuleRow[]) ?? [] })
      setServiceVatRulesByService(map)
    }).catch(() => {})
  }, [sectionOpen.services, services.map(s => s.id).join(',')])

  const upsertServiceVatRule = async (row: VatRuleRow) => {
    if (!window.api?.serviceVatRules?.upsert) return
    await window.api.serviceVatRules.upsert({
      service_id: row.service_id,
      client_segment: row.client_segment,
      country_code: row.country_code ?? null,
      value_type: row.value_type,
      rate_value: row.rate_value ?? null,
      code_value: row.code_value ?? null
    })
    const refreshed = await window.api.serviceVatRules.listByService(row.service_id) as VatRuleRow[]
    setServiceVatRulesByService(prev => ({ ...prev, [row.service_id]: refreshed }))
  }

  const deleteServiceVatRule = async (serviceId: number, ruleId: number) => {
    if (!window.api?.serviceVatRules?.delete) return
    await window.api.serviceVatRules.delete(ruleId)
    const refreshed = await window.api.serviceVatRules.listByService(serviceId) as VatRuleRow[]
    setServiceVatRulesByService(prev => ({ ...prev, [serviceId]: refreshed }))
  }

  const saveInvoiceNumberFormat = (v: string) => {
    setInvoiceNumberFormat(v)
    window.api?.settings.set('invoice_number_format', v)
  }

  const saveSubcontractNumberFormat = (v: string) => {
    setSubcontractNumberFormat(v)
    window.api?.settings.set('subcontract_number_format', v)
  }

  /** Nazwa języka w bieżącym języku UI (np. PL → Polski gdy UI po polsku) */
  const langDisplay = (code: string, fallback: string) => {
    if (!code) return fallback
    const key = `languageNames.${String(code).trim().toUpperCase()}`
    const translated = t(key)
    return translated !== key ? translated : fallback
  }
  /** Etykieta pary językowej (np. "EN > PL" lub "EN <> PL" – z przetłumaczonymi nazwami) */
  const translatePairLabel = (label: string | null) => {
    if (!label) return ''
    const sep = label.includes(' <> ') ? ' <> ' : label.includes(' > ') ? ' > ' : label.includes(' < ') ? ' < ' : ' > '
    return label.split(sep).map((part: string) => langDisplay(part.trim(), part.trim())).join(sep)
  }
  /** Etykieta pary z obiektu Pair (używa source_code/target_code; <> gdy bidirectional) */
  const pairDisplayLabel = (p: Pair) => {
    if (!p.source_code || !p.target_code) return translatePairLabel(p.label)
    const sep = p.bidirectional ? ' <> ' : ' > '
    return `${langDisplay(p.source_code, p.source_code)}${sep}${langDisplay(p.target_code, p.target_code)}`
  }
  const languagesForPairDropdown = useMemo(() => {
    return [...languages].sort((a, b) => {
      const aLabel = `${a.code} (${langDisplay(a.code, a.name)})`
      const bLabel = `${b.code} (${langDisplay(b.code, b.name)})`
      return aLabel.localeCompare(bLabel, i18n.language, { sensitivity: 'base' })
    })
  }, [languages, i18n.language])
  const customRateArgumentOptions = useMemo(() => {
    const byKey = new Map<string, string>()
    Object.values(customColumnsMap).flat().forEach(col => {
      byKey.set(`custom_column:${col.id}`, col.name)
    })
    return Array.from(byKey.entries()).map(([key, name]) => ({ key, label: `${t('settings.columnName')}: ${name}` }))
  }, [customColumnsMap, t])
  const baseRateArgumentOptions = useMemo(() => ([
    { key: 'language_pair', label: t('orders.languagePair') },
    { key: 'order_number', label: t('orders.orderNumber') },
    { key: 'name', label: t('orders.name') },
    { key: 'received_at', label: t('orders.receivedAt') },
    { key: 'client', label: t('orders.client') },
    { key: 'contractor', label: t('orders.contractor') },
    { key: 'deadline', label: t('orders.deadline') },
    { key: 'completed_at', label: t('orders.completedAt') },
    { key: 'specialization', label: t('orders.specialization') },
    { key: 'unit', label: t('orders.unit') },
    { key: 'quantity', label: t('orders.quantity') },
    { key: 'amount', label: t('orders.amount') },
    { key: 'order_status', label: t('orders.orderStatus') },
    { key: 'invoice_status', label: t('orders.invoiceStatus') },
    { key: 'payment_due', label: t('orders.paymentDue') },
    { key: 'service', label: t('orders.service') },
    { key: 'translation_type', label: t('orders.translationType') },
    { key: 'invoice_description', label: t('orders.additionalInvoiceDescription') },
    { key: 'repertorium_activity_type', label: t('orderBook.repertoriumActivityType') },
    { key: 'document_author', label: t('orderBook.repertoriumDocumentAuthor') },
    { key: 'document_name', label: t('orderBook.repertoriumDocumentName') },
    { key: 'document_date', label: t('orderBook.repertoriumDocumentDate') },
    { key: 'document_number', label: t('orderBook.repertoriumDocumentNumber') },
    { key: 'document_form_remarks', label: t('orderBook.repertoriumDocumentFormRemarks') },
    { key: 'repertorium_notes', label: t('orderBook.repertoriumNotes') },
    { key: 'oral_date', label: t('orderBook.repertoriumOralDate') },
    { key: 'oral_place', label: t('orderBook.repertoriumOralPlace') },
    { key: 'oral_lang', label: t('orderBook.repertoriumOralLang') },
    { key: 'oral_duration', label: t('orderBook.repertoriumOralDuration') },
    { key: 'oral_scope', label: t('orderBook.repertoriumOralScope') },
    { key: 'oral_notes', label: t('orderBook.repertoriumOralNotes') },
    { key: 'refusal_date', label: t('orderBook.repertoriumRefusalDate') },
    { key: 'refusal_organ', label: t('orderBook.repertoriumRefusalOrgan') },
    { key: 'refusal_reason', label: t('orderBook.repertoriumRefusalReason') }
  ]), [t])
  const argumentValueOptionsByKey = useMemo(() => ({
    language_pair: pairs.map(p => ({ value: p.label, label: pairDisplayLabel(p) })),
    specialization: specializations.map(s => ({ value: s.name, label: s.name })),
    service: services.map(s => ({ value: s.name, label: s.name })),
    client: [] as { value: string; label: string }[],
    contractor: [] as { value: string; label: string }[],
    unit: units.map(u => ({ value: u.name, label: u.name })),
    order_status: ['to_do', 'in_progress', 'completed', 'cancelled'].map(v => ({ value: v, label: t(`orders.orderStatus_${v}`) })),
    invoice_status: ['to_issue', 'issued', 'awaiting_payment', 'overdue', 'paid'].map(v => ({ value: v, label: t(`orders.invoiceStatus_${v}`) })),
    translation_type: [
      { value: 'written', label: t('orders.translationTypeWritten') },
      { value: 'oral', label: t('orders.translationTypeOral') }
    ],
    book: orderBooks.map(b => ({ value: b.name, label: b.name }))
  }), [pairs, specializations, services, units, orderBooks, t])
  const rateArgumentOptions = useMemo(() => ([
    { key: '', label: t('settings.defaultRatesAnyArgument') },
    ...baseRateArgumentOptions,
    ...customRateArgumentOptions
  ]), [baseRateArgumentOptions, customRateArgumentOptions, t])
  const getRateArgumentLabel = (key: string | null) => {
    const normalized = (key ?? '').trim()
    const opt = rateArgumentOptions.find(o => o.key === normalized)
    if (opt) return opt.label
    if (normalized.startsWith('custom_column:')) return normalized
    return normalized || t('settings.defaultRatesAnyArgument')
  }
  const getRateArgumentValueLabel = (key: string | null, value: string | null, legacyPairLabel?: string | null) => {
    const normalizedKey = (key ?? '').trim()
    const normalizedValue = (value ?? '').trim()
    if (!normalizedKey) return t('settings.defaultRatesAnyArgument')
    if (normalizedKey === 'language_pair') return translatePairLabel(normalizedValue || legacyPairLabel || '') || '—'
    return normalizedValue || '—'
  }
  const getAllowedRateArgumentOptions = (currentIndex: number, args: Array<{ key: string; value: string }>) => {
    const selectedOther = new Set(
      args
        .map((a, idx) => idx === currentIndex ? '' : (a.key ?? '').trim())
        .filter(Boolean)
    )
    return rateArgumentOptions.filter(opt => !opt.key || !selectedOther.has(opt.key))
  }
  const getArgumentValueOptions = (argKey: string) => (argumentValueOptionsByKey as Record<string, { value: string; label: string }[]>)[argKey] ?? []

  if (loading) return <div>{t('common.loading')}</div>

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>{t('settings.title')}</h1>

      <CollapsibleSection id="programSettings" title={t('settings.programSettings')} open={sectionOpen.programSettings ?? false} onToggle={toggleSection}>
        {licenseCheckCountdown != null && (
          <p style={{ margin: '0 0 1rem', fontSize: '0.9rem' }}>
            <span style={{ color: licenseCheckCountdown.licenseValid === true ? 'var(--color-success, #22c55e)' : 'inherit' }}>
              {licenseCheckCountdown.licenseValid === true ? t('settings.licenseStatusOk') : t('settings.licenseStatusNeedsVerification')}
            </span>
            {licenseCheckCountdown.secondsUntilNextCheck !== null && (
              <>
                <br />
                {t('settings.timeToNextVerification')}:{' '}
                {(() => {
                  const sec = licenseCheckCountdown.secondsUntilNextCheck
                  const days = Math.floor(sec / 86400)
                  const hours = Math.floor((sec % 86400) / 3600)
                  const minutes = Math.floor((sec % 3600) / 60)
                  const parts: string[] = []
                  if (days > 0) parts.push(t('settings.licenseDurationDays', { count: days }))
                  if (hours > 0 || days > 0) parts.push(t('settings.licenseDurationHours', { count: hours }))
                  parts.push(t('settings.licenseDurationMinutes', { count: minutes }))
                  return parts.join(' ')
                })()}
              </>
            )}
          </p>
        )}
        <div className="grid2" style={{ marginBottom: '1rem' }}>
          <div className="form-group">
            <label>{t('settings.uiLanguage')}</label>
            <select value={uiLanguage} onChange={e => saveUiLanguage(e.target.value)}>
              {UI_LANGUAGES.map(x => <option key={x.code} value={x.code}>{x.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>{t('settings.appearance')}</label>
            <select
              value={uiTheme}
              onChange={e => {
                const v = e.target.value as 'default' | 'high_contrast'
                setUiTheme(v)
                window.api?.settings.set('ui_theme', v)
                if (typeof document !== 'undefined') document.documentElement.dataset.theme = v === 'high_contrast' ? 'high-contrast' : 'default'
              }}
            >
              <option value="default">{t('settings.appearanceDefault')}</option>
              <option value="high_contrast">{t('settings.appearanceHighContrast')}</option>
            </select>
          </div>
          <div className="form-group">
            <label>{t('settings.iconScaling')}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  const next = Math.max(60, navIconScale - 10)
                  setNavIconScale(next)
                  window.api?.settings.set('nav_icon_scale', next)
                  window.dispatchEvent(new CustomEvent('jobraven:nav-icon-scale-changed', { detail: next }))
                }}
                disabled={navIconScale <= 60}
                style={{ padding: '6px 12px', fontSize: '1.1rem', lineHeight: 1 }}
                title={t('settings.iconScaling')}
              >
                −
              </button>
              <span style={{ minWidth: 44, textAlign: 'center', fontWeight: 500 }}>{navIconScale}%</span>
              <button
                type="button"
                onClick={() => {
                  const next = Math.min(130, navIconScale + 10)
                  setNavIconScale(next)
                  window.api?.settings.set('nav_icon_scale', next)
                  window.dispatchEvent(new CustomEvent('jobraven:nav-icon-scale-changed', { detail: next }))
                }}
                disabled={navIconScale >= 130}
                style={{ padding: '6px 12px', fontSize: '1.1rem', lineHeight: 1 }}
                title={t('settings.iconScaling')}
              >
                +
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>{t('settings.uiScaling')}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  const next = Math.max(80, uiScale - 10)
                  setUiScale(next)
                  window.api?.settings.set('ui_scale', next)
                  window.dispatchEvent(new CustomEvent('jobraven:ui-scale-changed', { detail: next }))
                }}
                disabled={uiScale <= 80}
                style={{ padding: '6px 12px', fontSize: '1.1rem', lineHeight: 1 }}
                title={t('settings.uiScaling')}
              >
                −
              </button>
              <span style={{ minWidth: 44, textAlign: 'center', fontWeight: 500 }}>{uiScale}%</span>
              <button
                type="button"
                onClick={() => {
                  const next = Math.min(130, uiScale + 10)
                  setUiScale(next)
                  window.api?.settings.set('ui_scale', next)
                  window.dispatchEvent(new CustomEvent('jobraven:ui-scale-changed', { detail: next }))
                }}
                disabled={uiScale >= 130}
                style={{ padding: '6px 12px', fontSize: '1.1rem', lineHeight: 1 }}
                title={t('settings.uiScaling')}
              >
                +
              </button>
            </div>
          </div>
        </div>
        <div className="form-group" style={{ marginTop: '1rem' }}>
          <label>{t('settings.dataFolderPath')}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
            <input
              type="text"
              value={dataFolderPath}
              onChange={e => setDataFolderPath(e.target.value)}
              placeholder={t('settings.dataFolderPathPlaceholder')}
              style={{ flex: '1 1 280px', minWidth: 0 }}
            />
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={async () => {
                  setDataFolderMessage(null)
                  const r = await window.api?.app?.openDataFolder?.()
                  if (r?.ok) return
                  setDataFolderMessage(r?.error ?? t('settings.dataFolderOpenError'))
                }}
              >
                {t('settings.dataFolderOpen')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setDataFolderMessage(null)
                  const r = await window.api?.app?.chooseDataFolder?.()
                  if (r?.canceled) return
                  if (r?.ok && r?.path) {
                    setDataFolderPath(r.path)
                    if (r?.needRestart) setDataFolderMessage(t('settings.dataFolderRestartRequired'))
                    return
                  }
                  setDataFolderMessage(t(`settings.dataFolderError_${r?.error ?? 'UNKNOWN'}`))
                }}
              >
                {t('settings.dataFolderChoose')}
              </button>
              <button
                type="button"
                className="primary"
                onClick={async () => {
                  setDataFolderMessage(null)
                  const r = await window.api?.app?.setDataFolderPath?.(dataFolderPath)
                  if (r?.ok) {
                    if (r?.needRestart) setDataFolderMessage(t('settings.dataFolderRestartRequired'))
                    return
                  }
                  setDataFolderMessage(t(`settings.dataFolderError_${r?.error ?? 'UNKNOWN'}`))
                }}
              >
                {t('settings.dataFolderSave')}
              </button>
            </span>
          </div>
          {dataFolderMessage && <p style={{ margin: '6px 0 0', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>{dataFolderMessage}</p>}
        </div>
        {window.api?.settings?.restorePredefinedPreset && window.api?.settings?.clearPredefinedPreset && (
          <section style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #27272a' }}>
            <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: '1rem' }}>{t('settings.predefinedSettings')}</h3>
            <p style={{ color: '#a1a1aa', fontSize: '0.875rem', marginBottom: 12 }}>{t('settings.predefinedSettingsHint')}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setPredefinedModalMode('restore')
                  setShowClearPredefinedModal(true)
                }}
              >
                {t('settings.restorePredefined')}
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setPredefinedModalMode('clear')
                  setShowClearPredefinedModal(true)
                }}
              >
                {t('settings.clearPredefined')}
              </button>
            </div>
          </section>
        )}
      </CollapsibleSection>

      <CollapsibleSection id="userData" title={t('settings.userData')} open={sectionOpen.userData ?? false} onToggle={toggleSection}>
        <div className="grid2" style={{ marginBottom: '1rem' }}>
          <div className="form-group">
            <label>{t('settings.userDataOrganization')}</label>
            <input value={authSession.currentOrg?.name ?? ''} readOnly style={{ background: 'var(--color-bg-secondary)', cursor: 'default' }} />
          </div>
          <div className="form-group">
            <label>{t('settings.userDataLogin')}</label>
            <input value={authSession.user?.display_name ?? '—'} readOnly style={{ background: 'var(--color-bg-secondary)', cursor: 'default' }} />
          </div>
          <div className="form-group">
            <label>{t('settings.userDataEmail')}</label>
            <input value={authSession.user?.email ?? '—'} readOnly style={{ background: 'var(--color-bg-secondary)', cursor: 'default' }} />
          </div>
        </div>
        <div style={{ marginTop: '1rem' }}>
          {!showChangePassword ? (
            <button type="button" className="primary" onClick={() => { setShowChangePassword(true); setChangePasswordMessage(null); setChangePasswordCurrent(''); setChangePasswordNew(''); setChangePasswordConfirm('') }}>
              {t('settings.changePassword')}
            </button>
          ) : (
            <div className="grid2" style={{ maxWidth: 360, marginBottom: '0.5rem' }}>
              <div className="form-group">
                <label>{t('settings.currentPassword')}</label>
                <input type="password" value={changePasswordCurrent} onChange={e => setChangePasswordCurrent(e.target.value)} placeholder="••••••••" />
              </div>
              <div className="form-group">
                <label>{t('settings.newPassword')}</label>
                <input type="password" value={changePasswordNew} onChange={e => setChangePasswordNew(e.target.value)} placeholder="••••••••" />
              </div>
              <div className="form-group">
                <label>{t('settings.confirmPassword')}</label>
                <input type="password" value={changePasswordConfirm} onChange={e => setChangePasswordConfirm(e.target.value)} placeholder="••••••••" />
              </div>
            </div>
          )}
          {showChangePassword && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="primary"
                onClick={async () => {
                  setChangePasswordMessage(null)
                  if (changePasswordNew !== changePasswordConfirm) {
                    setChangePasswordMessage(t('settings.changePasswordMismatch') as string)
                    return
                  }
                  if (changePasswordNew.length < 6) {
                    setChangePasswordMessage(t('auth.error_INVALID_INPUT') as string)
                    return
                  }
                  const result = await window.api.auth.changePassword(changePasswordCurrent, changePasswordNew)
                  if (result.ok) {
                    setChangePasswordMessage(t('settings.changePasswordSuccess') as string)
                    setChangePasswordCurrent('')
                    setChangePasswordNew('')
                    setChangePasswordConfirm('')
                    setTimeout(() => { setShowChangePassword(false) }, 2000)
                  } else {
                    setChangePasswordMessage(t('settings.changePasswordError') as string)
                  }
                }}
              >
                {t('settings.changePassword')}
              </button>
              <button type="button" onClick={() => { setShowChangePassword(false); setChangePasswordMessage(null) }}>
                {t('common.cancel')}
              </button>
            </div>
          )}
          {changePasswordMessage && <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>{changePasswordMessage}</p>}
        </div>
        <div style={{ marginTop: '1.5rem' }}>
          {!showChangeLogin ? (
            <button type="button" className="primary" onClick={() => { setShowChangeLogin(true); setChangeLoginMessage(null); setChangeLoginPassword(''); setChangeLoginNew('') }}>
              {t('settings.changeLogin')}
            </button>
          ) : (
            <div className="grid2" style={{ maxWidth: 360, marginBottom: '0.5rem' }}>
              <div className="form-group">
                <label>{t('settings.currentPassword')}</label>
                <input type="password" value={changeLoginPassword} onChange={e => setChangeLoginPassword(e.target.value)} placeholder="••••••••" />
              </div>
              <div className="form-group">
                <label>{t('settings.newLogin')}</label>
                <input type="text" value={changeLoginNew} onChange={e => setChangeLoginNew(e.target.value)} placeholder={t('settings.userDataLogin') as string} autoComplete="username" />
              </div>
            </div>
          )}
          {showChangeLogin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="primary"
                onClick={async () => {
                  setChangeLoginMessage(null)
                  const result = await window.api.auth.changeDisplayName?.(changeLoginPassword, changeLoginNew)
                  if (result?.ok) {
                    setChangeLoginMessage(t('settings.changeLoginSuccess') as string)
                    setChangeLoginPassword('')
                    setChangeLoginNew('')
                    refreshSession()
                    setTimeout(() => { setShowChangeLogin(false) }, 2000)
                  } else {
                    const key = result?.error ? `auth.error_${result.error}` : 'settings.changeLoginError'
                    setChangeLoginMessage(t(key) as string)
                  }
                }}
              >
                {t('settings.changeLogin')}
              </button>
              <button type="button" onClick={() => { setShowChangeLogin(false); setChangeLoginMessage(null) }}>
                {t('common.cancel')}
              </button>
            </div>
          )}
          {changeLoginMessage && <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>{changeLoginMessage}</p>}
        </div>
      </CollapsibleSection>

      <CollapsibleSection id="personal" title={t('settings.personal')} open={sectionOpen.personal ?? false} onToggle={toggleSection}>
        <div style={{ marginBottom: '1rem' }}>
          <button type="button" onClick={() => setShowTaxpayerNipModal(true)} disabled={taxpayerLookupLoading} title={t('clients.fetchByNipHint')}>
            {taxpayerLookupLoading ? t('clients.fetchByNipLoading') : t('clients.fetchByNip')}
          </button>
        </div>
        <div className="grid2" style={{ marginBottom: '1rem' }}>
          <div className="form-group">
            <label>{t('settings.companyName')}</label>
            <input value={companyName} onChange={e => { setCompanyName(e.target.value); window.api?.settings.set('company_name', e.target.value) }} placeholder="Your company / freelancer name" />
          </div>
          <div className="form-group">
            <label>{t('settings.firstName')}</label>
            <input value={firstName} onChange={e => { setFirstName(e.target.value); window.api?.settings.set('first_name', e.target.value) }} />
          </div>
          <div className="form-group">
            <label>{t('settings.lastName')}</label>
            <input value={lastName} onChange={e => { setLastName(e.target.value); window.api?.settings.set('last_name', e.target.value) }} />
          </div>
          <div className="form-group">
            <label>{t('settings.nip')}</label>
            <input value={personalNip} onChange={e => { setPersonalNip(e.target.value); window.api?.settings.set('personal_nip', e.target.value) }} placeholder="10 cyfr" style={{ width: 160 }} />
            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#71717a' }}>{t('clients.fetchByNipFailureHint')}</p>
            {taxpayerLookupMessage && <span style={{ display: 'block', marginTop: 4, color: '#a1a1aa', fontSize: '0.8rem' }}>{taxpayerLookupMessage}</span>}
          </div>
          <div className="form-group">
            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend style={{ marginBottom: 6 }}>{t('settings.sellerIsVatPayerQuestion')}</legend>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="seller_is_vat_payer"
                    checked={sellerIsVatPayer === '1'}
                    onChange={() => { setSellerIsVatPayer('1'); window.api?.settings.set('seller_is_vat_payer', '1') }}
                  />
                  {t('settings.sellerIsVatPayerYes')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="seller_is_vat_payer"
                    checked={sellerIsVatPayer === '0'}
                    onChange={() => { setSellerIsVatPayer('0'); window.api?.settings.set('seller_is_vat_payer', '0') }}
                  />
                  {t('settings.sellerIsVatPayerNo')}
                </label>
              </div>
              {invoiceProvider === 'wfirma' && (
                <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: '#71717a' }}>{t('settings.sellerIsVatPayerWfirmaHint')}</p>
              )}
            </fieldset>
          </div>
          <div className="form-group">
            <label>{t('settings.street')}</label>
            <input value={personalStreet} onChange={e => { setPersonalStreet(e.target.value); window.api?.settings.set('personal_street', e.target.value) }} />
          </div>
          <div className="form-group">
            <label>{t('settings.building')}</label>
            <input value={personalBuilding} onChange={e => { setPersonalBuilding(e.target.value); window.api?.settings.set('personal_building', e.target.value) }} />
          </div>
          <div className="form-group">
            <label>{t('settings.local')}</label>
            <input value={personalLocal} onChange={e => { setPersonalLocal(e.target.value); window.api?.settings.set('personal_local', e.target.value) }} />
          </div>
          <div className="form-group">
            <label>{t('settings.postalCode')}</label>
            <input value={personalPostalCode} onChange={e => { setPersonalPostalCode(e.target.value); window.api?.settings.set('personal_postal_code', e.target.value) }} />
          </div>
          <div className="form-group">
            <label>{t('settings.city')}</label>
            <input value={personalCity} onChange={e => { setPersonalCity(e.target.value); window.api?.settings.set('personal_city', e.target.value) }} />
          </div>
          <div className="form-group">
            <label>{t('settings.country')}</label>
            <select value={personalCountry} onChange={e => { const code = e.target.value; setPersonalCountry(code); window.api?.settings.set('personal_country', code) }}>
              <option value="">—</option>
              {countryOptions.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>{t('settings.addressExtra')}</label>
            <input value={personalAddressExtra} onChange={e => { setPersonalAddressExtra(e.target.value); window.api?.settings.set('personal_address_extra', e.target.value) }} />
          </div>
          <div className="form-group">
            <label>{t('settings.phone')}</label>
            <input value={personalPhone} onChange={e => { setPersonalPhone(e.target.value); window.api?.settings.set('personal_phone', e.target.value) }} />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection id="orderBooks" title={t('settings.orderBooks')} open={sectionOpen.orderBooks ?? false} onToggle={toggleSection}>
        <p style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>{t('settings.orderBooksHint')}</p>
        <p style={{ color: '#a1a1aa', fontSize: '0.875rem', marginTop: -4, marginBottom: 8 }}>{t('settings.numberFormatHint')}</p>
        <form onSubmit={async (e) => { e.preventDefault(); if (!window.api?.orderBooks?.add || !newBookName.trim()) return; await window.api.orderBooks.add({ name: newBookName.trim(), view_type: newBookViewType, order_number_format: newBookOrderNumberFormat || null }); notifyChecklist(); setNewBookName(''); load(); }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>{t('settings.bookName')}</label>
            <input value={newBookName} onChange={e => setNewBookName(e.target.value)} placeholder="e.g. Repertorium" style={{ width: 180 }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>{t('settings.orderBookView')}</label>
            <select value={newBookViewType} onChange={e => setNewBookViewType(e.target.value as 'simplified' | 'repertorium' | 'custom')}>
              <option value="simplified">{t('settings.orderBookView_simplified')}</option>
              <option value="repertorium">{t('settings.orderBookView_repertorium')}</option>
              <option value="custom">{t('settings.orderBookView_custom')}</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>{t('settings.orderNumberFormat')}</label>
            <input value={newBookOrderNumberFormat} onChange={e => setNewBookOrderNumberFormat(e.target.value)} placeholder="Z/{YYYY}/{NR}" style={{ width: 160 }} title={t('settings.numberFormatHint')} />
          </div>
          <button type="submit" className="primary">{t('common.add')}</button>
        </form>
        {orderBooks.length === 0 ? <p style={{ color: '#71717a' }}>—</p> : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {orderBooks.map(b => (
              <li key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                {editingBookId === b.id ? (
                  <>
                    <input value={editingBookName} onChange={e => setEditingBookName(e.target.value)} placeholder={t('settings.bookName')} style={{ width: 180 }} autoFocus />
                    <button type="button" className="primary" style={{ padding: '4px 8px' }} onClick={async () => { if (!editingBookName.trim() || !window.api?.orderBooks?.update) return; await window.api.orderBooks.update(b.id, { name: editingBookName.trim() }); notifyChecklist(); setEditingBookId(null); load(); }}>{t('common.save')}</button>
                    <button type="button" style={{ padding: '4px 8px' }} onClick={() => setEditingBookId(null)}>{t('common.cancel')}</button>
                  </>
                ) : (
                  <>
                    <span style={{ minWidth: 120 }}>{b.name}{b.archived ? ` ${t('orderBook.archived')}` : ''}</span>
                    <select value={b.view_type} onChange={async e => { const v = e.target.value; await window.api?.orderBooks?.update?.(b.id, { view_type: v }); load(); }} style={{ width: 160 }}>
                      <option value="simplified">{t('settings.orderBookView_simplified')}</option>
                      <option value="repertorium">{t('settings.orderBookView_repertorium')}</option>
                      <option value="custom">{t('settings.orderBookView_custom')}</option>
                    </select>
                    <input value={b.order_number_format ?? ''} onChange={e => setOrderBooks(prev => prev.map(x => x.id === b.id ? { ...x, order_number_format: e.target.value } : x))} onBlur={async e => { const v = (e.target as HTMLInputElement).value.trim() || null; await window.api?.orderBooks?.update?.(b.id, { order_number_format: v }); load(); }} placeholder="Z/{YYYY}/{NR}" style={{ width: 140 }} title={t('settings.orderNumberFormat')} />
                    <button type="button" style={{ padding: '4px 8px' }} onClick={async () => { if (!window.api?.orderBooks?.update) return; await window.api.orderBooks.update(b.id, { archived: b.archived ? 0 : 1 }); notifyChecklist(); load(); }}>{b.archived ? t('settings.unarchiveBook') : t('settings.archiveBook')}</button>
                    <button type="button" style={{ padding: '4px 8px' }} onClick={() => { setEditingBookId(b.id); setEditingBookName(b.name); }}>{t('common.edit')}</button>
                    <button type="button" className="danger" style={{ padding: '4px 8px' }} onClick={async () => { const ok = confirm(t('settings.deleteBookConfirm')); window.api?.app?.refocusWindow?.(); if (ok) { await window.api?.orderBooks?.delete?.(b.id); notifyChecklist(); } load(); }}>{t('common.delete')}</button>
                  </>
                )}
                {b.view_type === 'repertorium' && (
                  <div style={{ width: '100%', marginTop: 8, paddingLeft: 16, borderLeft: '3px solid var(--color-border, #3f3f46)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ minWidth: 220 }}>{t('settings.unitCategoryOralUnit')}:</span>
                      <select
                        value={b.repertorium_oral_unit_id != null ? String(b.repertorium_oral_unit_id) : ''}
                        onChange={async e => {
                          const v = e.target.value
                          const id = v === '' ? null : parseInt(v, 10)
                          if (v !== '' && Number.isNaN(id as number)) return
                          setOrderBooks(prev => prev.map(x => x.id === b.id ? { ...x, repertorium_oral_unit_id: v === '' ? null : id } : x))
                          if (window.api?.orderBooks?.update) await window.api.orderBooks.update(b.id, { repertorium_oral_unit_id: v === '' ? null : id, repertorium_page_unit_id: b.repertorium_page_unit_id ?? null })
                          notifyChecklist()
                        }}
                        style={{ minWidth: 200, fontSize: '0.875rem' }}
                      >
                        <option value="">—</option>
                        {units.map(u => <option key={u.id} value={String(u.id)}>{u.name}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ minWidth: 220 }}>{t('settings.unitCategoryPageUnit')}:</span>
                      <select
                        value={b.repertorium_page_unit_id != null ? String(b.repertorium_page_unit_id) : ''}
                        onChange={async e => {
                          const v = e.target.value
                          const id = v === '' ? null : parseInt(v, 10)
                          if (v !== '' && Number.isNaN(id as number)) return
                          setOrderBooks(prev => prev.map(x => x.id === b.id ? { ...x, repertorium_page_unit_id: v === '' ? null : id } : x))
                          if (window.api?.orderBooks?.update) await window.api.orderBooks.update(b.id, { repertorium_oral_unit_id: b.repertorium_oral_unit_id ?? null, repertorium_page_unit_id: v === '' ? null : id })
                          notifyChecklist()
                        }}
                        style={{ minWidth: 200, fontSize: '0.875rem' }}
                      >
                        <option value="">—</option>
                        {units.map(u => <option key={u.id} value={String(u.id)}>{u.name}</option>)}
                      </select>
                    </div>
                  </div>
                )}
                {b.view_type === 'custom' && (
                  <div style={{ width: '100%', marginTop: 8, paddingLeft: 16, borderLeft: '3px solid var(--color-border, #3f3f46)' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 6 }}>{t('settings.customColumns')}</div>
                    <form onSubmit={async (e) => {
                      e.preventDefault()
                      if (!newColName.trim()) return
                      const name = newColName.trim()
                      const colType = newColType
                      await window.api?.customColumns?.add?.({ book_id: b.id, name, col_type: colType })
                      setNewColName(''); setNewColType('text'); setNewColBookId(b.id)
                      const cols = await window.api?.customColumns?.listByBook?.(b.id).catch(() => [])
                      if (Array.isArray(cols)) {
                        setCustomColumnsMap(prev => ({ ...prev, [b.id]: cols as { id: number; name: string; col_type: string; sort_order: number }[] }))
                      }
                    }} style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
                      <input value={newColBookId === b.id ? newColName : ''} onChange={e => { setNewColBookId(b.id); setNewColName(e.target.value) }} onFocus={() => setNewColBookId(b.id)} placeholder={t('settings.columnName')} style={{ width: 140 }} />
                      <select value={newColBookId === b.id ? newColType : 'text'} onChange={e => { setNewColBookId(b.id); setNewColType(e.target.value as 'text' | 'date' | 'number') }} onFocus={() => setNewColBookId(b.id)} style={{ width: 90 }}>
                        <option value="text">{t('settings.colTypeText')}</option>
                        <option value="date">{t('settings.colTypeDate')}</option>
                        <option value="number">{t('settings.colTypeNumber')}</option>
                      </select>
                      <button type="submit" className="primary" style={{ padding: '4px 10px' }}>{t('common.add')}</button>
                    </form>
                    <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: 6, color: '#a1a1aa' }}>{t('settings.addedCustomColumns')}</div>
                    {(customColumnsMap[b.id] ?? []).length === 0 ? (
                      <p style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: '#71717a' }}>{t('settings.noCustomColumnsYet')}</p>
                    ) : (
                      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px 0', fontSize: '0.85rem' }}>
                        {(customColumnsMap[b.id] ?? []).map(col => {
                          const customKey = `custom_${col.id}`
                          const hidden = (hiddenDefaultColumnsByBook[b.id] ?? []).includes(customKey)
                          return (
                            <li key={col.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ minWidth: 140 }}>{col.name}</span>
                              <span style={{ color: '#71717a', fontSize: '0.75rem' }}>({col.col_type})</span>
                              {hidden ? (
                                <button type="button" className="primary" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={async () => {
                                  const prev = hiddenDefaultColumnsByBook[b.id] ?? []
                                  const next = prev.filter(k => k !== customKey)
                                  setHiddenDefaultColumnsByBook(prevState => ({ ...prevState, [b.id]: next }))
                                  await window.api?.settings?.set?.(`book_${b.id}_hidden_columns`, JSON.stringify(next))
                                  load()
                                }}>{t('settings.restoreColumn')}</button>
                              ) : (
                                <button type="button" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={async () => {
                                  const prev = hiddenDefaultColumnsByBook[b.id] ?? []
                                  const next = [...prev, customKey]
                                  setHiddenDefaultColumnsByBook(prevState => ({ ...prevState, [b.id]: next }))
                                  await window.api?.settings?.set?.(`book_${b.id}_hidden_columns`, JSON.stringify(next))
                                  load()
                                }}>{t('settings.hideColumn')}</button>
                              )}
                              <button type="button" className="danger" style={{ padding: '2px 6px', fontSize: '0.7rem' }} onClick={async () => {
                                const okCol = confirm(t('settings.deleteColumnConfirm')); window.api?.app?.refocusWindow?.(); if (!okCol) return
                                await window.api?.customColumns?.delete?.(col.id)
                                setCustomColumnsMap(prev => ({ ...prev, [b.id]: (prev[b.id] ?? []).filter(c => c.id !== col.id) }))
                                load()
                              }}>{t('common.delete')}</button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    <div style={{ marginTop: 12, fontWeight: 600, fontSize: '0.85rem', marginBottom: 6 }}>{t('settings.defaultColumns')}</div>
                    <p style={{ color: '#a1a1aa', fontSize: '0.8rem', margin: '0 0 6px 0' }}>{t('settings.defaultColumnsHint')}</p>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem' }}>
                      {DEFAULT_COLUMNS_FOR_CUSTOM.map(col => {
                        const hidden = (hiddenDefaultColumnsByBook[b.id] ?? []).includes(col.key)
                        return (
                          <li key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ minWidth: 140 }}>{t(col.labelKey)}</span>
                            {hidden ? (
                              <button type="button" className="primary" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={async () => {
                                const prev = hiddenDefaultColumnsByBook[b.id] ?? []
                                const next = prev.filter(k => k !== col.key)
                                setHiddenDefaultColumnsByBook(prevState => ({ ...prevState, [b.id]: next }))
                                await window.api?.settings?.set?.(`book_${b.id}_hidden_columns`, JSON.stringify(next))
                                load()
                              }}>{t('settings.restoreColumn')}</button>
                            ) : (
                              <button type="button" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={async () => {
                                const prev = hiddenDefaultColumnsByBook[b.id] ?? []
                                const next = [...prev, col.key]
                                setHiddenDefaultColumnsByBook(prevState => ({ ...prevState, [b.id]: next }))
                                await window.api?.settings?.set?.(`book_${b.id}_hidden_columns`, JSON.stringify(next))
                                load()
                              }}>{t('settings.hideColumn')}</button>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection id="subcontracts" title={t('settings.subcontracts')} open={sectionOpen.subcontracts ?? false} onToggle={toggleSection}>
        <p style={{ color: '#a1a1aa', fontSize: '0.875rem', marginBottom: 8 }}>{t('settings.numberFormatHint')}</p>
        <div className="form-group" style={{ marginBottom: 0, maxWidth: 240 }}>
          <label>{t('settings.subcontractNumberFormat')}</label>
          <input value={subcontractNumberFormat} onChange={e => saveSubcontractNumberFormat(e.target.value)} placeholder="PZ/{YYYY}/{NR}" style={{ width: 180 }} />
        </div>
      </CollapsibleSection>

      <CollapsibleSection id="specializations" title={t('settings.specializations')} open={sectionOpen.specializations ?? false} onToggle={toggleSection}>
        <p style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>{t('settings.specializationsHint')}</p>
        <form onSubmit={addSpec} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>{t('settings.unitName')}</label>
            <input value={specName} onChange={e => setSpecName(e.target.value)} placeholder="e.g. Translation" style={{ width: 160 }} />
          </div>
          <button type="submit" className="primary">{t('common.add')}</button>
        </form>
        {specializations.length === 0 ? <p style={{ color: '#71717a' }}>—</p> : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {specializations.map(s => (
              <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span>{s.name}</span>
                <button type="button" className="danger" style={{ padding: '4px 8px' }} onClick={() => deleteSpec(s.id)}>{t('common.delete')}</button>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection id="services" title={t('settings.services')} open={sectionOpen.services ?? false} onToggle={toggleSection}>
        <p style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>{t('settings.servicesHint')}</p>
        <form onSubmit={addService} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>{t('orders.service')}</label>
            <input value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="e.g. Tłumaczenie pisemne" style={{ width: 200 }} />
          </div>
          <button type="submit" className="primary">{t('common.add')}</button>
        </form>
        {services.length === 0 ? <p style={{ color: '#71717a' }}>—</p> : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
            {services.map(svc => {
              const rules = serviceVatRulesByService[svc.id] ?? []
              const defaultRule = (seg: VatClientSegment) => rules.find(r => r.client_segment === seg && !(r.country_code ?? '').trim())
              return (
                <li key={svc.id} style={{ padding: 12, border: '1px solid var(--color-border, #3f3f46)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    {editingServiceId === svc.id ? (
                      <>
                        <input value={editingServiceName} onChange={e => setEditingServiceName(e.target.value)} placeholder={t('orders.service')} style={{ width: 200 }} />
                        <button type="button" className="primary" style={{ padding: '4px 8px' }} onClick={() => updateService(svc.id)}>{t('common.save')}</button>
                        <button type="button" style={{ padding: '4px 8px' }} onClick={() => { setEditingServiceId(null); setEditingServiceName('') }}>{t('common.cancel')}</button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontWeight: 600 }}>{svc.name}</span>
                        <button type="button" style={{ padding: '4px 8px' }} onClick={() => { setEditingServiceId(svc.id); setEditingServiceName(svc.name) }}>{t('common.edit')}</button>
                        <button type="button" className="danger" style={{ padding: '4px 8px' }} onClick={() => deleteService(svc.id)}>{t('common.delete')}</button>
                      </>
                    )}
                  </div>
                  <table style={{ width: '100%', maxWidth: 560, fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--color-border)' }}>{t('settings.vatPerService')}</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--color-border)', width: 100 }}>{t('settings.vatRuleRate')}</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--color-border)', width: 120 }}>{t('settings.vatRuleCode')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {VAT_SEGMENTS.map(seg => {
                        const rule = defaultRule(seg)
                        const isRate = rule?.value_type === 'rate'
                        return (
                          <tr key={`${svc.id}-${seg}`}>
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
                                value={pendingServiceVatRate[`${svc.id}-${seg}`] ?? (isRate && rule?.rate_value != null ? String(rule.rate_value) : '')}
                                onChange={e => setPendingServiceVatRate(prev => ({ ...prev, [`${svc.id}-${seg}`]: e.target.value }))}
                                onBlur={e => {
                                  const key = `${svc.id}-${seg}`
                                  const v = e.target.value.trim()
                                  const num = v === '' ? null : Number.parseFloat(v)
                                  setPendingServiceVatRate(prev => { const next = { ...prev }; delete next[key]; return next })
                                  if (v !== '' && Number.isFinite(num)) {
                                    upsertServiceVatRule({ service_id: svc.id, client_segment: seg, country_code: null, value_type: 'rate', rate_value: num, code_value: null })
                                  } else if (rule?.id != null && rule.value_type === 'rate') {
                                    deleteServiceVatRule(svc.id, rule.id)
                                  }
                                }}
                              />
                            </td>
                            <td style={{ padding: '4px 8px' }}>
                              <select
                                style={{ width: 112 }}
                                value={!isRate && rule?.code_value ? resolveStoredVatCodeToCurrent(rule.code_value) : ''}
                                onChange={e => {
                                  const code = e.target.value
                                  upsertServiceVatRule({ service_id: svc.id, client_segment: seg, country_code: null, value_type: 'code', rate_value: null, code_value: code || null })
                                }}
                              >
                                <option value="">—</option>
                                {vatCodeDefs.filter(d => getVatCodeCode(d)).map((d, i) => <option key={i} value={getVatCodeCode(d)}>{getVatCodeCodeForDisplay(d)}</option>)}
                              </select>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </li>
              )
            })}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection id="invoices" title={t('settings.invoices')} open={sectionOpen.invoices ?? false} onToggle={toggleSection}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px 20px', alignItems: 'start' }}>
        {/* Sposób wystawiania faktur */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>{t('settings.invoiceProvider')}</label>
          <select
            value={invoiceProvider}
            onChange={e => {
              const v = e.target.value as 'internal' | 'wfirma'
              setInvoiceProvider(v)
              window.api?.settings.set('invoice_provider', v)
            }}
            style={{ minWidth: 260 }}
          >
            <option value="internal">{t('settings.invoiceProviderInternal')}</option>
            <option value="wfirma">{t('settings.invoiceProviderWfirma')}</option>
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }} key={i18n.language}>
          <label>{t('settings.vatCodeDefinitions')}</label>
          <p style={{ color: '#a1a1aa', fontSize: '0.875rem', marginTop: -4, marginBottom: 8 }}>{t('settings.vatCodeDefinitionsHint')}</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px 0' }}>
            {vatCodeDefs.map((def, idx) => {
              const code = getVatCodeCodeForDisplay(def)
              const label = getVatCodeLabel(def)
              if (!code && !label) return null
              return (
                <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <strong>{code || '—'}</strong>
                  <span style={{ color: '#71717a' }}>{label || '—'}</span>
                  <button type="button" className="danger" style={{ padding: '2px 6px', fontSize: '0.75rem' }} onClick={() => saveVatCodeDefs(vatCodeDefs.filter((_, i) => i !== idx))}>{t('common.delete')}</button>
                </li>
              )
            })}
          </ul>
          <form onSubmit={e => {
            e.preventDefault()
            const code = newVatCode.trim()
            const label = newVatCodeLabel.trim()
            if (!code) return
            const curCode = code.toUpperCase()
            const existingIdx = vatCodeDefs.findIndex(d => (isUiPl ? (d.code_pl || '').trim() : (d.code_en || '').trim()).toUpperCase() === curCode)
            if (existingIdx >= 0) {
              const d = vatCodeDefs[existingIdx]
              const next = [...vatCodeDefs]
              next[existingIdx] = isUiPl
                ? { ...d, code_pl: code, label_pl: label || d.label_pl }
                : { ...d, code_en: code, label_en: label || d.label_en }
              saveVatCodeDefs(next)
            } else {
              saveVatCodeDefs([...vatCodeDefs, {
                code_pl: isUiPl ? code : '',
                label_pl: isUiPl ? (label || code) : '',
                code_en: !isUiPl ? code : '',
                label_en: !isUiPl ? (label || code) : ''
              }])
            }
            setNewVatCode('')
            setNewVatCodeLabel('')
          }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>{t('settings.vatCode')}</label>
              <input value={newVatCode} onChange={e => setNewVatCode(e.target.value)} placeholder={isUiPl ? 'NP' : 'O'} style={{ width: 72 }} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>{t('settings.vatCodeLabel')}</label>
              <input value={newVatCodeLabel} onChange={e => setNewVatCodeLabel(e.target.value)} placeholder={isUiPl ? 'Nie podlega' : 'Outside of scope'} style={{ width: 160 }} />
            </div>
            <button type="submit" className="primary">{t('settings.addVatCode')}</button>
          </form>
        </div>
        {invoiceProvider !== 'wfirma' && (
          <>
            <div style={{ marginBottom: 0 }}>
              <p style={{ color: '#a1a1aa', fontSize: '0.875rem', marginBottom: 8 }}>{t('settings.numberFormatHint')}</p>
              <div className="form-group" style={{ marginBottom: 0, maxWidth: 240 }}>
              <label>{t('settings.invoiceNumberFormat')}</label>
              <input value={invoiceNumberFormat} onChange={e => saveInvoiceNumberFormat(e.target.value)} placeholder="FV/{YYYY}/{NR}" style={{ width: 180 }} />
              </div>
            </div>
          </>
        )}
        {invoiceProvider === 'wfirma' && (
          <>
            <div className="form-group" style={{ marginBottom: 0, maxWidth: 400 }}>
              <label>{t('settings.wfirmaAccessKey')}</label>
              <input
                type="text"
                value={wfirmaAccessKey}
                onChange={e => {
                  setWfirmaAccessKey(e.target.value)
                  setWfirmaTestMessage(null)
                  window.api?.settings.set('wfirma_access_key', e.target.value)
                }}
                placeholder={t('settings.wfirmaAccessKeyPlaceholder')}
                autoComplete="off"
                style={{ width: '100%' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0, maxWidth: 400 }}>
              <label>{t('settings.wfirmaSecretKey')}</label>
              <input
                type="password"
                value={wfirmaSecretKey}
                onChange={e => {
                  setWfirmaSecretKey(e.target.value)
                  setWfirmaTestMessage(null)
                  window.api?.settings.set('wfirma_secret_key', e.target.value)
                }}
                placeholder={t('settings.wfirmaSecretKeyPlaceholder')}
                autoComplete="off"
                style={{ width: '100%' }}
              />
              <p style={{ color: '#71717a', fontSize: '0.75rem', marginTop: 4 }}>{t('settings.wfirmaKeysHint')}</p>
            </div>
            <div className="form-group" style={{ marginBottom: 0, maxWidth: 200 }}>
              <label>{t('settings.wfirmaCompanyId')}</label>
              <input
                type="text"
                value={wfirmaCompanyId}
                onChange={e => {
                  setWfirmaCompanyId(e.target.value)
                  window.api?.settings.set('wfirma_company_id', e.target.value)
                }}
                placeholder={t('settings.wfirmaCompanyIdPlaceholder')}
                style={{ width: 120 }}
              />
              <p style={{ color: '#71717a', fontSize: '0.75rem', marginTop: 4 }}>{t('settings.wfirmaCompanyIdHint')}</p>
            </div>
            <div className="form-group" style={{ marginBottom: 0, maxWidth: 500 }}>
              <label>{t('settings.wfirmaCompanyAccount')}</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={wfirmaCompanyAccountId}
                  onChange={e => {
                    const v = e.target.value
                    setWfirmaCompanyAccountId(v)
                    window.api?.settings.set('wfirma_company_account_id', v)
                  }}
                  style={{ minWidth: 280 }}
                >
                  <option value="">{t('settings.wfirmaCompanyAccountAuto')}</option>
                  {wfirmaCompanyAccounts.map(acc => (
                    <option key={acc.id} value={String(acc.id)}>
                      {acc.name ? `${acc.name} — ` : ''}{acc.bank_name ? `${acc.bank_name}: ` : ''}{acc.account_number}{acc.currency ? ` (${acc.currency})` : ''}
                    </option>
                  ))}
                </select>
                <button type="button" className="secondary" disabled={wfirmaAccountsLoading} onClick={loadWfirmaCompanyAccounts}>
                  {wfirmaAccountsLoading ? t('settings.wfirmaAccountsLoading') : t('settings.wfirmaAccountsRefresh')}
                </button>
              </div>
              <p style={{ color: '#71717a', fontSize: '0.75rem', marginTop: 4 }}>{t('settings.wfirmaCompanyAccountHint')}</p>
              {wfirmaAccountsMessage && (
                <p style={{ marginTop: 6, fontSize: '0.8rem', color: '#a16207' }}>{wfirmaAccountsMessage}</p>
              )}
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <button
                type="button"
                className="secondary"
                disabled={wfirmaTestLoading || !wfirmaAccessKey.trim() || !wfirmaSecretKey.trim()}
                onClick={async () => {
                  if (!window.api?.wfirma?.testConnection) return
                  setWfirmaTestMessage(null)
                  setWfirmaTestLoading(true)
                  try {
                    const result = await window.api.wfirma.testConnection(wfirmaAccessKey.trim(), wfirmaSecretKey.trim(), wfirmaAppKey.trim() || undefined, wfirmaCompanyId.trim() || undefined)
                    setWfirmaTestMessage({ ok: result.ok, text: result.ok ? t('settings.wfirmaTestSuccess') : result.message })
                    if (result.ok) await loadWfirmaCompanyAccounts()
                  } catch (e) {
                    setWfirmaTestMessage({ ok: false, text: e instanceof Error ? e.message : String(e) })
                  } finally {
                    setWfirmaTestLoading(false)
                  }
                }}
              >
                {wfirmaTestLoading ? t('settings.wfirmaTestConnecting') : t('settings.wfirmaTestConnection')}
              </button>
              {wfirmaTestMessage && (
                <p style={{ marginTop: 8, fontSize: '0.875rem', color: wfirmaTestMessage.ok ? '#22c55e' : '#ef4444' }}>
                  {wfirmaTestMessage.text}
                </p>
              )}
            </div>
          </>
        )}
        {/* Logo */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>{t('settings.invoiceLogo')}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" onClick={async () => {
              const filePath = await window.api?.dialog?.openFile?.({ filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp'] }], title: t('settings.invoiceLogoSelect') })
              if (filePath && window.api?.settings?.setInvoiceLogo) {
                const savedPath = await window.api.settings.setInvoiceLogo(filePath)
                setInvoiceLogoPath(savedPath || '')
              } else if (filePath) {
                setInvoiceLogoPath(filePath)
                window.api?.settings.set('invoice_logo_path', filePath)
              }
            }}>{t('settings.invoiceLogoSelect')}</button>
            {invoiceLogoPath && (
              <>
                <span style={{ fontSize: '0.8rem', color: '#a1a1aa', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={invoiceLogoPath}>{invoiceLogoPath.split(/[/\\]/).pop()}</span>
                <button type="button" className="danger" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={async () => {
                  setInvoiceLogoPath('')
                  if (window.api?.settings?.setInvoiceLogo) await window.api.settings.setInvoiceLogo(null)
                  else window.api?.settings.set('invoice_logo_path', '')
                }}>{t('common.delete')}</button>
              </>
            )}
          </div>
          <p style={{ color: '#71717a', fontSize: '0.75rem', marginTop: 4 }}>{t('settings.invoiceLogoHint')}</p>
        </div>

        {/* Uwagi na fakturze (szablony) */}
        <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
          <label>{t('settings.invoiceNotesList')}</label>
          {invoiceNotesList.map((text, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
              <textarea
                value={text}
                onChange={e => {
                  const next = [...invoiceNotesList]
                  next[i] = e.target.value
                  setInvoiceNotesList(next)
                  window.api?.settings.set('invoice_notes_list', JSON.stringify(next))
                }}
                placeholder={t('settings.invoiceNotesPlaceholder')}
                rows={2}
                style={{ flex: 1, maxWidth: 500, resize: 'vertical', fontSize: '0.875rem' }}
              />
              <button type="button" className="danger" style={{ padding: '6px 10px', flexShrink: 0 }} onClick={() => {
                const next = invoiceNotesList.filter((_, j) => j !== i)
                setInvoiceNotesList(next)
                window.api?.settings.set('invoice_notes_list', JSON.stringify(next))
              }}>{t('common.delete')}</button>
            </div>
          ))}
          <button type="button" className="secondary" style={{ marginTop: 4 }} onClick={() => {
            const next = [...invoiceNotesList, '']
            setInvoiceNotesList(next)
            window.api?.settings.set('invoice_notes_list', JSON.stringify(next))
          }}>{t('settings.invoiceNotesAdd')}</button>
          <p style={{ color: '#71717a', fontSize: '0.75rem', marginTop: 8 }}>{t('settings.invoiceNotesListHint')}</p>
        </div>

        {invoiceProvider !== 'wfirma' && (
          <>
            {/* Konta bankowe */}
            <div style={{ marginBottom: 0 }}>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>{t('settings.bankAccounts')}</label>
              {bankAccounts.length > 0 && (
                <table style={{ width: '100%', maxWidth: 700, marginBottom: 12, fontSize: '0.875rem' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>{t('settings.bankName')}</th>
                      <th style={{ textAlign: 'left' }}>{t('settings.bankAddress')}</th>
                      <th style={{ textAlign: 'left' }}>{t('settings.accountNumber')}</th>
                      <th>SWIFT</th>
                      <th>{t('settings.currency')}</th>
                      <th>{t('settings.default')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankAccounts.map(ba => (
                      <tr key={ba.id}>
                        <td>{ba.bank_name || '—'}</td>
                        <td style={{ fontSize: '0.8rem', maxWidth: 180 }}>{ba.bank_address || '—'}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{ba.account_number}</td>
                        <td style={{ textAlign: 'center' }}>{ba.swift || '—'}</td>
                        <td style={{ textAlign: 'center' }}>{ba.currency}</td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="radio" name="defaultBankAccount" checked={ba.is_default === 1} onChange={async () => { await window.api?.bankAccounts?.setDefault?.(ba.id); load() }} />
                        </td>
                        <td>
                          <button type="button" className="danger" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={async () => { const okBa = confirm(t('common.deleteConfirm')); window.api?.app?.refocusWindow?.(); if (okBa) { await window.api?.bankAccounts?.delete?.(ba.id); load() } }}>{t('common.delete')}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <form onSubmit={async (e) => {
                e.preventDefault()
                if (!newBankAccount.trim()) return
                await window.api?.bankAccounts?.add?.({ bank_name: newBankName.trim(), bank_address: newBankAddress.trim(), account_number: newBankAccount.trim(), swift: newBankSwift.trim(), currency: newBankCurrency.trim() || 'PLN', is_default: bankAccounts.length === 0 ? 1 : 0 })
                setNewBankName(''); setNewBankAddress(''); setNewBankAccount(''); setNewBankSwift(''); setNewBankCurrency('PLN')
                load()
              }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>{t('settings.bankName')}</label>
                  <input value={newBankName} onChange={e => setNewBankName(e.target.value)} placeholder="e.g. PKO BP" style={{ width: 140 }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>{t('settings.bankAddress')}</label>
                  <input value={newBankAddress} onChange={e => setNewBankAddress(e.target.value)} placeholder="e.g. ul. Marszałkowska 1, 00-001 Warszawa" style={{ width: 240 }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>{t('settings.accountNumber')}</label>
                  <input value={newBankAccount} onChange={e => setNewBankAccount(e.target.value)} placeholder="PL00 0000 0000 0000 0000 0000 0000" style={{ width: 280 }} required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>SWIFT</label>
                  <input value={newBankSwift} onChange={e => setNewBankSwift(e.target.value)} placeholder="BPKOPLPW" style={{ width: 110 }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>{t('settings.currency')}</label>
                  <input value={newBankCurrency} onChange={e => setNewBankCurrency(e.target.value)} placeholder="PLN" style={{ width: 60 }} />
                </div>
                <button type="submit" className="primary">{t('common.add')}</button>
              </form>
            </div>
          </>
        )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection id="languages" title={t('settings.languages')} open={sectionOpen.languages ?? false} onToggle={toggleSection}>
        <p style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>{t('settings.languagesHint')}</p>
        <div style={{ marginBottom: '0.75rem' }}>
          <span style={{ marginRight: 8 }}>{t('settings.addFromList')}:</span>
          {PREDEFINED_LANGUAGES.filter(pr => !languages.some(l => l.code.toUpperCase() === pr.code)).map(pr => (
            <button key={pr.code} type="button" style={{ marginRight: 6, marginBottom: 4 }} onClick={() => addLangFromPredefined(pr.code, pr.name)}>{pr.code} ({langDisplay(pr.code, pr.name)})</button>
          ))}
          {PREDEFINED_LANGUAGES.every(pr => languages.some(l => l.code.toUpperCase() === pr.code)) && <span style={{ color: '#71717a' }}>—</span>}
        </div>
        <form onSubmit={addLang} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>{t('settings.code')}</label>
            <input value={langCode} onChange={e => setLangCode(e.target.value)} placeholder="EN" style={{ width: 80 }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>{t('settings.languageName')}</label>
            <input value={langName} onChange={e => setLangName(e.target.value)} placeholder="English" style={{ width: 140 }} />
          </div>
          <button type="submit" className="primary">{t('common.add')}</button>
        </form>
        {languages.length === 0 ? <p>{t('settings.noLanguages')}</p> : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px 16px' }}>
            {languages.map(l => (
              <li key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span><strong>{l.code}</strong> — {langDisplay(l.code, l.name)}</span>
                <button type="button" className="danger" style={{ padding: '4px 8px' }} onClick={() => deleteLang(l.id)}>{t('common.delete')}</button>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection id="currencies" title={t('settings.currencies')} open={sectionOpen.currencies ?? false} onToggle={toggleSection}>
        <p style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>{t('settings.currenciesHint')}</p>
        <form onSubmit={e => { e.preventDefault(); if (!newCurrency.trim() || !window.api?.settings?.set) return; const code = newCurrency.trim().toUpperCase(); if (rateCurrencies.includes(code)) { setNewCurrency(''); return; } const next = [...rateCurrencies, code].sort(); setRateCurrencies(next); window.api.settings.set('rate_currencies', JSON.stringify(next)); notifyChecklist(); setNewCurrency(''); }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>{t('settings.currencyCode')}</label>
            <input type="text" value={newCurrency} onChange={e => setNewCurrency(e.target.value)} placeholder="np. PLN, EUR, CHF" style={{ width: 100 }} maxLength={10} />
          </div>
          <button type="submit" className="primary">{t('settings.addCurrency')}</button>
        </form>
        {rateCurrencies.length === 0 ? <p style={{ color: '#71717a' }}>—</p> : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {rateCurrencies.map(c => (
              <li key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ minWidth: 60, fontWeight: 500 }}>{c}</span>
                <button type="button" className="danger" style={{ padding: '4px 8px' }} onClick={() => { const next = rateCurrencies.filter(x => x !== c); setRateCurrencies(next); window.api?.settings?.set('rate_currencies', JSON.stringify(next)); notifyChecklist(); }}>{t('common.delete')}</button>
              </li>
            ))}
          </ul>
        )}
        <div className="form-group" style={{ marginTop: '1rem' }}>
          <label>{t('settings.defaultCurrency')}</label>
          <select value={defaultCurrency} onChange={e => { const v = e.target.value; setDefaultCurrency(v); window.api?.settings?.set('default_currency', v); notifyChecklist(); }} style={{ minWidth: 100 }}>
            <option value="">—</option>
            {[...new Set([...rateCurrencies, defaultCurrency].filter(Boolean))].sort().map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </CollapsibleSection>

      <CollapsibleSection id="languagePairs" title={t('settings.languagePairs')} open={sectionOpen.languagePairs ?? false} onToggle={toggleSection}>
        <p style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>{t('settings.languagePairsHint')}</p>
        <form onSubmit={addPair} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>{t('settings.source')}</label>
            <select value={pairSource} onChange={e => setPairSource(e.target.value)}>
              <option value="">—</option>
              {languagesForPairDropdown.map(l => <option key={l.id} value={l.id}>{l.code} ({langDisplay(l.code, l.name)})</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>{t('settings.target')}</label>
            <select value={pairTarget} onChange={e => setPairTarget(e.target.value)}>
              <option value="">—</option>
              {languagesForPairDropdown.map(l => <option key={l.id} value={l.id}>{l.code} ({langDisplay(l.code, l.name)})</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" id="pair-bidirectional" checked={pairBidirectional} onChange={e => setPairBidirectional(e.target.checked)} disabled={pairSource === pairTarget && !!pairSource} />
            <label htmlFor="pair-bidirectional" style={{ marginBottom: 0, cursor: 'pointer' }}>{t('settings.pairBidirectional')}</label>
          </div>
          <button type="submit" className="primary" disabled={!pairSource || !pairTarget}>{t('common.add')}</button>
        </form>
        {pairs.length === 0 ? <p>{t('settings.noPairs')}</p> : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {pairs.map(p => (
              <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span>{pairDisplayLabel(p)}</span>
                <button type="button" className="danger" style={{ padding: '4px 8px' }} onClick={() => deletePair(p.id)}>{t('common.delete')}</button>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection id="units" title={t('settings.units')} open={sectionOpen.units ?? false} onToggle={toggleSection}>
        <p style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>{t('settings.unitsHint')}</p>
        <p style={{ color: '#a1a1aa', fontSize: '0.875rem', marginTop: -4, marginBottom: 12 }}>{t('settings.unitsBaseForStatsHint')}</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: '1rem' }}>{t('settings.unitCategories')}</h3>
            <form onSubmit={addCategory} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t('settings.unitCategoryName')}</label>
                <input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="e.g. Tłumaczenie pisemne" style={{ width: 180 }} />
              </div>
              <button type="submit" className="primary">{t('common.add')}</button>
            </form>
            {unitCategories.length === 0 ? <p style={{ color: '#71717a' }}>—</p> : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {unitCategories.map(c => {
                  const unitsInCategory = units.filter(u => (u.unit_category_ids ?? []).includes(c.id))
                  const isEditingCategory = editingCategoryId === c.id
                  return (
                    <li key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      {isEditingCategory ? (
                        <input
                          value={editingCategoryName}
                          onChange={e => setEditingCategoryName(e.target.value)}
                          placeholder={t('settings.unitCategoryName')}
                          style={{ minWidth: 140, width: 220 }}
                          autoFocus
                        />
                      ) : (
                        <span style={{ minWidth: 140 }}>{c.name}</span>
                      )}
                      <span style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>{t('settings.unitCategoryBaseUnit')}:</span>
                      <select
                        value={c.base_unit_id ?? ''}
                        onChange={async e => {
                          const v = e.target.value
                          if (!window.api?.unitCategories?.update) return
                          const baseUnitId = v === '' ? null : parseInt(v, 10)
                          if (v !== '' && Number.isNaN(baseUnitId as number)) return
                          await window.api.unitCategories.update(c.id, { base_unit_id: baseUnitId })
                          load()
                        }}
                        style={{ width: 160, fontSize: '0.875rem' }}
                      >
                        <option value="">—</option>
                        {unitsInCategory.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                      {isEditingCategory ? (
                        <>
                          <button type="button" className="primary" style={{ padding: '4px 8px' }} onClick={saveCategoryEdit}>{t('common.save')}</button>
                          <button type="button" style={{ padding: '4px 8px' }} onClick={cancelEditCategory}>{t('common.cancel')}</button>
                        </>
                      ) : (
                        <button type="button" style={{ padding: '4px 8px' }} onClick={() => startEditCategory(c)}>{t('common.edit')}</button>
                      )}
                      <button type="button" className="danger" style={{ padding: '4px 8px' }} onClick={async () => { const okCat = confirm(t('settings.deleteCategoryConfirm')); window.api?.app?.refocusWindow?.(); if (okCat) await window.api?.unitCategories?.delete?.(c.id); load(); }}>{t('common.delete')}</button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: '1rem' }}>{t('settings.unitsListTitle')}</h3>
            <form onSubmit={addUnit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t('settings.unitName')}</label>
                <input value={unitName} onChange={e => setUnitName(e.target.value)} placeholder="e.g. words" style={{ width: 160 }} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span>{t('settings.multiplierToBase')}</span>
                  <span
                    style={{ cursor: 'help', color: '#3b82f6', fontWeight: 600, fontSize: '0.95em' }}
                    aria-label={t('settings.multiplierToBaseHint')}
                    title={t('settings.multiplierToBaseHint')}
                  >
                    ⓘ
                  </span>
                </label>
                <input type="number" step="any" value={unitMultiplier} onChange={e => setUnitMultiplier(Number(e.target.value))} style={{ width: 80 }} />
              </div>
              <button type="submit" className="primary">{t('common.add')}</button>
            </form>
            {units.length === 0 ? <p>{t('settings.noUnits')}</p> : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                <li style={{ marginBottom: 6, color: '#71717a', fontSize: '0.875rem' }}>
                  {t('settings.unitAssignCategoryHint')}
                </li>
                {units.map(u => (
                  <li key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    {editingUnitId === u.id ? (
                      <input value={editingUnitName} onChange={e => setEditingUnitName(e.target.value)} placeholder={t('settings.unitName')} style={{ width: 140, minWidth: 100 }} />
                    ) : (
                      <span style={{ minWidth: 100 }}>{u.name}</span>
                    )}
                    <select
                      multiple
                      value={(u.unit_category_ids ?? []).map(String)}
                      onChange={async e => {
                        const selectedIds = Array.from(e.target.selectedOptions, o => parseInt(o.value, 10))
                          .filter(v => !Number.isNaN(v))
                        if (!window.api?.units?.update) return
                        await window.api.units.update(u.id, { unit_category_ids: selectedIds })
                        load()
                      }}
                      style={{ minWidth: 220, width: 260, minHeight: 96, fontSize: '0.875rem' }}
                    >
                      {unitCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {editingUnitId === u.id ? (
                      <>
                        <input type="number" step="any" value={editingMultiplier} onChange={e => setEditingMultiplier(e.target.value)} style={{ width: 72 }} />
                        <button type="button" onClick={saveUnitEdit}>{t('common.save')}</button>
                        <button type="button" onClick={cancelEditUnit}>{t('common.cancel')}</button>
                      </>
                    ) : (
                      <>
                        <span> (×{u.multiplier_to_base})</span>
                        <button type="button" style={{ padding: '2px 6px' }} onClick={() => startEditUnit(u)}>{t('settings.editUnit')}</button>
                      </>
                    )}
                    <button type="button" className="danger" style={{ padding: '4px 8px' }} onClick={() => deleteUnit(u.id)}>{t('common.delete')}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection id="defaultRates" title={t('settings.defaultRates')} open={sectionOpen.defaultRates ?? false} onToggle={toggleSection} last>
        <p style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>{t('settings.defaultRatesHint')}</p>
        <form onSubmit={async (e) => {
          e.preventDefault()
          if (!window.api?.defaultUnitRates?.set || !newDefaultRateUnit.trim()) return
          const unitId = parseInt(newDefaultRateUnit, 10)
          const rate = parseFloat(newDefaultRateValue)
          if (Number.isNaN(unitId) || Number.isNaN(rate) || rate < 0) return
          const argumentsList = newDefaultRateArguments
            .map(a => ({ key: (a.key ?? '').trim(), value: (a.value ?? '').trim() }))
            .filter(a => a.key && a.value)
            .slice(0, 3)
          await window.api.defaultUnitRates.set(unitId, rate, newDefaultRateCurrency.trim() || 'PLN', argumentsList.length ? argumentsList : null)
          setNewDefaultRateValue('')
          setNewDefaultRateArguments([{ key: '', value: '' }, { key: '', value: '' }, { key: '', value: '' }])
          load()
        }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
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
              <React.Fragment key={`new-arg-${idx}`}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>{t('settings.defaultRatesArgument')} {idx + 1}</label>
                  <select
                    value={arg.key}
                    onChange={e => setNewDefaultRateArguments(prev => prev.map((x, i) => i === idx ? { key: e.target.value, value: '' } : x))}
                  >
                    {allowedOptions.map(o => <option key={o.key || `_any_${idx}`} value={o.key}>{o.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>{t('settings.defaultRatesArgumentValue')} {idx + 1}</label>
                  {valueOptions.length ? (
                    <select
                      value={arg.value}
                      onChange={e => setNewDefaultRateArguments(prev => prev.map((x, i) => i === idx ? { ...x, value: e.target.value } : x))}
                      style={{ minWidth: 180 }}
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
              </React.Fragment>
            )
          })}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>{t('settings.defaultRatesRate')}</label>
            <input type="number" step="0.01" min={0} value={newDefaultRateValue} onChange={e => setNewDefaultRateValue(e.target.value)} placeholder="0" style={{ width: 100 }} required />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>{t('settings.defaultRatesCurrency')}</label>
            <input type="text" value={newDefaultRateCurrency} onChange={e => setNewDefaultRateCurrency(e.target.value)} placeholder="PLN" style={{ width: 72 }} />
          </div>
          <button type="submit" className="primary">{t('common.add')}</button>
        </form>
        {defaultRates.length === 0 ? <p style={{ color: '#71717a' }}>—</p> : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {defaultRates.map((r) => {
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
                <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ minWidth: 100 }}>{r.unit_name}</span>
                  {rowArguments.length > 0 ? (
                    rowArguments.map((a, idx) => (
                      <span key={`arg-${r.id}-${idx}`} style={{ color: '#a1a1aa' }}>
                        {getRateArgumentLabel(a.key)}: {getRateArgumentValueLabel(a.key, a.value, r.language_pair_label)}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: '#a1a1aa' }}>{t('settings.defaultRatesAnyArgument')}</span>
                  )}
                  {isEditing ? (
                    <>
                      {editingDefaultRate.arguments.map((arg, idx) => {
                        const allowedOptions = getAllowedRateArgumentOptions(idx, editingDefaultRate.arguments)
                        const valueOptions = getArgumentValueOptions(arg.key)
                        return (
                          <React.Fragment key={`edit-arg-${r.id}-${idx}`}>
                            <select
                              value={arg.key}
                              onChange={e => setEditingDefaultRate(prev => prev ? { ...prev, arguments: prev.arguments.map((x, i) => i === idx ? { key: e.target.value, value: '' } : x) } : null)}
                              style={{ minWidth: 160 }}
                            >
                              {allowedOptions.map(o => <option key={o.key || `_any_edit_${idx}`} value={o.key}>{o.label}</option>)}
                            </select>
                            {valueOptions.length ? (
                              <select
                                value={arg.value}
                                onChange={e => setEditingDefaultRate(prev => prev ? { ...prev, arguments: prev.arguments.map((x, i) => i === idx ? { ...x, value: e.target.value } : x) } : null)}
                                style={{ minWidth: 180 }}
                              >
                                <option value="">—</option>
                                {valueOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={arg.value}
                                onChange={e => setEditingDefaultRate(prev => prev ? { ...prev, arguments: prev.arguments.map((x, i) => i === idx ? { ...x, value: e.target.value } : x) } : null)}
                                placeholder="—"
                                style={{ minWidth: 180 }}
                                disabled={!arg.key}
                              />
                            )}
                          </React.Fragment>
                        )
                      })}
                      <input type="number" step="0.01" min={0} value={editingDefaultRate.rate} onChange={e => setEditingDefaultRate(prev => prev ? { ...prev, rate: e.target.value } : null)} placeholder="0" style={{ width: 100 }} />
                      <input type="text" value={editingDefaultRate.currency} onChange={e => setEditingDefaultRate(prev => prev ? { ...prev, currency: e.target.value } : null)} placeholder="PLN" style={{ width: 72 }} />
                      <button type="button" className="primary" style={{ padding: '4px 8px' }} onClick={async () => {
                        if (!window.api?.defaultUnitRates?.update || !editingDefaultRate) return
                        const rate = parseFloat(editingDefaultRate.rate)
                        if (Number.isNaN(rate) || rate < 0) return
                        await window.api.defaultUnitRates.update(
                          editingDefaultRate.id,
                          rate,
                          editingDefaultRate.currency.trim() || 'PLN',
                          editingDefaultRate.arguments
                            .map(a => ({ key: (a.key ?? '').trim(), value: (a.value ?? '').trim() }))
                            .filter(a => a.key && a.value)
                            .slice(0, 3)
                        )
                        setEditingDefaultRate(null)
                        load()
                      }}>{t('common.save')}</button>
                      <button type="button" style={{ padding: '4px 8px' }} onClick={() => setEditingDefaultRate(null)}>{t('common.cancel')}</button>
                    </>
                  ) : (
                    <>
                      <span><strong>{formatNumber(r.rate, { minimumFractionDigits: 2 })} {r.currency}</strong></span>
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
                        currency: r.currency
                      })}>{t('common.edit')}</button>
                      <button type="button" className="danger" style={{ padding: '4px 8px' }} onClick={async () => { await window.api?.defaultUnitRates?.delete?.(r.id); load(); }}>{t('common.delete')}</button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CollapsibleSection>

      {showUpdaterDebug && (
        <section style={{ marginTop: '2rem', padding: '1rem', border: '1px solid var(--color-border, #3f3f46)', borderRadius: 8, background: 'var(--color-bg-secondary)', fontSize: '0.875rem' }}>
          <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: '1rem' }}>Debug: Auto-update (GitHub)</h2>
          <p style={{ margin: '0 0 0.75rem', color: 'var(--color-text-secondary)' }}>Widoczne tylko w wersji deweloperskiej (nie pakowanej).</p>
          <button
            type="button"
            disabled={updaterDebugLoading}
            onClick={async () => {
              setUpdaterDebugLoading(true)
              setUpdaterDebugInfo(null)
              try {
                const info = await window.api?.app?.getUpdaterDebugInfo?.()
                setUpdaterDebugInfo(info ?? null)
              } catch {
                setUpdaterDebugInfo({ ok: false, error: 'Błąd wywołania' })
              } finally {
                setUpdaterDebugLoading(false)
              }
            }}
            style={{ padding: '6px 12px', marginBottom: 8 }}
          >
            {updaterDebugLoading ? t('common.loading') : 'Sprawdź połączenie z GitHub'}
          </button>
          {updaterDebugInfo && (
            <div style={{ marginTop: 8, padding: 8, background: 'var(--color-bg)', borderRadius: 4 }}>
              <div style={{ marginBottom: 4 }}>
                <strong>Połączenie:</strong>{' '}
                <span style={{ color: updaterDebugInfo.ok ? 'var(--color-success, #22c55e)' : 'var(--color-danger, #dc2626)' }}>
                  {updaterDebugInfo.ok ? 'OK' : (updaterDebugInfo.error ?? `HTTP ${updaterDebugInfo.status ?? '?'}`)}
                </span>
              </div>
              {updaterDebugInfo.ok && (
                <>
                  <div style={{ marginBottom: 4 }}>
                    <strong>Liczba release’ów:</strong> {updaterDebugInfo.releasesCount ?? 0}
                  </div>
                  {updaterDebugInfo.latestVersion != null && (
                    <div style={{ marginBottom: 4 }}>
                      <strong>Najnowsza wersja (tag):</strong> {updaterDebugInfo.latestVersion}
                    </div>
                  )}
                  {Array.isArray(updaterDebugInfo.tagNames) && updaterDebugInfo.tagNames.length > 0 && (
                    <div>
                      <strong>Tagi:</strong>{' '}
                      <span style={{ wordBreak: 'break-all' }}>{updaterDebugInfo.tagNames.join(', ')}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      )}

      {showTaxpayerNipModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setShowTaxpayerNipModal(false)}>
          <div className="card" style={{ minWidth: 320 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{t('clients.fetchByNip')}</h3>
            <p style={{ fontSize: '0.875rem', color: '#71717a', marginBottom: 12 }}>{t('clients.fetchByNipHint')}</p>
            <div className="form-group">
              <label>{t('settings.nip')}</label>
              <input value={taxpayerModalNip} onChange={e => setTaxpayerModalNip(e.target.value)} placeholder="10 cyfr" style={{ width: '100%' }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitTaxpayerNipModal() } }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" onClick={() => { setShowTaxpayerNipModal(false); setTaxpayerModalNip('') }}>{t('common.cancel')}</button>
              <button type="button" className="primary" onClick={submitTaxpayerNipModal} disabled={taxpayerLookupLoading}>{taxpayerLookupLoading ? t('clients.fetchByNipLoading') : t('common.ok')}</button>
            </div>
          </div>
        </div>
      )}

      {showClearPredefinedModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => !clearPredefinedLoading && setShowClearPredefinedModal(false)}>
          <div className="card" style={{ minWidth: 360 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{predefinedModalMode === 'restore' ? t('settings.restorePredefinedConfirmTitle') : t('settings.clearPredefinedConfirmTitle')}</h3>
            <p style={{ fontSize: '0.875rem', color: '#71717a', marginBottom: 12 }}>{predefinedModalMode === 'restore' ? t('settings.restorePredefinedConfirmMessage') : t('settings.clearPredefinedConfirmMessage')}</p>
            <div className="form-group">
              <label>{t('settings.clearPredefinedPasswordPlaceholder')}</label>
              <input
                type="password"
                value={clearPredefinedPassword}
                onChange={e => setClearPredefinedPassword(e.target.value)}
                placeholder={t('settings.clearPredefinedPasswordPlaceholder')}
                style={{ width: '100%' }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.querySelector('[data-clear-predefined-submit]') as HTMLButtonElement)?.click() } }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" onClick={() => setShowClearPredefinedModal(false)} disabled={clearPredefinedLoading}>{t('common.cancel')}</button>
              <button
                type="button"
                data-clear-predefined-submit
                className={predefinedModalMode === 'clear' ? 'danger' : undefined}
                disabled={clearPredefinedLoading || !clearPredefinedPassword.trim()}
                onClick={async () => {
                  const pwd = clearPredefinedPassword.trim()
                  if (!pwd) return
                  const locale = (i18n.language || 'pl').toLowerCase().slice(0, 2)
                  setClearPredefinedLoading(true)
                  try {
                    if (predefinedModalMode === 'restore') {
                      const result = window.api?.settings?.verifyPassword ? await window.api.settings.verifyPassword(pwd) : { ok: false }
                      if (!result?.ok) {
                        alert(t('settings.clearPredefinedErrorInvalidPassword'))
                        return
                      }
                      const res = await window.api!.settings!.restorePredefinedPreset!(locale)
                      if (res?.ok) {
                        setShowClearPredefinedModal(false)
                        setClearPredefinedPassword('')
                        alert(t('settings.predefinedRestored'))
                        load()
                      } else if (res?.error === 'ORDERS_EXIST') {
                        alert(t('settings.clearPredefinedErrorOrdersExist'))
                      } else {
                        alert(t('settings.predefinedRestoreError', { error: res?.error ?? 'PRESET_NOT_FOUND' }))
                      }
                    } else {
                      if (!window.api?.settings?.clearPredefinedPreset) return
                      const res = await window.api.settings.clearPredefinedPreset(pwd)
                      if (res?.ok) {
                        setShowClearPredefinedModal(false)
                        setClearPredefinedPassword('')
                        alert(t('settings.predefinedCleared'))
                        load()
                      } else if (res?.error === 'INVALID_PASSWORD') {
                        alert(t('settings.clearPredefinedErrorInvalidPassword'))
                      } else if (res?.error === 'ORDERS_EXIST') {
                        alert(t('settings.clearPredefinedErrorOrdersExist'))
                      } else {
                        alert(t('settings.clearPredefinedErrorOther', { error: res?.error ?? '' }))
                      }
                    }
                  } catch (e) {
                    alert(predefinedModalMode === 'restore' ? t('settings.predefinedRestoreError', { error: e instanceof Error ? e.message : String(e) }) : t('settings.clearPredefinedErrorOther', { error: e instanceof Error ? e.message : String(e) }))
                  } finally {
                    setClearPredefinedLoading(false)
                  }
                }}
              >
                {clearPredefinedLoading ? t('common.saving') ?? '…' : predefinedModalMode === 'restore' ? t('settings.restorePredefined') : t('settings.clearPredefined')}
              </button>
            </div>
          </div>
        </div>
      )}

      {import.meta.env.DEV && window.api?.settings?.exportUnitsServicesPreset && (
        <section style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #27272a', color: '#71717a', fontSize: '0.875rem' }}>
          <button
            type="button"
            onClick={async () => {
              try {
                const locale = (i18n.language || 'pl').toLowerCase().slice(0, 2)
                const res = await window.api!.settings!.exportUnitsServicesPreset!(locale)
                if (res?.ok && res?.path) {
                  alert(t('settings.saveUnitsServicesPresetSuccess', { path: res.path }))
                } else if (res?.canceled) {
                  alert(t('settings.saveUnitsServicesPresetCanceled'))
                } else if (res?.error) {
                  alert(t('settings.saveUnitsServicesPresetError', { error: res.error }))
                } else {
                  alert(t('settings.saveUnitsServicesPresetError', { error: 'Brak odpowiedzi' }))
                }
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                alert(t('settings.saveUnitsServicesPresetError', { error: msg }))
              }
            }}
          >
            {t('settings.saveUnitsServicesPresetForLocale', { locale: (i18n.language || 'pl').toUpperCase().slice(0, 2) })}
          </button>
        </section>
      )}
    </div>
  )
}
