import { test, expect } from '@playwright/test'
import { addToCartWithRetry, gotoAndWaitForFooter } from '../helpers/cart'

/**
 * Сквозная заявка через UI при ORDERS_DRY_RUN=1 (.env): корзина → форма →
 * thank-you → проверка записи в БД через REST (логин админом из .env).
 */
/*
 * Попап «первая скидка» открывается через 2 с на ЛЮБОЙ странице витрины и
 * перехватывает клики, а его поле телефона — такой же `input[type="tel"]`,
 * как в форме заказа (общий `PhoneInput` с 2026-09-19). В полном прогоне,
 * где страницы компилируются дольше, спек успевал дождаться попапа и падал
 * то на перехваченном клике, то на неоднозначном локаторе. Этот спек не про
 * попап — помечаем его показанным ещё до загрузки (docs/GOTCHAS.md).
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mf-promo-popup-seen', '1'))
})

test('заявка из корзины сохраняется в БД и ведёт на страницу «Спасибо»', async ({
  page,
  request,
  baseURL,
}) => {
  await gotoAndWaitForFooter(page, '/ro/product/maison-orphee-signature-wood')
  expect(await addToCartWithRetry(page, 'MO-SW-05')).toBe(true)

  await gotoAndWaitForFooter(page, '/ro/cart')

  await page.getByPlaceholder('Cum să vă numim').fill('Playwright Тест')
  // Намеренно ПОЛНЫЙ международный номер: поле обязано распознать код страны
  // и оставить восемь цифр. До 2026-09-19 такая вставка давала «37360123», и
  // в заявку уходил выдуманный `+37337360123` (см. docs/CHANGELOG.md).
  await page.locator('input[type="tel"]').fill('+373 60 123 456')
  await expect(page.locator('input[type="tel"]')).toHaveValue('60 123 456')
  await page.getByPlaceholder(/confirmarea comenzii/i).fill('playwright@example.com')
  await page.getByPlaceholder(/întrebare sau dorință/i).fill('E2E заявка, фаза 8')

  // Подпись кнопки — `OrderForm.submit` (RO с 15.09 «Trimite comanda», см. CHANGELOG
  // [2026-09-15]); спека тянула старый текст «Trimite cererea» и падала по таймауту.
  await page.getByRole('button', { name: /trimite comanda/i }).click()
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
  // Телефон в заявке — каноничный, а не обрезок вставленной строки.
  expect(order.customer?.phone).toBe('+37360123456')
  expect(order.total).toBe(240)
})
