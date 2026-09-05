'use client'

import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Facets } from '@/lib/catalog/types'
import type { FlagOption } from '@/lib/catalog/searchParams'
import { useCatalogQuery } from './useCatalogQuery'

/** Выбранные значения строкой чипов — видно, что именно сузило выдачу. */
export function ActiveFilters({ facets }: { facets: Facets }) {
  const t = useTranslations('Catalog.filters')
  const { query, setQuery, toggleInList, resetAll } = useCatalogQuery()

  const label = (list: { value: string; label: string }[], value: string) =>
    list.find((item) => item.value === value)?.label ?? value

  const chips: { key: string; label: string; clear: () => void }[] = [
    ...query.brand.map((slug) => ({
      key: `brand-${slug}`,
      label: label(facets.brand, slug),
      clear: () => toggleInList('brand', slug),
    })),
    ...query.gender.map((value) => ({
      key: `gender-${value}`,
      label: label(facets.gender, value),
      clear: () => toggleInList('gender', value),
    })),
    ...query.country.map((value) => ({
      key: `country-${value}`,
      label: label(facets.country, value),
      clear: () => toggleInList('country', value),
    })),
    ...query.flags.map((flag: FlagOption) => ({
      key: `flag-${flag}`,
      label: label(facets.flags, flag),
      clear: () => toggleInList('flags', flag),
    })),
  ]

  if (query.priceMin !== null || query.priceMax !== null) {
    chips.push({
      key: 'price',
      label: `${t('price')}: ${query.priceMin ?? '—'}–${query.priceMax ?? '—'}`,
      clear: () => setQuery({ priceMin: null, priceMax: null, page: null }),
    })
  }

  if (!chips.length) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.clear}
          className="border-line text-ink-muted text-eyebrow hover:border-navy hover:text-ink flex cursor-pointer items-center gap-1.5 rounded-sm border px-2 py-1 transition-colors"
        >
          {chip.label}
          <X className="size-3" strokeWidth={2} />
        </button>
      ))}
      <button
        type="button"
        onClick={resetAll}
        className="text-ink-muted hover:text-ink text-eyebrow tracking-label cursor-pointer uppercase underline underline-offset-4"
      >
        {t('reset')}
      </button>
    </div>
  )
}
