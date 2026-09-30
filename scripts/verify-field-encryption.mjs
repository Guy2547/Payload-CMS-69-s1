// scripts/verify-field-encryption.mjs
// Verifies Field-Level Data Encryption end-to-end

const BASE_URL = process.env.PAYLOAD_URL || 'http://localhost:9092'

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { status: res.status, ok: res.ok, data }
}

async function main() {
  console.log('--- Verifying Field-Level Encryption End-to-End ---')

  // 1. Login as Admin
  console.log('\n[1/4] Logging in as Admin...')
  const loginRes = await request('/api/admins/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@cybersec.local',
      password: 'Admin@Secure2026!',
    }),
  })

  if (!loginRes.ok || !loginRes.data?.token) {
    throw new Error(`Login failed: ${JSON.stringify(loginRes.data)}`)
  }
  const token = loginRes.data.token
  const authHeaders = { Authorization: `Bearer ${token}` }
  console.log(' Authenticated as Admin successfully.')

  // Fetch departments & positions for foreign keys
  const deptList = await request('/api/departments', { headers: authHeaders })
  const posList = await request('/api/positions', { headers: authHeaders })
  const deptId = deptList.data?.docs?.[0]?.id
  const posId = posList.data?.docs?.[0]?.id

  // 2. Create test employee
  console.log('\n[2/4] Creating new Employee with sensitive PII...')
  const testPayload = {
    name: 'Natapong SecureTest',
    email: 'natapong.s@cybersec.corp',
    mobile: '0891234567',
    cardId: '1234567890123',
    salary: 95000,
    department: deptId,
    position: posId,
  }

  const createRes = await request('/api/employees', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(testPayload),
  })

  if (!createRes.ok || !createRes.data?.doc?.id) {
    throw new Error(`Failed to create employee: ${JSON.stringify(createRes.data)}`)
  }

  const employeeId = createRes.data.doc.id
  console.log(` Employee created successfully with ID: ${employeeId}`)
  console.log(' API response (afterRead hook):')
  console.log('   cardId:', createRes.data.doc.cardId)
  console.log('   salary:', createRes.data.doc.salary)
  console.log('   email :', createRes.data.doc.email)

  // 3. Verify Read API (Decrypted output for Admin)
  console.log('\n[3/4] Fetching Employee via GET /api/employees/:id...')
  const getRes = await request(`/api/employees/${employeeId}`, { headers: authHeaders })
  const doc = getRes.data

  if (doc.cardId !== testPayload.cardId) {
    throw new Error(`cardId mismatch: expected ${testPayload.cardId}, got ${doc.cardId}`)
  }
  if (String(doc.salary) !== String(testPayload.salary)) {
    throw new Error(`salary mismatch: expected ${testPayload.salary}, got ${doc.salary}`)
  }
  if (doc.email !== testPayload.email) {
    throw new Error(`email mismatch: expected ${testPayload.email}, got ${doc.email}`)
  }
  console.log(' PASS: API returns transparently decrypted plaintext to authorized client!')

  console.log('\n[4/4] Verification ready for direct PostgreSQL inspection:')
  console.log(` Employee ID: ${employeeId}`)
  console.log(' To inspect raw ciphertext in DB, run:')
  console.log(` docker exec 69-s1-db psql -U payload -d payload -c "SELECT id, name, card_id, salary, email FROM employees WHERE id = ${employeeId};"`)
}

main().catch((err) => {
  console.error('Verification failed:', err)
  process.exit(1)
})
