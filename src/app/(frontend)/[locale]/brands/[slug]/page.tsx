import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { SearchParams } from 'nuqs/server'
import { CatalogView } from '@/components/catalog/CatalogView'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { routing, type Locale } from '@/i18n/routing'
import { getAllBrands, getBrandBySlug } from '@/lib/catalog/brands'
import { countActiveFilters, loadCatalogParams } from '@/lib/catalog/searchParams'
import { staticParamsOrEmpty } from '@/lib/catalog/staticParams'
import { buildMetadata } from '@/lib/seo/metadata'

export async function generateStaticParams() {
  return staticParamsOrEmpty(async () => {
    const brands = await getAllBrands(routing.defaultLocale)
    return routing.locales.flatMap((locale) => brands.map((brand) => ({ locale, slug: brand.slug })))
  })
}

export async function generateMetadata(props: {
  params: Promise<{ locale: Locale; slug: string }>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const { locale, slug } = await props.params
  const [query, brand] = await Promise.all([
    loadCatalogParams(props.searchParams),
    getBrandBySlug(slug, locale),
  ])
  if (!brand) return {}

  return buildMetadata({
    locale,
    path: `/brands/${slug}`,
    title: brand.title,
    seo: brand.seo,
    description: brand.description,
    noindex: countActiveFilters(query) > 0,
  })
}

/** Страница бренда: описание + только его товары (та же выдача, что каталог). */
export default async function BrandPage(props: {
  params: Promise<{ locale: Locale; slug: string }>
  searchParams: Promise<SearchParams>
}) {
  const { locale, slug } = await props.params
  setRequestLocale(locale)

  const [query, brand, t] = await Promise.all([
    loadCatalogParams(props.searchParams),
    getBrandBySlug(slug, locale),
    getTranslations('Nav'),
  ])

  if (!brand) notFound()

  return (
    <>
      <Breadcrumbs items={[{ label: t('brands'), href: '/brands' }, { label: brand.title }]} />
      <CatalogView
        locale={locale}
        query={query}
        scope={{ brandIds: [brand.id] }}
        title={brand.title}
        subtitle={brand.description ?? undefined}
      />
    </>
  )
}
