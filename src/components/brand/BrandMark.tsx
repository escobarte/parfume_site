import type { CSSProperties } from 'react'

/**
 * Знак бренда — контур флакона (BRAND.md §4).
 * Плейсхолдер той же геометрии, что в мокапе; заменится SVG-исходником
 * от дизайнера в фазе 6 (BRAND.md §9, запрос отправлен).
 */
export function BrandMark({
  className,
  strokeWidth = 4,
  style,
}: {
  className?: string
  strokeWidth?: number
  // Инлайн-размер для контекстов без Tailwind (напр. /admin — фаза 4.7.6),
  // где className с utility-классами недоступен.
  style?: CSSProperties
}) {
  return (
    <svg viewBox="0 0 100 118" fill="none" className={className} style={style} aria-hidden="true">
      <rect
        x="44"
        y="6"
        width="12"
        height="9"
        rx="1.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
      <path d="M50 15v89M28 28h44" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M35.6 41.2A34 34 0 1 0 64.4 41.2" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  )
}

/** Силуэт флакона для пустой фото-зоны карточки товара. */
export function BottleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 120" fill="none" className={className} aria-hidden="true">
      <rect x="24" y="4" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M26 18h8v10h-8z" stroke="currentColor" strokeWidth="1.6" />
      <rect x="10" y="28" width="40" height="86" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <line x1="10" y1="88" x2="50" y2="88" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}
