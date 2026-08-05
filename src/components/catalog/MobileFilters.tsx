'use client'

import { SlidersHorizontal, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import type { Facets } from '@/lib/catalog/types'
import { FilterPanel } from './FilterPanel'

/**
 * Мобильные фильтры — bottom-sheet (PLAN.md §5.3): кнопка снизу экрана,
 * панель выезжает на всю ширину, применяется сразу, «Показать результаты»
 * просто закрывает лист.
 */
export function MobileFilters({ facets, activeCount }: { facets: Facets; activeCount: number }) {
  const t = useTranslations('Catalog.filters')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-line text-ink text-label tracking-display flex w-full items-center justify-center gap-2 rounded-sm border py-2.5 uppercase lg:hidden"
      >
        <SlidersHorizontal className="size-4" strokeWidth={1.6} />
        {t('open')}
        {activeCount > 0 && (
          <span className="bg-navy text-cream text-micro flex size-4 items-center justify-center rounded-full">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-60 lg:hidden">
          <button
            type="button"
            aria-label={t('close')}
            className="bg-navy/40 absolute inset-0"
            onClick={() => setOpen(false)}
          />
          <div className="bg-surface absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-sm">
            <div className="border-line flex items-center justify-between border-b px-5 py-4">
              <span className="text-ink text-section tracking-display font-light uppercase">
                {t('title')}
              </span>
              <button type="button" onClick={() => setOpen(false)} aria-label={t('close')}>
                <X className="text-ink size-5" strokeWidth={1.6} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5">
              <FilterPanel facets={facets} />
            </div>

            <div className="border-line border-t p-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="bg-navy text-cream text-label tracking-display w-full rounded-sm py-3 uppercase"
              >
                {t('apply')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
