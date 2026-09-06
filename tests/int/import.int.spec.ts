import { describe, expect, it } from 'vitest'
import { normalizeHeader, parseCsv, toTable } from '@/lib/import/csv'
import { detectKind } from '@/lib/import/detect'
import { groupFormatA } from '@/lib/import/applyProducts'
import { formatARow } from '@/lib/import/schema'
import { findDuplicates, validateRows } from '@/lib/import/validate'
import { denormalizeVariants } from '@/lib/products/denormalize'
import { discountPercent } from '@/lib/pricing'
import { slugify } from '@/lib/slugify'
import { variantsDiscountConsistent } from '@/collections/Products'
import { toCard } from '@/lib/catalog/cards'
import type { Product } from '@/payload-types'

describe('парсер CSV', () => {
  it('понимает кавычки, экранированные кавычки и переводы строк в поле', () => {
    const rows = parseCsv('a,b\n"1,5","строка\nвторая"\n"он сказал ""да""",x')
    expect(rows).toEqual([
      ['a', 'b'],
      ['1,5', 'строка\nвторая'],
      ['он сказал "да"', 'x'],
    ])
  })

  it('снимает BOM, CRLF и определяет точку с запятой как разделитель', () => {
    const rows = parseCsv('﻿sku;price\r\nA-1;100\r\n')
    expect(rows).toEqual([
      ['sku', 'price'],
      ['A-1', '100'],
    ])
  })

  it('нормализует заголовки к snake_case', () => {
    expect(normalizeHeader(' Old Price ')).toBe('old_price')
    expect(normalizeHeader('SKU')).toBe('sku')
  })

  it('нумерует строки как Excel — данные начинаются со второй', () => {
    const table = toTable('handle,title\nA,Один\nB,Два')
    expect(table.records.map((r) => r.line)).toEqual([2, 3])
  })
})

describe('определение формата', () => {
  it.each([
    [['handle', 'title', 'sku', 'price', 'volume'], 'products-a'],
    [['handle', 'title', 'variants'], 'products-b'],
    [['sku', 'price', 'stock'], 'prices'],
    [['handle', 'locale', 'title'], 'translations'],
    [['foo', 'bar'], null],
  ])('%j → %s', (header, expected) => {
    expect(detectKind(header as string[])).toBe(expected)
  })
})

