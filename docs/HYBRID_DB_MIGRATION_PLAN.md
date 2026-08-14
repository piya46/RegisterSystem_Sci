# Hybrid MongoDB, MariaDB/MySQL และ Firestore Migration Plan

เอกสารนี้กำหนดแผนเพิ่ม Structured DB โดยไม่ทำ big-bang migration และไม่เปลี่ยน wallet/payment source of truth ก่อนผ่าน concurrency, reconciliation และ rollback test

## 1. Current Status

- MongoDB/Mongoose ยังเป็น primary source of truth ของระบบ
- SQL ปิดอยู่โดย default (`SQL_ENABLED=false`)
- เลือก MariaDB บน Plesk เป็น SQL target แล้ว โดย Cloud Run จะเชื่อมปลายทาง `203.170.190.137:3306` ผ่าน reserved static egress; ยังไม่ activate จนกว่า Plesk/TLS/encrypted-backup checklist ผ่าน
- มี connector `mysql2` รองรับ MariaDB/MySQL, Unix socket, TLS, pool, timeout, daily operation guardrail และ graceful shutdown
- มี schema migration สำหรับ reporting mirror และเพิ่ม event registration primary-ready schema แล้ว ครอบคลุม points, participant fields, registrations, field values, idempotency, sessions, check-in audit, reconciliation และ cutover runs
- มี repository/mappers สำหรับ 10 domains และไม่ mirror donor PII, participant plaintext fields, address, slip URL หรือ raw LINE user ID; QR/idempotency/verification/receipt identifiers ถูก HMAC ก่อน SQL write
- มี backfill แบบ plan-only, dry-run, batch, high-watermark, resume checkpoint, idempotent upsert, count และ aggregate checksum comparison
- DDL และ repository integration ผ่าน MariaDB 12 local จริงแล้ว; fixture integration ถูก rollback และฐานทดสอบถูกลบ
- มี MongoDB outbox/live mirror worker แบบ feature flag รองรับ coalescing, lock ownership, stale-lock recovery, bounded retry with jitter, dead-letter, audit, TTL retention และ CLI replay
- มี superadmin status/dead-letter API และ public readiness ที่เปิดเผยเฉพาะสถานะ ไม่เปิด DB endpoint, credential หรือ source record ID
- ยังไม่ได้ migrate production data, เปิด outbox ใน production หรือ cutover read/write path

## 2. Source-of-Truth Matrix

| Domain | Phase 1 owner | SQL role | Firestore role | Cutover rule |
| --- | --- | --- | --- | --- |
| Organization/Series/Event | MongoDB | Reporting mirror | ไม่ใช้ | เปลี่ยนได้หลัง shadow-read ผ่าน |
| Participant dynamic fields/PII | MongoDB encrypted fields | Core metadata + blind index เท่านั้น | ห้ามเก็บ | ยังไม่ cutover ใน Phase 1 |
| Wallet balance/coupons | MongoDB transaction | Read-only mirror | ห้ามเป็น ledger | ต้องผ่าน concurrent payment/reconciliation |
| Wallet transaction | MongoDB transaction | Reporting/settlement mirror | Ephemeral payment status | ต้องมี outbox และ zero mismatch |
| Vendor/menu | MongoDB | Reporting mirror | Vendor-scoped realtime state เท่านั้น | ต้องมี ownership test |
| Receipt/counter | MongoDB transaction | Unique/reporting mirror | ไม่ใช้ | ต้องทดสอบ counter concurrency ก่อน |
| Donation/package | MongoDB | Summary/stock reporting mirror | ไม่ใช้ | ต้องตรวจ stock and amount totals |
| Event registration cutover tables | MongoDB ระหว่าง backfill | Primary-ready structured tables | ไม่ใช้ | ย้ายเฉพาะหลัง schema, backfill, reconciliation และ runtime repository switch ผ่าน |
| Secret/key material | Secret Manager/KMS | ห้ามเก็บ | ห้ามเก็บ | ไม่มีการ cutover |
| Upload/document | Private object storage | เก็บ metadata เท่านั้น | ห้ามเก็บไฟล์ | Signed URL policy |

## 3. SQL Schema Scope

Initial mirror tables:

- `organizations`, `event_series`, `events`
- `participants_core`
- `wallets`, `wallet_coupons`, `wallet_transactions`
- `vendors`, `vendor_menu_items`
- `receipts`
- `donation_summaries`
- `packages`, `package_items`, `package_variants`
- `schema_migrations`, `mirror_backfill_checkpoints`

Event registration primary-ready tables:

