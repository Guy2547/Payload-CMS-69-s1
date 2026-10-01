// scripts/seed.mjs
// Seeds initial data into Payload CMS via REST API

const BASE_URL = process.env.PAYLOAD_URL || 'http://localhost:9092'

import { setTimeout as sleep } from 'node:timers/promises'

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const data = await res.json().catch(() => res.text())
  return { status: res.status, ok: res.ok, data }
}

async function waitForServer(retries = 30, delayMs = 3000) {
  console.log(`Checking connection to Payload CMS at ${BASE_URL}...`)
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/departments`)
      if (res.status === 200 || res.status === 401 || res.status === 403) {
        console.log(`Payload CMS is ready! (HTTP ${res.status})`)
        return true
      }
    } catch {
      // Server not ready yet
    }
    console.log(`Waiting for server... attempt ${i}/${retries}`)
    await sleep(delayMs)
  }
  throw new Error('Server did not respond in time.')
}

async function seedAdmin() {
  console.log('\n[1/5] Setting up First Admin...')
  // Sonar S2068: no default password — fail closed if env is not set.
  if (!process.env.ADMIN_PASSWORD) {
    throw new Error('ADMIN_PASSWORD env is required to seed (no default password).')
  }
  const adminCreds = {
    email: process.env.ADMIN_EMAIL || 'admin@cybersec.local',
    password: process.env.ADMIN_PASSWORD,
    firstname: process.env.ADMIN_FIRSTNAME || 'Security',
    lastname: process.env.ADMIN_LASTNAME || 'Admin',
  }

  const adminRes = await request('/api/admins/first-register', {
    method: 'POST',
    body: JSON.stringify(adminCreds),
  })

  if (adminRes.ok) {
    console.log('First admin registered successfully!')
  } else {
    console.log('First admin might already exist or responded with:', adminRes.status)
  }

  console.log('\n[2/5] Logging in as Admin...')
  const loginRes = await request('/api/admins/login', {
    method: 'POST',
    body: JSON.stringify({
      email: adminCreds.email,
      password: adminCreds.password,
    }),
  })

  if (!loginRes.ok || !loginRes.data?.token) {
    throw new Error(`Failed to log in as admin: ${JSON.stringify(loginRes.data)}`)
  }

  console.log('Logged in successfully. JWT Token acquired.')
  return { Authorization: `Bearer ${loginRes.data.token}` }
}

async function seedUser() {
  console.log('\n[3/5] Setting up Demo User...')
  // Sonar S2068: no default password — fail closed if env is not set.
  if (!process.env.DEMO_PASSWORD) {
    throw new Error('DEMO_PASSWORD env is required to seed (no default password).')
  }
  const userCreds = {
    email: process.env.DEMO_EMAIL || 'demo@cybersec.local',
    password: process.env.DEMO_PASSWORD,
    username: process.env.DEMO_USERNAME || 'demouser',
  }
  const userRes = await request('/api/users', {
    method: 'POST',
    body: JSON.stringify(userCreds),
  })
  if (userRes.ok) {
    console.log('Demo user registered successfully!')
  } else {
    console.log('Demo user register status:', userRes.status)
  }
}

async function seedDepartments(authHeaders) {
  const departmentsData = [
    {
      name: 'Information Security',
      description: 'Cyber Security Operations, Vulnerability Management & Incident Response',
    },
    {
      name: 'Software Engineering',
      description: 'Core Product Development, Cloud Infrastructure and DevOps',
    },
    {
      name: 'Human Resources',
      description: 'People Operations, Recruitment, and Employee Engagement',
    },
    {
      name: 'Finance & Accounting',
      description: 'Corporate Finance, Budget Planning, and Auditing',
    },
  ]

  const deptMap = {}
  for (const dept of departmentsData) {
    const res = await request('/api/departments', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(dept),
    })
    if (res.ok && res.data?.doc?.id) {
      deptMap[dept.name] = res.data.doc.id
      console.log(` Created Department: ${dept.name} (ID: ${res.data.doc.id})`)
    }
  }

  if (Object.keys(deptMap).length === 0) {
    const listRes = await request('/api/departments', { headers: authHeaders })
    for (const d of listRes.data?.docs || []) {
      deptMap[d.name] = d.id
    }
  }
  return deptMap
}

async function seedPositions(authHeaders) {
  const positionsData = [
    {
      name: 'Chief Information Security Officer (CISO)',
      level: 'lead',
      description: 'Executive leadership in Enterprise Cyber Security strategy',
    },
    {
      name: 'Senior Application Security Engineer',
      level: 'senior',
      description: 'OWASP auditing, penetration testing, and code review',
    },
    {
      name: 'Lead Full Stack Developer',
      level: 'lead',
      description: 'Next.js, Node.js, and Distributed Systems architect',
    },
    {
      name: 'Junior Software Engineer',
      level: 'junior',
      description: 'Backend API implementation and unit testing',
    },
    {
      name: 'HR & People Specialist',
      level: 'junior',
      description: 'Employee relations, benefits, and onboarding',
    },
  ]

  const posMap = {}
  for (const pos of positionsData) {
    const res = await request('/api/positions', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(pos),
    })
    if (res.ok && res.data?.doc?.id) {
      posMap[pos.name] = res.data.doc.id
      console.log(` Created Position: ${pos.name} (ID: ${res.data.doc.id})`)
    }
  }

  if (Object.keys(posMap).length === 0) {
    const listRes = await request('/api/positions', { headers: authHeaders })
    for (const p of listRes.data?.docs || []) {
      posMap[p.name] = p.id
    }
  }
  return posMap
}

async function seedEmployees(authHeaders, deptMap, posMap) {
  console.log('\n[5/5] Creating Sample Employees...')
  const itDeptId = deptMap['Information Security'] || Object.values(deptMap)[0]
  const devDeptId = deptMap['Software Engineering'] || Object.values(deptMap)[1] || itDeptId
  const hrDeptId = deptMap['Human Resources'] || Object.values(deptMap)[2] || itDeptId

  const cisoPosId = posMap['Chief Information Security Officer (CISO)'] || Object.values(posMap)[0]
  const secEngPosId = posMap['Senior Application Security Engineer'] || Object.values(posMap)[1] || cisoPosId
  const devPosId = posMap['Lead Full Stack Developer'] || Object.values(posMap)[2] || cisoPosId
  const hrPosId = posMap['HR & People Specialist'] || Object.values(posMap)[3] || cisoPosId

  const employees = [
    {
      name: 'Somchai Jaidee',
      email: 'somchai.j@cybersec.local',
      mobile: '0812345678',
      cardId: '1100400123451',
      department: itDeptId,
      position: cisoPosId,
      salary: 150000,
      hireDate: '2022-01-15T00:00:00.000Z',
    },
    {
      name: 'Apirak Cyberman',
      email: 'apirak.c@cybersec.local',
      mobile: '0898765432',
      cardId: '1100400123452',
      department: itDeptId,
      position: secEngPosId,
      salary: 85000,
      hireDate: '2023-03-01T00:00:00.000Z',
    },
    {
      name: 'Kanya Techstar',
      email: 'kanya.t@cybersec.local',
      mobile: '0865432198',
      cardId: '1100400123453',
      department: devDeptId,
      position: devPosId,
      salary: 95000,
      hireDate: '2022-07-20T00:00:00.000Z',
    },
    {
      name: 'Wichai Suksan',
      email: 'wichai.s@cybersec.local',
      mobile: '0823456789',
      cardId: '1100400123454',
      department: hrDeptId,
      position: hrPosId,
      salary: 45000,
      hireDate: '2024-02-10T00:00:00.000Z',
    },
  ]

  for (const emp of employees) {
    if (!emp.department || !emp.position) continue
    const res = await request('/api/employees', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(emp),
    })
    if (res.ok && res.data?.doc?.id) {
      console.log(` Created Employee: ${emp.name} (Salary: ${emp.salary} THB)`)
    }
  }
}

async function main() {
  console.log('--- Starting Data Seeder for Payload CMS ---')
  await waitForServer()

  const authHeaders = await seedAdmin()
  await seedUser()

  console.log('\n[4/5] Creating Departments & Positions...')
  const deptMap = await seedDepartments(authHeaders)
  const posMap = await seedPositions(authHeaders)

  await seedEmployees(authHeaders, deptMap, posMap)

  console.log('\n=============================================')
  console.log('Data Seeding Completed Successfully!')
  console.log('Admin URL:  http://localhost:9092/admin')
  console.log('=============================================\n')
}

await main()