describe('валидация', () => {
  const table = toTable(
    ['handle,title,brand,volume,sku,price,old_price,stock', 'A,Название,b,5ml,A-5,100,,3'].join(
      '\n',
    ),
  )

  it('пустая необязательная ячейка (old_price) не считается ошибкой', () => {
    const parsed = formatARow.safeParse(table.records[0].data)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.old_price).toBeUndefined()
  })

  it('сообщает номер строки файла', () => {
    const broken = toTable('handle,title,brand,volume,sku,price\nA,,b,5ml,A-5,нет')
    const { errors } = validateRows('products-a', broken.records)
    expect(errors.every((error) => error.line === 2)).toBe(true)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('ловит повторяющийся sku внутри файла', () => {
    const rows = [
      { line: 2, value: { sku: 'X' } },
      { line: 5, value: { sku: 'X' } },
    ]
    const errors = findDuplicates(rows, (value) => value.sku, 'sku')
    expect(errors).toHaveLength(1)
    expect(errors[0].line).toBe(5)
    expect(errors[0].message).toContain('строке 2')
  })
})

describe('формат A', () => {
  it('склеивает строки одного handle в один товар с несколькими вариантами', () => {
    const table = toTable(
      [
        'handle,title,brand,volume,sku,price,stock',
        'A,Название,b,5ml,A-5,100,3',
        'A,Название,b,Full Size,A-30,300,1',
        'B,Другое,b,5ml,B-5,150,0',
      ].join('\n'),
    )
    const { rows, errors } = validateRows<never>('products-a', table.records)
    expect(errors).toHaveLength(0)

    const { inputs: grouped, invalidVolumes } = groupFormatA(rows)
    expect(invalidVolumes).toHaveLength(0)
    expect(grouped).toHaveLength(2)
    expect(grouped[0].variants.map((variant) => variant.sku)).toEqual(['A-5', 'A-30'])
  })

  it('объём не из списка 5 значений — вариант пропущен с предупреждением, остальные строки применяются', () => {
    const table = toTable(
      [
        'handle,title,brand,volume,sku,price,stock',
        'A,Название,b,5ml,A-5,100,3',
        'A,Название,b,90,A-90,300,1',
        'B,Другое,b,77,B-77,150,0',
      ].join('\n'),
    )
    const { rows, errors } = validateRows<never>('products-a', table.records)
    // Пустая/невалидная строка объёма — не ошибка формата (schema.ts принимает
    // любую непустую строку), значит validateRows не должен спотыкаться тут.
    expect(errors).toHaveLength(0)

    const { inputs: grouped, invalidVolumes } = groupFormatA(rows)
    expect(invalidVolumes.map((e) => e.line)).toEqual([3, 4])
    expect(invalidVolumes.every((e) => e.message.includes('volume'))).toBe(true)

    const productA = grouped.find((p) => p.base.handle === 'A')
    const productB = grouped.find((p) => p.base.handle === 'B')
    // A: одна хорошая строка (5ml) + одна плохая (90) — товар не пропускается
    // целиком, у него остаётся единственный валидный вариант.
    expect(productA?.variants.map((v) => v.sku)).toEqual(['A-5'])
    // B: ЕДИНСТВЕННАЯ строка товара — с плохим объёмом — вариантов не остаётся
    // вовсе, но товар всё равно присутствует в inputs (variants: []), чтобы
    // applyProducts() мог явно пропустить его с предупреждением, а не потерять
    // молча (см. комментарий над groupFormatA в applyProducts.ts).
    expect(productB?.variants).toHaveLength(0)
  })
})

describe('денормализация вариантов', () => {
  it('берёт минимум и максимум только по активным вариантам', () => {
    expect(
      denormalizeVariants([
        { price: 300, stock: 0, isActive: true },
        { price: 100, stock: 0, isActive: false },
        { price: 200, stock: 5, isActive: true },
      ]),
    ).toEqual({
      minPrice: 200,
      maxPrice: 300,
      inStock: true,
      hasDiscount: false,
      maxDiscountPercent: 0,
    })
  })

  it('без вариантов — пустые цены и нет наличия', () => {
    expect(denormalizeVariants([])).toEqual({
      minPrice: null,
      maxPrice: null,
      inStock: false,
      hasDiscount: false,
      maxDiscountPercent: 0,
    })
  })

  it('скидка — только по вариантам с oldPrice > price, максимум среди них', () => {
    expect(
      denormalizeVariants([
        { price: 200, oldPrice: 250, stock: 1, isActive: true }, // -20%
        { price: 380, stock: 1, isActive: true }, // без скидки
        { price: 800, oldPrice: 1200, stock: 1, isActive: true }, // -33%
        { price: 10, oldPrice: 5, stock: 1, isActive: true }, // oldPrice < price — не скидка
      ]),
    ).toMatchObject({ hasDiscount: true, maxDiscountPercent: 33 })
  })

  it('все остатки нулевые — inStock false', () => {
    expect(denormalizeVariants([{ price: 100, stock: 0, isActive: true }]).inStock).toBe(false)
  })
})

describe('slugify', () => {
  it.each([
    ['Șoapte de Mai', 'soapte-de-mai'],
    ['Тёплая ваниль', 'teplaya-vanil'],
    ['Maison Orphée', 'maison-orphee'],
  ])('%s → %s', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })
})

describe('discountPercent', () => {
  it('округляет процент скидки', () => {
    expect(discountPercent(200, 250)).toBe(20)
    expect(discountPercent(800, 1200)).toBe(33)
  })

  it('нет скидки, если oldPrice отсутствует или не больше price', () => {
    expect(discountPercent(100, null)).toBeNull()
    expect(discountPercent(100, 100)).toBeNull()
    expect(discountPercent(100, 90)).toBeNull()
  })
})

