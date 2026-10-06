import type { CollectionConfig } from 'payload'
import { Forbidden } from 'payload'

import { decryptField, encryptField, isEncrypted } from '@/lib/encryption'
import {
  cardIdFieldReadAccess,
  cardIdFieldUpdateAccess,
  emailFieldReadAccess,
  employeesCreateAccess,
  employeesDeleteAccess,
  employeesReadAccess,
  employeesUpdateAccess,
  getUserDepartmentId,
  hrOnlyFieldUpdateAccess,
  isHR,
  isManager,
  salaryFieldReadAccess,
  salaryFieldUpdateAccess,
} from '@/lib/rbac'

// Company domain: employees.
// OWASP A01 Strict: Role-Based Access Control (RBAC) + Row-level & Field-level security.
// OWASP A04 Strict: Field-Level Data Encryption (AES-256-GCM) for sensitive PII (cardId, salary, email).
// A05: strict field validation (length, regex & format).
function isValidEmail(val: string): boolean {
  if (/\s/.test(val)) return false
  const at = val.indexOf('@')
  if (at <= 0 || at !== val.lastIndexOf('@') || at === val.length - 1) return false
  const domain = val.slice(at + 1)
  const dot = domain.indexOf('.')
  if (dot <= 0 || dot === domain.length - 1) return false
  return true
}

