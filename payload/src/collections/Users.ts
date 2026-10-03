import type { CollectionConfig } from 'payload'

import {
  isAdmin,
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

// SMTP is configured only when EMAIL_SMTP_USER is set (see payload.config.ts).
// A06: require email verification when we can actually send mail;
// otherwise leave it off so the homework register→login flow still works.
const emailVerificationEnabled = Boolean(process.env.EMAIL_SMTP_USER)

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
        // Enforce strong password policy
        if (
          (operation === 'create' || (data as { password?: unknown })?.password) &&
          typeof (data as { password?: unknown })?.password === 'string'
        ) {
          enforcePasswordPolicy((data as { password: string }).password)
        }

        // Defense-in-Depth against Privilege Escalation (CWE-269):
        // If a non-admin attempts to assign any role other than 'employee', force it to 'employee'
        if (data && 'role' in data && data.role !== 'employee' && !isAdmin(req.user)) {
          ;(data as { role: string }).role = 'employee'
        }
      },
    ],
    afterLogin: [
      ({ req, user }) => {
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
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'employee',
      saveToJWT: true,
      options: [
        { label: 'Administrator', value: 'admin' },
        { label: 'HR Specialist', value: 'hr' },
        { label: 'Department Manager', value: 'manager' },
        { label: 'Employee', value: 'employee' },
      ],
      access: {
        create: roleFieldAccess,
        update: roleFieldAccess,
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
        create: userDepartmentFieldAccess,
        update: userDepartmentFieldAccess,
      },
      admin: {
        description: 'Associated department for scoped access (HR/Admin managed).',
      },
    },
  ],
}
