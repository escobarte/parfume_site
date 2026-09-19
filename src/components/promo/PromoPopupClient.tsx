'use client'

import { ArrowRight, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useState } from 'react'
import { BrandMark } from '@/components/brand/BrandMark'
import { PhoneInput } from '@/components/forms/PhoneInput'
import { PHONE_PREFIX, toLocalPhoneDigits } from '@/lib/orders/phone'
import type { PromoPopupContent } from '@/lib/content/promoPopup'
import { PromoPopupImage } from './PromoPopupImage'

const STORAGE_KEY = 'mf-promo-popup-seen'
/** Пауза перед показом: попап не должен драться за внимание с первым экраном. */
const SHOW_DELAY_MS = 2000

type ErrorCode = 'validation' | 'rate_limit' | 'disabled' | 'generic'
type Issued = { code: string; percent: number; existing: boolean; isUsed: boolean }

/**
 * Попап «первая скидка» — вёрстка по макету дизайнера (редизайн 2026-09-19).
 *
 * **≥768px:** две колонки. Слева — картинка на всю высоту карточки; весь текст,
 * логотип и процент вшиты в неё дизайнером, кодом поверх ничего не рисуется.
 * Справа — заголовок, линия-разделитель, подзаголовок, описание, три поля
 * формы, кнопка со стрелкой и подпись под ней.
 *
 * **<768px:** прежний узкий формат (поля, кнопка, подпись), но тёмная шапка
 * заменена горизонтальной картинкой. Заголовок, подзаголовок и описание там
 * не показываются — их роль играет сама картинка; заголовок остаётся в
 * разметке как `sr-only`, потому что он же — имя диалога.
 *
 * **Картинок нет ни в одной локали** — попап выглядит как до редизайна: тёмная
 * navy-шапка со знаком бренда, заголовком и крупным процентом. Пока дизайнер
 * не загрузил файлы, ничего не ломается.
 *
 * Токены и правила BRAND.md: Inter 300/400/500, uppercase-трекинг на
 * заголовке и кнопке, радиусы `rounded-sm`, линии вместо теней.
 *
 * **Показывается один раз на браузер.** Флаг в `localStorage` (не
 * `sessionStorage`, как у промо-баннера: тот должен возвращаться, а этот —
 * нет) ставится и при получении кода, и при закрытии крестиком, и по Esc.
 * Пока флаг стоит, компонент не рендерит ничего — в том числе картинок.
 *
 * Весь контент приходит пропсом `content` из глобала `promo-popup-settings`,
 * уже с выбранной локалью и подставленным процентом
 * (`src/lib/content/promoPopup.ts`) — здесь только раскладка.
 */
