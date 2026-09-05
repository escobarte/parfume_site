import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_orders_payment_method" AS ENUM('cash', 'card');
  ALTER TABLE "orders" ADD COLUMN "payment_method" "enum_orders_payment_method" DEFAULT 'cash' NOT NULL;
  CREATE INDEX "orders_payment_method_idx" ON "orders" USING btree ("payment_method");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "orders_payment_method_idx";
  ALTER TABLE "orders" DROP COLUMN "payment_method";
  DROP TYPE "public"."enum_orders_payment_method";`)
}