export const Employees: CollectionConfig = {
  slug: 'employees',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'department', 'position', 'mobile', 'email'],
  },
  access: {
    // Admin or HR can create employees
    create: employeesCreateAccess,
    // Admin & HR see all; Managers see own department; Employees see company directory
    read: employeesReadAccess,
    // Admin/HR can update all; Managers update own dept; Employees update self contact info
    update: employeesUpdateAccess,
    // Strict compliance: Only Superadmin can delete employee records
    delete: employeesDeleteAccess,
  },
  hooks: {
    beforeOperation: [
      async ({ args, operation, req }) => {
        // Per-document ownership for updates (collection access is pass-through
        // for authenticated users): HR/Admin may update anything; a manager may
        // update employees of their own department; an employee may update only
        // their own record (matched by decrypted email). Anything else → 403.
        if (operation === 'update' && !isHR(req.user as any)) {
          const user = req.user as any
          const id = (args as { id?: number | string } | undefined)?.id
          let allowed = false
          if (id != null) {
            // Isolate: the nested lookup must not leak transaction state into
            // the outer update request.
            const prevTx = (req as any).transactionID
            try {
              const doc = (await req.payload.findByID({
                id,
                collection: 'employees',
                depth: 0,
                overrideAccess: true,
              })) as any
              const rawEmail = doc?.email
              const docEmail =
                typeof rawEmail === 'string' && isEncrypted(rawEmail)
                  ? decryptField(rawEmail)
                  : rawEmail
              if (docEmail && user?.email && docEmail.toLowerCase() === String(user.email).toLowerCase()) {
                allowed = true
              }
              if (!allowed && isManager(user)) {
                const deptId = getUserDepartmentId(user)
                const docDept = typeof doc?.department === 'object' ? doc?.department?.id : doc?.department
                if (deptId != null && Number(docDept) === deptId) allowed = true
              }
            } catch {
              // Fall through to deny below.
            } finally {
              ;(req as any).transactionID = prevTx
            }
          }
          if (!allowed) throw new Forbidden()
        }
        return args
      },
      async ({ args, operation, req }) => {
        // Transparent query resolution for encrypted 'email' field
        const queryArgs = args as { where?: Record<string, any> } | undefined
        if ((operation === 'read' || operation === 'update') && queryArgs?.where) {
          const whereEmail = queryArgs.where?.email?.equals
          if (typeof whereEmail === 'string') {
            try {
              const all = await req.payload.find({
                collection: 'employees',
                depth: 0,
                pagination: false,
                overrideAccess: true,
              })
              const target = whereEmail.toLowerCase()
              const matchedIds = (all.docs as any[])
                .filter((doc: any) => {
                  const raw = doc?.email
                  const plain = (typeof raw === 'string' && isEncrypted(raw) ? decryptField(raw) : raw)?.toLowerCase()
                  return plain === target
                })
                .map((doc: any) => doc.id)

              const idClause = matchedIds.length > 0 ? { in: matchedIds } : { equals: -1 }
              const prevId = (queryArgs.where as Record<string, any>).id
              if (prevId !== undefined) {
                // Preserve a pre-existing id constraint (AND instead of overwrite).
                const prevAnd = (queryArgs.where as Record<string, any>).and
                ;(queryArgs.where as Record<string, any>).and = [
                  ...(Array.isArray(prevAnd) ? prevAnd : []),
                  { id: prevId },
                  { id: idClause },
                ]
                delete (queryArgs.where as Record<string, any>).id
              } else {
                ;(queryArgs.where as Record<string, any>).id = idClause
              }
              delete queryArgs.where.email
            } catch {
              // Fallback
            }
          }
        }
        return args
      },
    ],
    beforeValidate: [
      ({ data, operation, req }) => {
        // Defense-in-depth: Non-HR users cannot modify organizational structure, positions, salary, or citizen ID
        if (operation === 'update' && !isHR(req.user as any) && data) {
          delete (data as any).salary
          delete (data as any).cardId
          delete (data as any).name
          delete (data as any).department
          delete (data as any).position
          delete (data as any).hireDate
        }
      },
    ],
    beforeChange: [
      ({ data }) => {
        if (data) {
          for (const key of ['cardId', 'salary', 'email'] as const) {
            if (data[key] != null && data[key] !== '') data[key] = encryptField(data[key])
          }
        }
        return data
      },
    ],
    afterRead: [
      ({ doc }) => {
        if (doc) {
          for (const key of ['cardId', 'salary', 'email'] as const) {
            if (doc[key]) doc[key] = decryptField(doc[key])
          }
        }
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      // NOTE: intentionally NOT required (see role field in Users.ts): required
      // fields break non-HR updates with "field is invalid". Presence on create
      // is enforced by validate below.
      maxLength: 100,
      access: {
        update: hrOnlyFieldUpdateAccess,
      },
      validate: (val: unknown, { operation }: { operation?: string } = {}) => {
        if ((val == null || val === '') && operation !== 'create') return true
        if (typeof val !== 'string' || val.trim().length === 0) return 'Name is required.'
        if (val.length > 100) return 'Name must be at most 100 characters.'
        return true
      },
    },
    {
      name: 'email',
      type: 'text',
      admin: {
        description: 'Employee contact email (Encrypted at rest with AES-256-GCM).',
      },
      access: {
        read: emailFieldReadAccess,
      },
      validate: (val: unknown) => {
        if (val == null || val === '') return true
        if (typeof val === 'string' && isEncrypted(val)) return true
        if (typeof val !== 'string' || !isValidEmail(val)) {
          return 'Please provide a valid email address.'
        }
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
      admin: {
        description: '13-digit National ID (Encrypted at rest with AES-256-GCM, RBAC restricted).',
      },
      access: {
        read: cardIdFieldReadAccess,
        update: cardIdFieldUpdateAccess,
      },
      validate: (val: unknown) => {
        if (val == null || val === '') return true
        if (typeof val === 'string' && isEncrypted(val)) return true
        if (typeof val !== 'string' || !/^[0-9]{13}$/.test(val)) {
          return 'CardId must be exactly 13 digits.'
        }
        return true
      },
    },
    {
      name: 'department',
      type: 'relationship',
      relationTo: 'departments',
      // Same NOTE as name above; create-time presence enforced by validate.
      validate: (val: unknown, { operation }: { operation?: string } = {}) => {
        if (operation === 'create' && val == null) return 'Department is required.'
        return true
      },
      access: {
        update: hrOnlyFieldUpdateAccess,
      },
    },
    {
      name: 'position',
      type: 'relationship',
      relationTo: 'positions',
      // Same NOTE as name above; create-time presence enforced by validate.
      validate: (val: unknown, { operation }: { operation?: string } = {}) => {
        if (operation === 'create' && val == null) return 'Position is required.'
        return true
      },
      access: {
        update: hrOnlyFieldUpdateAccess,
      },
    },
    {
      name: 'hireDate',
      type: 'date',
      access: {
        update: hrOnlyFieldUpdateAccess,
      },
    },
    {
      name: 'salary',
      type: 'text',
      admin: {
        description: 'Compensation in THB (Encrypted at rest with AES-256-GCM, RBAC restricted).',
      },
      access: {
        read: salaryFieldReadAccess,
        update: salaryFieldUpdateAccess,
      },
      validate: (val: unknown) => {
        if (val == null || val === '') return true
        if (typeof val === 'string' && isEncrypted(val)) return true
        const num = Number(val)
        if (Number.isNaN(num) || num < 0) return 'Salary must be a non-negative number.'
        return true
      },
    },
  ],
}
