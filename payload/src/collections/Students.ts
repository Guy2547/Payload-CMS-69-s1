import type { CollectionConfig } from 'payload'

// Ported from Strapi api::student.student (name, mobile, cardId).
// OWASP A01 Strict: any authenticated user may read, but only admins
// may create/update/delete. A05: strict field validation (length + format).
export const Students: CollectionConfig = {
  slug: 'students',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'mobile', 'cardId'],
  },
  access: {
    create: ({ req }) => req.user?.collection === 'admins',
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => req.user?.collection === 'admins',
    delete: ({ req }) => req.user?.collection === 'admins',
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
      maxLength: 13,
      validate: (val: unknown) => {
        if (val == null || val === '') return true
        if (typeof val !== 'string' || !/^[0-9]{13}$/.test(val)) {
          return 'CardId must be exactly 13 digits.'
        }
        return true
      },
    },
  ],
}
