/**
 * Фиксированный список внутренних целей для select-полей промо-баннера и
 * акционного hero (правка фазы 4.5, п.3): клиент выбирает цель из списка
 * вместо ручного ввода пути — так исключаются 404 из-за опечатки в слаге.
 * Пути без префикса локали — префикс добавляет <Link> из '@/i18n/navigation'
 * (localePrefix: 'always'). В фазе 5, когда появится коллекция Pages, этот
 * select апгрейдится до relationship-поля на страницы (см. docs/PLAN.md §4.5.4).
 */
export const LINK_TARGETS = [
  'home',
  'catalog',
  'catalogDiscounted',
  'brands',
  'about',
  'delivery',
  'contacts',
] as const

export type LinkTarget = (typeof LINK_TARGETS)[number]

// 'brands' / 'about' / 'delivery' / 'contacts' ведут на страницы фазы 5,
// которых ещё нет — до их постройки это ожидаемый 404 (см. PLAN.md §4.5.4).
const TARGET_PATHS: Record<LinkTarget, string> = {
  home: '/',
  catalog: '/catalog',
  catalogDiscounted: '/catalog?flags=hasDiscount',
  brands: '/brands',
  about: '/about',
  delivery: '/delivery',
  contacts: '/contacts',
}

function isLinkTarget(value: string): value is LinkTarget {
  return (LINK_TARGETS as readonly string[]).includes(value)
}

/**
 * Ссылка override, если заполнена, всегда побеждает выбор из select
 * (нужна для внешних URL). Иначе — путь выбранной цели, иначе null.
 */
export function resolveLinkHref(
  target: string | null | undefined,
  override: string | null | undefined,
): string | null {
  if (override) return override
  if (target && isLinkTarget(target)) return TARGET_PATHS[target]
  return null
}
