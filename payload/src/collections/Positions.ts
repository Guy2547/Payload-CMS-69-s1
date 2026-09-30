import type { CollectionConfig } from 'payload'

// Company domain: positions/roles (e.g. Developer, Manager).
// OWASP A01 Strict: authenticated read, admin-only write. A05: length cap.
export const Positions: CollectionConfig = {
  slug: 'positions',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'level'],
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
      unique: true,
      maxLength: 100,
      validate: (val: unknown) => {
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
