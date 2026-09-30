import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "email" varchar;
    ALTER TABLE "employees" ALTER COLUMN "salary" TYPE varchar;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "employees" DROP COLUMN IF EXISTS "email";
    ALTER TABLE "employees" ALTER COLUMN "salary" TYPE numeric USING (salary::numeric);
  `)
}
