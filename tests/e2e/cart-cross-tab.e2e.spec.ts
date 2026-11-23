import { test, expect, type Page } from '@playwright/test'
import { gotoAndWaitForFooter } from '../helpers/cart'

/**
 * Корзина в нескольких вкладках (баг 2026-11-23, жалоба покупательницы):
 * каждая вкладка держала свою копию стора и при любой записи — даже при
 * ревалидации цен на /cart — затирала localStorage устаревшей памятью.
 * Все сценарии — один browser context (общий localStorage), две страницы.
 *
 * Попап «первая скидка» глушится на уровне context (docs/GOTCHAS.md).
 */

const WOOD = { path: '/ro/product/maison-orphee-signature-wood', sku: 'MO-SW-05', title: 'Signature Wood' }
const ROSE = { path: '/ro/product/casa-lumina-trandafir-de-mai', sku: 'CL-TM-05', title: 'Trandafir de Mai' }

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('mf-promo-popup-seen', '1'))
})

/** Количество позиции по SKU в общем localStorage (0 — нет в корзине). */
const storedQty = (page: Page, sku: string) =>
  page.evaluate((fragment) => {
    try {
      const raw = localStorage.getItem('mf-cart')
      const items = (raw ? JSON.parse(raw).state.items : []) as { sku: string; qty: number }[]
      return items.find((item) => item.sku === fragment)?.qty ?? 0
    } catch {
      return 0
    }
  }, sku)

/**
 * «В корзину» с повтором на потерянный до гидрации клик. Общий хелпер
 * `addToCartWithRetry` здесь не годится: он ждёт ПОЯВЛЕНИЯ sku в
 * localStorage, а в сценариях с двумя вкладками sku там может уже лежать —
 * ждём роста количества.
 */
const addToCart = async (page: Page, sku: string) => {
  const before = await storedQty(page, sku)
  await expect(async () => {
    if ((await storedQty(page, sku)) > before) return
    await page.getByRole('button', { name: /adaugă în coș/i }).click()
    await expect.poll(() => storedQty(page, sku), { timeout: 3000 }).toBeGreaterThan(before)
  }).toPass({ timeout: 20000 })
}

const badge = (page: Page) => page.locator('header a[href$="/cart"] span')
const row = (page: Page, title: string) => page.locator('li', { hasText: title })
const qtyOf = (page: Page, title: string) =>
  row(page, title)
    .first()
    .locator('div.rounded-sm.border', { has: page.locator('span.tabular-nums') })
    .first()
    .locator('span.tabular-nums')

/** Переход на /cart кликом по иконке в шапке — клиентская навигация, без перезагрузки. */
const openCartViaHeader = async (page: Page) => {
  await page.locator('header a[href$="/cart"]').first().click()
  await page.waitForURL(/\/cart$/, { timeout: 20000 })
}

test('а) товар из вкладки, открытой позже, не теряется при открытии /cart в первой', async ({
  page: tabA,
  context,
}) => {
  await gotoAndWaitForFooter(tabA, WOOD.path)
  await addToCart(tabA, WOOD.sku)

  const tabB = await context.newPage()
  await gotoAndWaitForFooter(tabB, ROSE.path)
  await expect(badge(tabB)).toHaveText('1')
  await addToCart(tabB, ROSE.sku)

  await tabA.bringToFront()
  await openCartViaHeader(tabA)
  await expect(row(tabA, WOOD.title).first()).toBeVisible({ timeout: 15000 })
  await expect(row(tabA, ROSE.title).first()).toBeVisible()
  // Ревалидация цен на /cart отработала и ничего не затёрла.
  await tabA.waitForLoadState('networkidle')
  expect(await storedQty(tabA, ROSE.sku)).toBe(1)

  for (const tab of [tabA, tabB]) {
    await gotoAndWaitForFooter(tab, '/ro/cart')
    await tab.reload({ waitUntil: 'domcontentloaded' })
    await expect(row(tab, WOOD.title).first()).toBeVisible({ timeout: 15000 })
    await expect(row(tab, ROSE.title).first()).toBeVisible()
  }
})

