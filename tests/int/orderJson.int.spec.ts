// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { buildOrderJson, buildOrderJsonData, orderJsonFilename } from '@/lib/orders/orderJson'
import type { Order } from '@/payload-types'

/**
 * Сборщик JSON-снапшота заявки для 1С — чистая функция от документа заказа,
 * БД тут не нужна. Покрывает ровно то, что важно получателю-парсеру: ключи
 * не пропадают при пустых полях, числа совпадают с данными заказа, служебные
 * поля сайта (`statusToken`/`exportCsv`) не просачиваются, даты — ISO 8601
 * с `Z`.
 */

type OrderItem = NonNullable<Order['items']>[number]

const item = (overrides: Partial<OrderItem> & Pick<OrderItem, 'sku' | 'title'>): OrderItem => ({
  product: 1,
  brandTitle: 'Maison Orphée',
  volume: '5ml',
  price: 240,
  qty: 1,
  lineTotal: 240,
  ...overrides,
})

const order = (overrides: Partial<Order> = {}): Order =>
  ({
    id: 1,
    orderNumber: 'MF-261025-AB12',
    statusToken: 'secret-token-not-for-1c',
    status: 'new',
    checkoutMode: 'standard',
    deliveryMethod: 'pickup',
    paymentMethod: 'cash',
    locale: 'ro',
    source: 'cart',
    customer: {
      name: 'Ștefan Țurcanu',
      phone: '+37360123456',
      email: 'stefan@example.com',
      address: 'str. Exemplu 1',
      messenger: 'viber',
    },
    comment: 'Livrare seara',
    items: [item({ title: 'Signature Wood', sku: 'MO-SW-05', qty: 2, lineTotal: 480 })],
    total: 480,
    exportCsv: 'date;name\r\n...',
    createdAt: '2026-10-25T10:15:30.000Z',
    updatedAt: '2026-10-25T10:15:30.000Z',
    ...overrides,
  }) as Order

