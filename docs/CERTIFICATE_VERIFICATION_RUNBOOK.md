# Certificate Verification Security and Migration Runbook

เอกสารนี้กำหนดวิธีออก ตรวจสอบ migrate และรับมือเหตุการณ์ของ E-Certificate โดยไม่เปิดเผย MongoDB `participantId` และไม่ทำให้ token หลุดลง URL log, audit, analytics หรือ Referrer

## 1. สถานะปัจจุบัน

ระบบรองรับแล้ว:

- opaque verification ID รูปแบบ `cert_<base64url>` จาก CSPRNG 32 bytes หรือ 256 bits
- sparse unique index ชื่อ `uq_participant_certificate_verification_id`
- field เป็น `select:false` เพื่อลดการหลุดจาก query/export ทั่วไป
- public verify/payload ผ่าน POST body และ `Cache-Control: no-store`
- QR/deep link ใช้ URL fragment ซึ่งไม่ถูกส่งไป origin ตอนเปิดหน้า
- frontend อ่าน token, เก็บเฉพาะ `sessionStorage` ใน tab นั้น แล้วล้าง fragment/path เดิม
- valid, revoked, invalid และ not-eligible response code แยกชัดเจน
- raw ObjectId ถูก reject เมื่อ legacy flag ปิด
- URL sanitizer สำหรับ request/audit log
- Guest Wallet ไม่ได้รับ participant payload หรือ certificate ID

ผล dry-run วันที่ 17 กรกฎาคม 2026:

```text
scanned=985
missing=985
malformed=0
duplicate=0
candidates=985
migrated=0
```

ผลนี้เป็นการอ่านอย่างเดียว ยังไม่ได้เขียนข้อมูลเดิม

## 2. Data Contract

Participant มี metadata ต่อไปนี้:

- `certificateVerificationId`: opaque bearer identifier, random 256 bits, unique, `select:false`
- `certificateVerificationIssuedAt`: เวลาที่ออกหรือ rotate ID, `select:false`
- `isRevoked`: สถานะเพิกถอนเอกสาร
- `status`: ต้องผ่าน policy ปัจจุบันคือ `checkedIn`
- `eventId.config.enabledFeatures.certificate`: ถ้าเป็น `false` ต้องออก/ดาวน์โหลด/verify ไม่ได้

ห้าม mirror `certificateVerificationId` ไป MariaDB reporting table, Firestore payment mirror, CSV export, log หรือ analytics เนื่องจากไม่จำเป็นต่อรายงานและเป็น bearer credential สำหรับข้อมูล public certificate

## 3. API Contract

### Verify

`POST /api/public/certificates/verify`

Request:

```json
{
  "verificationId": "cert_<opaque-value>"
}
```

Valid response ต้องมี `status=valid` และคืนเฉพาะชื่อ, Event, ticket reference และ check-in time ที่จำเป็นต่อการตรวจเอกสาร

Error response ใช้ code ต่อไปนี้:

- `CERTIFICATE_NOT_FOUND`: token ผิดรูปแบบ, ไม่มีข้อมูล หรือ participant ถูกลบ
- `CERTIFICATE_REVOKED`: เอกสารถูกเพิกถอน
- `CERTIFICATE_NOT_ELIGIBLE`: ยังไม่ผ่านเงื่อนไขออกเอกสาร
- `CERTIFICATE_DISABLED`: Event ปิด certificate feature

### PDF Payload

`POST /api/public/certificates/payload`

คืน minimum payload สำหรับ client-side PDF และ opaque ID เดิมเพื่อสร้าง verification QR ห้ามคืน participant object เต็ม, secure index, email, phone, address, LINE ID หรือ session data

### Compatibility GET

`GET /api/public/verify/:verificationId` และ `GET /api/public/certificate/:verificationId` มีไว้สำหรับช่วงเปลี่ยนผ่าน แต่รับเฉพาะ opaque ID ตามค่าเริ่มต้น

`ALLOW_LEGACY_CERTIFICATE_PARTICIPANT_ID=true` เป็น break-glass flag ชั่วคราวเท่านั้น ห้ามเปิดเป็นค่าปกติใน production และต้องกำหนด owner, expiry time และ incident/audit record ทุกครั้งที่เปิด

## 4. User Flow

1. Participant login ผ่าน Email, LINE หรือ LIFF
2. Wallet API ตรวจ session และโหลด participant เฉพาะ owner request
3. เมื่อ checked-in, certificate feature เปิด และไม่ revoked ระบบคืน opaque ID
4. Wallet สร้าง QR เป็น `/verify#<opaque-id>`
5. หน้า verify อ่าน fragment แล้ว replace URL เป็น `/verify`
6. หน้า verify ส่ง opaque ID ใน POST body
7. Backend ตรวจ token, eligibility, revocation และ Event policy
8. Backend audit เฉพาะ participant internal ID, Event, purpose, fields และผลลัพธ์ โดยไม่เก็บ opaque token
9. ใน LIFF ปุ่ม download เปิด `/certificate/download#<opaque-id>` ใน external browser

Guest Wallet request ต้องข้าม participant populate ทั้งหมดและไม่มีสิทธิ์รับ certificate link แม้ wallet หลักมี certificate แล้ว