test('б+д) обе вкладки открыты заранее: оба товара в корзине, счётчик неактивной обновляется', async ({
  page: tabA,
  context,
}) => {
  await gotoAndWaitForFooter(tabA, WOOD.path)
  const tabB = await context.newPage()
  await gotoAndWaitForFooter(tabB, ROSE.path)

  await tabA.bringToFront()
  await addToCart(tabA, WOOD.sku)
  // Вкладка B не активна и не перезагружалась — счётчик всё равно свежий.
  await expect(badge(tabB)).toHaveText('1')

  await tabB.bringToFront()
  await addToCart(tabB, ROSE.sku)
  await expect(badge(tabA)).toHaveText('2')

  await tabA.bringToFront()
  await openCartViaHeader(tabA)
  await expect(row(tabA, WOOD.title).first()).toBeVisible({ timeout: 15000 })
  await expect(row(tabA, ROSE.title).first()).toBeVisible()
})

test('в) удаление в одной вкладке видно в другой и не воскресает после добавления', async ({
  page: tabA,
  context,
}) => {
  await gotoAndWaitForFooter(tabA, WOOD.path)
  await addToCart(tabA, WOOD.sku)
  await gotoAndWaitForFooter(tabA, ROSE.path)
  await addToCart(tabA, ROSE.sku)

  await gotoAndWaitForFooter(tabA, '/ro/cart')
  const tabB = await context.newPage()
  await gotoAndWaitForFooter(tabB, '/ro/cart')
  await expect(row(tabB, ROSE.title).first()).toBeVisible({ timeout: 15000 })

  await tabA.bringToFront()
  await expect(async () => {
    await row(tabA, ROSE.title).first().getByRole('button', { name: 'Șterge' }).click()
    await expect(row(tabA, ROSE.title)).toHaveCount(0, { timeout: 1000 })
  }).toPass({ timeout: 10000 })

  // Вкладка B без перезагрузки видит удаление.
  await expect(row(tabB, ROSE.title)).toHaveCount(0)
  await expect(badge(tabB)).toHaveText('1')

  // B уходит на товар клиентской навигацией (память вкладки не сбрасывается)
  // и добавляет ещё штуку — удалённый товар не должен вернуться.
  await tabB.bringToFront()
  await tabB.getByRole('link', { name: WOOD.title }).first().click()
  await tabB.waitForURL(/maison-orphee-signature-wood/, { timeout: 20000 })
  await addToCart(tabB, WOOD.sku)

  expect(await storedQty(tabB, ROSE.sku)).toBe(0)
  expect(await storedQty(tabB, WOOD.sku)).toBe(2)
  await expect(qtyOf(tabA, WOOD.title)).toHaveText('2')
  await expect(row(tabA, ROSE.title)).toHaveCount(0)
})

test('г) изменение количества в одной вкладке синхронно в другой', async ({ page: tabA, context }) => {
  await gotoAndWaitForFooter(tabA, WOOD.path)
  await addToCart(tabA, WOOD.sku)

  await gotoAndWaitForFooter(tabA, '/ro/cart')
  const tabB = await context.newPage()
  await gotoAndWaitForFooter(tabB, '/ro/cart')
  await expect(qtyOf(tabB, WOOD.title)).toHaveText('1', { timeout: 15000 })

  await tabA.bringToFront()
  const plus = row(tabA, WOOD.title)
    .first()
    .locator('div.rounded-sm.border', { has: tabA.locator('span.tabular-nums') })
    .first()
    .locator('button')
    .nth(1)
  await expect(async () => {
    await plus.click()
    await expect(qtyOf(tabA, WOOD.title)).toHaveText('2', { timeout: 1000 })
  }).toPass({ timeout: 10000 })

  await expect(qtyOf(tabB, WOOD.title)).toHaveText('2')
  await expect(badge(tabB)).toHaveText('2')
})
