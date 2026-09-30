import type { CollectionConfig } from 'payload'

import {
  auditLog,
  enforcePasswordPolicy,
  forgotRateLimit,
  loginRateLimit,
  registerRateLimit,
} from '@/lib/security'

// SMTP is configured only when EMAIL_SMTP_USER is set (see payload.config.ts).
// A06: require email verification when we can actually send mail;
// otherwise leave it off so the homework register→login flow still works.
const emailVerificationEnabled = Boolean(process.env.EMAIL_SMTP_USER)

// Mirrors the old Strapi "users" (users-permissions) world:
// public register, login with email+password, forgot/reset, me.
// Lives under /api/users/*.
// OWASP A01 Strict: users can only see themselves; listing all users is admin-only.
export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    tokenExpiration: 7200,
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
    forgotPassword: {
      expiration: 60 * 60 * 1000,
      minRequestInterval: 60 * 1000,
    },
    verify: emailVerificationEnabled,
    cookies: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
    },
  },
  access: {
    // Public registration (like Strapi POST /api/auth/local/register),
    // throttled by registerRateLimit in beforeOperation below.
    create: () => true,
    // Strict: admins can list everyone, users can only read themselves.
    read: ({ req }) => {
      if (!req.user) return false
      if (req.user.collection === 'admins') return true
      return { id: { equals: req.user.id } }
    },
    // Users can edit themselves, admins can edit anyone
    update: ({ req }) => {
      if (!req.user) return false
      if (req.user.collection === 'admins') return true
      return { id: { equals: req.user.id } }
    },
    delete: ({ req }) => {
      if (!req.user) return false
      if (req.user.collection === 'admins') return true
      return { id: { equals: req.user.id } }
    },
  },
  hooks: {
    beforeOperation: [
      async ({ args, operation, req }) => {
        if (operation === 'login') await loginRateLimit(req, 'users')
        if (operation === 'forgotPassword') await forgotRateLimit(req, 'users')
        if (operation === 'create') await registerRateLimit(req, 'users')
        return args
      },
    ],
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
    afterLogin: [
      ({ req, user }) => {
        auditLog(req, 'user.login', { email: (user as { email?: string })?.email })
      },
    ],
    afterForgotPassword: [
      ({ args }) => {
        auditLog((args as { req?: Parameters<typeof auditLog>[0] })?.req, 'user.forgot_password')
      },
    ],
  },
  fields: [
    {
      name: 'username',
      type: 'text',
      required: true,
      maxLength: 32,
      validate: (val: unknown) => {
        if (typeof val !== 'string' || val.trim().length < 3) {
          return 'Username must be at least 3 characters.'
        }
        if (!/^[A-Za-z0-9._-]+$/.test(val)) {
          return 'Username may only contain letters, numbers, dot, underscore and dash.'
        }
        return true
      },
    },
  ],
}
