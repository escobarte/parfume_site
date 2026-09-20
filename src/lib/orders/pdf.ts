import { readFile } from 'node:fs/promises'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, setCharacterSpacing, type PDFFont, type PDFPage } from 'pdf-lib'
import type { Order } from '@/payload-types'
import {
  buildOrderSummary,
  formatMdl,
  type OrderSummary,
  type OrderSummaryField,
  type OrderSummaryOptions,
} from './summary'

/**
 * Печатная версия заявки (A4) — вложение к письму менеджеру и кнопка
 * «Скачать PDF» в админке.
 *
 * Почему `pdf-lib`, а не `pdfkit`/`@react-pdf/renderer`: критерий выбора —
 * совместимость со `output: 'standalone'` и Docker-сборкой. `pdf-lib` —
 * чистый JS без нативных модулей и без чтения собственных файлов из
 * `node_modules` в рантайме (pdfkit читает свои `.afm` с диска, а
 * standalone-трассировка Next такие файлы-данные не тащит; `@react-pdf/
 * renderer` дополнительно тянет wasm-раскладчик yoga). Единственные внешние
 * файлы здесь — наши собственные TTF, и за них отвечаем мы сами (см.
 * FONT_DIR_CANDIDATES ниже). Плата за это — раскладку строк и таблицы
 * считаем руками: готового текстового движка у pdf-lib нет.
 *
 * Язык документа всегда русский, независимо от локали заявки: читатель —
 * менеджер, а не клиент.
 */

// ── Шрифт ───────────────────────────────────────────────────────────────────

/**
 * Inter (OFL) статичными TTF прямо в репозитории — стандартные шрифты PDF
 * (Helvetica и прочие из Base 14) не содержат ни кириллицы, ни румынских
 * ș/ț, текст в них превратился бы в квадраты.
 *
 * Пути, по которым файлы ищутся в рантайме, — от самого надёжного к
 * запасному. Docker-образ кладёт `src` целиком в `/app/src` (см. Dockerfile),
 * а `next.config.ts` дополнительно прописывает эту папку в
 * `outputFileTracingIncludes` — так шрифт доезжает в standalone и без
 * копирования исходников.
 */
const FONT_DIR_CANDIDATES = [
  process.env.ORDER_PDF_FONT_DIR,
  path.join(process.cwd(), 'src', 'lib', 'orders', 'fonts'),
  path.join(process.cwd(), '.next', 'standalone', 'src', 'lib', 'orders', 'fonts'),
].filter((candidate): candidate is string => Boolean(candidate))

const FONT_FILES = {
  regular: 'Inter-Regular.ttf',
  semibold: 'Inter-SemiBold.ttf',
} as const

type FontBytes = { regular: Buffer; semibold: Buffer }

let fontBytesPromise: Promise<FontBytes> | null = null

async function readFontsFrom(dir: string): Promise<FontBytes> {
  const [regular, semibold] = await Promise.all([
    readFile(path.join(dir, FONT_FILES.regular)),
    readFile(path.join(dir, FONT_FILES.semibold)),
  ])
  return { regular, semibold }
}

