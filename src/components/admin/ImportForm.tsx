'use client'

import { useRef, useState } from 'react'

type ImportResponse = {
  ok: boolean
  dryRun: boolean
  reportText: string
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

      {response && (
        <div
          style={{
            marginTop: '1.5rem',
            padding: 'var(--base)',
            border: `1px solid ${response.ok ? 'var(--theme-elevation-150)' : 'var(--color-danger)'}`,
            borderRadius: 'var(--style-radius-m)',
            background: response.ok ? 'var(--theme-elevation-50)' : 'transparent',
          }}
        >
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '.85rem',
              margin: 0,
            }}
          >
            {response.reportText}
          </pre>
        </div>
      )}

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
