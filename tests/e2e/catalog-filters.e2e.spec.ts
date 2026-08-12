import { test, expect } from '@playwright/test'
import { gotoAndWaitForFooter } from '../helpers/cart'

const cardsOf = (page: import('@playwright/test').Page) => page.locator('article a[href*="/product/"]')

test.describe('Каталог: фильтры и URL-состояние', () => {
  test('фильтр по бренду сужает выдачу, уходит в URL и воспроизводится по ссылке', async ({
    page,
    context,
  }) => {
    await gotoAndWaitForFooter(page, '/ro/catalog')
    const totalAll = await cardsOf(page).count()
    expect(totalAll).toBeGreaterThan(0)

    // Клик до окончания гидрации в dev теряется (см. GOTCHAS.md) — жмём,
    // пока выдача не изменится.
    const checkbox = page.getByRole('checkbox').first()
    let filtered = totalAll
    await expect(async () => {
      if (!(await checkbox.isChecked())) await checkbox.check()
      filtered = await cardsOf(page).count()
      expect(filtered).not.toBe(totalAll)
    }).toPass({ timeout: 10000 })
    expect(filtered).toBeGreaterThan(0)
    expect(filtered).toBeLessThan(totalAll)

    const url = page.url()
    expect(url).toContain('brand=')

    const shared = await context.newPage()
    await gotoAndWaitForFooter(shared, url)
    await expect(cardsOf(shared)).toHaveCount(filtered)
    await expect(shared.getByRole('checkbox').first()).toBeChecked()
    await shared.close()
  })

  test('комбинация фильтров из URL и сброс возвращают ожидаемую выдачу', async ({ page }) => {
    await gotoAndWaitForFooter(page, '/ro/catalog')
    const totalAll = await cardsOf(page).count()

    await gotoAndWaitForFooter(page, '/ro/catalog?brand=maison-orphee&gender=unisex&volume=30')
    const comboCount = await cardsOf(page).count()
    expect(comboCount).toBeGreaterThan(0)
    expect(comboCount).toBeLessThanOrEqual(totalAll)
    expect(page.url()).toContain('brand=maison-orphee')
    expect(page.url()).toContain('gender=unisex')
    expect(page.url()).toContain('volume=30')

    const resetButton = page.getByRole('button', { name: /resetează tot/i }).first()
    let afterReset = comboCount
    await expect(async () => {
      await resetButton.click()
      afterReset = await cardsOf(page).count()
      expect(afterReset).toBe(totalAll)
    }).toPass({ timeout: 10000 })
    expect(page.url()).not.toContain('brand=')
  })
})
