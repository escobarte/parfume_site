import type { ReactNode } from 'react'

/**
 * Единое оформление блоков отчётов на /admin/catalog-import — и для загрузки
 * фото архивом (MediaImportForm), и для CSV-импорта (ImportForm). До этой
 * правки оба были одинаково невзрачно-серыми: владелец на проде не заметил
 * строки «не найдено N» и принял успешный боевой импорт за dry-run.
 *
 * Задача шапки — чтобы главное считывалось до чтения текста:
 *  1) записано ли что-то в базу (боевой прогон) или нет (проверка);
 *  2) всё ли гладко, есть ли замечания, или это ошибка.
 *
 * Цвета — переменные темы Payload (--theme-success/warning/error/elevation-*):
 * они семантические и сами адаптируются к светлой/тёмной теме админки.
 * В src/styles/tokens.css семантической пары «успех/предупреждение» нет
 * (только --color-danger и статусы заказов), поэтому бренд-токены здесь не
 * подходят — см. резюме к задаче.
 */
export type ReportStatus = 'success' | 'warning' | 'error' | 'neutral'

type Props = {
  status: ReportStatus
  /** Крупная строка: что произошло. */
  title: string
  /** Пояснение под заголовком: записано в базу или нет. */
  note?: ReactNode
  /** Текст отчёта как есть — структурный, моноширинный. */
  text: string
}

const PALETTE: Record<ReportStatus, { accent: string; bg: string; fg: string; icon: string }> = {
  success: {
    accent: 'var(--theme-success-600)',
    bg: 'var(--theme-success-50)',
    fg: 'var(--theme-success-800)',
    icon: '✔',
  },
  warning: {
    accent: 'var(--theme-warning-500)',
    bg: 'var(--theme-warning-50)',
    fg: 'var(--theme-warning-800)',
    icon: '⚠',
  },
  error: {
    accent: 'var(--theme-error-500)',
    bg: 'var(--theme-error-50)',
    fg: 'var(--theme-error-800)',
    icon: '✘',
  },
  neutral: {
    accent: 'var(--theme-elevation-400)',
    bg: 'var(--theme-elevation-50)',
    fg: 'var(--theme-elevation-800)',
    icon: 'ℹ',
  },
}

export function ReportPanel({ status, title, note, text }: Props) {
  const palette = PALETTE[status]

  return (
    <div
      style={{
        marginTop: '1.5rem',
        border: `1px solid ${palette.accent}`,
        // Полоса слева — главный различитель между состояниями: видно боковым
        // зрением, ещё до того как прочитан заголовок.
        borderInlineStartWidth: '5px',
        borderRadius: 'var(--style-radius-m)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '.6rem',
          flexWrap: 'wrap',
          padding: 'calc(var(--base) / 2) var(--base)',
          background: palette.bg,
          color: palette.fg,
          borderBottom: `1px solid ${palette.accent}`,
        }}
      >
        <span aria-hidden="true" style={{ fontSize: '1.15rem', lineHeight: 1 }}>
          {palette.icon}
        </span>
        <strong style={{ fontSize: '1.05rem', lineHeight: 1.3 }}>{title}</strong>
        {note && (
          <span style={{ fontSize: '.85rem', opacity: 0.9, width: '100%' }}>{note}</span>
        )}
      </div>

      <pre
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '.85rem',
          lineHeight: 1.5,
          margin: 0,
          padding: 'var(--base)',
          background: 'var(--theme-input-bg)',
          color: 'var(--theme-elevation-800)',
        }}
      >
        {text}
      </pre>
    </div>
  )
}
