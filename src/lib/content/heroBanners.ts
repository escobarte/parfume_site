import { unstable_cache } from 'next/cache'
import { routing, type Locale } from '@/i18n/routing'
import { CACHE_TTL } from '@/lib/cache'
import { resolveInternalLink } from '@/lib/links'
import { getPayloadClient } from '@/lib/payload'
import { HOMEPAGE_TAG } from '@/lib/revalidate'

export type BannerImage = { url: string; width: number; height: number }

/**
 * Баннер, готовый к рендеру: картинки уже выбраны с учётом фолбэка локалей.
 * `imageTablet`/`imageMobile` — `null`, если не загружены ни на одном языке:
 * фолбэк на десктопную по брейкпоинту решает рендер (`HeroBannerSlide`),
 * здесь он не подставляется, чтобы не отдавать одну картинку трижды.
 */
export type HeroBanner = {
  id: string
  href: string | null
  alt: string
  image: BannerImage
  imageTablet: BannerImage | null
  imageMobile: BannerImage | null
}

/**
 * Пропорции на случай файла без размеров (SVG): next/image требует width и
 * height. Взяты рекомендуемые размеры каждого слота из описаний полей.
 */
const FALLBACK_SIZE = {
  image: { width: 1920, height: 800 },
  imageTablet: { width: 1024, height: 768 },
  imageMobile: { width: 750, height: 1000 },
} as const

type Slot = keyof typeof FALLBACK_SIZE

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
  imageTablet?: unknown
  imageMobile?: unknown
  alt?: unknown
  linkMode?: 'system' | 'page' | null
  link?: string | null
  linkPage?: unknown
  linkOverride?: string | null
}

/**
 * Картинка слота: фолбэк по локалям — ровно тот же, что у десктопной, для
 * каждого из трёх полей отдельно. Неразвёрнутый id (depth 0) или файл без
 * url — `null`.
 */
function pickImage(row: RawBanner, slot: Slot, order: string[]): (BannerImage & { media: MediaLike }) | null {
  const media = pickLocalized<MediaLike | number>(row[slot], order)
  if (!media || typeof media !== 'object' || !media.url) return null
  return {
    url: media.url,
    width: media.width || FALLBACK_SIZE[slot].width,
    height: media.height || FALLBACK_SIZE[slot].height,
    media,
  }
}

const withoutMedia = (image: (BannerImage & { media: MediaLike }) | null): BannerImage | null =>
  image ? { url: image.url, width: image.width, height: image.height } : null

/**
 * Строки `heroBanners` (прочитанные с `locale: 'all'`, depth ≥ 1) → баннеры
 * для локали.
 *
 * **Фолбэк картинки — на ЛЮБУЮ заполненную локаль**, а не только на
 * дефолтную: встроенный `fallback: true` Payload умеет лишь «пусто → ro», и
 * картинка, загруженная только на ru, на ro/en не показалась бы. Отсюда
 * чтение всех локалей разом, а не обычный `findGlobal({ locale })`.
 *
 * Порядок двух фолбэков — сначала по локалям внутри слота, потом по
 * брейкпоинту: мобильная картинка, загруженная хоть на одном языке, важнее
 * десктопной своего языка. Так узкий экран не получает широкий баннер, пока
 * мобильный вариант вообще существует.
 *
 * Выпадают: выключенные, без десктопной картинки ни в одной локали, с
 * неразвёрнутой картинкой (голый id — рендерить нечего).
 */
export function resolveHeroBanners(rows: RawBanner[], locale: string): HeroBanner[] {
  const order = localeOrder(locale)
  const banners: HeroBanner[] = []

  for (const [index, row] of rows.entries()) {
    if (row.enabled === false) continue
    const image = pickImage(row, 'image', order)
    if (!image) continue

    const page = pickLocalized<{ slug: string } | number>(row.linkPage, order)
    const href = resolveInternalLink({
      mode: row.linkMode,
      target: row.link,
      page: page && typeof page === 'object' ? page : null,
      override: row.linkOverride,
    })

    const alt =
      pickLocalized<string>(row.alt, order) ?? pickLocalized<string>(image.media.alt, order) ?? ''

    banners.push({
      id: row.id ?? `banner-${index}`,
      href,
      alt,
      image: withoutMedia(image) as BannerImage,
      imageTablet: withoutMedia(pickImage(row, 'imageTablet', order)),
      imageMobile: withoutMedia(pickImage(row, 'imageMobile', order)),
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
