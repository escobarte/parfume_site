import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { SearchParams } from 'nuqs/server'
import { CatalogView } from '@/components/catalog/CatalogView'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { routing, type Locale } from '@/i18n/routing'
import { countActiveFilters, loadCatalogParams } from '@/lib/catalog/searchParams'
import { staticParamsOrEmpty } from '@/lib/catalog/staticParams'
import { categoryWithDescendants, getCategories } from '@/lib/catalog/taxonomy'
import { buildMetadata } from '@/lib/seo/metadata'

export async function generateStaticParams() {
  return staticParamsOrEmpty(async () => {
    const categories = await getCategories(routing.defaultLocale)
    return routing.locales.flatMap((locale) =>
      categories.map((category) => ({ locale, category: category.slug })),
    )
  })
}

export async function generateMetadata(props: {
  params: Promise<{ locale: Locale; category: string }>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const { locale, category: slug } = await props.params
  const [query, categories] = await Promise.all([
    loadCatalogParams(props.searchParams),
    getCategories(locale),
  ])
  const category = categories.find((item) => item.slug === slug)
  if (!category) return {}

  return buildMetadata({
    locale,
    path: `/catalog/${slug}`,
    title: category.title,
    seo: category.seo,
    description: category.description,
    noindex: countActiveFilters(query) > 0,
  })
}

export default async function CategoryPage(props: {
  params: Promise<{ locale: Locale; category: string }>
  searchParams: Promise<SearchParams>
}) {
  const { locale, category: slug } = await props.params
  setRequestLocale(locale)

  const [query, categories, t] = await Promise.all([
    loadCatalogParams(props.searchParams),
    getCategories(locale),
    getTranslations('Catalog'),
  ])

  const category = categories.find((item) => item.slug === slug)
  if (!category) notFound()

  // Родительская категория показывает и товары вложенных категорий.
  const categoryIds = categoryWithDescendants(categories, category.id)

  return (
    <>
      <Breadcrumbs items={[{ label: t('title'), href: '/catalog' }, { label: category.title }]} />
      <CatalogView locale={locale} query={query} scope={{ categoryIds }} title={category.title} />
    </>
  )
}
