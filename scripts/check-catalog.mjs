import { chromium } from '@playwright/test'

/**
 * Функциональная самопроверка витрины фазы 3. Запуск: node scripts/check-catalog.mjs
 * Проверяет ровно те пункты, что перечислены в PLAN.md §5 как ✔-критерии.
 */
const BASE = process.env.SHOT_BASE ?? 'http://localhost:3000'
const results = []
const check = (name, ok, note = '') => {
  results.push({ name, ok, note })
  console.log(`${ok ? '✔' : '✘'} ${name}${note ? ` — ${note}` : ''}`)
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const errors = []
context.on('page', (page) => {
  page.on('console', (m) => m.type() === 'error' && errors.push(`${page.url()}: ${m.text()}`))
  page.on('pageerror', (e) => errors.push(`${page.url()}: ${e}`))
})
const page = await context.newPage()
// networkidle на прод-сборке не наступает (Next держит соединение), поэтому
// ждём появления разметки, а не «тишины в сети».
const goto = async (target, tab = page) => {
  await tab.goto(target, { waitUntil: 'domcontentloaded' })
  await tab.locator('footer').first().waitFor({ timeout: 20000 })
}
const cards = () => page.locator('article a[href*="/product/"]')

/** nuqs обновляет выдачу через RSC-навигацию: networkidle срабатывает раньше,
 *  чем приходит новая разметка, поэтому ждём именно изменения числа карточек. */
const waitForCards = async (previous) => {
  await page.waitForFunction(
    (before) => document.querySelectorAll('article a[href*="/product/"]').length !== before,
    previous,
    { timeout: 10000 },
  )
  return cards().count()
}

// ── Фильтры: выбор бренда меняет выдачу и URL ─────────────────────────────
await goto(`${BASE}/ro/catalog`)
const totalAll = await cards().count()

await page.getByRole('checkbox').first().check()
const filtered = await waitForCards(totalAll)
const url = page.url()
check(
  'фильтр по бренду сужает выдачу',
  filtered > 0 && filtered < totalAll,
  `${totalAll} → ${filtered}`,
)
check('состояние фильтра ушло в URL', url.includes('brand='), new URL(url).search)

// ── Ссылка воспроизводит состояние в новой вкладке ────────────────────────
const shared = await context.newPage()
await goto(url, shared)
const sharedCount = await shared.locator('article a[href*="/product/"]').count()
const sharedChecked = await shared.getByRole('checkbox').first().isChecked()
check(
  'ссылка с фильтром открывается тем же экраном',
  sharedCount === filtered && sharedChecked,
  `карточек ${sharedCount}, чекбокс ${sharedChecked ? 'отмечен' : 'снят'}`,
)
await shared.close()

// ── Счётчик фасета совпадает с выдачей ────────────────────────────────────
await goto(`${BASE}/ro/catalog`)
const firstRow = page.locator('aside label').first()
const facetCount = Number((await firstRow.locator('span.tabular-nums').innerText()).trim())
await firstRow.locator('input').check()
const facetShown = await waitForCards(totalAll)
check(
  'счётчик фасета честный',
  facetShown === facetCount,
  `счётчик ${facetCount}, карточек ${facetShown}`,
)

// ── Комбинация трёх фильтров ──────────────────────────────────────────────
await goto(`${BASE}/ro/catalog?brand=maison-orphee&gender=unisex&volume=30`)
const comboCount = await cards().count()
const comboOk = comboCount > 0 && comboCount <= totalAll
check('комбинация 3 фильтров даёт корректную выдачу', comboOk, `${comboCount} шт`)

// ── Сброс фильтров ────────────────────────────────────────────────────────
await page
  .getByRole('button', { name: /resetează tot/i })
  .first()
  .click()
const afterReset = await waitForCards(comboCount)
check('сброс возвращает полную выдачу', afterReset === totalAll, `${afterReset} из ${totalAll}`)

// ── Сортировка по цене ────────────────────────────────────────────────────
const priceOf = async () =>
  (await page.locator('article').allInnerTexts()).map((text) => {
    const match = text.match(/(\d[\d\s]*)\s*MDL/)
    return match ? Number(match[1].replace(/\s/g, '')) : 0
  })
await goto(`${BASE}/ro/catalog?sort=priceAsc`)
const asc = await priceOf()
await goto(`${BASE}/ro/catalog?sort=priceDesc`)
const desc = await priceOf()
check(
  'сортировка по цене работает в обе стороны',
  asc.every((v, i) => i === 0 || asc[i - 1] <= v) &&
    desc.every((v, i) => i === 0 || desc[i - 1] >= v),
  `${asc[0]}…${asc.at(-1)} / ${desc[0]}…${desc.at(-1)}`,
)
check('сортировка не теряет товары', asc.length === totalAll && desc.length === totalAll)

// ── Карточка товара: переключение объёма ──────────────────────────────────
await goto(`${BASE}/ro/product/maison-orphee-signature-wood`)
const priceNode = page.locator('span.text-display').first()
const skuNode = page.getByText(/COD:/i).first()
const before = { price: await priceNode.innerText(), sku: await skuNode.innerText() }
await page.getByRole('button', { name: '30 ml' }).first().click()
await page.waitForTimeout(150)
const after = { price: await priceNode.innerText(), sku: await skuNode.innerText() }
check(
  'переключение объёма меняет цену без перезагрузки',
  before.price !== after.price,
  `${before.price} → ${after.price}`,
)
check('переключение объёма меняет SKU', before.sku !== after.sku, `${before.sku} → ${after.sku}`)

// ── Вариант без остатка недоступен ────────────────────────────────────────
await goto(`${BASE}/ro/product/maison-orphee-nuit-ambree`)
const soldOut = page.getByRole('button', { name: '30 ml' }).first()
check('вариант с нулевым остатком заблокирован', await soldOut.isDisabled())

// ── Похожие не содержат сам товар ─────────────────────────────────────────
const similarHrefs = await page
  .locator('section a[href*="/product/"]')
  .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')))
check(
  'похожие не включают сам товар',
  !similarHrefs.some((href) => href?.includes('maison-orphee-nuit-ambree')),
  `${similarHrefs.length} ссылок`,
)

// ── Корзина ───────────────────────────────────────────────────────────────
await goto(`${BASE}/ro/product/maison-orphee-signature-wood`)
// В dev клик до окончания гидрации теряется — жмём, пока корзина не наполнится.
let addedToCart = false
for (let attempt = 0; attempt < 5 && !addedToCart; attempt += 1) {
  await page.getByRole('button', { name: /adaugă în coș/i }).click()
  addedToCart = await page
    .waitForFunction(() => Boolean(localStorage.getItem('mf-cart')?.includes('MO-SW')), {
      timeout: 3000,
    })
    .then(() => true)
    .catch(() => false)
}
// Счётчик живёт на кнопке мини-корзины в шапке (раньше это была ссылка).
const badge = await page
  .locator('header button[aria-label="Coș"] span')
  .first()
  .innerText()
  .catch(() => '')
check(
  'кнопка «в корзину» наполняет счётчик шапки',
  addedToCart && badge === '1',
  `бейдж «${badge}»`,
)

// ── Поиск ─────────────────────────────────────────────────────────────────
await goto(`${BASE}/ro/search?q=cedar`)
check(
  'страница поиска отдаёт результаты',
  (await cards().count()) > 0,
  `${await cards().count()} шт`,
)
await goto(`${BASE}/ro/search?q=zzzqqq`)
check(
  'пустой поиск — нормальное состояние, а не ошибка',
  (await page.getByText(/niciun parfum/i).count()) > 0,
)

// ── Автодополнение ────────────────────────────────────────────────────────
await goto(`${BASE}/ro/catalog`)
await page
  .getByRole('button', { name: /căutare/i })
  .first()
  .click()
const input = page.locator('input[type="search"]').first()
const dropdown = page.locator('header div.absolute a')
await input.fill('sig')
const started = Date.now()
await dropdown.first().waitFor({ timeout: 5000 })
check('автодополнение отвечает', (await dropdown.count()) > 0, `${Date.now() - started} мс`)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
check('Esc закрывает подсказки', (await dropdown.count()) === 0)

// ── Три локали ────────────────────────────────────────────────────────────
for (const [locale, marker] of [
  ['ro', 'CATALOG'],
  ['ru', 'КАТАЛОГ'],
  ['en', 'CATALOG'],
]) {
  await goto(`${BASE}/${locale}/catalog`)
  const heading = (await page.locator('h1').first().innerText()).toUpperCase()
  check(`каталог на /${locale}`, heading.includes(marker), heading)
}

// ── Переключатель локали сохраняет путь и фильтры ─────────────────────────
await goto(`${BASE}/ro/catalog?brand=nord-atelier`)
await page.getByRole('button', { name: 'ru', exact: true }).first().click()
await page.waitForURL(/\/ru\/catalog/, { timeout: 10000 })
check(
  'переключатель локали сохраняет путь и фильтры',
  page.url().includes('/ru/catalog') && page.url().includes('brand=nord-atelier'),
  new URL(page.url()).pathname + new URL(page.url()).search,
)

check('console без ошибок', errors.length === 0, errors.slice(0, 2).join(' | '))

await browser.close()

const failed = results.filter((result) => !result.ok)
console.log(`\nИтог: ${results.length - failed.length}/${results.length} пройдено`)
process.exit(failed.length ? 1 : 0)
