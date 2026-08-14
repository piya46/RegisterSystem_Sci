# Secret Manager, KMS และ Runtime Secret Runbook

เอกสารนี้กำหนดวิธีนำ Secret ของ PSEvent ออกจาก `.env` ใน production, วิธี pin version, rotate, rollback, audit และควบคุมค่าใช้จ่าย โดยไม่บันทึกค่า Secret ลง Git, image, log หรือคำสั่งที่ค้างใน shell history

## 1. สถานะระบบปัจจุบัน

Backend รองรับ provider ต่อไปนี้แล้ว:

- `env`: สำหรับ local/dev เท่านั้น
- `google_secret_manager`: สำหรับ staging/production
- `file_for_test`: ใช้ได้เฉพาะ `NODE_ENV=test`

Runtime จะโหลด Secret ก่อน `require('./app')` เพื่อให้ OAuth, Brevo/SMTP fallback, LINE, JWT และโมดูลที่อ่าน `process.env` ตอนเริ่มโปรแกรมได้รับค่าที่โหลดแล้ว จากนั้นเก็บ cache ใน memory 5-15 นาทีและไม่เรียก Secret Manager ต่อ request

Production จะ fail-closed เมื่อ Secret สำคัญหาย, version ไม่ถูก pin, ค่าเป็น placeholder, signing secret สั้นเกินไป หรือมีการใช้ JWT/session/CSRF secret ซ้ำกัน

ข้อจำกัดที่ยังมีอยู่:

- ยังไม่มี hot reload endpoint; การเปลี่ยน Secret ใช้ rolling restart/canary deploy
- JWT key rotation แบบ dual-read/single-write ยังไม่เสร็จ จึงห้ามสลับ JWT secret ทันทีโดยไม่วางแผน invalidation
- Application guardrail เป็นตัวนับต่อ process ยังไม่ใช่ quota กลางข้ามหลาย instance
- การสร้าง Secret, IAM, Budget Alert และ Audit Log ใน Google Cloud ต้องดำเนินการใน environment จริง

## 2. Naming และ Environment Isolation

Google Secret Manager secret ID ใช้ `/` เป็น namespace ไม่ได้ ให้ใช้ชื่อจริงแบบ hyphen เช่น:

| Conceptual namespace | Google secret ID |
| --- | --- |
| `psevent/dev/JWT_SECRET` | `psevent-dev-JWT_SECRET` |
| `psevent/staging/JWT_SECRET` | `psevent-staging-JWT_SECRET` |
| `psevent/prod/JWT_SECRET` | `psevent-prod-JWT_SECRET` |

ต้องใช้ project หรือ service account แยกอย่างน้อยระหว่าง production กับ non-production และห้าม production workload อ่าน Secret ของ environment อื่น

## 3. Secret Inventory

Core production secrets:

- `MONGODB_URI`
- `JWT_SECRET`
- `SESSION_TOKEN_HASH_SECRET`
- `CSRF_SECRET`
- `VENDOR_QR_SECRET`
- `SLIP_PROOF_SECRET`
- `TURNSTILE_SECRET_KEY`

Secrets ตาม feature flag:

- Brevo email: `BREVO_API_KEY` เมื่อ `EMAIL_PROVIDER=brevo` และ `MOCK_EMAIL=false`
- SMTP fallback: `SMTP_USER`, `SMTP_PASS` เมื่อ `EMAIL_PROVIDER=smtp` และ `MOCK_EMAIL=false`
- LINE Login: `LINE_LOGIN_CHANNEL_SECRET`
- LINE webhook/messaging: `LINE_WEBHOOK_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`
- Field encryption: `DATA_BLIND_INDEX_SECRET`, `DATA_ENCRYPTION_KEYS` หรือ `KMS_WRAPPED_DATA_KEYS`; legacy `DATA_ENCRYPTION_KEY`/`FIELD_ENCRYPTION_KEY` รองรับระหว่าง migration โดยระบุ `FIELD_ENCRYPTION_SECRET_NAME`
- SQL runtime: `SQL_PASSWORD`, `SQL_MIRROR_IDENTITY_HASH_SECRET`
- SQL migration: `SQL_MIGRATION_PASSWORD` ซึ่งต้องเป็นคนละ account กับ runtime
- Google Drive: `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
- Local object storage fallback: `OBJECT_STORAGE_LOCAL_SIGNING_SECRET` เมื่อ production ใช้ `OBJECT_STORAGE_PROVIDER=local`; ต้องแยกจาก `JWT_SECRET`

`KMS_KEY_RESOURCE`, project ID, host, port, feature flag และ public client ID เป็น config ไม่ใช่ Secret แต่ต้องควบคุมการแก้ไขผ่าน deployment policy

`GCS_BUCKET`, `GCS_LOCATION`, `GCS_OBJECT_PREFIX` เป็น config ไม่ใช่ Secret และ production GCS ต้องใช้ ADC/Workload Identity ห้ามนำ service-account JSON key ไปเก็บใน Secret Manager หรือ `.env`

`ALLOW_LEGACY_CERTIFICATE_PARTICIPANT_ID` และ `CERTIFICATE_VERIFICATION_MIGRATION_WRITE` เป็น safety flags ไม่ใช่ Secret และต้องเป็น `false` ใน runtime ปกติ ส่วน opaque certificate ID ใช้ CSPRNG ต่อ participant จึงไม่ต้องเพิ่ม signing key/KMS/Secret Manager operation ต่อ request; ห้ามนำ certificate ID รายบุคคลขึ้น Secret Manager

## 4. Runtime Configuration

ตัวอย่าง production config ที่ไม่มี Secret payload:

```env
NODE_ENV=production
SECRET_PROVIDER=google_secret_manager
SECRET_MANAGER_ENABLED=true
SECRET_MANAGER_PROJECT_ID=cusa-reunion
SECRET_MANAGER_PREFIX=psevent/prod
SECRET_MANAGER_FAIL_CLOSED=true
SECRET_MANAGER_REQUIRE_PINNED_VERSIONS=true
SECRET_MANAGER_CACHE_TTL_MS=300000
SECRET_MANAGER_MAX_DAILY_ACCESS_OPS=200
SECRET_MANAGER_SECRET_IDS_JSON={}
SECRET_MANAGER_PINNED_VERSIONS_JSON={"MONGODB_URI":"4","JWT_SECRET":"7","SESSION_TOKEN_HASH_SECRET":"3","CSRF_SECRET":"2"}
```

หากชื่อ Secret ไม่เป็นไปตาม convention ให้กำหนด mapping โดยไม่ใส่ payload:

```env
SECRET_MANAGER_SECRET_IDS_JSON={"MONGODB_URI":"custom-prod-mongodb-uri"}
```

ค่าใน `SECRET_MANAGER_PINNED_VERSIONS_JSON` ใช้ได้ทั้งเลข version หรือ full resource `projects/.../secrets/.../versions/N` ห้ามใช้ `latest` สำหรับ production secrets สำคัญ

## 5. Promotion Procedure

1. สร้าง inventory และ owner ของ Secret ทุกตัว
2. สร้าง Secret container แยกตาม environment
3. เพิ่ม version ผ่าน stdin หรือไฟล์ชั่วคราวที่ permission จำกัด ห้ามส่ง payload เป็น command argument
4. ให้ workload service account มี `Secret Manager Secret Accessor` เฉพาะ Secret ที่ต้องอ่าน
5. ให้ migration service account อ่านเฉพาะ DB migration credential และไม่มีสิทธิ์ใช้งาน runtime app
6. บันทึกเลข version ลง deployment config
7. Deploy staging/canary และตรวจ `/health/ready`, startup audit และ login/payment smoke test
8. Promote version เดียวกันสู่ production canary
9. ลบ plaintext Secret ออกจาก `.env`, CI variable ที่ไม่จำเป็น และ image layer
10. Disable version เก่าหลัง observation window; destroy เมื่อผ่าน rollback window และได้รับอนุมัติ

ห้ามพิมพ์ Secret ใน output ของ CI, migration report, exception, audit detail หรือ support ticket

## 6. Rotation Policy

Brevo/SMTP fallback, LINE token และ integration secret:

1. สร้าง version ใหม่
2. ทดสอบ canary เช่น `BREVO_CANARY_WRITE=true npm --prefix backend run canary:brevo-email -- --send`
3. เปลี่ยน pinned version
4. rolling restart
5. ตรวจ functional test และ error rate
6. disable version เก่า แล้วจึง destroy ภายหลัง

Database password:

1. สร้าง DB user/password ชุดใหม่ ไม่แก้ password account ที่ active อยู่
2. ให้สิทธิ์เท่าที่จำเป็น
3. เพิ่ม Secret version และ deploy canary
4. สลับ traffic
5. revoke user เก่าหลัง connection เก่าหมด
6. disable/destroy Secret version เก่าตาม policy

JWT/session/CSRF/vendor QR/slip proof:

- ต้องกำหนด grace window หรือ forced logout/reissue policy ก่อน rotate
- JWT dual-key verification ยังเป็นงานคงค้าง ห้าม rotate แบบ immediate ในช่วง Event
- Vendor QR secret rotation ต้องรองรับ QR version เก่าจนกว่าจะพิมพ์ QR ใหม่ครบ

Encryption key:

- ใช้ KMS envelope encryption และ `rotate:field-encryption` workflow
- ต้อง dry-run, backup, re-encrypt เป็น batch และเก็บ key เก่าสำหรับ decrypt ระหว่าง migration
- ห้ามนำ plaintext data key ไปเก็บใน Secret Manager หากใช้ KMS wrapped-key mode

## 7. Rollback และ Break Glass

Rollback ปกติให้เปลี่ยน pinned version กลับไป version ที่ผ่านการทดสอบแล้วและ rolling restart ห้ามแก้เป็น `latest`

Break-glass fallback ไป env ทำได้เฉพาะ incident ที่ได้รับอนุมัติ โดยต้อง:

- ตั้ง `SECRET_MANAGER_FAIL_CLOSED=false` เฉพาะ deployment ชั่วคราว
- inject Secret ผ่าน platform secret mechanism ไม่สร้าง `.env` ถาวร
- จำกัดเวลา, ผู้อนุมัติ และ service account
- เปิด incident/audit record
- ยกเลิก fallback และ rotate Secret หลังเหตุการณ์

## 8. Cost และ Monitoring

- `SECRET_MANAGER_MAX_DAILY_ACCESS_OPS` จำกัด access ต่อ process; default 200
- Secret ถูกโหลดตอน boot/rotation เท่านั้น จึงไม่ควรเพิ่มตามจำนวน API requests
- ตั้ง Google Cloud Budget Alert ที่ 500, 800 และ 1,000 บาท
- Alert เมื่อ restart/access เพิ่มผิดปกติ, permission denied, version disabled หรือ checksum/validation fail
- จำกัด active versions ไม่เกิน 2-3 version ต่อ Secret หลัง rotation window
- ระบบหลาย instance ต้องรวม metric ที่ monitoring กลาง เพราะ in-memory guardrail ไม่ใช่ billing quota

## 9. Verification Checklist

- Production image และ Git history ที่ deploy ไม่มี Secret payload
- Workload อ่านได้เฉพาะ production Secret ที่ระบุ
- ทุก production Secret สำคัญ pin version
- Startup ล้มเมื่อ required Secret ขาดหรือใช้ placeholder
- `/health/ready` แสดง `secrets=up` โดยไม่เปิดชื่อ/value/version
- Audit `SECRET_PROVIDER_BOOT` มีเฉพาะ provider, secret names และเวลา
- API request ปกติไม่สร้าง Secret Manager access operation
- Rotation และ rollback ผ่าน staging โดยไม่ทำให้ wallet transaction ซ้ำหรือ session ข้าม policy
