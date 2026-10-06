import React from 'react'
import './styles.css'

export const metadata = {
  description: 'ระบบบริหารจัดการบุคคลและข้อมูลในองค์กร (Payload CMS + RBAC + OWASP Top 10:2025)',
  title: 'ระบบบริหารจัดการบุคคลและข้อมูลองค์กร',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="th">
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
