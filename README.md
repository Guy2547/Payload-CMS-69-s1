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
# ต้องเจอ "Migrated:" แล้ว "Ready" ก่อนทำขั้นถัดไป
# เช็คด่วน: GET http://127.0.0.1:9092/api/departments ตอบ 403 = server alive + lockdown ทำงาน (ปกติ)
```

### 4.2 Seed ข้อมูลเริ่มต้นและบทบาท RBAC
> `scripts/seed.mjs` ไม่อ่าน `.env` เอง — ต้องโหลด env เข้า session ก่อนรันทุกครั้ง
> (รัน `node` เพียว ๆ จะล้มที่ `ADMIN_PASSWORD env is required`)
```powershell
Get-Content .env | ForEach-Object { if ($_ -match '^\s*([^#=]+?)\s*=\s*(.*)\s*$') { [Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), 'Process') } }
$env:PAYLOAD_URL='http://127.0.0.1:9092'
node scripts/seed.mjs
```
เงื่อนไข: `ADMIN_PASSWORD` ต้องยาว ≥12 ตัวอักษร (ตาม password policy) ไม่งั้น first-register ตอบ 400

### 4.3 ปัญหาที่พบบ่อยตอน seed / migrate (Troubleshooting)
- **seed รอ server ครบ 30 ครั้งแล้วล้ม:** app ยังบูตไม่เสร็จ (cold boot + migrate เกิน 90 วิ) — รอ `Ready` ใน logs แล้วรันใหม่
- **app ค้างที่ `Would you like to proceed? (y/N)`:** ตาราง `payload_migrations` มีแถว `dev` (batch -1) จาก dev-mode push ทำให้ migrate ถามแบบ interactive ใน container ที่ตอบไม่ได้ — ลบด้วย `DELETE FROM payload_migrations WHERE batch = -1;` แล้ว restart app
  - ระวัง: ทุกครั้งที่รัน `vitest` / `migrate:create` / `npm run dev` **บน host** (dev boot จะ push schema + เขียน marker ใหม่) ต้องลบ marker ซ้ำก่อน restart app — ยกเว้นคำสั่ง migrate ให้รันด้วย `NODE_ENV=production` นำหน้าเพื่อกัน dev-push ตั้งแต่ต้น (ห้ามใช้กับ `vitest`: production mode ทำให้ Vite externalize `node:` จนเทสล้ม)
- **รัน seed ซ้ำแล้ว `employees` เบิ้ล:** ขั้น `[5/5]` ไม่มี dedup — ล้างก่อนรันซ้ำ: `docker exec 69-s1-db psql -U $env:DATABASE_USERNAME -d $env:DATABASE_NAME -c "DELETE FROM employees;"`
- **สร้าง user แล้วตอบ 429:** ชน register rate limit (5 ครั้ง/ชม./IP) — ลบ key ใน Redis: `docker exec 69-s1-redis redis-cli DEL "ratelimit:register:users:172.19.0.1"`
- **สร้าง user แล้วตอบ 500 `users._verified does not exist`:** เปิด verify (ตั้ง `EMAIL_SMTP_USER`) แต่ DB ไม่มีคอลัมน์ — ต้อง gen migration ใหม่: ให้ `payload/.env` มี SMTP ครบก่อน `npx payload migrate:create` (ไม่งั้น diff จะขาดคอลัมน์ verify), ตรวจไฟล์ migration ว่ามีเฉพาะของใหม่จริง แล้ว apply ด้วย `NODE_ENV=production npx payload migrate` (กัน dev-push สร้าง marker ใหม่)

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

### 5.3 หน้าแรก Landing Dashboard (`/`)
หน้า `http://127.0.0.1:9092` เป็น dashboard สรุปสถานะระบบ (คำทักทายไทย + การ์ดนับจำนวน 5 collections ผ่าน `payload.count()` + ป้าย 5 roles + ปุ่ม Login admin) — โค้ดอยู่ที่ `payload/src/app/(frontend)/`:
- `page.tsx` — โครงหน้า (server component, นับด้วย local API ไม่แตะ access control ภายนอก, มี try/catch กันหน้า 500)
- `styles.css` — สไตล์ dark theme + grid การ์ด
- `layout.tsx` — `lang="th"` + title/description ภาษาไทย
- แก้ไฟล์แล้วต้อง `docker compose up -d --build` ทุกครั้ง (code ฝังใน image)

---

## 6. เอกสารอ้างอิงทางเทคนิค (Documentation)