// Промпт «новая логика цены товара»: скидка — на ВСЕ активные варианты
// сразу, или ни на один. Раньше oldPrice был независимым полем каждой
// строки — ничего не мешало проставить его выборочно.
describe('variantsDiscountConsistent (Products.ts — единое правило скидки)', () => {
  const row = (price: number, oldPrice?: number, isActive = true) => ({ price, oldPrice, isActive })
  // validate-функции Payload принимают options вторым аргументом — в этих
  // юнит-тестах он не используется вообще (реализация читает только value),
  // так что для вызова хватает пустышки, приведённой к ожидаемому типу.
  const opts = {} as Parameters<typeof variantsDiscountConsistent>[1]

  it('без скидки вовсе — валидно', () => {
    expect(variantsDiscountConsistent([row(200), row(380), row(800)], opts)).toBe(true)
  })

  it('скидка на всех активных вариантах — валидно', () => {
    expect(
      variantsDiscountConsistent([row(200, 250), row(380, 450), row(800, 1200)], opts),
    ).toBe(true)
  })

  it('скидка только на части вариантов — отклоняется с понятным текстом', () => {
    const result = variantsDiscountConsistent([row(200, 250), row(380), row(800, 1200)], opts)
    expect(result).not.toBe(true)
    expect(String(result)).toMatch(/все.*вариант|один/i)
  })

  it('неактивный вариант без скидки не портит валидный расклад активных', () => {
    // 380 неактивен и без скидки — не считается, среди активных скидка
    // на обоих (200 и 800) → валидно.
    expect(
      variantsDiscountConsistent(
        [row(200, 250), row(380, undefined, false), row(800, 1200)],
        opts,
      ),
    ).toBe(true)
  })

  it('пустой список вариантов — валидно (нечего проверять)', () => {
    expect(variantsDiscountConsistent([], opts)).toBe(true)
  })
})

// toCard() — карточка каталога: без диапазона/«от», одна цена — максимальная
// среди активных вариантов. Скидка (если есть — теперь гарантированно на
// всех вариантах сразу) читается прямо с максимального по цене варианта.
describe('toCard — новая логика цены (максимум, без диапазона)', () => {
  const fakeProduct = (variants: Product['variants']): Product =>
    ({
      id: 1,
      title: 'Test',
      slug: 'test',
      handle: 'TEST',
      brand: null,
      variants,
      isNew: false,
      isHit: false,
      inStock: true,
    }) as unknown as Product

  it('без скидки — показывает МАКСИМАЛЬНУЮ цену среди вариантов, не минимальную', () => {
    const card = toCard(
      fakeProduct([
        { id: 'a', volume: '5ml', sku: 'A-5', price: 200, stock: 1, isActive: true },
        { id: 'b', volume: '10ml', sku: 'A-10', price: 380, stock: 1, isActive: true },
        { id: 'c', volume: 'Full Size', sku: 'A-30', price: 800, stock: 1, isActive: true },
      ] as Product['variants']),
    )
    expect(card.displayPrice).toBe(800)
    expect(card.oldPrice).toBeNull()
    expect(card.discountPercent).toBeNull()
  })

  it('со скидкой на все варианты — показывает цену/oldPrice/% максимального по цене варианта', () => {
    const card = toCard(
      fakeProduct([
        { id: 'a', volume: '5ml', sku: 'A-5', price: 200, oldPrice: 250, stock: 1, isActive: true },
        { id: 'b', volume: '10ml', sku: 'A-10', price: 380, oldPrice: 450, stock: 1, isActive: true },
        {
          id: 'c',
          volume: 'Full Size',
          sku: 'A-30',
          price: 800,
          oldPrice: 1200,
          stock: 1,
          isActive: true,
        },
      ] as Product['variants']),
    )
    expect(card.displayPrice).toBe(800)
    expect(card.oldPrice).toBe(1200)
    expect(card.discountPercent).toBe(33)
  })

  it('один вариант — просто его цена, без изменений в логике', () => {
    const card = toCard(
      fakeProduct([
        { id: 'a', volume: 'Full Size', sku: 'A-30', price: 500, stock: 1, isActive: true },
      ] as Product['variants']),
    )
    expect(card.displayPrice).toBe(500)
    expect(card.oldPrice).toBeNull()
  })

  it('неактивный вариант с более высокой ценой не выбирается', () => {
    const card = toCard(
      fakeProduct([
        { id: 'a', volume: '5ml', sku: 'A-5', price: 200, stock: 1, isActive: true },
        { id: 'b', volume: 'Full Size', sku: 'A-30', price: 800, stock: 0, isActive: false },
      ] as Product['variants']),
    )
    expect(card.displayPrice).toBe(200)
  })
})
