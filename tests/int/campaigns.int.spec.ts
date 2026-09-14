import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { campaignPrice, startCampaign, stopCampaign, CampaignError } from '@/lib/campaigns/run'
import { selectCampaignProducts } from '@/lib/campaigns/selection'
import type { Product } from '@/payload-types'

/**
 * Кампании скидок (2026-09-12) — на ЖИВОМ Payload, а не на заглушке.
 *
 * Заглушка здесь не годится принципиально: половина проверяемого поведения
 * живёт не в нашем коде, а в самом Payload — валидация
 * `variantsDiscountConsistent` на поле `variants`, денормализация
 * `hasDiscount`/`maxDiscountPercent` в `beforeChange`, запись массивов
 * журнала. Подменив Payload, мы проверяли бы собственные ожидания от него.
 *
 * Берутся СУЩЕСТВУЮЩИЕ товары дев-каталога, новых фикстур не заводится.
 * Чтобы прогон (в том числе упавший) не оставил каталог уценённым, варианты
 * этих товаров снимаются в `beforeAll` и возвращаются в `afterAll` —
 * восстановление не зависит от того, дошёл ли тест до `stopCampaign`.
 */

/** Товар с ПОСТОЯННОЙ уценкой: 200/250, 380/450, 800/1200. */
const AMBER_SALE = 'maison-orphee-amber-sale'
/** Тоже с уценкой: 180/200, 320/360. */
const SET_DESCOPERIRE = 'casa-lumina-set-descoperire'
/** Без уценки вовсе: 240, 420, 980. */
const SIGNATURE_WOOD = 'maison-orphee-signature-wood'

const SLUGS = [AMBER_SALE, SET_DESCOPERIRE, SIGNATURE_WOOD]

let payload: Payload
/** Снимок вариантов до прогона: slug → variants, id. */
const snapshot = new Map<string, { id: number; variants: unknown }>()

type Variant = { sku: string; price: number; oldPrice?: number | null; isActive?: boolean | null }

const loadProduct = async (slug: string): Promise<Product> => {
  const { docs } = await payload.find({
    collection: 'products',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  })
  const product = docs[0] as Product | undefined
  if (!product) throw new Error(`нет товара ${slug} — нужен seed дев-каталога`)
  return product
}

const variantsOf = async (slug: string): Promise<Variant[]> =>
  ((await loadProduct(slug)).variants ?? []) as Variant[]

const bySku = (variants: Variant[], sku: string): Variant => {
  const found = variants.find((variant) => variant.sku === sku)
  if (!found) throw new Error(`нет варианта ${sku}`)
  return found
}

/** Кампания-черновик на конкретные товары. */
const createCampaign = async (percent: number, slugs: string[], name = 'TEST кампания') => {
  const manualProducts = slugs.map((slug) => snapshot.get(slug)!.id)
  const campaign = await payload.create({
    collection: 'discount-campaigns',
    data: {
      name,
      percent,
      status: 'draft',
      selectionRule: { manualProducts },
    } as never,
  })
  return campaign.id
}

/** Возврат товаров к снятому в beforeAll состоянию. */
const restoreCatalog = async () => {
  for (const [, saved] of snapshot) {
    await payload.update({
      collection: 'products',
      id: saved.id,
      data: { variants: saved.variants } as never,
      context: { skipCatalogRevalidate: true },
    })
  }
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  for (const slug of SLUGS) {
    const product = await loadProduct(slug)
    snapshot.set(slug, { id: product.id, variants: product.variants })
  }
}, 60_000)

beforeEach(async () => {
  // Каждый тест стартует с чистого каталога: предыдущий мог оставить
  // кампанию активной намеренно (проверка конфликтов).
  await restoreCatalog()
})

afterAll(async () => {
  await restoreCatalog()
  // Тестовые кампании за собой убираем — в /admin они мусор.
  const { docs } = await payload.find({
    collection: 'discount-campaigns',
    where: { name: { like: 'TEST' } },
    limit: 100,
    depth: 0,
  })
  for (const doc of docs) {
    await payload.delete({ collection: 'discount-campaigns', id: doc.id })
  }
}, 60_000)

