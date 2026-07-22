# Plesk Web Gateway Runbook

เอกสารนี้เป็นคู่มือ deploy แบบที่ 1 สำหรับ `reunion.scicu-alumni.com`: Plesk รัน React SPA และ Node.js same-origin gateway ส่วน Cloud Run รัน backend/API และเป็นผู้เข้าถึง MongoDB, Secret Manager, GCS, KMS, Firestore, SMTP และ integration ภายนอก

สถานะที่ยืนยันเมื่อ 2026-07-21:

- Domain ถูกผูกกับ Plesk แล้วที่ IP `203.170.190.137`
- HTTPS ใช้งานได้และมี certificate แล้ว จึงไม่ต้องเปลี่ยน DNS สำหรับ flow นี้
- Google Cloud project คือ `cusa-reunion`; ห้ามใช้ชื่อ project เดิมใน script หรือ console
- Backend staging คือ service `psevent-staging` region `asia-southeast3`
- Upstream แบบ deterministic คือ `https://psevent-staging-841769493273.asia-southeast3.run.app`
- Git source branch คือ `main`; Plesk ต้องติดตาม release branch `plesk-production` ที่เลื่อนได้เฉพาะ SHA ซึ่ง CI อนุมัติ

## 1. Architecture Decision

```text
Browser
  |
  | HTTPS https://reunion.scicu-alumni.com
  v
Plesk Node.js 22
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

Cloud Run ยังจำเป็น เพราะเป็น security boundary และ compute ของ backend ไม่ใช่ web hosting ที่ซ้ำกับ Plesk โดยรับผิดชอบ authentication, authorization, CSRF, rate limit, transaction, wallet ledger, file validation, email, database และ Google Cloud IAM ทั้งหมด

Plesk รับผิดชอบเฉพาะ:

- TLS termination ของ public domain
- ส่ง React SPA และ static assets
- proxy path ที่อนุญาตไป Cloud Run แบบ same-origin
- Host allowlist, response security headers, timeout และ sanitized gateway health
- release/rollback ของ frontend และ gateway

ห้ามนำ Google service-account JSON, MongoDB URI, JWT/CSRF key, SMTP password, LINE secret, Turnstile secret, KMS plaintext key หรือ Secret Manager payload ไปเก็บบน Plesk

## 2. เหตุผลที่ใช้ Git แทน FTP

- Plesk Git สามารถ pull commit ที่ระบุ, deploy อัตโนมัติ และรัน additional deployment action ได้
- Pipeline ตรวจย้อนหลังได้ว่า domain ใช้ commit ใดจาก `X-Gateway-Release`
- GitHub Actions เรียก Plesk webhook หลัง CI ผ่าน แล้วตรวจระบบจริงจากภายนอก
- FTP ไม่มี commit identity, atomic build gate, branch protection หรือ reliable rollback และเสี่ยงไฟล์ตกค้าง/อัปโหลดไม่ครบ

FTP ใช้ได้เฉพาะ break-glass เมื่อ Git ใช้งานไม่ได้และต้องมี incident record; ห้ามใช้เป็น routine deployment

## 3. ตั้งค่า Plesk Git ครั้งแรก

1. เปิดเมนู `Git` ของ `reunion.scicu-alumni.com` แล้วเลือก repository จาก remote Git hosting
2. สร้าง branch `plesk-production` จาก commit ล่าสุดของ `main` ที่ CI ผ่าน แล้วใช้ URL `git@github.com:piya46/RegisterSystem_Sci.git` และ branch `plesk-production` ใน Plesk
3. ถ้า repository เป็น private ให้คัดลอก public SSH key ที่ Plesk สร้างไปเพิ่มใน GitHub `Settings > Deploy keys` แบบ read-only และห้ามเลือก write access
4. ป้องกัน branch `plesk-production` ไม่ให้ผู้ใช้ push/force-push/delete โดยตรง และให้ GitHub Actions release workflow เป็นผู้เลื่อน ref แบบ fast-forward
5. ตั้ง deployment target เป็น document tree ของ domain เช่น `/httpdocs`; repository root หลัง deploy ต้องมี `scripts`, `frontend`, `backend` และ `hosting`
6. ตั้ง deployment mode เป็น `Automatic deployment`
7. คัดลอก webhook URL ที่ Plesk แสดง เก็บเป็น GitHub Environment secret ตามข้อ 6 และห้ามส่ง URL นี้ผ่าน chat/log
8. ตั้ง additional deployment action จาก repository root เป็น:

```bash
./scripts/release.sh plesk deploy
```

สคริปต์จะบังคับ Node.js 22, ใช้ `npm ci`, audit dependency, รัน gateway tests, build React ด้วย `VITE_API_BASE_URL=/api`, ตัด `.htaccess` ที่ปิด Passenger, สลับ public release และสร้าง `tmp/restart.txt`

ถ้า additional action แจ้งว่าไม่พบ `node` หรือ `npm` แสดงว่า Plesk Git action อยู่ใน chroot ที่ไม่มี Node binary ให้ผู้ดูแล hosting เปิด Node.js CLI สำหรับ subscription นี้ ห้ามแก้ด้วยการ download binary ที่ไม่ผ่านการควบคุมเข้า repository

## 4. ตั้งค่า Plesk Node.js

เปิดเมนู `Node.js` ของ domain แล้วกำหนด:

| ช่อง | ค่า |
|---|---|
| Node.js version | `22.x` |
| Package manager | `npm` |
| Application mode | `Production` |
| Application root | `/httpdocs/hosting/plesk-gateway` |
| Document root | `/httpdocs/hosting/plesk-gateway/public` |
| Application startup file | `app.js` |
| Application URL | `https://reunion.scicu-alumni.com` |

