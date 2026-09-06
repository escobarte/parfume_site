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
// 1. Скидка на карточке — новая логика цены товара: карточка показывает
//    МАКСИМАЛЬНУЮ цену среди активных вариантов, без диапазона/«от».
//    Скидка теперь на ВСЕ активные варианты сразу или ни на один (validate
//    в Products.ts) — цена/бейдж/oldPrice всегда об одном и том же
//    максимальном по цене варианте, «лучший уценённый» больше не ищется
//    отдельно. Зачёркнутая цена — СЛЕВА от актуальной.
// ═══════════════════════════════════════════════════════════════════════
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const goto = async (path) => {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  await page.locator('footer').first().waitFor({ timeout: 20000 })
}

await goto('/ro/catalog')

// Amber Sale: скидка на ВСЕ 3 варианта — 5ml −20% (200/250), 10ml −16%
// (380/450), Full Size −33% (800/1200). Full Size — максимальная цена
// среди вариантов, карточка обязана показать именно его целиком.
const saleCard = page
  .locator('article')
  .filter({ has: page.locator('a[href*="maison-orphee-amber-sale"]') })
const cardBadge = await saleCard
  .locator('span', { hasText: /^−\d+%$/ })
  .first()
  .innerText()
  .catch(() => null)
check(
  'Amber Sale: бейдж — процент варианта с максимальной ценой (Full Size, −33%)',
  cardBadge === '−33%',
  `бейдж «${cardBadge}» (5ml −20%, 10ml −16%, Full Size −33%)`,
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

// Читаем зачёркнутую цену и «остаток» текста отдельно — простой includes()
// на конкатенированной строке ловит ложные совпадения («1.200» уже
// содержит «200» как подстроку), поэтому вычитаем текст зачёркнутого
// узла из полной строки перед проверкой актуальной цены.
const priceLineParts = async (card) => {
  const full = await card.locator('span.text-body.font-medium').first().innerText()
  const struck = await card
    .locator('span.text-body.font-medium span.line-through')
    .first()
    .innerText()
    .catch(() => null)
  return { full, struck, rest: struck ? full.replace(struck, '') : full }
}

const saleParts = await priceLineParts(saleCard)
check(
  'Amber Sale: слово «от»/«de la» убрано с карточки',
  !/de la|from|от\s/i.test(saleParts.full),
  saleParts.full,
)
check(
  'Amber Sale: показана цена максимального варианта (800), не 5ml (200) и не 10ml (380)',
  saleParts.rest.includes('800') && !saleParts.rest.includes('200') && !saleParts.rest.includes('380'),
  saleParts.full,
)
check(
  'Amber Sale: зачёркнутая старая цена (1.200) — СЛЕВА от актуальной (800)',
  saleParts.struck?.includes('1.200') && saleParts.full.indexOf(saleParts.struck) === 0,
  saleParts.full,
)

// Set Descoperire — оба варианта уценены (3ml −10%, Travel Size −11%).
// Travel Size — максимальная цена среди вариантов, карточка обязана
// показать именно его.
const setCard = page
  .locator('article')
  .filter({ has: page.locator('a[href*="casa-lumina-set-descoperire"]') })
const setBadge = await setCard
  .locator('span', { hasText: /^−\d+%$/ })
  .first()
  .innerText()
  .catch(() => null)
check(
  'Set Descoperire: бейдж −11% (скидка максимального по цене Travel Size, не 3ml)',
  setBadge === '−11%',
  setBadge,
)
const setParts = await priceLineParts(setCard)
check(
  'Set Descoperire: слово «от»/«de la» убрано с карточки',
  !/de la|from|от\s/i.test(setParts.full),
  setParts.full,
)
check(
  'Set Descoperire: показана цена максимального варианта (320), не 3ml (180)',
  setParts.rest.includes('320') && !setParts.rest.includes('180'),
  setParts.full,
)
check(
  'Set Descoperire: зачёркнутая старая цена (360) — СЛЕВА от актуальной (320)',
  setParts.struck?.includes('360') && setParts.full.indexOf(setParts.struck) === 0,
  setParts.full,
)
// Инвариант «бейдж никогда без зачёркнутой цены, и наоборот» — проверяем
// на ВСЕХ карточках каталога разом, а не только на двух известных.
const invariantViolations = await page.locator('article').evaluateAll((articles) =>
  articles
    .map((article) => {
      const hasBadge = !!article.querySelector('span.bg-navy')
      const hasStrike = !!article.querySelector('span.line-through')
      return { hasBadge, hasStrike, ok: hasBadge === hasStrike }
    })
    .filter((row) => !row.ok),
)
check(
  'инвариант «бейдж без зачёркнутой цены невозможен, и наоборот» — по всему каталогу',
  invariantViolations.length === 0,
  `нарушений: ${invariantViolations.length}`,
)

await goto('/ro/product/maison-orphee-amber-sale')
// Порядок в BuyBlock.tsx — зачёркнутая цена (line-through) СЛЕВА от
// актуальной (text-display) в разметке, читаем оба отдельными локаторами.
const readVariantState = async () => ({
  price: await page.locator('span.text-display').first().innerText(),
  oldPrice: await page
    .locator('span.line-through')
    .first()
    .innerText()
    .catch(() => null),
  badge: await page
    .locator('span', { hasText: /^−\d+%$/ })
    .first()
    .innerText()
    .catch(() => null),
})
// В dev клик до окончания гидрации иногда теряется (см. GOTCHAS.md) —
// повторяем клик, пока бейдж не станет ожидаемым, вместо одного клика
// с фиксированной паузой.
const clickVolumeAndWait = async (name, expectedBadge) => {
  let state = null
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.getByRole('button', { name, exact: true }).click()
    await page.waitForTimeout(400)
    state = await readVariantState()
    if (state.badge === expectedBadge) break
  }
  return state
}