describe('старт кампании', () => {
  it('уценяет все активные варианты товара, зачёркнутой становится цена ДО кампании', async () => {
    const id = await createCampaign(10, [SET_DESCOPERIRE])
    const result = await startCampaign(payload, id)

    expect(result.affectedProducts).toBe(1)
    expect(result.affectedVariants).toBe(2)
    expect(result.skipped).toEqual([])

    const variants = await variantsOf(SET_DESCOPERIRE)
    // 180 → 162, зачёркнуто 180 (а не прежние витринные 200).
    expect(bySku(variants, 'CL-SD-06')).toMatchObject({ price: 162, oldPrice: 180 })
    expect(bySku(variants, 'CL-SD-12')).toMatchObject({ price: 288, oldPrice: 320 })
  })

  it('у товара с ПОСТОЯННОЙ уценкой база — текущая цена, а не старая зачёркнутая', async () => {
    const id = await createCampaign(10, [AMBER_SALE])
    await startCampaign(payload, id)

    const variants = await variantsOf(AMBER_SALE)
    const full = bySku(variants, 'MO-AS-30')
    // Было 800 из 1200. Стало 720 из 800 — скидка кампании ЛЕГЛА СВЕРХУ.
    expect(full.price).toBe(720)
    expect(full.oldPrice).toBe(800)
    // Главное: товар подешевел, а не подорожал и не потерял уценку.
    expect(full.price).toBeLessThan(800)
    // Пересчёт от старой зачёркнутой дал бы 1080 — товар подорожал бы на 280.
    expect(full.price).not.toBe(1080)
  })

  it('разные проценты считаются от своей цены у каждого варианта', async () => {
    const id = await createCampaign(35, [AMBER_SALE])
    await startCampaign(payload, id)

    const variants = await variantsOf(AMBER_SALE)
    expect(bySku(variants, 'MO-AS-05').price).toBe(campaignPrice(200, 35)) // 130
    expect(bySku(variants, 'MO-AS-10').price).toBe(campaignPrice(380, 35)) // 247
    expect(bySku(variants, 'MO-AS-30').price).toBe(campaignPrice(800, 35)) // 520
  })

  it('несколько товаров разом, журнал — по строке на каждый активный вариант', async () => {
    const id = await createCampaign(20, [AMBER_SALE, SIGNATURE_WOOD])
    const result = await startCampaign(payload, id)

    expect(result.affectedProducts).toBe(2)
    expect(result.affectedVariants).toBe(6)

    const campaign = await payload.findByID({ collection: 'discount-campaigns', id, depth: 0 })
    expect(campaign.status).toBe('active')
    expect(campaign.journal).toHaveLength(6)
    expect(campaign.affectedVariantsCount).toBe(6)
    // Журнал помнит и то, чего у товара не было: у SIGNATURE_WOOD уценки нет.
    const woodRow = campaign.journal?.find((row) => row.sku === 'MO-SW-05')
    expect(woodRow).toMatchObject({ priceBefore: 240, oldPriceBefore: null, priceSet: 192 })
  })

  it('денормализация товара пересчитана — витрина увидит скидку', async () => {
    const id = await createCampaign(20, [SIGNATURE_WOOD])
    await startCampaign(payload, id)

    const product = await loadProduct(SIGNATURE_WOOD)
    expect(product.hasDiscount).toBe(true)
    expect(product.maxDiscountPercent).toBe(20)
  })

  it('повторный старт той же кампании отклоняется', async () => {
    const id = await createCampaign(10, [SET_DESCOPERIRE])
    await startCampaign(payload, id)
    await expect(startCampaign(payload, id)).rejects.toBeInstanceOf(CampaignError)
  })

  it('пустой отбор — отказ, а не «весь каталог»', async () => {
    const campaign = await payload.create({
      collection: 'discount-campaigns',
      data: { name: 'TEST пустой отбор', percent: 10, status: 'draft' } as never,
    })
    await expect(startCampaign(payload, campaign.id)).rejects.toThrow(/отбор/i)
    // И сам отбор действительно пуст, а не «всё».
    expect(await selectCampaignProducts(payload, {})).toEqual([])
  })
})

