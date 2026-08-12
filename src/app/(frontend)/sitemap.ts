import type { MetadataRoute } from 'next'
import { routing } from '@/i18n/routing'
import { getPayloadClient } from '@/lib/payload'
import { SITE_URL } from '@/lib/seo/config'

export const revalidate = 3600

/**
 * По одному `<url>` на локаль (рекомендация Google для hreflang в sitemap —
 * не один canonical-URL с alternates, а отдельная запись на каждую локаль,
 * у каждой в `alternates.languages` перечислены все локали + сама себя +
 * x-default). `path` — без префикса локали (`''` для главной).
 */
function entriesFor(path: string, lastModified?: Date): MetadataRoute.Sitemap {
  const languages: Record<string, string> = {}
  for (const locale of routing.locales) {
    languages[locale] = `${SITE_URL}/${locale}${path}`
  }
  languages['x-default'] = `${SITE_URL}/${routing.defaultLocale}${path}`

  return routing.locales.map((locale) => ({
    url: `${SITE_URL}/${locale}${path}`,
    ...(lastModified ? { lastModified } : {}),
    alternates: { languages },
  }))
}

/** Товары + бренды + категории + статические страницы × 3 локали (PLAN.md §7.3). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const payload = await getPayloadClient()
  const [products, brands, categories, pages] = await Promise.all([
    payload.find({
      collection: 'products',
      where: { _status: { equals: 'published' } },
      limit: 5000,
      pagination: false,
      depth: 0,
    }),
    payload.find({ collection: 'brands', limit: 1000, pagination: false, depth: 0 }),
    payload.find({ collection: 'categories', limit: 1000, pagination: false, depth: 0 }),
    payload.find({ collection: 'pages', limit: 100, pagination: false, depth: 0 }),
  ])

  const entries: MetadataRoute.Sitemap = [
    ...entriesFor(''),
    ...entriesFor('/catalog'),
    ...entriesFor('/brands'),
  ]

  for (const product of products.docs) {
    entries.push(...entriesFor(`/product/${product.slug}`, new Date(product.updatedAt)))
  }
  for (const brand of brands.docs) {
    entries.push(...entriesFor(`/brands/${brand.slug}`, new Date(brand.updatedAt)))
  }
  for (const category of categories.docs) {
    entries.push(...entriesFor(`/catalog/${category.slug}`, new Date(category.updatedAt)))
  }
  for (const page of pages.docs) {
    entries.push(...entriesFor(`/${page.slug}`, new Date(page.updatedAt)))
  }

  return entries
}
