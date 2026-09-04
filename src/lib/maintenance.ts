import { hasLocale } from 'next-intl'
import { routing, type Locale } from '@/i18n/routing'

/**
 * Режим «Сайт в разработке» (фаза 9.2) — общие константы и предикаты для
 * `src/proxy.ts` (edge-рантайм мидлвари) и страницы-заглушки.
 *
 * Файл обязан оставаться рантайм-агностичным: никакого `node:crypto`,
 * `fs` и прочего Node-only — мидлварь выполняется в edge-песочнице.
 */

/** Cookie байпаса: httpOnly, хранит сам токен — сменился токен, старые cookie невалидны. */
export const MAINTENANCE_COOKIE = 'mf_preview'

/** `?preview=<MAINTENANCE_BYPASS_TOKEN>` — секретная ссылка, ставящая cookie. */
export const MAINTENANCE_BYPASS_PARAM = 'preview'

/** 30 дней — приёмка клиента и владельца укладывается с запасом. */
export const MAINTENANCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

/** Внутренний путь заглушки, куда мидлварь делает rewrite (в адресной строке не появляется). */
export const MAINTENANCE_PATH = '/maintenance'

/** Заглушка включена только явной единицей — любое другое значение (и пустое) = выключено. */
export function isMaintenanceEnabled(): boolean {
  return process.env.MAINTENANCE_MODE === '1'
}

/**
 * Пустой токен при включённом режиме = байпас невозможен вообще (fail closed).
 * «Пускать всех» в этом случае — ровно та ошибка, ради которой заглушка и ставится.
 */
export function getBypassToken(): string {
  return process.env.MAINTENANCE_BYPASS_TOKEN?.trim() ?? ''
}

/** Пути, которые заглушка не закрывает никогда. */
const EXEMPT_PREFIXES = ['/admin', '/api', '/_next', '/_vercel', '/media']

/**
 * Файлы-конвенции и служебные роуты. `/opengraph-image*` — на будущее (если
 * появится штатный файл Next), реальный генератор превью этого проекта живёт
 * под локалью и ловится отдельной проверкой ниже.
 */
const EXEMPT_FILES = [
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/icon',
  '/apple-icon',
  '/opengraph-image',
]

/** Второй сегмент пути — генератор OG-превью `/{locale}/og-image` (фаза 7.1). */
const EXEMPT_SECOND_SEGMENTS = ['og-image', 'opengraph-image']

/**
 * `true` — путь отдаётся как обычно даже при включённой заглушке.
 * Часть этих путей и так не доходит до мидлвари (см. `config.matcher` в
 * `src/proxy.ts`), но список здесь самодостаточен: заглушка не должна зависеть
 * от того, что кто-то не поправит матчер.
 *
 * Отдельно важен `og-image`: превью в соцсетях собирает `facebookexternalhit`
 * без cookie байпаса — закрой его заглушкой, и картинка превью не соберётся.
 */
export function isMaintenanceExempt(pathname: string): boolean {
  if (EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true
  }
  if (EXEMPT_FILES.some((file) => pathname === file || pathname.startsWith(`${file}`))) {
    return true
  }
  return EXEMPT_SECOND_SEGMENTS.includes(pathname.split('/')[2] ?? '')
}

/**
 * Локаль по заголовку `Accept-Language`, дефолт — `ro`.
 * Разбор ручной: тянуть зависимость ради одного заголовка незачем, а
 * `@formatjs/intl-localematcher` в edge-бандл мидлвари тащить тем более.
 */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return routing.defaultLocale

  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';')
      const qParam = params.find((param) => param.trim().startsWith('q='))
      const quality = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0 }
    })
    .filter((item) => item.tag.length > 0 && item.quality > 0)
    .sort((a, b) => b.quality - a.quality)

  for (const { tag } of ranked) {
    // `*` — «любой язык», дальше по списку смотреть нечего: дефолт и так дефолт.
    if (tag === '*') break
    const base = tag.split('-')[0]
    const match = routing.locales.find((locale) => locale === base)
    if (match) return match
  }

  return routing.defaultLocale
}

/**
 * Локаль заглушки: явный префикс в пути главнее заголовка браузера — так
 * переключатель RO · RU · EN на самой заглушке работает, не выходя из режима.
 */
export function resolveMaintenanceLocale(pathname: string, acceptLanguage: string | null): Locale {
  const segment = pathname.split('/')[1]
  if (hasLocale(routing.locales, segment)) return segment
  return negotiateLocale(acceptLanguage)
}

/**
 * Сравнение секретов за постоянное время. `node:crypto.timingSafeEqual` в
 * edge-рантайме недоступен, поэтому сверяются SHA-256-дайджесты: они всегда
 * одной длины, значит цикл не утекает даже длину исходной строки.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (!a || !b) return false

  const encoder = new TextEncoder()
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ])

  const leftBytes = new Uint8Array(left)
  const rightBytes = new Uint8Array(right)
  let diff = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index]
  }

  return diff === 0
}
