import type { Page } from '@playwright/test'

/** Общий goto: дожидаемся отрисовки футера, а не «тишины в сети» (RSC-навигация). */
export const gotoAndWaitForFooter = async (page: Page, path: string) => {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.locator('footer').first().waitFor({ timeout: 20000 })
}

/**
 * Клик до окончания гидрации в dev теряется — жмём «Adaugă în coș», пока
 * localStorage не наполнится нужным SKU (см. scripts/check-catalog.mjs).
 */
export const addToCartWithRetry = async (page: Page, skuFragment: string): Promise<boolean> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.getByRole('button', { name: /adaugă în coș/i }).click()
    const added = await page
      .waitForFunction(
        (fragment) => Boolean(localStorage.getItem('mf-cart')?.includes(fragment)),
        skuFragment,
        { timeout: 3000 },
      )
      .then(() => true)
      .catch(() => false)
    if (added) return true
  }
  return false
}
