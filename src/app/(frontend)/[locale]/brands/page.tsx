import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { getAllBrands } from '@/lib/catalog/brands'

/** Алфавитный указатель брендов (WIREFRAMES.md: страница ещё не утверждена
 * пиксельно — переносит паттерны сайта: линии-разделители, типографику §3). */
export default async function BrandsPage(props: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)

  const [brands, t] = await Promise.all([getAllBrands(locale), getTranslations('Nav')])

  return (
    <>
      <Breadcrumbs items={[{ label: t('brands') }]} />
      <div className="mx-auto max-w-[1440px] px-5 py-10 md:px-8 md:py-12">
        <h1 className="text-ink text-section tracking-display border-line border-b pb-5 font-light uppercase">
          {t('brands')}
        </h1>
        <ul className="mt-2">
          {brands.map((brand) => (
            <li key={brand.id} className="border-line border-b">
              <Link
                href={`/brands/${brand.slug}`}
                className="group flex items-center justify-between gap-4 py-4"
              >
                <span className="text-ink group-hover:text-ink-muted text-body font-medium uppercase transition-colors">
                  {brand.title}
                </span>
                {brand.country && (
                  <span className="text-ink-subtle text-label tracking-label shrink-0 uppercase">
                    {brand.country}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
