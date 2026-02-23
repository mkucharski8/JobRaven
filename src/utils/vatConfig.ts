import { ALL_COUNTRY_CODES } from './countryCodes'

export type VatClientSegment =
  | 'company_domestic'
  | 'company_eu'
  | 'company_world'
  | 'person_domestic'
  | 'person_eu'
  | 'person_world'

export type VatRuleValueType = 'rate' | 'code'

export type VatRuleRow = {
  id?: number
  service_id: number
  client_segment: VatClientSegment
  country_code?: string | null
  value_type: VatRuleValueType
  rate_value?: number | null
  code_value?: string | null
}

export const VAT_SEGMENTS: VatClientSegment[] = [
  'company_domestic',
  'company_eu',
  'company_world',
  'person_domestic',
  'person_eu',
  'person_world'
]

export const EU_COUNTRY_CODES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE'
])

export function isEuCountry(countryCode?: string | null): boolean {
  return !!countryCode && EU_COUNTRY_CODES.has(String(countryCode).toUpperCase())
}

export function normalizeCountryCode(code?: string | null): string | null {
  const v = String(code ?? '').trim().toUpperCase()
  return v || null
}

export function getCountryOptions(uiLang: string): { code: string; label: string }[] {
  const locale = String(uiLang || 'en').toLowerCase().startsWith('pl') ? 'pl-PL' : 'en'
  let codes: string[]
  try {
    const sv = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
    const fromIntl = sv ? (sv.call(Intl, 'region') as string[]).filter((c: string) => /^[A-Z]{2}$/.test(c)) : []
    codes = fromIntl.length >= 200 ? fromIntl : ALL_COUNTRY_CODES
  } catch {
    codes = ALL_COUNTRY_CODES
  }
  const dn = typeof Intl !== 'undefined' ? new Intl.DisplayNames([locale], { type: 'region' }) : null
  return codes
    .map(code => ({ code, label: dn?.of(code) ?? code }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** Normalizacja do porównania nazw (małe litery, bez akcentów). */
function normalizeForCompare(s: string): string {
  return String(s)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/** Zwraca kod kraju (2 litery) po nazwie w dowolnym języku (en/pl), lub null. */
export function getCountryCodeFromName(name: string | null | undefined): string | null {
  if (name == null || String(name).trim() === '') return null
  const storedNorm = normalizeForCompare(String(name))
  for (const lang of ['en', 'pl'] as const) {
    const other = getCountryOptions(lang === 'en' ? 'en' : 'pl')
    const found = other.find(o => normalizeForCompare(o.label) === storedNorm)
    if (found) return found.code
  }
  return null
}

/** Etykieta kraju w języku UI – po code lub po zapisanej nazwie (np. "Poland" → "Polska" gdy UI=PL). */
export function getCountryDisplayLabel(
  stored: string | null | undefined,
  uiLang: string,
  knownCode?: string | null
): string {
  if (stored == null || String(stored).trim() === '') return '—'
  const opts = getCountryOptions(uiLang)
  const code = knownCode ?? (/^[A-Za-z]{2}$/.test(String(stored).trim()) ? String(stored).trim().toUpperCase() : null)
  if (code) {
    const label = opts.find(o => o.code === code)?.label
    if (label) return label
  }
  const storedNorm = normalizeForCompare(String(stored))
  for (const lang of ['en', 'pl'] as const) {
    const other = getCountryOptions(lang === 'en' ? 'en' : 'pl')
    const found = other.find(o => normalizeForCompare(o.label) === storedNorm)
    if (found) return opts.find(o => o.code === found.code)?.label ?? String(stored)
  }
  return String(stored)
}

/**
 * Wybór segmentu VAT (siatka „VAT według usługi”) według klienta i kraju podatnika.
 * 1. Firma vs osoba z typu klienta → tylko segmenty company_* lub person_*.
 * 2. Ten sam kraj (klient = podatnik) → _domestic (firma–kraj / osoba–kraj).
 * 3. Inny kraj + zaznaczone „klient w UE” (vat_eu) → _eu.
 * 4. Inny kraj + brak „klient w UE” → _world.
 */
export function getVatSegment(client: { client_kind?: string | null; country_code?: string | null; vat_eu?: number | null }, taxpayerCountryCode?: string | null): VatClientSegment {
  const kind = String(client.client_kind ?? 'company').toLowerCase()
  const isCompany = kind !== 'person'
  const cc = normalizeCountryCode(client.country_code)
  const taxpayer = normalizeCountryCode(taxpayerCountryCode)
  const domestic = !!cc && !!taxpayer && cc === taxpayer
  // UE po kraju klienta + zgodność wsteczna z ręcznym znacznikiem vat_eu.
  const clientInEu = isEuCountry(cc) || (client.vat_eu ?? 0) === 1

  if (domestic) {
    return isCompany ? 'company_domestic' : 'person_domestic'
  }
  if (clientInEu) {
    return isCompany ? 'company_eu' : 'person_eu'
  }
  return isCompany ? 'company_world' : 'person_world'
}

export function resolveVatRule(
  rules: VatRuleRow[],
  segment: VatClientSegment,
  countryCode?: string | null
): { value_type: VatRuleValueType; rate_value?: number | null; code_value?: string | null } | null {
  const cc = normalizeCountryCode(countryCode)
  if (cc) {
    const exact = rules.find(r => r.client_segment === segment && normalizeCountryCode(r.country_code) === cc)
    if (exact) return exact
  }
  return rules.find(r => r.client_segment === segment && !normalizeCountryCode(r.country_code)) ?? null
}
