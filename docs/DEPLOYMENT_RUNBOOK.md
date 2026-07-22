# PSEvent Automated Deployment Runbook

เอกสารนี้เป็นขั้นตอนปฏิบัติสำหรับ CI/CD, Google Cloud bootstrap, Secret Manager, deployment, migration และ rollback ของ PSEvent โดยใช้ `scripts/release.sh` เป็น entrypoint เดียว การตั้งค่า public domain ให้ใช้ [PLESK_WEB_GATEWAY_RUNBOOK.md](PLESK_WEB_GATEWAY_RUNBOOK.md) และการเชื่อม MariaDB ให้ใช้ [PLESK_MARIADB_RUNBOOK.md](PLESK_MARIADB_RUNBOOK.md) ร่วมกัน

## 1. Deployment Architecture

- GitHub เป็น source control และ CI/CD control plane
- GitHub Actions ขอ short-lived OIDC token และ impersonate deployer service account ผ่าน Workload Identity Federation
- Canonical public web `reunion.scicu-alumni.com` รัน React SPA และ Node.js same-origin gateway บน Plesk
- Browser เรียก `/api` ที่ Plesk origin เดียวกัน แล้ว gateway proxy เฉพาะ `/api`, `/health`, `/uploads` ไป Cloud Run backend
- Cloud Run image ยังมี frontend fallback สำหรับ diagnostic/rollback แต่ไม่ใช่ canonical public origin หลัง Plesk go-live
- Artifact Registry เก็บ image แบบ unique tag; deployment ใช้ immutable digest
- Runtime โหลด Secret Manager version ที่ pin ไว้ผ่าน ADC ของ runtime service account
- GCS bucket แยก environment, private, regional `asia-southeast3` และ scale-to-zero เป็นค่าเริ่มต้น
- เมื่อเปิด MariaDB เท่านั้น Cloud Run service/migration job ใช้ Direct VPC egress, Cloud NAT และ reserved IP ไปยัง Plesk `203.170.190.137:3306`

สคริปต์เก่า `deploy-cloudrun.sh` และ `deploy-cloudrun-split.sh` เป็น compatibility wrapper ที่ส่งต่อเข้า pipeline เดียวเท่านั้น

## 2. Command Contract

```bash
./scripts/release.sh ci
./scripts/release.sh plan staging
./scripts/release.sh bootstrap staging
./scripts/release.sh secrets staging
./scripts/release.sh deploy staging
./scripts/release.sh rollback staging REVISION_NAME
./scripts/release.sh plesk plan
./scripts/release.sh plesk deploy
./scripts/release.sh plesk rollback
./scripts/release.sh plesk smoke
./scripts/release.sh all staging
```

| Command | การเปลี่ยนแปลงระบบ | Gate |
|---|---|---|
| `ci` | ติดตั้ง dependency และสร้าง local artifacts ที่ ignore | ไม่มี Cloud credential |
| `plan` | read-only Google Cloud/config validation | ต้องอ่าน project metadata ได้ |
| `bootstrap` | สร้าง API/IAM/Artifact Registry/GCS/service shell และ optional SQL egress | `BOOTSTRAP_GCP=true`; SQL egress ต้องมี confirmation เพิ่ม |
| `secrets` | สร้างหรือ pin Secret Manager versions | `ALLOW_SECRET_UPLOAD=true` |
| `deploy` | test, build/push, optional migration, rollout | clean Git source; production มี confirmation |
| `rollback` | เปลี่ยน Cloud Run traffic | revision ที่พร้อมใช้งาน |
| `plesk` | plan/build/deploy/rollback/smoke Plesk web gateway | Node.js 22; deploy ต้องมี public build config |
| `all` | CI + bootstrap + optional staging Secret + deploy | ใช้สำหรับ first staging setup; production pin ต้อง review ก่อน |

ห้ามใช้ `set -x` ขณะทำ Secret operation และห้ามนำ output runtime YAML ไปแนบ issue/chat เพราะมี resource mapping แม้ไม่มี payload

## 3. Prerequisites

