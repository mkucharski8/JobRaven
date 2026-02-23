import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import pl from './pl.json'

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, pl: { translation: pl } },
  lng: 'pl',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

// Apply saved UI language when running in Electron (after settings are available). Zapis domyślnego (PL) gdy brak wyboru.
if (typeof window !== 'undefined' && (window as unknown as { api?: { settings?: { get: (k: string) => Promise<string | null>; set?: (k: string, v: string) => Promise<void> }; app?: { ensurePredefinedSettings?: (locale: string) => void } } }).api?.settings?.get) {
  const win = window as unknown as { api: { settings: { get: (k: string) => Promise<string | null>; set?: (k: string, v: string) => Promise<void> }; app?: { ensurePredefinedSettings?: (locale: string) => void } } }
  win.api.settings.get('ui_language').then((lang) => {
    const effective = (lang || i18n.language || 'pl').toLowerCase().slice(0, 2)
    if (lang && lang !== i18n.language) i18n.changeLanguage(lang)
    if (!lang && win.api.settings.set) win.api.settings.set('ui_language', effective)
    win.api.app?.ensurePredefinedSettings?.(effective)
  }).catch(() => {})
}

export default i18n
