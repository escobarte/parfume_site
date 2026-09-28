import { test, expect } from '@playwright/test'
import { adminToken } from '../helpers/heroBanners'
import { createPageViaCli, deletePageViaCli } from '../helpers/pages'

// Не импортируется из '@/lib/content/pages' напрямую: тот модуль тянет
// 'next/cache', недоступный вне рантайма Next (Playwright тест — обычный
// Node-процесс). Источник истины — src/lib/content/pages.ts, список сверен
// вручную; международный набор проверяется отдельно int-тестом
// tests/int/pages.int.spec.ts (там модуль импортируется как обычно).
const SYSTEM_PAGE_SLUGS = ['about', 'delivery', 'returns', 'contacts'] as const
const SAMPLE_RESERVED_SLUGS = ['catalog', 'admin', 'robots-txt'] as const

/**
 * Общий маршрут `[locale]/[slug]` (2026-09-28) поверх коллекции `Pages`.
 * Страница `protection` заводится через ОТДЕЛЬНЫЙ процесс (Local API,
 * `tests/helpers/pagesCliScript.ts`), а не через REST запущенного
 * dev-сервера — так воспроизводится ровно тот сценарий из `docs/GOTCHAS.md`
 * («закэшированный null у getPageBySlug»), из-за которого промах больше не
 * кладётся в кэш: без этого документ, только что созданный CLI-процессом,
 * продолжал бы 404-ить до истечения TTL, потому что revalidateTag из чужого
 * процесса не долетает до уже запущенного сервера.
 */

const PROTECTION_SLUG = 'protection'

test.describe('Динамическая страница Pages ([locale]/[slug])', () => {
  test.beforeEach(async ({ page }) => {
    // Попап «первая скидка» перехватывает клики подложкой (см. GOTCHAS.md).
    await page.addInitScript(() => localStorage.setItem('mf-promo-popup-seen', '1'))
  })

  test('несуществующий slug даёт настоящий 404 (не 200) — до и после проверки страницы', async ({
    request,
  }) => {
    const before = await request.get('/ro/totally-nonexistent-slug-zzz', { maxRedirects: 0 })
    expect(before.status()).toBe(404)
  })

  test('/ro/a/b — многосегментный неизвестный путь по-прежнему ловится catch-all и даёт 404', async ({
    request,
  }) => {
    const res = await request.get('/ro/a/b', { maxRedirects: 0 })
    expect(res.status()).toBe(404)
  })

  test('четыре системные страницы и catalog/brands/cart открываются как раньше', async ({
    request,
  }) => {
    for (const slug of SYSTEM_PAGE_SLUGS) {
      const res = await request.get(`/ru/${slug}`)
      expect(res.status(), `/ru/${slug}`).toBe(200)
    }
    for (const path of ['/ro/catalog', '/ro/brands', '/ro/cart']) {
      const res = await request.get(path)
      expect(res.status(), path).toBe(200)
    }
  })

  test.describe('страница protection — создана Local API в отдельном процессе', () => {
    test.beforeAll(async () => {
      await createPageViaCli(PROTECTION_SLUG, 'Protecția datelor')
    })

    test.afterAll(async () => {
      await deletePageViaCli(PROTECTION_SLUG)
    })

    test('открывается на всех трёх локалях, статус 200', async ({ request }) => {
      for (const locale of ['ro', 'ru', 'en'] as const) {
        const res = await request.get(`/${locale}/${PROTECTION_SLUG}`)
        expect(res.status(), `/${locale}/${PROTECTION_SLUG}`).toBe(200)
      }
    })

    test('рендерит хлебные крошки, заголовок — вживую в браузере', async ({ page }) => {
      await page.goto(`/ro/${PROTECTION_SLUG}`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/protec/i)
      await expect(page.locator('nav').first()).toBeVisible()
    })

    test('попадает в sitemap.xml тремя записями — по одной на локаль', async ({ request }) => {
      const res = await request.get('/sitemap.xml')
      const xml = await res.text()
      const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
      const matches = locs.filter((url) => url.endsWith(`/${PROTECTION_SLUG}`))
      expect(matches).toHaveLength(3)
      for (const locale of ['ro', 'ru', 'en']) {
        expect(
          matches.some((url) => url.includes(`/${locale}/${PROTECTION_SLUG}`)),
          locale,
        ).toBe(true)
      }
    })
  })

  test.describe('закэшированный промах не залипает (docs/GOTCHAS.md)', () => {
    // Slug с меткой времени — каждый прогон бьёт по СВОЕМУ ключу кэша, иначе
    // положительный результат прошлого прогона (страница уже была найдена
    // и закэширована) даёт ложный «уже 200 до создания» и тест ничего не
    // проверяет. Именно эта изоляция и была нужна: без нового slug на
    // каждый запуск повторный прогон видел бы стухший кэш прошлого набора,
    // а не поведение промаха.
    const slug = `e2e-cache-miss-${Date.now()}`

    test('промах ДО создания не залипает — документ, заведённый отдельным процессом, открывается сразу же', async ({
      request,
    }) => {
      const before = await request.get(`/ro/${slug}`)
      expect(before.status(), 'до создания — 404').toBe(404)

      await createPageViaCli(slug, 'Cache miss test')
      try {
        const after = await request.get(`/ro/${slug}`)
        expect(after.status(), 'сразу после создания — 200, без сброса кэша кнопкой').toBe(200)
      } finally {
        await deletePageViaCli(slug)
      }
    })
  })

  test('зарезервированный slug отклоняется REST-ом (админ), документ не сохраняется', async ({
    request,
    baseURL,
  }) => {
    const token = await adminToken(request, baseURL ?? 'http://localhost:3000')
    for (const slug of SAMPLE_RESERVED_SLUGS) {
      const res = await request.post('/api/pages', {
        headers: { Authorization: `JWT ${token}` },
        data: { title: `TEST ${slug}`, slug },
      })
      expect(res.status(), `slug «${slug}»`).toBe(400)
      const body = await res.json()
      const slugError = body.errors?.[0]?.data?.errors?.find(
        (e: { path?: string }) => e.path === 'slug',
      )
      expect(slugError?.message, `slug «${slug}»`).toContain('зарезервирован')
    }

    // Ничего из отклонённого реально не легло в БД (по одному запросу на slug —
    // без общей проверки, что реально шлёт `where[slug][in]` через query-string).
    for (const slug of SAMPLE_RESERVED_SLUGS) {
      const list = await request.get(
        `/api/pages?${new URLSearchParams({ 'where[slug][equals]': slug, depth: '0' })}`,
        { headers: { Authorization: `JWT ${token}` } },
      )
      const { totalDocs } = await list.json()
      expect(totalDocs, `slug «${slug}» не должен быть в БД`).toBe(0)
    }
  })
})
