import type { CollectionConfig } from 'payload'

import {
  auditLog,
  enforcePasswordPolicy,
  forgotRateLimit,
  loginRateLimit,
} from '@/lib/security'

// Mirrors the old Strapi "admin" world: login / forgot / reset / me
// live under /api/admins/*. First admin is created via
// POST /api/admins/first-register (only works while collection is empty).
// OWASP A01/A07 Strict: admin-only access, lockout, short tokens, secure cookies.
export const Admins: CollectionConfig = {
  slug: 'admins',
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    // 2h token like Payload default, explicit so audits can see it.
    tokenExpiration: 7200,
    // A07: brute-force lockout — 5 attempts then 10min lock.
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
    // A07: reset tokens live 1h, min 60s between forgot emails (anti-spam).
    forgotPassword: {
      expiration: 60 * 60 * 1000,
      minRequestInterval: 60 * 1000,
    },
    cookies: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
    },
  },
  access: {
    create: ({ req }) => req.user?.collection === 'admins',
    read: ({ req }) => req.user?.collection === 'admins',
    update: ({ req }) => req.user?.collection === 'admins',
    delete: ({ req }) => req.user?.collection === 'admins',
  },
  hooks: {
    // A06/A07: Redis-backed rate limiting on sensitive operations.
    beforeOperation: [
      async ({ args, operation, req }) => {
        if (operation === 'login') await loginRateLimit(req, 'admins')
        if (operation === 'forgotPassword') await forgotRateLimit(req, 'admins')
        return args
      },
    ],
    // A04: strong passwords on create + password change.
    beforeValidate: [
      ({ data, operation }) => {
        if (
          (operation === 'create' || (data as { password?: unknown })?.password) &&
          typeof (data as { password?: unknown })?.password === 'string'
        ) {
          enforcePasswordPolicy((data as { password: string }).password)
        }
      },
    ],
    // A09: security audit trail (success path; failures surface via Payload logs).
    afterLogin: [
      ({ req, user }) => {
        auditLog(req, 'admin.login', { email: (user as { email?: string })?.email })
      },
    ],
    afterForgotPassword: [
      ({ args }) => {
        // args carries the forgot-password operation input (incl. req at runtime).
        auditLog((args as { req?: Parameters<typeof auditLog>[0] })?.req, 'admin.forgot_password')
      },
    ],
  },
  fields: [
    {
      name: 'firstname',
      type: 'text',
    },
    {
      name: 'lastname',
      type: 'text',
    },
  ],
}