ชื่อ path ใน Plesk บางรุ่นอาจแสดงแบบ relative โดยไม่มี `/httpdocs`; ให้คงความสัมพันธ์ว่า document root ต้องเป็น `public` ที่อยู่ใต้ application root

ตั้ง environment variables ต่อไปนี้ใน Plesk Node.js:

```env
NODE_ENV=production
PUBLIC_HOST=reunion.scicu-alumni.com
UPSTREAM_ORIGIN=https://psevent-staging-841769493273.asia-southeast3.run.app
UPSTREAM_TIMEOUT_MS=30000
VITE_CF_TURNSTILE_SITE_KEY=<public-site-key>
VITE_GOOGLE_CLIENT_ID=<public-google-client-id-or-empty>
VITE_LIFF_ID=<public-liff-id-or-empty>
```

ข้อกำหนด:

- Plesk/Passenger เป็นผู้กำหนด `PORT`; ห้าม hard-code หรือตั้ง `PORT` เอง
- ค่า `VITE_*` อยู่ใน browser bundle และถือเป็น public identifier ไม่ใช่ Secret
- `UPSTREAM_ORIGIN` ต้องเป็น HTTPS `run.app` origin ที่ไม่มี path/query/credential
- Production service พร้อมเมื่อใดจึงเปลี่ยน upstream เป็น deterministic URL ของ `psevent-production` หลังผ่าน staging acceptance เท่านั้น
- ห้ามตั้ง `ALLOW_NON_GOOGLE_UPSTREAM=true` ใน production

หลังตั้งค่ากด `NPM Install` ได้สำหรับครั้งแรก แต่ routine deploy ต้องใช้ script ซึ่งเรียก lockfile ผ่าน `npm ci`

## 5. Backend Cutover Contract

Cloud Run มี origin สองบทบาทที่ห้ามปะปนกัน:

- `APP_ORIGIN`: deterministic Cloud Run origin สำหรับ candidate/readiness/deploy smoke
- `PUBLIC_WEB_ORIGIN`: `https://reunion.scicu-alumni.com` สำหรับ email link, wallet/guest link, QR, LINE callback, frontend URL และ object API URL

Runtime renderer ต้องสร้าง:

- `PUBLIC_URL`, `FRONTEND_URL`, `OBJECT_STORAGE_PUBLIC_API_ORIGIN` จาก `PUBLIC_WEB_ORIGIN`
- `CORS_ORIGIN` จาก Cloud Run origin และ public Plesk originแบบ exact match
- `TURNSTILE_ALLOWED_HOSTNAMES` จาก hostname ทั้งสองแบบ deduplicate
- `LINE_LOGIN_CALLBACK_URL=https://reunion.scicu-alumni.com/user/line/callback`
- `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=lax`

