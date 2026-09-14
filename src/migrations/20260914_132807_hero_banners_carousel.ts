import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Карусель баннеров главной (2026-09-14): `homepage.heroBanners` вместо
 * групп `hero`, `promoHero` и `editorial`.
 *
 * **Данные старых групп теряются намеренно** — замена концепции первого
 * экрана согласована владельцем: тексты hero/editorial и промо-картинки
 * переносить некуда, в новой модели текст вшит в картинку баннера.
 * Файлы в Media не удаляются — отвязываются только ссылки на них.
 *
 * `down` возвращает форму схемы, но не содержимое: колонки встают пустыми
 * (`hero_title` — со значением по умолчанию «Find your signature.»).
 * Генератор ответил «create enum» на все вопросы о переименовании: enum
 * ссылки у баннера — новый тип, а не переименованный `promo_hero_cta_target`.
 * Проверено вверх→вниз→вверх.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_homepage_hero_banners_link_mode" AS ENUM('system', 'page');
  CREATE TYPE "public"."enum_homepage_hero_banners_link" AS ENUM('home', 'catalog', 'catalogDiscounted', 'catalogNew', 'brands', 'orderLookup');
  CREATE TABLE "homepage_hero_banners" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"link_mode" "enum_homepage_hero_banners_link_mode" DEFAULT 'system',
  	"link" "enum_homepage_hero_banners_link",
  	"link_page_id" integer,
  	"link_override" varchar
  );
  
  CREATE TABLE "homepage_hero_banners_locales" (
  	"image_id" integer,
  	"alt" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  ALTER TABLE "homepage" DROP CONSTRAINT "homepage_promo_hero_cta_target_page_id_pages_id_fk";
  
  ALTER TABLE "homepage" DROP CONSTRAINT "homepage_promo_hero_image_id_media_id_fk";
  
  ALTER TABLE "homepage" DROP CONSTRAINT "homepage_editorial_image_id_media_id_fk";
  
  DROP INDEX "homepage_promo_hero_promo_hero_cta_target_page_idx";
  DROP INDEX "homepage_promo_hero_promo_hero_image_idx";
  DROP INDEX "homepage_editorial_editorial_image_idx";
  ALTER TABLE "homepage_hero_banners" ADD CONSTRAINT "homepage_hero_banners_link_page_id_pages_id_fk" FOREIGN KEY ("link_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage_hero_banners" ADD CONSTRAINT "homepage_hero_banners_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_hero_banners_locales" ADD CONSTRAINT "homepage_hero_banners_locales_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage_hero_banners_locales" ADD CONSTRAINT "homepage_hero_banners_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage_hero_banners"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "homepage_hero_banners_order_idx" ON "homepage_hero_banners" USING btree ("_order");
  CREATE INDEX "homepage_hero_banners_parent_id_idx" ON "homepage_hero_banners" USING btree ("_parent_id");
  CREATE INDEX "homepage_hero_banners_link_page_idx" ON "homepage_hero_banners" USING btree ("link_page_id");
  CREATE INDEX "homepage_hero_banners_image_idx" ON "homepage_hero_banners_locales" USING btree ("image_id","_locale");
  CREATE UNIQUE INDEX "homepage_hero_banners_locales_locale_parent_id_unique" ON "homepage_hero_banners_locales" USING btree ("_locale","_parent_id");
  ALTER TABLE "homepage" DROP COLUMN "hero_eyebrow";
  ALTER TABLE "homepage" DROP COLUMN "hero_cta_href";
  ALTER TABLE "homepage" DROP COLUMN "promo_hero_enabled";
  ALTER TABLE "homepage" DROP COLUMN "promo_hero_cta_target_mode";
  ALTER TABLE "homepage" DROP COLUMN "promo_hero_cta_target";
  ALTER TABLE "homepage" DROP COLUMN "promo_hero_cta_target_page_id";
  ALTER TABLE "homepage" DROP COLUMN "promo_hero_cta_target_override";
  ALTER TABLE "homepage" DROP COLUMN "promo_hero_image_id";
  ALTER TABLE "homepage" DROP COLUMN "promo_hero_start_date";
  ALTER TABLE "homepage" DROP COLUMN "promo_hero_end_date";
  ALTER TABLE "homepage" DROP COLUMN "editorial_link_href";
  ALTER TABLE "homepage" DROP COLUMN "editorial_image_id";
  ALTER TABLE "homepage_locales" DROP COLUMN "hero_title";
  ALTER TABLE "homepage_locales" DROP COLUMN "hero_subtitle";
  ALTER TABLE "homepage_locales" DROP COLUMN "hero_cta_label";
  ALTER TABLE "homepage_locales" DROP COLUMN "promo_hero_eyebrow";
  ALTER TABLE "homepage_locales" DROP COLUMN "promo_hero_title";
  ALTER TABLE "homepage_locales" DROP COLUMN "promo_hero_subtitle";
  ALTER TABLE "homepage_locales" DROP COLUMN "promo_hero_cta_label";
  ALTER TABLE "homepage_locales" DROP COLUMN "editorial_phrase";
  ALTER TABLE "homepage_locales" DROP COLUMN "editorial_text";
  ALTER TABLE "homepage_locales" DROP COLUMN "editorial_link_label";
  DROP TYPE "public"."enum_homepage_promo_hero_cta_target_mode";
  DROP TYPE "public"."enum_homepage_promo_hero_cta_target";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_homepage_promo_hero_cta_target_mode" AS ENUM('system', 'page');
  CREATE TYPE "public"."enum_homepage_promo_hero_cta_target" AS ENUM('home', 'catalog', 'catalogDiscounted', 'catalogNew', 'brands', 'orderLookup');
  ALTER TABLE "homepage_hero_banners" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "homepage_hero_banners_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "homepage_hero_banners" CASCADE;
  DROP TABLE "homepage_hero_banners_locales" CASCADE;
  ALTER TABLE "homepage" ADD COLUMN "hero_eyebrow" varchar DEFAULT 'Perfumes for everyone';
  ALTER TABLE "homepage" ADD COLUMN "hero_cta_href" varchar DEFAULT '/catalog';
  ALTER TABLE "homepage" ADD COLUMN "promo_hero_enabled" boolean DEFAULT false;
  ALTER TABLE "homepage" ADD COLUMN "promo_hero_cta_target_mode" "enum_homepage_promo_hero_cta_target_mode" DEFAULT 'system';
  ALTER TABLE "homepage" ADD COLUMN "promo_hero_cta_target" "enum_homepage_promo_hero_cta_target";
  ALTER TABLE "homepage" ADD COLUMN "promo_hero_cta_target_page_id" integer;
  ALTER TABLE "homepage" ADD COLUMN "promo_hero_cta_target_override" varchar;
  ALTER TABLE "homepage" ADD COLUMN "promo_hero_image_id" integer;
  ALTER TABLE "homepage" ADD COLUMN "promo_hero_start_date" timestamp(3) with time zone;
  ALTER TABLE "homepage" ADD COLUMN "promo_hero_end_date" timestamp(3) with time zone;
  ALTER TABLE "homepage" ADD COLUMN "editorial_link_href" varchar;
  ALTER TABLE "homepage" ADD COLUMN "editorial_image_id" integer;
  ALTER TABLE "homepage_locales" ADD COLUMN "hero_title" varchar DEFAULT 'Find your signature.' NOT NULL;
  ALTER TABLE "homepage_locales" ADD COLUMN "hero_subtitle" varchar;
  ALTER TABLE "homepage_locales" ADD COLUMN "hero_cta_label" varchar;
  ALTER TABLE "homepage_locales" ADD COLUMN "promo_hero_eyebrow" varchar;
  ALTER TABLE "homepage_locales" ADD COLUMN "promo_hero_title" varchar;
  ALTER TABLE "homepage_locales" ADD COLUMN "promo_hero_subtitle" varchar;
  ALTER TABLE "homepage_locales" ADD COLUMN "promo_hero_cta_label" varchar;
  ALTER TABLE "homepage_locales" ADD COLUMN "editorial_phrase" varchar DEFAULT 'A scent for every story.';
  ALTER TABLE "homepage_locales" ADD COLUMN "editorial_text" varchar;
  ALTER TABLE "homepage_locales" ADD COLUMN "editorial_link_label" varchar;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_promo_hero_cta_target_page_id_pages_id_fk" FOREIGN KEY ("promo_hero_cta_target_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_promo_hero_image_id_media_id_fk" FOREIGN KEY ("promo_hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_editorial_image_id_media_id_fk" FOREIGN KEY ("editorial_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "homepage_promo_hero_promo_hero_cta_target_page_idx" ON "homepage" USING btree ("promo_hero_cta_target_page_id");
  CREATE INDEX "homepage_promo_hero_promo_hero_image_idx" ON "homepage" USING btree ("promo_hero_image_id");
  CREATE INDEX "homepage_editorial_editorial_image_idx" ON "homepage" USING btree ("editorial_image_id");
  DROP TYPE "public"."enum_homepage_hero_banners_link_mode";
  DROP TYPE "public"."enum_homepage_hero_banners_link";`)
}
