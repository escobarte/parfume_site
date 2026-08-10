import { chromium } from '@playwright/test'
import { readFileSync } from 'fs'

/**
 * Скидки, промо-баннер и акционный hero (PLAN.md §4.5).
 * Запуск: node scripts/check-promo.mjs
 *
 * Даты баннера/hero проверяются через Local-эквивалент — REST-запросы
 * админа к /api/globals/*, теми же PATCH, что делает владелец в /admin.
 * Между PATCH и проверкой всегда два запроса подряд («прогрев» + чтение):
 * revalidateTag после правки глобала иногда отдаёт ещё не обновлённый кэш
 * на первый запрос (см. заметку в CHANGELOG) — второй запрос уже свежий.
 */
const BASE = process.env.SHOT_BASE ?? 'http://localhost:3000'
const results = []
const check = (name, ok, note = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✔' : '✘'} ${name}${note ? ` — ${note}` : ''}`)
}

const env = readFileSync('.env', 'utf8')
const email = env.match(/^SEED_ADMIN_EMAIL=(.*)$/m)[1]
const password = env.match(/^SEED_ADMIN_PASSWORD=(.*)$/m)[1]

const login = await fetch(`${BASE}/api/users/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
const { token } = await login.json()
const auth = { Authorization: `JWT ${token}`, 'Content-Type': 'application/json' }

const patchGlobal = (slug, locale, data) =>
  fetch(`${BASE}/api/globals/${slug}?locale=${locale}`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify(data),
  })

/** «Прогрев» кэша после правки: см. комментарий в шапке файла. */
const settle = async (path) => {
  await fetch(`${BASE}${path}`)
  await new Promise((resolve) => setTimeout(resolve, 300))
  const response = await fetch(`${BASE}${path}`)
  return response.text()
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Скидка: бейдж, зачёркнутая цена, пересчёт при смене объёма
// ═══════════════════════════════════════════════════════════════════════
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const goto = async (path) => {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  await page.locator('footer').first().waitFor({ timeout: 20000 })
}

await goto('/ro/catalog')
const saleCard = page
  .locator('article')
  .filter({ has: page.locator('a[href*="maison-orphee-amber-sale"]') })
const cardBadge = await saleCard
  .locator('span', { hasText: /^−\d+%$/ })
  .first()
  .innerText()
  .catch(() => null)
check(
  'бейдж на карточке — максимальный % среди активных вариантов',
  cardBadge === '−33%',
  `бейдж «${cardBadge}» (5 ml −20%, 30 ml −33%, 10 ml без скидки)`,
)

const badgeStyle = await saleCard
  .locator('span', { hasText: /^−\d+%$/ })
  .first()
  .evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      bg: cs.backgroundColor,
      color: cs.color,
      shadow: cs.boxShadow,
      border: cs.borderTopWidth,
    }
  })
check(
  'стиль бейджа: navy/cream, без тени и рамки',
  badgeStyle.bg === 'rgb(22, 41, 61)' &&
    badgeStyle.color === 'rgb(232, 207, 176)' &&
    badgeStyle.shadow === 'none' &&
    badgeStyle.border === '0px',
  JSON.stringify(badgeStyle),
)

const cardText = await saleCard.innerText()
check(
  'на карточке зачёркнута старая цена самого дешёвого варианта (250, а не 1200)',
  cardText.includes('250') && !cardText.includes('1.200') && !cardText.includes('1200'),
)

await goto('/ro/product/maison-orphee-amber-sale')
const readVariantState = async () => ({
  price: await page.locator('span.text-display').first().innerText(),
  badge: await page
    .locator('span', { hasText: /^−\d+%$/ })
    .first()
    .innerText()
    .catch(() => null),
})
const at5ml = await readVariantState()
await page.getByRole('button', { name: '10 ml' }).click()
await page.waitForTimeout(400)
const at10ml = await readVariantState()
await page.getByRole('button', { name: '30 ml' }).click()
await page.waitForTimeout(400)
const at30ml = await readVariantState()

check('страница товара, 5 ml: −20%', at5ml.badge === '−20%', at5ml.badge)
check(
  'страница товара, 10 ml без скидки: бейджа нет',
  at10ml.badge === null,
  `badge=${at10ml.badge}`,
)
check(
  'страница товара, 30 ml: −33%, цена пересчитана',
  at30ml.badge === '−33%' && at30ml.price !== at5ml.price,
)

// ═══════════════════════════════════════════════════════════════════════
// 2. Фильтр «со скидкой» + сортировка «по скидке»
// ═══════════════════════════════════════════════════════════════════════
await goto('/ro/catalog')
const totalAll = await page.locator('article a[href*="/product/"]').count()
const discountRow = page.locator('aside label').filter({ hasText: /^Cu reducere/ })
const counterText = await discountRow.first().innerText()
await discountRow.first().locator('input').check()
await page.waitForFunction(
  (n) => document.querySelectorAll('article a[href*="/product/"]').length !== n,
  totalAll,
  { timeout: 8000 },
)
const filtered = await page.locator('article a[href*="/product/"]').count()
check(
  'фильтр «со скидкой» сужает выдачу и счётчик совпадает',
  filtered > 0 && filtered < totalAll && counterText.includes(String(filtered)),
  `${totalAll} → ${filtered}, счётчик «${counterText}»`,
)
check('состояние фильтра ушло в URL', page.url().includes('flags=hasDiscount'))

await goto('/ro/catalog?sort=discount')
const titlesByDiscount = await page.locator('article h3').allInnerTexts()
check(
  'сортировка «по скидке» ставит максимальную скидку первой',
  titlesByDiscount[0] === 'Amber Sale',
  titlesByDiscount.slice(0, 3).join(', '),
)

// ═══════════════════════════════════════════════════════════════════════
// 3. Промо-баннер: видимость по датам
// ═══════════════════════════════════════════════════════════════════════
const BANNER_TEXT = 'Проверка баннера — самопроверка фазы 4.5'

await patchGlobal('settings', 'ru', {
  promoBanner: {
    enabled: true,
    text: BANNER_TEXT,
    linkLabel: 'Подробнее',
    linkHref: '/delivery',
    startDate: '2099-01-01T00:00:00.000Z',
    endDate: null,
  },
})
let html = await settle('/ru/catalog')
check('баннер скрыт до startDate', !html.includes(BANNER_TEXT))

await patchGlobal('settings', 'ru', {
  promoBanner: { startDate: '2020-01-01T00:00:00.000Z', endDate: '2099-01-01T00:00:00.000Z' },
})
html = await settle('/ru/catalog')
check('баннер виден внутри интервала', html.includes(BANNER_TEXT))
check(
  'стиль баннера: фон cream, текст navy, uppercase, трекинг ~.14em',
  /bg-cream[^"]*"[^>]*>\s*<p class="text-navy text-eyebrow tracking-display uppercase"/.test(
    html,
  ) ||
    (html.includes('bg-cream') && html.includes('text-navy') && html.includes('tracking-display')),
)
check('ссылка баннера ведёт на /ru/delivery', html.includes('href="/ru/delivery"'))

await patchGlobal('settings', 'ru', {
  promoBanner: { startDate: '2020-01-01T00:00:00.000Z', endDate: '2020-02-01T00:00:00.000Z' },
})
html = await settle('/ru/catalog')
check('баннер скрыт после endDate', !html.includes(BANNER_TEXT))

// Снова включаем в интервале для проверки закрытия и sticky-шапки.
await patchGlobal('settings', 'ru', {
  promoBanner: { startDate: '2020-01-01T00:00:00.000Z', endDate: '2099-01-01T00:00:00.000Z' },
})
await settle('/ru/catalog')

const bannerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const bannerPage = await bannerContext.newPage()
await bannerPage.goto(`${BASE}/ru/catalog`, { waitUntil: 'domcontentloaded' })
await bannerPage.locator('footer').first().waitFor({ timeout: 20000 })

const bannerVisible = () => bannerPage.getByText(BANNER_TEXT).count()
check('баннер отрисован в новой сессии', (await bannerVisible()) > 0)

await bannerPage.getByRole('button', { name: /закрыть/i }).click()
await bannerPage.waitForTimeout(200)
check('крестик закрывает баннер', (await bannerVisible()) === 0)

await bannerPage.reload({ waitUntil: 'domcontentloaded' })
await bannerPage.locator('footer').first().waitFor({ timeout: 20000 })
await bannerPage.waitForTimeout(400)
check('закрытие помнится в той же сессии после перезагрузки', (await bannerVisible()) === 0)

const freshContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const freshPage = await freshContext.newPage()
await freshPage.goto(`${BASE}/ru/catalog`, { waitUntil: 'domcontentloaded' })
await freshPage.locator('footer').first().waitFor({ timeout: 20000 })
check(
  'в новой сессии баннер снова виден (не localStorage)',
  (await freshPage.getByText(BANNER_TEXT).count()) > 0,
)

// Sticky-шапка и её сжатие не ломаются баннером над ней.
const headerBefore = await freshPage.locator('header').boundingBox()
await freshPage.evaluate(() => window.scrollTo(0, 800))
await freshPage.waitForTimeout(300)
const headerAfter = await freshPage.locator('header').boundingBox()
check(
  'sticky-шапка компактнее после скролла (с баннером над ней)',
  headerAfter.height < headerBefore.height && headerAfter.y === 0,
  `${Math.round(headerBefore.height)}px → ${Math.round(headerAfter.height)}px, y=${headerAfter.y}`,
)
const mobileContext = await browser.newContext({ viewport: { width: 360, height: 780 } })
const mobilePage = await mobileContext.newPage()
await mobilePage.goto(`${BASE}/ru/catalog`, { waitUntil: 'domcontentloaded' })
await mobilePage.locator('footer').first().waitFor({ timeout: 20000 })
await mobilePage.locator('button[aria-label="Меню"]').click()
await mobilePage.waitForTimeout(200)
check(
  'мобильное меню открывается как обычно, с баннером над шапкой',
  (await mobilePage.locator('nav a', { hasText: /каталог/i }).count()) > 0,
)
await bannerContext.close()
await freshContext.close()
await mobileContext.close()

// Возвращаем баннер в выключенное состояние — таким его оставил seed.
await patchGlobal('settings', 'ru', {
  promoBanner: {
    enabled: false,
    text: 'Бесплатная доставка при заказе от 500 MDL',
    linkLabel: 'Подробнее',
    linkHref: '/delivery',
    startDate: null,
    endDate: null,
  },
})

// ═══════════════════════════════════════════════════════════════════════
// 4. Акционный hero: подмена по датам, без слайдера, SSR
// ═══════════════════════════════════════════════════════════════════════
const NORMAL_TITLE = 'Find your signature.'
const PROMO_TITLE = 'Vânzare de vară.'

await patchGlobal('homepage', 'ro', {
  promoHero: { enabled: true, startDate: '2099-01-01T00:00:00.000Z', endDate: null },
})
html = await settle('/ro')
check(
  'до начала акции — обычный hero (чистый SSR, без JS)',
  html.includes(NORMAL_TITLE) && !html.includes(PROMO_TITLE),
)

await patchGlobal('homepage', 'ro', {
  promoHero: { startDate: '2020-01-01T00:00:00.000Z', endDate: '2099-01-01T00:00:00.000Z' },
})
html = await settle('/ro')
check(
  'внутри интервала — акционный hero целиком (чистый SSR, без JS)',
  html.includes(PROMO_TITLE) && !html.includes(NORMAL_TITLE),
)
check(
  'CTA акционного hero ведёт в каталог с фильтром «со скидкой»',
  html.includes('href="/ro/catalog?flags=hasDiscount"'),
)

await patchGlobal('homepage', 'ro', {
  promoHero: { startDate: '2020-01-01T00:00:00.000Z', endDate: '2020-02-01T00:00:00.000Z' },
})
html = await settle('/ro')
check(
  'после endDate — обычный hero возвращается сам',
  html.includes(NORMAL_TITLE) && !html.includes(PROMO_TITLE),
)

await patchGlobal('homepage', 'ro', {
  promoHero: {
    enabled: false,
    startDate: '2020-01-01T00:00:00.000Z',
    endDate: '2099-01-01T00:00:00.000Z',
  },
})
html = await settle('/ro')
check('enabled=false побеждает даже внутри интервала дат', html.includes(NORMAL_TITLE))

// Композиция и типографика одинаковы у обеих версий — проверяем на активной.
await patchGlobal('homepage', 'ro', {
  promoHero: {
    enabled: true,
    startDate: '2020-01-01T00:00:00.000Z',
    endDate: '2099-01-01T00:00:00.000Z',
  },
})
await settle('/ro')
await page.goto(`${BASE}/ro`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(300)
const heroStyle = await page.evaluate(() => {
  const h1 = document.querySelector('h1')
  const cs = getComputedStyle(h1)
  return {
    fontSize: cs.fontSize,
    tracking: cs.letterSpacing,
    transform: cs.textTransform,
    color: cs.color,
  }
})
check(
  'типографика акционного hero совпадает с обычным (те же классы §1)',
  heroStyle.fontSize === '40px' &&
    heroStyle.transform === 'uppercase' &&
    heroStyle.color === 'rgb(232, 207, 176)',
  JSON.stringify(heroStyle),
)

// Возвращаем hero в выключенное состояние — таким его оставил seed.
for (const locale of ['ro', 'ru', 'en']) {
  await patchGlobal('homepage', locale, {
    promoHero: { enabled: false, startDate: null, endDate: null },
  })
}

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\nИтог: ${results.length - failed.length}/${results.length} пройдено`)
process.exit(failed.length ? 1 : 0)
