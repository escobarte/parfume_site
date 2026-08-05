import { unstable_cache } from 'next/cache'
import type { Where } from 'payload'
import { CACHE_TTL } from '@/lib/cache'
import type { Locale } from '@/i18n/routing'
import type { Media, Note, Product } from '@/payload-types'
import { getPayloadClient } from '@/lib/payload'
import { CATALOG_TAG } from '@/lib/revalidate'
import { toCardList } from './cards'
import type { ProductCardData } from './types'

export type VariantView = {
  sku: string
  volume: number
  price: number
  oldPrice: number | null
  stock: number
}

export type ProductView = {
  id: number | string
  slug: string
  title: string
  brand: { title: string; slug: string } | null
  family: string | null
  gender: string | null
  description: unknown
  images: { url: string; alt: string; full: string }[]
  variants: VariantView[]
  notes: { slug: string; title: string }[]
  pyramid: { top: string[]; heart: string[]; base: string[] }
  categoryIds: (number | string)[]
  noteIds: (number | string)[]
}

const objects = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value.filter((item) => typeof item === 'object' && item) as T[]) : []

const noteTitles = (value: unknown) => objects<Note>(value).map((note) => note.title)

function toView(doc: Product): ProductView {
  const brand = typeof doc.brand === 'object' && doc.brand ? doc.brand : null
  const notes = objects<Note>(doc.notes)

  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    brand: brand ? { title: brand.title, slug: brand.slug } : null,
    family: doc.family ?? null,
    gender: doc.gender ?? null,
    description: doc.description ?? null,
    images: objects<Media>(doc.images).map((image) => ({
      url: image.sizes?.card?.url ?? image.url ?? '',
      full: image.sizes?.full?.url ?? image.url ?? '',
      alt: image.alt ?? doc.title,
    })),
    variants: (doc.variants ?? [])
      .filter((variant) => variant.isActive !== false)
      .map((variant) => ({
        sku: variant.sku,
        volume: variant.volume,
        price: variant.price,
        oldPrice: variant.oldPrice ?? null,
        stock: variant.stock ?? 0,
      }))
      .sort((a, b) => a.volume - b.volume),
    notes: notes.map((note) => ({ slug: note.slug, title: note.title })),
    pyramid: {
      top: noteTitles(doc.pyramid?.top),
      heart: noteTitles(doc.pyramid?.heart),
      base: noteTitles(doc.pyramid?.base),
    },
    categoryIds: objects<{ id: number | string }>(doc.categories).map((category) => category.id),
    noteIds: notes.map((note) => note.id),
  }
}

export const getProductBySlug = (slug: string, locale: Locale) =>
  unstable_cache(
    async (): Promise<ProductView | null> => {
      const payload = await getPayloadClient()
      const { docs } = await payload.find({
        collection: 'products',
        locale,
        depth: 1,
        limit: 1,
        where: { and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }] },
      })
      return docs[0] ? toView(docs[0]) : null
    },
    ['product', slug, locale],
    { tags: [CATALOG_TAG], revalidate: CACHE_TTL },
  )()

/**
 * Похожие: сначала по общим нотам, затем по семейству — и никогда сам товар
 * (Приложение A: «похожие не содержат сам товар»).
 */
export const getSimilarProducts = (product: ProductView, locale: Locale, limit = 4) =>
  unstable_cache(
    async (): Promise<ProductCardData[]> => {
      const payload = await getPayloadClient()

      const base: Where[] = [
        { id: { not_equals: product.id } },
        { _status: { equals: 'published' } },
      ]

      const byNotes = product.noteIds.length
        ? await payload.find({
            collection: 'products',
            locale,
            depth: 1,
            limit,
            where: { and: [...base, { notes: { in: product.noteIds } }] },
          })
        : { docs: [] }

      const collected = [...byNotes.docs]

      if (collected.length < limit && product.family) {
        const byFamily = await payload.find({
          collection: 'products',
          locale,
          depth: 1,
          limit: limit - collected.length,
          where: {
            and: [
              ...base,
              { family: { equals: product.family } },
              { id: { not_in: collected.map((doc) => doc.id) } },
            ],
          },
        })
        collected.push(...byFamily.docs)
      }

      return toCardList(collected)
    },
    ['similar', String(product.id), locale],
    { tags: [CATALOG_TAG], revalidate: CACHE_TTL },
  )()
