import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'new'::text;`)

  // Перенос данных (фаза 4.7.1): значения старого набора, которых нет в
  // новом enum, переименовываются ДО пересоздания типа — иначе USING-cast
  // ниже упадёт на первой же существующей заявке со статусом contacted/done.
  await db.execute(sql`
   UPDATE "orders" SET "status" = 'confirmed' WHERE "status" = 'contacted';
  UPDATE "orders" SET "status" = 'issued' WHERE "status" = 'done';`)

  await db.execute(sql`
   DROP TYPE "public"."enum_orders_status";
  CREATE TYPE "public"."enum_orders_status" AS ENUM('new', 'confirmed', 'ready', 'issued', 'cancelled');
  ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'new'::"public"."enum_orders_status";
  ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE "public"."enum_orders_status" USING "status"::"public"."enum_orders_status";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'new'::text;`)

  // Обратный перенос: ready не существовало раньше — ближайший по смыслу
  // старый статус тот же, что и issued (done), т.к. оба означают «дошло
  // до склада готовым к выдаче или дальше» на шкале из 4 старых значений.
  await db.execute(sql`
   UPDATE "orders" SET "status" = 'contacted' WHERE "status" = 'confirmed';
  UPDATE "orders" SET "status" = 'done' WHERE "status" IN ('ready', 'issued');`)

  await db.execute(sql`
   DROP TYPE "public"."enum_orders_status";
  CREATE TYPE "public"."enum_orders_status" AS ENUM('new', 'contacted', 'done', 'cancelled');
  ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'new'::"public"."enum_orders_status";
  ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE "public"."enum_orders_status" USING "status"::"public"."enum_orders_status";`)
}
