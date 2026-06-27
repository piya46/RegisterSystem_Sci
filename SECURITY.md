# Security & Data Privacy Policy (นโยบายความปลอดภัยและความเป็นส่วนตัว)

ทางทีมผู้พัฒนาระบบ **RegisterSystem** ให้ความสำคัญสูงสุดกับความปลอดภัยของระบบและการคุ้มครองข้อมูลส่วนบุคคลของผู้ใช้งาน เอกสารฉบับนี้จัดทำขึ้นเพื่อให้แนวทางปฏิบัติสำหรับนักพัฒนาและผู้ดูแลระบบในการนำซอฟต์แวร์นี้ไปใช้งานให้สอดคล้องกับมาตรฐานความปลอดภัยและกฎหมายที่เกี่ยวข้อง (PDPA และ พ.ร.บ. คอมพิวเตอร์ฯ)

## Supported Versions (เวอร์ชันที่รองรับ)

เราจะรองรับการแก้ไขความปลอดภัย (Security Patch) เฉพาะเวอร์ชันล่าสุดที่อยู่บน Branch `main` หรือ `production` เท่านั้น

| Version | Supported | Notes |
| ------- | ------------------ | ---------------------- |
| 1.0.0 (Latest) | :white_check_mark: | เวอร์ชันปัจจุบัน (Production) |
| < 1.0.0 | :x: | ไม่รองรับแล้ว |

## Reporting a Vulnerability (การรายงานช่องโหว่)

หากคุณค้นพบช่องโหว่ด้านความปลอดภัย (Security Vulnerability) หรือความเสี่ยงที่ข้อมูลส่วนบุคคลจะรั่วไหล **กรุณาอย่าเปิดเผยผ่าน Public Issue**

กรุณาทำตามขั้นตอนดังนี้:
1.  **แจ้งรายละเอียด:** ส่งรายละเอียดมาที่อีเมล **piyaton56@gmail.com**
2.  **ระบุข้อมูล:** ประเภทของช่องโหว่ (เช่น SQL Injection, XSS, IDOR), Endpoint ที่พบปัญหา, และ Proof of Concept (PoC)
3.  **การตอบกลับ:** ทีมงานจะพยายามตอบกลับภายใน 48 ชั่วโมง

---

## Data Privacy & PDPA Compliance

ระบบนี้ถูกออกแบบมาให้รองรับการปฏิบัติตาม **พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)** โดยมีฟีเจอร์ดังนี้:

### 1. Data Collection & Consent (การเก็บรวบรวมและการขอความยินยอม)
* **Consent Record:** ระบบมีการเก็บสถานะความยินยอม (`consent`) ในฐานข้อมูล (`agreed` หรือ `disagreed`) เมื่อผู้ใช้งานลงทะเบียน ทั้งในรูปแบบ Online และ On-site
* **Data Minimization:** ระบบเก็บเฉพาะข้อมูลที่จำเป็น (เช่น ชื่อ, เบอร์โทร, อีเมล, ที่อยู่สำหรับการจัดส่งของที่ระลึก) ผ่านการตั้งค่า `ParticipantFields` ผู้ดูแลระบบควรเปิดใช้งานเฉพาะ Field ที่จำเป็นต้องใช้จริงเท่านั้น

### 2. Data Subject Rights (สิทธิของเจ้าของข้อมูล)
ผู้ดูแลระบบ (Data Controller) สามารถใช้เครื่องมือในระบบเพื่อตอบสนองต่อคำร้องขอของเจ้าของข้อมูลได้:
* **Right to Access/Rectify:** Admin สามารถดูและแก้ไขข้อมูลผู้เข้าร่วมงานได้ผ่านหน้า `Management`
* **Right to Erasure (Right to be Forgotten):** Admin สามารถลบข้อมูลผู้เข้าร่วมงานออกจากระบบได้ (Soft Delete) หากได้รับการร้องขอ
* **Right to Data Portability:** ระบบรองรับการ Export ข้อมูลผู้เข้าร่วมงานเป็นไฟล์ Excel (`.xlsx`)

### 3. Data Security (ความมั่นคงปลอดภัยของข้อมูล)
* **Encryption:** รหัสผ่านของผู้ดูแลระบบถูกเข้ารหัสด้วย **Bcrypt** ก่อนบันทึกลงฐานข้อมูล
* **Access Control:** จำกัดสิทธิ์การเข้าถึงข้อมูลส่วนบุคคลเฉพาะผู้ที่มีสิทธิ์ระดับ `admin` หรือ `staff` เท่านั้น

---

## Computer Crime Act Compliance

เพื่อให้สอดคล้องกับ **พ.ร.บ. ว่าด้วยการกระทำความผิดเกี่ยวกับคอมพิวเตอร์ (ฉบับที่ 2) พ.ศ. 2560** ระบบได้เตรียมกลไกดังนี้:

