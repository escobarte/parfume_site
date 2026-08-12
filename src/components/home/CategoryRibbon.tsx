import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { countProductsInCategories } from '@/lib/catalog/queries'
import { getHomepage } from '@/lib/content/globals'
import type { Category } from '@/payload-types'

/** Лента категорий (WIREFRAMES.md §2): 4 плитки, живые счётчики из БД. */
export async function CategoryRibbon({ locale }: { locale: Locale }) {
  const [homepage, t] = await Promise.all([getHomepage(locale), getTranslations('HomePage.categories')])
  const tiles = (homepage.categoryTiles ?? []).filter(
    (tile): tile is typeof tile & { category: Category } => typeof tile.category === 'object',
  )
  if (tiles.length === 0) return null

  const counts = await Promise.all(
    tiles.map((tile) => countProductsInCategories(locale, [tile.category.id])),
  )

  return (
    <section className="bg-surface-warm grid grid-cols-2 md:grid-cols-4">
      {tiles.map((tile, index) => (
        <Link
          key={tile.id ?? tile.category.id}
          href={`/catalog/${tile.category.slug}`}
          className={`border-line hover:bg-surface flex flex-col items-center gap-1.5 border-r px-2.5 py-7.5 text-center transition-colors last:border-r-0 max-md:[&:nth-child(2)]:border-r-0 max-md:[&:nth-child(-n+2)]:border-b`}
        >
          <span className="text-ink text-label tracking-display uppercase">
            {tile.labelOverride || tile.category.title}
          </span>
          <span className="text-ink-muted text-body-sm">{t('count', { count: counts[index] })}</span>
        </Link>
      ))}
    </section>
  )
}
