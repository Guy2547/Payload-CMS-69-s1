# Headless CMS Architecture & Security Analysis: Payload CMS vs Strapi (RBAC & Security Focus)

เอกสารวิเคราะห์เปรียบเทียบเชิงสถาปัตยกรรม (Architecture) และมาตรฐานความปลอดภัย โดยเฉพาะหัวข้อ **Role-Based Access Control (RBAC)** ร่วมกับ **OWASP Top 10** และ **Field-Level Data Encryption** ระหว่าง **Payload CMS** และ **Strapi** เพื่อสนับสนุนเหตุผลในการเลือกใช้และสรุปการออกแบบระบบรักษาความปลอดภัยในโปรเจกต์นี้

---

## 1. บริบทและการทำงานร่วมกันของทั้งสองระบบ (Common Core)

ทั้ง Payload CMS และ Strapi มีพื้นฐานสถาปัตยกรรมหลักร่วมกันในฐานะ Modern Open-source Headless CMS:
- **Headless & API-First:** แยกชั้นการจัดการเนื้อหา (Backend CMS) ออกจากส่วนแสดงผล (Frontend) อย่างเด็ดขาด พร้อมให้บริการข้อมูลผ่าน REST API และ GraphQL ได้ทั้งคู่
- **Self-Hosted & Complete Control:** สามารถ Deploy และโฮสต์บน Infrastructure ภายในองค์กรได้ 100% ทำให้ครอบครองสิทธิ์ในการควบคุมความปลอดภัยและนโยบายความเป็นส่วนตัวของข้อมูลได้เต็มที่
- **Modern JavaScript/TypeScript Ecosystem:** พัฒนาด้วย Node.js/TypeScript และรองรับการเชื่อมต่อฐานข้อมูลระดับ Production เช่น PostgreSQL และ SQLite

---

## 2. การเปรียบเทียบเชิงสถาปัตยกรรม (Architecture Comparison Matrix)

| มิติการวิเคราะห์ | Payload CMS | Strapi |
| :--- | :--- | :--- |
| **ปรัชญาการออกแบบ (Philosophy)** | **Code-First:** โครงสร้าง Schema, Hook และ Access Control ทั้งหมดถูกกำหนดผ่าน TypeScript โค้ดคือแหล่งความจริงหนึ่งเดียว (Single Source of Truth) | **GUI-First / API-First:** ออกแบบ Schema และความสัมพันธ์ของข้อมูลผ่านหน้าต่าง Visual Builder บน Admin Panel |
| **การเชื่อมต่อกับ Next.js** | **Native Embed / In-App:** ทำงานร่วมกับ Next.js (App Router) ภายใน Repository และ Process เดียวกันได้โดยตรง | **Decoupled Standalone:** แยกตัวเป็นเซิร์ฟเวอร์อิสระ ติดต่อสื่อสารข้ามเครื่องผ่าน HTTP/Network เท่านั้น |
| **การดึงข้อมูล (Data Fetching)** | **Local API:** เรียกอ่าน/เขียน Database บน Server-side Component ได้โดยตรงโดยไม่มี Network Overhead | ส่งคำขอผ่าน REST API หรือ GraphQL เท่านั้น (มี Network Latency และความเสี่ยงบน Network layer ปกติ) |
| **ฐานข้อมูล & ORM (Database Layer)** | รองรับ PostgreSQL, SQLite และ MongoDB ผ่าน Database Adapter ด้วย **Drizzle ORM** | รองรับ PostgreSQL, MySQL, MariaDB, SQLite ผ่าน **Knex ORM** |
| **การจัดการสิทธิ์ (Access Control / RBAC)** | เขียนฟังก์ชันเงื่อนไขใน TypeScript ได้ยืดหยุ่น ลึกถึงระดับ Field, Row-level (`Where` query constraints) และป้องกัน Privilege Escalation ได้ในตัว | จัดการ Role & Permissions แบบมาตรฐานผ่านหน้า Admin UI (ความสามารถ Field-Level และ Custom Conditions ต้องใช้รุ่น Enterprise หรือเขียนโค้ด Controller ครอบ) |

