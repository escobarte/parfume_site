import { locales, defaultLocale, type Locale } from '@/i18n/routing'

/** Абсолютный корень сайта, без завершающего слэша. Прод — реальный домен из env. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000').replace(
  /\/$/,
  '',
)

export const SITE_NAME = 'MON FLACON'

/** Фирменная EN-фраза — не переводится ни в одной локали (BRAND.md §7). */
export const SITE_TAGLINE = 'Perfumes for everyone'

/** `/ro/catalog`, `/ru/catalog`, `/en/catalog`, plus `x-default` → дефолтная локаль. */
export function localizedPaths(path: string): Record<string, string> {
  const languages: Record<string, string> = {}
  for (const locale of locales) {
    languages[locale] = `/${locale}${path}`
  }
  languages['x-default'] = `/${defaultLocale}${path}`
  return languages
}

export const localeList: readonly Locale[] = locales
