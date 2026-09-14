import { describe, expect, it } from 'vitest'
import { localeOrder, pickLocalized, resolveHeroBanners } from '@/lib/content/heroBanners'

/**
 * Резолвер баннеров главной (2026-09-14). Главное правило — фолбэк картинки
 * на ЛЮБУЮ заполненную локаль: встроенный `fallback: true` Payload умеет
 * только «пусто → ro», и именно этот случай (картинка лишь на ru) он
 * не покрывает. Данные — в форме `findGlobal({ locale: 'all', depth: 1 })`.
 */

const media = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  url: `/api/media/file/banner-${id}.png`,
  width: 1920,
  height: 800,
  alt: { ro: `media ro ${id}`, ru: `media ru ${id}`, en: `media en ${id}` },
  ...extra,
})

describe('localeOrder', () => {
  it('текущая локаль → дефолтная ro → остальные, без повторов', () => {
    expect(localeOrder('ru')).toEqual(['ru', 'ro', 'en'])
    expect(localeOrder('ro')).toEqual(['ro', 'ru', 'en'])
    expect(localeOrder('en')).toEqual(['en', 'ro', 'ru'])
  })
})

describe('pickLocalized', () => {
  it('берёт первую непустую локаль по порядку, пропуская null и пустую строку', () => {
    expect(pickLocalized({ ro: '', ru: null, en: 'en' }, ['ro', 'ru', 'en'])).toBe('en')
    expect(pickLocalized({ ro: 'ro', ru: 'ru' }, ['ru', 'ro'])).toBe('ru')
  })

  it('документ медиа — не карта локалей: возвращается как есть', () => {
    const doc = media(1)
    expect(pickLocalized(doc, ['ro'])).toBe(doc)
  })

  it('все локали пусты — null', () => {
    expect(pickLocalized({ ro: null, ru: '', en: undefined }, ['ro', 'ru', 'en'])).toBeNull()
  })
})

describe('resolveHeroBanners — картинка', () => {
  it('картинка только на ru показывается и на ro, и на en', () => {
    const rows = [{ id: 'a', enabled: true, image: { ro: null, ru: media(2), en: null } }]
    expect(resolveHeroBanners(rows, 'ro')[0]?.image.url).toBe('/api/media/file/banner-2.png')
    expect(resolveHeroBanners(rows, 'en')[0]?.image.url).toBe('/api/media/file/banner-2.png')
  })

  it('своя картинка локали важнее фолбэка', () => {
    const rows = [{ id: 'a', image: { ro: media(1), ru: media(2), en: null } }]
    expect(resolveHeroBanners(rows, 'ru')[0]?.image.url).toBe('/api/media/file/banner-2.png')
    expect(resolveHeroBanners(rows, 'en')[0]?.image.url).toBe('/api/media/file/banner-1.png')
  })

  it('выключенный, без картинки и с неразвёрнутым id — выпадают; порядок остальных сохранён', () => {
    const rows = [
      { id: 'off', enabled: false, image: { ro: media(1) } },
      { id: 'first', enabled: true, image: { ro: media(2) } },
      { id: 'empty', enabled: true, image: { ro: null, ru: null, en: null } },
      { id: 'bare-id', enabled: true, image: { ro: 7 } },
      { id: 'second', image: { en: media(3) } },
    ]
    expect(resolveHeroBanners(rows, 'ro').map((banner) => banner.id)).toEqual(['first', 'second'])
  })

  it('файл без размеров (SVG) получает запасную пропорцию, а не undefined', () => {
    const rows = [{ id: 'a', image: { ro: media(1, { width: null, height: null }) } }]
    expect(resolveHeroBanners(rows, 'ro')[0]?.image).toMatchObject({ width: 1920, height: 800 })
  })
})

describe('resolveHeroBanners — alt', () => {
  it('alt баннера своей локали → alt баннера другой локали → alt файла → пустая строка', () => {
    const own = [{ id: 'a', image: { ro: media(1) }, alt: { ro: 'ro', ru: 'ru', en: null } }]
    expect(resolveHeroBanners(own, 'ru')[0]?.alt).toBe('ru')
    expect(resolveHeroBanners(own, 'en')[0]?.alt).toBe('ro')

    const fromMedia = [{ id: 'a', image: { ro: media(1) }, alt: { ro: null, ru: '', en: null } }]
    expect(resolveHeroBanners(fromMedia, 'en')[0]?.alt).toBe('media en 1')

    const none = [{ id: 'a', image: { ro: media(1, { alt: null }) } }]
    expect(resolveHeroBanners(none, 'ro')[0]?.alt).toBe('')
  })
})

describe('resolveHeroBanners — ссылка', () => {
  const image = { ro: media(1) }

  it('системная цель резолвится в путь без префикса локали', () => {
    const rows = [{ id: 'a', image, linkMode: 'system' as const, link: 'catalogDiscounted' }]
    expect(resolveHeroBanners(rows, 'ro')[0]?.href).toBe('/catalog?flags=hasDiscount')
  })

  it('режим «страница» берёт slug развёрнутой страницы', () => {
    const rows = [
      { id: 'a', image, linkMode: 'page' as const, linkPage: { id: 3, slug: 'delivery' } },
    ]
    expect(resolveHeroBanners(rows, 'ru')[0]?.href).toBe('/delivery')
  })

  it('своя ссылка побеждает выбор из списка; ничего не задано — баннер без ссылки', () => {
    const override = [
      { id: 'a', image, linkMode: 'system' as const, link: 'catalog', linkOverride: '/brands' },
    ]
    expect(resolveHeroBanners(override, 'ro')[0]?.href).toBe('/brands')
    expect(resolveHeroBanners([{ id: 'b', image }], 'ro')[0]?.href).toBeNull()
  })
})
