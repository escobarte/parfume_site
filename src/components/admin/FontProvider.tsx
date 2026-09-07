import type { CSSProperties, ReactNode } from 'react'
import { inter } from '@/lib/fonts'

/**
 * Подключает шрифт Inter в /admin (правка дизайнера 2026-09-07 — «легче
 * читается», сейчас админка рисовалась системным шрифтом). `(payload)/
 * layout.tsx` генерируется Payload и не даёт добавить className на <html>,
 * как это делает фронтовый `[locale]/layout.tsx` (см. src/lib/fonts.ts) —
 * поэтому шрифт заводится через официальный слот `admin.components.providers`
 * (payload.config.ts), который оборачивает всё дерево admin-приложения.
 *
 * `display: contents` — обёртка не должна ничего менять в layout, нужна
 * только чтобы объявить CSS-переменную `--font-inter` (next/font) в дереве.
 *
 * Мало объявить `--font-inter` на обёртке — CSS-переменные с вложенным
 * `var()` внутри (`--font-sans`/`--font-body` из tokens.css/custom.scss)
 * вычисляются ОДИН РАЗ там, где объявлены (у `:root`), с тем, что видно
 * `--font-inter` НА :root — а там его нет (задаём его глубже, в этой
 * обёртке). Уже вычисленное там невалидное значение просто наследуется
 * вниз как есть — переопределение `--font-inter` ниже по дереву его не
 * «чинит» заново, var() не пересчитывается лениво на каждом потомке.
 * Поэтому `--font-sans`/`--font-body` переобъявлены здесь же, на этой
 * самой обёртке, где `--font-inter` уже валиден — тогда все, кто ниже по
 * дереву читает `var(--font-body)` (Payload сам вешает его на `body` и
 * `button`, наши %h1–h6 и т.п.), увидит уже верную, невредимую цепочку.
 */
const fontStyle: CSSProperties = {
  display: 'contents',
  fontFamily: 'var(--font-body)',
  // Переопределение --font-sans/--font-body — не в типах CSSProperties
  // (произвольные CSS-переменные), приводим объект типом целиком.
  ['--font-sans' as string]: 'var(--font-inter), system-ui, -apple-system, sans-serif',
  ['--font-body' as string]: 'var(--font-sans), "Helvetica Neue", helvetica, arial, sans-serif',
}

export function FontProvider({ children }: { children?: ReactNode }) {
  return (
    <div className={inter.variable} style={fontStyle}>
      {children}
    </div>
  )
}
