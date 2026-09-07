'use client'

/**
 * Цветная плашка «В наличии/Нет в наличии» для колонки `inStock` в списках
 * Товары/Подарочные товары (правка дизайнера 2026-09-07) — раньше в этой
 * колонке был штатный `.bool-cell` Payload с сырым переводом чекбокса
 * («правда»/«ложь»). Цвета — не новые токены, переиспользованы уже
 * согласованные для admin: зелёный от статуса заказа «Выдана» (готовый
 * позитивный акцент), красный — `--color-danger` (как «Отменена»/ошибки),
 * см. OrderStatusCell.tsx и tokens.css.
 */
export function InStockCell({ cellData }: { cellData?: boolean }) {
  const inStock = Boolean(cellData)

  return (
    <span
      style={{
        display: 'inline-block',
        background: inStock ? 'var(--color-status-issued)' : 'var(--color-danger)',
        color: '#fff',
        borderRadius: 'var(--style-radius-s)',
        padding: '2px 9px',
        fontSize: '.75rem',
        lineHeight: 1.6,
        whiteSpace: 'nowrap',
      }}
    >
      {inStock ? 'В наличии' : 'Нет в наличии'}
    </span>
  )
}
