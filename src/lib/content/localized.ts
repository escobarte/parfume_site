import { routing } from '@/i18n/routing'

/**
 * Общий резолвер localized-полей, прочитанных с `locale: 'all'`.
 *
 * **Зачем он вообще нужен.** Встроенный `fallback: true` Payload умеет ровно
 * одно: «пусто в текущей локали → значение ДЕФОЛТНОЙ локали (ro)». Если
 * клиент заполнил только английскую версию, румынская и русская останутся
 * пустыми — фоллбэку нечего подставить. Правило проекта другое:
 * **текущая локаль → ro → ru → en → стандартная строка из messages**, то есть
 * «хоть одна заполненная локаль применяется ко всем». Отсюда чтение всех
 * локалей разом (`findGlobal({ locale: 'all' })`) и выбор своими руками.
 *
 * Модуль выделен из `heroBanners.ts` (2026-09-19, редизайн попапа), чтобы
 * одна и та же логика обслуживала и баннеры главной, и попап «первая
 * скидка». Поведение баннеров при выделении не менялось: `localeOrder` и
 * `pickLocalized` переехали как есть и по-прежнему реэкспортируются из
 * `heroBanners.ts` для существующих импортов.
 */

/** Порядок поиска значения: текущая локаль → дефолтная (ro) → остальные по конфигу. */
export const localeOrder = (locale: string): string[] => [
  ...new Set([locale, routing.defaultLocale, ...routing.locales]),
]

const isLocaleMap = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) &&
  typeof value === 'object' &&
  Object.keys(value as object).length > 0 &&
  Object.keys(value as object).every((key) => (routing.locales as readonly string[]).includes(key))

/**
 * Значение localized-поля из документа, прочитанного с `locale: 'all'`
 * (`{ ro, ru, en }`): первая непустая локаль в заданном порядке. Нелокальное
 * значение (строка, объект документа) возвращается как есть.
 *
 * «Пусто» здесь — `null` / `undefined` / `''`. Строку из одних пробелов эта
 * функция пустой НЕ считает: для текстов есть `pickLocalizedText`, а менять
 * общее поведение значило бы менять и баннеры.
 */
export function pickLocalized<T>(value: unknown, order: string[]): T | null {
  if (!isLocaleMap(value)) return (value ?? null) as T | null
  for (const locale of order) {
    const candidate = value[locale]
    if (candidate !== null && candidate !== undefined && candidate !== '') return candidate as T
  }
  return null
}

/**
 * То же, что `pickLocalized`, но для редакторских текстов: строка из одних
 * пробелов считается пустой и пропускается дальше по цепочке. Возвращается
 * всегда обрезанная строка либо `null` — «подставляй стандартный текст».
 */
export function pickLocalizedText(value: unknown, order: string[]): string | null {
  const trimmed = (candidate: unknown): string | null =>
    typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null

  if (!isLocaleMap(value)) return trimmed(value)
  for (const locale of order) {
    const text = trimmed(value[locale])
    if (text) return text
  }
  return null
}

/** Картинка, готовая к рендеру: размеры обязательны — их требует next/image. */
export type ResolvedImage = { url: string; width: number; height: number; alt: string }

type MediaLike = { url?: string | null; width?: number | null; height?: number | null; alt?: unknown }

/**
 * Localized upload → картинка для рендера. Фолбэк по локалям — тот же, что у
 * текстов.
 *
 * `alt` берётся по цепочке «alt поля рядом с картинкой → alt самого файла в
 * медиатеке → пустая строка»: подпись у поля точнее, но если её не заполнили,
 * общая подпись файла всё же лучше пустой.
 *
 * `fallbackSize` нужен файлам без размеров (SVG): `width`/`height` у
 * next/image обязательны, а `null` в них уронил бы рендер. `null` на выходе —
 * картинки нет ни в одной локали либо она не развёрнута (голый id при
 * `depth: 0` — рендерить нечего).
 */
export function pickLocalizedImage(
  value: unknown,
  altValue: unknown,
  order: string[],
  fallbackSize: { width: number; height: number },
): ResolvedImage | null {
  const media = pickLocalized<MediaLike | number>(value, order)
  if (!media || typeof media !== 'object' || !media.url) return null
  return {
    url: media.url,
    width: media.width || fallbackSize.width,
    height: media.height || fallbackSize.height,
    alt: pickLocalizedText(altValue, order) ?? pickLocalizedText(media.alt, order) ?? '',
  }
}
