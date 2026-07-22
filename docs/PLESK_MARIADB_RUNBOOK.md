# Plesk MariaDB Security, Connectivity และ Activation Runbook

เอกสารนี้กำหนดวิธีเชื่อม Cloud Run backend ไปยัง MariaDB บน Plesk โดยไม่ย้าย backend หรือ Secret ไปไว้บน Plesk และไม่เปิดฐานข้อมูลสู่ Internet แบบกว้าง

## 1. ข้อสรุปสถาปัตยกรรม

- Plesk รันเฉพาะ React SPA และ Node.js same-origin gateway
- Cloud Run ยังคงรัน backend/API และเป็น component เดียวที่เชื่อม MongoDB, MariaDB, Secret Manager, GCS, KMS และ Firestore
- MongoDB ยังคงเป็น source of truth ใน Phase 1
- MariaDB เป็น optional reporting mirror เท่านั้น โดย `SQL_PRIMARY_STORE=false`
- SQL ทุก flag ปิดอยู่จนกว่าจะผ่าน checklist ในเอกสารนี้

เส้นทางที่อนุมัติ:

```text
Browser -> Plesk web gateway -> Cloud Run backend
                                  |
                                  v
                         Direct VPC egress
                                  |
                                  v
                      Cloud NAT + reserved IP
                                  |
                                  v
                    203.170.190.137:3306 (TLS)
                                  |
                                  v
                         Plesk MariaDB
```

## 2. Endpoint และขอบเขตข้อมูล

| รายการ | ค่า/นโยบาย |
|---|---|
| Plesk public destination | `203.170.190.137:3306` |
| Plesk local connection | `localhost:3306`; ใช้ได้เฉพาะโปรเซสที่รันบน Plesk host |
| Cloud Run SQL host | `203.170.190.137`; ห้ามใช้ `localhost` และ application/release guard pin ค่านี้ไว้ |
| Cloud Run source IP | reserved Cloud NAT IP ที่สคริปต์ bootstrap สร้าง; ต้อง allowlist เป็น `/32` |
| Database/user names | restricted deployment variables; ห้าม commit ค่าจริงลง repository |
| Password, TLS CA, mirror HMAC key | Secret Manager version ที่ pin ไว้เท่านั้น |

IP `203.170.190.137` เป็นปลายทางของ Plesk ไม่ใช่ source IP ที่ควร allowlist ให้ Cloud Run การ allowlist ต้องใช้ค่า `SQL_EGRESS_IP` ที่ bootstrap แสดง

## 3. Encryption Policy ก่อนบันทึกข้อมูล

คำว่าเข้ารหัสทั้งหมดต้องใช้หลายชั้นตามชนิดข้อมูล ไม่ควรเข้ารหัสทุก column ด้วย application key แบบสุ่ม เพราะจะทำให้ FK, unique constraint, range query, amount total และการตรวจ reconciliation ใช้งานไม่ได้

### 3.1 Application layer

- Participant/donor PII ที่ MongoDB ต้องผ่าน AES-256-GCM พร้อม `kid`, random IV และ authentication tag ก่อนเขียน
- Email/phone/name ที่ต้องค้นหาใช้ keyed blind index แยกจาก ciphertext
- ก่อนเขียน SQL mirror ต้องตรวจ blind index จาก source ว่าเป็น hexadecimal 64 ตัวอักษร มิฉะนั้นให้ fail ห้ามปล่อย plaintext หรือค่าที่ malformed ลง column
- SQL mirror ห้าม decrypt หรือคัดลอก participant/donor PII
- Participant QR, vendor QR identifier, idempotency key, success verification code, receipt number และ LINE identifier ต้องแปลงเป็น domain-separated HMAC-SHA-256 ก่อน SQL write
- HMAC ต้องใช้ `SQL_MIRROR_IDENTITY_HASH_SECRET` โดยเฉพาะ ความยาวอย่างน้อย 32 bytes และห้ามใช้ร่วมกับ JWT/session/CSRF key
- Password/OTP recovery secret ห้าม reversible encryption; password ใช้ adaptive one-way hash และ OTP/token เก็บเฉพาะ keyed hash พร้อม TTL
- รูป, slip และเอกสารไม่เก็บเป็น BLOB ใน MariaDB ให้เก็บ private object ใน GCS และ SQL เก็บเฉพาะ non-secret metadata/hash ที่จำเป็น
- Log, audit, outbox และ dead-letter ห้ามมี plaintext token, PII, SQL password, CA body หรือ query parameter ที่เป็น Secret

