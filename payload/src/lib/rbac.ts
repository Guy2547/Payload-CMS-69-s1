import type { Access, FieldAccess } from 'payload'

/**
 * Role-Based Access Control (RBAC) Definitions & Helpers
 * OWASP Top 10:2025 - A01: Broken Access Control
 *
 * Supported Roles:
 * - 'admin': Full system administrator (Admins collection or Users with role 'admin')
 * - 'hr': Human Resources Specialist (Manages employees, positions, sees all employee data including salaries)
 * - 'manager': Department Manager (Can view department employees, update contact info, cannot view salaries of others)
 * - 'employee': Standard Employee / User (Self-service access, views public company directory, cannot see others' sensitive PII)
 */

export type UserRole = 'admin' | 'hr' | 'manager' | 'employee'

export interface AppUser {
  id?: number | string
  collection?: string
  role?: UserRole
  email?: string
  department?: number | { id: number } | null
}

/**
 * Superadmin Check:
 * Returns true if the user authenticated via 'admins' collection or has role 'admin' in 'users'.
 */
export function isAdmin(user?: AppUser | null): boolean {
  if (!user) return false
  return user.collection === 'admins' || user.role === 'admin'
}

/**
 * HR Role Check:
 * Superadmins are also granted HR privileges.
 */
export function isHR(user?: AppUser | null): boolean {
  if (!user) return false
  return isAdmin(user) || user.role === 'hr'
}

/**
 * Manager Role Check:
 * Superadmins are also granted Manager privileges.
 */
export function isManager(user?: AppUser | null): boolean {
  if (!user) return false
  return isAdmin(user) || user.role === 'manager'
}

/**
 * Employee Role Check:
 * Any authenticated user is at least an employee.
 */
export function isEmployee(user?: AppUser | null): boolean {
  return Boolean(user)
}

/**
 * Check if the user has any of the specified roles.
 */
export function hasRole(user: AppUser | null | undefined, ...roles: UserRole[]): boolean {
  if (!user) return false
  if (isAdmin(user)) return true
  return Boolean(user.role && roles.includes(user.role))
}

/**
 * Extract department ID from user relation.
 */
export function getUserDepartmentId(user?: AppUser | null): number | null {
  if (!user || !user.department) return null
  if (typeof user.department === 'number') return user.department
  if (typeof user.department === 'object' && 'id' in user.department) {
    return Number(user.department.id)
  }
  return null
}

// ============================================================================
// Collection-Level Access Controls
// ============================================================================

/**
 * Users Collection:
 * - Create: Public register (defaulting to 'employee'), Admin can create any
 * - Read: Admin/HR can read all. Regular users can only read their own user record.
 * - Update: Admin can update all. Regular users can only update their own record.
 * - Delete: Superadmin only.
 */
export const usersReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isAdmin(user) || isHR(user)) return true
  return { id: { equals: user.id } }
}

export const usersUpdateAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isAdmin(user)) return true
  return { id: { equals: user.id } }
}

export const usersDeleteAccess: Access = ({ req: { user } }) => {
  return isAdmin(user)
}

/**
 * Employees Collection:
 * - Create: Admin or HR only
 * - Read:
 *   - Admin / HR: full read
 *   - Manager: filtered by department (or all if dept not set)
 *   - Employee: can browse directory (sensitive fields salary/cardId protected by FieldAccess)
 * - Update:
 *   - Admin / HR: all records
 *   - Manager: records in their department
 *   - Employee: their own record (matched by email)
 * - Delete: Superadmin only (strict retention policy)
 */
export const employeesCreateAccess: Access = ({ req: { user } }) => {
  return isHR(user)
}

export const employeesReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isAdmin(user) || isHR(user)) return true

  // Department managers are scoped to their department if assigned
  if (isManager(user)) {
    const deptId = getUserDepartmentId(user)
    if (deptId) {
      return { department: { equals: deptId } }
    }
    return true
  }

  // Regular authenticated employees can browse directory
  // Note: sensitive fields (salary, cardId) are hidden via FieldAccess
  return true
}

export const employeesUpdateAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isHR(user)) return true

  // Manager can update employees within their own department
  if (isManager(user)) {
    const deptId = getUserDepartmentId(user)
    if (deptId) {
      return { department: { equals: deptId } }
    }
  }

  // Regular employee can update their own contact details
  if (user.email) {
    return { email: { equals: user.email } }
  }

  return false
}

export const employeesDeleteAccess: Access = ({ req: { user } }) => {
  return isAdmin(user)
}

// ============================================================================
// Field-Level Access Controls (RBAC + ABAC)
// ============================================================================

/**
 * Role field in Users:
 * CRITICAL: Prevents Privilege Escalation (CWE-269 / OWASP A01).
 * Only admins can set or change user roles.
 */
export const roleFieldAccess: FieldAccess = ({ req: { user } }) => {
  return isAdmin(user)
}

/**
 * Department field in Users:
 * Only Admin or HR can assign/transfer user departments.
 */
export const userDepartmentFieldAccess: FieldAccess = ({ req: { user } }) => {
  return isHR(user)
}

/**
 * Sensitive PII: Salary Field in Employees
 * - Read: Admin, HR, or the employee themselves (doc.email === user.email)
 * - Update: Admin or HR only
 */
export const salaryFieldReadAccess: FieldAccess = ({ req: { user }, doc }) => {
  if (!user) return false
  if (isHR(user)) return true
  // Self-read: An employee can see their own compensation
  if (doc && user.email && doc.email === user.email) return true
  return false
}

export const salaryFieldUpdateAccess: FieldAccess = ({ req: { user } }) => {
  return isHR(user)
}

/**
 * Sensitive PII: CardId (National ID) Field in Employees
 * - Read: Admin, HR, or the employee themselves
 * - Update: Admin or HR only
 */
export const cardIdFieldReadAccess: FieldAccess = ({ req: { user }, doc }) => {
  if (!user) return false
  if (isHR(user)) return true
  if (doc && user.email && doc.email === user.email) return true
  return false
}

export const cardIdFieldUpdateAccess: FieldAccess = ({ req: { user } }) => {
  return isHR(user)
}
