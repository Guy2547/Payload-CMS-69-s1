# Migration Log: Strapi v4 → Payload CMS v3

> ไฟล์นี้บันทึกงานย้าย CMS ที่ทำเมื่อ 2026-09-28/29 (branch `feat/rest`)
> หมายเหตุ: `README.md` / `AGENTS.md` / `api.http` ถูก ignore โดย `.gitignore`
> จึงบันทึกเรื่องที่ต้องขึ้น GitHub ไว้ที่นี่แทน

## 1. ภาพรวม

- **จาก:** Strapi v4.16.2 (image สำเร็จรูป `prawee/strapi`) + PostgreSQL 16 + pgAdmin4
- **เป็น:** Payload CMS **3.90.2** (Next.js, build เองจาก `./payload`) + PostgreSQL 16 + pgAdmin4
- **เหตุผล:** Payload ไม่มี official one-image แบบ Strapi จึงต้องมีโค้ดแอป + Dockerfile ของตัวเอง
- **Repo:** https://github.com/Guy2547/Payload-CMS-69-s1.git

## 2. โครงสร้างปัจจุบัน

```
docker-compose.yaml   # services: db (postgres:16-alpine), app (build ./payload), admin (pgadmin4)
payload/
  Dockerfile          # node:24-alpine, npm install, full-copy runner, CMD: migrate + start
  .dockerignore
  src/payload.config.ts
  src/collections/    # Admins, Users, Departments, Positions, Employees, Media
  src/migrations/     # drizzle migrations (20260928_210429 = ตัวแรก)
  src/payload-types.ts
env.simple / .env.simple   # template (ของจริงอยู่ .env ซึ่งถูก ignore)
api.http / api.http.simple # ตัวอย่าง request สำหรับ VS Code REST Client
```

| Service | Host port | Container port |
|---|---|---|
| Payload app | 9092 | 3000 |
| pgAdmin | 8081 | 80 |
| Postgres | 54327 | 5432 |

## 3. Collections (เทียบของเดิม Strapi)

| Collection | Fields | Auth / Access |
|---|---|---|
| `Admins` | email (default), firstname, lastname | auth; CRUD เฉพาะ admin; สร้างคนแรกผ่าน `first-register` |
| `Users` | email (default), username | auth; สมัคร public; อ่านต้อง login; แก้ไขได้เฉพาะตัวเองหรือ admin |
| `Employees` | name*, mobile, cardId (PII เข้ารหัส), department*, position* | read=auth (self/manager scope + field mask) / write=admin (+HR) |
| `Departments` | name* unique | read=auth / write=admin |
| `Positions` | name* unique, level | read=auth / write=admin (+HR) |
| `Media` | (default จาก template) | — |

## 4. Endpoint mapping (Strapi → Payload)

| เดิม (Strapi) | ใหม่ (Payload v3) |
|---|---|
| `POST /admin/register-admin` | `POST /api/admins/first-register` (เฉพาะตอน collection ว่าง) |
| `POST /admin/login` → `$.data.token` | `POST /api/admins/login` → `$.token` |
| `GET /admin/users/me` | `GET /api/admins/me` |
| `POST /admin/forgot-password` (204) | `POST /api/admins/forgot-password` (200) |
| `POST /admin/reset-password {resetPasswordToken}` | `POST /api/admins/reset-password {token, password}` |
| `POST /api/auth/local/register` | `POST /api/users` |
| `POST /api/auth/local {identifier}` | `POST /api/users/login {email, password}` |
| `POST /api/auth/forgot-password` | `POST /api/users/forgot-password` |
| CRUD `/api/students {"data":{...}}` + PUT | CRUD `/api/students` body ตรงๆ (ไม่มี wrapper) + **PATCH** |

## 5. วิธีรัน / คำสั่งที่ใช้บ่อย

```powershell
docker compose up -d --build  # build + start; app migrate DB เองตอน boot
docker compose ps
docker logs 69-s1-app         # หา "Migrated:" แล้ว "Ready"
npm run payload -- migrate:create  # (ใน ./payload, DB ต้องรัน) สร้าง migration ใหม่
npm run generate:types         # หลังแก้ collections (แก้ req.user.collection type error)
```

## 6. ผลเทส (fresh DB, 2026-09-28)

- 16/16 ขั้นผ่าน: first-register → login → me (admin+user), register user, CRUD students/subjects/teachers, unauth → 403, forgot → 200 ทั้งสอง collections
- reset-password ครบวงจร: token 40 ตัวอักษรจาก `*.reset_password_token` → reset 200 → login ด้วยรหัสใหม่ได้; token ผิด → 403
- รหัสผ่านใน DB คืนค่าตรง `.env` หลังเทสแล้ว

## 7. ปัญหาที่เจอ + วิธีแก้

1. **Docker daemon ต่อไม่ติด** — context ค้างที่ `desktop-linux`; สลับเป็น `default` ใช้ได้
2. **โฟลเดอร์ซ้ำ** — `69-s1-cybersec` (ต้นฉบับ) กับโฟลเดอร์นี้ใช้ชื่อ container `69-s1-*` ชุดเดียวกัน → ลบ container เก่าที่ exit แล้ว; อย่ารันสองโฟลเดอร์พร้อมกัน
3. **`npm ci` ล้มใน Docker** — lock ที่ npm 12 บน Windows สร้าง resolve transitive deps (yjs, monaco ฯลฯ) ไม่ตรง Linux → Dockerfile ใช้ `npm install`
4. **host `node_modules` หลุดเข้า image** (shim ชี้ `node.exe`) → เพิ่ม `payload/.dockerignore`
5. **Template ไม่มี `public/`** + ต้องการ `output:standalone` → ใช้ full-copy runner แทน (เพื่อให้มี payload CLI ไว้ migrate)
6. **Production ไม่ auto-migrate** (`relation "users" does not exist`) → container CMD รัน `npx payload migrate` (idempotent) ก่อน `next start` ทุกครั้ง
7. **npm 12 ต้องการ node ^22.22.2|^24** → base image `node:24-alpine` ตรงกับ host
