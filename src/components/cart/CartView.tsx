'use client'

import { Minus, Plus, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CartItemThumb } from '@/components/cart/CartItemThumb'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { cartItemsToGaItems, cartValue, trackEvent } from '@/lib/analytics/gtag'
import { useCart } from '@/lib/cart/store'
import { formatPrice, formatVolume } from '@/lib/format'
import { priceLine } from '@/lib/pricing'
import { usePromo } from '@/lib/orders/promoStore'
import { useHasHydrated } from '@/lib/useHasHydrated'
import { OrderForm } from './OrderForm'
import { PromoCodeInput } from './PromoCodeInput'

/** Страница корзины: позиции с количеством, итог и форма заявки рядом. */
export function CartView() {
  const t = useTranslations('Cart')
  const locale = useLocale() as Locale
  const items = useCart((state) => state.items)
  const setQty = useCart((state) => state.setQty)
  const remove = useCart((state) => state.remove)
  const sync = useCart((state) => state.sync)
  const hydrated = useHasHydrated()
  const checkoutSent = useRef(false)
  const revalidated = useRef(false)
  const promoCode = usePromo((state) => state.code)
  const promoPercent = usePromo((state) => state.percent)

  /** Ключи позиций, у которых цена изменилась с момента добавления. */
  const [repriced, setRepriced] = useState<string[]>([])
  const [removedSome, setRemovedSome] = useState(false)

  // Цена в корзине зафиксирована при добавлении и живёт в localStorage —
  // за это время каталог мог измениться. Спрашиваем сервер один раз при
  // открытии, ДО показа итогов, и помечаем подорожавшее/подешевевшее.
  useEffect(() => {
    if (!hydrated || revalidated.current) return
    revalidated.current = true
    const snapshot = useCart.getState().items
    if (snapshot.length === 0) return

    const run = async () => {
      try {
        const response = await fetch('/api/cart-revalidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: snapshot.map((item) => ({
              key: item.key,
              kind: item.kind ?? 'product',
              slug: item.slug,
              sku: item.sku,
            })),
          }),
        })
        const data = (await response.json()) as
          | { ok: true; items: { key: string; price: number; oldPrice: number | null; gone?: boolean }[] }
          | { ok: false }
        if (!data.ok) {
          console.warn('[cart] ревалидация цен отклонена сервером:', response.status)
          return
        }

        const before = useCart.getState().items.length
        const changed = sync(data.items)
        setRepriced(changed)
        setRemovedSome(useCart.getState().items.length < before)
      } catch (error) {
        // Показываем то, что есть: цена и уценка кладутся в позицию ещё при
        // добавлении (BuyBlock), поэтому сбой ревалидации оставляет данные
        // устаревшими, но не систематически заниженными. Сервер всё равно
        // пересчитает всё при оформлении.
        //
        // Пользователю не показываем — чинить ему нечего, а лишняя красная
        // плашка на пустом месте только пугает. Но и молчать насовсем нельзя:
        // это единственный признак, что эндпоинт лёг. `warn`, не `error` —
        // smoke-спеки валят прогон на любой console error.
        console.warn('[cart] не удалось обновить цены корзины:', error)
      }
    }
    void run()
  }, [hydrated, sync])

  // Правило совмещения скидок (2026-09-12): выигрывает БОЛЬШИЙ процент, и
  // считается он попозиционно — см. priceLine(). Промокод не действует на
  // подарочные позиции (фаза 11.2, задача 7), им передаём 0.
  const priced = useMemo(
    () =>
      items.map((item) => ({
        item,
        pricing: priceLine(
          item.price,
          item.oldPrice,
          (item.kind ?? 'product') === 'gift' ? 0 : promoPercent,
        ),
      })),
    [items, promoPercent],
  )

  const totalWithDiscount = priced.reduce((sum, row) => sum + row.pricing.unitPrice * row.item.qty, 0)
  // Выгода именно от промокода: сколько клиент заплатил бы без него минус
  // сколько платит сейчас. По позициям, где выиграла своя скидка, это 0.
  const promoSaving = priced.reduce(
    (sum, row) =>
      row.pricing.source === 'promo'
        ? sum + (row.item.price - row.pricing.unitPrice) * row.item.qty
        : sum,
    0,
  )
  // Код введён, но ни на одной позиции не дал выгоды — молчать нельзя.
  const promoUseless = Boolean(promoCode) && promoSaving <= 0

  // GA4 begin_checkout (PLAN.md §7.5) — один раз за визит на непустую
  // корзину, после гидрации (до неё `items` не отражает localStorage).
  useEffect(() => {
    if (!hydrated || items.length === 0 || checkoutSent.current) return
    checkoutSent.current = true
    trackEvent('begin_checkout', {
      currency: 'MDL',
      value: cartValue(items),
      items: cartItemsToGaItems(items),
    })
  }, [hydrated, items])

  // До гидрации содержимое localStorage неизвестно — рисуем пустой каркас.
  if (!hydrated) return <div className="min-h-100" />

  if (items.length === 0) {
    return (
      <div className="border-line flex flex-col items-center gap-2 border py-20 text-center">
        <p className="text-ink text-body">{t('empty')}</p>
        <p className="text-ink-muted text-body-sm">{t('emptyHint')}</p>
        <Link
          href="/catalog"
          className="border-navy text-navy hover:bg-navy hover:text-cream text-label tracking-display mt-4 rounded-sm border px-6 py-3 uppercase transition-colors"
        >
          {t('toCatalog')}
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px] lg:gap-12">
      <div>
        {removedSome && (
          <p className="border-danger text-danger text-body-sm mb-4 rounded-sm border px-3 py-2.5">
            {t('itemsRemoved')}
          </p>
        )}

        <ul className="border-line divide-line divide-y border-y">
          {priced.map(({ item, pricing }) => (
            <li key={item.key} className="flex flex-wrap items-start gap-4 py-4">
              <CartItemThumb image={item.image} />
              {/* `min-w-40` — не косметика, а то, что удерживает раскладку на
                  узком экране: строка уже была `flex-wrap`, но текстовая
                  колонка (`flex-1 min-w-0`) сжималась до нескольких пикселей,
                  и название переносилось по одному слову вместо того, чтобы
                  количество/цена ушли на вторую строку. С минимальной шириной
                  перенос происходит там, где задуман. На десктопе ничего не
                  меняется — там места с избытком. */}
              <div className="min-w-40 flex-1">
                {item.brandTitle && (
                  <p className="text-ink-muted text-micro tracking-label uppercase">
                    {item.brandTitle}
                  </p>
                )}
                <Link
                  href={`/product/${item.slug}`}
                  className="text-ink text-body hover:text-ink-muted font-medium transition-colors"
                >
                  {item.title}
                </Link>
                <p className="text-ink-muted text-label mt-1">
                  {[item.volume ? formatVolume(item.volume) : null, item.sku]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>

              <div className="border-line flex items-center rounded-sm border">
                <button
                  type="button"
                  onClick={() => setQty(item.key, item.qty - 1)}
                  disabled={item.qty <= 1}
                  aria-label={t('qty')}
                  className="text-ink cursor-pointer px-2.5 py-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Minus className="size-3.5" strokeWidth={1.8} />
                </button>
                <span className="text-ink text-body-sm w-8 text-center tabular-nums">
                  {item.qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty(item.key, item.qty + 1)}
                  aria-label={t('qty')}
                  className="text-ink cursor-pointer px-2.5 py-2"
                >
                  <Plus className="size-3.5" strokeWidth={1.8} />
                </button>
              </div>

              <div className="w-28 text-right">
                {/* Зачёркнутая цена — тот же приём, что на карточке товара
                    (BuyBlock): база слева/сверху, актуальная под ней. */}
                {pricing.finalPercent > 0 && (
                  <div className="text-ink-muted text-body-sm line-through">
                    {formatPrice(pricing.base * item.qty, locale)}
                  </div>
                )}
                <div className="text-ink text-body font-medium">
                  {formatPrice(pricing.unitPrice * item.qty, locale)}
                </div>
                {repriced.includes(item.key) && (
                  <div className="text-ink-subtle text-eyebrow tracking-label uppercase">
                    {t('priceUpdated')}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => remove(item.key)}
                aria-label={t('remove')}
                className="text-ink-subtle hover:text-danger cursor-pointer py-2 transition-colors"
              >
                <X className="size-4" strokeWidth={1.6} />
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-5">
          <PromoCodeInput />
        </div>

        {promoCode && !promoUseless && (
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-ink-muted text-eyebrow tracking-label uppercase">
              {t('promoSaving', { code: promoCode })}
            </span>
            <span className="text-ink text-body-sm">−{formatPrice(promoSaving, locale)}</span>
          </div>
        )}

        {/* Промокод введён, но проиграл собственным скидкам на всех позициях.
            Строка с нулём выглядела бы как ошибка — говорим прямо. */}
        {promoUseless && (
          <p className="border-line text-ink-muted text-body-sm mt-3 border-t pt-3">
            {t('promoNoBenefit', { code: promoCode ?? '' })}
          </p>
        )}

        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-ink-muted text-eyebrow tracking-label uppercase">{t('total')}</span>
          <span className="text-ink text-display font-medium">
            {formatPrice(totalWithDiscount, locale)}
          </span>
        </div>
      </div>

      <OrderForm />
    </div>
  )
}
