'use client'

import { useAuth, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useState } from 'react'

/**
 * Карточка заказа: статус трёх каналов уведомления (письмо менеджеру,
 * письмо клиенту, Telegram) + кнопка «Отправить письма заново» — только
 * для роли admin (2026-11-17, потеря письма MF-261115-6ZLS).
 *
 * Заменяет собой стандартную форму группы `notifyStatus` целиком
 * (`admin.components.Field` на самой группе в Orders.ts) — три readOnly
 * select'а выглядели бы не нагляднее голого текста, а кнопке всё равно
 * нужно было отдельное место рядом.
 */

type ChannelKey = 'emailManager' | 'emailCustomer' | 'telegram'

const CHANNEL_LABEL: Record<ChannelKey, string> = {
  emailManager: 'Письмо менеджеру',
  emailCustomer: 'Письмо клиенту',
  telegram: 'Telegram',
}

const STATUS_LABEL: Record<string, string> = {
  sent: 'Отправлено',
  failed: 'Не отправлено',
  skipped: 'Пропущено',
}

// Цвета — только переменные tokens.css (как у OrderStatusCell), заведены
// специально под эти три значения — хардкода hex здесь нет.
const STATUS_COLOR_VAR: Record<string, string> = {
  sent: 'var(--color-notify-sent)',
  failed: 'var(--color-notify-failed)',
  skipped: 'var(--color-notify-skipped)',
}

function Badge({ channel, status, attempts, lastError }: {
  channel: ChannelKey
  status?: string | null
  attempts?: number | null
  lastError?: string | null
}) {
  const value = status ?? null
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', marginBottom: '.4rem' }}>
      <span
        style={{
          display: 'inline-block',
          minWidth: '6.5rem',
          textAlign: 'center',
          background: value ? (STATUS_COLOR_VAR[value] ?? 'var(--theme-elevation-400)') : 'var(--theme-elevation-150)',
          color: value ? '#fff' : 'var(--theme-elevation-600)',
          borderRadius: 'var(--style-radius-s)',
          padding: '2px 9px',
          fontSize: '.75rem',
          lineHeight: 1.6,
          whiteSpace: 'nowrap',
        }}
      >
        {value ? STATUS_LABEL[value] ?? value : 'Ещё не отправлялось'}
      </span>
      <span style={{ fontSize: '.8rem', paddingTop: '2px' }}>
        {CHANNEL_LABEL[channel]}
        {typeof attempts === 'number' && attempts > 1 ? ` · попыток: ${attempts}` : ''}
        {value === 'failed' && lastError ? (
          <span style={{ display: 'block', color: 'var(--theme-error-500)', fontSize: '.75rem' }}>
            {lastError}
          </span>
        ) : null}
      </span>
    </div>
  )
}

export function OrderNotifyStatusField() {
  const { id } = useDocumentInfo()
  const { user } = useAuth()
  const isAdmin = (user as { role?: string } | null)?.role === 'admin'

  const channels = useFormFields(([fields]) => ({
    emailManager: {
      status: fields?.['notifyStatus.emailManager.status']?.value as string | undefined,
      attempts: fields?.['notifyStatus.emailManager.attempts']?.value as number | undefined,
      lastError: fields?.['notifyStatus.emailManager.lastError']?.value as string | undefined,
    },
    emailCustomer: {
      status: fields?.['notifyStatus.emailCustomer.status']?.value as string | undefined,
      attempts: fields?.['notifyStatus.emailCustomer.attempts']?.value as number | undefined,
      lastError: fields?.['notifyStatus.emailCustomer.lastError']?.value as string | undefined,
    },
    telegram: {
      status: fields?.['notifyStatus.telegram.status']?.value as string | undefined,
      attempts: fields?.['notifyStatus.telegram.attempts']?.value as number | undefined,
      lastError: fields?.['notifyStatus.telegram.lastError']?.value as string | undefined,
    },
  }))

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const resend = async () => {
    if (!id) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch(`/api/orders/${id}/resend-notifications`, { method: 'POST' })
      const data = (await response.json().catch(() => null)) as
        | { ok: boolean; retried?: ChannelKey[] | ('telegram' | 'email' | 'customerEmail')[] }
        | null
      if (!response.ok || !data?.ok) {
        setError(`Сервер ответил ${response.status} — не удалось отправить.`)
        return
      }
      if (!data.retried || data.retried.length === 0) {
        setMessage('Отправлять было нечего — все каналы уже доставлены.')
      } else {
        setMessage('Повторная отправка выполнена. Обновляю карточку…')
        setTimeout(() => window.location.reload(), 1200)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить запрос.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="field-type" style={{ marginBottom: '1.5rem' }}>
      <Badge channel="emailManager" {...channels.emailManager} />
      <Badge channel="emailCustomer" {...channels.emailCustomer} />
      <Badge channel="telegram" {...channels.telegram} />

      {id && isAdmin ? (
        <button
          type="button"
          onClick={resend}
          disabled={busy}
          className="btn btn--style-secondary btn--size-small"
          style={{ marginTop: '.5rem' }}
        >
          {busy ? 'Отправляю…' : 'Отправить письма заново'}
        </button>
      ) : null}

      {message ? (
        <p style={{ margin: '.4rem 0 0', fontSize: '.8rem', color: 'var(--theme-success-500)' }}>{message}</p>
      ) : null}
      {error ? (
        <p style={{ margin: '.4rem 0 0', fontSize: '.8rem', color: 'var(--theme-error-500)' }}>{error}</p>
      ) : null}
    </div>
  )
}