---

## 3. การวิเคราะห์เชิงลึกด้านความปลอดภัย & การควบคุมสิทธิ์ (Security & RBAC Analysis)

เมื่อนำสถาปัตยกรรมของทั้งสองระบบมาประเมินร่วมกับนโยบาย **OWASP Top 10:2025** โดยเฉพาะ **A01: Broken Access Control** และ **A04: Cryptographic Failures** พบประเด็นสำคัญดังนี้:

### 3.1 การควบคุมสิทธิ์ตามบทบาท (Role-Based Access Control - RBAC)
* **Payload CMS (Code-First Granular RBAC):**
  - **Collection & Row-Level Security:** ฟังก์ชัน `access` ใน Payload สามารถคืนค่าเป็นออบเจกต์เงื่อนไข SQL `Where` ได้โดยตรง เช่น ผู้จัดการแผนก (Manager) จะมองเห็นเฉพาะข้อมูลพนักงานในแผนกตนเอง (`{ department: { equals: user.department } }`) โดยระบบ Drizzle ORM จะแทรกเงื่อนไขลงใน SQL Query ให้อัตโนมัติ ป้องกันช่องโหว่ IDOR อย่างสมบูรณ์
  - **Field-Level Access Control:** รองรับการคุมสิทธิ์รายฟิลด์อย่างอิสระ เช่น ฟิลด์ `salary` และ `cardId` ถูกจำกัดให้เฉพาะ Admin, HR หรือเจ้าของข้อมูล (Self-service ABAC) เท่านั้นที่จะอ่านได้ หากเป็นบทบาทอื่น Payload จะตัดฟิลด์นี้ออกจาก JSON response ทันที
  - **Privilege Escalation Mitigation (Mass Assignment):** สามารถล็อกฟิลด์ `role` ในคอลเลกชัน `users` ให้เขียนได้เฉพาะ Admin เท่านั้น (`access: { create: isAdmin, update: isAdmin }`) ทำให้แม้ผู้ไม่หวังดีจะยิง API สมัครสมาชิกพร้อมแนบ `role: "admin"` ข้อมูลดังกล่าวจะถูกปฏิเสธและบังคับใช้ค่าเริ่มต้น (`employee`) ทันที
* **Strapi (GUI-First Limitations):**
  - ใน Strapi Community Edition ระบบ Role & Permissions รองรับการเปิด/ปิดสิทธิ์เฉพาะในระดับ Endpoint/Action (CRUD) ของ Content-Type เท่านั้น
  - การทำ Granular RBAC ระดับ Field หรือ Row-Level Filtering (เช่น ให้ดูได้เฉพาะแผนกของตนเอง) เป็นฟีเจอร์ของ **Strapi Enterprise Edition** (มีค่าลิขสิทธิ์) หรือนักพัฒนาต้องเขียน Custom Policy / Route Controller มาดักจับเองทั้งหมด ซึ่งเสี่ยงต่อการเกิดข้อผิดพลาดในการตรวจสอบสิทธิ์ (Broken Access Control)

### 3.2 การประสานระหว่าง RBAC และ Field-Level Encryption (AES-256-GCM)
* **Payload CMS (Unified Lifecycle Hooks):**
  - ในสถาปัตยกรรมนี้ ข้อมูลอ่อนไหว (PII) เช่น บัตรประชาชน และเงินเดือน จะถูกเข้ารหัสแบบ **AES-256-GCM** ที่ระดับฐานข้อมูล (Data-at-Rest) เสมอผ่าน hook `beforeChange`
  - เมื่อมีการดึงข้อมูล hook `afterRead` จะทำการถอดรหัสในหน่วยความจำ และผ่านการประเมินสิทธิ์ระดับฟิลด์ของ RBAC อีกชั้นหนึ่ง ทำให้ระบบมีความปลอดภัยแบบ Defense-in-Depth สองชั้นอย่างแท้จริง
