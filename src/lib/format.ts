import type { Locale } from '@/i18n/routing'
import { VOLUME_LABELS, type VolumeValue } from '@/lib/catalog/volume'

const INTL_LOCALE: Record<Locale, string> = {
  ro: 'ro-MD',
  ru: 'ru-MD',
  en: 'en-MD',
}

const formatNumber = (value: number, locale: Locale) =>
  new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits: 0 }).format(value)

/** Цены только в MDL (PLAN.md §1), формат разделителей — по локали. */
export function formatPrice(value: number | null | undefined, locale: Locale): string {
  if (value === null || value === undefined) return '—'
  return `${formatNumber(value, locale)} MDL`
}

/**
 * Диапазон цен товара (ПРОМПТ 12-дополнение) — «{min}–{max} MDL» вместо
 * одиночного «от X MDL». Совпадающие min/max (единственный вариант или все
 * варианты по одной цене) — одно число, без тире и без дублирования.
 */
export function formatPriceRange(
  min: number | null,
  max: number | null,
  locale: Locale,
): string {
  if (min === null && max === null) return '—'
  if (min === null || max === null || min === max) return formatPrice(min ?? max, locale)
  return `${formatNumber(min, locale)}–${formatNumber(max, locale)} MDL`
}

/** «3 ml»/«Travel Size»/«Full Size» — фиксированный список, не переводится по локалям. */
export const formatVolume = (volume: VolumeValue): string => VOLUME_LABELS[volume] ?? volume
