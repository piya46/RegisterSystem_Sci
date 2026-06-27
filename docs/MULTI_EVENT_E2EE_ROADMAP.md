# Multi-Event, Role Hierarchy, and True E2EE Roadmap

เอกสารนี้แยกงานสถาปัตยกรรมใหญ่จาก patch ความปลอดภัยระยะสั้น เพื่อให้ระบบเดิมยังใช้งานได้ระหว่างย้ายไปเป็น platform หลายกิจกรรม

## 1. Multi-Event Core

เพิ่ม entity หลัก 3 ชั้น:

- `Organization`: เจ้าของระบบหรือหน่วยงาน
- `EventSeries`: กิจกรรมที่จัดต่อเนื่อง เช่น งานคืนสู่เหย้า
- `Event`: รอบกิจกรรมจริง เช่น CUSA Alumni 2026, CUSA Alumni 2027

ข้อมูล domain ใหม่ควรอ้าง `eventId` เป็นหลัก และคง `eventYear` ไว้เป็น compatibility field ช่วง migration

ตาราง/collection ที่ต้องเพิ่ม `eventId`:

- participants
- donations
- packages
- prizes
- participant fields
- registration points
- system settings
- cron/report logs
- audit logs

## 2. Event Linking

ให้แต่ละ event ตั้งค่าได้ว่าเชื่อมข้อมูลเก่าหรือไม่:

- `isolated`: เห็นเฉพาะ event ปัจจุบัน
- `series-linked`: เชื่อมข้ามปีใน series เดียวกัน
- `manual-linked`: admin เลือก event ที่ต้องการเชื่อมเอง

ตัวอย่างการใช้งาน:

- ดูประวัติผู้เข้าร่วมข้ามปี
- ตรวจผู้สนับสนุนซ้ำหลายปี
- ทำรายงานรวมทั้ง series หรือแยกปี
- คัดลอก layout/field/package จาก event ปีก่อน

## 3. Layout Builder

แยกการตั้งค่า layout ออกจาก code:

- `RegistrationFormLayout`: field order, section, visibility rule, required rule
- `DashboardLayout`: widget order, chart visibility, public/private mode
- `TicketLayout`: logo, QR position, text block, theme
- `ReportLayout`: columns, grouping, filters, export template

ควรเก็บ version ของ layout ทุกครั้ง เพื่อให้รายงานปีเก่ายัง render ตามรูปแบบเก่าได้

## 4. Role Hierarchy

เพิ่ม role แบบแตกแขนง:

- `superadmin`: ดูแล infrastructure, organization, global config, encryption policy
- `org_admin`: ดูแลทุก event ใน organization
- `event_admin`: ดูแลเฉพาะ event ที่ได้รับสิทธิ์
- `event_manager`: จัดการ registration, packages, prizes, reports เฉพาะ event
- `staff`: ลงทะเบียน/เช็คอินตามจุดที่ได้รับมอบหมาย
- `kiosk`: scoped token สำหรับเครื่องหรือจุดลงทะเบียน
- `auditor`: อ่าน audit/report ได้แต่แก้ข้อมูลไม่ได้

สิทธิ์ควรใช้ permission matrix เช่น `event:read`, `event:update`, `participant:export`, `encryption:rotate`, `infra:manage`

## 5. Superadmin Boundary

Superadmin ควรแยกจาก Admin งานกิจกรรม:

- ไม่ควรใช้หน้า admin เดิมเป็นที่ตั้งค่า infra
- ควรมี `/superadmin` หรือ console แยก
- action สำคัญต้องใช้ MFA/OTP
- action ด้าน encryption, deploy config, CORS, domain, key rotation ต้อง audit แบบ strict

## 6. True E2EE Target Architecture

สถานะปัจจุบันเป็น server-side field encryption: backend ยัง decrypt ได้เมื่อทำ report/export/email/dashboard

ถ้าต้องการ E2EE แท้:

- private data encryption key ต้องอยู่ฝั่ง client/admin device เท่านั้น
- backend เก็บเฉพาะ ciphertext, blind index, metadata
- report/export/PDF ต้อง decrypt และ render ฝั่ง client หลัง admin unlock key
- server-side LINE/email ที่ต้องใช้ plaintext ต้องเปลี่ยน flow หรือส่งเฉพาะข้อมูลไม่อ่อนไหว
- key rotation ต้องมี client-side re-encrypt workflow
- recovery key ต้องใช้ envelope encryption แยกตาม organization/event

ช่วง migration ให้เปิด `E2EE_STRICT_MODE=true` เฉพาะ environment ที่พร้อม เพราะ endpoint ที่ต้อง decrypt ฝั่ง server จะ fail-closed ตามเจตนา

## 7. Recommended Migration Order

1. ปิดช่องโหว่ security ปัจจุบันให้เสถียรก่อน
2. เพิ่ม `Organization`, `EventSeries`, `Event` โดยยัง map `eventYear` เดิมได้
3. เพิ่ม permission matrix และ `superadmin`
4. ย้าย query ทุก endpoint จาก `eventYear` ไป `eventId`
5. เพิ่ม layout versioning
6. เพิ่ม client-side decrypt/export proof of concept
7. เปิด true E2EE เฉพาะ event ใหม่ก่อน แล้วค่อย migrate event เก่า
