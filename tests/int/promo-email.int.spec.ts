import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendPromoCodeEmail } from '@/lib/orders/email'

/**
 * Письмо с персональным промокодом. Resend мокается на уровне `fetch` — это
 * и есть весь клиент: `email.ts` ходит в его HTTP API напрямую, без SDK,
 * поэтому подменять больше нечего.
 *
 * Проверяется контракт отправки, а не вёрстка письма: куда уходит запрос,
 * с какой авторизацией, что в теле, и — главное — что ЛЮБОЙ сбой почты
 * возвращается значением, а не исключением. Попап показывает код независимо
 * от результата, и эта функция не имеет права сломать ему ответ.
 */

const ARGS = {
  to: 'client@example.com',
  name: 'Иван',
  code: 'WELCOME-ABC234',
  percent: 15,
  locale: 'ru',
}

const okResponse = () => new Response(JSON.stringify({ id: 'mail_1' }), { status: 200 })

describe('sendPromoCodeEmail', () => {
  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('ORDER_EMAIL_FROM', 'MON FLACON <no-reply@monflacon.md>')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('уходит в Resend с ключом, адресом и кодом в теле', async () => {
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)

    await expect(sendPromoCodeEmail(ARGS)).resolves.toEqual({ ok: true })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test_key')

    const body = JSON.parse(String(init.body))
    expect(body.to).toEqual(['client@example.com'])
    expect(body.from).toBe('MON FLACON <no-reply@monflacon.md>')
    expect(body.html).toContain('WELCOME-ABC234')
    // Процент и имя подставляются из аргументов, а не зашиты в шаблон.
    expect(body.html).toContain('15')
    expect(body.html).toContain('Иван')
  })

  it('письмо локализуется: тема на языке посетителя', async () => {
    const seen: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        seen.push(JSON.parse(String(init.body)).subject)
        return okResponse()
      }),
    )

    await sendPromoCodeEmail({ ...ARGS, locale: 'ru' })
    await sendPromoCodeEmail({ ...ARGS, locale: 'en' })
    await sendPromoCodeEmail({ ...ARGS, locale: 'ro' })

    expect(new Set(seen).size).toBe(3)
    expect(seen[1]).toMatch(/promo code/i)
  })

  it('без ключа Resend — тихий пропуск, запроса нет', async () => {
    vi.stubEnv('RESEND_API_KEY', 'CHANGEME_RESEND')
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendPromoCodeEmail(ARGS)
    expect(result.ok).toBe(false)
    expect(result.skipped).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('пустой адрес — тоже пропуск, а не попытка отправки', async () => {
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendPromoCodeEmail({ ...ARGS, to: '' })
    expect(result.skipped).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Resend ответил ошибкой — возвращается error, исключения нет', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('domain not verified', { status: 422 })),
    )

    const result = await sendPromoCodeEmail(ARGS)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('422')
    // Текст ответа Resend попадает в лог — без него «422» не диагностируется.
    expect(result.error).toContain('domain not verified')
  })

  it('сеть упала — возвращается error, исключение наружу не летит', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }),
    )

    // Именно resolves, а не rejects: попап не должен падать из-за почты.
    const result = await sendPromoCodeEmail(ARGS)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('ECONNREFUSED')
  })

  it('неизвестная локаль не роняет отправку — берётся дефолтная', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()))
    await expect(sendPromoCodeEmail({ ...ARGS, locale: 'de' })).resolves.toEqual({ ok: true })
  })
})
