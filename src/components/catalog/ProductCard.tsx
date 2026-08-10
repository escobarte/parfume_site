import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { BottleGlyph } from '@/components/brand/BrandMark'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import type { ProductCardData } from '@/lib/catalog/types'
import { formatPrice, formatVolume } from '@/lib/format'
import { DiscountBadge } from './DiscountBadge'

/**
 * Эталонная карточка товара (WIREFRAMES.md §3) — одна на весь сайт:
 * фото-зона на тёплом фоне, рамка 1px, ховер — navy-рамка, без теней.
 */
export async function ProductCard({
  product,
  locale,
  priority = false,
}: {
  product: ProductCardData
  locale: Locale
  priority?: boolean
}) {
  const [t, tf, tp] = await Promise.all([
    getTranslations('Catalog'),
    getTranslations('Catalog.family'),
    getTranslations('Product'),
  ])

  const subtitle = [
    product.family ? tf(product.family) : null,
    product.noteTitles.slice(0, 3).join(', ').toLowerCase() || null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <article className="border-line hover:border-navy rounded-sm border transition-colors">
      <Link href={`/product/${product.slug}`} className="block">
        <div className="bg-surface-warm relative flex h-[190px] items-center justify-center overflow-hidden">
          {product.image ? (
            <Image
              src={product.image.url}
              alt={product.image.alt}
              fill
              priority={priority}
              sizes="(max-width: 767px) 50vw, (max-width: 1279px) 33vw, 25vw"
              className="object-contain p-4"
            />
          ) : (
            <BottleGlyph className="text-navy h-32 w-auto" />
          )}
          {product.discountPercent !== null && (
            <DiscountBadge
              percent={product.discountPercent}
              className="absolute top-2.5 right-2.5"
            />
          )}
        </div>

        <div className="flex flex-col gap-1.5 p-4">
          {product.brandTitle && (
            <span className="text-ink-muted text-micro tracking-label uppercase">
              {product.brandTitle}
            </span>
          )}
          <h3 className="text-ink text-body font-medium">{product.title}</h3>
          {subtitle && <p className="text-ink-muted text-label">{subtitle}</p>}

          {product.volumes.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {product.volumes.map((volume) => (
                <span
                  key={volume}
                  className="border-line text-ink-muted text-eyebrow rounded-sm border px-1.5 py-0.5"
                >
                  {formatVolume(volume)}
                </span>
              ))}
            </div>
          )}

          {/* Цена и наличие — одна строка: слева цена, справа плашка.
              Плашка — текст, а не подложка: линия и цвет вместо теней
              (BRAND.md §5), «нет в наличии» уходит в приглушённый тон. */}
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-ink text-body font-medium">
              {t('from')} {formatPrice(product.displayPrice, locale)}
              {product.oldPrice !== null && (
                <span className="text-ink-subtle text-label ml-1.5 font-normal line-through">
                  {formatPrice(product.oldPrice, locale)}
                </span>
              )}
            </span>
            <span
              className={`text-micro tracking-label uppercase ${
                product.inStock ? 'text-ink-muted' : 'text-ink-subtle'
              }`}
            >
              {product.inStock ? tp('inStock') : tp('outOfStock')}
            </span>
          </div>
        </div>
      </Link>
    </article>
  )
}
