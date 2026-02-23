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

// Apply saved UI language when running in Electron (after settings are available). Preset wgrywamy gdy znamy język.
if (typeof window !== 'undefined' && (window as unknown as { api?: { settings?: { get: (k: string) => Promise<string | null> }; app?: { ensurePredefinedSettings?: (locale: string) => void } } }).api?.settings?.get) {
  const win = window as unknown as { api: { settings: { get: (k: string) => Promise<string | null> }; app?: { ensurePredefinedSettings?: (locale: string) => void } } }
  win.api.settings.get('ui_language').then((lang) => {
    if (lang && lang !== i18n.language) i18n.changeLanguage(lang)
    // Preset tylko gdy mamy zapisany język (po logowaniu/już po wyborze). Przy pierwszym uruchomieniu wybór na ekranie logowania wywoła ensurePredefinedSettings.
    if (lang) win.api.app?.ensurePredefinedSettings?.(lang.toLowerCase().slice(0, 2))
  }).catch(() => {})
}

export default i18n
