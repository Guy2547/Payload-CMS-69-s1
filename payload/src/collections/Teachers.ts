import type { CollectionConfig } from 'payload'

// Ported from Strapi api::teacher.teacher (name).
// OWASP A01 Strict: authenticated read, admin-only write. A05: length cap.
export const Teachers: CollectionConfig = {
  slug: 'teachers',
  admin: {
    useAsTitle: 'name',
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
    },
  ],
}
