import { describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import {
  findPersonalCodeByEmail,
  generatePersonalCode,
  normalizePromoCode,
  normalizePromoEmail,
  PERSONAL_CODE_PREFIX,
  resolvePromoCode,
} from '@/lib/orders/promo'

/**
 * Отдельный файл, а не довесок к import.int.spec.ts: тема другая, а тот уже
 * за 400 строк (CLAUDE.md — файлы > 300 строк разбивать).
 *
 * `Payload` подменён минимальной заглушкой: проверяются ПРАВИЛА
 * (какой тип что игнорирует), а не работа Payload с базой. Живой прогон
 * через Local API и HTTP сделан отдельно, руками.
 */

type Doc = Record<string, unknown>

/** Заглушка Payload: отдаёт заранее заданные документы и считает запросы. */
const fakePayload = (docs: Doc[]) => {
  const calls: unknown[] = []
  const payload = {
    find: async ({ where }: { where: unknown }) => {
      calls.push(where)
      // Поддерживаем ровно те две формы where, что использует promo.ts:
      // плоское `{ field: { equals } }` и `{ and: [...] }`.
      type Cond = Record<string, { equals?: unknown }>
      const w = where as Cond & { and?: Cond[] }
      const conds: Cond[] = w.and ?? [w]
      const found = docs.filter((doc) =>
        conds.every((cond) => {
          const [field, test] = Object.entries(cond)[0]
          return doc[field] === test.equals
        }),
      )
      return { docs: found, totalDocs: found.length }
    },
  } as unknown as Payload
  return { payload, calls }
}

const personal = (over: Doc = {}): Doc => ({
  id: 1,
  code: 'WELCOME-ABC123',
  percent: 15,
  codeType: 'personal',
  isActive: true,
  isUsed: false,
  email: 'a@b.c',
  ...over,
})

const publicCode = (over: Doc = {}): Doc => ({
  id: 2,
  code: 'AUTUMN20',
  percent: 20,
  codeType: 'public',
  isActive: true,
  isUsed: false,
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  ...over,
})

describe('нормализация промокода', () => {
  it('код сравнивается без учёта регистра и пробелов по краям', () => {
    expect(normalizePromoCode('  welcome-abc123 ')).toBe('WELCOME-ABC123')
  })

  it('email — в нижний регистр: Popup.Test@X.com и popup.test@x.com это один человек', () => {
    expect(normalizePromoEmail('  Popup.Test@Example.COM ')).toBe('popup.test@example.com')
  })
})

describe('resolvePromoCode — персональный код', () => {
  it('валиден, пока не использован', async () => {
    const { payload } = fakePayload([personal()])
    await expect(resolvePromoCode(payload, 'welcome-abc123')).resolves.toMatchObject({
      ok: true,
      percent: 15,
      codeType: 'personal',
    })
  })

  it('одноразовый: после использования отклоняется', async () => {
    const { payload } = fakePayload([personal({ isUsed: true })])
    await expect(resolvePromoCode(payload, 'WELCOME-ABC123')).resolves.toEqual({
      ok: false,
      error: 'used',
    })
  })

  it('БЕССРОЧНЫЙ: просроченная дата игнорируется, код остаётся рабочим', async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString()
    const { payload } = fakePayload([personal({ expiresAt: past })])
    await expect(resolvePromoCode(payload, 'WELCOME-ABC123')).resolves.toMatchObject({ ok: true })
  })

  it('снятая галочка «активен» отключает код', async () => {
    const { payload } = fakePayload([personal({ isActive: false })])
    await expect(resolvePromoCode(payload, 'WELCOME-ABC123')).resolves.toEqual({
      ok: false,
      error: 'inactive',
    })
  })
})

