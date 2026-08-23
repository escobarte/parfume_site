'use client'

import { useRef, useState } from 'react'
import { ReportPanel, type ReportStatus } from './ReportPanel'

type ImportResponse = {
  ok: boolean
  dryRun: boolean
  reportText: string
  plan?: {
    create?: string[]
    update?: string[]
    images?: { missing?: unknown[] }
    skipped?: unknown[]
  }
}

/**
 * Шапка отчёта CSV-импорта. Главное, что должно считываться первым (баг
 * приёмки 2026-08-23): записано ли что-то в боевую базу или это была
 * проверка — владелец принял успешный реальный импорт за dry-run, потому
 * что отчёты выглядели одинаково. Поэтому режим — в заголовке и в цвете,
 * а не строкой «Режим:» в середине текста.
 *
 * Замечания (ненайденные фото, пропущенные строки) поднимают статус до
 * warning: раньше они тонули в общем сером блоке.
 */
function importReportView(response: ImportResponse): {
  status: ReportStatus
  title: string
  note: string
} {
  if (!response.ok) {
    return {
      status: 'error',
      title: 'Импорт не выполнен',
      note: 'В базу не записано ничего — файл применяется целиком или никак. Исправьте ошибки ниже и прогоните проверку заново.',
    }
  }

  const plan = response.plan
  const created = plan?.create?.length ?? 0
  const updated = plan?.update?.length ?? 0
  const missingImages = plan?.images?.missing?.length ?? 0
  const skippedRows = plan?.skipped?.length ?? 0
  const remarks = missingImages + skippedRows

  const counts = `Товаров: создать ${created}, обновить ${updated}`
  const remarksNote = remarks
    ? ` Есть замечания (${remarks}) — разберите список ниже, эти данные не применились.`
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
    note: `${counts}. Кэш витрины сброшен автоматически.${remarksNote}`,
  }
}

/**
 * Форма загрузки CSV на экране /admin/catalog-import (см. ImportView.tsx).
 * Формат файла в UI не выбирается — движок импорта (src/lib/import/) уже
 * определяет его по заголовку, тот же путь что и CLI `pnpm import`.
 */
export function ImportForm() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dryRun, setDryRun] = useState(true)
  const [locale, setLocale] = useState('ro')
  const [busy, setBusy] = useState(false)
  const [response, setResponse] = useState<ImportResponse | null>(null)
  const [networkError, setNetworkError] = useState<string | null>(null)

  const [revalidating, setRevalidating] = useState(false)
  const [revalidated, setRevalidated] = useState(false)

  const submit = async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setNetworkError('Сначала выбери CSV-файл.')
      return
    }

    setBusy(true)
    setNetworkError(null)
    setResponse(null)

    try {
      const body = new FormData()
      body.append('file', file)
      body.append('dryRun', String(dryRun))
      body.append('locale', locale)

      const res = await fetch('/api/catalog-import', { method: 'POST', body })

      let data: ImportResponse | null = null
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

  const resetCache = async () => {
    setRevalidating(true)
    setRevalidated(false)
    try {
      const res = await fetch('/api/catalog-revalidate', { method: 'POST' })
      if (res.ok) setRevalidated(true)
    } finally {
      setRevalidating(false)
    }
  }

  return (
    <div>
      <div className="field-type" style={{ marginBottom: '1rem' }}>
        <label htmlFor="import-file" style={{ display: 'block', marginBottom: '.4em' }}>
          CSV-файл
        </label>
        <input id="import-file" type="file" accept=".csv,text/csv" ref={fileInputRef} />
      </div>

      <div
        className="field-type"
        style={{ marginBottom: '1rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: '.4em' }}>
          <input type="radio" name="mode" checked={dryRun} onChange={() => setDryRun(true)} />
          Проверка (dry-run) — ничего не пишет в базу
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '.4em' }}>
          <input type="radio" name="mode" checked={!dryRun} onChange={() => setDryRun(false)} />
          Реальный импорт
        </label>
      </div>

      <div className="field-type" style={{ marginBottom: '1rem' }}>
        <label htmlFor="import-locale" style={{ display: 'block', marginBottom: '.4em' }}>
          Локаль контента
        </label>
        <select
          id="import-locale"
          value={locale}
          onChange={(event) => setLocale(event.target.value)}
          style={{ maxWidth: '10rem' }}
        >
          <option value="ro">RO</option>
          <option value="ru">RU</option>
          <option value="en">EN</option>
        </select>
        <p style={{ marginTop: '.4em', fontSize: '.8rem', color: 'var(--theme-elevation-600)' }}>
          На описания больше не влияет. Если в файле одна колонка <code>description</code>, её
          текст попадёт сразу во все языки, где описание пустое (готовые переводы не затираются) —
          потом их нужно отредактировать вручную. Если есть колонки <code>description_ro</code>/
          <code>description_ru</code>/<code>description_en</code>, язык берётся из самой колонки.
          Названия товаров не переводятся — они всегда общие. Выбор используется только для
          названий брендов, категорий и нот, которые импорт заводит автоматически.
        </p>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="btn btn--style-primary"
      >
        {busy ? 'Выполняю…' : dryRun ? 'Проверить' : 'Импортировать'}
      </button>

      {!dryRun && (
        <p style={{ marginTop: '.5rem', fontSize: '.8rem', color: 'var(--color-danger)' }}>
          Реальный импорт пишет изменения в боевую базу. Сначала стоит запустить проверку (dry-run).
        </p>
      )}

      {networkError && (
        <p style={{ marginTop: '1rem', color: 'var(--color-danger)' }}>{networkError}</p>
      )}

      {response &&
        (() => {
          const view = importReportView(response)
          return (
            <ReportPanel
              status={view.status}
              title={view.title}
              note={view.note}
              text={response.reportText}
            />
          )
        })()}

      <hr
        style={{
          margin: '2rem 0',
          border: 'none',
          borderTop: '1px solid var(--theme-elevation-150)',
        }}
      />

      <h2 style={{ marginBottom: '.5rem', fontSize: '1rem' }}>Сброс кэша витрины</h2>
      <p style={{ color: 'var(--theme-elevation-600)', marginBottom: '.75rem', fontSize: '.85rem' }}>
        После реального импорта выше кэш сбрасывается автоматически. Эта кнопка — для случаев
        импорта через терминал сервера (CLI) или ручной правки данных напрямую в базе.
      </p>
      <button
        type="button"
        onClick={resetCache}
        disabled={revalidating}
        className="btn btn--style-secondary btn--size-small"
      >
        {revalidating ? 'Сбрасываю…' : 'Сбросить кэш витрины'}
      </button>
      {revalidated && (
        <span style={{ marginLeft: '.75rem', color: 'var(--theme-success-500)' }}>
          ✔ Кэш сброшен
        </span>
      )}
    </div>
  )
}
