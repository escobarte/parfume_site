import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import type { Order } from '@/payload-types'
import { sendCustomerEmail, sendEmail } from '@/lib/orders/email'
import { buildNotifyStatusPatch, notifyOrder, resendFailedNotifications } from '@/lib/orders/notify'
import { sendTelegram } from '@/lib/orders/telegram'

/**
 * Ретраи уведомлений о заявке (2026-11-17) — вызвано реальной потерей
 * письма в проде (MF-261115-6ZLS): `fetch failed` к Resend без единого
 * повтора хоронил заявку безвозвратно, то же для Telegram.
 *
 * Бэкофф (1с/3с, `src/lib/orders/retry.ts`) — реальный `setTimeout`, поэтому
 * здесь фейковые таймеры (`vi.useFakeTimers()` + `vi.runAllTimersAsync()`):
 * без них каждый тест на исчерпанные попытки реально ждал бы 4с.
 */

const order = (overrides: Partial<Order> = {}): Order =>
  ({
    id: 1,
    orderNumber: 'MF-TEST-0001',
    status: 'new',
    checkoutMode: 'standard',
    deliveryMethod: 'pickup',
    paymentMethod: 'cash',
    customer: { name: 'Иван', phone: '+37360000000', email: 'client@example.com' },
    items: [],
    total: 100,
    ...overrides,
  }) as Order

const okResponse = () => new Response(JSON.stringify({ id: 'mail_1' }), { status: 200 })
const errorResponse = (status: number, body = 'error') => new Response(body, { status })

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync()
  return promise
}

