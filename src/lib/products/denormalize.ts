import { discountPercent } from '@/lib/pricing'

/**
 * Денормализация вариантов товара (PLAN.md §4.1, §4.5).
 * minPrice / maxPrice / inStock / hasDiscount / maxDiscountPercent руками
 * не заполняются — только этой функцией из хука beforeChange коллекции products.
 */
export type VariantLike = {
  price?: number | null
  oldPrice?: number | null
  stock?: number | null
  isActive?: boolean | null
}

export type Denormalized = {
  minPrice: number | null
  maxPrice: number | null
  inStock: boolean
  hasDiscount: boolean
  /** 0, если скидки нет ни на одном варианте — удобно для сортировки по убыванию. */
  maxDiscountPercent: number
}

export function denormalizeVariants(variants: VariantLike[] | null | undefined): Denormalized {
  const active = (variants ?? []).filter(
    (variant): variant is VariantLike & { price: number } =>
      !!variant && variant.isActive !== false && typeof variant.price === 'number',
  )

  const prices = active.map((variant) => variant.price)

  const discounts = active
    .map((variant) => discountPercent(variant.price, variant.oldPrice))
    .filter((percent): percent is number => percent !== null)

  return {
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    inStock: active.some((variant) => (variant.stock ?? 0) > 0),
    hasDiscount: discounts.length > 0,
    maxDiscountPercent: discounts.length ? Math.max(...discounts) : 0,
  }
}
