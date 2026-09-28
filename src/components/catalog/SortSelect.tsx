'use client'

import { useTranslations } from 'next-intl'
import { CATALOG_SORT_OPTIONS, type SortOption } from '@/lib/catalog/searchParams'
import { useCatalogQuery } from './useCatalogQuery'

/**
 * `options` — подмножество сортировок для раздела (поиск — `SEARCH_SORT_OPTIONS`
 * с «по релевантности», подарочные разделы — `GIFT_SORT_OPTIONS`).
 *
 * `value` — сортировка, которую РЕАЛЬНО применил сервер этого раздела. Её надо
 * передавать, когда дефолт раздела отличается от дефолта общих парсеров
 * (`/search`: дефолт — релевантность): свой лоадер у страницы есть, а
 * клиентский хук читает URL общими парсерами и на пустом `?sort=` показал бы
 * «По названию» при выдаче по рангу. Без `value` берётся значение из URL —
 * для каталога этого достаточно.
 *
 * Значение, которого нет в списке, показывается как первая опция — ровно так
 * его трактует сервер раздела.
 */
export function SortSelect({
  options = CATALOG_SORT_OPTIONS,
  value: serverValue,
}: {
  options?: readonly SortOption[]
  value?: SortOption
}) {
  const t = useTranslations('Catalog.sort')
  const { query, setQuery } = useCatalogQuery()
  const current = serverValue ?? query.sort
  const value = options.includes(current) ? current : options[0]

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
