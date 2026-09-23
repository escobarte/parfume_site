import type { Payload, PayloadRequest } from 'payload'
import type { Product } from '@/payload-types'
import { isProductVolume, PRODUCT_VOLUMES, type ProductVolume } from '@/lib/catalog/volumes'
import { discountPercent } from '@/lib/pricing'
import {
  COUNTRY_SPEC,
  PRODUCT_CATEGORY_SPEC,
  resolveScalar,
  scalarConflict,
} from './productScalars'
import { paragraphs } from '@/lib/seed/richText'
import { slugify } from '@/lib/slugify'
import { DESCRIPTION_LOCALES, type DescriptionLocale } from './detect'
import { BrandLogoApplier } from './brandLogos'
import { ImageResolver } from './images'
import { describeError } from './payloadErrors'
import { RelationResolver } from './relations'
import type { FormatARow, FormatBRow } from './schema'
import type { ImportPlan, RowError } from './types'
import type { ValidatedRow } from './validate'

type VariantInput = {
  volume: ProductVolume
  sku: string
  price: number
  /**
   * Цена до скидки. Ключ ОТСУТСТВУЕТ, если ячейка пуста — то же правило и по
   * той же причине, что у `image` ниже: варианты склеиваются по sku через
   * spread (mergeVariants), поэтому `oldPrice: null` в объекте затёр бы уже
   * сохранённую зачёркнутую цену. До 2026-09-12 так и было: обычная
   * перезаливка прайса без колонки `old_price` молча снимала уценку со всех
   * товаров сразу.
   */
  oldPrice?: number | null
  /**
   * Остаток. Ключ ОТСУТСТВУЕТ, если колонки нет в файле или ячейка пуста —
   * то же правило и по той же причине, что у `oldPrice` выше: варианты
   * склеиваются по sku через spread (mergeVariants), поэтому `stock: 0`
   * в объекте обнулял бы реальный склад. До 2026-09-18 так и было: заход
   * «дописать описания» файлом без колонки `stock` молча обнулял остатки.
   * Значение по умолчанию (0) проставляется только НОВОМУ варианту — в
   * `mergeVariants`, где видно, что варианта с таким sku ещё нет.
   */
  stock?: number
  /** Показывать ли вариант. Та же логика отсутствующего ключа, что у `stock`. */
  isActive?: boolean
  /**
   * Имя файла из медиатеки. `undefined` — ячейка пуста, и это значит «не
   * трогать»: варианты склеиваются по sku через spread (mergeVariants), и
   * попавший в объект `image: undefined` затёр бы уже привязанное фото.
   */
  image?: string
}

export type ProductInput = {
  line: number
  base: Omit<
    FormatARow,
    'volume' | 'sku' | 'price' | 'old_price' | 'stock' | 'is_active' | 'variant_image'
  >
  variants: VariantInput[]
}

/**
 * Результат группировки строк в товары. `scalarConflicts` — расхождения полей
 * уровня товара внутри одного handle (см. productScalars.ts); в формате B
 * всегда пусты: строка = целый товар, расходиться нечему.
 */
export type GroupResult = {
  inputs: ProductInput[]
  invalidVolumes: RowError[]
  scalarConflicts: { country: RowError[]; productCategory: RowError[] }
}

/** Ключ сравнения объёмов «на глаз»: без регистра и без пробелов. */
const volumeKey = (raw: string) => raw.toLowerCase().replace(/\s+/g, '')

/**
 * Похоже ли значение на канонический объём с точностью до регистра/пробелов
 * («full size», «FullSize» → «Full Size»). Такое почти всегда опечатка, а не
 * новый объём, и сообщение об этом должно отличаться от «просто не из списка»:
 * в первом случае клиенту надо поправить регистр, во втором — понять, откуда
 * вообще взялось значение.
 */
const canonicalVolumeLookalike = (raw: string): ProductVolume | undefined =>
  PRODUCT_VOLUMES.find((volume) => volumeKey(volume) === volumeKey(raw))

const invalidVolumeMessage = (raw: string) => {
  const lookalike = canonicalVolumeLookalike(raw)
  return lookalike
    ? `volume: «${raw}» отличается от «${lookalike}» только регистром или пробелами — вероятно опечатка, вариант пропущен`
    : `volume: значение «${raw}» не из списка (${PRODUCT_VOLUMES.join(' / ')}) — вариант пропущен`
}

