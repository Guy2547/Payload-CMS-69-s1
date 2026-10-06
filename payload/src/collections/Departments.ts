import type { CollectionConfig } from 'payload'

import { makeTextValidate } from '@/lib/field-validation'
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
      validate: makeTextValidate('Name', 100),
    },
    {
      name: 'description',
      type: 'textarea',
      maxLength: 1000,
    },
  ],
}
