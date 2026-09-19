import { describe, expect, it } from 'vitest'
import {
  fillPercent,
  PROMO_POPUP_IMAGE_SIZE,
  resolvePromoPopupContent,
  splitPercent,
  type PromoPopupTextKey,
  type RawPromoPopupSettings,
} from '@/lib/content/promoPopup'

/**
 * Резолвер контента попапа «первая скидка» (редизайн 2026-09-19).
 *
 * Главное правило, ради которого он существует: значение КАЖДОГО
 * localized-поля берётся по цепочке «текущая локаль → ro → ru → en →
 * стандартная строка из messages». Встроенный фолбэк Payload умеет только
 * «пусто → ro», поэтому клиент, заполнивший один язык, без своего резолвера
 * получил бы пустоту на остальных.
 *
 * Данные — в форме `findGlobal({ locale: 'all', depth: 1 })`.
 */

const DEFAULTS: Record<PromoPopupTextKey, string> = {
  title: 'Welcome to Mon Flacon',
  subtitle: 'Your scent starts here.',
  description: 'Enjoy {percent} off your first order.',
  buttonLabel: 'Unlock my {percent}',
  footerText: 'The code will be sent to your email.',
}

const media = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  url: `/api/media/file/popup-${id}.png`,
  width: 800,
  height: 1200,
  alt: { ro: `media ro ${id}`, ru: `media ru ${id}`, en: `media en ${id}` },
  ...extra,
})

const resolve = (raw: RawPromoPopupSettings, locale: string) =>
  resolvePromoPopupContent({ discountPercent: 15, ...raw }, locale, DEFAULTS)

/** Описание собирается из узлов — для сравнения склеиваем обратно. */
const plain = (parts: { text: string }[]) => parts.map((part) => part.text).join('')

describe('цепочка локалей у текстов попапа', () => {
  it('заполнен только ro — RU и EN получают ro', () => {
    const raw = { title: { ro: 'Bun venit', ru: null, en: null } }
    expect(resolve(raw, 'ru').title).toBe('Bun venit')
    expect(resolve(raw, 'en').title).toBe('Bun venit')
    expect(resolve(raw, 'ro').title).toBe('Bun venit')
  })

  it('заполнен только en — RU и RO получают en', () => {
    const raw = { title: { ro: null, ru: '', en: 'Welcome' } }
    expect(resolve(raw, 'ru').title).toBe('Welcome')
    expect(resolve(raw, 'ro').title).toBe('Welcome')
  })

  it('заполнены ro и ru — EN получает ro, а не ru', () => {
    const raw = { title: { ro: 'Bun venit', ru: 'Добро пожаловать', en: null } }
    expect(resolve(raw, 'en').title).toBe('Bun venit')
    // Своя локаль всегда важнее фолбэка.
    expect(resolve(raw, 'ru').title).toBe('Добро пожаловать')
  })

  it('пусто во всех локалях — стандартная строка из messages', () => {
    const raw = { title: { ro: null, ru: null, en: null }, subtitle: {} }
    expect(resolve(raw, 'ru').title).toBe(DEFAULTS.title)
    expect(resolve(raw, 'ru').subtitle).toBe(DEFAULTS.subtitle)
    // Поля вовсе нет в документе — тот же результат.
    expect(resolve({}, 'en').footerText).toBe(DEFAULTS.footerText)
  })

  it('строка из одних пробелов считается пустой и пропускается дальше по цепочке', () => {
    const raw = { title: { ro: '   ', ru: '\t\n ', en: 'Welcome' } }
    expect(resolve(raw, 'ro').title).toBe('Welcome')
    // И если пробелы везде — стандартная строка, а не пробелы.
    expect(resolve({ title: { ro: ' ', ru: ' ', en: ' ' } }, 'ro').title).toBe(DEFAULTS.title)
  })

  it('значение обрезается по краям', () => {
    expect(resolve({ title: { ro: '  Bun venit  ' } }, 'ro').title).toBe('Bun venit')
  })
})

describe('подстановка {percent}', () => {
  it('подставляется в текст своей локали', () => {
    const raw = { buttonLabel: { ru: 'Получить {percent}' } }
    expect(resolve(raw, 'ru').buttonLabel).toBe('Получить 15%')
  })

  it('подставляется и в текст, доставшийся по фолбэку', () => {
    const raw = { buttonLabel: { ro: 'Obțineți {percent}', ru: null, en: null } }
    expect(resolve(raw, 'en').buttonLabel).toBe('Obțineți 15%')
  })

  it('подставляется и в стандартную строку из messages', () => {
    expect(resolve({}, 'en').buttonLabel).toBe('Unlock my 15%')
    expect(plain(resolve({}, 'en').description)).toBe('Enjoy 15% off your first order.')
  })

  it('берётся процент глобала, а не какое-либо значение из текста', () => {
    const raw = { discountPercent: 25, buttonLabel: { ru: 'Скидка {percent}' } }
    expect(resolve(raw, 'ru').buttonLabel).toBe('Скидка 25%')
  })

  it('процент 0 или пусто — «0%» не выводится, лишние пробелы схлопываются', () => {
    const raw = { discountPercent: 0, buttonLabel: { en: 'Unlock my {percent}' } }
    expect(resolve(raw, 'en').buttonLabel).toBe('Unlock my')
    expect(plain(resolve({ discountPercent: null }, 'en').description)).toBe(
      'Enjoy off your first order.',
    )
  })
})