- Node.js 22 และ npm ที่มากับ Node 22, Docker/Buildx, Google Cloud CLI, `curl`, `jq` และ Git; `.nvmrc`/`.node-version` ต้องตรงกับ GitHub และ Docker
- Google Cloud project ที่ผูก billing แล้ว
- Project target ปัจจุบันคือ `cusa-reunion`; local `gcloud`, GitHub Environment variable และ Secret pin ทุกตัวต้องตรงกัน
- ผู้รัน bootstrap มีสิทธิ์เปิด API, จัดการ IAM/service account, Artifact Registry, Cloud Run, GCS และ WIF
- `backend/.env` สำหรับ initial Secret source ต้องอยู่นอก Git และ permission จำกัดผู้ใช้
- Cloudflare Turnstile production widget ต้องอนุญาต hostname ของ `PUBLIC_WEB_ORIGIN`; Cloud Run hostname คงอยู่เฉพาะ fallback ที่ตรวจไว้
- MongoDB ต้องอนุญาต network จาก Cloud Run และบังคับ TLS/authentication
- ก่อนเปิด SQL ต้องให้ Plesk เปิด remote MariaDB เฉพาะ reserved NAT IP, มี certificate CA/SAN และมีหลักฐาน encrypted storage/backup

ตรวจเครื่องและแผนโดยไม่แก้ resource:

```bash
PROJECT_ID=your-project-id ./scripts/release.sh plan staging
```

`plan` ที่ขึ้น `BLOCKED` เพราะ pin ยังว่างถือว่าถูกต้องสำหรับ environment ใหม่

## 4. First-time Staging Bootstrap

### 4.1 ตรวจ quality gate

```bash
CI_DOCKER_BUILD=true ./scripts/release.sh ci
```

ต้องผ่าน backend tests, frontend lint/build, High/Critical audit, secret scan, deployment tests และ Docker build ก่อน bootstrap

### 4.2 สร้าง Google Cloud resources

```bash
PROJECT_ID=your-project-id \
GITHUB_REPOSITORY=owner/repository \
BOOTSTRAP_GCP=true \
BUDGET_CREATE=true \
./scripts/release.sh bootstrap staging
```

หาก billing account ไม่ใช้ THB หรือผู้รันไม่มี Budget Admin ให้สร้าง Billing Budget ใน console แล้วใช้ `BUDGET_ALREADY_CONFIGURED=true` ในรอบถัดไป ค่า threshold ที่ต้องมีคือ 50%, 80%, 90% และ 100%

Bootstrap จะ:

1. เปิด API ที่จำเป็น
2. สร้าง Artifact Registry และ cleanup policy แบบ dry-run
3. สร้าง runtime, migration และ deployer service account
4. ให้ deployer เฉพาะ Cloud Run Developer, repository Writer, service usage และ `actAs` ที่จำเป็น
5. สร้าง WIF provider ที่จำกัด numeric repository ID, owner ID และ `refs/heads/main`
6. สร้าง private GCS bucket ใน Bangkok พร้อม lifecycle
7. สร้าง scale-to-zero public Cloud Run service shell เพื่อให้ operator เป็นผู้ตั้ง invoker IAM ครั้งเดียว

อย่าเปิด `ARTIFACT_CLEANUP_ACTIVE=true` จนตรวจ dry-run audit อย่างน้อยหนึ่งรอบแล้ว

### 4.2.1 Optional Plesk MariaDB static egress

ขั้นตอนนี้ยังไม่ต้องรันสำหรับ Phase 1 ที่ `SQL_ENABLED=false` เพราะ reserved IP/NAT มีค่าใช้จ่าย หลังอนุมัติให้สร้าง staging ด้วย gate สองชั้น:

```bash
PROJECT_ID=cusa-reunion \
SQL_STATIC_EGRESS_ENABLED=true \
CONFIRM_SQL_STATIC_EGRESS=staging \
BOOTSTRAP_GCP=true \
BUDGET_ALREADY_CONFIGURED=true \
./scripts/release.sh bootstrap staging
```

นำ `SQL_EGRESS_IP` จาก output ไป allowlist `/32` ใน Plesk ก่อนตั้ง `SQL_NETWORK_ALLOWLIST_CONFIRMED=true` รายละเอียดและ deny test อยู่ใน `docs/PLESK_MARIADB_RUNBOOK.md`

เพราะ Direct VPC ใช้ `all-traffic` ต้องตรวจ/แก้ IP allowlist ของ MongoDB Atlas, SMTP และ external provider อื่นด้วย แล้วให้ candidate readiness ทดสอบ dependency ทั้งหมดก่อน promote

### 4.3 Initial Secret synchronization