/**
 * Пустая ячейка товарной колонки: `undefined`, пустая/пробельная строка или
 * пустой список (`pipeList` на пустой ячейке даёт `[]`, а не `undefined`).
 * Булевы `is_new`/`is_hit` пустыми не бывают: схема отдаёт `undefined` на
 * пустой ячейке, а `false` — это ЗНАЧЕНИЕ, перебивать его строкой ниже нельзя.
 */
const isEmptyCell = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0)

/**
 * Формат A: поля УРОВНЯ ТОВАРА берутся из первой ЗАПОЛНЕННОЙ строки handle,
 * а не просто из первой. Строк на товар несколько (одна на объём), и колонку
 * вроде `product_category` или `gender` люди сплошь и рядом заполняют не в
 * самой верхней строке — дописали к готовому прайсу, проставили у «главного»
 * объёма, получили файл из 1С. До 2026-09-22 такое значение молча пропадало:
 * `base` копировался с первой строки целиком, пустая ячейка в ней «побеждала»
 * заполненную ниже, и товар с `product_category=bodyCare` оставался
 * `perfume` — то есть не появлялся в разделе «Body Care».
 *
 * Это та же болезнь, что была у `stock`/`is_active`/`old_price`
 * (docs/GOTCHAS.md): пустая ячейка принималась за данные. Здесь она значит
 * «в этой строке не сказано» — и ничего не решает.
 *
 * Уже заполненное значение строка ниже НЕ перетирает: приоритет у первой
 * заполненной. Для `country_of_origin`/`product_category` расхождение двух
 * непустых ячеек вдобавок уходит предупреждением в отчёт (scalarConflict).
 */
function adoptFilledCells<T extends Record<string, unknown>>(base: T, row: T): void {
  for (const key of Object.keys(row) as (keyof T)[]) {
    if (isEmptyCell(base[key]) && !isEmptyCell(row[key])) base[key] = row[key]
  }
}

/**
 * Формат A: строки одного handle склеиваются в один товар. Объём — не
 * строгий zod на уровне схемы (см. schema.ts): невалидное значение здесь
 * пропускает только ЭТУ строку (вариант), не весь файл — предупреждение
 * уходит в invalidVolumes, остальные строки того же и других товаров
 * применяются как обычно.
 *
 * Запись товара в `grouped` заводится ПЕРВОЙ строкой независимо от того,
 * валиден её объём или нет — иначе товар, у которого именно первая строка
 * оказалась с плохим объёмом, не попадал бы в Map вообще и пропадал бы из
 * отчёта молча (не «пропущен с предупреждением», а просто отсутствовал бы).
 * Пустые ячейки этой первой строки дозаполняются следующими — см.
 * `adoptFilledCells`.
 */
