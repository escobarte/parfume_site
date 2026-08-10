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
  'product',
  'brand',
  'volume',
  'sku',
  'qty',
  'price',
  'sum',
  'comment',
] as const

const SEPARATOR = ';'
const BOM = '﻿'

/** RFC 4180: кавычки удваиваются, поле берётся в кавычки при спецсимволах. */
function escapeCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const row = (cells: unknown[]) => cells.map(escapeCell).join(SEPARATOR)

export function buildOrderCsv(order: Order): string {
  const date = new Date(order.createdAt ?? Date.now()).toISOString().slice(0, 16).replace('T', ' ')
  const customer = order.customer

  const lines = [row([...CSV_COLUMNS])]

  for (const item of order.items ?? []) {
    lines.push(
      row([
        date,
        customer?.name ?? '',
        customer?.phone ?? '',
        customer?.messenger ?? '',
        item.title,
        item.brandTitle ?? '',
        item.volume ?? '',
        item.sku,
        item.qty,
        item.price,
        item.lineTotal,
        order.comment ?? '',
      ]),
    )
  }

  // Итоговая строка: сумма заявки в колонке sum, остальное пусто.
  lines.push(
    row([date, customer?.name ?? '', '', '', 'ИТОГО', '', '', '', '', '', order.total, '']),
  )

  return BOM + lines.join('\r\n') + '\r\n'
}

export const orderCsvFilename = (order: Order) => `${order.orderNumber ?? 'order'}.csv`
