import { unstable_cache } from 'next/cache'
import type { Locale } from '@/i18n/routing'
import { CACHE_TTL } from '@/lib/cache'
import {
  localeOrder,
  pickLocalizedImage,
  pickLocalizedText,
  type ResolvedImage,
} from '@/lib/content/localized'
import { getPayloadClient } from '@/lib/payload'
import { GLOBALS_TAG } from '@/lib/revalidate'

/**
 * Контент попапа «первая скидка» (редизайн 2026-09-19).
 *
 * Здесь собрано ВСЁ, что зависит от данных: выбор строки по цепочке локалей,
 * выбор картинки, подстановка процента. Клиентский компонент получает готовые
 * строки и только раскладывает их — иначе правило фолбэка разъехалось бы по
 * пяти местам, а процент можно было бы подменить из браузера.
 *
 * Цепочка для КАЖДОГО localized-поля (текстов и картинок):
 * **текущая локаль → ro → ru → en → стандартная строка из messages**.
 * Смысл — клиент заполняет один язык (обычно румынский), и он применяется ко
 * всем; остальные локали добавит позже. Встроенный фолбэк Payload так не
 * умеет (только «пусто → ro»), поэтому глобал читается с `locale: 'all'`.
 */

/**
 * Рекомендуемые размеры слотов — они же запасная пропорция для файла без
 * размеров (SVG).
 *
 * Десктопная 840×1200 (7:10) — компромисс, посчитанный по фактической вёрстке:
 * пропорция колонки с картинкой плавает от ~0.60 (768px, узкая карточка и
 * высокая правая колонка) до ~0.81 (1280px), потому что высоту задаёт правая
 * колонка с тремя полями. 7:10 стоит ровно между ними — на любой ширине
 * `object-cover` срезает 10–15%, и ни на одной не срезает много.
 *
 * Мобильная 1000×540 — ровно пропорция полосы над формой, обрезки нет вовсе.
 */
export const PROMO_POPUP_IMAGE_SIZE = {
  image: { width: 840, height: 1200 },
  imageMobile: { width: 1000, height: 540 },
} as const

/** Ключи текстов, у которых есть стандартное значение в `messages/<locale>.json`. */
export const PROMO_POPUP_TEXT_KEYS = [
  'title',
  'subtitle',
  'description',
  'buttonLabel',
  'footerText',
] as const

export type PromoPopupTextKey = (typeof PROMO_POPUP_TEXT_KEYS)[number]

/**
 * Кусок текста с пометкой «выделить». Нужен описанию: процент в нём по макету
 * жирный, а `dangerouslySetInnerHTML` на редакторском поле — открытая дыра,
 * поэтому строка режется по метке `{percent}` и собирается из узлов.
 */
export type TextPart = { text: string; strong: boolean }

export type PromoPopupContent = {
  percent: number
  requirePhone: boolean
  title: string
  subtitle: string
  description: TextPart[]
  buttonLabel: string
  footerText: string
  image: ResolvedImage | null
  imageMobile: ResolvedImage | null
}

/** Форма глобала, прочитанного с `locale: 'all'`, `depth: 1`. */
export type RawPromoPopupSettings = {
  isEnabled?: boolean | null
  discountPercent?: number | null
  requirePhone?: boolean | null
  title?: unknown
  subtitle?: unknown
  description?: unknown
  buttonLabel?: unknown
  footerText?: unknown
  image?: unknown
  imageAlt?: unknown
  imageMobile?: unknown
  imageMobileAlt?: unknown
}

const PLACEHOLDER = '{percent}'

/**
 * Значение метки. При нулевом/пустом проценте — пустая строка: «0%» в тексте
 * выглядит как поломка, лучше вовсе без числа. Схема глобала держит `min: 1`,
 * так что это подстраховка на правку мимо админки.
 */
const percentLabel = (percent: number): string => (percent > 0 ? `${percent}%` : '')

/** Схлопывание пробелов после выпавшей метки: «enjoy  off» → «enjoy off». */
const tidy = (text: string): string => text.replace(/\s{2,}/g, ' ').trim()

