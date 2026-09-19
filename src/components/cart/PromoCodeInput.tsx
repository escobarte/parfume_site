'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { PhoneInput } from '@/components/forms/PhoneInput'
import { PHONE_PREFIX, toLocalPhoneDigits } from '@/lib/orders/phone'
import { usePromo } from '@/lib/orders/promoStore'

type PromoErrorCode =
  | 'not_found'
  | 'inactive'
  | 'used'
  | 'expired'
  | 'phone_mismatch'
  | 'generic'

type CheckResponse =
  | { ok: true; code: string; percent: number }
  | { ok: false; error?: PromoErrorCode | 'phone_required'; code?: string }

/**
 * Поле промокода в корзине. Проверка на бэкенде (`/api/promo-code-check`) —
 * только предпросмотр: сумму скидки на текущую корзину считает и показывает
 * `CartView.tsx`, сервер при реальном оформлении переоценивает код ещё раз.
 *
 * Три экрана (мокап владельца 2026-09-11):
 *  1. пустое поле ввода кода;
 *  2. **персональный код найден — просим подтвердить телефон**, на который он
 *     выдан (шаг появляется только для `codeType: 'personal'`; у публичного
 *     привязки к человеку нет, он применяется сразу, как раньше);
 *  3. применённый код с процентом, либо ошибка несовпадения номера.
 *
 * Шаг 2 запускает не фронт, а сервер: он отвечает `phone_required` и отдаёт
 * сам код для показа. Фронт не знает и не должен знать тип кода — иначе
 * правило «кому нужна сверка» жило бы в двух местах.
 *
 * Несовпадение номера повторную попытку не блокирует: человек мог опечататься,
 * поле остаётся заполняемым, код из шага 2 не сбрасывается. С 2026-09-19 у
 * `/api/promo-code-check` нет лимита запросов (решение владельца: проверка
 * кода ничего не расходует и не пишет в базу), поэтому причина `rate_limit`
 * здесь недостижима и из набора убрана — раньше она перекрывала настоящую
 * причину и человек видел «слишком много попыток» вместо «код уже использован».
 *
 * Телефон на шаге 2 — тот же общий компонент `PhoneInput`, что в форме заказа:
 * плашка `+373` и восемь цифр номера, на сервер уходит `+373XXXXXXXX`.
 */
export function PromoCodeInput() {
  const t = useTranslations('Cart')
  const [value, setValue] = useState('')
  /** Только цифры номера (без +373) — формат общего PhoneInput. */
  const [phone, setPhone] = useState('')
  /** Код, ожидающий подтверждения телефона (экран 2). */
  const [pendingCode, setPendingCode] = useState<string | null>(null)
  const [error, setError] = useState<PromoErrorCode | null>(null)
  const [checking, setChecking] = useState(false)

  const code = usePromo((state) => state.code)
  const percent = usePromo((state) => state.percent)
  const apply = usePromo((state) => state.apply)
  const clear = usePromo((state) => state.clear)

  /** Один запрос на оба шага: без телефона — первый, с телефоном — второй. */
  const check = async (rawCode: string, rawPhone?: string) => {
    if (checking) return
    setChecking(true)
    setError(null)
    try {
      const response = await fetch('/api/promo-code-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: rawCode, ...(rawPhone ? { phone: rawPhone } : {}) }),
      })
      const data = (await response.json()) as CheckResponse

      if (!data.ok) {
        if (data.error === 'phone_required') {
          setPendingCode(data.code ?? rawCode)
          setChecking(false)
          return
        }
        setError((data.error as PromoErrorCode) ?? 'generic')
        setChecking(false)
        return
      }

      // Номер запоминается только если им реально подтверждали код: у
      // публичного кода шага сверки нет, и телефон тут пустой.
      apply(data.code, data.percent, rawPhone ?? null)
      setPendingCode(null)
      setPhone('')
      setChecking(false)
    } catch {
      setError('generic')
      setChecking(false)
    }
  }

  const reset = () => {
    setPendingCode(null)
    setPhone('')
    setError(null)
  }

  const fieldClass = (invalid: boolean) =>
    `w-full rounded-sm border px-3 py-2.5 text-body-sm text-ink outline-none transition-colors placeholder:text-ink-subtle ${
      invalid ? 'border-danger' : 'border-line focus:border-navy'
    }`

  // ── Экран 3: код применён ───────────────────────────────────────────────
  if (code) {
    return (
      <div className="border-line flex items-center justify-between gap-3 rounded-sm border px-3 py-2.5">
        <span className="text-ink text-body-sm">
          {t('promoApplied', { code, percent: percent ?? 0 })}
        </span>
        <button
          type="button"
          onClick={() => {
            clear()
            setValue('')
            reset()
          }}
          className="text-ink-subtle hover:text-danger text-eyebrow tracking-label cursor-pointer uppercase underline underline-offset-4 transition-colors"
        >
          {t('promoRemove')}
        </button>
      </div>
    )
  }

  // ── Экран 2: подтверждение телефона ─────────────────────────────────────
  if (pendingCode) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          // Восемь цифр — та же проверка, что в форме заказа: неполный номер
          // не имеет смысла отправлять на сверку.
          if (toLocalPhoneDigits(phone).length === 8) void check(pendingCode, `${PHONE_PREFIX}${toLocalPhoneDigits(phone)}`)
        }}
        className="border-navy flex flex-col gap-2.5 rounded-sm border p-3"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-ink text-body-sm font-medium">{pendingCode}</span>
          <button
            type="button"
            onClick={() => {
              reset()
              setValue('')
            }}
            className="text-ink-subtle hover:text-ink text-eyebrow tracking-label cursor-pointer uppercase underline underline-offset-4 transition-colors"
          >
            {t('promoChange')}
          </button>
        </div>

        <p className="text-ink-muted text-body-sm">{t('promoConfirmPhoneTitle')}</p>

        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <PhoneInput
              value={phone}
              onChange={setPhone}
              invalid={error === 'phone_mismatch'}
              label={t('promoPhoneLabel')}
            />
          </div>
          <button
            type="submit"
            disabled={checking || toLocalPhoneDigits(phone).length !== 8}
            className="bg-navy text-cream text-label tracking-display hover:bg-navy/90 shrink-0 cursor-pointer rounded-sm px-4 py-2.5 uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            {checking ? t('promoConfirming') : t('promoConfirm')}
          </button>
        </div>

        {error && <span className="text-danger text-eyebrow">{t(`promoError_${error}`)}</span>}
      </form>
    )
  }

  // ── Экран 1: ввод кода ──────────────────────────────────────────────────
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const trimmed = value.trim()
        if (trimmed) void check(trimmed)
      }}
      className="flex flex-col gap-1.5"
    >
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t('promoPlaceholder')}
          aria-invalid={Boolean(error) || undefined}
          className={fieldClass(Boolean(error))}
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
