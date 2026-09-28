import type { CollectionConfig } from 'payload'

// Ported from Strapi api::student.student (name, mobile, cardId).
// Any authenticated admin or user can CRUD (same as homework setup).
export const Students: CollectionConfig = {
  slug: 'students',
  admin: {
    useAsTitle: 'name',
  },
  access: {
    create: ({ req }) => Boolean(req.user),
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'mobile',
      type: 'text',
    },
    {
      name: 'cardId',
      type: 'text',
    },
  ],
}
