import { BrandMark } from '@/components/brand/BrandMark'

/** Знак MON FLACON в шапке /admin (фаза 4.7.6) — тот же SVG, что на витрине. */
export function BrandIcon() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '2rem',
        height: '2rem',
        borderRadius: '999px',
        background: 'var(--color-navy)',
        color: 'var(--color-cream)',
      }}
    >
      <BrandMark strokeWidth={7} style={{ width: '1.1rem', height: '1.1rem' }} />
    </span>
  )
}
