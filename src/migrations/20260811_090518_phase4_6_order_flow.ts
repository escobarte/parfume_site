import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_navigation_header_target" AS ENUM('home', 'catalog', 'catalogDiscounted', 'catalogNew', 'brands', 'about', 'delivery', 'contacts');
  ALTER TYPE "public"."enum_homepage_promo_hero_cta_target" ADD VALUE 'catalogNew' BEFORE 'brands';
  ALTER TYPE "public"."enum_settings_promo_banner_link_target" ADD VALUE 'catalogNew' BEFORE 'brands';
  ALTER TABLE "orders" ADD COLUMN "status_token" varchar;
  ALTER TABLE "orders" ADD COLUMN "customer_email" varchar;
  ALTER TABLE "navigation_header" ADD COLUMN "target" "enum_navigation_header_target";
  ALTER TABLE "navigation_header" ADD COLUMN "target_override" varchar;`)

  // Перенос данных (фаза 4.6.4): существующие href шапки мапятся на select-цели —
  // заодно чинит баг «Новинки» → /catalog?new=1 (каталог этот параметр не понимает,
  // нужен flags=isNew). Нераспознанные href не теряются — уходят в override.
  await db.execute(sql`
   UPDATE "navigation_header" SET "target" = 'home' WHERE "href" = '/';
  UPDATE "navigation_header" SET "target" = 'catalog' WHERE "href" = '/catalog';
  UPDATE "navigation_header" SET "target" = 'brands' WHERE "href" = '/brands';
  UPDATE "navigation_header" SET "target" = 'catalogNew' WHERE "href" IN ('/catalog?new=1', '/catalog?flags=isNew');
  UPDATE "navigation_header" SET "target" = 'about' WHERE "href" = '/about';
  UPDATE "navigation_header" SET "target" = 'delivery' WHERE "href" = '/delivery';
  UPDATE "navigation_header" SET "target" = 'contacts' WHERE "href" = '/contacts';
  UPDATE "navigation_header" SET "target_override" = "href" WHERE "target" IS NULL AND "href" IS NOT NULL;`)

  // Токен статуса заказа (фаза 4.7.2) для уже существующих заявок — новые
  // получают его хуком коллекции при создании, старым бэкафилл здесь, чтобы
  // ни одна заявка не осталась без токена.
  await db.execute(sql`
   UPDATE "orders" SET "status_token" = md5(random()::text || clock_timestamp()::text || "id"::text) WHERE "status_token" IS NULL;
  CREATE UNIQUE INDEX "orders_status_token_idx" ON "orders" USING btree ("status_token");
  ALTER TABLE "navigation_header" DROP COLUMN "href";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "homepage" ALTER COLUMN "promo_hero_cta_target" SET DATA TYPE text;
  DROP TYPE "public"."enum_homepage_promo_hero_cta_target";
  CREATE TYPE "public"."enum_homepage_promo_hero_cta_target" AS ENUM('home', 'catalog', 'catalogDiscounted', 'brands', 'about', 'delivery', 'contacts');
  ALTER TABLE "homepage" ALTER COLUMN "promo_hero_cta_target" SET DATA TYPE "public"."enum_homepage_promo_hero_cta_target" USING "promo_hero_cta_target"::"public"."enum_homepage_promo_hero_cta_target";
  ALTER TABLE "settings" ALTER COLUMN "promo_banner_link_target" SET DATA TYPE text;
  DROP TYPE "public"."enum_settings_promo_banner_link_target";
  CREATE TYPE "public"."enum_settings_promo_banner_link_target" AS ENUM('home', 'catalog', 'catalogDiscounted', 'brands', 'about', 'delivery', 'contacts');
  ALTER TABLE "settings" ALTER COLUMN "promo_banner_link_target" SET DATA TYPE "public"."enum_settings_promo_banner_link_target" USING "promo_banner_link_target"::"public"."enum_settings_promo_banner_link_target";
  DROP INDEX "orders_status_token_idx";
  ALTER TABLE "navigation_header" ADD COLUMN "href" varchar;
  UPDATE "navigation_header" SET "href" = COALESCE("target_override", CASE "target"
    WHEN 'home' THEN '/'
    WHEN 'catalog' THEN '/catalog'
    WHEN 'catalogDiscounted' THEN '/catalog?flags=hasDiscount'
    WHEN 'catalogNew' THEN '/catalog?flags=isNew'
    WHEN 'brands' THEN '/brands'
    WHEN 'about' THEN '/about'
    WHEN 'delivery' THEN '/delivery'
    WHEN 'contacts' THEN '/contacts'
    ELSE '/'
  END);
  ALTER TABLE "navigation_header" ALTER COLUMN "href" SET NOT NULL;
  ALTER TABLE "orders" DROP COLUMN "status_token";
  ALTER TABLE "orders" DROP COLUMN "customer_email";
  ALTER TABLE "navigation_header" DROP COLUMN "target";
  ALTER TABLE "navigation_header" DROP COLUMN "target_override";
  DROP TYPE "public"."enum_navigation_header_target";`)
}