- `event_runtime_configs`
- `event_registration_points`
- `event_participant_fields`
- `event_registrations`
- `event_registration_field_values`
- `event_registration_idempotency_keys`
- `event_registration_checkins`
- `event_scoped_registration_sessions`
- `event_registration_reconciliation_snapshots`
- `event_registration_cutover_runs`

Schema ใช้ InnoDB, `utf8mb4`, FK, unique key และ check constraint สำหรับ date range, non-negative balance/stock/amount, receipt uniqueness, event relationship และ idempotency

MariaDB target ที่รองรับควรเป็น MariaDB 10.6+ ส่วน Cloud SQL ให้ใช้ Cloud SQL for MySQL 8.x เพราะ Google Cloud SQL ไม่มี managed MariaDB โดยตรง

## 4. Connection Security

- Plesk target ใช้ Direct VPC egress แบบ `all-traffic`, Cloud NAT และ reserved IP เพื่อให้ Plesk allowlist source `/32`
- TCP production ต้องเป็น `SQL_SSL_MODE=verify_identity`, มี `SQL_SSL_CA` จาก pinned Secret Manager version และตรวจ certificate DNS/IP SAN
- Production ห้าม `disabled`, `required`, `verify_ca`, `SQL_ALLOW_INSECURE_PRODUCTION` และ `SQL_ALLOW_UNVERIFIED_TLS`
- Startup ต้องตรวจ `SHOW SESSION STATUS LIKE 'Ssl_cipher'` และ fail หาก session ไม่ได้ negotiate TLS จริง
- Direct VPC cold-start retry ต้อง bounded/exponential และ retry เฉพาะ transient network code; auth/certificate/identity/TLS failure ต้องหยุดทันที
- Plesk firewall/database access rule ต้องอนุญาตเฉพาะ reserved NAT IP ห้ามเปิด `3306` ให้ `0.0.0.0/0`
- ต้องยืนยัน Plesk storage/tablespace encryption และ encrypted backup restore ก่อนตั้ง confirmation flag
- Runtime user มีเฉพาะ SELECT/INSERT/UPDATE/DELETE ที่จำเป็น
- Migration user แยกต่างหากและใช้ DDL เฉพาะ maintenance window
- `multipleStatements=false`, query timeout, connection timeout, pool limit และ queue limit ต้องเปิดเสมอ

## 5. Required Configuration

ดูค่าครบใน `backend/.env.example` ตัวแปรสำคัญคือ:

```env
SQL_ENABLED=false
SQL_DIALECT=mariadb
SQL_PROVIDER=plesk
SQL_PRIMARY_STORE=false
SQL_HOST=203.170.190.137
SQL_EXPECTED_HOST=203.170.190.137
SQL_PORT=3306
SQL_DATABASE=<protected-deployment-variable>
SQL_USER=<protected-deployment-variable>
SQL_PASSWORD=<from-secret-manager>
SQL_MIGRATION_USER=<protected-deployment-variable>
SQL_MIGRATION_PASSWORD=<from-secret-manager>
SQL_SSL_MODE=verify_identity
SQL_SSL_CA_SECRET_NAME=SQL_SSL_CA
SQL_STATIC_EGRESS_ENABLED=false
SQL_NETWORK_ALLOWLIST_CONFIRMED=false
SQL_AT_REST_ENCRYPTION_CONFIRMED=false
SQL_BACKUP_ENCRYPTION_CONFIRMED=false
VERIFY_SQL_TRANSPORT=false
SQL_MIGRATION_WRITE=false
SQL_REMOTE_MIGRATION_ONLY=true
SQL_EVENT_REGISTRATION_BACKFILL_WRITE=false
SQL_BACKFILL_WRITE=false
SQL_MIRROR_ENABLED=false
SQL_MIRROR_REQUIRE_PROTECTED_VALUES=true
SQL_OUTBOX_ENABLED=false
SQL_OUTBOX_STRICT=false
SQL_OUTBOX_POLL_INTERVAL_MS=5000
SQL_OUTBOX_BATCH_SIZE=25
SQL_OUTBOX_MAX_ATTEMPTS=8
SQL_OUTBOX_REPLAY=false
SQL_WALLET_LEDGER_ENABLED=false
SQL_RECEIPT_COUNTER_ENABLED=false
```

ห้ามตั้ง `SQL_PRIMARY_STORE=true`, `SQL_WALLET_LEDGER_ENABLED=true` หรือ `SQL_RECEIPT_COUNTER_ENABLED=true` ใน production Phase 1

## 6. Migration Flow

