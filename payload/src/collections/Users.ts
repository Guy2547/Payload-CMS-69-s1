import type { CollectionConfig } from 'payload'

import {
  isAdmin,
  isHR,
  roleFieldAccess,
  userDepartmentFieldAccess,
  usersDeleteAccess,
  usersReadAccess,
  usersUpdateAccess,
} from '@/lib/rbac'
import {
  auditLog,
  enforcePasswordPolicy,
  forgotRateLimit,
  loginRateLimit,
  registerRateLimit,
} from '@/lib/security'

// SMTP is configured only when BOTH user and pass are set (see payload.config.ts).
// A06: require email verification when we can actually send mail;
// otherwise leave it off so the homework register→login flow still works.
const emailVerificationEnabled = Boolean(process.env.EMAIL_SMTP_USER && process.env.EMAIL_SMTP_PASS)

// Users collection with Role-Based Access Control (RBAC):
// Roles: 'admin', 'hr', 'manager', 'employee'
// OWASP Top 10:2025 A01: Broken Access Control & Privilege Escalation Mitigation
export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'username', 'role', 'department'],
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
    // Public registration allowed (defaults to 'employee' role), throttled by registerRateLimit
    create: () => true,
    // Admin & HR can list all users; Managers and regular Employees can only view themselves
    read: usersReadAccess,
    // Admin can update all users; regular users can only update their own profile (cannot escalate role)
    update: usersUpdateAccess,
    // Superadmin only
    delete: usersDeleteAccess,
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
      ({ data, operation, req }) => {
        // Enforce strong password policy on create or when password is provided
        if (operation === 'create' || (data && 'password' in data && data.password !== undefined)) {
          enforcePasswordPolicy((data as { password?: unknown })?.password)
        }

        // Defense-in-Depth against Privilege Escalation (CWE-269 / OWASP A01):
        if (!isAdmin(req.user as any)) {
          if (operation === 'create' && data) {
            // Force public registration role strictly to 'employee'
            ;(data as any).role = 'employee'
          } else if (data && 'role' in data) {
            // Strip role on update so non-admins cannot modify or escalate their role,
            // and existing non-admin roles (HR/Manager) are never accidentally overwritten.
            delete (data as any).role
          }
        }

        // Non-HR users cannot self-assign or reassign departments
        if (!isHR(req.user as any)) {
          if (operation === 'create' && data) {
            delete (data as any).department
          } else if (data && 'department' in data) {
            delete (data as any).department
          }
        }
      },
    ],
    beforeChange: [
      ({ data, operation, req }) => {
        // F4: users provisioned by an Admin/HR are pre-verified (they cannot
        // receive mail at corporate/test domains). Self-registered users must
        // still verify via email when SMTP is configured.
        if (operation === 'create' && data && isHR(req.user as any)) {
          ;(data as any)._verified = true
        }
        return data
      },
    ],
    afterLogin: [      ({ req, user }) => {
        auditLog(req, 'user.login', {
          email: (user as { email?: string })?.email,
          role: (user as { role?: string })?.role,
        })
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
      validate: (val: unknown, { operation }: { operation?: string } = {}) => {
        if ((val == null || val === '') && operation !== 'create') return true
        if (typeof val !== 'string' || val.trim().length < 3) {
          return 'Username must be at least 3 characters.'
        }
        if (!/^[A-Za-z0-9._-]+$/.test(val)) {
          return 'Username may only contain letters, numbers, dot, underscore and dash.'
        }
        return true
      },
    },
    {
      name: 'role',
      type: 'select',
      // NOTE: intentionally NOT required: Payload validates required fields on
      // the update path too, which breaks SYSTEM updates that don't touch role
      // (e.g. anonymous forgot-password → 400 "Role is required"). Presence is
      // still guaranteed by defaultValue + create-time enforcement below.
      defaultValue: 'employee',
      saveToJWT: true,
      options: [
        { label: 'Administrator', value: 'admin' },
        { label: 'HR Specialist', value: 'hr' },
        { label: 'Department Manager', value: 'manager' },
        { label: 'Employee', value: 'employee' },
      ],
      validate: (val: unknown, { operation }: { operation?: string } = {}) => {
        if (operation === 'create' && (val == null || val === '')) return 'Role is required.'
        if (val != null && val !== '' && !['admin', 'hr', 'manager', 'employee'].includes(val as string)) {
          return 'Invalid role.'
        }
        return true
      },
      access: {
        // Update stays open (hook strips role for non-admins); create stays
        // admin-only as defense-in-depth alongside the hook.
        create: roleFieldAccess,
        update: () => true,
      },
      admin: {
        description: 'Assigned RBAC role (Admin-only modification). Defaults to Employee.',
      },
    },
    {
      name: 'department',
      type: 'relationship',
      relationTo: 'departments',
      saveToJWT: true,
      access: {
        // Same pattern as role above: hook strips department for non-HR.
        create: userDepartmentFieldAccess,
        update: () => true,
      },
      admin: {
        description: 'Associated department for scoped access (HR/Admin managed).',
      },
    },
  ],
}
