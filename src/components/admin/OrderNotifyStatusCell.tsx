'use client'

// Три мини-плашки в списке заявок: почта менеджеру / клиенту / Telegram.
// Цвета — те же токены tokens.css, что в карточке (OrderNotifyStatusField).
const DOT_COLOR_VAR: Record<string, string> = {
  sent: 'var(--color-notify-sent)',
  failed: 'var(--color-notify-failed)',
  skipped: 'var(--color-notify-skipped)',
}

const LETTER: Record<'emailManager' | 'emailCustomer' | 'telegram', string> = {
  emailManager: 'М',
  emailCustomer: 'К',
  telegram: 'TG',
}

type ChannelValue = { status?: string | null; attempts?: number | null; lastError?: string | null }
type RowData = {
  notifyStatus?: {
    emailManager?: ChannelValue
    emailCustomer?: ChannelValue
    telegram?: ChannelValue
  }
}

/**
 * Плашка в списке заявок (фаза уведомлений, 2026-11-17) — что реально ушло
 * по заявке. `ui`-поле в списке получает `rowData` целого документа (как
 * `OrderCsvCell` рядом), не `cellData` — у `notifyStatus` самого по себе
 * (`admin.hidden`) своей колонки нет.
 */
export function OrderNotifyStatusCell({ rowData }: { rowData?: RowData }) {
  const channels = (['emailManager', 'emailCustomer', 'telegram'] as const).map((key) => ({
    key,
    status: rowData?.notifyStatus?.[key]?.status ?? null,
    lastError: rowData?.notifyStatus?.[key]?.lastError ?? undefined,
  }))

  return (
    <div style={{ display: 'flex', gap: '3px' }}>
      {channels.map(({ key, status, lastError }) => (
        <span
          key={key}
          title={`${key === 'telegram' ? 'Telegram' : key === 'emailManager' ? 'Письмо менеджеру' : 'Письмо клиенту'}${
            status ? ` — ${status}` : ' — ещё не отправлялось'
          }${lastError ? `: ${lastError}` : ''}`}
          style={{
            display: 'inline-block',
            minWidth: '1.4rem',
            textAlign: 'center',
            background: status ? (DOT_COLOR_VAR[status] ?? 'var(--theme-elevation-400)') : 'var(--theme-elevation-150)',
            color: status ? '#fff' : 'var(--theme-elevation-500)',
            borderRadius: 'var(--style-radius-s)',
            padding: '1px 4px',
            fontSize: '.65rem',
            lineHeight: 1.5,
          }}
        >
          {LETTER[key]}
        </span>
      ))}
    </div>
  )
}
