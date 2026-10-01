// @vitest-environment node
//
// Node, а не jsdom (дефолт проекта): запись CSV идёт обычным fs, который в
// jsdom недоступен.

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeOrderCsvExport } from '@/lib/orders/orderExport'
import type { Order } from '@/payload-types'

/**
 * Дополнительный канал CSV для 1С (ORDER_EXPORT_DIR) — пишет файл
 * <номер заявки>.csv рядом с остальными получателями того же CSV (письмо,
 * Telegram, кнопка в /admin), но ни в коем случае не должен бросать
 * исключение наверх: сбой записи на диск не должен ронять заявку.
 */

const order = (overrides: Partial<Order> = {}): Order =>
  ({
    id: 1,
    orderNumber: 'MF-260930-91N5',
    ...overrides,
  }) as Order

let dir: string
const originalDir = process.env.ORDER_EXPORT_DIR

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'order-export-'))
  process.env.ORDER_EXPORT_DIR = dir
})

afterEach(async () => {
  process.env.ORDER_EXPORT_DIR = originalDir
  await rm(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('writeOrderCsvExport', () => {
  it('пишет файл <номер заявки>.csv с содержимым CSV', async () => {
    await writeOrderCsvExport(order(), 'date;name\r\n2026-09-30;Test\r\n')

    const content = await readFile(path.join(dir, 'MF-260930-91N5.csv'), 'utf8')
    expect(content).toBe('date;name\r\n2026-09-30;Test\r\n')
  })

  it('повторная запись тем же номером перезатирает файл, не создаёт дублей', async () => {
    await writeOrderCsvExport(order(), 'первая версия')
    await writeOrderCsvExport(order(), 'вторая версия')

    const content = await readFile(path.join(dir, 'MF-260930-91N5.csv'), 'utf8')
    expect(content).toBe('вторая версия')
  })

  it('создаёт папку, если её ещё нет', async () => {
    const nested = path.join(dir, 'nested', 'export')
    process.env.ORDER_EXPORT_DIR = nested

    await writeOrderCsvExport(order(), 'содержимое')

    const content = await readFile(path.join(nested, 'MF-260930-91N5.csv'), 'utf8')
    expect(content).toBe('содержимое')
  })

  it('ошибка записи (папка недоступна) логируется и не бросает исключение', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Обычный файл на месте ожидаемой директории — mkdir на него упадёт ENOTDIR.
    const blocked = path.join(dir, 'blocked')
    await writeFile(blocked, '')
    process.env.ORDER_EXPORT_DIR = blocked

    await expect(writeOrderCsvExport(order(), 'не важно')).resolves.toBeUndefined()

    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('MF-260930-91N5'))
  })
})
