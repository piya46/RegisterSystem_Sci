# User Requirements ฉบับละเอียดสำหรับระบบ PSEvent

เอกสารนี้จัดทำจากการตรวจโครงสร้างโปรเจกต์ปัจจุบันทั้ง backend, frontend, model, route, controller, middleware, utility และเอกสารเดิมใน repository เพื่อใช้เป็นข้อกำหนดผู้ใช้และข้อกำหนดระบบสำหรับพัฒนา ตรวจรับ ทดสอบ flow และยกระดับความปลอดภัย

หมายเหตุปรับปรุง 2026-08-14: เอกสารนี้ถูกปรับให้เข้ากับทิศทางระบบปัจจุบันที่แยก `Event System`, `POS System` และ `SSO/Identity System` เป็น bounded context คนละส่วน แต่ใช้งานร่วมกันผ่าน identity/session, permission claim, event context, audit log, notification provider และ reporting contract เดียวกัน โดย Email Provider เป้าหมายเปลี่ยนจาก SMTP/SendGrid ทั่วไปเป็น Brevo Transactional Email API

## 1. ขอบเขตระบบ

ระบบ PSEvent เป็นแพลตฟอร์มจัดการกิจกรรมแบบหลายงาน รองรับการสร้างองค์กร ชุดกิจกรรม รอบกิจกรรม การเปิดหน้าสาธารณะ การลงทะเบียนล่วงหน้า การลงทะเบียนหน้างาน การเช็คอินด้วย QR การจัดการผู้เข้าร่วม การรับเงินสนับสนุนและแพ็กเกจ การสุ่มรางวัล การทำรายงาน Dashboard การออก Ticket/Certificate/Receipt การจัดการ Wallet/Coupon การบริหารผู้ใช้หลังบ้าน และโมดูล Cloud POS/Inventory/PO/Settlement ที่ผูกกับ Event, Vendor และ Location

การประยุกต์ Requirement ชุด Enterprise POS/Inventory/Event/SSO/E-Signature ให้เข้ากับระบบนี้ต้องตีความดังนี้:

- `Event System` เป็นระบบหลักที่ใช้งานจริงก่อน ครอบคลุม event catalog, landing/register, participant, field, point, check-in, ticket, donation/package, wallet/coupon, report และ SQL event registration primary tables
- `POS System` เป็น subsystem แยกและยังอยู่สถานะ `Planned / Not Implemented` จนกว่าจะผ่าน PRD, threat model, accounting/legal approval, migration และ smoke test; POS ต้องใช้ `eventId`, `organizationId`, `vendorId`, `locationId`, `shiftId` เป็น contract ร่วมกับ Event แต่ห้ามปะปนกับ package stock เดิม
- `SSO/Identity System` เป็น boundary กลางสำหรับ admin/staff/participant identity, session, step-up auth, LINE/LIFF link และ Email OTP; Event และ POS ต้องตรวจสิทธิ์ผ่าน claim/scope เดียวกัน แต่แต่ละระบบต้องมี authorization check ของตนเอง
- ระบบทั้งสามแชร์ audit, secret management, object storage, email/LINE notification และ reporting mirror ได้ แต่ห้ามให้ component หนึ่งเขียนข้าม domain โดยตรงนอก API/outbox/reconciliation ที่กำหนด
- Email delivery สำหรับ OTP, ticket, receipt, reset password และ notification ต้องใช้ Brevo Transactional Email API เป็น provider หลัก; SMTP ใช้ได้เฉพาะ fallback/local compatibility ระหว่าง migration เท่านั้น

แหล่งข้อมูลที่ตรวจ:

- Backend: `backend/src/app.js`, `routes`, `controllers`, `models`, `middleware`, `utils`, `helpers`, `services`
- Frontend: `frontend/src/App.jsx`, `pages`, `components`, `hooks`, `providers`, `utils/api.js`
- เอกสารเดิม: `README.md`, `SECURITY.md`, `docs/MULTI_EVENT_OPERATION.md`, `docs/MULTI_EVENT_E2EE_ROADMAP.md`, `docs/POS_INVENTORY_PRD.md`

## 2. เป้าหมายหลักของระบบ

1. ผู้เข้าร่วมต้องสามารถดูหน้ากิจกรรม ลงทะเบียน รับ e-ticket และนำ QR ไปเช็คอินได้อย่างปลอดภัย
2. เจ้าหน้าที่ต้องสามารถลงทะเบียนหน้างาน เช็คอิน ค้นหาผู้เข้าร่วม และทำงานตามจุดลงทะเบียนที่ได้รับมอบหมาย
3. ผู้ดูแลต้องบริหารกิจกรรมหลายปี หลายองค์กร หลายรอบกิจกรรมได้โดยไม่ปะปนข้อมูล
4. ระบบต้องรองรับ dynamic fields, layout builder, public landing page, public dashboard และ report template ต่อกิจกรรม
5. ระบบต้องควบคุมสิทธิ์ระดับ role, permission, organization scope, event scope และ registration point scope
6. ข้อมูลส่วนบุคคลต้องถูกปกป้องด้วย consent, encryption, audit log, retention, masking และ export control
7. ระบบต้องมีมาตรการป้องกัน bot, brute force, CSRF, session hijacking, replay, privilege escalation และ data leakage
8. ระบบต้องรองรับ POS แบบ mobile/cloud โดยผูก order, payment, shift และ stock กับ Event/vendor/location อย่างตรวจสอบได้
9. ระบบต้องรองรับ inventory ledger, stock allocation, PO, partial receiving และ payable จากสินค้าที่รับจริง
10. ระบบต้องกู้ cart/outbox จากอุปกรณ์ได้โดยไม่ใช้ข้อมูล offline เป็นหลักฐานการชำระหรือเปิดช่อง double charge

## 3. ผู้ใช้และบทบาท

### 3.1 Public Visitor

- ดู landing page ของกิจกรรมที่เผยแพร่แล้ว
- ลงทะเบียนกิจกรรมที่เปิดรับสมัคร
- ขอส่ง e-ticket ซ้ำโดยใช้เบอร์โทร
- ดู public report, public dashboard และ public lucky draw ที่แสดงข้อมูลแบบ masked
- ยืนยัน certificate ผ่าน public verify endpoint

### 3.2 Participant

- ลงทะเบียนและได้รับ QR/e-ticket
- ใช้ LINE หรือ token เฉพาะ participant เพื่อดู wallet, coupon, certificate หรือแชร์ guest wallet
- ต้องเห็นเฉพาะข้อมูลของตนเองและข้อมูลที่ระบบอนุญาต

### 3.3 Guest Wallet User

- ได้รับ guest token จาก participant
- ใช้จ่าย coin/coupon จาก wallet ของ participant ภายในอายุ token ที่กำหนด
- ต้องไม่สามารถเข้าถึงข้อมูล participant อื่นหรือแก้ไข wallet owner ได้

### 3.4 Staff

- เข้าสู่ระบบหลังบ้าน
- สร้าง kiosk token/self-register link เฉพาะจุดที่ตนมีสิทธิ์
- ลงทะเบียน onsite และเช็คอินผู้เข้าร่วมเฉพาะจุดที่ได้รับมอบหมาย
- ค้นหาผู้เข้าร่วมตาม event scope

### 3.5 Kiosk Device

- ใช้ scoped JWT token สำหรับจุดลงทะเบียนเดียว
- ลงทะเบียน onsite และเช็คอินได้เฉพาะ registration point ที่ผูกกับ token
- ไม่สามารถเข้าถึง session/admin APIs หรือ action นอกเหนือ scope

### 3.6 Admin

- จัดการผู้ใช้ทั่วไป staff, registration point, participant, donation, package, prize, dashboard, report, settings และ session
- จัดการ event, layout, publish และ migration ในขอบเขตที่ได้รับอนุญาต
- Export ข้อมูลและดูข้อมูลถอดรหัสได้เฉพาะเมื่อมีสิทธิ์และมี audit log

### 3.7 Superadmin

- มีสิทธิ์สูงสุดทุก permission
- จัดการ system admin role, custom permissions, organization-level access, encryption policy, key rotation และ infrastructure policy
- Action สำคัญต้องมี MFA/OTP และ audit แบบ strict

### 3.8 Organization/Event Roles

- `org_admin`: จัดการ organization และ event ภายใต้องค์กรที่ได้รับมอบหมาย
- `event_admin`: จัดการกิจกรรมเฉพาะ event ที่ได้รับสิทธิ์
- `event_manager`: จัดการ event/layout/participant operations แต่ไม่ควร export ข้อมูลอ่อนไหว
- `auditor`: อ่าน event และ audit/report ได้ แต่แก้ไขไม่ได้

### 3.9 POS, Store และ Inventory Roles

- `pos_cashier`: ขายสินค้าในกะ/จุดขายที่ได้รับมอบหมาย, ยืนยัน float และ blind close
- `pos_supervisor`: อนุมัติ override/incident ตาม policy โดยห้ามเห็น expected close ก่อน cashier submit
- `store_manager`: เปิดกะ, กำหนด float, review variance, negative stock และ alert
- `inventory_staff`: รับ/โอน/นับ/ปรับ stock ตาม location และ permission
- `procurement_admin`: สร้าง/approve/force-close PO ตาม separation of duties
- `accountant`: reconcile Gross/Fee/Net, refund, payout และ Accounts Payable
- ทุก role ต้องตรวจ organization, Event, vendor, location, terminal และ shift scope เพิ่มจาก role name

## 4. โครงสร้างข้อมูลและความสัมพันธ์

### 4.1 Core Event Hierarchy

1. `Organization`
   - เจ้าของหรือหน่วยงานหลัก
   - มี `securityPolicy` เช่น require MFA, audit reason, public registration
   - มีหลาย `EventSeries`
2. `EventSeries`
   - ชุดกิจกรรมต่อเนื่อง เช่น งานประจำปี
   - ผูกกับ `organizationId`
   - กำหนด `defaultLinkingMode`
   - มีหลาย `Event`
3. `Event`
   - รอบกิจกรรมจริง เช่น ปี 2026
   - ผูกกับ `organizationId`, `seriesId`, `eventYear`, `slug`
   - มี lifecycle, branding, config, public links, layouts, templates และ version history

### 4.2 Operational Data

- `Participant` ผูกกับ `organizationId`, `seriesId`, `eventId`, `eventYear`
- `Donation` ผูกกับ event และอาจอ้าง package/pickup/delivery
- `Package` ผูกกับ event และมี stock/sold ต่อ size
- `Prize` ผูกกับ event และเก็บ winners
- `Wallet` ผูกกับ participant/event
- `Transaction` ผูกกับ wallet/vendor/event
- `Receipt` ผูกกับ participant/event
- `RegistrationPoint` ใช้กับ staff/kiosk onsite flow
- `ParticipantField` กำหนด dynamic fields ของ registration form
- `SystemSetting` เก็บ active/current event สำหรับ legacy/global views
- `Session` เก็บ admin session ที่ hash token แล้ว
- `ApiLog` เก็บ audit log พร้อม TTL
- `RegistrationReuseChallenge` เก็บ OTP challenge สำหรับดึงข้อมูลลงทะเบียนเดิม
- `GuestToken` เก็บ token แชร์ wallet พร้อม TTL
- `PosLocation`/`PosTerminal`/`PosDeviceSession` กำหนดขอบเขตอุปกรณ์และจุดขาย
- `PosShift`/`ShiftCloseSubmission` เก็บ float, blind declaration และ reconciliation แบบ versioned
- `Product`/`ProductVariant`/`InventoryMovement`/`InventoryBalance`/`StockReservation` เป็น unified inventory ledger; ห้ามใช้ยอด stock field เดียวเป็นหลักฐานย้อนหลัง
- `PosOrder`/`PosPayment`/`PaymentProviderEvent` เก็บ pricing snapshot, payment state และ provider evidence แบบ idempotent
- `ESlipRecord` เก็บ metadata/checksum ของ private GCS object; ห้ามเก็บ E-slip binary ใน MongoDB
- `Supplier`/`PurchaseOrder`/`GoodsReceipt`/`AccountsPayableEntry` รองรับ partial receiving และ payable จาก accepted quantity จริง

### 4.3 ความสัมพันธ์สำคัญ

- Public event route ใช้ `Event.slug` เพื่อ resolve `eventId` และเขียนข้อมูลเข้ากิจกรรมที่ถูกต้อง
- ข้อมูลเก่ายังใช้ `eventYear` ได้ แต่ข้อมูลใหม่ควรเขียนทั้ง `eventId`, `seriesId`, `organizationId`, `eventYear`
- `SystemSetting.currentEventId` ใช้เป็น default context ให้หน้าระบบเก่าที่ไม่ได้ส่ง event identity
- `Participant.fields` มาจาก `ParticipantField` และบาง field ถูก encrypt
- `Donation` ที่เป็น package ต้องตรวจ `Package` และตัด stock แบบ transaction
- `Prize.draw` ใช้ participant ที่ checked-in และยังไม่เคยได้รางวัลใน scope เดียวกัน
- `Wallet.pay` ต้องตรวจ wallet, guest token, vendor และบันทึก `Transaction`
- ทุกการ decrypt/export/report ข้อมูลอ่อนไหวต้องสร้าง sensitive audit log
- POS flow ต้องเป็น `assigned shift -> float acknowledgement -> order -> payment confirmation -> inventory/receipt -> blind close -> reconciliation -> manager review`
- Stripe webhook ที่ตรวจ signature แล้วเป็น authority สำหรับ online payment fulfillment; client callback, screenshot และ IndexedDB ใช้ยืนยันชำระไม่ได้
- PO flow ต้องเป็น `approved PO -> one or more goods receipts -> inventory movements -> AP from accepted quantity -> close/reconcile`

### 4.4 System Boundary และ Shared Contracts ระหว่าง Event, POS, SSO

ระบบต้องแบ่ง ownership ชัดเจนเพื่อให้ Event, POS และ SSO แยกพัฒนา/ทดสอบ/deploy ได้โดยไม่ทำข้อมูลปะปน แต่ผู้ใช้ยังรู้สึกว่าเป็น ecosystem เดียวกัน

Bounded Context:

- `SSO/Identity`: owns admin, staff, participant identity, provider link, session, cookie/JWT issuance, step-up challenge, token revocation และ permission claim
- `Event`: owns organization, event series, event lifecycle, registration schema, participant registration/check-in, ticket/certificate, package/donation/wallet ที่ผูกกับ event
- `POS`: owns product catalog, POS location/terminal/device, shift/float, order/payment, inventory ledger, receipt/e-slip, PO/AP และ settlement ที่ผูกกับ event/vendor/location
- `Notification`: owns delivery provider abstraction สำหรับ Brevo Email API, LINE Messaging API และ delivery audit/outbox; business domain เรียกผ่าน service contract เท่านั้น
- `Reporting/Mirror`: owns MariaDB reporting/runtime tables, reconciliation snapshots และ cutover runs; ไม่ถือเป็น source of truth ของ domain ที่ยังไม่ cutover

Shared Contract:

- ทุก request ข้ามระบบต้องส่ง identity และ scope อย่างน้อย `subjectId`, `role`, `permissions`, `organizationIds`, `eventIds`, และเมื่อต้องใช้ POS ต้องมี `vendorId`, `locationId`, `terminalId`, `shiftId`
- `eventId` เป็น canonical context สำหรับการเชื่อม Event และ POS; `eventYear` เป็น compatibility/report field เท่านั้น
- Public URL ใช้ `eventSlug`; internal service/API ใช้ opaque id หรือ Mongo ObjectId ตาม domain และห้าม expose sequential SQL id เป็น credential
- Cross-system write ใช้ API, outbox, webhook หรือ reconciliation job เท่านั้น ห้ามให้ frontend หรือ Plesk gateway เขียน DB ข้าม domain โดยตรง
- Audit log ต้องมี `domain`, `actor`, `eventId`, `sourceSystem`, `action`, `reason`, `correlationId` และไม่บันทึก PII plaintext

Acceptance Criteria:

- Event registration ยังทำงานได้แม้ POS ถูกปิดทุก feature flag
- POS ต้องเปิดต่อ Event ได้โดยไม่ต้องเปลี่ยน Event registration flow ที่ใช้งานอยู่
- SSO outage ต้อง fail closed สำหรับ admin/POS write แต่ public read-only page ที่ cache ได้ต้องแสดงตาม policy
- การ revoke session หรือ step-up auth จาก SSO ต้องมีผลกับ Event และ POS action ที่ต้องใช้สิทธิ์ทันที
- Email provider failure ต้องสร้าง delivery audit/outbox/retry แต่ห้าม rollback transaction ที่ commit สำเร็จแล้ว เช่น participant registration

## 5. ข้อกำหนดระดับกิจกรรม

### 5.1 Organization Management

ระบบต้องสามารถ:

- สร้าง แก้ไข และ archive organization
- บังคับ unique slug
- กำหนด security policy ต่อ organization
- จำกัดการจัดการ organization เฉพาะ superadmin/admin หรือ org_admin ที่มี scope

Acceptance Criteria:

- ผู้ไม่มีสิทธิ์ organization scope ต้องได้ HTTP 403
- slug ซ้ำต้องได้ HTTP 409
- การแก้ policy ต้องมี audit log

### 5.2 Event Series Management

ระบบต้องสามารถ:

- สร้าง แก้ไข และ archive event series
- ผูก series กับ organization
- กำหนด linking mode เริ่มต้นเป็น `isolated`, `series-linked` หรือ `manual-linked`
- จำกัดสิทธิ์ตาม organization scope

### 5.3 Event Management

ระบบต้องสามารถ:

- สร้าง event ใหม่พร้อม name, slug, year, date/time, timezone, organization, series
- clone branding, config, layout, templates จาก event เดิมได้
- เปิด/ปิด feature ต่อ event ได้แก่ registration, checkin, dashboard, publicReport, donations, packages, luckyDraw
- ตั้งค่า welcome message, contact email, pickup/delivery, maintenance, registration window, kiosk window
- กำหนด public links และ branding ได้แก่ logo, cover, primary/secondary/accent color
- เก็บ layout version และ version history สูงสุดตาม policy
- ลบ event ได้เฉพาะ event ที่ไม่ใช่ current event และไม่มี participant/donation/package/prize data

Acceptance Criteria:

- event slug ต้อง sanitize และ unique ใน organization/series
- event ที่มีข้อมูลแล้วต้องลบไม่ได้ ให้ใช้ archive แทน
- update status, publish, activate, clone ต้องมี audit log

### 5.4 Event Lifecycle

สถานะที่รองรับ:

- `draft`: ตั้งค่าภายในเท่านั้น
- `published`: public landing เปิดดูได้ แต่ยังไม่รับลงทะเบียน
- `registration_open`: public landing และ registration เปิดใช้งาน
- `registration_closed`: landing ยังเปิดได้ แต่ลงทะเบียนไม่ได้
- `event_day`: ใช้หน้าวันงาน/public screen ได้
- `archived`: เก็บย้อนหลังเพื่อรายงานและ audit

Flow:

1. Admin/Event Manager สร้าง event เป็น `draft`
2. ตั้งค่า branding, config, layout, field, package, prize
3. Publish event เพื่อเปิด public landing
4. เปลี่ยน status เป็น `registration_open` เมื่อพร้อมรับลงทะเบียน
5. ปิดรับเป็น `registration_closed`
6. เปลี่ยนเป็น `event_day` สำหรับหน้างาน
7. Archive หลังจบงาน

ข้อกำหนด:

- `activate` เป็นคนละ action กับ `publish` เพราะใช้ sync current settings สำหรับ legacy views
- public registration ต้องตรวจทั้ง status, feature flag, maintenance mode และช่วงเวลา
- public endpoint ต้องไม่เปิดเผย event ที่ status ไม่ใช่ public status

### 5.5 Event Management Workspace และ Entry Experience

ระบบต้องมีประสบการณ์เข้าสู่ระบบจัดการแบบ event-first คือผู้ดูแลหรือเจ้าหน้าที่ต้องเลือก Event ก่อน แล้วทุกหน้าจัดการที่เปิดหลังจากนั้นต้องอยู่ภายใต้บริบทของ Event นั้น ไม่ให้ผู้ใช้หลงไปจัดการข้อมูลของ Event อื่นโดยไม่ตั้งใจ

เป้าหมาย:

- ให้ผู้ใช้ 1 คนหรือหลายคนที่มีสิทธิ์สามารถจัดการ Event เฉพาะงานได้จาก workspace เดียว
- แสดงความชัดเจนเสมอว่ากำลังจัดการ Event ใดอยู่
- ลดความเสี่ยงการแก้ participant, donation, package, prize, dashboard หรือ layout ผิด Event
- ทำให้ flow หลัง login เข้าสู่ระบบจัดการของ Event ที่เลือกได้อย่างมั่นใจและดูเป็นระบบเดียวกัน

Flow การเข้าสู่ระบบจัดการ Event:

1. ผู้ใช้ login สำเร็จ
2. ระบบโหลด `GET /api/events/catalog` เพื่อดู Event ที่ผู้ใช้มีสิทธิ์
3. ถ้าผู้ใช้มี Event เดียว ระบบสามารถเลือก Event นั้นให้อัตโนมัติ
4. ถ้าผู้ใช้มีหลาย Event ระบบต้องแสดง Event picker พร้อมข้อมูลสรุป เช่น ชื่อ Event, ปี, สถานะ, วันจัดงาน, จำนวนผู้ลงทะเบียน, feature ที่เปิด
5. เมื่อผู้ใช้กดเข้า Event ระบบต้องแสดง transition/loading screen เฉพาะ Event
6. Loading screen ต้องแสดงโลโก้ของ Event หรือ organization ถ้า Event ไม่มีโลโก้
7. โลโก้ต้องมี animation หมุนหรือ loading motion ที่ไม่รบกวนสายตา
8. ต้องแสดงข้อความ เช่น `กำลังเข้าสู่ระบบจัดการของ Event: {eventName}` หรือ `กำลังโหลดพื้นที่จัดการ {eventName}`
9. ระบบต้องโหลด event detail, permissions, layout config, dashboard summary, registration points และ feature flags ที่จำเป็นก่อนเปิด workspace
10. เมื่อข้อมูลพร้อม ระบบ redirect ไป `/admin/events/:eventId/dashboard` หรือหน้า default ที่ role นั้นใช้งานได้
11. ถ้าโหลดไม่สำเร็จ ต้องแสดง error state พร้อมปุ่มลองใหม่และกลับไป Event picker

ข้อกำหนด UI ของ Event Loading Screen:

- ต้องใช้ Event logo จาก `event.branding.logoUrl` เป็นอันดับแรก
- ถ้าไม่มี Event logo ให้ใช้ organization logo หรือ system logo fallback
- โลโก้ต้องอยู่กึ่งกลางหน้าจอและมีสถานะกำลังโหลดที่เข้าใจได้
- ข้อความต้องแสดงชื่อ Event จริงจาก backend ห้ามใช้ชื่อจาก query string อย่างเดียว
- ต้องรองรับ mobile และ desktop
- ต้องไม่ทำให้ layout กระตุกเมื่อโหลดเสร็จ
- ต้องมี timeout/error state หากโหลดเกินเวลาที่กำหนด เช่น 15-30 วินาที
- ต้องไม่แสดงข้อมูลอ่อนไหวบน loading screen

ข้อกำหนด Event Context หลังเข้าสู่ Workspace:

- ทุก API ที่เกี่ยวกับข้อมูลกิจกรรมต้องส่ง `eventId` หรือ `eventSlug` ให้ชัดเจน
- ทุกเมนูภายใน `/admin/events/:eventId/*` ต้องอ่าน Event context จาก route และตรวจสิทธิ์ซ้ำจาก backend
- Header หรือ sidebar ของ workspace ต้องแสดงชื่อ Event, ปี, status และ badge ฟีเจอร์สำคัญ
- การสลับ Event ต้องเป็น action ชัดเจน ไม่เปลี่ยน silently
- เมื่อผู้ใช้เปิด URL event ที่ไม่มีสิทธิ์ ต้อง redirect ไป unauthorized หรือ Event picker พร้อมข้อความที่เหมาะสม
- ถ้า Event ถูก archived ต้องเข้าสู่โหมด read-only ยกเว้นผู้มีสิทธิ์ archive management
- Action ที่กระทบ public เช่น publish, open registration, close registration, archive ต้องมี confirmation dialog และ audit log

เมนูที่ต้องอยู่ใน Event Workspace:

- Dashboard ของ Event
- Settings และ branding ของ Event
- Layout builder ของ landing/register/dashboard/ticket/report
- Participant management, search, edit, export
- Staff/kiosk/check-in tools ที่ scope กับ Event
- Registration points หรือ point mapping ของ Event
- Donations และ package orders
- Package/stock management
- Lucky draw/prize management
- Public report/dashboard preview
- Ticket, certificate และ receipt tools
- Audit timeline เฉพาะ Event
- Clone/import settings จาก Event อื่นที่ผู้ใช้มีสิทธิ์

Acceptance Criteria:

- หลังเข้า `/admin/events/:eventId/*` ทุก request สำคัญต้องมี `eventId`
- หน้าจัดการต้องไม่ fallback ไป current global event ถ้าอยู่ใน event-specific route
- Event loading screen ต้องแสดงชื่อ Event และโลโก้ที่ถูกต้อง
- ผู้ใช้ที่มีสิทธิ์ Event เดียวต้องเข้า Event workspace ได้ภายใน flow เดียวหลัง login
- ผู้ใช้ที่มีหลาย Event ต้องเลือก Event ก่อนเปิดเครื่องมือจัดการ
- การเข้าถึง Event ที่ไม่มีสิทธิ์ต้องถูกปฏิเสธทั้ง frontend และ backend
- ทุกหน้าภายใน workspace ต้องแสดง Event identity ชัดเจน
- การสลับ Event ต้องล้าง state/filter/cache เดิมเพื่อกันข้อมูลปะปน
- เมื่อ Event status เปลี่ยน เมนูและ action ต้องอัปเดตตาม feature/status ใหม่

## 6. ข้อกำหนด Public Landing และ Layout Builder

ระบบต้องสามารถ:

- แสดง `/e/:eventSlug` สำหรับ landing page
- แสดง `/e/:eventSlug/register` สำหรับ registration form
- ดึง event public payload เฉพาะ event ที่ public status
- รองรับ layout keys: `landingPage`, `registrationForm`, `dashboard`, `ticket`, `report`
- รองรับ landing blocks: hero, richText, details, schedule, packages, sponsors, faq, map, cta, divider
- sanitize block type, field type, text length, URL, color และ unknown content
- version layout ทุกครั้งที่บันทึก
- publish snapshot ลง version history

Acceptance Criteria:

- Script tag ต้องถูกตัดออก
- URL ต้องเป็น relative path หรือ http/https เท่านั้น
- field name ต้อง normalize เป็น lowercase alphanumeric/underscore
- จำนวน block/field ต้องไม่เกิน limit ที่ระบบกำหนด

## 7. ข้อกำหนด Registration Flow

### 7.1 Public Pre-registration

Flow:

1. ผู้ใช้เปิด public registration ด้วย event slug
2. Frontend โหลด public event, settings, participant fields และ packages
3. ระบบตรวจ event status, maintenance mode, feature flag, preRegStartDate/preRegEndDate
4. ผู้ใช้กรอก dynamic fields, consent, followers, special assistance และ donation/package ถ้ามี
5. Frontend สร้าง `Idempotency-Key` แบบสุ่มอย่างน้อย 128 bits ต่อการ submit และใช้ key เดิมเมื่อ retry request เดิม
6. Frontend ขอ Cloudflare Turnstile token
7. Backend resolve Event และตรวจ idempotency hash/fingerprint ก่อน consume Turnstile เพื่อกู้ผลสำเร็จหลัง timeout ได้
8. Backend รับเฉพาะ field ที่เปิดใช้งานใน `ParticipantField`
9. Backend ตรวจ required fields, email/phone format, Buddhist year rule และ package address rule
10. Backend ตรวจ duplicate ด้วย email หรือ phone ภายใน event scope โดยรองรับ encrypted blind index และ legacy plaintext
11. Backend ตรวจ Turnstile เฉพาะ request ใหม่; replay ที่ fingerprint ตรงต้องคืน participant เดิมโดยไม่สร้าง record/ส่ง email ซ้ำ
12. Backend สร้าง UUID QR code
13. Backend encrypt sensitive fields, สร้าง blind index/search tokens และบันทึก participant พร้อม hashed idempotency metadata
14. Backend ส่ง e-ticket ทาง email หากมี email
15. Backend audit action และตอบข้อมูล participant ที่ reveal เฉพาะ response

Acceptance Criteria:

- request ต้องมี event identity เมื่อเป็น public event flow
- event ที่ยังไม่ `registration_open` ต้องลงทะเบียนไม่ได้
- Turnstile fail ต้องถูก block และ audit เป็น bot block
- phone ต้องตรงรูปแบบ `0[689]xxxxxxxx`
- ข้อมูล address/postcode ต้องบังคับเมื่อเลือก package delivery/support package
- sensitive fields ต้องถูกเก็บแบบ encrypted เมื่อเปิด field encryption
- email sending fail ต้องไม่ rollback participant แต่ต้อง audit
- production request ที่ไม่มี `Idempotency-Key` ต้องถูก reject เมื่อ `PARTICIPANT_REGISTRATION_IDEMPOTENCY_REQUIRED=true`
- key เดิม + payload เดิมต้องคืน participant เดิม; key เดิม + payload ต่างต้องได้ 409
- raw key ห้ามถูกเก็บใน Participant, SQL mirror, response หรือ log; เก็บเฉพาะ SHA-256 hash และ payload fingerprint
- Event A และ Event B สามารถใช้ client key ค่าเดียวกันได้โดยไม่ชนกัน เพราะ unique scope ต้องเป็น `eventId + keyHash`

Draft Privacy Requirements:

- draft ต้องแยก key ตาม Event route และห้ามใช้ key กลางที่ทำให้ข้อมูลข้าม Event
- sessionStorage เก็บได้เฉพาะ preference ที่ไม่ใช่ PII เช่น package/size/pickup option; ห้ามเก็บชื่อ อีเมล เบอร์ ที่อยู่ special assistance, slip reference หรือ donation amount
- build ใหม่ต้องลบ legacy unscoped draft ที่อาจมี PII เมื่อเปิดหน้า registration ครั้งแรก
- submit สำเร็จต้องลบ draft ของ Event นั้น และการสลับ Event ต้องไม่ prefill PII จาก Event ก่อนหน้า
- ห้ามอ้างว่า client-side encryption ปลอดภัยหาก encryption key ถูกเก็บข้าง ciphertext ใน storage เดียวกัน; หากต้องการ resume PII จริงต้องใช้ authenticated server-side draft พร้อม TTL/consent

### 7.2 Registration Reuse Flow

Flow:

1. ผู้ใช้กรอก email เพื่อขอดึงข้อมูลลงทะเบียนเดิม
2. Backend ตรวจ event เปิด reuse และ registration เปิดอยู่
3. Backend ค้นหา participant จาก source events ตาม linking mode
4. ถ้าพบข้อมูล ส่ง OTP ไป email และสร้าง challenge อายุ 10 นาที
5. ถ้าไม่พบข้อมูล ตอบ generic response เหมือนพบข้อมูลเพื่อป้องกัน enumeration
6. ผู้ใช้กรอก OTP
7. Backend จำกัด attempts ไม่เกิน 5 ครั้ง
8. เมื่อ OTP ถูกต้อง ระบบ reveal fields เพื่อ prefill และ audit sensitive decrypt

Acceptance Criteria:

- response ต้องไม่บอกว่า email มีอยู่หรือไม่
- challenge ใช้ซ้ำไม่ได้หลัง `usedAt`
- OTP หมดอายุหรือเกิน attempts ต้อง reject
- prefill ต้องไม่สร้าง participant ใหม่จนกว่าผู้ใช้ submit registration form

### 7.3 Resend Ticket Flow

Flow:

1. ผู้ใช้กรอก phone
2. Backend ตรวจ phone format และ event identity
3. Backend ค้นหา participant ใน event scope ด้วย blind index/plain fallback
4. ระบบตอบ generic response เสมอ
5. ถ้าพบ participant และมี email ระบบส่ง ticket ใหม่และ audit sensitive decrypt

Acceptance Criteria:

- ห้าม expose ว่าเบอร์โทรมีอยู่ในระบบหรือไม่
- ต้องมี rate limit สำหรับ endpoint นี้
- ต้อง audit โดยไม่ใส่ email/plain PII ลง log

## 8. ข้อกำหนด Onsite, Staff, Kiosk และ Self-register

ระบบลงทะเบียนหน้างานต้องรองรับ 2 รูปแบบที่แยก UX, สิทธิ์, token, audit และรายงานออกจากกันอย่างชัดเจน:

1. `onsite_staff`: เจ้าหน้าที่ลงทะเบียนให้ผู้เข้าร่วมผ่าน Staff Mode
2. `onsite_kiosk`: ผู้เข้าร่วมลงทะเบียนด้วยตนเองผ่านเครื่อง Kiosk ที่ถูกล็อกและตรวจความพร้อมแล้ว

ข้อกำหนดร่วม:

- ทุก flow หน้างานต้องผูก `eventId`, `eventYear`, `registrationPoint`, `registrationType`, `registeredBy`, `checkedInAt` และ `status`
- เมื่อ submit สำเร็จ ระบบต้องสร้าง participant เป็น `checkedIn` ทันที เพราะผู้ใช้มาถึงหน้างานแล้ว
- Dynamic fields ต้องใช้ schema ของ Event/Registration mode ที่ถูกต้อง ไม่ใช้ global fields แบบปะปนถ้าแต่ละ Event ต่างกัน
- Duplicate check ต้องทำใน event scope และรองรับข้อมูล encrypted/plain legacy
- ต้อง audit ว่าใคร/จุดไหน/โหมดไหนเป็นผู้สร้าง record โดยไม่ log PII plaintext
- Report ต้องแยกได้ว่า participant มาจาก online, onsite_staff, onsite_kiosk, self_register_session หรือ check-in จาก pre-registration

### 8.1 Staff Onsite Registration

Flow:

1. Staff/Admin login
2. เลือก registration point
3. ระบบตรวจว่า point enabled และ staff มีสิทธิ์ point นั้น
4. Staff กรอกข้อมูล onsite
5. Backend ตรวจ kiosk window, dynamic fields, required fields, event identity และ duplicate
6. ระบบสร้าง participant เป็น `checkedIn` ทันที
7. ระบบบันทึก registeredBy, registeredPoint, registrationType=`onsite_staff`, followers, consent, tags
8. ระบบแสดงผลสำเร็จพร้อม QR/ticket summary และปุ่มลงทะเบียนรายถัดไป

Acceptance Criteria:

- Staff ที่ไม่ได้รับ point ต้องลงทะเบียนหรือเช็คอิน point นั้นไม่ได้
- Onsite registration ต้องเขียน event references ครบ
- Self-service ต้องติด tag แยกจาก staff-assisted
- Staff ต้องค้นหาผู้ลงทะเบียนล่วงหน้าได้ เผื่อผู้เข้าร่วมลืม QR ticket
- Staff dashboard ควรแสดงจำนวนที่ตนลงทะเบียน ณ point นั้น, จำนวน check-in, และ error ล่าสุดแบบไม่เปิด PII เกินจำเป็น
- Staff Mode ต้องใช้ session ปกติของ staff/admin ไม่ใช้ kiosk scoped token

### 8.2 Kiosk Token Flow

Flow:

1. Staff/Admin สร้าง kiosk token ให้ point ที่มีสิทธิ์
2. Backend ออก JWT scope `kiosk_device`, audience `kiosk-device`, issuer `psevent`, อายุ 12 ชั่วโมง
3. Kiosk ใช้ token เฉพาะ endpoint `/auth/me`, `/participants/register-onsite`, `/participants/checkin-by-qr`
4. Backend ตรวจ pointId ใน token ทุกครั้ง
5. Kiosk token ต้องผูกกับ registration point ชนิด `kiosk` หรือ point ที่อนุญาต kiosk mode เท่านั้น
6. Kiosk token ต้องฝัง `eventId` และ `eventYear` จาก event context ที่ staff/admin มีสิทธิ์จริง และ backend ต้องใช้ event จาก token เป็น source of truth สำหรับ scoped flow
7. ต้องมี endpoint verify token เช่น `POST /api/auth/kiosk/verify` หรือ `POST /api/public/kiosk-token/verify` สำหรับ diagnostic screen

Acceptance Criteria:

- Kiosk token ต้องใช้กับ point อื่นไม่ได้
- Kiosk token ต้องใช้กับ event อื่นไม่ได้ และต้อง reject หาก client ส่ง eventId/eventYear ไม่ตรงกับ token
- Kiosk token ต้องเข้าถึง admin/session/export APIs ไม่ได้
- Token หมดอายุต้องกลับไปสร้างใหม่
- Kiosk token verify ต้องคืนข้อมูลขั้นต่ำ เช่น `pointId`, `pointName`, `eventId`, `eventYear`, `expiresAt`, `features`
- ถ้า point disabled, Event ปิด, kiosk window ยังไม่เปิด/หมดเวลา หรือ token ไม่ตรง audience/issuer ต้อง reject แบบ fail-closed
- ห้ามเก็บ kiosk token ถาวรใน localStorage สำหรับเครื่องสาธารณะ เว้นแต่มี kiosk wrapper policy และต้องล้างเมื่อ exit

### 8.3 Self-register QR Flow

Flow:

1. Staff/Admin สร้าง self-register master token สำหรับ point
2. ต้องกำหนด validFrom และ validUntil
3. อายุ master token ต้องไม่เกิน 24 ชั่วโมง
4. ผู้เข้าร่วมสแกน QR และแลกเป็น short session
5. Short session อายุ 15 นาที ใช้ submit onsite registration ได้ 1 flow

Acceptance Criteria:

- master token ก่อนเวลาใช้งานต้อง reject ด้วย NotBefore
- master token หมดอายุต้อง reject
- short session ต้องผูก point/staffId และใช้ point อื่นไม่ได้
- Short session ต้องใช้กับ submit ได้ครั้งเดียว หรืออย่างน้อยต้องมี replay protection/idempotency

### 8.4 QR Check-in Flow

Flow:

1. Staff/Kiosk ส่ง qrCode และ registrationPoint
2. Backend ตรวจสิทธิ์ point หรือ kiosk token point
3. Backend resolve participant ตาม event identity
4. ถ้าไม่พบ ticket ตอบ 404
5. ถ้า checked-in แล้ว ตอบ 400
6. ถ้ายังไม่ checked-in อัปเดต status, checkedInAt, registeredBy, registeredPoint, followers
7. ตอบ participant summary และ audit sensitive decrypt

Acceptance Criteria:

- QR ของ event อื่นต้องใช้เช็คอินไม่ได้
- checked-in ซ้ำต้องไม่เปลี่ยนข้อมูล
- response ต้องเปิดเผยเฉพาะข้อมูลที่จำเป็นสำหรับ staff screen

### 8.5 Kiosk Diagnostic และ Device Readiness

ก่อนเปิด Kiosk ให้ผู้เข้าร่วมใช้งาน ต้องมี Diagnostic Screen เป็นด่านตรวจความพร้อม ไม่ควรเข้าหน้า Kiosk registration โดยตรง

Pre-flight Checks:

