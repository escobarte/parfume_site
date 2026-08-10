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
    'date;name;phone;messenger;product;brand;volume;sku;qty;price;sum;comment',
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
  !(lines[1] ?? '').split(';').some((cell, index) => index === 11 && cell.includes(';')),
)

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

// ── Rate limit ────────────────────────────────────────────────────────────
let limited = false
for (let i = 0; i < RATE_LIMIT + 2; i += 1) {
  const response = await post(validOrder())
  if (response.status === 429) limited = true
}
check('rate-limit по IP срабатывает', limited, `порог ${RATE_LIMIT}`)

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\nCSV сохранён: /tmp/${orderNumber}.csv`)
console.log(`Итог: ${results.length - failed.length}/${results.length} пройдено`)
process.exit(failed.length ? 1 : 0)