* **Strapi:**
  - การเชื่อมโยงระหว่างการเข้ารหัสระดับฟิลด์และระบบ Permissions ของ Strapi มักเกิดความไม่สอดคล้องกัน เนื่องจาก Sanitizer ของ Strapi ทำงานแยกส่วนกับ Lifecycle Hooks ทำให้ข้อมูลอาจหลุดหรือถูก serialize ออกไปก่อนการตรวจสอบสิทธิ์

### 3.3 CI/CD, Automated Testing & Schema Integrity
* **Payload CMS:**
  - นโยบาย Access Control และโครงสร้าง Role ทั้งหมดถูกเขียนเป็น TypeScript Code 100% ทำให้สามารถเขียน Automated Test (เช่น Vitest / Playwright) ทดสอบสิทธิ์ของแต่ละ Role ได้ในระดับ Unit/Integration Test บน CI/CD Pipeline ทุกครั้งที่มีการ commit โค้ด
* **Strapi:**
  - สิทธิ์ของ Role ถูกบันทึกลงใน Database ตาราง `up_permissions` ทำให้ยากต่อการทำ Code Review, การติดตาม Git Diff หรือการทดสอบ Automated Test ใน CI/CD

---

## 4. ตารางเปรียบเทียบฟังก์ชัน RBAC & มาตรการความปลอดภัย

| เกณฑ์การประเมินสิทธิ์ (RBAC Capability) | Payload CMS v3 (Code-First) | Strapi v4 Community (GUI) |
| :--- | :---: | :---: |
| **Role-Based Access Control พื้นฐาน (Admin, User, etc.)** | ✅ (สร้างกี่ Role ก็ได้ในโค้ด) | ✅ (สร้างผ่าน Admin UI) |
| **Field-Level Access Control ฟรีในตัว (ไม่ต้องซื้อ Enterprise)** | ✅ (ฟรีใน Core Open-source) | ❌ (จำกัดเฉพาะ Enterprise) |
| **Row-Level Security / Dynamic Query Scoping (`Where`)** | ✅ (Native คืนค่า Where object) | ❌ (ต้องเขียน Controller เอง) |
| **การป้องกัน Privilege Escalation บนฟิลด์ Role** | ✅ (Field Access บล็อกอัตโนมัติ) | ⚠️ (ต้องเขียน Policy ดัก) |
| **การทดสอบสิทธิ์อัตโนมัติ (Automated RBAC Testing)** | ✅ (รองรับ Vitest / Jest สมบูรณ์) | ❌ (ทดสอบได้ยากเนื่องจากอยู่ใน DB) |
| **การผสานงานกับ Field-Level Encryption (AES-256-GCM)** | ✅ (Seamless ผ่าน Lifecycle Hooks) | ⚠️ (ซับซ้อนและมี Boilerplate สูง) |

---

## 5. ข้อสรุปและเกณฑ์การเลือกใช้งาน (Decision Framework)

**สรุปภาพรวม:** ในการพัฒนาระบบที่มีข้อมูลความลับระดับสูง (HR, เงินเดือน, PII) และต้องปฏิบัติตามมาตรฐาน **OWASP Top 10 (A01: Broken Access Control)** การเลือกใช้ **Payload CMS** มอบข้อได้เปรียบอย่างเด็ดขาดด้วยระบบ **Code-First RBAC**:
1. สามารถควบคุมสิทธิ์ได้ละเอียดถึงระดับฟิลด์ (Field-Level) และระดับแถว (Row-Level) โดยไม่มีค่าใช้จ่ายลิขสิทธิ์เพิ่มเติม
2. ป้องกันปัญหา Privilege Escalation ได้อย่างเบ็ดเสร็จทั้งในระดับ Access Check และ Lifecycle Hook
3. โค้ดสิทธิ์ทั้งหมดอยู่บน Version Control (Git) ตรวจสอบและทดสอบแบบ Automated ได้ 100%
