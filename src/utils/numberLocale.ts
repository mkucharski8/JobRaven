import i18n from '../i18n'

export function getNumberLocale(): string {
  return (i18n.language || 'pl').toLowerCase().startsWith('en') ? 'en-US' : 'pl-PL'
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return Number(value).toLocaleString(getNumberLocale(), options)
}