### 3.2 Database/storage layer

- Plesk/hosting owner ต้องยืนยันว่า MariaDB data directory/tablespace และ host disk ถูกเข้ารหัส at rest
- Backup ทั้ง full/incremental/offsite ต้องเข้ารหัส และ key ต้องไม่อยู่ในไฟล์ backup เดียวกัน
- ต้อง restore backup ที่เข้ารหัสใน isolated environment อย่างน้อยหนึ่งครั้งก่อน production activation
- หากผู้ให้บริการยืนยัน encryption at rest หรือ encrypted backup ไม่ได้ ให้คง `SQL_ENABLED=false`
- Structured fields เช่น Mongo reference ID, FK, status, timestamp, amount, balance และ aggregate ยังคงเป็น typed column เพื่อใช้ constraint/reconciliation แต่ต้องอยู่บน encrypted storage และ encrypted backup เสมอ

### 3.3 Key management

- SQL password, migration password, TLS CA และ mirror HMAC key อยู่ใน Google Secret Manager; CA ต้องใช้ logical name `SQL_SSL_CA`, เป็น PEM certificate chain และห้ามมี private key
- Runtime service account ห้ามอ่าน `SQL_MIGRATION_PASSWORD`; secret sync ต้องถอน binding เก่าของ runtime และให้เฉพาะ migration service account อ่านได้
- Secret Manager pin ต้องอ้าง version number ห้ามใช้ `latest` ใน production
- Pin ของ SQL secret ต้องตรง project `cusa-reunion`, environment prefix และ logical secret name; cross-project/cross-environment resource ต้อง fail ก่อน deploy
- Application data key สามารถใช้ envelope encryption ผ่าน Google Cloud KMS ได้เมื่อเปิด `KMS_DATA_KEY_ENABLED=true`
- KMS ไม่สามารถทำให้ Plesk MariaDB tablespace encrypted โดยอัตโนมัติ; at-rest encryption ของ Plesk ต้องยืนยันแยกต่างหาก
- หากอนาคตต้องเก็บ field ที่ SQL ต้อง decrypt ให้เพิ่ม versioned AES-256-GCM envelope และ dedicated AAD/schema migration ก่อน ห้ามนำ plaintext ลงชั่วคราว
- การ rotate HMAC key เปลี่ยนค่าดัชนีทั้งหมด จึงต้องทำ dual-key/backfill plan ห้าม rotate แบบทันทีระหว่าง Event

## 4. Plesk/MariaDB Prerequisites

ให้ Plesk administrator หรือ hosting provider ยืนยันรายการต่อไปนี้เป็นลายลักษณ์อักษร:

1. Package อนุญาต remote MariaDB TCP connection จาก fixed external IP
2. Database access rule อนุญาตเฉพาะ reserved Cloud NAT IP `/32`
3. Plesk firewall และ host firewall เปิด `3306/tcp` เฉพาะ IP เดียวกัน ห้าม `0.0.0.0/0` หรือ `::/0`
4. MariaDB เปิด `require_secure_transport=ON` หรือ policy เทียบเท่า
5. Runtime และ migration account ถูกกำหนด `REQUIRE SSL`
6. Server certificate มี SAN ตรงกับ DNS name ที่กำหนดใน `SQL_SSL_SERVERNAME` หรือมี IP SAN ตรง `203.170.190.137`
7. ส่ง CA chain ที่ใช้ตรวจ certificate โดยช่องทางปลอดภัย ไม่ใช้ certificate ที่ดึงจาก connection โดยไม่ตรวจสอบเป็น trust anchor
8. Data directory/tablespace และ backup ถูกเข้ารหัส พร้อมระบุ owner, retention และ restore procedure
9. มี connection limit, slow-query log, capacity alert และ maintenance window นอกช่วงงาน

