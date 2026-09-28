import type { Page } from '@playwright/test'

/** Названия карточек в порядке выдачи. */
export const cardTitles = async (page: Page) =>
  (await page.locator('main article h3').allInnerTexts()).map((title) => title.trim())

/**
 * Цены, НАПЕЧАТАННЫЕ на карточках, в порядке выдачи — ожидание для проверок
 * сортировки и фильтра цены берётся из того, что видит пользователь, а не из
 * того же поля, которым пользуется проверяемый код (см. docs/GOTCHAS.md: на
 * этом жил баг сортировки по `minPrice` до 2026-09-27).
 *
 * В карточке «MDL» встречается один раз без скидки и дважды со скидкой
 * (зачёркнутая старая цена идёт ПЕРВОЙ) — берём последнее совпадение.
 * Разделитель тысяч зависит от локали, поэтому оставляем только цифры
 * (дробной части у цен нет — `maximumFractionDigits: 0`).
 */
export const cardPrices = async (page: Page): Promise<number[]> =>
  (await page.locator('main article').allInnerTexts()).map((text) => {
    const matches = [...text.matchAll(/([\d\s., ]+)MDL/g)]
    const last = matches.at(-1)
    return last ? Number(last[1].replace(/\D/g, '')) : NaN
  })
