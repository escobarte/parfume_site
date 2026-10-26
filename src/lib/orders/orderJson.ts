import type { Order } from '@/payload-types'

/**
 * Сборщик JSON-снапшота заявки для экспорта в папку для 1С
 * (`ORDER_EXPORT_DIR`, см. `orderExport.ts`) — чистая функция от документа
 * заказа, не от CSV (`src/lib/orders/csv.ts`): формат под 1С и формат под
 * Excel независимы и могут расходиться по структуре.
 *
 * Правило: ключ присутствует всегда, отсутствующее значение — `null`, а не
 * пропущенный ключ и не `undefined` (тот `JSON.stringify` бы выбросил) —
 * чтобы парсер на стороне 1С не падал на недостающем поле и не зависел от
 * того, какие поля были заполнены в конкретной заявке.
 *
 * `statusToken` и `exportCsv` намеренно не включены — служебные поля сайта,
 * 1С они не нужны (ТЗ).
 */

const emptyToNull = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null
  return value.trim() === '' ? null : value
}

const isoDate = (value: string | null | undefined): string | null =>
  value ? new Date(value).toISOString() : null

const itemKind = (item: NonNullable<Order['items']>[number]): 'product' | 'gift' =>
  item.product ? 'product' : 'gift'

export interface OrderJsonItem {
  kind: 'product' | 'gift'
  sku: string
  title: string
  brand: string | null
  volume: string | null
  qty: number
  basePrice: number | null
  discountPercent: number | null
  discountSource: string | null
  price: number
  lineTotal: number
}

export interface OrderJsonData {
  orderNumber: string | null
  createdAt: string | null
  updatedAt: string | null
  status: string
  locale: string | null
  customer: {
    name: string
    phone: string
    email: string | null
    address: string | null
    messenger: string | null
  }
  deliveryMethod: string
  paymentMethod: string
  checkoutMode: string
  comment: string | null
  items: OrderJsonItem[]
  promo: {
    code: string | null
    percent: number | null
    amount: number | null
  }
  total: number
  currency: 'MDL'
}

export function buildOrderJsonData(order: Order): OrderJsonData {
  const customer = order.customer

  return {
    orderNumber: emptyToNull(order.orderNumber),
    createdAt: isoDate(order.createdAt),
    updatedAt: isoDate(order.updatedAt),
    status: order.status,
    locale: emptyToNull(order.locale ?? null),
    customer: {
      name: customer?.name ?? '',
      phone: customer?.phone ?? '',
      email: emptyToNull(customer?.email),
      address: emptyToNull(customer?.address),
      messenger: emptyToNull(customer?.messenger ?? null),
    },
    deliveryMethod: order.deliveryMethod,
    paymentMethod: order.paymentMethod,
    checkoutMode: order.checkoutMode,
    comment: emptyToNull(order.comment),
    items: (order.items ?? []).map((item) => ({
      kind: itemKind(item),
      sku: item.sku,
      title: item.title,
      brand: emptyToNull(item.brandTitle),
      volume: emptyToNull(item.volume ?? null),
      qty: item.qty,
      basePrice: item.basePrice ?? null,
      discountPercent: item.discountPercent ?? null,
      discountSource: emptyToNull(item.discountSource ?? null),
      price: item.price,
      lineTotal: item.lineTotal,
    })),
    promo: {
      code: emptyToNull(order.promoCode),
      percent: order.promoDiscountPercent ?? null,
      amount: order.promoDiscountAmount ?? null,
    },
    total: order.total,
    currency: 'MDL',
  }
}

export function buildOrderJson(order: Order): string {
  return JSON.stringify(buildOrderJsonData(order), null, 2)
}

export const orderJsonFilename = (order: Order) => `${order.orderNumber ?? 'order'}.json`
