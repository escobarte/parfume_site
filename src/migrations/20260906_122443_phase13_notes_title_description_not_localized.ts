import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * ПРОМПТ 13 — Notes.title/description перестают быть localized. Решение
 * владельца: названия и описания нот пишутся один раз, на английском, и
 * отображаются одинаково на всех локалях (RO/RU/EN) — тот же принцип, что
 * `Products.title` в 20260822_140412_phase8_1_title_not_localized.ts (та же
 * ловушка: `payload migrate:create` диффит форму схемы, но не переносит
 * данные между notes_locales и notes — перенос вставлен руками).
 *
 * Бэкфилл — приоритет en → ro → ru (en первым, а не ro, как у title товара:
 * ноты по решению владельца всегда на английском, у большинства существующих
 * записей en и был единственной осмысленной локалью, ro/ru — переводы для
 * старого дизайна пирамиды, которые теперь не нужны). Ноты без НИ ОДНОГО
 * непустого значения (в теории не должно быть — title был required — но
 * built-in на будущее) получают title из slug тем же алгоритмом, что
 * titleFromSlug() в src/lib/import/relations.ts и applyNotes.ts: заменить
 * дефисы на пробелы, каждое слово с большой буквы (initcap эквивалентен —
 * slug уже в нижнем регистре из slugify()).
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "notes" ADD COLUMN "title" varchar;
  ALTER TABLE "notes" ADD COLUMN "description" varchar;

  UPDATE "notes" n
  SET "title" = sub.title
  FROM (
    SELECT DISTINCT ON (_parent_id) _parent_id, title
    FROM "notes_locales"
    WHERE title IS NOT NULL AND title <> ''
    ORDER BY _parent_id, (_locale = 'en') DESC, (_locale = 'ro') DESC, (_locale = 'ru') DESC
  ) sub
  WHERE sub._parent_id = n.id;

  UPDATE "notes" n
  SET "description" = sub.description
  FROM (
    SELECT DISTINCT ON (_parent_id) _parent_id, description
    FROM "notes_locales"
    WHERE description IS NOT NULL AND description <> ''
    ORDER BY _parent_id, (_locale = 'en') DESC, (_locale = 'ro') DESC, (_locale = 'ru') DESC
  ) sub
  WHERE sub._parent_id = n.id;

  UPDATE "notes"
  SET "title" = initcap(replace("slug", '-', ' '))
  WHERE "title" IS NULL;

  ALTER TABLE "notes" ALTER COLUMN "title" SET NOT NULL;

  DROP INDEX "notes_title_idx";
  DROP TABLE "notes_locales" CASCADE;

  CREATE INDEX "notes_title_idx" ON "notes" USING btree ("title");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  -- Индекс "notes_title_idx" сейчас висит на notes(title) (создан в up()) —
  -- имя индекса уникально на схему, не на таблицу, поэтому снести его нужно
  -- ДО создания одноимённого индекса на notes_locales ниже.
  DROP INDEX "notes_title_idx";

  CREATE TABLE "notes_locales" (
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );

  ALTER TABLE "notes_locales" ADD CONSTRAINT "notes_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "notes_title_idx" ON "notes_locales" USING btree ("title","_locale");
  CREATE UNIQUE INDEX "notes_locales_locale_parent_id_unique" ON "notes_locales" USING btree ("_locale","_parent_id");

  -- Откат намеренно НЕ восстанавливает три разных значения на локаль — это
  -- необратимая потеря информации по определению задачи (RO/RU для этих
  -- полей больше нигде не хранятся). Одно и то же значение копируется во
  -- все три локали, чтобы down() не падал и данные не терялись целиком —
  -- не эквивалент состояния до up(), см. GOTCHAS.md про тот же компромисс
  -- в откате миграции Products.family.
  INSERT INTO "notes_locales" ("_locale", "_parent_id", "title", "description")
  SELECT locale, n.id, n.title, n.description
  FROM "notes" n, unnest(ARRAY['ro', 'ru', 'en']::"_locales"[]) AS locale;

  ALTER TABLE "notes" DROP COLUMN "title";
  ALTER TABLE "notes" DROP COLUMN "description";`)
}
