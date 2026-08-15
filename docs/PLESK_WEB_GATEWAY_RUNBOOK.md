# Plesk Web Gateway Manual Deployment Runbook

คู่มือนี้กำหนดการ deploy แบบที่ผู้ดูแลกดเองสำหรับ
`https://reunion.scicu-alumni.com`: Plesk ให้บริการ React SPA และ Node.js
same-origin gateway ส่วน Cloud Run รัน backend/API และเป็น component เดียวที่เข้าถึง
MongoDB, Secret Manager, GCS, KMS, Firestore, Brevo/SMTP fallback และ MariaDB

สถานะเป้าหมาย:

- Google Cloud project: `cusa-reunion`
- Plesk Git repository: `https://github.com/piya46/RegisterSystem_Sci.git`
- Plesk Git branch: `main`
- Plesk deployment mode: manual
- Public origin: `https://reunion.scicu-alumni.com`
- Staging backend:
  `https://psevent-staging-841769493273.asia-southeast3.run.app`
- Production backend:
  `https://psevent-production-841769493273.asia-southeast3.run.app`
- GitHub Actions ห้าม pull, deploy หรือเรียก webhook ของ Plesk

สถานะตรวจจริง 2026-08-15:

- Domain และ HTTPS ตอบสนองแล้ว แต่ Plesk Node.js แจ้งว่า application startup file
  `app.js` ยังไม่มี เพราะยังไม่ได้ติดตั้ง web gateway release
- Hostatom มี Node.js `24.19.0` และ Plesk Git repository
  `RegisterSystem_Sci.git` ติดตาม branch `main` โดย deployment target เป็น
  `/reunion.scicu-alumni.com`
- หน้าจอวันที่ตรวจพบยังแสดง Automatic deployment ต้องเปลี่ยนเป็น Manual
  deployment ก่อน `Pull now`
- Git additional deployment action รันใน restricted chroot ที่ไม่มี `dirname`
  และ Node.js จึงต้องปิด action และ deploy frontend artifact ที่ CI ตรวจแล้วจาก Git
  โดยตรง; checksummed File Manager bundle ตามหัวข้อ 3.1 เป็น fallback เท่านั้น
- Cloud Run production revision พร้อมและ readiness ผ่านแล้วที่ deterministic URL
  ด้านบน
- การผ่าน `production-readiness --web` ยืนยันเฉพาะ configuration contract
  เท่านั้น ต้องติดตั้ง Plesk bundle, restart application และผ่าน external smoke
  test ก่อนถือว่า public web พร้อมใช้งาน

## 1. Architecture

```text
Browser
  |
  | HTTPS https://reunion.scicu-alumni.com
  v
Plesk Node.js 22.22.x or 24.x LTS
  |- React SPA/static assets
  |- /gateway/health/* local health
  `- /api, /health, /uploads -> HTTPS proxy
                                  |
                                  v
                         Cloud Run backend/API
                           |- MongoDB primary
                           |- private GCS
                           |- Secret Manager/KMS
                           `- optional Firestore/MariaDB
```

Plesk รับผิดชอบ TLS ของ public domain, static frontend, same-origin proxy,
security headers และ frontend release/rollback เท่านั้น ห้ามนำ Google
service-account JSON, MongoDB URI, JWT/CSRF key, Brevo API key, SMTP password,
LINE secret, Turnstile secret, KMS key หรือ database password ไปเก็บบน Plesk

Cloud Run ยังคงรับผิดชอบ authentication, authorization, CSRF, rate limit,
idempotency, wallet transaction, file validation, email และ database access
ทั้งหมด

## 2. Manual Git Contract

เมื่อ subscription มี Plesk Git ให้ routine deployment ใช้ปุ่มใน Pleskตามลำดับ:

1. Merge/push source เข้า `main`
2. รอ GitHub check `CI / quality` ของ commit นั้นผ่าน
3. Deploy Cloud Run backend ก่อน หาก release มี backend/API/config change
4. ตรวจ `/health/ready` ของ Cloud Run revision เป้าหมาย
5. ตรวจใน Plesk ว่า repository URL และ branch ยังเป็นค่าที่อนุมัติ
6. กด `Pull now`
7. ตรวจ Latest commit ใน Plesk ว่าตรง SHA/ข้อความ commit ที่ CI ผ่าน
8. กด `Deploy now`
9. รอ deployment action และ Passenger restart สำเร็จ
10. รัน external smoke test และ functional acceptance

