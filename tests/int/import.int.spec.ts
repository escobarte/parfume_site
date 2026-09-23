import { describe, expect, it } from 'vitest'
import { normalizeHeader, parseCsv, toTable } from '@/lib/import/csv'
import { detectKind } from '@/lib/import/detect'
import {
  groupFormatA,
  groupFormatB,
  mergeVariants,
  ProductWriteError,
} from '@/lib/import/applyProducts'
import { describeError, fieldErrorsOf } from '@/lib/import/payloadErrors'
import { formatReport } from '@/lib/import/report'
import { emptyPlan } from '@/lib/import/types'
import { COUNTRY_SPEC, PRODUCT_CATEGORY_SPEC, resolveScalar } from '@/lib/import/productScalars'
import { canonicalProductCategory } from '@/lib/catalog/productCategories'
import { formatARow } from '@/lib/import/schema'
import { findDuplicates, validateRows } from '@/lib/import/validate'
import { BrandLogoApplier } from '@/lib/import/brandLogos'
import {
  brandLetter,
  brandLetterAnchor,
  groupBrandsByLetter,
} from '@/lib/catalog/brands'
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

describe('скалярные поля товара (country_of_origin / product_category)', () => {
  const groupA = (csv: string) => {
    const table = toTable(csv)
    const { rows, errors } = validateRows<never>('products-a', table.records)
    expect(errors).toHaveLength(0)
    return groupFormatA(rows)
  }

  it('канон принимается без учёта регистра и краевых пробелов', () => {
    expect(canonicalProductCategory(' BODYCARE ')).toBe('bodyCare')
    expect(canonicalProductCategory('bodycare')).toBe('bodyCare')
    expect(canonicalProductCategory(' LipBalm ')).toBe('lipBalm')
    expect(canonicalProductCategory('lipbalm')).toBe('lipBalm')
    expect(canonicalProductCategory('Perfume')).toBe('perfume')
    // Русская подпись из админки — не канон, как и у объёма со страной.
    expect(canonicalProductCategory('Уход за телом')).toBeUndefined()
    // Пробел ВНУТРИ значения — уже другое значение, прощаем только краевые.
    expect(canonicalProductCategory('body care')).toBeUndefined()
  })

  it('значение не из списка — предупреждение, поле не трогается', () => {
    const resolved = resolveScalar(PRODUCT_CATEGORY_SPEC, 'A', 7, 'парфюм')
    expect(resolved.kind).toBe('unknown')
    expect(resolved.kind === 'unknown' && resolved.error).toMatchObject({
      line: 7,
      field: 'product_category',
    })
    expect(resolved.kind === 'unknown' && resolved.error.message).toContain('perfume / bodyCare')
  })

  it('пустая ячейка — поле не трогается (ни записи, ни предупреждения)', () => {
    expect(resolveScalar(PRODUCT_CATEGORY_SPEC, 'A', 2, '').kind).toBe('skip')
    expect(resolveScalar(PRODUCT_CATEGORY_SPEC, 'A', 2, '   ').kind).toBe('skip')
    expect(resolveScalar(PRODUCT_CATEGORY_SPEC, 'A', 2, undefined).kind).toBe('skip')
    expect(resolveScalar(COUNTRY_SPEC, 'A', 2, undefined).kind).toBe('skip')
  })

  it('формат A: канон берётся из первой строки handle', () => {
    const { inputs } = groupA(
      [
        'handle,title,brand,product_category,volume,sku,price',
        'A,Название,b,bodyCare,5ml,A-5,100',
        'A,Название,b,,Full Size,A-30,300',
      ].join('\n'),
    )
    expect(inputs[0].base.product_category).toBe('bodyCare')
  })

  // Тот самый баг 2026-09-22: раздел стоял не в первой строке handle, и товар
  // молча оставался perfume (не попадал в «Body Care»). Пустая ячейка ничего
  // не решает — ни у stock/old_price, ни здесь.
  it('формат A: пустая ячейка первой строки не «побеждает» заполненную ниже', () => {
    const { inputs, scalarConflicts } = groupA(
      [
        'handle,title,brand,product_category,country_of_origin,volume,sku,price',
        'A,Название,b,,,5ml,A-5,100',
        'A,Название,b,bodyCare,uae,Full Size,A-30,300',
      ].join('\n'),
    )
    expect(inputs[0].base.product_category).toBe('bodyCare')
    expect(inputs[0].base.country_of_origin).toBe('uae')
    // Пустая ячейка — не расхождение: предупреждений быть не должно.
    expect(scalarConflicts.productCategory).toHaveLength(0)
    expect(scalarConflicts.country).toHaveLength(0)
  })

  it('формат A: дозаполняются и остальные колонки товара, заполненное не перетирается', () => {
    const { inputs } = groupA(
      [
        'handle,title,brand,gender,family_ro,images,description,volume,sku,price',
        'A,Название,b,,,,Описание сверху,5ml,A-5,100',
        'A,Название,b,female,Lemnos,a.webp|b.webp,Описание снизу,Full Size,A-30,300',
      ].join('\n'),
    )
    expect(inputs[0].base.gender).toBe('female')
    expect(inputs[0].base.family_ro).toBe('Lemnos')
    expect(inputs[0].base.images).toEqual(['a.webp', 'b.webp'])
    // Непустая ячейка первой строки остаётся за ней.
    expect(inputs[0].base.description).toBe('Описание сверху')
  })

  it('формат A: разные разделы внутри одного handle — предупреждение, взято первое заполненное', () => {
    const { inputs, scalarConflicts } = groupA(
      [
        'handle,title,brand,product_category,volume,sku,price',
        'A,Название,b,perfume,5ml,A-5,100',
        'A,Название,b,bodyCare,Full Size,A-30,300',
      ].join('\n'),
    )
    expect(inputs[0].base.product_category).toBe('perfume')
    expect(scalarConflicts.productCategory).toHaveLength(1)
    expect(scalarConflicts.productCategory[0]).toMatchObject({ line: 3, field: 'product_category' })
    expect(scalarConflicts.productCategory[0].message).toContain('взято первое заполненное')
    expect(scalarConflicts.country).toHaveLength(0)
  })

  it('формат A: расходящееся значение ещё и не из списка — в тексте сказано и то, и другое', () => {
    const { scalarConflicts } = groupA(
      [
        'handle,title,brand,product_category,volume,sku,price',
        'A,Название,b,perfume,5ml,A-5,100',
        'A,Название,b,косметика,Full Size,A-30,300',
      ].join('\n'),
    )
    const message = scalarConflicts.productCategory[0].message
    expect(message).toContain('не из списка')
    expect(message).toContain('взято первое заполненное')
  })

  it('одинаковое значение во всех строках handle — не конфликт', () => {
    const { scalarConflicts } = groupA(
      [
        'handle,title,brand,product_category,country_of_origin,volume,sku,price',
        'A,Название,b,bodyCare,uae,5ml,A-5,100',
        'A,Название,b,bodyCare,uae,Full Size,A-30,300',
      ].join('\n'),
    )
    expect(scalarConflicts.productCategory).toHaveLength(0)
    expect(scalarConflicts.country).toHaveLength(0)
  })

  it('формат B: конфликтов не бывает — строка есть целый товар', () => {
    const table = toTable(
      [
        'handle,title,brand,product_category,variants',
        'A,Название,b,bodyCare,"[{""volume"":""5ml"",""sku"":""A-5"",""price"":100}]"',
      ].join('\n'),
    )
    const { rows, errors } = validateRows<never>('products-b', table.records)
    expect(errors).toHaveLength(0)

    const { inputs, scalarConflicts } = groupFormatB(rows)
    // Колонка доступна в обоих форматах одинаково — расхождений по
    // возможностям между A и B быть не должно.
    expect(inputs[0].base.product_category).toBe('bodyCare')
    expect(scalarConflicts.productCategory).toHaveLength(0)
  })

  it('неизвестное значение не является ошибкой формата — файл валиден целиком', () => {
    const table = toTable(
      [
        'handle,title,brand,product_category,volume,sku,price',
        'A,Название,b,косметика,5ml,A-5,100',
      ].join('\n'),
    )
    const { errors } = validateRows<never>('products-a', table.records)
    expect(errors).toHaveLength(0)
  })
})