describe('остановка без внешних правок — полный откат', () => {
  it('цены и зачёркнутые цены возвращаются ровно к исходным', async () => {
    const before = await variantsOf(AMBER_SALE)
    const id = await createCampaign(15, [AMBER_SALE])
    await startCampaign(payload, id)

    const result = await stopCampaign(payload, id)
    expect(result.conflicts).toEqual([])
    expect(result.revertedVariants).toBe(3)

    const after = await variantsOf(AMBER_SALE)
    for (const variant of before) {
      expect(bySku(after, variant.sku)).toMatchObject({
        price: variant.price,
        oldPrice: variant.oldPrice ?? null,
      })
    }
  })

  it('товар БЕЗ уценки возвращается именно к «нет зачёркнутой цены»', async () => {
    const id = await createCampaign(25, [SIGNATURE_WOOD])
    await startCampaign(payload, id)
    await stopCampaign(payload, id)

    const variants = await variantsOf(SIGNATURE_WOOD)
    expect(bySku(variants, 'MO-SW-05')).toMatchObject({ price: 240, oldPrice: null })
    const product = await loadProduct(SIGNATURE_WOOD)
    expect(product.hasDiscount).toBe(false)
    expect(product.maxDiscountPercent).toBe(0)
  })

  it('статус становится finished, остановить повторно нельзя', async () => {
    const id = await createCampaign(10, [SET_DESCOPERIRE])
    await startCampaign(payload, id)
    await stopCampaign(payload, id)

    const campaign = await payload.findByID({ collection: 'discount-campaigns', id, depth: 0 })
    expect(campaign.status).toBe('finished')
    await expect(stopCampaign(payload, id)).rejects.toBeInstanceOf(CampaignError)
  })
})

describe('вторая кампания на том же товаре после отката', () => {
  it('стартует с чистой базы — следов первой в ценах не остаётся', async () => {
    const before = await variantsOf(AMBER_SALE)

    const first = await createCampaign(10, [AMBER_SALE], 'TEST кампания первая')
    await startCampaign(payload, first)
    await stopCampaign(payload, first)

    const second = await createCampaign(10, [AMBER_SALE], 'TEST кампания вторая')
    await startCampaign(payload, second)

    const afterSecond = await variantsOf(AMBER_SALE)
    // Ровно те же числа, что дала первая кампания: 800 → 720, а не 720 → 648.
    expect(bySku(afterSecond, 'MO-AS-30')).toMatchObject({ price: 720, oldPrice: 800 })

    await stopCampaign(payload, second)
    const afterAllStops = await variantsOf(AMBER_SALE)
    for (const variant of before) {
      expect(bySku(afterAllStops, variant.sku)).toMatchObject({
        price: variant.price,
        oldPrice: variant.oldPrice ?? null,
      })
    }
  })
})

describe('остановка с конфликтом — цену поменяли извне', () => {
  it('изменённый вариант не трогается, остальные откатываются', async () => {
    const before = await variantsOf(AMBER_SALE)
    const id = await createCampaign(15, [AMBER_SALE])
    await startCampaign(payload, id)

    // Имитируем ручную правку в /admin (или CSV-импорт) во время кампании:
    // у одного варианта цена стала не той, что выставила кампания.
    const productId = snapshot.get(AMBER_SALE)!.id
    const current = await variantsOf(AMBER_SALE)
    await payload.update({
      collection: 'products',
      id: productId,
      data: {
        variants: current.map((variant) =>
          variant.sku === 'MO-AS-05' ? { ...variant, price: 149 } : variant,
        ),
      } as never,
      context: { skipCatalogRevalidate: true },
    })

    const result = await stopCampaign(payload, id)

    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]).toMatchObject({
      sku: 'MO-AS-05',
      reason: 'price_changed',
      priceNow: 149,
      priceSet: campaignPrice(200, 15),
      priceBefore: 200,
    })
    expect(result.revertedVariants).toBe(2)

    const after = await variantsOf(AMBER_SALE)
    // Конфликтный вариант остался ровно таким, каким его сделала правка.
    expect(bySku(after, 'MO-AS-05').price).toBe(149)
    // Остальные вернулись к исходному.
    expect(bySku(after, 'MO-AS-10')).toMatchObject({
      price: bySku(before, 'MO-AS-10').price,
      oldPrice: bySku(before, 'MO-AS-10').oldPrice ?? null,
    })
    expect(bySku(after, 'MO-AS-30')).toMatchObject({
      price: bySku(before, 'MO-AS-30').price,
      oldPrice: bySku(before, 'MO-AS-30').oldPrice ?? null,
    })
  })

  it('конфликты сохраняются в кампанию, статус всё равно finished', async () => {
    const id = await createCampaign(15, [AMBER_SALE])
    await startCampaign(payload, id)

    const productId = snapshot.get(AMBER_SALE)!.id
    const current = await variantsOf(AMBER_SALE)
    await payload.update({
      collection: 'products',
      id: productId,
      data: {
        variants: current.map((variant) =>
          variant.sku === 'MO-AS-10' ? { ...variant, price: 333 } : variant,
        ),
      } as never,
      context: { skipCatalogRevalidate: true },
    })
    await stopCampaign(payload, id)

    const campaign = await payload.findByID({ collection: 'discount-campaigns', id, depth: 0 })
    expect(campaign.status).toBe('finished')
    expect(campaign.conflicts).toHaveLength(1)
    expect(campaign.conflicts?.[0]).toMatchObject({ sku: 'MO-AS-10', reason: 'price_changed' })
  })
})

