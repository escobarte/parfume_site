import { chromium } from '@playwright/test'
import path from 'path'

/**
 * Сверка вёрстки с утверждённым мокапом docs/mockups/mockup-home.html:
 * сравниваем не пиксели (мокап — статичная страница другой ширины), а
 * измеримые величины бренда — цвета, размеры шрифта, трекинг, высоты.
 */
const BASE = process.env.SHOT_BASE ?? 'http://localhost:3000'
const MOCKUP = 'file://' + path.resolve('docs/mockups/mockup-home.html')

const browser = await chromium.launch()
const mock = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await mock.goto(MOCKUP, { waitUntil: 'domcontentloaded' })

const live = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await live.goto(`${BASE}/ro/catalog`, { waitUntil: 'domcontentloaded' })
await live.locator('footer').first().waitFor({ timeout: 20000 })

const read = (page, selector, props) =>
  page.evaluate(
    ([sel, keys]) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const cs = getComputedStyle(el)
      return Object.fromEntries(keys.map((key) => [key, cs[key]]))
    },
    [selector, props],
  )

const rows = []
const compare = async (name, selectors, props, tolerate = []) => {
  const [a, b] = await Promise.all([
    read(mock, selectors[0], props),
    read(live, selectors[1], props),
  ])
  if (!a || !b) {
    rows.push({ name, ok: false, note: `не найден ${!a ? 'в мокапе' : 'на витрине'}` })
    return
  }
  const diff = props.filter((key) => a[key] !== b[key] && !tolerate.includes(key))
  rows.push({
    name,
    ok: diff.length === 0,
    note: diff.length ? diff.map((key) => `${key}: мокап ${a[key]} ≠ ${b[key]}`).join('; ') : '',
  })
}

await compare(
  'шапка — фон и нижняя граница',
  ['header', 'header'],
  ['backgroundColor', 'borderBottomWidth', 'borderBottomColor'],
)

await compare(
  'ссылка меню — размер, трекинг, цвет, регистр',
  ['.nav a', 'header nav a'],
  ['fontSize', 'letterSpacing', 'color', 'textTransform'],
)

await compare(
  'фото-зона карточки — фон и высота',
  ['.card > div:first-child', 'article > a > div:first-child'],
  ['backgroundColor', 'height'],
)

await compare(
  'рамка карточки',
  ['.card', 'article'],
  ['borderTopWidth', 'borderTopColor', 'boxShadow'],
)

await compare(
  'бренд в карточке',
  // .tracking-label, а не просто «первый span» — с фазы 4.5 первым span-ом
  // в карточке иногда идёт бейдж скидки (.tracking-display), если товар
  // с максимальной скидкой попал в начало выдачи.
  ['.card div[style*="letter-spacing:.2em"]', 'article span.tracking-label'],
  ['fontSize', 'letterSpacing', 'color'],
)

await compare(
  'чип объёма',
  ['.chip', 'article .border-line'],
  ['fontSize', 'color', 'borderTopColor'],
)

await compare('футер — фон', ['footer', 'footer'], ['backgroundColor'])

await compare(
  'ссылка футера',
  ['.flink', 'footer nav a, footer a[href*="/catalog"]'],
  ['fontSize', 'color'],
)

await browser.close()

for (const row of rows)
  console.log(`${row.ok ? '✔' : '✘'} ${row.name}${row.note ? ` — ${row.note}` : ''}`)
const failed = rows.filter((row) => !row.ok)
console.log(`\nСверка с мокапом: ${rows.length - failed.length}/${rows.length}`)
process.exit(failed.length ? 1 : 0)
