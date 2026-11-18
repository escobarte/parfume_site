import { createTranslator } from 'next-intl'
import type { Order } from '@/payload-types'
import en from '../../../messages/en.json'
import ro from '../../../messages/ro.json'
import ru from '../../../messages/ru.json'
import { orderCsvFilename } from './csv'
import { orderPdfFilename } from './pdf'
// Подписи способов получения и оплаты — общий источник с печатным PDF
// (src/lib/orders/summary.ts), чтобы письмо и вложение не разъехались.
import { fetchWithRetry } from './retry'
import { DELIVERY_METHOD_LABEL, PAYMENT_METHOD_LABEL } from './summary'
import type { NotifyResult } from './telegram'

const isPlaceholder = (value: string | undefined) =>
  !value || value.startsWith('CHANGEME') || value.trim() === ''

const CUSTOMER_EMAIL_MESSAGES = { ro, ru, en }

const statusUrl = (order: Order) => {
  const base = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000'
  const locale = order.locale ?? 'ro'
  return `${base}/${locale}/order/${order.statusToken ?? ''}`
}

function buildHtml(order: Order, hasPdf: boolean): string {
  const rows = (order.items ?? [])
    .map(
      (item) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #E3DACA">
          ${item.brandTitle ? `${item.brandTitle} · ` : ''}${item.title}
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid #E3DACA">${item.volume ?? ''}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E3DACA">${item.sku}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E3DACA">${item.qty}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E3DACA">${item.lineTotal} MDL</td>
      </tr>`,
    )
    .join('')

  const customer = order.customer

  return `<div style="font-family:Inter,Arial,sans-serif;color:#16293D">
    <h2 style="font-weight:300;letter-spacing:.1em;text-transform:uppercase">
      Новая заявка ${order.orderNumber ?? ''}
    </h2>
    <table style="border-collapse:collapse;font-size:14px">${rows}</table>
    ${
      order.promoCode
        ? `<p style="font-size:14px">Промокод: <b>${order.promoCode}</b> (-${order.promoDiscountPercent}%, -${order.promoDiscountAmount} MDL)</p>`
        : ''
    }
    <p style="font-size:15px"><b>Итого: ${order.total} MDL</b></p>
    <p style="font-size:14px;line-height:1.7">
      Имя: ${customer?.name ?? ''}<br>
      Телефон: ${customer?.phone ?? ''}<br>
      Связь: ${customer?.messenger ?? '—'}<br>
      Способ получения: ${DELIVERY_METHOD_LABEL[order.deliveryMethod ?? 'pickup'] ?? order.deliveryMethod}<br>
      Способ оплаты: ${PAYMENT_METHOD_LABEL[order.paymentMethod ?? 'cash'] ?? order.paymentMethod}<br>
      ${customer?.address ? `Адрес: ${customer.address}<br>` : ''}
      ${order.comment ? `Комментарий: ${order.comment}<br>` : ''}
      Язык заявки: ${(order.locale ?? '').toUpperCase()}
    </p>
    ${
      order.checkoutMode === 'noCall'
        ? `<p style="font-size:15px;color:#B3453C"><b>⚠️ БЕЗ ЗВОНКА — НЕ ЗВОНИТЬ</b></p>`
        : ''
    }
    <p style="font-size:12px;color:#4A5A6B">
      ${
        hasPdf
          ? 'Файлы заявки — во вложении: CSV (открывается в Excel) и PDF (печатная версия).'
          : 'Файл заявки — во вложении (CSV, открывается в Excel).'
      }
    </p>
  </div>`
}

function buildCustomerHtml(order: Order): string {
  const locale = (order.locale ?? 'ro') as keyof typeof CUSTOMER_EMAIL_MESSAGES
  const t = createTranslator({
    locale,
    messages: CUSTOMER_EMAIL_MESSAGES[locale],
    namespace: 'OrderEmailCustomer',
  })

  const rows = (order.items ?? [])
    .map(
      (item) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #E3DACA">
          ${item.brandTitle ? `${item.brandTitle} · ` : ''}${item.title}
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid #E3DACA">${item.volume ?? ''}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E3DACA">${item.qty}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E3DACA">${item.lineTotal} MDL</td>
      </tr>`,
    )
    .join('')

  return `<div style="font-family:Inter,Arial,sans-serif;color:#16293D">
    <h2 style="font-weight:300;letter-spacing:.1em;text-transform:uppercase">
      ${t('heading')}
    </h2>
    <p style="font-size:14px">${t('intro', { orderNumber: order.orderNumber ?? '' })}</p>
    <table style="border-collapse:collapse;font-size:14px">${rows}</table>
    <p style="font-size:15px"><b>${t('totalLabel')}: ${order.total} MDL</b></p>
    <p style="font-size:14px">
      <a href="${statusUrl(order)}" style="color:#16293D">${t('statusCta')}</a>
    </p>
  </div>`
}

