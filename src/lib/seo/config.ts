import { locales, defaultLocale, type Locale } from '@/i18n/routing'

/** Абсолютный корень сайта, без завершающего слэша. Прод — реальный домен из env. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000').replace(
  /\/$/,
  '',
)

/** Media-URL от Payload может быть относительным (локальный диск в dev) — абсолютный нужен там, где URL уходит за пределы Next (og-image fetch, JSON-LD). */
export const absoluteMediaUrl = (url: string): string =>
  url.startsWith('http') ? url : `${SITE_URL}${url}`

export const SITE_NAME = 'MON FLACON'

/** Фирменная EN-фраза — не переводится ни в одной локали (BRAND.md §7). */
export const SITE_TAGLINE = 'Perfumes for everyone'

/**
 * Версия ВИЗУАЛА фирменного og-image fallback (`og-image/route.tsx`, ветка
 * без логотипа/без параметров). URL fallback-превью одинаков у всех страниц
 * без своей картинки (`/${locale}/og-image?title=...`) — без версии в адресе
 * смена дизайна fallback (как при переходе со старого рисунка флакона на
 * финальный знак бренда, 2026-10-08) не долетает до того, что уже закэшировано
 * ПО ЭТОМУ ЖЕ URL на стороне соцсети (Facebook/Viber кэшируют превью по
 * ссылке, не всегда уважая `Cache-Control` источника). Бампать эту строку
 * при каждой визуальной правке самого fallback — тогда адрес меняется, и
 * старый закэшированный превью больше не совпадает с новым.
 */
export const OG_FALLBACK_VERSION = '2026-10-08'

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