export function groupFormatA(rows: ValidatedRow<FormatARow>[]): GroupResult {
  const grouped = new Map<string, ProductInput>()
  const invalidVolumes: RowError[] = []
  const countryConflicts: RowError[] = []
  const productCategoryConflicts: RowError[] = []

  for (const { line, value } of rows) {
    const { volume, sku, price, old_price, stock, is_active, variant_image, ...base } = value
    const existing = grouped.get(base.handle)
    if (!existing) grouped.set(base.handle, { line, base, variants: [] })

    // Страна и раздел каталога — поля товара, а строк на товар несколько:
    // канон — первая ЗАПОЛНЕННАЯ строка handle (она и лежит в base, пустые
    // ячейки дозаполняются ниже). Расхождение двух непустых ячеек внутри
    // одного handle почти всегда опечатка, поэтому не молчим: берём принятое
    // значение, остальные — в отчёт. Сверка обязана идти ДО дозаполнения:
    // иначе эта же строка сначала подставит своё значение в base, а потом
    // сравнится сама с собой и предупреждение потеряется.
    if (existing) {
      const country = scalarConflict(
        COUNTRY_SPEC,
        base.handle,
        line,
        existing.base.country_of_origin,
        value.country_of_origin,
      )
      if (country) countryConflicts.push(country)

      const productCategory = scalarConflict(
        PRODUCT_CATEGORY_SPEC,
        base.handle,
        line,
        existing.base.product_category,
        value.product_category,
      )
      if (productCategory) productCategoryConflicts.push(productCategory)

      // Пустые ячейки товарных колонок первой строки — дозаполнить этой.
      adoptFilledCells(existing.base as Record<string, unknown>, base)
    }

    if (!isProductVolume(volume)) {
      invalidVolumes.push({ line, field: 'volume', message: invalidVolumeMessage(volume) })
      continue
    }

    const variant: VariantInput = {
      volume,
      sku,
      price,
      // Сверка именно с `undefined`, а не проверка на истинность: 0 — валидное
      // число после разбора ячейки, и `old_price ? …` пропустил бы его.
      ...(old_price !== undefined ? { oldPrice: old_price } : {}),
      // Пустая ячейка/отсутствующая колонка — «не трогать», как у old_price.
      ...(stock !== undefined ? { stock } : {}),
      ...(is_active !== undefined ? { isActive: is_active } : {}),
      ...(variant_image ? { image: variant_image } : {}),
    }
    grouped.get(base.handle)!.variants.push(variant)
  }

  return {
    inputs: [...grouped.values()],
    invalidVolumes,
    scalarConflicts: { country: countryConflicts, productCategory: productCategoryConflicts },
  }
}

/**
 * Формат B: варианты уже пришли JSON-массивом — та же терпимость к объёму.
 * `scalarConflicts` здесь всегда пуст: строка = целый товар, расходиться
 * внутри одного handle нечему (в отличие от формата A, где строк несколько).
 */
export function groupFormatB(rows: ValidatedRow<FormatBRow>[]): GroupResult {
  const invalidVolumes: RowError[] = []

  const inputs = rows.map(({ line, value }) => {
    const { variants, ...base } = value
    const resolved: VariantInput[] = []

    for (const variant of variants) {
      if (!isProductVolume(variant.volume)) {
        invalidVolumes.push({
          line,
          field: 'variants[].volume',
          message: invalidVolumeMessage(variant.volume),
        })
        continue
      }
      resolved.push({
        volume: variant.volume,
        sku: variant.sku,
        price: variant.price,
        // Отсутствующий в JSON oldPrice не кладём — см. VariantInput.oldPrice.
        ...(variant.oldPrice !== undefined ? { oldPrice: variant.oldPrice } : {}),
        // Отсутствующие в JSON stock/isActive не кладём — см. VariantInput.stock.
        ...(variant.stock !== undefined ? { stock: variant.stock } : {}),
        ...(variant.isActive !== undefined ? { isActive: variant.isActive } : {}),
        // Пустое/отсутствующее image не кладём — см. VariantInput.image.
        ...(variant.image?.trim() ? { image: variant.image.trim() } : {}),
      })
    }

    return { line, base, variants: resolved }
  })

  return {
    inputs,
    invalidVolumes,
    scalarConflicts: { country: [], productCategory: [] },
  }
}

/**
 * Отказ записи КОНКРЕТНОГО товара. Payload бросает `ValidationError`, у
 * которой в `message` только «Следующее поле недействительно: …» — без товара
 * и без причины. Здесь к ней прикладывается контекст, который есть только на
 * этом уровне: строка CSV, handle и список SKU из этой строки, — чтобы отчёт
 * мог показать человеку, что именно править, не заглядывая в код.
 */
export class ProductWriteError extends Error {
  constructor(
    readonly line: number,
    readonly handle: string,
    /** Описания вариантов строки: SKU + состояние уценки. */
    readonly variants: string[],
    readonly reason: string,
    options?: { cause?: unknown },
  ) {
    // Многострочно с отступом: это фатальная ошибка, ради которой человек
    // полезет в файл, и списком варианты читаются кратно быстрее, чем
    // перечислением через запятую в одну строку. Отступ подогнан под формат
    // вывода ошибок в report.ts.
    const list = variants.length ? variants.map((row) => `\n        · ${row}`).join('') : ''
    super(`товар ${handle} — ${reason}${list}`, options)
    this.name = 'ProductWriteError'
  }
}

