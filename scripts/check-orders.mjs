import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'fs'

/**
 * Сквозная проверка заявки (PLAN.md §6.2): корзина → форма → БД → CSV →
 * каналы уведомления. Запуск: node scripts/check-orders.mjs
 */
const BASE = process.env.SHOT_BASE ?? 'http://localhost:3000'
// Лимит сервера (ORDERS_RATE_LIMIT) должен совпадать: проверка отправляет
// на одну заявку больше и ждёт 429. Отклонённые запросы тоже считаются.
const RATE_LIMIT = Number(process.env.ORDERS_RATE_LIMIT ?? 5)
const results = []
const check = (name, ok, note = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✔' : '✘'} ${name}${note ? ` — ${note}` : ''}`)
}

const post = (body) =>
  fetch(`${BASE}/api/order-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const validOrder = (overrides = {}) => ({
  name: 'Тестовый Клиент',
  phone: '+37360123456',
  messenger: 'telegram',
  comment: 'Проверка заявки — кириллица и диакритики: Șoapte de Mai',
  locale: 'ru',
  source: 'cart',
  items: [
    {
      productId: 1,
      slug: 'maison-orphee-signature-wood',
      title: 'Signature Wood',
      brandTitle: 'Maison Orphée',
      sku: 'MO-SW-05',
      volume: 5,
      price: 240,
      qty: 2,
    },
  ],
  ...overrides,
})

// ── Валидация ─────────────────────────────────────────────────────────────
const badPhone = await post(validOrder({ phone: '+7 999 123 45 67' }))
check('невалидный телефон отклонён', badPhone.status === 400, `HTTP ${badPhone.status}`)

const shortName = await post(validOrder({ name: 'A' }))
check('слишком короткое имя отклонено', shortName.status === 400, `HTTP ${shortName.status}`)

const honeypot = await post(validOrder({ company: 'spam-bot' }))
check('honeypot-бот отклонён', honeypot.status === 400, `HTTP ${honeypot.status}`)

const emptyCart = await post(validOrder({ items: [] }))
check('пустая корзина отклонена', emptyCart.status === 400, `HTTP ${emptyCart.status}`)

// ── Успешная заявка при ORDERS_DRY_RUN ────────────────────────────────────
const ok = await post(validOrder())
const okBody = await ok.json()
check('заявка принята', ok.status === 200 && okBody.ok === true, JSON.stringify(okBody))
check('внешние отправки заглушены (dry run)', okBody.dryRun === true)

const orderNumber = okBody.orderNumber
check('номер заявки присвоен', /^MF-\d{6}-[A-Z0-9]{4}$/.test(orderNumber ?? ''), orderNumber)

// ── Заявка в БД + CSV ─────────────────────────────────────────────────────
const email = readFileSync('.env', 'utf8').match(/^SEED_ADMIN_EMAIL=(.*)$/m)[1]
const password = readFileSync('.env', 'utf8').match(/^SEED_ADMIN_PASSWORD=(.*)$/m)[1]
const login = await fetch(`${BASE}/api/users/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
const { token } = await login.json()

const found = await fetch(`${BASE}/api/orders?where[orderNumber][equals]=${orderNumber}&depth=0`, {
  headers: { Authorization: `JWT ${token}` },
}).then((response) => response.json())

const order = found.docs?.[0]
check('заявка сохранена в БД', Boolean(order), order ? `id ${order.id}` : 'не найдена')
check('цена и сумма пересчитаны на сервере', order?.total === 480, `total ${order?.total}`)
check(
  'позиция содержит снапшот товара',
  order?.items?.[0]?.sku === 'MO-SW-05' && order?.items?.[0]?.qty === 2,
)
check('статус новой заявки — new', order?.status === 'new')

const csv = order?.exportCsv ?? ''
writeFileSync(`/tmp/${orderNumber}.csv`, csv, 'utf8')
const lines = csv.split('\r\n').filter(Boolean)

check('CSV начинается с BOM', csv.charCodeAt(0) === 0xfeff, `первый код ${csv.charCodeAt(0)}`)
check(
  'разделитель «;» и нужные колонки',
  lines[0]?.replace('﻿', '') ===
    'date;name;phone;messenger;checkoutMode;deliveryMethod;paymentMethod;address;product;brand;volume;sku;qty;price;sum;promoCode;discount;comment',
  lines[0]?.replace('﻿', ''),
)
check(
  'кириллица и диакритики целы',
  csv.includes('Тестовый Клиент') && csv.includes('Șoapte de Mai'),
)
check(
  'строка позиции и строка ИТОГО на месте',
  lines.length === 3 && lines[1].includes('MO-SW-05') && lines[2].includes('ИТОГО'),
  `${lines.length} строк`,
)
check(
  'поле с «;» взято в кавычки или экранировано',
  !(lines[1] ?? '').split(';').some((cell, index) => index === 15 && cell.includes(';')),
)

// ── Способ оформления и адрес (фаза 9.1) ──────────────────────────────────
check(
  'обычная заявка не помечена «без звонка» ни в БД, ни в CSV',
  order?.checkoutMode === 'standard' && !csv.includes('БЕЗ ЗВОНКА'),
  `checkoutMode ${order?.checkoutMode}`,
)
check(
  'пустой адрес не превращается в мусор в CSV',
  !order?.customer?.address && (lines[1] ?? '').split(';')[7] === '',
  `адрес «${(lines[1] ?? '').split(';')[7]}»`,
)

// ── Способ получения и обязательность адреса (фаза 11.2, задача 5) ────────
check(
  'заявка без deliveryMethod — pickup по умолчанию, адрес не требуется',
  order?.deliveryMethod === 'pickup',
  `deliveryMethod ${order?.deliveryMethod}`,
)
check(
  'CSV показывает «Самовывоз» для pickup-заявки',
  (lines[1] ?? '').split(';')[5] === 'Самовывоз',
  (lines[1] ?? '').split(';')[5],
)

const deliveryNoAddress = await post(validOrder({ deliveryMethod: 'delivery' }))
const deliveryNoAddressBody = await deliveryNoAddress.json()
check(
  'заявка «доставка» без адреса отклонена',
  deliveryNoAddress.status === 400 && deliveryNoAddressBody.fields?.includes('address'),
  JSON.stringify(deliveryNoAddressBody),
)

const delivery = await post(
  validOrder({ deliveryMethod: 'delivery', address: 'Chișinău, bd. Dacia 12' }),
)
const deliveryBody = await delivery.json()
check('заявка «доставка» с адресом принята', delivery.status === 200 && deliveryBody.ok === true)

const deliveryOrder = await fetch(
  `${BASE}/api/orders?where[orderNumber][equals]=${deliveryBody.orderNumber}&depth=0`,
  { headers: { Authorization: `JWT ${token}` } },
)
  .then((response) => response.json())
  .then((data) => data.docs?.[0])
check('deliveryMethod «delivery» сохранён в заявке', deliveryOrder?.deliveryMethod === 'delivery')
check(
  'адрес доставки сохранён в заявке',
  deliveryOrder?.customer?.address === 'Chișinău, bd. Dacia 12',
  deliveryOrder?.customer?.address,
)
const deliveryCsvLine = (deliveryOrder?.exportCsv ?? '').split('\r\n')[1] ?? ''
check(
  'CSV показывает «Доставка» и адрес доставки',
  deliveryCsvLine.split(';')[5] === 'Доставка' &&
    deliveryCsvLine.includes('Chișinău, bd. Dacia 12'),
  deliveryCsvLine.slice(0, 120),
)

// ── Способ оплаты (фаза 11.2, задача 6) ────────────────────────────────────
check(
  'заявка без paymentMethod — cash по умолчанию',
  order?.paymentMethod === 'cash',
  `paymentMethod ${order?.paymentMethod}`,
)

const cardOrderRes = await post(validOrder({ paymentMethod: 'card' }))
const cardOrderBody = await cardOrderRes.json()
check('заявка с оплатой картой принята', cardOrderRes.status === 200 && cardOrderBody.ok === true)

const cardOrder = await fetch(
  `${BASE}/api/orders?where[orderNumber][equals]=${cardOrderBody.orderNumber}&depth=0`,
  { headers: { Authorization: `JWT ${token}` } },
)
  .then((response) => response.json())
  .then((data) => data.docs?.[0])
check('paymentMethod «card» сохранён в заявке', cardOrder?.paymentMethod === 'card')

const cardCsvLine = (cardOrder?.exportCsv ?? '').split('\r\n')[1] ?? ''
check(
  'CSV показывает «Картой» для paymentMethod card',
  cardCsvLine.split(';')[6] === 'Картой',
  cardCsvLine.split(';')[6],
)

// ── Промокоды (фаза 11.2, задача 7) ────────────────────────────────────────
const promoRest = (method, path, body) =>
  fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

const promoCheck = (code) =>
  fetch(`${BASE}/api/promo-code-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })

// Код TEST10PROMO — 10%, для основного сценария; создан через REST (staff),
// как и создал бы его владелец из /admin.
const promoCreate = await promoRest('POST', '/promo-codes', {
  code: 'test10promo',
  percent: 10,
  isActive: true,
})
const promoDoc = (await promoCreate.json()).doc
check(
  'промокод создан, код нормализован в верхний регистр',
  promoDoc?.code === 'TEST10PROMO',
  promoDoc?.code,
)

const promoNotFound = await promoCheck('NOPE-CODE')
check('проверка кода: несуществующий → not_found', promoNotFound.status === 404)

const promoOkCheck = await promoCheck('test10promo') // регистронезависимо
const promoOkCheckBody = await promoOkCheck.json()
check(
  'проверка кода: регистронезависимо, percent отдаётся',
  promoOkCheck.status === 200 && promoOkCheckBody.percent === 10,
  JSON.stringify(promoOkCheckBody),
)

// Подарочный товар — для проверки, что скидка НЕ считается от его суммы.
const giftForPromo = await promoRest(
  'POST',
  '/gift-items?locale=ro',
  {
    title: 'TEST Promo Gift',
    slug: 'test-promo-gift',
    type: 'certificate',
    isActive: true,
    variants: [{ amount: 500, sku: 'TEST-PROMO-GIFT-500', stock: 5, isActive: true }],
  },
)
const giftForPromoDoc = (await giftForPromo.json()).doc
check('временный gift-item для теста промокода создан', Boolean(giftForPromoDoc?.id))

const promoOrderRes = await post(
  validOrder({
    promoCode: 'test10promo',
    items: [
      ...validOrder().items,
      {
        kind: 'gift',
        productId: giftForPromoDoc?.id ?? 0,
        slug: 'test-promo-gift',
        title: 'TEST Promo Gift',
        brandTitle: '',
        sku: 'TEST-PROMO-GIFT-500',
        price: 500,
        qty: 1,
      },
    ],
  }),
)
const promoOrderBody = await promoOrderRes.json()
check(
  'заявка с промокодом (товар + gift-item) принята',
  promoOrderRes.status === 200 && promoOrderBody.ok === true,
  JSON.stringify(promoOrderBody),
)

const promoOrder = await fetch(
  `${BASE}/api/orders?where[orderNumber][equals]=${promoOrderBody.orderNumber}&depth=0`,
  { headers: { Authorization: `JWT ${token}` } },
)
  .then((response) => response.json())
  .then((data) => data.docs?.[0])
// 480 (духи, 10% скидки = 48) + 500 (gift, скидка не действует) = 932.
check(
  'скидка не считается от суммы gift-item — итог 932, не 882',
  promoOrder?.total === 932,
  `total ${promoOrder?.total}`,
)
check(
  'промокод и сумма скидки сохранены в заявке',
  promoOrder?.promoCode === 'TEST10PROMO' &&
    promoOrder?.promoDiscountPercent === 10 &&
    promoOrder?.promoDiscountAmount === 48,
  `${promoOrder?.promoCode} -${promoOrder?.promoDiscountPercent}% -${promoOrder?.promoDiscountAmount}`,
)

const promoCsvLastLine = (promoOrder?.exportCsv ?? '').split('\r\n').filter(Boolean).at(-1) ?? ''
check(
  'CSV итоговой строки показывает промокод и сумму скидки',
  promoCsvLastLine.split(';')[15] === 'TEST10PROMO' && promoCsvLastLine.split(';')[16] === '48',
  promoCsvLastLine,
)

// Код одноразовый — второе применение отклоняется на этапе оформления.
const promoUsedCheck = await promoCheck('test10promo')
check('код после применения — used при повторной проверке', promoUsedCheck.status === 404)

const promoReuseOrder = await post(validOrder({ promoCode: 'test10promo' }))
const promoReuseBody = await promoReuseOrder.json()
check(
  'повторное применение того же кода отклонено при оформлении',
  promoReuseOrder.status === 400 &&
    promoReuseBody.error === 'promo_invalid' &&
    promoReuseBody.promoError === 'used',
  JSON.stringify(promoReuseBody),
)

// Неактивный и просроченный код — отдельные коды, чтобы не путать с одноразовостью.
await promoRest('POST', '/promo-codes', { code: 'test-inactive', percent: 5, isActive: false })
const promoInactiveCheck = await promoCheck('test-inactive')
const promoInactiveBody = await promoInactiveCheck.json()
check(
  'неактивный код отклонён с error=inactive',
  promoInactiveCheck.status === 404 && promoInactiveBody.error === 'inactive',
  JSON.stringify(promoInactiveBody),
)

await promoRest('POST', '/promo-codes', {
  code: 'test-expired',
  percent: 5,
  isActive: true,
  expiresAt: '2020-01-01T00:00:00.000Z',
})
const promoExpiredCheck = await promoCheck('test-expired')
const promoExpiredBody = await promoExpiredCheck.json()
check(
  'просроченный код отклонён с error=expired',
  promoExpiredCheck.status === 404 && promoExpiredBody.error === 'expired',
  JSON.stringify(promoExpiredBody),
)

// Уборка тестовых промокодов и gift-item.
for (const code of ['test10promo', 'test-inactive', 'test-expired']) {
  const found = await promoRest('GET', `/promo-codes?where[code][equals]=${code.toUpperCase()}`)
  const doc = (await found.json()).docs?.[0]
  if (doc) await promoRest('DELETE', `/promo-codes/${doc.id}`)
}
if (giftForPromoDoc?.id) await promoRest('DELETE', `/gift-items/${giftForPromoDoc.id}`)

const noCall = await post(
  validOrder({ checkoutMode: 'noCall', address: 'Chișinău, str. Ismail 98, ap. 12' }),
)
const noCallBody = await noCall.json()
check('заявка «без звонка» с адресом принята', noCall.status === 200 && noCallBody.ok === true)

const noCallOrder = await fetch(
  `${BASE}/api/orders?where[orderNumber][equals]=${noCallBody.orderNumber}&depth=0`,
  { headers: { Authorization: `JWT ${token}` } },
)
  .then((response) => response.json())
  .then((data) => data.docs?.[0])
check('флаг «без звонка» сохранён в заявке', noCallOrder?.checkoutMode === 'noCall')
check(
  'адрес сохранён в заявке',
  noCallOrder?.customer?.address === 'Chișinău, str. Ismail 98, ap. 12',
  noCallOrder?.customer?.address,
)

const noCallCsvLine = (noCallOrder?.exportCsv ?? '').split('\r\n')[1] ?? ''
check(
  'CSV показывает «БЕЗ ЗВОНКА» и адрес',
  noCallCsvLine.split(';')[4] === 'БЕЗ ЗВОНКА' &&
    noCallCsvLine.includes('Chișinău, str. Ismail 98, ap. 12'),
  noCallCsvLine.slice(0, 120),
)

// Телефон обязателен и при «без звонка» — способ оформления валидацию не ослабляет.
const noCallBadPhone = await post(validOrder({ checkoutMode: 'noCall', phone: '+7 999 123 45 67' }))
check(
  'телефон остаётся обязательным при «без звонка»',
  noCallBadPhone.status === 400,
  `HTTP ${noCallBadPhone.status}`,
)

// ── Email клиента (фаза 4.6.1/4.6.2) ────────────────────────────────────────
const badEmail = await post(validOrder({ email: 'not-an-email' }))
const badEmailBody = await badEmail.json()
check(
  'невалидный email отклонён',
  badEmail.status === 400 && badEmailBody.fields?.includes('email'),
  JSON.stringify(badEmailBody),
)

const withEmail = await post(validOrder({ email: 'client@example.com' }))
const withEmailBody = await withEmail.json()
check('заявка с email принята', withEmail.status === 200 && withEmailBody.ok === true)
const emailOrderNumber = withEmailBody.orderNumber

const foundWithEmail = await fetch(
  `${BASE}/api/orders?where[orderNumber][equals]=${emailOrderNumber}&depth=0`,
  { headers: { Authorization: `JWT ${token}` } },
).then((response) => response.json())
const emailOrder = foundWithEmail.docs?.[0]
check('email клиента сохранён в заявке', emailOrder?.customer?.email === 'client@example.com')
check(
  'токен статуса присвоен и не короткий',
  typeof emailOrder?.statusToken === 'string' && emailOrder.statusToken.length >= 32,
  emailOrder?.statusToken,
)

const noEmail = await post(validOrder())
const noEmailBody = await noEmail.json()
check('заявка без email отправляется как раньше', noEmail.status === 200 && noEmailBody.ok === true)

// ── Цену с клиента не берём ───────────────────────────────────────────────
const tampered = await post(validOrder({ items: [{ ...validOrder().items[0], price: 1 }] }))
const tamperedBody = await tampered.json()
const tamperedOrder = await fetch(
  `${BASE}/api/orders?where[orderNumber][equals]=${tamperedBody.orderNumber}&depth=0`,
  { headers: { Authorization: `JWT ${token}` } },
).then((response) => response.json())
check(
  'подмена цены с клиента игнорируется',
  tamperedOrder.docs?.[0]?.total === 480,
  `total ${tamperedOrder.docs?.[0]?.total}`,
)

// ── Корзина в браузере ────────────────────────────────────────────────────
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const goto = async (path) => {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  await page.locator('footer').first().waitFor({ timeout: 20000 })
}

await goto('/ro/product/maison-orphee-signature-wood')
// Клик до окончания гидрации в dev просто теряется, поэтому жмём до тех пор,
// пока корзина в localStorage не наполнится.
const addedToCart = await (async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.getByRole('button', { name: /adaugă în coș/i }).click()
    try {
      await page.waitForFunction(
        () => Boolean(localStorage.getItem('mf-cart')?.includes('MO-SW')),
        {
          timeout: 3000,
        },
      )
      return true
    } catch {
      await page.waitForTimeout(500)
    }
  }
  return false
})()
check('кнопка «в корзину» наполняет корзину', addedToCart)

// Содержимое корзины рисуется только после гидрации — ждём появления, а не
// проверяем сразу после навигации.
const seesItem = async () => {
  try {
    await page.getByText('Signature Wood').first().waitFor({ timeout: 10000 })
    return true
  } catch {
    return false
  }
}

await goto('/ro/cart')
check('позиция видна в корзине', await seesItem())

await page.reload({ waitUntil: 'domcontentloaded' })
check('корзина переживает перезагрузку', await seesItem())

await goto('/ru/cart')
check('корзина переживает смену локали', await seesItem())

// Пустая корзина — нормальное состояние
await page.evaluate(() => localStorage.removeItem('mf-cart'))
await page.reload({ waitUntil: 'domcontentloaded' })
let sawEmpty = false
try {
  await page
    .getByText(/корзина пуста/i)
    .first()
    .waitFor({ timeout: 10000 })
  sawEmpty = true
} catch {
  /* пустое состояние не отрисовалось */
}
check('пустая корзина — нормальное состояние', sawEmpty)

// ── Thank-you: детали заказа (фаза 4.6.3) ───────────────────────────────────
await goto(`/ro/thank-you?order=${encodeURIComponent(emailOrderNumber)}`)
// React разделяет соседние текстовые узлы SSR-комментариями (<!-- -->) —
// вырезаем их перед проверкой склеенных чисел с текстом ("480 MDL").
const thankYouHtml = (await page.content()).replace(/<!--\s*-->/g, '')
check('thank-you показывает товар из заказа', thankYouHtml.includes('Signature Wood'))
check('thank-you показывает сумму заказа', thankYouHtml.includes(`${emailOrder?.total} MDL`))
check('thank-you показывает email клиента', thankYouHtml.includes('client@example.com'))
check(
  'thank-you содержит ссылку на страницу статуса',
  thankYouHtml.includes(`/ro/order/${emailOrder?.statusToken}`),
)

await goto('/ro/thank-you')
check(
  'thank-you без query-параметра order работает без падения (без блока деталей)',
  (await page.content()).includes('Mulțumim'),
)

// ── Вход в отслеживание заказа из футера (регрессия фазы 9.1) ─────────────
await goto('/ro')
const trackLink = page.locator('footer').getByRole('link', { name: /comand/i })
check(
  'ссылка «отследить заказ» есть в футере независимо от контента CMS',
  (await trackLink.count()) > 0 &&
    (await trackLink.first().getAttribute('href'))?.includes('/order'),
  (await trackLink.first().getAttribute('href')) ?? 'ссылки нет',
)

// ── Навигация: «Noutăți» ведёт на flags=isNew (фаза 4.6.4) ─────────────────
await goto('/ro')
await page.locator('header').getByRole('link', { name: /noutăți/i }).first().click()
await page.waitForURL(/flags=isNew/, { timeout: 10000 }).catch(() => {})
check('клик по «Noutăți» в шапке фильтрует каталог (flags=isNew)', page.url().includes('flags=isNew'))

// ── Статус заказа: публичная страница + запасной поиск (фаза 4.7.2) ────────
const lookup = (body) =>
  fetch(`${BASE}/api/order-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const noPhone = await lookup({ orderNumber: emailOrderNumber })
check(
  'поиск по одному номеру запрещён на уровне API',
  noPhone.status === 400,
  `HTTP ${noPhone.status}`,
)

const wrongPhone = await lookup({ orderNumber: emailOrderNumber, phone: '+37369999999' })
check('поиск с неверным телефоном не находит заказ', wrongPhone.status === 404)

const foundLookup = await lookup({ orderNumber: emailOrderNumber, phone: '+37360123456' })
const foundLookupBody = await foundLookup.json()
check(
  'поиск номер+телефон отдаёт токен',
  foundLookup.status === 200 && foundLookupBody.token === emailOrder?.statusToken,
)

await goto(`/ro/order/${emailOrder?.statusToken}`)
const statusPageHtml = (await page.content()).replace(/<!--\s*-->/g, '')
check('страница статуса показывает товар', statusPageHtml.includes('Signature Wood'))
check('страница статуса показывает сумму', statusPageHtml.includes(`${emailOrder?.total} MDL`))
check('страница статуса показывает статус человеческим языком', statusPageHtml.includes('Nouă'))
check(
  'страница статуса без служебных полей (sku не выводится клиенту)',
  !statusPageHtml.includes('MO-SW-05'),
)

const badToken = await fetch(`${BASE}/ro/order/not-a-real-token`)
check('несуществующий токен — 404, а не падение', badToken.status === 404)

await goto('/ro/order')
await page.getByPlaceholder('MF-260101-AB12').fill(emailOrderNumber)
await page.locator('input[type="tel"]').fill('60123456')
await page.getByRole('button', { name: /caută/i }).click()
await page.waitForURL(/\/order\/[a-f0-9]+/, { timeout: 10000 }).catch(() => {})
check(
  'запасной поиск (номер+телефон) переводит на страницу статуса',
  page.url().includes(`/order/${emailOrder?.statusToken}`),
)

check(
  'маршрут /order не конфликтует с /api/orders REST',
  (await fetch(`${BASE}/api/orders?limit=1`)).status !== 404,
)

// Свой счётчик у /api/order-status (фаза 4.7.2) — выбиваем его лимит первым
// и проверяем, что форма заявки (другой scope) от этого не пострадала —
// иначе идёт обычная проверка её собственного лимита ниже.
let lookupLimited = false
for (let i = 0; i < RATE_LIMIT + 2; i += 1) {
  const response = await lookup({ orderNumber: 'MF-NOPE', phone: '+37360000000' })
  if (response.status === 429) lookupLimited = true
}
check('rate-limit поиска статуса срабатывает', lookupLimited, `порог ${RATE_LIMIT}`)

const requestAfterLookupLimit = await post(validOrder())
check(
  'форма заявки не пострадала от выбитого лимита поиска статуса (разные scope)',
  requestAfterLookupLimit.status === 200,
)

// ── Rate limit формы заявки ─────────────────────────────────────────────────
let limited = false
for (let i = 0; i < RATE_LIMIT + 1; i += 1) {
  const response = await post(validOrder())
  if (response.status === 429) limited = true
}
check('rate-limit по IP срабатывает', limited, `порог ${RATE_LIMIT}`)

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\nCSV сохранён: /tmp/${orderNumber}.csv`)
console.log(`Итог: ${results.length - failed.length}/${results.length} пройдено`)
process.exit(failed.length ? 1 : 0)
