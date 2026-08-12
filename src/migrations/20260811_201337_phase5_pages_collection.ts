import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_homepage_promo_hero_cta_target" ADD VALUE 'orderLookup';
  ALTER TYPE "public"."enum_settings_promo_banner_link_target" ADD VALUE 'orderLookup';
  ALTER TYPE "public"."enum_navigation_header_target" ADD VALUE 'orderLookup';
  CREATE TABLE "pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"seo_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "pages_locales" (
  	"title" varchar NOT NULL,
  	"body" jsonb,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "pages_id" integer;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_locales" ADD CONSTRAINT "pages_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
  CREATE INDEX "pages_seo_seo_image_idx" ON "pages" USING btree ("seo_image_id");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE INDEX "pages_title_idx" ON "pages_locales" USING btree ("title","_locale");
  CREATE UNIQUE INDEX "pages_locales_locale_parent_id_unique" ON "pages_locales" USING btree ("_locale","_parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "pages_locales" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_pages_fk";
  
  ALTER TABLE "homepage" ALTER COLUMN "promo_hero_cta_target" SET DATA TYPE text;
  DROP TYPE "public"."enum_homepage_promo_hero_cta_target";
  CREATE TYPE "public"."enum_homepage_promo_hero_cta_target" AS ENUM('home', 'catalog', 'catalogDiscounted', 'catalogNew', 'brands', 'about', 'delivery', 'contacts');
  ALTER TABLE "homepage" ALTER COLUMN "promo_hero_cta_target" SET DATA TYPE "public"."enum_homepage_promo_hero_cta_target" USING "promo_hero_cta_target"::"public"."enum_homepage_promo_hero_cta_target";
  ALTER TABLE "settings" ALTER COLUMN "promo_banner_link_target" SET DATA TYPE text;
  DROP TYPE "public"."enum_settings_promo_banner_link_target";
  CREATE TYPE "public"."enum_settings_promo_banner_link_target" AS ENUM('home', 'catalog', 'catalogDiscounted', 'catalogNew', 'brands', 'about', 'delivery', 'contacts');
  ALTER TABLE "settings" ALTER COLUMN "promo_banner_link_target" SET DATA TYPE "public"."enum_settings_promo_banner_link_target" USING "promo_banner_link_target"::"public"."enum_settings_promo_banner_link_target";
  ALTER TABLE "navigation_header" ALTER COLUMN "target" SET DATA TYPE text;
  DROP TYPE "public"."enum_navigation_header_target";
  CREATE TYPE "public"."enum_navigation_header_target" AS ENUM('home', 'catalog', 'catalogDiscounted', 'catalogNew', 'brands', 'about', 'delivery', 'contacts');
  ALTER TABLE "navigation_header" ALTER COLUMN "target" SET DATA TYPE "public"."enum_navigation_header_target" USING "target"::"public"."enum_navigation_header_target";
  DROP INDEX "payload_locked_documents_rels_pages_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "pages_id";`)
}
