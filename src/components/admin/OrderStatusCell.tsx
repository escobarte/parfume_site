'use client'

// Подписи — хардкод-русский (весь admin UI проекта, CLAUDE.md); значения
// должны совпадать с ORDER_STATUSES (src/collections/Orders.ts).
const LABELS: Record<string, string> = {
  new: 'Новая',
  confirmed: 'Подтверждена',
  ready: 'Готова',
  issued: 'Выдана',
  cancelled: 'Отменена',
}

// Цвета — только переменные tokens.css (src/styles/tokens.css), заведены
// туда специально под 5 статусов (фаза 4.7.3), хардкода hex здесь нет.
const COLOR_VAR: Record<string, string> = {
  new: 'var(--color-status-new)',
  confirmed: 'var(--color-status-confirmed)',
  ready: 'var(--color-status-ready)',
  issued: 'var(--color-status-issued)',
  cancelled: 'var(--color-status-cancelled)',
}

/** Цветная плашка статуса заказа в списке заявок (фаза 4.7.3). */
export function OrderStatusCell({ cellData }: { cellData?: string }) {
  const value = cellData ?? 'new'

  return (
    <span
      style={{
        display: 'inline-block',
        background: COLOR_VAR[value] ?? 'var(--theme-elevation-400)',
        color: '#fff',
        borderRadius: 'var(--style-radius-s)',
        padding: '2px 9px',
        fontSize: '.75rem',
        lineHeight: 1.6,
        whiteSpace: 'nowrap',
      }}
    >
      {LABELS[value] ?? value}
    </span>
  )
}
