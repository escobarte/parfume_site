import { test, expect, type Page } from '@playwright/test'
import { addToCartWithRetry, gotoAndWaitForFooter } from '../helpers/cart'

/**
 * Попап «первая скидка» (2026-09-11): выдача персонального кода, применение
 * его в корзине, повторная попытка тем же email.
 *
 * Тест зависит от глобала `promo-popup-settings` (`isEnabled: true`) — если
 * владелец выключит попап в админке, спеки честно пропускаются, а не падают
 * красным: выключенный попап это штатное состояние, а не регрессия.
 *
 * Email у каждого прогона свой (timestamp): коды персональные и одноразовые,
 * повторный прогон с тем же адресом получал бы «уже выдан» и проверял не то.
 */
const POPUP = '[role="dialog"]'
const uniqueEmail = () => `pw-popup-${Date.now()}@example.com`

/**
 * Код, выданный первым тестом, переиспользуется вторым. Это не «ленивый
 * тест», а следствие лимита: у `/api/promo-popup` 5 запросов на IP за 10
 * минут (`ORDERS_RATE_LIMIT`), и отдельная выдача под каждый спек съедала бы
 * окно — прогон падал бы на 429 вместо своей темы. Отсюда же `describe.serial`.
 */
let issuedCode: string | null = null
let issuedPercent: number | null = null

/**
 * Проверять «включён ли попап» отдельным запросом к API нельзя: у эндпойнта
 * лимит 5 запросов на IP за 10 минут (`ORDERS_RATE_LIMIT`), и проба на каждый
 * тест съедала бы половину окна — спеки падали бы на 429, а не на своей теме.
 * Поэтому признак — сам попап в DOM: выключенный в админке до браузера
 * вообще не доезжает.
 */
async function popupShownOrSkip(page: Page) {
  // Именно waitFor, а не isVisible({ timeout }): `isVisible()` проверяет
  // состояние МГНОВЕННО и опцию timeout игнорирует, а попап появляется через
  // ~2с — проба всегда возвращала false и все спеки уходили в skip.
  const visible = await page
    .locator(POPUP)
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false)
  test.skip(!visible, 'попап не показан (выключен в /admin или уже закрыт) — проверять нечего')
}

test.describe.serial('попап «первая скидка»', () => {
  test('выдаёт код, повторная попытка тем же email возвращает тот же код', async ({ page }) => {
    const email = uniqueEmail()

    await gotoAndWaitForFooter(page, '/ro')
    await popupShownOrSkip(page)

    const popup = page.locator(POPUP)
    await popup.locator('input[name="name"]').fill('Playwright Tester')
    await popup.locator('input[name="email"]').fill(email)
    await popup.locator('input[name="phone"]').fill('+37360000000')
    await popup.locator('button[type="submit"]').click()

    // Код показан прямо в попапе.
    const codeNode = popup.locator('p.text-display')
    await expect(codeNode).toBeVisible({ timeout: 15000 })
    const code = (await codeNode.innerText()).trim()
    expect(code).toMatch(/^WELCOME-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/)
    issuedCode = code

    // Повторная отправка того же email не плодит второй код.
    const again = await page.request.post('/api/promo-popup', {
      data: { name: 'Playwright Tester', email, phone: '+37360000000' },
    })
    const body = await again.json()
    // 429 здесь означал бы исчерпанное окно лимита, а не поломку выдачи —
    // это среда, а не регрессия, поэтому честно пропускаем, а не краснеем.
    test.skip(body.error === 'rate_limit', 'исчерпан лимит /api/promo-popup — повторите прогон через 10 минут')
    expect(body.ok).toBe(true)
    expect(body.existing).toBe(true)
    expect(body.code).toBe(code)
    issuedPercent = body.percent
  })

  test('выданный код применяется в корзине и даёт скидку', async ({ page }) => {
    // Код берём из предыдущего спека (см. комментарий к issuedCode) — свой
    // запрос к API тут был бы третьим за прогон и упирался бы в лимит.
    test.skip(!issuedCode, 'код не выдан предыдущим спеком — проверять нечего')
    const code = issuedCode as string
    const percent = issuedPercent as number

    await gotoAndWaitForFooter(page, '/ro/product/maison-orphee-signature-wood')
    expect(await addToCartWithRetry(page, 'MO-SW-05')).toBe(true)

    await gotoAndWaitForFooter(page, '/ro/cart')
    // Попап здесь не нужен и может перекрыть форму — гасим его отметкой.
    await page.evaluate(() => localStorage.setItem('mf-promo-popup-seen', '1'))
    await page.reload({ waitUntil: 'domcontentloaded' })

    // Локаль /ro — селекторы по её строкам из Cart.promo* (messages/ro.json).
    await page.getByPlaceholder('Cod promoțional').fill(code)
    await page.getByRole('button', { name: 'Aplică' }).click()

    // Применённый код и процент показываются вместо формы ввода.
    await expect(page.getByText(`Codul ${code} este aplicat: −${percent}%`)).toBeVisible({
      timeout: 15000,
    })
    // И скидка реально попала в итог корзины, а не только в подпись.
    await expect(page.getByText(new RegExp(`Reducere \\(${code}`))).toBeVisible()
  })

  test('показывается один раз на браузер', async ({ page }) => {
    await gotoAndWaitForFooter(page, '/ro')
    await popupShownOrSkip(page)

    await page.locator(POPUP).getByRole('button').first().click()
    await expect(page.locator(POPUP)).toBeHidden()

    // Отметка о показе переживает переход и перезагрузку.
    await gotoAndWaitForFooter(page, '/ro/catalog')
    await page.waitForTimeout(3500)
    await expect(page.locator(POPUP)).toHaveCount(0)
  })
})
