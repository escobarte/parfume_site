'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { useCart } from '@/lib/cart/store'
import { CHECKOUT_MODES, type CheckoutMode, MESSENGERS } from '@/lib/orders/schema'
import { digitsOf, PHONE_PREFIX, PhoneInput } from './PhoneInput'

type Errors = Partial<Record<'name' | 'phone' | 'email' | 'form', string>>

/**
 * Форма заявки: имя, телефон с маской +373, способ оформления, мессенджер,
 * адрес и комментарий.
 *
 * Способ оформления (фаза 9.1) на валидацию не влияет вообще: телефон
 * обязателен и при «без звонка» — вариант лишь ставит менеджеру пометку
 * «не звонить». Адрес необязателен: пустой уходит как undefined и в заявку
 * не попадает.
 */
export function OrderForm() {
  const t = useTranslations('OrderForm')
  const locale = useLocale() as Locale
  const router = useRouter()
  const items = useCart((state) => state.items)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [messenger, setMessenger] = useState<(typeof MESSENGERS)[number]>('telegram')
  const [checkoutMode, setCheckoutMode] = useState<CheckoutMode>('standard')
  const [address, setAddress] = useState('')
  const [comment, setComment] = useState('')
  const [company, setCompany] = useState('') // honeypot
  const [errors, setErrors] = useState<Errors>({})
  const [sending, setSending] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (sending) return

    const next: Errors = {}
    if (name.trim().length < 2) next.name = t('errorName')
    if (digitsOf(phone).length !== 8) next.phone = t('errorPhone')
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = t('errorEmail')
    }
    setErrors(next)
    if (Object.keys(next).length) return

    setSending(true)
    try {
      const response = await fetch('/api/order-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: `${PHONE_PREFIX}${digitsOf(phone)}`,
          email: email.trim() || undefined,
          messenger,
          checkoutMode,
          address: address.trim() || undefined,
          comment: comment.trim() || undefined,
          locale,
          source: 'cart',
          company,
          items: items.map((item) => ({
            kind: item.kind ?? 'product',
            productId: item.productId,
            slug: item.slug,
            title: item.title,
            brandTitle: item.brandTitle,
            sku: item.sku,
            volume: item.volume,
            price: item.price,
            qty: item.qty,
          })),
        }),
      })

      const data = (await response.json()) as {
        ok: boolean
        orderNumber?: string
        error?: string
        fields?: string[]
      }

      if (!response.ok || !data.ok) {
        setErrors({
          form: data.error === 'rate_limit' ? t('errorRate') : t('errorGeneric'),
          ...(data.error === 'validation' && data.fields?.includes('email')
            ? { email: t('errorEmail') }
            : data.error === 'validation'
              ? { phone: t('errorPhone') }
              : {}),
        })
        setSending(false)
        return
      }

      // generate_lead (GA4, PLAN.md §7.5) намеренно НЕ здесь: тот же приём,
      // что и с clear() корзины ниже — эта страница вот-вот размонтируется,
      // а thank-you (LeadEvent.tsx) даст надёжный transaction_id и не
      // рискует задвоить событие, если пользователь как-то попадёт сюда
      // повторно до завершения навигации. Единственная точка отправки.

      // Корзину не чистим здесь: переход на thank-you асинхронный, а этот
      // компонент/страница /cart ещё смонтированы — синхронный clear() тут
      // на мгновение отрисовывал бы empty-state корзины поверх текущего
      // экрана раньше, чем завершится навигация (баг «вспышка пустой
      // корзины» между отправкой и thank-you). Корзину чистит thank-you
      // (LeadEvent.tsx) уже после того, как переход состоялся.
      router.push(`/thank-you?order=${encodeURIComponent(data.orderNumber ?? '')}`)
      // sending намеренно остаётся true: форма вот-вот размонтируется вместе
      // с /cart, не нужно на миг возвращать кнопку в активное состояние,
      // пока переход ещё не завершился.
    } catch {
      setErrors({ form: t('errorGeneric') })
      setSending(false)
    }
  }

  const fieldClass = (invalid?: boolean) =>
    `w-full rounded-sm border px-3 py-2.5 text-body-sm text-ink outline-none transition-colors placeholder:text-ink-subtle ${
      invalid ? 'border-danger' : 'border-line focus:border-navy'
    }`

  return (
    <form onSubmit={submit} noValidate className="border-line border p-5">
      <h2 className="text-ink text-section tracking-display font-light uppercase">{t('title')}</h2>

      <div className="mt-5 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-ink-muted text-eyebrow tracking-label uppercase">{t('name')}</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('namePlaceholder')}
            autoComplete="name"
            aria-invalid={Boolean(errors.name) || undefined}
            className={fieldClass(Boolean(errors.name))}
          />
          {errors.name && <span className="text-danger text-eyebrow">{errors.name}</span>}
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-ink-muted text-eyebrow tracking-label uppercase">{t('phone')}</span>
          <PhoneInput
            value={phone}
            onChange={setPhone}
            invalid={Boolean(errors.phone)}
            label={t('phone')}
          />
          {errors.phone && <span className="text-danger text-eyebrow">{errors.phone}</span>}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-ink-muted text-eyebrow tracking-label uppercase">{t('email')}</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t('emailPlaceholder')}
            autoComplete="email"
            aria-invalid={Boolean(errors.email) || undefined}
            className={fieldClass(Boolean(errors.email))}
          />
          {errors.email && <span className="text-danger text-eyebrow">{errors.email}</span>}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-ink-muted text-eyebrow tracking-label uppercase">
            {t('checkoutMode')}
          </span>
          <select
            value={checkoutMode}
            onChange={(event) => setCheckoutMode(event.target.value as CheckoutMode)}
            className={`${fieldClass()} cursor-pointer bg-transparent`}
          >
            {CHECKOUT_MODES.map((option) => (
              <option key={option} value={option}>
                {t(`checkoutMode_${option}`)}
              </option>
            ))}
          </select>
          {checkoutMode === 'noCall' && (
            <span className="text-ink-subtle text-eyebrow">{t('checkoutModeNoCallHint')}</span>
          )}
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-ink-muted text-eyebrow tracking-label uppercase">
            {t('messenger')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {MESSENGERS.map((option) => {
              const active = option === messenger
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMessenger(option)}
                  className={`text-label cursor-pointer rounded-sm border px-3 py-1.5 capitalize transition-colors ${
                    active
                      ? 'border-navy bg-navy text-cream'
                      : 'border-line text-ink hover:border-navy'
                  }`}
                >
                  {option === 'call' ? t('messengerCall') : option}
                </button>
              )
            })}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-ink-muted text-eyebrow tracking-label uppercase">
            {t('address')}
          </span>
          <input
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder={t('addressPlaceholder')}
            autoComplete="street-address"
            className={fieldClass()}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-ink-muted text-eyebrow tracking-label uppercase">
            {t('comment')}
          </span>
          <textarea
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t('commentPlaceholder')}
            className={fieldClass()}
          />
        </label>

        {/* Honeypot: человек этого поля не видит, бот заполняет. */}
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          className="absolute size-0 overflow-hidden opacity-0"
        />

        {errors.form && <p className="text-danger text-body-sm">{errors.form}</p>}

        <button
          type="submit"
          disabled={sending || items.length === 0}
          className="bg-navy text-cream text-label tracking-display cursor-pointer rounded-sm py-3.5 uppercase transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending ? t('sending') : t('submit')}
        </button>

        <p className="text-ink-subtle text-eyebrow">{t('agreement')}</p>
      </div>
    </form>
  )
}
