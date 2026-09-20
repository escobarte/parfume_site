import type { Order } from '@/payload-types'
import { normalizePhone } from './phone'

/**
 * Единое представление заявки «для менеджера»: подписи, порядок строк,
 * форматирование чисел и дат. Отсюда берут данные письмо менеджеру и
 * печатный PDF — второго разбора заявки в проекте быть не должно, иначе
 * два канала однажды разойдутся в мелочах (как уже разъезжались подписи
 * способа оплаты между письмом и CSV).
 *
 * Модуль чистый: на вход — документ заявки, на выход — строки. Ни сети, ни
 * Payload, ни файловой системы, поэтому годится и серверу, и тестам.
 */

export const MESSENGER_LABEL: Record<string, string> = {
  telegram: 'Telegram',
  viber: 'Viber',
  whatsapp: 'WhatsApp',
  call: 'Звонок',
}

// Значения — src/collections/Orders.ts::DELIVERY_METHOD_OPTIONS.
export const DELIVERY_METHOD_LABEL: Record<string, string> = {
  pickup: 'Самовывоз',
  delivery: 'Доставка',
}

// Значения — src/collections/Orders.ts::PAYMENT_METHOD_OPTIONS.
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Наличными',
  card: 'Картой (курьеру)',
}

/**
 * Печатная версия заявки — документ для молдавского менеджера, поэтому дата
 * и время в ней местные, а не UTC. CSV исторически пишет UTC-срез ISO —
 * расхождение на смещение зоны осознанное, см. docs/GOTCHAS.md.
 */
export const ORDER_TIME_ZONE = 'Europe/Chisinau'

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  timeZone: ORDER_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** «19.09.2026, 22:45» — местное время Кишинёва. */
export function formatOrderDateTime(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  return DATE_TIME_FORMAT.format(date)
}

/**
 * Суммы в MDL с разбивкой на разряды обычным пробелом. Неразрывный пробел
 * из `Intl.NumberFormat('ru-RU')` здесь не годится: строка уходит в PDF и в
 * извлечённый из него текст, где U+00A0 ломает простой поиск по подстроке.
 */
export function formatMdl(value: number | null | undefined): string {
  const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0
  const rounded = Math.round(amount * 100) / 100
  const [whole, fraction] = String(Math.abs(rounded)).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const sign = rounded < 0 ? '-' : ''
  return `${sign}${grouped}${fraction ? `,${fraction}` : ''}`
}

/** Строка «подпись → значение» блока шапки. */
export type OrderSummaryField = { label: string; value: string }

export type OrderSummaryItem = {
  brand: string
  title: string
  volume: string
  sku: string
  qty: string
  price: string
  sum: string
}

export type OrderSummary = {
  orderNumber: string
  dateTime: string
  localeLabel: string
  /** Клиент просил не звонить — отдельная заметная пометка, не строка списка. */
  noCall: boolean
  contact: OrderSummaryField[]
  fulfilment: OrderSummaryField[]
  items: OrderSummaryItem[]
  promo: { code: string; percent: number | null; amount: number | null } | null
  total: string
  comment: string
}

export type OrderSummaryOptions = {
  /**
   * Телефон, на который выдан персональный промокод. В заявке не хранится —
   * приходит снаружи (из самого запроса или из записи кода), см.
   * `resolveOrderPromoPhone` в src/lib/orders/promo.ts. Печатается только
   * если отличается от телефона заявки.
   */
  promoPhone?: string | null
}

const trimmed = (value: unknown): string => (value === null || value === undefined ? '' : String(value).trim())

/** Оба номера приводятся к `+373XXXXXXXX`: «+373 60 12 34 56» и «060123456» — один телефон. */
const samePhone = (left: string, right: string): boolean =>
  Boolean(left) && Boolean(right) && normalizePhone(left) === normalizePhone(right)

export function buildOrderSummary(order: Order, options: OrderSummaryOptions = {}): OrderSummary {
  const customer = order.customer
  const phone = trimmed(customer?.phone)
  const promoPhone = trimmed(options.promoPhone)

  const contact: OrderSummaryField[] = [
    { label: 'Имя', value: trimmed(customer?.name) },
    { label: 'Телефон', value: phone },
    {
      label: 'Способ связи',
      value: customer?.messenger ? (MESSENGER_LABEL[customer.messenger] ?? customer.messenger) : '—',
    },
  ]

  // Отдельной строкой — и только если это ДРУГОЙ номер: код мог быть выдан на
  // личный телефон, а заказ оформлен на номер получателя (см. schema.ts).
  if (promoPhone && !samePhone(promoPhone, phone)) {
    contact.push({ label: 'Телефон промокода', value: promoPhone })
  }

  const deliveryMethod = order.deliveryMethod ?? 'pickup'
  const fulfilment: OrderSummaryField[] = [
    {
      label: 'Способ получения',
      value: DELIVERY_METHOD_LABEL[deliveryMethod] ?? deliveryMethod,
    },
  ]
  // Адрес печатается только при доставке: у самовывоза его нет по определению,
  // а пустая строка «Адрес: —» в печатном бланке только сбивает с толку.
  if (deliveryMethod === 'delivery') {
    fulfilment.push({ label: 'Адрес', value: trimmed(customer?.address) || '—' })
  }
  const paymentMethod = order.paymentMethod ?? 'cash'
  fulfilment.push({
    label: 'Способ оплаты',
    value: PAYMENT_METHOD_LABEL[paymentMethod] ?? paymentMethod,
  })

  const items: OrderSummaryItem[] = (order.items ?? []).map((item) => ({
    brand: trimmed(item.brandTitle),
    title: trimmed(item.title),
    volume: trimmed(item.volume),
    sku: trimmed(item.sku),
    qty: String(item.qty ?? 0),
    price: formatMdl(item.price),
    sum: formatMdl(item.lineTotal),
  }))

  return {
    orderNumber: trimmed(order.orderNumber),
    dateTime: formatOrderDateTime(order.createdAt),
    localeLabel: trimmed(order.locale).toUpperCase() || '—',
    noCall: order.checkoutMode === 'noCall',
    contact,
    fulfilment,
    items,
    promo: order.promoCode
      ? {
          code: order.promoCode,
          percent: order.promoDiscountPercent ?? null,
          amount: order.promoDiscountAmount ?? null,
        }
      : null,
    total: formatMdl(order.total),
    comment: trimmed(order.comment),
  }
}
