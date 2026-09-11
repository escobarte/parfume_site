import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { BrandAlphabet } from '@/components/brands/BrandAlphabet'
import { BrandGrid } from '@/components/brands/BrandGrid'
import { CatalogShell } from '@/components/catalog/CatalogShell'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import type { Locale } from '@/i18n/routing'
import { getAllBrands, groupBrandsByLetter } from '@/lib/catalog/brands'
import { buildMetadata } from '@/lib/seo/metadata'

export async function generateMetadata(props: {
  params: Promise<{ locale: Locale }>
}): Promise<Metadata> {
  const { locale } = await props.params
  const t = await getTranslations({ locale, namespace: 'Nav' })
  return buildMetadata({ locale, path: '/brands', title: t('brands') })
}

/**
 * Каталог брендов: сетка карточек с логотипами + алфавитный указатель.
 * WIREFRAMES.md эту страницу пиксельно не описывает — раскладка переносит
 * паттерны каталога (карточка §3, колонки сетки, линии-разделители).
 */
export default async function BrandsPage(props: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)

  const [brands, t, tb] = await Promise.all([
    getAllBrands(locale),
    getTranslations('Nav'),
    getTranslations('BrandsPage'),
  ])
  const groups = groupBrandsByLetter(brands)

  return (
    <>
      <Breadcrumbs items={[{ label: t('brands') }]} />
      <CatalogShell activeKey="brands">
        <h1 className="text-ink text-section tracking-display border-line border-b pb-5 font-light uppercase">
          {t('brands')}
        </h1>

        {groups.length === 0 ? (
          <p className="text-ink-muted text-body mt-8">{tb('empty')}</p>
        ) : (
          <>
            <BrandAlphabet groups={groups} label={tb('indexLabel')} />
            <div className="mt-8">
              <BrandGrid groups={groups} />
            </div>
          </>
        )}
      </CatalogShell>
    </>
  )
}
