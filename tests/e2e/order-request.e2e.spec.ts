import { test, expect } from '@playwright/test'
import { addToCartWithRetry, gotoAndWaitForFooter } from '../helpers/cart'

/**
 * Сквозная заявка через UI при ORDERS_DRY_RUN=1 (.env): корзина → форма →
 * thank-you → проверка записи в БД через REST (логин админом из .env).
 */
test('заявка из корзины сохраняется в БД и ведёт на страницу «Спасибо»', async ({
  page,
  request,
  baseURL,
}) => {
  await gotoAndWaitForFooter(page, '/ro/product/maison-orphee-signature-wood')
  expect(await addToCartWithRetry(page, 'MO-SW-05')).toBe(true)

  await gotoAndWaitForFooter(page, '/ro/cart')

  await page.getByPlaceholder('Cum să vă numim').fill('Playwright Тест')
  await page.locator('input[type="tel"]').fill('60123456')
  await page.getByPlaceholder(/confirmarea comenzii/i).fill('playwright@example.com')
  await page.getByPlaceholder(/întrebare sau dorință/i).fill('E2E заявка, фаза 8')

  await page.getByRole('button', { name: /trimite cererea/i }).click()
  await page.waitForURL(/\/thank-you\?order=/, { timeout: 20000 })

  const orderNumber = new URL(page.url()).searchParams.get('order')
  expect(orderNumber).toMatch(/^MF-\d{6}-[A-Z0-9]{4}$/)

  await expect(page.getByText('Signature Wood').first()).toBeVisible()

  const email = process.env.SEED_ADMIN_EMAIL
  const password = process.env.SEED_ADMIN_PASSWORD
  const login = await request.post(`${baseURL}/api/users/login`, {
    data: { email, password },
  })
  const { token } = await login.json()

  const found = await request
    .get(`${baseURL}/api/orders?where[orderNumber][equals]=${orderNumber}&depth=0`, {
      headers: { Authorization: `JWT ${token}` },
    })
    .then((r) => r.json())

  const order = found.docs?.[0]
  expect(order).toBeTruthy()
  expect(order.status).toBe('new')
  expect(order.customer?.email).toBe('playwright@example.com')
  expect(order.items?.[0]?.sku).toBe('MO-SW-05')
  expect(order.total).toBe(240)
})
