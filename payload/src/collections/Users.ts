import type { CollectionConfig } from 'payload'

// Mirrors the old Strapi "users" (users-permissions) world:
// public register, login with email+password, forgot/reset, me.
// Lives under /api/users/*.
export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  access: {
    // Public registration (like Strapi POST /api/auth/local/register)
    create: () => true,
    // Any logged-in admin or user can list users
    read: ({ req }) => Boolean(req.user),
    // Users can edit themselves, admins can edit anyone
    update: ({ req }) => {
      if (!req.user) return false
      if (req.user.collection === 'admins') return true
      return { id: { equals: req.user.id } }
    },
    delete: ({ req }) => {
      if (!req.user) return false
      if (req.user.collection === 'admins') return true
      return { id: { equals: req.user.id } }
    },
  },
  fields: [
    {
      name: 'username',
      type: 'text',
    },
  ],
}
