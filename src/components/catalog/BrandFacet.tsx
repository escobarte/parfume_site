'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { FacetCount } from '@/lib/catalog/types'
import { FacetRow } from './FacetRow'

/** Со скольки брендов список получает собственный поиск и отдельный экран. */
export const BRAND_SEARCH_THRESHOLD = 6

/**
 * Список брендов с поиском. Используется и встроенным (десктоп, боковая
 * панель), и отдельным слоем мобильной шторки — разметка одна и та же.
 */
export function BrandFacet({
  brands,
  selected,
  onToggle,
  fill = false,
}: {
  brands: FacetCount[]
  selected: string[]
  onToggle: (slug: string) => void
  /** Слоем на весь экран список занимает всю высоту, а не 240px. */
  fill?: boolean
}) {
  const t = useTranslations('Catalog.filters')
  const [search, setSearch] = useState('')

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return term ? brands.filter((item) => item.label.toLowerCase().includes(term)) : brands
  }, [brands, search])

  return (
    <>
      {brands.length > BRAND_SEARCH_THRESHOLD && (
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('brandSearch')}
          className="border-line text-ink text-body-sm placeholder:text-ink-subtle mb-2 w-full rounded-sm border px-2.5 py-1.5 outline-none focus:border-[var(--color-navy)]"
        />
      )}
      <div className={fill ? '' : 'max-h-60 overflow-y-auto'}>
        {visible.map((item) => (
          <FacetRow
            key={item.value}
            label={item.label}
            count={item.count}
            checked={selected.includes(item.value)}
            onToggle={() => onToggle(item.value)}
          />
        ))}
      </div>
    </>
  )
}
