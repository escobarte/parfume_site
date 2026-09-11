import { unstable_cache } from 'next/cache'
import { CACHE_TTL } from '@/lib/cache'
import type { Locale } from '@/i18n/routing'
import type { Brand, Media } from '@/payload-types'
import { getPayloadClient } from '@/lib/payload'
import { slugify } from '@/lib/slugify'
import { TAXONOMY_TAG } from '@/lib/revalidate'

export type BrandView = {
  id: number | string
  slug: string
  title: string
  description: string | null
  country: string | null
  logo: { url: string; alt: string } | null
  seo: { title?: string | null; description?: string | null; image?: { url: string } | null } | null
}

function toView(doc: Brand): BrandView {
  const logo = typeof doc.logo === 'object' && doc.logo ? (doc.logo as Media) : null
  const seoImage =
    doc.seo?.image && typeof doc.seo.image === 'object' ? (doc.seo.image as Media) : null
  return {
    id: doc.id,
    slug: doc.slug,
    // Подстраховка на случай пустого названия. С 2026-09-11 `title` больше не
    // localized (миграция ..._brands_title_description_not_localized), так что
    // прежняя причина — «бренд заведён в админке на одном языке, на остальных
    // приходит undefined» — устранена в корне. Оставлено дёшево и намеренно:
    // страница каталога брендов не должна падать из-за одной кривой записи.
    title: doc.title || doc.slug,
    description: doc.description ?? null,
    country: doc.country ?? null,
    logo: logo?.url ? { url: logo.url, alt: logo.alt ?? doc.title } : null,
    seo: doc.seo
      ? {
          title: doc.seo.title,
          description: doc.seo.description,
          image: seoImage?.url ? { url: seoImage.url } : null,
        }
      : null,
  }
}

/** Алфавитный указатель брендов (/brands, фаза 5.2). */
export const getAllBrands = (locale: Locale) =>
  unstable_cache(
    async (): Promise<BrandView[]> => {
      const payload = await getPayloadClient()
      const { docs } = await payload.find({
        collection: 'brands',
        locale,
        depth: 1,
        limit: 500,
        sort: 'title',
      })
      return docs.map(toView)
    },
    ['brands-full', locale],
    { tags: [TAXONOMY_TAG], revalidate: CACHE_TTL },
  )()

export const getBrandBySlug = (slug: string, locale: Locale) =>
  unstable_cache(
    async (): Promise<BrandView | null> => {
      const payload = await getPayloadClient()
      const { docs } = await payload.find({
        collection: 'brands',
        locale,
        depth: 1,
        limit: 1,
        where: { slug: { equals: slug } },
      })
      return docs[0] ? toView(docs[0]) : null
    },
    ['brand', slug, locale],
    { tags: [TAXONOMY_TAG], revalidate: CACHE_TTL },
  )()

/** Буквы указателя на /brands — латиница, один набор на все локали. */
export const BRAND_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/** Группа «прочее»: цифры, символы — всё, что не легло на A–Z. */
export const BRAND_OTHER_LETTER = '#'

export type BrandLetterGroup = { letter: string; brands: BrandView[] }

/**
 * Буква указателя для названия бренда. Берётся из `slugify`, а не из первого
 * символа напрямую: он уже снимает румынские диакритики и транслитерирует
 * кириллицу («Îles» → I, «Ателье» → A), так что RU-локаль с кириллическими
 * названиями попадает в тот же латинский указатель A–Z, а не в «#».
 */
export function brandLetter(title: string | null | undefined): string {
  // Пустое название сюда попадать не должно (`toView` подставляет slug), но
  // группировка не то место, где стоит падать: буква «прочее» — безопасный
  // исход, а `slugify(undefined)` роняет всю страницу (так и случилось
  // 2026-09-11 на бренде, заведённом в одной локали).
  const first = slugify(title ?? '')
    .charAt(0)
    .toUpperCase()
  return BRAND_ALPHABET.includes(first) ? first : BRAND_OTHER_LETTER
}

/** Якорь секции буквы — он же цель ссылки указателя. */
export const brandLetterAnchor = (letter: string) =>
  `brands-${letter === BRAND_OTHER_LETTER ? 'other' : letter.toLowerCase()}`

/**
 * Бренды, сгруппированные по первой букве, в порядке указателя. Пустые буквы
 * в результат не попадают — секции для них не рендерятся, а сам указатель
 * показывает их неактивными (он строится по BRAND_ALPHABET, не по группам).
 */
export function groupBrandsByLetter(brands: BrandView[]): BrandLetterGroup[] {
  const groups = new Map<string, BrandView[]>()

  for (const brand of brands) {
    const letter = brandLetter(brand.title)
    const bucket = groups.get(letter)
    if (bucket) bucket.push(brand)
    else groups.set(letter, [brand])
  }

  // «#» всегда последней, остальные — в алфавитном порядке.
  const order = [...BRAND_ALPHABET, BRAND_OTHER_LETTER]
  return order
    .filter((letter) => groups.has(letter))
    .map((letter) => ({ letter, brands: groups.get(letter)! }))
}
