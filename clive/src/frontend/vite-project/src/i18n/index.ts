import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en.json'
import it from './locales/it.json'

// English is the default & fallback; Italian is available. The chosen language
// is persisted (localStorage `fm.config` → `language`, read by appConfig), which
// the language detector also honours via the `fm.lang` mirror below.
export const SUPPORTED = ['en', 'it'] as const

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, it: { translation: it } },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED,
    interpolation: { escapeValue: false },
    detection: {
      // Only honour an explicit stored choice; a fresh install defaults to
      // English (fallbackLng), independent of the OS language.
      order: ['localStorage'],
      lookupLocalStorage: 'fm.lang',
      caches: ['localStorage'],
    },
  })

export default i18n
