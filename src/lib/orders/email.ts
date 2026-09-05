import { createTranslator } from 'next-intl'
import type { Order } from '@/payload-types'
import en from '../../../messages/en.json'
import ro from '../../../messages/ro.json'
import ru from '../../../messages/ru.json'
import { orderCsvFilename } from './csv'
import type { NotifyResult } from './telegram'

const isPlaceholder = (value: string | undefined) =>
  !value || value.startsWith('CHANGEME') || value.trim() === ''

const CUSTOMER_EMAIL_MESSAGES = { ro, ru, en }

const statusUrl = (order: Order) => {
  const base = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000'
  const locale = order.locale ?? 'ro'
  return `${base}/${locale}/order/${order.statusToken ?? ''}`
}

function buildHtml(order: Order): string {
  const rows = (order.items ?? [])
    .map(
      (item) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #E3DACA">
          ${item.brandTitle ? `${item.brandTitle} · ` : ''}${item.title}
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid #E3DACA">${item.volume ? `${item.volume} ml` : ''}</td>
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
    <p style="font-size:15px"><b>Итого: ${order.total} MDL</b></p>
    <p style="font-size:14px;line-height:1.7">
      Имя: ${customer?.name ?? ''}<br>
      Телефон: ${customer?.phone ?? ''}<br>
      Связь: ${customer?.messenger ?? '—'}<br>
      ${customer?.address ? `Адрес: ${customer.address}<br>` : ''}
      ${order.comment ? `Комментарий: ${order.comment}<br>` : ''}
      Язык заявки: ${(order.locale ?? '').toUpperCase()}
    </p>
    ${
      order.checkoutMode === 'noCall'
        ? `<p style="font-size:15px;color:#B3453C"><b>⚠️ БЕЗ ЗВОНКА — НЕ ЗВОНИТЬ</b></p>`
        : ''
    }
    <p style="font-size:12px;color:#4A5A6B">Файл заявки — во вложении (CSV, открывается в Excel).</p>
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
        <td style="padding:6px 10px;border-bottom:1px solid #E3DACA">${item.volume ? `${item.volume} ml` : ''}</td>
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
 * Письмо менеджеру через Resend с CSV во вложении.
 *
 * Ключа пока нет (CHANGEME_RESEND) — код полный и рабочий, но без ключа
 * он не падает, а возвращает пропуск: заявка от этого не теряется.
 * Отправляем обычным fetch к REST API, чтобы не тянуть SDK ради одного вызова.
 */
export async function sendEmail(order: Order, csv: string): Promise<NotifyResult> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.ORDER_EMAIL_TO
  const from = process.env.ORDER_EMAIL_FROM ?? 'MON FLACON <onboarding@resend.dev>'

  if (isPlaceholder(apiKey)) return { ok: false, skipped: 'email skipped (no key)' }
  if (isPlaceholder(to)) return { ok: false, skipped: 'email skipped (no recipient)' }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Новая заявка ${order.orderNumber ?? ''} — ${order.total} MDL${
          order.checkoutMode === 'noCall' ? ' — БЕЗ ЗВОНКА' : ''
        }`,
        html: buildHtml(order),
        attachments: [
          {
            filename: orderCsvFilename(order),
            content: Buffer.from(csv, 'utf8').toString('base64'),
          },
        ],
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      return { ok: false, error: `resend ${response.status}: ${body.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: `resend: ${error instanceof Error ? error.message : error}` }
  }
}

/**
 * Второе, отдельное письмо — клиенту (фаза 4.6.2): состав заказа, сумма,
 * ссылка на страницу статуса. Уходит только если у заявки есть
 * `customer.email` — иначе тихий пропуск, как и остальные каналы без данных.
 * Без вложения (CSV — только менеджеру).
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

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: t('subject', { orderNumber: order.orderNumber ?? '' }),
        html: buildCustomerHtml(order),
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      return { ok: false, error: `resend (customer) ${response.status}: ${body.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: `resend (customer): ${error instanceof Error ? error.message : error}`,
    }
  }
}
