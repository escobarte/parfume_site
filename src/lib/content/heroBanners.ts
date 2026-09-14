import { unstable_cache } from 'next/cache'
import { routing, type Locale } from '@/i18n/routing'
import { CACHE_TTL } from '@/lib/cache'
import { resolveInternalLink } from '@/lib/links'
import { getPayloadClient } from '@/lib/payload'
import { HOMEPAGE_TAG } from '@/lib/revalidate'

/** Баннер, готовый к рендеру: картинка уже выбрана с учётом фолбэка локалей. */
export type HeroBanner = {
  id: string
  href: string | null
  alt: string
  image: { url: string; width: number; height: number }
}

/**
 * Пропорция на случай файла без размеров (SVG): next/image требует width и
 * height, а `h-auto` всё равно отдаёт реальную пропорцию картинки.
 */
const FALLBACK_SIZE = { width: 1920, height: 800 }

/** Порядок поиска значения: текущая локаль → дефолтная → остальные по конфигу. */
export const localeOrder = (locale: string): string[] => [
  ...new Set([locale, routing.defaultLocale, ...routing.locales]),
]

const isLocaleMap = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) &&
  typeof value === 'object' &&
  Object.keys(value as object).length > 0 &&
  Object.keys(value as object).every((key) => (routing.locales as readonly string[]).includes(key))

/**
 * Значение localized-поля из документа, прочитанного с `locale: 'all'`
 * (`{ ro, ru, en }`): первая непустая локаль в заданном порядке. Нелокальное
 * значение (строка, объект документа) возвращается как есть.
 */
export function pickLocalized<T>(value: unknown, order: string[]): T | null {
  if (!isLocaleMap(value)) return (value ?? null) as T | null
  for (const locale of order) {
    const candidate = value[locale]
    if (candidate !== null && candidate !== undefined && candidate !== '') return candidate as T
  }
  return null
}

type MediaLike = { url?: string | null; width?: number | null; height?: number | null; alt?: unknown }

type RawBanner = {
  id?: string | null
  enabled?: boolean | null
  image?: unknown
  alt?: unknown
  linkMode?: 'system' | 'page' | null
  link?: string | null
  linkPage?: unknown
  linkOverride?: string | null
}

/**
 * Строки `heroBanners` (прочитанные с `locale: 'all'`, depth ≥ 1) → баннеры
 * для локали.
 *
 * **Фолбэк картинки — на ЛЮБУЮ заполненную локаль**, а не только на
 * дефолтную: встроенный `fallback: true` Payload умеет лишь «пусто → ro», и
 * картинка, загруженная только на ru, на ro/en не показалась бы. Отсюда
 * чтение всех локалей разом, а не обычный `findGlobal({ locale })`.
 *
 * Выпадают: выключенные, без картинки ни в одной локали, с неразвёрнутой
 * картинкой (голый id — рендерить нечего).
 */
export function resolveHeroBanners(rows: RawBanner[], locale: string): HeroBanner[] {
  const order = localeOrder(locale)
  const banners: HeroBanner[] = []

  for (const [index, row] of rows.entries()) {
    if (row.enabled === false) continue
    const media = pickLocalized<MediaLike | number>(row.image, order)
    if (!media || typeof media !== 'object' || !media.url) continue

    const page = pickLocalized<{ slug: string } | number>(row.linkPage, order)
    const href = resolveInternalLink({
      mode: row.linkMode,
      target: row.link,
      page: page && typeof page === 'object' ? page : null,
      override: row.linkOverride,
    })

    const alt =
      pickLocalized<string>(row.alt, order) ?? pickLocalized<string>(media.alt, order) ?? ''

    banners.push({
      id: row.id ?? `banner-${index}`,
      href,
      alt,
      image: {
        url: media.url,
        width: media.width || FALLBACK_SIZE.width,
        height: media.height || FALLBACK_SIZE.height,
      },
    })
  }

  return banners
}

export const getHeroBanners = (locale: Locale) =>
  unstable_cache(
    async () => {
      const payload = await getPayloadClient()
      const homepage = await payload.findGlobal({
        slug: 'homepage',
        locale: 'all',
        depth: 1,
        select: { heroBanners: true },
      })
      return resolveHeroBanners((homepage.heroBanners ?? []) as RawBanner[], locale)
    },
    ['hero-banners', locale],
    { tags: [HOMEPAGE_TAG], revalidate: CACHE_TTL },
  )()
