import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * ПРОМПТ 12 v2 — три независимых изменения схемы одной миграцией (сгенерировано
 * `payload migrate:create`, вручную дополнено переносом данных — drizzle-kit
 * видит только форму схемы, не переносит значения между старым и новым
 * расположением колонки, см. GOTCHAS.md):
 *
 * 1. `Notes.group`: enum (7 фиксированных значений) → свободный текст.
 *    ALTER COLUMN TYPE делает перенос данных сам (значения enum приводятся к
 *    тексту тем же именем) — отдельный UPDATE не нужен, в отличие от family
 *    ниже (там колонка переезжает на другую таблицу).
 * 2. `Notes.image` (upload) и `Notes.needsReview` (boolean, DEFAULT true) —
 *    новые поля. DEFAULT true на непустой таблице означает, что ВСЕ уже
 *    существующие ноты (в т.ч. созданные раньше авто-импортом без какого-либо
 *    понятия o «заготовке») задним числом помечаются needsReview — это
 *    ожидаемо, не баг: раньше это состояние просто не отслеживалось никак.
 * 3. `Products.family`: enum, не localized → `text`, `localized: true`.
 *    Значение живёт на ДРУГОЙ таблице (products_locales/_products_v_locales,
 *    не products/_products_v) — старые enum-значения переносятся вручную в
 *    локаль `ro` (тем же принципом, что миграция 20260822_140412, только в
 *    обратном направлении: там out of locales, здесь into locales), `ru`/`en`
 *    остаются пустыми — это заведомо неполный, временный перевод (владелец
 *    перезальёт реальным CSV на трёх языках), fallback:true в payload.config.ts
 *    подстрахует пустые локали чтением ro, пока перевод не завезён.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX "products_family_idx";
  DROP INDEX "_products_v_version_version_family_idx";
  ALTER TABLE "notes" ALTER COLUMN "group" SET DATA TYPE varchar USING "group"::text;
  ALTER TABLE "products_locales" ADD COLUMN "family" varchar;
  ALTER TABLE "_products_v_locales" ADD COLUMN "version_family" varchar;
  ALTER TABLE "notes" ADD COLUMN "image_id" integer;
  ALTER TABLE "notes" ADD COLUMN "needs_review" boolean DEFAULT true;
  ALTER TABLE "notes" ADD CONSTRAINT "notes_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "products_family_idx" ON "products_locales" USING btree ("family","_locale");
  CREATE INDEX "_products_v_version_version_family_idx" ON "_products_v_locales" USING btree ("version_family","_locale");
  CREATE INDEX "notes_image_idx" ON "notes" USING btree ("image_id");

  -- Перенос данных family: enum → ro-локаль, ON CONFLICT покрывает случай,
  -- когда строка products_locales/_locale='ro' для этого товара ещё не
  -- существовала (family раньше не было localized-полем).
  INSERT INTO "products_locales" ("_locale", "_parent_id", "family")
  SELECT 'ro', "id", "family"::text FROM "products" WHERE "family" IS NOT NULL
  ON CONFLICT ("_locale", "_parent_id") DO UPDATE SET "family" = EXCLUDED."family";

  INSERT INTO "_products_v_locales" ("_locale", "_parent_id", "version_family")
  SELECT 'ro', "id", "version_family"::text FROM "_products_v" WHERE "version_family" IS NOT NULL
  ON CONFLICT ("_locale", "_parent_id") DO UPDATE SET "version_family" = EXCLUDED."version_family";

  ALTER TABLE "products" DROP COLUMN "family";
  ALTER TABLE "_products_v" DROP COLUMN "version_family";
  DROP TYPE "public"."enum_products_family";
  DROP TYPE "public"."enum__products_v_version_family";
  DROP TYPE "public"."enum_notes_group";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "public"."enum_products_family" AS ENUM('floral', 'woody', 'oriental', 'fresh', 'fougere', 'chypre');
  CREATE TYPE "public"."enum__products_v_version_family" AS ENUM('floral', 'woody', 'oriental', 'fresh', 'fougere', 'chypre');
  CREATE TYPE "public"."enum_notes_group" AS ENUM('citrus', 'floral', 'woody', 'spicy', 'sweet', 'fresh', 'animalic');
  ALTER TABLE "notes" DROP CONSTRAINT "notes_image_id_media_id_fk";

  DROP INDEX "products_family_idx";
  DROP INDEX "_products_v_version_version_family_idx";
  DROP INDEX "notes_image_idx";

  -- group: тексты, которые не входят в старый enum (свободные значения,
  -- заведённые после этой миграции), при откате CAST на enum упадут ошибкой
  -- — это осознанно: откат к закрытому списку без ручной сверки таких строк
  -- невозможен, см. GOTCHAS.md.
  ALTER TABLE "notes" ALTER COLUMN "group" SET DATA TYPE "public"."enum_notes_group" USING "group"::"public"."enum_notes_group";

  ALTER TABLE "products" ADD COLUMN "family" "enum_products_family";
  ALTER TABLE "_products_v" ADD COLUMN "version_family" "enum__products_v_version_family";
  CREATE INDEX "products_family_idx" ON "products" USING btree ("family");
  CREATE INDEX "_products_v_version_version_family_idx" ON "_products_v" USING btree ("version_family");

  -- Перенос данных обратно: только ro (единственная локаль, которая точно
  -- была заполнена этой миграцией вперёд) — ru/en-переводы family при откате
  -- теряются молча, это ожидаемо (откат к enum и не может хранить свободный
  -- перевод), задокументировано в GOTCHAS.md.
  UPDATE "products" p
  SET "family" = pl."family"::"enum_products_family"
  FROM "products_locales" pl
  WHERE pl."_parent_id" = p.id AND pl."_locale" = 'ro' AND pl."family" IS NOT NULL;

  UPDATE "_products_v" v
  SET "version_family" = vl."version_family"::"enum__products_v_version_family"
  FROM "_products_v_locales" vl
  WHERE vl."_parent_id" = v.id AND vl."_locale" = 'ro' AND vl."version_family" IS NOT NULL;

  ALTER TABLE "products_locales" DROP COLUMN "family";
  ALTER TABLE "_products_v_locales" DROP COLUMN "version_family";
  ALTER TABLE "notes" DROP COLUMN "image_id";
  ALTER TABLE "notes" DROP COLUMN "needs_review";`)
}
