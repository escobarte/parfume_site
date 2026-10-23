import { describe, expect, it } from 'vitest'
import {
  lineMatchesPromoRule,
  matchingQuantity,
  NO_PROMO_RULE,
  promoConditionMet,
  promoRuleFrom,
  type PromoRule,
} from '@/lib/orders/promoRule'

/**
 * Общая логика условий промокода (акция «от 3 отливантов −20%»,
 * 2026-10-23) — одна функция для клиента (превью в корзине) и сервера
 * (оформление заявки), проверяется здесь один раз, а не в двух местах.
 */

const ALL: PromoRule = { minQuantity: null, appliesTo: 'all', volumes: [] }
const DECANTS_3: PromoRule = { minQuantity: 3, appliesTo: 'decants', volumes: [] }
const VOLUMES_10ML: PromoRule = { minQuantity: 2, appliesTo: 'volumes', volumes: ['10ml'] }

describe('lineMatchesPromoRule — подходит ли позиция', () => {
  it('подарочная позиция не подходит НИКОГДА, независимо от режима', () => {
    for (const rule of [ALL, DECANTS_3, VOLUMES_10ML]) {
      expect(lineMatchesPromoRule({ kind: 'gift', volume: '5ml', qty: 1 }, rule)).toBe(false)
    }
  })

  it('режим "all" — подходит любой непустой товар, объём не важен', () => {
    expect(lineMatchesPromoRule({ kind: 'product', volume: 'Full Size', qty: 1 }, ALL)).toBe(true)
    expect(lineMatchesPromoRule({ kind: 'product', volume: null, qty: 1 }, ALL)).toBe(true)
  })

  it('режим "decants" — только 3/5/10 мл, остальные объёмы не подходят', () => {
    for (const volume of ['3ml', '5ml', '10ml']) {
      expect(lineMatchesPromoRule({ kind: 'product', volume, qty: 1 }, DECANTS_3)).toBe(true)
    }
    for (const volume of ['Travel Size', 'Full Size']) {
      expect(lineMatchesPromoRule({ kind: 'product', volume, qty: 1 }, DECANTS_3)).toBe(false)
    }
  })

  it('режим "volumes" — только перечисленные значения', () => {
    expect(lineMatchesPromoRule({ kind: 'product', volume: '10ml', qty: 1 }, VOLUMES_10ML)).toBe(true)
    expect(lineMatchesPromoRule({ kind: 'product', volume: '5ml', qty: 1 }, VOLUMES_10ML)).toBe(false)
  })

  it('kind не указан — трактуется как "product" (старые позиции localStorage)', () => {
    expect(lineMatchesPromoRule({ volume: '5ml', qty: 1 }, DECANTS_3)).toBe(true)
  })
})

describe('matchingQuantity — сумма qty подходящих позиций', () => {
  it('считает по подходящим позициям, а не по выигравшим — флаконы и gift не входят', () => {
    const lines = [
      { kind: 'product' as const, volume: '5ml', qty: 2 },
      { kind: 'product' as const, volume: 'Full Size', qty: 10 },
      { kind: 'gift' as const, volume: null, qty: 99 },
      { kind: 'product' as const, volume: '10ml', qty: 1 },
    ]
    expect(matchingQuantity(lines, DECANTS_3)).toBe(3) // 2 + 1, не 2+10+99+1
  })
})

describe('promoConditionMet — выполнено ли условие', () => {
  it('нет minQuantity — условия нет, всегда выполнено', () => {
    expect(promoConditionMet([], ALL)).toBe(true)
    expect(promoConditionMet([{ kind: 'product', volume: '5ml', qty: 1 }], ALL)).toBe(true)
  })

  it('ровно минимум — выполнено (включительно)', () => {
    const lines = [{ kind: 'product' as const, volume: '5ml', qty: 3 }]
    expect(promoConditionMet(lines, DECANTS_3)).toBe(true)
  })

  it('меньше минимума — не выполнено', () => {
    const lines = [{ kind: 'product' as const, volume: '5ml', qty: 2 }]
    expect(promoConditionMet(lines, DECANTS_3)).toBe(false)
  })

  it('подходящих позиций достаточно, но часть из них gift — не считаются, условие не выполнено', () => {
    const lines = [
      { kind: 'product' as const, volume: '5ml', qty: 2 },
      { kind: 'gift' as const, volume: null, qty: 5 },
    ]
    expect(promoConditionMet(lines, DECANTS_3)).toBe(false)
  })
})

describe('promoRuleFrom — нормализация записи кода (БД/API)', () => {
  it('старый код без новых полей — читается как NO_PROMO_RULE', () => {
    expect(promoRuleFrom({})).toEqual(NO_PROMO_RULE)
  })

  it('appliesTo вне известных значений — трактуется как "all" (безопасный дефолт)', () => {
    expect(promoRuleFrom({ appliesTo: 'что-то-левое' })).toEqual(NO_PROMO_RULE)
  })

  it('minQuantity 0 или дробный — не условие (целое ≥1 только)', () => {
    expect(promoRuleFrom({ minQuantity: 0 }).minQuantity).toBeNull()
    expect(promoRuleFrom({ minQuantity: 2.5 }).minQuantity).toBeNull()
    expect(promoRuleFrom({ minQuantity: 3 }).minQuantity).toBe(3)
  })

  it('volumes читается только в режиме "volumes" — иначе пустой список', () => {
    expect(promoRuleFrom({ appliesTo: 'decants', volumes: ['3ml'] }).volumes).toEqual([])
    expect(promoRuleFrom({ appliesTo: 'volumes', volumes: ['3ml', '5ml'] }).volumes).toEqual([
      '3ml',
      '5ml',
    ])
  })

  it('мусор в volumes (null/undefined элементы) отфильтровывается', () => {
    expect(
      promoRuleFrom({ appliesTo: 'volumes', volumes: ['3ml', null, undefined] }).volumes,
    ).toEqual(['3ml'])
  })
})
