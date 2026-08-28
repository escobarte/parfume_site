import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_orders_checkout_mode" AS ENUM('standard', 'noCall');
  ALTER TABLE "orders" ADD COLUMN "checkout_mode" "enum_orders_checkout_mode" DEFAULT 'standard' NOT NULL;
  ALTER TABLE "orders" ADD COLUMN "customer_address" varchar;
  CREATE INDEX "orders_checkout_mode_idx" ON "orders" USING btree ("checkout_mode");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "orders_checkout_mode_idx";
  ALTER TABLE "orders" DROP COLUMN "checkout_mode";
  ALTER TABLE "orders" DROP COLUMN "customer_address";
  DROP TYPE "public"."enum_orders_checkout_mode";`)
}
