import Image from 'next/image'
import { BottleGlyph } from '@/components/brand/BrandMark'

/**
 * Миниатюра позиции корзины. Источник фото — `CartItem.image`, который
 * кладётся при добавлении в корзину (`BuyBlock`: фото выбранного варианта
 * `variants[].image` с фоллбэком на первое фото товара; `GiftBuyBlock` —
 * аналогично). Своей логики выбора фото здесь нет намеренно: резолвер один,
 * и он уже отработал на странице товара.
 *
 * Позиция без фото (подарочный товар без картинки или позиция, добавленная
 * в корзину до появления этого поля — корзина живёт в localStorage и
 * переживает деплой) показывает тот же силуэт флакона, что и карточка
 * каталога без фото, а не пустую дырку в строке.
 *
 * Визуальный язык — как у карточек: квадрат, `bg-surface-warm`, `rounded-sm`,
 * `object-contain` (кадр целиком, без кропа).
 */
const SIZES = {
  /** Дровер мини-корзины — узкий, 320px на всю панель. */
  sm: { box: 'size-12', glyph: 'h-7', sizes: '48px' },
  /** Страница /cart — та же клетка, что у миниатюр галереи товара. */
  md: { box: 'size-16', glyph: 'h-9', sizes: '64px' },
} as const

export function CartItemThumb({
  image,
  size = 'md',
}: {
  image?: string | null
  size?: keyof typeof SIZES
}) {
  const { box, glyph, sizes } = SIZES[size]

  return (
    <div
      className={`bg-surface-warm border-line relative flex ${box} shrink-0 items-center justify-center overflow-hidden rounded-sm border`}
    >
      {image ? (
        <Image src={image} alt="" fill sizes={sizes} className="object-contain p-1" />
      ) : (
        <BottleGlyph className={`text-navy ${glyph} w-auto`} />
      )}
    </div>
  )
}