/** Файлы читаются один раз на процесс: заявок много, шрифт один и тот же. */
function loadFontBytes(): Promise<FontBytes> {
  if (!fontBytesPromise) {
    fontBytesPromise = (async () => {
      const failures: string[] = []
      for (const dir of FONT_DIR_CANDIDATES) {
        try {
          return await readFontsFrom(dir)
        } catch (error) {
          failures.push(`${dir}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      throw new Error(`Шрифты Inter для PDF не найдены. Проверено: ${failures.join('; ')}`)
    })().catch((error) => {
      // Неудачу не кэшируем: следующий вызов попробует снова (файл мог
      // появиться после монтирования тома).
      fontBytesPromise = null
      throw error
    })
  }
  return fontBytesPromise
}

/** Путь к папке со шрифтами — для диагностики и тестов. */
export const orderPdfFontDirCandidates = (): string[] => [...FONT_DIR_CANDIDATES]

// ── Геометрия и оформление ──────────────────────────────────────────────────

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_X = 42
const MARGIN_TOP = 46
const MARGIN_BOTTOM = 52
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2

// BRAND.md §2: navy — текст и тонкие линии. Печать — без заливок, белый фон.
const NAVY = rgb(0x16 / 255, 0x29 / 255, 0x3d / 255)
// --color-ink-muted: вторичные подписи, тот же ряд токенов.
const INK_MUTED = rgb(0x4a / 255, 0x5a / 255, 0x6b / 255)

const SIZE_WORDMARK = 12
const SIZE_TITLE = 11
const SIZE_SECTION = 7.5
const SIZE_BODY = 9
const SIZE_TABLE = 8.5
const SIZE_TOTAL = 12
const SIZE_FOOTER = 7.5

const LINE_BODY = 13
const LINE_TABLE = 11

const TRACKING_WORDMARK = 2.6
const TRACKING_SECTION = 1.4

const LABEL_WIDTH = 118

type Column = {
  key: 'brand' | 'title' | 'volume' | 'sku' | 'qty' | 'price' | 'sum'
  title: string
  width: number
  align: 'left' | 'right'
}

// Ширины подобраны под CONTENT_WIDTH (511.28) — сумма ниже равна ему с
// точностью до 0.28pt, остаток уходит в правое поле.
const COLUMNS: Column[] = [
  { key: 'brand', title: 'Бренд', width: 92, align: 'left' },
  { key: 'title', title: 'Наименование', width: 168, align: 'left' },
  { key: 'volume', title: 'Объём', width: 48, align: 'left' },
  { key: 'sku', title: 'Артикул', width: 78, align: 'left' },
  { key: 'qty', title: 'Кол-во', width: 40, align: 'right' },
  { key: 'price', title: 'Цена', width: 42, align: 'right' },
  { key: 'sum', title: 'Сумма', width: 43, align: 'right' },
]

const CELL_PAD_X = 4
const CELL_PAD_Y = 4

// ── Примитивы рисования ─────────────────────────────────────────────────────

type Fonts = { regular: PDFFont; semibold: PDFFont }

type DrawTextOptions = {
  font: PDFFont
  size: number
  color?: ReturnType<typeof rgb>
  tracking?: number
}

const textWidth = (text: string, { font, size, tracking = 0 }: DrawTextOptions): number =>
  font.widthOfTextAtSize(text, size) + tracking * text.length

/**
 * Межбуквенный интервал брендовых заголовков (BRAND.md §3) — состояние
 * текста PDF (`Tc`), а не отдельный проход по символам. Обязательно
 * возвращаем 0: `Tc` живёт в потоке содержимого страницы и иначе протёк бы
 * на следующий `drawText`.
 */
function drawText(page: PDFPage, text: string, x: number, y: number, options: DrawTextOptions) {
  const { font, size, color = NAVY, tracking = 0 } = options
  if (!text) return
  if (tracking) page.pushOperators(setCharacterSpacing(tracking))
  page.drawText(text, { x, y, size, font, color })
  if (tracking) page.pushOperators(setCharacterSpacing(0))
}

function drawTextRight(page: PDFPage, text: string, right: number, y: number, options: DrawTextOptions) {
  drawText(page, text, right - textWidth(text, options), y, options)
}

function drawRule(page: PDFPage, y: number, thickness = 0.6, width = CONTENT_WIDTH) {
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: MARGIN_X + width, y },
    thickness,
    color: NAVY,
  })
}

/** Перенос по словам; слово длиннее колонки режется по символам. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return ['']
  const lines: string[] = []
  let current = ''

  const pushCurrent = () => {
    if (current) lines.push(current)
    current = ''
  }

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
      continue
    }
    pushCurrent()
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word
      continue
    }
    // Длинный артикул/склеенное название — режем по символам.
    let chunk = ''
    for (const char of word) {
      if (font.widthOfTextAtSize(chunk + char, size) > maxWidth && chunk) {
        lines.push(chunk)
        chunk = char
      } else {
        chunk += char
      }
    }
    current = chunk
  }

  pushCurrent()
  return lines.length ? lines : ['']
}

// ── Каркас документа ────────────────────────────────────────────────────────

type Layout = {
  doc: PDFDocument
  fonts: Fonts
  summary: OrderSummary
  page: PDFPage
  y: number
}

/** Шапка страницы: вордмарк слева, номер заявки справа, линия под ними. */
function drawPageHeader(layout: Layout) {
  const { page, fonts, summary } = layout
  const top = PAGE_HEIGHT - MARGIN_TOP

  // Фирменная EN-фраза бренда не переводится ни в одной локали (CLAUDE.md).
  drawText(page, 'MON FLACON', MARGIN_X, top - SIZE_WORDMARK, {
    font: fonts.semibold,
    size: SIZE_WORDMARK,
    tracking: TRACKING_WORDMARK,
  })
  drawTextRight(page, `ЗАЯВКА ${summary.orderNumber}`, MARGIN_X + CONTENT_WIDTH, top - SIZE_TITLE, {
    font: fonts.semibold,
    size: SIZE_TITLE,
  })

  const ruleY = top - SIZE_WORDMARK - 8
  drawRule(layout.page, ruleY, 1)
  layout.y = ruleY - 22
}

function newPage(layout: Layout) {
  layout.page = layout.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  drawPageHeader(layout)
}

/** Хватит ли места под блок высотой `height` — иначе новая страница. */
function ensureSpace(layout: Layout, height: number): boolean {
  if (layout.y - height >= MARGIN_BOTTOM) return false
  newPage(layout)
  return true
}

function drawSectionTitle(layout: Layout, title: string) {
  ensureSpace(layout, 26)
  drawText(layout.page, title, MARGIN_X, layout.y, {
    font: layout.fonts.semibold,
    size: SIZE_SECTION,
    tracking: TRACKING_SECTION,
    color: INK_MUTED,
  })
  layout.y -= 6
  drawRule(layout.page, layout.y, 0.4)
  layout.y -= 15
}

/** Строки «подпись — значение»: подпись приглушена, значение навигационно важнее. */
function drawFields(layout: Layout, fields: OrderSummaryField[]) {
  const valueWidth = CONTENT_WIDTH - LABEL_WIDTH
  for (const field of fields) {
    const lines = wrapText(field.value || '—', layout.fonts.regular, SIZE_BODY, valueWidth)
    ensureSpace(layout, lines.length * LINE_BODY)
    drawText(layout.page, field.label, MARGIN_X, layout.y, {
      font: layout.fonts.regular,
      size: SIZE_BODY,
      color: INK_MUTED,
    })
    lines.forEach((line, index) => {
      drawText(layout.page, line, MARGIN_X + LABEL_WIDTH, layout.y - index * LINE_BODY, {
        font: layout.fonts.semibold,
        size: SIZE_BODY,
      })
    })
    layout.y -= lines.length * LINE_BODY
  }
  layout.y -= 8
}

/** Пометка «не звонить» — рамкой, не заливкой (BRAND.md §5: линии вместо плашек). */
function drawNoCallNotice(layout: Layout) {
  const height = 26
  ensureSpace(layout, height + 10)
  layout.page.drawRectangle({
    x: MARGIN_X,
    y: layout.y - height + 12,
    width: CONTENT_WIDTH,
    height,
    borderColor: NAVY,
    borderWidth: 1,
  })
  drawText(layout.page, 'НЕ ЗВОНИТЬ — клиент просил не звонить', MARGIN_X + 12, layout.y - 1, {
    font: layout.fonts.semibold,
    size: SIZE_BODY + 0.5,
    tracking: 0.8,
  })
  layout.y -= height + 12
}

// ── Таблица позиций ─────────────────────────────────────────────────────────

const columnX = (index: number): number =>
  MARGIN_X + COLUMNS.slice(0, index).reduce((sum, column) => sum + column.width, 0)

function drawTableHeader(layout: Layout) {
  COLUMNS.forEach((column, index) => {
    const x = columnX(index)
    const options: DrawTextOptions = {
      font: layout.fonts.semibold,
      size: SIZE_SECTION,
      color: INK_MUTED,
      tracking: 0.6,
    }
    if (column.align === 'right') {
      drawTextRight(layout.page, column.title, x + column.width - CELL_PAD_X, layout.y, options)
    } else {
      drawText(layout.page, column.title, x + CELL_PAD_X, layout.y, options)
    }
  })
  layout.y -= 7
  drawRule(layout.page, layout.y, 0.6)
  layout.y -= CELL_PAD_Y + LINE_TABLE - 2
}

function drawItemsTable(layout: Layout) {
  drawTableHeader(layout)

  for (const item of layout.summary.items) {
    const cells = COLUMNS.map((column) => {
      const value = item[column.key] || (column.align === 'right' ? '0' : '—')
      return wrapText(value, layout.fonts.regular, SIZE_TABLE, column.width - CELL_PAD_X * 2)
    })
    const rowLines = Math.max(...cells.map((lines) => lines.length))
    const rowHeight = rowLines * LINE_TABLE + CELL_PAD_Y

    // Перенос на следующую страницу — вместе с повторной шапкой таблицы,
    // иначе вторая страница выглядит как безымянный список чисел.
    if (ensureSpace(layout, rowHeight)) drawTableHeader(layout)

    cells.forEach((lines, index) => {
      const column = COLUMNS[index]
      const x = columnX(index)
      lines.forEach((line, lineIndex) => {
        const options: DrawTextOptions = { font: layout.fonts.regular, size: SIZE_TABLE }
        const y = layout.y - lineIndex * LINE_TABLE
        if (column.align === 'right') {
          drawTextRight(layout.page, line, x + column.width - CELL_PAD_X, y, options)
        } else {
          drawText(layout.page, line, x + CELL_PAD_X, y, options)
        }
      })
    })

    layout.y -= rowLines * LINE_TABLE
    drawRule(layout.page, layout.y + 4, 0.3)
    layout.y -= CELL_PAD_Y
  }

  layout.y -= 10
}

function drawTotals(layout: Layout) {
  const { promo, total } = layout.summary
  const right = MARGIN_X + CONTENT_WIDTH

  if (promo) {
    const percent = promo.percent === null ? '' : ` (-${promo.percent}%)`
    const amount = promo.amount === null ? '' : `-${formatMdl(promo.amount)} MDL`
    ensureSpace(layout, LINE_BODY * 2)
    drawText(layout.page, `Промокод ${promo.code}${percent}`, MARGIN_X, layout.y, {
      font: layout.fonts.regular,
      size: SIZE_BODY,
      color: INK_MUTED,
    })
    drawTextRight(layout.page, amount, right, layout.y, {
      font: layout.fonts.regular,
      size: SIZE_BODY,
      color: INK_MUTED,
    })
    layout.y -= LINE_BODY + 4
  }

  ensureSpace(layout, 30)
  drawRule(layout.page, layout.y + 12, 1)
  drawText(layout.page, 'ИТОГО', MARGIN_X, layout.y - 6, {
    font: layout.fonts.semibold,
    size: SIZE_TOTAL,
    tracking: 1.6,
  })
  drawTextRight(layout.page, `${total} MDL`, right, layout.y - 6, {
    font: layout.fonts.semibold,
    size: SIZE_TOTAL,
  })
  layout.y -= 30
}

/** Свободный текст во всю ширину — комментарий менеджеру. */
function drawParagraph(layout: Layout, text: string) {
  for (const line of wrapText(text, layout.fonts.regular, SIZE_BODY, CONTENT_WIDTH)) {
    ensureSpace(layout, LINE_BODY)
    drawText(layout.page, line, MARGIN_X, layout.y, {
      font: layout.fonts.regular,
      size: SIZE_BODY,
    })
    layout.y -= LINE_BODY
  }
}

function drawFooters(doc: PDFDocument, fonts: Fonts, summary: OrderSummary) {
  const pages = doc.getPages()
  pages.forEach((page, index) => {
    const options: DrawTextOptions = {
      font: fonts.regular,
      size: SIZE_FOOTER,
      color: INK_MUTED,
    }
    drawText(page, `MON FLACON · заявка ${summary.orderNumber}`, MARGIN_X, MARGIN_BOTTOM - 20, options)
    drawTextRight(
      page,
      `Стр. ${index + 1} из ${pages.length}`,
      MARGIN_X + CONTENT_WIDTH,
      MARGIN_BOTTOM - 20,
      options,
    )
  })
}

// ── Сборка ──────────────────────────────────────────────────────────────────

/**
 * Печатная версия заявки. Возвращает готовые байты PDF.
 *
 * Бросает исключение, если шрифты не найдены, — вызывающий обязан решать,
 * что с этим делать. Для письма менеджеру ответ один: письмо уходит без
 * PDF (см. api/order-request/route.ts), заявка от этого не теряется.
 */
export async function buildOrderPdf(order: Order, options: OrderSummaryOptions = {}): Promise<Uint8Array> {
  const summary = buildOrderSummary(order, options)
  const bytes = await loadFontBytes()

  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const fonts: Fonts = {
    regular: await doc.embedFont(bytes.regular, { subset: true }),
    semibold: await doc.embedFont(bytes.semibold, { subset: true }),
  }

  doc.setTitle(`Заявка ${summary.orderNumber}`)
  doc.setSubject('MON FLACON — печатная версия заявки')
  doc.setCreator('MON FLACON')
  doc.setProducer('MON FLACON')

  const layout: Layout = {
    doc,
    fonts,
    summary,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: 0,
  }
  drawPageHeader(layout)

  drawFields(layout, [
    { label: 'Дата и время', value: summary.dateTime },
    { label: 'Язык заявки', value: summary.localeLabel },
  ])

  if (summary.noCall) drawNoCallNotice(layout)

  drawSectionTitle(layout, 'КЛИЕНТ')
  drawFields(layout, summary.contact)

  drawSectionTitle(layout, 'ПОЛУЧЕНИЕ И ОПЛАТА')
  drawFields(layout, summary.fulfilment)

  drawSectionTitle(layout, 'ПОЗИЦИИ')
  drawItemsTable(layout)
  drawTotals(layout)

  if (summary.comment) {
    drawSectionTitle(layout, 'КОММЕНТАРИЙ')
    drawParagraph(layout, summary.comment)
  }

  drawFooters(doc, fonts, summary)

  return doc.save()
}

/** Имя файла — номер заявки, как у CSV. */
export const orderPdfFilename = (order: Order): string => `${order.orderNumber ?? 'order'}.pdf`