/**
 * Подпись варианта для сообщения об отказе: цена, уценка и ФАКТИЧЕСКОЕ
 * наличие скидки. Чаще всего отказ именно из-за `variantsDiscountConsistent`,
 * и без такой раскладки человеку пришлось бы сверять строки файла руками.
 *
 * Состояние считается тем же `discountPercent()`, которым пользуется сама
 * валидация, — иначе подпись разошлась бы с причиной отказа. Показать просто
 * «есть old_price / нет old_price» недостаточно: `old_price` может быть
 * заполнен, но НЕ выше цены (перезалили прайс с подорожанием) — формально
 * поле есть, скидки при этом нет, и именно такой случай выглядит самым
 * загадочным для заливающего.
 *
 * Это вывод данных, а не повтор правила: здесь не решается, что допустимо,
 * — печатается то, что уходит в базу.
 */
const describeVariant = (variant: {
  sku: string
  price?: number | null
  oldPrice?: number | null
}): string => {
  const percent = discountPercent(variant.price, variant.oldPrice)
  if (percent !== null) return `${variant.sku}: ${variant.price} вместо ${variant.oldPrice} (−${percent}%)`
  if (variant.oldPrice === null || variant.oldPrice === undefined) {
    return `${variant.sku}: ${variant.price}, old_price пуст — скидки нет`
  }
  return `${variant.sku}: ${variant.price}, old_price ${variant.oldPrice} не выше цены — скидки нет`
}

/** Оборачивает запись товара, добавляя к отказу контекст строки и SKU. */
async function writeProduct<T>(
  input: { line: number; handle: string; variants: string[] },
  write: () => Promise<T>,
): Promise<T> {
  try {
    return await write()
  } catch (error) {
    if (error instanceof ProductWriteError) throw error
    throw new ProductWriteError(input.line, input.handle, input.variants, describeError(error), {
      cause: error,
    })
  }
}

/**
 * Вариант, готовый к записи: имя файла уже заменено на id записи Media.
 * Ключ `image` отсутствует, если фото не задано или не нашлось — тогда
 * spread в mergeVariants не тронет то, что уже привязано в базе.
 */
type VariantPayload = Omit<VariantInput, 'image'> & { image?: number | string }

/**
 * Варианты из файла накатываются на существующие по sku; чужие не трогаем.
 * Экспортируется ради тестов (как `groupFormatA`/`groupFormatB`): именно
 * здесь работает правило «отсутствующий ключ не затирает сохранённое».
 */
export function mergeVariants(existing: Product['variants'], incoming: VariantPayload[]) {
  const merged = [...(existing ?? [])]
  let created = 0
  let updated = 0

  for (const variant of incoming) {
    const index = merged.findIndex((item) => item.sku === variant.sku)
    if (index >= 0) {
      // Каст — из-за `image`: `ImageResolver` не завязан на тип id (`number |
      // string`), а сгенерированный тип Payload знает, что в этом проекте id
      // числовые. Приводим на границе, как и в ветке push ниже.
      merged[index] = { ...merged[index], ...variant } as NonNullable<Product['variants']>[number]
      updated += 1
    } else {
      // НОВЫЙ вариант: здесь и только здесь проставляются значения по
      // умолчанию для не заданных в файле остатка и активности. У уже
      // существующего варианта (ветка выше) их отсутствие означает «оставить
      // как в базе», поэтому подставлять дефолты там нельзя.
      merged.push({
        stock: 0,
        isActive: true,
        ...variant,
      } as NonNullable<Product['variants']>[number])
      created += 1
    }
  }

  return { merged, created, updated }
}

/**
 * Мультиязычные колонки description_ro/ru/en одной строки — только те, что
 * реально заполнены (пустая ячейка не должна затирать уже переведённую
 * локаль). Если ни одна не заполнена — файл использует одиночную
 * description, которая дублируется во все пустые локали (см. ниже).
 */
function localizedDescriptions(
  base: Record<string, unknown>,
): Partial<Record<DescriptionLocale, string>> {
  const result: Partial<Record<DescriptionLocale, string>> = {}
  for (const locale of DESCRIPTION_LOCALES) {
    const value = base[`description_${locale}`]
    if (typeof value === 'string' && value) result[locale] = value
  }
  return result
}

