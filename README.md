# Payload CMS — Enterprise Role-Based Access Control (RBAC) & Security Architecture

ระบบบริหารจัดการทรัพยากรบุคคลและข้อมูลองค์กร พัฒนาบน **Payload CMS v3 (Next.js App Router, TypeScript Code-First, PostgreSQL)** เสริมเกราะความปลอดภัยระดับองค์กรตามมาตรฐาน **OWASP Top 10:2025** ด้วยระบบ **Role-Based Access Control (RBAC)**, **Row/Field-Level Security**, การป้องกัน **Privilege Escalation** และการเข้ารหัสข้อมูลสำคัญระดับฟิลด์ **AES-256-GCM**

---

## 1. จุดเด่นด้านความปลอดภัยและระบบสิทธิ์ (Key Features)

- **Granular Role-Based Access Control (RBAC):** กำหนดสิทธิ์แยกตามบทบาทชัดเจน (Superadmin, HR Specialist, Department Manager, Regular Employee)
- **Field-Level Access Control (ABAC):** ซ่อนฟิลด์ข้อมูลส่วนบุคคลอ่อนไหว (PII) เช่น `salary` และ `cardId` ไม่ให้ผู้จัดการหรือเพื่อนร่วมงานมองเห็น แต่เปิดให้พนักงานเจ้าของข้อมูลดูของตนเองได้ (Self-Service)
- **Row-Level Query Scoping:** ผู้จัดการแผนก (Manager) ถูกจำกัดการอ่านข้อมูลให้อยู่ภายในแผนกของตนเองโดยอัตโนมัติผ่าน SQL Query Interception
- **Privilege Escalation Mitigation (OWASP A01 / CWE-269):** ป้องกันการโจมตีแบบ Mass Assignment โดยล็อกฟิลด์ `role` ให้แก้ไขได้เฉพาะ Admin ทั้งในระดับ Field Access และ Lifecycle Hook
- **Dual-Layer Defense (RBAC + AES-256-GCM):** ข้อมูลเงินเดือนและบัตรประชาชนถูกเข้ารหัสลับที่ระดับฐานข้อมูล (Data-at-Rest) และถูกประเมินสิทธิ์การเข้าถึงอีกชั้นก่อนส่งออกทาง API
- **Fail-Closed Security & Rate Limiting:** ตรวจสอบความถูกต้องของ Environment Variables ทันทีที่สตาร์ตระบบ และควบคุมความถี่การเข้าสู่ระบบผ่าน Redis

---

## 2. โครงสร้างบทบาทและตารางสิทธิ์ (RBAC Matrix)

```
                    ┌─────────────────────────┐
                    │ Superadmin ('admin')    │──► จัดการได้ทุกอย่างในระบบ + ลบข้อมูลพนักงาน
                    └────────────┬────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
  ┌─────────────────────────┐     ┌─────────────────────────┐
  │ HR Specialist ('hr')    │     │ Dept Manager ('manager')│
  │ - จัดการพนักงานทั้งหมด   │     │ - เห็นเฉพาะพนักงานในแผนก │
  │ - ดู/แก้ไขเงินเดือนได้   │     │ - เงินเดือน & บัตร ปชช.  │
  │ - จัดการตำแหน่งงาน       │     │   ถูก Masking (ซ่อน)    │
  └─────────────────────────┘     └─────────────────────────┘
                 │                               │
                 └───────────────┬───────────────┘
                                 ▼
                  ┌─────────────────────────┐
                  │ Regular Employee        │
                  │ - ดู Directory ทั่วไป    │
                  │ - ดูเงินเดือนเฉพาะตนเอง  │
                  └─────────────────────────┘
```

| ทรัพยากร (Resource) | การดำเนินการ (Operation) | Superadmin (`admin`) | HR Specialist (`hr`) | Department Manager (`manager`) | Regular Employee (`employee`) |
|---|---|:---:|:---:|:---:|:---:|
| **Users** | Create | ✅ (ทุก Role) | ❌ | ❌ | ❌ (สมัครได้เฉพาะ employee) |
| | Read / Update | ✅ (ทุกคน) | ✅ (ดูรายชื่อ) | 🔍 (เฉพาะตนเอง) | 🔍 (เฉพาะตนเอง) |
| | **ฟิลด์ `role`** | ✏️ กำหนดได้ | ❌ Denied | ❌ Denied | ❌ Denied |
| **Employees** | Create | ✅ | ✅ | ❌ | ❌ |
| | Read ทั่วไป | ✅ (ทุกคน) | ✅ (ทุกคน) | 🔍 (เฉพาะในแผนก) | 🔍 (Directory ทั่วไป) |
| | **ฟิลด์เงินเดือน `salary`** | 👁️ มองเห็น | 👁️ มองเห็น | ❌ **ซ่อน (Omitted)** | 👁️ **เฉพาะของตนเอง** |
| | **ฟิลด์เลขบัตร `cardId`** | 👁️ มองเห็น | 👁️ มองเห็น | ❌ **ซ่อน (Omitted)** | 👁️ **เฉพาะของตนเอง** |
| | Update ข้อมูลติดต่อ | ✅ | ✅ | ✏️ (เฉพาะในแผนก) | ✏️ (เฉพาะของตนเอง) |
| | Update เงินเดือน | ✅ | ✅ | ❌ Forbidden | ❌ Forbidden |
| | Delete ข้อมูลพนักงาน | ✅ (Admin เท่านั้น) | ❌ Denied | ❌ Denied | ❌ Denied |
| **Departments** | Read / Write | ✅ CRUD | 👁️ Read-Only | 👁️ Read-Only | 👁️ Read-Only |
| **Positions** | Read / Write | ✅ CRUD | ✅ Create/Update | 👁️ Read-Only | 👁️ Read-Only |
| **Media** | Upload / Read | ✅ Full | ✅ Upload/Read | ✅ Upload/Read | 👁️ Read-Only |

