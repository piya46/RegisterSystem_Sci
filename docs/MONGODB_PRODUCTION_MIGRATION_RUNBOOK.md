# MongoDB Production Security Migration Runbook

เอกสารนี้เป็นขั้นตอนเปลี่ยนข้อมูล MongoDB เดิมให้ตรงกับ Phase 1 security
contract โดย MongoDB ยังคงเป็น primary source of truth หลัง migration
MariaDB เป็นเพียง optional reporting mirror และห้ามปิด/ลบ MongoDB

## 1. Current Read-Only Audit

ผลตรวจแบบ dry-run วันที่ 2026-07-26 โดยทุกสคริปต์เชื่อมด้วย
`autoIndex=false` และไม่มีการเขียน audit/index/document:

| รายการ | ผลตรวจ |
|---|---:|
| Participant ทั้งหมด | 986 |
| Participant ที่ต้อง security backfill | 986 |
| Participant plaintext sensitive/quasi-identifier values | 7,324 |
| Participant plaintext special assistance | 64 |
| Participant ที่ขาด eventYear | 1 |
| Participant ที่ขาด blind index | 985 |
| Participant ที่ขาด secure search index | 985 |
| Donation ที่ต้อง security backfill | 108 |
| Donation plaintext sensitive values | 223 |
| Legacy/global registration points | 4 |
| Legacy/global participant fields | 8 |
| Conflict หากย้ายสองกลุ่มข้างต้นเข้า current event | 0 |
| Participant ที่ต้อง backfill registered point | 986 |
| Participant ที่ match registration point ได้ใน dry-run | 194 |
| Participant ที่ขาด certificate verification ID | 986 |
| Wallet ที่ต้องสร้าง | 902 |
| Guest token plaintext | 0 |
| Admin session token plaintext | 0 |
| Participant plaintext indexes | 6 |
| Stale guest-token plaintext index | 1 |
| TTL indexes ที่ต้อง reconfigure | 4 |
| Scope indexes ที่ต้อง explicit replacement | 2 |
| Secure identity indexes ที่ต้องสร้าง | 3 |
| Legacy object candidates ที่พบใน checkout | 0 |

ระหว่าง dry-run จำนวน Participant เพิ่มจาก 985 เป็น 986 และ record ใหม่ขาด
`eventYear` แสดงว่ายังมี writer ทำงานอยู่ ผลข้างต้นจึงเป็น snapshot ล่าสุด
ไม่ใช่ frozen migration baseline

ฟิลด์ `dept`, `department` และ `date_year` จัดเป็น quasi-identifiers:
ต้องเข้ารหัส AES-256-GCM ก่อนบันทึก และ dashboard ต้อง aggregate หลัง
authorized decrypt พร้อม metadata-only audit ห้ามใช้ plaintext field index

สถานะปัจจุบันคือ **BLOCKED สำหรับ production data migration** เพราะยังไม่มี
หลักฐาน Atlas snapshot/restore drill และ active production key pins

## 2. Hard Gates

ห้ามใช้ `--apply` จนกว่าจะผ่านทุกข้อ:

1. ประกาศ maintenance window และหยุด public write/background worker
2. สร้าง Atlas snapshot/PITR restore point และบันทึก cluster, timestamp,
   snapshot ID, document/index counts และ operator
3. Restore snapshot ไป isolated cluster แล้วตรวจ login, participant,
   donation, wallet และ index count สำเร็จจริง
4. Pin `MONGODB_URI`, `DATA_ENCRYPTION_KEY` หรือ KMS-wrapped key ring,
   `DATA_BLIND_INDEX_SECRET`, `SESSION_TOKEN_HASH_SECRET` เป็น numeric
   Secret Manager versions ของ environment เดียวกัน
5. ยืนยัน `DATA_ENCRYPTION_KEY_ID` อยู่ใน key ring และเก็บ old key ไว้สำหรับ
   decrypt/rollback ห้าม rotate และ backfillพร้อมกัน
6. เลือกชัดเจนว่า registration points 4 รายการและ participant fields
   8 รายการเป็น `global` หรือ `current-event`
7. เก็บ output dry-run ก่อน apply และให้ผู้อนุมัติเทียบกับตารางด้านบน
8. ใช้ migration identity แยกจาก runtime และให้สิทธิ์เฉพาะช่วง maintenance

