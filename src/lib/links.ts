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
  'catalogNew',
  'brands',
  'about',
  'delivery',
  'contacts',
  'orderLookup',
] as const

export type LinkTarget = (typeof LINK_TARGETS)[number]

// TARGET_PATHS хранит путь на каждую цель без исключений (в т.ч. для целей
// ниже, которые с фазы 5.2 в админке выбираются уже не отсюда, а через
// relationship на Pages, — resolveLinkHref продолжает уметь резолвить эти
// строки напрямую, если где-то в коде передан литерал, как это делает
// Footer.tsx для orderLookup).
const TARGET_PATHS: Record<LinkTarget, string> = {
  home: '/',
  catalog: '/catalog',
  catalogDiscounted: '/catalog?flags=hasDiscount',
  catalogNew: '/catalog?flags=isNew',
  brands: '/brands',
  about: '/about',
  delivery: '/delivery',
  contacts: '/contacts',
  // Форма поиска заказа по номеру + телефону (запасной путь фазы 4.7.2) —
  // НЕ /order/[token], та требует токен и для футера не подходит.
  orderLookup: '/order',
}

/**
 * Цели, у которых с фазы 5.2 есть редактируемый контент в коллекции `Pages`
 * (О нас/Доставка/Контакты) — админ выбирает страницу через relationship,
 * а не через системный select (internalLinkFields исключает их из select-
 * опций). Значение остаётся в LINK_TARGETS/TARGET_PATHS без изменений —
 * ничего не удаляется, просто у select есть более точная альтернатива.
 * `returns` — четвёртая статическая страница фазы 5.2, но никогда не была
 * системной целью LINK_TARGETS (только прямая ссылка в футере), поэтому
 * сюда не входит.
 */
export const PAGE_BACKED_TARGETS = ['about', 'delivery', 'contacts'] as const

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

/**
 * Значение double-механизма «страница ИЛИ системная цель» (фаза 5.2,
 * апгрейд select→relationship): `page` приходит из relationship-поля на
 * `Pages` (populate ≥ depth 1 даёт объект со `slug`, иначе — голый id,
 * который сюда резолвить нечем — в таком случае возвращаем null, а не
 * гадаем путь по id).
 */
export type InternalLinkValue = {
  mode?: 'system' | 'page' | null
  target?: string | null
  page?: { slug: string } | number | string | null
  override?: string | null
}

/**
 * Страницы Pages не имеют отдельного маршрута `/pages/[slug]` — каждая
 * системная статическая страница (about/delivery/returns/contacts) живёт
 * на собственном фиксированном пути `/[locale]/{slug}` (фаза 5.2), поэтому
 * путь строится прямо из slug выбранного документа.
 */
export function resolveInternalLink(value: InternalLinkValue | null | undefined): string | null {
  if (!value) return null
  if (value.override) return value.override
  if (value.mode === 'page') {
    return value.page && typeof value.page === 'object' && 'slug' in value.page
      ? `/${value.page.slug}`
      : null
  }
  return resolveLinkHref(value.target, null)
}
