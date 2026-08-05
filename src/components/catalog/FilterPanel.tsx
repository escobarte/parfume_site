'use client'

import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Facets } from '@/lib/catalog/types'
import type { FlagOption } from '@/lib/catalog/searchParams'
import { BrandFacet, BRAND_SEARCH_THRESHOLD } from './BrandFacet'
import { ChipCount, FacetGroup, FacetRow } from './FacetRow'
import { useCatalogQuery } from './useCatalogQuery'

export function FilterPanel({
  facets,
  /** В шторке заголовок и «сбросить всё» живут в её шапке — здесь не дублируем. */
  withHeader = true,
  /** В шторке фильтры не должны копить историю: «Назад» закрывает саму шторку. */
  historyMode = 'push',
  /** Длинный список брендов на мобильном открывается отдельным слоем. */
  onOpenBrands,
  /** Шторке нужно знать актуальный URL с фильтрами — см. useCatalogQuery. */
  onQueryWrite,
}: {
  facets: Facets
  withHeader?: boolean
  historyMode?: 'push' | 'replace'
  onOpenBrands?: () => void
  onQueryWrite?: (search: string) => void
}) {
  const t = useTranslations('Catalog.filters')
  const { query, setQuery, toggleInList, resetAll } = useCatalogQuery(historyMode, onQueryWrite)

  const brandsAsLayer = Boolean(onOpenBrands) && facets.brand.length > BRAND_SEARCH_THRESHOLD

  return (
    <div>
      {withHeader && (
        <div className="border-line flex items-center justify-between gap-3 border-b pb-3">
          <h2 className="text-ink text-section tracking-display font-light uppercase">
            {t('title')}
          </h2>
          <button
            type="button"
            onClick={resetAll}
            className="text-ink-muted hover:text-ink text-eyebrow tracking-label cursor-pointer uppercase transition-colors"
          >
            {t('reset')}
          </button>
        </div>
      )}

      {facets.brand.length > 0 && (
        <FacetGroup title={t('brand')}>
          {brandsAsLayer ? (
            <button
              type="button"
              onClick={onOpenBrands}
              className="text-ink text-body-sm flex w-full cursor-pointer items-center justify-between gap-3 py-1.5"
            >
              <span>
                {query.brand.length ? t('active', { count: query.brand.length }) : t('brandSearch')}
              </span>
              <ChevronRight className="text-ink-muted size-4 shrink-0" strokeWidth={1.6} />
            </button>
          ) : (
            <BrandFacet
              brands={facets.brand}
              selected={query.brand}
              onToggle={(slug) => toggleInList('brand', slug)}
            />
          )}
        </FacetGroup>
      )}

      {facets.price && (
        <FacetGroup title={t('price')}>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              value={query.priceMin ?? ''}
              min={facets.price.min}
              max={facets.price.max}
              placeholder={String(facets.price.min)}
              aria-label={t('priceFrom')}
              onChange={(event) =>
                setQuery({
                  priceMin: event.target.value ? Number(event.target.value) : null,
                  page: null,
                })
              }
              className="border-line text-ink text-body-sm w-full rounded-sm border px-2.5 py-1.5 outline-none focus:border-[var(--color-navy)]"
            />
            <span className="text-ink-subtle">—</span>
            <input
              type="number"
              inputMode="numeric"
              value={query.priceMax ?? ''}
              min={facets.price.min}
              max={facets.price.max}
              placeholder={String(facets.price.max)}
              aria-label={t('priceTo')}
              onChange={(event) =>
                setQuery({
                  priceMax: event.target.value ? Number(event.target.value) : null,
                  page: null,
                })
              }
              className="border-line text-ink text-body-sm w-full rounded-sm border px-2.5 py-1.5 outline-none focus:border-[var(--color-navy)]"
            />
          </div>
        </FacetGroup>
      )}

      {facets.volume.length > 0 && (
        <FacetGroup title={t('volume')}>
          <div className="flex flex-wrap gap-1.5">
            {facets.volume.map((item) => {
              const value = Number(item.value)
              const active = query.volume.includes(value)
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => toggleInList('volume', value)}
                  className={`text-eyebrow cursor-pointer rounded-sm border px-2 py-1 transition-colors ${
                    active
                      ? 'border-navy bg-navy text-cream'
                      : 'border-line text-ink hover:border-navy'
                  }`}
                >
                  {item.label}
                  <ChipCount count={item.count} onDark={active} />
                </button>
              )
            })}
          </div>
        </FacetGroup>
      )}

      {facets.gender.length > 0 && (
        <FacetGroup title={t('gender')}>
          {facets.gender.map((item) => (
            <FacetRow
              key={item.value}
              label={item.label}
              count={item.count}
              checked={query.gender.includes(item.value)}
              onToggle={() => toggleInList('gender', item.value)}
            />
          ))}
        </FacetGroup>
      )}

      {facets.notes.length > 0 && (
        <FacetGroup title={t('notes')}>
          <div className="max-h-60 overflow-y-auto">
            {facets.notes.map((item) => (
              <FacetRow
                key={item.value}
                label={item.label}
                count={item.count}
                checked={query.notes.includes(item.value)}
                onToggle={() => toggleInList('notes', item.value)}
              />
            ))}
          </div>
        </FacetGroup>
      )}

      {facets.flags.length > 0 && (
        <FacetGroup title={t('flags')}>
          {facets.flags.map((item) => (
            <FacetRow
              key={item.value}
              label={item.label}
              count={item.count}
              checked={query.flags.includes(item.value as FlagOption)}
              onToggle={() => toggleInList('flags', item.value)}
            />
          ))}
        </FacetGroup>
      )}
    </div>
  )
}
