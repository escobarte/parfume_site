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

/**
 * Объём — фиксированный список из 5 значений (`PRODUCT_VOLUMES`), подпись
 * равна самому значению («3ml», «Travel Size» и т.п.) — единица не
 * переводится по локалям, форматировать уже нечего, функция оставлена как
 * единая точка вызова (было — для единообразия с formatPrice, и чтобы не
 * переписывать все места, где объём печатается).
 */
export const formatVolume = (volume: string): string => volume
