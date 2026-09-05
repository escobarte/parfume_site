import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_products_product_category" AS ENUM('perfume', 'bodyCare');
  CREATE TYPE "public"."enum__products_v_version_product_category" AS ENUM('perfume', 'bodyCare');
  ALTER TYPE "public"."enum_products_gender" ADD VALUE 'kids';
  ALTER TYPE "public"."enum__products_v_version_gender" ADD VALUE 'kids';
  ALTER TABLE "products" ADD COLUMN "product_category" "enum_products_product_category" DEFAULT 'perfume';
  ALTER TABLE "_products_v" ADD COLUMN "version_product_category" "enum__products_v_version_product_category" DEFAULT 'perfume';
  CREATE INDEX "products_product_category_idx" ON "products" USING btree ("product_category");
  CREATE INDEX "_products_v_version_version_product_category_idx" ON "_products_v" USING btree ("version_product_category");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products" ALTER COLUMN "gender" SET DATA TYPE text;
  DROP TYPE "public"."enum_products_gender";
  CREATE TYPE "public"."enum_products_gender" AS ENUM('female', 'male', 'unisex');
  ALTER TABLE "products" ALTER COLUMN "gender" SET DATA TYPE "public"."enum_products_gender" USING "gender"::"public"."enum_products_gender";
  ALTER TABLE "_products_v" ALTER COLUMN "version_gender" SET DATA TYPE text;
  DROP TYPE "public"."enum__products_v_version_gender";
  CREATE TYPE "public"."enum__products_v_version_gender" AS ENUM('female', 'male', 'unisex');
  ALTER TABLE "_products_v" ALTER COLUMN "version_gender" SET DATA TYPE "public"."enum__products_v_version_gender" USING "version_gender"::"public"."enum__products_v_version_gender";
  DROP INDEX "products_product_category_idx";
  DROP INDEX "_products_v_version_version_product_category_idx";
  ALTER TABLE "products" DROP COLUMN "product_category";
  ALTER TABLE "_products_v" DROP COLUMN "version_product_category";
  DROP TYPE "public"."enum_products_product_category";
  DROP TYPE "public"."enum__products_v_version_product_category";`)
}