const at5ml = await readVariantState()
const at10ml = await clickVolumeAndWait('10ml', '−16%')
const atFullSize = await clickVolumeAndWait('Full Size', '−33%')

// Все три варианта теперь уценены (единое правило скидки, промпт «новая
// логика цены товара») — раньше 10ml был без скидки, это была ровно та
// «выборочная скидка по вариантам», которую задание требует исключить.
check('страница товара, 5ml: −20%', at5ml.badge === '−20%', at5ml.badge)
check('страница товара, 10ml: −16% (тоже уценён — правило «все или ничего»)', at10ml.badge === '−16%', at10ml.badge)
check(
  'страница товара, Full Size: −33%, цена пересчитана',
  atFullSize.badge === '−33%' && atFullSize.price !== at5ml.price,
)
const priceOrder = await page.evaluate(() => {
  const strike = document.querySelector('span.line-through')
  const price = document.querySelector('span.text-display')
  if (!strike || !price) return null
  // DOCUMENT_POSITION_FOLLOWING (4) на price относительно strike значит
  // strike идёт раньше price в разметке — то есть слева при обычном ЛТР-потоке.
  return Boolean(strike.compareDocumentPosition(price) & Node.DOCUMENT_POSITION_FOLLOWING)
})
check(
  'страница товара: зачёркнутая цена стоит в разметке РАНЬШЕ актуальной (слева)',
  priceOrder === true,
  `oldPrice=${at5ml.oldPrice}, price=${at5ml.price}`,
)

// ═══════════════════════════════════════════════════════════════════════
// 2. Фасета «Sale» не задвоена + фильтр «со скидкой» + сортировка «по скидке»
// ═══════════════════════════════════════════════════════════════════════
await goto('/ro/catalog')
const totalAll = await page.locator('article a[href*="/product/"]').count()
const discountRow = page.locator('aside label').filter({ hasText: /^Sale/ })
check(
  'ручной тег «Sale» удалён — фасета «Sale» ровно одна (авто-hasDiscount, без задвоения)',
  (await discountRow.count()) === 1,
  `найдено фасет с меткой «Sale»: ${await discountRow.count()}`,
)
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
    linkTarget: 'delivery',
    linkTargetOverride: null,
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
// Ищем ссылку конкретно внутри полосы баннера, а не по всей странице: у
// футера есть свой, не связанный с баннером, пункт «Доставка» → /ru/delivery,
// сравнение по всей странице давало бы ложное совпадение в обе стороны.
const bannerFragment = (currentHtml) => {
  const anchor = currentHtml.indexOf(BANNER_TEXT.slice(0, 10))
  return currentHtml.slice(anchor - 200, anchor + 400)
}
check(
  'select linkTarget=delivery даёт корректный локализованный URL /ru/delivery',
  bannerFragment(html).includes('href="/ru/delivery"'),
  bannerFragment(html),
)

// Override должен побеждать выбор из select, даже если target заполнен.
// Значение override — без префикса локали (как раньше был linkHref);
// префикс добавляет <Link> из '@/i18n/navigation'.
await patchGlobal('settings', 'ru', {
  promoBanner: { linkTarget: 'delivery', linkTargetOverride: '/catalog?flags=isNew' },
})
html = await settle('/ru/catalog')
check(
  'override-поле ссылки баннера побеждает выбор из select',
  bannerFragment(html).includes('href="/ru/catalog?flags=isNew"') &&
    !bannerFragment(html).includes('href="/ru/delivery"'),
  bannerFragment(html),
)
await patchGlobal('settings', 'ru', {
  promoBanner: { linkTarget: 'delivery', linkTargetOverride: null },
})

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
    linkTarget: 'delivery',
    linkTargetOverride: null,
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
  promoHero: {
    startDate: '2020-01-01T00:00:00.000Z',
    endDate: '2099-01-01T00:00:00.000Z',
    ctaTarget: 'catalogDiscounted',
  },
})
html = await settle('/ro')
check(
  'внутри интервала — акционный hero целиком (чистый SSR, без JS)',
  html.includes(PROMO_TITLE) && !html.includes(NORMAL_TITLE),
)
check(
  'select ctaTarget=catalogDiscounted даёт каталог с фильтром «со скидкой»',
  html.includes('href="/ro/catalog?flags=hasDiscount"'),
)

// Override должен побеждать выбор из select и здесь же — без префикса локали.
await patchGlobal('homepage', 'ro', {
  promoHero: { ctaTarget: 'catalogDiscounted', ctaTargetOverride: '/catalog?flags=isHit' },
})
html = await settle('/ro')
check(
  'override-поле CTA акционного hero побеждает выбор из select',
  html.includes('href="/ro/catalog?flags=isHit"') &&
    !html.includes('href="/ro/catalog?flags=hasDiscount"'),
)
await patchGlobal('homepage', 'ro', {
  promoHero: { ctaTarget: 'catalogDiscounted', ctaTargetOverride: null },
})

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
