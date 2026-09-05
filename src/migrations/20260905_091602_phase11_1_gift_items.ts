import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_gift_items_type" AS ENUM('certificate', 'giftBox');
  CREATE TABLE "gift_items_variants" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"amount" numeric NOT NULL,
  	"sku" varchar NOT NULL,
  	"stock" numeric DEFAULT 0 NOT NULL,
  	"is_active" boolean DEFAULT true
  );
  
  CREATE TABLE "gift_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"type" "enum_gift_items_type" DEFAULT 'certificate' NOT NULL,
  	"image_id" integer,
  	"is_active" boolean DEFAULT true,
  	"min_price" numeric,
  	"max_price" numeric,
  	"in_stock" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "gift_items_locales" (
  	"title" varchar NOT NULL,
  	"description" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "gift_items_id" integer;
  ALTER TABLE "gift_items_variants" ADD CONSTRAINT "gift_items_variants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."gift_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "gift_items" ADD CONSTRAINT "gift_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "gift_items_locales" ADD CONSTRAINT "gift_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."gift_items"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "gift_items_variants_order_idx" ON "gift_items_variants" USING btree ("_order");
  CREATE INDEX "gift_items_variants_parent_id_idx" ON "gift_items_variants" USING btree ("_parent_id");
  CREATE INDEX "gift_items_variants_sku_idx" ON "gift_items_variants" USING btree ("sku");
  CREATE UNIQUE INDEX "gift_items_slug_idx" ON "gift_items" USING btree ("slug");
  CREATE INDEX "gift_items_type_idx" ON "gift_items" USING btree ("type");
  CREATE INDEX "gift_items_image_idx" ON "gift_items" USING btree ("image_id");
  CREATE INDEX "gift_items_is_active_idx" ON "gift_items" USING btree ("is_active");
  CREATE INDEX "gift_items_min_price_idx" ON "gift_items" USING btree ("min_price");
  CREATE INDEX "gift_items_max_price_idx" ON "gift_items" USING btree ("max_price");
  CREATE INDEX "gift_items_in_stock_idx" ON "gift_items" USING btree ("in_stock");
  CREATE INDEX "gift_items_updated_at_idx" ON "gift_items" USING btree ("updated_at");
  CREATE INDEX "gift_items_created_at_idx" ON "gift_items" USING btree ("created_at");
  CREATE INDEX "gift_items_title_idx" ON "gift_items_locales" USING btree ("title","_locale");
  CREATE UNIQUE INDEX "gift_items_locales_locale_parent_id_unique" ON "gift_items_locales" USING btree ("_locale","_parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_gift_items_fk" FOREIGN KEY ("gift_items_id") REFERENCES "public"."gift_items"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_gift_items_id_idx" ON "payload_locked_documents_rels" USING btree ("gift_items_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "gift_items_variants" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "gift_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "gift_items_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "gift_items_variants" CASCADE;
  DROP TABLE "gift_items" CASCADE;
  DROP TABLE "gift_items_locales" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_gift_items_fk";
  
  DROP INDEX "payload_locked_documents_rels_gift_items_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "gift_items_id";
  DROP TYPE "public"."enum_gift_items_type";`)
}
