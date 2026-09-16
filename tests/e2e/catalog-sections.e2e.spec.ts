import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { gotoAndWaitForFooter } from '../helpers/cart'

/**
 * Закрытые разделы левого меню (2026-09-15): For Her / For Him / Kids /
 * Body Care / Lip balm — маршруты со своим scope, а не фильтр `?gender=`.
 * Ожидаемый состав разделов считается из REST (`gender` + `productCategory`),
 * поэтому спек не завязан на конкретные товары dev-базы.
 */
const ro = JSON.parse(readFileSync('messages/ro.json', 'utf8'))

const SECTIONS = {
  forHer: { path: '/ro/catalog/for-her', match: (p: Product) => p.gender === 'female' && p.productCategory === 'perfume' },
  forHim: { path: '/ro/catalog/for-him', match: (p: Product) => p.gender === 'male' && p.productCategory === 'perfume' },
  // Kids — все товары с gender=kids любой категории (решение владельца 2026-09-15).
  kids: { path: '/ro/catalog/kids', match: (p: Product) => p.gender === 'kids' },
  bodyCare: { path: '/ro/catalog/body-care', match: (p: Product) => p.productCategory === 'bodyCare' },
  lipBalm: { path: '/ro/catalog/lip-balm', match: (p: Product) => p.productCategory === 'lipBalm' },
} as const

type Product = { title: string; gender: string | null; productCategory: string }

const cardTitles = async (page: Page) =>
  (await page.locator('main article h3').allInnerTexts()).map((title) => title.trim())

const openFilters = async (page: Page) => {
  const dialog = page.getByRole('dialog')
  // Клик до окончания гидрации в dev теряется (см. GOTCHAS.md).
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await page.getByRole('button', { name: /^filtre/i }).click()
    }
    await expect(dialog).toBeVisible()
  }).toPass({ timeout: 10000 })
  return dialog
}

test.describe('Каталог: закрытые разделы левого меню', () => {
  // Попап «первая скидка» всплывает через 2 с на любой странице витрины и
  // перехватывает клики подложкой (см. GOTCHAS.md) — спека не про него.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mf-promo-popup-seen', '1'))
  })

  test('состав каждого раздела совпадает с gender/productCategory, разделы кроме Kids не пересекаются', async ({
    page,
    request,
  }) => {
    const response = await request.get('/api/products?limit=500&depth=0&locale=ro')
    const products = (await response.json()).docs as Product[]

    const seen = new Map<string, string>()
    for (const [key, section] of Object.entries(SECTIONS)) {
      await gotoAndWaitForFooter(page, section.path)
      const expected = products.filter(section.match).map((p) => p.title).sort()
      const actual = (await cardTitles(page)).sort()
      expect(actual, key).toEqual(expected)

      // Детский уход/бальзам по правилу виден и в Kids, и в Body Care / Lip balm.
      if (key === 'kids') continue
      for (const title of actual) {
        expect(seen.get(title), `«${title}» уже есть в разделе ${seen.get(title)}`).toBeUndefined()
        seen.set(title, key)
      }
    }
  })

  test('пол-раздел: тулбар виден, фасета «Кому» нет, фильтры и сортировка не выводят из раздела', async ({
    page,
  }) => {
    await gotoAndWaitForFooter(page, '/ro/catalog/for-her')
    // Узко: у хлебных крошек тоже есть aria-current="page".
    await expect(
      page.getByRole('navigation', { name: ro.CatalogNav.title }).locator('[aria-current="page"]'),
    ).toHaveText(ro.CatalogNav.forHer)

    const dialog = await openFilters(page)
    await expect(dialog.getByText(ro.Catalog.filters.gender, { exact: true })).toHaveCount(0)

    // Дровер не закрываем через Escape: через 2 с поверх может открыться попап
    // промокода — второй role="dialog" (см. GOTCHAS.md). Чистый заход надёжнее.
    await gotoAndWaitForFooter(page, '/ro/catalog/for-her')
    // Выбор в селекте до конца гидрации теряется (см. GOTCHAS.md), а под
    // нагрузкой полного прогона это ловится регулярно. Поэтому повторяем само
    // действие, а не просто ждём адрес дольше: ожидание не вернёт потерянный клик.
    await expect(async () => {
      await page.getByRole('combobox', { name: ro.Catalog.sort.label }).selectOption('priceDesc')
      await expect(page).toHaveURL(/\/ro\/catalog\/for-her\?.*sort=priceDesc/, { timeout: 3000 })
    }).toPass({ timeout: 30000 })
  })

  test('?gender= на пол-разделе игнорируется — выдача та же, что без параметра', async ({ page }) => {
    await gotoAndWaitForFooter(page, '/ro/catalog/for-her')
    const plain = (await cardTitles(page)).sort()

    await gotoAndWaitForFooter(page, '/ro/catalog/for-her?gender=male')
    expect((await cardTitles(page)).sort()).toEqual(plain)
  })

  test('Body Care и Lip balm: тулбар с фильтрами и сортировкой виден', async ({ page }) => {
    for (const path of [SECTIONS.bodyCare.path, SECTIONS.lipBalm.path]) {
      await gotoAndWaitForFooter(page, path)
      await expect(page.getByRole('button', { name: /^filtre/i })).toBeVisible()
      await expect(page.getByRole('combobox', { name: ro.Catalog.sort.label })).toBeVisible()
    }
  })

  test('Gift Card / Gift Box: сортировка по цене, фильтров нет', async ({ page, request }) => {
    for (const [path, type] of [
      ['/ro/gift-certificates', 'certificate'],
      ['/ro/gift-box', 'giftBox'],
    ] as const) {
      const response = await request.get(
        `/api/gift-items?limit=100&depth=0&locale=ro&where[type][equals]=${type}`,
      )
      const items = (await response.json()).docs as { title: string; minPrice: number }[]
      test.skip(items.length < 2, `${path}: меньше двух позиций — сортировать нечего`)

      await gotoAndWaitForFooter(page, path)
      await expect(page.getByRole('button', { name: /^filtre/i })).toHaveCount(0)

      for (const sort of ['priceAsc', 'priceDesc'] as const) {
        const expected = [...items]
          .sort((a, b) => (sort === 'priceAsc' ? a.minPrice - b.minPrice : b.minPrice - a.minPrice))
          .map((item) => item.title)
        // Тот же приём, что выше: повтор выбора, а не более длинное ожидание.
        await expect(async () => {
          await page.getByRole('combobox', { name: ro.Catalog.sort.label }).selectOption(sort)
          await expect(page).toHaveURL(new RegExp(`sort=${sort}`), { timeout: 3000 })
        }).toPass({ timeout: 30000 })
        await expect.poll(() => cardTitles(page)).toEqual(expected)
      }
    }
  })
})
