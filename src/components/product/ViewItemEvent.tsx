'use client'

import { useEffect, useRef } from 'react'
import { cartItemsToGaItems, trackEvent } from '@/lib/analytics/gtag'

/** GA4 `view_item` (PLAN.md §7.5) — одноразово при монтировании карточки товара. */
export function ViewItemEvent({
  productId,
  title,
  brandTitle,
  price,
}: {
  productId: number | string
  title: string
  brandTitle: string
  price: number
}) {
  const sent = useRef(false)

  useEffect(() => {
    if (sent.current) return
    sent.current = true
    trackEvent('view_item', {
      currency: 'MDL',
      value: price,
      items: cartItemsToGaItems([{ productId, title, brandTitle, price, qty: 1 }]),
    })
  }, [productId, title, brandTitle, price])

  return null
}