describe('логотипы брендов (колонка brand_logo)', () => {
  const plan = () => emptyPlan('products-a', 'ro')

  it('пустая ячейка не регистрируется — лого бренда не трогается', () => {
    const p = plan()
    const applier = new BrandLogoApplier()
    applier.register('maison-orphee', '', 2, p)
    applier.register('maison-orphee', undefined, 3, p)
    applier.register('maison-orphee', '   ', 4, p)
    expect(p.brandLogos.conflicts).toHaveLength(0)
    expect(p.brandLogos.applied).toBe(0)
  })

  it('одно и то же имя в разных строках одного бренда — не конфликт', () => {
    const p = plan()
    const applier = new BrandLogoApplier()
    applier.register('maison-orphee', 'mo.png', 2, p)
    applier.register('maison-orphee', 'mo.png', 3, p)
    applier.register('maison-orphee', ' mo.png ', 4, p)
    expect(p.brandLogos.conflicts).toHaveLength(0)
  })

  it('разные имена у одного бренда — предупреждение, берётся первое', () => {
    const p = plan()
    const applier = new BrandLogoApplier()
    applier.register('maison-orphee', 'first.png', 2, p)
    applier.register('maison-orphee', 'second.png', 5, p)
    expect(p.brandLogos.conflicts).toHaveLength(1)
    expect(p.brandLogos.conflicts[0]).toMatchObject({ line: 5, field: 'brand_logo' })
    expect(p.brandLogos.conflicts[0].message).toContain('взят первый')
  })

  it('бренд опознаётся по slug, а не по написанию ячейки', () => {
    const p = plan()
    const applier = new BrandLogoApplier()
    applier.register('Maison Orphée', 'a.png', 2, p)
    // Та же запись бренда (slug maison-orphee) — расхождение должно найтись.
    applier.register('maison-orphee', 'b.png', 3, p)
    expect(p.brandLogos.conflicts).toHaveLength(1)
  })

  it('разные бренды не мешают друг другу', () => {
    const p = plan()
    const applier = new BrandLogoApplier()
    applier.register('maison-orphee', 'mo.png', 2, p)
    applier.register('nord-atelier', 'na.png', 3, p)
    expect(p.brandLogos.conflicts).toHaveLength(0)
  })

  it('колонка попадает в разобранную строку формата A', () => {
    const table = toTable(
      [
        'handle,title,brand,brand_logo,volume,sku,price',
        'A,Название,maison-orphee,mo.png,5ml,A-5,100',
      ].join('\n'),
    )
    const { rows, errors } = validateRows<never>('products-a', table.records)
    expect(errors).toHaveLength(0)
    expect(groupFormatA(rows).inputs[0].base.brand_logo).toBe('mo.png')
  })

  it('колонка одинаково доступна в формате B', () => {
    const table = toTable(
      [
        'handle,title,brand,brand_logo,variants',
        'A,Название,maison-orphee,mo.png,"[{""volume"":""5ml"",""sku"":""A-5"",""price"":100}]"',
      ].join('\n'),
    )
    const { rows, errors } = validateRows<never>('products-b', table.records)
    expect(errors).toHaveLength(0)
    expect(groupFormatB(rows).inputs[0].base.brand_logo).toBe('mo.png')
  })
})

