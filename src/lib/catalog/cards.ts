import type { Media, Note, Product } from '@/payload-types'
import { discountPercent } from '@/lib/pricing'
import type { FlagOption } from './searchParams'
import type { ProductCardData } from './types'
import { volumeOrder } from './volumes'

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

  // Новая логика цены (промпт «новая логика цены товара»): карточка больше
  // не показывает диапазон/«от X» — одна цена, максимальная среди активных
  // вариантов. Скидка теперь гарантированно единая на ВСЕ активные варианты
  // сразу или ни на один (валидация в Products.ts, `variantsDiscountConsistent`)
  // — поэтому больше не нужно искать «лучший уценённый вариант» отдельно от
  // максимального по цене: если скидка есть у товара, она есть и у
  // максимального варианта, oldPrice/percent читаются прямо с него.
  const maxPriceVariant = variants.reduce<(typeof variants)[number] | null>(
    (best, variant) =>
      best === null || (variant.price ?? -Infinity) > (best.price ?? -Infinity) ? variant : best,
    null,
  )
  const percent = maxPriceVariant
    ? discountPercent(maxPriceVariant.price, maxPriceVariant.oldPrice)
    : null

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
    // Boolean(v) — вариант без объёма (легаси-строка, ещё не переустановлена
    // после смены модели) не должен показывать пустой чип на карточке.
    volumes: [...new Set(variants.map((variant) => variant.volume).filter(Boolean))].sort(
      (a, b) => volumeOrder(a) - volumeOrder(b),
    ),
    displayPrice: maxPriceVariant ? maxPriceVariant.price : (doc.maxPrice ?? null),
    oldPrice: maxPriceVariant ? (maxPriceVariant.oldPrice ?? null) : null,
    discountPercent: percent,
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
