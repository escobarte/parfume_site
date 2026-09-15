'use client'

/**
 * Согласие на аналитику (PLAN.md §7.5) — простое двоичное решение,
 * хранится в localStorage (не куки в буквальном смысле — но той же природы
 * и назначения: разовый выбор пользователя, переживающий визиты). До выбора
 * баннер виден, GA4 не грузится ни в каком виде — `GoogleAnalytics.tsx`
 * не рендерит `<Script>`, пока согласие не `'granted'`.
 */
export type Consent = 'granted' | 'denied'

const KEY = 'mf-consent'
const EVENT = 'mf-consent-changed'

/**
 * Выбор, сделанный при недоступном localStorage (Firefox с запретом cookie,
 * часть встроенных браузеров) — даже само обращение `window.localStorage`
 * там бросает `SecurityError`. Без try/catch это исключение летело из
 * `getSnapshot` баннера и `GoogleAnalytics` прямо в рендер и роняло витрину.
 * Теперь: не удалось прочитать — согласие «не дано» (баннер показывается,
 * GA4 не грузится); выбор по кнопке держится в памяти до перезагрузки.
 */
let memoryConsent: Consent | null = null

export function getConsent(): Consent | null {
  if (typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem(KEY)
    return value === 'granted' || value === 'denied' ? value : null
  } catch {
    return memoryConsent
  }
}

export function setConsent(value: Consent): void {
  try {
    window.localStorage.setItem(KEY, value)
  } catch {
    memoryConsent = value
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: value }))
}

/** Подписка на смену согласия в текущей вкладке (localStorage сам по себе не шлёт событий в том же окне). */
export function onConsentChange(callback: (value: Consent) => void): () => void {
  const handler = (event: Event) => callback((event as CustomEvent<Consent>).detail)
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
