import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "promo_codes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"percent" numeric NOT NULL,
  	"is_active" boolean DEFAULT true,
  	"is_used" boolean DEFAULT false,
  	"expires_at" timestamp(3) with time zone,
  	"used_in_order_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "orders" ADD COLUMN "promo_code" varchar;
  ALTER TABLE "orders" ADD COLUMN "promo_discount_percent" numeric;
  ALTER TABLE "orders" ADD COLUMN "promo_discount_amount" numeric;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "promo_codes_id" integer;
  ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_used_in_order_id_orders_id_fk" FOREIGN KEY ("used_in_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "promo_codes_code_idx" ON "promo_codes" USING btree ("code");
  CREATE INDEX "promo_codes_is_active_idx" ON "promo_codes" USING btree ("is_active");
  CREATE INDEX "promo_codes_is_used_idx" ON "promo_codes" USING btree ("is_used");
  CREATE INDEX "promo_codes_used_in_order_idx" ON "promo_codes" USING btree ("used_in_order_id");
  CREATE INDEX "promo_codes_updated_at_idx" ON "promo_codes" USING btree ("updated_at");
  CREATE INDEX "promo_codes_created_at_idx" ON "promo_codes" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_promo_codes_fk" FOREIGN KEY ("promo_codes_id") REFERENCES "public"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_promo_codes_id_idx" ON "payload_locked_documents_rels" USING btree ("promo_codes_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "promo_codes" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "promo_codes" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_promo_codes_fk";
  
  DROP INDEX "payload_locked_documents_rels_promo_codes_id_idx";
  ALTER TABLE "orders" DROP COLUMN "promo_code";
  ALTER TABLE "orders" DROP COLUMN "promo_discount_percent";
  ALTER TABLE "orders" DROP COLUMN "promo_discount_amount";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "promo_codes_id";`)
}
