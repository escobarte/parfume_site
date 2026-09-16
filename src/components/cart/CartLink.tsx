'use client'

import { ShoppingBag } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { selectCount, useCart } from '@/lib/cart/store'
import { useHasHydrated } from '@/lib/useHasHydrated'

/**
 * Корзина в шапке: иконка с бейджем, клик сразу ведёт на `/cart`.
 *
 * До 17.09 это был `MiniCart` — та же иконка открывала выпадающий список
 * последних позиций с итогом и кнопкой «Открыть корзину». Промежуточный шаг
 * убран по правке владельца: клик по иконке = переход в корзину.
 * Обратная связь на «В корзину» этим НЕ затрагивается — её даёт отдельный
 * `CartToast` (плашка снизу, свой стор `lib/ui/toast`), он остался как был.
 *
 * Бейдж рисуется только после гидрации (`useHasHydrated`): содержимое корзины
 * живёт в localStorage, на сервере его нет, иначе — рассинхронизация разметки.
 */
export function CartLink({ className }: { className?: string }) {
  const tn = useTranslations('Nav')
  const count = useCart(selectCount)
  const hydrated = useHasHydrated()

  const visible = hydrated ? count : 0

  return (
    // `inline-flex items-center`, а не просто `relative`: блочная обёртка была
    // выше своей иконки на высоту строки, и корзина вставала на 3px выше
    // переключателя локалей и лупы (правка 16.09).
    <Link
      href="/cart"
      aria-label={tn('cart')}
      className={`text-cream hover:text-ink-on-dark-muted relative inline-flex items-center transition-colors ${className ?? ''}`}
    >
      {/* Десктоп — в 1.5 раза крупнее (18 → 27px) по правке владельца 16.09;
          на мобильном размер прежний, в одну линию с лупой и трубкой. */}
      <ShoppingBag className="size-[18px] md:size-[27px]" strokeWidth={1.6} />
      {visible > 0 && (
        <span className="bg-cream text-navy text-micro absolute -top-2 -right-2 flex size-4 items-center justify-center rounded-full font-medium">
          {visible > 99 ? '99+' : visible}
        </span>
      )}
    </Link>
  )
}
