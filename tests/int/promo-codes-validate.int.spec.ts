// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { fieldErrorsOf } from '@/lib/import/payloadErrors'

/**
 * Валидация условий промокода (акция «от 3 отливантов −20%», 2026-10-23) —
 * на живом Payload, не на заглушке: сама кросс-полевая проверка (`volumes`
 * обязателен при `appliesTo: 'volumes'`, `minQuantity` целое ≥1) живёт в
 * `validate`-функциях полей `PromoCodes.ts`, и их поведение имеет смысл
 * проверять именно через Local API, как `pages.int.spec.ts` делает для
 * зарезервированных slug.
 */

let payload: Payload
const createdIds: (number | string)[] = []

beforeAll(async () => {
  payload = await getPayload({ config })
})

afterEach(async () => {
  while (createdIds.length) {
    const id = createdIds.pop()!
    await payload.delete({ collection: 'promo-codes', id }).catch(() => {})
  }
})

const base = (code: string, over: Record<string, unknown> = {}) => ({
  code,
  percent: 20,
  codeType: 'public' as const,
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  ...over,
})

describe('PromoCodes — volumes обязателен при appliesTo: "volumes"', () => {
  it('без volumes режим "volumes" отклоняется понятной ошибкой', async () => {
    try {
      const doc = await payload.create({
        collection: 'promo-codes',
        data: base('TEST-COND-1', { appliesTo: 'volumes' }),
      })
      createdIds.push(doc.id)
      expect.unreachable('должно было отклониться без volumes')
    } catch (error) {
      const fields = fieldErrorsOf(error)
      const volumesError = fields.find((f) => f.path === 'volumes')
      expect(volumesError?.message).toContain('Выбранные объёмы')
    }
  })

  it('с volumes режим "volumes" создаётся нормально', async () => {
    const doc = await payload.create({
      collection: 'promo-codes',
      data: base('TEST-COND-2', { appliesTo: 'volumes', volumes: ['3ml', '5ml'] }),
    })
    createdIds.push(doc.id)
    expect(doc.appliesTo).toBe('volumes')
    expect(doc.volumes).toEqual(['3ml', '5ml'])
  })

  it('режимы "all"/"decants" не требуют volumes вообще', async () => {
    const all = await payload.create({
      collection: 'promo-codes',
      data: base('TEST-COND-3', { appliesTo: 'all' }),
    })
    createdIds.push(all.id)
    const decants = await payload.create({
      collection: 'promo-codes',
      data: base('TEST-COND-4', { appliesTo: 'decants' }),
    })
    createdIds.push(decants.id)
    expect(all.volumes ?? []).toEqual([])
    expect(decants.volumes ?? []).toEqual([])
  })

  it('переключение из "volumes" обратно в "all" чистит список объёмов (beforeChange)', async () => {
    const doc = await payload.create({
      collection: 'promo-codes',
      data: base('TEST-COND-5', { appliesTo: 'volumes', volumes: ['10ml'] }),
    })
    createdIds.push(doc.id)
    const updated = await payload.update({
      collection: 'promo-codes',
      id: doc.id,
      data: { appliesTo: 'all' },
    })
    expect(updated.volumes ?? []).toEqual([])
  })
})

describe('PromoCodes — minQuantity: целое ≥1, пусто = без условия', () => {
  it('0 отклоняется', async () => {
    try {
      const doc = await payload.create({
        collection: 'promo-codes',
        data: base('TEST-COND-6', { minQuantity: 0 }),
      })
      createdIds.push(doc.id)
      expect.unreachable('0 должен был быть отклонён')
    } catch (error) {
      const fields = fieldErrorsOf(error)
      expect(fields.find((f) => f.path === 'minQuantity')?.message).toContain('не меньше 1')
    }
  })

  it('отрицательное и дробное значение отклоняются', async () => {
    for (const value of [-1, 2.5]) {
      try {
        const doc = await payload.create({
          collection: 'promo-codes',
          data: base(`TEST-COND-7-${value}`, { minQuantity: value }),
        })
        createdIds.push(doc.id)
        expect.unreachable(`${value} должно было быть отклонено`)
      } catch (error) {
        const fields = fieldErrorsOf(error)
        expect(fields.find((f) => f.path === 'minQuantity')).toBeTruthy()
      }
    }
  })

  it('пусто — сохраняется (условия нет, старое поведение кода)', async () => {
    const doc = await payload.create({
      collection: 'promo-codes',
      data: base('TEST-COND-8'),
    })
    createdIds.push(doc.id)
    expect(doc.minQuantity ?? null).toBeNull()
  })

  it('целое ≥1 — сохраняется', async () => {
    const doc = await payload.create({
      collection: 'promo-codes',
      data: base('TEST-COND-9', { minQuantity: 3 }),
    })
    createdIds.push(doc.id)
    expect(doc.minQuantity).toBe(3)
  })
})
