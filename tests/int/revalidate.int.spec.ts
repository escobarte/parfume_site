// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Контракт сброса кэша витрины (2026-09-20).
 *
 * Тест сторожит ровно ту ошибку, из-за которой кнопка «Сбросить кэш витрины»
 * не давала свежих данных с первого раза: профиль `'max'` у `revalidateTag`
 * означает `expire: never`, и кэш-хендлер Next помечает запись только
 * `stale`, но не `expired` — то есть ближайший запрос получает СТАРОЕ, а
 * пересчёт уходит в фон. Нужен `{ expire: 0 }`.
 *
 * Проверяется контракт вызовов, а не внутренности Next: сквозной замер
 * «первый запрос уже свежий» живёт в `scripts/check-cache.mjs` — он требует
 * прод-сборки и поднятого сервера, в юнит-тесте это не воспроизводится
 * (в dev кэш ведёт себя иначе, см. docs/GOTCHAS.md).
 */

const revalidateTag = vi.fn()
const revalidatePath = vi.fn()

vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}))

const IMMEDIATE = { expire: 0 }

describe('сброс кэша витрины', () => {
  beforeEach(() => {
    revalidateTag.mockReset()
    revalidatePath.mockReset()
  })

  it('revalidateCatalog гасит свой тег немедленно и обновляет дерево под корневым layout', async () => {
    const { revalidateCatalog, CATALOG_TAG } = await import('@/lib/revalidate')
    await revalidateCatalog()

    expect(revalidateTag).toHaveBeenCalledWith(CATALOG_TAG, IMMEDIATE)
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('revalidateTaxonomy гасит и справочники, и выдачу каталога', async () => {
    const { revalidateTaxonomy, CATALOG_TAG, TAXONOMY_TAG } = await import('@/lib/revalidate')
    await revalidateTaxonomy()

    expect(revalidateTag).toHaveBeenCalledWith(CATALOG_TAG, IMMEDIATE)
    expect(revalidateTag).toHaveBeenCalledWith(TAXONOMY_TAG, IMMEDIATE)
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('revalidateAll гасит ВСЕ теги витрины, ни один не забыт', async () => {
    const { revalidateAll, ALL_TAGS } = await import('@/lib/revalidate')
    await revalidateAll()

    for (const tag of ALL_TAGS) {
      expect(revalidateTag).toHaveBeenCalledWith(tag, IMMEDIATE)
    }
    expect(revalidateTag).toHaveBeenCalledTimes(ALL_TAGS.length)
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('ни один сброс не использует профиль с отложенным истечением', async () => {
    const { revalidateAll, revalidateCatalog, revalidateTaxonomy } = await import('@/lib/revalidate')
    await revalidateAll()
    await revalidateCatalog()
    await revalidateTaxonomy()

    for (const [, profile] of revalidateTag.mock.calls) {
      // Строковый профиль ('max' и любой другой) — это именно то, что давало
      // stale-while-revalidate. Допустим только объект с expire: 0.
      expect(typeof profile).toBe('object')
      expect(profile).toEqual(IMMEDIATE)
    }
  })

  it('вне запроса Next (CLI-скрипты) сброс молча пропускается, а не роняет процесс', async () => {
    const { revalidateAll } = await import('@/lib/revalidate')
    revalidateTag.mockImplementation(() => {
      throw new Error('Invariant: static generation store missing')
    })

    await expect(revalidateAll()).resolves.toBeUndefined()
  })
})
