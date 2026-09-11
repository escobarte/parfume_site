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

/** Список значений (slug-ов или имён файлов) через запятую или `|`. */
const pipeList = z.preprocess(
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

// Объём — «пермиссивная» строка на уровне схемы (промпт «новая модель
// объёма»): строгая сверка со списком из 5 значений происходит ПОЗЖЕ, в
// applyProducts.ts, той же стадией, что уже даёт построчные предупреждения
// для ненайденных фото (не ошибка формата, блокирующая весь файл) — опечатка
// в объёме одной строки не должна ронять прайс на 100+ позиций. Здесь схема
// только требует непустое значение.
const volumeToken = (label: string) => trimmed.min(1, `${label}: обязателен`)

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
  // Страна-производитель. Как и volume — «пермиссивная» строка на уровне
  // схемы, строгая сверка со списком (uae / europe / usa) происходит в
  // applyProducts.ts: неизвестное значение не должно ронять весь файл, оно
  // уходит предупреждением в отчёт, а товар импортируется со старым
  // (для нового — дефолтным) значением поля.
  country_of_origin: trimmed.optional(),
  // Раздел каталога (perfume / bodyCare) — ровно та же «пермиссивная» строка
  // на уровне схемы и та же строгая сверка в applyProducts.ts, что и у
  // country_of_origin: списки короткие, опечатка в одной ячейке не должна
  // ронять весь файл. Не путать с колонкой `categories` ниже — та про
  // таксономию (коллекция Categories), а эта про поле Products.productCategory.
  product_category: trimmed.optional(),
  categories: pipeList,
  notes: pipeList,
  notes_top: pipeList,
  notes_heart: pipeList,
  notes_base: pipeList,
  gender: optionalEnum(GENDER_VALUES, 'gender'),
  // Семейство/группа — свободный локализованный текст (ПРОМПТ 12 v2), три
  // колонки за один прогон, тем же принципом, что description_ro/ru/en:
  // каждая непустая ячейка пишется в свою локаль независимо от --locale.
  family_ro: trimmed.optional(),
  family_ru: trimmed.optional(),
  family_en: trimmed.optional(),
  // Имена файлов из медиатеки (загружаются отдельно, ZIP-архивом через
  // /admin/catalog-import) через `|`, порядок = порядок в галерее товара,
  // первое имя — обложка. Пустая ячейка не трогает уже привязанные фото —
  // заменяет их только непустой список (см. applyProducts.ts).
  images: pipeList,
  description: trimmed.optional(),
  // Мультиязычные колонки описания — опциональная альтернатива одиночной
  // description: если хоть одна заполнена, каждая локаль пишется отдельно
  // за один прогон, независимо от --locale (см. applyProducts.ts).
  description_ro: trimmed.optional(),
  description_ru: trimmed.optional(),
  description_en: trimmed.optional(),
  is_new: boolFrom,
  is_hit: boolFrom,
}

/** Формат A: одна строка = один вариант, группировка по handle. */
export const formatARow = z.object({
  ...productBase,
  volume: volumeToken('volume'),
  sku: trimmed.min(1, 'sku: обязателен'),
  price: numberFrom('price'),
  old_price: optionalNumber('old_price'),
  stock: optionalNumber('stock'),
  is_active: boolFrom,
  // Фото именно этого варианта — ОДНО имя файла, уже загруженного в Media
  // (как и images, импортёр ничего не скачивает). Пустая ячейка или
  // ненайденное имя — вариант остаётся без своего фото, на витрине
  // подставится первое фото товара; и то и другое уходит в отчёт.
  variant_image: trimmed.optional(),
})

export type FormatARow = z.infer<typeof formatARow>

export const variantJson = z.object({
  volume: volumeToken('variants[].volume'),
  sku: z.string().min(1, 'variants[].sku: обязателен'),
  price: z.number().nonnegative('variants[].price: ожидается число ≥ 0'),
  oldPrice: z.number().nonnegative().optional(),
  stock: z.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
  // Аналог колонки variant_image формата A — имя файла из медиатеки.
  // Форматы не должны расходиться по возможностям.
  image: z.string().optional(),
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

/** Переводы: одна строка = один язык одного товара. Title общий на все локали, здесь не переводится. */
export const translationRow = z.object({
  handle: trimmed.min(1, 'handle: обязателен'),
  locale: z.enum(['ro', 'ru', 'en'], { error: 'locale: допустимо ro / ru / en' }),
  description: trimmed.optional(),
})

export type TranslationRow = z.infer<typeof translationRow>
