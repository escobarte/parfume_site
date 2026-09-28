import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { gotoAndWaitForFooter } from '../helpers/cart'
import { cardPrices } from '../helpers/catalog'

/**
 * Сортировка на странице поиска (2026-09-28). До этой правки селект сортировки
 * на `/search` был показан, но не работал вообще: выдачу всегда переупорядочивал
 * ранг полнотекстового поиска, перебивая выбор пользователя. Теперь порядок по
 * рангу — это отдельное значение `relevance`, оно же дефолт поиска, а выбор
 * цены/названия сортирует как в каталоге.
 */
const ro = JSON.parse(readFileSync('messages/ro.json', 'utf8'))

/** Термины-кандидаты: берём первый, который даёт выдачу, годную для проверки. */
const TERMS = ['de', 'parfum', 'a']

const sortLabel = (page: Page) =>
  page.getByRole('combobox', { name: ro.Catalog.sort.label })

/**
 * Первый термин, у которого ≥3 карточки и ≥2 разные цены — иначе проверять
 * порядок нечем. Спек не завязан на конкретные товары базы: если подходящего
 * термина нет вовсе, тест честно пропускается, а не «зеленеет» впустую.
 */
async function findTerm(page: Page): Promise<{ term: string; prices: number[] } | null> {
  for (const term of TERMS) {
    await gotoAndWaitForFooter(page, `/ro/search?q=${term}`)
    const prices = await cardPrices(page)
    if (prices.length >= 3 && new Set(prices).size >= 2 && prices.every(Number.isFinite)) {
      return { term, prices }
    }
  }
  return null
}

test.describe('Поиск: сортировка', () => {
  // Попап «первая скидка» перехватывает клики подложкой (см. GOTCHAS.md).
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mf-promo-popup-seen', '1'))
  })

  test('дефолт поиска — «по релевантности», и это видно в селекте', async ({ page }) => {
    await gotoAndWaitForFooter(page, '/ro/search?q=de')
    // Дефолт не пишется в URL, поэтому значение селекта приходит с сервера —
    // иначе он показывал бы «по названию» при выдаче по рангу.
    await expect(sortLabel(page)).toHaveValue('relevance')

    // Явный `?sort=relevance` даёт ровно тот же порядок, что дефолт.
    const byDefault = await cardPrices(page)
    await gotoAndWaitForFooter(page, '/ro/search?q=de&sort=relevance')
    expect(await cardPrices(page)).toEqual(byDefault)
  })

  test('«по релевантности» есть только в поиске, в каталоге его нет', async ({ page }) => {
    await gotoAndWaitForFooter(page, '/ro/search?q=de')
    await expect(sortLabel(page).locator('option[value="relevance"]')).toHaveCount(1)

    await gotoAndWaitForFooter(page, '/ro/catalog')
    await expect(sortLabel(page).locator('option[value="relevance"]')).toHaveCount(0)

    // Значение, набранное руками в каталоге, падает в дефолт — и селект
    // показывает именно то, что применил сервер.
    await gotoAndWaitForFooter(page, '/ro/catalog?sort=relevance')
    await expect(sortLabel(page)).toHaveValue('titleAsc')
  })

  test('выбор цены в поиске реально сортирует выдачу', async ({ page }) => {
    const found = await findTerm(page)
    test.skip(!found, 'в базе нет термина с ≥3 результатами и разными ценами')
    const { term } = found!

    for (const sort of ['priceAsc', 'priceDesc'] as const) {
      await gotoAndWaitForFooter(page, `/ro/search?q=${term}&sort=${sort}`)
      const prices = await cardPrices(page)
      const expected = [...prices].sort((a, b) => (sort === 'priceAsc' ? a - b : b - a))
      expect(prices, `${sort}`).toEqual(expected)
    }
  })

  test('выбор сортировки через селект остаётся в URL и после перезагрузки', async ({ page }) => {
    await gotoAndWaitForFooter(page, '/ro/search?q=de')

    // Выбор до окончания гидрации теряется (см. GOTCHAS.md) — повторяем сам
    // выбор, а не ждём дольше.
    await expect(async () => {
      await sortLabel(page).selectOption('titleAsc')
      await expect(page).toHaveURL(/sort=titleAsc/, { timeout: 3000 })
    }).toPass({ timeout: 30000 })

    // Ключевое: `titleAsc` — дефолт каталожных парсеров, и при `clearOnDefault`
    // он бы вычистился из URL, после чего сервер поиска прочитал бы пустой
    // `?sort=` как релевантность, а селект показывал бы «по названию».
    await gotoAndWaitForFooter(page, page.url().replace(/^https?:\/\/[^/]+/, ''))
    await expect(sortLabel(page)).toHaveValue('titleAsc')

    // Обратный путь: вернуться к релевантности через сам селект. Значения
    // `relevance` нет в каталожном парсере, которым пишет клиентский хук, —
    // проверяем, что оно всё равно доезжает до URL и до сервера.
    await expect(async () => {
      await sortLabel(page).selectOption('relevance')
      await expect(page).toHaveURL(/sort=relevance/, { timeout: 3000 })
    }).toPass({ timeout: 30000 })
    await expect(sortLabel(page)).toHaveValue('relevance')
  })
})
