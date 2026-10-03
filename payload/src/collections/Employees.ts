import type { CollectionConfig } from 'payload'

import { decryptField, encryptField, isEncrypted } from '@/lib/encryption'
import {
  cardIdFieldReadAccess,
  cardIdFieldUpdateAccess,
  employeesCreateAccess,
  employeesDeleteAccess,
  employeesReadAccess,
  employeesUpdateAccess,
  salaryFieldReadAccess,
  salaryFieldUpdateAccess,
} from '@/lib/rbac'

// Company domain: employees.
// OWASP A01 Strict: Role-Based Access Control (RBAC) + Row-level & Field-level security.
// OWASP A04 Strict: Field-Level Data Encryption (AES-256-GCM) for sensitive PII (cardId, salary, email).
// A05: strict field validation (length, regex & format).
function isValidEmail(val: string): boolean {
  if (/\s/.test(val)) return false
  const at = val.indexOf('@')
  if (at <= 0 || at !== val.lastIndexOf('@') || at === val.length - 1) return false
  const domain = val.slice(at + 1)
  const dot = domain.indexOf('.')
  if (dot <= 0 || dot === domain.length - 1) return false
  return true
}

export const Employees: CollectionConfig = {
  slug: 'employees',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'department', 'position', 'mobile', 'email'],
  },
  access: {
    // Admin or HR can create employees
    create: employeesCreateAccess,
    // Admin & HR see all; Managers see own department; Employees see company directory
    read: employeesReadAccess,
    // Admin/HR can update all; Managers update own dept; Employees update self contact info
    update: employeesUpdateAccess,
    // Strict compliance: Only Superadmin can delete employee records
    delete: employeesDeleteAccess,
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (data) {
          for (const key of ['cardId', 'salary', 'email'] as const) {
            if (data[key] != null && data[key] !== '') data[key] = encryptField(data[key])
          }
        }
        return data
      },
    ],
    afterRead: [
      ({ doc }) => {
        if (doc) {
          for (const key of ['cardId', 'salary', 'email'] as const) {
            if (doc[key]) doc[key] = decryptField(doc[key])
          }
        }
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      maxLength: 100,
      validate: (val: unknown) => {
        if (typeof val !== 'string' || val.trim().length === 0) return 'Name is required.'
        if (val.length > 100) return 'Name must be at most 100 characters.'
        return true
      },
    },
    {
      name: 'email',
      type: 'text',
      admin: {
        description: 'Employee contact email (Encrypted at rest with AES-256-GCM).',
      },
      validate: (val: unknown) => {
        if (val == null || val === '') return true
        if (typeof val === 'string' && isEncrypted(val)) return true
        if (typeof val !== 'string' || !isValidEmail(val)) {
          return 'Please provide a valid email address.'
        }
        return true
      },
    },
    {
      name: 'mobile',
      type: 'text',
      maxLength: 10,
      validate: (val: unknown) => {
        if (val == null || val === '') return true
        if (typeof val !== 'string' || !/^[0-9]{9,10}$/.test(val)) {
          return 'Mobile must be 9-10 digits.'
        }
        return true
      },
    },
    {
      name: 'cardId',
      type: 'text',
      admin: {
        description: '13-digit National ID (Encrypted at rest with AES-256-GCM, RBAC restricted).',
      },
      access: {
        read: cardIdFieldReadAccess,
        update: cardIdFieldUpdateAccess,
      },
      validate: (val: unknown) => {
        if (val == null || val === '') return true
        if (typeof val === 'string' && isEncrypted(val)) return true
        if (typeof val !== 'string' || !/^[0-9]{13}$/.test(val)) {
          return 'CardId must be exactly 13 digits.'
        }
        return true
      },
    },
    {
      name: 'department',
      type: 'relationship',
      relationTo: 'departments',
      required: true,
    },
    {
      name: 'position',
      type: 'relationship',
      relationTo: 'positions',
      required: true,
    },
    {
      name: 'hireDate',
      type: 'date',
    },
    {
      name: 'salary',
      type: 'text',
      admin: {
        description: 'Compensation in THB (Encrypted at rest with AES-256-GCM, RBAC restricted).',
      },
      access: {
        read: salaryFieldReadAccess,
        update: salaryFieldUpdateAccess,
      },
      validate: (val: unknown) => {
        if (val == null || val === '') return true
        if (typeof val === 'string' && isEncrypted(val)) return true
        const num = Number(val)
        if (Number.isNaN(num) || num < 0) return 'Salary must be a non-negative number.'
        return true
      },
    },
  ],
}
