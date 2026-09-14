import type { Payload } from 'payload'
import { variantsDiscountConsistent } from '@/collections/Products'
import type { DiscountCampaign, Product } from '@/payload-types'
import { revalidateAll } from '@/lib/revalidate'
import { selectCampaignProducts } from '@/lib/campaigns/selection'

/**
 * Запуск и остановка кампании скидок (вариант C, 2026-09-12).
 *
 * Кампания пишет `price`/`oldPrice` вариантов ровно тем же способом, что и
 * ручная правка в `/admin`: обычный `payload.update` товара. Поэтому
 * денормализация (`hasDiscount`/`maxDiscountPercent`), валидация
 * «скидка на всех активных вариантах сразу» и вся арифметика витрины
 * (в том числе правило max() с промокодом в `lib/pricing.ts`) продолжают
 * работать как есть — ничего из этого кампания не знает и не обходит.
 */

/** Сколько товаров пишем одновременно. Каждому нужен свой `update` — данные у всех разные. */
const WRITE_CHUNK = 10

type VariantRow = {
  sku?: string | null
  price?: number | null
  oldPrice?: number | null
  isActive?: boolean | null
}

export type JournalRow = NonNullable<DiscountCampaign['journal']>[number]
export type ConflictRow = NonNullable<DiscountCampaign['conflicts']>[number]

/** Товар, к которому кампанию применить не удалось, и почему. */
export type SkippedProduct = { productId: number; title: string; reason: string }

export type StartResult = {
  affectedProducts: number
  affectedVariants: number
  journal: JournalRow[]
  skipped: SkippedProduct[]
}

export type StopResult = {
  revertedProducts: number
  revertedVariants: number
  conflicts: ConflictRow[]
}

export class CampaignError extends Error {}

const activeVariants = (product: Product): VariantRow[] =>
  ((product.variants ?? []) as VariantRow[]).filter((variant) => variant.isActive !== false)

/**
 * Проверка «скидка на всех активных вариантах сразу или ни на одном» той же
 * функцией, что стоит валидацией на поле `variants` (Products.ts) — не
 * копией правила. Сигнатура там — `ArrayFieldValidation` (значение + опции
 * поля), здесь нужно только значение, отсюда приведение типа.
 */
const consistencyError = (variants: VariantRow[]): string | null => {
  const check = variantsDiscountConsistent as unknown as (
    value: unknown,
    options: unknown,
  ) => true | string
  const result = check(variants, {})
  return result === true ? null : result
}

/** Цена кампании: процент от ТЕКУЩЕЙ цены, округление до целого MDL. */
export const campaignPrice = (priceBefore: number, percent: number): number =>
  Math.round((priceBefore * (100 - percent)) / 100)

/** Последовательные порции: каждому товару нужен свой update, но не по одному за раз. */
async function inChunks<T>(items: T[], size: number, run: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(run))
  }
}

/**
 * Хуки `Products` сбрасывают кэш витрины на КАЖДОМ сохранении. На кампании в
 * сотню товаров это сотня сбросов подряд; вместо них — один `revalidateAll()`
 * в конце всей операции. Флаг читает `afterChange` в Products.ts.
 */
const SKIP_REVALIDATE = { skipCatalogRevalidate: true }

async function loadCampaign(payload: Payload, id: number | string): Promise<DiscountCampaign> {
  const campaign = (await payload.findByID({
    collection: 'discount-campaigns',
    id,
    depth: 0,
  })) as DiscountCampaign | null
  if (!campaign) throw new CampaignError('Кампания не найдена.')
  return campaign
}

/**
 * СТАРТ. Для каждого активного варианта отобранных товаров:
 * журнал ← текущие цены, `price` ← цена со скидкой, `oldPrice` ← цена ДО
 * кампании.
 *
 * **База скидки — текущая `price`, а не `oldPrice`.** Товар с постоянной
 * уценкой (800 из 1200) при старте кампании −10% получает 720 из 800, а не
 * пересчёт от витринных 1200. Иначе такой товар при старте кампании либо
 * терял бы свою уценку, либо вовсе дорожал — ради этого вариант A
 * дизайн-обсуждения и был отклонён. Скидка кампании ложится СВЕРХ того, что
 * уже есть.
 *
 * Зачёркнутой ценой становится цена до кампании, а не «настоящая регулярная»:
 * так подпись на витрине никогда не обещает скидку больше фактической.
 */