ห้ามใช้ Plesk admin/phpMyAdmin account เป็น application account แบ่งบัญชีดังนี้:

| Account | สิทธิ์สูงสุด |
|---|---|
| Runtime | `SELECT`, `INSERT`, `UPDATE`, `DELETE` เฉพาะ schema/table ที่ใช้ |
| Migration | DDL ที่ migration ต้องใช้ เฉพาะช่วง change window |
| Backup/restore | แยกจาก runtime และเก็บโดย infrastructure owner |

Runtime ห้ามมี `DROP`, `ALTER`, `CREATE USER`, `GRANT`, `SUPER`, `FILE` หรือสิทธิ์ข้าม database

## 5. สร้าง Static Cloud Run Egress

ค่าเริ่มต้นใน `deploy/environments/*.env` คือ `SQL_STATIC_EGRESS_ENABLED=false` จึงไม่มีค่าใช้จ่ายจาก SQL VPC/NAT ที่สคริปต์สร้าง

เมื่ออนุมัติงบและต้องการสร้าง staging egress ให้ override แบบ explicit:

```bash
PROJECT_ID=cusa-reunion \
SQL_STATIC_EGRESS_ENABLED=true \
CONFIRM_SQL_STATIC_EGRESS=staging \
BOOTSTRAP_GCP=true \
BUDGET_ALREADY_CONFIGURED=true \
./scripts/release.sh bootstrap staging
```

สคริปต์จะสร้างแบบ idempotent:

- custom VPC และ `/26` subnet ใน `asia-southeast3`
- Private Google Access บน subnet
- Cloud Router
- regional reserved external IP
- Cloud NAT ที่ NAT เฉพาะ SQL egress subnet และเก็บเฉพาะ error log
- subnet-level `compute.networkUser` สำหรับ deployer และ Cloud Run service agent

Direct VPC/Cloud NAT อาจพร้อมช้าระหว่าง cold start ระบบจึง retry เฉพาะ transient network error แบบ bounded exponential backoff (`SQL_CONNECT_MAX_ATTEMPTS=6`) แต่ต้อง fail ทันทีเมื่อ auth, CA, certificate identity หรือ TLS session ผิด

หลัง bootstrap:

1. เก็บค่า `SQL_EGRESS_IP` ใน change record
2. เพิ่ม IP นี้เป็น allow rule ใน Plesk database access และ firewall
3. ทดสอบว่า IP อื่นเชื่อม `3306` ไม่ได้
4. เนื่องจาก Cloud Run ใช้ `all-traffic` ให้เพิ่ม reserved IP ใน allowlist ของ MongoDB Atlas/SMTP/external provider ที่จำกัด source IP และทดสอบ GCS/Secret Manager/KMS/LINE/Turnstile connectivity
5. เปลี่ยน reviewed config เป็น `SQL_STATIC_EGRESS_ENABLED=true`
6. ตั้ง `SQL_NETWORK_ALLOWLIST_CONFIRMED=true` หลังทดสอบ deny/allow และ dependency canary แล้วเท่านั้น

การจอง IP/Cloud NAT เริ่มมีค่าใช้จ่ายแม้ SQL ยังไม่เขียนข้อมูล จึงห้ามเปิด flag เพื่อทดลองโดยไม่มี owner และวันยกเลิก

## 6. Configuration และ Secret Contract

Protected GitHub Environment variables หรือ protected local deployment variables:

```env
SQL_DATABASE=<plesk-database-name>
SQL_USER=<least-privilege-runtime-user>
SQL_MIGRATION_USER=<separate-migration-user>
SQL_SSL_SERVERNAME=<dns-name-from-certificate>
```

Workflow ต้อง map ตัวแปรทั้งสี่จาก GitHub Environment เข้าสู่ release โดยตรง ค่าที่ตั้งในหน้า GitHub แต่ไม่ได้ map เข้า job `env` ถือว่ายังไม่พร้อม deploy

Reviewed non-secret config เมื่อพร้อมเปิด staging:

```env
SQL_ENABLED=true
VERIFY_SQL_TRANSPORT=true
SQL_DIALECT=mariadb
SQL_PROVIDER=plesk
SQL_HOST=203.170.190.137
SQL_EXPECTED_HOST=203.170.190.137
SQL_PORT=3306
SQL_SSL_MODE=verify_identity
SQL_SSL_CA_SECRET_NAME=SQL_SSL_CA
SQL_SSL_IP_SAN_CONFIRMED=false
SQL_AT_REST_ENCRYPTION_CONFIRMED=true
SQL_BACKUP_ENCRYPTION_CONFIRMED=true
SQL_STATIC_EGRESS_ENABLED=true
SQL_NETWORK_ALLOWLIST_CONFIRMED=true
SQL_PRIMARY_STORE=false
SQL_MIRROR_REQUIRE_PROTECTED_VALUES=true
```

Secret Manager payload ที่ต้อง supply ผ่านไฟล์ local permission `0600` หรือ secure process input โดยห้ามใส่ใน command line/log:

- `SQL_PASSWORD`
- `SQL_MIGRATION_PASSWORD`
- `SQL_SSL_CA`
- `SQL_MIRROR_IDENTITY_HASH_SECRET`

จากนั้นรัน `ALLOW_SECRET_UPLOAD=true ./scripts/release.sh secrets staging` และ review เฉพาะ version resource ใน pin file

## 7. Activation Flow

1. เก็บ `SQL_ENABLED=false` ระหว่างเตรียม Plesk, certificate, backup และ static IP
2. สร้าง static egress และให้ Plesk allowlist reserved IP
3. ตรวจ deny จาก source อื่น และตรวจ certificate SAN/expiry/chain
4. สร้าง runtime/migration account แยกกันและ rotate password เริ่มต้น
5. Sync/pin `SQL_PASSWORD`, `SQL_MIGRATION_PASSWORD`, `SQL_SSL_CA` และ mirror HMAC key แล้วตรวจ IAM ว่า runtime account อ่าน migration password ไม่ได้
6. เปิด SQL ใน staging พร้อม confirmation flags ทั้งหมด โดยยังคง `SQL_PRIMARY_STORE=false`
7. รัน `./scripts/release.sh deploy staging`
8. Pipeline ต้อง execute read-only `SERVICE-sql-transport` job ก่อน migration และต้องได้ `transport=tcp_tls`, `tlsActive=true`
9. เมื่อ `RUN_SQL_MIGRATIONS=true` pipeline ต้อง execute migration job จริงด้วย `--execute-now`, task 1, retry 0 และ advisory lock
10. รัน backfill แบบ dry-run, validation, apply, rerun และ reconciliation ตาม `HYBRID_DB_MIGRATION_PLAN.md`
11. รัน `SQL_PROTECTION_AUDIT=true npm run audit:sql-protection` จาก approved Cloud Run/maintenance context; ทุก violation count ต้องเป็นศูนย์
12. เปิด `SQL_MIRROR_ENABLED=true` และ `SQL_OUTBOX_ENABLED=true` เฉพาะหลัง staging canary ผ่าน
13. สังเกตอย่างน้อยหนึ่ง Event cycle ก่อนพิจารณา production mirror

Transport check เป็น read-only (`SELECT 1` และ `SHOW SESSION STATUS LIKE 'Ssl_cipher'`) และ output ต้องไม่มี host credential, CA หรือ cipher detail

