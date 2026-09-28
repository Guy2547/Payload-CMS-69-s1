import type { CollectionConfig } from 'payload'

// Mirrors the old Strapi "admin" world: login / forgot / reset / me
// live under /api/admins/*. First admin is created via
// POST /api/admins/first-register (only works while collection is empty).
export const Admins: CollectionConfig = {
  slug: 'admins',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  access: {
    create: ({ req }) => req.user?.collection === 'admins',
    read: ({ req }) => req.user?.collection === 'admins',
    update: ({ req }) => req.user?.collection === 'admins',
    delete: ({ req }) => req.user?.collection === 'admins',
  },
  fields: [
    {
      name: 'firstname',
      type: 'text',
    },
    {
      name: 'lastname',
      type: 'text',
    },
  ],
}
