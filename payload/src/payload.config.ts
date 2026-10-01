import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { Admins } from './collections/Admins'
import { Users } from './collections/Users'
import { Departments } from './collections/Departments'
import { Positions } from './collections/Positions'
import { Employees } from './collections/Employees'
import { Media } from './collections/Media'

const dirname = import.meta.dirname

// --- A02/A10 fail-closed env validation -------------------------------------
// Never boot with an empty/weak secret or missing DB URL: fail-closed beats
// fail-open (an empty PAYLOAD_SECRET would sign JWTs with a known key).
const PAYLOAD_SECRET = process.env.PAYLOAD_SECRET || ''
if (!PAYLOAD_SECRET || PAYLOAD_SECRET.length < 32) {
  throw new Error(
    '[config] PAYLOAD_SECRET must be set to a random string of at least 32 characters. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  )
}
const DATABASE_URL = process.env.DATABASE_URL || ''
if (!DATABASE_URL) {
  throw new Error('[config] DATABASE_URL must be set. Refusing to boot without a database.')
}

// CORS allowlist (A01): admin UI + local dev only. Extend via CORS_ORIGINS
// (comma-separated) when deploying behind a real domain.
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:9092,http://127.0.0.1:9092')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const isProd = process.env.NODE_ENV === 'production'
// A10: skipVerify=true hides mail-server misconfiguration (fail-open).
// Keep it in dev so the homework boots without Gmail creds; verify in prod.
const smtpConfigured = Boolean(process.env.EMAIL_SMTP_USER && process.env.EMAIL_SMTP_PASS)

export default buildConfig({
  admin: {
    user: Admins.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Admins, Users, Departments, Positions, Employees, Media],
  editor: lexicalEditor(),
  secret: PAYLOAD_SECRET,
  // A05: bound query cost (deep populate / huge pages = DoS vector).
  defaultDepth: 1,
  maxDepth: 10,
  // A01: explicit CORS + CSRF allowlists instead of framework defaults.
  cors: corsOrigins,
  csrf: corsOrigins,
  // A10: detailed error stacks stay in dev only.
  debug: !isProd,
  graphQL: {
    // Playground/introspection off in production (A01 info disclosure).
    disablePlaygroundInProduction: true,
    disableIntrospectionInProduction: true,
    maxComplexity: 1000,
  },
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: DATABASE_URL,
    },
  }),
  // Gmail SMTP via env (same vars as the old Strapi setup).
  // A02/A04: STARTTLS enforced on 587; skipVerify only in dev so a bad
  // mail config fails loudly in production instead of silently dropping
  // password-reset emails. Without SMTP creds, forgot-password still
  // writes the token to the DB (recoverable via psql, as before).
  email: await nodemailerAdapter({
    defaultFromName: '69-s1-cybersec',
    defaultFromAddress: process.env.EMAIL_FROM || 'no-reply@localhost',
    skipVerify: !isProd,
    transportOptions: {
      host: process.env.EMAIL_SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.EMAIL_SMTP_PORT) || 587,
      secure: Number(process.env.EMAIL_SMTP_PORT) === 465,
      requireTLS: true,
      auth:
        smtpConfigured || process.env.NODE_ENV !== 'production'
          ? {
              user: process.env.EMAIL_SMTP_USER || '',
              pass: process.env.EMAIL_SMTP_PASS || '',
            }
          : undefined,
    },
  }),
  sharp,
  plugins: [],
})
