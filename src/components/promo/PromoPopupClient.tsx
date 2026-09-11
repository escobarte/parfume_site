'use client'

import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { BrandMark } from '@/components/brand/BrandMark'

const STORAGE_KEY = 'mf-promo-popup-seen'
/** Пауза перед показом: попап не должен драться за внимание с первым экраном. */
const SHOW_DELAY_MS = 2000

type ErrorCode = 'validation' | 'rate_limit' | 'disabled' | 'generic'
type Issued = { code: string; percent: number; existing: boolean; isUsed: boolean }

/**
 * Попап «первая скидка» — вёрстка по мокапу владельца: тёмная navy-шапка со
 * знаком бренда и крупным процентом, светлый низ с формой из трёх полей.
 * Токены и правила BRAND.md: Inter 300/400/500, uppercase-трекинг на
 * заголовке, радиусы `rounded-sm`, линии вместо теней, кнопка не pill.
 *
 * **Показывается один раз на браузер.** Флаг в `localStorage` (не
 * `sessionStorage`, как у промо-баннера: тот должен возвращаться, а этот —
 * нет) ставится и при получении кода, и при закрытии крестиком, и по Esc.
 *
 * Контент (заголовок, процент, подпись, обязательность телефона) приходит
 * пропсами из глобала `promo-popup-settings` — здесь только раскладка.
 */
export function PromoPopupClient({
  title,
  percent,
  footerText,
  requirePhone,
}: {
  title: string
  percent: number
  footerText: string
  requirePhone: boolean
}) {
  const t = useTranslations('PromoPopup')
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<ErrorCode | null>(null)
  const [issued, setIssued] = useState<Issued | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // Через таймер, а не синхронно в эффекте: и правило react-hooks, и сама
    // задержка показа (тот же приём, что в PromoBannerClient/SearchBox).
    const id = setTimeout(() => {
      try {
        if (localStorage.getItem(STORAGE_KEY) !== '1') setOpen(true)
      } catch {
        // приватный режим / заблокированное хранилище — попап просто не мешаем
      }
    }, SHOW_DELAY_MS)
    return () => clearTimeout(id)
  }, [])

  const remember = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // не критично: не смогли запомнить — покажем в следующий раз
    }
  }

  const close = () => {
    remember()
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (sending) return
    const form = new FormData(event.currentTarget)

    setSending(true)
    setError(null)
    try {
      const response = await fetch('/api/promo-popup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          email: String(form.get('email') ?? ''),
          phone: String(form.get('phone') ?? ''),
        }),
      })
      const data = (await response.json()) as
        | { ok: true; code: string; percent: number; existing: boolean; isUsed: boolean }
        | { ok: false; error?: ErrorCode }

      if (!data.ok) {
        setError(data.error ?? 'generic')
        setSending(false)
        return
      }

      // Код получен — попап больше не покажется, даже если его сейчас закрыть.
      remember()
      setIssued({
        code: data.code,
        percent: data.percent,
        existing: data.existing,
        isUsed: data.isUsed,
      })
      setSending(false)
    } catch {
      setError('generic')
      setSending(false)
    }
  }

  const copy = async () => {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(issued.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // буфер недоступен — код и так на экране, выделяется вручную
    }
  }

  if (!open) return null

  const fieldClass =
    'border-line text-ink placeholder:text-ink-subtle focus:border-navy w-full rounded-sm border bg-transparent px-3.5 py-2.5 text-body outline-none transition-colors'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/*
        Фон — сплошная подложка без размытия: теней и эффектов в брендбуке нет.
        `aria-hidden` + `tabIndex={-1}`: это дубль крестика для мыши, и в
        дереве доступности он лишний — иначе на попапе две одинаковые кнопки
        «Закрыть», и скринридер, и автотест выбирают не ту.
      */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={close}
        className="bg-navy/60 absolute inset-0 cursor-default"
      />

      <div className="bg-surface border-line relative w-full max-w-[380px] overflow-hidden rounded-sm border">
        <button
          type="button"
          onClick={close}
          aria-label={t('close')}
          className="text-ink-on-dark-muted hover:text-ink-on-dark absolute top-3 right-3 z-10 transition-colors"
        >
          <X className="size-4" />
        </button>

        {/* Тёмная шапка: знак бренда, заголовок, крупный процент. */}
        <div className="bg-navy flex flex-col items-center gap-2.5 px-6 py-7 text-center">
          <BrandMark className="text-cream h-9 w-auto" />
          <p className="text-ink-on-dark-subtle text-eyebrow tracking-display uppercase">{title}</p>
          <p className="text-cream text-hero leading-none font-light">{percent}%</p>
          <p className="text-ink-on-dark-muted text-body-sm">{t('subtitle')}</p>
        </div>

        {/* Светлый низ: форма или выданный код. */}
        <div className="flex flex-col gap-3 px-6 py-6">
          {issued ? (
            <div className="flex flex-col gap-3 text-center">
              <p className="text-ink text-label tracking-display uppercase">
                {issued.existing ? t('existingTitle') : t('successTitle')}
              </p>
              <p className="border-line text-ink text-display tracking-display rounded-sm border px-4 py-3 font-medium">
                {issued.code}
              </p>
              <button
                type="button"
                onClick={copy}
                className="text-ink-muted hover:text-ink text-label underline decoration-1 underline-offset-4 transition-colors"
              >
                {copied ? t('copied') : t('copy')}
              </button>
              <p className="text-ink-muted text-body-sm">
                {issued.isUsed
                  ? t('usedHint')
                  : issued.existing
                    ? t('existingHint')
                    : t('successHint')}
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-3">
              <input
                name="name"
                type="text"
                required
                autoComplete="name"
                placeholder={t('namePlaceholder')}
                className={fieldClass}
              />
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder={t('emailPlaceholder')}
                className={fieldClass}
              />
              <input
                name="phone"
                type="tel"
                required={requirePhone}
                autoComplete="tel"
                placeholder={t('phonePlaceholder')}
                className={fieldClass}
              />

              {error && (
                <p className="text-danger text-body-sm" role="alert">
                  {error === 'rate_limit'
                    ? t('errorRateLimit')
                    : error === 'validation'
                      ? t('errorValidation')
                      : t('errorGeneric')}
                </p>
              )}

              <button
                type="submit"
                disabled={sending}
                className="bg-navy text-ink-on-dark text-label tracking-display hover:bg-navy/90 rounded-sm px-4 py-3 uppercase transition-colors disabled:opacity-60"
              >
                {sending ? t('submitting') : t('submit')}
              </button>

              <p className="text-ink-subtle text-body-sm text-center">{footerText}</p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
