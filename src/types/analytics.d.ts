/** GA4 подключается в фазе 7; до этого dataLayer может отсутствовать. */
declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[]
  }
}

export {}
