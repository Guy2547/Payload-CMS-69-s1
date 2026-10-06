import type { CollectionConfig } from 'payload'

import { isHR, isAdmin } from '@/lib/rbac'

// Company domain: positions/roles (e.g. Developer, Manager).
// OWASP A01 Strict: RBAC access — authenticated read, HR/Admin create & update, Admin-only delete.
export const Positions: CollectionConfig = {
  slug: 'positions',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'level'],
  },
  access: {
    create: ({ req }) => isHR(req.user),
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => isHR(req.user),
    delete: ({ req }) => isAdmin(req.user),
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      unique: true,
      maxLength: 100,
      validate: (val: unknown, { operation }: { operation?: string } = {}) => {
        if ((val == null || val === '') && operation !== 'create') return true
        if (typeof val !== 'string' || val.trim().length === 0) return 'Name is required.'
        if (val.length > 100) return 'Name must be at most 100 characters.'
        return true
      },
    },
    {
      name: 'level',
      type: 'select',
      required: true,
      defaultValue: 'junior',
      options: [
        { label: 'Junior', value: 'junior' },
        { label: 'Senior', value: 'senior' },
        { label: 'Lead', value: 'lead' },
        { label: 'Manager', value: 'manager' },
      ],
    },
    {
      name: 'description',
      type: 'textarea',
      maxLength: 1000,
    },
  ],
}