export async function startCampaign(
  payload: Payload,
  campaignId: number | string,
): Promise<StartResult> {
  const campaign = await loadCampaign(payload, campaignId)
  if (campaign.status !== 'draft') {
    throw new CampaignError('Запустить можно только черновик — эта кампания уже запускалась.')
  }
  const percent = campaign.percent
  if (typeof percent !== 'number' || percent < 1 || percent > 99) {
    throw new CampaignError('Процент кампании должен быть от 1 до 99.')
  }

  const products = await selectCampaignProducts(payload, campaign.selectionRule)
  if (!products.length) {
    throw new CampaignError(
      'Отбор не дал ни одного товара. Проверьте бренды, категории и список товаров.',
    )
  }

  const journal: JournalRow[] = []
  const skipped: SkippedProduct[] = []
  const writes: { product: Product; variants: VariantRow[]; rows: JournalRow[] }[] = []

  for (const product of products) {
    const active = activeVariants(product)
    if (!active.length) {
      skipped.push({ productId: product.id, title: product.title, reason: 'нет активных вариантов' })
      continue
    }

    const rows: JournalRow[] = []
    const nextVariants = (product.variants ?? []).map((variant) => {
      const row = variant as VariantRow
      if (row.isActive === false || typeof row.price !== 'number') return variant
      const priceBefore = row.price
      const priceSet = campaignPrice(priceBefore, percent)
      rows.push({
        sku: row.sku ?? '',
        product: product.id,
        priceBefore,
        oldPriceBefore: row.oldPrice ?? null,
        priceSet,
      })
      return { ...variant, price: priceSet, oldPrice: priceBefore }
    })

    // Округление может «съесть» скидку на копеечной цене (1 MDL при −1% так
    // и останется 1). Такой вариант окажется единственным без скидки среди
    // уценённых — товар не пройдёт валидацию целиком. Честнее пропустить его
    // и сказать об этом, чем уронить всю кампанию.
    const problem = consistencyError(nextVariants as VariantRow[])
    if (problem) {
      skipped.push({
        productId: product.id,
        title: product.title,
        reason: 'скидка не ложится на все активные варианты (слишком низкая цена для такого процента)',
      })
      continue
    }

    writes.push({ product, variants: nextVariants as VariantRow[], rows })
    journal.push(...rows)
  }

  if (!writes.length) {
    throw new CampaignError(
      'Ни к одному отобранному товару кампанию применить не удалось — см. список ниже.',
    )
  }

  await inChunks(writes, WRITE_CHUNK, async ({ product, variants }) => {
    await payload.update({
      collection: 'products',
      id: product.id,
      data: { variants } as never,
      context: SKIP_REVALIDATE,
    })
  })

  await payload.update({
    collection: 'discount-campaigns',
    id: campaignId,
    data: {
      status: 'active',
      startedAt: new Date().toISOString(),
      journal,
      conflicts: [],
      affectedProductsCount: writes.length,
      affectedVariantsCount: journal.length,
    } as never,
  })

  // Один сброс на всю операцию — вместо сотни из хуков отдельных товаров.
  await revalidateAll()

  return {
    affectedProducts: writes.length,
    affectedVariants: journal.length,
    journal,
    skipped,
  }
}

/**
 * ОСТАНОВКА. Для каждой строки журнала сверяется ТЕКУЩАЯ цена варианта:
 * совпала с `priceSet` — откатываем к `priceBefore`/`oldPriceBefore`, не
 * совпала — значит цену поменяли извне (руками в `/admin` или CSV-импортом),
 * пока кампания шла. Такой вариант не трогаем вообще и пишем в `conflicts[]`.
 *
 * Отдельный случай — «частичный откат ломает товар». Если у товара один
 * вариант конфликтный (остался с ценой кампании и зачёркнутой ценой), а
 * остальные откатились бы к состоянию без скидки, получится скидка на части
 * активных вариантов — `variantsDiscountConsistent` такой товар сохранить не
 * даст. Тогда товар не трогается ЦЕЛИКОМ, а его строки уходят в конфликты с
 * причиной `blocked_by_consistency`: лучше оставить всё как есть и показать
 * владельцу, чем уронить остановку кампании на исключении валидации.
 */