describe('группировка брендов по алфавиту (/brands)', () => {
  const brand = (title: string) =>
    ({ id: title, slug: title, title, description: null, country: null, logo: null, seo: null })

  it('буква берётся через slugify: диакритика и кириллица ложатся на латиницу', () => {
    expect(brandLetter('Élysée Parfums')).toBe('E')
    expect(brandLetter('Îles du Sud')).toBe('I')
    expect(brandLetter('Ателье Норд')).toBe('A')
    expect(brandLetter('maison orphee')).toBe('M')
  })

  it('цифры и символы уходят в «#»', () => {
    expect(brandLetter('9 Avenue')).toBe('#')
    expect(brandLetter('«Ёлка»')).toBe('E')
  })

  it('группы идут по алфавиту, «#» — последней', () => {
    const groups = groupBrandsByLetter([
      brand('Zephyr'),
      brand('9 Avenue'),
      brand('Acqua'),
      brand('Bois'),
    ])
    expect(groups.map((g) => g.letter)).toEqual(['A', 'B', 'Z', '#'])
  })

  it('пустые буквы в группы не попадают, порядок внутри группы сохраняется', () => {
    const groups = groupBrandsByLetter([brand('Acqua'), brand('Ambre'), brand('Bois')])
    expect(groups).toHaveLength(2)
    expect(groups[0].brands.map((b) => b.title)).toEqual(['Acqua', 'Ambre'])
  })

  it('якорь буквы пригоден для href и id', () => {
    expect(brandLetterAnchor('A')).toBe('brands-a')
    expect(brandLetterAnchor('#')).toBe('brands-other')
  })

  it('пустой список — пустые группы, страница покажет заглушку', () => {
    expect(groupBrandsByLetter([])).toEqual([])
  })

  // Регрессия 2026-09-11: бренд, заведённый в админке только в одной локали,
  // приходил на остальные с title === undefined и ронял /brands целиком
  // (`slugify(undefined)`). Схему с тех пор починили — title больше не
  // localized, — но группировка обязана пережить пустое имя в любом случае.
  it('пустое или отсутствующее название не роняет группировку', () => {
    expect(brandLetter(undefined)).toBe('#')
    expect(brandLetter(null)).toBe('#')
    expect(brandLetter('')).toBe('#')
    expect(brandLetter('   ')).toBe('#')
  })
})

