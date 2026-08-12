import { test, expect } from '@playwright/test'
import { gotoAndWaitForFooter } from '../helpers/cart'

const LOCALES = ['ro', 'ru', 'en'] as const
const HEADING_MARKER: Record<(typeof LOCALES)[number], RegExp> = {
  ro: /catalog/i,
  ru: /каталог/i,
  en: /catalog/i,
}

const PAGES = [
  { name: 'home', path: (l: string) => `/${l}` },
  { name: 'catalog', path: (l: string) => `/${l}/catalog` },
  { name: 'product', path: (l: string) => `/${l}/product/maison-orphee-signature-wood` },
]

for (const locale of LOCALES) {
  for (const type of PAGES) {
    test(`smoke: ${type.name} на /${locale} без console errors и missing keys`, async ({
      page,
    }) => {
      const errors: string[] = []
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
      page.on('pageerror', (e) => errors.push(String(e)))

      await gotoAndWaitForFooter(page, type.path(locale))
      await expect(page.locator('h1').first()).toBeVisible()

      const bodyText = await page.locator('body').innerText()
      expect(bodyText).not.toMatch(/MISSING_MESSAGE|IntlError/i)
      expect(errors, errors.join(' | ')).toEqual([])
    })
  }
}

test('smoke: заголовок каталога соответствует локали', async ({ page }) => {
  for (const locale of LOCALES) {
    await gotoAndWaitForFooter(page, `/${locale}/catalog`)
    await expect(page.locator('h1').first()).toHaveText(HEADING_MARKER[locale])
  }
})