## 3. Pre-Migration Dry Run

รันจาก clean checkout ของ commit ที่ CI ผ่าน ด้วย Node.js
`>=22.22.0 <23`:

```bash
cd backend
npm ci
npm run migrate:legacy-events
npm run backfill:privacy-year
npm run migrate:registration-points
npm run migrate:participant-fields
npm run migrate:participant-points
npm run migrate:certificate-verification
npm run migrate:wallets
npm run migrate:guest-tokens
npm run migrate:admin-session-tokens
npm run migrate:mongo-indexes
npm run cleanup:mongo-plaintext-indexes
npm run audit:mongo-security
```

Dry-run ต้องไม่เปลี่ยน `updatedAt`, audit log, index หรือ document count
หากผลต่างจาก baseline อย่างมีนัยสำคัญให้หยุดและตรวจ write traffic ก่อน

## 4. Approved Apply Order

ใช้ค่าจริงจาก Secret Manager/KMS ใน process memory เท่านั้น ห้ามใส่ค่า key,
Mongo URI หรือ token ใน command history ตัวอย่างด้านล่างแสดงเฉพาะ non-secret
write gates

ก่อนเริ่ม apply ให้ตั้ง evidence references จาก change record ของรอบนั้น
(ไม่ใช่ Secret และห้ามใช้คำว่า `pending`, `example` หรือ placeholder):

```bash
export MONGO_MIGRATION_MAINTENANCE_CONFIRMED=true
export MONGO_MIGRATION_BACKUP_REFERENCE=atlas-snapshot-<approved-id>
export MONGO_MIGRATION_RESTORE_DRILL_REFERENCE=restore-drill-<approved-id>
```

ทุก Mongo apply จะปฏิเสธการทำงานหากขาดค่าใดค่าหนึ่ง ให้ `unset` ทั้งสามค่า
หลังจบ maintenance

### 4.1 Event references และ privacy

```bash
LEGACY_EVENT_MIGRATION_WRITE=true \
npm run migrate:legacy-events -- --apply

PRIVACY_YEAR_BACKFILL_WRITE=true \
npm run backfill:privacy-year -- --apply
```

หลัง privacy apply ต้องรัน dry-run ซ้ำทันที และต้องได้:

- `plaintextSensitiveValues=0`
- `plaintextSpecialAssistance=0`
- `missingBlindIndexValues=0`
- `missingSearchIndex=0`
- donation plaintext sensitive values `0`

หากไม่เป็นศูนย์ ห้ามลบ plaintext index และห้ามเปิด traffic

### 4.2 Scope decision และ index replacement

เลือกค่าเดียวกันกับ change record: `global` หรือ `current-event`

```bash
REG_POINT_SCOPE_WRITE=true \
REG_POINT_LEGACY_SCOPE_DECISION=global \
REG_POINT_DROP_NAME_INDEX=true \
npm run migrate:registration-points -- --apply

PARTICIPANT_FIELD_SCOPE_WRITE=true \
PARTICIPANT_FIELD_LEGACY_SCOPE_DECISION=global \
PARTICIPANT_FIELD_DROP_NAME_INDEX=true \
npm run migrate:participant-fields -- --apply
```

หากเลือก `current-event` ให้เปลี่ยนค่าทั้งสองเป็น `current-event`
สคริปต์จะหยุดเมื่อพบ name conflict หรือไม่ได้ระบุ decision

### 4.3 Additive backfills

```bash
PARTICIPANT_POINT_MIGRATION_WRITE=true \
npm run migrate:participant-points -- --apply

CERTIFICATE_VERIFICATION_MIGRATION_WRITE=true \
npm run migrate:certificate-verification -- --apply

WALLET_MIGRATION_WRITE=true \
WALLET_MIGRATION_BATCH_SIZE=100 \
npm run migrate:wallets -- --apply
```

Guest/admin token migrationต้อง apply เฉพาะเมื่อ dry-run พบ plaintext:

```bash
GUEST_TOKEN_MIGRATION_WRITE=true \
GUEST_TOKEN_UNSET_PLAINTEXT=true \
npm run migrate:guest-tokens -- --apply

ADMIN_SESSION_TOKEN_MIGRATION_WRITE=true \
ADMIN_SESSION_UNSET_PLAINTEXT=true \
npm run migrate:admin-session-tokens -- --apply
```

