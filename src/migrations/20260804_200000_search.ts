import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Инфраструктура поиска (PLAN.md §5.5), пишется руками — drizzle такое не
 * генерирует: расширение pg_trgm для опечаток и GIN-индексы под FTS
 * с конфигами romanian / russian / english по локали строки.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`)

  for (const [locale, config] of [
    ['ro', 'romanian'],
    ['ru', 'russian'],
    ['en', 'english'],
  ]) {
    await db.execute(`
      CREATE INDEX IF NOT EXISTS products_locales_fts_${locale}_idx
        ON products_locales USING gin (to_tsvector('${config}', coalesce(title, '')))
        WHERE _locale = '${locale}';
      CREATE INDEX IF NOT EXISTS brands_locales_fts_${locale}_idx
        ON brands_locales USING gin (to_tsvector('${config}', coalesce(title, '')))
        WHERE _locale = '${locale}';
      CREATE INDEX IF NOT EXISTS categories_locales_fts_${locale}_idx
        ON categories_locales USING gin (to_tsvector('${config}', coalesce(title, '')))
        WHERE _locale = '${locale}';
    `)
  }

  await db.execute(`
    CREATE INDEX IF NOT EXISTS products_locales_title_trgm_idx
      ON products_locales USING gin (lower(coalesce(title, '')) gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS brands_locales_title_trgm_idx
      ON brands_locales USING gin (lower(title) gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS categories_locales_title_trgm_idx
      ON categories_locales USING gin (lower(title) gin_trgm_ops);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    DROP INDEX IF EXISTS products_locales_title_trgm_idx;
    DROP INDEX IF EXISTS brands_locales_title_trgm_idx;
    DROP INDEX IF EXISTS categories_locales_title_trgm_idx;
    DROP INDEX IF EXISTS products_locales_fts_ro_idx;
    DROP INDEX IF EXISTS products_locales_fts_ru_idx;
    DROP INDEX IF EXISTS products_locales_fts_en_idx;
    DROP INDEX IF EXISTS brands_locales_fts_ro_idx;
    DROP INDEX IF EXISTS brands_locales_fts_ru_idx;
    DROP INDEX IF EXISTS brands_locales_fts_en_idx;
    DROP INDEX IF EXISTS categories_locales_fts_ro_idx;
    DROP INDEX IF EXISTS categories_locales_fts_ru_idx;
    DROP INDEX IF EXISTS categories_locales_fts_en_idx;
  `)
}
