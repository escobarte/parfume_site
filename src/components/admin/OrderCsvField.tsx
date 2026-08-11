'use client'

import { useFormFields } from '@payloadcms/ui'
import { downloadCsv } from '@/lib/admin/downloadCsv'

/**
 * Кнопка «Скачать CSV» в карточке заявки.
 *
 * Файл собирается из уже сохранённого текста поля прямо в браузере — заявка
 * не зависит ни от файлового хранилища, ни от доступности почты. В тексте
 * уже есть BOM, поэтому Excel открывает кириллицу правильно.
 */
export function OrderCsvField() {
  const [csv, orderNumber] = useFormFields(([fields]) => [
    fields?.exportCsv?.value as string | undefined,
    fields?.orderNumber?.value as string | undefined,
  ])

  if (!csv) return null

  const download = () => downloadCsv(csv, `${orderNumber ?? 'order'}.csv`)

  return (
    <div className="field-type" style={{ marginBottom: '1.5rem' }}>
      <button type="button" onClick={download} className="btn btn--style-secondary btn--size-small">
        Скачать CSV заявки
      </button>
      <p style={{ margin: '.25rem 0 0', fontSize: '.75rem', opacity: 0.7 }}>
        Формат для Excel: UTF-8 с BOM, разделитель «;», одна строка — одна позиция.
      </p>
    </div>
  )
}