describe('old_price: пустая ячейка не обнуляет уценку', () => {
  /**
   * Регрессия 2026-09-12. Раньше `oldPrice: old_price ?? null` попадал в
   * объект варианта безусловно, и spread в `mergeVariants` затирал им уже
   * сохранённую зачёркнутую цену: обычная перезаливка прайса без колонки
   * `old_price` молча снимала уценку со ВСЕХ товаров сразу.
   *
   * Теперь правило то же, что у `images`/`country_of_origin`/`variant_image`:
   * пустая ячейка — «не трогать», ключ в объект не кладётся.
   */
  const groupA = (csv: string) => {
    const table = toTable(csv)
    const { rows, errors } = validateRows<never>('products-a', table.records)
    expect(errors).toHaveLength(0)
    return groupFormatA(rows)
  }

  it('колонки old_price нет вовсе — ключ не попадает в вариант', () => {
    const { inputs } = groupA(
      ['handle,title,brand,volume,sku,price', 'A,Название,b,5ml,A-5,200'].join('\n'),
    )
    expect('oldPrice' in inputs[0].variants[0]).toBe(false)
  })

  it('колонка есть, но ячейка пустая — ключ тоже не попадает', () => {
    const { inputs } = groupA(
      ['handle,title,brand,volume,sku,price,old_price', 'A,Название,b,5ml,A-5,200,'].join('\n'),
    )
    expect('oldPrice' in inputs[0].variants[0]).toBe(false)
  })

  it('заполненная ячейка кладётся как раньше', () => {
    const { inputs } = groupA(
      ['handle,title,brand,volume,sku,price,old_price', 'A,Название,b,5ml,A-5,200,250'].join('\n'),
    )
    expect(inputs[0].variants[0].oldPrice).toBe(250)
  })

  it('0 не теряется: проверка идёт на undefined, а не на истинность', () => {
    const { inputs } = groupA(
      ['handle,title,brand,volume,sku,price,old_price', 'A,Название,b,5ml,A-5,200,0'].join('\n'),
    )
    expect(inputs[0].variants[0].oldPrice).toBe(0)
  })

  it('формат B ведёт себя так же — форматы не расходятся', () => {
    const table = toTable(
      [
        'handle,title,brand,variants',
        'A,Название,b,"[{""volume"":""5ml"",""sku"":""A-5"",""price"":200}]"',
        'B,Другое,b,"[{""volume"":""5ml"",""sku"":""B-5"",""price"":200,""oldPrice"":250}]"',
      ].join('\n'),
    )
    const { rows, errors } = validateRows<never>('products-b', table.records)
    expect(errors).toHaveLength(0)
    const { inputs } = groupFormatB(rows)
    expect('oldPrice' in inputs[0].variants[0]).toBe(false)
    expect(inputs[1].variants[0].oldPrice).toBe(250)
  })

  it('ПЕРЕЗАЛИВКА: цена обновляется, сохранённая уценка остаётся на месте', () => {
    // Товар уже в базе со скидкой 250 → 200.
    const existing = [{ volume: '5ml', sku: 'A-5', price: 200, oldPrice: 250, stock: 3, isActive: true }]
    // Новый прайс без колонки old_price — меняем только цену.
    const { inputs } = groupA(
      ['handle,title,brand,volume,sku,price', 'A,Название,b,5ml,A-5,180'].join('\n'),
    )

    const { merged, updated } = mergeVariants(
      existing as never,
      inputs[0].variants as never,
    )
    expect(updated).toBe(1)
    expect(merged[0].price).toBe(180)
    // Главное: зачёркнутая цена не обнулилась.
    expect(merged[0].oldPrice).toBe(250)
  })

  it('ПЕРЕЗАЛИВКА с непустой ячейкой всё так же перезаписывает уценку', () => {
    const existing = [{ volume: '5ml', sku: 'A-5', price: 200, oldPrice: 250, stock: 3, isActive: true }]
    const { inputs } = groupA(
      ['handle,title,brand,volume,sku,price,old_price', 'A,Название,b,5ml,A-5,180,300'].join('\n'),
    )
    const { merged } = mergeVariants(existing as never, inputs[0].variants as never)
    expect(merged[0].oldPrice).toBe(300)
  })
})