## 8. Verification และ Acceptance

ต้องมีหลักฐานต่อ environment:

- Cloud Run revision/job ใช้ Direct VPC egress `all-traffic` และ subnet ที่กำหนด
- Reserved NAT IP ตรงกับ Plesk allow rule เพียงรายการที่อนุมัติ
- Connection จาก Cloud Run ผ่าน แต่ source ที่ไม่ allowlist ถูกปฏิเสธ
- MongoDB, object storage, Secret Manager/KMS, SMTP, LINE/Turnstile และ external integration ที่เปิดใช้ยังผ่านเมื่อ egress ทั้งหมดออก reserved NAT IP
- TLS session มี `Ssl_cipher` ไม่ว่าง
- Certificate identity ตรง DNS/IP SAN และ `rejectUnauthorized=true`
- Runtime account ทำ CRUD ที่จำเป็นได้แต่ DDL/GRANT ไม่ได้
- Migration account ใช้ได้เฉพาะ migration job/change window
- Plesk disk/tablespace encryption evidence พร้อม owner
- Encrypted backup restore สำเร็จตาม RPO/RTO
- SQL mirror row ไม่มี raw QR, raw idempotency key, verification code, receipt number, LINE ID หรือ PII
- Protection aggregate audit ของ QR/token/receipt และ participant blind index ทุกชนิดต้องเป็นศูนย์ และ source-to-HMAC reconciliation ต้องตรงเพื่อจับกรณี legacy value ที่บังเอิญมีรูปแบบ 64 hex
- Count/checksum/amount/reconciliation ผ่าน และ dead-letter เป็นศูนย์
- Public health แสดงเพียง `up/down/disabled` ไม่เปิด SQL endpoint
- Forecast GCP รวม Cloud Run, VPC/NAT/IP, GCS, Logging, Secret Manager, KMS และ Firestoreไม่เกิน 1,000 บาท/เดือน

## 9. Failure และ Rollback

- TLS identity/CA/SAN fail: ห้าม bypass ด้วย `required`, `verify_ca`, `SQL_ALLOW_UNVERIFIED_TLS` หรือ insecure flag ใน production
- Plesk remote access unavailable: คง `SQL_ENABLED=false`; Phase 1 ทำงานบน MongoDB ต่อได้
- SQL transport job fail: pipeline หยุดก่อน migration/candidate และ traffic เดิมไม่เปลี่ยน
- Migration fail: pipeline หยุดก่อน candidate; restore เฉพาะตาม approved migration rollback ไม่แก้ schema ด้วยมือทันที
- Mirror lag/dead-letter/mismatch: ปิด outbox/mirror read, กลับ report ไป MongoDB และเก็บ SQL เพื่อ forensic
- Credential suspected leak: disable Secret version/account, rotate, pin version ใหม่, deploy canary และตรวจ access log
- Reserved IP เปลี่ยน: ถือเป็น security incident/change request ต้องแก้ Plesk allowlistก่อนเปิด SQL ใหม่

การตั้ง `SQL_STATIC_EGRESS_ENABLED=false` ทำให้ release ถัดไปส่ง `--clear-network` เพื่อตัด Direct VPC ออกจาก revision ใหม่ แต่ไม่ได้ลบ NAT/IP ที่สร้างแล้ว การลบ resource เพื่อลดค่าใช้จ่ายต้องทำหลังยืนยันว่า service/job/revision ที่รับ traffic ทุกตัวเลิกใช้ network และมี infrastructure approval

## 10. Cost Guardrail

