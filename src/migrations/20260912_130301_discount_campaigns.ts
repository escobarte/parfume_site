import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Кампании скидок (2026-09-12) — только новые таблицы:
 * `discount_campaigns` + журнал, конфликты и связи отбора.
 * Схема `products`/`products_variants` НЕ меняется вообще: кампания пишет
 * цены вариантов обычным update, а источник правды для отката — журнал
 * в самой кампании.
 *
 * В `down` два `IF EXISTS` добавлены руками поверх генератора: `DROP TABLE
 * "discount_campaigns" CASCADE` выше уже снимает и внешний ключ, и индекс
 * на `payload_locked_documents_rels`, после чего сгенерированный безусловный
 * `DROP CONSTRAINT` падал с «constraint … does not exist» и откат не
 * проходил вовсе. Проверено вверх→вниз→вверх.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_discount_campaigns_conflicts_reason" AS ENUM('price_changed', 'variant_missing', 'blocked_by_consistency');
  CREATE TYPE "public"."enum_discount_campaigns_status" AS ENUM('draft', 'active', 'finished');
  CREATE TABLE "discount_campaigns_journal" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"sku" varchar NOT NULL,
  	"product_id" integer,
  	"price_before" numeric NOT NULL,
  	"old_price_before" numeric,
  	"price_set" numeric NOT NULL
  );
  
  CREATE TABLE "discount_campaigns_conflicts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"sku" varchar NOT NULL,
  	"reason" "enum_discount_campaigns_conflicts_reason" NOT NULL,
  	"price_now" numeric,
  	"price_set" numeric,
  	"price_before" numeric
  );
  
  CREATE TABLE "discount_campaigns" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"percent" numeric NOT NULL,
  	"status" "enum_discount_campaigns_status" DEFAULT 'draft' NOT NULL,
  	"start_date_note" timestamp(3) with time zone,
  	"end_date_note" timestamp(3) with time zone,
  	"affected_variants_count" numeric,
  	"affected_products_count" numeric,
  	"started_at" timestamp(3) with time zone,
  	"finished_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "discount_campaigns_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"brands_id" integer,
  	"categories_id" integer,
  	"products_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "discount_campaigns_id" integer;
  ALTER TABLE "discount_campaigns_journal" ADD CONSTRAINT "discount_campaigns_journal_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discount_campaigns_journal" ADD CONSTRAINT "discount_campaigns_journal_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."discount_campaigns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discount_campaigns_conflicts" ADD CONSTRAINT "discount_campaigns_conflicts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."discount_campaigns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discount_campaigns_rels" ADD CONSTRAINT "discount_campaigns_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."discount_campaigns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discount_campaigns_rels" ADD CONSTRAINT "discount_campaigns_rels_brands_fk" FOREIGN KEY ("brands_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discount_campaigns_rels" ADD CONSTRAINT "discount_campaigns_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discount_campaigns_rels" ADD CONSTRAINT "discount_campaigns_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "discount_campaigns_journal_order_idx" ON "discount_campaigns_journal" USING btree ("_order");
  CREATE INDEX "discount_campaigns_journal_parent_id_idx" ON "discount_campaigns_journal" USING btree ("_parent_id");
  CREATE INDEX "discount_campaigns_journal_product_idx" ON "discount_campaigns_journal" USING btree ("product_id");
  CREATE INDEX "discount_campaigns_conflicts_order_idx" ON "discount_campaigns_conflicts" USING btree ("_order");
  CREATE INDEX "discount_campaigns_conflicts_parent_id_idx" ON "discount_campaigns_conflicts" USING btree ("_parent_id");
  CREATE INDEX "discount_campaigns_updated_at_idx" ON "discount_campaigns" USING btree ("updated_at");
  CREATE INDEX "discount_campaigns_created_at_idx" ON "discount_campaigns" USING btree ("created_at");
  CREATE INDEX "discount_campaigns_rels_order_idx" ON "discount_campaigns_rels" USING btree ("order");
  CREATE INDEX "discount_campaigns_rels_parent_idx" ON "discount_campaigns_rels" USING btree ("parent_id");
  CREATE INDEX "discount_campaigns_rels_path_idx" ON "discount_campaigns_rels" USING btree ("path");
  CREATE INDEX "discount_campaigns_rels_brands_id_idx" ON "discount_campaigns_rels" USING btree ("brands_id");
  CREATE INDEX "discount_campaigns_rels_categories_id_idx" ON "discount_campaigns_rels" USING btree ("categories_id");
  CREATE INDEX "discount_campaigns_rels_products_id_idx" ON "discount_campaigns_rels" USING btree ("products_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_discount_campaigns_fk" FOREIGN KEY ("discount_campaigns_id") REFERENCES "public"."discount_campaigns"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_discount_campaigns_id_idx" ON "payload_locked_documents_rels" USING btree ("discount_campaigns_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "discount_campaigns_journal" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "discount_campaigns_conflicts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "discount_campaigns" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "discount_campaigns_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "discount_campaigns_journal" CASCADE;
  DROP TABLE "discount_campaigns_conflicts" CASCADE;
  DROP TABLE "discount_campaigns" CASCADE;
  DROP TABLE "discount_campaigns_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_discount_campaigns_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_discount_campaigns_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "discount_campaigns_id";
  DROP TYPE "public"."enum_discount_campaigns_conflicts_reason";
  DROP TYPE "public"."enum_discount_campaigns_status";`)
}
