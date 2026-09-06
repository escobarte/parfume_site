import type { Payload, PayloadRequest } from 'payload'
import type { Product } from '@/payload-types'
import { resolveVolumeToken, type VolumeValue } from '@/lib/catalog/volume'
import { paragraphs } from '@/lib/seed/richText'
import { slugify } from '@/lib/slugify'
import { DESCRIPTION_LOCALES, type DescriptionLocale } from './detect'
import { ImageResolver } from './images'
import { RelationResolver } from './relations'
import type { FormatARow, FormatBRow } from './schema'
import type { ImportPlan } from './types'
import type { ValidatedRow } from './validate'

type VariantInput = {
  volume: VolumeValue
  sku: string
  price: number
  oldPrice: number | null
  stock: number
  isActive: boolean
}

export type ProductInput = {
  line: number
  base: Omit<FormatARow, 'volume' | 'sku' | 'price' | 'old_price' | 'stock' | 'is_active'>
  variants: VariantInput[]
}

/**
 * Плохое значение `volume` (не из фиксированного списка, ПРОМПТ
 * 12-дополнение) — предупреждение в `plan.variants.invalidVolume`, строка
 * (вариант) пропускается, файл целиком НЕ обрывается (в отличие от обычных
 * ошибок формата zod, которые проверяются раньше и обрывают всё-или-ничего).
 */
function resolveVolumeOrWarn(
  raw: string,
  line: number,
  plan: ImportPlan,
): VolumeValue | null {
  const resolved = resolveVolumeToken(raw)
  if (resolved === null) {
    plan.variants.invalidVolume.push({
      line,
      field: 'volume',
      message: `значение «${raw}» не из списка (3ml/5ml/10ml/travel/full) — вариант пропущен`,
    })
  }
  return resolved
}

/** Формат A: строки одного handle склеиваются в один товар. */
export function groupFormatA(rows: ValidatedRow<FormatARow>[], plan: ImportPlan): ProductInput[] {
  const grouped = new Map<string, ProductInput>()
  // Первая строка каждого handle — даже с плохим объёмом. Нужен для случая
  // «у товара ВСЕ строки оказались с плохим volume»: тогда handle никогда не
  // попадёт в `grouped` (там создание записи идёт только при первом валидном
  // варианте), и без этой карты товар исчез бы из отчёта молча, а не как
  // явное «пропущен целиком» — ниже.
  const firstLineByHandle = new Map<string, number>()

  for (const { line, value } of rows) {
    const { volume: rawVolume, sku, price, old_price, stock, is_active, ...base } = value
    if (!firstLineByHandle.has(base.handle)) firstLineByHandle.set(base.handle, line)

    const volume = resolveVolumeOrWarn(rawVolume, line, plan)
    if (volume === null) continue

    const existing = grouped.get(base.handle)
    const variant: VariantInput = {
      volume,
      sku,
      price,
      oldPrice: old_price ?? null,
      stock: stock ?? 0,
      isActive: is_active ?? true,
    }

    if (existing) {
      existing.variants.push(variant)
    } else {
      grouped.set(base.handle, { line, base, variants: [variant] })
    }
  }

  for (const [handle, line] of firstLineByHandle) {
    if (!grouped.has(handle)) {
      plan.skipped.push({
        line,
        message: `товар «${handle}» пропущен целиком — ни одного варианта с валидным объёмом`,
      })
    }
  }

  return [...grouped.values()]
}

/** Формат B: варианты уже пришли JSON-массивом. */
export function groupFormatB(rows: ValidatedRow<FormatBRow>[], plan: ImportPlan): ProductInput[] {
  const inputs = rows.map(({ line, value }) => {
    const { variants, ...base } = value
    const resolvedVariants = variants
      .map((variant) => ({
        volume: resolveVolumeOrWarn(variant.volume, line, plan),
        sku: variant.sku,
        price: variant.price,
        oldPrice: variant.oldPrice ?? null,
        stock: variant.stock ?? 0,
        isActive: variant.isActive ?? true,
      }))
      .filter(
        (variant): variant is VariantInput & { volume: VolumeValue } => variant.volume !== null,
      )
    return { line, base, variants: resolvedVariants }
  })

  return dropEmptyProducts(inputs, plan)
}

/**
 * Товар, у которого ВСЕ строки/варианты оказались с плохим объёмом, целиком
 * пропускается (не создаётся/не обновляется) — иначе payload.create упал бы
 * на `variants: minRows 1`, и это неконтролируемо обрушило бы транзакцию
 * целиком (не тот путь: warning уже дан выше на каждую пропущенную строку).
 */
function dropEmptyProducts(inputs: ProductInput[], plan: ImportPlan): ProductInput[] {
  return inputs.filter((input) => {
    if (input.variants.length > 0) return true
    plan.skipped.push({
      line: input.line,
      message: `товар «${input.base.handle}» пропущен целиком — ни одного варианта с валидным объёмом`,
    })
    return false
  })
}

/** Варианты из файла накатываются на существующие по sku; чужие не трогаем. */
function mergeVariants(existing: Product['variants'], incoming: VariantInput[]) {
  const merged = [...(existing ?? [])]
  let created = 0
  let updated = 0

  for (const variant of incoming) {
    const index = merged.findIndex((item) => item.sku === variant.sku)
    if (index >= 0) {
      merged[index] = { ...merged[index], ...variant }
      updated += 1
    } else {
      merged.push(variant as NonNullable<Product['variants']>[number])
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

    const merged = mergeVariants(current?.variants, variants)
    plan.variants.created += merged.created
    plan.variants.updated += merged.updated

    const brandId = await resolver.resolve('brands', base.brand)
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

    let productId = current?.id
    if (current) {
      plan.update.push(base.handle)
      if (!dryRun) {
        await payload.update({
          collection: 'products',
          id: current.id,
          locale: locale as 'ro',
          data: data as never,
          req: req as PayloadRequest,
        })
      }
    } else {
      plan.create.push(base.handle)
      if (!dryRun) {
        const created = await payload.create({
          collection: 'products',
          locale: locale as 'ro',
          // Новый товар публикуем сразу — прайс клиента это живой каталог.
          data: { ...data, _status: 'published' } as never,
          req: req as PayloadRequest,
        })
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

  plan.autoCreate.brands = resolver.created.brands
  plan.autoCreate.categories = resolver.created.categories
  plan.autoCreate.notes = resolver.created.notes
}
