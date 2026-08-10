import type { Order } from '@/payload-types'
import { sendEmail } from './email'
import { sendTelegram, type NotifyResult } from './telegram'

export const isDryRun = () => process.env.ORDERS_DRY_RUN === '1'

export type NotifyReport = {
  dryRun: boolean
  telegram: NotifyResult
  email: NotifyResult
}

/**
 * Все каналы уведомления в одном месте: Telegram и письмо уходят параллельно,
 * падение одного не мешает другому и никогда не роняет саму заявку — она уже
 * в базе. `ORDERS_DRY_RUN=1` глушит обе внешние отправки, но CSV всё равно
 * генерится и сохраняется: именно так и тестируем.
 */
export async function notifyOrder(order: Order, csv: string): Promise<NotifyReport> {
  if (isDryRun()) {
    const skipped = { ok: false, skipped: 'skipped (ORDERS_DRY_RUN=1)' }
    return { dryRun: true, telegram: skipped, email: skipped }
  }

  const [telegram, email] = await Promise.all([sendTelegram(order), sendEmail(order, csv)])
  return { dryRun: false, telegram, email }
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
  ] as const) {
    if (result.ok) logger.info(`${tag} ${channel} sent`)
    else if (result.skipped) logger.info(`${tag} ${result.skipped}`)
    else logger.error(`${tag} ${result.error}`)
  }
}
