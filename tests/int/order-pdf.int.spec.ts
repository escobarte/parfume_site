// @vitest-environment node
//
// Node, а не jsdom (дефолт проекта): PDF собирается на сервере обычным fs, а
// извлекать текст из него мы будем pdfjs — в jsdom он уходит в браузерную
// ветку и требует DOMMatrix/canvas, которых там нет.

import { PDFDocument } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it, vi } from 'vitest'
import { buildOrderPdf, orderPdfFilename } from '@/lib/orders/pdf'
import type { Order } from '@/payload-types'

/**
 * Печатная версия заявки: кириллица и румынские диакритики доезжают до PDF,
 * файл валиден, длинная заявка переносится на вторую страницу.
 *
 * БД тут не нужна — `buildOrderPdf` чистая функция от документа заявки.
 */

type OrderItem = NonNullable<Order['items']>[number]

const item = (overrides: Partial<OrderItem> & Pick<OrderItem, 'title' | 'sku'>): OrderItem => ({
  brandTitle: 'Maison Orphée',
  volume: '5ml',
  price: 240,
  qty: 1,
  lineTotal: 240,
  ...overrides,
})

const order = (overrides: Partial<Order> = {}): Order =>
  ({
    id: 1,
    orderNumber: 'MF-260919-AB12',
    createdAt: '2026-09-19T19:45:00.000Z',
    updatedAt: '2026-09-19T19:45:00.000Z',
    status: 'new',
    locale: 'ro',
    source: 'cart',
    checkoutMode: 'standard',
    deliveryMethod: 'pickup',
    paymentMethod: 'cash',
    customer: { name: 'Ștefan Țurcanu', phone: '+37360123456', messenger: 'viber' },
    items: [item({ title: 'Signature Wood', sku: 'MO-SW-05', qty: 2, lineTotal: 480 })],
    total: 480,
    ...overrides,
  }) as Order

/** Текст всех страниц PDF одной строкой — ровно то, что увидит менеджер, копируя из файла. */
async function extractText(bytes: Uint8Array): Promise<string> {
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false })
  const doc = await task.promise

  let text = ''
  for (let page = 1; page <= doc.numPages; page += 1) {
    const content = await (await doc.getPage(page)).getTextContent()
    text += `${content.items.map((entry) => ('str' in entry ? entry.str : '')).join(' ')}\n`
  }
  await task.destroy()
  return text
}

const pageCount = async (bytes: Uint8Array): Promise<number> =>
  (await PDFDocument.load(bytes)).getPageCount()

/**
 * Межбуквенный трекинг заголовков ИТОГО (BRAND.md) заставляет pdfjs вставлять
 * пробел между каждой буквой при извлечении текста — сравнивать такие строки
 * нужно без пробелов вообще, обычные (без трекинга) строки это не трогает.
 */
const flatten = (text: string): string => text.replace(/\s+/g, '')

