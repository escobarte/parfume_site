import { chromium } from '@playwright/test'

/**
 * Проверка интерактива по адресу в локальной сети (не localhost).
 * Запуск: node scripts/check-lan.mjs http://<ip>:3000
 * Именно этот сценарий ломался без allowedDevOrigins: страница отдавалась,
 * но ни один клиентский островок не оживал.
 */
const BASE = process.argv[2] ?? 'http://localhost:3000'
const results = []
const check = (name, ok, note = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✔' : '✘'} ${name}${note ? ` — ${note}` : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const blocked = []
page.on(
  'response',
  (r) => r.status() >= 400 && blocked.push(`${r.status()} ${r.url().slice(0, 90)}`),
)
page.on('console', (m) => m.type() === 'error' && blocked.push(`console: ${m.text().slice(0, 90)}`))

const goto = async (path) => {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  await page.locator('footer').first().waitFor({ timeout: 20000 })
}
const cards = () => page.locator('article a[href*="/product/"]')

// ── Фильтр ────────────────────────────────────────────────────────────────
await goto('/ro/catalog')
const before = await cards().count()
await page.getByRole('checkbox').first().check()
let filtered = before
try {
  await page.waitForFunction(
    (n) => document.querySelectorAll('article a[href*="/product/"]').length !== n,
    before,
    { timeout: 8000 },
  )
  filtered = await cards().count()
} catch {
  /* выдача не изменилась — интерактив мёртв */
}
check(
  'смена фильтра меняет выдачу',
  filtered !== before && page.url().includes('brand='),
  `${before} → ${filtered}, ${new URL(page.url()).search || 'URL не изменился'}`,
)

// ── Смена локали ──────────────────────────────────────────────────────────
await goto('/ro/catalog')
await page.getByRole('button', { name: 'ru', exact: true }).first().click()
let switched = false
try {
  await page.waitForURL(/\/ru\//, { timeout: 8000 })
  switched = true
} catch {
  /* переключатель не сработал */
}
check('переключатель языка работает', switched, new URL(page.url()).pathname)

// ── Переключение объёма ───────────────────────────────────────────────────
await goto('/ro/product/maison-orphee-signature-wood')
const price = page.locator('span.text-display').first()
const priceBefore = await price.innerText()
await page.getByRole('button', { name: '30 ml' }).first().click()
await page.waitForTimeout(400)
const priceAfter = await price.innerText()
check(
  'переключение объёма меняет цену',
  priceBefore !== priceAfter,
  `${priceBefore} → ${priceAfter}`,
)

check('нет заблокированных запросов', blocked.length === 0, blocked.slice(0, 2).join(' | '))

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${BASE}: ${results.length - failed.length}/${results.length} пройдено`)
process.exit(failed.length ? 1 : 0)
