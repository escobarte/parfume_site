// @vitest-environment node
//
// Node, а не jsdom (дефолт проекта): запись JSON идёт обычным fs, который в
// jsdom недоступен.

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeOrderJsonExport } from '@/lib/orders/orderExport'
import type { Order } from '@/payload-types'

/**
 * Канал JSON для 1С (ORDER_EXPORT_DIR) — пишет файл <номер заявки>.json
 * в папку, которую читает FTP-пользователь 1С. В эту папку, в отличие от
 * письма/Telegram/кнопки «CSV» в `/admin`, попадает ТОЛЬКО JSON. Запись не
 * должна бросать исключение наверх: сбой записи на диск не должен ронять
 * заявку.
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

describe('writeOrderJsonExport', () => {
  it('пишет файл <номер заявки>.json с содержимым', async () => {
    await writeOrderJsonExport(order(), '{"orderNumber":"MF-260930-91N5"}')

    const content = await readFile(path.join(dir, 'MF-260930-91N5.json'), 'utf8')
    expect(content).toBe('{"orderNumber":"MF-260930-91N5"}')
    expect(() => JSON.parse(content)).not.toThrow()
  })

  it('повторная запись тем же номером перезатирает файл, не создаёт дублей', async () => {
    await writeOrderJsonExport(order(), '{"version":1}')
    await writeOrderJsonExport(order(), '{"version":2}')

    const content = await readFile(path.join(dir, 'MF-260930-91N5.json'), 'utf8')
    expect(content).toBe('{"version":2}')
  })

  it('создаёт папку, если её ещё нет', async () => {
    const nested = path.join(dir, 'nested', 'export')
    process.env.ORDER_EXPORT_DIR = nested

    await writeOrderJsonExport(order(), '{"ok":true}')

    const content = await readFile(path.join(nested, 'MF-260930-91N5.json'), 'utf8')
    expect(content).toBe('{"ok":true}')
  })

  it('ошибка записи (папка недоступна) логируется и не бросает исключение', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Обычный файл на месте ожидаемой директории — mkdir на него упадёт ENOTDIR.
    const blocked = path.join(dir, 'blocked')
    await writeFile(blocked, '')
    process.env.ORDER_EXPORT_DIR = blocked

    await expect(writeOrderJsonExport(order(), '{}')).resolves.toBeUndefined()

    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('MF-260930-91N5'))
  })
})
