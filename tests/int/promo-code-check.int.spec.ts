import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { resolvePromoCode } from '@/lib/orders/promo'

/**
 * Проверка промокода без лимита запросов (2026-09-19, решение владельца).
 *
 * Симптом, из-за которого лимит сняли: у персонального кода с `isUsed: true`
 * корзина показывала «Слишком много попыток, попробуйте позже» вместо «Код уже
 * использован». Причина — `checkRateLimit` стоял ПЕРВОЙ строкой хендлера и
 * отвечал 429 ещё до `resolvePromoCode`, а проверка идёт в два шага (код, потом
 * телефон), поэтому две-три попытки клиента выедали окно 5 запросов / 10 минут.
 *
 * Здесь два разных утверждения:
 *  1. причина «used» — это причина, а не 429 (правила `resolvePromoCode`);
 *  2. лимит физически снят ИМЕННО с проверки кода и остался у соседей.
 *
 * Второе проверяется по исходникам роутов, а не запросом: поднимать Next ради
 * этого в юнит-тестах нечем, а регрессия тут ровно одна — кто-то вернёт
 * `checkRateLimit` в этот файл. Живая проверка (12 запросов подряд без 429 и
 * сработавшие лимиты соседей) сделана отдельно, см. docs/CHANGELOG.md.
 */

const routeSource = (name: string) =>
  readFileSync(join(process.cwd(), 'src/app/(frontend)/api', name, 'route.ts'), 'utf8')

/**
 * Исходник роута без комментариев: утверждения ниже — про КОД, а комментарии в
 * этих файлах как раз подробно объясняют снятый лимит и упоминают и `429`, и
 * `rate_limit`. Без вычистки тест ловил бы собственную документацию.
 */
const routeCode = (name: string) =>
  routeSource(name)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

/** Заглушка Payload: отдаёт один заданный документ. */
const fakePayload = (doc: Record<string, unknown> | null) =>
  ({
    find: async () => ({ docs: doc ? [doc] : [], totalDocs: doc ? 1 : 0 }),
  }) as unknown as Payload

const used = {
  id: 1,
  code: 'WELCOME-USEDTS',
  percent: 15,
  codeType: 'personal',
  isActive: true,
  isUsed: true,
  email: 'used@example.com',
  phone: '+37360000009',
}

describe('использованный код отдаёт причину, а не лимит', () => {
  it('персональный код с isUsed=true → error: used', async () => {
    const result = await resolvePromoCode(fakePayload(used), 'WELCOME-USEDTS')
    expect(result).toEqual({ ok: false, error: 'used' })
  })

  it('причина не зависит от того, прислан ли телефон: код проверяется первым', async () => {
    // Телефон верный — всё равно `used`, а не `ok`. Порядок «сначала код,
    // потом телефон» — инвариант, он же закрывает перебор номеров к чужому коду.
    const withPhone = await resolvePromoCode(fakePayload(used), 'WELCOME-USEDTS', '+37360000009')
    expect(withPhone).toEqual({ ok: false, error: 'used' })
  })

  it('каждая причина отказа своя, ничего не сваливается в одну', async () => {
    const reason = async (over: Record<string, unknown>) =>
      (await resolvePromoCode(fakePayload({ ...used, ...over }), 'WELCOME-USEDTS')) as {
        error?: string
      }

    expect((await reason({ isUsed: false, isActive: false })).error).toBe('inactive')
    expect((await reason({ isUsed: false })).error).toBe('phone_required')
    expect((await reason({ isUsed: false, codeType: 'public', expiresAt: null })).error).toBe(
      'expired',
    )
    expect(
      (await reason({ isUsed: false, codeType: 'public', expiresAt: '2000-01-01T00:00:00.000Z' }))
        .error,
    ).toBe('expired')
    expect(await resolvePromoCode(fakePayload(null), 'WELCOME-NOPE')).toEqual({
      ok: false,
      error: 'not_found',
    })
  })

  it('несовпадение номера — отдельная причина, а не «не найден»', async () => {
    const result = await resolvePromoCode(
      fakePayload({ ...used, isUsed: false }),
      'WELCOME-USEDTS',
      '+37360000001',
    )
    expect(result).toEqual({ ok: false, error: 'phone_mismatch' })
  })
})

describe('лимит запросов снят только с проверки кода', () => {
  it('в /api/promo-code-check лимитера нет вовсе', () => {
    const code = routeCode('promo-code-check')
    expect(code).not.toContain('checkRateLimit')
    // И 429 отсюда не отдаётся вовсе.
    expect(code).not.toContain('429')
    expect(code).not.toContain('rate_limit')
  })

  it('у выдачи кода и у формы заявки лимит остался — и в своих scope', () => {
    expect(routeCode('promo-popup')).toContain("checkRateLimit(ip, 'promo-popup')")
    expect(routeCode('order-request')).toContain('checkRateLimit(ip)')
    expect(routeCode('order-status')).toContain("checkRateLimit(ip, 'order-status')")
    // И каждый из них по-прежнему умеет ответить 429.
    for (const route of ['promo-popup', 'order-request', 'order-status']) {
      expect(routeCode(route)).toContain('429')
    }
  })

  it('текст «слишком много попыток» убран из поля промокода в корзине', () => {
    const component = readFileSync(
      join(process.cwd(), 'src/components/cart/PromoCodeInput.tsx'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(component).not.toContain('rate_limit')
  })
})
