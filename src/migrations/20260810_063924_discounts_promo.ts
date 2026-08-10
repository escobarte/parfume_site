import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products" ADD COLUMN "has_discount" boolean DEFAULT false;
  ALTER TABLE "products" ADD COLUMN "max_discount_percent" numeric DEFAULT 0;
  ALTER TABLE "_products_v" ADD COLUMN "version_has_discount" boolean DEFAULT false;
  ALTER TABLE "_products_v" ADD COLUMN "version_max_discount_percent" numeric DEFAULT 0;
  ALTER TABLE "homepage" ADD COLUMN "promo_hero_enabled" boolean DEFAULT false;
  ALTER TABLE "homepage" ADD COLUMN "promo_hero_cta_href" varchar;
  ALTER TABLE "homepage" ADD COLUMN "promo_hero_image_id" integer;
  ALTER TABLE "homepage" ADD COLUMN "promo_hero_start_date" timestamp(3) with time zone;
  ALTER TABLE "homepage" ADD COLUMN "promo_hero_end_date" timestamp(3) with time zone;
  ALTER TABLE "homepage_locales" ADD COLUMN "promo_hero_eyebrow" varchar;
  ALTER TABLE "homepage_locales" ADD COLUMN "promo_hero_title" varchar;
  ALTER TABLE "homepage_locales" ADD COLUMN "promo_hero_subtitle" varchar;
  ALTER TABLE "homepage_locales" ADD COLUMN "promo_hero_cta_label" varchar;
  ALTER TABLE "settings" ADD COLUMN "promo_banner_enabled" boolean DEFAULT false;
  ALTER TABLE "settings" ADD COLUMN "promo_banner_link_href" varchar;
  ALTER TABLE "settings" ADD COLUMN "promo_banner_start_date" timestamp(3) with time zone;
  ALTER TABLE "settings" ADD COLUMN "promo_banner_end_date" timestamp(3) with time zone;
  ALTER TABLE "settings_locales" ADD COLUMN "promo_banner_text" varchar;
  ALTER TABLE "settings_locales" ADD COLUMN "promo_banner_link_label" varchar;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_promo_hero_image_id_media_id_fk" FOREIGN KEY ("promo_hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "products_has_discount_idx" ON "products" USING btree ("has_discount");
  CREATE INDEX "products_max_discount_percent_idx" ON "products" USING btree ("max_discount_percent");
  CREATE INDEX "_products_v_version_version_has_discount_idx" ON "_products_v" USING btree ("version_has_discount");
  CREATE INDEX "_products_v_version_version_max_discount_percent_idx" ON "_products_v" USING btree ("version_max_discount_percent");
  CREATE INDEX "homepage_promo_hero_promo_hero_image_idx" ON "homepage" USING btree ("promo_hero_image_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "homepage" DROP CONSTRAINT "homepage_promo_hero_image_id_media_id_fk";
  
  DROP INDEX "products_has_discount_idx";
  DROP INDEX "products_max_discount_percent_idx";
  DROP INDEX "_products_v_version_version_has_discount_idx";
  DROP INDEX "_products_v_version_version_max_discount_percent_idx";
  DROP INDEX "homepage_promo_hero_promo_hero_image_idx";
  ALTER TABLE "products" DROP COLUMN "has_discount";
  ALTER TABLE "products" DROP COLUMN "max_discount_percent";
  ALTER TABLE "_products_v" DROP COLUMN "version_has_discount";
  ALTER TABLE "_products_v" DROP COLUMN "version_max_discount_percent";
  ALTER TABLE "homepage" DROP COLUMN "promo_hero_enabled";
  ALTER TABLE "homepage" DROP COLUMN "promo_hero_cta_href";
  ALTER TABLE "homepage" DROP COLUMN "promo_hero_image_id";
  ALTER TABLE "homepage" DROP COLUMN "promo_hero_start_date";
  ALTER TABLE "homepage" DROP COLUMN "promo_hero_end_date";
  ALTER TABLE "homepage_locales" DROP COLUMN "promo_hero_eyebrow";
  ALTER TABLE "homepage_locales" DROP COLUMN "promo_hero_title";
  ALTER TABLE "homepage_locales" DROP COLUMN "promo_hero_subtitle";
  ALTER TABLE "homepage_locales" DROP COLUMN "promo_hero_cta_label";
  ALTER TABLE "settings" DROP COLUMN "promo_banner_enabled";
  ALTER TABLE "settings" DROP COLUMN "promo_banner_link_href";
  ALTER TABLE "settings" DROP COLUMN "promo_banner_start_date";
  ALTER TABLE "settings" DROP COLUMN "promo_banner_end_date";
  ALTER TABLE "settings_locales" DROP COLUMN "promo_banner_text";
  ALTER TABLE "settings_locales" DROP COLUMN "promo_banner_link_label";`)
}
