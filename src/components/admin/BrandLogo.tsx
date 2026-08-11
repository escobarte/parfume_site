import { BrandMark } from '@/components/brand/BrandMark'

/**
 * Лого MON FLACON на экране входа в /admin (фаза 4.7.6, багфикс — фаза 4.7
 * приёмка) — тот же знак, что в шапке витрины. Цвет — не хардкод navy (на
 * тёмной теме логина такой текст почти не читался, navy на почти-чёрном),
 * а тема-зависимый класс `.brand-logo` (custom.scss): navy на светлой,
 * cream на тёмной — те же переменные tokens.css, просто выбор зависит от
 * `data-theme`, который сам Payload ставит на `<html>`.
 */
export function BrandLogo() {
  return (
    <div
      className="brand-logo"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '.75rem',
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
