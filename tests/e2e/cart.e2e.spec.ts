import { test, expect } from '@playwright/test'
import { addToCartWithRetry, gotoAndWaitForFooter } from '../helpers/cart'

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
  const firstRow = page.locator('li', { hasText: 'Signature Wood' }).first()
  const qtyGroup = firstRow.locator('div.rounded-sm.border').first()
  const qtyValue = qtyGroup.locator('span')
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
    .locator('div.rounded-sm.border')
    .first()
  await expect(qtyGroupAfterReload.locator('span')).toHaveText(qtyAfter)
})
