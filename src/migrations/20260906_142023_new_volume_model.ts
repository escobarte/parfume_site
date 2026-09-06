import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Новая модель объёма товара — не переходный слой поверх старого числового
 * поля, а замена с нуля: ровно 5 фиксированных значений (3ml/5ml/10ml/
 * Travel Size/Full Size), свободное число мл выведено из системы полностью
 * (`products_variants.volume`, `_products_v_version_variants.volume`,
 * `orders_items.volume` — снапшот заявки, та же витрина значений).
 *
 * Миграция старых данных СОЗНАТЕЛЬНО не делается (прямое указание владельца):
 * старые значения — голые числа мл (5/10/30…), собрать из них валидную метку
 * без ручной карты соответствия нельзя, а её нет и не будет — демо-каталог
 * либо будет вычищен отдельной задачей, либо значения переустанавливаются
 * вручную/тестово. Поэтому вместо `ALTER COLUMN ... USING ... ::enum`
 * (упал бы на числовых значениях) — колонка сносится и заводится заново;
 * как и раньше у `volume` (numeric, без `NOT NULL` на уровне БД — Payload
 * держит `required: true` только в app-слое, версии/драфты должны переживать
 * пустые обязательные поля), новая колонка тоже без DB-level NOT NULL.
 *
 * `DROP TYPE IF EXISTS` в начале — не косметика: у `enum_products_variants_volume`
 * в деве уже был одноимённый тип с другими значениями (3ml/5ml/10ml/travel/full)
 * — недобранный хвост чьей-то более ранней сессии тестирования этой же темы,
 * не отражённый ни в одной миграции репозитория (см. GOTCHAS.md). На проде
 * такого типа нет вообще — там `DROP TYPE IF EXISTS` просто no-op.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  -- Колонки сносятся ДО "DROP TYPE IF EXISTS" ниже: в деве старый (рогатый)
  -- enum ещё используется живой колонкой products_variants.volume — Postgres
  -- не даст дропнуть тип, пока на него ссылается хоть один столбец.
  ALTER TABLE "products_variants" DROP COLUMN "volume";
  ALTER TABLE "_products_v_version_variants" DROP COLUMN "volume";
  ALTER TABLE "orders_items" DROP COLUMN "volume";

  DROP TYPE IF EXISTS "public"."enum_products_variants_volume";
  DROP TYPE IF EXISTS "public"."enum__products_v_version_variants_volume";
  DROP TYPE IF EXISTS "public"."enum_orders_items_volume";

  CREATE TYPE "public"."enum_products_variants_volume" AS ENUM('3ml', '5ml', '10ml', 'Travel Size', 'Full Size');
  CREATE TYPE "public"."enum__products_v_version_variants_volume" AS ENUM('3ml', '5ml', '10ml', 'Travel Size', 'Full Size');
  CREATE TYPE "public"."enum_orders_items_volume" AS ENUM('3ml', '5ml', '10ml', 'Travel Size', 'Full Size');

  ALTER TABLE "products_variants" ADD COLUMN "volume" "public"."enum_products_variants_volume";
  ALTER TABLE "_products_v_version_variants" ADD COLUMN "volume" "public"."enum__products_v_version_variants_volume";
  ALTER TABLE "orders_items" ADD COLUMN "volume" "public"."enum_orders_items_volume";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "products_variants" DROP COLUMN "volume";
  ALTER TABLE "products_variants" ADD COLUMN "volume" numeric;

  ALTER TABLE "_products_v_version_variants" DROP COLUMN "volume";
  ALTER TABLE "_products_v_version_variants" ADD COLUMN "volume" numeric;

  ALTER TABLE "orders_items" DROP COLUMN "volume";
  ALTER TABLE "orders_items" ADD COLUMN "volume" numeric;

  DROP TYPE "public"."enum_products_variants_volume";
  DROP TYPE "public"."enum__products_v_version_variants_volume";
  DROP TYPE "public"."enum_orders_items_volume";`)
}
