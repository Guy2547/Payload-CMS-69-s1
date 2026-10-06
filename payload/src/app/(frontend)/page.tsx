import { headers as getHeaders } from 'next/headers.js'
import { getPayload } from 'payload'
import React from 'react'

import config from '@/payload.config'
import './styles.css'

const STATS: { slug: 'admins' | 'users' | 'departments' | 'positions' | 'employees'; label: string }[] = [
  { slug: 'admins', label: 'Superadmins' },
  { slug: 'users', label: 'Users' },
  { slug: 'departments', label: 'Departments' },
  { slug: 'positions', label: 'Positions' },
  { slug: 'employees', label: 'Employees' },
]

const ROLES = ['Superadmin', 'Admin', 'HR', 'Manager', 'Employee']

async function getCount(payload: Awaited<ReturnType<typeof getPayload>>, slug: (typeof STATS)[number]['slug']): Promise<number | null> {
  try {
    const { totalDocs } = await payload.count({ collection: slug })
    return totalDocs
  } catch {
    return null
  }
}

export default async function HomePage() {
  const headers = await getHeaders()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers })

  const counts = await Promise.all(STATS.map(({ slug }) => getCount(payload, slug)))

  return (
    <div className="home">
      <div className="content">
        <div className="brand">
          <span className="brandMark" aria-hidden="true">
            69-s1
          </span>
          <div className="brandText">
            <strong>CyberSec Personnel &amp; Data</strong>
            <span>Payload CMS · OWASP Top 10:2025 · RBAC enforced</span>
          </div>
        </div>

        <h1>ยินดีต้อนรับเข้าสู่ระบบบริหารจัดการบุคคลและข้อมูลในองค์กร</h1>
        {user && <p className="userLine">Signed in as {user.email}</p>}

        <div className="stats">
          {STATS.map(({ slug, label }, i) => (
            <div className="card" key={slug}>
              <span className="cardValue">{counts[i] ?? '—'}</span>
              <span className="cardLabel">{label}</span>
            </div>
          ))}
        </div>

        <div className="roles">
          {ROLES.map((role) => (
            <span className="badge" key={role}>
              {role}
            </span>
          ))}
        </div>

        <div className="links">
          <a
            className="admin"
            href={payloadConfig.routes.admin}
            rel="noopener noreferrer"
            target="_blank"
          >
            Login admin
          </a>
          <a
            className="docs"
            href="https://payloadcms.com/docs"
            rel="noopener noreferrer"
            target="_blank"
          >
            Documentation
          </a>
        </div>
      </div>
      <div className="footer">
        <p>69-s1-cybersec · Strict lockdown build</p>
      </div>
    </div>
  )
}