describe('ретраи: Resend (письма заявки)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('ORDER_EMAIL_TO', 'manager@example.com')
    vi.stubEnv('ORDER_EMAIL_FROM', 'MON FLACON <no-reply@monflacon.md>')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('сеть упала один раз — успех со 2-й попытки', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    const result = await settle(sendEmail(order(), 'csv-content'))

    expect(result).toEqual({ ok: true, attempts: 2 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('сеть падает все три раза — отказ, попыток ровно 3', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('fetch failed'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await settle(sendEmail(order(), 'csv-content'))

    expect(result.ok).toBe(false)
    expect(result.attempts).toBe(3)
    expect(result.error).toContain('fetch failed')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('4xx (кроме 429) — повтора нет, ровно один вызов', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(422, 'domain not verified'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await settle(sendEmail(order(), 'csv-content'))

    expect(result.ok).toBe(false)
    expect(result.attempts).toBe(1)
    expect(result.error).toContain('422')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('429 — ретраится как временный сбой', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429, 'rate limited'))
      .mockResolvedValueOnce(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    const result = await settle(sendEmail(order(), 'csv-content'))

    expect(result).toEqual({ ok: true, attempts: 2 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('5xx — ретраится как временный сбой', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(503, 'unavailable'))
      .mockResolvedValueOnce(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    const result = await settle(sendEmail(order(), 'csv-content'))

    expect(result).toEqual({ ok: true, attempts: 2 })
  })

  it('Idempotency-Key стабилен на заказ+канал, одинаков на каждой попытке', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    await settle(sendEmail(order({ id: 42 }), 'csv-content'))

    const keys = fetchMock.mock.calls.map((call) => {
      const init = call[1] as RequestInit
      return (init.headers as Record<string, string>)['Idempotency-Key']
    })
    expect(keys).toEqual(['order-email-manager/42', 'order-email-manager/42'])
  })

  it('письмо клиенту использует свой ключ идемпотентности, не ключ менеджера', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    await settle(sendCustomerEmail(order({ id: 7 })))

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('order-email-customer/7')
  })
})

describe('ретраи: Telegram', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'tg_test_token')
    vi.stubEnv('TELEGRAM_CHAT_ID', '123456')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('сеть упала один раз — успех со 2-й попытки', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    const result = await settle(sendTelegram(order()))

    expect(result).toEqual({ ok: true, attempts: 2 })
  })

  it('5xx все три раза — отказ, попыток ровно 3', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(500, 'telegram down'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await settle(sendTelegram(order()))

    expect(result.ok).toBe(false)
    expect(result.attempts).toBe(3)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('4xx (400) — без повтора', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(400, 'bad request'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await settle(sendTelegram(order()))

    expect(result.attempts).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('403 (бот заблокирован) — без повтора, отдельное диагностируемое сообщение', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(403, 'Forbidden: bot was blocked by the user'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await settle(sendTelegram(order()))

    expect(result.ok).toBe(false)
    expect(result.attempts).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.error).toContain('заблокировал бота')
    expect(result.error).toContain('chat_id')
  })
})

describe('notifyOrder: независимость каналов', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Локальный .env держит ORDERS_DRY_RUN=1 (дев-умолчание) — notifyOrder()
    // иначе вернёт сплошной skip, не дойдя до самих sendX.
    vi.stubEnv('ORDERS_DRY_RUN', '0')
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('ORDER_EMAIL_TO', 'manager@example.com')
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'tg_test_token')
    vi.stubEnv('TELEGRAM_CHAT_ID', '123456')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('письмо менеджеру падает насовсем, письмо клиенту и Telegram всё равно уходят', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes('telegram.org')) return okResponse()
      const body = JSON.parse(String(init.body)) as { to: string[] }
      // Менеджерское письмо (ORDER_EMAIL_TO) — постоянный сбой; клиентское — ок.
      if (body.to[0] === 'manager@example.com') return errorResponse(500, 'resend down')
      return okResponse()
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await settle(notifyOrder(order({ id: 5 }), 'csv-content'))

    expect(result.email.ok).toBe(false)
    expect(result.email.attempts).toBe(3)
    expect(result.customerEmail).toEqual({ ok: true, attempts: 1 })
    expect(result.telegram).toEqual({ ok: true, attempts: 1 })
  })
})

describe('запись статусов на заказ', () => {
  it('buildNotifyStatusPatch: sent/failed/skipped и attempts мапятся по каждому каналу', () => {
    const patch = buildNotifyStatusPatch({
      dryRun: false,
      telegram: { ok: true, attempts: 1 },
      email: { ok: false, error: 'resend 500: unavailable', attempts: 3 },
      customerEmail: { ok: false, skipped: 'customer email skipped (no customer email)' },
    })

    expect(patch.notifyStatus).toEqual({
      telegram: { status: 'sent', attempts: 1, lastError: '' },
      emailManager: { status: 'failed', attempts: 3, lastError: 'resend 500: unavailable' },
      emailCustomer: { status: 'skipped', attempts: 1, lastError: '' },
    })
  })

  it('resendFailedNotifications: канал уже «sent» не трогается, остальные — повторяются', async () => {
    vi.stubEnv('ORDERS_DRY_RUN', '0')
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('ORDER_EMAIL_TO', 'manager@example.com')
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'tg_test_token')
    vi.stubEnv('TELEGRAM_CHAT_ID', '123456')

    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    const update = vi.fn()
    const payload = { update } as unknown as Payload

    const orderWithPartialStatus = order({
      id: 9,
      notifyStatus: {
        telegram: { status: 'sent', attempts: 1, lastError: '' },
        emailManager: { status: 'failed', attempts: 3, lastError: 'resend 500: unavailable' },
        emailCustomer: { status: 'skipped', attempts: 1, lastError: '' },
      },
    })

    const { report, retried } = await resendFailedNotifications(payload, orderWithPartialStatus, 'csv-content')

    expect(retried.sort()).toEqual(['customerEmail', 'email'].sort())
    expect(report.telegram).toEqual({ ok: true, attempts: 1 })
    // Telegram не трогался — нет сетевого вызова к api.telegram.org.
    expect(fetchMock.mock.calls.every((call) => !(call[0] as string).includes('telegram.org'))).toBe(true)
    expect(update).toHaveBeenCalledTimes(1)

    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })
})