1. เลือก provider และสร้าง staging SQL instance/database
2. ตั้ง backup, PITR/snapshot, monitoring และ migration credential
3. ตรวจ schema แบบไม่เชื่อม DB:

```bash
cd backend
npm run migrate:sql-schema
```

4. Apply schema ต้องมีสองเงื่อนไขพร้อมกัน:

```bash
SQL_MIGRATION_WRITE=true npm run migrate:sql-schema -- --apply
```

5. สำหรับระบบลงทะเบียนอีเวนต์ ให้ตรวจและ backfill ตาราง primary-ready เฉพาะ Event:

```bash
npm run backfill:sql-event-registration -- --event-id=<mongo-event-id>
SQL_EVENT_REGISTRATION_BACKFILL_WRITE=true npm run backfill:sql-event-registration -- --apply --event-id=<mongo-event-id>
```

6. ตรวจ source mapping ของ reporting mirror โดยไม่เขียน SQL:

```bash
npm run backfill:sql-mirror -- --domains=organizations,event_series,events
```

7. Apply reporting mirror backfill หลัง backup และ approval:

```bash
SQL_BACKFILL_WRITE=true npm run backfill:sql-mirror -- --apply --batch-size=100
```

8. ตรวจ report ของทุก domain ว่า `sourceCount=processedCount=sqlCount` และ `sourceChecksum=sqlChecksum`
9. รันซ้ำเพื่อพิสูจน์ idempotency
10. รัน read-only `SQL_PROTECTION_AUDIT=true npm run audit:sql-protection`; violation count ต้องเป็นศูนย์และต้องใช้ checksum/reconciliation ยืนยัน HMAC ซ้ำ
11. ถอนสิทธิ์ Secret ชั่วคราวของ migration service account ด้วย `sql-migration-cleanup` หลังจบ change windowทุกครั้ง และเก็บ IAM policy evidence
12. เปิด `SQL_MIRROR_ENABLED=true` และ `SQL_OUTBOX_ENABLED=true` ใน staging หลัง backfill ผ่าน โดย production แนะนำ `SQL_OUTBOX_STRICT=true`
13. ตรวจ `/api/settings/sql-mirror/status` ด้วย superadmin ว่า queue ไม่มี dead-letter และ lag อยู่ใน threshold
14. เปิด shadow-read เฉพาะ report/dashboard
15. สังเกต sync lag และ mismatch อย่างน้อยหนึ่ง Event cycle ก่อนพิจารณา read cutover

`--plan-only` แสดง domain/batch โดยไม่เชื่อมฐาน ส่วน dry-run ปกติอ่าน MongoDB และทำ mapping/checksum แต่ไม่เขียน SQL

## 7. Backfill Safety

- `_id` สูงสุดตอนเริ่ม run เป็น high-watermark เพื่อไม่รวม record ใหม่กลางงาน
- Checkpoint เก็บ run ID, mapper version, last ObjectId, processed count และ rolling checksum
- ก่อน resume ระบบ scan prefix ซ้ำ; หาก source เปลี่ยนจะเริ่ม run ใหม่แทนการต่อจาก checkpoint ที่ไม่น่าเชื่อถือ
- ทุก batch เขียนใน SQL transaction และ checkpoint commit พร้อม batch
- Parent ที่อ้างอิงไม่พบ, unique key ชนคนละ Mongo ID, count mismatch หรือ checksum mismatch ต้อง fail-closed
- Source rows ที่ถูก hard-delete จะทำให้ validation fail; Phase 1 ไม่ prune SQL อัตโนมัติ
- Backfill ไม่ decrypt participant/donation PII

## 8. Live Outbox Safety