- [docs/SECURITY_RBAC.md](file:///C:/Users/theer/Downloads/Payload-CMS-69-s1-feat-rest/Payload-CMS-69-s1-feat-rest/docs/SECURITY_RBAC.md) — เอกสารสถาปัตยกรรมและรายละเอียดทางเทคนิคของระบบ RBAC ฉบับสมบูรณ์
- [payload/payload-vs-strapi-security-analysis.md](file:///C:/Users/theer/Downloads/Payload-CMS-69-s1-feat-rest/Payload-CMS-69-s1-feat-rest/payload/payload-vs-strapi-security-analysis.md) — เอกสารวิเคราะห์เปรียบเทียบเชิงสถาปัตยกรรมและการจัดการสิทธิ์ (Payload CMS vs Strapi)
- [docs/SECURITY_ENCRYPTION.md](file:///C:/Users/theer/Downloads/Payload-CMS-69-s1-feat-rest/Payload-CMS-69-s1-feat-rest/docs/SECURITY_ENCRYPTION.md) — เอกสารการเข้ารหัสข้อมูลระดับฟิลด์ (AES-256-GCM / PDPA)
- [docs/SECURITY-OWASP-2025.md](file:///C:/Users/theer/Downloads/Payload-CMS-69-s1-feat-rest/Payload-CMS-69-s1-feat-rest/docs/SECURITY-OWASP-2025.md) — รายงานการประเมินและป้องกันช่องโหว่ OWASP Top 10:2025

---

## 7. บันทึกงานซ่อมและผลเจาะระบบ (2026-10-06)

### 7.1 กู้ระบบ + seed
- ลบแถว `dev` (batch -1) ใน `payload_migrations` ที่ทำ `payload migrate` ค้าง prompt → restart จน `Ready`
- สุ่ม `ADMIN_PASSWORD` ใหม่ 16 ตัว (ของเดิม 9 ตัวไม่ผ่าน policy) · sync SMTP เข้า `payload/.env`
- สร้าง migration `20261006_141739` เติมคอลัมน์ `users._verified/_verificationtoken` (เปิด verify แต่ schema ไม่มี)
- seed เขียวครบ: admins 1 / users 4 / departments 4 / positions 5 / employees 4

### 7.2 ผลเจาะระบบ (local, เจาะแล้วซ่อมแล้ว เจาะซ้ำเขียวหมด)
| ระดับ | ปัญหา | วิธีแก้ |
|---|---|---|
| 🔴 | `next 16.3.3` โดน RCE (GHSA-vcvr-r3jv-pc5j) | อัปเกรด `next→16.3.8`, `sharp→0.35.5` |
| 🔴 | users forgot-password ตอบ 400 + แยกได้ว่าเมลมีตัวตน | ถอด `required` ออกจากฟิลด์ `role` (Payload ตรวจ required บน path update ด้วย) เหลือ validate ตอน create |
| 🔴 | หมุน `X-Forwarded-For` หนี rate-limit ได้ | `getClientIp` เมิน header เว้นแต่ `TRUST_PROXY=1` |
| 🔴 | seed users (`@cybersec.local`) ล็อกอินไม่ได้เพราะ verify | `beforeChange` ตั้ง `_verified=true` ให้ user ที่ admin/HR สร้าง |
| 🟡 | manager/employee PATCH ไม่ได้เลย (400/403) | ถอด required ออกจาก `name/department/position` + validate แยก create/update + ownership hook ตรวจราย doc |
| 🟡 | upload 500 `EACCES mkdir 'media'` | `Dockerfile` สร้าง `/app/media` + chown ให้ user `nextjs` |
| Info | env ซาก Strapi 5 ตัว (`APP_KEYS` ฯลฯ) ไม่มีโค้ดใช้ | ลบออกจาก `.env` |

ผ่านไม่ต้องแก้: anon 403 ทุก collection/method · escalation โดนบังคับเป็น employee · salary/cardId เห็นเฉพาะเจ้าของ+HR · delete เฉพาะ admin · SQLi/operator injection ไม่เข้า · introspection ถูกบล็อก · header ครบ (HSTS/CSP/X-Frame DENY) · JWT httpOnly อายุ 2 ชม. · lockout 5 ครั้ง/10 นาที + token 40 ตัว single-use
- หมายเหตุ: custom `validate` ทุกฟิลด์ต้องรับค่า `undefined` บน path update (ไม่งั้น update ที่ไม่ส่งฟิลด์นั้นจะ 400) — ดูตัวอย่างใน `Employees.name` / `Users.role`
- คงเหลือ: nodemailer/undici highs (แก้ได้เฉพาะ breaking change รอ upstream) · `TRACE /` ตอบ 200 (ไม่สะท้อน cookie) · public register ยังต้อง verify ทางเมล