/** Подстановка метки в обычную строку. Метки нет — строка возвращается как есть. */
export const fillPercent = (text: string, percent: number): string => {
  if (!text.includes(PLACEHOLDER)) return text
  const label = percentLabel(percent)
  const filled = text.split(PLACEHOLDER).join(label)
  return label ? filled : tidy(filled)
}

/**
 * Разбор строки на узлы: всё, что стояло на месте `{percent}`, помечается
 * `strong`. Метки в строке нет — один обычный узел; процент нулевой — метка
 * просто выпадает, выделять нечего.
 */
export const splitPercent = (text: string, percent: number): TextPart[] => {
  const label = percentLabel(percent)
  if (!text.includes(PLACEHOLDER) || !label) {
    const plain = fillPercent(text, percent)
    return plain ? [{ text: plain, strong: false }] : []
  }

  const parts: TextPart[] = []
  const chunks = text.split(PLACEHOLDER)
  chunks.forEach((chunk, index) => {
    if (chunk) parts.push({ text: chunk, strong: false })
    if (index < chunks.length - 1) parts.push({ text: label, strong: true })
  })
  return parts
}

/**
 * Глобал (`locale: 'all'`) + стандартные строки локали → готовый контент.
 *
 * `defaults` — значения из `messages/<locale>.json` (namespace `PromoPopup`);
 * они подставляются последними, когда поле пусто во ВСЕХ локалях. Процент
 * подставляется ПОСЛЕ выбора строки — и в редакторский текст, и в стандартный.
 */
export function resolvePromoPopupContent(
  raw: RawPromoPopupSettings,
  locale: string,
  defaults: Record<PromoPopupTextKey, string>,
): PromoPopupContent {
  const order = localeOrder(locale)
  const percent = raw.discountPercent ?? 0
  const text = (key: PromoPopupTextKey) => pickLocalizedText(raw[key], order) ?? defaults[key]

  return {
    percent,
    // Телефон обязателен по умолчанию: поле снимается только явной галочкой.
    requirePhone: raw.requirePhone !== false,
    title: fillPercent(text('title'), percent),
    subtitle: fillPercent(text('subtitle'), percent),
    description: splitPercent(text('description'), percent),
    buttonLabel: fillPercent(text('buttonLabel'), percent),
    footerText: fillPercent(text('footerText'), percent),
    image: pickLocalizedImage(raw.image, raw.imageAlt, order, PROMO_POPUP_IMAGE_SIZE.image),
    imageMobile: pickLocalizedImage(
      raw.imageMobile,
      raw.imageMobileAlt,
      order,
      PROMO_POPUP_IMAGE_SIZE.imageMobile,
    ),
  }
}

/**
 * Сырые настройки попапа. Тот же тег кэша, что у остальных глобалов — правка
 * в `/admin` сбрасывает витрину общим хуком `afterChange`.
 *
 * `locale: 'all'` (а не конкретная локаль) — обязательное условие фолбэка «на
 * любую заполненную локаль»; `depth: 1` разворачивает картинки, иначе в полях
 * лежали бы голые id.
 */
export const getPromoPopupSettings = () =>
  unstable_cache(
    async () => {
      const payload = await getPayloadClient()
      return (await payload.findGlobal({
        slug: 'promo-popup-settings',
        locale: 'all',
        depth: 1,
      })) as RawPromoPopupSettings
    },
    ['promo-popup-settings', 'all'],
    { tags: [GLOBALS_TAG], revalidate: CACHE_TTL },
  )()

export const getPromoPopupContent = async (
  locale: Locale,
  defaults: Record<PromoPopupTextKey, string>,
): Promise<(PromoPopupContent & { isEnabled: boolean }) | null> => {
  const raw = await getPromoPopupSettings()
  if (!raw) return null
  return { ...resolvePromoPopupContent(raw, locale, defaults), isEnabled: Boolean(raw.isEnabled) }
}