ตรวจ `backend/.env` ว่ามี integration credential ที่ generate ไม่ได้ เช่น MongoDB, Turnstile และ SMTP/LINE/OAuth ที่เปิดใช้ แล้วรัน:

```bash
PROJECT_ID=your-project-id \
ALLOW_SECRET_UPLOAD=true \
LOAD_LOCAL_DEPLOY_CONFIG=true \
./scripts/release.sh secrets staging
```

พฤติกรรมสำคัญ:

- Secret ใหม่ประเภท signing key สร้าง random 256 bit ได้
- Secret integration ที่ขาดจะ fail โดยไม่สร้าง placeholder
- Secret ที่มีอยู่จะ pin enabled version ล่าสุดและไม่ rotate
- ต้องตั้ง `ROTATE_SECRETS=true` จึงเพิ่ม version จาก source value ใหม่
- Output `deploy/secret-versions/staging.json` มีเฉพาะ resource/version identifier และต้อง review ก่อน commit
- Renderer/runtime ต้อง reject pin ที่ไม่อยู่ project เดียวกับ deployment, prefix ผิด environment, secret ID ไม่ตรง logical name หรือ version ไม่ใช่ตัวเลข
- `backend/.env` เป็นแหล่ง Secret payload เท่านั้น ค่า credential ในไฟล์ต้องไม่เปิด Google Drive, LINE, SQL หรือ integration อื่นโดยปริยาย
- `LOAD_LOCAL_DEPLOY_CONFIG=true` อ่านได้เฉพาะ non-secret allowlist เช่น SMTP host/from, admin OAuth client ID และ public channel ID โดยไม่พิมพ์ค่าออก log
- Production-like environment ห้ามใช้ `MOCK_EMAIL=true`; OTP, recipient, subject และ message body ห้ามปรากฏใน Cloud Logging

ตรวจ diff โดยห้ามเห็น payload:

```bash
git diff -- deploy/secret-versions/staging.json
./scripts/release.sh plan staging
```

### 4.4 Staging deployment

หลัง commit pin metadata และ source แล้ว:

```bash
PROJECT_ID=your-project-id \
LOAD_LOCAL_DEPLOY_CONFIG=true \
VITE_CF_TURNSTILE_SITE_KEY=public-site-key \
./scripts/release.sh deploy staging
```

สำหรับ first staging trial บน local สามารถใช้ `all` พร้อม temporary pins ได้ แต่หลังผ่านต้องรัน `secrets` แยกและ commit pin metadata ก่อนเปิด GitHub CD:

```bash
PROJECT_ID=your-project-id \
BOOTSTRAP_GCP=true \
ALLOW_SECRET_UPLOAD=true \
SYNC_SECRETS=true \
LOAD_LOCAL_DEPLOY_CONFIG=true \
VITE_CF_TURNSTILE_SITE_KEY=public-site-key \
./scripts/release.sh all staging
```

## 5. GitHub Configuration

### 5.1 Repository variable

สร้าง repository variable:

| Name | Initial value |
|---|---|
| `CD_ENABLED` | `false` |

`CD_ENABLED` ต้องอยู่ระดับ repository เพราะ job condition ถูกประเมินก่อน environment secrets/variables พร้อมใช้งาน

### 5.2 Environment variables

สร้าง GitHub Environments ชื่อ `staging` และ `production` แล้วตั้งค่าต่อ environment:

