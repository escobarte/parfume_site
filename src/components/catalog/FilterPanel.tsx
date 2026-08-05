'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Facets } from '@/lib/catalog/types'
import type { FlagOption } from '@/lib/catalog/searchParams'
import { useCatalogQuery } from './useCatalogQuery'

/** Чекбокс фасета: подпись слева, счётчик справа (без подложек, BRAND §5). */
function FacetRow({
  label,
  count,
  checked,
  onToggle,
}: {
  label: string
  count: number
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label className="hover:text-ink flex cursor-pointer items-center justify-between gap-3 py-1.5">
      <span className="flex items-center gap-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="accent-navy size-3.5"
        />
        <span className="text-ink text-body-sm">{label}</span>
      </span>
      <span className="text-ink-subtle text-eyebrow tabular-nums">{count}</span>
    </label>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-line border-b py-5 last:border-b-0">
      <h3 className="text-ink text-eyebrow tracking-display mb-3 uppercase">{title}</h3>
      {children}
    </section>
  )
}

export function FilterPanel({ facets }: { facets: Facets }) {
  const t = useTranslations('Catalog.filters')
  const { query, setQuery, toggleInList, resetAll } = useCatalogQuery()
  const [brandSearch, setBrandSearch] = useState('')

  const brands = useMemo(() => {
    const term = brandSearch.trim().toLowerCase()
    return term
      ? facets.brand.filter((item) => item.label.toLowerCase().includes(term))
      : facets.brand
  }, [facets.brand, brandSearch])

  return (
    <div>
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

      {facets.brand.length > 0 && (
        <Group title={t('brand')}>
          {facets.brand.length > 6 && (
            <input
              type="search"
              value={brandSearch}
              onChange={(event) => setBrandSearch(event.target.value)}
              placeholder={t('brandSearch')}
              className="border-line text-ink text-body-sm placeholder:text-ink-subtle mb-2 w-full rounded-sm border px-2.5 py-1.5 outline-none focus:border-[var(--color-navy)]"
            />
          )}
          <div className="max-h-60 overflow-y-auto">
            {brands.map((item) => (
              <FacetRow
                key={item.value}
                label={item.label}
                count={item.count}
                checked={query.brand.includes(item.value)}
                onToggle={() => toggleInList('brand', item.value)}
              />
            ))}
          </div>
        </Group>
      )}

      {facets.price && (
        <Group title={t('price')}>
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
        </Group>
      )}

      {facets.volume.length > 0 && (
        <Group title={t('volume')}>
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
                      : 'border-line text-ink-muted hover:border-navy'
                  }`}
                >
                  {item.label} <span className="tabular-nums opacity-70">{item.count}</span>
                </button>
              )
            })}
          </div>
        </Group>
      )}

      {facets.gender.length > 0 && (
        <Group title={t('gender')}>
          {facets.gender.map((item) => (
            <FacetRow
              key={item.value}
              label={item.label}
              count={item.count}
              checked={query.gender.includes(item.value)}
              onToggle={() => toggleInList('gender', item.value)}
            />
          ))}
        </Group>
      )}

      {facets.notes.length > 0 && (
        <Group title={t('notes')}>
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
        </Group>
      )}

      {facets.flags.length > 0 && (
        <Group title={t('flags')}>
          {facets.flags.map((item) => (
            <FacetRow
              key={item.value}
              label={item.label}
              count={item.count}
              checked={query.flags.includes(item.value as FlagOption)}
              onToggle={() => toggleInList('flags', item.value)}
            />
          ))}
        </Group>
      )}
    </div>
  )
}
