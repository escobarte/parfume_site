'use client'

import { useEffect, useRef } from 'react'
import { useCart } from '@/lib/cart/store'

/**
 * Событие `generate_lead` (PLAN.md §6, §9.5) + очистка корзины после
 * успешной заявки. Скрипт GA4 и баннер согласия подключаются в фазе 7 —
 * здесь только отправка в dataLayer, если аналитика уже загружена. Дубль
 * при повторном рендере отсекаем ref-ом.
 *
 * Корзина чистится ЗДЕСЬ, а не в OrderForm сразу после ответа API: страница
 * /cart на момент ответа ещё смонтирована, и синхронный clear() там рисовал
 * бы её empty-state на долю секунды раньше, чем завершится переход на
 * thank-you (баг «вспышка пустой корзины»). Только при реальном orderNumber
 * в query — заход на /thank-you без него (например, вручную по адресу)
 * ничего не должен чистить.
 */
export function LeadEvent({ orderNumber }: { orderNumber: string | null }) {
  const sent = useRef(false)
  const clear = useCart((state) => state.clear)

  useEffect(() => {
    if (sent.current) return
    sent.current = true
    if (orderNumber) clear()
    window.dataLayer?.push({
      event: 'generate_lead',
      currency: 'MDL',
      transaction_id: orderNumber ?? undefined,
    })
  }, [orderNumber, clear])

  return null
}
