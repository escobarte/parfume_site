import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Апгрейд select→relationship для about/delivery/contacts (PLAN.md §5.2):
 * значения этих трёх целей уходят с фиксированного enum на relationship
 * к новой коллекции `pages`. Порядок в up() важен — сначала заводим новые
 * колонки mode/page_id и переносим на них данные СТАРЫХ enum-значений,
 * потом обнуляем старую колонку у этих строк и только затем пересобираем
 * enum без about/delivery/contacts (тот же приём, что в
 * 20260811_094105_phase4_7_order_status.ts: перенос данных ДО USING-каста,
 * иначе каст падает на первой же строке со старым значением).
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_homepage_promo_hero_cta_target_mode" AS ENUM('system', 'page');
  CREATE TYPE "public"."enum_settings_promo_banner_link_target_mode" AS ENUM('system', 'page');
  CREATE TYPE "public"."enum_navigation_header_target_mode" AS ENUM('system', 'page');
  ALTER TABLE "homepage" ADD COLUMN "promo_hero_cta_target_mode" "enum_homepage_promo_hero_cta_target_mode" DEFAULT 'system';
  ALTER TABLE "homepage" ADD COLUMN "promo_hero_cta_target_page_id" integer;
  ALTER TABLE "settings" ADD COLUMN "promo_banner_link_target_mode" "enum_settings_promo_banner_link_target_mode" DEFAULT 'system';
  ALTER TABLE "settings" ADD COLUMN "promo_banner_link_target_page_id" integer;
  ALTER TABLE "navigation_header" ADD COLUMN "target_mode" "enum_navigation_header_target_mode" DEFAULT 'system';
  ALTER TABLE "navigation_header" ADD COLUMN "target_page_id" integer;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_promo_hero_cta_target_page_id_pages_id_fk" FOREIGN KEY ("promo_hero_cta_target_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "settings" ADD CONSTRAINT "settings_promo_banner_link_target_page_id_pages_id_fk" FOREIGN KEY ("promo_banner_link_target_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "navigation_header" ADD CONSTRAINT "navigation_header_target_page_id_pages_id_fk" FOREIGN KEY ("target_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "homepage_promo_hero_promo_hero_cta_target_page_idx" ON "homepage" USING btree ("promo_hero_cta_target_page_id");
  CREATE INDEX "settings_promo_banner_promo_banner_link_target_page_idx" ON "settings" USING btree ("promo_banner_link_target_page_id");
  CREATE INDEX "navigation_header_target_page_idx" ON "navigation_header" USING btree ("target_page_id");`)

  // Перенос данных: about/delivery/contacts → mode='page' + page_id по slug,
  // ДО пересборки enum ниже (значения ещё существуют в старом enum здесь).
  await db.execute(sql`
   UPDATE "homepage" h SET "promo_hero_cta_target_mode" = 'page', "promo_hero_cta_target_page_id" = p.id
    FROM "pages" p WHERE p."slug" = h."promo_hero_cta_target"::text
    AND h."promo_hero_cta_target"::text IN ('about', 'delivery', 'contacts');
  UPDATE "settings" s SET "promo_banner_link_target_mode" = 'page', "promo_banner_link_target_page_id" = p.id
    FROM "pages" p WHERE p."slug" = s."promo_banner_link_target"::text
    AND s."promo_banner_link_target"::text IN ('about', 'delivery', 'contacts');
  UPDATE "navigation_header" nh SET "target_mode" = 'page', "target_page_id" = p.id
    FROM "pages" p WHERE p."slug" = nh."target"::text
    AND nh."target"::text IN ('about', 'delivery', 'contacts');
  UPDATE "homepage" SET "promo_hero_cta_target" = NULL WHERE "promo_hero_cta_target" IN ('about', 'delivery', 'contacts');
  UPDATE "settings" SET "promo_banner_link_target" = NULL WHERE "promo_banner_link_target" IN ('about', 'delivery', 'contacts');
  UPDATE "navigation_header" SET "target" = NULL WHERE "target" IN ('about', 'delivery', 'contacts');`)

  // Пересборка enum без about/delivery/contacts — старые значения к этому
  // моменту уже перенесены на relationship и обнулены на исходной колонке.
  await db.execute(sql`
   ALTER TABLE "homepage" ALTER COLUMN "promo_hero_cta_target" SET DATA TYPE text;
  DROP TYPE "public"."enum_homepage_promo_hero_cta_target";
  CREATE TYPE "public"."enum_homepage_promo_hero_cta_target" AS ENUM('home', 'catalog', 'catalogDiscounted', 'catalogNew', 'brands', 'orderLookup');
  ALTER TABLE "homepage" ALTER COLUMN "promo_hero_cta_target" SET DATA TYPE "public"."enum_homepage_promo_hero_cta_target" USING "promo_hero_cta_target"::"public"."enum_homepage_promo_hero_cta_target";
  ALTER TABLE "settings" ALTER COLUMN "promo_banner_link_target" SET DATA TYPE text;
  DROP TYPE "public"."enum_settings_promo_banner_link_target";
  CREATE TYPE "public"."enum_settings_promo_banner_link_target" AS ENUM('home', 'catalog', 'catalogDiscounted', 'catalogNew', 'brands', 'orderLookup');
  ALTER TABLE "settings" ALTER COLUMN "promo_banner_link_target" SET DATA TYPE "public"."enum_settings_promo_banner_link_target" USING "promo_banner_link_target"::"public"."enum_settings_promo_banner_link_target";
  ALTER TABLE "navigation_header" ALTER COLUMN "target" SET DATA TYPE text;
  DROP TYPE "public"."enum_navigation_header_target";
  CREATE TYPE "public"."enum_navigation_header_target" AS ENUM('home', 'catalog', 'catalogDiscounted', 'catalogNew', 'brands', 'orderLookup');
  ALTER TABLE "navigation_header" ALTER COLUMN "target" SET DATA TYPE "public"."enum_navigation_header_target" USING "target"::"public"."enum_navigation_header_target";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Postgres запрещает использовать значение, добавленное ALTER TYPE ADD
  // VALUE, в той же транзакции, где оно добавлено (миграция целиком идёт в
  // одной транзакции, разбиение на несколько db.execute() здесь не помогает).
  // Поэтому старый 9-значный enum не доращивается инкрементально, а
  // пересобирается целиком заново — тот же приём, что уже в up() этого файла
  // и в 20260811_094105_phase4_7_order_status.ts: колонка временно становится
  // text, получает значения, потом на неё накатывается свежесозданный enum.
  await db.execute(sql`
   ALTER TABLE "homepage" ALTER COLUMN "promo_hero_cta_target" SET DATA TYPE text;
  ALTER TABLE "settings" ALTER COLUMN "promo_banner_link_target" SET DATA TYPE text;
  ALTER TABLE "navigation_header" ALTER COLUMN "target" SET DATA TYPE text;`)

  await db.execute(sql`
   UPDATE "homepage" h SET "promo_hero_cta_target" = p."slug"
    FROM "pages" p WHERE h."promo_hero_cta_target_mode" = 'page' AND p.id = h."promo_hero_cta_target_page_id"
    AND p."slug" IN ('about', 'delivery', 'contacts');
  UPDATE "settings" s SET "promo_banner_link_target" = p."slug"
    FROM "pages" p WHERE s."promo_banner_link_target_mode" = 'page' AND p.id = s."promo_banner_link_target_page_id"
    AND p."slug" IN ('about', 'delivery', 'contacts');
  UPDATE "navigation_header" nh SET "target" = p."slug"
    FROM "pages" p WHERE nh."target_mode" = 'page' AND p.id = nh."target_page_id"
    AND p."slug" IN ('about', 'delivery', 'contacts');`)

  await db.execute(sql`
   DROP TYPE "public"."enum_homepage_promo_hero_cta_target";
  CREATE TYPE "public"."enum_homepage_promo_hero_cta_target" AS ENUM('home', 'catalog', 'catalogDiscounted', 'catalogNew', 'brands', 'about', 'delivery', 'contacts', 'orderLookup');
  ALTER TABLE "homepage" ALTER COLUMN "promo_hero_cta_target" SET DATA TYPE "public"."enum_homepage_promo_hero_cta_target" USING "promo_hero_cta_target"::"public"."enum_homepage_promo_hero_cta_target";
  DROP TYPE "public"."enum_settings_promo_banner_link_target";
  CREATE TYPE "public"."enum_settings_promo_banner_link_target" AS ENUM('home', 'catalog', 'catalogDiscounted', 'catalogNew', 'brands', 'about', 'delivery', 'contacts', 'orderLookup');
  ALTER TABLE "settings" ALTER COLUMN "promo_banner_link_target" SET DATA TYPE "public"."enum_settings_promo_banner_link_target" USING "promo_banner_link_target"::"public"."enum_settings_promo_banner_link_target";
  DROP TYPE "public"."enum_navigation_header_target";
  CREATE TYPE "public"."enum_navigation_header_target" AS ENUM('home', 'catalog', 'catalogDiscounted', 'catalogNew', 'brands', 'about', 'delivery', 'contacts', 'orderLookup');
  ALTER TABLE "navigation_header" ALTER COLUMN "target" SET DATA TYPE "public"."enum_navigation_header_target" USING "target"::"public"."enum_navigation_header_target";`)

  await db.execute(sql`
   ALTER TABLE "homepage" DROP CONSTRAINT "homepage_promo_hero_cta_target_page_id_pages_id_fk";
  ALTER TABLE "settings" DROP CONSTRAINT "settings_promo_banner_link_target_page_id_pages_id_fk";
  ALTER TABLE "navigation_header" DROP CONSTRAINT "navigation_header_target_page_id_pages_id_fk";
  DROP INDEX "homepage_promo_hero_promo_hero_cta_target_page_idx";
  DROP INDEX "settings_promo_banner_promo_banner_link_target_page_idx";
  DROP INDEX "navigation_header_target_page_idx";
  ALTER TABLE "homepage" DROP COLUMN "promo_hero_cta_target_mode";
  ALTER TABLE "homepage" DROP COLUMN "promo_hero_cta_target_page_id";
  ALTER TABLE "settings" DROP COLUMN "promo_banner_link_target_mode";
  ALTER TABLE "settings" DROP COLUMN "promo_banner_link_target_page_id";
  ALTER TABLE "navigation_header" DROP COLUMN "target_mode";
  ALTER TABLE "navigation_header" DROP COLUMN "target_page_id";
  DROP TYPE "public"."enum_homepage_promo_hero_cta_target_mode";
  DROP TYPE "public"."enum_settings_promo_banner_link_target_mode";
  DROP TYPE "public"."enum_navigation_header_target_mode";`)
}
