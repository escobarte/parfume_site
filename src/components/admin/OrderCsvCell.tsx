'use client'

import { downloadCsv } from '@/lib/admin/downloadCsv'

type RowData = { exportCsv?: string | null; orderNumber?: string | null }

/**
 * Кнопка CSV прямо в строке списка заказов (фаза 4.7.4), рядом с номером —
 * тот же файл, что и кнопка в карточке заявки (OrderCsvField), но без
 * перехода в документ: exportCsv уже пришёл вместе со строкой списка.
 */
export function OrderCsvCell({ rowData }: { rowData?: RowData }) {
  const csv = rowData?.exportCsv
  if (!csv) return null

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        event.preventDefault()
        downloadCsv(csv, `${rowData?.orderNumber ?? 'order'}.csv`)
      }}
      title="Скачать CSV заявки"
      aria-label="Скачать CSV заявки"
      style={{
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 'var(--style-radius-s)',
        background: 'transparent',
        cursor: 'pointer',
        lineHeight: 1,
        padding: '4px 8px',
        fontSize: '.8rem',
      }}
    >
      CSV
    </button>
  )
}
