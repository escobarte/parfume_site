import { unstable_cache } from 'next/cache'
import { CACHE_TTL } from '@/lib/cache'
import type { Locale } from '@/i18n/routing'
import type { Media } from '@/payload-types'
import { getPayloadClient } from '@/lib/payload'
import { TAXONOMY_TAG } from '@/lib/revalidate'

export type TaxonomyItem = { id: number | string; slug: string; title: string }

const toItems = (docs: { id: number | string; slug: string; title: string }[]): TaxonomyItem[] =>
  docs.map((doc) => ({ id: doc.id, slug: doc.slug, title: doc.title }))

export const getBrands = (locale: Locale) =>
  unstable_cache(
    async (): Promise<TaxonomyItem[]> => {
      const payload = await getPayloadClient()
      const { docs } = await payload.find({
        collection: 'brands',
        locale,
        depth: 0,
        limit: 500,
        sort: 'title',
      })
      return toItems(docs)
    },
    ['brands', locale],
    { tags: [TAXONOMY_TAG], revalidate: CACHE_TTL },
  )()

export const getNotes = (locale: Locale) =>
  unstable_cache(
    async (): Promise<TaxonomyItem[]> => {
      const payload = await getPayloadClient()
      const { docs } = await payload.find({
        collection: 'notes',
        locale,
        depth: 0,
        limit: 500,
        sort: 'title',
      })
      return toItems(docs)
    },
    ['notes', locale],
    { tags: [TAXONOMY_TAG], revalidate: CACHE_TTL },
  )()

export type CategoryItem = TaxonomyItem & {
  parent: number | string | null
  order: number
  description: string | null
  seo: { title?: string | null; description?: string | null; image?: { url: string } | null } | null
}

export const getCategories = (locale: Locale) =>
  unstable_cache(
    async (): Promise<CategoryItem[]> => {
      const payload = await getPayloadClient()
      const { docs } = await payload.find({
        collection: 'categories',
        locale,
        // depth: 1 — seo.image нужен объект с url, не голый id (метаданные, фаза 7.1).
        depth: 1,
        limit: 500,
        sort: 'order',
      })
      return docs.map((doc) => {
        const seoImage =
          doc.seo?.image && typeof doc.seo.image === 'object' ? (doc.seo.image as Media) : null
        return {
          id: doc.id,
          slug: doc.slug,
          title: doc.title,
          parent: (doc.parent as number | string | null) ?? null,
          order: doc.order ?? 0,
          description: doc.description ?? null,
          seo: doc.seo
            ? {
                title: doc.seo.title,
                description: doc.seo.description,
                image: seoImage?.url ? { url: seoImage.url } : null,
              }
            : null,
        }
      })
    },
    ['categories', locale],
    { tags: [TAXONOMY_TAG], revalidate: CACHE_TTL },
  )()

/** Категория + все её потомки: страница родителя показывает и вложенные товары. */
export function categoryWithDescendants(
  categories: CategoryItem[],
  rootId: number | string,
): (number | string)[] {
  const ids = [rootId]
  let added = true
  while (added) {
    added = false
    for (const category of categories) {
      if (category.parent !== null && ids.includes(category.parent) && !ids.includes(category.id)) {
        ids.push(category.id)
        added = true
      }
    }
  }
  return ids
}
