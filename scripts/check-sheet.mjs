import { chromium } from '@playwright/test'

/**
 * Мобильная шторка фильтров: поведение «Назад», один заголовок, счётчики чипов.
 * Запуск: node scripts/check-sheet.mjs
 */
const BASE = process.env.SHOT_BASE ?? 'http://localhost:3000'
const results = []
const check = (name, ok, note = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✔' : '✘'} ${name}${note ? ` — ${note}` : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 360, height: 780 } })

const goto = async (path) => {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  await page.locator('footer').first().waitFor({ timeout: 20000 })
}
const sheet = () => page.locator('div.fixed.inset-0').first()
// У кнопки открытия при активных фильтрах в имени появляется счётчик,
// поэтому цепляемся за неё по позиции в разметке, а не по точному тексту.
const openSheet = async () => {
  await page
    .locator('button.lg\\:hidden')
    .filter({ hasText: /filtre/i })
    .first()
    .click()
  await sheet().waitFor({ timeout: 5000 })
}
const sheetVisible = async () => (await sheet().count()) > 0

// ── Заголовки ─────────────────────────────────────────────────────────────
await goto('/ro/catalog')
await openSheet()
const titles = await sheet()
  .getByText(/^filtre$/i)
  .count()
check('в шторке ровно один заголовок «FILTRE»', titles === 1, `найдено ${titles}`)
check(
  '«RESETEAZĂ TOT» в шапке шторки один раз',
  (await page.getByRole('button', { name: /resetează tot/i }).count()) === 1,
)

// ── Счётчик объёма отделён от подписи ─────────────────────────────────────
const chip = page
  .locator('button')
  .filter({ hasText: /^\d+ ml\s*\(\d+\)$/ })
  .first()
const chipInfo = await chip.evaluate((el) => {
  const counter = el.querySelector('span')
  return {
    text: el.textContent?.trim(),
    counterText: counter?.textContent?.trim(),
    counterColor: counter ? getComputedStyle(counter).color : null,
    labelColor: getComputedStyle(el).color,
    marginLeft: counter ? getComputedStyle(counter).marginLeft : null,
  }
})
check(
  'счётчик объёма отделён от подписи',
  /\(\d+\)/.test(chipInfo.counterText ?? '') &&
    chipInfo.counterColor !== chipInfo.labelColor &&
    parseFloat(chipInfo.marginLeft ?? '0') > 0,
  `«${chipInfo.text}» · счётчик ${chipInfo.counterColor} vs подпись ${chipInfo.labelColor}, отступ ${chipInfo.marginLeft}`,
)

// ── «Назад» закрывает только шторку ───────────────────────────────────────
await goto('/ro/catalog?brand=casa-lumina')
const urlBefore = page.url()
await openSheet()
await page.goBack()
await page.waitForTimeout(500)
check('«Назад» при открытой шторке закрывает её', !(await sheetVisible()))
check(
  'после закрытия остались на той же странице и с теми же фильтрами',
  page.url() === urlBefore,
  new URL(page.url()).pathname + new URL(page.url()).search,
)

// ── При закрытой шторке «Назад» уводит со страницы ────────────────────────
await goto('/ro/catalog')
await goto('/ro/catalog?brand=nord-atelier')
await page.goBack()
await page.waitForTimeout(600)
check(
  '«Назад» при закрытой шторке уводит по истории',
  !page.url().includes('brand=nord-atelier'),
  new URL(page.url()).search || '(без фильтров)',
)

// ── История не копится: открыть/закрыть N раз ─────────────────────────────
await goto('/ro/catalog')
const lengthBefore = await page.evaluate(() => history.length)
for (let i = 0; i < 3; i += 1) {
  await openSheet()
  await page.getByRole('button', { name: /arată rezultatele/i }).click()
  await page.waitForTimeout(350)
}
const lengthAfter = await page.evaluate(() => history.length)
check(
  'история не растёт от открытия/закрытия шторки',
  lengthAfter === lengthBefore,
  `${lengthBefore} → ${lengthAfter}`,
)
check('после «Применить» шторка закрыта', !(await sheetVisible()))

// ── Фильтр внутри шторки не копит историю и работает ──────────────────────
await goto('/ro/catalog')
await openSheet()
// Историю меряем от момента, когда шторка уже открыта: правки фильтров внутри
// неё идут через replace и не должны добавлять ни одной записи.
const beforeFilter = await page.evaluate(() => history.length)
await page.getByRole('checkbox').first().check()
await page.waitForTimeout(1200)
const afterFilter = await page.evaluate(() => history.length)
check(
  'фильтр в шторке применяется и не добавляет записей истории',
  page.url().includes('brand=') && afterFilter === beforeFilter,
  `${new URL(page.url()).search}, история ${beforeFilter} → ${afterFilter}`,
)
await page.goBack()
await page.waitForTimeout(1500)
check(
  '«Назад» после правки фильтра закрывает шторку, а фильтр остаётся',
  !(await sheetVisible()) && page.url().includes('brand='),
  new URL(page.url()).search,
)

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\nИтог: ${results.length - failed.length}/${results.length} пройдено`)
process.exit(failed.length ? 1 : 0)
