/** GA4 Measurement ID — плейсхолдер до боевого домена (PLAN.md §9.5, .env.example). */
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID
export const isGaConfigured = (id: string | undefined = GA_ID): boolean =>
  Boolean(id && !id.startsWith('CHANGEME'))

export type GaItem = {
  item_id: string
  item_name: string
  item_brand?: string
  price: number
  quantity: number
}

/**
 * Единая точка отправки GA4-событий (PLAN.md §7.5: view_item/add_to_cart/
 * begin_checkout/generate_lead). Оборачивает `window.gtag` — до согласия на
 * куки и до загрузки `gtag.js` (`GoogleAnalytics.tsx`) тихо no-op, вызывать
 * без проверок можно откуда угодно.
 */
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  window.gtag?.('event', name, params)
}

export const cartItemsToGaItems = (
  items: { productId: number | string; title: string; brandTitle: string; price: number; qty: number }[],
): GaItem[] =>
  items.map((item) => ({
    item_id: String(item.productId),
    item_name: item.title,
    item_brand: item.brandTitle || undefined,
    price: item.price,
    quantity: item.qty,
  }))

export const cartValue = (items: { price: number; qty: number }[]): number =>
  items.reduce((sum, item) => sum + item.price * item.qty, 0)
