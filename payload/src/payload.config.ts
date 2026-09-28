import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Admins } from './collections/Admins'
import { Users } from './collections/Users'
import { Students } from './collections/Students'
import { Subjects } from './collections/Subjects'
import { Teachers } from './collections/Teachers'
import { Media } from './collections/Media'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Admins.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Admins, Users, Students, Subjects, Teachers, Media],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  // Gmail SMTP via env (same vars as the old Strapi setup).
  // skipVerify=true so the app still boots without real SMTP creds
  // (forgot-password then fails at send time, like the old setup).
  email: await nodemailerAdapter({
    defaultFromName: '69-s1-cybersec',
    defaultFromAddress: process.env.EMAIL_FROM || 'no-reply@localhost',
    skipVerify: true,
    transportOptions: {
      host: process.env.EMAIL_SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.EMAIL_SMTP_PORT) || 587,
      auth: {
        user: process.env.EMAIL_SMTP_USER || '',
        pass: process.env.EMAIL_SMTP_PASS || '',
      },
    },
  }),
  sharp,
  plugins: [],
})
