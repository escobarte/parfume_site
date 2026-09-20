// @vitest-environment node
//
// Node, а не jsdom (дефолт проекта): PDF собирается на сервере обычным fs, а
// извлекать текст из него мы будем pdfjs — в jsdom он уходит в браузерную
// ветку и требует DOMMatrix/canvas, которых там нет.

import { PDFDocument } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
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
          promoDiscountAmount: 240,
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
})