- `SQL_EGRESS_MONTHLY_BUDGET_THB` เริ่มที่ 200 บาท แต่เป็น planning cap ไม่ใช่ hard billing cap
- Total project budget ยังเป็น 1,000 บาท/เดือน และ Billing Budget เป็น alert ไม่ใช่การตัดบริการ
- เมื่อเปิด static egress สคริปต์บังคับ planning allocation `GCS 700 + SQL egress 200 + core reserve 100 <= 1,000` ก่อน provision; หากค่า forecast จริงสูงกว่านี้ต้องลด optional workload หรือขออนุมัติงบ
- Static IP, Cloud Router/NAT processing, network egress และ log ต้องรวมใน monthly review
- เมื่อเปิด SQL egress ต้องลด budget reserve ของ optional GCS/KMS/Firestore หาก forecast รวมเกิน 1,000 บาท
- SQL mirror poll/batch และ Cloud Run max instances ต้องคง bounded; ห้ามแก้ให้ polling ถี่ขึ้นโดยไม่มี load/cost proof
- MariaDB บน Plesk อาจรวมในค่าบริการ hosting แต่ต้องตรวจ quota connection/storage/backup/traffic เพราะอาจมีค่าเกินแพ็กเกจ

## 11. Bug/Security Findings ที่ปิดแล้ว

- ปิด production break-glass ที่ยอม TLS แบบไม่ตรวจ identity
- เพิ่ม certificate DNS/IP SAN validation และ TLS 1.2 minimum
- เพิ่ม runtime check ว่า session มี `Ssl_cipher` จริง
- บังคับ endpoint ตรง `SQL_EXPECTED_HOST`
- บังคับ static egress, Plesk allowlist, at-rest encryption และ encrypted backup confirmations
- เปลี่ยน raw participant/vendor QR, idempotency key, verification code และ receipt number เป็น HMAC ก่อน SQL write
- เพิ่ม fail-closed เมื่อ mirror protection key ขาด/สั้น
- ทำ migration execution ให้ explicit ด้วย `--execute-now --wait` แม้ Google Cloud CLI ปัจจุบันระบุว่า `--wait` เดิม imply execution อยู่แล้ว
- เพิ่ม read-only SQL transport job ก่อน migration/deploy เมื่อเปิด SQL
- เพิ่ม bounded retry สำหรับ Direct VPC cold start โดยไม่ retry auth/TLS policy failure

## 12. External Blockers ที่โค้ดแก้แทนไม่ได้

- Hosting provider ต้องเปิด remote MariaDB access ให้ package นี้
- ต้องได้รับ CA chain และ DNS/IP SAN ที่ตรวจสอบได้
- ต้องได้รับหลักฐาน data-at-rest และ backup encryption
- ต้องสร้าง/ทดสอบ runtime กับ migration account จริง
- ต้อง provision reserved Cloud NAT IP แล้วนำไป allowlist ใน Plesk
- ต้องทำ encrypted restore, staging backfill, reconciliation, load และ rollback drill

จนกว่ารายการเหล่านี้ครบ ค่าใน repository ต้องคง `SQL_ENABLED=false`, `SQL_STATIC_EGRESS_ENABLED=false` และ confirmation flags เป็น `false`

## 13. Authoritative References

- [Plesk custom database access rules](https://docs.plesk.com/en-US/obsidian/administrator-guide/website-management/website-databases/setting-up-custom-access-rules.73491/)
- [Plesk remote database access](https://docs.plesk.com/en-US/obsidian/administrator-guide/database-servers/remote-access-to-databases.73509/)
- [Plesk secure remote MariaDB connections](https://docs.plesk.com/en-US/obsidian/administrator-guide/80017/)
- [MariaDB requiring TLS](https://mariadb.com/docs/server/security/securing-mariadb/encryption/data-in-transit-encryption/data-in-transit-encryption-requiring-tls-on-mariadb-server)
- [MariaDB secure connection identity](https://mariadb.com/docs/server/security/encryption/data-in-transit-encryption/secure-connections-overview)
- [Cloud Run static outbound IP](https://cloud.google.com/run/docs/configuring/static-outbound-ip)
- [Cloud Run Direct VPC egress](https://cloud.google.com/run/docs/configuring/vpc-direct-vpc)
- [Cloud NAT pricing](https://cloud.google.com/nat/pricing)
