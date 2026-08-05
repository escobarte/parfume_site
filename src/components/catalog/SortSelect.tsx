'use client'

import { useTranslations } from 'next-intl'
import { SORT_OPTIONS, type SortOption } from '@/lib/catalog/searchParams'
import { useCatalogQuery } from './useCatalogQuery'

export function SortSelect() {
  const t = useTranslations('Catalog.sort')
  const { query, setQuery } = useCatalogQuery()

  return (
    <label className="text-ink-muted text-eyebrow tracking-label flex items-center gap-2 uppercase">
      <span className="hidden sm:inline">{t('label')}</span>
      <select
        value={query.sort}
        aria-label={t('label')}
        onChange={(event) => setQuery({ sort: event.target.value as SortOption, page: null })}
        className="border-line text-ink text-eyebrow tracking-label cursor-pointer rounded-sm border bg-transparent px-2 py-1.5 uppercase outline-none"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {t(option)}
          </option>
        ))}
      </select>
    </label>
  )
}
