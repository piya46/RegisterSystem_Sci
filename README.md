# ระบบลงทะเบียนงานอีเวนต์แบบครบวงจร

**Event Registration System** คือเว็บแอปพลิเคชันสำหรับบริหารจัดการการลงทะเบียนงานอีเวนต์ รองรับทั้งรูปแบบ Online Pre-registration และ On-site Walk-in (Kiosk) มาพร้อมระบบจัดการหลังบ้าน (Backend), Dashboard สรุปสถิติแบบ Real-time, ระบบ E-Ticket (QR Code) และระบบการรับเงินสนับสนุน (Donation)

โปรเจกต์นี้ถูกออกแบบมาให้มีความยืดหยุ่น สามารถปรับแต่งฟิลด์ข้อมูลผู้เข้าร่วมได้ (Dynamic Fields) ทำให้เหมาะสำหรับการนำไปใช้ในงานประชุม งานสัมมนา หรืองานคืนสู่เหย้าต่างๆ

-----

## 📑 สารบัญ

1.  [ฟีเจอร์หลัก (Key Features)](https://www.google.com/search?q=%23-%E0%B8%9F%E0%B8%B5%E0%B9%80%E0%B8%88%E0%B8%AD%E0%B8%A3%E0%B9%8C%E0%B8%AB%E0%B8%A5%E0%B8%B1%E0%B8%81-key-features)
2.  [เทคโนโลยีที่ใช้ (Tech Stack)](https://www.google.com/search?q=%23-%E0%B9%80%E0%B8%97%E0%B8%84%E0%B9%82%E0%B8%99%E0%B9%82%E0%B8%A5%E0%B8%A2%E0%B8%B5%E0%B8%97%E0%B8%B5%E0%B9%88%E0%B9%83%E0%B8%8A%E0%B9%89-tech-stack)
3.  [ขั้นตอนการติดตั้ง (Installation)](https://www.google.com/search?q=%23-%E0%B8%82%E0%B8%B1%E0%B9%89%E0%B8%99%E0%B8%95%E0%B8%AD%E0%B8%99%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%95%E0%B8%B4%E0%B8%94%E0%B8%95%E0%B8%B1%E0%B9%89%E0%B8%87-installation)
4.  [การตั้งค่า Environment Variables](https://www.google.com/search?q=%23-%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%95%E0%B8%B1%E0%B9%89%E0%B8%87%E0%B8%84%E0%B9%88%E0%B8%B2-environment-variables)
5.  [โครงสร้างโปรเจกต์ (Project Structure)](https://www.google.com/search?q=%23-%E0%B9%82%E0%B8%84%E0%B8%A3%E0%B8%87%E0%B8%AA%E0%B8%A3%E0%B9%89%E0%B8%B2%E0%B8%87%E0%B9%82%E0%B8%9B%E0%B8%A3%E0%B9%80%E0%B8%88%E0%B8%81%E0%B8%95%E0%B9%8C-project-structure)
6.  [API Documentation](https://www.google.com/search?q=%23-api-documentation)

-----

## ✨ ฟีเจอร์หลัก (Key Features)

### 🖥️ ฝั่งผู้ใช้งาน (Frontend & Kiosk)

  - **Registration Form:**
      - แบบฟอร์มลงทะเบียนที่รองรับการปรับแต่งฟิลด์ข้อมูล (Dynamic Fields) ผ่านระบบหลังบ้าน
      - แยกหมวดหมู่ข้อมูลชัดเจน (ข้อมูลส่วนตัว, การศึกษา/องค์กร, การติดต่อ)
      - ระบบรับบริจาค (Donation) หรือซื้อของที่ระลึก พร้อมแนบหลักฐานการโอนเงิน
  - **Kiosk Mode:** โหมดสำหรับเจ้าหน้าที่ (Staff) หรือจุดลงทะเบียนหน้างาน เพื่อทำการลงทะเบียน Walk-in อย่างรวดเร็ว พร้อมระบบ Auto-reset หน้าจอ
  - **E-Ticket:** สร้างบัตรเข้างานในรูปแบบ QR Code ทันทีที่ลงทะเบียนสำเร็จ (รองรับการบันทึกเป็น PDF/PNG)
  - **UI/UX:** ออกแบบด้วย Material UI (MUI) ทันสมัย รองรับการใช้งานบนมือถือ (Responsive)
  - **Security:** ป้องกัน Spam และ Bot ด้วย **Cloudflare Turnstile**

### ⚙️ ฝั่งระบบหลังบ้าน (Backend & Admin)

  - **Authentication:** ระบบยืนยันตัวตนด้วย **JWT** และการจัดการ Session ที่ปลอดภัย (แยกสิทธิ์ Admin และ Staff)
  - **Dashboard:** กราฟสรุปสถิติแบบ Real-time (ยอดลงทะเบียน, ยอด Check-in, ยอดเงินบริจาค, ช่วงเวลาที่คนหนาแน่น)
  - **Participant Management:** ค้นหา แก้ไข และลบข้อมูลผู้เข้าร่วมงาน พร้อมระบบ Export ข้อมูล
  - **Check-in System:** ระบบสแกน QR Code สำหรับเช็คชื่อหน้างาน (รองรับการบันทึกผู้ติดตาม)
  - **Configuration:** ตั้งค่าเปิด-ปิด หรือเพิ่มลดฟิลด์ข้อมูลที่ต้องการเก็บได้โดยไม่ต้องแก้โค้ด

-----

## 🛠 เทคโนโลยีที่ใช้ (Tech Stack)

### Frontend

  - **Framework:** React (Vite)
  - **UI Library:** Material UI (MUI) v5
  - **HTTP Client:** Axios
  - **Utilities:** QRCode.react, html2canvas, jspdf, dayjs, recharts

### Backend

  - **Runtime:** Node.js
  - **Framework:** Express.js
  - **Database:** MongoDB (Mongoose) เป็น primary store; รองรับ optional MariaDB/MySQL reporting mirror และ Firestore realtime mirror
  - **Security:** JSON Web Token (JWT), Bcrypt, Helmet, Express-Rate-Limit
  - **Features:** Multer + Sharp (validated/optimized image upload), Google Cloud Storage/local object abstraction, Brevo Transactional Email API with SMTP fallback

-----

## 🚀 ขั้นตอนการติดตั้ง (Installation)

### 1\. สิ่งที่ต้องเตรียม (Prerequisites)

  - [Node.js](https://nodejs.org/) `>=22.22.0 <23` ตาม `.nvmrc` และ `.node-version`
  - [MongoDB](https://www.mongodb.com/) (Local หรือ Cloud Atlas)
  - บัญชี Cloudflare (สำหรับ Turnstile - Optional)
  - บัญชี Brevo Transactional Email API และ verified sender (สำหรับส่ง E-Ticket/OTP - Optional)

### 2\. การติดตั้ง Backend

1.  เข้าไปที่โฟลเดอร์ `backend` และติดตั้ง dependencies:
    ```bash
    cd backend
    npm install
    ```
2.  สร้างไฟล์ `.env` (ดูหัวข้อ Environment Variables)
3.  รัน Server:
    ```bash
    npm run dev
    # Server จะทำงานที่ http://localhost:3000 ตามค่าเริ่มต้น
    ```

### 3\. การติดตั้ง Frontend

1.  เข้าไปที่โฟลเดอร์ `frontend` และติดตั้ง dependencies:
    ```bash
    cd frontend
    npm install
    ```
2.  สร้างไฟล์ `.env` (ดูหัวข้อ Environment Variables)
3.  รัน Client:
    ```bash
    npm run dev
    ```

-----

## 🔧 การตั้งค่า Environment Variables

### Backend (`backend/.env`)

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/your_event_db_name
JWT_SECRET=your_super_secret_key_change_me
# ระบุ Domain ของ Frontend ที่อนุญาตให้เชื่อมต่อ
CORS_ORIGIN=http://localhost:5173,https://your-production-domain.com

# Email Settings (สำหรับการส่ง E-Ticket/OTP)
EMAIL_PROVIDER=brevo
BREVO_API_KEY=xkeysib-your-brevo-api-key
BREVO_FROM_EMAIL=noreply@example.com
BREVO_FROM_NAME="Event Team"
BREVO_CANARY_TO=operator@example.com
# SMTP fallback/local compatibility เท่านั้น
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Event Team <noreply@example.com>"

# Cloudflare Turnstile (Backend Verification Secret)
TURNSTILE_SECRET_KEY=your_turnstile_secret_key

# Line Notify (Optional: แจ้งเตือนยอดเงินเข้า)
LINE_CHANNEL_ACCESS_TOKEN=your_line_token
LINE_GROUP_ID=your_line_group_id

# Data Encryption / Google Cloud KMS (Optional)
FIELD_ENCRYPTION_ENABLED=true
DATA_ENCRYPTION_KEY_ID=v1
DATA_ENCRYPTION_KEYS=v1=base64-or-hex-32-byte-key
# เปิดใช้เมื่อใช้ Cloud KMS สำหรับ unwrap data key เท่านั้น
KMS_DATA_KEY_ENABLED=false
KMS_KEY_RESOURCE=projects/your-project/locations/asia-southeast1/keyRings/psevent/cryptoKeys/psevent-data-key
KMS_WRAPPED_DATA_KEYS=v1=base64-kms-ciphertext
KMS_DATA_KEY_CACHE_TTL_MS=600000
KMS_MAX_DAILY_CRYPTO_OPS=500

# Firestore Optional Realtime Mirror + Cost Guardrail
GOOGLE_CLOUD_MONTHLY_BUDGET_THB=1000
GOOGLE_CLOUD_OPTIONAL_FEATURES_ENABLED=true
FIRESTORE_MIRROR_ENABLED=false
FIRESTORE_PROJECT_ID=cusa-reunion
FIRESTORE_DATABASE_ID=(default)
FIRESTORE_PAYMENT_STATUS_COLLECTION=paymentStatus
FIRESTORE_PAYMENT_STATUS_TTL_HOURS=24
FIRESTORE_MAX_DAILY_READS=10000
FIRESTORE_MAX_DAILY_WRITES=3000
FIRESTORE_MAX_DAILY_DELETES=1000

# Production Secret Manager (local development ใช้ env provider)
SECRET_PROVIDER=env
SECRET_MANAGER_ENABLED=false
SECRET_MANAGER_REQUIRE_PINNED_VERSIONS=true
SECRET_MANAGER_MAX_DAILY_ACCESS_OPS=200

# Optional MariaDB/MySQL reporting mirror; ปิดไว้จนกว่า migration validation ผ่าน
SQL_ENABLED=false
SQL_PRIMARY_STORE=false
SQL_DIALECT=mariadb
SQL_PROVIDER=self_managed
SQL_HOST=127.0.0.1
SQL_PORT=3306
SQL_DATABASE=psevent
SQL_USER=psevent_app
SQL_PASSWORD=load-from-secret-manager-in-production

# Object Storage: local สำหรับ development, private GCS สำหรับ production
OBJECT_STORAGE_PROVIDER=local
OBJECT_STORAGE_PUBLIC_API_ORIGIN=http://localhost:3000
GCS_BUCKET=
GCS_LOCATION=asia-southeast3
GCS_MONTHLY_BUDGET_THB=650
```

Production target คือ MariaDB บน Plesk ที่ `203.170.190.137:3306` แต่ต้องคงปิดจนกว่า static Cloud NAT IP, Plesk `/32` allowlist, TLS identity/CA, encrypted storage/backup และ read-only transport job ผ่าน ชื่อ database/user จริงไม่อยู่ใน repository

ดูรายการ config และ safety flags ทั้งหมดที่ `backend/.env.example` รวมถึง runbook ใน `docs/SECRET_MANAGER_RUNBOOK.md`, `docs/HYBRID_DB_MIGRATION_PLAN.md`, `docs/PLESK_MARIADB_RUNBOOK.md`, `docs/GCS_OBJECT_STORAGE_RUNBOOK.md`, `docs/CERTIFICATE_VERIFICATION_RUNBOOK.md` และ `docs/PLESK_WEB_GATEWAY_RUNBOOK.md`

### Automated CI/CD และ Google Cloud Deployment

ระบบใช้ entrypoint เดียวทั้ง local และ GitHub Actions:

```bash
./scripts/release.sh ci
PROJECT_ID=cusa-reunion ./scripts/release.sh plan staging
PROJECT_ID=cusa-reunion LOAD_LOCAL_DEPLOY_CONFIG=true ./scripts/release.sh deploy staging
```

First-time infrastructure ใช้ `BOOTSTRAP_GCP=true`; การส่ง Secret ขึ้น Secret Manager ต้องใช้ `ALLOW_SECRET_UPLOAD=true` และ production ต้อง pin version/ผ่าน GitHub Environment approval ก่อน deploy `LOAD_LOCAL_DEPLOY_CONFIG=true` อ่านเฉพาะค่า non-secret ที่อนุญาต เช่น email provider/sender, SMTP fallback host/from และ OAuth client ID จาก `backend/.env`; secret payload ไม่ถูกนำมาเปิด feature โดยอัตโนมัติ สคริปต์จะ build frontend/backend เป็น Cloud Run service เดียว, deploy image digest แบบไม่รับ traffic, smoke test, promote และ rollback อัตโนมัติเมื่อ post-promotion test ไม่ผ่าน

ขั้นตอนตั้ง WIF, GitHub variables, branch protection, Secret rotation, migration และ rollback อยู่ที่ `docs/DEPLOYMENT_RUNBOOK.md` และลำดับ MongoDB security migration อยู่ที่ `docs/MONGODB_PRODUCTION_MIGRATION_RUNBOOK.md`

ข้อกำหนด Cloud POS, Shift/Float, Stripe PromptPay/Card, E-slip แบบ local-first,
Inventory ledger, PO/partial receiving, settlement และ HA/DR อยู่ที่
`docs/POS_INVENTORY_PRD.md` ปัจจุบันมีสถานะ `Planned / Not Implemented` และต้อง
คง feature ปิดจนผ่าน Definition of Done ในเอกสารดังกล่าว

### Plesk Public Web และ Cloud Run Backend

`reunion.scicu-alumni.com` ใช้ Plesk Node.js `>=22.22.0 <23` เพื่อส่ง React SPA และ proxy `/api`, `/health`, `/uploads` ไป Cloud Run แบบ same-origin ส่วน Cloud Run ยังดูแล backend, database, Secret Manager, GCS/KMS และ integration ทั้งหมด Plesk ติดตาม branch `main` และผู้ดูแลต้องกด `Pull now` แล้ว `Deploy now` เองหลัง commit นั้นผ่าน CI; GitHub Actions ไม่เรียก Plesk webhook และไม่ใช้ FTP:

```bash
./scripts/release.sh plesk plan
./scripts/release.sh plesk deploy
PLESK_ORIGIN=https://reunion.scicu-alumni.com ./scripts/release.sh plesk smoke
./scripts/release.sh plesk rollback
```

Plesk deployment target ไม่จำเป็นต้องมี `.git`; deployment action จะตรวจ
tracked files กับ sibling mirror `../git/RegisterSystem_Sci.git` และหยุดก่อน
build หาก branch/SHA/content ไม่ตรง

ค่าตั้ง Plesk, manual deployment checklist, provider callback, security/cost guardrail และ go-live checklistอยู่ที่ `docs/PLESK_WEB_GATEWAY_RUNBOOK.md` โดย Plesk ต้องไม่มี Google service-account key หรือ backend Secret

### Frontend (`frontend/.env`)

```env
# URL ของ Backend API
VITE_API_BASE_URL=http://localhost:3000/api

# Cloudflare Turnstile (Frontend Site Key; เป็น public value)
VITE_CF_TURNSTILE_SITE_KEY=your_turnstile_site_key
```

-----

## 📂 โครงสร้างโปรเจกต์ (Project Structure)

```text
Project-Root/
├── backend/                # ส่วนจัดการ API และฐานข้อมูล
│   ├── src/
│   │   ├── config/         # การเชื่อมต่อ Database
│   │   ├── controllers/    # Logic การทำงานหลักของแต่ละ API
│   │   ├── middleware/     # Auth, Logger, Validation, RBAC
│   │   ├── models/         # Database Schemas (Mongoose)
│   │   ├── routes/         # กำหนด Endpoint (API Routes)
│   │   └── utils/          # Helpers (Email, File Upload, Turnstile)
│   └── app.js
│
├── frontend/               # ส่วนหน้าเว็บ (React)
    ├── public/             # Static Assets (Images, Logos)
    ├── src/
    │   ├── components/     # UI Components ที่ใช้ซ้ำ (Dialogs, Scanner)
    │   ├── pages/          # หน้าเว็บหลัก (Registration, Dashboard, Kiosk)
    │   ├── providers/      # Context Provider (Auth)
    │   └── utils/          # API Caller & Helpers
│   └── vite.config.js
└── hosting/plesk-gateway/  # Plesk Node.js same-origin SPA/API gateway
```

-----

## 📚 API Documentation (เบื้องต้น)

**Base URL:** `/api`  
**Authentication:** ส่ง Header `Authorization: Bearer <token>`

### 🔐 1. Authentication

  - `POST /auth/login`: เข้าสู่ระบบ (Admin/Staff)
  - `GET /auth/me`: ดึงข้อมูลผู้ใช้งานปัจจุบัน

### 👥 2. Participants (ผู้เข้าร่วมงาน)

  - `POST /participants/public`: ลงทะเบียนล่วงหน้า (Public - ใช้ Turnstile)
  - `GET /participants`: ดึงรายชื่อผู้ลงทะเบียน (Admin Only)
  - `GET /participants/search`: ค้นหาข้อมูลผู้เข้าร่วม (Staff/Admin)
  - `POST /participants/checkin-by-qr`: เช็คอินผ่าน QR Code

### 📍 3. Registration Points

  - `POST /registration-points`: สร้างจุดลงทะเบียนใหม่ (เช่น จุดหน้างาน, จุดรับของที่ระลึก)
  - `GET /registration-points`: ดึงรายชื่อจุดลงทะเบียนทั้งหมด

### 💰 4. Donations

  - `POST /donations/create`: บันทึกข้อมูลการบริจาค/โอนเงิน
  - `GET /donations/summary`: ดูสรุปยอดเงินทั้งหมด (Admin Only)

### 📊 5. Dashboard

  - `GET /dashboard/summary`: ดึงข้อมูลสถิติภาพรวมเพื่อแสดงกราฟ

### ⚙️ 6. Configuration

  - `GET /participant-fields`: ดึงการตั้งค่าฟิลด์ข้อมูล
  - `POST /participant-fields`: เพิ่ม/แก้ไข ฟิลด์ข้อมูล (Admin Only)

### 7. Certificate Verification

  - `POST /public/certificates/verify`: ตรวจ opaque certificate ID และคืนสถานะ valid/revoked/invalid
  - `POST /public/certificates/payload`: คืน minimum payload สำหรับสร้าง PDF ฝั่ง client
  - `npm run migrate:certificate-verification`: ตรวจข้อมูลเดิมแบบ dry-run; การเขียนต้องใช้ `--apply` และ write flag ตาม runbook
