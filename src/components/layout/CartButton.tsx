'use client'

import { ShoppingBag } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { selectCount, useCart } from '@/lib/cart/store'
import { useHasHydrated } from '@/lib/useHasHydrated'

/** Корзина с бейджем-кружком cream, цифра navy (WIREFRAMES.md §Шапка). */
export function CartButton({ className }: { className?: string }) {
  const t = useTranslations('Nav')
  const count = useCart(selectCount)
  const hydrated = useHasHydrated()
  const visible = hydrated ? count : 0

  return (
    <Link
      href="/cart"
      className={`text-cream hover:text-ink-on-dark-muted relative inline-flex transition-colors ${className ?? ''}`}
      aria-label={t('cart')}
    >
      <ShoppingBag className="size-[18px]" strokeWidth={1.6} />
      {visible > 0 && (
        <span className="bg-cream text-navy text-micro absolute -top-2 -right-2 flex size-4 items-center justify-center rounded-full font-medium">
          {visible > 99 ? '99+' : visible}
        </span>
      )}
    </Link>
  )
}
