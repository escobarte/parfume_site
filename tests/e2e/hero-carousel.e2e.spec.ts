import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'
import { gotoAndWaitForFooter } from '../helpers/cart'
import {
  adminToken,
  deleteMedia,
  readBanners,
  uploadMedia,
  writeBanners,
  type BannerInput,
} from '../helpers/heroBanners'

/**
 * Карусель баннеров главной (2026-09-14). Баннеры заводятся через REST
 * админа поверх текущих, после файла прежние возвращаются, загруженные
 * картинки удаляются. Спеки последовательны: все пишут в один глобал.
 *
 * После записи глобала витрина иногда отдаёт ещё старый кэш на первый
 * запрос (docs/GOTCHAS.md, «revalidateTag после правки глобала») — поэтому
 * проверки страницы обёрнуты в перезагрузку до совпадения.
 */

const CAROUSEL = 'section[aria-roledescription="carousel"]'

const pngOf = (background: string) =>
  sharp({ create: { width: 1920, height: 800, channels: 3, background } })
    .png()
    .toBuffer()

/** next/image кладёт исходный путь в `?url=` — ищем картинку по имени файла. */
const bannerImage = (page: Page, filename: string) =>
  page.locator(`main img[src*="${encodeURIComponent(filename)}"]`)

/** Перезагружать страницу, пока проверка не пройдёт (кэш витрины). */
const eventually = async (page: Page, path: string, assertion: () => Promise<void>) => {
  await expect(async () => {
    await gotoAndWaitForFooter(page, path)
    await assertion()
  }).toPass({ timeout: 30000 })
}

