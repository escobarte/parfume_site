'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { useCart } from '@/lib/cart/store'
import { MESSENGERS } from '@/lib/orders/schema'
import { digitsOf, PHONE_PREFIX, PhoneInput } from './PhoneInput'

type Errors = Partial<Record<'name' | 'phone' | 'form', string>>

/** Форма заявки: имя, телефон с маской +373, мессенджер, комментарий. */
export function OrderForm() {
  const t = useTranslations('OrderForm')
  const locale = useLocale() as Locale
  const router = useRouter()
  const items = useCart((state) => state.items)
  const clear = useCart((state) => state.clear)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [messenger, setMessenger] = useState<(typeof MESSENGERS)[number]>('telegram')
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
          messenger,
          comment: comment.trim() || undefined,
          locale,
          source: 'cart',
          company,
          items: items.map((item) => ({
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

      const data = (await response.json()) as { ok: boolean; orderNumber?: string; error?: string }

      if (!response.ok || !data.ok) {
        setErrors({
          form: data.error === 'rate_limit' ? t('errorRate') : t('errorGeneric'),
          ...(data.error === 'validation' ? { phone: t('errorPhone') } : {}),
        })
        return
      }

      // GA4-событие подключится в фазе 7 вместе со скриптом и согласием;
      // здесь только отправляем его, если аналитика уже загружена.
      window.dataLayer?.push({ event: 'generate_lead', currency: 'MDL' })

      clear()
      router.push(`/thank-you?order=${encodeURIComponent(data.orderNumber ?? '')}`)
    } catch {
      setErrors({ form: t('errorGeneric') })
    } finally {
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