export async function stopCampaign(
  payload: Payload,
  campaignId: number | string,
): Promise<StopResult> {
  const campaign = await loadCampaign(payload, campaignId)
  if (campaign.status !== 'active') {
    throw new CampaignError('Остановить можно только идущую кампанию.')
  }

  const journal = (campaign.journal ?? []) as JournalRow[]
  const conflicts: ConflictRow[] = []
  const writes: { productId: number; variants: VariantRow[]; count: number }[] = []

  // Журнал сгруппирован по товару: один товар — один update, даже если у него
  // три варианта в кампании.
  const byProduct = new Map<number, JournalRow[]>()
  for (const row of journal) {
    const productId = typeof row.product === 'number' ? row.product : row.product?.id
    if (typeof productId !== 'number') {
      conflicts.push({
        sku: row.sku,
        reason: 'variant_missing',
        priceNow: null,
        priceSet: row.priceSet,
        priceBefore: row.priceBefore,
      })
      continue
    }
    byProduct.set(productId, [...(byProduct.get(productId) ?? []), row])
  }

  for (const [productId, rows] of byProduct) {
    const product = (await payload
      .findByID({ collection: 'products', id: productId, depth: 0 })
      .catch(() => null)) as Product | null

    if (!product) {
      // Товар удалили за время кампании — откатывать нечего и негде.
      for (const row of rows) {
        conflicts.push({
          sku: row.sku,
          reason: 'variant_missing',
          priceNow: null,
          priceSet: row.priceSet,
          priceBefore: row.priceBefore,
        })
      }
      continue
    }

    const pending: ConflictRow[] = []
    const revertable: JournalRow[] = []

    for (const row of rows) {
      const variant = (product.variants ?? []).find(
        (candidate) => (candidate as VariantRow).sku === row.sku,
      ) as VariantRow | undefined

      if (!variant || typeof variant.price !== 'number') {
        pending.push({
          sku: row.sku,
          reason: 'variant_missing',
          priceNow: null,
          priceSet: row.priceSet,
          priceBefore: row.priceBefore,
        })
        continue
      }
      if (variant.price !== row.priceSet) {
        pending.push({
          sku: row.sku,
          reason: 'price_changed',
          priceNow: variant.price,
          priceSet: row.priceSet,
          priceBefore: row.priceBefore,
        })
        continue
      }
      revertable.push(row)
    }

    if (!revertable.length) {
      conflicts.push(...pending)
      continue
    }

    const nextVariants = (product.variants ?? []).map((variant) => {
      const row = revertable.find((candidate) => candidate.sku === (variant as VariantRow).sku)
      if (!row) return variant
      return { ...variant, price: row.priceBefore, oldPrice: row.oldPriceBefore ?? null }
    }) as VariantRow[]

    const problem = consistencyError(nextVariants)
    if (problem) {
      // Частичный откат товар не сохранит — не трогаем его вовсе.
      conflicts.push(...pending)
      for (const row of revertable) {
        conflicts.push({
          sku: row.sku,
          reason: 'blocked_by_consistency',
          priceNow: row.priceSet,
          priceSet: row.priceSet,
          priceBefore: row.priceBefore,
        })
      }
      continue
    }

    conflicts.push(...pending)
    writes.push({ productId, variants: nextVariants, count: revertable.length })
  }

  await inChunks(writes, WRITE_CHUNK, async ({ productId, variants }) => {
    await payload.update({
      collection: 'products',
      id: productId,
      data: { variants } as never,
      context: SKIP_REVALIDATE,
    })
  })

  // Статус меняется в `finished` независимо от конфликтов: кампания
  // закончилась, а нерешённые расхождения остаются видимым списком в карточке.
  await payload.update({
    collection: 'discount-campaigns',
    id: campaignId,
    data: {
      status: 'finished',
      finishedAt: new Date().toISOString(),
      conflicts,
    } as never,
  })

  await revalidateAll()

  return {
    revertedProducts: writes.length,
    revertedVariants: writes.reduce((sum, write) => sum + write.count, 0),
    conflicts,
  }
}
