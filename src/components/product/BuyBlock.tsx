'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useSelectedVariant } from './useSelectedVariant'
import { useRouter } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { cartItemsToGaItems, trackEvent } from '@/lib/analytics/gtag'
import { useCart } from '@/lib/cart/store'
import type { ProductView } from '@/lib/catalog/product'
import { formatPrice, formatVolume } from '@/lib/format'
import { discountPercent } from '@/lib/pricing'
import { useToast } from '@/lib/ui/toast'
import { DiscountBadge } from '@/components/catalog/DiscountBadge'

/**
 * Переключатель объёма и кнопки покупки. Смена объёма меняет цену, SKU
 * и наличие без перезагрузки. Состояние выбранного объёма живёт в URL
 * (`?volume=full-size`, см. `useSelectedVariant`) — оттуда же его читает
 * галерея в соседней колонке, поэтому фото меняется вместе с ценой без
 * общего родителя. Вариант с нулевым остатком выбрать нельзя.
 */
export function BuyBlock({ product }: { product: ProductView }) {
  const t = useTranslations('Product')
  const locale = useLocale() as Locale
  const add = useCart((state) => state.add)
  const showCartToast = useToast((state) => state.showCartToast)
  const router = useRouter()

  const { variant, index, select } = useSelectedVariant(product)
  const [added, setAdded] = useState(false)

  if (!variant) return null

  // В корзину и в тост — фото выбранного варианта, с тем же фоллбэком на
  // первое фото товара: иначе в корзине у 3ml стояло бы фото полноразмерного
  // флакона.
  const image = variant.image?.url ?? product.images[0]?.url ?? null

  const available = variant.stock > 0
  // Пересчитывается при каждом переключении объёма — index меняет variant,
  // а не хранится отдельным состоянием (PLAN.md §4.5).
  const percent = discountPercent(variant.price, variant.oldPrice)

  const putInCart = () => {
    const brandTitle = product.brand?.title ?? ''
    add({
      kind: 'product',
      productId: product.id,
      slug: product.slug,
      title: product.title,
      brandTitle,
      sku: variant.sku,
      volume: variant.volume,
      price: variant.price,
      // Кладётся по тому же правилу, что и зачёркнутая цена ниже (`percent
      // !== null`): «уценка есть только если oldPrice реально выше price».
      // Без этого корзина до ответа `/api/cart-revalidate` не показывала бы
      // зачёркнутую цену и считала бы промокод от уже уценённой price —
      // то есть по старому правилу, отменённому 2026-09-12.
      oldPrice: percent !== null ? variant.oldPrice : null,
      image,
    })
    trackEvent('add_to_cart', {
      currency: 'MDL',
      value: variant.price,
      items: cartItemsToGaItems([
        { productId: product.id, title: product.title, brandTitle, price: variant.price, qty: 1 },
      ]),
    })
  }

  const addToCart = () => {
    putInCart()
    // Подпись на кнопке — локальная реакция, тост — общая (фаза 9.1):
    // кнопку можно не увидеть, если экран прокручен, плашку видно всегда.
    showCartToast({
      title: product.title,
      brandTitle: product.brand?.title ?? '',
      volume: variant.volume,
      image,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  /** «В 1 клик» — то же добавление, но сразу к форме заявки. */
  const oneClick = () => {
    putInCart()
    router.push('/cart')
  }

  return (
    <div>
      <div className="text-ink-muted text-eyebrow tracking-display mb-2 uppercase">
        {t('volume')}
      </div>
      <div className="flex flex-wrap gap-2">
        {product.variants.map((item, itemIndex) => {
          const disabled = item.stock === 0
          const active = itemIndex === index
          return (
            <button
              key={item.sku}
              type="button"
              disabled={disabled}
              onClick={() => select(item)}
              className={`text-label rounded-sm border px-3 py-1.5 transition-colors ${
                active
                  ? 'border-navy bg-navy text-cream'
                  : disabled
                    ? 'border-line text-ink-subtle cursor-not-allowed line-through'
                    : 'border-line text-ink hover:border-navy cursor-pointer'
              }`}
            >
              {formatVolume(item.volume)}
            </button>
          )
        })}
      </div>

      {/* Зачёркнутая старая цена — слева от актуальной (промпт «новая логика
          цены товара»), тот же порядок, что теперь и на карточке каталога. */}
      <div className="border-line mt-6 flex flex-wrap items-baseline gap-3 border-t pt-6">
        {percent !== null && (
          <span className="text-ink-muted text-body line-through">
            {formatPrice(variant.oldPrice, locale)}
          </span>
        )}
        <span className="text-ink text-display font-medium">
          {formatPrice(variant.price, locale)}
        </span>
        {percent !== null && <DiscountBadge percent={percent} />}
        <span
          className={`text-eyebrow tracking-label ml-auto uppercase ${
            available ? 'text-ink-muted' : 'text-danger'
          }`}
        >
          {available ? t('inStock') : t('outOfStock')}
        </span>
      </div>

      <p className="text-ink-subtle text-eyebrow tracking-label mt-2 uppercase">
        {t('sku')}: {variant.sku}
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={!available}
          onClick={addToCart}
          className="bg-navy text-cream text-label tracking-display flex-1 cursor-pointer rounded-sm px-6 py-3.5 uppercase transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {added ? t('added') : t('addToCart')}
        </button>
        <button
          type="button"
          disabled={!available}
          onClick={oneClick}
          className="border-navy text-navy hover:bg-navy hover:text-cream text-label tracking-display flex-1 cursor-pointer rounded-sm border px-6 py-3.5 uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('oneClick')}
        </button>
      </div>
    </div>
  )
}
