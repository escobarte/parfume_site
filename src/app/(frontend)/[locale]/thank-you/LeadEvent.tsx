'use client'

import { useEffect, useRef } from 'react'

/**
 * Событие `generate_lead` (PLAN.md §6, §9.5). Скрипт GA4 и баннер согласия
 * подключаются в фазе 7 — здесь только отправка в dataLayer, если аналитика
 * уже загружена. Дубль при повторном рендере отсекаем ref-ом.
 */
export function LeadEvent({ orderNumber }: { orderNumber: string | null }) {
  const sent = useRef(false)

  useEffect(() => {
    if (sent.current) return
    sent.current = true
    window.dataLayer?.push({
      event: 'generate_lead',
      currency: 'MDL',
      transaction_id: orderNumber ?? undefined,
    })
  }, [orderNumber])

  return null
}
