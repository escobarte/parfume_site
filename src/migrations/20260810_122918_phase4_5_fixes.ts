import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_homepage_promo_hero_cta_target" AS ENUM('home', 'catalog', 'catalogDiscounted', 'brands', 'about', 'delivery', 'contacts');
  CREATE TYPE "public"."enum_settings_promo_banner_link_target" AS ENUM('home', 'catalog', 'catalogDiscounted', 'brands', 'about', 'delivery', 'contacts');
  DROP INDEX "products_is_sale_idx";
  DROP INDEX "_products_v_version_version_is_sale_idx";
  ALTER TABLE "homepage" ADD COLUMN "promo_hero_cta_target" "enum_homepage_promo_hero_cta_target";
  ALTER TABLE "homepage" ADD COLUMN "promo_hero_cta_target_override" varchar;
  ALTER TABLE "settings" ADD COLUMN "promo_banner_link_target" "enum_settings_promo_banner_link_target";
  ALTER TABLE "settings" ADD COLUMN "promo_banner_link_target_override" varchar;
  ALTER TABLE "products" DROP COLUMN "is_sale";
  ALTER TABLE "_products_v" DROP COLUMN "version_is_sale";
  ALTER TABLE "homepage" DROP COLUMN "promo_hero_cta_href";
  ALTER TABLE "settings" DROP COLUMN "promo_banner_link_href";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products" ADD COLUMN "is_sale" boolean DEFAULT false;
  ALTER TABLE "_products_v" ADD COLUMN "version_is_sale" boolean DEFAULT false;
  ALTER TABLE "homepage" ADD COLUMN "promo_hero_cta_href" varchar;
  ALTER TABLE "settings" ADD COLUMN "promo_banner_link_href" varchar;
  CREATE INDEX "products_is_sale_idx" ON "products" USING btree ("is_sale");
  CREATE INDEX "_products_v_version_version_is_sale_idx" ON "_products_v" USING btree ("version_is_sale");
  ALTER TABLE "homepage" DROP COLUMN "promo_hero_cta_target";
  ALTER TABLE "homepage" DROP COLUMN "promo_hero_cta_target_override";
  ALTER TABLE "settings" DROP COLUMN "promo_banner_link_target";
  ALTER TABLE "settings" DROP COLUMN "promo_banner_link_target_override";
  DROP TYPE "public"."enum_homepage_promo_hero_cta_target";
  DROP TYPE "public"."enum_settings_promo_banner_link_target";`)
}
