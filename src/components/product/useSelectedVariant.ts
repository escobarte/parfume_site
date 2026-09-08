'use client'

import { parseAsString, useQueryState } from 'nuqs'
import { useMemo } from 'react'
import type { ProductView, VariantView } from '@/lib/catalog/product'
import { slugify } from '@/lib/slugify'

/**
 * Выбранный объём живёт в URL (`?volume=full-size`), а не в локальном
 * состоянии: ссылка на конкретный объём уходит клиенту в мессенджер и
 * переживает перезагрузку. Значение — слуг объёма (`Full Size` → `full-size`),
 * чтобы в адресе не было `%20`; отдельной таблицы соответствий нет, слуг
 * считается из самого объёма варианта на лету.
 *
 * Мусор или объём, которого у этого товара нет, — молча игнорируется:
 * берётся дефолтный вариант (первый в наличии, как было до появления URL-
 * состояния), никакой ошибки пользователю.
 */
export function useSelectedVariant(product: ProductView): {
  variant: VariantView | undefined
  index: number
  select: (variant: VariantView) => void
} {
  const [raw, setRaw] = useQueryState('volume', parseAsString.withOptions({ history: 'replace' }))

  const { variant, index } = useMemo(() => {
    const wanted = raw ? slugify(raw) : null
    const fromUrl = wanted
      ? product.variants.findIndex((item) => slugify(item.volume) === wanted)
      : -1

    // Дефолт — первый вариант в наличии; если в наличии нет ничего, первый
    // вообще (иначе страница осталась бы без выбранного варианта совсем).
    const firstAvailable = product.variants.findIndex((item) => item.stock > 0)
    const fallback = firstAvailable >= 0 ? firstAvailable : 0
    const resolved = fromUrl >= 0 ? fromUrl : fallback

    return { variant: product.variants[resolved], index: resolved }
  }, [product.variants, raw])

  const select = (item: VariantView) => {
    void setRaw(slugify(item.volume))
  }

  return { variant, index, select }
}
