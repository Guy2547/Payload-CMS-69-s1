import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ALTER COLUMN "role" DROP NOT NULL;
  ALTER TABLE "employees" ALTER COLUMN "name" DROP NOT NULL;
  ALTER TABLE "employees" ALTER COLUMN "department_id" DROP NOT NULL;
  ALTER TABLE "employees" ALTER COLUMN "position_id" DROP NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;
  ALTER TABLE "employees" ALTER COLUMN "name" SET NOT NULL;
  ALTER TABLE "employees" ALTER COLUMN "department_id" SET NOT NULL;
  ALTER TABLE "employees" ALTER COLUMN "position_id" SET NOT NULL;`)
}