test.describe.serial('Главная: карусель баннеров', () => {
  let baseURL = ''
  let token = ''
  let original: BannerInput[] = []
  const media: { id: number; filename: string }[] = []

  test.beforeAll(async ({ request }, testInfo) => {
    baseURL = testInfo.project.use.baseURL ?? 'http://localhost:3000'
    token = await adminToken(request, baseURL)
    original = await readBanners(request, baseURL, token)
    for (const [index, color] of ['#16293d', '#e8cfb0', '#4a5a6b'].entries()) {
      media.push(await uploadMedia(request, baseURL, token, `e2e-hero-${index + 1}.png`, await pngOf(color)))
    }
  })

  // Попап «первая скидка» открывается через 2 с на любой странице и
  // перехватывает клики — спек про карусель, поэтому попап помечен
  // уже показанным ещё до загрузки страницы.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mf-promo-popup-seen', '1'))
  })

  test.afterAll(async ({ request }) => {
    await writeBanners(request, baseURL, token, original)
    for (const item of media) await deleteMedia(request, baseURL, token, item.id)
  })

  test('нет баннеров — секции нет, заголовок страницы остаётся', async ({ page, request }) => {
    await writeBanners(request, baseURL, token, [])
    await eventually(page, '/ro', async () => {
      await expect(page.locator(CAROUSEL)).toHaveCount(0)
      await expect(page.locator('main img[src*="e2e-hero"]')).toHaveCount(0)
    })
    await expect(page.locator('h1')).toHaveCount(1)
  })

  test('новый баннер без картинки ни на одном языке не сохраняется', async ({ request }) => {
    const response = await request.post(`${baseURL}/api/globals/homepage?locale=ro`, {
      headers: { Authorization: `JWT ${token}` },
      data: { heroBanners: [{ enabled: true, image: null }] },
    })
    expect(response.status()).toBe(400)
    expect(await response.text()).toContain('хотя бы на одном языке')
  })

  test('один баннер — статичная картинка, весь баннер — ссылка, без индикаторов', async ({
    page,
    request,
  }) => {
    await writeBanners(request, baseURL, token, [
      {
        image: { ro: media[0].id },
        alt: { ro: 'Флаконы на камне' },
        linkMode: 'system',
        link: 'catalogDiscounted',
      },
    ])
    await eventually(page, '/ro', async () => {
      await expect(bannerImage(page, media[0].filename)).toBeVisible()
    })
    const link = page.locator('main a[href="/ro/catalog?flags=hasDiscount"]')
    await expect(link.locator('img')).toHaveAttribute('alt', 'Флаконы на камне')
    await expect(page.locator(CAROUSEL)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /bannerul/i })).toHaveCount(0)
  })

  test('картинка, загруженная только на ru, показывается на ro и en', async ({
    page,
    request,
  }) => {
    await writeBanners(request, baseURL, token, [{ image: { ru: media[1].id } }])
    for (const locale of ['ru', 'ro', 'en']) {
      await eventually(page, `/${locale}`, async () => {
        await expect(bannerImage(page, media[1].filename)).toBeVisible()
      })
    }
  })

  test('выключенный баннер скрыт, не удаляясь', async ({ page, request }) => {
    await writeBanners(request, baseURL, token, [
      { enabled: false, image: { ro: media[0].id } },
      { image: { ro: media[1].id } },
    ])
    await eventually(page, '/ro', async () => {
      await expect(bannerImage(page, media[1].filename)).toBeVisible()
      await expect(bannerImage(page, media[0].filename)).toHaveCount(0)
    })
    await expect(page.locator(CAROUSEL)).toHaveCount(0)
  })

  test('картинки под ширину экрана: скачивается только нужная, пустые слоты — десктопная', async ({
    browser,
    page,
    request,
  }) => {
    // Одиннадцать отдельных контекстов браузера (по одному на ширину, чтобы
    // список скачанных файлов был чистым) — в стандартные 30 с не укладываются.
    test.setTimeout(120_000)

    /** Открыть /ro на ширине и вернуть выбранную браузером картинку и все запрошенные e2e-файлы. */
    const shownAt = async (width: number) => {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      await context.addInitScript(() => localStorage.setItem('mf-promo-popup-seen', '1'))
      const tab = await context.newPage()
      const requested: string[] = []
      tab.on('request', (req) => {
        if (req.url().includes('e2e-hero')) requested.push(decodeURIComponent(req.url()))
      })
      await gotoAndWaitForFooter(tab, '/ro')
      const img = tab.locator('main picture img').first()
      await expect(img).toHaveJSProperty('complete', true)
      const current = await img.evaluate((node: HTMLImageElement) => decodeURIComponent(node.currentSrc))
      await context.close()
      return { current, requested }
    }

    await writeBanners(request, baseURL, token, [
      {
        image: { ro: media[0].id },
        imageTablet: { ro: media[1].id },
        imageMobile: { ro: media[2].id },
      },
    ])
    // Прогрев кэша витрины: дальше каждую ширину открываем ровно один раз,
    // чтобы список запросов не смешался со старой закэшированной разметкой.
    await eventually(page, '/ro', async () => {
      await expect(page.locator('main picture source')).toHaveCount(2)
    })

    for (const [width, expected] of [
      [1280, media[0]],
      [1024, media[0]],
      [1023, media[1]],
      [768, media[1]],
      [767, media[2]],
      [390, media[2]],
    ] as const) {
      const { current, requested } = await shownAt(width)
      expect(current, `${width}px`).toContain(expected.filename)
      for (const other of media.filter((item) => item !== expected)) {
        expect(
          requested.some((url) => url.includes(other.filename)),
          `${width}px не должен скачивать ${other.filename}`,
        ).toBe(false)
      }
    }

    // Старый баннер — только десктопная: она на всех ширинах, <source> не нужны.
    await writeBanners(request, baseURL, token, [{ image: { ro: media[0].id } }])
    await eventually(page, '/ro', async () => {
      await expect(page.locator('main picture source')).toHaveCount(0)
      await expect(bannerImage(page, media[0].filename)).toBeVisible()
    })
    for (const width of [1280, 768, 390]) {
      expect((await shownAt(width)).current, `${width}px`).toContain(media[0].filename)
    }

    // Только мобильная: планшет и десктоп делят одну десктопную — один <source>.
    await writeBanners(request, baseURL, token, [
      { image: { ro: media[0].id }, imageMobile: { en: media[2].id } },
    ])
    await eventually(page, '/ro', async () => {
      await expect(page.locator('main picture source')).toHaveCount(1)
    })
    expect((await shownAt(768)).current).toContain(media[0].filename)
    expect((await shownAt(390)).current, 'мобильная с другого языка').toContain(media[2].filename)
  })

  test('карусель: индикаторы, переход по клику, клик по баннеру, автопрокрутка и пауза', async ({
    page,
    request,
  }) => {
    await writeBanners(request, baseURL, token, [
      { image: { ro: media[0].id }, alt: { ro: 'Первый' }, linkMode: 'system', link: 'catalog' },
      { image: { ro: media[1].id }, alt: { ro: 'Второй' }, linkMode: 'system', link: 'brands' },
      { image: { ro: media[2].id }, alt: { ro: 'Третий' }, linkOverride: '/catalog?flags=isNew' },
    ])
    await eventually(page, '/ro', async () => {
      await expect(page.locator(CAROUSEL)).toBeVisible()
    })

    const carousel = page.locator(CAROUSEL)
    const dots = carousel.getByRole('button', { name: /bannerul/i })
    const activeSlide = carousel.locator('[aria-roledescription="slide"][data-active="true"]')
    await expect(dots).toHaveCount(3)
    await expect(dots.first()).toHaveAttribute('aria-current', 'true')
    await expect(activeSlide.locator('img')).toHaveAttribute('alt', 'Первый')

    // Порядок слайдов = порядок строк массива; неактивные недоступны с клавиатуры.
    await expect(carousel.locator('[aria-roledescription="slide"] img')).toHaveCount(3)
    await expect(carousel.locator('[aria-roledescription="slide"][inert]')).toHaveCount(2)

    // Курсор над каруселью — автопрокрутка стоит (клик до гидрации теряется — повторяем).
    await expect(async () => {
      await dots.nth(2).click()
      await expect(activeSlide.locator('img')).toHaveAttribute('alt', 'Третий', { timeout: 1500 })
    }).toPass({ timeout: 15000 })
    await page.waitForTimeout(7000)
    await expect(activeSlide.locator('img')).toHaveAttribute('alt', 'Третий')

    // Курсор ушёл — через интервал слайд сменился сам (с третьего по кругу на первый).
    await page.mouse.move(5, 5)
    await expect(activeSlide.locator('img')).toHaveAttribute('alt', 'Первый', { timeout: 9000 })

    // Клик по любому месту активного баннера ведёт по его ссылке.
    await activeSlide.click({ position: { x: 40, y: 40 } })
    await page.waitForURL(/\/ro\/catalog$/, { timeout: 20000 })
  })
})
