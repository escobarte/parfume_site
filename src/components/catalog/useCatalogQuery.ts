'use client'

import { useQueryStates } from 'nuqs'
import { catalogSearchParams } from '@/lib/catalog/searchParams'

/**
 * Единая точка правки состояния каталога. `shallow: false` обязателен —
 * выдачу считает сервер, поэтому смена фильтра должна дойти до RSC.
 * Любое изменение фильтра сбрасывает «показать ещё» на первую страницу.
 */
export function useCatalogQuery() {
  const [query, setQuery] = useQueryStates(catalogSearchParams, {
    shallow: false,
    history: 'push',
    clearOnDefault: true,
  })

  const toggleInList = <T extends string | number>(
    key: 'brand' | 'gender' | 'notes' | 'volume' | 'flags',
    value: T,
  ) => {
    const current = query[key] as T[]
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]
    setQuery({ [key]: next.length ? next : null, page: null } as never)
  }

  const resetAll = () =>
    setQuery({
      brand: null,
      gender: null,
      notes: null,
      volume: null,
      flags: null,
      priceMin: null,
      priceMax: null,
      page: null,
    })

  return { query, setQuery, toggleInList, resetAll }
}
