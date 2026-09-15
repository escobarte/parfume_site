import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_products_product_category" ADD VALUE 'lipBalm';
  ALTER TYPE "public"."enum__products_v_version_product_category" ADD VALUE 'lipBalm';`)
}

// Откат: товары, уже размеченные `lipBalm`, иначе не пройдут приведение к
// старому enum (`invalid input value for enum`) — переводятся в дефолтный
// `perfume` (тот же дефолт колонки). Раздел «Lip balm» при откате исчезает
// вместе со значением, так что это единственный исполнимый вариант.
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products" ALTER COLUMN "product_category" SET DATA TYPE text;
  UPDATE "products" SET "product_category" = 'perfume' WHERE "product_category" = 'lipBalm';
  ALTER TABLE "products" ALTER COLUMN "product_category" SET DEFAULT 'perfume'::text;
  DROP TYPE "public"."enum_products_product_category";
  CREATE TYPE "public"."enum_products_product_category" AS ENUM('perfume', 'bodyCare');
  ALTER TABLE "products" ALTER COLUMN "product_category" SET DEFAULT 'perfume'::"public"."enum_products_product_category";
  ALTER TABLE "products" ALTER COLUMN "product_category" SET DATA TYPE "public"."enum_products_product_category" USING "product_category"::"public"."enum_products_product_category";
  ALTER TABLE "_products_v" ALTER COLUMN "version_product_category" SET DATA TYPE text;
  UPDATE "_products_v" SET "version_product_category" = 'perfume' WHERE "version_product_category" = 'lipBalm';
  ALTER TABLE "_products_v" ALTER COLUMN "version_product_category" SET DEFAULT 'perfume'::text;
  DROP TYPE "public"."enum__products_v_version_product_category";
  CREATE TYPE "public"."enum__products_v_version_product_category" AS ENUM('perfume', 'bodyCare');
  ALTER TABLE "_products_v" ALTER COLUMN "version_product_category" SET DEFAULT 'perfume'::"public"."enum__products_v_version_product_category";
  ALTER TABLE "_products_v" ALTER COLUMN "version_product_category" SET DATA TYPE "public"."enum__products_v_version_product_category" USING "version_product_category"::"public"."enum__products_v_version_product_category";`)
}
