// scripts/encrypt-legacy.mjs
// Encrypts any legacy unencrypted employees via Payload API

const BASE_URL = process.env.PAYLOAD_URL || 'http://localhost:9092'

async function main() {
  const loginRes = await fetch(`${BASE_URL}/api/admins/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@cybersec.local',
      password: 'Admin@Secure2026!',
    }),
  }).then((r) => r.json())

  const token = loginRes.token
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  const list = await fetch(`${BASE_URL}/api/employees`, { headers: authHeaders }).then((r) =>
    r.json(),
  )
  for (const emp of list.docs || []) {
    // Simply saving triggering beforeChange will encrypt
    await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        cardId: emp.cardId,
        salary: emp.salary,
        email: emp.email || `${emp.name.toLowerCase().replace(/\s+/g, '.')}@cybersec.local`,
      }),
    })
    console.log(`Encrypted employee id: ${emp.id} (${emp.name})`)
  }
}

await main()
