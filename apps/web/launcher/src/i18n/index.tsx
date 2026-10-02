import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { zh } from './locales/zh'
import { en } from './locales/en'

export type Locale = 'zh' | 'en'
export type TranslationKey = keyof typeof zh

const dictionaries: Record<Locale, Record<TranslationKey, string>> = { zh, en }
const STORAGE_KEY = 'dsh-launcher-locale'

export interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  /** Translate a key, substituting `{name}` placeholders from `params`. */
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function readInitialLocale(): Locale {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'zh'
  } catch {
    return 'zh'
  }
}

/** Whether the user has an explicitly chosen locale stored locally, so a
 * backend-persisted preference does not override a local choice. */
export function hasStoredLocale(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}

/** Provide the active locale and translation function. Defaults to Chinese. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale)

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // localStorage unavailable (e.g. private mode); keep in-memory locale only.
    }
  }, [])

  const t = useCallback<I18nContextValue['t']>(
    (key, params) => {
      let text = dictionaries[locale][key] ?? key
      if (params) {
        for (const [name, value] of Object.entries(params)) {
          text = text.replace(`{${name}}`, String(value))
        }
      }
      return text
    },
    [locale],
  )

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/** Access the active locale and translation function. */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