/**
 * Мультиязычные колонки family_ro/ru/en — только заполненные (пустая ячейка
 * не трогает уже сохранённое значение другой локали). В отличие от
 * description здесь нет одноколоночного варианта с дублированием — семейство
 * либо задано на конкретных локалях, либо не задано вовсе (ПРОМПТ 12 v2).
 */
function localizedFamily(
  base: Record<string, unknown>,
): Partial<Record<DescriptionLocale, string>> {
  const result: Partial<Record<DescriptionLocale, string>> = {}
  for (const locale of DESCRIPTION_LOCALES) {
    const value = base[`family_${locale}`]
    if (typeof value === 'string' && value) result[locale] = value
  }
  return result
}

/**
 * Есть ли в lexical-дереве хоть один непробельный текстовый узел.
 * Спускаться нужно и в `root` (верхний узел документа), и в `children` —
 * иначе непустое описание читается как пустое и получает дубль поверх.
 */
function hasText(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasText)
  if (!node || typeof node !== 'object') return false
  const record = node as Record<string, unknown>
  if (typeof record.text === 'string' && record.text.trim()) return true
  return hasText(record.root) || hasText(record.children)
}

const isEmptyRichText = (value: unknown): boolean => !hasText(value)

/**
 * Локали, где описание товара сейчас пустое. Именно они — и только они —
 * получают дубль одиночной колонки description: готовый перевод, введённый
 * руками в админке, неаккуратный импорт прайса затирать не должен.
 *
 * `fallbackLocale: false` обязателен: у проекта включён `fallback: true`
 * (payload.config.ts), и без этого пустая ru-версия вернула бы ro-текст —
 * товар выглядел бы уже переведённым, дубль не проставился бы никуда.
 */
async function emptyDescriptionLocales(
  payload: Payload,
  id: number | string,
  req?: Partial<PayloadRequest>,
): Promise<DescriptionLocale[]> {
  const empty: DescriptionLocale[] = []

  for (const locale of DESCRIPTION_LOCALES) {
    const doc = await payload.findByID({
      collection: 'products',
      id,
      locale,
      fallbackLocale: false,
      depth: 0,
      req: req as PayloadRequest,
    })
    if (isEmptyRichText(doc?.description)) empty.push(locale)
  }

  return empty
}

