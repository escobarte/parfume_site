import { unstable_cache } from 'next/cache'
import { CACHE_TTL } from '@/lib/cache'
import type { Locale } from '@/i18n/routing'
import type { GiftItem, Media } from '@/payload-types'
import { getPayloadClient } from '@/lib/payload'
import { GIFT_TAG } from '@/lib/revalidate'

export type GiftItemType = GiftItem['type']

export type GiftVariantView = {
  sku: string
  amount: number
  stock: number
}

export type GiftItemView = {
  id: number | string
  slug: string
  title: string
  type: GiftItemType
  description: unknown
  image: { url: string; alt: string } | null
  variants: GiftVariantView[]
  inStock: boolean
}

function toView(doc: GiftItem): GiftItemView {
  const image = typeof doc.image === 'object' && doc.image ? (doc.image as Media) : null

  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    type: doc.type,
    description: doc.description ?? null,
    image: image
      ? { url: image.sizes?.card?.url ?? image.url ?? '', alt: image.alt ?? doc.title }
      : null,
    variants: (doc.variants ?? [])
      .filter((variant) => variant.isActive !== false)
      .map((variant) => ({ sku: variant.sku, amount: variant.amount, stock: variant.stock ?? 0 }))
      .sort((a, b) => a.amount - b.amount),
    inStock: Boolean(doc.inStock),
  }
}

/**
 * Листинг раздела («Подарочные сертификаты»/«Gift box», фаза 11.1, задача 2)
 * — тот же принцип кэша, что у каталога товаров (`getProductCards`), но
 * отдельный тег (`GIFT_TAG`): правка обычного товара не должна сбрасывать
 * кэш этого списка и наоборот.
 */
export const getGiftItems = (type: GiftItemType, locale: Locale) =>
  unstable_cache(
    async (): Promise<GiftItemView[]> => {
      const payload = await getPayloadClient()
      const { docs } = await payload.find({
        collection: 'gift-items',
        locale,
        depth: 1,
        limit: 100,
        sort: 'title',
        where: { type: { equals: type } },
      })
      return docs.map(toView)
    },
    ['gift-items', type, locale],
    { tags: [GIFT_TAG], revalidate: CACHE_TTL },
  )()