describe('stock / is_active: пустая ячейка не обнуляет склад и не включает вариант', () => {
  /**
   * Регрессия 2026-09-18, найдена разведкой поэтапного импорта. `stock ?? 0`
   * и `is_active ?? true` попадали в объект варианта безусловно, и spread в
   * `mergeVariants` затирал ими сохранённые значения: любой повторный заход
   * форматом A/B без этих колонок (например «дописать описания») обнулял
   * остаток и снова включал выключенный вариант.
   *
   * Правило то же, что у `old_price`/`variant_image`: нет значения — нет
   * ключа. Дефолты (0 / включён) остаются только для НОВОГО варианта и
   * проставляются в `mergeVariants`.
   */
  const groupA = (csv: string) => {
    const table = toTable(csv)
    const { rows, errors } = validateRows<never>('products-a', table.records)
    expect(errors).toHaveLength(0)
    return groupFormatA(rows)
  }

  const HEAD = 'handle,title,brand,volume,sku,price'

  it('колонок stock/is_active нет вовсе — ключи не попадают в вариант', () => {
    const { inputs } = groupA([HEAD, 'A,Название,b,5ml,A-5,200'].join('\n'))
    expect('stock' in inputs[0].variants[0]).toBe(false)
    expect('isActive' in inputs[0].variants[0]).toBe(false)
  })

  it('колонки есть, но ячейки пустые — ключи тоже не попадают', () => {
    const { inputs } = groupA(
      [`${HEAD},stock,is_active`, 'A,Название,b,5ml,A-5,200,,'].join('\n'),
    )
    expect('stock' in inputs[0].variants[0]).toBe(false)
    expect('isActive' in inputs[0].variants[0]).toBe(false)
  })

  it('заполненные ячейки кладутся как раньше', () => {
    const { inputs } = groupA(
      [`${HEAD},stock,is_active`, 'A,Название,b,5ml,A-5,200,12,0'].join('\n'),
    )
    expect(inputs[0].variants[0].stock).toBe(12)
    expect(inputs[0].variants[0].isActive).toBe(false)
  })

  it('явный 0 в stock не теряется: проверка на undefined, а не на истинность', () => {
    const { inputs } = groupA([`${HEAD},stock`, 'A,Название,b,5ml,A-5,200,0'].join('\n'))
    expect(inputs[0].variants[0].stock).toBe(0)
  })

  it('формат B ведёт себя так же — форматы не расходятся', () => {
    const table = toTable(
      [
        'handle,title,brand,variants',
        'A,Название,b,"[{""volume"":""5ml"",""sku"":""A-5"",""price"":200}]"',
        'B,Другое,b,"[{""volume"":""5ml"",""sku"":""B-5"",""price"":200,""stock"":9,""isActive"":false}]"',
      ].join('\n'),
    )
    const { rows, errors } = validateRows<never>('products-b', table.records)
    expect(errors).toHaveLength(0)
    const { inputs } = groupFormatB(rows)
    expect('stock' in inputs[0].variants[0]).toBe(false)
    expect('isActive' in inputs[0].variants[0]).toBe(false)
    expect(inputs[1].variants[0].stock).toBe(9)
    expect(inputs[1].variants[0].isActive).toBe(false)
  })

  it('ПЕРЕЗАЛИВКА: остаток и выключенный вариант остаются на месте', () => {
    const existing = [{ volume: '5ml', sku: 'A-5', price: 200, stock: 7, isActive: false }]
    const { inputs } = groupA([HEAD, 'A,Название,b,5ml,A-5,180'].join('\n'))

    const { merged, updated } = mergeVariants(existing as never, inputs[0].variants as never)
    expect(updated).toBe(1)
    expect(merged[0].price).toBe(180)
    expect(merged[0].stock).toBe(7)
    expect(merged[0].isActive).toBe(false)
  })

  it('ПЕРЕЗАЛИВКА с непустыми ячейками всё так же перезаписывает', () => {
    const existing = [{ volume: '5ml', sku: 'A-5', price: 200, stock: 7, isActive: false }]
    const { inputs } = groupA(
      [`${HEAD},stock,is_active`, 'A,Название,b,5ml,A-5,180,2,1'].join('\n'),
    )
    const { merged } = mergeVariants(existing as never, inputs[0].variants as never)
    expect(merged[0].stock).toBe(2)
    expect(merged[0].isActive).toBe(true)
  })

  it('НОВЫЙ вариант без колонок получает дефолты 0 / включён', () => {
    const existing = [{ volume: '5ml', sku: 'A-5', price: 200, stock: 7, isActive: true }]
    const { inputs } = groupA([HEAD, 'A,Название,b,10ml,A-10,300'].join('\n'))

    const { merged, created } = mergeVariants(existing as never, inputs[0].variants as never)
    expect(created).toBe(1)
    const added = merged.find((variant) => variant.sku === 'A-10')
    expect(added?.stock).toBe(0)
    expect(added?.isActive).toBe(true)
    // Соседний вариант не задет.
    expect(merged.find((variant) => variant.sku === 'A-5')?.stock).toBe(7)
  })
})

