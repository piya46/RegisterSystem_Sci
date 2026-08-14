# Google Cloud Storage Object and Image Runbook

เอกสารนี้เป็น runbook สำหรับรูป Event, Payment QR, Payment Slip และ Avatar ของ PSEvent โดยมีเป้าหมายให้ค่าใช้จ่าย Google Cloud รวมไม่เกิน 1,000 บาท/เดือน และกันงบสำหรับ Cloud Storage ไม่เกิน 650 บาท/เดือนในภาวะใช้งานปกติ

## 1. Architecture และ Source of Truth

- MongoDB `StoredObject` เป็น source of truth ของ metadata, owner, Event scope, purpose, visibility, retention และสถานะไฟล์
- Google Cloud Storage เก็บ binary object เท่านั้น ห้ามเก็บ PII เพิ่มใน object metadata
- Bucket ต้องเป็น private ทั้ง bucket แม้ไฟล์ประเภท public; browser เข้าผ่าน stable backend URL หรือ short-lived signed URL
- `event_media`, `payment_qr`, `avatar` เป็น logical public objects
- `payment_slip` เป็น private object และเก็บใน Donation เป็น opaque reference รูปแบบ `object://<uuid>`
- Provider `local` ใช้สำหรับ development/rollback testing; production target คือ `gcs`
- MongoDB/MariaDB/Firestore ห้ามเก็บ binary image; SQL mirror ห้าม mirror slip URL หรือ object key ที่เป็นข้อมูลอ่อนไหวโดยไม่ผ่าน data classification

## 2. Cost Assumptions

ประมาณการที่ตรวจทานกับหน้า Cloud Storage pricing ณ 2026-07-17 สำหรับ single-region Standard Storage, flat namespace โดยใช้ planning baseline ด้านล่าง:

| รายการ | สมมติฐานราคา |
| --- | ---: |
| Standard storage | USD 0.02/GiB-month |
| Class A operation | USD 0.005/1,000 operations |
| Class B operation | USD 0.0004/1,000 operations |
| Internet egress ไป Asia ช่วงแรก | USD 0.12/GiB |
| Upload/inbound transfer | ไม่มีค่า network transfer |
| อัตราแปลงที่ใช้ใน estimator | 33.5 THB/USD ปรับได้ด้วย env |

Free Tier ไม่ถูกหักออกจากประมาณการ เพราะ Always Free ของ Cloud Storage ใช้กับ `us-west1`, `us-central1`, `us-east1` ไม่ใช่ Singapore/Bangkok ค่า egress เป็นตัวแปรหลักและต้องติดตามมากกว่าค่าเก็บไฟล์

ราคาพื้นที่เก็บจริงขึ้นกับ location และ Billing currency ค่า USD 0.02 เป็น baseline ไม่ใช่ใบเสนอราคา ก่อนสร้าง production bucket ต้องตรวจ SKU ของ `GCS_LOCATION` ใน Cloud Billing/Calculator และตั้ง env override ให้ตรงหรือสูงกว่าอัตราจริง ห้ามลด rate เพื่อทำให้ forecast ผ่าน budget โดยไม่มีหลักฐานจาก Billing SKU

ตัวอย่างประมาณการ:

| Scenario ต่อเดือน | Storage | Egress | Operations | ประมาณการ |
| --- | ---: | ---: | ---: | ---: |
| 10,000 รูป รูปละ 500 KB เปิดเฉลี่ย 5 ครั้ง | 4.77 GiB | 23.84 GiB | 10k upload, 50k GET | ประมาณ 101 บาท |
| ค่าเดิมพร้อม reserve 20% | 4.77 GiB | 23.84 GiB | เท่าเดิม | ประมาณ 122 บาท |
| 100 GiB เก็บ, egress 100 GiB | 100 GiB | 100 GiB | 100k upload, 1m GET | ประมาณ 499 บาท |

ตัวเลขไม่รวม VAT, SKU-specific currency conversion, Cloud CDN, load balancer, Cloud Run/VPS และบริการ Google Cloud อื่น ต้องตรวจ Billing report จริงทุกสัปดาห์ในเดือนแรก

