'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useState } from 'react'
import { downloadOrderPdf } from '@/lib/admin/downloadOrderPdf'

/**
 * Кнопка «Скачать PDF» в карточке заявки — рядом с кнопкой CSV
 * (`OrderCsvField`). Файл собирается сервером по запросу, поэтому здесь, в
 * отличие от CSV, есть состояние ожидания и место под ошибку.
 */
export function OrderPdfField() {
  const { id } = useDocumentInfo()
  const orderNumber = useFormFields(
    ([fields]) => fields?.orderNumber?.value as string | undefined,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // У ещё не сохранённой заявки нет id — собирать нечего.
  if (!id) return null

  const download = async () => {
    setBusy(true)
    setError(await downloadOrderPdf(id, orderNumber))
    setBusy(false)
  }

  return (
    <div className="field-type" style={{ marginBottom: '1.5rem' }}>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="btn btn--style-secondary btn--size-small"
      >
        {busy ? 'Собираем PDF…' : 'Скачать PDF заявки'}
      </button>
      <p style={{ margin: '.25rem 0 0', fontSize: '.75rem', opacity: 0.7 }}>
        Печатная версия A4 для менеджера: позиции, суммы, контакты и адрес.
      </p>
      {error ? (
        <p style={{ margin: '.25rem 0 0', fontSize: '.75rem', color: 'var(--theme-error-500)' }}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
