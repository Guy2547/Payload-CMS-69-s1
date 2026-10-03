import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_users_role" AS ENUM('admin', 'hr', 'manager', 'employee');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" "enum_users_role" DEFAULT 'employee' NOT NULL;
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "department_id" integer REFERENCES "departments"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "users_role_idx" ON "users" ("role");
    CREATE INDEX IF NOT EXISTS "users_department_idx" ON "users" ("department_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "users_department_idx";
    DROP INDEX IF EXISTS "users_role_idx";
    ALTER TABLE "users" DROP COLUMN IF EXISTS "department_id";
    ALTER TABLE "users" DROP COLUMN IF EXISTS "role";
    DROP TYPE IF EXISTS "public"."enum_users_role";
  `)
}
