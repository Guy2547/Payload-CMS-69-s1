import type { CollectionConfig } from 'payload'

import { decryptField, encryptField, isEncrypted } from '@/lib/encryption'

// Company domain: employees.
// OWASP A01 Strict: authenticated read, admin-only write.
// OWASP A04 Strict: Field-Level Data Encryption (AES-256-GCM) for sensitive PII (cardId, salary, email).
// A05: strict field validation (length, regex & format).
export const Employees: CollectionConfig = {
  slug: 'employees',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'department', 'position', 'mobile', 'email'],
  },
  access: {
    create: ({ req }) => req.user?.collection === 'admins',
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => req.user?.collection === 'admins',
    delete: ({ req }) => req.user?.collection === 'admins',
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (data) {
          // OWASP A04: Encrypt sensitive PII before persisting to PostgreSQL
          if (data.cardId) {
            data.cardId = encryptField(data.cardId)
          }
          if (data.salary !== undefined && data.salary !== null && data.salary !== '') {
            data.salary = encryptField(data.salary)
          }
          if (data.email) {
            data.email = encryptField(data.email)
          }
        }
        return data
      },
    ],
    afterRead: [
      ({ doc }) => {
        if (doc) {
          // Decrypt sensitive PII for authorized view in Admin UI / API
          if (doc.cardId) {
            doc.cardId = decryptField(doc.cardId)
          }
          if (doc.salary) {
            doc.salary = decryptField(doc.salary)
          }
          if (doc.email) {
            doc.email = decryptField(doc.email)
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
        if (
          typeof val !== 'string' ||
          !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)
        ) {
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
        description: '13-digit National ID (Encrypted at rest with AES-256-GCM).',
      },
      validate: (val: unknown) => {
        if (val == null || val === '') return true
        // Allow already encrypted strings if passed during internal operations
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
        description: 'Compensation in THB (Encrypted at rest with AES-256-GCM).',
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
