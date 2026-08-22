'use client'

import { useRef, useState } from 'react'

type MediaImportResponse = {
  ok: boolean
  reportText: string
}

/**
 * Загрузка фото товаров архивом (ZIP) — отдельное действие ДО CSV-импорта
 * (см. ImportView.tsx): владелец сначала грузит фото, потом отдельно CSV
 * с колонкой images, которая подтягивает их по имени файла
 * (src/lib/import/images.ts). Никакой связи между двумя формами намеренно
 * нет — два независимых запроса, как в промпте задачи.
 */
export function MediaImportForm() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [response, setResponse] = useState<MediaImportResponse | null>(null)
  const [networkError, setNetworkError] = useState<string | null>(null)

  const submit = async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setNetworkError('Сначала выбери ZIP-архив с фото.')
      return
    }

    setBusy(true)
    setNetworkError(null)
    setResponse(null)

    try {
      const body = new FormData()
      body.append('file', file)

      const res = await fetch('/api/media-import', { method: 'POST', body })

      let data: MediaImportResponse | null = null
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
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (error) {
      setNetworkError(error instanceof Error ? error.message : 'Не удалось выполнить запрос.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="field-type" style={{ marginBottom: '1rem' }}>
        <label htmlFor="media-import-file" style={{ display: 'block', marginBottom: '.4em' }}>
          ZIP-архив с фото
        </label>
        <input
          id="media-import-file"
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          ref={fileInputRef}
        />
        <p style={{ marginTop: '.4em', fontSize: '.8rem', color: 'var(--theme-elevation-600)' }}>
          Принимаются <code>jpg</code>/<code>jpeg</code>/<code>png</code>/<code>webp</code>. Лимит —
          до 200 МБ на архив, до 8 МБ на отдельный файл. Каждый файл заводится в медиатеку штатным
          способом Payload (со всеми размерами для карточки и галереи). Файл с именем, которое уже
          есть в медиатеке, не дублируется — переиспользуется существующий. Загрузи архив здесь
          первым, потом отдельно CSV ниже с колонкой <code>images</code> — она подтягивает фото по
          точному имени файла (регистр и написание должны совпадать до буквы).
        </p>
      </div>

      <button type="button" onClick={submit} disabled={busy} className="btn btn--style-primary">
        {busy ? 'Загружаю…' : 'Загрузить архив'}
      </button>

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
    </div>
  )
}
