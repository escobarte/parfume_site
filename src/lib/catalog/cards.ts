import type { Media, Note, Product } from '@/payload-types'
import { discountPercent } from '@/lib/pricing'
import type { FlagOption } from './searchParams'
import type { ProductCardData } from './types'

/** Документ Payload → данные эталонной карточки (WIREFRAMES.md §3). */
export function toCard(doc: Product): ProductCardData {
  const brand = typeof doc.brand === 'object' && doc.brand ? doc.brand : null
  const notes = Array.isArray(doc.notes)
    ? doc.notes.filter((note): note is Note => typeof note === 'object' && note !== null)
    : []
  const cover = Array.isArray(doc.images)
    ? (doc.images.find((image) => typeof image === 'object') as Media | undefined)
    : undefined

  const variants = (doc.variants ?? []).filter((variant) => variant.isActive !== false)

  // Вариант B (фаза 4.5, правка): бейдж и цена ВСЕГДА об одном и том же
  // варианте. Среди уценённых (oldPrice > price) берём вариант с наибольшим
  // процентом скидки и показываем именно его цену/oldPrice/процент — это
  // не обязательно самый дешёвый объём. Если уценённых вариантов нет —
  // обычная «от {минимальная цена}» без бейджа и зачёркивания. Инвариант:
  // бейдж не может появиться без зачёркнутой цены, и наоборот — оба поля
  // выводятся из одного и того же bestDiscount.
  const discounted = variants
    .map((variant) => ({ variant, percent: discountPercent(variant.price, variant.oldPrice) }))
    .filter(
      (entry): entry is { variant: (typeof variants)[number]; percent: number } =>
        entry.percent !== null,
    )
  const bestDiscount = discounted.reduce<(typeof discounted)[number] | null>(
    (best, entry) => (best === null || entry.percent > best.percent ? entry : best),
    null,
  )

  const flags: FlagOption[] = []
  if (doc.isNew) flags.push('isNew')
  if (doc.isHit) flags.push('isHit')

  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    brandTitle: brand?.title ?? '',
    family: doc.family ?? null,
    noteTitles: notes.map((note) => note.title),
    volumes: [...new Set(variants.map((variant) => variant.volume))].sort((a, b) => a - b),
    displayPrice: bestDiscount ? bestDiscount.variant.price : (doc.minPrice ?? null),
    oldPrice: bestDiscount ? (bestDiscount.variant.oldPrice ?? null) : null,
    discountPercent: bestDiscount ? bestDiscount.percent : null,
    image: cover?.sizes?.card?.url
      ? { url: cover.sizes.card.url, alt: cover.alt ?? doc.title }
      : cover?.url
        ? { url: cover.url, alt: cover.alt ?? doc.title }
        : null,
    inStock: Boolean(doc.inStock),
    flags,
  }
}

export const toCardList = (docs: Product[]): ProductCardData[] => docs.map(toCard)
