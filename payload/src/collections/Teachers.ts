import type { CollectionConfig } from 'payload'

// Ported from Strapi api::teacher.teacher (name).
export const Teachers: CollectionConfig = {
  slug: 'teachers',
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
  ],
}
