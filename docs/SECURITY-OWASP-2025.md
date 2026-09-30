# Security Hardening Log: OWASP Top 10:2025 (Strict lockdown)

> บันทึกงาน hardening ที่ทำเมื่อ 2026-09-30 (ต่อจาก migration ที่ `docs/MIGRATION.md`)
> หมายเหตุ: ไม่มี OWASP Top 10:2026 แยก — มาตรฐานที่ใช้ในปี 2026 คือ **Top 10:2025**
> (release พ.ย. 2025, finalize ม.ค. 2026) มี 10 หมวด A01–A10
> ขอบเขตที่ผู้ใช้เลือก: **Strict lockdown** + rate-limit แบบ **Redis** + **จำกัด Media (mime/size)**

## 1. ไฟล์ที่เปลี่ยน (เทียบ `git status`)

| ไฟล์ | เรื่อง |
|---|---|
| `payload/src/lib/security.ts` (ใหม่) | rate limiter (Redis หลัก/memory fallback), password policy, audit log, client-IP |
| `payload/src/collections/Admins.ts` | auth: lockout 5 ครั้ง/10 นาที, token 2 ชม., cookies Lax/Secure, hooks rate-limit+policy+audit |
| `payload/src/collections/Users.ts` | เหมือน Admins + `read` เหลือ self-or-admin, `username` มี validate, `verify` เปิดเมื่อมี SMTP |
| `payload/src/collections/Students.ts` | read=auth / write=admin; `name ≤100`, `mobile` 9–10 หลัก, `cardId` 13 หลัก |
| `payload/src/collections/Subjects.ts`, `Teachers.ts` | read=auth / write=admin; `name ≤100` |
| `payload/src/collections/Media.ts` | read=auth / upload=admin; `mimeTypes` jpeg/png/webp; ไฟล์ ≤5MB (hook); `pasteURL:false`; thumbnail |
| `payload/src/payload.config.ts` | fail-closed (`PAYLOAD_SECRET≥32`, ต้องมี `DATABASE_URL`), CORS/CSRF allowlist (`CORS_ORIGINS`), `maxDepth:10`, GraphQL playground+introspection ปิดใน prod, SMTP บังคับ STARTTLS, `skipVerify` เหลือแค่ dev |
| `payload/next.config.ts` | เอา `output:standalone` ออก (ขัดกับ full-copy runner), `poweredByHeader:false`, headers: CSP/HSTS/`X-Frame-Options:DENY`/nosniff/Referrer/Permissions-Policy |
| `docker-compose.yaml` | เพิ่ม service `redis` (7-alpine, 64MB LRU), ทุก port bind `127.0.0.1`, ส่ง `REDIS_URL`+`CORS_ORIGINS` ให้ app |
| `payload/src/app/my-route/route.ts` (ลบ) | route ตัวอย่างเปิด public ไม่มี auth/error handling |
| `payload/src/migrations/20260930_041156.*` (ใหม่) | `_verified`/`_verificationtoken` (users), `username NOT NULL`, คอลัมน์ thumbnail (media) |
| `payload/package.json` (+lock) | pin versions ตรง lockfile, เพิ่ม `ioredis 6.0.0` |
| `.github/dependabot.yml` (ใหม่) | อัปเดต npm+docker รายสัปดาห์ (A03) |
| `env.simple`, `api.http`, `AGENTS.md`, `.gitignore` (`data-redis/`) | ตามสภาพใหม่ (content ต้องใช้ admin token) |

## 2. สรุปตามหมวด OWASP

- **A01 Broken Access Control:** content เขียนเฉพาะ admin; users list เฉพาะ admin (+self); media อ่านต้อง login; playground ปิดใน prod (เทสได้ 404)
- **A02 Misconfiguration:** headers ครบ (ไม่มี `x-powered-by`), loopback-only ports, fail-closed env
- **A03 Supply Chain:** pin deps, dependabot, `npm audit` (คงเหลือของแก้ไม่ได้ดูข้อ 5)
- **A04/A07 Crypto+Auth:** policy รหัส min 12 + 3/4 classes, lockout, token 2 ชม., ลืมรหัส 1 ชม., STARTTLS
- **A05 Injection:** validate + maxLength ทุก text field, `maxDepth:10` (adapter ใช้ parameterized อยู่แล้ว)
- **A06 Design:** public register ยังเปิดแต่มี rate-limit (5/ชม.) + verify email เมื่อมี SMTP
- **A08 Integrity:** upload whitelist + 5MB + ปิด remote-URL paste
- **A09 Logging:** `audit:admin.login`, `audit:user.login`, `audit:*.forgot_password` ใน `docker logs`
- **A10 Exceptions:** ไม่มี fail-open (secret/DB/email), error generic, `debug` ปิดใน prod

