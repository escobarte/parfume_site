import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Order } from '@/payload-types'
import { orderCsvFilename } from './csv'

/**
 * Запись CSV заявки на диск — отдельный канал для интеграции с 1С
 * (их специалист забирает файлы по SFTP, сайт только пишет в volume,
 * Coolify монтирует его в `ORDER_EXPORT_DIR`). Дополнительный получатель
 * уже существующего CSV (см. `buildOrderCsv`), не замена email/Telegram/
 * кнопке «CSV» в `/admin`.
 *
 * Имя файла — номер заявки, как и у вложения к письму (`orderCsvFilename`):
 * повторная запись тем же номером перезатирает файл, дублей с суффиксами
 * не создаёт.
 *
 * Любая ошибка (volume не смонтирован, нет места, нет прав) — только в
 * лог. Заявка уже создана в БД к моменту вызова, остальные уведомления
 * (админка, email, Telegram, PDF) от этого канала не зависят.
 */
export async function writeOrderCsvExport(order: Order, csv: string): Promise<void> {
  const dir = process.env.ORDER_EXPORT_DIR || '/app/order-export'
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, orderCsvFilename(order)), csv, 'utf8')
  } catch (error) {
    console.error(
      `[order ${order.orderNumber}] order-export csv write failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}