ห้ามเปิด automatic deployment หรือเพิ่ม Plesk webhook ใน GitHub
`PLESK_CD_ENABLED`, `PLESK_GIT_WEBHOOK_URL`, `PLESK_WEBHOOK_HOST` และ
release branch `plesk-production` ไม่ใช้ในสถาปัตยกรรมนี้

หาก subscription ไม่มี Plesk Git ให้ใช้ File Manager bundle ตามหัวข้อ 3.1
ห้ามใช้ FTP/SFTP เป็น routine deployment

## 3. Plesk Git Settings

ในเมนู `Git` ของ domain:

| Setting | Value |
|---|---|
| Repository URL | `https://github.com/piya46/RegisterSystem_Sci.git` |
| Branch | `main` |
| Deployment mode | Manual deployment |
| Deployment target | root ที่มี `scripts`, `frontend`, `backend`, `hosting` |

สำหรับ Hostatom ปัจจุบันให้คลิกคำว่า `automatically` ในส่วน Deployment แล้ว
เปลี่ยนเป็น `Manual deployment`; target คงเป็น `/reunion.scicu-alumni.com`
จากนั้นเปิด Repository Settings (ไอคอน sliders) และปิด Additional deployment
actions เพราะ Hostatom chroot ไม่มี build runtime

Repository ปัจจุบันเป็น public จึงไม่ต้องมี deploy credential หากเปลี่ยนเป็น
private ให้ใช้ deploy key แบบ read-only เท่านั้น ห้ามให้ write access

Hostatom ใช้ prebuilt mode: operator ต้อง build frontend ด้วย
`VITE_API_BASE_URL=/api`, เตรียม `hosting/plesk-gateway/public`, commit artifact
พร้อม source แล้วผ่าน `CI / quality` ก่อนกด Pull Plesk ห้ามตั้ง Additional
deployment action เพราะ restricted chroot ไม่มี `dirname`, Node.js และ npm

Plesk แยก Git mirror ออกจาก deployment target ดังนั้น target อาจไม่มี `.git`
ซึ่งเป็นพฤติกรรมปกติ สคริปต์จะตรวจ checkout โดยตรงเมื่อมี `.git`; หากไม่มีจะ
อ่าน sibling mirror `../git/RegisterSystem_Sci.git`, resolve
`refs/heads/main`/`refs/remotes/origin/main` และเทียบ hash ของ tracked file
ทุกไฟล์ใน target กับ commit ก่อน build หาก hosting ใช้ path อื่นให้กำหนด
`PLESK_GIT_DIR=<relative-read-only-git-dir>` ใน deployment action เท่านั้น
ห้ามชี้ไป repository ที่ผู้ใช้เว็บเขียนได้

CI/local release script จะ:

- ยืนยัน Node.js `22.22.x` หรือ `24.x` LTS
- ยืนยันว่า source/mirror ใช้ `main`
- ปฏิเสธ tracked file ที่หาย ถูกแทนด้วย symlink หรือถูกแก้บน host แม้ target
  จะไม่มี `.git`
- รองรับ `PLESK_APPROVED_SHA=<40-char-sha>` หากต้องการ pin SHA เพิ่ม
- ใช้ `npm ci` ตาม lockfile
- รัน gateway integration test และ dependency audit
- build frontend ด้วย `VITE_API_BASE_URL=/api`
- ตัด `.htaccess` ที่อาจปิด Passenger
- สลับ frontend public directory และเก็บ previous release
- ตรวจว่า prebuilt public ทุกไฟล์ถูก Git track, ไม่มี `.htaccess`/source map และ
  metadata ถูกต้อง

Plesk ใช้ปุ่ม `NPM install` ของ Node.js Toolkit เพื่อติดตั้ง runtime dependencies
และ `Restart App` หลัง Deploy ห้ามดาวน์โหลด runtime เข้า repository

### 3.1 File Manager Bundle เมื่อไม่มี Plesk Git

