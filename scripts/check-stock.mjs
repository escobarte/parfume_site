import { chromium } from '@playwright/test'

/**
 * Плашка наличия на эталонной карточке (WIREFRAMES.md §3):
 * обе строки на трёх локалях + блокировка вариантов у распроданного товара.
 */
const BASE = process.env.SHOT_BASE ?? 'http://localhost:3000'
const SOLD_OUT = 'nord-atelier-winter-archive'

const LABELS = {
  ro: { in: 'În stoc', out: 'Stoc epuizat' },
  ru: { in: 'В наличии', out: 'Нет в наличии' },
  en: { in: 'In stock', out: 'Out of stock' },
}

const results = []
const check = (name, ok, note = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✔' : '✘'} ${name}${note ? ` — ${note}` : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const goto = async (path) => {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  await page.locator('footer').first().waitFor({ timeout: 20000 })
}

for (const [locale, labels] of Object.entries(LABELS)) {
  await goto(`/${locale}/catalog`)

  const soldCard = page.locator('article').filter({ has: page.locator(`a[href*="${SOLD_OUT}"]`) })
  const inStockCard = page
    .locator('article')
    .filter({ hasNot: page.locator(`a[href*="${SOLD_OUT}"]`) })
    .first()

  // Читаем текст самой плашки, а не всей карточки: подстрочное сравнение здесь
  // не работает — «нет в наличии» содержит «в наличии» как часть строки.
  // innerText в Chromium уже применяет text-transform, поэтому сверяем регистронезависимо.
  const badgeText = async (card) => {
    const spans = await card.locator('span').allInnerTexts()
    const wanted = [labels.in, labels.out].map((label) => label.toLowerCase())
    return (
      spans.map((text) => text.trim().toLowerCase()).find((text) => wanted.includes(text)) ?? ''
    )
  }

  const soldBadge = await badgeText(soldCard)
  const inStockBadge = await badgeText(inStockCard)

  check(
    `[${locale}] карточка распроданного товара — «${labels.out}»`,
    soldBadge === labels.out.toLowerCase(),
    soldBadge || 'плашки нет',
  )
  check(
    `[${locale}] карточка в наличии — «${labels.in}»`,
    inStockBadge === labels.in.toLowerCase(),
    inStockBadge || 'плашки нет',
  )

  // Плашка — текст, а не подложка: без фона, рамки и тени (BRAND.md §5)
  const badge = soldCard.locator('span').filter({ hasText: new RegExp(`^${labels.out}$`, 'i') })
  const style = await badge.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      color: cs.color,
      bg: cs.backgroundColor,
      border: cs.borderTopWidth,
      shadow: cs.boxShadow,
      size: cs.fontSize,
      tracking: cs.letterSpacing,
      transform: cs.textTransform,
    }
  })
  check(
    `[${locale}] стиль плашки: без фона/рамки/тени, uppercase с трекингом`,
    style.bg === 'rgba(0, 0, 0, 0)' &&
      style.border === '0px' &&
      style.shadow === 'none' &&
      style.transform === 'uppercase' &&
      parseFloat(style.tracking) > 1,
    `${style.size} / ${style.tracking} / ${style.color}`,
  )
}

// Приглушённый тон у «нет в наличии» относительно «в наличии»
await goto('/ro/catalog')
const tones = await page.evaluate(
  ([outLabel, inLabel]) => {
    const pick = (text) =>
      [...document.querySelectorAll('article span')].find((el) => el.textContent?.trim() === text)
    const out = pick(outLabel)
    const inn = pick(inLabel)
    return out && inn ? [getComputedStyle(out).color, getComputedStyle(inn).color] : null
  },
  [LABELS.ro.out, LABELS.ro.in],
)
check(
  '«нет в наличии» приглушённее, чем «в наличии»',
  !!tones && tones[0] !== tones[1],
  tones ? `${tones[1]} → ${tones[0]}` : 'не найдено',
)

// Страница распроданного товара: все объёмы заблокированы
await goto(`/ro/product/${SOLD_OUT}`)
const volumeButtons = page.locator('button').filter({ hasText: /^\d+ ml$/ })
const total = await volumeButtons.count()
const disabled = await volumeButtons.evaluateAll((nodes) => nodes.filter((n) => n.disabled).length)
check(
  'все варианты распроданного товара заблокированы',
  total > 0 && disabled === total,
  `${disabled} из ${total}`,
)

const addToCart = page.getByRole('button', { name: /adaugă în coș/i })
check('кнопка «в корзину» недоступна', await addToCart.isDisabled())
check(
  'на странице товара показано «Stoc epuizat»',
  (await page.getByText('Stoc epuizat').count()) > 0,
)

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\nИтог: ${results.length - failed.length}/${results.length} пройдено`)
process.exit(failed.length ? 1 : 0)
