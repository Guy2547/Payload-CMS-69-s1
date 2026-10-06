import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/lib/rbac'

// Company domain: departments (e.g. HR, IT, Software Engineering).
// OWASP A01 Strict: any authenticated user may read, but only admins
// may create/update/delete. A05: strict field validation (length + format).
export const Departments: CollectionConfig = {
  slug: 'departments',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'description'],
  },
  access: {
    create: ({ req }) => isAdmin(req.user),
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => isAdmin(req.user),
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
      name: 'description',
      type: 'textarea',
      maxLength: 1000,
    },
  ],
}
