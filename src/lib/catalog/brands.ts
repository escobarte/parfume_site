import { unstable_cache } from 'next/cache'
import { CACHE_TTL } from '@/lib/cache'
import type { Locale } from '@/i18n/routing'
import type { Brand, Media } from '@/payload-types'
import { getPayloadClient } from '@/lib/payload'
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
    title: doc.title,
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
