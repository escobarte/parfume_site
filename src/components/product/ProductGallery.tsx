'use client'

import type { ProductView } from '@/lib/catalog/product'
import { Gallery } from './Gallery'
import { useSelectedVariant } from './useSelectedVariant'

/**
 * Связка «выбранный объём → главное фото». Отдельный тонкий клиентский слой
 * нужен только чтобы `Gallery` осталась тупой: она про показ фото, а какой
 * вариант сейчас выбран — знание страницы товара.
 *
 * Провайдер/контекст не заводился намеренно: состояние объёма живёт в URL
 * (nuqs), поэтому этот компонент и `BuyBlock` в другой колонке синхронны сами
 * по себе, без общего родителя — страница остаётся серверной целиком.
 */
export function ProductGallery({ product }: { product: ProductView }) {
  const { variant } = useSelectedVariant(product)
  const image = variant?.image ?? null

  return (
    <Gallery
      images={product.images}
      title={product.title}
      variantImage={image ? { url: image.url, full: image.url, alt: image.alt } : null}
    />
  )
}