`TRUST_PROXY` ต้องอนุญาตเฉพาะ local/private reverse-proxy ranges และ Plesk outbound CIDR ที่ตรวจสอบแล้ว ปัจจุบันตั้ง candidate เป็น `203.170.190.137/32`; ก่อนเปิดรับผู้ใช้จริงต้องดู Cloud Run request log เพื่อยืนยันว่า outbound IP ของ Plesk ตรงกับค่านี้ หากต่างให้เปลี่ยนเป็น `/32` จริงและ deploy backend ใหม่

ห้ามใช้ `TRUST_PROXY=true` หรือ trust ทุก CIDR เพราะผู้โจมตีอาจปลอม client IP เพื่อหลบ rate limit/audit

## 6. GitHub-to-Plesk Pipeline

Workflow `.github/workflows/plesk-deploy.yml` ทำงานตามลำดับ:

1. CI ของ push เข้า `main` ต้องสำเร็จ
2. ตรวจว่า commit มาจาก repository เดียวกัน ไม่ใช่ fork
3. ตรวจ `PLESK_CD_ENABLED=true`
4. checkout SHA ที่ CI ตรวจจริง
5. เลื่อน `plesk-production` ไป SHA นั้นด้วย GitHub API แบบ `force=false`; ถ้าไม่ใช่ fast-forward ต้อง fail
6. POST ref/SHA ที่อนุมัติไป Plesk Git webhook ผ่าน HTTPS
7. Plesk pull `plesk-production`, build และ restart
8. GitHub runner retry external smoke สูงสุดตามขอบเขตที่กำหนด
9. ตรวจ gateway readiness, SPA, release header, CSP/HSTS/nosniff และ same-origin API

สร้าง GitHub Environment ชื่อ `plesk-production` และตั้ง:

| ชนิด | ชื่อ | ค่า |
|---|---|---|
| Repository variable | `PLESK_CD_ENABLED` | เริ่มที่ `false` |
| Environment variable | `PLESK_ORIGIN` | `https://reunion.scicu-alumni.com` |
| Environment variable | `PLESK_WEBHOOK_HOST` | hostname ที่อ่านจาก Plesk webhook URL |
| Environment variable | `PLESK_DEPLOY_BRANCH` | `plesk-production` |
| Environment secret | `PLESK_GIT_WEBHOOK_URL` | webhook URL เต็มจาก Plesk |

Environment ต้องมี required reviewer และจำกัด workflow source branch เป็น `main` หาก GitHub plan รองรับ Workflow ใช้ `contents: write` เฉพาะการ fast-forward release ref โดยส่ง token ให้ promotion step เท่านั้น; checkout ไม่ persist credential และห้ามใช้ force update ห้ามเก็บ Plesk password, SSH private key หรือ FTP password ใน GitHub Actions

Trigger ต้อง fail closed ถ้า `PLESK_WEBHOOK_HOST` ว่างหรือไม่ตรง hostname ของ Secret URL เพื่อป้องกันการส่ง payload ไปปลายทางที่ไม่ผ่านการอนุมัติ โดย webhook URL เต็มยังคงเป็น Secret และห้ามพิมพ์ลง log

เปิด `PLESK_CD_ENABLED=true` หลัง manual deploy และ acceptance checklist ผ่านเท่านั้น หากปิดไว้ workflow จะไม่ trigger Plesk แม้ CI ผ่าน

## 7. External Provider Configuration

ก่อนเปิด login/registration จริงต้องตั้ง provider console ให้ตรงกับ public domain:

- Cloudflare Turnstile widget hostname: `reunion.scicu-alumni.com`
- Google OAuth authorized JavaScript origin: `https://reunion.scicu-alumni.com`
- LINE Login callback: `https://reunion.scicu-alumni.com/user/line/callback`
- Email/QR/guest-link templates ต้องตรวจว่าไม่มี `localhost` หรือ `run.app` เมื่อส่งให้ผู้ใช้จริง

Turnstile secret, Google server-side secret และ LINE channel secret อยู่ Secret Manager ของ `cusa-reunion` เท่านั้น ส่วน site key/client ID/LIFF ID เป็น public build-time valueบน Plesk

## 8. Initial Deployment และ Verification

ก่อนกด deploy ให้ backend revision ที่รองรับ public origin พร้อมก่อน:

