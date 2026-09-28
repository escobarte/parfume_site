// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { RESERVED_PAGE_SLUGS, SYSTEM_PAGE_SLUGS } from '@/lib/content/pages'
import { describeError, fieldErrorsOf } from '@/lib/import/payloadErrors'

/**
 * Валидация зарезервированных slug у коллекции `Pages` (2026-09-28) — общий
 * маршрут `[locale]/[slug]` заводится над коллекцией, и документ с тем же
 * slug, что и статическая папка (`/catalog`, `/cart`…), стал бы недостижимым
 * молча (см. `docs/GOTCHAS.md`). `validate` на поле `slug` должен отбивать
 * такие значения ДО записи в БД — на живом Payload, не на заглушке: сама
 * проверка регистронезависимости/обрезки пробелов и текст ошибки идут через
 * `validate`-функцию поля, а не через отдельно тестируемую утилиту.
 */

let payload: Payload
const createdIds: number[] = []

beforeAll(async () => {
  payload = await getPayload({ config })
})

afterEach(async () => {
  while (createdIds.length) {
    const id = createdIds.pop()!
    await payload.delete({ collection: 'pages', id }).catch(() => {})
  }
})

describe('Pages.slug — зарезервированные значения', () => {
  it('отклоняет каждый зарезервированный slug понятной русской ошибкой', async () => {
    // try/catch, а не .rejects — если проверка когда-нибудь сломается и
    // create() неожиданно пройдёт (как было при откате на старый код при
    // разработке этого теста), документ всё равно попадёт в createdIds и
    // будет удалён в afterEach, а не останется мусором в БД.
    for (const slug of RESERVED_PAGE_SLUGS) {
      try {
        const doc = await payload.create({
          collection: 'pages',
          data: { title: `TEST ${slug}`, slug },
        })
        createdIds.push(doc.id)
        expect.unreachable(`slug «${slug}» должен был быть отклонён, но создался как id=${doc.id}`)
      } catch (error) {
        if (error instanceof Error && error.name === 'AssertionError') throw error
        const fields = fieldErrorsOf(error)
        const slugError = fields.find((f) => f.path === 'slug')
        expect(slugError?.message, `slug «${slug}»`).toContain('зарезервирован')
      }
    }
  })

  it('регистр и пробелы не обходят проверку', async () => {
    try {
      const doc = await payload.create({
        collection: 'pages',
        data: { title: 'TEST', slug: '  catalog  ' },
      })
      createdIds.push(doc.id)
      expect.unreachable(`должен был быть отклонён, но создался как id=${doc.id}, slug=${doc.slug}`)
    } catch (error) {
      if (error instanceof Error && error.name === 'AssertionError') throw error
      expect(error).toBeTruthy()
    }
  })

  it('четыре системных slug остаются допустимыми (не в списке резерва)', () => {
    for (const slug of SYSTEM_PAGE_SLUGS) {
      expect((RESERVED_PAGE_SLUGS as readonly string[]).includes(slug)).toBe(false)
    }
  })

  it('пустой slug отклоняется собственным сообщением (кастомный validate заменяет required)', async () => {
    await expect(
      payload.create({ collection: 'pages', data: { title: '', slug: '' } }),
    ).rejects.toSatisfy((error: unknown) => {
      const text = describeError(error)
      return text.includes('обязателен') || text.includes('обязательное')
    })
  })

  it('новый, не зарезервированный slug создаётся без ошибок', async () => {
    const slug = `test-page-${Date.now()}`
    const doc = await payload.create({
      collection: 'pages',
      data: { title: 'TEST страница', slug },
    })
    createdIds.push(doc.id)
    expect(doc.slug).toBe(slug)
  })
})
