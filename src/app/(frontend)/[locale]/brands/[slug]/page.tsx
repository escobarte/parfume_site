import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { SearchParams } from 'nuqs/server'
import { CatalogView } from '@/components/catalog/CatalogView'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { routing, type Locale } from '@/i18n/routing'
import { getAllBrands, getBrandBySlug } from '@/lib/catalog/brands'
import { loadCatalogParams } from '@/lib/catalog/searchParams'
import { staticParamsOrEmpty } from '@/lib/catalog/staticParams'

export async function generateStaticParams() {
  return staticParamsOrEmpty(async () => {
    const brands = await getAllBrands(routing.defaultLocale)
    return routing.locales.flatMap((locale) => brands.map((brand) => ({ locale, slug: brand.slug })))
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
