/**
 * Бейдж скидки «−30%» (PLAN.md §4.5): заливка navy, текст cream, мелкий
 * uppercase на трекинге заголовков (--tracking-display), без теней и рамки —
 * только переменные токенов. Общий для карточки (каталог/поиск/похожие)
 * и страницы товара.
 */
export function DiscountBadge({ percent, className }: { percent: number; className?: string }) {
  return (
    <span
      className={`bg-navy text-cream text-micro tracking-display rounded-sm px-1.5 py-0.5 font-medium uppercase ${className ?? ''}`}
    >
      −{percent}%
    </span>
  )
}
