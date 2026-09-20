'use client'

import { useState } from 'react'
import { downloadOrderPdf } from '@/lib/admin/downloadOrderPdf'

type RowData = { id?: string | number; orderNumber?: string | null }

/**
 * Кнопка PDF прямо в строке списка заказов — по образцу `OrderCsvCell`,
 * рядом с ней. Оформление одинаковое: те же переменные темы Payload, поэтому
 * кнопка одинаково читается и в светлой, и в тёмной теме админки.
 *
 * Отличие от CSV — файла в строке нет, он запрашивается у сервера, поэтому
 * кнопка умеет показывать «…» на время сборки.
 */
export function OrderPdfCell({ rowData }: { rowData?: RowData }) {
  const [busy, setBusy] = useState(false)
  const id = rowData?.id
  if (id === undefined || id === null) return null

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async (event) => {
        event.stopPropagation()
        event.preventDefault()
        setBusy(true)
        const error = await downloadOrderPdf(id, rowData?.orderNumber)
        setBusy(false)
        if (error) window.alert(error)
      }}
      title="Скачать печатную версию заявки (PDF)"
      aria-label="Скачать печатную версию заявки (PDF)"
      style={{
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 'var(--style-radius-s)',
        background: 'transparent',
        color: 'inherit',
        cursor: busy ? 'progress' : 'pointer',
        lineHeight: 1,
        padding: '4px 8px',
        fontSize: '.8rem',
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? '…' : 'PDF'}
    </button>
  )
}
