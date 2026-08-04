import { z } from 'zod'

/**
 * Схемы CSV-импорта (PLAN.md §4.3 / ТЗ §4.7).
 * Все поля приходят строками — приведение типов делают препроцессоры.
 */

const trimmed = z.string().trim()

const toNumber = (value: unknown) => {
  if (typeof value !== 'string') return value
  const normalized = value.replace(/\s/g, '').replace(',', '.')
  return normalized === '' ? undefined : Number(normalized)
}

const number = (label: string) =>
  z.number({ error: `${label}: ожидается число` }).nonnegative(`${label}: не может быть меньше 0`)

const numberFrom = (label: string) => z.preprocess(toNumber, number(label))

// .optional() должен стоять ВНУТРИ preprocess: пустая ячейка приходит как '',
// а не как undefined, и внешний .optional() её не пропустил бы.
const optionalNumber = (label: string) => z.preprocess(toNumber, number(label).optional())

const boolFrom = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  const normalized = value.trim().toLowerCase()
  if (normalized === '') return undefined
  return ['1', 'true', 'yes', 'да', 'y', 'x'].includes(normalized)
}, z.boolean().optional())

/** Список slug-ов через запятую или `|`. */
const slugList = z.preprocess(
  (value) =>
    typeof value === 'string'
      ? value
          .split(/[|,]/)
          .map((item) => item.trim())
          .filter(Boolean)
      : value,
  z.array(z.string()).optional(),
)

export const GENDER_VALUES = ['female', 'male', 'unisex'] as const
export const FAMILY_VALUES = ['floral', 'woody', 'oriental', 'fresh', 'fougere', 'chypre'] as const

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T, label: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.enum(values, { error: `${label}: допустимо ${values.join(' / ')}` }).optional(),
  )

/** Общая часть товара — одинакова для форматов A и B. */
const productBase = {
  handle: trimmed.min(1, 'handle: обязателен'),
  slug: trimmed.optional(),
  title: trimmed.min(1, 'title: обязателен'),
  brand: trimmed.min(1, 'brand: обязателен (slug бренда)'),
  categories: slugList,
  notes: slugList,
  notes_top: slugList,
  notes_heart: slugList,
  notes_base: slugList,
  gender: optionalEnum(GENDER_VALUES, 'gender'),
  family: optionalEnum(FAMILY_VALUES, 'family'),
  description: trimmed.optional(),
  is_new: boolFrom,
  is_hit: boolFrom,
  is_sale: boolFrom,
}

/** Формат A: одна строка = один вариант, группировка по handle. */
export const formatARow = z.object({
  ...productBase,
  volume: numberFrom('volume'),
  sku: trimmed.min(1, 'sku: обязателен'),
  price: numberFrom('price'),
  old_price: optionalNumber('old_price'),
  stock: optionalNumber('stock'),
  is_active: boolFrom,
})

export type FormatARow = z.infer<typeof formatARow>

export const variantJson = z.object({
  volume: z.number().positive('variants[].volume: ожидается число > 0'),
  sku: z.string().min(1, 'variants[].sku: обязателен'),
  price: z.number().nonnegative('variants[].price: ожидается число ≥ 0'),
  oldPrice: z.number().nonnegative().optional(),
  stock: z.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
})

/** Формат B: варианты одной JSON-колонкой. */
export const formatBRow = z.object({
  ...productBase,
  variants: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    },
    z.array(variantJson).min(1, 'variants: нужен непустой JSON-массив'),
  ),
})

export type FormatBRow = z.infer<typeof formatBRow>

/** Лёгкий прайс: обновление цен и остатков по sku. */
export const priceRow = z.object({
  sku: trimmed.min(1, 'sku: обязателен'),
  price: optionalNumber('price'),
  stock: optionalNumber('stock'),
})

export type PriceRow = z.infer<typeof priceRow>

/** Переводы: одна строка = один язык одного товара. */
export const translationRow = z.object({
  handle: trimmed.min(1, 'handle: обязателен'),
  locale: z.enum(['ro', 'ru', 'en'], { error: 'locale: допустимо ro / ru / en' }),
  title: trimmed.optional(),
  description: trimmed.optional(),
})

export type TranslationRow = z.infer<typeof translationRow>