describe('отказ валидации доезжает до отчёта импорта читаемым', () => {
  /**
   * Регрессия 2026-09-12. Отчёт печатал только `error.message` Payload —
   * «Следующее поле недействительно: Варианты > Variants»: ни товара, ни
   * причины. Текст самой validate-функции лежит глубже, в `data.errors[]`.
   *
   * Форма ошибки снята с живого Payload (`payload.update` на товаре,
   * нарушающем variantsDiscountConsistent), а не придумана.
   */
  const VALIDATE_TEXT =
    'Old Price (скидка) должна быть заполнена на ВСЕХ активных вариантах товара сразу, либо ни на одном — выборочная скидка по объёмам не поддерживается.'

  const payloadValidationError = () =>
    Object.assign(new Error('Следующее поле недействительно: Варианты > Variants'), {
      name: 'ValidationError',
      status: 400,
      data: {
        id: 50,
        collection: 'products',
        errors: [{ label: 'Варианты > Variants', message: VALIDATE_TEXT, path: 'variants' }],
      },
    })

  it('оригинальный текст валидации достаётся из data.errors', () => {
    expect(fieldErrorsOf(payloadValidationError())).toEqual([
      { label: 'Варианты > Variants', message: VALIDATE_TEXT, path: 'variants' },
    ])
    expect(describeError(payloadValidationError())).toBe(VALIDATE_TEXT)
  })

  it('обычная ошибка (не ValidationError) отдаёт свой message как раньше', () => {
    expect(describeError(new Error('соединение с базой потеряно'))).toBe(
      'соединение с базой потеряно',
    )
    expect(fieldErrorsOf(new Error('x'))).toEqual([])
    expect(fieldErrorsOf(null)).toEqual([])
    expect(fieldErrorsOf({ data: { errors: 'не массив' } })).toEqual([])
  })

  it('в отчёте видно строку, товар, SKU и причину — без заглядывания в код', () => {
    // Ровно то, что собирает applyProducts → engine на реальном отказе.
    const error = new ProductWriteError(
      2,
      'MO-AMBER-SALE',
      [
        'MO-AS-05: 300, old_price 250 не выше цены — скидки нет',
        'MO-AS-10: 370 вместо 450 (−18%)',
        'MO-AS-30: 790 вместо 1200 (−34%)',
      ],
      describeError(payloadValidationError()),
    )

    const report = formatReport({
      ok: false,
      dryRun: false,
      plan: emptyPlan('products-a', 'ro'),
      errors: [
        { line: error.line, field: 'variants', message: `импорт откачен целиком — ${error.message}` },
      ],
    })

    // Номер строки файла — чтобы человек знал, куда смотреть.
    expect(report).toContain('строка 2')
    // Товар и все его SKU.
    expect(report).toContain('MO-AMBER-SALE')
    expect(report).toContain('MO-AS-05')
    expect(report).toContain('MO-AS-10')
    expect(report).toContain('MO-AS-30')
    // Что именно не сошлось: у одного варианта скидки нет, у других есть.
    expect(report).toContain('скидки нет')
    expect(report).toContain('−18%')
    // И оригинальная формулировка правила.
    expect(report).toContain(VALIDATE_TEXT)
    // Общего Payload-текста, который был раньше, в отчёте больше нет.
    expect(report).not.toContain('Следующее поле недействительно')
  })

  it('ProductWriteError несёт строку и handle для адресной ошибки', () => {
    const error = new ProductWriteError(7, 'CL-PIPER', ['CL-P-05: 100, old_price пуст — скидки нет'], 'причина')
    expect(error.line).toBe(7)
    expect(error.handle).toBe('CL-PIPER')
    expect(error.message).toContain('CL-PIPER')
    expect(error.message).toContain('причина')
    expect(error.message).toContain('CL-P-05')
  })

  it('отказ без вариантов не ломает формат сообщения', () => {
    const error = new ProductWriteError(3, 'X-1', [], 'поле title обязательно')
    expect(error.message).toBe('товар X-1 — поле title обязательно')
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
