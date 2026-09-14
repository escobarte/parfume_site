import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Планшетная и мобильная картинки баннеров главной (2026-09-14):
 * `imageTablet`/`imageMobile` — localized upload, поэтому колонки в
 * `homepage_hero_banners_locales` рядом с `image_id`.
 *
 * Только добавление nullable-колонок: `image_id` и данные существующих
 * баннеров не трогаются, их пропуск на планшете/мобильном покрывает фолбэк
 * на десктопную в рендере. Безымянная группа «Картинки» в админке — чисто
 * визуальная и в схеме базы не отражается.
 *
 * `down` снимает только эти две колонки (загруженные планшетные/мобильные
 * файлы остаются в Медиа, отвязываются). Проверено вверх→вниз→вверх на базе
 * с существующим баннером.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "homepage_hero_banners_locales" ADD COLUMN "image_tablet_id" integer;
  ALTER TABLE "homepage_hero_banners_locales" ADD COLUMN "image_mobile_id" integer;
  ALTER TABLE "homepage_hero_banners_locales" ADD CONSTRAINT "homepage_hero_banners_locales_image_tablet_id_media_id_fk" FOREIGN KEY ("image_tablet_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage_hero_banners_locales" ADD CONSTRAINT "homepage_hero_banners_locales_image_mobile_id_media_id_fk" FOREIGN KEY ("image_mobile_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "homepage_hero_banners_image_tablet_idx" ON "homepage_hero_banners_locales" USING btree ("image_tablet_id","_locale");
  CREATE INDEX "homepage_hero_banners_image_mobile_idx" ON "homepage_hero_banners_locales" USING btree ("image_mobile_id","_locale");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "homepage_hero_banners_locales" DROP CONSTRAINT "homepage_hero_banners_locales_image_tablet_id_media_id_fk";
  
  ALTER TABLE "homepage_hero_banners_locales" DROP CONSTRAINT "homepage_hero_banners_locales_image_mobile_id_media_id_fk";
  
  DROP INDEX "homepage_hero_banners_image_tablet_idx";
  DROP INDEX "homepage_hero_banners_image_mobile_idx";
  ALTER TABLE "homepage_hero_banners_locales" DROP COLUMN "image_tablet_id";
  ALTER TABLE "homepage_hero_banners_locales" DROP COLUMN "image_mobile_id";`)
}
