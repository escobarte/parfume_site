import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { addToCartWithRetry, gotoAndWaitForFooter } from '../helpers/cart'

/**
 * Условия применения промокода (минимум штук + фильтр «только отливанты»,
 * 2026-10-23) — подсказка в корзине должна меняться по мере добавления
 * товаров, без перезагрузки страницы (`CartView.tsx` считает условие на
 * клиенте тем же общим кодом, что сервер при оформлении).
 *
 * Код с условием не заводится обычным путём сайта (попап/CSV) — создаётся
 * напрямую через admin REST, как и `scripts/check-orders.mjs` делает для
 * TEST10PROMO. Удаляется в конце прогона.
 *
 * Попап «первая скидка» глушится `addInitScript` (docs/GOTCHAS.md) — спек не
 * про него, а его перехват кликов и общий `input[type=tel]` с полем
 * подтверждения кода мешали бы проверке.
 */

const BASE = 'http://localhost:3000'
const CODE = 'E2E-DECANT-COND'

let token: string
let promoId: number | string

test.beforeAll(async () => {
  const env = readFileSync('.env', 'utf8')
  const email = env.match(/^SEED_ADMIN_EMAIL=(.*)$/m)?.[1]
  const password = env.match(/^SEED_ADMIN_PASSWORD=(.*)$/m)?.[1]
  if (!email || !password) throw new Error('SEED_ADMIN_EMAIL/PASSWORD не найдены в .env')

  const login = await fetch(`${BASE}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const loginBody = await login.json()
  token = loginBody.token

  // Прибрать за прошлым неудачным прогоном, если код остался.
  await fetch(`${BASE}/api/promo-codes?where[code][equals]=${CODE}`, {
    headers: { Authorization: `JWT ${token}` },
  })
    .then((r) => r.json())
    .then((body) =>
      Promise.all(
        (body.docs ?? []).map((doc: { id: number }) =>
          fetch(`${BASE}/api/promo-codes/${doc.id}`, {
            method: 'DELETE',
            headers: { Authorization: `JWT ${token}` },
          }),
        ),
      ),
    )

  const create = await fetch(`${BASE}/api/promo-codes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${token}` },
    body: JSON.stringify({
      code: CODE,
      codeType: 'public',
      percent: 25,
      isActive: true,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      minQuantity: 3,
      appliesTo: 'decants',
    }),
  })
  const createBody = await create.json()
  promoId = createBody.doc?.id
  if (!promoId) throw new Error(`не удалось создать тестовый промокод: ${JSON.stringify(createBody)}`)
})

test.afterAll(async () => {
  if (promoId) {
    await fetch(`${BASE}/api/promo-codes/${promoId}`, {
      method: 'DELETE',
      headers: { Authorization: `JWT ${token}` },
    })
  }
})

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mf-promo-popup-seen', '1'))
})

test('подсказка «добавьте ещё N» уменьшается по мере добора отливантов, затем уступает скидке', async ({
  page,
}) => {
  // Применённый промокод живёт только в памяти (`usePromo` не персистится,
  // см. promoStore.ts) — переход на страницу товара и обратно стирал бы его.
  // Поэтому «добавление» здесь — кнопка «+» количества на уже открытой
  // странице корзины, а не повторная навигация на товар: именно так
  // подсказка меняется БЕЗ перезагрузки, что и проверяется.
  await gotoAndWaitForFooter(page, '/ro/product/maison-orphee-signature-wood?volume=5ml')
  expect(await addToCartWithRetry(page, 'MO-SW-05')).toBe(true)

  await gotoAndWaitForFooter(page, '/ru/cart')
  await page.getByPlaceholder('Промокод').fill(CODE)
  await page.getByRole('button', { name: 'Применить' }).click()

  // 1 отливант в корзине, нужно 3 — не хватает 2.
  await expect(page.getByText(/Добавьте ещё 2 отливант/)).toBeVisible({ timeout: 10000 })

  const row = page.locator('li', { hasText: 'Signature Wood' }).first()
  const qtyGroup = row.locator('div.rounded-sm.border', { has: page.locator('span.tabular-nums') }).first()
  const plusButton = qtyGroup.locator('button').nth(1)

  // +1 штука (2 отливанта) — не хватает 1.
  await expect(async () => {
    await plusButton.click()
    await expect(page.getByText(/Добавьте ещё 1 отливант/)).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10000 })

  // +1 штука (3 отливанта) — условие выполнено, подсказка уступает скидке.
  await expect(async () => {
    await plusButton.click()
    await expect(page.getByText(/Добавьте ещё/)).not.toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10000 })
  await expect(page.getByText(new RegExp(`Скидка по промокоду ${CODE}`))).toBeVisible()
})
