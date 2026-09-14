import { describe, expect, it } from 'vitest'
import { discountPercent, priceLine } from '@/lib/pricing'

/**
 * Правило совмещения товарной скидки и промокода (2026-09-12): выигрывает
 * БОЛЬШИЙ процент, считается он от `oldPrice`, применяется ПОПОЗИЦИОННО.
 * Скидки не складываются и не перемножаются.
 *
 * Числа взяты у существующих товаров дев-каталога, а не выдуманы: правило
 * считает деньги, и проверять его надо на тех же ценах, что стоят в базе.
 * Особенно важен `MO-AS-30` — его 800/1200 дают ровно тот случай округления,
 * ради которого при победе товарной скидки цена НЕ пересчитывается из базы.
 */

/** MO-AMBER-SALE, три варианта с уценкой. */
const MO_AS_05 = { price: 200, oldPrice: 250 } // −20%
const MO_AS_10 = { price: 380, oldPrice: 450 } // −16% (15.55 → 16)
const MO_AS_30 = { price: 800, oldPrice: 1200 } // −33% (33.33 → 33)
/** MO-SIGNATURE-WOOD, 5ml — без уценки вообще. */
const MO_SW_05 = { price: 240, oldPrice: null }

describe('priceLine — проценты у контрольных товаров такие, как ожидает тест', () => {
  // Страховка от «тест зелёный, потому что проценты не те, что я думал».
  it('MO-AS-05 = 20%, MO-AS-10 = 16%, MO-AS-30 = 33%, MO-SW-05 — без скидки', () => {
    expect(discountPercent(MO_AS_05.price, MO_AS_05.oldPrice)).toBe(20)
    expect(discountPercent(MO_AS_10.price, MO_AS_10.oldPrice)).toBe(16)
    expect(discountPercent(MO_AS_30.price, MO_AS_30.oldPrice)).toBe(33)
    expect(discountPercent(MO_SW_05.price, MO_SW_05.oldPrice)).toBeNull()
  })
})

describe('priceLine — скидка товара МЕНЬШЕ промокода: выигрывает промокод', () => {
  it('считается от oldPrice, а не от уценённой цены', () => {
    // 250 (не 200!) − 25% = 187.5 → 188. Старое правило дало бы 200 − 25% = 150.
    const line = priceLine(MO_AS_05.price, MO_AS_05.oldPrice, 25)
    expect(line).toEqual({
      base: 250,
      productPercent: 20,
      finalPercent: 25,
      unitPrice: 188,
      source: 'promo',
    })
  })

  it('скидки не перемножаются — итог выше, чем при старом правиле', () => {
    const line = priceLine(MO_AS_30.price, MO_AS_30.oldPrice, 40)
    // Новое: 1200 − 40% = 720. Старое (промокод от уценённой): 800 − 40% = 480.
    expect(line.unitPrice).toBe(720)
    expect(line.unitPrice).toBeGreaterThan(480)
  })
})

describe('priceLine — скидка товара БОЛЬШЕ промокода: выигрывает товар', () => {
  it('цена остаётся сохранённой, промокод не влияет', () => {
    const line = priceLine(MO_AS_30.price, MO_AS_30.oldPrice, 10)
    expect(line).toEqual({
      base: 1200,
      productPercent: 33,
      finalPercent: 33,
      unitPrice: 800,
      source: 'product',
    })
  })

  it('цена НЕ пересчитывается из base — иначе округление подняло бы её', () => {
    const line = priceLine(MO_AS_30.price, MO_AS_30.oldPrice, 10)
    // 1200 × (100 − 33) / 100 = 804 — на 4 MDL дороже, чем стоит товар.
    expect(Math.round((line.base * (100 - line.finalPercent)) / 100)).toBe(804)
    expect(line.unitPrice).toBe(800)
  })

  it('и в обратную сторону: округление вниз тоже не применяется', () => {
    const line = priceLine(MO_AS_10.price, MO_AS_10.oldPrice, 5)
    // 450 × (100 − 16) / 100 = 378 — на 2 MDL дешевле реальной цены.
    expect(Math.round((line.base * (100 - line.finalPercent)) / 100)).toBe(378)
    expect(line.unitPrice).toBe(380)
  })
})

describe('priceLine — проценты РАВНЫ: выигрывает товар', () => {
  it('промокод не тратится ради нулевой выгоды', () => {
    const line = priceLine(MO_AS_30.price, MO_AS_30.oldPrice, 33)
    expect(line.source).toBe('product')
    expect(line.finalPercent).toBe(33)
    // Та же ловушка округления: 1200 − 33% = 804, а платить надо 800.
    expect(line.unitPrice).toBe(800)
  })

  it('равенство на «ровном» товаре тоже отдаётся товару, хотя суммы совпадают', () => {
    const line = priceLine(MO_AS_05.price, MO_AS_05.oldPrice, 20)
    expect(line.source).toBe('product')
    expect(line.unitPrice).toBe(200)
  })
})

describe('priceLine — товар без собственной скидки', () => {
  it('промокод считается от обычной цены и выигрывает', () => {
    const line = priceLine(MO_SW_05.price, MO_SW_05.oldPrice, 15)
    expect(line).toEqual({
      base: 240,
      productPercent: 0,
      finalPercent: 15,
      unitPrice: 204,
      source: 'promo',
    })
  })

  it('без промокода — ни скидки, ни источника', () => {
    const line = priceLine(MO_SW_05.price, MO_SW_05.oldPrice, null)
    expect(line).toEqual({
      base: 240,
      productPercent: 0,
      finalPercent: 0,
      unitPrice: 240,
      source: null,
    })
  })
})

describe('priceLine — граничные значения', () => {
  it('oldPrice НЕ выше цены скидкой не считается (база = price)', () => {
    // Ровно случай MO-AS-05 после перезаливки прайса, поймавшей
    // variantsDiscountConsistent: цена поднялась выше сохранённой уценки.
    const line = priceLine(300, 250, 10)
    expect(line.productPercent).toBe(0)
    expect(line.base).toBe(300)
    expect(line.unitPrice).toBe(270)
    expect(line.source).toBe('promo')
  })

  it('oldPrice равна цене — тоже не скидка', () => {
    const line = priceLine(200, 200, 0)
    expect(line.productPercent).toBe(0)
    expect(line.base).toBe(200)
    expect(line.source).toBeNull()
  })

  it('oldPrice отсутствует (позиция из корзины до 2026-09-12) — читается как «скидки нет»', () => {
    expect(priceLine(200, undefined, 0).base).toBe(200)
    expect(priceLine(200, null, 0).base).toBe(200)
  })

  it('нулевой и отрицательный промокод игнорируются, а не дают наценку', () => {
    expect(priceLine(240, null, 0).unitPrice).toBe(240)
    expect(priceLine(240, null, -10).unitPrice).toBe(240)
    expect(priceLine(240, null, -10).source).toBeNull()
  })

  it('промокод 100% обнуляет цену, а не уводит её в минус', () => {
    expect(priceLine(240, null, 100).unitPrice).toBe(0)
  })
})
