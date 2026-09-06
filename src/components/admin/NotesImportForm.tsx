'use client'

import { useRef, useState } from 'react'
import { ReportPanel, type ReportStatus } from './ReportPanel'

type NotesImportResponse = {
  ok: boolean
  dryRun: boolean
  reportText: string
  created?: string[]
  updated?: string[]
  missingImages?: unknown[]
  errors?: unknown[]
}

/**
 * Шапка отчёта — тот же принцип, что у ImportForm.tsx (режим прогона решает
 * заголовок и цвет, не текст в середине). В отличие от товарного CSV здесь
 * построчные ошибки НЕ означают «ничего не записано» — остальные строки
 * применяются как обычно (см. applyNotes.ts), поэтому даже при ошибках
 * заголовок не «Импорт не выполнен», а «выполнен, но с замечаниями».
 */
function notesReportView(response: NotesImportResponse): {
  status: ReportStatus
  title: string
  note: string
} {
  if (!response.ok) {
    return {
      status: 'error',
      title: 'Импорт не выполнен',
      note: 'Файл не обработан целиком — смотри причину ниже.',
    }
  }

  const created = response.created?.length ?? 0
  const updated = response.updated?.length ?? 0
  const missing = response.missingImages?.length ?? 0
  const errors = response.errors?.length ?? 0
  const remarks = missing + errors

  const counts = `Нот: создать ${created}, обновить ${updated}`
  const remarksNote = remarks
    ? ` Есть замечания (${remarks}) — разберите список ниже, эти строки применились не полностью или пропущены.`
    : ''

  if (response.dryRun) {
    return {
      status: remarks ? 'warning' : 'neutral',
      title: 'Проверка — в базу ничего не записано',
      note: `${counts} — так будет выглядеть боевой прогон.${remarksNote} Чтобы применить, переключите режим на «Реальный импорт».`,
    }
  }

  return {
    status: remarks ? 'warning' : 'success',
    title: 'Импорт выполнен — данные записаны в базу',
    note: `${counts}.${remarksNote}`,
  }
}

/**
 * Форма CSV-словаря нот на /admin/notes-import (см. NotesImportView.tsx).
 * Иконки грузятся отдельно, тем же блоком, что у товаров (MediaImportForm,
 * переиспользован как есть на этом же экране) — /api/media-import ничего не
 * знает про то, ноты это или товары.
 */
export function NotesImportForm() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dryRun, setDryRun] = useState(true)
  const [busy, setBusy] = useState(false)
  const [response, setResponse] = useState<NotesImportResponse | null>(null)
  const [networkError, setNetworkError] = useState<string | null>(null)

  const submit = async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setNetworkError('Сначала выбери CSV-файл со словарём нот.')
      return
    }

    setBusy(true)
    setNetworkError(null)
    setResponse(null)

    try {
      const body = new FormData()
      body.append('file', file)
      body.append('dryRun', String(dryRun))

      const res = await fetch('/api/notes-import', { method: 'POST', body })

      let data: NotesImportResponse | null = null
      try {
        data = await res.json()
      } catch {
        // не JSON — например, 403 Forbidden обычным текстом
      }

      if (!data) {
        setNetworkError(`Сервер ответил ${res.status} — попробуй ещё раз или проверь права доступа.`)
        return
      }

      setResponse(data)
    } catch (error) {
      setNetworkError(error instanceof Error ? error.message : 'Не удалось выполнить запрос.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="field-type" style={{ marginBottom: '1rem' }}>
        <label htmlFor="notes-import-file" style={{ display: 'block', marginBottom: '.4em' }}>
          CSV-файл словаря нот
        </label>
        <input id="notes-import-file" type="file" accept=".csv,text/csv" ref={fileInputRef} />
        <p style={{ marginTop: '.4em', fontSize: '.8rem', color: 'var(--theme-elevation-600)' }}>
          Колонки: <code>slug,name_ro,name_ru,name_en,group,image</code>. <code>slug</code> —
          обязателен, остальное можно заполнять не всё сразу. <code>image</code> — точное имя
          файла из архива, загруженного выше (шаг 1).
        </p>
      </div>

      <div
        className="field-type"
        style={{ marginBottom: '1rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: '.4em' }}>
          <input type="radio" name="notes-mode" checked={dryRun} onChange={() => setDryRun(true)} />
          Проверка (dry-run) — ничего не пишет в базу
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '.4em' }}>
          <input
            type="radio"
            name="notes-mode"
            checked={!dryRun}
            onChange={() => setDryRun(false)}
          />
          Реальный импорт
        </label>
      </div>

      <button type="button" onClick={submit} disabled={busy} className="btn btn--style-primary">
        {busy ? 'Выполняю…' : dryRun ? 'Проверить' : 'Импортировать'}
      </button>

      {!dryRun && (
        <p style={{ marginTop: '.5rem', fontSize: '.8rem', color: 'var(--color-danger)' }}>
          Реальный импорт пишет изменения в боевую базу. Сначала стоит запустить проверку (dry-run).
        </p>
      )}

      {networkError && <p style={{ marginTop: '1rem', color: 'var(--color-danger)' }}>{networkError}</p>}

      {response &&
        (() => {
          const view = notesReportView(response)
          return (
            <ReportPanel status={view.status} title={view.title} note={view.note} text={response.reportText} />
          )
        })()}
    </div>
  )
}
