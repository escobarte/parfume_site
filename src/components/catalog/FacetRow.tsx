'use client'

/** Чекбокс фасета: подпись слева, счётчик справа (без подложек, BRAND §5). */
export function FacetRow({
  label,
  count,
  checked,
  onToggle,
}: {
  label: string
  count: number
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label className="hover:text-ink flex cursor-pointer items-center justify-between gap-3 py-1.5">
      <span className="flex items-center gap-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="accent-navy size-3.5"
        />
        <span className="text-ink text-body-sm">{label}</span>
      </span>
      <span className="text-ink-subtle text-eyebrow tabular-nums">{count}</span>
    </label>
  )
}

/** Группа фасета с заголовком и линией-разделителем. */
export function FacetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-line border-b py-5 last:border-b-0">
      <h3 className="text-ink text-eyebrow tracking-display mb-3 uppercase">{title}</h3>
      {children}
    </section>
  )
}

/**
 * Счётчик рядом с подписью чипа. Отдельным приглушённым токеном и с отступом —
 * иначе «5 ml 10» читается как одно число. На залитом чипе тон берётся
 * из роли «текст на тёмном», чтобы контраст оставался брендовым.
 */
export function ChipCount({ count, onDark = false }: { count: number; onDark?: boolean }) {
  return (
    <span className={`ml-1.5 tabular-nums ${onDark ? 'text-ink-on-dark-muted' : 'text-ink-muted'}`}>
      ({count})
    </span>
  )
}