describe('PDF заявки', () => {
  it('валидный файл: сигнатура %PDF и ненулевой размер', async () => {
    const bytes = await buildOrderPdf(order())

    expect(bytes.length).toBeGreaterThan(0)
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-')
  })

  it('имя файла — номер заявки, как у CSV', () => {
    expect(orderPdfFilename(order())).toBe('MF-260919-AB12.pdf')
    expect(orderPdfFilename(order({ orderNumber: null }))).toBe('order.pdf')
  })

  it('кириллица и румынские диакритики не теряются при извлечении текста', async () => {
    const bytes = await buildOrderPdf(
      order({
        checkoutMode: 'noCall',
        deliveryMethod: 'delivery',
        paymentMethod: 'card',
        customer: {
          name: 'Ștefan Țurcanu',
          phone: '+37360123456',
          messenger: 'viber',
          address: 'Chișinău, str. Ștefan cel Mare și Sfânt 123, Șoseaua Hîncești',
        },
        comment: 'Валерий просил подарочную упаковку. Диакритики: ă â î ș ț Ș Ț ş ţ',
        promoCode: 'WELCOME-ABC123',
        promoDiscountPercent: 10,
        promoDiscountAmount: 240,
        items: [
          item({ title: 'Signature Wood', sku: 'MO-SW-05', qty: 2, lineTotal: 480 }),
          item({
            title: 'Nuit Étoilée — ediție limitată',
            sku: 'AC-NE-10',
            brandTitle: 'Atelier Céleste',
            volume: '10ml',
            price: 420,
            lineTotal: 420,
          }),
          item({
            title: 'Вечерний Бархат',
            sku: 'DA-VB-FULL',
            brandTitle: 'Дом Ароматов',
            volume: 'Full Size',
            price: 1260,
            lineTotal: 1260,
          }),
        ],
        total: 2160,
      }),
      { promoPhone: '+37369999999' },
    )

    const text = await extractText(bytes)

    // Имя и адрес — латиница Extended, включая ș/ț/ă/î.
    expect(text).toContain('Ștefan Țurcanu')
    expect(text).toContain('Chișinău, str. Ștefan cel Mare și Sfânt 123, Șoseaua Hîncești')
    // Обе формы диакритик: с запятой (ș ț) и с седилью (ş ţ).
    expect(text).toContain('ă â î ș ț Ș Ț ş ţ')
    // Кириллица — в имени в комментарии, в бренде и в названии позиции.
    expect(text).toContain('Валерий')
    expect(text).toContain('Дом Ароматов')
    expect(text).toContain('Вечерний Бархат')
    // Ни одного «квадрата»: подстановочных глифов в извлечённом тексте быть не должно.
    expect(text).not.toMatch(/[\uFFFD\u25A1]/)
  })

  it('печатает номер, дату, язык, промокод, итог и пометку «не звонить»', async () => {
    const text = await extractText(
      await buildOrderPdf(
        order({
          checkoutMode: 'noCall',
          promoCode: 'WELCOME-ABC123',
          promoDiscountPercent: 10,
          // order.promoDiscountAmount больше не читается PDF для этой строки
          // (см. docs/GOTCHAS.md) — оставлено здесь как снапшот заказа,
          // проверка на «-240 MDL» ниже идёт от itemized basePrice/discountSource.
          promoDiscountAmount: 50,
          items: [
            item({
              title: 'Signature Wood',
              sku: 'MO-SW-05',
              price: 240,
              basePrice: 360,
              discountPercent: 33,
              discountSource: 'promo',
              qty: 2,
              lineTotal: 480,
            }),
            item({ title: 'Nuit Étoilée', sku: 'AC-NE-10', price: 840, qty: 2, lineTotal: 1680 }),
          ],
          total: 2160,
        }),
      ),
    )

    expect(text).toContain('MF-260919-AB12')
    // Дата и время — местные (Europe/Chisinau), 19:45 UTC = 22:45.
    expect(text).toContain('19.09.2026, 22:45')
    expect(text).toContain('RO')
    expect(text).toContain('НЕ ЗВОНИТЬ')
    expect(text).toContain('WELCOME-ABC123')
    expect(text).toContain('-240 MDL')
    expect(text).toContain('2 160 MDL')
  })

  it('адрес печатается только при доставке', async () => {
    const withAddress = await extractText(
      await buildOrderPdf(
        order({
          deliveryMethod: 'delivery',
          customer: {
            name: 'Ștefan Țurcanu',
            phone: '+37360123456',
            address: 'Chișinău, bd. Dacia 12',
          },
        }),
      ),
    )
    expect(withAddress).toContain('Доставка')
    expect(withAddress).toContain('Chișinău, bd. Dacia 12')

    // Самовывоз: строки адреса нет вовсе — пустой «Адрес: —» в бланке только мешает.
    const pickup = await extractText(await buildOrderPdf(order()))
    expect(pickup).toContain('Самовывоз')
    expect(pickup).not.toContain('Адрес')
  })

  it('промо-телефон печатается только если отличается от телефона заявки', async () => {
    const other = await extractText(
      await buildOrderPdf(order({ promoCode: 'WELCOME-ABC123' }), {
        promoPhone: '+37369999999',
      }),
    )
    expect(other).toContain('Телефон промокода')
    expect(other).toContain('+37369999999')

    // Тот же номер в другой записи (без кода страны) — второй строки быть не должно.
    const same = await extractText(
      await buildOrderPdf(order({ promoCode: 'WELCOME-ABC123' }), { promoPhone: '060123456' }),
    )
    expect(same).not.toContain('Телефон промокода')

    // Публичный код: телефона нет вовсе.
    const none = await extractText(await buildOrderPdf(order({ promoCode: 'AUTUMN20' })))
    expect(none).not.toContain('Телефон промокода')
  })

  it('длинная заявка переносится на вторую страницу и не теряет позиции', async () => {
    const items = Array.from({ length: 35 }, (_, index) =>
      item({
        title: `Позиция №${index + 1} — Ediție specială`,
        sku: `SKU-${String(index + 1).padStart(3, '0')}`,
        brandTitle: index % 2 ? 'Maison Orphée' : 'Дом Ароматов',
        price: 180,
        qty: 1,
        lineTotal: 180,
      }),
    )
    const bytes = await buildOrderPdf(order({ items, total: 6300 }))

    expect(await pageCount(bytes)).toBeGreaterThanOrEqual(2)

    const text = await extractText(bytes)
    expect(text).toContain('SKU-001')
    expect(text).toContain('SKU-035')
    expect(text).toContain('6 300 MDL')
    // Шапка таблицы повторяется на каждой странице — иначе вторая страница
    // читается как безымянный список чисел.
    expect(text.match(/Наименование/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('заявка на 15 позиций умещается на одной странице A4', async () => {
    const items = Array.from({ length: 15 }, (_, index) =>
      item({ title: `Позиция ${index + 1}`, sku: `SKU-${index + 1}`, lineTotal: 240 }),
    )
    const bytes = await buildOrderPdf(order({ items, total: 3600 }))

    expect(await pageCount(bytes)).toBe(1)
  })

  it('заголовки «Цена»/«Сумма» поясняются подписью «без скидки»/«со скидкой» — даже без единой скидки в заявке', async () => {
    const text = await extractText(await buildOrderPdf(order()))

    expect(text).toContain('Цена')
    expect(text).toContain('без скидки')
    expect(text).toContain('Сумма')
    expect(text).toContain('со скидкой')
  })
})

describe('PDF заявки — блок итогов со скидками', () => {
  // basePrice/discountPercent/discountSource — попозиционный снапшот скидки
  // (src/collections/Orders.ts), который считает src/lib/pricing.ts::priceLine
  // на сервере. Здесь воссоздаём его руками, как это делает order-request/route.ts.

  it('(1) без скидок — только «ИТОГО», без разбивки', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const text = await extractText(
      await buildOrderPdf(
        order({
          items: [item({ title: 'Signature Wood', sku: 'MO-SW-05', price: 240, qty: 2, lineTotal: 480 })],
          total: 480,
        }),
      ),
    )

    expect(text).not.toContain('Сумма без скидки')
    expect(text).not.toContain('Скидка на товары')
    expect(text).not.toContain('Промокод')
    expect(flatten(text)).toContain(flatten('ИТОГО'))
    expect(flatten(text)).not.toContain(flatten('ИТОГО СО СКИДКОЙ'))
    expect(text).toContain('480 MDL')
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('(2) только скидка на товары — «Сумма без скидки» и «Скидка на товары», без промокода', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const text = await extractText(
      await buildOrderPdf(
        order({
          items: [
            item({
              title: 'Signature Wood',
              sku: 'MO-SW-05',
              price: 150,
              basePrice: 200,
              discountPercent: 25,
              discountSource: 'product',
              qty: 1,
              lineTotal: 150,
            }),
          ],
          total: 150,
        }),
      ),
    )

    expect(text).toContain('Сумма без скидки')
    expect(text).toContain('200 MDL')
    expect(text).toContain('Скидка на товары')
    expect(text).toContain('-50 MDL')
    expect(text).not.toContain('Промокод')
    expect(flatten(text)).toContain(flatten('ИТОГО СО СКИДКОЙ'))
    expect(text).toContain('150 MDL')
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('(3) только промокод — «Сумма без скидки» и «Промокод», без «Скидка на товары»', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const text = await extractText(
      await buildOrderPdf(
        order({
          items: [
            item({
              title: 'Signature Wood',
              sku: 'MO-SW-05',
              price: 90,
              basePrice: 100,
              discountPercent: 10,
              discountSource: 'promo',
              qty: 2,
              lineTotal: 180,
            }),
          ],
          promoCode: 'AUTUMN20',
          promoDiscountPercent: 10,
          promoDiscountAmount: 20,
          total: 180,
        }),
      ),
    )

    expect(text).toContain('Сумма без скидки')
    expect(text).toContain('200 MDL')
    expect(text).not.toContain('Скидка на товары')
    expect(text).toContain('Промокод AUTUMN20 (-10%)')
    expect(text).toContain('-20 MDL')
    expect(flatten(text)).toContain(flatten('ИТОГО СО СКИДКОЙ'))
    expect(text).toContain('180 MDL')
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('(4) скидка на товары и промокод одновременно (на разных позициях) — обе строки, согласованность сходится', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const text = await extractText(
      await buildOrderPdf(
        order({
          items: [
            item({
              title: 'Signature Wood',
              sku: 'MO-SW-05',
              price: 150,
              basePrice: 200,
              discountPercent: 25,
              discountSource: 'product',
              qty: 1,
              lineTotal: 150,
            }),
            item({
              title: 'Nuit Étoilée',
              sku: 'AC-NE-10',
              price: 90,
              basePrice: 100,
              discountPercent: 10,
              discountSource: 'promo',
              qty: 2,
              lineTotal: 180,
            }),
          ],
          promoCode: 'AUTUMN20',
          promoDiscountPercent: 10,
          promoDiscountAmount: 20,
          total: 330,
        }),
      ),
    )

    expect(text).toContain('Сумма без скидки')
    expect(text).toContain('400 MDL')
    expect(text).toContain('Скидка на товары')
    expect(text).toContain('-50 MDL')
    expect(text).toContain('Промокод AUTUMN20 (-10%)')
    expect(text).toContain('-20 MDL')
    expect(flatten(text)).toContain(flatten('ИТОГО СО СКИДКОЙ'))
    expect(text).toContain('330 MDL')
    // 400 - 50 - 20 = 330 — сходится, предупреждения о расхождении быть не должно.
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('(5) на одной позиции своя скидка 10% против промокода 15% — выигрывает промокод, вся скидка позиции идёт в «Промокод»', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const text = await extractText(
      await buildOrderPdf(
        order({
          items: [
            item({
              title: 'Signature Wood',
              sku: 'MO-SW-05',
              price: 850,
              basePrice: 1000,
              discountPercent: 15,
              discountSource: 'promo',
              qty: 1,
              lineTotal: 850,
            }),
            item({ title: 'Nuit Étoilée', sku: 'AC-NE-10', price: 300, qty: 1, lineTotal: 300 }),
          ],
          promoCode: 'SPRING15',
          promoDiscountPercent: 15,
          // Намеренно НЕ равно правильному расчёту (150) — order.promoDiscountAmount
          // больше не читается этой строкой (docs/GOTCHAS.md), значение ниже должно
          // прийти из позиции (basePrice 1000 − price 850), а не из этого поля.
          promoDiscountAmount: 50,
          total: 1150,
        }),
      ),
    )

    expect(text).toContain('Сумма без скидки')
    expect(text).toContain('1 300 MDL')
    expect(text).not.toContain('Скидка на товары')
    expect(text).toContain('Промокод SPRING15 (-15%)')
    expect(text).toContain('-150 MDL')
    expect(flatten(text)).toContain(flatten('ИТОГО СО СКИДКОЙ'))
    expect(text).toContain('1 150 MDL')
    // 1300 - 0 - 150 = 1150 — сходится целиком, вся скидка позиции учтена в «Промокод».
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('(6) на одной позиции своя скидка 20% против промокода 15% — выигрывает скидка товара, вся скидка позиции идёт в «Скидку на товары»', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const text = await extractText(
      await buildOrderPdf(
        order({
          items: [
            item({
              title: 'Signature Wood',
              sku: 'MO-SW-05',
              price: 800,
              basePrice: 1000,
              discountPercent: 20,
              discountSource: 'product',
              qty: 1,
              lineTotal: 800,
            }),
            item({ title: 'Nuit Étoilée', sku: 'AC-NE-10', price: 300, qty: 1, lineTotal: 300 }),
          ],
          promoCode: 'SPRING15',
          promoDiscountPercent: 15,
          promoDiscountAmount: 0,
          total: 1100,
        }),
      ),
    )

    expect(text).toContain('Сумма без скидки')
    expect(text).toContain('1 300 MDL')
    expect(text).toContain('Скидка на товары')
    expect(text).toContain('-200 MDL')
    expect(text).toContain('Промокод SPRING15 (-15%)')
    expect(flatten(text)).toContain(flatten('ИТОГО СО СКИДКОЙ'))
    expect(text).toContain('1 100 MDL')
    // 1300 - 200 - 0 = 1100 — сходится, промокод проиграл и не вычитает ничего лишнего.
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
