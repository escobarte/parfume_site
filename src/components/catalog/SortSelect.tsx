'use client'

import { useTranslations } from 'next-intl'
import { SORT_OPTIONS, type SortOption } from '@/lib/catalog/searchParams'
import { useCatalogQuery } from './useCatalogQuery'

/**
 * `options` — подмножество сортировок для раздела (подарочные разделы —
 * `GIFT_SORT_OPTIONS`). Значение из URL, которого нет в списке (в т.ч. общий
 * дефолт каталога `new`), показывается как первая опция — ровно так его
 * трактует сервер раздела.
 */
export function SortSelect({ options = SORT_OPTIONS }: { options?: readonly SortOption[] }) {
  const t = useTranslations('Catalog.sort')
  const { query, setQuery } = useCatalogQuery()
  const value = options.includes(query.sort) ? query.sort : options[0]

  return (
    <label className="text-ink-muted text-eyebrow tracking-label flex items-center gap-2 uppercase">
      <span className="hidden sm:inline">{t('label')}</span>
      <select
        value={value}
        aria-label={t('label')}
        onChange={(event) => setQuery({ sort: event.target.value as SortOption, page: null })}
        className="border-line text-ink text-eyebrow tracking-label cursor-pointer rounded-sm border bg-transparent px-2 py-1.5 uppercase outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {t(option)}
          </option>
        ))}
      </select>
    </label>
  )
}
