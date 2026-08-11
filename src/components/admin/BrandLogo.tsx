import { BrandMark } from '@/components/brand/BrandMark'

/** Лого MON FLACON на экране входа в /admin (фаза 4.7.6) — тот же знак, что в шапке витрины. */
export function BrandLogo() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '.75rem',
        color: 'var(--color-navy)',
      }}
    >
      <BrandMark strokeWidth={5} style={{ width: '2.75rem', height: '2.75rem' }} />
      <span
        style={{
          fontSize: '.9rem',
          fontWeight: 300,
          letterSpacing: '.3em',
          textTransform: 'uppercase',
        }}
      >
        Mon Flacon
      </span>
    </div>
  )
}
