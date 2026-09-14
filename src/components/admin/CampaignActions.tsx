'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useState } from 'react'

/**
 * Кнопки «Запустить» / «Остановить» в карточке кампании скидок.
 *
 * Кнопка одна и та же по месту, но какая именно — зависит от статуса:
 * черновик запускают, идущую кампанию останавливают, у завершённой кнопок
 * нет вовсе. Статус читается из формы (`useFormFields`), а не из пропсов —
 * после перезагрузки страницы по завершении операции он обновляется сам.
 *
 * Экран специально не делался отдельным (в отличие от /admin/catalog-import):
 * список кампаний, создание и карточка — это штатные view коллекции
 * `discount-campaigns`, дублировать их своим экраном значило бы писать
 * второй CRUD ради двух кнопок.
 */

type CampaignResult = {
  ok: boolean
  message?: string
  affectedProducts?: number
  affectedVariants?: number
  revertedProducts?: number
  revertedVariants?: number
  skipped?: { productId: number; title: string; reason: string }[]
  conflicts?: { sku?: string | null; reason?: string | null }[]
}

const CONFLICT_LABEL: Record<string, string> = {
  price_changed: 'цену поменяли извне',
  variant_missing: 'вариант исчез',
  blocked_by_consistency: 'откат заблокирован правилом «скидка на всех вариантах сразу»',
}

const panelStyle = (tone: 'ok' | 'warn' | 'error'): React.CSSProperties => ({
  marginTop: '.75rem',
  padding: '.75rem',
  borderRadius: '3px',
  border: '1px solid var(--theme-elevation-150)',
  borderLeft: `3px solid ${
    tone === 'error'
      ? 'var(--color-danger)'
      : tone === 'warn'
        ? 'var(--theme-warning-500, #b7791f)'
        : 'var(--theme-success-500)'
  }`,
  background: 'var(--theme-elevation-50)',
  fontSize: '.85rem',
})

export function CampaignActions() {
  const { id } = useDocumentInfo()
  const status = useFormFields(([fields]) => fields?.status?.value as string | undefined)

  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CampaignResult | null>(null)
  const [networkError, setNetworkError] = useState<string | null>(null)

  if (!id) {
    return (
      <div className="field-type" style={{ marginBottom: '1.5rem' }}>
        <p style={{ margin: 0, fontSize: '.8rem', color: 'var(--theme-elevation-600)' }}>
          Сохраните кампанию — кнопка «Запустить» появится в карточке после этого.
        </p>
      </div>
    )
  }

  const run = async (action: 'start' | 'stop') => {
    setBusy(true)
    setNetworkError(null)
    setResult(null)
    try {
      const response = await fetch(`/api/campaign-${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      let data: CampaignResult | null = null
      try {
        data = (await response.json()) as CampaignResult
      } catch {
        // не JSON — например 403 Forbidden обычным текстом
      }
      if (!data) {
        setNetworkError(`Сервер ответил ${response.status} — проверьте права доступа.`)
        return
      }
      setResult(data)
      // Перечитываем документ: статус, журнал и конфликты изменились на
      // сервере, а форма о них не знает. Своей перерисовкой полей тут не
      // обойтись — обновились массивы, которых в форме десятки строк.
      if (data.ok) setTimeout(() => window.location.reload(), 1200)
    } catch (error) {
      setNetworkError(error instanceof Error ? error.message : 'Не удалось выполнить запрос.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="field-type" style={{ marginBottom: '1.5rem' }}>
      {status === 'draft' && (
        <>
          <button
            type="button"
            onClick={() => run('start')}
            disabled={busy}
            className="btn btn--style-primary"
          >
            {busy ? 'Запускаю…' : 'Запустить кампанию'}
          </button>
          <p style={{ margin: '.4rem 0 0', fontSize: '.8rem', color: 'var(--color-danger)' }}>
            Сразу меняет цены в каталоге. Сохраните отбор и процент до запуска — после старта их
            изменить нельзя, иначе откат вернёт не то.
          </p>
        </>
      )}

      {status === 'active' && (
        <>
          <button
            type="button"
            onClick={() => run('stop')}
            disabled={busy}
            className="btn btn--style-secondary"
          >
            {busy ? 'Останавливаю…' : 'Остановить и вернуть цены'}
          </button>
          <p style={{ margin: '.4rem 0 0', fontSize: '.8rem', color: 'var(--theme-elevation-600)' }}>
            Вернёт цены по журналу. Варианты, цену которых поменяли вручную или импортом за время
            кампании, останутся как есть и попадут в список конфликтов ниже.
          </p>
        </>
      )}

      {status === 'finished' && (
        <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--theme-elevation-600)' }}>
          Кампания завершена. Запустить её повторно нельзя — создайте новую: журнал уже
          израсходован, и второй откат вернул бы цены к состоянию, которого давно нет.
        </p>
      )}

      {networkError && (
        <p style={{ marginTop: '.75rem', color: 'var(--color-danger)' }}>{networkError}</p>
      )}

      {result && !result.ok && (
        <div style={panelStyle('error')}>
          <strong>Не выполнено.</strong> {result.message}
        </div>
      )}

      {result?.ok && (
        <div style={panelStyle(result.skipped?.length || result.conflicts?.length ? 'warn' : 'ok')}>
          {typeof result.affectedProducts === 'number' ? (
            <div>
              <strong>Кампания запущена.</strong> Товаров: {result.affectedProducts}, вариантов:{' '}
              {result.affectedVariants}. Кэш витрины сброшен.
            </div>
          ) : (
            <div>
              <strong>Кампания остановлена.</strong> Откачено товаров: {result.revertedProducts},
              вариантов: {result.revertedVariants}. Кэш витрины сброшен.
            </div>
          )}

          {!!result.skipped?.length && (
            <div style={{ marginTop: '.5rem' }}>
              Пропущено товаров: {result.skipped.length} — кампания к ним не применилась.
              <ul style={{ margin: '.25rem 0 0', paddingLeft: '1.1rem' }}>
                {result.skipped.map((item) => (
                  <li key={item.productId}>
                    {item.title} — {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!!result.conflicts?.length && (
            <div style={{ marginTop: '.5rem' }}>
              Не откачено вариантов: {result.conflicts.length} — цены оставлены как есть.
              <ul style={{ margin: '.25rem 0 0', paddingLeft: '1.1rem' }}>
                {result.conflicts.map((conflict, index) => (
                  <li key={`${conflict.sku}-${index}`}>
                    {conflict.sku} — {CONFLICT_LABEL[conflict.reason ?? ''] ?? conflict.reason}
                  </li>
                ))}
              </ul>
              Полный список с ценами — в поле «Конфликты при остановке» ниже.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
