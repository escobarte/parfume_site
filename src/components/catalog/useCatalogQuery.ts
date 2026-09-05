'use client'

import { useQueryStates } from 'nuqs'
import { catalogSearchParams } from '@/lib/catalog/searchParams'

/** null у ключа = «сбросить в дефолт и убрать из URL» (clearOnDefault). */
type Patch = Partial<Record<keyof typeof catalogSearchParams, unknown>>

/**
 * Единая точка правки состояния каталога. `shallow: false` обязателен —
 * выдачу считает сервер, поэтому смена фильтра должна дойти до RSC.
 * Любое изменение фильтра сбрасывает «показать ещё» на первую страницу.
 *
 * `history`: на десктопе каждый фильтр — шаг истории (можно откатить «Назад»).
 * В мобильной шторке — 'replace': там «Назад» обязана закрывать саму шторку,
 * а не откатывать по одному фильтру, и записи истории копиться не должны.
 *
 * `onWrite` вызывается после того, как URL уже обновлён. Мобильной шторке это
 * нужно, чтобы запомнить выбранные внутри неё фильтры: «Назад» вернёт браузер
 * к записи, созданной при открытии, и без этого выбор бы потерялся.
 */
export function useCatalogQuery(
  history: 'push' | 'replace' = 'push',
  onWrite?: (search: string) => void,
) {
  const [query, rawSetQuery] = useQueryStates(catalogSearchParams, {
    shallow: false,
    history,
    clearOnDefault: true,
  })

  const setQuery = (patch: Patch) => {
    const result = rawSetQuery(patch as never)
    if (onWrite) void Promise.resolve(result).then(() => onWrite(window.location.search))
    return result
  }

  const toggleInList = <T extends string | number>(
    key: 'brand' | 'gender' | 'country' | 'flags',
    value: T,
  ) => {
    const current = query[key] as T[]
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]
    setQuery({ [key]: next.length ? next : null, page: null })
  }

  const resetAll = () =>
    setQuery({
      brand: null,
      gender: null,
      country: null,
      flags: null,
      priceMin: null,
      priceMax: null,
      page: null,
    })

  return { query, setQuery, toggleInList, resetAll }
}