| Variable | ตัวอย่าง | Secret หรือไม่ |
|---|---|---|
| `GCP_PROJECT_ID` | `cusa-reunion` | ไม่ใช่ |
| `WIF_PROVIDER` | `projects/123/locations/global/workloadIdentityPools/psevent-github/providers/github` | ไม่ใช่ |
| `DEPLOYER_SERVICE_ACCOUNT` | `psevent-deployer-staging@...` | ไม่ใช่ |
| `APP_ORIGIN` | deterministic `https://service-projectnumber.region.run.app` สำหรับ Cloud Run deploy/smoke | ไม่ใช่ |
| `PUBLIC_WEB_ORIGIN` | `https://reunion.scicu-alumni.com` สำหรับ link/callback/QR/object URL | ไม่ใช่ |
| `VITE_CF_TURNSTILE_SITE_KEY` | Turnstile public site key | ไม่ใช่ Secret |
| `VITE_GOOGLE_CLIENT_ID` | OAuth public client ID เมื่อเปิดใช้ | ไม่ใช่ Secret |
| `VITE_LIFF_ID` | LIFF public ID เมื่อเปิดใช้ | ไม่ใช่ Secret |
| `SMTP_HOST` | SMTP endpoint เมื่อเปิด Email OTP | ไม่ใช่ Secret |
| `SMTP_PORT` | ค่าเริ่มต้น `587` | ไม่ใช่ Secret |
| `SMTP_SECURE` | `true`/`false` ตาม provider | ไม่ใช่ Secret |
| `SMTP_FROM` | Verified sender; เว้นว่างเพื่อใช้ `SMTP_USER` | ไม่ใช่ Secret |
| `LOGIN_CLIENT_ID` | Admin Google OAuth public client ID; fallback จาก `VITE_GOOGLE_CLIENT_ID` | ไม่ใช่ Secret |
| `LINE_LOGIN_ENABLED` | เปิดเมื่อ Channel ID/Secret และ callback พร้อมแล้วเท่านั้น | ไม่ใช่ Secret |
| `LINE_LOGIN_CHANNEL_ID` | LINE Login public Channel ID | ไม่ใช่ Secret |
| `SQL_DATABASE` | ชื่อ database จาก Plesk; restricted variable | ไม่ใช่ Secret payload แต่ห้าม commit |
| `SQL_USER` | least-privilege runtime user; restricted variable | ไม่ใช่ Secret payload แต่ห้าม commit |
| `SQL_MIGRATION_USER` | แยกจาก runtime user; restricted variable | ไม่ใช่ Secret payload แต่ห้าม commit |
| `SQL_SSL_SERVERNAME` | DNS SAN ใน MariaDB certificate | ไม่ใช่ Secret |

ห้ามเพิ่ม MongoDB URI, JWT, SMTP password, LINE token, OAuth client secret หรือ service-account JSON ใน GitHub

Workflow map `SQL_DATABASE`, `SQL_USER`, `SQL_MIGRATION_USER` และ `SQL_SSL_SERVERNAME` จาก `vars` เข้า release แล้ว ห้ามใส่ค่าจริงลง `deploy/environments/*.env`; ถ้าขาดตัวใด activation gate ต้องหยุดก่อน build

`PARTICIPANT_EMAIL_LOGIN_ENABLED=true` ต้องมี `SMTP_HOST`, `SMTP_USER` และ `SMTP_PASS` ครบ โดย user/password อยู่ Secret Manager หน้า login ต้องอ่าน `GET /api/participant-auth/providers` และแสดงเฉพาะ provider ที่พร้อมใช้งาน

ห้ามตั้ง `PORT`, `K_SERVICE`, `K_REVISION`, `K_CONFIGURATION` หรือชื่อขึ้นต้น `X_GOOGLE_` ใน environment config/GitHub variables สำหรับ Cloud Run โดยเด็ดขาด สคริปต์กำหนด container port ด้วย `--port 8080` และ Cloud Run จะ inject runtime contract variables เอง; renderer และ deployment contract test ต้องปฏิเสธค่าที่สงวนไว้ก่อนสร้าง revision

`APP_ORIGIN` และ `PUBLIC_WEB_ORIGIN` ต้องแยกกัน: ค่าแรกใช้เข้าถึง Cloud Run โดยตรงใน release transaction ส่วนค่าหลังใช้สร้าง URL ที่ส่งให้ผู้ใช้ Runtime ต้อง allow CORS ทั้งสอง origin แบบ exact match แต่ห้ามใช้ wildcard ใน production

### 5.3 Environment protection

Production Environment ต้องตั้ง:

- Required reviewers อย่างน้อย 1 คน
- Prevent self-review เมื่อ GitHub plan รองรับ
- Deployment branch จำกัด `main`
- Environment admin จำกัด platform/security owner

Repository `main` ต้องเปิด:

- Require pull request
- Require `CI / quality`
- Require conversation resolution
- Block force push และ branch deletion
- CODEOWNERS review สำหรับ `.github`, `scripts`, `deploy`, security config และ migration

เมื่อ staging deployment และ rollback drill ผ่านแล้วจึงเปลี่ยน `CD_ENABLED=true`

## 6. Routine Release Flow

### Staging

Push/merge เข้า `main` จะรัน CI และ deploy staging เมื่อ `CD_ENABLED=true` โดย deployment script จะรัน quality gate ซ้ำก่อน release

