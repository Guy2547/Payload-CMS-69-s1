import { describe, expect, it } from 'vitest'

import {
  AppUser,
  cardIdFieldReadAccess,
  employeesCreateAccess,
  employeesDeleteAccess,
  employeesReadAccess,
  employeesUpdateAccess,
  isAdmin,
  isHR,
  isManager,
  roleFieldAccess,
  salaryFieldReadAccess,
  salaryFieldUpdateAccess,
  usersDeleteAccess,
  usersReadAccess,
  usersUpdateAccess,
} from '../../src/lib/rbac'

describe('Role-Based Access Control (RBAC) Test Suite', () => {
  const superadminUser: AppUser = { id: 1, collection: 'admins' }
  const adminUser: AppUser = { id: 2, collection: 'users', role: 'admin' }
  const hrUser: AppUser = { id: 3, collection: 'users', role: 'hr', email: 'hr@cybersec.local' }
  const managerUser: AppUser = {
    id: 4,
    collection: 'users',
    role: 'manager',
    department: 1,
    email: 'mgr@cybersec.local',
  }
  const employeeUser: AppUser = {
    id: 5,
    collection: 'users',
    role: 'employee',
    department: 1,
    email: 'somchai.j@cybersec.local',
  }
  const otherEmployeeUser: AppUser = {
    id: 6,
    collection: 'users',
    role: 'employee',
    department: 2,
    email: 'other@cybersec.local',
  }

  describe('Role Hierarchy & Identity Verification', () => {
    it('identifies superadmin from admins collection and users with admin role', () => {
      expect(isAdmin(superadminUser)).toBe(true)
      expect(isAdmin(adminUser)).toBe(true)
      expect(isAdmin(hrUser)).toBe(false)
      expect(isAdmin(managerUser)).toBe(false)
      expect(isAdmin(employeeUser)).toBe(false)
      expect(isAdmin(null)).toBe(false)
    })

    it('identifies HR specialists and inherits superadmin rights', () => {
      expect(isHR(superadminUser)).toBe(true)
      expect(isHR(adminUser)).toBe(true)
      expect(isHR(hrUser)).toBe(true)
      expect(isHR(managerUser)).toBe(false)
      expect(isHR(employeeUser)).toBe(false)
    })

    it('identifies Department Managers and inherits superadmin rights', () => {
      expect(isManager(superadminUser)).toBe(true)
      expect(isManager(adminUser)).toBe(true)
      expect(isManager(managerUser)).toBe(true)
      expect(isManager(employeeUser)).toBe(false)
    })
  })

  describe('Privilege Escalation Defense (OWASP A01 / CWE-269)', () => {
    it('allows only Admin to set or modify user role field', () => {
      const mockAdminReq = { req: { user: adminUser } } as any
      const mockHRReq = { req: { user: hrUser } } as any
      const mockEmployeeReq = { req: { user: employeeUser } } as any
      const mockAnonReq = { req: {} } as any

      expect(roleFieldAccess(mockAdminReq)).toBe(true)
      expect(roleFieldAccess(mockHRReq)).toBe(false)
      expect(roleFieldAccess(mockEmployeeReq)).toBe(false)
      expect(roleFieldAccess(mockAnonReq)).toBe(false)
    })
  })

  describe('Employees Collection RBAC Policies', () => {
    it('allows HR and Admin to create employees, blocks Manager and Employee', () => {
      expect(employeesCreateAccess({ req: { user: adminUser } } as any)).toBe(true)
      expect(employeesCreateAccess({ req: { user: hrUser } } as any)).toBe(true)
      expect(employeesCreateAccess({ req: { user: managerUser } } as any)).toBe(false)
      expect(employeesCreateAccess({ req: { user: employeeUser } } as any)).toBe(false)
      expect(employeesCreateAccess({ req: {} } as any)).toBe(false)
    })

    it('allows only Admin to delete employee records (compliance rule)', () => {
      expect(employeesDeleteAccess({ req: { user: adminUser } } as any)).toBe(true)
      expect(employeesDeleteAccess({ req: { user: hrUser } } as any)).toBe(false)
      expect(employeesDeleteAccess({ req: { user: managerUser } } as any)).toBe(false)
      expect(employeesDeleteAccess({ req: { user: employeeUser } } as any)).toBe(false)
    })

    it('scopes Manager read access to their assigned department', () => {
      const managerAccess = employeesReadAccess({ req: { user: managerUser } } as any)
      expect(managerAccess).toEqual({ department: { equals: 1 } })
    })

    it('scopes Manager update access to their department and Employee to own record', () => {
      const managerUpdate = employeesUpdateAccess({ req: { user: managerUser } } as any)
      expect(managerUpdate).toEqual({ department: { equals: 1 } })

      const empUpdate = employeesUpdateAccess({ req: { user: employeeUser } } as any)
      expect(empUpdate).toEqual({ email: { equals: 'somchai.j@cybersec.local' } })
    })
  })

  describe('Field-Level Security: Sensitive PII & Compensation Protection', () => {
    const somchaiDoc = { email: 'somchai.j@cybersec.local', salary: 150000, cardId: '1100400123451' }

    it('allows Admin and HR to read employee salary', () => {
      expect(salaryFieldReadAccess({ req: { user: adminUser }, doc: somchaiDoc } as any)).toBe(true)
      expect(salaryFieldReadAccess({ req: { user: hrUser }, doc: somchaiDoc } as any)).toBe(true)
    })

    it('allows Employee to read their OWN salary (Self-Service ABAC)', () => {
      expect(salaryFieldReadAccess({ req: { user: employeeUser }, doc: somchaiDoc } as any)).toBe(true)
    })

    it('blocks Manager and other Employees from reading another employee salary', () => {
      expect(salaryFieldReadAccess({ req: { user: managerUser }, doc: somchaiDoc } as any)).toBe(false)
      expect(salaryFieldReadAccess({ req: { user: otherEmployeeUser }, doc: somchaiDoc } as any)).toBe(false)
    })

    it('allows only Admin and HR to update employee salary', () => {
      expect(salaryFieldUpdateAccess({ req: { user: adminUser } } as any)).toBe(true)
      expect(salaryFieldUpdateAccess({ req: { user: hrUser } } as any)).toBe(true)
      expect(salaryFieldUpdateAccess({ req: { user: managerUser } } as any)).toBe(false)
      expect(salaryFieldUpdateAccess({ req: { user: employeeUser } } as any)).toBe(false)
    })

    it('protects National ID (cardId) with identical RBAC + Self-read rules', () => {
      expect(cardIdFieldReadAccess({ req: { user: adminUser }, doc: somchaiDoc } as any)).toBe(true)
      expect(cardIdFieldReadAccess({ req: { user: employeeUser }, doc: somchaiDoc } as any)).toBe(true)
      expect(cardIdFieldReadAccess({ req: { user: managerUser }, doc: somchaiDoc } as any)).toBe(false)
      expect(cardIdFieldReadAccess({ req: { user: otherEmployeeUser }, doc: somchaiDoc } as any)).toBe(false)
    })
  })

  describe('Users Collection Security', () => {
    it('restricts listing all users to Admin and HR', () => {
      expect(usersReadAccess({ req: { user: adminUser } } as any)).toBe(true)
      expect(usersReadAccess({ req: { user: hrUser } } as any)).toBe(true)
      expect(usersReadAccess({ req: { user: managerUser } } as any)).toEqual({ id: { equals: 4 } })
      expect(usersReadAccess({ req: { user: employeeUser } } as any)).toEqual({ id: { equals: 5 } })
    })

    it('allows Admin to update any user, restricts users to self-update', () => {
      expect(usersUpdateAccess({ req: { user: adminUser } } as any)).toBe(true)
      expect(usersUpdateAccess({ req: { user: employeeUser } } as any)).toEqual({ id: { equals: 5 } })
    })

    it('allows only Superadmin to delete users', () => {
      expect(usersDeleteAccess({ req: { user: adminUser } } as any)).toBe(true)
      expect(usersDeleteAccess({ req: { user: hrUser } } as any)).toBe(false)
      expect(usersDeleteAccess({ req: { user: employeeUser } } as any)).toBe(false)
    })
  })
})
