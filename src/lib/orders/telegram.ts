import type { Order } from '@/payload-types'

const MESSENGER_LABEL: Record<string, string> = {
  telegram: 'Telegram',
  viber: 'Viber',
  whatsapp: 'WhatsApp',
  call: 'Звонок',
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Человекочитаемое сообщение менеджеру: состав, суммы, контакт, комментарий. */
export function buildTelegramMessage(order: Order): string {
  const customer = order.customer
  const lines: string[] = []

  lines.push(`<b>Новая заявка ${escapeHtml(order.orderNumber ?? '')}</b>`)
  lines.push('')

  for (const item of order.items ?? []) {
    const brand = item.brandTitle ? `${escapeHtml(item.brandTitle)} · ` : ''
    const volume = item.volume ? `${item.volume} ml` : ''
    lines.push(`• ${brand}<b>${escapeHtml(item.title)}</b>`)
    lines.push(
      `  ${volume}${volume ? ' · ' : ''}${escapeHtml(item.sku)} · ${item.qty} × ${item.price} = <b>${item.lineTotal} MDL</b>`,
    )
  }

  lines.push('')
  lines.push(`<b>Итого: ${order.total} MDL</b>`)
  lines.push('')
  lines.push(`Имя: ${escapeHtml(customer?.name ?? '')}`)
  lines.push(`Телефон: ${escapeHtml(customer?.phone ?? '')}`)
  if (customer?.messenger) {
    lines.push(`Связь: ${MESSENGER_LABEL[customer.messenger] ?? customer.messenger}`)
  }
  // Пустой адрес не печатаем вовсе — поле необязательное (фаза 9.1).
  if (customer?.address) lines.push(`Адрес: ${escapeHtml(customer.address)}`)
  if (order.comment) lines.push(`Комментарий: ${escapeHtml(order.comment)}`)
  // Пометка «не звонить» — отдельной заметной строкой; обычная заявка
  // (дефолт) строки не занимает.
  if (order.checkoutMode === 'noCall') lines.push('<b>⚠️ БЕЗ ЗВОНКА — НЕ ЗВОНИТЬ</b>')
  lines.push(
    `Язык заявки: ${(order.locale ?? '').toUpperCase()} · источник: ${order.source ?? '—'}`,
  )

  return lines.join('\n')
}

export type NotifyResult = { ok: boolean; skipped?: string; error?: string }

const isPlaceholder = (value: string | undefined) =>
  !value || value.startsWith('CHANGEME') || value.trim() === ''

/** Отправка в Telegram. Плейсхолдер токена — не ошибка, а пропуск. */
export async function sendTelegram(order: Order): Promise<NotifyResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (isPlaceholder(token) || isPlaceholder(chatId)) {
    return { ok: false, skipped: 'telegram skipped (no token/chat id)' }
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildTelegramMessage(order),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      return { ok: false, error: `telegram ${response.status}: ${body.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: `telegram: ${error instanceof Error ? error.message : error}` }
  }
}