Official references ที่ตรวจล่าสุด 2026-07-17:

- [Cloud Storage pricing](https://cloud.google.com/storage/pricing)
- [Signed URLs](https://docs.cloud.google.com/storage/docs/access-control/signed-urls)
- [Object Lifecycle Management](https://docs.cloud.google.com/storage/docs/lifecycle)
- [Soft delete](https://docs.cloud.google.com/storage/docs/soft-delete)

## 3. Budget Policy

- Google Cloud ทั้งโครงการ: 1,000 บาท/เดือน
- GCS sub-budget: 650 บาท/เดือน
- Secret Manager/KMS/Firestore และส่วนสำรองอื่น: 300 บาท/เดือน
- GCS operational ceiling: 560 บาท หรือ 80% ของ sub-budget
- ตั้ง Google Cloud Budget Alert รวมอย่างน้อยที่ 500, 700, 850 และ 1,000 บาท
- ตั้ง dashboard แยก SKU ของ Storage, Operations, Egress, KMS, Secret Manager และ Firestore
- App guardrail ต่อ process ค่าเริ่มต้น:
  - upload ไม่เกิน 1,000 files/day
  - optimized upload bytes ไม่เกิน 1 GiB/day
  - projected egress ไม่เกิน 4 GiB/day
  - signed URL operations ไม่เกิน 10,000/day
  - metadata operations ไม่เกิน 10,000/day
- 4 GiB/day x 30 วัน x USD 0.12 x 33.5 ประมาณ 482 บาท/เดือนสำหรับ egress
- Guardrail ในแอปเป็น in-memory ต่อ process และ reset เมื่อ restart จึงไม่ใช่ billing hard cap; ก่อน scale หลาย instance ต้องส่ง metric ไป Cloud Monitoring/central store
- Budget Alert แจ้งเตือนแต่ไม่หยุด billing อัตโนมัติ ต้องมี on-call action และ optional feature kill switch

คำนวณ scenario ได้ด้วย:

```bash
cd backend
npm run estimate:gcs-cost -- --storage-gib=4.768 --egress-gib=23.84 --uploads=10000 --downloads=50000
```

## 4. Bucket Design

- ใช้ bucket แยก production กับ staging
- ใช้ single region เดียวกับ application runtime และฐานข้อมูลเพื่อลด latency/data transfer
- ค่าเริ่มต้นคือ `asia-southeast3` (Bangkok) และให้วาง Cloud Run/GCS ใน region เดียวกันเพื่อลด latency และ cross-region egress
- ใช้ Standard Storage, flat namespace, ไม่เปิด Autoclass และไม่เปิด Object Versioning
- startup ต้องยืนยันว่า `GCS_LOCATION` เป็น single region จริง ไม่รับ multi-region เช่น `ASIA`, `US`, `EU`
- เปิด Uniform Bucket-Level Access
- บังคับ Public Access Prevention = `enforced`
- ห้าม object ACL/public ACL
- ไม่เปิด Cloud CDN/Rapid Cache ในระยะแรก; เปิดเมื่อ Billing report พิสูจน์ว่าค่า egress/cache hit ratio คุ้มกว่า
- เก็บ prefix แยก environment และ purpose เช่น `production/payment_slip/2026/07/<uuid>.webp`
- lifecycle ลบ `payment_slip` หลัง retention + unlinked window + grace; ค่า default 365 + 1 + 2 = 368 วัน
- event media และ avatar ห้ามใช้ age-only bucket lifecycle เพราะอาจยังถูก Event อ้างอิง; ใช้ application link tracking และ cleanup แทน
- soft delete ไม่เกิน 7 วัน ค่าเกินนี้ทำให้ startup fail ตาม cost policy
- default event-based hold ต้องปิด และ bucket retention policy ต้องไม่มีโดย default (`GCS_MAX_BUCKET_RETENTION_DAYS=0`)
- retention lock/hold ที่จำเป็นด้านกฎหมายต้องผ่าน approval, cost estimate และเพิ่มค่า env ที่อนุมัติ เพราะอาจทำให้ lifecycle ลบไม่ได้

ตรวจแผนและ apply policy:

```bash
cd backend
npm run configure:gcs-bucket
GCS_BUCKET_CONFIG_WRITE=true npm run configure:gcs-bucket -- --apply
```

Script จะไม่ปิด Object Versioning หรือเปลี่ยน soft-delete policy ที่มีอยู่โดยอัตโนมัติ เพราะเป็นการเปลี่ยน data-recovery policy ต้องตรวจและอนุมัติแยกก่อน

## 5. IAM, Credentials, Secret Manager และ KMS

Runtime service account ต้องใช้ Application Default Credentials/Workload Identity ห้ามเก็บ service-account JSON key ใน `.env`, Git, container image หรือ Secret Manager

สิทธิ์ขั้นต่ำของ runtime:

- `storage.objects.create`
- `storage.objects.get`
- `storage.objects.delete`
- `storage.buckets.get` สำหรับ startup policy validation
- `iam.serviceAccounts.signBlob` บน signing service account หาก signed URL ใช้ keyless credentials

Configuration/migration runner ต้องเป็น service account แยก และให้ `storage.buckets.update`, IAM/bucket policy เฉพาะช่วง maintenance เท่านั้น ห้ามให้ runtime เปลี่ยน lifecycle หรือ bucket IAM

Secret Manager:

- `OBJECT_STORAGE_LOCAL_SIGNING_SECRET` เป็น Secret และต้องแยกจาก `JWT_SECRET` หาก production ใช้ local provider
- GCS bucket name, project ID, region, prefix และ retention days เป็น config ไม่ใช่ Secret
- ห้ามเก็บ signed URL, access token, service-account JSON หรือ raw payment slip ใน log/audit
- production Secret Manager ต้อง pin version และ fail closed ตาม `SECRET_MANAGER_RUNBOOK.md`

Encryption:

- Cloud Storage ใช้ Google-managed encryption at rest เป็นค่าเริ่มต้นเพื่อคุมต้นทุน
- KMS ในระบบใช้ unwrap field-encryption data key ไม่ควรเรียก KMS ต่อ image request
- ใช้ CMEK สำหรับ bucket เฉพาะเมื่อ compliance บังคับ และต้องเพิ่ม KMS operation, key availability, rotation, disable/destroy และ incident requirements ก่อนเปิด

## 6. Runtime Configuration

Production baseline:

```env
NODE_ENV=production
OBJECT_STORAGE_PROVIDER=gcs
OBJECT_STORAGE_PUBLIC_API_ORIGIN=https://api.example.com
LEGACY_UPLOADS_PUBLIC_ENABLED=false
GCS_REQUIRE_LEGACY_UPLOADS_DISABLED=true

GOOGLE_CLOUD_PROJECT=cusa-reunion
GCS_BUCKET=your-private-production-bucket
GCS_LOCATION=asia-southeast3
GCS_OBJECT_PREFIX=psevent/production
GCS_VALIDATE_BUCKET_ON_STARTUP=true
GCS_REQUIRE_LIFECYCLE=true
GCS_REJECT_CONFLICTING_LIFECYCLE=true
GCS_REQUIRE_SINGLE_REGION=true
GCS_REQUIRE_STANDARD_STORAGE=true
GCS_REQUIRE_VERSIONING_DISABLED=true
GCS_REQUIRE_AUTOCLASS_DISABLED=true
GCS_REQUIRE_FLAT_NAMESPACE=true
GCS_MAX_SOFT_DELETE_RETENTION_DAYS=7
GCS_MAX_BUCKET_RETENTION_DAYS=0
GCS_REQUIRE_DEFAULT_EVENT_HOLD_DISABLED=true

GCS_PRIVATE_SIGNED_URL_TTL_SECONDS=300
GCS_PUBLIC_SIGNED_URL_TTL_SECONDS=3600
GCS_UNLINKED_UPLOAD_TTL_HOURS=24
GCS_SLIP_RETENTION_DAYS=365
GCS_LIFECYCLE_DELETE_GRACE_DAYS=2

OBJECT_STORAGE_CLEANUP_SCHEDULER_ENABLED=true
GCS_MONTHLY_BUDGET_THB=650
GCS_COST_USD_TO_THB=33.5
GCS_COST_STANDARD_STORAGE_USD_PER_GIB_MONTH=0.02
GCS_COST_CLASS_A_USD_PER_THOUSAND=0.005
GCS_COST_CLASS_B_USD_PER_THOUSAND=0.0004
GCS_COST_INTERNET_EGRESS_USD_PER_GIB=0.12
```

ตรวจรายการ env ทั้งหมดที่ `backend/.env.example`

## 7. Upload and Delivery Flow

Event media:

1. Admin upload พร้อม `eventId` และ purpose
2. Backend ตรวจ auth, permission และ Event scope
3. Multer เก็บใน memory สูงสุด 5 MB และรับเพียงหนึ่งไฟล์
4. ตรวจ MIME allowlist และ magic bytes
5. Sharp decode/re-encode, strip metadata, rotate, resize และจำกัด 40M pixels
6. สร้าง `StoredObject` แบบ unlinked อายุ 24 ชั่วโมงเพื่อ reserve key/metadata ก่อน
7. Upload object ด้วย CRC32C และ `ifGenerationMatch=0`; failure ต้อง mark metadata deleted และลบ partial object
8. Event save transaction ทำ `eventLinks` และ canonicalize URL
9. ถ้าเปลี่ยนรูปเดิม link เก่าถูก quarantine และ cleanup หลัง grace

Payment slip:

1. Public upload ต้องผ่าน Turnstile, rate limit, public Event และ donations feature
2. Admin upload ต้องผ่าน `event:manage`
3. Raw file ไม่ถูกเก็บ; backend re-encode เป็น WebP
4. สร้าง private pending object และคืน `object://uuid`
5. Donation transaction claim object ที่ Event ตรงกันและใช้ได้ครั้งเดียว
6. Pending object ที่ไม่ถูก claim ถูกล้างหลัง 24 ชั่วโมง
7. Admin ที่มี `event:read` ขอ short-lived signed URL อายุ default 5 นาที
8. ทุก private access มี audit metadata-only

Avatar:

- จำกัด 2 MB, resize ไม่เกิน 512x512, WebP
- object ใหม่เริ่มเป็น unlinked และต้อง claim พร้อมสลับ reference ภายใน MongoDB transaction
- ลบ object เก่าหลัง DB save สำเร็จเท่านั้น
- ถ้า process/transaction หยุดก่อน commit object ใหม่จะหมดอายุและ cleanup ได้ โดย avatar เดิมยังใช้งานต่อ

## 8. Legacy Migration

สำรอง MongoDB และ local upload directory ก่อนทุกครั้ง จากนั้นรัน inventory:

```bash
cd backend
npm run migrate:object-storage -- --limit=10000
```

Dry-run แสดงเฉพาะ count/bytes/missing source ไม่แสดง PII หรือชื่อไฟล์ เมื่อ bucket และ IAM ผ่าน staging แล้วจึง apply ใน maintenance window:

```bash
OBJECT_STORAGE_PROVIDER=gcs \
OBJECT_STORAGE_MIGRATION_WRITE=true \
npm run migrate:object-storage -- --apply --limit=10000
```

ข้อบังคับ:

- Migration ย้ายเฉพาะ local `/uploads/...`; external Google Drive/Imgur URL ต้อง review แยก
- Donation ที่ยังไม่มี `eventId` ต้อง backfill Event ก่อนย้าย slip
- Source file ไม่ถูกลบอัตโนมัติ ให้เก็บไว้ตลอด verification/rollback window
- ถ้า `failed > 0` command ต้องจบด้วย non-zero status และห้ามปิด legacy path
- ตรวจ sample ทุก purpose, object count, bytes, Event page, private slip access และ avatar
- หลังยืนยันครบให้ตั้ง `LEGACY_UPLOADS_PUBLIC_ENABLED=false`; ทั้ง `/uploads` และ `/uploads/avatars` ต้องปิด และ production GCS startup จะ fail หาก config ยังเปิด legacy path
- การ rollback ใช้ MongoDB backup + local source snapshot; ห้ามแก้ URL กลับด้วย bulk string replacement ที่ไม่มี transaction/audit

## 9. Cleanup and Retention

ตรวจ dry-run:

```bash
npm run cleanup:stored-objects -- --limit=500
```

Apply แบบ manual:

```bash
OBJECT_STORAGE_CLEANUP_WRITE=true npm run cleanup:stored-objects -- --apply --limit=500
```

- Scheduler รันเวลา 03:15 Asia/Bangkok เมื่อ enabled
- ลบ pending/unlinked object ที่หมดอายุ, private object ครบ retention และ quarantined object หลัง 24 ชั่วโมง
- ใช้ cleanup lock และกู้ stale lock เพื่อลด duplicate worker
- GCS delete ใช้ ignore-not-found เพื่อรองรับกรณี lifecycle ลบ binary ไปก่อน
- ห้าม hard-delete `StoredObject` metadata; เปลี่ยน status เป็น `deleted` เพื่อ audit/reconciliation
- Lifecycle action เป็น asynchronous และอาจหน่วงอย่างน้อยหลายชั่วโมง จึงห้ามใช้เป็น real-time workflow signal

## 10. Monitoring and Incident Response

ตรวจ `GET /api/uploads/status` ด้วยบัญชี `infra:manage`:

- provider/health/startup policy
- object count และ bytes แยก purpose/status/provider
- optimized bytes saved
- monthly forecast จาก expected egress/operations
- daily in-process guardrail

Alert อย่างน้อย:

- GCS budget 50%, 70%, 90%, 100%
- egress/day เกิน 3 GiB หรือโตมากกว่า baseline 2 เท่า
- upload rejection/rate-limit/Turnstile fail เพิ่มผิดปกติ
- signed URL generation fail, IAM `signBlob` denied, bucket policy validation fail
- cleanup failed/stale lock/missing object
- pending upload โตต่อเนื่อง, orphan ratio สูง หรือ optimization ratio ผิดปกติ

เมื่อค่าใช้จ่ายพุ่ง:

1. ตรวจ egress ตาม object/purpose และ source IP/user agent
2. ลด public signed URL TTL เฉพาะเมื่อไม่เพิ่ม signed operation เกินควร
3. ปิด external embedding/hotlink ที่ WAF และตรวจ rate limit
4. ลดขนาด/quality เฉพาะ event media โดยไม่ลดความอ่านได้ของ QR/slip
5. ปิด optional public media feature หากถึง hard incident threshold
6. ห้ามเปลี่ยนไฟล์จำนวนมากเป็น Nearline/Coldline ทันที เพราะ Class A, retrieval และ early deletion อาจแพงกว่าที่ประหยัดได้

## 11. Production Checklist

- Bucket region ตรง runtime
- ราคา override ใน estimator ตรงกับ Cloud Billing SKU ของ bucket location และอัตราแลกเปลี่ยนที่ใช้จริง
- Standard/flat namespace, Autoclass/versioning disabled
- Uniform access และ Public Access Prevention enforced
- lifecycle payment slip ผ่าน startup validation
- ไม่มี broad/conflicting lifecycle Delete rule ที่ครอบ managed prefix
- soft delete ไม่เกิน 7 วัน
- ไม่มี bucket retention policy เกินค่าที่อนุมัติ และ default event-based hold ปิด
- runtime/configuration service account แยกกัน
- ADC/Workload Identity ใช้งานได้และไม่มี JSON key
- V4 signed URL ผ่าน keyless signing test
- Secret Manager และ KMS policy ผ่าน
- migration dry-run/apply/verification ผ่านและ source snapshot ยังอยู่
- legacy static route ปิด
- cleanup dry-run ผ่านก่อนเปิด scheduler
- Cloud Budget/Billing export/alerts ทำงาน
- load test egress/upload/concurrent private access ผ่าน
- restore และ rollback drill ผ่าน staging
