import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_orders_delivery_method" AS ENUM('pickup', 'delivery');
  ALTER TABLE "orders" ADD COLUMN "delivery_method" "enum_orders_delivery_method" DEFAULT 'pickup' NOT NULL;
  CREATE INDEX "orders_delivery_method_idx" ON "orders" USING btree ("delivery_method");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "orders_delivery_method_idx";
  ALTER TABLE "orders" DROP COLUMN "delivery_method";
  DROP TYPE "public"."enum_orders_delivery_method";`)
}
