import type { Locale } from '@/i18n/routing'
import { getPayloadClient } from '@/lib/payload'
import { slugify } from '@/lib/slugify'
import type { Suggestion, SuggestionType } from './types'

/**
 * Полнотекстовый поиск на Postgres (PLAN.md §5.5).
 *
 * Три механики в одном запросе:
 *  1) `to_tsquery` по конфигу активной локали (romanian / russian / english) —
 *     словоформы и стемминг;
 *  2) `pg_trgm` similarity — опечатки;
 *  3) транслитерация запроса — названия парфюмов и брендов в каталоге
 *     латиницей на всех локалях, поэтому «диор» обязан находить «Dior»
 *     (Приложение A: латиница и кириллица находят одно и то же).
 *
 * Сырой SQL — Local API не умеет ни tsvector, ни trigram.
 */
const TS_CONFIG: Record<Locale, string> = {
  ro: 'romanian',
  ru: 'russian',
  en: 'english',
}

/**
 * Порог word_similarity: он меряет запрос против лучшего фрагмента строки,
 * поэтому переживает и опечатку в букву, и длинную склейку «товар + бренд»
 * (обычная similarity на таких строках размывается до нуля). 0.55 подобран
 * так, чтобы «signatru» и «cedr» находились, а «iris» не цеплял «Pale Linen».
 */
const SIMILARITY_THRESHOLD = 0.55

/** to_tsquery падает на спецсимволах, поэтому строим выражение сами: `слово:*`. */
function prefixQuery(term: string): string {
  return term
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
    .map((word) => `${word}:*`)
    .join(' & ')
}

/** Варианты запроса: как ввели + латинская транслитерация, если она отличается. */
function variants(term: string): string[] {
  const latin = slugify(term).replace(/-/g, ' ').trim()
  return latin && latin !== term.toLowerCase() ? [term, latin] : [term]
}

type Row = { type: SuggestionType; title: string; slug: string; rank: number }

async function runQuery(term: string, locale: Locale, limit: number): Promise<Row[]> {
  const payload = await getPayloadClient()
  const config = TS_CONFIG[locale]

  const words = variants(term)
  const tsQuery = words.map(prefixQuery).filter(Boolean).join(' | ')
  if (!tsQuery) return []

  const [raw, rawAlt] = [words[0].toLowerCase(), (words[1] ?? words[0]).toLowerCase()]

  // $1 tsquery · $2 запрос как ввели · $3 транслитерация · $4 локаль · $5 лимит
  const matches = (column: string) => `(
    to_tsvector('${config}', ${column}) @@ q.ts
    OR ${column} ILIKE '%' || q.raw || '%'
    OR ${column} ILIKE '%' || q.alt || '%'
    OR word_similarity(q.raw, lower(${column})) > ${SIMILARITY_THRESHOLD}
    OR word_similarity(q.alt, lower(${column})) > ${SIMILARITY_THRESHOLD}
  )`

  const rank = (column: string) => `GREATEST(
    ts_rank(to_tsvector('${config}', ${column}), q.ts),
    word_similarity(q.raw, lower(${column})),
    word_similarity(q.alt, lower(${column})),
    CASE WHEN lower(${column}) LIKE q.raw || '%' OR lower(${column}) LIKE q.alt || '%' THEN 0.9 ELSE 0 END
  )`

  const sql = `
    WITH q AS (SELECT to_tsquery('${config}', $1) AS ts, $2::text AS raw, $3::text AS alt)
    SELECT * FROM (
      SELECT 'product'::text AS type, pl.title, p.slug,
             ${rank("coalesce(pl.title, '') || ' ' || coalesce(bl.title, '')")} AS rank
      FROM products p
      JOIN products_locales pl ON pl._parent_id = p.id AND pl._locale = $4
      LEFT JOIN brands_locales bl ON bl._parent_id = p.brand_id AND bl._locale = $4
      CROSS JOIN q
      WHERE p._status = 'published'
        AND ${matches("coalesce(pl.title, '') || ' ' || coalesce(bl.title, '')")}

      UNION ALL

      SELECT 'brand'::text, bl2.title, b.slug, ${rank('bl2.title')} AS rank
      FROM brands b
      JOIN brands_locales bl2 ON bl2._parent_id = b.id AND bl2._locale = $4
      CROSS JOIN q
      WHERE ${matches('bl2.title')}

      UNION ALL

      SELECT 'category'::text, cl.title, c.slug, ${rank('cl.title')} AS rank
      FROM categories c
      JOIN categories_locales cl ON cl._parent_id = c.id AND cl._locale = $4
      CROSS JOIN q
      WHERE ${matches('cl.title')}
    ) results
    ORDER BY rank DESC, title ASC
    LIMIT $5
  `

  const result = await payload.db.pool.query(sql, [tsQuery, raw, rawAlt, locale, limit])
  return result.rows as Row[]
}

const HREF: Record<SuggestionType, (slug: string) => string> = {
  product: (slug) => `/product/${slug}`,
  // Отдельные страницы брендов — фаза 5.2; пока ведём в каталог с фильтром,
  // это рабочий адрес, а не заглушка.
  brand: (slug) => `/catalog?brand=${slug}`,
  category: (slug) => `/catalog/${slug}`,
}

export async function suggest(term: string, locale: Locale, limit = 8): Promise<Suggestion[]> {
  const rows = await runQuery(term, locale, limit)
  return rows.map((row) => ({
    type: row.type,
    title: row.title,
    slug: row.slug,
    href: HREF[row.type](row.slug),
  }))
}

/** Страница результатов: slug-и найденных товаров в порядке релевантности. */
export async function searchProductSlugs(
  term: string,
  locale: Locale,
  limit = 200,
): Promise<string[]> {
  const rows = await runQuery(term, locale, limit)
  return rows.filter((row) => row.type === 'product').map((row) => row.slug)
}
