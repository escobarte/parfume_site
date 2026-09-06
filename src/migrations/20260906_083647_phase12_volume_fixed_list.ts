import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * ПРОМПТ 12-дополнение — объём товара: свободное число мл → фиксированный
 * список из 5 значений (3ml/5ml/10ml/travel/full, `src/lib/catalog/volume.ts`).
 *
 * Автогенерированный `payload migrate:create` предложил голый
 * `ALTER COLUMN ... USING volume::enum_type` — это упало бы рантайм-ошибкой
 * на любой непустой таблице (Postgres не умеет кастовать `numeric` в `enum`
 * по значению-числу как строке, «30»::enum_x не существует как ярлык).
 * Тот же паттерн, что и у прежних миграций enum↔text (title/family,
 * см. GOTCHAS.md) — вручную вставлен перенос данных между drop/create:
 * временная колонка → `UPDATE ... CASE WHEN` по правилу ниже → drop старой →
 * rename.
 *
 * Правило переноса (совпадает с `migrateLegacyVolume()` в volume.ts —
 * держать в синхроне, если поменяется):
 *   - точное 3 / 5 / 10 — прямо в соответствующий бакет;
 *   - > 10 (30/50/80/90/100 и т.п.) — ВСЕГДА Full Size, никогда Travel Size
 *     (тот проставляется только вручную/новым CSV, ни один старый товар не
 *     мог иметь значения, которое должно стать Travel Size автоматически);
 *   - между 3 и 10 (не 5 ровно) — к ближайшему из {3,5,10} по границам 4 и 7.
 *
 * `orders_items.volume` — НЕ enum (у Orders нет словаря, это застывший
 * снапшот на момент заказа) — обычный `varchar` сразу с готовой подписью
 * («5 ml»/«Full Size»), тем же правилом, только текстом, а не кодом.
 *
 * Откат — лослив для 30/50/80/... → 'full'/'travel': конкретное старое число
 * восстановить нельзя (несколько разных чисел схлопнулись в одно значение),
 * это осознанно, тот же принцип, что и у отката family/title (см. GOTCHAS.md,
 * «Обратное направление миграции… данные между старым и новым расположением
 * колонки»). down() подставляет представительное число (full→30, travel→15),
 * не настоящее историческое.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "public"."enum_products_variants_volume" AS ENUM('3ml', '5ml', '10ml', 'travel', 'full');
  ALTER TABLE "products_variants" ADD COLUMN "volume_new" "public"."enum_products_variants_volume";
  UPDATE "products_variants" SET "volume_new" = (CASE
    WHEN "volume" = 3 THEN '3ml'
    WHEN "volume" = 5 THEN '5ml'
    WHEN "volume" = 10 THEN '10ml'
    WHEN "volume" > 10 THEN 'full'
    WHEN "volume" <= 4 THEN '3ml'
    WHEN "volume" <= 7 THEN '5ml'
    WHEN "volume" IS NOT NULL THEN '10ml'
    ELSE NULL
  END)::"public"."enum_products_variants_volume";
  ALTER TABLE "products_variants" DROP COLUMN "volume";
  ALTER TABLE "products_variants" RENAME COLUMN "volume_new" TO "volume";

  CREATE TYPE "public"."enum__products_v_version_variants_volume" AS ENUM('3ml', '5ml', '10ml', 'travel', 'full');
  ALTER TABLE "_products_v_version_variants" ADD COLUMN "volume_new" "public"."enum__products_v_version_variants_volume";
  UPDATE "_products_v_version_variants" SET "volume_new" = (CASE
    WHEN "volume" = 3 THEN '3ml'
    WHEN "volume" = 5 THEN '5ml'
    WHEN "volume" = 10 THEN '10ml'
    WHEN "volume" > 10 THEN 'full'
    WHEN "volume" <= 4 THEN '3ml'
    WHEN "volume" <= 7 THEN '5ml'
    WHEN "volume" IS NOT NULL THEN '10ml'
    ELSE NULL
  END)::"public"."enum__products_v_version_variants_volume";
  ALTER TABLE "_products_v_version_variants" DROP COLUMN "volume";
  ALTER TABLE "_products_v_version_variants" RENAME COLUMN "volume_new" TO "volume";

  ALTER TABLE "orders_items" ADD COLUMN "volume_new" varchar;
  UPDATE "orders_items" SET "volume_new" = CASE
    WHEN "volume" = 3 THEN '3 ml'
    WHEN "volume" = 5 THEN '5 ml'
    WHEN "volume" = 10 THEN '10 ml'
    WHEN "volume" > 10 THEN 'Full Size'
    WHEN "volume" <= 4 THEN '3 ml'
    WHEN "volume" <= 7 THEN '5 ml'
    WHEN "volume" IS NOT NULL THEN '10 ml'
    ELSE NULL
  END;
  ALTER TABLE "orders_items" DROP COLUMN "volume";
  ALTER TABLE "orders_items" RENAME COLUMN "volume_new" TO "volume";
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "orders_items" ADD COLUMN "volume_new" numeric;
  UPDATE "orders_items" SET "volume_new" = CASE
    WHEN "volume" = '3 ml' THEN 3
    WHEN "volume" = '5 ml' THEN 5
    WHEN "volume" = '10 ml' THEN 10
    WHEN "volume" = 'Full Size' THEN 30
    WHEN "volume" = 'Travel Size' THEN 15
    ELSE NULL
  END;
  ALTER TABLE "orders_items" DROP COLUMN "volume";
  ALTER TABLE "orders_items" RENAME COLUMN "volume_new" TO "volume";

  ALTER TABLE "_products_v_version_variants" ADD COLUMN "volume_new" numeric;
  UPDATE "_products_v_version_variants" SET "volume_new" = CASE
    WHEN "volume" = '3ml' THEN 3
    WHEN "volume" = '5ml' THEN 5
    WHEN "volume" = '10ml' THEN 10
    WHEN "volume" = 'full' THEN 30
    WHEN "volume" = 'travel' THEN 15
    ELSE NULL
  END;
  ALTER TABLE "_products_v_version_variants" DROP COLUMN "volume";
  ALTER TABLE "_products_v_version_variants" RENAME COLUMN "volume_new" TO "volume";
  DROP TYPE "public"."enum__products_v_version_variants_volume";

  ALTER TABLE "products_variants" ADD COLUMN "volume_new" numeric;
  UPDATE "products_variants" SET "volume_new" = CASE
    WHEN "volume" = '3ml' THEN 3
    WHEN "volume" = '5ml' THEN 5
    WHEN "volume" = '10ml' THEN 10
    WHEN "volume" = 'full' THEN 30
    WHEN "volume" = 'travel' THEN 15
    ELSE NULL
  END;
  ALTER TABLE "products_variants" DROP COLUMN "volume";
  ALTER TABLE "products_variants" RENAME COLUMN "volume_new" TO "volume";
  DROP TYPE "public"."enum_products_variants_volume";
  `)
}
