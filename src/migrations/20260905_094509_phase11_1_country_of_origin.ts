import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_products_country_of_origin" AS ENUM('uae', 'europe', 'usa');
  CREATE TYPE "public"."enum__products_v_version_country_of_origin" AS ENUM('uae', 'europe', 'usa');
  ALTER TABLE "products" ADD COLUMN "country_of_origin" "enum_products_country_of_origin" DEFAULT 'europe';
  ALTER TABLE "_products_v" ADD COLUMN "version_country_of_origin" "enum__products_v_version_country_of_origin" DEFAULT 'europe';
  CREATE INDEX "products_country_of_origin_idx" ON "products" USING btree ("country_of_origin");
  CREATE INDEX "_products_v_version_version_country_of_origin_idx" ON "_products_v" USING btree ("version_country_of_origin");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "products_country_of_origin_idx";
  DROP INDEX "_products_v_version_version_country_of_origin_idx";
  ALTER TABLE "products" DROP COLUMN "country_of_origin";
  ALTER TABLE "_products_v" DROP COLUMN "version_country_of_origin";
  DROP TYPE "public"."enum_products_country_of_origin";
  DROP TYPE "public"."enum__products_v_version_country_of_origin";`)
}
