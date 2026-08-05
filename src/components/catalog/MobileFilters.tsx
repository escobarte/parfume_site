'use client'

import { ChevronLeft, SlidersHorizontal, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from '@/i18n/navigation'
import type { Facets } from '@/lib/catalog/types'
import { useSheetLayers } from '@/lib/useSheetLayers'
import { BrandFacet } from './BrandFacet'
import { FilterPanel } from './FilterPanel'
import { useCatalogQuery } from './useCatalogQuery'

const SHEET = 'filters'
const BRANDS = 'brands'

/**
 * Мобильные фильтры — bottom-sheet (PLAN.md §5.3): кнопка снизу экрана,
 * панель выезжает на всю ширину, фильтр применяется сразу, «Показать
 * результаты» просто закрывает лист.
 *
 * Шторка и вложенный список брендов — слои в истории браузера
 * (`useSheetLayers`): «Назад» на телефоне закрывает верхний слой и оставляет
 * пользователя на той же странице каталога с теми же фильтрами, а не уводит
 * с неё. Фильтры внутри шторки пишутся в URL через replace, чтобы «Назад»
 * не превращалась в отмену последнего фильтра.
 */
export function MobileFilters({ facets, activeCount }: { facets: Facets; activeCount: number }) {
  const t = useTranslations('Catalog.filters')
  const sheet = useSheetLayers()
  // Актуальный query шторки: пишется в момент фактического изменения URL.
  // Захватывать его в рендере нельзя — «Назад» успевает откатить адрес раньше,
  // чем перерисуется компонент, и в ref попадал бы уже сброшенный URL.
  const sheetQuery = useRef<string | null>(null)
  const rememberQuery = (search: string) => {
    sheetQuery.current = search
  }
  const { query, toggleInList, resetAll } = useCatalogQuery('replace', rememberQuery)

  const router = useRouter()
  const pathname = usePathname()

  const open = sheet.has(SHEET)
  const brandsOpen = sheet.top === BRANDS

  // «Назад» возвращает браузер к записи истории, созданной при открытии
  // шторки, — то есть к URL без фильтров, выбранных уже внутри неё.
  // Поэтому после закрытия возвращаем запомненный query: пользователь
  // остаётся с тем, что выбрал.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !open) {
      const saved = sheetQuery.current
      if (saved !== null && saved !== window.location.search) {
        // Восстановление откладываем на следующий тик: «Назад» запускает
        // переход роутера, и замена, поданная внутри него, теряется.
        const timer = setTimeout(() => router.replace(`${pathname}${saved}`), 0)
        wasOpen.current = open
        return () => clearTimeout(timer)
      }
    }
    wasOpen.current = open
  }, [open, pathname, router])

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
        onClick={() => {
          sheetQuery.current = window.location.search
          sheet.open(SHEET)
        }}
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
            onClick={sheet.closeAll}
          />

          <div className="bg-surface absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-sm">
            {/* Единственный заголовок шторки: на панели внутри он выключен,
                чтобы «FILTRE» не дублировалось. */}
            <div className="border-line flex items-center justify-between gap-3 border-b px-5 py-4">
              {brandsOpen ? (
                <button
                  type="button"
                  onClick={sheet.closeTop}
                  className="text-ink flex cursor-pointer items-center gap-2"
                  aria-label={t('close')}
                >
                  <ChevronLeft className="size-5" strokeWidth={1.6} />
                  <span className="text-section tracking-display font-light uppercase">
                    {t('brand')}
                  </span>
                </button>
              ) : (
                <span className="text-ink text-section tracking-display font-light uppercase">
                  {t('title')}
                </span>
              )}

              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={resetAll}
                  className="text-ink-muted hover:text-ink text-eyebrow tracking-label cursor-pointer uppercase transition-colors"
                >
                  {t('reset')}
                </button>
                <button type="button" onClick={sheet.closeAll} aria-label={t('close')}>
                  <X className="text-ink size-5" strokeWidth={1.6} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5">
              {brandsOpen ? (
                <div className="py-4">
                  <BrandFacet
                    brands={facets.brand}
                    selected={query.brand}
                    onToggle={(slug) => toggleInList('brand', slug)}
                    fill
                  />
                </div>
              ) : (
                <FilterPanel
                  facets={facets}
                  withHeader={false}
                  historyMode="replace"
                  onOpenBrands={() => sheet.open(BRANDS)}
                  onQueryWrite={rememberQuery}
                />
              )}
            </div>

            <div className="border-line border-t p-4">
              <button
                type="button"
                onClick={sheet.closeAll}
                className="bg-navy text-cream text-label tracking-display w-full cursor-pointer rounded-sm py-3 uppercase"
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