```bash
PROJECT_ID=cusa-reunion LOAD_LOCAL_DEPLOY_CONFIG=true ./scripts/release.sh deploy staging
```

จากนั้นใน Plesk กด pull/deploy `plesk-production` สำหรับครั้งแรก หรือ trigger webhook แล้วตรวจ:

```bash
PLESK_ORIGIN=https://reunion.scicu-alumni.com ./scripts/release.sh plesk smoke
```

Manual verification ขั้นต่ำ:

```bash
curl -fsS https://reunion.scicu-alumni.com/gateway/health/ready
curl -fsS https://reunion.scicu-alumni.com/api/participant-auth/providers
curl -fsSI https://reunion.scicu-alumni.com/
```

ผลที่ต้องได้:

- `/gateway/health/ready` เป็น HTTP 200, `ready=true`, gateway/upstream เป็น `up`
- root เป็น SPA จริงและมี `X-Gateway-Release`, `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`
- API provider contract สำเร็จโดย browser ไม่เรียก `run.app` โดยตรง
- request Host ที่ไม่อยู่ allowlist ได้ HTTP 421
- unknown `/api` ไม่ fallback เป็น `index.html`
- static asset ชื่อ hashed มี immutable cache แต่ SPA navigation เป็น `no-store`
- login cookie มี `Secure`, ไม่มี Domain ของ `run.app` และทำงานบน public domain
- registration/OTP/login/logout/upload/QR/wallet flow ผ่านอย่างน้อยหนึ่งรายการต่อ flow
- rate limit แยก client IP สองอุปกรณ์ได้ ไม่รวมทุกคนเป็น Plesk IP เดียว

## 9. Security Boundary และ Known Limitation

เพื่อคุมค่าใช้จ่าย Phase 1 ไม่ใช้ external HTTPS Load Balancer ดังนั้น Cloud Run `run.app` endpoint ยังต้อง public เพื่อให้ Plesk เรียกได้ และไม่ควรถือว่า Plesk WAF/CORS เป็น authorization boundary

Compensating controls ที่ต้องคงไว้:

- ทุก protected API ตรวจ session/JWT และ RBAC ที่ backend
- Browser write ตรวจ CSRF/Origin, Turnstile และ idempotency ตามประเภท transaction
- Backend rate limit ทำงานจาก proxy chain ที่ validate แล้ว
- Cloud Run ไม่เชื่อถือ `X-PSEvent-Gateway` เป็น credential เพราะ header ปลอมได้
- Secret Manager ใช้ ADC/service account แบบ least privilege และ pin version
- GCS private, Public Access Prevention และ signed access ตาม runbook
- log/alert แยก direct `run.app` traffic ที่ผิดปกติเพื่อสอบสวน

หากภายหลังต้องบังคับให้ API รับเฉพาะ gateway ให้ประเมิน authenticated load balancer/API gateway, Cloudflare tunnel หรือ private connector พร้อม threat model และ cost forecast ก่อน ห้ามเพิ่ม static shared secret แบบไม่มี rotation/audit โดยพลการ

## 10. Rollback และ Incident Flow

Frontend/gateway rollback ใช้ release ก่อนหน้าที่เก็บใน Plesk:

```bash
./scripts/release.sh plesk rollback
PLESK_ORIGIN=https://reunion.scicu-alumni.com ./scripts/release.sh plesk smoke
```

ข้อจำกัดคือเก็บ previous public release หนึ่งชุด การ rollback สลับ current/previous จึงสามารถ roll-forward กลับได้อีกครั้ง แต่ source gateway ยังคงเป็น commit ปัจจุบัน หาก gateway code เสียต้องเลือก commit เดิมใน Plesk Git แล้ว deploy ใหม่

Backend rollback ใช้ Cloud Run revision เดิมและไม่ rebuild image:

```bash
PROJECT_ID=cusa-reunion ./scripts/release.sh rollback staging REVISION_NAME
```

ถ้า Plesk ล่มชั่วคราว ห้ามเปลี่ยน DNS แบบเร่งด่วนโดยไม่มี TTL/rollback plan; ผู้ดูแลอาจใช้ deterministic Cloud Run origin เป็น operator-only diagnostic fallback แต่ลิงก์สาธารณะยังต้องยึด canonical domain

