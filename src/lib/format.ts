import type { Locale } from '@/i18n/routing'

const INTL_LOCALE: Record<Locale, string> = {
  ro: 'ro-MD',
  ru: 'ru-MD',
  en: 'en-MD',
}

/** Цены только в MDL (PLAN.md §1), формат разделителей — по локали. */
export function formatPrice(value: number | null | undefined, locale: Locale): string {
  if (value === null || value === undefined) return '—'
  return `${new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits: 0 }).format(value)} MDL`
}

/** «5 ml» — единица не переводится, так объёмы подписаны в мокапе. */
export const formatVolume = (volume: number): string => `${volume} ml`