describe('buildOrderJsonData', () => {
  it('не включает statusToken и exportCsv', () => {
    const json = buildOrderJsonData(order())
    const raw = JSON.stringify(json)
    expect(raw).not.toContain('statusToken')
    expect(raw).not.toContain('secret-token-not-for-1c')
    expect(raw).not.toContain('exportCsv')
    expect(raw).not.toContain('date;name')
  })

  it('даты — ISO 8601 с Z', () => {
    const json = buildOrderJsonData(order())
    expect(json.createdAt).toBe('2026-10-25T10:15:30.000Z')
    expect(json.updatedAt).toBe('2026-10-25T10:15:30.000Z')
  })

  it('сумма позиций совпадает с итогом заказа', () => {
    const json = buildOrderJsonData(
      order({
        items: [
          item({ title: 'A', sku: 'A-1', qty: 1, price: 100, lineTotal: 100 }),
          item({ title: 'B', sku: 'B-1', qty: 2, price: 90, lineTotal: 180 }),
        ],
        total: 280,
      }),
    )
    const sum = json.items.reduce((acc, line) => acc + line.lineTotal, 0)
    expect(sum).toBe(json.total)
    expect(json.total).toBe(280)
  })

  it('пустые поля — null, ключи не пропадают (заказ без email и без адреса, самовывоз)', () => {
    const json = buildOrderJsonData(
      order({
        deliveryMethod: 'pickup',
        customer: { name: 'Ion Popescu', phone: '+37369112233' },
      }),
    )
    expect(json.customer.email).toBeNull()
    expect(json.customer.address).toBeNull()
    expect(json.customer.messenger).toBeNull()
    expect(json.deliveryMethod).toBe('pickup')
    expect('email' in json.customer).toBe(true)
    expect('address' in json.customer).toBe(true)
    expect(json.promo).toEqual({ code: null, percent: null, amount: null })
  })

  it('доставка: адрес заполнен и присутствует как есть', () => {
    const json = buildOrderJsonData(
      order({
        deliveryMethod: 'delivery',
        customer: { name: 'Ion Popescu', phone: '+37369112233', address: 'str. Livrare 5' },
      }),
    )
    expect(json.deliveryMethod).toBe('delivery')
    expect(json.customer.address).toBe('str. Livrare 5')
  })

  it('позиция без скидки — basePrice/discountPercent/discountSource равны null, а не пропущены', () => {
    const json = buildOrderJsonData(
      order({ items: [item({ title: 'Без скидки', sku: 'NO-DISC' })] }),
    )
    const [line] = json.items
    expect(line.basePrice).toBeNull()
    expect(line.discountPercent).toBeNull()
    expect(line.discountSource).toBeNull()
    expect('basePrice' in line).toBe(true)
  })

  it('позиция со скидкой товара — снапшот скидки совпадает с данными заказа', () => {
    const json = buildOrderJsonData(
      order({
        items: [
          item({
            title: 'Amber Sale',
            sku: 'MO-AS-30',
            volume: 'Full Size',
            price: 800,
            qty: 1,
            lineTotal: 800,
            basePrice: 1200,
            discountPercent: 33,
            discountSource: 'product',
          }),
        ],
        total: 800,
      }),
    )
    const [line] = json.items
    expect(line).toMatchObject({ basePrice: 1200, discountPercent: 33, discountSource: 'product' })
  })

  it('заказ с промокодом — promo{code,percent,amount} из полей заказа', () => {
    const json = buildOrderJsonData(
      order({
        promoCode: 'WELCOME-ABC123',
        promoDiscountPercent: 15,
        promoDiscountAmount: 36,
        items: [
          item({
            title: 'Signature Wood',
            sku: 'MO-SW-05',
            price: 204,
            qty: 1,
            lineTotal: 204,
            basePrice: 240,
            discountPercent: 15,
            discountSource: 'promo',
          }),
        ],
        total: 204,
      }),
    )
    expect(json.promo).toEqual({ code: 'WELCOME-ABC123', percent: 15, amount: 36 })
    expect(json.items[0].discountSource).toBe('promo')
  })

  it('подарочная позиция — kind: gift, без volume, без product', () => {
    const json = buildOrderJsonData(
      order({
        items: [
          {
            title: 'Gift Box Royal',
            brandTitle: '',
            sku: 'GB-ROYAL',
            price: 350,
            qty: 1,
            lineTotal: 350,
          } as OrderItem,
        ],
        total: 350,
      }),
    )
    const [line] = json.items
    expect(line.kind).toBe('gift')
    expect(line.volume).toBeNull()
    expect(line.brand).toBeNull()
  })

  it('товарная позиция (ссылка на product) — kind: product', () => {
    const json = buildOrderJsonData(
      order({ items: [item({ title: 'X', sku: 'X-1', product: 1 })] }),
    )
    expect(json.items[0].kind).toBe('product')
  })

  it('смешанная корзина — у каждой позиции свой kind', () => {
    const json = buildOrderJsonData(
      order({
        items: [
          item({ title: 'Товар', sku: 'P-1', product: 1 }),
          {
            title: 'Gift',
            brandTitle: '',
            sku: 'G-1',
            price: 100,
            qty: 1,
            lineTotal: 100,
          } as OrderItem,
        ],
        total: 340,
      }),
    )
    expect(json.items.map((line) => line.kind)).toEqual(['product', 'gift'])
  })
})

describe('buildOrderJson / orderJsonFilename', () => {
  it('buildOrderJson отдаёт валидный JSON-текст', () => {
    const text = buildOrderJson(order())
    expect(() => JSON.parse(text)).not.toThrow()
    expect(JSON.parse(text).orderNumber).toBe('MF-261025-AB12')
  })

  it('имя файла — номер заявки, с расширением .json', () => {
    expect(orderJsonFilename(order())).toBe('MF-261025-AB12.json')
    expect(orderJsonFilename(order({ orderNumber: null }))).toBe('order.json')
  })
})
