import { unstable_cache } from 'next/cache'
import type { Metadata } from 'next'
import type { Locale } from '@/i18n/routing'
import { CACHE_TTL } from '@/lib/cache'
import { getPayloadClient } from '@/lib/payload'
import { GLOBALS_TAG } from '@/lib/revalidate'
import { buildMetadata } from '@/lib/seo/metadata'
import type { Media, Page } from '@/payload-types'

/**
 * Четыре системные страницы (фаза 5.2) — у них собственные статические папки
 * `src/app/(frontend)/[locale]/{about,delivery,returns,contacts}`, которые
 * выигрывают у динамического `[locale]/[slug]` сами (Next: статика приоритетнее
 * динамики). Эти slug остаются легитимными документами `Pages` — не входят
 * в `RESERVED_PAGE_SLUGS` ниже и исключаются из `generateStaticParams` у
 * `[slug]`, чтобы не заводить второй, недостижимый путь к тому же документу.
 */
export const SYSTEM_PAGE_SLUGS = ['about', 'delivery', 'returns', 'contacts'] as const

/**
 * Зарезервированные значения slug для коллекции `Pages` — всё, что уже занято
 * статическим сегментом `[locale]/*` (кроме четырёх системных выше — те сами
 * и есть документы `Pages`) или системным путём без локали (админка/API/
 * технические file-convention роуты). Список не читается из файловой системы —
 * сверяется руками: завёл новую статическую папку под `[locale]/` → добавь её
 * имя и сюда (иначе новый документ `Pages` с тем же slug молча станет
 * недостижимым — статический маршрут выигрывает у `[slug]` без ошибки сборки,
 * см. `docs/GOTCHAS.md`, «Статический сегмент… побеждает…»).
 *
 * `robots-txt`/`sitemap-xml`, не `robots.txt`/`sitemap.xml` — `slugField()`
 * прогоняет значение через `slugify()` ДО этой проверки (`beforeValidate`
 * идёт раньше `validate`), а тот превращает любую точку в дефис. Введённое
 * в админке «robots.txt» дойдёт до `validate` уже как `robots-txt» — резерв
 * должен ловить именно эту форму, иначе проверка молча никогда не сработает
 * (поймано живым прогоном int-теста при написании этого списка).
 */
export const RESERVED_PAGE_SLUGS = [
  'brands',
  'cart',
  'catalog',
  'gift-box',
  'gift-certificates',
  'order',
  'product',
  'search',
  'thank-you',
  'ui-kit',
  'og-image',
  'admin',
  'api',
  'maintenance',
  'icon',
  'apple-icon',
  'robots-txt',
  'sitemap-xml',
] as const

/** Несуществующий документ (Local API вернул `undefined`). */
class PageMissError extends Error {}

async function fetchPage(locale: Locale, slug: string): Promise<Page> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'pages',
    locale,
    depth: 1,
    limit: 1,
    where: { slug: { equals: slug } },
  })
  const page = docs[0]
  if (!page) throw new PageMissError()
  return page
}

/**
 * Статическая страница по slug (LINK_TARGETS: about/delivery/contacts +
 * returns, плюс с 2026-09-28 — любой документ `Pages`).
 *
 * **Промах НЕ кэшируется.** `unstable_cache` не сохраняет результат
 * упавшего вызова — `fetchPage` кидает `PageMissError` вместо возврата
 * `null`, поэтому запись в кэше появляется только для реально найденной
 * страницы (тег `GLOBALS_TAG`, `CACHE_TTL`). Если бы промах кэшировался
 * (как раньше), запрос страницы ДО появления документа держал бы `404` весь
 * TTL — и `revalidateTag` из отдельного процесса (CLI/`pnpm seed`) до уже
 * прогретого кэша живого сервера не долетает (см. `docs/GOTCHAS.md`,
 * «закэшированный `null`…»). Цена решения: повторный запрос
 * заведомо несуществующего slug каждый раз идёт в БД, а не в кэш — на
 * масштабе этого проекта (бутик, не поток трафика) сочтено допустимым,
 * тот же трейдофф, что уже принят для других мест без строгой защиты
 * (см. GOTCHAS про `variant.stock`/промокоды).
 */
export async function getPageBySlug(locale: Locale, slug: string): Promise<Page | null> {
  try {
    return await unstable_cache(() => fetchPage(locale, slug), ['page', locale, slug], {
      tags: [GLOBALS_TAG],
      revalidate: CACHE_TTL,
    })()
  } catch (error) {
    if (error instanceof PageMissError) return null
    throw error
  }
}

/** generateMetadata для любой страницы `Pages` — четырёх системных и общего `[slug]`. */
export async function staticPageMetadata(locale: Locale, slug: string): Promise<Metadata> {
  const page = await getPageBySlug(locale, slug)
  const image =
    page?.seo?.image && typeof page.seo.image === 'object' ? (page.seo.image as Media) : null

  return buildMetadata({
    locale,
    path: `/${slug}`,
    title: page?.title ?? slug,
    seo: page?.seo ? { title: page.seo.title, description: page.seo.description } : null,
    image: image?.url ?? undefined,
  })
}
