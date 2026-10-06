import { ValidationError, type CollectionConfig } from 'payload'

import { makeTextValidate } from '@/lib/field-validation'
import { isHR, isAdmin, isManager } from '@/lib/rbac'

// 5MB per-file cap (A08 storage-abuse bound). Payload v3 has no
// `maxFileSize` upload option, so enforce it in beforeChange via req.file.
const MAX_FILE_BYTES = 5 * 1024 * 1024

// OWASP A01/A08 Strict: authenticated read, Admin/HR/Manager upload, Admin-only delete.
// mimeTypes whitelist blocks executables/scripts (incl. SVG XSS vector),
// 5MB cap bounds storage abuse.
export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    create: ({ req }) => isAdmin(req.user) || isHR(req.user) || isManager(req.user),
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => isAdmin(req.user),
    delete: ({ req }) => isAdmin(req.user),
  },
  hooks: {
    beforeChange: [
      ({ req }) => {
        const size = req.file?.size
        if (typeof size === 'number' && size > MAX_FILE_BYTES) {
          throw new ValidationError({
            errors: [{ path: 'file', message: 'File must be at most 5MB.' }],
          })
        }
      },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      maxLength: 200,
      validate: makeTextValidate('Alt text', 200),
    },
  ],
  upload: {
    // A08: images only — svg (scriptable), pdf/html/exe all rejected.
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    imageSizes: [
      {
        name: 'thumbnail',
        width: 400,
        height: 300,
        position: 'centre',
      },
    ],
    adminThumbnail: 'thumbnail',
    pasteURL: false,
  },
}