### 1. Authentication & Identification (การระบุตัวตน)
* ระบบบังคับให้ผู้ดูแลระบบและเจ้าหน้าที่ต้องเข้าสู่ระบบผ่าน Username/Password ที่ยืนยันตัวตนได้
* การใช้งาน Session มีการระบุตัวตนชัดเจนผ่าน JWT Token ที่เชื่อมโยงกับ `userId`

### 2. Traffic Data Logging (การเก็บข้อมูลจราจรคอมพิวเตอร์)
* **Audit Logs:** ระบบมีการบันทึกการกระทำสำคัญ (Action Logs) ลงใน Collection `apilogs` ซึ่งประกอบด้วย:
    * ผู้กระทำการ (`username`, `userId`)
    * วันและเวลา (`timestamp`)
    * หมายเลขไอพี (`IP Address`)
    * ประเภทการกระทำ (เช่น LOGIN, DELETE_PARTICIPANT, EXPORT_DATA)
* **คำแนะนำสำหรับผู้ดูแลระบบ:** ท่านควรตั้งค่า Server หรือ Database ให้เก็บรักษา Log เหล่านี้ไว้อย่างน้อย **90 วัน** ตามที่กฎหมายกำหนด

---

## Security Features 

ระบบได้มีการ Implement มาตรการความปลอดภัยเบื้องต้นไว้ดังนี้:

* **Role-Based Access Control (RBAC):** แบ่งสิทธิ์ชัดเจนระหว่าง `admin`, `staff`, และ `kiosk` (ตรวจสอบผ่าน Middleware)
* **Bot Protection:** ใช้ **Cloudflare Turnstile** ในหน้า Login และ Pre-registration เพื่อป้องกันบอทและการโจมตีแบบ Spam
* **Rate Limiting:** จำกัดจำนวน Request เพื่อป้องกัน Brute Force และ DDoS ในระดับ Application Layer
* **Session Management:** ระบบสามารถ Revoke (ยกเลิก) Session ของผู้ใช้งานได้ทันทีหากพบความผิดปกติ
* **CSRF Protection:** เมื่อใช้ cookie-based session ระบบใช้ signed double-submit CSRF token (`csrfToken` cookie + `X-CSRF-Token` header) สำหรับคำสั่งที่แก้ไขข้อมูล
* **Field Encryption:** ข้อมูลอ่อนไหวของผู้เข้าร่วมและผู้สนับสนุนถูกเข้ารหัสระดับ field ด้วย AES-256-GCM เมื่อกำหนด `DATA_ENCRYPTION_KEY` หรือ `DATA_ENCRYPTION_KEYS`
* **Encrypted Search Tokens:** การค้นหาชื่อ/เบอร์/อีเมลของผู้เข้าร่วมใช้ HMAC search token เพิ่มเติมจาก blind index เพื่อลดการ scan plaintext หลังเปิด field encryption
* **Sensitive Access Audit:** การ export, report, dashboard recent records, prize winner reveal, resend ticket lookup และงาน key rotation จะถูกบันทึก audit log แบบ metadata-only โดยไม่ใส่ข้อมูลส่วนบุคคลจริงลงใน log
* **Audit Retention:** `apilogs.createdAt` มี TTL index ค่าเริ่มต้น 365 วัน ปรับได้ด้วย `AUDIT_LOG_RETENTION_DAYS`

ตัวแปรที่ควรตั้งใน production:

```bash
SESSION_TOKEN_HASH_SECRET=GENERATED_64_BYTE_HEX
CSRF_SECRET=GENERATED_64_BYTE_HEX
AUDIT_LOG_RETENTION_DAYS=365
SENSITIVE_AUDIT_STRICT=true
SESSION_IDLE_TIMEOUT=30m
SESSION_REFRESH_THRESHOLD=5m
SESSION_ABSOLUTE_TIMEOUT=12h
```

Session policy ใช้ sliding session: หากผู้ใช้ยัง active frontend จะเรียก `/api/sessions/refresh` ก่อนหมดอายุ แต่ session จะไม่ต่ออายุเกิน `SESSION_ABSOLUTE_TIMEOUT`

---

## Field Encryption Key Rotation

ระบบรองรับ key ring ผ่านตัวแปร `DATA_ENCRYPTION_KEYS` และใช้ `DATA_ENCRYPTION_KEY_ID` เป็น active key สำหรับข้อมูลใหม่

ตัวอย่างรูปแบบ key ring:

```bash
DATA_ENCRYPTION_KEYS='{"v1":"OLD_64_HEX_KEY","v2":"NEW_64_HEX_KEY"}'
DATA_ENCRYPTION_KEY_ID=v2
DATA_BLIND_INDEX_SECRET='STABLE_64_HEX_SECRET'
FIELD_ENCRYPTION_ENABLED=true
```

ขั้นตอน rotation ที่แนะนำ:

1. สำรอง MongoDB ก่อนทุกครั้ง
2. เพิ่ม key ใหม่เข้า `DATA_ENCRYPTION_KEYS` โดยยังเก็บ key เก่าไว้
3. เปลี่ยน `DATA_ENCRYPTION_KEY_ID` เป็น key ใหม่ เช่น `v2`
4. deploy backend ให้สามารถถอดรหัสได้ทั้ง key เก่าและ key ใหม่
5. dry-run เพื่อตรวจจำนวน record ที่จะถูก rotate:

```bash
npm --prefix backend run rotate:field-encryption
```

6. apply rotation:

```bash
APPLY=true npm --prefix backend run rotate:field-encryption
```

7. ตรวจ audit log action `SENSITIVE_KEY_ROTATION_APPLY`
8. หลังตรวจสอบข้อมูลเรียบร้อยแล้ว จึงค่อยถอด key เก่าออกจาก `DATA_ENCRYPTION_KEYS`

ข้อควรระวัง: `DATA_BLIND_INDEX_SECRET` ต้องคงเดิมหากต้องการให้การค้นหาเบอร์โทร/อีเมลเดิมยังทำงานได้ การ rotate ค่านี้ต้องวางแผน re-index แยกต่างหาก

หลังเปิด encryption กับระบบที่มีข้อมูลเดิม ให้รัน backfill เพื่อเติม `eventYear`, blind index และ search token:

```bash
npm --prefix backend run backfill:privacy-year
```

---

## E2EE Position

สถานะปัจจุบันคือ **server-side field encryption** ไม่ใช่ E2EE แท้ เพราะ backend ยังต้องถอดรหัสเพื่อทำ report, export, resend ticket, LINE notification และ dashboard บางส่วน

ถ้าต้องการ E2EE แบบสมบูรณ์ ต้องปรับสถาปัตยกรรมเป็น:

1. เข้ารหัส/ถอดรหัสเฉพาะใน browser หรือ client ที่ถือ key เท่านั้น
2. backend ห้ามถือ private key หรือ data encryption key สำหรับข้อมูลส่วนบุคคล
3. export/report/PDF ต้องย้ายไปทำฝั่ง client หลังจากผู้ดูแลปลดล็อก key
4. การค้นหาต้องใช้ client-generated blind index/search token
5. email/LINE ที่ต้องใช้ชื่อหรืออีเมลจริงต้องเปลี่ยน flow เพราะ backend จะอ่านข้อมูลนั้นไม่ได้

ห้ามประกาศว่าเป็น E2EE สมบูรณ์หาก backend ยังมี key ที่ใช้ decrypt ข้อมูลส่วนบุคคลได้

สามารถเปิด enforcement guard ได้ด้วย:

```bash
E2EE_STRICT_MODE=true
```

เมื่อเปิดค่านี้ backend จะปฏิเสธ server-side decrypt ทั้งหมด ดังนั้น endpoint ที่ยังต้อง export/report/email/LINE ด้วย plaintext จะล้มเหลวตามเจตนา จนกว่าจะย้าย flow เหล่านั้นไป decrypt ฝั่ง client

---

## Recommendations for Deployers

ผู้นำระบบไปใช้งาน (ในฐานะผู้ควบคุมข้อมูล) ควรปฏิบัติดังนี้เพื่อให้สอดคล้องกับกฎหมายอย่างสมบูรณ์:

1.  **HTTPS:** ต้องติดตั้ง SSL Certificate (HTTPS) ให้กับเว็บแอปพลิเคชันเสมอ เพื่อป้องกันการดักจับข้อมูลส่วนบุคคลระหว่างทาง
2.  **Privacy Policy:** ท่านควรจัดทำ "นโยบายความเป็นส่วนตัว (Privacy Notice)" ของงานอีเวนต์ และแปะลิงก์ไว้ที่หน้าลงทะเบียน เพื่อแจ้งวัตถุประสงค์การใช้ข้อมูลแก่ผู้เข้าร่วมงาน
3.  **Data Retention:** ควรกำหนดนโยบายการลบข้อมูล (Data Retention Policy) และทำการลบข้อมูลผู้เข้าร่วมงานออกจากฐานข้อมูลเมื่อเสร็จสิ้นกิจกรรมและพ้นระยะเวลาที่กฎหมายกำหนด
4.  **Log Maintenance:** หมั่นตรวจสอบและสำรองข้อมูล Audit Log เพื่อให้สามารถตรวจสอบย้อนหลังได้หากเกิดเหตุการณ์ละเมิด

## Out of Scope (สิ่งที่อยู่นอกเหนือขอบเขต)

* ความปลอดภัยของ Server Infrastructure และ Network (เป็นความรับผิดชอบของผู้ดูแล Server)
* การโจมตีแบบ DDoS ขนาดใหญ่ที่เกินขีดความสามารถของ Application Rate Limiting
* Social Engineering (การหลอกลวงเจ้าหน้าที่เพื่อขอรหัสผ่าน)