describe('правило «скидка на всех активных вариантах сразу» при откате', () => {
  /**
   * При СТАРТЕ нарушить это правило отбором нельзя: `selectionRule`
   * разворачивается в список ТОВАРОВ, и кампания уценяет все активные
   * варианты товара разом — частичного отбора вариантов в системе нет
   * вовсе (см. selection.ts).
   *
   * А вот при ОСТАНОВКЕ частичность возникает сама: конфликтный вариант
   * остаётся с ценой кампании (то есть со скидкой), а остальные откатились
   * бы к состоянию БЕЗ скидки. Это и есть реальный случай, когда правило
   * блокирует запись.
   */
  it('частичный откат товара без исходной уценки блокируется целиком', async () => {
    const id = await createCampaign(20, [SIGNATURE_WOOD])
    await startCampaign(payload, id)

    const productId = snapshot.get(SIGNATURE_WOOD)!.id
    const current = await variantsOf(SIGNATURE_WOOD)
    await payload.update({
      collection: 'products',
      id: productId,
      data: {
        variants: current.map((variant) =>
          variant.sku === 'MO-SW-05' ? { ...variant, price: 150 } : variant,
        ),
      } as never,
      context: { skipCatalogRevalidate: true },
    })

    const result = await stopCampaign(payload, id)

    // Ни один вариант не откачен: откат двух из трёх оставил бы скидку
    // на части активных вариантов — товар бы не сохранился.
    expect(result.revertedVariants).toBe(0)
    expect(result.conflicts).toHaveLength(3)
    expect(result.conflicts.find((row) => row.sku === 'MO-SW-05')?.reason).toBe('price_changed')
    expect(result.conflicts.find((row) => row.sku === 'MO-SW-10')?.reason).toBe(
      'blocked_by_consistency',
    )

    // Товар остался ровно в том состоянии, в каком был до остановки.
    const after = await variantsOf(SIGNATURE_WOOD)
    expect(bySku(after, 'MO-SW-05').price).toBe(150)
    expect(bySku(after, 'MO-SW-10').price).toBe(campaignPrice(420, 20))
  })

  it('у товара С исходной уценкой тот же сценарий откатывается нормально', async () => {
    // Разница только в данных: после отката остальные варианты остаются
    // со своей постоянной уценкой, значит скидка есть у всех — правило
    // выполнено и запись проходит.
    const id = await createCampaign(20, [AMBER_SALE])
    await startCampaign(payload, id)

    const productId = snapshot.get(AMBER_SALE)!.id
    const current = await variantsOf(AMBER_SALE)
    await payload.update({
      collection: 'products',
      id: productId,
      data: {
        variants: current.map((variant) =>
          variant.sku === 'MO-AS-05' ? { ...variant, price: 111 } : variant,
        ),
      } as never,
      context: { skipCatalogRevalidate: true },
    })

    const result = await stopCampaign(payload, id)
    expect(result.revertedVariants).toBe(2)
    expect(result.conflicts.map((row) => row.reason)).toEqual(['price_changed'])
  })
})

describe('отбор товаров', () => {
  it('объединяет бренды, категории и ручной список без дублей', async () => {
    const amber = await loadProduct(AMBER_SALE)
    const wood = await loadProduct(SIGNATURE_WOOD)
    const brandId = typeof amber.brand === 'number' ? amber.brand : amber.brand?.id

    // Бренд даёт оба товара; ручной список повторяет один из них.
    const selected = await selectCampaignProducts(payload, {
      brands: [brandId!],
      manualProducts: [wood.id],
    } as never)

    const ids = selected.map((product) => product.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain(amber.id)
    expect(ids).toContain(wood.id)
  })
})
