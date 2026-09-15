import { getTranslations } from 'next-intl/server'
import { SortSelect } from '@/components/catalog/SortSelect'
import type { Locale } from '@/i18n/routing'
import { GIFT_SORT_OPTIONS, type GiftSortOption } from '@/lib/catalog/searchParams'
import { getGiftItems, type GiftItemType } from '@/lib/giftItems/queries'
import { GiftItemCard } from './GiftItemCard'

/**
 * Раздел «Подарочные сертификаты»/«Gift box» (фаза 11.1, задача 2) — общий
 * рендер для обоих, отличается только `type`: тот же принцип переиспользования,
 * что у `CatalogView` для каталога/категории/бренда.
 *
 * Только сортировка (2026-09-15), фильтров здесь осознанно нет — позиций мало.
 */
export async function GiftItemsView({
  locale,
  type,
  title,
  sort,
}: {
  locale: Locale
  type: GiftItemType
  title: string
  sort: GiftSortOption
}) {
  const tg = await getTranslations('GiftItem')
  const items = await getGiftItems(type, locale, sort)
  const typeLabel = tg(`type.${type}`)

  return (
    <div>
      <h1 className="text-ink text-section tracking-display border-line border-b pb-5 font-light uppercase">
        {title}
      </h1>

      <div className="mt-6">
        {items.length > 1 && (
          <div className="mb-5 flex justify-end">
            <SortSelect options={GIFT_SORT_OPTIONS} />
          </div>
        )}
        {items.length === 0 ? (
          <div className="border-line flex flex-col items-center gap-2 border py-20 text-center">
            <p className="text-ink text-body">{tg('empty')}</p>
            <p className="text-ink-muted text-body-sm">{tg('emptyHint')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <GiftItemCard key={item.id} item={item} typeLabel={typeLabel} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
