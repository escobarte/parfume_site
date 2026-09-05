import type { Order } from '@/payload-types'

/**
 * CSV одной заявки: одна строка = одна позиция, шапка заказа повторяется
 * в каждой строке (так файл открывается и фильтруется в Excel без сводок).
 *
 * Формат под Excel, а не под 1С: разделитель `;` и BOM в начале — без BOM
 * Excel читает UTF-8 как ANSI и кириллица превращается в мусор.
 */
export const CSV_COLUMNS = [
  'date',
  'name',
  'phone',
  'messenger',
  // Способ оформления и адрес (фаза 9.1). В таблице шапка фиксированная,
  // поэтому «опускать пустое поле» здесь = пустая ячейка, а не исчезающая
  // колонка: иначе файл перестанет открываться единой таблицей в Excel.
  'checkoutMode',
  // Способ получения и оплаты (фаза 11.2, задачи 5/6) — та же логика фиксированной шапки.
  'deliveryMethod',
  'paymentMethod',
  'address',
  'product',
  'brand',
  'volume',
  'sku',
  'qty',
  'price',
  'sum',
  // Промокод (фаза 11.2, задача 7) — заполнено только в итоговой строке,
  // как и sum (скидка — на заказ целиком, не на позицию).
  'promoCode',
  'discount',
  'comment',
] as const

/** Подписи способа оформления в CSV — по-русски, как весь файл заявки. */
const CHECKOUT_MODE_CSV: Record<string, string> = {
  standard: '',
  noCall: 'БЕЗ ЗВОНКА',
}

/** Подписи способа получения (фаза 11.2, задача 5) — по-русски, как весь файл. */
const DELIVERY_METHOD_CSV: Record<string, string> = {
  pickup: 'Самовывоз',
  delivery: 'Доставка',
}

/** Подписи способа оплаты (фаза 11.2, задача 6) — по-русски, как весь файл. */
const PAYMENT_METHOD_CSV: Record<string, string> = {
  cash: 'Наличными',
  card: 'Картой',
}

const SEPARATOR = ';'
const BOM = '﻿'

/** RFC 4180: кавычки удваиваются, поле берётся в кавычки при спецсимволах. */
function escapeCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const row = (cells: unknown[]) => cells.map(escapeCell).join(SEPARATOR)

/** Позиции одной заявки + её итоговая строка — общая часть для одиночного и массового CSV. */
function orderRows(order: Order): string[] {
  const date = new Date(order.createdAt ?? Date.now()).toISOString().slice(0, 16).replace('T', ' ')
  const customer = order.customer
  const rows: string[] = []

  for (const item of order.items ?? []) {
    rows.push(
      row([
        date,
        customer?.name ?? '',
        customer?.phone ?? '',
        customer?.messenger ?? '',
        CHECKOUT_MODE_CSV[order.checkoutMode ?? 'standard'] ?? '',
        DELIVERY_METHOD_CSV[order.deliveryMethod ?? 'pickup'] ?? '',
        PAYMENT_METHOD_CSV[order.paymentMethod ?? 'cash'] ?? '',
        customer?.address ?? '',
        item.title,
        item.brandTitle ?? '',
        item.volume ?? '',
        item.sku,
        item.qty,
        item.price,
        item.lineTotal,
        '',
        '',
        order.comment ?? '',
      ]),
    )
  }

  // Итоговая строка: сумма заявки (уже со скидкой) в sum, промокод и сумма
  // скидки — тут же, остальное пусто.
  rows.push(
    row([
      date,
      customer?.name ?? '',
      '',
      '',
      '',
      '',
      '',
      '',
      'ИТОГО',
      '',
      '',
      '',
      '',
      '',
      order.total,
      order.promoCode ?? '',
      order.promoDiscountAmount ?? '',
      '',
    ]),
  )

  return rows
}

export function buildOrderCsv(order: Order): string {
  return BOM + [row([...CSV_COLUMNS]), ...orderRows(order)].join('\r\n') + '\r\n'
}

/**
 * Массовый CSV (фаза 4.7.4): один файл на несколько выбранных заявок —
 * одна шапка сверху, позиции + итоговая строка каждой заявки одна за другой.
 */
export function buildOrdersCsvBulk(orders: Order[]): string {
  const lines = [row([...CSV_COLUMNS])]
  for (const order of orders) lines.push(...orderRows(order))
  return BOM + lines.join('\r\n') + '\r\n'
}

export const orderCsvFilename = (order: Order) => `${order.orderNumber ?? 'order'}.csv`
