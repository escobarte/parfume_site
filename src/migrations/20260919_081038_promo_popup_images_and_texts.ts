import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Редизайн попапа «первая скидка» (2026-09-19): картинки и новые тексты.
 *
 * Миграция строго АДДИТИВНАЯ — только новые nullable-колонки в таблице локалей
 * глобала. Существующие `title`/`footer_text`/`discount_percent`/`is_enabled`/
 * `require_phone` не трогаются вовсе: правило фолбэка локалей — это чтение
 * (`src/lib/content/promoPopup.ts`), схемы оно не касается.
 *
 * В `down` у всех `DROP` стоит `IF EXISTS` — см. docs/GOTCHAS.md: генератор
 * Payload умеет выдавать неисполнимый откат, а миграция обязана проходить
 * вверх→вниз→вверх, иначе поломка обнаружится в день, когда откат понадобится.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "promo_popup_settings_locales" ADD COLUMN "image_id" integer;
  ALTER TABLE "promo_popup_settings_locales" ADD COLUMN "image_alt" varchar;
  ALTER TABLE "promo_popup_settings_locales" ADD COLUMN "image_mobile_id" integer;
  ALTER TABLE "promo_popup_settings_locales" ADD COLUMN "image_mobile_alt" varchar;
  ALTER TABLE "promo_popup_settings_locales" ADD COLUMN "subtitle" varchar;
  ALTER TABLE "promo_popup_settings_locales" ADD COLUMN "description" varchar;
  ALTER TABLE "promo_popup_settings_locales" ADD COLUMN "button_label" varchar;
  ALTER TABLE "promo_popup_settings_locales" ADD CONSTRAINT "promo_popup_settings_locales_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "promo_popup_settings_locales" ADD CONSTRAINT "promo_popup_settings_locales_image_mobile_id_media_id_fk" FOREIGN KEY ("image_mobile_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "promo_popup_settings_image_idx" ON "promo_popup_settings_locales" USING btree ("image_id","_locale");
  CREATE INDEX "promo_popup_settings_image_mobile_idx" ON "promo_popup_settings_locales" USING btree ("image_mobile_id","_locale");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "promo_popup_settings_locales" DROP CONSTRAINT IF EXISTS "promo_popup_settings_locales_image_id_media_id_fk";
  
  ALTER TABLE "promo_popup_settings_locales" DROP CONSTRAINT IF EXISTS "promo_popup_settings_locales_image_mobile_id_media_id_fk";
  
  DROP INDEX IF EXISTS "promo_popup_settings_image_idx";
  DROP INDEX IF EXISTS "promo_popup_settings_image_mobile_idx";
  ALTER TABLE "promo_popup_settings_locales" DROP COLUMN IF EXISTS "image_id";
  ALTER TABLE "promo_popup_settings_locales" DROP COLUMN IF EXISTS "image_alt";
  ALTER TABLE "promo_popup_settings_locales" DROP COLUMN IF EXISTS "image_mobile_id";
  ALTER TABLE "promo_popup_settings_locales" DROP COLUMN IF EXISTS "image_mobile_alt";
  ALTER TABLE "promo_popup_settings_locales" DROP COLUMN IF EXISTS "subtitle";
  ALTER TABLE "promo_popup_settings_locales" DROP COLUMN IF EXISTS "description";
  ALTER TABLE "promo_popup_settings_locales" DROP COLUMN IF EXISTS "button_label";`)
}
