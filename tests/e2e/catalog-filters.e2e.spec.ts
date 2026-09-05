import { test, expect } from '@playwright/test'
import { gotoAndWaitForFooter } from '../helpers/cart'

const cardsOf = (page: import('@playwright/test').Page) => page.locator('article a[href*="/product/"]')

/**
 * С фазы 9.1 фильтры на всех разрешениях спрятаны в дровер: сначала кнопка
 * «Filtre», потом уже фасеты внутри диалога.
 */
const openFilters = async (page: import('@playwright/test').Page) => {
  const dialog = page.getByRole('dialog')
  // Клик до окончания гидрации в dev теряется (см. GOTCHAS.md) — жмём,
  // пока диалог действительно не откроется.
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await page.getByRole('button', { name: /^filtre/i }).click()
    }
    await expect(dialog).toBeVisible()
  }).toPass({ timeout: 10000 })
  return dialog
}

test.describe('Каталог: фильтры и URL-состояние', () => {
  test('фильтр по бренду сужает выдачу, уходит в URL и воспроизводится по ссылке', async ({
    page,
    context,
  }) => {
    await gotoAndWaitForFooter(page, '/ro/catalog')
    const totalAll = await cardsOf(page).count()
    expect(totalAll).toBeGreaterThan(0)

    const dialog = await openFilters(page)
    const checkbox = dialog.getByRole('checkbox').first()
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
    const sharedDialog = await openFilters(shared)
    await expect(sharedDialog.getByRole('checkbox').first()).toBeChecked()
    await shared.close()
  })

  test('дровер закрывается и не двигает сетку товаров по ширине', async ({ page }) => {
    await gotoAndWaitForFooter(page, '/ro/catalog')
    const grid = cardsOf(page).first()
    const before = await grid.boundingBox()

    const dialog = await openFilters(page)
    const during = await grid.boundingBox()
    expect(during?.x).toBe(before?.x)
    expect(during?.width).toBe(before?.width)

    await dialog.getByRole('button', { name: /arată rezultatele/i }).click()
    await expect(dialog).toBeHidden()
    const after = await grid.boundingBox()
    expect(after?.x).toBe(before?.x)
    expect(after?.width).toBe(before?.width)
  })

  test('комбинация фильтров из URL и сброс возвращают ожидаемую выдачу', async ({ page }) => {
    await gotoAndWaitForFooter(page, '/ro/catalog')
    const totalAll = await cardsOf(page).count()

    // Объём/ноты убраны из фильтров (фаза 11.1, задача 3) — комбинация теперь
    // бренд+кому+страна-производитель («страна» демо-каталог не сужает: все
    // товары бэкфилились дефолтом 'europe', но параметр не должен ронять выдачу).
    await gotoAndWaitForFooter(page, '/ro/catalog?brand=maison-orphee&gender=unisex&country=europe')
    const comboCount = await cardsOf(page).count()
    expect(comboCount).toBeGreaterThan(0)
    expect(comboCount).toBeLessThanOrEqual(totalAll)
    expect(page.url()).toContain('brand=maison-orphee')
    expect(page.url()).toContain('gender=unisex')
    expect(page.url()).toContain('country=europe')

    // Сброс доступен и снаружи дровера — строкой активных фильтров. Она же
    // после сброса исчезает вместе с кнопкой, поэтому повторно жмём только
    // пока кнопка на месте (клик до гидрации в dev теряется, см. GOTCHAS.md).
    const resetButton = page.getByRole('button', { name: /resetează tot/i }).first()
    await expect(async () => {
      if (await resetButton.isVisible()) await resetButton.click()
      expect(page.url()).not.toContain('brand=')
    }).toPass({ timeout: 10000 })
    await expect(cardsOf(page)).toHaveCount(totalAll)
  })
})