ทางเลือกนี้ใช้ได้เมื่อหน้า subscription ไม่มีเมนู Git เท่านั้น ตัว bundle ยังคง
ต้องมาจาก clean `main` commit ที่ push แล้วและ `CI / quality` ผ่าน ห้ามแก้ source
ใน File Manager หลังสร้าง bundle

สร้าง artifact จากเครื่อง operator:

```bash
VITE_CF_TURNSTILE_SITE_KEY=<public-site-key> \
./scripts/release.sh plesk bundle
```

คำสั่งจะตรวจ branch/working tree, รัน gateway test/audit, build frontend และสร้าง:

```text
.release/psevent-plesk-gateway-<git-sha-12>.zip
.release/psevent-plesk-gateway-<git-sha-12>.zip.sha256
```

ก่อน upload ให้ตรวจ checksum จาก directory `.release`:

```bash
shasum -a 256 -c psevent-plesk-gateway-<git-sha-12>.zip.sha256
```

จากนั้นใช้ Plesk `File Manager` upload ZIP เข้า
`/reunion.scicu-alumni.com` และ extract เป็น release directory ใหม่ ห้าม extract
ทับ release เดิม โดยต้องได้
`/reunion.scicu-alumni.com/releases/psevent-plesk-gateway-<git-sha-12>/app.js`
ตรวจ release SHA, path และรายการ hash เพิ่มเติมได้จาก
`PLESK_BUNDLE_MANIFEST.json` ภายใน release directory

กลับมาหน้า Node.js แล้วตั้งค่าตามหัวข้อ 4 กด `npm`/`NPM install` เพื่อให้ Plesk
ติดตั้ง production dependencies จาก lockfile แล้วกด `Restart App` การ upload
bundle ใหม่ต้องเก็บ release directory เดิมไว้จน external smoke ของ release ใหม่
ผ่านเพื่อ rollback โดยสลับ Application/Document root กลับ release เดิม

ไม่ต้องสร้าง `.htaccess`: Plesk Node.js UI เป็นผู้ตั้ง Passenger ให้ และ gateway
จัดการ SPA fallback/proxy/security header ใน Node เอง ตัว bundle จะหยุดสร้างทันที
หากพบ `.htaccess` เพื่อป้องกัน directive ที่ขัดกับ Passenger

## 4. Plesk Node.js Settings

| Field | Value |
|---|---|
| Node.js version | `24.19.0` บน Hostatom (`22.22.x` หรือ `24.x` LTS รองรับในโค้ด) |
| Package manager | `npm` |
| Application mode | `Production` |
| Application root | Git: `hosting/plesk-gateway`; bundle: `releases/psevent-plesk-gateway-<git-sha-12>` |
| Document root | Git: `hosting/plesk-gateway/public`; bundle: `<Application root>/public` |
| Startup file | `app.js` |
| Application URL | `https://reunion.scicu-alumni.com` |

Plesk/Passenger เป็นผู้กำหนด `PORT`; ห้ามตั้ง `PORT` เอง

Environment variables บน Plesk:

```env
NODE_ENV=production
PUBLIC_HOST=reunion.scicu-alumni.com
UPSTREAM_ORIGIN=https://psevent-production-841769493273.asia-southeast3.run.app
UPSTREAM_TIMEOUT_MS=30000
PLESK_EXPECTED_BRANCH=main
VITE_CF_TURNSTILE_SITE_KEY=<public-site-key>
VITE_GOOGLE_CLIENT_ID=<public-google-client-id-or-empty>
VITE_LIFF_ID=<public-liff-id-or-empty>
```

`VITE_*` เป็น public identifier ไม่ใช่ Secret ส่วน `UPSTREAM_ORIGIN` ต้องเป็น
HTTPS `run.app` origin ที่ไม่มี path, query หรือ credential

สำหรับ Plesk อื่นที่มี build-capable action แต่ไม่ inherit Node.js environment
สามารถสร้าง `frontend/.env` บน deployment target โดยมีเฉพาะ
`VITE_CF_TURNSTILE_SITE_KEY`, `VITE_GOOGLE_CLIENT_ID` และ `VITE_LIFF_ID` แล้วใช้:

```bash
LOAD_LOCAL_PLESK_CONFIG=true ./scripts/release.sh plesk deploy
```