/**
 * Письмо менеджеру через Resend с CSV и печатным PDF во вложениях.
 *
 * Ключа пока нет (CHANGEME_RESEND) — код полный и рабочий, но без ключа
 * он не падает, а возвращает пропуск: заявка от этого не теряется.
 * Отправляем обычным fetch к REST API, чтобы не тянуть SDK ради одного вызова.
 *
 * `pdf` необязателен намеренно: если генерация печатной версии упала,
 * письмо уходит с одним лишь CSV, а ошибка остаётся в логе — терять заявку
 * из-за оформления вложения нельзя (см. api/order-request/route.ts).
 *
 * Ретраи (2026-11-17): 3 попытки, пауза 1с/3с, таймаут на запрос — только на
 * сетевой сбой и 429/5xx, НЕ на прочий 4xx (`fetchWithRetry`, общий с
 * `telegram.ts`). Вызвано реальной потерей письма в проде (MF-261115-6ZLS):
 * `fetch failed` без единого повтора хоронил заявку безвозвратно.
 *
 * Идемпотентность: `Idempotency-Key` — стабильный на заказ+канал (не на
 * попытку), поэтому все повторы ОДНОЙ отправки, а позже и ручная пересылка
 * из `/admin` (см. `notify.ts::resendFailedNotifications`) переиспользуют
 * тот же ключ. Resend хранит ключ 24 часа и дедуплицирует запрос с тем же
 * телом — ровно тот случай, когда `fetch failed` на самом деле означает
 * «письмо ушло, потерялся только ответ»: без ключа повтор удвоил бы письмо
 * клиенту/менеджеру, с ключом Resend просто не отправит второе.
 */
