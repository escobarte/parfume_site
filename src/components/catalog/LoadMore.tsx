'use client'

import { useTranslations } from 'next-intl'
import { useCatalogQuery } from './useCatalogQuery'

/**
 * «Показать ещё» просто увеличивает page в URL: сервер отдаёт page × 24
 * товара одним куском, поэтому дублей нет, а ссылка воспроизводит ровно
 * тот же экран.
 */
export function LoadMore({ shown, total }: { shown: number; total: number }) {
  const t = useTranslations('Catalog')
  const { query, setQuery } = useCatalogQuery()

  if (shown >= total) return null

  return (
    <button
      type="button"
      onClick={() => setQuery({ page: query.page + 1 })}
      className="border-navy text-navy hover:bg-navy hover:text-cream text-label tracking-display cursor-pointer rounded-sm border px-8 py-3 uppercase transition-colors"
    >
      {t('loadMore')}
    </button>
  )
}
