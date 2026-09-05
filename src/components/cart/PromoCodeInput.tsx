'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePromo } from '@/lib/orders/promoStore'

type PromoErrorCode = 'not_found' | 'inactive' | 'used' | 'expired' | 'rate_limit' | 'generic'

/**
 * Поле промокода в корзине (фаза 11.2, задача 7) — проверка на бэкенде
 * (`/api/promo-code-check`), только предпросмотр: сумму скидки на текущую
 * корзину считает и показывает `CartView.tsx` (нужны позиции корзины, их
 * тут нет), сервер при реальном оформлении переоценивает код ещё раз.
 */
export function PromoCodeInput() {
  const t = useTranslations('Cart')
  const [value, setValue] = useState('')
  const [error, setError] = useState<PromoErrorCode | null>(null)
  const [checking, setChecking] = useState(false)
  const code = usePromo((state) => state.code)
  const percent = usePromo((state) => state.percent)
  const apply = usePromo((state) => state.apply)
  const clear = usePromo((state) => state.clear)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || checking) return

    setChecking(true)
    setError(null)
    try {
      const response = await fetch('/api/promo-code-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      })
      const data = (await response.json()) as
        | { ok: true; code: string; percent: number }
        | { ok: false; error?: PromoErrorCode }

      if (!data.ok) {
        setError(data.error ?? 'generic')
        setChecking(false)
        return
      }

      apply(data.code, data.percent)
      setChecking(false)
    } catch {
      setError('generic')
      setChecking(false)
    }
  }

  if (code) {
    return (
      <div className="border-line flex items-center justify-between gap-3 rounded-sm border px-3 py-2.5">
        <span className="text-ink text-body-sm">{t('promoApplied', { code, percent: percent ?? 0 })}</span>
        <button
          type="button"
          onClick={() => {
            clear()
            setValue('')
            setError(null)
          }}
          className="text-ink-subtle hover:text-danger text-eyebrow tracking-label cursor-pointer uppercase underline underline-offset-4 transition-colors"
        >
          {t('promoRemove')}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t('promoPlaceholder')}
          aria-invalid={Boolean(error) || undefined}
          className={`w-full rounded-sm border px-3 py-2.5 text-body-sm text-ink outline-none transition-colors placeholder:text-ink-subtle ${
            error ? 'border-danger' : 'border-line focus:border-navy'
          }`}
        />
        <button
          type="submit"
          disabled={checking || !value.trim()}
          className="border-navy text-navy hover:bg-navy hover:text-cream text-label tracking-display shrink-0 cursor-pointer rounded-sm border px-4 py-2.5 uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {checking ? t('promoChecking') : t('promoApply')}
        </button>
      </div>
      {error && <span className="text-danger text-eyebrow">{t(`promoError_${error}`)}</span>}
    </form>
  )
}
