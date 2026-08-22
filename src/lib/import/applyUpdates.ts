import type { Payload, PayloadRequest } from 'payload'
import type { Product } from '@/payload-types'
import { paragraphs } from '@/lib/seed/richText'
import type { PriceRow, TranslationRow } from './schema'
import type { ImportPlan } from './types'
import type { ValidatedRow } from './validate'

type Ctx = { locale: string; dryRun: boolean; req?: Partial<PayloadRequest> }

/**
 * Лёгкий прайс `sku,price,stock`: правит только цену и остаток конкретного
 * варианта. Строки одного товара группируются, чтобы обновить его один раз.
 */
export async function applyPrices(
  payload: Payload,
  rows: ValidatedRow<PriceRow>[],
  { locale, dryRun, req }: Ctx,
  plan: ImportPlan,
): Promise<void> {
  const bySku = new Map<string, ValidatedRow<PriceRow>>()
  rows.forEach((row) => bySku.set(row.value.sku, row))

  const productChanges = new Map<
    number | string,
    { variants: Product['variants']; handle: string }
  >()

  for (const [sku, row] of bySku) {
    const found = await payload.find({
      collection: 'products',
      where: { 'variants.sku': { equals: sku } },
      limit: 1,
      depth: 0,
      locale: locale as 'ro',
      req: req as PayloadRequest,
    })

    const product = found.docs[0]
    if (!product) {
      plan.skipped.push({ line: row.line, field: 'sku', message: `sku «${sku}» не найден` })
      continue
    }

    const entry = productChanges.get(product.id) ?? {
      variants: [...(product.variants ?? [])],
      handle: product.handle,
    }

    entry.variants = (entry.variants ?? []).map((variant) =>
      variant.sku === sku
        ? {
            ...variant,
            ...(row.value.price !== undefined ? { price: row.value.price } : {}),
            ...(row.value.stock !== undefined ? { stock: row.value.stock } : {}),
          }
        : variant,
    )

    productChanges.set(product.id, entry)
    plan.touched += 1
    plan.variants.updated += 1
  }

  for (const [id, entry] of productChanges) {
    if (!plan.update.includes(entry.handle)) plan.update.push(entry.handle)
    if (dryRun) continue
    await payload.update({
      collection: 'products',
      id,
      locale: locale as 'ro',
      data: { variants: entry.variants } as never,
      req: req as PayloadRequest,
    })
  }
}

/** Переводы `handle,locale,description` — пишем описание в указанную локаль. */
export async function applyTranslations(
  payload: Payload,
  rows: ValidatedRow<TranslationRow>[],
  { dryRun, req }: Ctx,
  plan: ImportPlan,
): Promise<void> {
  for (const { line, value } of rows) {
    const found = await payload.find({
      collection: 'products',
      where: { handle: { equals: value.handle } },
      limit: 1,
      depth: 0,
      req: req as PayloadRequest,
    })

    const product = found.docs[0]
    if (!product) {
      plan.skipped.push({ line, field: 'handle', message: `handle «${value.handle}» не найден` })
      continue
    }

    const data: Record<string, unknown> = {}
    if (value.description) data.description = paragraphs(value.description)
    if (!Object.keys(data).length) {
      plan.skipped.push({ line, message: 'нет description — строка пропущена' })
      continue
    }

    if (!plan.update.includes(value.handle)) plan.update.push(value.handle)
    plan.touched += 1

    if (dryRun) continue
    await payload.update({
      collection: 'products',
      id: product.id,
      locale: value.locale,
      data: data as never,
      req: req as PayloadRequest,
    })
  }
}
