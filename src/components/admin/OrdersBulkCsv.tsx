'use client'

import { useSelection } from '@payloadcms/ui'

/**
 * Массовый CSV нескольких выбранных заявок (фаза 4.7.4) — один файл на все
 * выбранные (шапка одна, позиции + итог каждой заявки друг за другом,
 * формат как у одиночного экспорта: UTF-8 BOM, «;»). Выборка может выходить
 * за пределы текущей страницы (`allAvailable`), поэтому файл собирает
 * сервер (`GET /api/orders/bulk-csv`), а не клиент из уже отрисованных строк.
 */
export function OrdersBulkCsv() {
  const { count, getQueryParams } = useSelection()

  if (!count) return null

  // getQueryParams() уже строка вида "?where[id][in][0]=1..." — при выборе
  // «все доступные» за пределами текущей страницы она отдаёт настоящий
  // where-фильтр списка, а не только id уже отрисованных строк.
  const href = `/api/orders/bulk-csv${getQueryParams()}`

  return (
    <div style={{ margin: '0 0 var(--base)' }}>
      <a
        href={href}
        download
        className="btn btn--style-secondary btn--size-small"
        style={{ display: 'inline-block' }}
      >
        Скачать CSV выбранных ({count})
      </a>
    </div>
  )
}
