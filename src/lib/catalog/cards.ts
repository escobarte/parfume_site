import type { Media, Note, Product } from '@/payload-types'
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

  const flags: FlagOption[] = []
  if (doc.isNew) flags.push('isNew')
  if (doc.isHit) flags.push('isHit')
  if (doc.isSale) flags.push('isSale')

  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    brandTitle: brand?.title ?? '',
    family: doc.family ?? null,
    noteTitles: notes.map((note) => note.title),
    volumes: [...new Set(variants.map((variant) => variant.volume))].sort((a, b) => a - b),
    minPrice: doc.minPrice ?? null,
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