### 4.4 Required indexes และ TTL

หลัง scope replacement สำเร็จ:

```bash
MONGO_INDEX_MIGRATION_WRITE=true \
npm run migrate:mongo-indexes -- --apply
```

สคริปต์ generic:

- สร้างเฉพาะ index ที่ขาด
- ใช้ `collMod` ปรับ TTL เป็น `expireAfterSeconds=0`
- หยุดเมื่อยังมี index ที่ต้อง explicit replacement
- ไม่ลบ stale index โดยอัตโนมัติ

### 4.5 Remove legacy plaintext indexes

ทำหลัง privacy/token recheck เป็นศูนย์เท่านั้น:

```bash
MONGO_LEGACY_INDEX_CLEANUP_WRITE=true \
CONFIRM_MONGO_LEGACY_INDEX_CLEANUP=drop-legacy-plaintext-indexes \
npm run cleanup:mongo-plaintext-indexes -- --apply
```

สคริปต์ลบเฉพาะ ascending single-field index ของ sensitive
`participant.fields.*` และ legacy `token` index ที่ตรวจพบจริง ไม่ลบ compound,
blind-index หรือ index นอก allowlist

## 5. Verification And Reconciliation

รัน dry-run ทั้งชุดในหัวข้อ 3 ซ้ำ แล้วบันทึก JSON output ต้องได้:

1. privacy/token plaintext และ missing secure index เป็นศูนย์
2. certificate ID/wallet/registered-point candidate เป็นศูนย์
3. `migrate:mongo-indexes` มี create/reconfigure/replacement เป็นศูนย์
4. `cleanup:mongo-plaintext-indexes` ไม่มี candidate
5. `audit:mongo-security` คืน `healthy=true` และ findings ทุกค่าเป็นศูนย์
6. TTL จริงของ OAuth state, participant auth challenge, participant session
   และ registration reuse challenge เป็น `expireAfterSeconds=0`
7. document count ต่อ collection ก่อน/หลังตรงตาม expected additive count
8. สุ่ม decrypt participant/donation ผ่าน authorized service account และ
   ตรวจ ciphertext ไม่มี plaintext copy
9. ทดสอบ login/OTP/logout, registration, dashboard category, public aggregate,
   check-in, prize, wallet/guest link และ certificate
10. เปิด traffic แบบจำกัดก่อน แล้วเฝ้า decrypt error, auth error, latency,
   Mongo connection และ 5xx

## 6. Rollback

- หากยังไม่เปิด traffic ให้ restore Atlas snapshot ไป cluster ใหม่และสลับ
  connection pin หลัง verification ห้ามแก้ ciphertext ด้วย bulk string update
- ห้ามลบ old encryption key จน retention/rollback window จบ
- Index cleanup ย้อนกลับได้ด้วย reviewed `createIndex`; ห้ามพยายามกู้ index
  จากชื่ออย่างเดียวโดยไม่ใช้ key/options ที่บันทึกไว้
- Wallet/certificate backfill เป็น additive; rollback ต้องอ้าง snapshot และ
  reconciliation report ไม่ใช้ `deleteMany` แบบเดาเงื่อนไข
- บันทึก incident, failed step, last successful checkpoint, snapshot ID,
  release SHA, operator และผลกระทบ

## 7. MariaDB Boundary

ขั้นตอนนี้ไม่ใช่ source-of-truth cutover:

- `SQL_PRIMARY_STORE=false`
- `SQL_ENABLED=false` จนกว่า Plesk จะมี TLS capability, CA/SAN,
  reserved Cloud NAT `/32` allowlist, encrypted storage/backup และ restore drill
- SQL backfill ที่อนุมัติในอนาคตคัดลอกเฉพาะ PII-minimized reporting mirror
- ห้ามปิด Atlas/MongoDB หลัง SQL mirror สำเร็จ เพราะ CRUD repositories,
  transaction ownership และ rollback contract ยังใช้ MongoDB

การปิด MongoDB ต้องเป็นโครงการแยกที่มี full SQL repository implementation,
dual-write/outbox convergence, read cutover, load/failover test, backup restore
และ rollback ผ่านครบ