- Network: ตรวจ `navigator.onLine` และ ping/health check ไป backend
- Backend API: ตรวจว่า API ตอบภายใน SLA เช่น 2-5 วินาที
- Kiosk token: verify token, audience, issuer, expiry, point, event และ kiosk window
- Registration point: point ต้อง `enabled=true`, type ถูกต้อง และอยู่ใน Event เดียวกับ token
- Camera permission: ถ้ามี self check-in/QR scan ต้องขอ permission และปิด stream ทันทีหลังทดสอบ
- Fullscreen capability: ตรวจ `document.fullscreenEnabled` และให้ staff กดเข้า fullscreen ก่อนเริ่ม
- Display/orientation: หน้าจอต้องใหญ่พอ เช่น tablet/desktop และเตือนถ้า orientation ไม่เหมาะสม
- Storage: ตรวจ sessionStorage/localStorage ว่าใช้งานได้สำหรับ state ชั่วคราวและ auto-reset
- Time sync: แสดงเวลาเครื่องและเวลาจาก server เพื่อให้ staff เห็นถ้าเครื่องเวลาผิดมาก
- Turnstile/security: ตรวจว่าสคริปต์ bot protection พร้อมใช้งานก่อนเปิดให้ submit จริง

Diagnostic UI Requirements:

- แสดงรายการตรวจเป็น `pending/success/error`
- ปุ่ม `เปิดใช้งาน Kiosk` ต้องกดได้เมื่อ critical checks ผ่านเท่านั้น
- ต้องมีปุ่ม `ลองตรวจอีกครั้ง`
- Error ต้องบอก action ที่ staff ทำได้ เช่น ต่อ Wi-Fi, อนุญาตกล้อง, สร้าง token ใหม่, เปิด fullscreen
- เมื่อผ่านแล้วจึงเข้า `/kiosk/run` หรือ set `kioskMode=true`
- Diagnostic log ต้องบันทึกเฉพาะ metadata เช่น point, device label, browser, status ไม่เก็บข้อมูลผู้เข้าร่วม

### 8.6 Kiosk Runtime UX และ Privacy Reset

Kiosk Runtime ต้องออกแบบให้เหมาะกับเครื่องสาธารณะ:

- Hide navigation ทั้งหมด ไม่แสดง admin shell, sidebar, browser-like links หรือปุ่มออกที่ผู้เข้าร่วมเห็นง่าย
- Idle Screen มีแบรนด์/ชื่อ Event/ชื่อ point และปุ่มใหญ่ `แตะเพื่อลงทะเบียน`
- Auto-reset timeout ค่าเริ่มต้น 60 วินาทีเมื่อไม่มี mouse/touch/keyboard activity
- Auto-reset ต้องล้าง form, validation errors, review dialog, Turnstile token, temporary state และ scroll position
- Success Screen แสดงข้อมูลจำเป็นเท่านั้น เช่น ชื่อ, point, QR/ticket หรือ instruction ให้ถ่ายรูป/รับอีเมล
- Success Screen ต้อง countdown กลับหน้า idle เช่น 5-10 วินาที
- ต้องมี staff exit flow ที่ต้องยืนยันตัวตน เช่น admin password/OTP เพื่อออกจาก Kiosk mode
- หลัง exit ต้อง clear scoped token และ temporary state
- ห้ามให้ผู้ใช้คิวถัดไปเห็นข้อมูลคิวก่อนหน้า

### 8.7 OS-level Kiosk Lock Requirement

Web/React ไม่สามารถล็อกปุ่มระดับ OS เช่น F11, Alt+Tab, Cmd+Tab, Windows key, Home gesture หรือ Ctrl+Alt+Del ได้อย่างสมบูรณ์ ดังนั้น production Kiosk ต้องมี runbook ระดับอุปกรณ์:

- iPad: ใช้ Guided Access หรือ MDM Single App Mode
- Windows: ใช้ Assigned Access/Kiosk Mode หรือ Chrome/Edge `--kiosk` ร่วมกับ user account จำกัดสิทธิ์
- Android: ใช้ Screen Pinning, Android Enterprise Lock Task Mode หรือ MDM
- macOS: ใช้ browser kiosk wrapper หรือ MDM profile หากต้องล็อกจริง
- Browser fullscreen เป็น UX enhancement เท่านั้น ไม่ถือเป็น security boundary
- Staff ต้องมี checklist ก่อนเปิดงาน: power, network, charger, brightness, guided access/assigned access enabled, token expiry, point name ถูกต้อง

Acceptance Criteria:

- คู่มือ setup OS kiosk ต้องอยู่ใน Operation Guide
- Staff ต้องทดสอบออกจาก Kiosk ด้วยวิธีที่กำหนดก่อนเริ่มงาน
- หาก OS lock ไม่พร้อม ระบบต้องเตือนใน Diagnostic Screen ว่าเป็นความเสี่ยง

### 8.8 Onsite Registration Bug/GAP ที่ต้องปิด

จากการตรวจโค้ดปัจจุบันพบ gap ที่ต้องบันทึกเป็น requirement บังคับ:

- แก้แล้ว: Frontend `createParticipantByStaff` รองรับทั้ง signature เดิม `createParticipantByStaff(eventId, payload)` และ signature ใหม่ `createParticipantByStaff(payload)` เพื่อไม่ให้ payload ลงทะเบียนหน้างานหายเมื่อ `KioskPage` เรียกด้วย argument เดียว
- แก้แล้วบางส่วน: `RegistrationPoint` schema รองรับ `eventId`, `eventYear`, `organizationId`, `seriesId`, `allowedStaff`, `deviceIds`, `kioskPolicy` แล้ว และ endpoint กรองตาม event context/legacy fallback; ยังต้องรัน migration เพื่อลบ unique index เก่า `name_1` และ backfill point เก่าเข้ากิจกรรมที่ถูกต้อง
- แก้แล้วบางส่วน: `Participant` รองรับ `registeredPointId` และ `registeredPointName` เพิ่มจาก legacy `registeredPoint` แล้ว โดย register/check-in ใหม่จะบันทึก ObjectId + denormalized name; ยังต้องรัน migration `npm run migrate:participant-points` เพื่อ backfill ข้อมูลเก่า
- แก้แล้วบางส่วน: `registrationType` รองรับ `online`, legacy `onsite`, `onsite_staff`, `onsite_kiosk`, `self_register` และ dashboard/report นับค่าใหม่โดยไม่ทำยอด legacy หาย แต่ยังควรทำ migration/backfill ข้อมูลเก่าเมื่อกำหนดกติกา mapping ชัดเจน
- แก้แล้ว: เพิ่ม diagnostic endpoint `POST /api/public/kiosk-token/verify` และหน้า `/kiosk/diagnostic` เพื่อตรวจ token, point, network, storage, camera, เวลาเครื่อง และ fullscreen readiness ก่อนเข้า runtime
- `listEnabledRegistrationPoints` เป็น public และคืน enabled points ทั้งหมด ต้องพิจารณา event scope และลดข้อมูลที่เปิดเผย
- ต้องตรวจว่า kiosk scoped token ไม่ถูกแนบไปกับ endpoint ที่ไม่จำเป็นนอก allowlist

## 9. ข้อกำหนด Participant Management

ระบบต้องสามารถ:

- list participants ตาม event scope
- search ด้วย q, phone, email, name, qrCode
- ใช้ secureSearch/blind index เมื่อเปิด field encryption
- fallback scan จำกัดจำนวน record เมื่อจำเป็น
- update participant fields, followers, consent, tags, specialAssistance
- เปลี่ยน eventYear ของ legacy record ได้ แต่ต้อง clear event references เพื่อกันข้อมูลชี้ผิด event
- soft delete participant ด้วย `isDeleted=true`
- export CSV พร้อม headers ที่กำหนด
- download PDF report
- restore prize right

Acceptance Criteria:

- list/search/export ต้อง require event identity
- list/export/decrypt ต้อง audit sensitive access
- delete ต้องเป็น soft delete
- export ต้องระบุจำนวน record ใน header และ audit fields ที่ export
- update ต้อง rebuild encrypted fields, blind index และ search tokens

## 10. ข้อกำหนด Dynamic Participant Fields

ระบบต้องสามารถ:

- สร้าง แก้ไข ลบ เปิด/ปิด และเรียงลำดับ fields
- รองรับ type: text, email, number, select, date
- กำหนด required และ options
- Public registration ต้องรับเฉพาะ fields ที่ enabled

Acceptance Criteria:

- field name ต้อง unique
- field ที่ disabled ต้องไม่ถูกเขียนจาก public request
- การลบ field ต้องพิจารณาผลต่อข้อมูลเดิมและ export/report

ข้อกำหนดเพิ่มเติมที่ควรเพิ่ม/ตรวจสอบ:

- แก้แล้ว: เพิ่ม event-scoped participant fields เพื่อให้แต่ละ event มีฟอร์มต่างกันได้ โดยมี legacy/global fallback, event override และไม่ให้ event manager แก้ global inherited field โดยไม่ตั้งใจ
- ต้องรัน migration `npm run migrate:participant-fields` เพื่อตรวจ legacy index/field และเลือกว่าจะ bind field เดิมเข้ากับ current event หรือคงเป็น global fallback
- เพิ่ม validation schema ต่อ field เช่น regex, min/max, helpText, privacy classification
- เพิ่ม migration policy เมื่อเปลี่ยน field name

## 11. ข้อกำหนด Admin, Account และ Session

### 11.1 Login

ระบบต้องรองรับ:

- Username/password login
- Google login เฉพาะ email ที่มีใน Admin collection และ email verified
- Cloudflare Turnstile สำหรับ login
- HttpOnly cookie สำหรับ token
- CSRF token cookie สำหรับ unsafe methods
- จำกัด active sessions สูงสุด 3 session ต่อ user
- Audit login success/fail/bot block

Acceptance Criteria:

- invalid username/password ต้องใช้ generic message
- password compare ต้องใช้ dummy hash เพื่อลด timing leak
- session token ต้องเก็บเป็น hash ไม่เก็บ plaintext
- login success ต้องคืน user profile, roles, permissions, organizationIds, eventIds และ session metadata

### 11.2 Password Management

ระบบต้องรองรับ:

- Forgot password ด้วย OTP ส่ง email
- OTP อายุ 5 นาที
- Attempts ไม่เกิน 5 ครั้ง
- Admin reset password ให้ user อื่น
- Reset password ของ admin-like user ต้องใช้ action OTP ของ operator
- Change password ของตัวเอง
- เมื่อ reset/change/update role ต้อง revoke sessions ที่เกี่ยวข้อง

Acceptance Criteria:

- Password ขั้นต่ำต้องยาวอย่างน้อย 8 ตัวอักษร
- Production requirement ควรยกระดับเป็น password policy: 12+ chars, block common passwords, rate limit ต่อ account/IP
- OTP ต้อง hash ก่อนเก็บ
- OTP ใช้แล้วต้อง clear

### 11.3 User Administration

ระบบต้องสามารถ:

- สร้าง user ด้วย username, password, role, email, fullName, permissions, organizationIds, eventIds
- แก้ user profile, role, permissions, registrationPoints
- ลบ user โดยห้ามลบตัวเอง
- ป้องกัน non-superadmin assign system admin role หรือ custom permissions
- ป้องกัน non-superadmin แก้หรือลบ superadmin/admin คนอื่น
- Upload avatar พร้อมตรวจ mime และ file signature
- ดู cron logs

Acceptance Criteria:

- ทุก create/update/delete/reset ต้อง audit
- update role/permission ต้อง revoke sessions
- avatar ต้องจำกัดชนิดไฟล์ ขนาด และตรวจ signature

### 11.4 Session Management

ระบบต้องสามารถ:

- list sessions
- revoke session เดี่ยว
- revoke all sessions ของ user
- logout และ clear auth/csrf cookies
- refresh session แบบ sliding session
- จำกัด absolute timeout ไม่ให้ต่อ session เกิน policy
- รองรับ previous token grace window เพื่อลด race ระหว่าง refresh

Acceptance Criteria:

- idle timeout default 30 นาที
- absolute timeout default 12 ชั่วโมง
- refresh threshold default 5 นาที
- frontend ต้อง sync refresh/logout ข้าม tabs ด้วย BroadcastChannel
- session ที่ revoked/expired ต้องใช้งานไม่ได้ทันที

### 11.5 Participant Identity, Email Login, LINE Login และ LIFF

ระบบต้องรองรับให้ผู้ใช้งานทั่วไปหรือผู้เข้าร่วมงาน login เองได้ทั้งผ่าน Email และ LINE โดยใช้แนวคิด `Email as Master Key` คือ Email เป็นตัวตนหลักของผู้ใช้ ส่วน LINE เป็น linked provider ที่ผูกกับบัญชีหลักเพื่อใช้ seamless login, notification, wallet, QR ticket และ CRM ผ่าน LineOA

เป้าหมาย:

- ผู้เข้าร่วมสามารถกลับมาเปิด QR ticket, wallet, coupon, certificate และประวัติของตนเองได้
- ผู้ใช้สามารถ login ผ่าน Web browser ปกติด้วย Email OTP
- ผู้ใช้สามารถ login ผ่าน LINE Login หรือ LIFF ได้โดยไม่ต้องกรอกรหัสผ่านซ้ำ
- ระบบต้องผูก LINE กับ participant เดิมได้อย่างปลอดภัย ไม่สร้างบัญชีซ้ำ
- ผู้ใช้ต้องเปลี่ยน LINE หรืออุปกรณ์ได้ด้วยตัวเองโดยไม่ต้องให้ admin แก้ฐานข้อมูล
- หากมือถือหาย ผู้ใช้ต้องสั่ง logout all devices / revoke token ได้

#### Identity Model Requirements

Participant/User identity ต้องมีข้อมูลต่อไปนี้:

- `email`: primary identity หรือ master key
- `phone`: optional secondary recovery factor
- `authProviders`: รายการ provider ที่ผูก เช่น email, line, google ในอนาคต
- `primaryAuthProvider`: provider หลักที่ใช้สร้างบัญชีครั้งแรก
- `lineUserId`: LINE user id ที่ verify แล้ว
- `lineDisplayName`: ชื่อจาก LINE ล่าสุด
- `linePictureUrl`: รูปจาก LINE ล่าสุด
- `isLineLinked`: สถานะผูก LINE
- `lineLinkedAt`
- `lineUnlinkedAt`
- `lastLoginAt`
- `participantTokenVersion` หรือ `tokenVersion`
- `lastLogoutAt`
- `trustedDevices`: รายการ device/session ที่อนุญาต หากเปิด device management
- `notificationPreferences`: opt-in/out สำหรับ LINE push, email, coupon, check-in, certificate

ข้อกำหนดสำคัญ:

- ห้ามใช้ `lineUserId` เป็น primary identity เพียงอย่างเดียว
- `email` หรือ participant record ต้องเป็นตัวเชื่อมหลักระหว่าง registration, wallet, ticket และ certificate
- `lineUserId` ต้อง unique แบบ sparse และผูกได้เพียง participant/user เดียว
- หาก LINE account เดิมถูกผูกกับคนอื่น ต้อง reject และแสดงขั้นตอน support/verify identity
- การ merge participant ที่ลงทะเบียนก่อนแล้วค่อย login ต้องอิง email/phone/OTP และ event scope อย่างปลอดภัย

#### Email Login Flow

Flow:

1. ผู้ใช้เปิดหน้า login ผู้เข้าร่วมผ่าน Web หรือ LIFF fallback
2. กรอก email
3. Backend ส่ง OTP ไป email พร้อม ref code
4. ผู้ใช้กรอก OTP
5. Backend ตรวจ OTP, attempts และ expiry
6. Backend resolve participant/user จาก email และ event scope
7. หากพบหลาย event ให้เลือก event หรือเปิด user hub ที่แสดง event ที่เกี่ยวข้อง
8. Backend ออก participant JWT/session
9. Frontend เปิดหน้า user hub, wallet, QR ticket หรือ profile ตาม context

Acceptance Criteria:

- OTP ต้อง hash ก่อนเก็บ
- OTP ต้องหมดอายุ เช่น 5-10 นาที
- Attempts ต้องจำกัด เช่น 5 ครั้ง
- Response request OTP ต้อง generic เพื่อลด email enumeration
- Login token ต้องมี `participantId`, `eventId` หรือ allowed event list, role=`participant`, tokenVersion
- หาก participant ถูก soft delete/revoked ต้อง login ไม่ได้

Implementation Status:

- แก้แล้วบางส่วน: เพิ่ม `POST /api/participant-auth/email/request-otp` และ `POST /api/participant-auth/email/verify-otp` โดยเก็บ OTP แบบ hash, มี ref code, TTL, attempts limit, rate limit และ generic response สำหรับกรณี email ไม่มีในระบบ
- แก้แล้วบางส่วน: participant JWT ใช้ helper กลางและฝัง `participantId`, `eventId`, `eventYear`, `role=participant`, `provider`, `tokenVersion`, `participantSessionId`
- แก้แล้วบางส่วน: เพิ่ม `GET /api/participant-auth/me` เพื่อคืน profile, linked providers, LINE profile, notification preferences และ event summary ของ participant ปัจจุบัน
- แก้แล้วบางส่วน: เพิ่มหน้า `/user/login`, `/user/home`, `/user/profile`, `/user/security` และ `/user/line/callback` สำหรับ Email OTP, LINE OAuth callback, wallet entry, event picker และ security session management; ยังต้องเพิ่ม profile settings แบบละเอียด

#### LINE Login Flow บน Web

Flow:

1. ผู้ใช้กด `Login with LINE`
2. Frontend redirect ไป LINE Login authorization endpoint
3. LINE redirect กลับมาพร้อม auth code
4. Frontend ส่ง auth code ให้ backend
5. Backend แลก code เป็น access token/id token กับ LINE
6. Backend verify ID token signature, issuer, audience, expiry และ nonce/state
7. Backend ดึง `lineUserId`, profile และ email ถ้ามี
8. Backend ค้นหา participant ที่ผูก LINE อยู่แล้ว หรือให้ผู้ใช้ verify email OTP เพื่อ link กับ participant เดิม
9. Backend ออก participant session/JWT

Security Requirements:

- ต้องใช้ OAuth state และ nonce เพื่อกัน CSRF/replay
- ห้ามรับ `lineUserId` จาก client ตรง ๆ
- Backend ต้อง verify token กับ LINE ทุกครั้งก่อน login/link
- LINE callback URL ต้องอยู่ใน allowlist
- หาก LINE ไม่ส่ง email ต้องบังคับ verify email เพื่อผูกกับ participant เดิม

Implementation Status:

- แก้แล้วบางส่วน: เพิ่ม `POST /api/participant-auth/line/start` เพื่อสร้าง LINE authorization URL พร้อม state/nonce ที่เก็บใน TTL store และ callback URL allowlist
- แก้แล้วบางส่วน: `POST /api/participant-auth/line/login` รองรับ OAuth auth code exchange, verify ID token/access token กับ LINE, ตรวจ audience/issuer/nonce และออก participant session ที่ผูกกับ session store
- แก้แล้วบางส่วน: re-link LINE ผ่าน OAuth callback ใช้ `POST /api/participant-auth/line/link/start` หลัง step-up OTP เพื่อสร้าง state ที่ผูก participant แล้ว callback จะ link LINE และ revoke session เดิม
- ยังต้องทำ: LINE account merge/support flow กรณี LINE ผูกผิดบัญชี และหน้า support/manual recovery ยังต้องเพิ่ม

#### LIFF Seamless Login Flow

ระบบต้องรองรับ Web ปกติและ LIFF พร้อมกัน โดย frontend ตัวเดียวสามารถตรวจ context ได้:

1. Frontend เรียก `liff.init`
2. ตรวจ `liff.isInClient()` และ `liff.isLoggedIn()`
3. ถ้าอยู่ใน LIFF และ login แล้ว ให้ดึง LIFF ID token
4. ส่ง ID token ให้ backend verify
5. Backend verify token กับ LINE และผูกกับ participant/user
6. ถ้าบัญชี LINE ยังไม่ผูก ให้ขอ verify email OTP หรือเปิด flow link account
7. เมื่อสำเร็จ เปิดหน้า LIFF wallet, QR ticket, certificate หรือ user hub แบบ compact UI

Frontend Requirements:

- ต้องมี hook/context เช่น `useLineAuth` หรือ `useParticipantAuth` สำหรับแยก Web/LIFF
- LIFF route ควรมี UI แบบ compact เช่น `/liff/wallet`, `/liff/ticket`, `/liff/certificate`, `/liff/profile`
- ถ้าเปิดผ่าน Web ปกติ ให้แสดง Email OTP login และปุ่ม Login with LINE
- ถ้า LIFF download PDF ไม่ทำงาน ต้องใช้ `liff.openWindow({ external: true })` เพื่อเปิด Safari/Chrome
- ต้องไม่เก็บ LINE ID token ใน localStorage แบบถาวร

#### Account Linking, Unlink และ Re-link LINE

ผู้ใช้ต้องจัดการการผูก LINE เองได้ผ่าน Profile Settings:

Flow unlink:

1. ผู้ใช้ login ด้วย Email OTP หรือ session ที่เชื่อถือได้
2. เปิด Profile Settings
3. เห็นสถานะ LINE ที่ผูกอยู่ เช่น display name, linked date
4. กด `ยกเลิกการผูกบัญชี LINE`
5. ระบบทำ step-up authentication ด้วย email OTP
6. Backend clear lineUserId/isLineLinked และ revoke LIFF/participant sessions ที่เกี่ยวข้อง
7. Audit account unlink

Flow re-link:

1. ผู้ใช้ login ด้วย Email OTP
2. กด `ผูกบัญชี LINE`
3. ระบบพาไป LINE Login หรือ LIFF link flow
4. Backend verify token กับ LINE
5. ตรวจว่า lineUserId ไม่ถูกใช้กับบัญชีอื่น
6. บันทึก lineUserId ใหม่และ audit

Acceptance Criteria:

- Unlink/re-link ต้องใช้ step-up OTP
- Re-link ต้อง revoke session/token เดิมของ participant
- ถ้า LINE ใหม่ถูกผูกกับบัญชีอื่น ต้อง reject
- User ต้องยังเข้า wallet/ticket ได้ผ่าน Email แม้ยังไม่ผูก LINE

#### Device Management และ Logout All Devices

ระบบต้องรองรับกรณีผู้ใช้เปลี่ยนอุปกรณ์ มือถือหาย หรือต้องการตัด session เก่า:

- หน้า Profile Settings ต้องมีปุ่ม `Logout from all devices`
- Backend ต้องเพิ่ม `participantTokenVersion` หรือ `lastLogoutAt`
- JWT ทุกตัวต้องมี version/issuedAt และ middleware ต้องตรวจเทียบกับ version/lastLogoutAt
- เมื่อ logout all devices ให้เพิ่ม tokenVersion หรือ set lastLogoutAt เพื่อ invalidate token เดิมทันที
- ต้องมีรายการ active devices/sessions หากเปิด device management
- ต้องมี revoke device/session รายตัวได้ในอนาคต

Acceptance Criteria:

- Token เก่าต้องใช้ wallet/payment/ticket APIs ไม่ได้หลัง logout all devices
- LIFF session เก่าต้องถูกบังคับ login/link ใหม่เมื่อยิง API
- การเปลี่ยน email, unlink LINE, reset identity ต้อง revoke sessions ทั้งหมด

Implementation Status:

- แก้แล้วบางส่วน: เพิ่ม `participantTokenVersion`, `lastLogoutAt`, `lastLoginAt`, provider/link metadata และ notification preferences ใน `Participant`
- แก้แล้วบางส่วน: เพิ่ม `ParticipantSession` ที่เก็บ hash token, provider, device label, IP, user agent, last activity, expiry และ revoked state โดยไม่เก็บ token plaintext
- แก้แล้วบางส่วน: `participantAuth` middleware และ wallet bearer-token flow ตรวจ `tokenVersion`/`lastLogoutAt` และ `ParticipantSession` ก่อนอนุญาตให้เรียก wallet/payment APIs
- แก้แล้วบางส่วน: เพิ่ม `GET /api/participant-auth/sessions`, `POST /api/participant-auth/sessions/:id/revoke`, `POST /api/participant-auth/logout` และ `POST /api/participant-auth/logout-all` สำหรับ revoke current session, revoke device รายตัว และ logout all devices
- แก้แล้วบางส่วน: logout-all ต้องใช้ step-up OTP action `logout_all`, เพิ่ม `POST /api/participant-auth/step-up/request-otp` และ `POST /api/participant-auth/step-up/verify-otp`
- แก้แล้ว: เพิ่ม `POST /api/participant-auth/refresh` เพื่อ rotate participant token hash ใน session store พร้อม previous-token grace window ผ่าน `PARTICIPANT_SESSION_PREVIOUS_TOKEN_GRACE`
- แก้แล้ว: frontend participant auth ใช้ BroadcastChannel + localStorage storage event + refresh lock เพื่อ sync login/refresh/logout ข้าม tabs และลด race จากหลายแท็บ refresh พร้อมกัน

#### User Hub Requirements

หลัง participant login สำเร็จ ระบบต้องมี User Hub หรือ Profile Home สำหรับผู้ใช้งานทั่วไป:

- แสดง Event ที่ผู้ใช้ลงทะเบียน
- แสดงปุ่ม QR ticket ของฉัน
- แสดง wallet/coupon
- แสดง guest link management
- แสดง certificate download เมื่อ eligible
- แสดง receipt/history หากมี
- แสดงสถานะ LINE linked และ notification preferences
- แสดง logout all devices

หน้าที่ควรมี:

- `/user/login`
- `/user/verify-otp`
- `/user/home`
- `/user/profile`
- `/user/security`
- `/user/line/link`
- `/user/line/callback`
- `/liff/wallet`
- `/liff/ticket`
- `/liff/certificate`

### 11.6 Central SSO และ Cross-System Session Boundary

ระบบ SSO/Identity ต้องถูกมองเป็นบริการกลางที่แยกจาก Event และ POS แต่ให้ทั้งสองระบบใช้ร่วมกันผ่าน session/cookie/JWT และ permission claim ที่ตรวจสอบได้

Requirements:

- Admin/staff login, participant login, LINE/LIFF link, Email OTP, step-up OTP และ logout-all ต้องอยู่ภายใต้ identity boundary เดียวกัน
- Event และ POS ห้ามสร้าง auth token ของตนเองแบบแยกมาตรฐาน; ต้องขอ token/session จาก SSO หรือใช้ middleware กลางที่ตรวจ signature, token version, session hash และ revocation
- SSO token ต้องส่งผ่าน HttpOnly, Secure, SameSite cookie สำหรับ browser flow; bearer/scoped token ใช้เฉพาะ kiosk/device/service integration ที่มี audience และ expiry ชัดเจน
- Permission claim ต้องมี domain/action เช่น `event:read`, `participant:export`, `pos:sell`, `shift:review`, `inventory:adjust` และต้องตรวจ organization/event/vendor/location/point scope ซ้ำที่ backend domain
- Step-up auth ต้องเป็น reusable security service สำหรับ high-risk action ของ Event และ POS เช่น export/decrypt, reset role, void/refund, stock adjustment, PO approve และ shift reopen
- Session revocation, password reset, LINE unlink/relink, logout-all และ tokenVersion change ต้องทำให้ Event/POS token เดิมใช้งานไม่ได้ทันทีหรือภายใน grace window ที่กำหนด
- SSO ต้องมี capability endpoint ให้ frontend เห็น provider ที่พร้อมจริง เช่น email, line, google/admin login โดยไม่เปิดเผยว่า account ใดมีอยู่ในระบบ

Acceptance Criteria:

- POS cashier ที่ login ผ่าน SSO ต้องถูกจำกัดด้วย `pos:*` permission และ event/vendor/location/shift scope แม้มี admin session cookie
- Event staff ที่ไม่มี `pos:*` ต้องเข้า POS write endpoint ไม่ได้
- Participant Email OTP/LINE login ต้องไม่ให้สิทธิ์ admin/POS โดยเด็ดขาด
- การปิด Brevo/LINE provider ต้องทำให้ capability endpoint ซ่อน provider นั้นโดย provider อื่นยังใช้ได้

### 11.7 Email Delivery Provider: Brevo Transactional Email API

Email provider เป้าหมายของระบบคือ Brevo Transactional Email API สำหรับ OTP, E-ticket, resend ticket, reset password, step-up auth, receipt/certificate notification และ fallback alert ที่ส่งทาง email

Provider Requirements:

- Production ต้องตั้ง `EMAIL_PROVIDER=brevo`
- ต้องใช้ `BREVO_API_KEY` จาก Secret Manager/equivalent secret injection เท่านั้น ห้าม commit ลง repository หรือ Plesk gateway
- ต้องตั้ง sender ที่ verify แล้วผ่าน `BREVO_FROM_EMAIL` และ `BREVO_FROM_NAME`; event-level `contactEmail` ใช้เป็น reply/contact policy ได้แต่ห้าม override sender เป็นอีเมลที่ไม่ verify
- SMTP config (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`) ใช้เป็น fallback/local compatibility ได้เท่านั้น และต้องไม่เป็น provider หลักใน production หลัง cutover
- Code ต้องมี provider abstraction เพื่อให้ Email OTP, ticket, reset password และ notification ไม่ผูกกับ Brevo SDK โดยตรงใน controller
- Delivery failure ต้องไม่เปิดเผย recipient, OTP, token, QR, ticket payload หรือ provider response ที่มี PII ลง log
- Email request OTP ต้องตอบ generic และห้ามบอกว่า email มีอยู่หรือไม่
- ต้องมี idempotency/retry policy สำหรับ notification ที่ retry ได้ และต้องไม่ส่ง OTP ซ้ำจาก replay request ที่ fingerprint เดิม

Acceptance Criteria:

- `GET /api/participant-auth/providers` ต้องแสดง `email=true` เฉพาะเมื่อ Brevo หรือ fallback provider พร้อมใช้งานจริง
- Production ต้อง fail closed ถ้า `PARTICIPANT_EMAIL_LOGIN_ENABLED=true` แต่ `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY` หรือ verified sender ไม่ครบ
- การส่ง ticket/email ล้มต้อง audit และไม่ rollback participant registration ที่ commit สำเร็จ
- Brevo API key ต้องอยู่ใน secret classification ระดับ `secret` และต้องมี rotation/canary/rollback runbook
- Production rollout ต้องผ่าน Brevo canary send test และตั้ง `BREVO_CANARY_CONFIRMED=true` ใน deployment config ที่ได้รับอนุมัติ

## 12. ข้อกำหนด Registration Point

ระบบต้องสามารถ:

- สร้าง แก้ไข ปิดใช้งาน registration point
- list ทั้งหมดสำหรับ staff/admin
- list enabled สำหรับ public/staff selection
- กำหนด type: staff, kiosk, self_register, checkin, meeting, other หรือ map กับ enum เดิมโดยไม่เสียความหมาย
- ผูก point กับ `eventId`, `eventYear`, organization/series ตาม event context
- ผูก staff กับ registrationPoints ผ่าน `allowedStaff` หรือ user registrationPoints
- ผูก kiosk device/token กับ point ผ่าน `deviceIds`, `lastSeenAt`, `tokenIssuedAt`, `tokenExpiresAt`
- ตั้งค่า policy ต่อ point เช่น allowStaffMode, allowKioskMode, requireCamera, requireFullscreen, idleTimeoutSeconds, successResetSeconds

Acceptance Criteria:

- Staff ต้องเห็นหรือใช้งานเฉพาะ point ที่ได้รับสิทธิ์
- Soft delete คือ `enabled=false`
- Point name ต้อง unique เฉพาะใน Event เดียวกัน ไม่ใช่ unique global ทั้งระบบ
- Public enabled list ต้อง filter ตาม event identity และเปิดเผยเฉพาะ field ที่จำเป็น
- Kiosk point ต้อง verify readiness ก่อนเปิดใช้งาน

ข้อกำหนดเพิ่มเติม:

- เพิ่ม event-scoped point หากแต่ละ event มีจุดลงทะเบียนต่างกัน
- เพิ่ม audit เมื่อ staff ใช้ point นอกสิทธิ์แล้วถูก block
- ต้องมี migration plan จาก schema เดิมที่ไม่มี event scope และมี `name` unique global

## 13. ข้อกำหนด Donation และ Package

### 13.1 Donation Flow

Flow:

1. Public/Admin submit donation
2. Public request ต้องผ่าน Turnstile
3. Backend ตรวจ event identity และ public event หากเป็น public request
4. Backend ตรวจ feature flag `donations`
5. ตรวจ firstName, lastName, amount, transferDateTime, source, pickupMethod
6. ถ้าเลือก package ต้องตรวจ feature flag `packages`, package active, deadline, size stock
7. บันทึก donation ใน transaction
8. ถ้าเป็น package ให้ตัด stock แบบ atomic เฉพาะเมื่อ sold < stock
9. reveal donation สำหรับ response/LINE notify
10. audit action

Acceptance Criteria:

- amount ต้องมากกว่า 0
- transferDateTime ต้องเป็นวันที่ถูกต้อง
- stock race condition ต้องไม่ทำให้ sold เกิน stock
- ข้อมูล firstName, lastName, address, slipUrl ต้อง encrypt เมื่อเปิด encryption

### 13.2 Package Management

ระบบต้องสามารถ:

- สร้าง แก้ไข ลบ package
- กำหนด name, description, price, items, sizes, stock, sold, deadline, pickupLocations, delivery flag, active flag
- list package ตาม event scope
- public list เฉพาะ package active และ feature เปิด

Acceptance Criteria:

- การอัปเดต package ต้องไม่ทำให้ sold > stock
- การลบ package ที่มี donation แล้วควรเปลี่ยนเป็น inactive แทน hard delete
- package ต้องผูก event references ครบ

## 14. ข้อกำหนด Dashboard และ Report

ระบบต้องสามารถ:

- แสดง dashboard summary ต่อ event
- แสดง dashboard comparison ระหว่างปี/กิจกรรม
- แสดง public dashboard เฉพาะ checked-in participants แบบ aggregate
- แสดง public report แบบ masked name
- cache public report/dashboard ชั่วคราว
- export CSV และ PDF report สำหรับ admin

Acceptance Criteria:

- dashboard protected ต้อง require `event:read`
- public dashboard/report ต้อง require public event status และ event identity
- public report ห้ามแสดงชื่อเต็ม เบอร์ อีเมล หรือข้อมูลอ่อนไหว
- aggregate/decrypt ต้อง audit sensitive access

ข้อกำหนดเพิ่มเติม:

- Frontend มี API helper `getDashboardStats` และ `getCheckinSummary` แต่ backend route ปัจจุบันไม่มี endpoint ดังกล่าว ต้อง align โดยเพิ่ม endpoint หรือ remove helper

## 15. ข้อกำหนด Lucky Draw และ Prize

ระบบต้องสามารถ:

- list prizes ตาม event
- list public prizes แบบ masked winner names
- create prize พร้อม totalQuantity และ remainingQuantity
- delete prize
- draw winner จาก participant ที่ checked-in, ไม่ deleted, ไม่ forfeited, ยังไม่เคยได้รางวัล
- บันทึก winner ลง prize และ participant.prizeId/prizeWonAt ใน transaction
- cancel winner และคืน remainingQuantity โดยไม่เกิน totalQuantity
- mark participant เป็น forfeited เมื่อ cancel
- restore prize right ให้ participant

Acceptance Criteria:

- lucky draw ต้องใช้ event scope และ feature flag `luckyDraw`
- draw ต้องกัน double winner และกัน remainingQuantity ติดลบ
- public winner ต้อง mask name
- reveal winner ต้อง audit sensitive access

Critical Security Requirement:

- Route `/api/prizes` ต้องใช้ `auth` และ permission แบบ event-scoped ไม่ใช่เปิดเฉพาะ `admin/superadmin` จน role ระดับ Event ใช้งานจริงไม่ได้:
  - `GET /api/prizes` ต้องใช้ auth และอย่างน้อย `event:read`
  - `POST /api/prizes`, `DELETE /api/prizes/:id` ต้องใช้ `event:manage`
  - `POST /api/prizes/draw/:prizeId`, `POST /api/prizes/cancel` ต้องใช้ `participant:manage`
  - public view ต้องใช้เฉพาะ `/api/public/prizes`

## 16. ข้อกำหนด Digital Food Coupon / E-Wallet

ระบบคูปองอาหารดิจิทัลต้องใช้แนวคิด `PromptPay Model` คือร้านค้ามี QR ประจำร้าน และผู้เข้าร่วมงานหรือผู้ติดตามเป็นฝ่ายสแกนเพื่อจ่าย เหมาะกับงานที่มีหลายซุ้ม หลายราคา และร้านค้าไม่สะดวก login หรือกดรับเงินเองบ่อย ๆ

เป้าหมายหลัก:

- ลดการใช้คูปองกระดาษ
- ลดภาระ staff และร้านค้า
- รองรับหลายร้าน หลายราคา และหลายประเภทอาหาร/สินค้า
- รองรับผู้ติดตามที่ไม่ได้ลงทะเบียน
- ป้องกัน double spending และ screenshot fraud
- สรุปยอดร้านค้าหลังจบงานได้ถูกต้อง
- ผูกทุกธุรกรรมกับ Event เดียวอย่างชัดเจน

### 16.1 ภาพรวมระบบ Wallet

ระบบต้องมี Digital Wallet 1 ใบต่อผู้เข้าร่วมหลักต่อ Event โดย wallet นี้เก็บ:

- `coinBalance`: จำนวนเหรียญคงเหลือ
- `coupons`: คูปองเฉพาะประเภท เช่น อาหาร 1 สิทธิ์, เครื่องดื่ม 1 สิทธิ์
- `participantId`: เจ้าของ wallet
- `eventId` และ `eventYear`: ขอบเขต Event
- สถานะ active/inactive/frozen
- ประวัติธุรกรรมทั้งหมดผ่าน `Transaction`

หลักการสำคัญ:

- ผู้เข้าร่วมหลักเป็นเจ้าของ wallet
- ผู้ติดตามใช้ wallet เดียวกันผ่าน guest link หรือ guest token
- การใช้จ่ายของผู้ติดตามต้องตัดยอดจาก wallet หลักทันที
- Wallet ห้ามติดลบไม่ว่ากรณีใด
- ทุกการเพิ่ม/ลดเหรียญต้องมี transaction record
- Wallet ต้องถูก scope ด้วย `eventId` เสมอ ห้ามใช้เหรียญข้าม Event

### 16.2 ผู้ใช้ในระบบคูปอง

#### Main Attendee

- ดูยอดเหรียญ/คูปองของตนเอง
- สแกน QR ร้านค้าเพื่อจ่าย
- สร้าง guest link ให้ผู้ติดตาม
- กำหนดวงเงินหรือจำนวนเหรียญสูงสุดให้ guest link ได้
- ยกเลิก guest link ได้
- ดูประวัติการใช้เหรียญของตนเองและผู้ติดตาม

#### Companion / Guest Wallet User

- เปิด mini-app ผ่าน guest link
- ไม่ต้อง login
- ดูยอดที่ใช้ได้หรือ limit ที่ได้รับ
- สแกน QR ร้านค้าเพื่อจ่าย
- เห็นประวัติรายการที่ตนเองจ่ายผ่าน token นั้น
- ไม่เห็นข้อมูลส่วนตัวทั้งหมดของผู้เข้าร่วมหลัก

#### Vendor

- มี QR Code ประจำร้านแบบ static
- ไม่จำเป็นต้อง login เพื่อรับเงินใน basic flow
- ดูสลิปสีเขียวบนมือถือผู้ซื้อหลังชำระสำเร็จ
- หากเปิดใช้ vendor dashboard ต้อง login เพื่อดูยอดรับเหรียญและ history ของร้านตัวเอง

#### Finance/Admin

- สร้างและจัดการ vendor
- กำหนด QR payload, ราคา fixed/variable, menu price list
- เติม/ปรับ/คืนเหรียญตาม policy
- ดูยอดธุรกรรมต่อร้าน ต่อช่วงเวลา ต่อ Event
- export รายงานสำหรับจ่ายเงินคืนร้านค้า
- revoke หรือ freeze wallet/guest token เมื่อพบความผิดปกติ

### 16.3 แหล่งที่มาของเหรียญ

ระบบต้องรองรับแหล่งที่มาของเหรียญได้มากกว่า 1 แบบ โดยเปิด/ปิดผ่าน Event config:

1. Package Coin Quota
   - เป็นโหมดหลักสำหรับ MVP
   - เหรียญถูกให้ฟรีตามแพ็กเกจลงทะเบียน เช่น Regular ได้ 50 coins, VIP ได้ 100 coins
   - ต้องกำหนด coin quota ใน package หรือ event package rule
   - เมื่อผู้เข้าร่วมลงทะเบียนหรือ check-in ตาม policy ระบบสร้าง wallet และ credit coins อัตโนมัติ

2. Follower Allowance
   - Event ต้องกำหนดได้ว่าจะให้เหรียญเพิ่มตามจำนวนผู้ติดตามหรือไม่
   - ตัวเลือก policy:
     - ไม่เพิ่มเหรียญให้ผู้ติดตาม ใช้ shared balance เดียวกัน
     - เพิ่มเหรียญต่อผู้ติดตาม เช่น follower ละ 30 coins
     - จำกัดสูงสุด เช่น นับผู้ติดตามไม่เกิน 3 คน
   - Policy ต้องแสดงให้ผู้ใช้เห็นก่อนลงทะเบียนหรือก่อนรับ wallet

3. Manual Grant / Adjustment
   - Admin/Finance สามารถเพิ่มหรือลดเหรียญแบบมีเหตุผลและ audit ได้
   - ต้องมี reason, operatorId, eventId, participantId และ transaction type
   - การปรับยอดต้องไม่ทำให้ balance ติดลบ

4. Top-up หน้างาน
   - เป็น optional feature ไม่ใช่ MVP บังคับ
   - ต้องมี feature flag เช่น `walletTopup`
   - ต้องรองรับ payment proof, cashier role, receipt และ refund policy
   - Top-up ต้องสร้าง transaction type `topup`

5. Refund / Reversal
   - ต้องรองรับ reversal transaction เมื่อจ่ายผิดร้านหรือจำนวนผิด
   - Reversal ต้องอ้างอิง original transaction
   - ต้องมีสิทธิ์เฉพาะ Finance/Admin และ audit log

Acceptance Criteria:

- ทุก coin credit/debit ต้องมี transaction record
- การสร้าง wallet ซ้ำสำหรับ participant/event เดิมต้อง idempotent
- เหรียญจาก package ต้องออกเพียงครั้งเดียวต่อ policy
- ถ้าแก้ package หลังผู้ใช้ได้รับเหรียญแล้ว ต้องไม่แก้ balance ย้อนหลังอัตโนมัติ ยกเว้นมี adjustment transaction
- หากเปิด top-up ต้องแยกยอด free quota กับ top-up ในรายงานได้

### 16.4 Data Model Requirements

Collection ที่มีอยู่แล้วและต้องขยาย requirement:

#### `Wallets`

ต้องเก็บ:

- `participantId`
- `eventId`
- `eventYear`
- `coinBalance`
- `coupons`
- `isActive`
- `status`: active, frozen, closed
- `totalGranted`
- `totalSpent`
- `totalAdjusted`
- `lastTransactionAt`
- `version` หรือกลไก optimistic locking สำหรับกัน race condition

Index ที่ต้องมี:

- unique `{ participantId, eventId, eventYear }`
- `{ eventId, isActive }`
- `{ participantId }`

#### `Vendors`

ต้องเก็บ:

- `name`
- `qrCodeId`
- `eventId`
- `eventYear`
- `isActive`
- `pricingMode`: fixed, variable, menu
- `fixedPrice`
- `menuItems`: name, price, sku, active
- `settlementInfo`: ช่องทางจ่ายเงินคืนร้านค้าแบบไม่เปิดเผยต่อ public
- `ownerUserId` สำหรับ vendor dashboard ถ้ามี

QR Payload ต้องประกอบด้วย:

- vendor identifier
- event identifier หรือ signed payload ที่ resolve เป็น event/vendor ได้
- version ของ payload
- checksum/signature เพื่อกันแก้ QR

#### `Transactions`

ต้องเก็บ:

- `walletId`
- `participantId`
- `guestTokenId`
- `vendorId`
- `eventId`
- `eventYear`
- `type`: grant, topup, payment, refund, reversal, adjustment
- `paymentMethod`: coins, coupon
- `amount`
- `couponId`
- `status`: pending, success, failed, reversed
- `idempotencyKey`
- `balanceBefore`
- `balanceAfter`
- `vendorSnapshot`: ชื่อร้านและราคา ณ เวลาจ่าย
- `successSlipNonce`
- `serverTime`
- `createdBy`
- `failureReason`
- `metadata`

Index ที่ต้องมี:

- unique `{ eventId, idempotencyKey }` เมื่อมี idempotencyKey
- `{ walletId, createdAt }`
- `{ vendorId, createdAt }`
- `{ eventId, createdAt }`
- `{ guestTokenId, createdAt }`

#### `GuestTokens`

ต้องเก็บ:

- `parentWalletId`
- `tokenHash` แทนการเก็บ token plaintext
- `label` เช่น ชื่อลูก/ผู้ติดตาม
- `limitAmount`
- `spentAmount`
- `maxTransactionAmount`
- `expiresAt`
- `isActive`
- `revokedAt`
- `revokedBy`
- `lastUsedAt`

Security Requirement:

- URL token ต้องเป็น random high entropy
- Database ต้องเก็บ hash ของ token ไม่ควรเก็บ plaintext token
- token ต้องมี TTL และ revoke ได้
- token ต้องผูกกับ wallet/event เดียวเท่านั้น

### 16.5 Attendee และ Companion Flow

#### Attendee Wallet Flow

1. ผู้เข้าร่วมลงทะเบียนและผ่านเงื่อนไขการได้รับเหรียญ
2. ระบบสร้าง wallet ตาม event policy
3. ระบบ credit coins จาก package/follower/top-up/manual grant
4. ผู้เข้าร่วมเปิดหน้า `/wallet`
5. ระบบแสดง balance, coupons, transaction history และปุ่มสร้าง guest link
6. ผู้เข้าร่วมกด `สแกนจ่าย`
7. กล้องเปิดเพื่อ scan vendor QR
8. ระบบ resolve vendor และราคา
9. ผู้เข้าร่วมกรอกจำนวน coins หรือเลือก menu item
10. ระบบแสดง confirm payment
11. ผู้ใช้กดยืนยัน
12. Backend ทำ transaction atomic
13. Frontend แสดง success slip สีเขียวพร้อม live animation

#### Guest Link Flow

1. ผู้เข้าร่วมกดสร้าง guest link
2. เลือก label, limitAmount, maxTransactionAmount, expiry
3. Backend สร้าง guest token และส่งกลับ share URL
4. ผู้เข้าร่วมส่งลิงก์ผ่าน LINE หรือช่องทางอื่น
5. ผู้ติดตามเปิด mini-app โดยไม่ต้อง login
6. ระบบ validate token และแสดงยอดที่ใช้ได้
7. ผู้ติดตามสแกน QR ร้านค้าและจ่าย
8. ยอดถูกตัดจาก wallet หลัก และ `spentAmount` ของ guest token เพิ่มขึ้น
9. ถ้าใช้เกิน limit หรือ token หมดอายุ ต้อง reject

Acceptance Criteria:

- Guest link ต้อง revoke ได้ทันที
- Guest link ต้องตั้งวันหมดอายุได้
- Guest link ต้องกำหนดวงเงินรวมและวงเงินต่อ transaction ได้
- ผู้ติดตามต้องไม่เห็นข้อมูลส่วนตัว เช่น email, phone, address ของเจ้าของ wallet
- ประวัติของเจ้าของ wallet ต้องระบุได้ว่ารายการใดมาจาก guest token ใด

### 16.6 Vendor Flow แบบ PromptPay Model

หลักการ:

- ร้านค้าตั้ง QR Code ประจำร้านไว้หน้าร้าน
- ผู้ซื้อเป็นฝ่าย scan
- ร้านค้าไม่ต้อง login ใน flow รับเงินพื้นฐาน
- การยืนยันรับเงินใช้ success slip บนมือถือผู้ซื้อ

Flow:

1. Admin/Finance สร้าง vendor สำหรับ Event
2. ระบบสร้าง QR payload ของร้าน
3. ร้านค้าพิมพ์ QR ตั้งไว้หน้าร้าน
4. ผู้ซื้อ scan QR
5. ระบบแสดงชื่อร้านและราคา
6. ถ้า `pricingMode=fixed` ระบบใส่ราคาทันที
7. ถ้า `pricingMode=menu` ผู้ซื้อเลือกเมนู
8. ถ้า `pricingMode=variable` ผู้ซื้อกรอกจำนวน coins
9. ผู้ซื้อ confirm payment
10. Backend หักยอดและบันทึก transaction
11. หน้าจอแสดง success slip ให้ร้านค้าดู

Acceptance Criteria:

- QR ร้านค้าต้องใช้ข้าม Event ไม่ได้
- Vendor inactive ต้องรับเงินไม่ได้
- ราคา fixed/menu ต้องมาจาก backend ไม่เชื่อค่าที่ client ส่งมาเอง
- Variable price ต้องมี min/max และตรวจ amount positive integer
- Transaction ต้องบันทึก vendor snapshot เพื่อรายงานย้อนหลังแม้ร้านเปลี่ยนชื่อภายหลัง

### 16.7 Anti-Fraud Success Slip

หลังชำระสำเร็จ ระบบต้องแสดงสลิปสีเขียวขนาดใหญ่ให้ร้านค้าตรวจง่าย และต้องป้องกัน screenshot reuse

สลิปต้องแสดง:

- สถานะ `ชำระสำเร็จ`
- ชื่อร้าน
- จำนวน coins
- เวลา server time
- transaction ID แบบย่อ
- ชื่อ Event
- remaining balance เฉพาะผู้ซื้อ
- animation สด เช่น นาฬิกาเดิน realtime, แสงวิ่งรอบกรอบ, progress ring หรือ moving pattern

Security Requirements:

- สลิปต้องมี live animation ที่เปลี่ยนตลอดเวลา
- แสดง server time และเวลาปัจจุบันที่เดินต่อหลัง transaction
- แสดง nonce หรือ transaction verification code ที่สร้างจาก backend
- ต้องมีสี/รูปแบบประจำวันที่เปลี่ยนได้ตาม Event หรือวันงาน เพื่อกัน screenshot เก่า
- สลิปต้องหมดอายุ เช่น แสดงเต็มรูปแบบไม่เกิน 2-5 นาที จากนั้นเปลี่ยนเป็น expired slip
- ร้านค้าสามารถกดหรือสแกน transaction ID เพื่อตรวจซ้ำได้ถ้ามี vendor dashboard

Acceptance Criteria:

- Screenshot เก่าต้องสังเกตได้จากเวลา/animation/expired state
- Success slip ต้อง render ได้เร็วแม้เน็ตช้า หลังได้รับ response สำเร็จแล้ว
- หาก payment pending หรือ network error ห้ามแสดง success slip
- หาก API timeout หลังส่ง payment ต้องมี flow ตรวจสอบสถานะด้วย idempotencyKey ก่อนให้ผู้ใช้จ่ายซ้ำ

Implementation Status:

- แก้แล้ว: Backend สร้าง `slipNonce`, `verificationCode`, `slipExpiresAt`, `serverTime` และ `dailyThemeCode` ต่อ transaction และคืนค่าเดิมเมื่อเรียก payment status จาก idempotency key
- แก้แล้ว: Frontend `LiveSlip` แสดง live animation, server-time clock, countdown/progress, expired state, verification code, nonce, daily theme และ remaining balance
- ยังต้องทำต่อใน Vendor Dashboard: เพิ่มหน้าร้านค้าสำหรับตรวจ transaction/verification code แบบ realtime หรือ scan transaction ID

### 16.8 Vendor Dashboard และ Settlement

Vendor Dashboard เป็น optional feature สำหรับร้านค้าที่ต้องการดูยอดรับเหรียญ

ระบบต้องสามารถ:

- ให้ vendor login หรือใช้ vendor scoped link/token
- แสดงยอดรวมวันนี้/ทั้งหมดใน Event
- แสดง transaction history เฉพาะร้านตัวเอง
- refresh แบบ polling, long polling หรือ WebSocket
- export รายการของร้านตัวเองได้ตาม permission
- แสดงรายการ reversed/refunded แยกจาก success

Admin/Finance Dashboard ต้องสามารถ:

- ดูยอดทุก vendor
- filter ตาม Event, vendor, ช่วงเวลา, status
- export settlement report
- mark settlement status เช่น pending, paid, disputed
- บันทึกหมายเหตุการจ่ายเงินคืนร้านค้า

Acceptance Criteria:

- Vendor ต้องเห็นเฉพาะ transaction ของร้านตัวเอง
- Vendor dashboard ต้องไม่เห็นข้อมูลส่วนตัวผู้ซื้อเกินจำเป็น
- Settlement export ต้องตรงกับ sum transaction success - reversed/refunded

### 16.9 Payment API และ Double Spending Protection

Payment flow ต้องกันการกดซ้ำ เน็ตกระตุก และ concurrent spending

API Requirements:

- `POST /api/wallets/pay`
  - รับ `vendorQrCode` หรือ signed vendor payload
  - รับ `amount` เฉพาะกรณี variable price
  - รับ `menuItemId` เฉพาะกรณี menu price
  - รับ `paymentMethod`
  - รับ `couponId`
  - รับ `idempotencyKey`
  - รับ guest token ผ่าน `X-Guest-Token` หรือ participant auth

- `GET /api/wallets/payment-status/:idempotencyKey`
  - ใช้ตรวจสอบ transaction หลัง timeout

- `POST /api/wallets/guest-token`
  - สร้าง guest token พร้อม limit/expiry

- `POST /api/wallets/guest-token/:id/revoke`
  - ยกเลิก guest token

- `GET /api/wallets/transactions`
  - ดูประวัติ wallet

- `GET /api/vendors/:vendorId/transactions`
  - Vendor/Admin ดูรายการตามสิทธิ์

Double Spending Requirements:

- ต้องใช้ MongoDB transaction หรือ atomic conditional update
- ก่อนหักยอดต้องตรวจ `coinBalance >= amount`
- การหักยอดต้องใช้เงื่อนไขเดียวกับการตรวจ balance เช่น `$inc` พร้อม `$gte`
- ต้องบันทึก balanceBefore และ balanceAfter
- ต้องมี unique idempotency key ต่อ event/wallet เพื่อกันการกดซ้ำ
- หาก request เดิมถูกส่งซ้ำ ต้องคืน transaction เดิม ไม่หักยอดซ้ำ
- หาก transaction ล้มเหลวต้อง rollback wallet balance
- ต้องรองรับ retry-safe frontend flow

Acceptance Criteria:

- ยิง payment ซ้ำด้วย idempotencyKey เดิม 10 ครั้ง ต้องหักยอดครั้งเดียว
- ยิง payment พร้อมกันเกิน balance ต้องสำเร็จเฉพาะรายการที่ balance พอ
- wallet balance ต้องไม่ติดลบจาก concurrent requests
- transaction failed ต้องไม่สร้าง success slip

### 16.10 Network และ Offline Edge Cases

ระบบต้องรองรับสภาพแวดล้อมงานอีเวนต์ที่ internet ช้า:

- Frontend ต้องมี loading state ชัดเจนระหว่างจ่าย
- ปุ่ม confirm ต้อง disable หลังส่ง payment
- หาก API timeout ต้องแสดง `กำลังตรวจสอบสถานะรายการ` แล้วเรียก payment-status
- ต้องมีปุ่ม `ลองอีกครั้ง` สำหรับกรณีที่ตรวจสอบสถานะไม่ได้
- ห้ามให้ผู้ใช้จ่ายซ้ำโดยไม่ตรวจ idempotencyKey เดิม
- ถ้า scan QR ไม่ได้ ต้องให้กรอกรหัสร้านแบบสั้นได้ โดยยัง verify กับ backend
- ถ้า guest token หมดอายุระหว่างใช้งาน ต้องแจ้งให้ขอลิงก์ใหม่

Acceptance Criteria:

- Network fail ก่อนสร้าง transaction ต้องไม่หักยอด
- Network fail หลัง transaction success ต้องค้นคืนสลิปเดิมได้จาก idempotencyKey
- ผู้ใช้ต้องเห็นสถานะชัดเจนว่า success, failed, pending หรือ unknown

### 16.11 Security และ Privacy ของ Wallet

Security Requirements:

- Participant token ต้องออกจาก backend ที่ verify ตัวตนแล้วเท่านั้น
- Guest token ต้องเป็น high entropy และเก็บ hash ใน database
- ห้ามส่ง walletId ตรง ๆ เป็นตัวตัดสินสิทธิ์จาก client
- ทุก payment ต้อง resolve wallet จาก participant token หรือ guest token
- Vendor QR ต้อง signed หรือ lookup จาก random `qrCodeId` ที่เดายาก
- Payment endpoint ต้อง rate limit ต่อ wallet, guest token, IP และ vendor
- Amount ต้อง validate ฝั่ง backend เสมอ
- Vendor dashboard ต้องใช้ scoped auth และตรวจ vendor ownership
- Transaction log ห้ามถูกแก้ไขย้อนหลัง ยกเว้นทำ reversal transaction

Privacy Requirements:

- Vendor ไม่ควรเห็นชื่อเต็ม เบอร์ อีเมล หรือข้อมูลส่วนตัวผู้ซื้อ
- Guest user ไม่ควรเห็นข้อมูลส่วนตัวของ main attendee
- Admin export ต้อง audit และจำกัด permission
- Transaction report สำหรับ vendor ควรแสดง transaction ID, เวลา, amount, status เท่านั้น

### 16.12 Critical Completion Requirement

- Frontend `useParticipantAuth` ระบุว่ายังไม่มี endpoint participant profile/login ที่สมบูรณ์ และ wallet ต้องรองรับทั้ง participant token และ guest token โดยไม่เปิดให้ client ส่ง `walletId` เอง ดังนั้นต้องเพิ่ม/ปรับ:
  - endpoint ออก participant JWT ที่ payload ใช้ `{ id, role: 'participant' }`
  - endpoint `GET /api/participants/me` หรือ equivalent
  - wallet balance/pay ต้อง resolve owner จาก participant bearer token หรือ `x-guest-token` เท่านั้น
  - wallet pay ต้องใช้ atomic update หรือ transaction lock เพื่อไม่ให้ balance/coupon ติดลบ
  - wallet pay ต้อง reject vendor QR ที่ไม่อยู่ใน Event เดียวกับ wallet
  - LINE login ต้อง verify access token จริงก่อนออก participant token
  - `GuestToken` ควรเปลี่ยนจากเก็บ `token` plaintext เป็น `tokenHash`
  - `Transaction` ต้องเพิ่ม type, idempotencyKey, balanceBefore, balanceAfter, serverTime และ reversal linkage
  - `Vendor` ต้องเพิ่ม pricingMode/fixedPrice/menuItems และ event-scoped signed QR requirement

## 17. ข้อกำหนด Receipt และ Certificate

### 17.1 Receipt

ระบบต้องสามารถ:

- สร้าง receipt สำหรับ participant/event
- กัน duplicate receipt ด้วย participantId + eventId
- สร้าง receiptNumber แบบ incremental
- เก็บ amount, details, issuedAt

Acceptance Criteria:

- การสร้าง receipt ต้องอยู่ใน transaction
- ถ้ามี receipt เดิมต้องคืน receipt เดิมแบบ idempotent
- receiptNumber ต้อง unique ต่อระบบหรือควร unique ต่อ event ตาม policy

### 17.2 Certificate Verification

ระบบต้องสามารถ:

- Verify certificate แบบ public ด้วย opaque verification ID ที่สุ่มด้วย CSPRNG อย่างน้อย 256 บิตและมี unique index
- ห้ามใช้ MongoDB `_id`/`participantId`, running number, email, phone หรือข้อมูลที่คาดเดาได้เป็น public verification credential
- ตรวจรูปแบบ token ก่อน query และใช้ข้อความ not-found แบบเดียวกันสำหรับ token ผิดรูปแบบ/ไม่มีข้อมูลเพื่อลด enumeration signal
- reject พร้อม machine-readable code ถ้า revoked, participant ถูกลบ, ยังไม่ checked-in หรือ Event ปิด certificate feature
- หน้า verify ต้องแยกสถานะ `valid`, `revoked` และ `invalid` อย่างชัดเจน
- คืนชื่อ, eventName, eventYear, ticketCode/QR, check-in time และ background image
- response ทุกสถานะต้องใช้ `Cache-Control: no-store`
- token ต้องไม่ปรากฏใน request/audit log, error, analytics, Referrer header หรือ migration report
- QR/deep link ฝั่ง browser ต้องวาง token ใน URL fragment, อ่านเข้า memory/sessionStorage, ล้าง fragment ทันที และส่ง token ไป backend ใน POST body

Critical Schema Alignment Status:

- แก้แล้ว: Certificate verify/download ใช้ schema ปัจจุบันจาก `fields.name/fullName`, `qrCode`, `checkedInAt`, `eventId`, `isRevoked` และ `isDeleted`
- แก้แล้ว: เพิ่ม `certificateVerificationId` แบบ `cert_<base64url-256-bit>` ซึ่งเป็น `select:false`, sparse unique และออกให้ข้อมูลใหม่โดยอัตโนมัติ
- แก้แล้ว: เพิ่ม `POST /api/public/certificates/verify` และ `POST /api/public/certificates/payload` โดย decrypt เฉพาะชื่อที่จำเป็นและไม่คืน participant object เต็ม
- แก้แล้ว: GET compatibility endpoint รับเฉพาะ opaque ID; raw participantId ถูกปิดเป็นค่าเริ่มต้น และเปิดชั่วคราวได้ด้วย `ALLOW_LEGACY_CERTIFICATE_PARTICIPANT_ID=true` เท่านั้น
- แก้แล้ว: เพิ่ม `npm run migrate:certificate-verification` ซึ่ง dry-run เป็นค่าเริ่มต้น, ตรวจ missing/malformed/duplicate โดยไม่พิมพ์ token และต้องใช้ `--apply` พร้อม write flag จึงเขียนได้
- ผล dry-run วันที่ 17 กรกฎาคม 2026: ตรวจ 985 participants, missing 985, malformed 0, duplicate 0 และยังไม่ได้เขียนข้อมูล
- ก่อน production cutover ต้อง backup, เปิด maintenance window, apply migration, ยืนยัน unique index, rerun ให้ candidates=0 แล้วจึงยืนยันว่า legacy flag เป็น false

### 17.3 E-Certificate ผ่าน Wallet และ LIFF

ระบบควรให้ผู้เข้าร่วมดาวน์โหลด E-Certificate จากหน้า Wallet/User Hub เพื่อให้ผู้ใช้มีศูนย์กลางเดียวสำหรับ QR ticket, wallet, coupon, receipt และ certificate

Flow:

1. ผู้เข้าร่วม login ผ่าน Email/LINE/LIFF
2. เปิด Wallet หรือ User Hub
3. ระบบตรวจ participant status และ event certificate policy
4. ถ้า `status=checkedIn` หรือผ่านเงื่อนไขกิจกรรมครบถ้วน ให้แสดงปุ่ม `ดาวน์โหลด E-Certificate`
5. ถ้ายังไม่ eligible ให้แสดง disabled state พร้อมเหตุผล เช่น `เช็คอินเข้างานก่อนจึงจะดาวน์โหลดได้`
6. เมื่อ certificate พร้อม ระบบสามารถส่ง LINE push แจ้ง `คุณสามารถดาวน์โหลด E-Certificate ได้แล้ว`
7. ผู้ใช้กดดาวน์โหลดหรือเปิด certificate preview
8. Certificate ต้องมี QR verification URL สำหรับตรวจสอบความถูกต้อง

PDF Generation Requirements:

- ค่าเริ่มต้นควรใช้ client-side generation เพื่อลดโหลด server เช่น `@react-pdf/renderer` หรือ `html2canvas + jspdf`
- Backend มีหน้าที่คืนข้อมูล certificate payload และ verification token ไม่ต้อง render PDF ทุกครั้ง
- หากต้องการไฟล์มาตรฐานสูงหรือ digital signature จริง ให้เพิ่ม backend generation เป็น optional mode
- Certificate template ต้องมาจาก Event layout/template version เพื่อให้รายงานย้อนหลังถูกต้อง
- Font ไทยต้องถูกฝังหรือโหลดให้ render ได้ถูกต้อง

LIFF Download Requirements:

- LIFF/In-app browser อาจดาวน์โหลด PDF ไม่สมบูรณ์
- Frontend ต้องตรวจ `liff.isInClient()`
- ถ้าอยู่ใน LIFF ให้ใช้ `liff.openWindow({ url, external: true })` เพื่อเปิด Safari/Chrome สำหรับ download
- หรือมีปุ่ม `ส่งลิงก์เข้าแชต LINE` โดยส่ง deep link/verification link แทนไฟล์

Implementation Status:

- แก้แล้ว: หน้า Wallet ตรวจ `liff.isInClient()` และเปิด `/certificate/download#<opaque-id>` ผ่าน external browser fallback
- แก้แล้ว: Certificate download page ล้าง fragment จาก address bar แล้วใช้ POST payload endpoint เพื่อสร้าง PDF ฝั่ง client
- แก้แล้ว: LIFF route ทำ seamless login ด้วย LIFF ID token ที่ backend verify โดยไม่เรียก `getProfile()` เพื่อ log ชื่อ และไม่เก็บ LIFF ID token ถาวร

Certificate Integrity Requirements:

- Public verify endpoint ต้องตรวจ revoked status
- Certificate ต้องมี verification QR ที่ชี้กลับมายัง backend
- verification payload ต้องไม่ใช้ participantId เดาได้อย่างเดียว ควรใช้ signed token หรือ opaque verification id
- ถ้า certificate ถูก revoke ต้องแสดงสถานะ revoked บน verify page
- การ download/reveal certificate ต้อง audit แบบ metadata-only
- audit URL ต้องเก็บ route pattern เช่น `/verify/:verificationId` หรือค่าที่ redact แล้ว ห้ามเก็บ token จริง
- หาก token รั่ว ให้ผู้ดูแล revoke certificate หรือ rotate opaque ID ตาม incident procedure; การ rotate ต้องทำให้ QR/link เก่าใช้ไม่ได้ทันที

Acceptance Criteria:

- ผู้ใช้ที่ยังไม่ checked-in ต้องดาวน์โหลด certificate ไม่ได้
- ผู้ใช้ที่ checked-in แล้วเห็นปุ่ม certificate ใน Wallet/User Hub
- เปิดจาก LIFF แล้วสามารถดาวน์โหลดได้ผ่าน external browser flow
- QR verification ต้องตรวจพบเอกสารจริง/ปลอม/revoked ได้
- การ generate PDF จำนวนมากพร้อมกันต้องไม่ทำให้ server ล่ม
- raw 24-character ObjectId ต้องได้ 404 เมื่อ legacy flag ปิด
- Guest Wallet ต้องไม่ได้รับ certificate token หรือ participant PII ของเจ้าของ wallet

## 18. ข้อกำหนด Upload และ Media

### 18.1 เป้าหมายและการจำแนกไฟล์

ระบบต้องจัดเก็บรูปผ่าน Object Storage abstraction เดียวและแยกประเภทข้อมูลดังนี้:

- `event_media`: โลโก้/ภาพปกของ Event เป็น logical public object
- `payment_qr`: QR รับเงินของ Event เป็น logical public object แต่ bucket ยังคง private
- `avatar`: รูปผู้ดูแล เป็น logical public object
- `payment_slip`: หลักฐานการโอนเงิน เป็น private object และถือเป็นข้อมูลอ่อนไหว
- MongoDB `StoredObject` เป็น source of truth ของ metadata, Event scope, visibility, owner/link, size, hash, retention และ status
- GCS/local filesystem เก็บ binary เท่านั้น; ห้ามเก็บชื่อผู้บริจาค อีเมล เบอร์ ที่อยู่ หรือ token ใน object metadata/key
- MariaDB/SQL mirror และ Firestore ห้ามเก็บ binary หรือ slip reference โดยอัตโนมัติ

### 18.2 Event Media Flow

Flow บังคับ:

1. Admin เลือก Event ก่อน upload และ frontend ส่ง `eventId` ทุกครั้ง
2. Backend ตรวจ session, `event:manage` และ Event ownership/scope
3. Backend รับไฟล์หนึ่งไฟล์ใน memory ไม่เขียน raw upload ลง disk
4. ตรวจ allowlist MIME + magic bytes + decode image จริง
5. Re-encode/resize/strip metadata ใน memory โดยยังไม่ persist raw source
6. จอง `StoredObject` เป็น active-unlinked พร้อม `linkExpiresAt` 24 ชั่วโมงก่อนเขียน binary เพื่อให้ crash ทุกช่วงมี metadata สำหรับ cleanup
7. เขียน Object Storage แบบ create-only; ถ้าเขียนล้มเหลวให้ mark metadata `deleted` และลบ partial object แบบ ignore-not-found
8. หน้า Event Settings แสดง canonical backend URL แบบ read-only และต้องกดบันทึก Event
9. Event save ต้องทำ claim file และเพิ่ม `eventLinks` ภายใน MongoDB transaction เดียวกับ Event update
10. ถ้า Event save ล้มเหลว ไฟล์ต้องคงสถานะ unlinked และถูก cleanup เมื่อหมดอายุ
11. เมื่อแทน logo/cover/payment QR ต้อง unlink object เดิม; ถ้าไม่มี Event อื่นอ้างอิงให้ quarantine ก่อน cleanup
12. Clone Event ต้องเพิ่ม reference ของ Event ใหม่ ห้ามลบ binary ที่ Event ต้นทาง/ปลายทางยังใช้อยู่
13. ห้ามรับ external media URL ใหม่โดย default; legacy URL เดิมอ่านได้ระหว่าง migration เท่านั้น เว้นแต่เปิด exception ที่อนุมัติ

Avatar flow บังคับ:

- รูปใหม่ต้องเริ่มเป็น active-unlinked อายุไม่เกิน 24 ชั่วโมงและผูก `uploadedBy` กับบัญชีที่ upload
- ต้อง claim object พร้อมเปลี่ยน `avatarUrl/avatarObjectRef` ภายใน MongoDB transaction เดียวกัน
- ถ้า transaction/process ล้มก่อน commit ให้ avatar เดิมยังใช้งานได้ และ object ใหม่ถูก cleanup เมื่อหมดอายุ
- ลบ object/avatar legacy เดิมได้หลัง transaction commit สำเร็จเท่านั้น
- เมื่อลบบัญชีผู้ดูแล ต้อง revoke session และ cleanup managed avatar; หาก physical delete ล้มเหลวต้อง quarantine เพื่อให้ scheduler retry โดยไม่ log object key

### 18.3 Payment Slip Flow

Public flow:

1. ผู้ใช้เลือก Event จาก slug/id ที่ชัดเจน ห้าม fallback ไป current Event
2. Event ต้องเผยแพร่และเปิด feature donations; donation ไม่ต้องผูกกับสถานะ registration หาก policy ยังรับบริจาคอยู่
3. Turnstile ต้องตรวจผ่านก่อน parse file และมี rate limit ต่อ IP
4. Endpoint นี้ไม่ใช้สิทธิ์จาก admin cookie จึงต้อง exempt CSRF อย่างเจาะจง เพื่อไม่ให้ผู้ใช้ที่ login ฝั่งจัดการอยู่ upload ไม่ได้; Turnstile/rate limit/Event validation ยังคงบังคับ
5. Backend sanitize รูปและสร้าง private `pending` object อายุ 24 ชั่วโมง
6. API คืน opaque `object://<uuid>` เท่านั้น ห้ามคืน bucket/object key
7. Donation create transaction ต้อง claim pending object ที่ Event ตรงกันและใช้ได้ครั้งเดียว พร้อมบันทึก Donation/ตัด stock
8. หาก transaction rollback object ต้องกลับเป็น pending และยังไม่ถูกถือว่าใช้งาน
9. LINE notification ล้มเหลวหลัง commit ห้ามทำให้ API ตอบว่าการบันทึกล้มเหลว เพราะจะทำให้ผู้ใช้ retry และสร้าง Donation ซ้ำ
10. ทุก client ต้องส่ง `Idempotency-Key` แบบสุ่มอย่างน้อย 128 bits; backend เก็บเฉพาะ SHA-256 hash และ unique ต่อ Event
11. Backend ต้องเก็บ request fingerprint; key เดิม + payload เดิมคืนรายการเดิมด้วย `replayed=true` โดยไม่ claim slip/ตัด stock/ส่ง LINE ซ้ำ ส่วน key เดิม + payload ต่างกันต้องตอบ 409
12. `eventYear` ใน body ต้องตรง Event context; ห้ามลด scope เป็น year-only หรือสร้าง Donation ที่ไม่มี `eventId`

Admin flow:

- Admin แนบไฟล์ผ่าน authenticated private-slip endpoint ไม่ใช้ช่องกรอก Google Drive/Imgur URL
- Donation update ต้องตรวจ Event scope ใน database query และ claim slip ใหม่ใน transaction
- เปลี่ยน package/size ต้อง reserve stock ใหม่และคืน stockเดิมใน transaction เดียวกัน
- Soft-delete Donation ที่เป็น package ต้องคืน stockหนึ่งหน่วยแบบ atomic และห้าม sold ติดลบ
- Event identity/eventYear ของ Donation ต้อง immutable ใน endpoint แก้ไขทั่วไป
- External slip URL ใหม่ต้องถูก reject; legacy URL เดิมต้อง migration ตาม runbook

Private access flow:

- Admin ต้องมี `event:read` และ `canAccessEvent` สำหรับ Event ของ object
- Backend audit เฉพาะ object public id, Event, purpose, actor และเวลา ห้าม log signed URL/object key/PII
- GCS ใช้ V4 signed URL อายุ default 300 วินาที; local provider ใช้ HMAC URL อายุสั้นด้วย dedicated secret
- Signed URL เป็น bearer credential ผู้ที่ได้ URL ใช้ได้จนหมดอายุ จึงห้ามฝังใน CSV, log, analytics หรือ chat
- Donation export แสดงเพียง `มี/ไม่มีสลิป` ไม่ export `object://` หรือ signed URL

### 18.4 Image Validation และ Optimization Policy

| Purpose | Source limit | Output | Dimension limit | Policy |
| --- | ---: | --- | ---: | --- |
| Avatar | 2 MB | WebP quality 80 | 512x512 | no enlarge |
| Event media | 5 MB | WebP quality 82 | 2560x2560 | no enlarge |
| Payment QR | 5 MB | PNG | 1600x1600 | รักษาขอบ QR |
| Payment slip | 5 MB | WebP quality 88 | 2000x2000 | เน้นอ่านข้อความได้ |

ข้อบังคับ:

- รับเฉพาะ JPEG, PNG, GIF, WebP; ไม่รับ SVG, HTML, PDF, HEIC หรือ executable
- MIME ที่ client ประกาศต้องตรง magic bytes
- image decoder ต้องจำกัดไม่เกิน 40 ล้าน pixels ป้องกัน decompression bomb
- GIF ใช้เฉพาะ frame แรกและ output ต้องไม่เป็น animated image
- ต้อง auto-rotate ตาม EXIF แล้ว strip EXIF/GPS/profile/metadata ด้วยการ re-encode
- raw source ห้ามถูก persist; เก็บเฉพาะ sanitized output
- ใช้ UUID เป็น object id/key และห้ามใช้ original filename
- GCS upload ต้องตรวจ CRC32C และใช้ create precondition ป้องกัน overwrite
- response ต้องมี `nosniff`; private file ใช้ `no-store`; public immutable object ใช้ long cache

### 18.5 Storage Provider และ Delivery

- Development ใช้ `OBJECT_STORAGE_PROVIDER=local`
- Production ใช้ `OBJECT_STORAGE_PROVIDER=gcs`
- GCS bucket ต้อง private, Standard, single-region, flat namespace, Uniform Bucket-Level Access และ Public Access Prevention `enforced`
- startup ต้อง reject multi-region (`ASIA`, `US`, `EU`) และยืนยันว่า location เป็น regional location ตาม `GCS_LOCATION`
- ห้ามเปิด Object Versioning/Autoclass โดย default เพราะเพิ่มต้นทุนหรือ operation ที่ไม่จำเป็น
- public object เปิดผ่าน stable `/api/uploads/public/files/:publicId` แล้ว redirect ไป signed GCS URL
- private object เปิดผ่าน authenticated `/api/uploads/access`
- startup readiness ต้อง fail หาก bucket region/security/storage/lifecycle policy ไม่ตรง config
- production-local ต้องใช้ `OBJECT_STORAGE_LOCAL_SIGNING_SECRET` อย่างน้อย 32 bytes แยกจาก JWT และโหลดจาก Secret Manager
- GCS runtime ใช้ ADC/Workload Identity ห้าม service-account JSON key

### 18.6 Retention, Cleanup และ Data Lifecycle

- Pending/unlinked upload ลบหลัง 24 ชั่วโมง
- Replaced public object เข้า quarantine อย่างน้อย 24 ชั่วโมงก่อน physical delete
- Payment slip retention default 365 วันนับจาก claim; ปรับตาม PDPA/บัญชี/นโยบายองค์กร
- Bucket lifecycle payment slip ต้องช้ากว่า app retention + unlinked window + grace; default delete age = 368 วัน
- GCS soft delete ไม่เกิน 7 วัน; retention ที่มากกว่าต้องมี approval/cost estimate
- default event-based hold ต้องปิด และ bucket retention policy default ต้องเป็น 0 วัน
- retention/hold exception ต้องระบุ legal owner, เหตุผล, วันหมดอายุ, restore impact, cost estimate และเพิ่ม `GCS_MAX_BUCKET_RETENTION_DAYS` ที่อนุมัติ
- event media/avatar ห้ามใช้ age-only bucket lifecycle เพราะอาจยังถูก Event อ้างอิง
- cleanup scheduler ต้องมี atomic claim, stale-lock recovery, bounded batch และ ignore-not-found
- metadata ต้องถูกสร้างก่อน binary เพื่อไม่ให้ process crash สร้าง provider orphan ที่ DB ไม่รู้จัก
- Metadata ห้าม hard-delete ให้เปลี่ยน status `deleted` พร้อม `deletedAt`
- lifecycle เป็น asynchronous ห้ามใช้เป็น signal ว่าไฟล์ถูกลบทันที
- ต้องมี dry-run/apply gate สำหรับ cleanup และ migration

### 18.7 Security, IAM, Secret Manager และ KMS

- Runtime service account มีเฉพาะ object create/get/delete, bucket metadata read และ `signBlob` ที่จำเป็น
- Bucket configure/migration account ต้องแยกจาก runtime และยกเลิกสิทธิ์หลัง maintenance
- ห้าม runtime เปลี่ยน bucket IAM/lifecycle/retention
- `GCS_BUCKET`, project, region, prefix เป็น config ไม่ใช่ secret
- local signing secret, DB/JWT/session/CSRF/LINE/Brevo/SMTP fallback keys ต้องอยู่ Secret Manager และ pin version ใน production
- GCS ใช้ Google-managed encryption at rest เป็น default ที่คุ้มค่า
- KMS ใช้ unwrap field data key แบบ cached; ห้ามเรียก KMS ต่อการเปิดรูปหรือ signed URL
- CMEK สำหรับ GCS เปิดเฉพาะ compliance requirement และต้องเพิ่ม cost/availability/rotation/rollback requirement ก่อน
- WAF/rate limit ต้องป้องกัน upload abuse, enumeration และ hotlink/egress abuse
- `publicId` เป็น opaque identifier แต่ไม่ถือเป็น authorization สำหรับ private object

### 18.8 Cost Requirement ไม่เกิน 1,000 บาท/เดือน

Budget allocation:

- Google Cloud รวม: ไม่เกิน 1,000 บาท/เดือนสำหรับ normal load
- GCS: 650 บาท/เดือน
- Secret Manager/KMS/Firestore และ buffer: 300 บาท/เดือน
- GCS operational ceiling 80% = 560 บาท ก่อนใช้ reserve

Pricing assumption ณ 2026-07-17:

- Standard single-region ประมาณ USD 0.02/GiB-month
- Class A USD 0.005/1,000 operations
- Class B USD 0.0004/1,000 operations
- Internet egress ไป Asia ช่วง 0-10 TiB ประมาณ USD 0.12/GiB
- Inbound upload ไม่มี network transfer charge
- ใช้อัตรา 33.5 บาท/USD และต้องปรับ env ตาม Billing currency/ค่าเงินจริง
- ราคา storage แตกต่างตาม bucket location; ค่า USD 0.02 เป็น planning baseline และก่อน deploy ต้องตรวจ Cloud Platform SKU ของ `GCS_LOCATION` แล้ว override ราคาใน env หากสูงกว่า
- ห้ามหัก Always Free ออกจาก forecast เพราะ free storage/operations ใช้เฉพาะบาง US regions
- แหล่งอ้างอิงที่ตรวจล่าสุด: https://cloud.google.com/storage/pricing

Cost scenarios:

- 10,000 รูป x 500 KB, เปิดเฉลี่ย 5 ครั้ง: ประมาณ 101 บาท/เดือน หรือประมาณ 122 บาทเมื่อเผื่อ 20%
- 100 GiB stored + 100 GiB egress + 100k upload + 1m GET: ประมาณ 499 บาท/เดือนก่อน reserve/tax
- Egress เป็นค่าใช้จ่ายหลัก จึงต้อง optimize image, cache และป้องกัน hotlink ก่อนลด storage class
- ไม่ใช้ Nearline/Coldline/Autoclass/CDN ใน Phase 1 จนมี Billing data พิสูจน์ความคุ้มค่า

Cost guardrail ค่าเริ่มต้นต่อ process:

- upload 1,000 files/day
- optimized upload 1 GiB/day
- projected egress 4 GiB/day
- signed URL 10,000/day
- metadata operation 10,000/day
- ตั้ง Google Cloud Budget Alert อย่างน้อย 500/700/850/1,000 บาท
- in-memory counter ไม่ใช่ billing hard cap; ระบบหลาย instance ต้องรวม metric กลางก่อน scale

### 18.9 Migration และ Rollback

- ต้อง inventory legacy Event media/slip/avatar ด้วย `npm run migrate:object-storage` ซึ่งเป็น dry-run default
- Apply ต้องใช้ `OBJECT_STORAGE_MIGRATION_WRITE=true`, `--apply` และ `OBJECT_STORAGE_PROVIDER=gcs`
- Donation ที่ไม่มี `eventId` ต้อง backfill Event ก่อน migrate
- Migration ต้อง re-encode source และ update DB/reference แบบ transaction; ห้าม bulk replace URL ด้วย string
- Source local files ต้องเก็บตลอด rollback window และห้ามลบอัตโนมัติ
- ถ้า missing/failed มากกว่า 0 ห้ามปิด legacy route
- หลัง verify object count/bytes/sample/access ครบ ต้องปิด `LEGACY_UPLOADS_PUBLIC_ENABLED`; ทั้ง `/uploads` และ `/uploads/avatars` ต้องตอบ 404
- production GCS startup ต้อง fail หาก policy บังคับปิด legacy แต่ route ยังเปิด
- Rollback ต้องใช้ MongoDB backup + local source snapshot ที่ทดสอบ restore แล้ว

### 18.10 Observability และ Error Flow

- Superadmin `infra:manage` ดู storage health, policy, count, bytes, optimization saving, forecast และ guardrail ได้
- Health response สาธารณะคืนเพียง up/down ห้ามคืน bucket/key/policy detail
- error response 5xx ห้ามเปิด provider path, bucket, object key, signed URL หรือ stack
- Alert เมื่อ budget/egress/upload โตผิดปกติ, signed URL fail, bucket policy drift, cleanup fail, pending object โต หรือ missing source
- Retry upload ต้องสร้าง object id ใหม่; Event/Donation transaction ต้องป้องกัน object เดิมถูก claim ซ้ำ
- หาก client timeout หลัง Donation commit ให้ retry ด้วย key เดิมและคืน Donation เดิม; notification failure ห้ามเปลี่ยนผล commit
- raw idempotency key ห้ามอยู่ใน DB/log/audit/SQL mirror และต้องถือเป็น bearer recovery token ระหว่าง request

Implementation Status:

- เสร็จในโค้ด: local/GCS abstraction, metadata model, image optimization, private slip, signed URL, Event media link, cleanup, cost estimator/guardrail, bucket policy validator/config script และ legacy migration dry-run/apply gate
- เสร็จในโค้ด: Event Settings upload logo/cover/payment QR, admin slip upload, private access UI และ legacy avatar migration path
- เสร็จในโค้ด: Donation create idempotency/fingerprint/Event-year enforcement, update/delete Event scope, transactional slip claim และ package stock reserve/release
- รอ environment จริง: สร้าง bucket, IAM/Workload Identity, Budget/Billing export, lifecycle/soft delete, migration production data, load test และ restore/rollback drill
- Runbook: `docs/GCS_OBJECT_STORAGE_RUNBOOK.md`

Acceptance Criteria:

- fake MIME, SVG/HTML, oversized/decompression-bomb image ต้องถูก reject
- EXIF/GPS ต้องไม่อยู่ใน output และ QR/slip ต้องอ่านได้หลัง optimize
- unlinked upload ต้องถูก cleanup โดยไม่กระทบ linked object
- private slip เปิดโดยผู้ไม่มี Event access ไม่ได้ และ signed URL หมดอายุตาม TTL
- admin Event A แก้/ลบ Donation Event B ด้วย record id ไม่ได้
- concurrent Donation/package update/delete ต้องไม่ทำให้ stock ติดลบหรือ drift
- ยิง Donation create ซ้ำด้วย key/payload เดิมต้องมี Donation/stock/slip claim เพียงครั้งเดียว และ key เดิมกับ payload ใหม่ต้องถูก reject
- replace/clone Event media ต้องรักษา reference ถูกต้องและไม่ลบ object ที่ยังมี Event ใช้
- migration dry-run ไม่เขียน DB/GCS; apply รันซ้ำแล้วไม่ทำให้ reference ที่ย้ายแล้วซ้ำ
- production readiness fail เมื่อ GCS security/location/lifecycle/cost policy drift
- production readiness fail เมื่อ bucket มี default hold หรือ retention เกินค่าที่อนุมัติ
- avatar transaction rollback ต้องไม่เปลี่ยน avatar เดิม และ unlinked avatar ใหม่ต้องถูก cleanup ได้
- scenario normal load + reserve ต้องไม่เกิน GCS 650 บาทและ Google Cloud รวม 1,000 บาท/เดือน
- `npm audit --omit=dev`, backend tests, frontend lint/build ต้องผ่านก่อน deploy

## 19. ข้อกำหนด LINE Integration

ระบบต้องสามารถ:

- LINE login/link/unlink participant
- LINE webhook รับ event จาก LINE
- ส่ง LINE donation alert
- ใช้ LineOA เป็นช่องทาง CRM และ notification ให้ผู้เข้าร่วม
- เปิด LIFF app จาก Rich Menu เพื่อเข้า wallet, QR ticket, certificate และ profile
- ตอบคำสั่งในแชต เช่น `เช็คข้อมูล`, `QR`, `คูปอง`, `กระเป๋า`, `ใบรับรอง`
- ส่ง Flex Message แจ้งเตือนคูปอง, QR ticket, check-in confirmation, certificate ready และ payment summary

Critical Security Requirement:

- ห้ามเชื่อ `lineUserId` ที่ส่งจาก client ตรง ๆ ใน production
- ต้อง verify LINE access token หรือ LIFF ID token กับ LINE API
- Webhook ต้อง verify `X-Line-Signature`
- ต้องผูก participant กับ event scope
- Token ที่ออกให้ participant ต้องใช้ payload schema เดียวกับ `participantAuth`

### 19.1 LINE Channel และ LIFF Setup

ระบบต้องเตรียม LINE Developer Console อย่างน้อย:

- LINE Login Channel สำหรับ OAuth/LINE Login
- Messaging API Channel สำหรับ LineOA, webhook, reply, push message
- LIFF app สำหรับ wallet/ticket/certificate/profile
- Callback URLs แยก staging/production
- LIFF URLs แยกตาม environment
- Channel secret และ access token ต้องเก็บใน environment/secret manager

Environment Variables ที่ต้องมี:

- `LINE_LOGIN_CHANNEL_ID`
- `LINE_LOGIN_CHANNEL_SECRET`
- `LINE_MESSAGING_CHANNEL_ID`
- `LINE_MESSAGING_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_LIFF_ID`
- `LINE_LOGIN_CALLBACK_URL`
- `LINE_RICH_MENU_ID`

Acceptance Criteria:

- Backend ต้อง reject LINE callback/webhook ที่ channel/audience ไม่ตรง
- Staging token ห้ามใช้กับ production
- Callback URL ต้อง validate state/nonce

### 19.2 Rich Menu Requirements

LineOA Rich Menu ต้องมีปุ่มอย่างน้อย:

- `QR ของฉัน`
- `กระเป๋าคูปอง`
- `ข้อมูลลงทะเบียน`
- `ดาวน์โหลดใบรับรอง`
- `ติดต่อเจ้าหน้าที่`

แต่ละปุ่มต้องเปิด LIFF หรือ Web URL ที่เหมาะสม:

- QR ของฉัน → `/liff/ticket` หรือ `/wallet?tab=ticket`
- กระเป๋าคูปอง → `/liff/wallet`
- ข้อมูลลงทะเบียน → `/liff/profile`
- ดาวน์โหลดใบรับรอง → `/liff/certificate`
- ติดต่อเจ้าหน้าที่ → chat หรือ support link

Acceptance Criteria:

- ถ้ายังไม่ผูก LINE ต้องพาเข้าสู่ link account flow
- ถ้ายังไม่มี registration ใน Event ต้องแสดงหน้า not registered พร้อมลิงก์ลงทะเบียน
- Rich menu URL ต้องไม่ฝัง token ถาวร

### 19.3 Webhook Command Flow

ระบบต้องรองรับการตอบกลับผ่าน Webhook โดยไม่ใช้ push quota ในกรณี user เริ่มข้อความเอง

ตัวอย่างคำสั่ง:

- `เช็คข้อมูล`: ตอบข้อมูลลงทะเบียนแบบ masked พร้อมปุ่มเปิด LIFF profile
- `QR` หรือ `คิวอาร์โค้ด`: ตอบ Flex Message พร้อมปุ่มเปิด QR ticket
- `คูปอง` หรือ `กระเป๋า`: ตอบยอดคูปอง/เหรียญแบบ summary และปุ่มเปิด wallet
- `ใบรับรอง`: ถ้า eligible ให้เปิด certificate, ถ้ายังไม่ check-in ให้แจ้งเงื่อนไข
- `ช่วยเหลือ`: ส่งเมนูคำสั่ง

Security Requirements:

- ต้อง verify webhook signature ก่อน parse body
- ต้อง map `source.userId` กับ participant ที่ผูกไว้เท่านั้น
- ห้ามตอบข้อมูล PII เต็มใน chat
- หากมีหลาย Event ต้องให้ user เลือก Event หรือใช้ current active event ที่ user ลงทะเบียนไว้
- ต้อง rate limit command ที่ query ข้อมูลอ่อนไหว

### 19.4 Push Notification Requirements

ระบบต้องส่ง Push Message เฉพาะกรณีที่ผู้ใช้ opt-in และผูก LINE แล้ว:

- ลงทะเบียนสำเร็จ พร้อมปุ่มเปิด QR ticket
- ส่ง e-ticket/QR reminder ก่อนวันงาน
- check-in สำเร็จ พร้อม welcome message
- ได้รับคูปองหรือ coin grant
- payment success summary ถ้าเปิด notification
- guest link ถูกสร้างหรือถูกใช้ถึง limit
- certificate ready หลังจบงาน
- security alert เช่น unlink/re-link/logout all devices

Cost Control Requirements:

- Broadcast ข่าวสารทั่วไปควรใช้ LineOA Official Manager เพื่อติดตาม quota
- System push ควรใช้เฉพาะ transactional/important notification
- ต้องเก็บ message type และ sent status ใน log
- ถ้า push fail เพราะ user block LineOA ต้องไม่ทำให้ transaction หลักล้มเหลว

Acceptance Criteria:

- Check-in success ต้องส่ง LINE confirmation ได้ถ้า user linked LINE
- Coupon grant ต้องส่งแจ้งเตือนแบบ Flex Message ได้
- Push log ต้องไม่เก็บ PII เกินจำเป็น
- ผู้ใช้ต้อง opt-out notification ได้จาก profile

### 19.5 Web และ LIFF Omnichannel UX

ระบบต้องให้ user ใช้ feature เดียวกันได้ทั้ง Web browser และ LIFF:

- Web: Email OTP login, Login with LINE, profile, wallet, ticket, certificate
- LIFF: auto-login ผ่าน ID token, compact wallet, QR ticket, scan pay, certificate view
- หาก feature ใน LIFF ทำงานไม่ดี เช่น PDF download ให้เปิด external browser
- UI ต้องระบุสถานะ account linked/not linked ชัดเจน
- session ใน Web และ LIFF ต้อง revoke ได้ด้วย logout all devices

Acceptance Criteria:

- User เปิด `/liff/wallet` จาก Rich Menu แล้ว auto-login ได้เมื่อ LINE linked
- User เปิด Web ปกติแล้ว login ด้วย Email OTP ได้แม้ไม่ได้ใช้ LINE
- User เปลี่ยน LINE แล้ว LIFF ของ LINE เก่าต้องใช้ไม่ได้

## 20. API Requirement Mapping

### 20.1 Public APIs

| Endpoint | Requirement |
| --- | --- |
| `GET /api/public/events/current` | คืนเฉพาะ Event ที่ SystemSetting ระบุเป็น current และอยู่ใน public status; ห้าม fallback ไป Event อื่น |
| `GET /api/public/events/by-id/:eventId` | Resolve Event จากลิงก์ที่หลังบ้านแชร์ โดยคืน public allowlist เท่านั้นและใช้ข้อความ not-found แบบเดียวกันเมื่อ ID ผิดหรือ Event ไม่ public |
| `GET /api/public/events/:slug` | ดึง public event เฉพาะ public status |
| `POST /api/public/events/:slug/reuse/request-otp` | ขอ OTP reuse registration แบบ generic response |
| `POST /api/public/events/:slug/reuse/confirm` | ยืนยัน OTP และคืนข้อมูล prefill |
| `GET /api/public/report` | Public masked checked-in report, require event identity |
| `GET /api/public/dashboard` | Public aggregate dashboard, require event identity |
| `GET /api/public/prizes` | Public lucky draw result แบบ masked |
| `POST /api/public/certificates/verify` | Verify certificate ด้วย opaque ID ใน body, no-store และคืน valid/revoked/invalid code |
| `POST /api/public/certificates/payload` | คืน minimum PDF payload ด้วย opaque ID ใน body และ audit metadata-only |
| `GET /api/public/verify/:verificationId` | Compatibility endpoint สำหรับ opaque ID; raw participantId ปิดโดย default |
| `POST /api/public/request-short-session` | แลก self-register master token เป็น short session |

### 20.2 Auth/Admin APIs

| Endpoint | Requirement |
| --- | --- |
| `POST /api/auth/login` | Turnstile, rate limit, cookie session |
| `POST /api/auth/google-login` | Verify Google ID token และ email verified |
| `GET /api/auth/me` | คืน user/scoped token profile |
| `POST /api/auth/verify` | Kiosk unlock |
| `POST /api/auth/forgot-password` | Request reset OTP |
| `POST /api/auth/reset-password-otp` | Reset password ด้วย OTP |
| `POST /api/participant-auth/email/request-otp` | ขอ OTP login ผู้เข้าร่วมผ่าน email แบบ generic response |
| `POST /api/participant-auth/email/verify-otp` | Verify OTP และออก participant session/JWT |
| `POST /api/participant-auth/line/start` | สร้าง LINE OAuth authorization URL พร้อม state/nonce TTL |
| `POST /api/participant-auth/line/link/start` | เริ่ม re-link LINE หลัง step-up OTP โดยผูก state กับ participant |
| `POST /api/participant-auth/line/login` | LINE Login callback/code exchange และ verify LINE token |
| `POST /api/participant-auth/liff/verify` | Verify LIFF ID token และทำ seamless login |
| `POST /api/participant-auth/line/link` | ผูก LINE กับ participant หลัง step-up OTP |
| `POST /api/participant-auth/line/unlink` | ยกเลิก LINE link หลัง step-up OTP |
| `POST /api/participant-auth/step-up/request-otp` | ขอ OTP สำหรับ action สำคัญ เช่น unlink LINE/logout all |
| `POST /api/participant-auth/step-up/verify-otp` | Verify step-up OTP และออก step-up token อายุสั้น |
| `POST /api/participant-auth/refresh` | Rotate participant token/session hash ก่อนหมดอายุ |
| `POST /api/participant-auth/switch-event` | สลับ participant session ไปยัง event อื่นของ email เดียวกัน |
| `POST /api/participant-auth/logout` | Logout participant session ปัจจุบัน |
| `POST /api/participant-auth/logout-all` | เพิ่ม tokenVersion/lastLogoutAt เพื่อตัดทุก device |
| `GET /api/participant-auth/me` | คืน participant profile, linked providers, event list และ token status |
| `GET /api/participant-auth/sessions` | รายการ active participant sessions/devices |
| `POST /api/participant-auth/sessions/:id/revoke` | Revoke participant session/device รายตัว |
| `/api/admins/*` | User management, require admin/superadmin rules |
| `/api/sessions/*` | Session list/revoke/logout/refresh |

### 20.3 Event APIs

| Endpoint | Requirement |
| --- | --- |
| `GET /api/events/current` | Current event |
| `GET /api/events/catalog` | Catalog ตาม scope |
| `GET /api/events/:id` | โหลด Event รายตัวตาม `event:read` และ Event scope สำหรับ deep-link workspace |
| `GET /api/events/migration-preview` | Admin migration preview |
| `POST /api/events/migrate-legacy` | Admin legacy migration |
| `POST/PUT /api/events/organizations` | Organization management |
| `POST/PUT /api/events/series` | Series management |
| `POST/PUT/DELETE /api/events` | Event management |
| `POST /api/events/:id/activate` | ตั้ง current event |
| `POST /api/events/:id/publish` | Publish public page |
| `POST /api/events/:id/status` | Change lifecycle |
| `PUT /api/events/:id/layouts/:layoutKey` | Update layout version |
| `POST /api/events/clone-settings` | Clone config/layout/templates |

### 20.4 Participant APIs

| Endpoint | Requirement |
| --- | --- |
| `POST /api/participants/public` | Public pre-registration |
| `POST /api/participants/register-onsite` | Staff/kiosk/self onsite registration |
| `POST /api/auth/kiosk/verify` หรือ `/api/public/kiosk-token/verify` | ตรวจ Kiosk scoped token, point, event, expiry และ readiness metadata |
| `GET /api/participants` | Admin list participants by event |
| `GET /api/participants/search` | Staff/admin search |
| `PUT /api/participants/:id` | Admin update |
| `DELETE /api/participants/:id` | Admin soft delete |
| `POST /api/participants/checkin-by-qr` | Staff/kiosk check-in |
| `POST /api/participants/resend-ticket` | Public resend ticket |
| `POST /api/participants/:id/resend-ticket` | Staff resend ticket โดยต้อง authenticated, มี `participant:manage`, ผ่าน CSRF และตรวจ Event scope |
| `GET /api/participants/export` | Admin CSV export |
| `GET /api/participants/download-report-pdf` | Admin PDF report |
| `PUT /api/participants/restore-prize/:id` | Admin restore prize right |
| `GET /api/participants/me/events` | ผู้เข้าร่วมดู Event ที่ตนลงทะเบียน |
| `GET /api/participants/me/ticket` | ผู้เข้าร่วมดู QR ticket ของตนเอง |
| `GET /api/participants/me/certificate` | คืน certificate payload สำหรับ client-side PDF |

### 20.5 Operations APIs

| Endpoint | Requirement |
| --- | --- |
| `/api/participant-fields` | Dynamic field management |
| `/api/registration-points` | Registration point management |
| `/api/settings` | System/global settings |
| `/api/packages` | Package CRUD/list |
| `/api/donations` | Donation create/summary/update/delete |
| `/api/dashboard/summary` | Protected dashboard summary |
| `/api/dashboard/comparison` | Protected dashboard comparison |
| `/api/prizes` | Lucky draw admin APIs ต้องเพิ่ม auth/permission |
| `/api/wallets/balance` | Participant/guest ดูยอด wallet |
| `/api/wallets/guest-token` | สร้าง guest link พร้อม limit/expiry โดย frontend อ่าน token จาก URL ครั้งแรกแล้วล้าง URL เป็น `/guest-wallet` |
| `/api/wallets/guest-token/:id/revoke` | ยกเลิก guest link |
| `/api/wallets/pay` | จ่ายเหรียญให้ vendor ด้วย idempotency key |
| `/api/wallets/payment-status/:idempotencyKey` | ตรวจสถานะรายการหลัง timeout/retry |
| `/api/wallets/transactions` | ดูประวัติธุรกรรมของ wallet |
| `/api/vendors` | Admin/Finance จัดการร้านค้าและ QR payload |
| `/api/vendors/:vendorId/transactions` | Vendor/Admin ดูรายการรับเหรียญตามสิทธิ์ |
| `/api/wallet-adjustments` | Admin/Finance grant/topup/refund/reversal/adjustment |
| `/api/receipts/generate` | Admin receipt generation |
| `/api/uploads` | Admin media upload |
| `/api/line` | LINE login/webhook ต้อง verify signature/token |

## 21. Frontend Navigation Requirements

ระบบ frontend ต้องมี route สำคัญ:

- Public: `/`, `/e/:eventSlug`, `/e/:eventSlug/register`, `/privacy-policy`, `/terms-of-service`, `/verify`, `/verify/:verificationId` เฉพาะ compatibility
- Public displays: `/public/report`, `/public/dashboard`, `/public/lucky-draw`
- Self-service: `/kiosk/join`, `/self-register`
- Admin/staff: `/dashboard`, `/workspace`, `/workspace/events/:eventId`, `/profile`
- Admin only: `/settings`, `/admin`, `/registration-points`, `/admin/cron-status`, `/admin/sessions`
- Event admin: `/admin/events`, `/admin/events/new`, `/admin/events/migration`, `/admin/events/:eventId/dashboard`, `settings`, `layouts`, `participants`, `lucky-draw`, `donations`
- Staff/kiosk: `/staff`, `/kiosk`, `/select-point`, `/staff/select-point`
- User account: `/user/login`, `/user/verify-otp`, `/user/home`, `/user/profile`, `/user/security`, `/user/line/link`, `/user/line/callback`
- LIFF: `/liff/wallet`, `/liff/ticket`, `/liff/certificate`, `/liff/profile`, `/liff/pay`
- Wallet/certificate/vendor: `/wallet`, `/guest-wallet/:token`, `/guest-wallet`, `/wallet/pay`, `/wallet/payment-status/:idempotencyKey`, `/vendor/dashboard`, `/certificate/download`; guest/certificate credential ใช้ URL fragment แล้วถูกล้างทันที

Frontend requirements:

- Protected routes ต้อง redirect ไป login พร้อม state.from
- Role check ต้องให้ superadmin ผ่านทุก route
- User ที่ `mustChangePassword` ต้องถูกบังคับเปลี่ยนรหัสผ่าน
- API wrapper ต้องส่ง `X-CSRF-Token` สำหรับ unsafe methods
- หน้า `/` ต้องเรียก current-public-event discovery ก่อนโหลด field/package และทุก registration write ต้องส่ง canonical `eventSlug` หรือ `eventId`
- หาก route/query/body ส่ง `eventId`, `eventSlug`, `eventYear` มากกว่าหนึ่งค่า ทุกค่าต้องตรงกับ Event เดียวกัน ไม่เช่นนั้นต้อง reject 400
- Kiosk/scoped token ต้องแนบเฉพาะ endpoint ที่จำเป็น
- Session refresh ต้องทำงานข้าม tab และ logout ทุก tab เมื่อ 401

### 21.1 Event Workspace Entry UI

ระบบ frontend ต้องมีหน้าหรือ component สำหรับช่วง `กำลังเข้าสู่ระบบจัดการ Event` เพื่อทำให้การเข้าสู่พื้นที่จัดการของแต่ละ Event ชัดเจนและป้องกันการโหลดข้อมูลผิด context

ตำแหน่งที่ต้องใช้:

- หลัง login เมื่อระบบกำลังเลือก Event อัตโนมัติ
- เมื่อผู้ใช้กดเข้า Event จาก `/workspace`
- เมื่อเปิด `/workspace/events/:eventId`
- เมื่อเปิด `/admin/events/:eventId/*` โดยตรงจาก URL
- เมื่อสลับ Event จาก workspace switcher
- เมื่อ session refresh แล้วต้องโหลด context ของ Event ใหม่

UI Requirements:

- แสดงโลโก้ Event แบบหมุนหรือ loading animation
- แสดงชื่อ Event แบบชัดเจน เช่น `กำลังเข้าสู่ระบบจัดการของ Event: {eventName}`
- แสดง subtitle สั้น ๆ เช่น `กำลังโหลดสิทธิ์ เมนู และข้อมูลล่าสุด`
- แสดง fallback skeleton หรือ progress state หากต้องโหลด dashboard summary เพิ่ม
- รองรับสถานะ loading, success, forbidden, not found, network error และ timeout
- ถ้าไม่มี logo ให้ใช้ fallback logo ของระบบ แต่ข้อความยังต้องแสดงชื่อ Event ที่ได้จาก backend
- ห้ามใช้ข้อความอธิบาย feature ยาว ๆ บน loading screen
- Animation ต้องหยุดหรือเปลี่ยนเป็น error state เมื่อโหลดล้มเหลว

Event Context State Requirements:

- ต้องมีตัวแปร context กลาง เช่น `activeEvent`, `activeEventId`, `activeEventPermissions`, `activeEventFeatures`
- Context ต้องถูก set จากข้อมูล backend ไม่ใช่จาก localStorage เพียงอย่างเดียว
- localStorage/sessionStorage ใช้เก็บ last selected event ได้ แต่ต้อง validate กับ backend ทุกครั้ง
- เมื่อ `eventId` ใน URL เปลี่ยน ต้อง clear state เดิม เช่น participant list, filters, dashboard cache, selected prize, selected donation
- Query params ของทุก API ใน workspace ต้องรวม `eventId`
- Component ใดที่ไม่มี `eventId` ต้องแสดง state ให้เลือก Event ก่อน ไม่ควรเรียก API แบบ global

Workspace Header Requirements:

- Header ต้องแสดงชื่อ Event, eventYear, status, organization/series และ public URL
- ต้องแสดง badge สถานะ เช่น draft, published, registration_open, registration_closed, event_day, archived
- ต้องแสดง feature badges เช่น registration, donations, packages, luckyDraw
- ต้องมีปุ่มกลับไป Event picker หรือ switch event
- ต้องมี quick actions ตามสิทธิ์ เช่น publish, open registration, close registration, preview public page
- Quick actions ที่เปลี่ยนสถานะต้องมี confirmation และเรียก API ที่ audit ได้

Role-based Menu Requirements:

- Superadmin/Admin เห็นทุกเมนูที่เปิดตาม permission
- Org admin เห็นเฉพาะ Event ใน organization ของตน
- Event admin/manager เห็นเฉพาะ Event ที่ได้รับมอบหมาย
- Staff เห็นเฉพาะ dashboard/check-in/register tools ที่เกี่ยวข้อง
- Auditor เห็น read-only dashboard/report/audit
- Kiosk ไม่ควรเข้า Event Admin Shell ปกติ แต่ใช้ kiosk route/scoped token

Error/Edge Case Requirements:

- ถ้า Event ถูกลบหรือไม่มีแล้ว ให้แสดง `ไม่พบ Event นี้` และกลับไป Event picker
- ถ้า Event ถูก archived ให้แสดง read-only banner
- ถ้า user ถูก revoke permission ระหว่างใช้งาน ให้ redirect ไป unauthorized และล้าง event context
- ถ้า network fail ให้ retry ได้โดยไม่ duplicate action
- ถ้า API 401 ต้อง logout ตาม session policy
- ถ้า API 403 ต้องไม่ fallback ไป Event อื่น

Acceptance Criteria:

- เปิด `/admin/events/:eventId/participants` แล้ว request list participants ต้องส่ง `eventId`
- เปิด `/admin/events/:eventId/lucky-draw` แล้ว prize draw ต้องส่ง `eventId` หรือ query ที่ backend resolve ได้
- สลับ Event แล้วข้อมูล participant/donation/prize เดิมต้องหายจากหน้าก่อนโหลดข้อมูลใหม่
- Loading screen ต้องปรากฏก่อนเข้า workspace อย่างน้อยในกรณี deep link หรือ switch event
- Loading screen ต้องใช้ชื่อ Event จาก API response ไม่ใช่ค่าที่ user แก้ใน URL เอง
- ถ้าไม่มีสิทธิ์ Event ต้องไม่เห็นเมนูหรือข้อมูลบางส่วนก่อนโดน redirect

## 22. Security Requirements ขั้นสูง

### 22.1 Transport และ Headers

- Production ต้องใช้ HTTPS เท่านั้น
- HSTS ต้องเปิดใน production
- Helmet ต้องเปิด frameguard, noSniff, referrer policy, object-src none
- CSP production ต้องลด `unsafe-inline` และ `unsafe-eval` ให้มากที่สุด
- CORS ต้องใช้ allowlist เท่านั้น ห้ามใช้ `*` ใน production

Implementation Status:

- แก้แล้ว: Production CSP เอา `unsafe-inline` และ `unsafe-eval` ออกจาก `script-src` แล้ว โดยยัง allow Cloudflare Turnstile script/frame และคง dev-only exception สำหรับ Vite/local development
- ยังต้องตรวจตอน deploy จริง: หาก frontend/backend แยก domain ต้องตั้ง `connect-src`/CORS ให้ตรง domain production และตรวจ report-only CSP ก่อน enforce แบบเข้มกว่าเดิม

### 22.2 Authentication และ Session Security

- JWT secret ต้องยาวและ random อย่างน้อย 256-bit
- Session token ต้องเก็บเฉพาะ hash ใน DB
- Cookie ต้อง `HttpOnly`, `Secure`, `SameSite=Lax/Strict` ตาม deployment
- CSRF ต้องใช้ signed double-submit token
- Session ต้องมี idle timeout, absolute timeout, revoke, refresh rotation และ previous token grace
- จำกัด active sessions ต่อ user
- Login/reset/session endpoints ต้อง rate limit ต่อ IP และต่อ account
- Participant JWT/session ต้องมี tokenVersion หรือ issuedAt เพื่อตรวจ `lastLogoutAt`
- Email OTP login ของ participant ต้องใช้ generic response และ rate limit ต่อ email/IP
- LINE Login/LIFF login ต้อง verify ID token ฝั่ง backend และตรวจ audience/issuer/expiry/nonce

### 22.3 Authorization

- ใช้ permission matrix ร่วมกับ role
- ทุก endpoint ที่อ่าน/แก้ event data ต้องตรวจ event scope
- Staff ต้องถูกจำกัดด้วย registration point scope
- Kiosk/self-register ต้องเป็น scoped token เท่านั้น
- Superadmin action ต้องแยกจาก admin action และมี MFA/OTP
- ห้ามใช้ frontend role guard เป็น security control หลัก ต้องตรวจที่ backend เสมอ

### 22.4 Data Protection

- Sensitive participant fields และ quasi-identifiers เช่น `department`,
  `dept`, `date_year`, national/citizen ID ต้องเข้ารหัส AES-256-GCM ด้วย key ring
- Donation sensitive fields ต้องเข้ารหัสเช่นเดียวกัน
- ค้นหาข้อมูล encrypted ต้องใช้ blind index/search token
- Dashboard/report ที่ต้อง group quasi-identifier ต้อง aggregate หลัง authorized
  decrypt พร้อม audit หรือใช้ approved protected aggregate projection
  ห้ามคง plaintext field index เพื่อความสะดวก
- `DATA_BLIND_INDEX_SECRET` ต้อง stable และแยกจาก encryption key ได้
- Key rotation ต้องมี dry-run, apply, audit และ backup ก่อนเสมอ
- `E2EE_STRICT_MODE` ต้อง fail-closed เมื่อ backend พยายาม decrypt
- ห้ามประกาศว่าเป็น true E2EE ถ้า backend ยังถือ decrypt key

### 22.5 Audit และ Logging

- Action สำคัญต้อง audit: login, bot block, create/update/delete admin, role change, event publish/status, participant export, donation summary, prize draw, key rotation, session revoke
- Sensitive audit ต้องเก็บ metadata-only ไม่เก็บ PII plaintext
- Audit log ต้องมี TTL อย่างน้อยตาม policy เช่น 365 วัน หรือไม่น้อยกว่าที่กฎหมายกำหนด
- Strict sensitive audit ใน production ควรเปิด `SENSITIVE_AUDIT_STRICT=true`
- Error response ต้องไม่ leak stack trace ใน production

### 22.6 Privacy และ PDPA

- ต้องเก็บ consent status และ consent version ต่อ event
- ต้องมี privacy notice และ terms
- ต้องรองรับ right to access, rectify, erasure, portability
- Export ต้องจำกัดสิทธิ์และ audit
- Public report/dashboard/lucky draw ต้อง mask หรือ aggregate เท่านั้น
- Data retention ต้องกำหนดและมี workflow ลบ/เก็บย้อนหลังหลังจบกิจกรรม

### 22.7 Anti-abuse

- Turnstile ต้องใช้กับ login, public registration, public donation, reset request ตามความเหมาะสม
- Turnstile token ต้อง verify ฝั่ง backend ทุกครั้ง; client-side widget เพียงอย่างเดียวไม่ถือว่าผ่าน bot protection
- Token ต้องใช้ได้ครั้งเดียวและมีอายุสั้นตามผู้ให้บริการ; retry หลัง timeout ต้องสร้าง token ใหม่ ยกเว้น idempotent replay ที่ backend พบผลสำเร็จเดิมก่อน consume token
- Backend ต้องตรวจ `action` แบบ exact match และตรวจ `hostname` อยู่ใน `TURNSTILE_ALLOWED_HOSTNAMES`; production ต้อง fail startup เมื่อ secret หรือ hostname allowlist ที่จำเป็นขาด
- แต่ละ action ต้องสร้าง widget/token แยกต่อ request ห้าม reuse token ข้าม `login`, `register`, `kiosk_register`, `donation_create`, `public_slip_upload`, `resend_ticket` และ `registration_reuse`
- Token, response payload จาก Siteverify, IP เต็ม และ request config ห้ามอยู่ใน application/audit log; log ได้เฉพาะ action, error code และสถานะ metadata ที่จำเป็น
- Public write endpoints ต้อง rate limit
- Generic response ต้องใช้กับ reset password, resend ticket, reuse OTP เพื่อลด enumeration
- Wallet payment ต้องมี idempotency key และ anti-replay
- Webhook ต้อง verify signature
- OAuth/LINE callback ต้องใช้ state และ nonce
- LIFF token ห้ามเก็บถาวรใน localStorage
- Account unlink/re-link/logout-all ต้องใช้ step-up OTP และ audit

### 22.8 File Upload Security

- ตรวจ file size, extension, mimetype และ magic bytes
- Random filename
- ห้าม serve dotfiles/index
- ตั้ง `X-Content-Type-Options: nosniff`
- Image upload production ควรทำ malware scan หรือใช้ storage service policy

### 22.9 Secrets และ Environment

Production ต้องตั้งอย่างน้อย:

- `JWT_SECRET`
- `SESSION_TOKEN_HASH_SECRET`
- `CSRF_SECRET`
- `DATA_ENCRYPTION_KEYS`
- `DATA_ENCRYPTION_KEY_ID`
- `DATA_BLIND_INDEX_SECRET`
- `FIELD_ENCRYPTION_ENABLED=true`
- `AUDIT_LOG_RETENTION_DAYS`
- `SENSITIVE_AUDIT_STRICT=true`
- `SESSION_IDLE_TIMEOUT`
- `SESSION_ABSOLUTE_TIMEOUT`
- `SESSION_REFRESH_THRESHOLD`
- `CORS_ORIGIN`
- `COOKIE_SECURE=true`
- `COOKIE_SAME_SITE`
- Turnstile keys, Brevo Email API key, SMTP fallback credentials, LINE secrets, Google OAuth client ID

Secret Classification Requirements:

- `config`: ค่าที่ไม่เป็นความลับ เช่น `NODE_ENV`, feature flags, public URL, frontend public keys ที่ตั้งใจเปิดเผยได้; `PORT` ใช้กำหนดได้เฉพาะ local/runtime ที่รองรับ แต่ Cloud Run ต้องให้ platform inject เอง
- `secret`: ค่าที่ใช้ยืนยันตัวตน/ลงนาม/เชื่อมต่อบริการ เช่น JWT secret, session hash secret, CSRF secret, Brevo API key, SMTP fallback password, LINE secret, OAuth client secret, database password, vendor QR secret, slip proof secret, Turnstile secret
- `key material`: encryption key, wrapped data key, blind-index secret และ private signing key ต้องถือเป็นระดับสูงกว่า secret ทั่วไป
- Production ห้ามเก็บ `secret` หรือ `key material` แบบ plaintext ใน git, image, frontend bundle, logs, error response หรือ migration output
- `.env` ใช้ได้เฉพาะ local/dev หรือ temporary staging เท่านั้น Production ต้องใช้ Secret Manager, platform secret injection หรือ workload identity ที่ตรวจ audit ได้

### 22.10 Secret Manager Promotion และ Runtime Secret Loading

ระบบต้องรองรับการนำ secrets ที่อยู่ใน `.env`/deployment config ขึ้น Google Secret Manager หรือ secret manager ที่เทียบเท่า โดยไม่ต้องแก้ business logic ของระบบ

Secret Manager Scope:

- ต้องรองรับ Google Secret Manager เป็น default provider สำหรับ production
- ต้องรองรับ fallback `env` provider สำหรับ local/dev/test โดยปิด fallback ใน production เว้นแต่มี break-glass approval
- ต้องกำหนด conceptual namespace ตาม environment เช่น `psevent/dev/JWT_SECRET`; เนื่องจาก Google Secret ID ใช้ `/` ไม่ได้ implementation ต้อง map เป็นชื่อจริง เช่น `psevent-dev-JWT_SECRET`
- ต้องแยก service account ต่อ environment และให้สิทธิ์แบบ least privilege เฉพาะ secret ที่ workload นั้นต้องอ่าน
- ห้ามใช้ default service account ที่มีสิทธิ์กว้างเกินจำเป็นกับ production workload
- Secret ที่เป็น database credential ต้องใช้ dedicated database user ตาม role เช่น app writer, migration runner, readonly/reporting
- Secret Manager ต้องใช้ versioning และ rotation workflow ไม่แก้ค่าเดิมทับแบบไม่มีประวัติ
- Production ห้าม bind กับ `latest` โดยตรงสำหรับ secret สำคัญ เช่น DB password, JWT secret, KMS wrapped data keys; ให้ pin เป็น version resource name หรือ rollout เป็น staged alias/config ที่ rollback ได้

Runtime Loading Requirements:

- Backend ต้องมี `secretProvider` abstraction เช่น `env`, `google_secret_manager`, `file_for_test`
- Secret load ต้องเกิดตอน boot หรือ warm-up แล้ว cache ใน memory ตาม TTL ที่กำหนด เช่น 5-15 นาที ไม่เรียก Secret Manager ทุก request
- ต้อง fail-closed ถ้า production เปิด `SECRET_MANAGER_ENABLED=true` แต่ secret สำคัญโหลดไม่ได้
- ต้อง mask secret values ใน log ทุกกรณี แสดงได้เฉพาะ secret name, version, checksum prefix ที่ไม่ย้อนกลับเป็นค่าเดิมได้ และ audit correlation id
- ต้องมี secret access audit event สำหรับ boot, reload, rotation, failure แต่ไม่บันทึก payload
- ต้องรองรับ hot reload แบบปลอดภัยเฉพาะ secret ที่ rotate ได้โดยไม่ทำให้ session/transaction พัง เช่น Brevo/SMTP/LINE token; ส่วน JWT/session/encryption ต้องใช้ staged rotation
- ต้องมี startup validation ว่า secret จำเป็นครบ เช่น JWT, CSRF, session hash, DB, encryption, Turnstile, LINE, Brevo/SMTP ตาม feature flags ที่เปิด

Secret Rotation Requirements:

- JWT/session secrets ต้องรองรับ rotation แบบ dual-read/single-write ชั่วคราว เช่น `JWT_SECRET_ACTIVE`, `JWT_SECRET_PREVIOUS[]`, `JWT_SECRET_PREVIOUS_EXPIRES_AT`
- CSRF/session hash/vendor QR/slip proof secrets ต้องมี grace window หรือ forced invalidation policy ที่ชัดเจน
- Database password rotation ต้องทำแบบ create new DB user/password -> add secret version -> deploy canary -> shift traffic -> revoke old user -> disable/destroy old secret version
- LINE/Brevo/SMTP/OAuth secret rotation ต้องมี canary test ก่อน rollout
- DATA encryption key rotation ต้องไม่ใช้ secret rotation ธรรมดา ต้องใช้ key rotation/re-encryption job พร้อม dry-run, backup และ audit
- ต้องมี rollback plan เมื่อ secret version ใหม่ใช้ไม่ได้ โดยไม่ใช้ `latest` แบบ immediate rollout ใน production
- ต้องมี policy disable old secret version ก่อน destroy และรอ observation window ตามความเสี่ยง

Cost Control Requirements:

- Secret Manager access operation ต้องเกิดเฉพาะ boot/reload/rotation ไม่เกิดทุก API request
- ต้องเพิ่ม `SECRET_MANAGER_MAX_DAILY_ACCESS_OPS` และ alert เมื่อ access ops สูงผิดปกติ
- ต้องจำกัด active secret versions เช่น ไม่เกิน 2-3 active versions ต่อ secret หลัง rotation window
- ต้องรวม Secret Manager เข้า monthly cost report เดียวกับ KMS/Firestore/Cloud SQL
- Acceptance: staging load test ต้องพิสูจน์ว่า Secret Manager access อยู่ในงบและไม่ทำให้ latency ของ request ปกติเพิ่มขึ้น

Implementation Status:

- แก้แล้ว: เพิ่ม `secretProvider` abstraction สำหรับ `env`, `google_secret_manager`, `file_for_test`, boot-time hydration ก่อนโหลด app, memory cache 5-15 นาที, env fallback policy และ masked status
- แก้แล้ว: เพิ่ม startup validation ตาม feature flag, production fail-closed, placeholder/minimum-length check, secret-separation check และ pinned-version enforcement
- แก้แล้วบางส่วน: เพิ่ม startup audit `SECRET_PROVIDER_BOOT`, public readiness แบบไม่เปิดเผย secret detail และ `SECRET_MANAGER_MAX_DAILY_ACCESS_OPS`; ตัวนับยังเป็น per-process และยังไม่ตรวจ active version count จาก provider
- แก้แล้ว: เพิ่ม runbook สำหรับ promotion, IAM, rotation, rollback, KMS, break-glass และ cost ที่ `docs/SECRET_MANAGER_RUNBOOK.md`
- ยังต้องทำใน environment จริง: สร้าง Google secrets/version, pin production version, ตั้ง least-privilege IAM, Cloud Audit Log, Budget Alert และนำ plaintext production secret ออกจาก deployment เดิม
- ยังต้องทำก่อน rotate JWT: เพิ่ม dual-read/single-write signing-key rotation; ปัจจุบันใช้ rolling restart ได้เฉพาะ secret ที่ไม่กระทบ session continuity

### 22.11 Google KMS, Firestore และ Cost Guardrail

ระบบสามารถใช้ Google Cloud KMS และ Firestore ได้ แต่ต้องออกแบบแบบ cost-aware โดยตั้งเป้าใช้จ่ายรวมส่วนนี้ไม่เกิน 1,000 บาทต่อเดือน ยกเว้นผู้ดูแลอนุมัติเป็นลายลักษณ์อักษร

Google KMS Requirements:

- ใช้ KMS สำหรับ envelope encryption หรือ key wrapping เท่านั้น ไม่ควรเรียก KMS ทุกครั้งที่อ่าน/เขียน field ผู้เข้าร่วม
- Source of truth ของข้อมูล event, participant, wallet และ transaction ยังอยู่ที่ MongoDB เว้นแต่มี migration plan ชัดเจน
- ใช้ key protection level แบบ `SOFTWARE` เป็นค่าเริ่มต้น ห้ามใช้ HSM หรือ External Key Manager โดยไม่อนุมัติงบ
- ใช้ key ring/key ตาม environment เช่น `psevent-prod-data-key` และจำกัด active key versions ไม่เกิน 2-3 versions ต่อ environment
- Backend ต้อง cache unwrapped data key ใน memory ตาม TTL สั้น ๆ เช่น 5-15 นาที เพื่อลด KMS cryptographic operations
- Key rotation ต้องทำตาม batch/job พร้อม audit ไม่ทำ rotation ระหว่าง peak event
- ต้องมี fallback fail-closed ถ้า KMS ใช้งานไม่ได้และระบบจำเป็นต้อง decrypt ข้อมูลอ่อนไหว
- ต้องเปิด audit log สำหรับ key usage และ alert เมื่อ usage สูงผิดปกติ

Firestore Requirements:

- Firestore เป็น optional realtime layer เท่านั้น เช่น vendor dashboard live status, payment status mirror, queue/progress, notification delivery state หรือ event display state
- ห้ามใช้ Firestore เป็น ledger หลักของ wallet balance หรือ transaction settlement หากยังไม่มี consistency model และ reconciliation job
- เอกสาร realtime ต้องเป็นข้อมูลขั้นต่ำ เช่น `transactionId`, `vendorId`, `amount`, `status`, `serverTime`, `expiresAt` และห้ามเก็บ PII เต็ม
- Dashboard ร้านค้าต้อง subscribe เฉพาะ vendor/event ของตนเอง พร้อม query limit, pagination และ unsubscribe เมื่อปิดหน้า
- ห้ามเปิด listener แบบ collection-wide สำหรับทุก transaction ของ event
- ต้องตั้ง TTL หรือ cleanup job สำหรับเอกสาร ephemeral เช่น payment status/slip mirror หลัง 24-72 ชั่วโมง โดยประเมินค่า delete operation ด้วย
- ต้องกำหนด composite index เท่าที่ใช้จริง ห้ามสร้าง index กว้างโดยไม่จำเป็น
- ต้องมี rules/service-account boundary ที่แยก admin backend writer กับ client reader ให้ชัดเจน

Cost Control Requirements:

- ตั้ง Google Cloud Budget alert ที่ 500, 800 และ 1,000 บาทต่อเดือน
- ตั้ง daily usage guardrail ใน application config เช่น `FIRESTORE_MAX_DAILY_WRITES`, `FIRESTORE_MAX_DAILY_READS`, `KMS_MAX_DAILY_CRYPTO_OPS`
- ถ้า usage เกิน threshold ระบบต้องปิด feature optional เช่น realtime mirror/push status แต่ transaction หลักใน MongoDB ต้องยังทำงานได้
- ต้องมี monthly cost report แยก KMS, Firestore read/write/delete/storage/network
- ค่า KMS ต้องคุมด้วยจำนวน key versions และจำนวน cryptographic operations ไม่ใช่สร้าง key ต่อ Event
- ค่า Firestore ต้องคุมด้วย listener scope, cache, pagination, TTL และการไม่เขียน event log ทุก field ลง Firestore
- Acceptance: staging load test ต้องประมาณจำนวน reads/writes/KMS ops ต่อวัน และพิสูจน์ว่างบคาดการณ์ไม่เกิน 1,000 บาท/เดือนสำหรับ load ปกติ
- Pricing reference ต้องตรวจซ้ำก่อน production: Google Cloud KMS Pricing (`https://cloud.google.com/kms/pricing`), Firestore Pricing (`https://cloud.google.com/firestore/pricing`), Secret Manager Pricing (`https://cloud.google.com/secret-manager/pricing`) และ Cloud SQL Pricing (`https://cloud.google.com/sql/pricing`)

Implementation Status:

- แก้แล้วบางส่วน: เพิ่ม application guardrail สำหรับ `KMS_MAX_DAILY_CRYPTO_OPS`, `FIRESTORE_MAX_DAILY_READS`, `FIRESTORE_MAX_DAILY_WRITES`, `FIRESTORE_MAX_DAILY_DELETES` และ budget default `GOOGLE_CLOUD_MONTHLY_BUDGET_THB=1000`
- แก้แล้วบางส่วน: เพิ่ม KMS data-key bootstrap/cache ผ่าน `KMS_DATA_KEY_ENABLED=true`, `KMS_KEY_RESOURCE`, `KMS_WRAPPED_DATA_KEYS`, `KMS_DATA_KEY_CACHE_TTL_MS` โดย fail-closed หากเปิด KMS แล้ว unwrap key ไม่สำเร็จ
- แก้แล้วบางส่วน: เพิ่ม Firestore optional mirror สำหรับ payment status หลัง MongoDB transaction commit ผ่าน `FIRESTORE_MIRROR_ENABLED=true` โดยไม่ใช้ Firestore เป็น ledger หลัก
- ยังต้องทำก่อน production: ตั้ง Google Cloud Budget alert จริงใน console, เปิด audit log ของ Cloud KMS, ตั้ง Firestore TTL policy/rules/service account และทำ staging load test เพื่อยืนยันต้นทุนจริง

### 22.12 Hybrid Structured DB, MariaDB/MySQL และ NoSQL Coexistence

ระบบปัจจุบันใช้ MongoDB/Mongoose เป็น source of truth หลัก แต่ requirement ระยะต่อไปต้องรองรับ Structured DB สำหรับข้อมูลที่ต้องการ relational integrity, transaction, settlement, reporting และ reconciliation โดยไม่ทำ big-bang migration

Important Provider Constraint:

- Phase 1 เลือก MariaDB ที่ให้บริการอยู่บน Plesk เป็น Structured DB target แล้ว โดย Cloud Run backend เป็นผู้เชื่อมต่อ; Plesk web gateway ห้ามเชื่อม DB โดยตรง
- Plesk MariaDB ยังเป็น optional reporting mirror และต้องคงปิดจนกว่า remote access/TLS/encrypted storage/backup/static egress/cost acceptance ผ่าน
- ถ้าใช้ Google Cloud SQL ให้ใช้ Cloud SQL for MySQL เป็น managed relational option เพราะ Cloud SQL รองรับ MySQL/PostgreSQL/SQL Server ไม่ใช่ MariaDB โดยตรง
- ถ้าต้องการ MariaDB แท้ ต้องใช้ self-managed MariaDB, VM/container, on-prem, หรือ managed provider อื่น และต้องมี operational owner ชัดเจน
- Application SQL layer ต้องใช้ SQL ที่เข้ากันได้กับ MySQL/MariaDB เท่าที่ทำได้ และ CI ต้องทดสอบ dialect ที่เลือกจริง
- ห้ามเรียกระบบว่า migrated to MariaDB production จนกว่าจะมี schema, migration, dual-write validation, rollback และ backup restore test ผ่านครบ

Data Ownership Target:

ข้อมูลที่ควรย้าย/ทำ mirror เข้า Structured DB:

- `organizations`, `event_series`, `events`: ใช้ relational key สำหรับ tenant hierarchy, event scope, status, date, slug uniqueness
- `participants_core`: participant id mapping, event id, status, HMAC ของ qrCode, registrationType, registeredAt, checkedInAt, consent metadata
- `participant_identity`: email hash/blind index, LINE link metadata, auth provider metadata โดยไม่เก็บ PII plaintext ที่ไม่จำเป็น
- `wallets`, `wallet_ledger_entries`, `transactions`: coin/coupon balance, ledger, idempotency, reversal/refund, settlement
- `vendors`, `vendor_menu_items`, `vendor_settlements`: vendor ownership, pricing policy, menu, QR version, payout summary
- `donations`, `packages`, `package_items`, `package_stock_movements`, `receipts`: donation/order/stock/receipt counter ที่ต้องใช้ relational constraints
- `audit_events_metadata`: metadata-only audit ที่ใช้ query/report บ่อย อาจเก็บคู่กับ NoSQL log archive
- `outbox_events`: event-driven sync จาก SQL ไป NoSQL/realtime/notification

ข้อมูลที่ควรคงไว้ใน NoSQL หรือ object storage:

- Dynamic participant `fields` และ encrypted payload ที่ shape แตกต่างกันตาม Event
- Layout builder, landing blocks, templates, feature config และ version snapshots
- Session/OTP/guest token ที่มี TTL สูงและไม่ต้อง join หนัก
- Firestore realtime mirror เช่น payment status/slip state ที่อายุสั้น
- Upload files, slip images, certificate PDFs, ticket assets ต้องไป object storage ไม่ใช่ SQL blob
- Raw audit archive หรือ diagnostic logs ที่มี schema เปลี่ยนง่าย

Canonical ID และ Mapping Requirements:

- ทุก entity ที่ migrate ต้องมี `mongoObjectId`/`legacyId` และ `sqlId` mapping ชัดเจน
- Public API ต้องไม่ expose sequential SQL id ถ้าเสี่ยง enumeration ให้ใช้ opaque public id หรือ signed token
- Foreign key ใน SQL ต้องอ้าง `sqlId` ภายใน แต่ external references ระหว่างระบบในช่วง migration ใช้ mapping table
- ต้องเก็บ `sourceSystem`, `schemaVersion`, `migratedAt`, `lastSyncedAt`, `syncChecksum`, `syncStatus`
- ต้องมี idempotency key ใน migration/upsert ทุก table เพื่อรันซ้ำได้

Structured Schema Requirements:

- Monetary/coin/coupon amount ต้องใช้ integer minor unit หรือ decimal ที่กำหนด scale ชัดเจน ห้ามใช้ float
- Wallet ledger ต้องเป็น append-only; ห้ามแก้รายการเดิมยกเว้นเพิ่ม reversal/refund entry
- Balance cache ต้อง derive ได้จาก ledger และต้องมี reconciliation job เทียบ balance cache กับ ledger
- Receipt number/counter ต้องใช้ SQL transaction/row lock หรือ atomic sequence table และ unique constraint ต่อ event
- Donation package stock ต้องใช้ stock movement ledger และ constraint กัน sold เกิน stock
- Event slug และ public/non-secret identifier ต้องมี unique constraints ตาม event scope ที่ถูกต้อง; qrCode, vendor qrCodeId และ idempotencyKey ใน SQL mirror ต้องใช้ domain-separated HMAC ก่อนเข้า unique constraint
- Soft delete ต้องใช้ `deletedAt`, `deletedBy`, `deleteReason` และ default query ต้องไม่ดึงรายการที่ถูกลบ
- PII ใน SQL ต้อง encrypted หรือ tokenized ตาม policy; search ใช้ blind index ไม่ใช้ plaintext full email/phone/name
- Dynamic fields หาก mirror เข้า SQL ให้แยกเป็น `participant_field_values` เฉพาะ field ที่ต้อง report/query บ่อย และเก็บ encrypted JSON ต้นฉบับไว้ใน NoSQL

Hybrid Write Model:

Phase A - Read-only Mirror:

- MongoDB ยังเป็น source of truth
- เพิ่ม migration/backfill job จาก MongoDB ไป SQL แบบ dry-run ก่อน
- เพิ่ม checksum report ต่อ collection/table เช่น counts, per-event totals, wallet balance sum, transaction sum
- API ยังอ่าน/เขียน MongoDB เหมือนเดิม

Phase B - Dual Write with Outbox:

- เขียน MongoDB เป็น primary แล้วสร้าง outbox event ที่ idempotent
- Worker sync ไป SQL พร้อม retry, dead-letter queue และ audit
- Critical flows เช่น wallet payment ต้องไม่ dual-write แบบ best-effort หาก SQL จะกลายเป็น ledger ต้องย้าย transaction boundary ให้ชัดก่อน
- Dashboard/report สามารถอ่าน SQL ได้เมื่อ sync lag อยู่ใน threshold ที่กำหนด

Detailed Live Mirror Requirements:

- Outbox event ต้องเก็บเฉพาะ domain/source reference และ operational metadata ห้าม copy participant fields, donor identity, address, slip, token, credential หรือ raw LINE user ID ลง queue
- Pending event ของ source เดียวกันต้อง coalesce ได้ แต่ update ที่เข้ามาระหว่าง worker processing ต้องไม่สูญหายและต้องมี pending รุ่นถัดไป
- Worker ต้อง claim งานแบบ atomic ด้วย lock token/owner/time, ป้องกัน worker หลาย instance ทำรายการเดียวกัน และกู้ stale lock หลัง timeout
- Worker ต้องอ่าน source version ล่าสุดจาก MongoDB, ใช้ mapper version เดียวกับ backfill และทำ SQL upsert ใน transaction
- Retry ต้องเป็น exponential backoff พร้อม jitter, มี max delay/max attempts และห้าม retry แบบ loop รัวเมื่อ SQL/KMS/network ล่ม
- Parent FK ที่มาช้าต้อง retry; invalid domain, source หาย, mapping/unique ownership conflict ต้อง dead-letter พร้อม error code ที่ไม่บรรจุ PII
- เมื่อรายการ retry กลับเป็น pending แต่มี pending รุ่นใหม่อยู่แล้ว ต้อง mark งานเก่าว่า superseded ไม่ปล่อย processing record ค้างจาก duplicate-key race
- Completed outbox ต้องมี TTL retention; dead-letter ห้าม TTL อัตโนมัติก่อน operator review/replay/retention approval
- Replay ต้อง dry-run default, จำกัด domain/limit, ใช้ explicit write gate สองชั้น, skip เมื่อมี pending รุ่นใหม่ และสร้าง audit log
- ต้องมี superadmin-only status/dead-letter endpoint; ห้ามเปิด source ID, SQL host, credential, query text หรือ business payload
- Public readiness แสดงเฉพาะ `up/down/disabled`; queue counts/error detail แสดงเฉพาะสิทธิ์ `infra:manage`
- เมื่อเปิด outbox ต้องห้าม hard delete mirrored model และใช้ soft delete; bulk write ที่เกิน enqueue limit ต้อง fail ใน strict mode หรือถูกบังคับให้ reconciliation ก่อน shadow read
- `insertMany`/`bulkWrite` ที่ข้าม middleware ต้องถูก block เมื่อเปิด outbox; maintenance import ต้องใช้ tracked write หรือปิดตาม change window แล้ว backfill/reconcile ก่อนเปิดกลับ
- Source write + outbox จะ atomic เฉพาะเมื่อใช้ Mongo transaction/session เดียวกัน; strict hook ของ non-transaction write แจ้ง failure ได้แต่ย้อน source commit ไม่ได้ จึงต้องมี continuous reconciliation เป็น safety net
- Production activation ต้องใช้ `SQL_ENABLED=true`, `SQL_MIRROR_ENABLED=true`, `SQL_OUTBOX_ENABLED=true`, `SQL_PRIMARY_STORE=false`; แนะนำ `SQL_OUTBOX_STRICT=true`
- Worker default ต้อง cost-aware: poll 5 วินาที, batch 25, stale-lock scan แบบ throttle และ tune จาก lag/cost metrics ไม่ลด interval โดยไม่มี approval
- Shutdown ต้องหยุดรับ HTTP, หยุด outbox poll, รอ active cycle แล้วจึงปิด SQL/Mongo connections

Phase C - SQL Primary for Transactional Domains:

- Wallet ledger, receipt, donation package stock, vendor settlement ย้าย transaction boundary ไป SQL
- MongoDB เก็บ mirror สำหรับ frontend compatibility หรือ legacy read เท่านั้น
- ต้องมี feature flag ต่อ domain เช่น `SQL_WALLET_LEDGER_ENABLED`, `SQL_RECEIPT_COUNTER_ENABLED`
- Rollback ต้องรองรับกลับไป MongoDB primary เฉพาะก่อน cutover window หรือใช้ compensating migration หลัง cutover

Phase D - Decommission/Archive:

- เมื่อ domain ใช้ SQL เป็น primary แล้ว ต้อง freeze legacy Mongo writes ของ domain นั้น
- เก็บ archive/read-only snapshot และ retention policy
- ลบ/ลด index MongoDB ที่ไม่จำเป็นหลัง observation period

MariaDB/MySQL Connection Requirements:

- ใช้ connection pool พร้อม max/min/idle timeout และ circuit breaker
- Production ต้องเชื่อมผ่าน private network/Private IP/VPN/Cloud SQL connector เป็นหลัก; Hostatom public endpoint เป็น approved exception เนื่องจากผู้ให้บริการไม่มี TLS และ IP allowlist โดยต้อง pin endpoint และใช้ runtime user สิทธิ์ต่ำ
- Plesk destination คือ `203.170.190.137:3306`; ค่า `localhost:3306` ใน Plesk ใช้ได้เฉพาะ application ที่รันบน host เดียวกันและห้ามนำไปใช้กับ Cloud Run
- ต้องใช้ TLS 1.2+ แบบ verify certificate chain และ server identity สำหรับ DB connection เมื่อออกนอก host เป็นค่าปกติ; approved Hostatom exception วันที่ 2026-08-14 อนุญาต plaintext เฉพาะ `203.170.190.137:3306` เพราะ provider ไม่มี TLS และ IP allowlist
- Production TCP ปกติต้องใช้ `SQL_SSL_MODE=verify_identity`; `required`, `verify_ca` และ unverified TLS flag ยังถูกห้าม ส่วน `disabled` ใช้ได้เฉพาะ approved Hostatom endpoint exception พร้อม least-privilege account
- ต้องตรวจ TLS session หลัง connect ด้วย `Ssl_cipher`; การมี config `ssl` แต่ session ไม่ negotiate TLS ต้อง fail readiness/startup ส่วน Hostatom exception ต้องยืนยันผลเป็น `tcp_plain` และ endpoint ตรงค่าที่ pin
- ถ้า connect ด้วย IP certificate ต้องมี IP SAN ตรง หรือกำหนด `SQL_SSL_SERVERNAME` ให้ตรง DNS SAN; ห้ามปิด hostname verification
- DB credentials ต้องมาจาก Secret Manager และ rotate ได้
- TLS CA ต้องมาจาก Secret Manager logical name `SQL_SSL_CA` version ที่ pin, validate เป็น PEM certificate chain, ปฏิเสธ private key และห้าม trust certificate ที่ดึงจาก endpoint โดยไม่ตรวจสอบ
- Migration runner ใช้ credential แยกจาก app runtime และมีสิทธิ์ DDL เฉพาะช่วง migration
- App runtime ห้ามมีสิทธิ์ `DROP`, `ALTER`, `CREATE USER`, `GRANT`
- ต้องมี statement timeout/query timeout และ slow query logging
- ต้องมี health check แยก read/write และไม่เปิดเผย DB detail ใน public health endpoint

Plesk MariaDB Network Requirements:

- Cloud Run service, SQL transport job และ migration job ต้องใช้ VPC/subnet/egress policy ชุดเดียวกันและ route `all-traffic` เพื่อให้ source IP คงที่จริง
- Direct VPC/Cloud NAT cold start อาจทำให้ connection พร้อมช้า จึงต้อง retry แบบ bounded exponential backoff เฉพาะ transient network error; auth/CA/SAN/TLS failure ห้าม retry จนกลบเหตุหรือ fallback insecure
- Bootstrap static egress ต้องเป็น opt-in และต้องมีทั้ง `SQL_STATIC_EGRESS_ENABLED=true` กับ `CONFIRM_SQL_STATIC_EGRESS=<environment>`
- Bootstrap ต้องสร้าง custom VPC, private Google access subnet, Cloud Router, Cloud NAT และ regional reserved IP แบบ idempotent
- Plesk database access rule, Plesk firewall และ host firewall ต้อง allow เฉพาะ reserved NAT IP `/32`; ห้าม `0.0.0.0/0`, `::/0`, shared office range หรือ Cloud Run dynamic range
- เพราะ `all-traffic` ทำให้ external dependency อื่นเห็น NAT IP เดียวกัน ต้องตรวจ/เพิ่ม source allowlist ของ MongoDB Atlas, Brevo/SMTP fallback และ provider ที่เกี่ยวข้อง พร้อม canary GCS/Secret Manager/KMS/LINE/Turnstile ก่อน promote
- เมื่อเลือก static egress provider ต้องผ่าน positive จาก Cloud Run และ negative จาก source ที่ไม่อยู่ allowlist ก่อนตั้ง `SQL_NETWORK_ALLOWLIST_CONFIRMED=true`; ข้อนี้ไม่ใช้กับ approved Hostatom exception ที่ provider ไม่มี allowlist
- Backend production และ release script ต้อง pin ทั้ง `SQL_HOST` และ `SQL_EXPECTED_HOST` เป็น `203.170.190.137`; การตั้งสองค่าให้ตรงกันแต่เป็น host อื่นต้องถูกปฏิเสธเพื่อป้องกัน endpoint substitution
- Plesk gateway ห้ามมี SQL password, TLS CA, database user หรือ direct database connection string
- หาก hosting plan ไม่รองรับ remote MariaDB หรือ encrypted backup ให้คง SQL ปิด; การไม่มี TLS/IP allowlist ใช้ approved Hostatom exception ได้เฉพาะ endpoint ที่ pin และบัญชี runtime สิทธิ์ต่ำ

Data Encryption Before Storage Requirements:

- PII ที่ต้อง recover ให้ encrypt ด้วย AES-256-GCM/application envelope ก่อน MongoDB write พร้อม random nonce, auth tag, key version และ blind index แยก
- Password ต้องใช้ adaptive one-way hash; OTP, bearer token, guest token, idempotency token และ recovery token ต้องเก็บเฉพาะ keyed hash/HMAC ไม่ใช้ reversible encryption
- SQL mirror ห้ามเก็บ raw participant QR, vendor QR identifier, idempotency key, verification code, receipt number หรือ LINE user ID; ต้อง HMAC-SHA-256 ด้วย dedicated secret ก่อน write
- Blind index ของ email/phone/name ที่รับจาก MongoDB ต้อง validate ว่าเป็น hexadecimal 64 ตัวอักษรก่อน SQL write; malformed/plaintext ต้องหยุด mirror row แบบ fail closed
- หลัง backfill ต้องมี read-only aggregate audit ที่คืนเฉพาะ violation count ไม่ select ค่า protected และต้องใช้ source-to-HMAC reconciliation ปิด false negative จาก legacy value รูปแบบ 64 hex
- `SQL_MIRROR_IDENTITY_HASH_SECRET` ต้อง random อย่างน้อย 256 bit, แยกจาก JWT/session/CSRF/data blind-index key, อยู่ Secret Manager และ rotation ต้องมี reindex/backfill plan
- SQL mirror ห้าม decrypt participant/donor PII จาก MongoDB และห้าม mirror address, slip URL, email, phone หรือชื่อ plaintext
- Structured operational columns ที่จำเป็นต่อ FK/constraint/reconciliation เช่น internal ID, status, timestamp, integer amount และ balance ใช้ typed plaintext ภายใน DB ได้เฉพาะเมื่อ Plesk data directory/tablespace และ backup ถูกเข้ารหัส at rest แล้ว
- ห้าม application-encrypt FK/amount/status แบบ random ciphertext เพราะจะทำลาย constraint/range query; requirement การเข้ารหัสทั้งหมดของข้อมูลเหล่านี้ให้บังคับที่ encrypted storage + encrypted backup layer
- ต้องมี `SQL_AT_REST_ENCRYPTION_CONFIRMED=true` และ `SQL_BACKUP_ENCRYPTION_CONFIRMED=true` จากหลักฐาน provider/restore drill ก่อน production startup
- KMS ใช้ wrap application data keys ได้ แต่ไม่ถือว่าแทน Plesk tablespace/disk encryption; key ของ Plesk backup ต้องมี owner และเก็บแยกจาก backup
- รูป/slip/document ห้ามเก็บเป็น SQL BLOB ให้ใช้ private GCS object, lifecycle และ signed access ตาม object-storage requirement
- Log/audit/outbox/dead-letter ห้ามมี plaintext PII/token/credential/CA/query payload และ public health ห้ามเปิด host/database/user/cipher detail

Plesk MariaDB Activation Flags:

- ค่าเริ่มต้นต้องเป็น `SQL_ENABLED=false`, `VERIFY_SQL_TRANSPORT=false`, `SQL_STATIC_EGRESS_ENABLED=false`, `SQL_NETWORK_ALLOWLIST_CONFIRMED=false`
- เมื่อเปิดต้องมี `SQL_PROVIDER=plesk`, `SQL_HOST=SQL_EXPECTED_HOST=203.170.190.137`; transport ปกติใช้ `SQL_SSL_MODE=verify_identity` กับ `SQL_SSL_CA_SECRET_NAME=SQL_SSL_CA` หรือใช้ approved Hostatom exception ด้วย `SQL_SSL_MODE=disabled`, `SQL_SSL_CA_SECRET_NAME=` และ `SQL_ALLOW_INSECURE_PRODUCTION=true`
- Database name, runtime user และ migration user ต้องมาจาก protected deployment variables และห้าม commit ค่าจริง
- GitHub deployment workflow ต้อง map `SQL_DATABASE`, `SQL_USER`, `SQL_MIGRATION_USER` และ `SQL_SSL_SERVERNAME` จาก Environment variables เข้า release; การตั้งค่าไว้ใน GitHub โดย workflow ไม่ส่งต่อถือว่า activation ไม่สมบูรณ์
- Password, migration password และ mirror HMAC key ต้องมาจาก pinned Secret Manager versions; TLS CA ต้อง pin เมื่อใช้โหมด TLS และไม่สร้าง CA placeholder สำหรับ Hostatom exception
- Runtime service account ห้ามอ่าน `SQL_MIGRATION_PASSWORD`; secret synchronization ต้องถอน runtime IAM binding ที่อาจค้างจากรุ่นเก่าและให้ migration service account อ่านได้เท่านั้น
- Production activation ต้องคง `SQL_PRIMARY_STORE=false`; การเปิด SQL ไม่เท่ากับอนุมัติ wallet/receipt primary cutover
- `VERIFY_SQL_TRANSPORT=true` ต้อง execute read-only Cloud Run Job ก่อน migration/candidate ทุก release ที่ SQL เปิด

Cloud SQL/MySQL Operational Requirements:

- ถ้าใช้ Cloud SQL ต้องใช้ private IP เป็น default ใน production
- ต้องเปิด automated backups, point-in-time recovery ตาม RPO/RTO ของงาน และทดสอบ restore จริง
- Production ที่รับ transaction ระหว่างงานควรใช้ HA/regional instance หากงบอนุมัติ เพราะลด downtime เมื่อ zone/instance fail
- ต้องตั้ง maintenance window นอกช่วง event peak
- ต้องตั้ง storage auto-increase หรือ capacity alert ตามงบ
- ต้องตั้ง Cloud SQL budget alert แยกจาก KMS/Firestore/Secret Manager
- ต้องประเมินว่า Cloud SQL อาจทำให้งบ 1,000 บาท/เดือนเกินได้ง่ายกว่า KMS/Secret Manager/Firestore หากเปิด HA หรือ instance ใหญ่ ดังนั้น Phase แรกควรใช้ staging/small instance หรือ self-managed local MariaDB จนกว่าจะอนุมัติงบ
- Pricing reference ต้องตรวจซ้ำก่อน production: Cloud SQL Pricing (`https://cloud.google.com/sql/pricing`) และ database version support policy (`https://cloud.google.com/sql/docs/db-versions`)

Plesk MariaDB Operational Requirements:

- MariaDB ต้องเปิด `require_secure_transport=ON` หรือ policy ที่เทียบเท่า และ runtime/migration account ต้อง `REQUIRE SSL`
- Runtime account มีเฉพาะ table-level `SELECT/INSERT/UPDATE/DELETE` ที่จำเป็น; migration account แยกและไม่ใช้รับ request ปกติ
- ห้ามใช้ Plesk administrator, server administrator, database owner หรือ phpMyAdmin credential เป็น application credential
- ต้องมี encrypted backup, retention, off-host copy ตาม RPO/RTO และ restore ใน isolated environment จริง
- ต้องตรวจ connection/storage/traffic/backup quota ของ hosting package และกำหนด alert ก่อนช่วง Event peak
- ต้องระบุ maintenance owner, hosting support contact, certificate expiry owner, credential rotation owner และ incident escalation path
- Reserved NAT IP/Cloud NAT มีค่าใช้จ่ายแม้ไม่มี SQL write; planning cap เริ่มต้น `SQL_EGRESS_MONTHLY_BUDGET_THB=250` และต้องรวมใน Google Cloud budget 1,000 บาท
- ก่อน provision ต้องตรวจ `GCS_MONTHLY_BUDGET_THB + SQL_EGRESS_MONTHLY_BUDGET_THB + GOOGLE_CLOUD_CORE_RESERVE_THB <= GOOGLE_CLOUD_MONTHLY_BUDGET_THB`; baseline คือ `650 + 250 + 100 <= 1,000`
- การเปลี่ยน `SQL_STATIC_EGRESS_ENABLED=false` ต้องส่ง `--clear-network` ให้ revision ใหม่อย่างชัดเจนเพื่อไม่คง Direct VPC โดยปริยาย แต่ไม่ลบ VPC/NAT/IP; teardown ต้องมี change approval และยืนยันว่า service/job/revision ที่รับ traffic ทุกตัวไม่ใช้ network แล้ว
- Runbook หลักคือ `docs/PLESK_MARIADB_RUNBOOK.md`

Migration Safety Requirements:

- ทุก migration ต้องเป็น dry-run default และต้องใช้ทั้ง `--apply` กับ explicit write flag เฉพาะงานพร้อมกันจึงจะเขียนจริง; มีเพียง argument หรือ flag อย่างเดียวต้อง fail closed
- ก่อน migration จริงต้องมี MongoDB backup และ SQL backup/snapshot
- Backfill ต้องทำ batch, resumable, idempotent และไม่ล็อก production request นาน
- ต้องมี validation report: count, checksum, orphan FK, duplicate key, null required field, amount totals, wallet ledger sum, receipt uniqueness
- ต้องมี canary event หรือ staging event ก่อนย้าย event production
- ต้องมี dual-read comparison ใน shadow mode ก่อน switch read path
- ต้องมี cutover checklist และ rollback checklist
- ห้ามลบข้อมูล MongoDB หลัง migrate จนกว่าจะผ่าน observation period และ backup restore test
- Cloud Run SQL transport job และ migration job ต้องใช้ immutable image digest และ network config เดียวกับ candidate
- Job definition ต้องถูก execute จริงด้วย `--execute-now --wait`; การ deploy job โดยไม่ execute ห้ามนับว่าผ่าน migration gate
- Transport job ต้อง read-only, task 1, retry 0, timeout จำกัด และ output เฉพาะ `tcp_tls`/verified status โดยไม่มี credential/endpoint detail

Recommended Phase 1 SQL Scope:

- เริ่มจาก read/report mirror: events, vendors, transactions, receipts, donation/package summary
- ยังไม่ย้าย participant dynamic fields และ wallet primary ledger จนกว่า SQL transaction layer, reconciliation และ rollback พร้อม
- ใช้ SQL เพื่อ reporting/settlement ก่อน จะได้ประโยชน์จาก structured query โดยไม่เสี่ยง double spending
- Wallet ledger cutover เป็นเฟสแยก ต้องผ่าน load test concurrent payment ก่อน

Implementation Status:

- แก้แล้ว: เพิ่ม initial relational schema 16 tables ครอบคลุม organization/event, participant core, wallet/coupon/transaction, vendor/menu, receipt, donation summary และ package โดยมี FK/unique/check/index
- แก้แล้ว: เพิ่ม `mysql2` connector/repository layer รองรับ MariaDB/MySQL, TCP TLS, Unix socket, pool/timeout, health/readiness, graceful shutdown และ SQL daily operation guardrail
- แก้แล้ว: เพิ่ม schema migration แบบ dry-run default, checksum, advisory lock, dedicated migration credential และ two-key write gate
- แก้แล้ว: เพิ่ม backfill 10 domains แบบ plan-only/dry-run, batch, high-watermark, resumable checkpoint, idempotent upsert, prefix revalidation, count + aggregate checksum comparison และ PII-minimized mapper
- แก้แล้ว: เพิ่ม Secret Manager loading สำหรับ runtime/migration SQL password, TLS CA และ identity hash secret
- แก้แล้ว: เลือก Plesk MariaDB เป็น target, กำหนด external destination `203.170.190.137`, แยกจาก Plesk-local `localhost:3306` และคง SQL ปิดแบบ fail-safe
- แก้แล้ว: production SQL บังคับ TLS verify identity/TLS 1.2+ เป็นค่าปกติ และรองรับ approved Hostatom plaintext exception แบบ endpoint pin พร้อม encrypted storage/backup confirmationและ least-privilege runtime account
- แก้แล้ว: SQL mapper เปลี่ยน raw QR/idempotency/verification/receipt identifiers เป็น domain-separated HMAC และ fail-closed เมื่อ dedicated key ขาด
- แก้แล้ว: เพิ่ม read-only SQL protection aggregate audit ที่ไม่ดึงค่าจริง เพื่อจับ legacy plaintext ก่อนเปิด mirror read
- แก้แล้ว: deployment script provision optional VPC/Cloud NAT/reserved IP ด้วย explicit cost gate และใช้ network เดียวกันกับ service/transport/migration job
- แก้แล้ว: เพิ่ม read-only transport verification job และทำ migration execution contract ให้ explicit ด้วย `--execute-now --wait`
- แก้แล้ว: SQL startup retry เฉพาะ transient Direct VPC/network failure แบบ bounded; credential/certificate/TLS failure ยังคง fail ทันที
- ตรวจแล้ว: migration รันผ่าน MariaDB 12 จริง, รันซ้ำได้สถานะ `already_applied`, มี 25 FK/13 check constraints และ repository integration 10 domains rollback ผ่าน
- แก้แล้ว: เพิ่ม source-of-truth matrix, migration/rollback/cost plan ที่ `docs/HYBRID_DB_MIGRATION_PLAN.md`
- แก้แล้ว: เพิ่ม outbox/live mirror สำหรับ 10 domains, coalescing, lock/stale recovery, bounded retry, superseded race handling, dead-letter/audit/TTL, dry-run replay, graceful shutdown และ PII-free queue
- แก้แล้ว: เพิ่ม superadmin SQL mirror status/dead-letter API, sync-lag threshold และ public readiness แบบไม่เปิดรายละเอียด
- แก้แล้ว: เพิ่ม migration index สำหรับ incremental transaction reversal repair และใช้ domain registry/mapper ชุดเดียวกับ backfill
- ยังต้องทำ: continuous reconciliation + shadow-read comparison และ staging backfill/outbox canary ด้วยข้อมูลสำเนาจริง
- ยังต้องทำใน environment จริง: ให้ Plesk เปิด remote access/TLS, ส่ง CA/SAN evidence, ยืนยัน at-rest/backup encryption, provision/allowlist NAT IP และทำ restore/load/failover/cost proof; production data ยังไม่ถูก migrate

## 23. Gap และ Risk ที่ต้องปิดก่อน Production

สถานะบั๊กที่ตรวจพบล่าสุด:

1. แก้แล้ว: wallet balance รองรับทั้ง participant bearer token และ guest token ไม่ถูก block ด้วย `participantAuth` ผิดทาง
2. แก้แล้ว: wallet payment resolve participant bearer token หรือ `x-guest-token` ใน backend โดยไม่ใช้ `walletId` จาก client
3. แก้แล้ว: wallet payment ใช้ atomic update กัน coin/coupon ติดลบจาก concurrent request และ reject vendor QR ที่อยู่คนละ Event
4. แก้แล้ว: certificate verification ใช้ schema ปัจจุบัน (`fields`, `qrCode`, `checkedInAt`, `isRevoked`, `isDeleted`) และ audit sensitive decrypt
5. แก้แล้ว: frontend wallet/certificate ใช้ `participant.fields` และ `qrCode` แทน field เก่า `firstName/lastName/ticketCode`
6. แก้แล้ว: frontend raw axios calls ใช้ `API_BASE_URL` เดียวกัน ไม่สร้าง URL แบบ `undefined/api/...`
7. แก้แล้ว: Lucky Draw import `appendQuery` สำหรับ share public link และ lint errors สำคัญถูกปิด
8. แก้แล้ว: upload image ตรวจ allowlist mimetype และ magic bytes สำหรับ admin upload/public slip upload
9. แก้แล้วบางส่วน: role mismatch ระหว่าง frontend event roles กับ backend route ถูกปรับใน participants/prizes/donations/packages ให้ใช้ `requirePermission` เฉพาะ feature route
10. แก้แล้ว: receipt number เปลี่ยนเป็น event-scoped atomic counter และเพิ่ม unique index กัน duplicate receipt ต่อ participant/event
11. แก้แล้ว: Guest token ใหม่เก็บ `tokenHash` แทน plaintext, มี `limitAmount`, `spentAmount`, `revokedAt`, `lastUsedAt` และรองรับ legacy token เดิมระหว่าง migration
12. แก้แล้ว: Guest wallet balance แสดงยอดที่ใช้ได้จริงตาม limit/spent amount ไม่แสดงยอดเต็มของ wallet หลักเมื่อมี limit
13. แก้แล้ว: Wallet transaction เพิ่ม `type`, `idempotencyKey`, `balanceBefore`, `balanceAfter`, `itemBalanceBefore`, `itemBalanceAfter`, `serverTime`, `reversalOf`
14. แก้แล้ว: Wallet payment รองรับ idempotency key, unique per wallet, และมี `GET /api/wallets/payment-status/:idempotencyKey` เพื่อกู้สถานะหลัง API timeout
15. แก้แล้ว: Frontend Wallet/Guest Wallet ส่ง `Idempotency-Key` และลองกู้ payment status เมื่อ request หลุดแบบไม่รู้ผล
16. แก้แล้ว: Vendor model เพิ่ม `pricingMode`, `fixedPrice`, `minAmount`, `maxAmount`, `menuItems` และ backend payment resolve ราคาเองจาก fixed/menu/variable policy
17. แก้แล้ว: Vendor QR รองรับ signed payload รูปแบบ `psevent-vendor:<base64url-json>` พร้อม HMAC signature และยังรองรับ legacy `qrCodeId`
18. แก้แล้ว: เพิ่ม `GET /api/wallets/vendor-quote` ให้ frontend เช็กร้าน/ราคา/เมนูก่อนจ่าย และ Wallet/Guest Wallet รองรับ fixed price/menu selection
19. แก้แล้ว: เพิ่ม migration script `backend/src/scripts/migrate_guest_tokens.js` สำหรับเติม `tokenHash` ให้ guest token เก่าแบบ dry-run default และ unset plaintext หลัง cutover
20. แก้แล้ว: Critical Kiosk bug - `createParticipantByStaff` รองรับ payload object โดยตรง ทำให้ `KioskPage` ส่งข้อมูลลงทะเบียนหน้างานด้วย argument เดียวได้ถูกต้อง
21. แก้แล้วบางส่วน: RegistrationPoint รองรับ event scope, device binding และ kioskPolicy แล้ว พร้อม migration script `npm run migrate:registration-points`; ยังต้องรัน migration จริง, backfill point เก่า และทำ UI เลือก allowedStaff แบบละเอียด
22. แก้แล้วบางส่วน: Onsite registration type แยก `onsite_staff`, `onsite_kiosk`, `self_register` สำหรับรายการใหม่แล้ว และ dashboard/report รองรับค่า legacy `onsite`; ยังต้องทำ migration/backfill ข้อมูลเก่าหากต้องการแยก source ย้อนหลัง
23. แก้แล้วบางส่วน: Participant รองรับ `registeredPointId` และ `registeredPointName` พร้อม migration script `npm run migrate:participant-points`; ยังต้องรัน migration จริงเพื่อ backfill ข้อมูลเก่า
24. แก้แล้ว: เพิ่ม Kiosk Diagnostic endpoint `POST /api/public/kiosk-token/verify`, หน้า `/kiosk/diagnostic`, และ redirect จาก `/kiosk/join` ไปตรวจ readiness ก่อนเข้า kiosk mode
25. แก้แล้ว: Kiosk/self-register scoped token ฝัง event context ที่ validate จาก staff/admin แล้ว และ backend reject หาก client ส่ง eventId/eventYear ไม่ตรง token
26. แก้แล้ว: เพิ่ม OS-level kiosk lock runbook ที่ `docs/KIOSK_LOCK_RUNBOOK.md` ครอบคลุม Windows, macOS, iPad/tablet, pre-event checklist, incident handling และ post-event cleanup
27. แก้แล้วบางส่วน: LINE login/link ต้องใช้ access token, LIFF ID token หรือ OAuth auth code ที่ backend verify กับ LINE แล้วก่อนออก participant token, webhook ตรวจ `X-Line-Signature` ด้วย raw body แล้ว, OAuth state/nonce เก็บ TTL store แล้ว, re-link OAuth callback ใช้ step-up OTP และ `/liff/*` ทำ seamless backend login โดยไม่ log profile/ID token แล้ว; ยังต้องเพิ่ม recovery/support flow กรณี LINE ผูกผิดบัญชี
28. แก้แล้ว: Participant Email OTP login, participant profile endpoint, participant session store, refresh rotation, previous-token grace window, frontend cross-tab sync, revoke current/device/all devices, switch-event, `tokenVersion/lastLogoutAt` และ UI `/user/login`/`/user/home` ถูกเพิ่มแล้ว
29. แก้แล้วบางส่วน: `lineUserId` เปลี่ยนเป็น sparse unique ที่ไม่ default เป็น `null` และ unlink จะ unset field เพื่อลดปัญหา duplicate null index; ระยะยาวยังควรแยก UserIdentity/Account layer เพื่อให้ LINE เดียวผูกหลาย Event ได้ตาม Email-as-master
30. แก้แล้วบางส่วน: Account unlink/re-link LINE ใช้ step-up OTP, OAuth state/nonce และ revoke session/token เดิมแล้ว พร้อมหน้า `/user/security`; ยังต้องเพิ่มหน้ากู้คืนบัญชีกรณี LINE/Email ถูกผูกผิด
31. ยังต้องทำ: LineOA Rich Menu, webhook command, push notification log และ notification preferences ยังต้องออกแบบ/implement
32. ยังต้องทำ: ต้องทำ admin/vendor management UI สำหรับสร้าง vendor, menu, signed QR payload และ vendor ownership
33. ยังต้องทำ: Vendor dashboard ownership/scoped auth และ settlement report ยังต้องเพิ่ม
34. แก้แล้ว: Success slip มี live animation, server time, expiry, nonce, daily theme และ backend verification code แล้ว; เหลือเชื่อม Vendor Dashboard สำหรับตรวจซ้ำแบบ realtime
35. ยังต้องทำ: Coin issuance policy ต้องกำหนดชัดว่า Event ใช้ package quota, follower allowance, top-up หรือ manual grant
36. แก้แล้วในโค้ด: Certificate ใช้ opaque CSPRNG 256-bit ID, POST body, URL fragment, no-store, revoked/invalid state, log redaction และ dry-run migration แล้ว; production ยังต้อง apply backfill 985 records และยืนยัน legacy flag ปิด
37. แก้แล้วบางส่วน: Public/admin upload มี allowlist, magic bytes, decode/re-encode, pixel/size limit, rate limit/Turnstile, private slip, signed URL, GCS abstraction และ migration script แล้ว; production ยังต้องตั้ง bucket/IAM/Budget/migrate ข้อมูลจริง และตัดสิน malware scanner เพิ่มเฉพาะเมื่อรับ file type อื่นหรือ compliance บังคับ
38. แก้แล้วใน utility/test baseline: Event resolver reject ค่าขัดกันระหว่าง route/query/body, ตรวจ eventYear กับ Event, public scoped route ที่ require identity ไม่ fallback และหน้า `/` resolve current Event ผ่าน endpoint ชัดเจน; ยังต้องเพิ่ม HTTP integration matrix ของทุก public route ใน staging
39. แก้แล้วบางส่วน: Dynamic participant fields รองรับ event scope, legacy/global fallback, event override และ script `npm run migrate:participant-fields` แล้ว แต่ production ต้องรัน migration/backfill และตรวจ UI flow สำหรับการสร้าง override ของ field ที่ inherited จาก global
40. แก้แล้ว: Donation delete เป็น Event-scoped transaction + soft delete และคืน package stock แบบ atomic; Package delete เป็น inactive + `deletedAt/deletedBy` โดย list/create donation ไม่ดึงรายการที่ถูกลบแล้ว
41. แก้แล้วบางส่วน: เพิ่ม KMS data-key cache, Firestore optional payment-status mirror และ application cost guardrail แล้ว แต่ production ยังต้องตั้ง Google Cloud Budget alert, KMS audit log, Firestore TTL/rules/service account และ load test ต้นทุนจริงก่อนเปิดใช้
42. แก้แล้ว: CSP production จำกัด `script-src` ไม่ใช้ `unsafe-inline`/`unsafe-eval` แล้ว และ allow เฉพาะ self + Cloudflare Turnstile; dev ยังเปิด exception สำหรับ Vite/local development
43. แก้แล้ว: `RegistrationReuseChallenge` schema รองรับ field ที่ controller ใช้จริงแล้ว (`targetEventId`, `sourceEventId`, `participantId`, `emailHash`, `ref`) เพื่อไม่ให้ reuse OTP verify แล้วหา participant ไม่เจอจาก strict schema drop field
44. แก้แล้วบางส่วน: เพิ่ม automated tests สำหรับ Secret provider, SQL TLS/migration/outbox/PII mapper, GCS cost estimator, signed local URL, image signature/optimization, Event identity no-fallback, certificate entropy/raw-ID rejection, URL log redaction และ Guest Wallet PII omission แล้ว; ยังต้องเพิ่ม HTTP integration tests สำหรับ auth, onsite/kiosk, check-in, export, prize, wallet concurrency, LIFF token exchange, upload routes, vendor pricing และ receipt counter
45. แก้แล้วบางส่วน: มี Secret Manager provider, pinned-version validation, startup audit และ rotation/rollback runbook แล้ว; production secrets/IAM/Audit Log/Budget Alert ยังต้องตั้งใน Google Cloud จริง
46. แก้แล้ว: เพิ่ม `secretProvider` abstraction แยก `env`, `google_secret_manager`, `file_for_test` และโหลดก่อน business modules
47. แก้แล้วบางส่วน: เพิ่ม `SECRET_MANAGER_MAX_DAILY_ACCESS_OPS` และ status แล้ว; active-version inventory, centralized multi-instance metric และ monthly billing report ยังต้องทำ
48. แก้แล้วบางส่วน: มี ERD/schema, SQL connector/repository, dry-run migration, resumable backfill, count/checksum validation, outbox/dead-letter/replay/live mirror และ rollback plan แล้ว; ยังต้องทำ continuous reconciliation, shadow-read mismatch และ staging canary ก่อน shadow read production
49. แก้แล้วด้านการตัดสินใจ: เลือก MariaDB บน Plesk เป็น structured reporting target; ยังต้องให้ provider เปิด secure remote access และผ่าน environment proof ก่อนเปิดใช้งาน
50. แก้แล้ว: กำหนด source-of-truth matrix ใน `docs/HYBRID_DB_MIGRATION_PLAN.md`; ทุก domain ยังใช้ MongoDB primary จนกว่าจะผ่าน cutover gate
51. แก้แล้ว: Receipt duplicate-key fallback ต้อง query ด้วย `participantId + eventId` เพื่อไม่คืนใบเสร็จของคนละ Event และ amount ต้องเป็นเลขไม่ติดลบ
52. แก้แล้ว: Server startup โหลด Secret ก่อน app, ตรวจ Mongo/KMS/SQL/outbox readiness, แสดง `/health/live`/`/health/ready` แบบไม่เปิดรายละเอียด และ graceful shutdown HTTP/outbox/connections/scheduler
53. ยังต้องทำ: Cloud cost guardrail ปัจจุบันเป็น in-memory ต่อ process จึงต้องส่ง metric ไป monitoring กลางก่อน scale หลาย instance
54. ยังต้องทำ: SQL backfill ไม่ prune source row ที่ hard-delete โดยอัตโนมัติ; mismatch ต้องหยุดและผ่าน reconciliation/approval
55. ยังต้องทำ: ห้ามเปิด `SQL_PRIMARY_STORE`, `SQL_WALLET_LEDGER_ENABLED` หรือ `SQL_RECEIPT_COUNTER_ENABLED` ใน production จนกว่า continuous reconciliation, load test, restore และ rollback drill ผ่าน
56. แก้แล้ว: SQL outbox ป้องกัน lost update ระหว่าง processing ด้วย pending รุ่นถัดไป และแก้ duplicate pending race ตอน retry/stale-lock ด้วยสถานะ `SQL_OUTBOX_SUPERSEDED`
57. ยังต้องทำ: Write path mirrored domain ที่ไม่ได้ใช้ Mongo transaction ยังมี atomicity gap ระหว่าง source commit กับ post-save enqueue; ต้องทำ reconciliation job และทยอยย้าย critical write เข้า transaction ก่อนใช้ SQL เป็น read authority
58. แก้แล้ว: Event bank account/payment QR เคยถูก frontend ส่งมาแต่ `SETTINGS_CONFIG_FIELDS` กรองทิ้ง; เพิ่ม field validation/persistence และ public Event payload แล้ว
59. แก้แล้ว: Event media upload เคย active ถาวรแม้ผู้ใช้ไม่กดบันทึก; เพิ่ม unlinked expiry, transactional `eventLinks`, quarantine และ cleanup แล้ว
60. แก้แล้ว: Donation update/delete เคย query ด้วย `_id` โดยไม่ผูก Event; เปลี่ยนเป็น Event-scoped query และ transaction แล้ว
61. แก้แล้ว: Donation update/delete package เคยทำให้ `sold` drift; เพิ่ม reserve/release แบบ atomic และ rollback ทั้งรายการเมื่อ stock operation ล้มเหลว
62. แก้แล้ว: LINE notification ล้มเหลวหลัง Donation commit เคยทำให้ API ตอบ failure และเสี่ยง retry ซ้ำ; เปลี่ยนเป็น audit warning โดยไม่ย้อนผล commit
63. แก้แล้ว: Avatar cleanup error หลัง DB save เคยมีโอกาสลบ object ใหม่จน DB ชี้ไฟล์หาย; เปลี่ยนเป็น transactional claim และ fallback quarantine ให้ scheduler retry แล้ว
64. ยังต้องทำใน environment จริง: GCS migration/load/egress test, IAM keyless signed URL, lifecycle/soft-delete validation, Billing export/Budget Alert และ restore/rollback drill ก่อน production cutover
65. พบจาก production-data dry-run: มี legacy avatar reference 1 รายการที่หา source file ไม่พบ; ห้าม migration ลบทิ้งอัตโนมัติ ต้องแสดง fallback, ให้ผู้ใช้ upload ใหม่ และเคลียร์ reference หลังได้รับอนุมัติ/มี audit
66. แก้แล้ว: Donation create เพิ่ม hashed idempotency key, request fingerprint, unique Event index, replay response, retry-safe transaction document และ reject `eventYear` ที่ขัดกับ Event context แล้ว
67. แก้แล้ว: `GET /api/wallets/balance` เมื่อใช้ Guest Token ไม่ populate และไม่คืน participant, certificate ID, owner full balance หรือ PII ของเจ้าของ wallet
68. แก้แล้ว: request logger/audit logger ใช้ URL sanitizer และ route pattern เพื่อลบ certificate/guest/idempotency token, OAuth code/state/nonce และ signed URL signature
69. แก้แล้ว: หน้า registration `/` resolve `GET /api/public/events/current` แล้วใช้ canonical slug โหลด fields/packages และ submit เพื่อไม่ชน backend `requireEventIdentity`
70. แก้แล้ว: Event identity resolver ตรวจความขัดแย้งของ `eventId/eventSlug/eventYear` จาก params/query/body และ participant registration ใช้ eventYear จาก resolved Event เท่านั้น
71. รอ environment จริง: Certificate migration dry-run พบผู้เข้าร่วมเดิม 985 รายที่ต้อง backfill; ยังไม่ได้ apply เพราะต้องมี backup/maintenance/approval ก่อนเขียน production-like database
72. แก้แล้ว: Public participant create รองรับ hashed `Idempotency-Key`, stable fingerprint, Event-scoped unique index, replay ก่อน Turnstile/ก่อนตรวจสถานะเปิดรับ และ 409 เมื่อ reuse key กับ payload ต่าง จึงกู้ผลลัพธ์เดิมได้แม้ Event เพิ่งปิดรับหรือเข้า maintenance
73. แก้แล้ว: Registration draft เปลี่ยนเป็น Event-scoped preference-only storage, purge legacy unscoped draft และไม่เขียนชื่อ/อีเมล/เบอร์/ที่อยู่/assistance/slip/donation amount ลง sessionStorage
74. แก้แล้ว: Public Event response ใช้ allowlist ไม่คืน `_id`, organization/series ID หรือ editor metadata; payment/bank fields เปิดเฉพาะเมื่อ donations feature เปิด และ public path/CTA ถูก canonicalize ตาม Event slug
75. แก้แล้ว: Public registration response คืนเฉพาะ code/status/eventYear/registeredAt, ตั้ง `no-store` และ E-ticket email ใช้ชื่อ/ผู้ติดต่อของ Event แทนค่าที่ hard-code
76. แก้แล้ว: Turnstile ตรวจ exact action/allowed hostname, timeout, token length, metadata-only log และ production fail-closed; frontend สร้าง invisible widget แยกต่อ action/request และ public write สำคัญมี endpoint-specific rate limit
77. แก้แล้ว: Resend E-ticket public ใช้ Event canonical context, Turnstile และ generic no-store response; staff ใช้ route แยกที่ต้อง auth/permission/CSRF/Event scope จึงไม่ถูกบังคับใช้ public bot flow
78. แก้แล้ว: Registration reuse OTP UI/backend ใช้ 8 หลักตรงกัน, challenge/OTP malformed ได้ 400, attempt/consume เป็น atomic, ใช้ได้ครั้งเดียว, จำกัด 5 ครั้ง และ record ใหม่ไม่เก็บอีเมล plaintext
79. แก้แล้ว: Public report จำกัดจำนวนแถว, mask ชื่อเหลืออักษรแรก, bucket เวลา 15 นาที, ไม่คืน tags และ cache key ผูก Event; public dashboard รวมกลุ่มสถิติที่ต่ำกว่า k-anonymity threshold เป็น `อื่น ๆ`
80. แก้แล้ว: Participant update/delete/restore และ Prize delete/cancel ตรวจ ObjectId, permission และ Event scope; prize cancel ใช้ transaction และ participant soft delete revoke session/token version
81. แก้แล้ว: Public Report/Dashboard/Lucky Draw resolve public Event ก่อนโหลดข้อมูล ใช้ canonical slug+year เดียวกัน และแสดงชื่อ/โลโก้จาก Event; link ที่ year ไม่ตรง Event ต้อง fail closed แทนการแสดงหัวข้อคนละงาน
82. แก้แล้ว: Event Admin deep link โหลด Event รายตัวจาก backend ตามสิทธิ์, ล้าง Event เก่าทันทีเมื่อ route เปลี่ยน, แสดงโลโก้หมุนพร้อมชื่อที่ verify จาก API และไม่ fallback ไป `location.state` ของ Event อื่น
83. แก้แล้ว: SQL mirror เคยเก็บ participant/vendor QR, idempotency key, verification code และ receipt number แบบอ่านได้; เปลี่ยนเป็น dedicated domain-separated HMAC และเพิ่ม regression test แล้ว
84. ปรับตาม provider constraint: SQL production ใช้ `verify_identity`, CA pin, SAN validation และ TLS 1.2 เป็นค่าปกติ; Hostatom ที่ไม่ advertise TLSและไม่มี IP allowlist ใช้ approved plaintext exception เฉพาะ endpoint pin + least-privilege account และตรวจ transport จริง
85. ตรวจแล้วและ harden แล้ว: Google Cloud CLI ปัจจุบันระบุว่า `--wait` เดิม imply job execution จึงไม่ยืนยันว่าเป็น runtime bug; เพิ่ม `--execute-now --wait`, contract test และ read-only transport job เพื่อให้เจตนาชัดและจับ regression
86. แก้แล้วในโค้ด/รอ infrastructure: เพิ่ม static VPC/NAT/reserved IP provisioning แบบ explicit gate, endpoint pin และ Plesk allowlist confirmation; ยังต้อง provision/ตั้งค่าจริง
87. รอ provider evidence: KMS application key ไม่สามารถยืนยัน Plesk disk/tablespace/backup encryption แทน hosting provider ได้ จึงต้องคง at-rest/backup confirmation เป็น `false` จน restore drill ผ่าน
88. แก้แล้วใน deployment contract: commit เฉพาะ Plesk destination IP; database name/runtime user/migration user ต้องมาจาก protected variables และ password/CA/HMAC key ต้องอยู่ pinned Secret Manager
89. แก้แล้ว: SQL connector เดิมลอง connection ครั้งเดียวซึ่งเปราะกับ Direct VPC cold start; เพิ่ม retry สูงสุดแบบ bounded/backoff เฉพาะ network code และเพิ่ม test ว่า auth/TLS error ไม่ถูก retry
90. แก้แล้ว: Mapper รุ่นใหม่อาจ overwrite active row ได้แต่ legacy/orphan SQL row อาจค้าง plaintext; เพิ่ม aggregate protection audit และกำหนดให้ reconciliation/approved cleanup ผ่านก่อน production read
91. แก้แล้ว: Blind index จาก source เคยถูก copy เข้า SQL โดยไม่ validate ทำให้ malformed/plaintext อาจหลุดได้; เพิ่มรูปแบบ 64-hex และ fail closed ก่อน write
92. แก้แล้ว: Secret sync เคย grant runtime account อ่าน `SQL_MIGRATION_PASSWORD`; เปลี่ยนเป็นถอน runtime binding และ grant เฉพาะ migration account
93. แก้แล้ว: GitHub CD เคยไม่มีทางส่ง database/runtime/migration user และ TLS server name ที่ห้าม commit; เพิ่ม protected Environment variable mapping ทั้ง staging/production
94. แก้แล้ว: การตรวจ endpoint เดิมยอมรับ host ใดก็ได้ถ้า `SQL_HOST` ตรง `SQL_EXPECTED_HOST`; เพิ่ม immutable approved Plesk host `203.170.190.137` ใน application/release guard
95. ปรับตามข้อกำหนดล่าสุด: ยกเลิก Plesk webhook/automatic deployment ทั้งหมด โดย Plesk ติดตาม `main` และผู้ดูแลต้องกด `Pull now` กับ `Deploy now` เองหลังตรวจว่า commit ผ่าน CI; build-capable deployment action ต้องตรวจ branch/source ส่วน restricted Hostatom chroot ต้องปิด action และรับเฉพาะ CI-verified prebuilt artifact
96. แก้แล้ว: `TRUST_PROXY` validator เคยยอมรับ public CIDR กว้าง เช่น `0.0.0.0/0`; จำกัด explicit CIDR เป็น IPv4 `/32` หรือ IPv6 `/128` เท่านั้นและเพิ่ม regression test
97. แก้แล้ว: Secret validation ยังไม่ตรวจรูปแบบ SQL CA และไม่ตรวจ mirror HMAC key ซ้ำกับ signing/blind-index key; เพิ่ม PEM validation และ key-separation gate แล้ว
98. แก้แล้ว: Outbox เคยมอง malformed/plaintext blind index เป็น transient error ทำให้ retry ซ้ำ; เปลี่ยนเป็น permanent dead-letter เพื่อหยุดเขียนและรอ data remediation
99. แก้แล้ว: SQL protection audit เดิมยังไม่ตรวจ participant email/phone/name/LINE blind-index columns; เพิ่ม aggregate violation check โดยไม่ select ค่าออกจากฐานข้อมูล
100. แก้แล้ว: Release plan เคยสรุปทุก renderer failure ว่า Secret pins ไม่ครบ แม้ blocker เป็น runtime variable เช่น email provider/sender; เปลี่ยนข้อความให้ระบุทั้ง configuration และ pins โดยไม่เปิดเผยค่า
101. แก้แล้ว: เมื่อปิด SQL static egress การ deploy โดยไม่ส่ง network flag อาจคง Direct VPC เดิมไว้; release ส่ง `--clear-network` ให้ revision ใหม่เพื่อป้องกัน egress/cost ค้างโดยไม่ตั้งใจ
102. แก้แล้ว: Trust-proxy default test เคยอาศัย process environment ว่าง แต่ quality gate โหลด environment ของ staging ก่อนรัน ทำให้ CI ล้มแม้ validator ทำงานถูกต้อง; test ต้องแยกและคืนค่า `TRUST_PROXY` ทุกครั้ง พร้อมทดสอบ deployment allowlist แยกต่างหากเพื่อไม่ให้ configuration จริงปนกับ unit-test default
103. แก้แล้ว: Deployment contract test เคยผ่านเฉพาะเครื่องที่ติดตั้ง Google Cloud CLI และ `jq` แม้ไม่ได้เรียก Cloud API; เพิ่ม isolated command stubs ภายใน test เพื่อให้ quality gate บน clean Node 22 image ตรวจ logic เดียวกันได้โดยไม่พึ่งเครื่องมือหรือ credential ภายนอก
104. แก้แล้ว: privacy/key-rotation migration เดิมมีโอกาสเขียน audit หรือ re-encrypt record ที่ไม่ใช่ candidate ในโหมด dry-run; ปัจจุบัน dry-run เป็น zero-write, apply ต้องมี `--apply` และ write flag พร้อมกัน และแก้เฉพาะ candidate ที่ตรวจพบ
105. แก้แล้ว: SQL migration รุ่นที่สองสร้าง index แบบไม่ restart-safe ขณะที่ MariaDB DDL implicit commit; เปลี่ยนเป็น `CREATE INDEX IF NOT EXISTS` และเพิ่ม contract test ปฏิเสธ DDL destructive/non-idempotent
106. แก้แล้ว: dependency audit พบ advisory ใน React Router/gaxios/brace-expansion/PostCSS; อัปเกรดและ override เป็นรุ่นแก้ไขแล้ว พร้อมบังคับ runtime `22.22.x` หรือ `24.x` LTS, lint/build/test และ full npm audit
107. แก้แล้วในโค้ด/รอ data apply: `dept`, `department` และ `date_year` เคยอยู่ plaintext พร้อม index แม้เป็น quasi-identifier; เพิ่ม application encryption, เปลี่ยน dashboard เป็น authorized decrypt + metadata audit และเตรียม allowlisted index cleanup ที่หยุดทันทีหากยังพบ plaintext
108. แก้แล้ว: scope migration เดิมตีความการไม่ตั้ง assign flag ว่าเป็น global โดยปริยาย; apply ต้องระบุ `REG_POINT_LEGACY_SCOPE_DECISION` และ `PARTICIPANT_FIELD_LEGACY_SCOPE_DECISION` เป็น `global` หรือ `current-event` ชัดเจน
109. แก้แล้วในโค้ด/รอ data apply: production ปิด Mongoose auto-index, มี index diff แบบ dry-run, TTL reconfiguration ผ่าน `collMod`, explicit replacement gate และไม่ drop stale index โดย generic script
110. ตรวจ production-like data แบบ zero-write แล้ว: participant ล่าสุด 986 รายมี plaintext sensitive/quasi-identifier 7,324 ค่า, donation 108 รายมี 223 ค่า, plaintext participant index 6 ตัว, stale guest-token index 1 ตัว, TTL ผิด policy 4 ตัว และ scope index ต้องแทนที่ 2 ตัว จึงยังห้าม go-live/apply/ปิด MongoDB จน Atlas snapshot และ restore drill ผ่าน
111. ตรวจแล้ว: Guest token และ admin session ไม่มี plaintext token document เหลือ แต่ stale bearer index ยังต้องลบหลัง privacy recheck เป็นศูนย์ตาม `MONGODB_PRODUCTION_MIGRATION_RUNBOOK.md`
112. ยืนยัน architecture: MariaDB ยังเป็น optional reporting mirror; `SQL_PRIMARY_STORE=false` และห้ามปิด MongoDB แม้ SQL backfill สำเร็จ จน full repository cutover, dual-write convergence, load/failover/restore และ rollback ผ่านในโครงการแยก
113. พบ live-write ระหว่าง audit: participant เพิ่มจาก 985 เป็น 986 และ record ใหม่ขาด `eventYear`; migration ต้องหยุด writer/scheduler/public write ก่อน capture baseline และสคริปต์ต้องตรวจ count drift หลัง maintenance
114. แก้แล้ว: wallet และ participant-point dry-run เคยทำ N+1 query หลายร้อยครั้งจนเสี่ยง timeout/quiesce; เปลี่ยนเป็น bounded batch lookup/cache และ reject point ID/name mapping ที่ ambiguous หรือข้าม Event
115. แก้แล้ว: Mongo apply ทุกตัวรวม certificate/object/key rotation ต้องมี `--apply`, script-specific write flag, maintenance confirmation, backup reference และ successful restore-drill reference พร้อมกัน; placeholder หรือหลักฐานขาดต้อง fail ก่อนการเขียนครั้งแรก
116. แก้แล้ว: Plesk deployment target อาจไม่มี `.git` เพราะ Git extension เก็บ repository แยกจาก web target ทำให้ source guard เดิมหยุด deploy; deployment action ต้อง resolve read-only sibling mirror, ยืนยัน `main`/SHA และเทียบ Git blob ของ tracked file ทุกไฟล์ก่อน build โดย fail closed เมื่อ mirror, file, type, executable mode หรือ SHA ไม่ตรง
117. แก้แล้วใน runbook: Plesk Git action อาจไม่ inherit Node.js environment ตอน build; อนุญาต fallback local `frontend/.env` เฉพาะ public `VITE_CF_TURNSTILE_SITE_KEY`, `VITE_GOOGLE_CLIENT_ID`, `VITE_LIFF_ID` ผ่าน allowlist และห้าม backend/DB/GCP Secret ทุกชนิด
118. แก้แล้ว: Secret scanner เคยพยายามอ่านไฟล์ tracked ที่ถูกลบตาม Requirement ทำให้ CI ล้มก่อนยืนยันการลบ workflow เก่า; scanner ต้องข้ามเฉพาะ candidate ที่ไม่มีอยู่จริง, ยังตรวจไฟล์ existing/untracked ตามเดิม และห้าม follow symlink ออกนอก repository
119. แก้แล้ว: SQL migration workflow เคยอ่าน Environment-level `SQL_MIGRATION_ENABLED` ใน job `if` ก่อน runner ประกาศ protected environment ทำให้ค่าว่างและ skip เงียบได้; gate ต้องทำใน step แรกหลัง Environment approval และ fail พร้อมข้อความเมื่อยังไม่เปิด
120. แก้แล้ว: Field decrypt เคย fallback ไป active key เมื่อ ciphertext ระบุ `kid` ที่ไม่มีใน key ring; unknown/retired `kid` ต้อง fail closed ทันทีและมี regression test เพื่อรักษา key-version/rotation contract
121. แก้แล้ว: HTTP legacy-event migration apply เคยมี write flag/confirmation แต่ไม่บังคับ snapshot/restore evidence; production ต้องปฏิเสธ HTTP apply และใช้ offline migration command เท่านั้น ส่วน non-production apply ยังต้องผ่าน maintenance, backup และ restore-drill gate
122. แก้แล้ว: `grantSuperadmin` เคยเขียน role ให้ username ค่าเริ่มต้นทันที; ปัจจุบันไม่มี default target, เป็น dry-run โดยปริยาย, apply ต้องมี `--apply` + write flag + exact target confirmation + approved change reference และบันทึก role/audit ใน Mongo transaction เดียวกัน
123. แก้แล้ว: Runtime renderer เคยตรวจเฉพาะ Secret pins ของ service ปกติ ทำให้ schema/backfill job อาจถูกสร้างก่อนพบว่า migration password, CA หรือ mirror HMAC pin ขาด; ต้องรวม job-specific required pins ตาม mode และ fail ก่อน deploy job
124. แก้แล้ว: Migration service account เคยคงสิทธิ์อ่าน MongoDB URI, migration password, mirror HMAC และ SQL CA หลัง change window; เพิ่ม cleanup-only profile ที่ต้องยืนยัน environment, ไม่แตะ Secret payload/version/pin file และถอน IAM ทั้งหมดแม้ migration สำเร็จหรือล้มเหลว
125. แก้แล้ว: Deployment config เคยไม่ตรึง project ที่เปลี่ยนใหม่ ทำให้ local release อาจใช้ `gcloud config` หรือ GitHub variable ผิดบัญชี; staging/production ต้องระบุ `PROJECT_ID=cusa-reunion` และ release/Secret sync ต้องปฏิเสธ project อื่นก่อนอ่านหรือเขียน Cloud resource
126. แก้แล้ว: การถอน IAM ราย Secret ยังไม่พอหาก migration account มี inherited project-level `secretAccessor`/Admin/Editor/Owner; Secret sync และ cleanup ต้องตรวจ project policy, ปฏิเสธ broad role และยอมรับเฉพาะ per-secret binding ตาม change window
127. ปรับตามข้อมูลผู้ดูแล: Domain `reunion.scicu-alumni.com` ผูกกับ Plesk แล้ว, repository ติดตาม `main`, deployment เป็น manual และ Plesk CD ปิด; บันทึกเป็น non-secret environment contract แต่ยังไม่ถือว่าเว็บ deploy สำเร็จจน default page ถูกแทนที่และ external smoke ผ่าน
128. แก้แล้ว: Budget bootstrap เคยใช้ชื่อแยก staging/production ทั้งที่ทั้งสอง environment ใช้ project เดียว จึงเสี่ยงสร้าง alert ซ้ำและสื่อความหมายผิด; ต้องใช้ project-wide Budget เดียว, reuse/normalize legacy Budget, บังคับยอดรวมไม่เกิน 1,000 บาท และตรวจ component allocation ก่อน Cloud API call
129. แก้แล้ว: GCS cost estimator เคย fallback 700 บาทขณะที่ deployment allocation/runbook ใช้ 650 บาท; fallback, environment และ acceptance test ต้องใช้ GCS sub-budget 650 บาทตรงกัน
130. แก้แล้วใน Requirement: Cost acceptance เคยระบุให้พร้อมก่อนเปิด Plesk auto-deploy ซึ่งขัดกับ manual-only contract; ต้องพร้อมก่อนเปิด production traffic และ Plesk automatic deployment ยังคงปิดเสมอ
131. พบจาก external smoke วันที่ 2026-08-01: Domain/HTTPS พร้อมแต่ยังแสดงหน้า default Plesk และ gateway/API ตอบ 404; config readiness ห้ามถูกใช้แทน live readiness ต้องผ่าน manual `Pull now`/`Deploy now`, release SHA verification และ external smoke ก่อน go-live
132. ปรับ Requirement ใหม่: `LINE Notify` ยุติบริการแล้วตั้งแต่ 31 มีนาคม 2025 จึงห้ามออกแบบ integration ใหม่ด้วย endpoint/token เดิม; manager alert ต้องใช้ LINE Messaging API ผ่าน Official Account หรือ Web Dashboard พร้อม quota/fallback
133. แก้ข้อเสี่ยงใน Requirement: IndexedDB ถูกล้าง/แก้ได้และไม่ใช่หลักฐานทางบัญชี; canonical E-slip ต้องอยู่ private GCS, MongoDB เก็บ metadata/checksum และ local copy เป็น cache/outbox เท่านั้น
134. แก้ข้อเสี่ยงใน Requirement: Stripe client callback/หน้าจอสำเร็จห้ามทำ fulfillment; ต้องตรวจ signed webhook, deduplicate event, validate amount/currency/scope และรองรับ event ซ้ำหรือมาผิดลำดับ
135. ปรับ Offline-first boundary: อินเทอร์เน็ตขาดต้องห้ามเริ่ม/ยืนยัน Stripe PromptPay/card; offline ใช้กู้ cart/close draft/outbox ได้ ส่วน offline cash ปิดโดย default และต้องมี approval/ledger/reconciliation แยกหากจะเปิด
136. แก้ข้อกล่าวอ้าง HA: replica-set auto-failover ไม่รับรอง absolute zero downtime และไม่ป้องกัน region outage หาก Cloud Run/Plesk/GCS ยัง single-region; ต้องกำหนด SLO/RPO/RTO และทดสอบทั้ง application topology
137. พบข้อขัดแย้งกับงบ: MongoDB 3-node HA, PITR และ cross-region database/GCS copy มีต้นทุนเพิ่มที่งบ Google Cloud 1,000 บาทเดิมไม่ได้ครอบคลุมอัตโนมัติ; ต้อง forecast/อนุมัติงบก่อน provision และห้ามลด security/backup เพื่อให้ตัวเลขผ่าน
138. พบข้อขัดแย้งกับ model เดิม: `Package.stock/sold` และ SQL mirror constraint ไม่ยอม stock ติดลบ จึงห้าม reuse เป็น POS inventory โดยตรง; POS ต้องใช้ immutable movement ledger, materialized balance และ reporting schema/migration ใหม่
139. ปรับ Card Surcharge: ปิดโดย default จนได้รับ legal/accounting/acquirer/network approval, แสดงแยกก่อนจ่าย, version policy และห้ามใช้ estimated Stripe fee เป็น actual fee
140. ปรับ Gross/Fee/Net: actual fee/net settlement ต้อง reconcile จาก Stripe Balance Transaction; refund, chargeback, reserve และ payout adjustment เป็น ledger แยก ไม่เขียนทับยอดขาย
141. เพิ่ม Blind Close security: API/browser/IndexedDB/log ต้องไม่มี expected amount ก่อน cashier submit; manager review หลัง freeze declaration เท่านั้นและ amendment ต้องสร้าง version ใหม่
142. เพิ่ม PO/AP integrity: partial receiving ต้องสร้าง Goods Receipt แยกและ stock/AP เพิ่มจาก accepted quantity จริงแบบ idempotent; force close ยกเลิกเฉพาะ outstanding และห้ามลบ AP เดิม
143. ปรับปุ่มบันทึกสลิป: server ต้องสร้าง/เก็บ canonical receipt อัตโนมัติหลัง verified payment; ปุ่มใช้ retry/ยืนยัน local cache หรือ share เท่านั้น การลืมกดห้ามทำให้ receipt ต้นฉบับสูญหาย
144. สถานะปัจจุบัน: POS/Inventory, Stripe, shift, PO, settlement, 3-node HA, PITR และ geo-replication เป็น `Planned / Not Implemented`; ห้ามตีความการเพิ่ม Requirement ว่า production รองรับแล้ว

## 24. Test และ Acceptance Checklist

### 24.1 Functional Tests

- สร้าง organization/series/event แล้ว publish/open registration ได้
- Public registration เขียนเข้า event ถูกต้องจาก slug
- หน้า `/` ต้อง resolve current public Event แล้วส่ง canonical slug; หากไม่ได้กำหนด current Event หรือ Event ไม่ public ต้อง fail closed
- Public Report/Dashboard/Lucky Draw ต้อง resolve Event จาก slug/id/current, แสดงชื่อและโลโก้ของ Event เดียวกับข้อมูล และ reject ลิงก์ที่ year ไม่ตรง
- Registration ที่ส่ง eventId/slug/year ขัดกันต้องถูก reject และห้ามสร้าง participant ที่ eventId กับ eventYear ไม่ตรงกัน
- Public registration retry key เดิม/payload เดิมต้องมี participant เพียง 1 record และ response replay ต้องไม่ส่ง email/consume Turnstile ซ้ำ
- Public registration key เดิม/payload ต่างต้องได้ 409 และ raw key ต้องไม่ปรากฏใน DB/log/response
- Registration draft ใน sessionStorage ต้องไม่มี PII และต้องแยกอย่างน้อยตาม Event route
- Event workspace entry แสดงโลโก้หมุนและชื่อ Event ที่โหลดจาก backend
- Deep link เข้า `/admin/events/:eventId/*` ต้องโหลด Event context ก่อนแสดงข้อมูล
- Deep link ที่ Event ไม่มีอยู่หรือไม่มีสิทธิ์ต้องล้างชื่อ/โลโก้/ข้อมูล Event ก่อนหน้าและแสดง 403/404 state โดยไม่เรียกเครื่องมือด้วย context เก่า
- ผู้ใช้ที่มี Event เดียวต้องเข้า Event workspace ได้โดยไม่ต้องเลือกซ้ำ
- ผู้ใช้ที่มีหลาย Event ต้องเลือก Event ก่อนเข้าเครื่องมือจัดการ
- การสลับ Event ต้องล้างข้อมูลหน้าจาก Event เดิมก่อนโหลด Event ใหม่
- Participant login ด้วย Email OTP แล้วเปิด user hub/wallet/ticket ได้
- Participant login ผ่าน LINE Login แล้วผูกกับบัญชีเดิมด้วย email OTP ได้
- LIFF เปิด `/liff/wallet` แล้ว seamless login ได้เมื่อ LINE linked
- LIFF seamless login ต้องส่งเฉพาะ ID token ไป backend verify, ไม่ใช้ profile.userId ที่ client อ้างเอง และไม่ log displayName/token/error request config
- ผู้ใช้ unlink/re-link LINE เองได้หลัง step-up OTP
- Logout all devices ทำให้ token เก่าทั้ง Web/LIFF ใช้งานไม่ได้
- LineOA command `QR`, `คูปอง`, `เช็คข้อมูล`, `ใบรับรอง` ตอบกลับถูกต้องตามสิทธิ์
- Registration reuse OTP ไม่ leak email existence
- Registration reuse OTP ต้องรับ 8 หลัก, wrong attempt ไม่เกิน 5 ครั้ง, challenge ถูก consume ได้ครั้งเดียวและ concurrent confirm สำเร็จได้ไม่เกินหนึ่ง request
- Public resend ticket ต้องตอบ generic/no-store; staff resend ต้องใช้ participant ID และ Event scope โดยไม่ผ่าน public Turnstile route
- Kiosk token ใช้ได้เฉพาะ point เดียว
- Kiosk Diagnostic ตรวจ network, backend health, token, point, camera, fullscreen, storage และเวลาเครื่องก่อนเปิดใช้งาน
- Kiosk Diagnostic ต้องไม่ให้เข้า runtime หาก token หมดอายุ point disabled หรือ event/kiosk window ปิดอยู่
- Staff Onsite Registration และ Kiosk Self-service ต้องถูกบันทึกเป็น source แยกกันใน report
- Kiosk idle timeout ต้องล้างข้อมูล form/review/error/result ชั่วคราวและกลับหน้า idle
- Kiosk success screen ต้อง countdown reset และไม่เปิดข้อมูลผู้เข้าร่วมคิวก่อนหน้าให้คิวถัดไปเห็น
- Staff exit kiosk ต้องใช้การยืนยันตัวตนและ clear scoped token
- Self-register master token จำกัดเวลาไม่เกิน 24 ชั่วโมง
- Check-in กันซ้ำและกัน cross-event QR
- Participant search ใช้ได้ทั้ง encrypted และ plaintext legacy data
- Donation package ตัด stock ไม่เกิน stock แม้ submit พร้อมกัน
- Wallet ถูกสร้างตาม package coin quota และ follower allowance policy
- ผู้เข้าร่วมสร้าง guest link พร้อม limit/expiry แล้วผู้ติดตามเปิด mini-app ได้โดยไม่ต้อง login
- Guest link ที่หมดอายุหรือถูก revoke ต้องใช้งานไม่ได้
- Vendor QR แบบ fixed price แสดงราคาอัตโนมัติหลังสแกน
- Vendor QR แบบ variable/menu price ต้องตรวจราคาจาก backend ก่อนจ่าย
- Payment success ต้องแสดงสลิปสีเขียวพร้อม live animation และ transaction ID
- API timeout หลังจ่ายต้องกู้คืนสถานะด้วย idempotencyKey ได้
- Vendor dashboard แสดงเฉพาะยอดและ transaction ของร้านตัวเอง
- Settlement report รวมยอด success หัก reversal/refund ได้ถูกต้อง
- ผู้ใช้ checked-in แล้วดาวน์โหลด E-Certificate จาก Wallet/User Hub ได้
- Certificate download ใน LIFF เปิด external browser fallback ได้
- Certificate URL fragment ต้องถูกล้างหลังอ่าน, PDF QR ต้องใช้ opaque ID และ raw participantId link ต้องใช้ไม่ได้
- Verify certificate ต้องแสดง revoked แยกจาก not-found/invalid และทุก response ต้อง no-store
- Lucky draw ไม่เลือกผู้ชนะซ้ำและไม่เกินจำนวนรางวัล
- ยกเลิกผู้ชนะ/ลบรางวัล/แก้ไข/ลบ participant ด้วย ID ของ Event อื่นต้องถูก block และ concurrent prize cancel ต้องคืน stock เพียงครั้งเดียว
- Export CSV มีข้อมูลครบและ audit
- Session refresh/logout/revoke ทำงานทุก tab
- Secret Manager provider โหลด secret ตอน boot ได้ครบและ fail-closed เมื่อ secret สำคัญขาด
- Secret rotation แบบ pinned version/canary/rollback ใช้ได้โดยไม่ทำให้ service outage
- SQL mirror/backfill แบบ dry-run สร้าง validation report โดยยังไม่เขียนข้อมูลจริง
- SQL backfill แบบ write mode รันซ้ำได้โดยไม่สร้าง duplicate และ checksum ตรงกับ MongoDB
- Outbox update ซ้ำก่อน claim ต้อง coalesce และ update ระหว่าง processing ต้องถูก sync รอบถัดไปโดยไม่สูญหาย
- Worker crash หลัง claim ต้องกู้ stale lock ได้ และ worker สอง instance ต้องไม่ complete lock ของกันและกัน
- SQL parent มาช้าต้อง retry ตาม backoff; permanent error ต้องเข้า dead-letter และ replay แบบ dry-run/apply gate ได้
- Graceful shutdown ต้องรอ active outbox cycle และไม่มี record ค้างเพราะปิด SQL connection ก่อน worker
- Dashboard/report อ่านจาก SQL mirror ได้เฉพาะเมื่อ sync lag ไม่เกิน threshold
- Dual-read comparison แสดง mismatch ระหว่าง MongoDB และ SQL ได้ก่อน cutover
- SQL migration rollback กลับไป MongoDB primary ได้ตาม runbook ก่อน cutover
- Cloud Run SQL transport job ต้อง connect `203.170.190.137:3306` ผ่าน `tcp_tls`, ตรวจ identity สำเร็จและ `Ssl_cipher` ไม่ว่างโดยไม่เขียน business row
- Migration pipeline ต้อง execute job จริง; test ต้องจับ regression เมื่อขาด `--execute-now`
- SQL startup ต้อง fail เมื่อ host ไม่ตรง expected endpoint, CA/identity/SAN ไม่ผ่าน, static egress/allowlist ไม่ยืนยัน หรือ encrypted storage/backup confirmation ขาด
- SQL mapper output ต้องไม่มี raw participant/vendor QR, idempotency key, verification code, receipt number, LINE ID หรือ participant/donor PII
- Plesk ต้องรับ connection จาก reserved NAT IP และปฏิเสธ connection จาก source อื่น
- Encrypted SQL backup ต้อง restore ใน isolated environment แล้ว count/checksum/referential checks ผ่าน
- Event settings upload logo/cover/payment QR แล้ว save ต้องสร้าง `eventLinks`; ไม่ save ต้อง cleanup หลัง TTL
- Replace/clone Event media ต้องไม่ลบ object ที่ Event อื่นยังใช้อยู่
- Public/admin slip upload แล้ว Donation create/update ต้อง claim object ได้ครั้งเดียวและ Event ต้องตรงกัน
- Donation update/delete package ต้อง reserve/release stock ใน transaction และ sold ห้ามติดลบ
- Legacy object migration dry-run ต้องไม่เขียนข้อมูล; apply ต้องรายงาน missing/failed และคง source file
- GCS cost estimator ต้องผ่าน scenario 10,000 รูป/5 views และ 100 GiB stress forecast

### 24.2 Security Tests

- ทุก protected endpoint ไม่มี token ต้องได้ 401/403
- Staff ใช้ point ที่ไม่ได้รับสิทธิ์ต้องถูก block
- Kiosk scoped token ใช้กับ point อื่นหรือ endpoint admin/export/session ไม่ได้
- Kiosk token verify ต้อง reject audience/issuer/expiry/point/event mismatch
- Browser fullscreen ต้องไม่ถูกนับเป็น security boundary ต้องมี OS-level kiosk lock runbook สำหรับ production
- Event user เข้าถึง event นอก scope ต้องถูก block
- CSRF missing/invalid ต้องถูก reject เมื่อใช้ cookie session
- Turnstile fail ต้อง block public write
- Turnstile token ที่ action หรือ hostname ไม่ตรง, ถูกใช้ซ้ำ, หมดอายุ หรือยาวเกิน policy ต้องถูก block และ production ที่ไม่มี hostname allowlist ต้องไม่ start
- CORS origin นอก allowlist ต้องถูก block
- Upload non-image หรือ image ปลอมต้องถูก reject
- Public report/lucky draw ต้องไม่มี PII เต็ม
- Public report ต้องไม่คืน tag/internal ID, เวลาต้องถูก bucket และชื่อเปิดเผยได้ไม่เกินอักษรแรก; aggregate กลุ่มเล็กต้องถูก coarsen ตาม threshold
- Email OTP participant login ต้องไม่เปิดเผยว่า email มีในระบบหรือไม่
- LINE/LIFF login ต้อง reject token ที่ audience/issuer/expiry/nonce ไม่ถูกต้อง
- Webhook ที่ signature ไม่ถูกต้องต้องถูก reject
- Unlink/re-link LINE ต้องใช้ step-up OTP และ audit
- Logout all devices ต้อง invalidate participant token เก่า
- Payment ซ้ำด้วย idempotencyKey เดิมต้องไม่หักยอดซ้ำ
- Concurrent wallet payment ต้องไม่ทำให้ balance ติดลบ
- Guest token ต้องถูกเก็บแบบ hash และ token plaintext ต้องไม่ปรากฏใน log
- Guest balance response ต้องไม่มี `participant`, owner fields, certificate ID และยอดเต็มของ wallet หลัก
- Vendor QR ของ Event หนึ่งต้องใช้รับเงินใน Event อื่นไม่ได้
- Success slip screenshot เก่าต้องสังเกตได้จาก animation/time/expired state
- Vendor dashboard ต้องไม่เห็นชื่อเต็ม เบอร์ อีเมล หรือข้อมูลส่วนตัวผู้ซื้อ
- Sensitive decrypt/export ต้องมี audit metadata-only
- Revoked session/token ต้องใช้งานต่อไม่ได้
- Production build ต้องไม่อ่าน secret จาก `.env` plaintext เมื่อ `SECRET_MANAGER_ENABLED=true`
- Outbox collection, dead-letter API, audit และ log ต้องไม่มี participant/donor PII, token, slip หรือ SQL credential
- ผู้ใช้ที่ไม่มี `infra:manage` ต้องเปิด SQL mirror status/dead-letter endpoint ไม่ได้
- Hard delete mirrored model ต้องถูก block เมื่อเปิด outbox และ operator ต้องใช้ soft-delete flow
- Secret Manager IAM ต้องให้ service account อ่านเฉพาะ secret ของ environment/role ตัวเอง
- Secret payload ต้องไม่ปรากฏใน log, audit, error response, frontend bundle หรือ migration report
- SQL app user ต้องไม่มีสิทธิ์ DDL/admin เช่น `DROP`, `ALTER`, `GRANT`, `CREATE USER`
- SQL connection ต้องใช้ private network/TLS ตาม deployment policy และ public DB endpoint ต้องถูก block เว้นแต่มี exception ที่อนุมัติ
- SQL migration runner credential ต้องแยกจาก app runtime และถูก revoke/disable หลัง migration window
- Private slip URL ต้องขอผ่าน Event-scoped access API และผู้ใช้ Event อื่นต้องได้ 403
- Signed URL ต้องหมดอายุ, ถูก tamper ไม่ได้ และห้ามปรากฏใน log/export
- URL sanitizer ต้อง redact OAuth code/state/nonce, guest/certificate/idempotency token และ signature ทั้งใน path/query/audit URL
- Bucket startup validation ต้อง reject public access, region ผิด, non-Standard, Autoclass/versioning/HNS และ lifecycle/soft-delete ที่เกิน policy
- Upload raw source/EXIF/GPS ต้องไม่ถูก persist และ object key ต้องไม่ใช้ original filename
- GCS service account ต้องใช้ ADC/Workload Identity และ repository/deployment ต้องไม่มี JSON key
- External event media/slip URL ใหม่ต้องถูก reject เมื่อไม่มี approved exception

### 24.3 Privacy Tests

- Consent ถูกบันทึกพร้อม participant
- Soft delete participant แล้วไม่แสดงใน list/search/report
- Export ถูกจำกัดเฉพาะ admin ที่มีสิทธิ์
- Audit log ไม่เก็บชื่อ เบอร์ อีเมล ที่อยู่ หรือข้อมูลอ่อนไหวแบบ plaintext
- Field encryption เปิดแล้วข้อมูลใน DB เป็น ciphertext และค้นหาได้ด้วย blind index
- Wallet/vendor transaction report ต้องเปิดเผยเฉพาะข้อมูลที่จำเป็นต่อ settlement
- Guest wallet mini-app ต้องไม่แสดงข้อมูลส่วนตัวของ main attendee
- Guest wallet backend ต้องไม่ query/populate PII ของ main attendee เมื่อ request ใช้ Guest Token เพื่อลดทั้ง exposure และ DB cost
- Kiosk reset ต้องล้าง PII ของผู้ใช้ก่อนหน้าทุกครั้ง ทั้ง timeout, success countdown, manual reset และ exit
- Diagnostic/readiness log ต้องไม่บันทึก PII ของผู้เข้าร่วม
- LINE chat response ต้องไม่แสดง PII เต็มและต้องมี opt-out notification
- Certificate verification ต้องไม่ใช้ participantId เดาง่ายเพียงอย่างเดียว
- Certificate token ต้องมี entropy อย่างน้อย 256 บิต, unique, `select:false`, ไม่อยู่ใน SQL reporting mirror และ migration output ต้องรายงานเฉพาะ count
- SQL mirror ต้องไม่เพิ่ม PII plaintext จาก MongoDB encrypted fields โดยไม่ได้รับอนุมัติ
- Participant dynamic field ที่ mirror เข้า SQL ต้องผ่าน field classification และ retention policy
- SQL backup/export ต้องเข้ารหัสและจำกัดสิทธิ์ไม่ต่ำกว่า MongoDB backup
- Payment slip ต้องเก็บ private, retention/cleanup ตาม Event/privacy policy และ export แสดงเพียงมี/ไม่มี
- StoredObject/audit/GCS metadata ต้องไม่มีชื่อผู้บริจาค อีเมล เบอร์ ที่อยู่ หรือ signed URL
- Soft-deleted/quarantined binary ต้องถูกลบเมื่อครบ retention และ metadata ต้องคงสถานะสำหรับ audit

## 25. Implementation Roadmap Requirements

Roadmap นี้เป็นลำดับการพัฒนาที่ควรใช้เพื่อให้ระบบเดินหน้าได้โดยไม่กระทบ production เดิม และรองรับ Hybrid E-Wallet, LINE/LIFF, Event Workspace และ security hardening ครบถ้วน

### Phase 1: Security & Performance Quick Wins

สถานะเป้าหมาย:

- Code splitting และ lazy loading สำหรับ frontend pages
- Global error boundary ป้องกัน white screen
- ลบ token/hash ออกจาก URL หลังอ่านค่า
- จัดระเบียบ Turnstile script และ bot protection
- สร้าง `.env.example`
- ปรับ Helmet, CORS, rate limit และ cookie/session baseline

Acceptance Criteria:

- Initial bundle ลดลงหรือ lazy loaded ตาม route
- Login/register public write ผ่าน Turnstile
- Secret ไม่อยู่ใน git
- Error frontend ไม่ทำให้ทั้งแอปล่มแบบหน้าขาว

Implementation Status:

- แก้แล้ว: frontend routes ใช้ `React.lazy` และ `Suspense` เพื่อลด initial bundle ต่อ route และ Vite manual chunks แยก MUI/charts/QR/motion/auth providers โดยปล่อย PDF renderer ไปอยู่ใน lazy certificate chunk
- แก้แล้ว: เพิ่ม Global Error Boundary เพื่อกัน white screen และให้ผู้ใช้กลับหน้าหลักได้
- แก้แล้ว: LINE callback อ่าน `code/state` แล้วล้าง query string ออกจาก URL ทันที
- แก้แล้ว: Guest wallet อ่าน token จาก `/guest-wallet/:token` ครั้งแรก เก็บเฉพาะใน `sessionStorage` และ replace URL เป็น `/guest-wallet`
- แก้แล้ว: Participant session refresh มี previous-token grace window และ frontend sync login/refresh/logout ข้าม tabs ด้วย `BroadcastChannel`, storage event และ refresh lock
- แก้แล้ว: Turnstile helper กลางไม่คืน dummy token แล้ว โดย public donation/upload/register ใช้ token จริงจาก Cloudflare widget, สร้าง widget แยกต่อ action/request, backend ตรวจ exact action/hostname และ production fail-closed เมื่อ config สำคัญขาด
- แก้แล้ว: เพิ่ม `backend/.env.example` และขยาย `frontend/.env.example` โดยไม่มี secret จริงในไฟล์ตัวอย่าง
- แก้แล้ว: Helmet/CORS/rate limit/cookie baseline ถูกตั้งใน backend และ CSP production ไม่เปิด `unsafe-inline`/`unsafe-eval`
- ยังต้องทำนอกโค้ดก่อน production: ตั้ง secret จริงใน environment manager, ตั้ง Cloudflare Turnstile key จริง, ตรวจ CORS production origin และรัน smoke test บน staging domain จริง

### Phase 2: Pre-registration Refactor

สถานะเป้าหมาย:

- แยก `PreRegistrationPage` เป็น component ย่อย
- ใช้ multi-step form: personal info, package selection, confirmation
- ใช้ `react-hook-form` และ dynamic Zod schema
- เก็บ draft form ใน sessionStorage พร้อม encryption หรืออย่างน้อยไม่เก็บข้อมูลอ่อนไหวแบบไม่จำเป็น
- Clear draft เมื่อ submit สำเร็จ

Acceptance Criteria:

- แต่ละ step validate เฉพาะ field ที่เกี่ยวข้อง
- Refresh แล้ว preference draft ที่ policy อนุญาตไม่หาย; PII ต้องให้กรอกใหม่จนกว่าจะมี authenticated server-side draft
- Submit สำเร็จแล้ว draft ถูกล้าง
- Component ย่อยไม่ผูก business logic แน่นเกินไป

Implementation Status:

- แก้แล้ว: หน้าเป็น multi-step, ใช้ `react-hook-form`, dynamic Zod และแยก step components
- แก้แล้ว: draft ใช้ Event-scoped key และ allowlist เฉพาะ non-PII preferences พร้อม purge legacy PII draft
- แก้แล้ว: participant submit และ donation submit มี idempotency key แยกกันเพื่อกัน retry ซ้ำ
- ยังต้องทำ: registration + donation/package ยังเป็นสอง API จึงต้องเพิ่ม recovery queue/UI หรือ orchestration endpoint เพื่อให้ผู้ใช้ retry เฉพาะ donation ที่ล้มเหลวได้โดยไม่สร้าง participant ใหม่

### Phase 3: Dashboard, Tenant Isolation และ Backend Stability

สถานะเป้าหมาย:

- Dashboard มี shared `StatCard` และ empty state
- ทุก controller ที่เกี่ยวกับ event data ใช้ `eventScopeFromRequest` หรือ event identity ที่ชัดเจน
- Export CSV/PDF มี `maxTimeMS`, response headers และ audit
- Public/legacy route ต้องไม่ fallback ข้าม Event โดยไม่ตั้งใจ

Acceptance Criteria:

- ทุก list/search/export/report ต้องมี event scope
- Dashboard ของ Event หนึ่งไม่ปนข้อมูลอีก Event
- Export timeout ถูกจัดการและ frontend เห็นสถานะ

### Phase 4: Hybrid E-Wallet และ LINE Ecosystem

สถานะเป้าหมาย:

- Wallet รองรับ coins และ coupons
- Distribution mode รองรับ AUTO และ MANUAL
- Package quota, follower allowance, manual grant และ optional top-up
- Guest link สำหรับผู้ติดตาม
- Vendor QR แบบ PromptPay Model
- Payment idempotency และ double spending protection
- Success slip มี live animation และ anti-fraud signal
- Participant login ด้วย Email OTP, LINE Login และ LIFF
- Email as Master Key และ LINE เป็น linked provider
- Unlink/re-link LINE และ logout all devices
- LineOA Rich Menu, webhook command และ push notification

Acceptance Criteria:

- Wallet balance ไม่ติดลบจาก concurrent payment
- LINE/LIFF token verify ฝั่ง backend เท่านั้น
- เปลี่ยน LINE แล้ว token เก่าถูก invalidate
- Guest link ใช้เกิน limit ไม่ได้
- Vendor เห็นเฉพาะ transaction ของร้านตัวเอง

### Phase 5: Final UX/UI Overhaul

สถานะเป้าหมาย:

- Success registration มีปุ่มเปิด Wallet/QR ticket
- Wallet มี real QR scanner ด้วยกล้อง
- Guest link แสดงได้ทั้ง URL และ visual QR
- Event Platform เหลือ portal รายการกิจกรรมและปุ่ม Manage ที่ชัดเจน
- Event workspace มี sidebar ต่อ Event
- Event settings แยก tab: basic, branding, features, security, notifications
- Layout builder เปลี่ยนจาก JSON raw เป็น form/drag-drop UI
- Event entry มีโลโก้หมุนพร้อมชื่อ Event

Acceptance Criteria:

- Admin รู้เสมอว่ากำลังจัดการ Event ใด
- ผู้ใช้ทั่วไปเข้า wallet/ticket/certificate ได้จาก hub เดียว
- UI ไม่ต้องให้ admin แก้ JSON ดิบสำหรับงานหลัก

### Phase 6: Maximum Security และ Document Infrastructure

สถานะเป้าหมาย:

- Cloudflare WAF หน้าโดเมน
- Server firewall รับเฉพาะ Cloudflare IP ตาม deployment policy
- Strict CORS และ production CSP
- GCS/private object storage สำหรับเอกสารสำคัญและ template
- Signed URL สำหรับไฟล์ private
- เสร็จในโค้ด: GCS/local image abstraction, private payment slip, image optimization, metadata/link/retention/cleanup และ legacy migration command
- รอ environment จริง: private bucket/IAM/Workload Identity/Budget Alert, production migration, load test และ restore drill ตาม `GCS_OBJECT_STORAGE_RUNBOOK.md`
- Certificate verification QR และ revoked check
- เสร็จในโค้ด: opaque certificate ID, fragment link, POST verify/payload, no-store, revoked UI, log redaction และ migration command
- รอ production data: backup และ apply certificate backfill ให้ candidates เป็น 0 ก่อนเปิด certificate feature
- Receipt running number ใช้ transaction/lock กันเลขซ้ำ
- Frontend PDF generation เป็น default เพื่อลด server load
- LIFF certificate download ใช้ external browser fallback

Acceptance Criteria:

- Upload เอกสาร/template ไม่เก็บแบบ public uncontrolled บน VPS
- Signed URL มีอายุสั้น
- Bucket เป็น private + Public Access Prevention และ Event อื่นเปิด payment slip ไม่ได้
- Normal-load forecast รวม reserve อยู่ใน GCS sub-budget 650 บาท/เดือน
- Receipt number ไม่ซ้ำเมื่อออกพร้อมกัน
- Certificate revoked แล้ว verify page ต้องแสดง revoked
- Raw participantId certificate URL ต้องใช้ไม่ได้เมื่อ legacy flag ปิด และ audit/access log ต้องไม่มี opaque token

### Phase 7: Secret Manager และ Hybrid Structured DB Migration

สถานะเป้าหมาย:

- เสร็จในโค้ด: `secretProvider` สำหรับ env/local, Google Secret Manager และ test provider
- รอ environment จริง: ย้าย production secrets, pin version, IAM least privilege, Cloud audit และ Budget Alert
- บางส่วน: Secret Manager access guardrail เสร็จ; centralized/monthly billing report ยังไม่เสร็จ
- เสร็จในโค้ด: Initial ERD/schema สำหรับ reporting mirror 10 domains
- เสร็จในโค้ด: SQL connector/repository รองรับ MySQL/MariaDB-compatible dialect
- เสร็จในโค้ด: migration/backfill แบบ dry-run default, resumable, count/checksum และ rollback plan
- เสร็จในโค้ด: outbox/dead-letter worker สำหรับ MongoDB -> SQL live mirror พร้อม retry/replay/audit/status/readiness
- เสร็จด้าน architecture/code: เลือก Plesk MariaDB, pin destination, TLS/at-rest/backup/network guardrail, protected mirror value และ optional static egress pipeline แล้ว
- บางส่วน: local MariaDB proof-of-concept ผ่าน; Plesk remote TLS/static egress/restore/cost test ใน staging จริงยังไม่เสร็จ
- เสร็จในเอกสาร: source-of-truth matrix สำหรับ MongoDB, SQL, Firestore, Secret Manager/KMS และ object storage

Acceptance Criteria:

- Production deploy ไม่มี secret plaintext ใน env file/image/git และ startup validation ผ่านครบ
- Secret rotation canary/rollback ทำได้ใน staging โดยไม่ outage
- SQL schema มี FK/unique/check constraints สำหรับ event/vendor/wallet/receipt/donation/package domain ที่เลือก
- Backfill จาก MongoDB ไป SQL รันซ้ำได้และ validation report ผ่านตาม threshold
- Dashboard/report ทดลองอ่านจาก SQL mirror ได้โดย sync lag อยู่ใน SLA
- Wallet/receipt/payment domain ยังไม่ cutover จนกว่า concurrent load test, reconciliation และ rollback ผ่านครบ
- Plesk MariaDB เปิดได้เฉพาะเมื่อ transport job, `/32` allowlist, encrypted storage/backup evidence และ restore drill ผ่านครบ
- SQL mirror validation ต้องยืนยันว่า bearer-like identifier เป็น HMAC และไม่มี PII/plaintext Secret
- Cost estimate ของ Secret Manager/KMS/Firestore/Cloud SQL/MariaDB อยู่ในงบที่อนุมัติ หรือมี approval หากเกิน 1,000 บาท/เดือน

### Phase 8: Automated Deployment และ CI/CD

สถานะเป้าหมาย:

- ใช้ `scripts/release.sh` เป็น deployment entrypoint เดียวของ local operator และ GitHub Actions
- Canonical public web ต้องรัน React SPA และ same-origin gateway บน Plesk; Cloud Run image ยังมี frontend fallback แต่หน้าที่หลักคือ backend/API และ Google Cloud integration
- GitHub ใช้ OIDC Workload Identity Federation โดยไม่มี service-account JSON key
- ทุก release ผ่าน test, lint, dependency audit, container build, migration gate, candidate smoke test และ post-promotion smoke test
- Production ต้อง manual dispatch จาก `main`, ผ่าน GitHub Environment approval และ rollback ได้โดยไม่ rebuild image

Acceptance Criteria:

- Container ถูก deploy ด้วย digest `sha256` ไม่ใช่ mutable tag
- Candidate revision รับ 0% traffic จน `/health/live`, `/health/ready` และ SPA smoke test ผ่าน
- Smoke test หลังรับ traffic ล้มเหลวแล้ว traffic กลับ revision เดิมอัตโนมัติ
- Secret value ไม่ปรากฏใน Git, GitHub variable, command argument, image layer หรือ deployment artifact
- Staging และ production ใช้ service account, Secret prefix, bucket และ approval boundary แยกกัน
- `MIN_INSTANCES=0`, max instances และ Artifact Registry cleanup policy ถูกตั้งตาม cost guardrail

## 26. Automated Deployment และ CI/CD Requirements

### 26.1 เป้าหมายและ Single Entry Point

- ระบบต้องมี entrypoint เดียวคือ `./scripts/release.sh COMMAND ENVIRONMENT` เพื่อป้องกัน local deploy และ CI/CD ใช้ขั้นตอนไม่ตรงกัน
- คำสั่งขั้นต่ำต้องประกอบด้วย `ci`, `plan`, `bootstrap`, `secrets`, `deploy`, `rollback` และ `all`
- `all` ต้องเรียก quality gate, bootstrap infrastructure, secret synchronization เมื่อเปิด explicit gate และ deployment ตามลำดับ
- สคริปต์เก่าต้อง delegate เข้า entrypoint เดียวและต้องไม่มี logic ที่คัดลอก `.env` หรือสร้าง Dockerfile ชั่วคราว
- ทุกคำสั่งที่แก้ Google Cloud, upload Secret หรือ deploy production ต้องมี explicit confirmation flag และ fail closed เมื่อ config ไม่ครบ
- Production ห้าม deploy จาก dirty worktree, commit ที่ไม่ใช่ `main` หรือ release ID ที่ไม่ใช่ Git SHA

### 26.2 CI Quality Gate

- Pull request และ push เข้า `main` ต้องรันจาก clean checkout โดยใช้ lockfile และ `npm ci` เท่านั้น
- CI ต้องตรวจ syntax backend, automated backend tests, frontend lint, frontend production build และ deployment contract tests
- CI ต้องตรวจ dependency advisory ระดับ High/Critical ทั้ง backend production dependencies และ frontend dependencies
- CI ต้อง build multi-stage Docker image จริงเพื่อจับปัญหา path, native dependency, package lock และ frontend build-time config
- Workflow ต้องกำหนด timeout, concurrency cancellation สำหรับ CI และ `permissions: contents: read`
- GitHub Actions ทุกตัวต้อง pin ด้วย full commit SHA และ Dependabot ต้องเปิดสำหรับ Actions/backend/frontend
- CI ต้องไม่รับ Google credential และต้องไม่ติดต่อ production database
- CI และ local quality gate ต้องสแกน tracked/untracked Git candidate files เพื่อหา credential signature และเทียบกับค่า Secret ใน local source โดยรายงานเฉพาะชนิด/path/line ห้ามพิมพ์ payload
- Required status check ต้องถูกตั้งใน branch protection ก่อน production deployment

### 26.3 CD Trigger, Environment และ Approval

- Staging deploy จาก push เข้า `main` ได้เฉพาะเมื่อ repository variable `CD_ENABLED=true`
- Production deploy ต้องใช้ `workflow_dispatch`, เลือก `production`, รันจาก `refs/heads/main` และผ่าน required reviewer ของ GitHub Environment `production`
- GitHub Environment ต้องแยก `staging` และ `production`; ห้าม production ใช้ service account หรือ Secret prefix ของ staging
- Deployment concurrency ต่อ environment ต้องเป็น 1 และห้าม cancel deployment ที่กำลังเปลี่ยน traffic
- ก่อนเปิด `CD_ENABLED` ต้องตั้ง `GCP_PROJECT_ID`, `WIF_PROVIDER`, `DEPLOYER_SERVICE_ACCOUNT`, `APP_ORIGIN` และ public frontend keys ใน GitHub variables
- `GCP_PROJECT_ID` ของ staging/production deployment ปัจจุบันต้องเป็น `cusa-reunion` และทุก Secret pin ต้องอยู่ project เดียวกัน
- ห้ามเก็บ runtime Secret ใน GitHub Secrets หาก Secret Manager รองรับ; GitHub เก็บเฉพาะ non-secret resource identifier และ public site key
- ผู้อนุมัติ production ต้องไม่เป็นผู้เขียน release เพียงคนเดียวเมื่อทีมมีผู้ดูแลอย่างน้อย 2 คน

### 26.4 Build Artifact และ Supply-chain

- Frontend และ backend ต้อง build เป็น image เดียวด้วย checked-in multi-stage `Dockerfile`
- Runtime image ต้องรันด้วย non-root user, ไม่มี compiler/dev dependency, `.env`, test data, upload, log, Git metadata หรือ source map
- Build ต้องใช้ Node LTS ที่ประกาศชัดเจนและ package lock; ห้าม fallback เป็น `npm install`
- Local quality gate, GitHub Actions และ Docker build ต้องใช้ Node major เดียวกัน; version ไม่ตรงต้องหยุดก่อน `npm ci` เพื่อเลี่ยง lockfile/peer dependency behavior ต่างกัน
- Frontend API base ต้องเป็น `/api` เพื่อให้ browser ใช้ origin เดียวกับ backend
- ค่า `VITE_*` ถือเป็น public build-time config เท่านั้นและห้ามนำ Secret ไปตั้งชื่อด้วย prefix นี้
- Image tag ต้อง unique ต่อ pipeline run และหลัง push ต้อง resolve digest; Cloud Run และ migration job ต้องรับ image แบบ `@sha256:...`
- Release metadata ต้องมี Git SHA, environment และ revision label โดยไม่มี PII/Secret
- Cloud Run renderer ห้ามส่ง `PORT`, `K_SERVICE`, `K_REVISION`, `K_CONFIGURATION` หรือชื่อที่ขึ้นต้น `X_GOOGLE_`; ให้ตั้ง container port ผ่าน deployment option และใช้ค่าที่ Cloud Run inject เพื่อป้องกัน candidate revision ถูกปฏิเสธ
- Artifact Registry ต้องมี policy ลบ image เก่ากว่า 30 วันแต่เก็บอย่างน้อย 10 เวอร์ชันล่าสุด; policy ใหม่ต้อง dry-run และตรวจ audit ก่อนเปิดลบจริง

### 26.5 Google Cloud Bootstrap และ IAM

- Bootstrap ต้อง idempotent และเปิดเฉพาะ API ที่ใช้จริง ได้แก่ Cloud Run, Artifact Registry, Secret Manager, IAM Credentials, STS และ Cloud Storage; Compute API เปิดเพิ่มได้เฉพาะเมื่อ provision SQL static egress ผ่าน explicit gate
- ต้องแยก runtime, migration และ deployer service account ต่อ environment
- GitHub ต้อง authenticate ด้วย OIDC Workload Identity Federation; ห้ามสร้างหรือ upload service-account JSON key
- OIDC provider condition ต้อง bind ด้วย numeric GitHub repository ID, numeric owner ID และ `refs/heads/main` เพื่อลดความเสี่ยงชื่อ repository/owner ถูกนำกลับมาใช้ใหม่
- Deployer มีเฉพาะ Cloud Run Developer, Artifact Registry Writer ของ repository เป้าหมาย, Service Usage Consumer และ `actAs` เฉพาะ runtime/migration account
- Runtime อ่าน Secret เฉพาะรายการของ environment, ใช้งาน object ใน bucket เฉพาะใบ และอ่าน bucket metadata ได้ แต่แก้ IAM/lifecycle ไม่ได้
- Migration account อ่านเฉพาะ migration credential/TLS Secret และไม่มีสิทธิ์รับ HTTP traffic; runtime account ต้องไม่มีสิทธิ์อ่าน migration password
- เมื่อเปิด Plesk SQL, deployer/Cloud Run service agent มี `compute.networkUser` เฉพาะ SQL egress subnet และห้ามได้ network admin จาก routine CD
- การตั้ง public invoker IAM ต้องทำครั้งแรกด้วย bootstrap principal เท่านั้น ไม่ให้ CD principal มี `run.admin`
- IAM change, Secret access, deployment และ traffic change ต้องอยู่ใน Cloud Audit Logs และมีผู้รับผิดชอบตรวจสอบ

### 26.6 Runtime Secret, Secret Rotation และ KMS

- Runtime ต้องโหลด Secret จาก Secret Manager ผ่าน ADC ของ runtime service account และต้อง `fail closed`
- ทุก Secret ต้อง pin เป็น version number; ห้ามใช้ `latest` ใน production runtime
- Pinned resource ต้องตรง project ที่ deploy, environment `SECRET_MANAGER_PREFIX`, logical secret name และ numeric version; cross-project/cross-environment pin ต้อง fail ก่อน deployและ fail ซ้ำที่ runtime
- ไฟล์ `deploy/secret-versions/<environment>.json` เก็บได้เฉพาะ resource/version identifier และต้องไม่มี Secret payload
- การสร้าง/rotate Secret ต้องใช้ `ALLOW_SECRET_UPLOAD=true`; Secret ที่มีอยู่ต้องไม่ rotate เว้นแต่ตั้ง `ROTATE_SECRETS=true`
- ค่า integration ที่ระบบสร้างเองไม่ได้ เช่น MongoDB URI, Turnstile, Brevo API key, SMTP fallback, LINE, OAuth และ SQL password ต้องขาดแล้วหยุด ไม่ generate ค่าปลอม
- Local `.env` ต้องเป็น Secret payload source เท่านั้นและห้ามทำให้ optional integration ถูกเปิดโดยปริยาย; feature activation ต้องมาจาก reviewed environment config/GitHub variable แบบ explicit
- `PARTICIPANT_EMAIL_LOGIN_ENABLED=true` ใน production-like environment ต้องใช้ `EMAIL_PROVIDER=brevo` พร้อม `BREVO_API_KEY` และ verified sender จริง หรือ approved SMTP fallback เท่านั้น และห้าม `MOCK_EMAIL=true`; OTP, recipient และ email body ห้ามถูกเขียนลง application/Cloud logs
- LINE Login, LINE Messaging, Google Drive, Firestore, KMS และ SQL ต้องมี enable flag แยกกัน; การพบ credential ใน source อย่างเดียวไม่ถือว่าเปิด feature
- Public auth-provider capability endpoint ต้องคืนเฉพาะสถานะพร้อมใช้แบบ boolean และหน้า login ต้องซ่อน provider ที่ปิด/ตั้งค่าไม่ครบโดยไม่เปิดเผย provider identifier หรือ Secret
- Signing key ที่ระบบสร้างได้ต้อง random อย่างน้อย 256 bit และแยกหน้าที่ JWT, session hash, CSRF, vendor QR และ slip proof
- Secret rotation ต้อง deploy candidate ด้วย pin ใหม่, smoke test, promote และเก็บ pin เดิมเพื่อ rollback ตาม retention policy
- KMS data-key mode เป็น optional feature; เมื่อเปิดต้องใช้ wrapped key, cache data key และ service account มี decrypt เฉพาะ key ที่กำหนด
- ห้าม upload ADC token, GitHub OIDC token, service-account key, plaintext data key หรือ Secret payload เป็น artifact/log

### 26.7 Database Migration Gate

- CI ต้องตรวจ migration plan/checksum โดยไม่เชื่อม production DB
- Schema migration production ต้องเป็น backward-compatible expand migration ก่อน deploy application; destructive contract migration ต้องเป็น release แยกหลัง rollback window
- `RUN_SQL_MIGRATIONS=true` ใช้ได้เมื่อ `SQL_ENABLED=true`, มี pinned `SQL_MIGRATION_PASSWORD`, backup/restore point และ approval แล้วเท่านั้น
- `SQL_ENABLED=true` ต้องบังคับ `VERIFY_SQL_TRANSPORT=true` และ execute read-only transport job ผ่าน authenticated TLS ก่อน migration/candidate
- Transport และ migration job ต้องใช้ Direct VPC/subnet/egress config เดียวกับ Cloud Run service เพื่อให้ Plesk เห็น reserved source IP เดียวกัน
- Migration ต้องรันเป็น Cloud Run Job ด้วย image digest เดียวกับ release, 1 task, parallelism 1, advisory lock, timeout, retry 0 และ `--execute-now --wait`
- Pipeline test ต้อง fail หากพบเพียง `jobs deploy` แต่ไม่มีการ execute job
- Migration ล้มเหลวต้องหยุดก่อนสร้าง/promote candidate และห้ามเปลี่ยน traffic
- MongoDB backfill, key rotation, data rewrite และ source-of-truth cutover ห้ามรันอัตโนมัติจาก routine deploy; ต้องใช้ maintenance runbook, dry-run, reconciliation และ rollback แยก
- Application rollback ต้องใช้ได้กับ schema หลัง migration; หากไม่ backward-compatible ต้องปฏิเสธ release ตั้งแต่ review

### 26.8 Candidate, Smoke Test, Promotion และ Rollback Flow

1. ตรวจ clean source, production approval และ configuration
2. รัน quality gate ทั้งหมด
3. Build/push image และ pin digest
4. หากเปิด SQL ให้ execute read-only transport verification job และหยุดทันทีหาก TLS/network/allowlist fail
5. รัน additive SQL migration job หากเปิด gate และต้อง execute สำเร็จจริง
6. บันทึก revision ที่รับ traffic 100% อยู่ก่อนหน้า
7. Deploy revision ใหม่ด้วย `--no-traffic` และ unique candidate tag
8. ตรวจ `/health/live` ว่า release ID ตรงกับ commit
9. ตรวจ `/health/ready` ว่า Secret, MongoDB, optional SQL/KMS/outbox และ object storage พร้อม
10. ตรวจ root SPA ว่า frontend asset ถูกเสิร์ฟจริง
11. Promote revision ใหม่เป็น 100% และรัน smoke test ซ้ำผ่าน canonical service URL
12. ถ้า post-promotion test ล้มเหลว ให้ route 100% กลับ revision เดิมและรายงาน pipeline failure
13. ลบ candidate tag หลังสำเร็จ/ล้มเหลวเพื่อลด tagged revision cost

- Rollback ต้องระบุ revision ได้และตรวจว่า revision อยู่ใน service/region ที่ถูกต้อง
- หากไม่ระบุ revision ระบบเลือก previous ready revision ที่ไม่ใช่ revision ปัจจุบัน แต่ operator ต้องตรวจ release metadata ก่อน production rollback
- Rollback ห้าม rebuild image, rerun destructive migration หรือแก้ Secret pin โดยอัตโนมัติ
- หลัง rollback ต้องตรวจ readiness และบันทึก incident, cause, impact, owner และ follow-up
- ถ้า service เดิมไม่ได้รับ traffic 100% revision เดียว ต้องหยุด deploy เพื่อไม่ทำลาย planned traffic split

### 26.9 Health, Observability และ Failure Handling

- `/health/live` ต้องไม่เชื่อม dependency, ต้องตอบเร็ว, `no-store` และคืน release ID ที่ไม่เป็น Secret
- `/health/ready` ต้อง fail เมื่อ mandatory Secret, MongoDB, GCS หรือ optional dependency ที่เปิดใช้ไม่พร้อม
- Health response ห้ามเปิด URI, username, bucket object path, Secret version payload หรือ stack trace
- Pipeline log ต้องแสดง stage, revision, image digest และ outcome แต่ห้ามใช้ shell trace (`set -x`) ในขั้น Secret
- Network timeout, API rate limit และ eventual consistency ต้อง retry แบบ bounded เฉพาะ read/smoke operation; transaction/migration ห้าม retry โดยไม่มี idempotency/lock
- Deployment failure ก่อน promotion ต้องคง traffic เดิม; failure หลัง promotion ต้อง rollback และ pipeline ต้องจบ non-zero
- ต้องตั้ง alert สำหรับ startup failure, readiness failure, 5xx spike, latency, instance saturation, budget threshold และ repeated rollback

### 26.10 Storage และ Cost Guardrail

- Cloud Run และ GCS ต้องอยู่ `asia-southeast3` (Bangkok) เป็นค่าเริ่มต้นเพื่อลด latency/cross-region egress เว้นแต่มีผลประเมินและอนุมัติ
- Frontend/API รวม service เดียว, `MIN_INSTANCES=0`, staging max 2, production max 3 และ concurrency เริ่มต้น 40
- GCS bucket ต้อง dedicated ต่อ environment, Standard single-region, uniform bucket access, Public Access Prevention, versioning/autoclass ปิด และ lifecycle ตาม retention
- Soft delete เริ่มต้นไม่เกิน 7 วัน; payment slip lifecycle และ unlinked upload cleanup ต้องผ่าน startup policy validation
- Artifact Registry เก็บอย่างน้อย 10 rollback images และลบของเก่าตาม policy หลัง dry-run
- Firestore, KMS, SQL mirror, Cloud SQL/MariaDB managed instance และ min instances ต้องปิดเป็นค่าเริ่มต้น และเปิดได้เมื่อ forecast รวมยังไม่เกิน 1,000 บาท/เดือน
- ต้องตั้ง Google Cloud Billing Budget threshold อย่างน้อย 50%, 80%, 90% และ 100%; application guardrail ไม่ทดแทน Billing Budget
- GitHub-hosted runner usage, Artifact Registry, Cloud Run, Logging, Secret Manager, KMS, Firestore, GCS storage/operation/egress และ SQL ต้องรวมใน monthly cost review

### 26.11 GitHub Repository Governance

- `main` ต้องเปิด branch protection, pull request review, required CI, conversation resolution และปิด force push/delete
- ผู้ที่แก้ workflow, deployment script, environment config, secret pin และ migration ต้องอยู่ใน CODEOWNERS ของ platform/security owner
- Production Environment ต้องมี required reviewer, prevent self-review หาก plan รองรับ และ deployment branch จำกัด `main`
- `CD_ENABLED` เริ่มต้นเป็น `false`; เปิดหลัง bootstrap, Secret pin, staging smoke, budget alert และ rollback drill ผ่าน
- ห้าม workflow จาก pull request/fork ขอ OIDC token หรือใช้ deployment environment
- Workflow permission ต้องประกาศ explicit และห้ามใช้ `write-all`
- Action SHA update ต้องผ่าน Dependabot/PR และ CI เช่นเดียวกับ source code

### 26.12 Deployment Acceptance Checklist

- `./scripts/release.sh ci` ผ่านบน clean checkout และ Docker build ผ่าน
- `./scripts/release.sh plan staging` แสดง project/service/bucket โดยไม่แสดง Secret และไม่มี blocker
- WIF token จาก repository/owner/ref อื่น impersonate deployer ไม่ได้
- Image ที่ Cloud Run revision ใช้เป็น digest และ release ID ตรง Git SHA
- Candidate URL ไม่ได้รับ normal traffic ก่อน smoke test
- จำลอง readiness fail แล้ว traffic เดิมคงอยู่
- จำลอง post-promotion fail แล้ว rollback revision เดิมสำเร็จ
- Secret pin ขาด/เป็น `latest`/ข้าม environment แล้ว renderer หรือ startup ต้องหยุด
- Runtime env file ไม่มี Cloud Run reserved variables และ deployment contract test ต้องล้มเหลวเมื่อมีตัวแปรดังกล่าว
- Production manual approval และ branch restriction ทำงานจริง
- SQL migration failure หยุดก่อน traffic change
- GCS policy validator, private upload/signed URL และ lifecycle test ผ่าน
- Cost forecast และ Billing Budget alert ผ่าน; normal-load forecast รวมไม่เกิน 1,000 บาท/เดือน
- ทำ staging rollback drill และบันทึกเวลา RTO, ผู้ปฏิบัติ และผลตรวจข้อมูลก่อนเปิด production

รายละเอียดปฏิบัติการให้ยึด `docs/DEPLOYMENT_RUNBOOK.md` เป็น runbook หลัก

### 26.13 Plesk Public Web และ Cloud Run Backend Requirements

#### 26.13.1 Architecture และ Ownership

- Canonical origin สำหรับผู้ใช้ต้องเป็น `https://reunion.scicu-alumni.com` ซึ่งผูก Domain/SSL กับ Plesk แล้ว งาน Phase 1 นี้ห้ามเปลี่ยน DNS โดยไม่มี change request แยก
- Plesk ต้องรัน Node.js `22.22.x` หรือ `24.x` LTS application ที่ประกอบด้วย React SPA และ same-origin gateway หนึ่งตัว; Hostatom production เลือก `24.19.0`
- Cloud Run ต้องคงเป็น backend/API compute และเป็น component เดียวที่เข้าถึง MongoDB, Secret Manager, GCS, KMS, Firestore, MariaDB/SQL, Brevo/SMTP fallback และ server-side provider secrets
- Plesk ห้ามมี Google service-account JSON, ADC token, MongoDB URI, JWT/session/CSRF key, Brevo API key, SMTP password, LINE channel secret, Turnstile secret, KMS plaintext key หรือ database password
- Cloud Run frontend bundle ใช้เป็น fallback/diagnostic ได้ แต่หลัง go-live ห้ามถือ `run.app` เป็น canonical URL ที่ส่งให้ผู้ใช้
- เนื่องจาก Phase 1 ไม่ใช้ external HTTPS Load Balancer เพื่อคุมงบ Cloud Run endpoint ยังคง public สำหรับ Plesk upstream; ทุก API จึงต้องรักษา auth/RBAC/CSRF/rate-limit/idempotency ที่ backend และห้ามพึ่ง CORS/Plesk WAF เป็น authorization

#### 26.13.2 Request Routing และ Function Relationship

- Plesk ต้องให้บริการ `/` และ non-API route ด้วย SPA โดย navigation response เป็น `Cache-Control: no-store`
- Plesk ต้อง proxy เฉพาะ `/api`, `/health`, `/uploads` และ path ลูกไป Cloud Run โดยคง method, path, query, body และ status code
- `/gateway/health/live` ต้องตรวจ process ใน Plesk เท่านั้น; `/gateway/health/ready` ต้องตรวจทั้ง gateway และ Cloud Run `/health/ready` แต่คืนข้อมูล sanitized
- Path `/api` ที่ไม่พบหรือ method ที่ไม่รองรับต้องคืน JSON 404/405 จาก API flow และห้าม fallback เป็น `index.html`
- Static asset ที่มี content hash ใช้ cache immutable ได้; HTML, health, auth response และ error ต้อง `no-store`
- Gateway ต้อง rewrite/remove upstream cookie Domain เพื่อให้ cookie ผูกกับ public domain และต้องไม่ลด `Secure`, `HttpOnly`, `SameSite` หรือ Path policy ของ backend
- Upload/download ต้องผ่าน `/uploads` หรือ signed/private object flow ที่กำหนด ห้ามคัดลอกรูป/slip ไปเก็บซ้ำบน Plesk
- Browser ต้องใช้ `VITE_API_BASE_URL=/api` เพื่อไม่เรียก Cloud Run จาก client โดยตรง

#### 26.13.3 Origin, Callback และ Public URL Contract

- `APP_ORIGIN` ต้องเป็น deterministic Cloud Run HTTPS origin สำหรับ candidate/readiness/deployment smoke เท่านั้น
- `PUBLIC_WEB_ORIGIN` ต้องเป็น `https://reunion.scicu-alumni.com` และเป็นแหล่งของ `PUBLIC_URL`, `FRONTEND_URL`, `OBJECT_STORAGE_PUBLIC_API_ORIGIN`, email/QR/guest link และ provider callback
- Runtime ต้องสร้าง `CORS_ORIGIN` จาก Cloud Run origin และ Plesk originแบบ exact match, deduplicate และห้าม wildcard ใน production
- Turnstile hostname allowlist ต้องมี `reunion.scicu-alumni.com`; site key บน Pleskเป็น public value แต่ secret key ต้องอยู่ Secret Manager
- Google OAuth authorized JavaScript origin ต้องตรงกับ public origin และ LINE Login callback ต้องเป็น `https://reunion.scicu-alumni.com/user/line/callback`
- Provider config ไม่ครบต้องปิด provider นั้นใน capability endpoint/UI โดยไม่ทำให้ email login หรือ provider อื่นล้มตาม

#### 26.13.4 Gateway Security

- Production startup ต้อง fail closed เมื่อ `PUBLIC_HOST` ว่าง, upstream ไม่ใช่ HTTPS `run.app`, timeout ไม่ถูกต้อง หรือ frontend build ไม่มี `index.html`
- Gateway ต้องปฏิเสธ Host ที่ไม่อยู่ allowlist ด้วย HTTP 421 เพื่อป้องกัน Host-header abuse และ cache poisoning
- Gateway ต้องตั้ง CSP, HSTS, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, referrer policy และปิด technology disclosure
- CSP ต้องรองรับเฉพาะ origin ที่จำเป็นต่อ Turnstile/Google login และต้องไม่ใช้ `unsafe-eval` ใน production
- Gateway ต้องสร้าง/validate request ID, กำหนด upstream timeout แบบ bounded, ไม่เปิด WebSocket ใน Phase 1 และคืน generic 502 โดยไม่เปิด hostname/stack trace
- Gateway ต้อง strip upstream `Server`/`X-Powered-By`; health/error/log ห้ามมี token, cookie, query secret, PII หรือ upstream credential
- `.htaccess` ที่มี `PassengerEnabled off` ต้องถูกตัดออกจาก Plesk public release เพราะจะ bypass/ปิด Node gateway
- `TRUST_PROXY` ของ backend ต้องรับเฉพาะ named private proxy ranges และ verified Plesk outbound `/32`; ห้าม `true`, hostname, malformed CIDR หรือ broad public CIDR
- ก่อน go-live ต้องทดสอบ client สองเครือข่ายว่า rate limit/audit แยก IP ได้ หากทุกคนเป็น IP เดียวต้องหยุดเปิดระบบและแก้ proxy chain
- `X-PSEvent-Gateway` เป็น observability marker เท่านั้น ห้ามใช้เป็น credential เพราะ client ปลอม header ได้

#### 26.13.5 Plesk Runtime และ Build Contract

- Plesk Node.js ต้องเป็น `22.22.x` หรือ `24.x` LTS (`24.19.0` สำหรับ Hostatom), mode `Production` และ startup file `app.js`; Git deploy ใช้ application root `hosting/plesk-gateway`/document root `hosting/plesk-gateway/public` ส่วน File Manager bundle ใช้ immutable versioned application root `releases/psevent-plesk-gateway-<git-sha-12>` และ document root `<Application root>/public`
- Passenger/Plesk เป็นผู้ inject `PORT`; source, Plesk environment และ deployment action ห้าม hard-code `PORT`
- `UPSTREAM_ORIGIN` ต้องไม่มี path/query/credential และต้องเปลี่ยนจาก staging ไป production เฉพาะหลัง production acceptance ผ่าน
- `VITE_CF_TURNSTILE_SITE_KEY`, `VITE_GOOGLE_CLIENT_ID`, `VITE_LIFF_ID` เป็น public build-time identifiers เท่านั้น ห้ามนำ Secret มาใส่ `VITE_*`
- Build ต้องใช้ lockfile และ `npm ci`; gateway production dependency audit ระดับ High/Critical ต้องผ่าน
- Public release ต้องสลับ directory แบบไม่เผย partial build, เก็บ previous release อย่างน้อยหนึ่งชุด และมี release ID ที่ตรงกับ Git SHA
- Rollback metadata ต้อง validate ก่อน swap; metadata เสียหรือ current release ไม่ครบต้อง fail โดยไม่ทำลาย release ที่กำลังให้บริการ

#### 26.13.6 Git, File Manager Bundle และ Manual Deployment Flow

- Routine deploy ต้องใช้ Plesk Git โดยติดตาม branch `main`; หาก subscription ไม่มี Plesk Git extension อนุญาต checksummed File Manager ZIP ที่สร้างจาก clean/pushed `main` commit และผ่าน CI เป็น controlled fallback โดยห้าม FTP/SFTP
- GitHub Actions ทำเฉพาะ CI และ Cloud Run deployment; ห้าม pull/deploy Plesk, ห้ามเรียก Plesk webhook และห้ามมี `contents: write` เพื่อเลื่อน Plesk release ref
- ผู้ดูแลต้องรอ `CI / quality` ของ commit บน `main` ผ่าน และ deploy Cloud Run backend ที่เกี่ยวข้องให้พร้อมก่อนแตะ Plesk
- เมื่อมี Git extension ผู้ดูแลต้องกด `Pull now`, ตรวจ latest commit/SHA ให้ตรงกับ commit ที่ CI ผ่าน แล้วกด `Deploy now`; เมื่อไม่มี Git ให้ตรวจ bundle checksum/manifest, extract เป็น versioned directory ใหม่และสลับ application root หลังติดตั้ง dependency สำเร็จ
- Plesk deployment mode ต้องเป็น manual; `PLESK_CD_ENABLED`, `PLESK_GIT_WEBHOOK_URL`, `PLESK_WEBHOOK_HOST` และ branch `plesk-production` ไม่ใช้
- Repository public ใช้ HTTPS read-only ได้โดยไม่เก็บ credential; หากเปลี่ยนเป็น private ต้องใช้ deploy key แบบ read-only และห้าม write access
- เมื่อ Plesk Git action มี Node.js/npm/core utilities จึงให้ additional deployment action เรียก `./scripts/release.sh plesk deploy`; Hostatom restricted chroot ต้องปิด action และใช้ tracked prebuilt artifact
- Deployment action ต้องยืนยัน branch `main` และ SHA จาก checkout หรือ read-only Plesk Git mirror, ปฏิเสธ tracked file ที่หาย/เปลี่ยน type/ถูกแก้บน host, ใช้ lockfile, รัน test/audit/build, สลับ public release แล้วสร้าง Passenger restart markerหลังสำเร็จเท่านั้น
- File Manager bundle builder ต้องยืนยัน clean `main`, ฝัง Git SHA/release manifest, มี SHA-256 checksum, include เฉพาะ gateway runtime/lockfile/frontend build และ exclude `.env`, Secret, development dependency และ `node_modules`; ผู้ดูแลต้องตรวจ checksum ก่อน extract
- เมื่อ production Plesk Git action อยู่ใน restricted chroot ที่ไม่มี Node.js/npm/core utilities ให้ routine Git deployment ใช้ frontend artifact ที่ build และ commit จาก trusted CI/operator เท่านั้น, CI ต้องยืนยันว่า public artifact ถูก track ครบและไม่มี `.htaccess`/source map/Secret, ปิด Additional deployment action แล้วใช้ Plesk Node.js Toolkit ทำ `NPM install` และ `Restart App`
- หาก Git action ไม่ inherit Node.js environment อนุญาต local build config เฉพาะ public `VITE_*` allowlist; ห้าม loader อ่านหรือส่ง backend Secret และ database/cloud credential
- หลังผู้ดูแล deploy ต้องรัน external smoke แบบ bounded และหยุด go-live เมื่อ gateway readiness, SPA, security headers, release header หรือ same-origin API ผิด contract
- FTP/SFTP credential, Plesk password, SSH private key, webhook secret และ GitHub write token ห้ามอยู่ใน repository/Plesk application

#### 26.13.7 Failure, Rollback และ Recovery Flow

- Build/test fail ต้องคง current public releaseและไม่ restart application
- Upstream timeout/DNS/Cloud Run unavailable ต้องคืน generic 502/503 พร้อม `no-store`; browser แสดง retry state และห้ามสร้าง transaction ซ้ำโดยไม่มี idempotency key
- Frontend rollback ต้อง swap previous release โดยไม่ rebuild และรัน external smoke ซ้ำ; การ rollback ครั้งถัดไปสามารถสลับกลับ current เดิมได้
- Gateway source code เสียต้อง checkout/deploy known-good Git commit เพราะ static public rollbackอย่างเดียวไม่ย้อน Node source
- Backend rollback ต้อง route ไป immutable previous Cloud Run revision โดยไม่ rebuild imageหรือย้อน destructive migration
- Plesk outage ห้ามเปลี่ยน DNS ฉุกเฉินโดยไม่มี TTL/rollback/communication plan; Cloud Run URL ใช้ operator diagnostic ได้แต่ห้ามประกาศเป็น canonical โดยพลการ
- ทุก rollback ต้องบันทึก release ID, เวลา, impact, data reconciliation, owner, cause และ follow-up

#### 26.13.8 Cost และ Acceptance Criteria

- ต้องใช้ Plesk hosting เดิมสำหรับ public web และ Cloud Run backend service เดียว ห้ามเพิ่ม Cloud Run frontend service หรือ external load balancer ใน Phase 1 โดยไม่มี cost approval
- Cloud Run ต้อง scale-to-zero ตาม environment policy; static cache ต้องลด repeated egress และรูป/slip ต้องใช้ GCS lifecycle โดยไม่ duplicate บน Plesk
- Monthly review ต้องรวม Cloud Run internet egress ที่เกิดจาก Cloud Run -> Plesk proxy response, Logging, Secret Manager, GCS, KMS และ optional data stores
- Forecast normal-load รวมต้องไม่เกิน 1,000 บาท/เดือนและ Billing Budget threshold 50%, 80%, 90%, 100% ต้องพร้อมก่อนเปิด production traffic
- Go-live ต้องผ่าน `gateway/health/ready`, root SPA, release/security headers, auth provider API, login/OTP/logout, registration, upload, check-in, wallet/vendor QR และ rollback drill ผ่าน public domain
- Cookie ต้องอยู่ public domain, `Secure` และไม่มี `run.app` Domain; email/QR/callback/object URL ต้องไม่มี `localhost` หรือ `run.app` สำหรับ user-facing production flow
- Domain/SSL, Plesk manual Git settings, CI-approved commit, Node settings, client-IP test, backend readiness, private GCS, audit redaction และ cost alert ต้องมีหลักฐานตรวจสอบ
- รายละเอียดค่าตั้งและคำสั่ง operation ให้ยึด `docs/PLESK_WEB_GATEWAY_RUNBOOK.md`

## 27. POS, Inventory, Shift, Payment และ PO Module

สถานะ: `Planned / Not Implemented`

ข้อกำหนดฉบับเต็มให้ยึด `docs/POS_INVENTORY_PRD.md`; หัวข้อนี้เป็น integration
contract กับระบบ PSEvent เดิม

### 27.1 Scope และ Feature Flags

- POS ต้องเป็น feature ต่อ Event และเปิดแยกจาก Wallet/Coupon/Package เดิม
- POS ต้องเป็น subsystem แยกจาก Event Management UI และ SSO/Identity แต่ใช้ `eventId`, `organizationId`, permission claim, audit และ notification provider ร่วมกัน
- Event System ต้องสามารถใช้งาน registration/check-in/report ได้ครบแม้ `POS_ENABLED=false`
- SSO/Identity เป็นเจ้าของ login/session/step-up auth; POS เป็นเจ้าของ shift/order/payment/inventory และต้องตรวจ scope ของตนเองทุก write
- Feature flags ขั้นต่ำ: `POS_ENABLED`, `POS_CASH_ENABLED`,
  `POS_STRIPE_ENABLED`, `POS_PROMPTPAY_ENABLED`, `POS_CARD_ENABLED`,
  `CARD_SURCHARGE_ENABLED`, `OFFLINE_CASH_SALES_ENABLED`,
  `INVENTORY_LEDGER_ENABLED`, `PURCHASE_ORDER_ENABLED`,
  `POS_LINE_ALERT_ENABLED`, `POS_GEO_BACKUP_ENABLED`
- ทุก flag ต้องปิดโดย default และการมี Secret/config ไม่เปิด feature อัตโนมัติ
- Backend ต้อง fail closed เมื่อ feature เปิดแต่ provider, permission, index,
  migration, backup หรือ cost gate ไม่ครบ

### 27.2 Function Relationship

1. Manager เปิดกะ/กำหนด float ให้ cashier และ terminal
2. Cashier acknowledge float; backend จึงออก active shift capability
3. Cashier สร้าง order; server snapshot price และ reserve inventory
4. Cash commit หรือ verified Stripe webhook เปลี่ยน order เป็น paid และสร้าง
   inventory movement/E-slip แบบ idempotent
5. E-slip ต้นฉบับอยู่ private GCS; IndexedDB cache cart/slip/outbox เพื่อ recovery
6. Cashier blind close โดย browserไม่เห็น expected amount ก่อน submit
7. Server cross-check shift/payment/receipt/inventory แล้วสร้าง finding/manager alert
8. PO goods receipt สร้าง inventory movement และ AP จาก accepted quantity จริง
9. Settlement job reconcile Stripe Balance Transaction เพื่อแยก gross/fee/net
10. POS email receipt/alert ต้องเรียก Notification service ที่ใช้ Brevo เป็น provider หลัก ไม่เรียก provider secret จาก browser/Plesk

Transaction ที่ขั้นใดล้มต้องไม่สร้างผลลัพธ์ซ้ำเมื่อ retry และต้องมีสถานะ unknown/
reconciliation แทนการเดาว่าล้มเหลว

### 27.3 Data และ Security Boundary

- MongoDB replica set เป็น operational source of truth และใช้ majority write กับ
  transaction สำคัญ
- MariaDB เป็น reporting mirror เท่านั้นและห้ามปิด MongoDBจาก POS migration
- GCS เก็บ receipt image; MongoDB/MariaDB ห้ามเก็บ binary
- Stripe webhook เป็น payment authority; client/IndexedDB/QR screenshot ไม่ใช่
- IndexedDB ห้ามเก็บ card data, Secret, full provider payload หรือ PII เกินจำเป็น
- POS session ต้องผูก Event/vendor/location/device/shift และตรวจ permission ทุก write
- Money ใช้ integer สตางค์; stock ใช้ immutable movement ledger และ reversal
- LINE alert ใช้ Messaging API เท่านั้น; LINE Notify ห้ามใช้
- Email fallback ของ POS alert/receipt ใช้ Brevo Transactional Email API ผ่าน backend เท่านั้น; SMTP เป็น fallback ที่ต้องอนุมัติและ audit

### 27.4 Availability, Backup และ Cost

- Production POS ต้องมี MongoDB 3 data-bearing nodes, automatic election,
  majority write, daily snapshot, approved PITR window และ restore drill
- Regional-loss requirement ต้องครอบคลุม application, database, receipt storage,
  key access และ operator runbook ไม่ใช่ database copy อย่างเดียว
- Cross-region copy/dual-region/Pub/Sub/dedicated cluster ต้องผ่าน forecast และ
  cost approval; งบเดิม 1,000 บาทไม่ถือว่ารวม provider เหล่านี้
- หาก resilience gate ทำไม่ได้ต้องคง `POS_ENABLED=false` หรือบันทึก risk
  acceptance ที่ระบุขอบเขตอย่างตรงไปตรงมา ห้ามอ้างว่า zero downtime

### 27.5 เอกสารอ้างอิงภายใน

- Product/flow/security/acceptance: `docs/POS_INVENTORY_PRD.md`
- Object storage: `docs/GCS_OBJECT_STORAGE_RUNBOOK.md`
- Mongo migration/backup evidence: `docs/MONGODB_PRODUCTION_MIGRATION_RUNBOOK.md`
- Hybrid reporting mirror: `docs/HYBRID_DB_MIGRATION_PLAN.md`
- Deployment/Secret: `docs/DEPLOYMENT_RUNBOOK.md` และ
  `docs/SECRET_MANAGER_RUNBOOK.md`

## 28. Definition of Done

ระบบจะถือว่าพร้อมใช้งาน production เมื่อ:

1. Functional flow สำคัญทั้งหมดผ่าน automated/manual acceptance tests
2. Gap ระดับ critical ทั้งหมดถูกแก้
3. Security environment variables ถูกตั้งครบ
4. Audit และ sensitive audit เปิดใช้งาน
5. Backup และ key rotation runbook พร้อมใช้งาน
6. Privacy notice, consent version และ retention policy พร้อม
7. Monitoring/logging/alerting พร้อมสำหรับ login failure, bot block, export, decrypt, payment fail และ server error
8. เอกสาร API, role matrix, operation guide และ incident response guide อัปเดตตรงกับโค้ดจริง
9. Production secrets ถูกย้ายเข้า Secret Manager/equivalent provider พร้อม rotation/rollback runbook และ audit
10. หากเปิดใช้ structured DB ต้องมี source-of-truth matrix, backup/restore test, migration validation report และ rollback plan ที่ผ่าน staging แล้ว
11. หากเปิดใช้ GCS ต้องผ่าน bucket policy validation, keyless signed URL, legacy migration verification, cleanup/lifecycle test, Billing alert และ rollback drill ตาม `docs/GCS_OBJECT_STORAGE_RUNBOOK.md`
12. Google Cloud normal-load forecast รวม GCS/Secret Manager/KMS/Firestore และ reserve ต้องไม่เกิน 1,000 บาท/เดือน หรือมี approval ที่บันทึกเหตุผล/ช่วงเวลา/owner ชัดเจน
13. Certificate verification backfill ต้องผ่าน dry-run/apply/recheck, unique index ต้องพร้อม, `ALLOW_LEGACY_CERTIFICATE_PARTICIPANT_ID=false` และ rollback/incident owner ต้องถูกบันทึกก่อนเปิด feature
14. CI ต้องเป็น required check, GitHub Actions pin SHA, branch protection และ production Environment approval พร้อมใช้งาน
15. Production revision ต้อง deploy จาก image digest ผ่าน candidate/readiness/post-promotion smoke test และ staging rollback drill แล้ว
16. GitHub-to-Google Cloud ต้องใช้ WIF แบบ numeric repository/owner binding และ repository ต้องไม่มี service-account JSON key
17. Deployment Secret ทุกตัวต้องอยู่ Secret Manager แบบ pin version และ routine deploy ต้องไม่ส่ง plaintext Secret ผ่าน env file/CLI/image
18. Billing Budget, scale-to-zero/max instances, GCS region/lifecycle และ Artifact Registry cleanup ต้องตั้งจริงก่อนเปิด `CD_ENABLED=true`
19. Plesk Node.js/gateway ต้องมาจาก `main` commit ที่ CI ผ่าน โดยใช้ manual `Pull now`/`Deploy now` เมื่อมี Git extension หรือ checksummed File Manager bundle เมื่อไม่มี Git พร้อม external smoke โดยไม่ใช้ webhook/FTP/SFTP และไม่มี backend/GCP Secret บน Plesk
20. `PUBLIC_WEB_ORIGIN`, provider callback, CORS, Turnstile, cookie และ link generation ต้องใช้ `https://reunion.scicu-alumni.com` ตลอด user-facing flow
21. Plesk frontend rollback และ Cloud Run backend rollback drill ต้องผ่านแยกกัน พร้อม release ID, RTO และ incident owner
22. Plesk automatic deployment และ webhook ต้องปิดถาวรสำหรับ flow นี้; ผู้ดูแลต้องผ่าน Host/security header/client-IP/auth/upload/wallet/cost acceptance ทุกครั้งก่อนเปิดใช้งาน release
23. หากเปิด MariaDB ต้องใช้ Plesk target `203.170.190.137` ผ่าน reserved Cloud NAT IP `/32`, authenticated TLS, transport job, least-privilege accounts และห้ามมี DB Secret บน Plesk web gateway
24. Plesk at-rest/backup encryption evidence, encrypted restore drill, SQL mirror plaintext scan, reconciliation และ total GCP forecastรวม static egress ต้องผ่านก่อน `SQL_ENABLED=true`
25. Atlas snapshot ต้อง restore ใน isolated environment สำเร็จก่อน MongoDB migration apply และต้องเก็บ snapshot ID, count/index baseline, operator, เวลา และผล verification
26. Privacy/token migration dry-run หลัง apply ต้องเป็นศูนย์, Mongo index diff ต้องไม่มี create/reconfigure/replacement และ legacy plaintext index candidate ต้องเป็นศูนย์
27. Registration point และ participant field legacy scope ต้องมี change-record decision เป็น `global` หรือ `current-event`; ห้ามใช้ค่า default ที่ไม่ได้อนุมัติ
28. Production MongoDB ต้องใช้ `MONGODB_AUTO_INDEX=false`; TTL/index change ทำผ่าน reviewed migration script เท่านั้นและต้องตรวจ `expireAfterSeconds` จากฐานข้อมูลจริง
29. ห้ามปิด MongoDB จากผล SQL mirror migration; source-of-truth cutover ต้องมี Definition of Done และ rollback ของโครงการแยก
30. Plesk deployment log ต้องพิสูจน์ source mode, branch และ SHA ที่ตรงกับ Latest commit/CI พร้อมผ่าน tracked-tree integrity verification แม้ deployment target ไม่มี `.git`
31. SQL migration job ต้องผ่าน job-specific pin validation ก่อน deploy และ change record ต้องมีหลักฐานว่า migration service account ถูกถอนจาก Secret ทั้ง 4 รายการหลังปิด change window
32. POS/Inventory ทุก feature ต้องคงปิดจน `docs/POS_INVENTORY_PRD.md` ผ่าน architecture, threat-model, accounting/legal และ data-migration approval
33. Event/POS/SSO boundary ต้องผ่าน integration test ว่า Event registration ทำงานได้เมื่อ POS ปิด, POS write ถูก block เมื่อไม่มี `pos:*` scope และ SSO revoke/session step-up มีผลกับทุก domain
34. Production email ต้องใช้ `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY` จาก Secret Manager, verified sender และ canary send test ผ่าน; SMTP fallback ต้องมี approval และระบุเหตุผล/owner
35. Shift assignment/float acknowledgement/blind close ต้องบังคับทั้ง frontend/backend และไม่มี expected amount หลุดก่อน cashier submit
36. Stripe webhook/idempotency/reconciliation ต้องผ่าน duplicate, out-of-order, delayed success, refund และ unknown-outcome test ก่อน live mode
37. Order, payment, inventory movement, reservation, receipt, PO, goods receipt และ AP ต้องไม่ duplicate/drift ภายใต้ concurrent/retry/failover test
38. Canonical E-slip ต้องอยู่ private GCSและกู้ได้เมื่อ IndexedDB ถูกล้าง; local cache/outbox ต้องผ่าน quota, corruption, resume และ purge test
39. Actual Stripe fee/net ต้องมาจาก Balance Transaction reconciliation และ surcharge/tax/receipt wording ต้องได้รับผู้รับผิดชอบอนุมัติ
40. MongoDB 3-node replica set, majority write, daily backup, PITR, election test และ isolated restore ต้องผ่านก่อนเปิด POS production
41. Geo-redundancy ต้องผ่าน checksum/restore/lag/cost drill หรือระบุชัดว่าไม่รองรับ regional-loss; ห้ามกล่าวอ้าง zero downtime โดยไม่มี multi-region application topology
42. LINE manager alert ต้องใช้ Messaging API/Dashboard พร้อม quota/fallback; ห้ามใช้ LINE Notify
43. POS/HA/PITR/GCS replication/Stripe/LINE/Plesk รวมต้องมี cost forecast และ budget owner ก่อน go-live

รายละเอียด operation และ migration ให้ยึด `docs/CERTIFICATE_VERIFICATION_RUNBOOK.md`, `docs/MONGODB_PRODUCTION_MIGRATION_RUNBOOK.md`, `docs/PLESK_MARIADB_RUNBOOK.md`, `docs/POS_INVENTORY_PRD.md` และ `docs/DEPLOYMENT_RUNBOOK.md` เป็น runbook หลักตาม component
