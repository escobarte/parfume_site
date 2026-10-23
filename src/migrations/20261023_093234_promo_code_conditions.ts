import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_promo_codes_volumes" AS ENUM('3ml', '5ml', '10ml', 'Travel Size', 'Full Size');
  CREATE TYPE "public"."enum_promo_codes_applies_to" AS ENUM('all', 'decants', 'volumes');
  CREATE TABLE "promo_codes_volumes" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_promo_codes_volumes",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "promo_codes" ADD COLUMN "min_quantity" numeric;
  ALTER TABLE "promo_codes" ADD COLUMN "applies_to" "enum_promo_codes_applies_to" DEFAULT 'all';
  ALTER TABLE "promo_codes_volumes" ADD CONSTRAINT "promo_codes_volumes_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "promo_codes_volumes_order_idx" ON "promo_codes_volumes" USING btree ("order");
  CREATE INDEX "promo_codes_volumes_parent_idx" ON "promo_codes_volumes" USING btree ("parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "promo_codes_volumes" CASCADE;
  ALTER TABLE "promo_codes" DROP COLUMN "min_quantity";
  ALTER TABLE "promo_codes" DROP COLUMN "applies_to";
  DROP TYPE "public"."enum_promo_codes_volumes";
  DROP TYPE "public"."enum_promo_codes_applies_to";`)
}