describe('описание режется по метке, а не вставляется как HTML', () => {
  it('процент — отдельный узел с пометкой strong, остальное обычные узлы', () => {
    const parts = resolve({ description: { en: 'Enjoy {percent} off today.' } }, 'en').description
    expect(parts).toEqual([
      { text: 'Enjoy ', strong: false },
      { text: '15%', strong: true },
      { text: ' off today.', strong: false },
    ])
  })

  it('метки в тексте нет — один обычный узел', () => {
    expect(resolve({ description: { en: 'Just a sentence.' } }, 'en').description).toEqual([
      { text: 'Just a sentence.', strong: false },
    ])
  })

  it('разметка в редакторском тексте остаётся текстом, а не узлом', () => {
    // dangerouslySetInnerHTML здесь не используется — строка приходит как есть
    // и попадёт на экран текстом, а не тегом.
    const parts = resolve({ description: { en: '<b>hi</b> {percent}' } }, 'en').description
    expect(parts[0]).toEqual({ text: '<b>hi</b> ', strong: false })
    expect(parts[1]).toEqual({ text: '15%', strong: true })
  })

  it('метка в начале и в конце не даёт пустых узлов', () => {
    expect(resolve({ description: { en: '{percent}' } }, 'en').description).toEqual([
      { text: '15%', strong: true },
    ])
  })
})

describe('цепочка локалей у картинок', () => {
  it('картинка только на ru показывается и на ro, и на en', () => {
    const raw = { image: { ro: null, ru: media(2), en: null } }
    expect(resolve(raw, 'ro').image?.url).toBe('/api/media/file/popup-2.png')
    expect(resolve(raw, 'en').image?.url).toBe('/api/media/file/popup-2.png')
  })

  it('своя картинка локали важнее фолбэка', () => {
    const raw = { image: { ro: media(1), ru: media(2), en: null } }
    expect(resolve(raw, 'ru').image?.url).toBe('/api/media/file/popup-2.png')
    expect(resolve(raw, 'en').image?.url).toBe('/api/media/file/popup-1.png')
  })

  it('картинок нет ни в одной локали — null, попап покажет прежний вид', () => {
    const content = resolve({ image: { ro: null, ru: null, en: null }, imageMobile: {} }, 'ro')
    expect(content.image).toBeNull()
    expect(content.imageMobile).toBeNull()
  })

  it('неразвёрнутый id (depth 0) картинкой не считается', () => {
    expect(resolve({ image: { ro: 7 } }, 'ro').image).toBeNull()
  })

  it('файл без размеров (SVG) получает запасную пропорцию слота', () => {
    const raw = {
      image: { ro: media(1, { width: null, height: null }) },
      imageMobile: { ro: media(2, { width: null, height: null }) },
    }
    expect(resolve(raw, 'ro').image).toMatchObject(PROMO_POPUP_IMAGE_SIZE.image)
    expect(resolve(raw, 'ro').imageMobile).toMatchObject(PROMO_POPUP_IMAGE_SIZE.imageMobile)
  })

  it('alt: своя локаль → другая локаль → alt файла → пустая строка', () => {
    const own = { image: { ro: media(1) }, imageAlt: { ro: 'ro alt', ru: 'ru alt', en: null } }
    expect(resolve(own, 'ru').image?.alt).toBe('ru alt')
    expect(resolve(own, 'en').image?.alt).toBe('ro alt')

    const fromMedia = { image: { ro: media(1) }, imageAlt: { ro: '  ', ru: null, en: null } }
    expect(resolve(fromMedia, 'ru').image?.alt).toBe('media ru 1')

    const empty = { image: { ro: media(1, { alt: null }) } }
    expect(resolve(empty, 'ro').image?.alt).toBe('')
  })
})

describe('флаги глобала', () => {
  it('requirePhone включён по умолчанию и снимается только явным false', () => {
    expect(resolve({}, 'ro').requirePhone).toBe(true)
    expect(resolve({ requirePhone: null }, 'ro').requirePhone).toBe(true)
    expect(resolve({ requirePhone: false }, 'ro').requirePhone).toBe(false)
  })
})

describe('вспомогательные функции подстановки', () => {
  it('fillPercent не трогает строку без метки', () => {
    expect(fillPercent('Без метки', 15)).toBe('Без метки')
  })

  it('splitPercent на пустой строке не даёт узлов', () => {
    expect(splitPercent('', 15)).toEqual([])
  })
})
