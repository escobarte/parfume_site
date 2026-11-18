import type { Payload } from 'payload'
import type { Order } from '@/payload-types'
import { sendCustomerEmail, sendEmail } from './email'
import { sendTelegram, type NotifyResult } from './telegram'

export const isDryRun = () => process.env.ORDERS_DRY_RUN === '1'

export type NotifyChannel = 'telegram' | 'email' | 'customerEmail'

export type NotifyReport = {
  dryRun: boolean
  telegram: NotifyResult
  email: NotifyResult
  customerEmail: NotifyResult
}

/**
 * Все каналы уведомления в одном месте: Telegram и оба письма уходят
 * параллельно, падение одного не мешает другим и никогда не роняет саму
 * заявку — она уже в базе. `ORDERS_DRY_RUN=1` глушит все внешние отправки,
 * но CSV всё равно генерится и сохраняется: именно так и тестируем.
 *
 * Каждый канал сам по себе уже ретраит сетевые сбои и 429/5xx (email.ts,
 * telegram.ts) — здесь это не повторяется, `notifyOrder` вызывается один раз
 * на заявку (из `after()` в order-request/route.ts). Повторная ручная
 * отправка неудавшихся каналов — `resendFailedNotifications` ниже, не эта
 * функция (та всегда шлёт все три, как и положено при первом создании
 * заявки, когда статуса ещё нет вообще).
 */
export async function notifyOrder(
  order: Order,
  csv: string,
  pdf?: Uint8Array | null,
): Promise<NotifyReport> {
  if (isDryRun()) {
    const skipped = { ok: false, skipped: 'skipped (ORDERS_DRY_RUN=1)' }
    return { dryRun: true, telegram: skipped, email: skipped, customerEmail: skipped }
  }

  const [telegram, email, customerEmail] = await Promise.all([
    sendTelegram(order),
    sendEmail(order, csv, pdf),
    sendCustomerEmail(order),
  ])
  return { dryRun: false, telegram, email, customerEmail }
}

/** Единый лог: видно, что ушло, что пропущено и почему. */
export function logNotifyReport(
  logger: { info: (message: string) => void; error: (message: string) => void },
  order: Order,
  report: NotifyReport,
): void {
  const tag = `[order ${order.orderNumber}]`

  for (const [channel, result] of [
    ['telegram', report.telegram],
    ['email', report.email],
    ['customer-email', report.customerEmail],
  ] as const) {
    if (result.ok) logger.info(`${tag} ${channel} sent (${result.attempts ?? 1} попытка/и)`)
    else if (result.skipped) logger.info(`${tag} ${result.skipped}`)
    else logger.error(`${tag} ${result.error} (попыток: ${result.attempts ?? 1})`)
  }
}

type NotifyChannelStatus = { status: 'sent' | 'failed' | 'skipped'; attempts: number; lastError: string }

/** `NotifyResult` → форма, в которой статус лежит на заказе (`Order.notifyStatus.*`). */
function toChannelStatus(result: NotifyResult): NotifyChannelStatus {
  return {
    status: result.ok ? 'sent' : result.skipped ? 'skipped' : 'failed',
    attempts: result.attempts ?? 1,
    // Не ошибка (sent/skipped) — поле очищается, а не оставляет текст
    // предыдущей неудачи висеть после удачного повтора.
    lastError: result.ok || result.skipped ? '' : (result.error ?? '').slice(0, 500),
  }
}

const CHANNEL_TO_RESULT_KEY = {
  telegram: 'telegram',
  email: 'emailManager',
  customerEmail: 'emailCustomer',
} as const satisfies Record<NotifyChannel, string>

/** Отчёт `notifyOrder`/`resendFailedNotifications` → патч для `payload.update`. */
export function buildNotifyStatusPatch(report: NotifyReport): Partial<Order> {
  return {
    notifyStatus: {
      emailManager: toChannelStatus(report.email),
      emailCustomer: toChannelStatus(report.customerEmail),
      telegram: toChannelStatus(report.telegram),
    },
  }
}

/** Пишет статусы на заказ. `dryRun` — ничего не пишет (отчёт из заглушек, не о чем сохранять). */
export async function recordNotifyStatus(
  payload: Payload,
  orderId: Order['id'],
  report: NotifyReport,
): Promise<void> {
  if (report.dryRun) return
  await payload.update({ collection: 'orders', id: orderId, data: buildNotifyStatusPatch(report) })
}

const channelAlreadySent = (order: Order, channel: NotifyChannel): boolean =>
  order.notifyStatus?.[CHANNEL_TO_RESULT_KEY[channel]]?.status === 'sent'

/** Собирает `NotifyResult`, когда канал не трогали — статус уже был «sent». */
function resultFromExisting(order: Order, channel: NotifyChannel): NotifyResult {
  const existing = order.notifyStatus?.[CHANNEL_TO_RESULT_KEY[channel]]
  return { ok: true, attempts: existing?.attempts ?? 1 }
}

/**
 * Кнопка «Отправить письма заново» (карточка заказа, только admin, см.
 * эндпойнт `/:id/resend-notifications` в `src/collections/Orders.ts`) —
 * повторяет ТОЛЬКО то, что ещё не ушло.
 * Канал со статусом `sent` не трогается вовсе: ни лишнего сетевого вызова,
 * ни риска продублировать письмо, которое и так дошло (идемпотентность на
 * уровне заказа — поверх `Idempotency-Key` внутри самого email.ts, который
 * защищает от дубля уже на уровне одной отправки с ретраями).
 */
export async function resendFailedNotifications(
  payload: Payload,
  order: Order,
  csv: string,
  pdf?: Uint8Array | null,
): Promise<{ report: NotifyReport; retried: NotifyChannel[] }> {
  if (isDryRun()) {
    const skipped = { ok: false, skipped: 'skipped (ORDERS_DRY_RUN=1)' }
    return { report: { dryRun: true, telegram: skipped, email: skipped, customerEmail: skipped }, retried: [] }
  }

  const retried: NotifyChannel[] = []
  const run = <T extends NotifyChannel>(channel: T, send: () => Promise<NotifyResult>) => {
    if (channelAlreadySent(order, channel)) return resultFromExisting(order, channel)
    retried.push(channel)
    return send()
  }

  const [telegram, email, customerEmail] = await Promise.all([
    Promise.resolve(run('telegram', () => sendTelegram(order))),
    Promise.resolve(run('email', () => sendEmail(order, csv, pdf))),
    Promise.resolve(run('customerEmail', () => sendCustomerEmail(order))),
  ])

  const report: NotifyReport = { dryRun: false, telegram, email, customerEmail }
  await recordNotifyStatus(payload, order.id, report)
  return { report, retried }
}
