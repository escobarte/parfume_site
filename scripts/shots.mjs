import { chromium } from '@playwright/test'
import { mkdir } from 'fs/promises'

/**
 * Скриншоты витрины на трёх брейкпоинтах (360 / 768 / 1280) — самопроверка
 * фаз с вёрсткой. Запуск: node scripts/shots.mjs <путь> <имя> [ещё пары...]
 * По умолчанию снимает набор страниц фазы 3.
 */
const BASE = process.env.SHOT_BASE ?? 'http://localhost:3000'
const OUT = 'docs/screenshots'
const SIZES = [360, 768, 1280]

const args = process.argv.slice(2)
const pages = args.length
  ? Array.from({ length: args.length / 2 }, (_, i) => ({
      path: args[i * 2],
      name: args[i * 2 + 1],
    }))
  : [
      { path: '/ro/catalog', name: 'catalog' },
      { path: '/ro/catalog/femei', name: 'catalog-category' },
      { path: '/ro/product/maison-orphee-signature-wood', name: 'product' },
      { path: '/ro/search?q=cedar', name: 'search' },
    ]

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()

for (const page of pages) {
  for (const width of SIZES) {
    const tab = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    tab.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
    tab.on('pageerror', (error) => errors.push(String(error)))
    await tab.goto(BASE + page.path, { waitUntil: 'domcontentloaded' })
    await tab.locator('footer').first().waitFor({ timeout: 20000 })
    await tab.evaluate(() => document.fonts.ready)
    await tab.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
    await tab.waitForTimeout(400)
    const scrollX = await tab.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    await tab.screenshot({ path: `${OUT}/${page.name}-${width}.png`, fullPage: true })
    console.log(
      `${page.name}-${width}: гориз. скролл ${scrollX ? 'ЕСТЬ ✘' : 'нет ✔'}` +
        (errors.length ? ` | console: ${errors.slice(0, 2).join(' / ')}` : ''),
    )
    await tab.close()
  }
}

await browser.close()