### Production

1. เปิด Actions > Deploy > Run workflow
2. เลือก branch `main`
3. เลือก environment `production`
4. Reviewer ตรวจ commit, CI, schema compatibility, Secret pins, cost และ rollback revision
5. Approve GitHub Environment deployment

Local production deploy ใช้ได้เฉพาะ incident/controlled operation:

```bash
PROJECT_ID=your-production-project \
CONFIRM_PRODUCTION_DEPLOY=production \
VITE_CF_TURNSTILE_SITE_KEY=public-site-key \
./scripts/release.sh deploy production
```

Routine production ควรใช้ GitHub เพื่อคง audit trail และ approval

## 7. Deployment Transaction

`deploy` ทำตามลำดับนี้:

1. ปฏิเสธ dirty production source และ release ID ที่ไม่ใช่ Git SHA
2. รัน test/lint/build/audit/deployment tests
3. Build image ด้วย unique run tag, push และอ่าน digest
4. เมื่อเปิด SQL ให้ execute read-only authenticated-TLS transport job
5. รัน SQL migration job เมื่อเปิด gate
6. บันทึก revision ที่รับ traffic 100%
7. Deploy digest เป็น candidate `--no-traffic`
8. ตรวจ live release ID, dependency readiness และ root SPA
9. Route 100% ไป revision ใหม่
10. ตรวจ canonical URL ซ้ำ
11. Rollback อัตโนมัติเมื่อ post-promotion smoke test fail
12. ลบ candidate tag

หาก service มี intentional traffic split สคริปต์จะหยุด เพราะไม่สามารถเลือก rollback target ที่ปลอดภัยโดยอัตโนมัติ

## 8. Database Migration

ค่าเริ่มต้น `SQL_ENABLED=false` และ `RUN_SQL_MIGRATIONS=false`

ก่อนเปิด migration:

- ใช้ expand/contract migration และพิสูจน์ว่า app revision เก่ายังทำงานบน schema ใหม่
- Backup และ restore test สำเร็จ
- `SQL_MIGRATION_PASSWORD` อยู่ Secret Manager, migration SA อ่านได้ และ runtime SA ถูกถอนสิทธิ์อ่าน secret นี้
- SQL password/TLS CA/mirror HMAC key อยู่ pinned Secret Manager version
- Plesk host ต้องเป็น `203.170.190.137`, TLS `verify_identity`, static egress และ `/32` allowlist ผ่านแล้ว
- Plesk storage และ backup encryption confirmations เป็น `true`
- `VERIFY_SQL_TRANSPORT=true`; read-only Cloud Run transport job ต้องผ่านก่อน migration
- Migration plan/checksum ผ่าน staging

เมื่อเปิด ระบบจะ execute transport verification job ก่อน จากนั้น execute migration Cloud Run Job ด้วย image digest เดียวกัน, task เดียว, retry 0, `--execute-now` และ advisory lock หาก job fail pipeline จะหยุดก่อนเปลี่ยน traffic การ deploy job definition โดยไม่ execute ถือว่าไม่ผ่าน migration gate

ห้ามใส่ MongoDB backfill, encryption rewrite, destructive migration หรือ source-of-truth cutover ใน routine deploy

## 9. Rollback

ระบุ revision ที่ตรวจแล้ว:

```bash
PROJECT_ID=your-project-id \
./scripts/release.sh rollback production psevent-production-r1234567-123456789
```

หากไม่ระบุ สคริปต์เลือก ready revision ก่อนหน้าที่ไม่ใช่ revision ปัจจุบัน:

```bash
PROJECT_ID=your-project-id ./scripts/release.sh rollback staging
```

หลัง rollback ต้องตรวจ:

- `/health/ready` ผ่าน
- Login, registration, wallet payment และ upload flow ที่เกี่ยวข้อง
- Schema ยัง backward compatible
- ไม่มี transaction/reconciliation gap
- Incident record มี timeline, revision/digest, impact, owner และ corrective action

Rollback traffic ไม่ rollback database, Secret version หรือ external side effect โดยอัตโนมัติ

## 10. Secret Rotation