loader อ่านเฉพาะ allowlist สามค่านี้ ห้ามใส่ backend Secret, password, token,
MongoDB URI, database credential หรือ Google credential ในไฟล์ดังกล่าว
`PUBLIC_HOST` และ `UPSTREAM_ORIGIN` ยังคงต้องตั้งใน Plesk Node.js environment
สำหรับ runtime วิธีนี้ไม่ใช้กับ Hostatom ซึ่งต้องปิด Additional deployment action

production ต้องใช้ deterministic URL ของ `psevent-production` ด้านบน แล้วกด
restart อีกครั้ง ห้ามตั้ง `ALLOW_NON_GOOGLE_UPSTREAM=true` ใน production

## 5. Backend Origin Contract

- `APP_ORIGIN`: deterministic Cloud Run origin สำหรับ release/smoke
- `PUBLIC_WEB_ORIGIN`: `https://reunion.scicu-alumni.com` สำหรับ email, QR,
  guest link, callback และ object URL ที่ผู้ใช้เห็น
- Runtime สร้าง CORS allowlist จากทั้งสอง originแบบ exact match
- `TURNSTILE_ALLOWED_HOSTNAMES` ต้องมี public hostname
- LINE callback ต้องเป็น
  `https://reunion.scicu-alumni.com/user/line/callback`
- Cookie ต้องใช้ `Secure`, `SameSite=lax` และห้ามมี Domain ของ `run.app`

`TRUST_PROXY` ต้องมีเฉพาะ local/private proxy range และ outbound `/32` จริงของ
Plesk ปัจจุบัน `203.170.190.137/32` เป็น candidate จนกว่าจะยืนยันจาก Cloud Run
request log ห้ามใช้ `TRUST_PROXY=true`

## 6. Preflight

จากเครื่อง operator:

```bash
PROJECT_ID=cusa-reunion \
PLESK_ORIGIN=https://reunion.scicu-alumni.com \
PLESK_GIT_BRANCH=main \
PLESK_MANUAL_DEPLOY=true \
PREFLIGHT_WEB=true \
./scripts/release.sh preflight production
```

Preflight ต้องยืนยันว่า manual mode เปิด, branch เป็น `main` และไม่มี webhook/CD
flag สำหรับ Plesk

## 7. Manual Deployment

ก่อนกด Plesk:

```bash
PROJECT_ID=cusa-reunion ./scripts/release.sh plan production
```

จากนั้น:

1. หากมี Plesk Git ให้กด `Pull now`, ตรวจ SHA แล้วกด `Deploy now`
2. หากไม่มี Plesk Git ให้ upload/extract checksummed ZIP ตามหัวข้อ 3.1
3. ตั้ง Node.js เป็น `24.19.0`, mode `Production` และ path ตามหัวข้อ 4
4. กด `npm`/`NPM install` แล้วกด `Restart App`; ไม่ต้องมี deployment action
5. ตรวจว่า Plesk ไม่แสดงข้อความ `app.js is not found`

หลัง deploy:

```bash
PLESK_ORIGIN=https://reunion.scicu-alumni.com \
PLESK_SMOKE_ATTEMPTS=6 \
PLESK_SMOKE_RETRY_DELAY_MS=5000 \
./scripts/release.sh plesk smoke
```

ตรวจขั้นต่ำ:

```bash
curl -fsS https://reunion.scicu-alumni.com/gateway/health/ready
curl -fsS https://reunion.scicu-alumni.com/api/participant-auth/providers
curl -fsSI https://reunion.scicu-alumni.com/
```

ผลที่ต้องได้:

- gateway readiness เป็น HTTP 200 และทั้ง gateway/upstream เป็น `up`
- root เป็น SPA และมี `X-Gateway-Release`, CSP, HSTS, nosniff
- API provider ตอบ JSON ผ่าน same-origin
- unknown API ไม่ fallback เป็น HTML
- Host ที่ไม่อนุญาตได้ HTTP 421
- login cookie ไม่มี `run.app` Domain
- login/OTP/logout, registration, upload, check-in, wallet/vendor QR ผ่าน
- rate limit แยก client IP จากสองเครือข่ายได้

## 8. Rollback

Frontend release rollback:

```bash
./scripts/release.sh plesk rollback
PLESK_ORIGIN=https://reunion.scicu-alumni.com ./scripts/release.sh plesk smoke
```

