import type { ReactNode } from 'react'
import type { CatalogNavKey } from '@/lib/catalog/navSections'
import { CatalogNavColumn } from './CatalogNavColumn'

/**
 * Общая обёртка «постоянное левое меню каталога + контент справа» (ПРОМПТ
 * 13, задача 2) — переиспользуется всеми восемью пунктами меню: страницами
 * товарной сетки (`CatalogView`, когда `showCategoryNav`) и статичными
 * разделами (`gift-certificates`/`gift-box`/`brands`/`about`), у которых
 * колонки раньше не было вовсе. Разница между «товарной» и «статичной»
 * страницей — только в `children`, не в наличии самого меню.
 */
export function CatalogShell({
  activeKey,
  children,
}: {
  activeKey?: CatalogNavKey
  children: ReactNode
}) {
  return (
    <div className="mx-auto max-w-[1440px] px-5 py-10 md:px-8 md:py-12">
      <div className="lg:flex lg:items-start lg:gap-8">
        <CatalogNavColumn activeKey={activeKey} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