export async function applyProducts(
  payload: Payload,
  inputs: ProductInput[],
  options: { locale: string; dryRun: boolean; req?: Partial<PayloadRequest> },
  plan: ImportPlan,
): Promise<void> {
  const { locale, dryRun, req } = options
  const resolver = new RelationResolver(payload, locale, dryRun, req)
  const imageResolver = new ImageResolver(payload, req)
  const brandLogos = new BrandLogoApplier()

  for (const input of inputs) {
    const { base, variants } = input

    const existing = await payload.find({
      collection: 'products',
      where: { handle: { equals: base.handle } },
      limit: 1,
      depth: 0,
      locale: locale as 'ro',
      req: req as PayloadRequest,
    })
    const current = existing.docs[0]

    // Все строки этого handle имели невалидный объём (invalidVolumes уже
    // содержит предупреждение по каждой) — для НОВОГО товара это значит
    // вообще ни одного варианта: payload.create упал бы на `minRows: 1`.
    // Для уже существующего товара не проблема — merge просто не добавит
    // новых вариантов, старые останутся как были, товар обновится по
    // остальным полям как обычно.
    if (!current && variants.length === 0) {
      plan.skipped.push({
        line: input.line,
        message: `${base.handle}: у товара ни одной строки с валидным объёмом — товар не создан`,
      })
      continue
    }

    // Имена файлов у вариантов → id записей Media. Ненайденное имя не рушит
    // импорт и не затирает уже привязанное фото: ключ `image` просто не
    // попадает в объект варианта, а имя уходит в отчёт (главный риск фичи —
    // опечатка в имени, которая иначе прошла бы молча).
    const resolvedVariants: VariantPayload[] = []
    for (const variant of variants) {
      const { image, ...rest } = variant
      if (!image) {
        resolvedVariants.push(rest)
        continue
      }

      const imageId = await imageResolver.resolveOne(image)
      if (imageId === null) {
        plan.variantImages.missing.push({
          line: input.line,
          field: 'variant_image',
          message: `${base.handle} · ${variant.volume}: файл «${image}» не найден в медиатеке — вариант остался без своего фото`,
        })
        resolvedVariants.push(rest)
      } else {
        resolvedVariants.push({ ...rest, image: imageId })
        plan.variantImages.attached += 1
      }
    }

    const merged = mergeVariants(current?.variants, resolvedVariants)
    plan.variants.created += merged.created
    plan.variants.updated += merged.updated

    const brandId = await resolver.resolve('brands', base.brand)
    // Лого бренда только запоминается: пишется оно один раз за прогон,
    // после цикла по товарам (см. brandLogos.ts).
    brandLogos.register(base.brand, base.brand_logo, input.line, plan)
    const categoryIds = await resolver.resolveMany('categories', base.categories)
    const noteIds = await resolver.resolveMany('notes', base.notes)
    const topIds = await resolver.resolveMany('notes', base.notes_top)
    const heartIds = await resolver.resolveMany('notes', base.notes_heart)
    const baseIds = await resolver.resolveMany('notes', base.notes_base)
    const { ids: imageIds, missing: missingImages } = await imageResolver.resolveMany(base.images)

    const data: Record<string, unknown> = {
      handle: base.handle,
      // title больше не localized-поле — пишется как есть, независимо от
      // options.locale ниже (тот относится только к description и к тому,
      // в какую локаль резолвится find/create/update).
      title: base.title,
      variants: merged.merged,
    }

    // Slug существующего товара — это его URL: перезаписываем только если
    // клиент явно указал колонку slug. Иначе переименование товара в прайсе
    // молча ломало бы ссылки и канониклы.
    if (base.slug) {
      data.slug = slugify(base.slug)
    } else if (!current) {
      data.slug = slugify(base.title)
    }

    if (brandId !== undefined && brandId !== -1) data.brand = brandId
    if (categoryIds.length) data.categories = categoryIds
    if (noteIds.length) data.notes = noteIds
    if (topIds.length || heartIds.length || baseIds.length) {
      data.pyramid = { top: topIds, heart: heartIds, base: baseIds }
    }
    if (base.gender) data.gender = base.gender

    // Страна и раздел каталога: канон — только value из списка
    // (uae / europe / usa и perfume / bodyCare), синонимы и русские подписи не
    // принимаем (решение владельца, тот же принцип, что у объёма). Регистр и
    // краевые пробелы прощаем. Пустая ячейка ничего не пишет — у существующего
    // товара остаётся своё значение, у нового срабатывает defaultValue самого
    // поля Payload ('europe' / 'perfume'). Неизвестное значение — тоже не
    // пишем, только предупреждение: импорт из-за опечатки падать не должен.
    // Правила общие на оба поля, см. productScalars.ts.
    const scalars = [
      { spec: COUNTRY_SPEC, raw: base.country_of_origin, stat: plan.country },
      { spec: PRODUCT_CATEGORY_SPEC, raw: base.product_category, stat: plan.productCategory },
    ]
    for (const { spec, raw, stat } of scalars) {
      const resolved = resolveScalar(spec, base.handle, input.line, raw)
      if (resolved.kind === 'apply') {
        data[spec.target] = resolved.value
        stat.applied += 1
      } else if (resolved.kind === 'unknown') {
        stat.unknown.push(resolved.error)
      }
    }
    // family — три независимые локали (family_ro/ru/en), пишутся отдельными
    // update'ами ниже, тем же принципом, что и мультиязычная description —
    // в основной data.family не кладётся, чтобы не завязываться на
    // options.locale.
    const families = localizedFamily(base)

    // Пустая ячейка (колонка images отсутствует или ничего не перечислено в
    // этой строке) — существующие фото не трогаем. Непустая ячейка — CSV
    // источник истины, заменяет весь список целиком (даже если ни одно из
    // перечисленных имён не нашлось — тогда список станет пустым, это
    // осознанный выбор клиента, а не опечатка в одном имени).
    if (base.images?.length) {
      data.images = imageIds
      plan.images.attached += imageIds.length
      for (const name of missingImages) {
        plan.images.missing.push({
          line: input.line,
          field: 'images',
          message: `файл «${name}» не найден в медиатеке — сначала загрузите его архивом`,
        })
      }
    }

    // description_ro/ru/en (если есть хоть одна) перекрывают одиночную
    // description целиком — та в этом случае игнорируется, чтобы не было
    // двух источников истины для одного и того же поля. Каждая заполненная
    // локаль пишется отдельным update ниже, независимо от --locale.
    const descriptions = localizedDescriptions(base)
    const hasMultiLocaleDescription = Object.keys(descriptions).length > 0
    // Одиночная description в data НЕ кладётся: она уходит ниже отдельными
    // update'ами во все локали, где описание пустое (пустое поле на витрине
    // хуже дубля — тот хотя бы читается и виден как «надо перевести»).
    const singleDescription =
      !hasMultiLocaleDescription && base.description ? base.description : undefined

    // Считать пустые локали нужно СТРОГО до основного update: Payload с
    // `fallback: true` при обычном update сам проливает значение дефолтной
    // локали в пустые (проверено вживую — ru/en у товара с пустым описанием
    // получали копию ro без единого явного update на них). После update
    // «пустых» локалей уже не осталось бы, и дубль не проставился бы никуда.
    const singleDescriptionTargets: DescriptionLocale[] = !singleDescription
      ? []
      : current
        ? await emptyDescriptionLocales(payload, current.id, req)
        : [...DESCRIPTION_LOCALES]

    plan.descriptionDuplicated += singleDescriptionTargets.length

    if (base.is_new !== undefined) data.isNew = base.is_new
    if (base.is_hit !== undefined) data.isHit = base.is_hit

    // Контекст для сообщения об отказе: строка файла, handle и SKU этой строки.
    const where = {
      line: input.line,
      handle: base.handle,
      variants: merged.merged.map(describeVariant),
    }

    let productId = current?.id
    if (current) {
      plan.update.push(base.handle)
      if (!dryRun) {
        await writeProduct(where, () =>
          payload.update({
            collection: 'products',
            id: current.id,
            locale: locale as 'ro',
            data: data as never,
            req: req as PayloadRequest,
          }),
        )
      }
    } else {
      plan.create.push(base.handle)
      if (!dryRun) {
        const created = await writeProduct(where, () =>
          payload.create({
            collection: 'products',
            locale: locale as 'ro',
            // Новый товар публикуем сразу — прайс клиента это живой каталог.
            data: { ...data, _status: 'published' } as never,
            req: req as PayloadRequest,
          }),
        )
        productId = created.id
      }
    }

    if (hasMultiLocaleDescription && !dryRun && productId !== undefined) {
      for (const [descLocale, text] of Object.entries(descriptions)) {
        await payload.update({
          collection: 'products',
          id: productId,
          locale: descLocale as DescriptionLocale,
          data: { description: paragraphs(text) } as never,
          req: req as PayloadRequest,
        })
      }
    }

    if (singleDescription && !dryRun && productId !== undefined) {
      for (const descLocale of singleDescriptionTargets) {
        await payload.update({
          collection: 'products',
          id: productId,
          locale: descLocale,
          data: { description: paragraphs(singleDescription) } as never,
          req: req as PayloadRequest,
        })
      }
    }

    if (Object.keys(families).length && !dryRun && productId !== undefined) {
      for (const [famLocale, text] of Object.entries(families)) {
        await payload.update({
          collection: 'products',
          id: productId,
          locale: famLocale as DescriptionLocale,
          data: { family: text } as never,
          req: req as PayloadRequest,
        })
      }
    }
  }

  // Логотипы брендов — после цикла: к этому моменту все бренды файла уже
  // заведены и закэшированы резолвером, а каждая запись бренда обновляется
  // ровно один раз, сколько бы товаров на неё ни ссылалось.
  await brandLogos.apply(payload, resolver, imageResolver, plan, dryRun, req)

  plan.autoCreate.brands = resolver.created.brands
  plan.autoCreate.categories = resolver.created.categories
  plan.autoCreate.notes = resolver.created.notes
}
