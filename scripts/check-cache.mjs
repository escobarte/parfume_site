/**
 * Проверка кнопки «Сбросить кэш витрины»: после сброса ПЕРВЫЙ же запрос
 * главной, каталога и карточки товара обязан отдать свежие данные.
 *
 * Запускать ТОЛЬКО на прод-сборке — в dev кэш ведёт себя иначе и проверка
 * тестирует не тот код (docs/GOTCHAS.md):
 *
 *   pnpm build && pnpm start
 *   node scripts/check-cache.mjs
 *
 * Сценарий повторяет реальную жалобу: данные правятся МИМО Payload (прямо в
 * Postgres — так же выглядит CLI-импорт), поэтому afterChange-хуки не
 * срабатывают и единственный путь обновить витрину — кнопка. Название товара
 * возвращается на место в конце прогона, даже если проверка провалилась.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const BASE = process.env.SHOT_BASE ?? 'http://localhost:3000'
const DB_CONTAINER = process.env.PG_CONTAINER ?? 'parfume_site-postgres-1'
const SLUG = process.env.CACHE_CHECK_SLUG ?? 'maison-orphee-signature-wood'

const results = []
const check = (name, ok, note = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✔' : '✘'} ${name}${note ? ` — ${note}` : ''}`)
}

const env = readFileSync('.env', 'utf8')
const email = env.match(/^SEED_ADMIN_EMAIL=(.*)$/m)[1].trim()
const password = env.match(/^SEED_ADMIN_PASSWORD=(.*)$/m)[1].trim()

const psql = (sql) =>
  execFileSync(
    'docker',
    ['exec', DB_CONTAINER, 'psql', '-U', 'parfume', '-d', 'parfume_dev', '-tAc', sql],
    { encoding: 'utf8' },
  ).trim()

const html = async (path) => (await fetch(`${BASE}${path}`, { cache: 'no-store' })).text()

const { token } = await fetch(`${BASE}/api/users/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
}).then((response) => response.json())

const resetCache = () =>
  fetch(`${BASE}/api/catalog-revalidate`, {
    method: 'POST',
    headers: { Authorization: `JWT ${token}` },
  })

const PAGES = ['/ro', '/ro/catalog', `/ro/product/${SLUG}`]
const original = psql(`select title from products where slug = '${SLUG}'`)
const MARK = `CACHECHECK-${Date.now().toString(36).toUpperCase()}`

if (!original) {
  console.error(`Товар «${SLUG}» не найден в БД — проверять нечего.`)
  process.exit(1)
}

try {
  // ── Заголовки кэша: витрина динамическая, edge-кэшу отдавать нечего ──────
  const headers = await fetch(`${BASE}/ro`, { cache: 'no-store' }).then((r) => r.headers)
  check(
    'страницы витрины не уходят в edge-кэш (no-store)',
    (headers.get('cache-control') ?? '').includes('no-store'),
    headers.get('cache-control'),
  )
  check(
    'ответ не пришёл из кэша Cloudflare',
    !['HIT', 'STALE'].includes((headers.get('cf-cache-status') ?? '').toUpperCase()),
    headers.get('cf-cache-status') ?? 'заголовка нет (прямое соединение)',
  )

  // ── Прогрев: страницы кэшируются со старым названием ─────────────────────
  for (const page of PAGES) await html(page)

  // ── Правка мимо Payload + кнопка сброса ──────────────────────────────────
  psql(`update products set title = '${MARK}' where slug = '${SLUG}'`)
  const reset = await resetCache()
  check('кнопка сброса кэша отвечает 200', reset.status === 200, `HTTP ${reset.status}`)

  // ── Главное утверждение: свежесть с ПЕРВОГО запроса ──────────────────────
  for (const page of PAGES) {
    const first = await html(page)
    check(`${page}: первый же запрос после сброса отдал свежие данные`, first.includes(MARK))
  }

  // ── Аноним кнопку дёрнуть не может ───────────────────────────────────────
  const anon = await fetch(`${BASE}/api/catalog-revalidate`, { method: 'POST' })
  check('аноним сбросить кэш не может', anon.status === 403, `HTTP ${anon.status}`)
} finally {
  psql(`update products set title = '${original.replace(/'/g, "''")}' where slug = '${SLUG}'`)
  await resetCache()
  console.log(`\nНазвание товара возвращено: ${JSON.stringify(original)}`)
}

const failed = results.filter((result) => !result.ok)
console.log(`Итог: ${results.length - failed.length}/${results.length} пройдено`)
process.exit(failed.length ? 1 : 0)
