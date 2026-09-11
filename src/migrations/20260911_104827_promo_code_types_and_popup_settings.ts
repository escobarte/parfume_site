import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Типы промокодов (`personal` / `public`) + глобал настроек попапа
 * «первая скидка» (2026-09-11).
 *
 * **Правка сгенерированного кода — из-за бэкфилла, а не из-за формы схемы.**
 * `payload migrate:create` добавил колонку как `DEFAULT 'public' NOT NULL`,
 * то есть все уже существующие коды стали бы публичными. Для них это смена
 * смысла, а не пометка: публичный код НЕ проверяет `isUsed`, поэтому
 * погашенный одноразовый код снова стал бы действительным и многоразовым —
 * тихая раздача скидок на проде.
 *
 * Существующие коды по поведению — ровно `personal` (одноразовые, срок
 * необязателен), поэтому они бэкфиллятся в `personal`, и их поведение после
 * миграции не меняется ни на йоту. `DEFAULT 'public'` остаётся для НОВЫХ
 * записей: руками в админке заводят именно публичные, персональные создаёт
 * бэкенд и тип проставляет явно.
 *
 * Побочно: у старых кодов нет email/phone, а схема требует их для
 * `personal`. Валидация Payload срабатывает только при сохранении через
 * админку/API, существующим строкам она не мешает; при первой ручной правке
 * такого кода админ увидит требование заполнить email — это осознанно, лучше
 * чем молча превратить одноразовый код в бессрочно многоразовый.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_promo_codes_code_type" AS ENUM('personal', 'public');
  CREATE TABLE "promo_popup_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"is_enabled" boolean DEFAULT false,
  	"discount_percent" numeric DEFAULT 15 NOT NULL,
  	"require_phone" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "promo_popup_settings_locales" (
  	"title" varchar,
  	"footer_text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  -- Колонка добавляется nullable, существующие коды помечаются personal
  -- (сохраняет их прежнее поведение), и только потом NOT NULL + DEFAULT.
  ALTER TABLE "promo_codes" ADD COLUMN "code_type" "enum_promo_codes_code_type";
  UPDATE "promo_codes" SET "code_type" = 'personal' WHERE "code_type" IS NULL;
  ALTER TABLE "promo_codes" ALTER COLUMN "code_type" SET NOT NULL;
  ALTER TABLE "promo_codes" ALTER COLUMN "code_type" SET DEFAULT 'public';
  ALTER TABLE "promo_codes" ADD COLUMN "email" varchar;
  ALTER TABLE "promo_codes" ADD COLUMN "phone" varchar;
  ALTER TABLE "promo_codes" ADD COLUMN "customer_name" varchar;
  ALTER TABLE "promo_popup_settings_locales" ADD CONSTRAINT "promo_popup_settings_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."promo_popup_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "promo_popup_settings_locales_locale_parent_id_unique" ON "promo_popup_settings_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "promo_codes_code_type_idx" ON "promo_codes" USING btree ("code_type");
  CREATE INDEX "promo_codes_expires_at_idx" ON "promo_codes" USING btree ("expires_at");
  CREATE INDEX "promo_codes_email_idx" ON "promo_codes" USING btree ("email");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "promo_popup_settings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "promo_popup_settings_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "promo_popup_settings" CASCADE;
  DROP TABLE "promo_popup_settings_locales" CASCADE;
  DROP INDEX "promo_codes_code_type_idx";
  DROP INDEX "promo_codes_expires_at_idx";
  DROP INDEX "promo_codes_email_idx";
  ALTER TABLE "promo_codes" DROP COLUMN "code_type";
  ALTER TABLE "promo_codes" DROP COLUMN "email";
  ALTER TABLE "promo_codes" DROP COLUMN "phone";
  ALTER TABLE "promo_codes" DROP COLUMN "customer_name";
  DROP TYPE "public"."enum_promo_codes_code_type";`)
}