---

## 3. ข้อมูลบัญชีผู้ใช้สำหรับทดสอบ (Seed Test Accounts)

| บทบาท (Role) | บัญชีผู้ใช้งาน (Email) | รหัสผ่าน (Password) | สิทธิ์และการเข้าถึง |
|---|---|---|---|
| **Superadmin (Admins)** | `admin@cybersec.local` | `SecPass12345!` | สิทธิ์สูงสุด ควบคุม Admin Panel และลบข้อมูลได้ |
| **Admin User** | `admin_user@cybersec.local` | `SecPass12345!` | สิทธิ์ Admin ผ่าน REST API (`/api/users/*`) |
| **HR Specialist** | `hr_user@cybersec.local` | `SecPass12345!` | จัดการพนักงาน ดูเงินเดือน ถอดรหัสบัตร ปชช. |
| **Department Manager** | `manager_user@cybersec.local` | `SecPass12345!` | สโคปแผนก IT ไม่เห็นเงินเดือนผู้อื่น |
| **Regular Employee** | `somchai.j@cybersec.local` | `SecPass12345!` | ดูข้อมูลตนเอง เห็นเงินเดือนตนเอง แต่ไม่เห็นของเพื่อน |

---

## 4. วิธีการติดตั้งและรันระบบ (Quick Start)

### 4.1 สตาร์ตระบบด้วย Docker Compose
```powershell
# คัดลอกไฟล์ Environment
cp env.simple .env

# บิลด์และรัน Container (App + PostgreSQL + Redis + pgAdmin)
docker compose up -d --build

# ตรวจสอบสถานะการรัน
docker compose ps
docker logs -f 69-s1-app
```

### 4.2 Seed ข้อมูลเริ่มต้นและบทบาท RBAC
```powershell
node scripts/seed.mjs
```

---

## 5. การทดสอบและตรวจสอบความปลอดภัย (Testing & Verification)

### 5.1 ทดสอบผ่าน REST Client (`api.http` / `api.http.simple`)
เปิดไฟล์ [api.http](file:///C:/Users/theer/Downloads/Payload-CMS-69-s1-feat-rest/Payload-CMS-69-s1-feat-rest/api.http) ใน VS Code เพื่อรันคำขอทดสอบตามลำดับ:
1. **Privilege Escalation Test:** ทดลองสมัครสมาชิกพร้อมส่ง `"role": "admin"` เพื่อดูระบบป้องกันและบังคับลดสิทธิ์เป็น `"employee"`
2. **HR Operations:** ทดสอบ HR สร้างพนักงาน ปรับเงินเดือน และทดลองลบ (จะถูก 403 Forbidden)
3. **Manager Operations:** ทดสอบ Manager เข้าดูพนักงาน (ฟิลด์ `salary` และ `cardId` จะถูกตัดทิ้งอัตโนมัติ)
4. **Self-Service Verification:** ทดสอบพนักงานเข้าดูโปรไฟล์ตนเอง (เห็นเงินเดือนตนเอง แต่ไม่เห็นของผู้อื่น)

### 5.2 รัน Automated Test Suite (Vitest)
```powershell
cd payload
npm run test:int
```

---

## 6. เอกสารอ้างอิงทางเทคนิค (Documentation)

- [docs/SECURITY_RBAC.md](file:///C:/Users/theer/Downloads/Payload-CMS-69-s1-feat-rest/Payload-CMS-69-s1-feat-rest/docs/SECURITY_RBAC.md) — เอกสารสถาปัตยกรรมและรายละเอียดทางเทคนิคของระบบ RBAC ฉบับสมบูรณ์
- [payload/payload-vs-strapi-security-analysis.md](file:///C:/Users/theer/Downloads/Payload-CMS-69-s1-feat-rest/Payload-CMS-69-s1-feat-rest/payload/payload-vs-strapi-security-analysis.md) — เอกสารวิเคราะห์เปรียบเทียบเชิงสถาปัตยกรรมและการจัดการสิทธิ์ (Payload CMS vs Strapi)
- [docs/SECURITY_ENCRYPTION.md](file:///C:/Users/theer/Downloads/Payload-CMS-69-s1-feat-rest/Payload-CMS-69-s1-feat-rest/docs/SECURITY_ENCRYPTION.md) — เอกสารการเข้ารหัสข้อมูลระดับฟิลด์ (AES-256-GCM / PDPA)
- [docs/SECURITY-OWASP-2025.md](file:///C:/Users/theer/Downloads/Payload-CMS-69-s1-feat-rest/Payload-CMS-69-s1-feat-rest/docs/SECURITY-OWASP-2025.md) — รายงานการประเมินและป้องกันช่องโหว่ OWASP Top 10:2025
