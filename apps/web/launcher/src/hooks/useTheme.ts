import { useLayoutEffect, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
const storageKey = 'dsh-launcher-theme'

function initialTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(storageKey)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

/** True when the user has explicitly chosen a theme (it is persisted). */
export function hasStoredTheme(): boolean {
  try {
    const value = localStorage.getItem(storageKey)
    return value === 'light' || value === 'dark'
  } catch {
    return false
  }
}

/** Persist the chosen theme and follow OS changes only in system mode. */
export function useTheme() {
  const [theme, setTheme] = useState<ThemePreference>(initialTheme)

  useLayoutEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = theme === 'system' ? media.matches ? 'dark' : 'light' : theme
      document.documentElement.dataset.theme = resolved
      document.documentElement.style.colorScheme = resolved
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const selectTheme = (value: ThemePreference) => {
    setTheme(value)
    try {
      localStorage.setItem(storageKey, value)
    } catch (error) {
      console.warn('Could not save the theme preference', error)
    }
  }

  return { theme, setTheme: selectTheme }
}