## 5. Migration Procedure

### Preflight

1. ยืนยัน backup/restore point ของ MongoDB และผู้รับผิดชอบ rollback
2. ตรวจว่า application version ใหม่ deploy ได้และ raw ObjectId ถูกปิด
3. ตรวจ current index และ duplicate index warning
4. หยุดงาน bulk participant import ระหว่าง apply
5. หากเปิด SQL outbox ให้ประเมิน queue; certificate field ไม่ถูก mirror จึงไม่ต้องสร้าง SQL row ใหม่
6. รัน dry-run จาก environment เดียวกับ production โดยไม่แสดง connection string

```bash
cd backend
npm run migrate:certificate-verification
```

Dry-run ต้องรายงานเฉพาะ count และต้องไม่มี token ใน stdout/stderr

### Apply

ใช้ maintenance window และเปิด write gate เฉพาะ process migration:

```bash
CERTIFICATE_VERIFICATION_MIGRATION_WRITE=true \
  npm run migrate:certificate-verification -- --apply
```

ห้ามบันทึก write flag เป็นค่าถาวรใน production `.env` และห้ามเปิด legacy participant ID พร้อมกันโดยไม่มีเหตุผลที่อนุมัติ

### Postflight

1. รัน dry-run ซ้ำ ต้องได้ `candidates=0`
2. ตรวจ unique index ชื่อ `uq_participant_certificate_verification_id`
3. สุ่ม checked-in participant ผ่าน owner Wallet แล้ว verify QR
4. ทดสอบ raw ObjectId ต้องได้ 404
5. ทดสอบ revoked document ต้องแสดง revoked ไม่ใช่ valid
6. ตรวจ application/audit/proxy log ว่าไม่มี `cert_` token
7. ตรวจ Guest Wallet response ว่าไม่มี `participant` และ `certificateVerificationId`
8. ยืนยัน `ALLOW_LEGACY_CERTIFICATE_PARTICIPANT_ID=false`

## 6. Rollback

หาก application ใหม่มีปัญหา:

- rollback application ได้โดยคง opaque fields/index ไว้ เพราะเป็น additive schema
- ห้าม unset opaque ID ที่ออกแล้ว เนื่องจากจะทำให้ QR ที่สร้างไปแล้วเสียและเพิ่มความเสี่ยง reuse
- เปิด legacy flag ได้เฉพาะ break-glass window ที่มี WAF/rate limit, audit และเวลาปิดชัดเจน
- หลังแก้ไขให้ deploy รุ่นใหม่, ปิด flag และ rerun postflight

หาก migration หยุดกลางทาง สามารถรันซ้ำได้ เพราะ update ใช้ current-value filter และสร้าง ID เฉพาะ missing/malformed/duplicate record

## 7. Incident Response

เมื่อ opaque ID รั่ว:

1. ประเมินว่าเป็น certificate สาธารณะหนึ่งรายการหรือเป็น bulk disclosure
2. เพิกถอน certificate ทันทีถ้าข้อมูลไม่ควรถูกเปิดเผย
3. หากยังต้องให้ certificate ใช้งาน ให้ rotate ID ด้วย operation ที่มี admin authorization และ audit แล้วออก PDF/QR ใหม่
4. ตรวจ access log โดยใช้ participant/Event/time metadata ห้ามค้นหรือส่งต่อ token เต็มใน ticket
5. ตรวจต้นเหตุจาก Referrer, analytics, screenshot, chat forwarding, support log หรือ proxy body logging
6. ปิด compatibility GET/legacy flag หากเกี่ยวข้อง
7. แจ้งเจ้าของข้อมูลตาม privacy/incident policy เมื่อเข้าเกณฑ์

ระบบยังไม่มี self-service/admin UI สำหรับ rotate ID รายรายการ การ rotate ใน production ต้องเป็น approved maintenance operation จนกว่า endpoint ที่ event-scoped และ step-up protected จะถูกพัฒนา

## 8. Monitoring and Cost

Metrics ที่ควรเก็บ:

- verify success/revoked/invalid count แยกตาม Event โดยไม่ติด token
- invalid rate ต่อ IP/WAF fingerprint
- migration candidates/migrated/failure count
- certificate payload latency และ error rate
- audit write failure

Opaque ID ใช้ MongoDB document และ index เพิ่มเพียงหลักสิบถึงหลักร้อย bytes ต่อ participant ไม่มี KMS, Secret Manager, Firestore หรือ GCS operation ต่อ verification request จึงไม่เพิ่ม Google Cloud variable cost ใน flow นี้ ส่วน PDF ยังคง generate ฝั่ง client เพื่อลด server compute และ GCS egress

## 9. Acceptance Gate

- automated tests ผ่านสำหรับ entropy, malformed/raw ID rejection, event policy, revoked state, log redaction และ Guest privacy
- frontend lint/build ผ่าน
- migration dry-run และ postflight ผ่าน
- valid/revoked/invalid UI ผ่านทั้ง mobile, desktop, LIFF external browser
- no-store และ no-referrer header/meta ถูกตรวจบน staging
- WAF/rate limit และ alert invalid spike พร้อมใช้งาน
- backup/restore และ rollback owner ถูกบันทึก
- production legacy flag ปิด
