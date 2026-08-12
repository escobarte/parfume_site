/** GA4 (фаза 7.5): `gtag.js` определяет оба поля на `window` при загрузке. */
declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

export {}