describe('resolvePromoCode — публичный код', () => {
  it('МНОГОРАЗОВЫЙ: isUsed игнорируется', async () => {
    const { payload } = fakePayload([publicCode({ isUsed: true })])
    await expect(resolvePromoCode(payload, 'AUTUMN20')).resolves.toMatchObject({
      ok: true,
      codeType: 'public',
    })
  })

  it('просроченный отклоняется', async () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const { payload } = fakePayload([publicCode({ expiresAt: past })])
    await expect(resolvePromoCode(payload, 'AUTUMN20')).resolves.toEqual({
      ok: false,
      error: 'expired',
    })
  })

  it('без даты окончания считается просроченным, а не бессрочным', async () => {
    // Схема такое сохранить не даёт, но правка мимо админки возможна —
    // безопасный исход важнее формальной корректности данных.
    const { payload } = fakePayload([publicCode({ expiresAt: null })])
    await expect(resolvePromoCode(payload, 'AUTUMN20')).resolves.toEqual({
      ok: false,
      error: 'expired',
    })
  })

  it('снятая галочка «активен» отключает и его', async () => {
    const { payload } = fakePayload([publicCode({ isActive: false })])
    await expect(resolvePromoCode(payload, 'AUTUMN20')).resolves.toEqual({
      ok: false,
      error: 'inactive',
    })
  })
})

describe('resolvePromoCode — общее', () => {
  it('несуществующий код', async () => {
    const { payload } = fakePayload([])
    await expect(resolvePromoCode(payload, 'NOPE')).resolves.toEqual({
      ok: false,
      error: 'not_found',
    })
  })

  it('пустая строка не идёт в базу вообще', async () => {
    const { payload, calls } = fakePayload([personal()])
    await expect(resolvePromoCode(payload, '   ')).resolves.toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(calls).toHaveLength(0)
  })

  it('код без типа считается персональным (записи до появления типов)', async () => {
    const { payload } = fakePayload([personal({ codeType: undefined, isUsed: true })])
    // Важно именно 'used', а не ok: старый одноразовый код не должен
    // внезапно стать многоразовым публичным.
    await expect(resolvePromoCode(payload, 'WELCOME-ABC123')).resolves.toEqual({
      ok: false,
      error: 'used',
    })
  })
})

describe('генерация персонального кода', () => {
  it('формат WELCOME-XXXXXX, 6 символов из безопасного алфавита', async () => {
    const { payload } = fakePayload([])
    const code = await generatePersonalCode(payload)
    expect(code).toMatch(new RegExp(`^${PERSONAL_CODE_PREFIX}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$`))
  })

  it('в алфавите нет визуально спорных символов (0 O 1 I L)', async () => {
    const { payload } = fakePayload([])
    for (let i = 0; i < 40; i += 1) {
      const suffix = (await generatePersonalCode(payload))!.split('-')[1]
      expect(suffix).not.toMatch(/[01OIL]/)
    }
  })

  it('уникальность проверяется запросом перед возвратом', async () => {
    const { payload, calls } = fakePayload([])
    await generatePersonalCode(payload)
    expect(calls).toHaveLength(1)
  })

  it('если свободный код не нашёлся за N попыток — null, а не вечный цикл', async () => {
    // Заглушка, где ЛЮБОЙ код «уже занят».
    const payload = {
      find: async () => ({ docs: [{ id: 1 }], totalDocs: 1 }),
    } as unknown as Payload
    await expect(generatePersonalCode(payload, 3)).resolves.toBeNull()
  })
})

describe('поиск персонального кода по email', () => {
  it('находит независимо от регистра адреса', async () => {
    const { payload } = fakePayload([personal({ email: 'popup@example.com' })])
    const found = await findPersonalCodeByEmail(payload, '  POPUP@Example.com ')
    expect(found).toMatchObject({ code: 'WELCOME-ABC123' })
  })

  it('публичный код по email не находится — у него email и не бывает', async () => {
    const { payload } = fakePayload([publicCode({ email: 'popup@example.com' })])
    await expect(findPersonalCodeByEmail(payload, 'popup@example.com')).resolves.toBeNull()
  })

  it('пустой email не идёт в базу', async () => {
    const { payload, calls } = fakePayload([personal()])
    await expect(findPersonalCodeByEmail(payload, '  ')).resolves.toBeNull()
    expect(calls).toHaveLength(0)
  })
})
