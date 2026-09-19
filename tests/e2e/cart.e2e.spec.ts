import { test, expect } from '@playwright/test'
import { addToCartWithRetry, gotoAndWaitForFooter } from '../helpers/cart'

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

test('корзина: количество, итог и состояние переживают перезагрузку', async ({ page }) => {
  await gotoAndWaitForFooter(page, '/ro/product/maison-orphee-signature-wood')
  expect(await addToCartWithRetry(page, 'MO-SW-05')).toBe(true)

  await gotoAndWaitForFooter(page, '/ro/product/casa-lumina-trandafir-de-mai')
  expect(await addToCartWithRetry(page, 'CL-TM-05')).toBe(true)

  await gotoAndWaitForFooter(page, '/ro/cart')
  await expect(page.getByText('Signature Wood').first()).toBeVisible()
  await expect(page.getByText('Trandafir de Mai').first()).toBeVisible()

  const totalNode = page.locator('span.text-display').first()
  const totalBefore = await totalNode.innerText()

  // Увеличиваем количество первой позиции (кнопка «+» — второй button в блоке qty строки).
  // Блок количества ищем по числу внутри него (`span.tabular-nums`), а не как
  // «первый div.rounded-sm.border в строке»: под последнее с сентября 2026
  // подходит ещё и миниатюра товара, и она стоит в строке первой.
  const firstRow = page.locator('li', { hasText: 'Signature Wood' }).first()
  const qtyGroup = firstRow
    .locator('div.rounded-sm.border', { has: page.locator('span.tabular-nums') })
    .first()
  const qtyValue = qtyGroup.locator('span.tabular-nums')
  const qtyBefore = await qtyValue.innerText()
  const plusButton = qtyGroup.locator('button').nth(1)
  await expect(async () => {
    await plusButton.click()
    await expect(qtyValue).not.toHaveText(qtyBefore, { timeout: 1000 })
  }).toPass({ timeout: 10000 })
  await expect(totalNode).not.toHaveText(totalBefore)
  const qtyAfter = await qtyValue.innerText()

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Signature Wood').first()).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('Trandafir de Mai').first()).toBeVisible()
  const qtyGroupAfterReload = page
    .locator('li', { hasText: 'Signature Wood' })
    .first()
    .locator('div.rounded-sm.border', { has: page.locator('span.tabular-nums') })
    .first()
  await expect(qtyGroupAfterReload.locator('span.tabular-nums')).toHaveText(qtyAfter)
})