## 3. ผลเทสบน stack จริง (2026-09-30, `docker compose up -d --build`)

| เคส | ผล |
|---|---|
| user `POST /api/students` | **403** ✓ |
| admin `POST /api/students` | **201** ✓ |
| `mobile:"abc"` (admin) | **400** `Mobile must be 9-10 digits` ✓ |
| สมัครรหัส `short1!` | **400** `at least 12 characters` ✓ |
| user `GET /api/users` เห็นแค่ตัวเอง (1) / admin เห็นทั้งหมด (2) | ✓ |
| login ถี่ ~11 ครั้ง/นาที | ครั้งท้าย **429** (keys อยู่ใน Redis จริง) ✓ |
| รหัส admin ผิด 6 ครั้งติด | ครั้งที่ 6 `locked due to too many failed login attempts` ✓ |
| user ใหม่ login ก่อน verify | **403** `Please verify your email` ✓ |
| anon `POST /api/media` → 403 / admin อัปโหลด `.exe` → **400** `Invalid MIME type` ✓ |
| `tsc --noEmit`, `next build`, migration auto-apply | ผ่าน ✓ |
| test data (`Sec Student`, `sectest1`) ลบออกแล้ว | DB เหลือข้อมูลเดิม ✓ |

## 4. ปัญหาที่เจอ + วิธีแก้ (จำไว้ครั้งหน้า)

1. **Schema ขึ้นกับ env (`verify` เปิด/ปิดตาม `EMAIL_SMTP_USER`):** container มี Gmail creds (verify=true) แต่ host ไม่มี → migration รอบแรกขาดคอลัมน์ `_verified` → สมัคร user ได้ 500 `column users._verified does not exist`. แก้โดย generate migration ใหม่โดยตั้ง `EMAIL_SMTP_USER` หลอกบน host ให้ schema มี verify fields ถาวร (snapshot+code ไม่ drift อีก)
2. **`ValidationError` ของ Payload v3** รับ `{ errors: [{ path, message }] }` ไม่ใช่ `[{ field, message }]`; hook `afterForgotPassword` ไม่มี `req` ตรงๆ (อยู่ใน `args.req`) — `tsc` จับได้ก่อนรัน
3. **Upload ไม่มี `maxFileSize` option** ใน Payload v3 → บังคับ 5MB ผ่าน `beforeChange` ดู `req.file.size`
4. **Rate-limit ใน Edge middleware ใช้ ioredis ไม่ได้** → ทำเป็น Payload `beforeOperation` hook (Node runtime) แทน คุมได้ทั้ง REST+GraphQL
5. **Container เก่าโฟลเดอร์ Strapi ค้างชื่อ `69-s1-*`** → `docker stop+rm` ก่อน `up` (อย่ารันสองโฟลเดอร์พร้อมกัน)
6. **`npm run lint` พังเดิมจาก template** (eslintrc/next circular) ไม่เกี่ยวกับงานนี้ — ข้าม ใช้ `tsc` แทน
7. **rule ห้าม curl JSON inline ใน PowerShell** — เขียน body ลงไฟล์ใน `Temp\opencode` แล้ว `--data "@file"`; request เปลี่ยนข้อมูลยิงครั้งเดียว (กัน row ซ้ำ)

## 5. ความเสี่ยงคงเหลือ / งานต่อ

- `npm audit`: high `nodemailer ≤10.0.8` + `undici`, critical `vitest` (dev-only) — เป็น transitive ของ Payload ต้องรอ upstream; dependabot จะแจ้งเมื่อมีแพตช์
- Payload ไม่มี 2FA built-in — ชดเชยด้วย lockout + rate-limit + รหัสผ่านแข็ง
- `verify:true` ต้องมี SMTP จริง ไม่งั้น user ใหม่ login ไม่ได้ (admin verify มือใน admin panel ได้)
- `api.http` เดิมที่ใช้ user token กับ content จะได้ 403 — ต้องใช้ admin token (แก้ไฟล์แล้ว)
- Admin โดนล็อกจากเทส lockout จะปลดเองใน 10 นาที (session/token เดิมยังใช้ได้)