export async function sendEmail(
  order: Order,
  csv: string,
  pdf?: Uint8Array | null,
): Promise<NotifyResult> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.ORDER_EMAIL_TO
  const from = process.env.ORDER_EMAIL_FROM ?? 'MON FLACON <onboarding@resend.dev>'

  if (isPlaceholder(apiKey)) return { ok: false, skipped: 'email skipped (no key)' }
  if (isPlaceholder(to)) return { ok: false, skipped: 'email skipped (no recipient)' }

  const outcome = await fetchWithRetry('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `order-email-manager/${order.id}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Новая заявка ${order.orderNumber ?? ''} — ${order.total} MDL${
        order.checkoutMode === 'noCall' ? ' — БЕЗ ЗВОНКА' : ''
      }`,
      html: buildHtml(order, Boolean(pdf && pdf.length)),
      attachments: [
        {
          filename: orderCsvFilename(order),
          content: Buffer.from(csv, 'utf8').toString('base64'),
        },
        ...(pdf && pdf.length
          ? [
              {
                filename: orderPdfFilename(order),
                content: Buffer.from(pdf).toString('base64'),
              },
            ]
          : []),
      ],
    }),
  })

  if (outcome.kind === 'network-error') {
    return {
      ok: false,
      error: `resend: ${outcome.error instanceof Error ? outcome.error.message : outcome.error}`,
      attempts: outcome.attempts,
    }
  }

  const { response, attempts } = outcome
  if (!response.ok) {
    const body = await response.text()
    return { ok: false, error: `resend ${response.status}: ${body.slice(0, 200)}`, attempts }
  }
  return { ok: true, attempts }
}

/**
 * Второе, отдельное письмо — клиенту (фаза 4.6.2): состав заказа, сумма,
 * ссылка на страницу статуса. Уходит только если у заявки есть
 * `customer.email` — иначе тихий пропуск, как и остальные каналы без данных.
 * Без вложения (CSV — только менеджеру).
 *
 * Ретраи и идемпотентность — см. `sendEmail` выше, тот же механизм, свой
 * ключ (`order-email-customer/<id>`) и независимый исход: сбой этого письма
 * не должен ни блокировать, ни помечать неудачным письмо менеджеру, и
 * наоборот (`notify.ts::notifyOrder` зовёт оба через `Promise.all`).
 */
export async function sendCustomerEmail(order: Order): Promise<NotifyResult> {
  const apiKey = process.env.RESEND_API_KEY
  const to = order.customer?.email
  const from = process.env.ORDER_EMAIL_FROM ?? 'MON FLACON <onboarding@resend.dev>'
  const locale = (order.locale ?? 'ro') as keyof typeof CUSTOMER_EMAIL_MESSAGES

  if (isPlaceholder(apiKey)) return { ok: false, skipped: 'customer email skipped (no key)' }
  if (isPlaceholder(to ?? undefined)) {
    return { ok: false, skipped: 'customer email skipped (no customer email)' }
  }

  const t = createTranslator({
    locale,
    messages: CUSTOMER_EMAIL_MESSAGES[locale],
    namespace: 'OrderEmailCustomer',
  })

  const outcome = await fetchWithRetry('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `order-email-customer/${order.id}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: t('subject', { orderNumber: order.orderNumber ?? '' }),
      html: buildCustomerHtml(order),
    }),
  })

  if (outcome.kind === 'network-error') {
    return {
      ok: false,
      error: `resend (customer): ${outcome.error instanceof Error ? outcome.error.message : outcome.error}`,
      attempts: outcome.attempts,
    }
  }

  const { response, attempts } = outcome
  if (!response.ok) {
    const body = await response.text()
    return {
      ok: false,
      error: `resend (customer) ${response.status}: ${body.slice(0, 200)}`,
      attempts,
    }
  }
  return { ok: true, attempts }
}

/**
 * Письмо с персональным промокодом из попапа «первая скидка» (2026-09-11).
 * Тот же контур Resend, что у писем о заказе: без ключа (CHANGEME) тихо
 * пропускается — код клиент в любом случае видит прямо в попапе, письмо
 * это дубль, а не единственный канал доставки.
 */
export async function sendPromoCodeEmail({
  to,
  name,
  code,
  percent,
  locale,
}: {
  to: string
  name: string
  code: string
  percent: number
  locale: string
}): Promise<NotifyResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.ORDER_EMAIL_FROM ?? 'MON FLACON <onboarding@resend.dev>'

  if (isPlaceholder(apiKey)) return { ok: false, skipped: 'promo email skipped (no key)' }
  if (isPlaceholder(to)) return { ok: false, skipped: 'promo email skipped (no address)' }

  const messages = CUSTOMER_EMAIL_MESSAGES[locale as keyof typeof CUSTOMER_EMAIL_MESSAGES] ?? ro
  const t = createTranslator({ locale, messages, namespace: 'PromoCodeEmail' })

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;color:#16293D;max-width:520px">
      <p style="font-size:15px">${t('greeting', { name })}</p>
      <p style="font-size:14px">${t('intro', { percent })}</p>
      <p style="font-size:22px;letter-spacing:.08em;border:1px solid #E3DACA;padding:14px 18px;display:inline-block">
        <b>${code}</b>
      </p>
      <p style="font-size:13px;color:#4A5A6B">${t('hint')}</p>
    </div>`

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: t('subject'), html }),
    })
    if (!response.ok) {
      const body = await response.text()
      return { ok: false, error: `resend (promo) ${response.status}: ${body.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: `resend (promo): ${error instanceof Error ? error.message : error}` }
  }
}
