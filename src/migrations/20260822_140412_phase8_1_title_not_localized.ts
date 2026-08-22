import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Фаза 8.1: title товара перестаёт быть localized-полем (переезжает из
 * products_locales/_products_v_locales в products/_products_v). Разведка
 * подтвердила ro=ru=en у всех 12/12 существующих товаров — бэкфилл берёт
 * первую непустую локаль по приоритету ro → ru → en (на случай неполных
 * версий-черновиков), поэтому список на ручную сверку не нужен.
 *
 * products_locales_fts_{ro,ru,en}_idx и products_locales_title_trgm_idx —
 * ручные индексы из 20260804_200000_search.ts, drizzle-kit их не видит
 * (не часть декларативной схемы Payload), поэтому их нужно снести и
 * пересоздать на products руками — иначе поиск по названию товара тихо
 * сломается после переноса колонки.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "products" ADD COLUMN "title" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_title" varchar;

  UPDATE "products" p
  SET "title" = sub.title
  FROM (
    SELECT DISTINCT ON (_parent_id) _parent_id, title
    FROM "products_locales"
    WHERE title IS NOT NULL
    ORDER BY _parent_id, (_locale = 'ro') DESC, (_locale = 'ru') DESC, (_locale = 'en') DESC
  ) sub
  WHERE sub._parent_id = p.id;

  UPDATE "_products_v" v
  SET "version_title" = sub.title
  FROM (
    SELECT DISTINCT ON (_parent_id) _parent_id, version_title AS title
    FROM "_products_v_locales"
    WHERE version_title IS NOT NULL
    ORDER BY _parent_id, (_locale = 'ro') DESC, (_locale = 'ru') DESC, (_locale = 'en') DESC
  ) sub
  WHERE sub._parent_id = v.id;

  ALTER TABLE "products" ALTER COLUMN "title" SET NOT NULL;

  DROP INDEX "products_title_idx";
  DROP INDEX "_products_v_version_version_title_idx";
  DROP INDEX IF EXISTS "products_locales_fts_ro_idx";
  DROP INDEX IF EXISTS "products_locales_fts_ru_idx";
  DROP INDEX IF EXISTS "products_locales_fts_en_idx";
  DROP INDEX IF EXISTS "products_locales_title_trgm_idx";

  ALTER TABLE "products_locales" DROP COLUMN "title";
  ALTER TABLE "_products_v_locales" DROP COLUMN "version_title";

  CREATE INDEX "products_title_idx" ON "products" USING btree ("title");
  CREATE INDEX "_products_v_version_version_title_idx" ON "_products_v" USING btree ("version_title");

  -- Название теперь всегда на английском (ТЗ), поэтому один FTS-индекс
  -- с конфигом 'english' вместо трёх локале-специфичных.
  CREATE INDEX "products_title_fts_idx"
    ON "products" USING gin (to_tsvector('english', coalesce("title", '')));
  CREATE INDEX "products_title_trgm_idx"
    ON "products" USING gin (lower(coalesce("title", '')) gin_trgm_ops);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX "products_title_trgm_idx";
  DROP INDEX "products_title_fts_idx";
  DROP INDEX "_products_v_version_version_title_idx";
  DROP INDEX "products_title_idx";

  ALTER TABLE "products_locales" ADD COLUMN "title" varchar;
  ALTER TABLE "_products_v_locales" ADD COLUMN "version_title" varchar;

  UPDATE "products_locales" pl
  SET "title" = p.title
  FROM "products" p
  WHERE p.id = pl._parent_id;

  UPDATE "_products_v_locales" vl
  SET "version_title" = v.version_title
  FROM "_products_v" v
  WHERE v.id = vl._parent_id;

  CREATE INDEX "products_title_idx" ON "products_locales" USING btree ("title","_locale");
  CREATE INDEX "_products_v_version_version_title_idx" ON "_products_v_locales" USING btree ("version_title","_locale");

  CREATE INDEX "products_locales_fts_ro_idx"
    ON "products_locales" USING gin (to_tsvector('romanian', coalesce(title, '')))
    WHERE _locale = 'ro';
  CREATE INDEX "products_locales_fts_ru_idx"
    ON "products_locales" USING gin (to_tsvector('russian', coalesce(title, '')))
    WHERE _locale = 'ru';
  CREATE INDEX "products_locales_fts_en_idx"
    ON "products_locales" USING gin (to_tsvector('english', coalesce(title, '')))
    WHERE _locale = 'en';
  CREATE INDEX "products_locales_title_trgm_idx"
    ON "products_locales" USING gin (lower(coalesce(title, '')) gin_trgm_ops);

  ALTER TABLE "products" ALTER COLUMN "title" DROP NOT NULL;
  ALTER TABLE "products" DROP COLUMN "title";
  ALTER TABLE "_products_v" DROP COLUMN "version_title";`)
}
