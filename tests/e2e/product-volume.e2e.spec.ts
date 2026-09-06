import { test, expect } from '@playwright/test'
import { gotoAndWaitForFooter } from '../helpers/cart'

test.describe('Карточка товара: переключение объёма', () => {
  test('смена объёма меняет цену и SKU без перезагрузки страницы', async ({ page }) => {
    await gotoAndWaitForFooter(page, '/ro/product/maison-orphee-signature-wood')

    const priceNode = page.locator('span.text-display').first()
    const skuNode = page.getByText(/COD:/i).first()
    const before = { price: await priceNode.innerText(), sku: await skuNode.innerText() }

    // Клик до окончания гидрации в dev теряется (см. GOTCHAS.md) — жмём,
    // пока цена не изменится.
    const volumeButton = page.getByRole('button', { name: 'Full Size', exact: true }).first()
    await expect(async () => {
      await volumeButton.click()
      await expect(priceNode).not.toHaveText(before.price, { timeout: 1000 })
    }).toPass({ timeout: 10000 })

    const after = { price: await priceNode.innerText(), sku: await skuNode.innerText() }
    expect(after.sku).not.toBe(before.sku)
    expect(after.sku).toContain('MO-SW-30')
  })

  test('вариант с нулевым остатком заблокирован для выбора', async ({ page }) => {
    await gotoAndWaitForFooter(page, '/ro/product/maison-orphee-nuit-ambree')
    const soldOut = page.getByRole('button', { name: 'Full Size', exact: true }).first()
    await expect(soldOut).toBeDisabled()
  })

  test('показаны только реально загруженные объёмы, в фиксированном порядке', async ({ page }) => {
    // casa-lumina-set-descoperire (src/lib/seed/data.ts) — единственный демо-товар
    // ровно с 2 из 5 объёмов (3ml, Travel Size), остальные три не заведены вовсе.
    await gotoAndWaitForFooter(page, '/ro/product/casa-lumina-set-descoperire')

    const buttons = page.locator('button').filter({
      hasText: /^(3ml|5ml|10ml|Travel Size|Full Size)$/,
    })
    await expect(buttons).toHaveCount(2)
    await expect(buttons).toHaveText(['3ml', 'Travel Size'])
  })
})
