import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_orders_notify_status_email_manager_status" AS ENUM('sent', 'failed', 'skipped');
  CREATE TYPE "public"."enum_orders_notify_status_email_customer_status" AS ENUM('sent', 'failed', 'skipped');
  CREATE TYPE "public"."enum_orders_notify_status_telegram_status" AS ENUM('sent', 'failed', 'skipped');
  ALTER TABLE "orders" ADD COLUMN "notify_status_email_manager_status" "enum_orders_notify_status_email_manager_status";
  ALTER TABLE "orders" ADD COLUMN "notify_status_email_manager_attempts" numeric;
  ALTER TABLE "orders" ADD COLUMN "notify_status_email_manager_last_error" varchar;
  ALTER TABLE "orders" ADD COLUMN "notify_status_email_customer_status" "enum_orders_notify_status_email_customer_status";
  ALTER TABLE "orders" ADD COLUMN "notify_status_email_customer_attempts" numeric;
  ALTER TABLE "orders" ADD COLUMN "notify_status_email_customer_last_error" varchar;
  ALTER TABLE "orders" ADD COLUMN "notify_status_telegram_status" "enum_orders_notify_status_telegram_status";
  ALTER TABLE "orders" ADD COLUMN "notify_status_telegram_attempts" numeric;
  ALTER TABLE "orders" ADD COLUMN "notify_status_telegram_last_error" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "orders" DROP COLUMN "notify_status_email_manager_status";
  ALTER TABLE "orders" DROP COLUMN "notify_status_email_manager_attempts";
  ALTER TABLE "orders" DROP COLUMN "notify_status_email_manager_last_error";
  ALTER TABLE "orders" DROP COLUMN "notify_status_email_customer_status";
  ALTER TABLE "orders" DROP COLUMN "notify_status_email_customer_attempts";
  ALTER TABLE "orders" DROP COLUMN "notify_status_email_customer_last_error";
  ALTER TABLE "orders" DROP COLUMN "notify_status_telegram_status";
  ALTER TABLE "orders" DROP COLUMN "notify_status_telegram_attempts";
  ALTER TABLE "orders" DROP COLUMN "notify_status_telegram_last_error";
  DROP TYPE "public"."enum_orders_notify_status_email_manager_status";
  DROP TYPE "public"."enum_orders_notify_status_email_customer_status";
  DROP TYPE "public"."enum_orders_notify_status_telegram_status";`)
}
