import { getTranslations } from 'next-intl/server'
import { ProductCard } from '@/components/catalog/ProductCard'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { getFlaggedProducts } from '@/lib/catalog/queries'
import type { FlagOption } from '@/lib/catalog/searchParams'

/**
 * Товарный ряд главной (WIREFRAMES.md §3/Опциональный слот) — «Новинки» и
 * «Хиты» используют один и тот же ряд, отличаются флагом и заголовком.
 * Карточка — тот же эталон, что в каталоге (ProductCard), сетка та же.
 */
export async function ProductRow({
  locale,
  flag,
  title,
  linkLabel,
  limit,
  priority = false,
}: {
  locale: Locale
  flag: FlagOption
  title: string
  linkLabel?: string | null
  limit: number
  priority?: boolean
}) {
  const [products, t] = await Promise.all([
    getFlaggedProducts(locale, flag, limit),
    getTranslations('HomePage'),
  ])
  if (products.length === 0) return null

  return (
    <section className="bg-surface px-5 py-14 md:px-8 md:py-16">
      <div className="mx-auto flex max-w-[1440px] items-baseline justify-between gap-4 pb-8">
        <h2 className="text-ink text-section tracking-display uppercase">{title}</h2>
        <Link
          href={`/catalog?flags=${flag}`}
          className="text-ink-muted text-label tracking-body shrink-0"
        >
          {linkLabel || t('rows.seeAll')} →
        </Link>
      </div>
      <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-4 md:grid-cols-3 md:gap-4.5 xl:grid-cols-4">
        {products.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            locale={locale}
            priority={priority && index === 0}
          />
        ))}
      </div>
    </section>
  )
}
