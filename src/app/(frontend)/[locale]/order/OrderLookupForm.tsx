'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { digitsOf, PHONE_PREFIX, PhoneInput } from '@/components/cart/PhoneInput'

/** Форма запасного пути статуса заказа: номер заявки + телефон вместе (фаза 4.7.2). */
export function OrderLookupForm() {
  const t = useTranslations('OrderLookup')
  const router = useRouter()

  const [orderNumber, setOrderNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (sending) return

    if (!orderNumber.trim() || digitsOf(phone).length !== 8) {
      setError(t('errorGeneric'))
      return
    }

    setSending(true)
    setError(null)
    try {
      const response = await fetch('/api/order-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: orderNumber.trim(),
          phone: `${PHONE_PREFIX}${digitsOf(phone)}`,
        }),
      })
      const data = (await response.json()) as { ok: boolean; token?: string; error?: string }

      if (!response.ok || !data.ok || !data.token) {
        setError(data.error === 'rate_limit' ? t('errorRate') : t('errorGeneric'))
        return
      }

      router.push(`/order/${data.token}`)
    } catch {
      setError(t('errorGeneric'))
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-ink-muted text-eyebrow tracking-label uppercase">
          {t('orderNumberLabel')}
        </span>
        <input
          type="text"
          value={orderNumber}
          onChange={(event) => setOrderNumber(event.target.value)}
          placeholder="MF-260101-AB12"
          className="border-line focus:border-navy text-body-sm text-ink w-full rounded-sm border px-3 py-2.5 outline-none transition-colors"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-ink-muted text-eyebrow tracking-label uppercase">
          {t('phoneLabel')}
        </span>
        <PhoneInput value={phone} onChange={setPhone} label={t('phoneLabel')} />
      </div>

      {error && <p className="text-danger text-body-sm">{error}</p>}

      <button
        type="submit"
        disabled={sending}
        className="bg-navy text-cream text-label tracking-display cursor-pointer rounded-sm py-3.5 uppercase transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {sending ? t('sending') : t('submit')}
      </button>
    </form>
  )
}
