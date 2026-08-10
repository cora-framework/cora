import { err, ok, type Result } from "../result"

export type LocaleDict = Record<string, string>

export interface Locale {
  t(key: string, params?: Record<string, string | number>): string
  setLocale(code: string): Result<void, string>
  getLocale(): string
  has(key: string): boolean
}

export function createLocale(options: {
  locales: Record<string, LocaleDict>
  fallback: string
}): Locale {
  const { locales, fallback } = options

  if (!locales[fallback]) {
    throw new TypeError(
      `Fallback locale "${fallback}" not found in provided locales`,
    )
  }

  let currentLocale = fallback

  return {
    t(key: string, params?: Record<string, string | number>): string {
      const dict = locales[currentLocale] || locales[fallback] || {}
      const fallbackDict = locales[fallback] || {}

      const text = dict[key] ?? fallbackDict[key] ?? key

      if (!params || Object.keys(params).length === 0) {
        return text
      }

      return text.replace(/{(\w+)}/g, (match, placeholder) => {
        const value = params[placeholder]
        if (value === undefined) {
          return match
        }
        return String(value)
      })
    },

    setLocale(code: string): Result<void, string> {
      if (!locales[code]) {
        const availableCodes = Object.keys(locales)
        return err(
          `Unknown locale code "${code}". Available codes: ${availableCodes.join(", ")}`,
        )
      }
      currentLocale = code
      return ok(undefined)
    },

    getLocale(): string {
      return currentLocale
    },

    has(key: string): boolean {
      const dict = locales[currentLocale] || {}
      const fallbackDict = locales[fallback] || {}
      return key in dict || key in fallbackDict
    },
  }
}
