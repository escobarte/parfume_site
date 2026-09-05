'use client'

import { useEffect, useRef } from 'react'
import { trackEvent } from '@/lib/analytics/gtag'
import { useCart } from '@/lib/cart/store'
import { usePromo } from '@/lib/orders/promoStore'

export type LeadEventItem = {
  id?: string | number | null
  product?: number | string | { id: number | string } | null
  title: string
  brandTitle?: string | null
  qty: number
  lineTotal: number
}

const productId = (item: LeadEventItem): string | number =>
  item.product && typeof item.product === 'object' ? item.product.id : (item.product ?? item.id ?? item.title)

/**
 * Событие `generate_lead` (PLAN.md §6, §7.5) + очистка корзины после
 * успешной заявки. Единственная точка отправки этого события — `OrderForm`
 * намеренно его не шлёт (см. комментарий там), чтобы не задвоить: этот
 * компонент смонтирован уже на самой странице `/thank-you`, после
 * завершения перехода, с надёжным `transaction_id`. Дубль при повторном
 * рендере отсекаем ref-ом.
 *
 * Корзина чистится ЗДЕСЬ, а не в OrderForm сразу после ответа API: страница
 * /cart на момент ответа ещё смонтирована, и синхронный clear() там рисовал
 * бы её empty-state на долю секунды раньше, чем завершится переход на
 * thank-you (баг «вспышка пустой корзины»). Только при реальном orderNumber
 * в query — заход на /thank-you без него (например, вручную по адресу)
 * ничего не должен чистить.
 */
export function LeadEvent({
  orderNumber,
  items,
  total,
}: {
  orderNumber: string | null
  items?: LeadEventItem[]
  total?: number
}) {
  const sent = useRef(false)
  const clear = useCart((state) => state.clear)
  const clearPromo = usePromo((state) => state.clear)

  useEffect(() => {
    if (sent.current) return
    sent.current = true
    // Промокод — одноразовый, использованный код всё равно больше не пройдёт
    // проверку повторно, но стор чистим сразу же, чтобы следующая заявка
    // случайно не унаследовала показанную скидку от предыдущей (фаза 11.2,
    // задача 7).
    if (orderNumber) {
      clear()
      clearPromo()
    }
    trackEvent('generate_lead', {
      currency: 'MDL',
      value: total,
      transaction_id: orderNumber ?? undefined,
      items: items?.map((item) => ({
        item_id: String(productId(item)),
        item_name: item.title,
        item_brand: item.brandTitle || undefined,
        price: item.qty > 0 ? item.lineTotal / item.qty : item.lineTotal,
        quantity: item.qty,
      })),
    })
  }, [orderNumber, items, total, clear, clearPromo])

  return null
}