1. Backup pin file เดิมและบันทึก active revision
2. ใส่ค่าใหม่ใน secure local source/process environment
3. รัน `ROTATE_SECRETS=true ALLOW_SECRET_UPLOAD=true ./scripts/release.sh secrets staging`
4. Review/commit version resource ที่เปลี่ยน
5. Deploy staging candidate และทดสอบ flow จริง
6. ทำ production ผ่าน PR/approval
7. รอ rollback window ก่อน disable version เดิม

ห้าม destroy Secret/version เดิมก่อนยืนยันว่าไม่มี ready revision หรือ migration job อ้างถึง

## 11. Cost Controls

- Cloud Run/GCS อยู่ `asia-southeast3`, min instances 0, staging max 2, production max 3
- Frontend/backend รวม service เดียว
- GCS Standard regional, lifecycle payment slip, unlinked cleanup และ soft deleteไม่เกิน 7 วัน
- Artifact Registry เริ่ม cleanup dry-run, เก็บล่าสุด 10, ลบเก่ากว่า 30 วันหลังอนุมัติ
- KMS, Firestore, SQL mirror และ managed SQL ปิดจนมี forecast/approval
- Plesk SQL reserved IP/NAT ปิดเป็นค่าเริ่มต้น มี planning cap 200 THB/เดือน และต้องรวมใน project forecast เดียวกัน
- Static SQL provisioning ต้องผ่าน allocation check `GCS budget + SQL egress budget + core reserve <= total project budget`; ค่าเริ่มต้นคือ `700 + 200 + 100 = 1,000 THB`
- Billing Budget รวม project ไม่เกิน 1,000 THB/เดือน พร้อม threshold 50/80/90/100%
- ตรวจ Cloud Logging ingestion/retention เพราะ log อาจเป็นค่าใช้จ่ายที่โตโดยไม่สัมพันธ์กับ request

Billing Budget เป็น alert ไม่ใช่ hard cap; max instances และ application operation guardrail เป็นตัวจำกัด blast radius

## 12. Common Failures

| Symptom | การตรวจและการแก้ |
|---|---|
| `Missing pinned Secret Manager versions` | รัน `secrets`, review pin file และตรวจ feature flags |
| OIDC auth denied | ตรวจ numeric repo/owner, branch `main`, WIF provider และ service-account binding |
| Candidate startup fail | อ่าน Cloud Run revision log โดยไม่เผย Secret; ตรวจ Secret IAM, Mongo, GCS policy และ Turnstile hostname |
| Candidate ready fail | ตรวจ `/health/ready` dependency status และ service account ของ environment |
| Docker push denied | ตรวจ Artifact Registry repository Writer และ `serviceusage.services.use` |
| GCS validation fail | ตรวจ region, PAP, uniform access, lifecycle, versioning/autoclass และ runtime bucket metadata role |
| SQL transport job fail | รอ bounded Direct VPC cold-start retry; จากนั้นตรวจ reserved NAT IP/Plesk allowlist, `verify_identity`, CA pin, certificate SAN และ `Ssl_cipher`; ห้าม bypass TLS |
| SQL activation blocked | ตรวจ at-rest/backup confirmations, protected database/user variables และ static egress flags ตาม Plesk MariaDB runbook |
| Production job skipped | ตรวจ `CD_ENABLED`, manual environment input, branch `main` และ environment approval |
| Revision suffix exists | Pipeline ใช้ run ID; rerun workflow ใหม่แทนการแก้ revision เดิม |
| Budget create fail | ตรวจ billing currency/account และ Billing Account Costs Manager/Budget Admin permission |

## 13. Authoritative References

- [Google Cloud Run deployment](https://cloud.google.com/run/docs/deploying)
- [Cloud Run traffic migration and rollback](https://cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)
- [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [Google Workload Identity Federation for deployment pipelines](https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
- [Google GitHub Actions authentication](https://github.com/google-github-actions/auth)
- [Secret Manager with Cloud Run](https://cloud.google.com/run/docs/configuring/services/secrets)
- [Artifact Registry cleanup policies](https://cloud.google.com/artifact-registry/docs/repositories/cleanup-policy)
- [Cloud Storage locations](https://cloud.google.com/storage/docs/locations)
- [Cloud Run static outbound IP](https://cloud.google.com/run/docs/configuring/static-outbound-ip)
- [Cloud Run Direct VPC egress](https://cloud.google.com/run/docs/configuring/vpc-direct-vpc)
- [Cloud NAT pricing](https://cloud.google.com/nat/pricing)