ทุก rollback ต้องบันทึก release ID, เวลา, impact, data reconciliation, owner และ root cause โดยเฉพาะ wallet/payment transaction ห้าม retry แบบเดาเมื่อ client ไม่ทราบผล

## 11. Cost Guardrail

- Plesk เป็น hosting ที่มีอยู่แล้ว จึงไม่มี Cloud Run frontend service เพิ่ม
- Cloud Run backend ใช้ `MIN_INSTANCES=0`, staging max 2, production max 3
- ไม่เพิ่ม external load balancer ใน Phase 1 เพื่อลด fixed monthly cost
- React assets cache แบบ immutable ลด bandwidth ซ้ำ; SPA HTML ไม่ cache เพื่อป้องกัน stale release
- รูปและ slip อยู่ private GCS ตาม retention/lifecycle; ห้าม duplicate ลง Plesk
- Firestore, KMS crypto ต่อ request, SQL managed instance และ optional mirror ปิดเป็นค่าเริ่มต้น
- ตั้ง Google Cloud Billing Budget ที่ 50%, 80%, 90%, 100% และตรวจ Cloud Run internet egress จากการ proxy ผ่าน Plesk
- Forecast รวม Cloud Run, GCS, egress, Logging, Secret Manager, KMS, Firestore/SQL ที่เปิดจริงต้องไม่เกิน 1,000 บาท/เดือน หาก forecast เกินต้องปิด optional feature หรือขออนุมัติก่อน

## 12. Go-live Checklist

- Domain/SSL ของ Plesk valid และไม่มี mixed content
- Plesk Git ใช้ read-only deploy key, branch `plesk-production`, automatic mode และ release ref ตรงกับ CI-approved SHA
- Node.js 22, application/document root และ startup file ถูกต้อง
- ไม่มี `.htaccess` ที่มี `PassengerEnabled off` ใน generated public release
- Plesk ไม่มี GCP credential หรือ backend Secret
- Backend `PUBLIC_WEB_ORIGIN`, CORS, Turnstile, callback และ trust proxy ตรงกับ domainจริง
- GitHub CI เป็น required check; Plesk environment มี reviewer และ webhook secret
- Manual deploy, external smoke และ frontend rollback drill ผ่าน
- Login/OTP/registration/upload/check-in/wallet/vendor QR flow ผ่าน public domain
- Client IP/rate-limit test สองเครือข่ายผ่าน
- Security headers, cookies, audit redaction, Cloud Run readiness และ GCS policy ผ่าน
- Billing Budget/alert พร้อมและ cost forecast อยู่ในงบ
- เมื่อผ่านทั้งหมดจึงเปิด `PLESK_CD_ENABLED=true`

## 13. Troubleshooting

| อาการ | จุดตรวจ |
|---|---|
| ยังเห็นหน้า default Plesk | Git deployment path, Node document root และ deploy action |
| `/api` ได้ HTML | Passenger ถูกปิด, document root ผิด หรือ gateway ไม่ได้ start |
| HTTP 502 | `UPSTREAM_ORIGIN`, Cloud Run readiness, outbound HTTPS/DNS ของ Plesk |
| Node action หา `npm` ไม่เจอ | Node CLI/chroot capability ของ hosting subscription |
| Turnstile ปฏิเสธ hostname | Plesk public site key, widget hostname และ backend allowlist |
| Google/LINE login redirect ผิด | public origin และ provider console callback |
| ผู้ใช้ทุกคนโดน rate limit พร้อมกัน | Plesk outbound IP และ `TRUST_PROXY` chain |
| deploy สำเร็จแต่ header SHA เก่า | Passenger restart marker, static bypass และ Plesk cache |
| webhook ไม่ทำงาน | Git automatic mode, webhook host/secret, `PLESK_CD_ENABLED` และ CI status |

เอกสารอ้างอิง: [Plesk remote Git hosting](https://docs.plesk.com/en-US/obsidian/customer-guide/git-support/using-remote-git-hosting.75848/), [Plesk Node.js support](https://docs.plesk.com/en-US/obsidian/customer-guide/nodejs-support.76652/), [Cloud Run custom domains](https://cloud.google.com/run/docs/mapping-custom-domains)
