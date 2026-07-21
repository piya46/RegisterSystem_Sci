# SQL Mirror Outbox Runbook

เอกสารนี้ใช้สำหรับ MongoDB -> MariaDB/MySQL reporting mirror เท่านั้น MongoDB ยังเป็น source of truth และห้ามเปิด `SQL_PRIMARY_STORE`, `SQL_WALLET_LEDGER_ENABLED` หรือ `SQL_RECEIPT_COUNTER_ENABLED` ใน Phase 1

## 1. Preconditions

1. มี MongoDB backup และ SQL snapshot/restore point
2. ใช้ SQL runtime user ที่ไม่มี DDL/admin privilege และ migration user แยกกัน
3. Secret Manager โหลด `SQL_PASSWORD`, `SQL_MIRROR_IDENTITY_HASH_SECRET` และ `SQL_SSL_CA` เมื่อใช้ TLS CA
4. รัน schema migration และ backfill/checksum ผ่านทุก domain
5. ตั้ง alert งบที่ 500/800/1,000 บาท และตรวจ fixed cost ของ SQL provider แยกจาก application guardrail

## 2. Activation Order

```bash
cd backend
npm run migrate:sql-schema
SQL_MIGRATION_WRITE=true npm run migrate:sql-schema -- --apply
npm run backfill:sql-mirror -- --plan-only
SQL_BACKFILL_WRITE=true npm run backfill:sql-mirror -- --apply --batch-size=100
```

หลังผล count/checksum ตรง ให้เปิด staging ตามลำดับ:

```env
SQL_ENABLED=true
SQL_PRIMARY_STORE=false
SQL_MIRROR_ENABLED=true
SQL_OUTBOX_ENABLED=true
SQL_OUTBOX_STRICT=true
SQL_OUTBOX_POLL_INTERVAL_MS=5000
SQL_OUTBOX_BATCH_SIZE=25
SQL_OUTBOX_MAX_ATTEMPTS=8
SQL_MAX_SYNC_LAG_SECONDS=60
```

Restart หนึ่ง instance ก่อนเป็น canary ตรวจ `/health/ready` และ `GET /api/settings/sql-mirror/status` ด้วย superadmin จากนั้นจึง rollout instance อื่น Worker ใช้ lock token จึงรองรับหลาย instance แต่ operation counter ปัจจุบันยังเป็น per-process ต้องมี centralized monitoring ก่อน scale production

## 3. Normal Checks

- `pending`: ควรลดลงและ oldest lag ไม่เกิน `SQL_MAX_SYNC_LAG_SECONDS`
- `processing`: ควรมีจำนวนน้อยกว่า/ใกล้จำนวน worker; stale record จะถูกกู้หลัง lock timeout
- `dead`: ต้องเป็น 0 ก่อนเปิด shadow read
- `/health/ready`: `sql`, `mongodb`, `sqlMirrorOutbox` ต้องเป็น `up`
- ตรวจ SQL read/write guardrail, Mongo operation rate และ fixed instance cost รายวัน
- Status/dead-letter API ต้องใช้ `infra:manage`; response ไม่คืน source ID, PII หรือ connection detail
- Mirrored model จะ block hard delete, `insertMany` และ `bulkWrite` เมื่อเปิด outbox; ใช้ soft delete/tracked writes หรือ maintenance window + backfill/reconciliation

## 4. Dead-Letter Handling

ดูรายการแบบจำกัดผ่าน `GET /api/settings/sql-mirror/dead-letters?limit=50` หรือ dry-run CLI:

```bash
npm run replay:sql-mirror -- --domain=transactions --limit=100
```

แก้ root cause และ migration/backfill parent ที่ขาดก่อน replay จากนั้นเปิด write gate เฉพาะ maintenance window:

```bash
SQL_OUTBOX_REPLAY=true npm run replay:sql-mirror -- --apply --domain=transactions --limit=100
```

Replay จะ skip source ที่มี pending event ใหม่อยู่แล้ว, reset retry count และเขียน audit `SQL_MIRROR_DEAD_LETTER_REPLAY` ห้าม replay ซ้ำโดยไม่ตรวจ error code และ reconciliation report

## 5. Incident Actions

- SQL unavailable: ปิด shadow-read ก่อน, คง Mongo primary, ปล่อย worker retry ตาม backoff และห้ามเพิ่ม attempt/ลด delay โดยไม่ประเมิน load
- Queue lag สูง: ตรวจ SQL latency/pool/guardrail, parent dead-letter และ deployment count ก่อนเพิ่ม batch
- Unique conflict: หยุด replay, ตรวจ ownership/mapping; ห้ามแก้ SQL row ให้ชี้ Mongo ID ใหม่โดยตรง
- Source missing: ตรวจว่ามี hard delete นอก policy หรือไม่; Phase 1 ไม่ prune SQL อัตโนมัติ
- Cost limit reached: ปิด optional shadow-read, คง outbox เพื่อไม่สูญ event ถ้างบอนุญาต หรือปิด outboxแล้วบันทึกเวลาเพื่อ backfill ช่วงที่ขาด

## 6. Rollback

1. ปิด SQL report/shadow-read
2. ตั้ง `SQL_OUTBOX_ENABLED=false` และ restart
3. ตั้ง `SQL_MIRROR_ENABLED=false`; คง `SQL_ENABLED` ชั่วคราวได้เพื่อ forensic read
4. Export queue/dead-letter counts และ transaction totals โดยไม่ export PII
5. รัน Mongo-primary flow และตรวจ payment/check-in/register
6. แก้ root cause แล้ว backfill/reconciliation ใหม่ ห้าม drop SQL database ทันที

## 7. Atomicity Constraint

Write ที่ใช้ Mongo transaction/session เดียวกันกับ hook จะสร้าง source และ outbox atomically ส่วน write ที่ไม่อยู่ใน transaction อาจ commit source ก่อน enqueue fail แม้เปิด strict mode ดังนั้น Phase 1 ยังต้องใช้ periodic backfill/continuous reconciliation เป็น safety net และห้ามใช้ SQL mirror เป็น wallet ledger จนกว่าจะย้าย transaction boundary และผ่าน concurrent load/rollback test
