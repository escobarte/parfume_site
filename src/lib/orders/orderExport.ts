import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Order } from '@/payload-types'
import { orderJsonFilename } from './orderJson'

/**
 * Запись JSON заявки на диск — отдельный канал для интеграции с 1С
 * (их специалист забирает файлы по FTP, сайт только пишет в volume,
 * Coolify монтирует его в `ORDER_EXPORT_DIR`). В эту папку попадает ТОЛЬКО
 * JSON — CSV, уходящий письмом/Telegram и отдаваемый кнопкой «CSV» в
 * `/admin` (`buildOrderCsv`, `exportCsv`), с этим каналом не связан.
 *
 * Имя файла — номер заявки, как и у остальных файлов заявки
 * (`orderJsonFilename`): повторная запись тем же номером перезатирает файл,
 * дублей с суффиксами не создаёт.
 *
 * Любая ошибка (volume не смонтирован, нет места, нет прав) — только в
 * лог. Заявка уже создана в БД к моменту вызова, остальные уведомления
 * (админка, email, Telegram, PDF) от этого канала не зависят.
 */
export async function writeOrderJsonExport(order: Order, json: string): Promise<void> {
  const dir = process.env.ORDER_EXPORT_DIR || '/app/order-export'
  try {
    await mkdir(dir, { recursive: true })
    // Явный режим файла (654 ~ u=rw,g=r,o=r), а не умолчание от umask:
    // FTP-пользователь 1С читает файлы, не создавая их сам, и его собственный
    // umask тут ни при чём — важен режим НАШЕЙ записи. Тот же набор прав,
    // что был у CSV-файлов в этой папке (STATE.md: `-rw-r--r--`).
    await writeFile(path.join(dir, orderJsonFilename(order)), json, {
      encoding: 'utf8',
      mode: 0o644,
    })
  } catch (error) {
    console.error(
      `[order ${order.orderNumber}] order-export json write failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}
