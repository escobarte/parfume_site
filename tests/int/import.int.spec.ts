import { describe, expect, it } from 'vitest'
import { normalizeHeader, parseCsv, toTable } from '@/lib/import/csv'
import { detectKind } from '@/lib/import/detect'
import { groupFormatA } from '@/lib/import/applyProducts'
import { formatARow } from '@/lib/import/schema'
import { findDuplicates, validateRows } from '@/lib/import/validate'
import { denormalizeVariants } from '@/lib/products/denormalize'
import { slugify } from '@/lib/slugify'

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
    ['handle,title,brand,volume,sku,price,old_price,stock', 'A,Название,b,5,A-5,100,,3'].join('\n'),
  )

  it('пустая необязательная ячейка (old_price) не считается ошибкой', () => {
    const parsed = formatARow.safeParse(table.records[0].data)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.old_price).toBeUndefined()
  })

  it('сообщает номер строки файла', () => {
    const broken = toTable('handle,title,brand,volume,sku,price\nA,,b,5,A-5,нет')
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
        'A,Название,b,5,A-5,100,3',
        'A,Название,b,30,A-30,300,1',
        'B,Другое,b,5,B-5,150,0',
      ].join('\n'),
    )
    const { rows, errors } = validateRows<never>('products-a', table.records)
    expect(errors).toHaveLength(0)

    const grouped = groupFormatA(rows)
    expect(grouped).toHaveLength(2)
    expect(grouped[0].variants.map((variant) => variant.sku)).toEqual(['A-5', 'A-30'])
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
    ).toEqual({ minPrice: 200, maxPrice: 300, inStock: true })
  })

  it('без вариантов — пустые цены и нет наличия', () => {
    expect(denormalizeVariants([])).toEqual({ minPrice: null, maxPrice: null, inStock: false })
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