export function PromoPopupClient({ content }: { content: PromoPopupContent }) {
  const t = useTranslations('PromoPopup')
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<ErrorCode | null>(null)
  const [issued, setIssued] = useState<Issued | null>(null)
  const [copied, setCopied] = useState(false)

  const { percent, requirePhone, title, subtitle, description, buttonLabel, footerText } = content
  const hasImage = Boolean(content.image || content.imageMobile)

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
    const digits = toLocalPhoneDigits(phone)

    // Та же проверка длины, что в форме заказа: маска принимает восемь цифр
    // номера, и неполный номер лучше поймать здесь, чем ответом сервера.
    if (requirePhone && digits.length !== 8) {
      setError('validation')
      return
    }

    setSending(true)
    setError(null)
    try {
      const response = await fetch('/api/promo-popup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          email: String(form.get('email') ?? ''),
          phone: digits ? `${PHONE_PREFIX}${digits}` : '',
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

  /** Форма или выданный код — одно и то же в обоих вариантах раскладки. */
  const body = issued ? (
    <div className="flex flex-col gap-3 text-center">
      <p className="text-ink text-label tracking-display uppercase">
        {issued.existing ? t('existingTitle') : t('successTitle')}
      </p>
      <p className="border-line text-ink text-display tracking-display rounded-sm border px-4 py-3 font-medium whitespace-nowrap md:text-body lg:text-display">
        {issued.code}
      </p>
      {/*
        Кнопка копирования — только у кода, который ещё можно применить.
        Копировать уже потраченный код незачем, а предложение это сделать
        противоречит подписи «Этот код уже использован в заказе» под ним.
      */}
      {!issued.isUsed && (
        <button
          type="button"
          onClick={copy}
          className="text-ink-muted hover:text-ink text-label cursor-pointer underline decoration-1 underline-offset-4 transition-colors"
        >
          {copied ? t('copied') : t('copy')}
        </button>
      )}
      <p className="text-ink-muted text-body-sm">
        {issued.isUsed ? t('usedHint') : issued.existing ? t('existingHint') : t('successHint')}
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
      {/* То же поле, что в корзине: плашка +373 и восемь цифр номера. */}
      <PhoneInput
        name="phone"
        value={phone}
        onChange={setPhone}
        required={requirePhone}
        invalid={error === 'validation' && requirePhone && toLocalPhoneDigits(phone).length !== 8}
        label={t('phonePlaceholder')}
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
        className="bg-navy text-ink-on-dark text-label tracking-display hover:bg-navy/90 flex cursor-pointer items-center justify-center gap-3 rounded-sm px-4 py-3 uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sending ? t('submitting') : buttonLabel}
        {!sending && <ArrowRight className="size-4 shrink-0" aria-hidden="true" />}
      </button>

      <p className="text-ink-subtle text-body-sm text-center">{footerText}</p>
    </form>
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/*
        Фон — сплошная подложка без размытия: теней и эффектов в брендбуке нет.
        Степень затемнения — токен `--color-overlay-popup` (tokens.css), а не
        число в классе: подбирается дизайнером в одном месте и не трогает
        подложки других оверлеев (дровер фильтров, зум галереи).
        `aria-hidden` + `tabIndex={-1}`: это дубль крестика для мыши, и в
        дереве доступности он лишний — иначе на попапе две одинаковые кнопки
        «Закрыть», и скринридер, и автотест выбирают не ту.
      */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={close}
        className="bg-overlay-popup absolute inset-0 cursor-default"
      />

      <div
        className={`bg-surface border-line relative w-full overflow-hidden rounded-sm border ${
          hasImage ? 'max-w-[380px] md:max-w-[900px]' : 'max-w-[380px]'
        }`}
      >
        {/*
          Крестик всегда в правом верхнем углу карточки. На ≥768px он попадает
          на светлую правую колонку и обходится без подложки; на телефоне он
          лежит поверх картинки, поэтому получает плашку цвета поверхности —
          это заливка, а не тень: контраст с любым кадром гарантирован.
        */}
        <button
          type="button"
          onClick={close}
          aria-label={t('close')}
          className={`text-ink hover:text-ink-muted absolute top-3 right-3 z-10 cursor-pointer rounded-sm transition-colors ${
            hasImage
              ? 'bg-surface/90 p-1.5 md:bg-transparent md:p-0'
              : 'text-ink-on-dark-muted hover:text-ink-on-dark'
          }`}
        >
          <X className="size-4" />
        </button>

        {hasImage ? (
          <div className="flex flex-col md:flex-row md:items-stretch">
            {/*
              Место под картинку зарезервировано контейнером, а не файлом:
              на телефоне — фиксированной пропорцией полосы, на десктопе —
              долей ширины карточки при высоте по правой колонке. Поэтому
              загрузка картинки не двигает вёрстку ни на одной ширине.
            */}
            <div className="relative aspect-[1000/540] w-full shrink-0 md:aspect-auto md:w-[52%]">
              <PromoPopupImage image={content.image} imageMobile={content.imageMobile} />
            </div>

            <div className="flex flex-1 flex-col px-6 py-6 text-center md:px-9 md:py-10">
              <h2
                id={titleId}
                className="text-ink text-hero-mobile tracking-display leading-tight sr-only font-light uppercase md:not-sr-only lg:text-hero"
              >
                {title}
              </h2>
              <span aria-hidden="true" className="bg-line mx-auto hidden h-px w-16 md:my-6 md:block" />
              <p className="text-accent-warm text-display leading-display hidden md:block">
                {subtitle}
              </p>
              <p className="text-ink text-body leading-body mt-3 hidden md:block">
                {description.map((part, index) =>
                  part.strong ? (
                    <strong key={index} className="font-medium">
                      {part.text}
                    </strong>
                  ) : (
                    <span key={index}>{part.text}</span>
                  ),
                )}
              </p>
              <div className="mt-6">{body}</div>
            </div>
          </div>
        ) : (
          <>
            {/* Картинок нет — прежняя тёмная шапка: знак, заголовок, процент. */}
            <div className="bg-navy flex flex-col items-center gap-2.5 px-6 py-7 text-center">
              <BrandMark className="text-cream h-9 w-auto" />
              <h2
                id={titleId}
                className="text-ink-on-dark-subtle text-eyebrow tracking-display uppercase"
              >
                {title}
              </h2>
              {percent > 0 && <p className="text-cream text-hero leading-none font-light">{percent}%</p>}
              <p className="text-ink-on-dark-muted text-body-sm">{subtitle}</p>
            </div>
            <div className="flex flex-col gap-3 px-6 py-6">{body}</div>
          </>
        )}
      </div>
    </div>
  )
}