ถ้า gateway source ของ commit ปัจจุบันเสีย ให้เลือก known-good commit/branch
ชั่วคราวใน Plesk, กด `Pull now`, `Deploy now`, ตรวจ smoke แล้วคืน branch เป็น
`main` หลัง incident ห้าม force-push `main`

Backend rollback:

```bash
PROJECT_ID=cusa-reunion \
./scripts/release.sh rollback production REVISION_NAME
```

ทุก rollback ต้องบันทึก release, เวลา, impact, data reconciliation, owner และ
root cause

## 9. Cost and Security

- Plesk เป็น frontend/gateway ที่มีอยู่แล้ว
- Cloud Run backend ใช้ `MIN_INSTANCES=0`, production max 3
- ไม่เพิ่ม external load balancer ใน Phase 1
- รูป/slip อยู่ private GCS และไม่คัดลอกซ้ำบน Plesk
- Firestore, KMS per-request และ SQL mirror ปิดจนผ่าน cost/security gate
- งบ Google Cloud รวมต้องไม่เกิน 1,000 บาท/เดือนตาม load ปกติ
- Plesk manual action ไม่ต้องมี GitHub write token, webhook secret, FTP password
  หรือ GCP credential

## 10. Go-live Checklist

- Domain/SSL valid และไม่มี mixed content
- Source เป็น clean `main` commit ที่ push แล้วและ CI ผ่าน
- ถ้ามี Git: repository/branch/manual mode ถูกต้อง, additional action ปิด และ
  deployment log แสดง SHA
- ถ้าไม่มี Git: ZIP checksum และ `PLESK_BUNDLE_MANIFEST.json` ตรงกับ Git SHA
- Node.js `24.19.0`, application root, document root และ startup file ถูกต้อง
- ไม่มี backend/GCP/DB Secret บน Plesk
- Cloud Run backend พร้อมก่อน Plesk deploy
- Public origin, CORS, Turnstile, callback และ cookie ถูกต้อง
- External smoke และ frontend/backend rollback drill ผ่าน
- Auth, registration, upload, check-in และ wallet flow ผ่าน public domain
- Client IP/rate-limit test ผ่านสองเครือข่าย
- Billing Budget และ normal-load forecast พร้อม

## 11. Troubleshooting

| Symptom | Check |
|---|---|
| `app.js is not found` | extract ZIP ให้มี `<Application root>/app.js` และตรวจ Application root |
| ยังเห็นหน้า default Plesk | npm install, Restart App, Application/Document root |
| `/gateway/health/ready` 404 | Node app/Passenger ยังไม่ทำงานหรือ static nginx bypass |
| `/api` ได้ HTML/404 | gateway ไม่ได้ start หรือ document root ผิด |
| Passenger แจ้ง application start ไม่สำเร็จ | เปิด domain `Logs`, ค้น Error ID, แล้วรัน script `diagnose` จากแท็บ Run Node.js commands |
| HTTP 502 | `UPSTREAM_ORIGIN`, Cloud Run readiness, outbound HTTPS/DNS |
| Git action หา `dirname`/`node` ไม่พบ | ปิด Additional deployment action และใช้ tracked prebuilt public |
| action แจ้ง Git mirror ไม่พบ | ตรวจชื่อ `RegisterSystem_Sci.git` หรือกำหนด relative `PLESK_GIT_DIR` |
| action แจ้ง tracked file ไม่ตรง commit | กด Pull now ใหม่และตรวจ target; ห้ามแก้ tracked source ผ่าน File Manager |
| action แจ้งไม่มี Turnstile site key | ตั้ง public `VITE_*` ให้ action หรือใช้ allowlisted `frontend/.env` |
| deployment ถูกเรียกเอง | ปิด automatic deployment/webhook ใน Plesk |
| Turnstile ปฏิเสธ | widget hostname และ public site key |
| OAuth redirect ผิด | public origin และ provider callback |
| ทุกคนโดน rate limit พร้อมกัน | Plesk outbound IP และ `TRUST_PROXY` |
| release header ไม่เปลี่ยน | latest commit, restart marker, nginx/static cache |

เอกสารนี้ต้องใช้ร่วมกับ `docs/DEPLOYMENT_RUNBOOK.md` และ
`docs/PLESK_MARIADB_RUNBOOK.md`
