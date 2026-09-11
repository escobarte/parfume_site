import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * `Brands.title` и `Brands.description` перестают быть localized (решение
 * владельца 2026-09-11): название бренда одинаково на всех языках, описание
 * ведётся «для себя». Поводом стал реальный баг — бренд, заведённый в админке
 * только на ru, приходил на /ro и /en с пустым `title` и ронял страницу
 * `/brands`: `required: true` у localized-поля проверяется лишь в той локали,
 * где редактируют запись (см. docs/GOTCHAS.md).
 *
 * Третий случай той же операции в проекте, шаблон взят у предыдущих:
 * `Products.title` (20260822_140412_phase8_1_title_not_localized) и
 * `Notes.title/description` (20260906_122443_phase13_...). Отличие от нот:
 * таблица `brands_locales` НЕ удаляется — в ней остаются `country`,
 * `seo_title`, `seo_description`, они локализованными и остаются.
 *
 * Сгенерированную версию пришлось переписать целиком по трём причинам —
 * все три уже описаны в GOTCHAS, но drizzle про них не знает:
 *   1. `payload migrate:create` диффит только форму схемы и НЕ переносит
 *      данные между brands_locales и brands — перенос вставлен руками;
 *   2. `ADD COLUMN "title" varchar NOT NULL` на непустой таблице падает —
 *      колонка добавляется nullable, заполняется и только потом NOT NULL;
 *   3. `brands_locales_fts_{ro,ru,en}_idx` и `brands_locales_title_trgm_idx`
 *      заведены руками в 20260804_200000_search.ts, в декларативной схеме
 *      Payload их нет — без ручного переноса поиск по бренду тихо сломается.
 *
 * Бэкфилл: первое непустое значение по приоритету ro → ru → en (у владельца
 * названия во всех локалях совпадают, кроме `e-chanal`, заведённого только
 * на ru — он и подхватится из ru). Бренд без единого непустого названия
 * (в теории невозможен, title был required) получает title из slug тем же
 * алгоритмом, что `titleFromSlug()` в src/lib/import/relations.ts.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "brands" ADD COLUMN "title" varchar;
  ALTER TABLE "brands" ADD COLUMN "description" varchar;

  UPDATE "brands" b
  SET "title" = sub.title
  FROM (
    SELECT DISTINCT ON (_parent_id) _parent_id, title
    FROM "brands_locales"
    WHERE title IS NOT NULL AND title <> ''
    ORDER BY _parent_id, (_locale = 'ro') DESC, (_locale = 'ru') DESC, (_locale = 'en') DESC
  ) sub
  WHERE sub._parent_id = b.id;

  UPDATE "brands" b
  SET "description" = sub.description
  FROM (
    SELECT DISTINCT ON (_parent_id) _parent_id, description
    FROM "brands_locales"
    WHERE description IS NOT NULL AND description <> ''
    ORDER BY _parent_id, (_locale = 'ro') DESC, (_locale = 'ru') DESC, (_locale = 'en') DESC
  ) sub
  WHERE sub._parent_id = b.id;

  UPDATE "brands"
  SET "title" = initcap(replace("slug", '-', ' '))
  WHERE "title" IS NULL;

  ALTER TABLE "brands" ALTER COLUMN "title" SET NOT NULL;

  -- Имя индекса уникально на схему: старый brands_title_idx висит на
  -- brands_locales, снести его нужно ДО создания одноимённого на brands.
  DROP INDEX "brands_title_idx";
  DROP INDEX IF EXISTS "brands_locales_fts_ro_idx";
  DROP INDEX IF EXISTS "brands_locales_fts_ru_idx";
  DROP INDEX IF EXISTS "brands_locales_fts_en_idx";
  DROP INDEX IF EXISTS "brands_locales_title_trgm_idx";

  ALTER TABLE "brands_locales" DROP COLUMN "title";
  ALTER TABLE "brands_locales" DROP COLUMN "description";

  CREATE INDEX "brands_title_idx" ON "brands" USING btree ("title");

  -- Название одно на все языки, поэтому один FTS-индекс с конфигом 'english'
  -- вместо трёх локале-специфичных — как сделано для products в фазе 8.1.
  CREATE INDEX "brands_title_fts_idx"
    ON "brands" USING gin (to_tsvector('english', coalesce("title", '')));
  CREATE INDEX "brands_title_trgm_idx"
    ON "brands" USING gin (lower(coalesce("title", '')) gin_trgm_ops);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX "brands_title_trgm_idx";
  DROP INDEX "brands_title_fts_idx";
  DROP INDEX "brands_title_idx";

  ALTER TABLE "brands_locales" ADD COLUMN "title" varchar;
  ALTER TABLE "brands_locales" ADD COLUMN "description" varchar;

  -- Откат НЕ восстанавливает три разных значения на локаль: исходные переводы
  -- после up() больше нигде не хранятся, это необратимая потеря по самой
  -- постановке задачи. Одно значение копируется во все три локали, чтобы
  -- down() не падал и данные не пропали целиком — тот же компромисс, что в
  -- откате миграций Notes.title и Products.family (см. GOTCHAS.md).
  UPDATE "brands_locales" bl
  SET "title" = b.title, "description" = b.description
  FROM "brands" b
  WHERE b.id = bl._parent_id;

  -- Строка локали могла появиться уже после up() (например, заполнили только
  -- country на en) — у неё title пустой, а колонка возвращается NOT NULL.
  UPDATE "brands_locales" bl
  SET "title" = b.slug
  FROM "brands" b
  WHERE b.id = bl._parent_id AND bl."title" IS NULL;

  ALTER TABLE "brands_locales" ALTER COLUMN "title" SET NOT NULL;

  CREATE INDEX "brands_title_idx" ON "brands_locales" USING btree ("title","_locale");

  CREATE INDEX "brands_locales_fts_ro_idx"
    ON "brands_locales" USING gin (to_tsvector('romanian', coalesce(title, '')))
    WHERE _locale = 'ro';
  CREATE INDEX "brands_locales_fts_ru_idx"
    ON "brands_locales" USING gin (to_tsvector('russian', coalesce(title, '')))
    WHERE _locale = 'ru';
  CREATE INDEX "brands_locales_fts_en_idx"
    ON "brands_locales" USING gin (to_tsvector('english', coalesce(title, '')))
    WHERE _locale = 'en';
  CREATE INDEX "brands_locales_title_trgm_idx"
    ON "brands_locales" USING gin (lower(title) gin_trgm_ops);

  ALTER TABLE "brands" DROP COLUMN "title";
  ALTER TABLE "brands" DROP COLUMN "description";`)
}
