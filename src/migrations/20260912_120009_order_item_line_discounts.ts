import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Попозиционный снапшот скидки в заявке (2026-09-12). Правило совмещения
 * скидок стало «выигрывает больший процент» и применяется к КАЖДОЙ позиции
 * отдельно, поэтому одним числом на заявку (`promoDiscountAmount`) скидка
 * больше не описывается.
 *
 * Бэкфилла намеренно НЕТ, и колонки оставлены nullable: у заявок, оформленных
 * до этой даты, скидка считалась по старому правилу (промокод процентом от
 * уже уценённой цены, один агрегат на заказ). Проставить им `discountPercent`
 * задним числом значило бы записать в исторические документы правило, по
 * которому они не проводились. Пустые поля у старых заявок — честный ответ
 * «снапшота нет», и админка показывает их как есть.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_orders_items_discount_source" AS ENUM('product', 'promo');
  ALTER TABLE "orders_items" ADD COLUMN "base_price" numeric;
  ALTER TABLE "orders_items" ADD COLUMN "discount_percent" numeric;
  ALTER TABLE "orders_items" ADD COLUMN "discount_source" "enum_orders_items_discount_source";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "orders_items" DROP COLUMN "base_price";
  ALTER TABLE "orders_items" DROP COLUMN "discount_percent";
  ALTER TABLE "orders_items" DROP COLUMN "discount_source";
  DROP TYPE "public"."enum_orders_items_discount_source";`)
}
