import type { Payload, Where } from 'payload'
import type { DiscountCampaign, Product } from '@/payload-types'

/**
 * Разворачивание `selectionRule` кампании в список ТОВАРОВ.
 *
 * Отбор идёт на уровне товара, а не варианта, намеренно: скидка обязана
 * стоять на всех активных вариантах товара сразу либо ни на одном
 * (`variantsDiscountConsistent` в Products.ts). Отбирая варианты по
 * отдельности, кампания не смогла бы сохранить товар вообще.
 *
 * Три источника объединяются по ИЛИ: товар попадает в кампанию, если
 * подходит хотя бы под один критерий. Пересечения не дублируются —
 * это один запрос с `or`, а не три склеенных списка.
 */

/** Ссылка Payload: число (depth 0) или уже развёрнутый документ. */
type Ref = number | { id: number } | null | undefined

const idsOf = (refs: Ref[] | null | undefined): number[] => {
  const ids = (refs ?? [])
    .map((ref) => (typeof ref === 'number' ? ref : ref?.id))
    .filter((id): id is number => typeof id === 'number')
  return [...new Set(ids)]
}

export type SelectionRule = DiscountCampaign['selectionRule']

/** Пустое правило — это НЕ «весь каталог», а «ничего». */
export const isEmptyRule = (rule: SelectionRule): boolean =>
  idsOf(rule?.brands as Ref[]).length === 0 &&
  idsOf(rule?.categories as Ref[]).length === 0 &&
  idsOf(rule?.manualProducts as Ref[]).length === 0

export async function selectCampaignProducts(
  payload: Payload,
  rule: SelectionRule,
): Promise<Product[]> {
  const brands = idsOf(rule?.brands as Ref[])
  const categories = idsOf(rule?.categories as Ref[])
  const manualProducts = idsOf(rule?.manualProducts as Ref[])

  const or: Where[] = []
  if (brands.length) or.push({ brand: { in: brands } })
  if (categories.length) or.push({ categories: { in: categories } })
  if (manualProducts.length) or.push({ id: { in: manualProducts } })

  // Без критериев в базу не ходим: `where: { or: [] }` Payload трактует как
  // «условий нет» и вернул бы ВЕСЬ каталог — ровно наоборот смыслу.
  if (!or.length) return []

  // `draft` намеренно не передаётся — читаем и пишем одну и ту же
  // (опубликованную) версию товара, ровно как CSV-импорт в
  // `lib/import/applyProducts.ts`. Читать черновик, а писать в published
  // значило бы откатывать цены не туда, откуда их взяли.
  const { docs } = await payload.find({
    collection: 'products',
    where: { or },
    // limit 0 — без постраничности: кампания обязана увидеть все товары
    // отбора, иначе журнал окажется неполным и откат — частичным.
    limit: 0,
    depth: 0,
  })

  return docs as Product[]
}