- Outbox เก็บเฉพาะ `domain`, Mongo ObjectId, event reference และ operational metadata; ห้ามเก็บ business payload หรือ PII plaintext
- Hook ครอบคลุม document save และ query update ของ 10 mirror domains; pending event ของ source เดียวกันถูก coalesce และ update ที่เกิดระหว่าง processing จะสร้าง pending รุ่นถัดไป
- Outbox ที่สร้างด้วย Mongo session เดียวกับ source write ภายใน transaction จะ commit/rollback พร้อมกัน
- Source write ที่ไม่ได้อยู่ใน Mongo transaction ไม่มี atomic guarantee แบบสมบูรณ์: strict mode ทำให้ caller รับรู้ enqueue failure แต่ย้อน source write ที่ commit แล้วไม่ได้ จึงยังต้องมี continuous reconciliation ก่อน read cutover
- เมื่อเปิด outbox ระบบปฏิเสธ hard delete ของ mirrored models; ต้องใช้ soft delete เพื่อลด stale SQL/FK conflict
- Bulk update เกิน `SQL_OUTBOX_MAX_ENQUEUE_PER_WRITE` ต้อง fail ใน strict mode; non-strict mode จะ log code และต้องตามด้วย reconciliation/backfill
- `insertMany` และ `bulkWrite` ถูก block เมื่อเปิด outbox เพราะไม่รับประกัน document/query hook; maintenance migration ต้องปิด live mirror ตาม change window และ backfill/reconcile ก่อนเปิดกลับ
- Worker อ่าน source ล่าสุดจาก MongoDB แล้ว map ใหม่ ไม่เชื่อ payload จาก queue และ SQL upsert ทำใน transaction
- Parent ที่ยังไม่เข้า SQL จะ retry; invalid domain, source หาย และ unique ownership conflict จะเข้า dead-letter
- Completed event มี TTL ตาม `SQL_OUTBOX_COMPLETED_RETENTION_DAYS`; dead-letter ไม่ถูกลบอัตโนมัติ
- Replay เป็น CLI แบบ dry-run default และต้องมีทั้ง `--apply` กับ `SQL_OUTBOX_REPLAY=true`; ดูขั้นตอนใน `docs/SQL_MIRROR_OUTBOX_RUNBOOK.md`

## 9. Rollback

ก่อน read cutover การ rollback คือ:

1. ปิด `SQL_OUTBOX_ENABLED` ก่อน แล้วปิด `SQL_MIRROR_ENABLED`
2. ปิด SQL report feature flag
3. ให้ dashboard/report กลับ MongoDB
4. เก็บ SQL database ไว้เพื่อ forensic/reconciliation ห้าม drop ทันที
5. แก้ mapping/outbox แล้ว backfill ใหม่จาก MongoDB

หากเริ่ม dual-write แล้ว ต้องหยุด worker, drain queue, เก็บ dead-letter, เทียบ transaction totals และยืนยันว่า MongoDB ยังครบก่อน rollback read path

## 10. Cost Guardrail

- เป้าหมายรวม Google Cloud ส่วนเสริมไม่เกิน 1,000 บาท/เดือน
- Reserved IP และ Cloud NAT สำหรับ Plesk SQL เป็น opt-in และมี planning cap `SQL_EGRESS_MONTHLY_BUDGET_THB=250`; ต้องรวมกับ Cloud Run/GCS/Logging/Secret Manager/KMS/Firestore ทุกครั้ง
- `SQL_MAX_DAILY_READS` และ `SQL_MAX_DAILY_WRITES` หยุด operation เมื่อเกิน limit ต่อ process
- Backfill ขนาดใหญ่ต้องทำ batch/resume และอนุมัติ limit ชั่วคราว
- Cloud SQL เป็น fixed/instance cost ซึ่ง application operation guardrail คุมไม่ได้ทั้งหมด; ห้ามเปิด HA/instance ใหญ่โดยไม่มี budget approval
- Phase proof-of-concept ใช้ local/self-managed MariaDB หรือ smallest staging option และปิดเมื่อไม่ใช้งาน
- ตั้ง billing alerts 500/800/1,000 บาทและตรวจราคาจริงก่อน provision ทุกครั้ง
- Poll interval เริ่มต้น 5 วินาที, batch 25 และ stale-lock scan ถูก throttle; ต้อง tune จาก queue lag/operation metrics ไม่ลด interval โดยไม่มี cost review

## 11. Remaining Production Blockers

- Plesk provider ถูกเลือกแล้ว แต่ยังต้องยืนยัน remote access, TLS CA/SAN, at-rest encryption, encrypted backup และ quota ของแพ็กเกจ
- Provision reserved Cloud NAT IP, allowlist ใน Plesk และให้ read-only Cloud Run transport job ผ่าน
- รัน migration `002_transaction_reversal_lookup`, backfill และ outbox canary ด้วยสำเนาข้อมูล staging
- เพิ่ม continuous reconciliation/dual-read mismatch job; queue lag monitoring มีแล้วแต่ยังต้องส่ง alert ไป monitoring กลาง
- เพิ่ม shadow-read dashboard/report และ mismatch UI
- ทำ backup restore drill, failover test และ load test
- ทดสอบ concurrent wallet payment/refund/reversal ก่อน ledger cutover
- กำหนด retention/prune process สำหรับ SQL rows ที่ source ถูกลบ
- เปลี่ยน cost counters จาก per-process เป็น centralized metrics/quota สำหรับหลาย instance
