import type { Payload, PayloadRequest } from 'payload'
import type { Product } from '@/payload-types'
import {
  isProductCountry,
  PRODUCT_COUNTRY_VALUES,
  type ProductCountry,
} from '@/lib/catalog/countries'
import { isProductVolume, PRODUCT_VOLUMES, type ProductVolume } from '@/lib/catalog/volumes'
import { paragraphs } from '@/lib/seed/richText'
import { slugify } from '@/lib/slugify'
import { DESCRIPTION_LOCALES, type DescriptionLocale } from './detect'
import { ImageResolver } from './images'
import { RelationResolver } from './relations'
import type { FormatARow, FormatBRow } from './schema'
import type { ImportPlan, RowError } from './types'
import type { ValidatedRow } from './validate'

type VariantInput = {
  volume: ProductVolume
  sku: string
  price: number
  oldPrice: number | null
  stock: number
  isActive: boolean
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
 */
export function groupFormatA(rows: ValidatedRow<FormatARow>[]): {
  inputs: ProductInput[]
  invalidVolumes: RowError[]
  countryConflicts: RowError[]
} {
  const grouped = new Map<string, ProductInput>()
  const invalidVolumes: RowError[] = []
  const countryConflicts: RowError[] = []

  for (const { line, value } of rows) {
    const { volume, sku, price, old_price, stock, is_active, variant_image, ...base } = value
    const existing = grouped.get(base.handle)
    if (!existing) grouped.set(base.handle, { line, base, variants: [] })

    // Страна — поле товара, а строк на товар несколько: канон — первая строка
    // handle (она и лежит в base). Расхождение внутри одного handle почти
    // всегда опечатка, поэтому не молчим: берём первую, остальные — в отчёт.
    if (existing) {
      const first = existing.base.country_of_origin?.trim() ?? ''
      const current = value.country_of_origin?.trim() ?? ''
      if (current && current !== first) {
        // Если расходящееся значение к тому же не из списка — говорим об этом
        // прямо: иначе отчёт выглядит так, будто «Marte» — законная
        // альтернатива, просто проигравшая первой строке.
        const message = isProductCountry(current.toLowerCase())
          ? `${base.handle}: строки указывают разные страны («${first || '—'}» и «${current}») — взята первая`
          : `${base.handle}: страна «${current}» не из списка (${PRODUCT_COUNTRY_VALUES.join(' / ')}) и отличается от первой строки («${first || '—'}») — взята первая`
        countryConflicts.push({ line, field: 'country_of_origin', message })
      }
    }

    if (!isProductVolume(volume)) {
      invalidVolumes.push({ line, field: 'volume', message: invalidVolumeMessage(volume) })
      continue
    }

    const variant: VariantInput = {
      volume,
      sku,
      price,
      oldPrice: old_price ?? null,
      stock: stock ?? 0,
      isActive: is_active ?? true,
      ...(variant_image ? { image: variant_image } : {}),
    }
    grouped.get(base.handle)!.variants.push(variant)
  }

  return { inputs: [...grouped.values()], invalidVolumes, countryConflicts }
}

/**
 * Формат B: варианты уже пришли JSON-массивом — та же терпимость к объёму.
 * `countryConflicts` здесь всегда пуст: строка = целый товар, расходиться
 * внутри одного handle нечему (в отличие от формата A, где строк несколько).
 */
export function groupFormatB(rows: ValidatedRow<FormatBRow>[]): {
  inputs: ProductInput[]
  invalidVolumes: RowError[]
  countryConflicts: RowError[]
} {
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
        oldPrice: variant.oldPrice ?? null,
        stock: variant.stock ?? 0,
        isActive: variant.isActive ?? true,
        // Пустое/отсутствующее image не кладём — см. VariantInput.image.
        ...(variant.image?.trim() ? { image: variant.image.trim() } : {}),
      })
    }

    return { line, base, variants: resolved }
  })

  return { inputs, invalidVolumes, countryConflicts: [] }
}

/**
 * Вариант, готовый к записи: имя файла уже заменено на id записи Media.
 * Ключ `image` отсутствует, если фото не задано или не нашлось — тогда
 * spread в mergeVariants не тронет то, что уже привязано в базе.
 */
type VariantPayload = Omit<VariantInput, 'image'> & { image?: number | string }

/** Варианты из файла накатываются на существующие по sku; чужие не трогаем. */
function mergeVariants(existing: Product['variants'], incoming: VariantPayload[]) {
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

    // Страна: канон — только value из списка (uae / europe / usa), синонимы и
    // русские подписи не принимаем (решение владельца, тот же принцип, что у
    // объёма). Регистр и пробелы прощаем. Пустая ячейка ничего не пишет —
    // у существующего товара остаётся своё значение, у нового срабатывает
    // defaultValue: 'europe' самого поля Payload. Неизвестное значение — тоже
    // не пишем, только предупреждение: импорт из-за опечатки падать не должен.
    const rawCountry = base.country_of_origin?.trim()
    if (rawCountry) {
      const normalized = rawCountry.toLowerCase()
      if (isProductCountry(normalized)) {
        data.countryOfOrigin = normalized satisfies ProductCountry
        plan.country.applied += 1
      } else {
        plan.country.unknown.push({
          line: input.line,
          field: 'country_of_origin',
          message: `${base.handle}: страна «${rawCountry}» не из списка (${PRODUCT_COUNTRY_VALUES.join(' / ')}) — поле не изменено`,
        })
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
