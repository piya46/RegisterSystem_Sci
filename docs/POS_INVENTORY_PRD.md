# POS และ Inventory Product Requirements Document

สถานะเอกสาร: `Planned / Not Implemented`

เวอร์ชัน: 1.1

วันที่ทบทวน: 2026-08-14

เอกสารนี้ประยุกต์ Requirement ระบบ POS และ Inventory เข้ากับสถาปัตยกรรม
PSEvent ที่มีอยู่ โดยไม่เปลี่ยน MongoDB ออกจากการเป็น source of truth ใน Phase
แรก และไม่ถือว่า feature ใดในเอกสารนี้พร้อมใช้งานจนกว่าจะผ่าน Definition of
Done ของเอกสารนี้

หมายเหตุการประยุกต์ล่าสุด: POS เป็น subsystem แยกจาก Event System และ
SSO/Identity System แต่ใช้งานร่วมกันผ่าน `eventId`, `organizationId`,
permission claim, step-up auth, audit, notification service และ reporting
mirror contract เดียวกัน โดยระบบอีเมลเป้าหมายคือ Brevo Transactional Email API
แทน provider SMTP/SendGrid เดิม

## 1. วัตถุประสงค์และขอบเขต

ระบบต้องรองรับ Cloud POS/Mobile POS สำหรับร้านค้าใน Event ผ่าน Tablet, iPad
หรือ PC โดยมีเป้าหมายดังนี้:

1. ขายสินค้าได้รวดเร็วและผูกยอดขายกับ Event, ร้าน, จุดขาย, กะ และพนักงานได้
2. ตรวจสอบเงินทอน เงินสด PromptPay บัตร และหลักฐาน E-slip ตอนปิดกะได้
3. ใช้งานต่อได้อย่างควบคุมเมื่อเครื่องรีเฟรช ไฟตก หรือเครือข่ายไม่เสถียร
4. มี inventory ledger กลางรองรับ POS, online order, PO และ partial receiving
5. แยก Gross Sales, Surcharge, Gateway Fees, Refund และ Net Settlement ได้
6. ป้องกัน double charge, double sale, lost stock update และการแก้ประวัติย้อนหลัง
7. ใช้โครงสร้าง security, Event scope, audit, GCS, Secret Manager/KMS และ
   deployment ของ PSEvent เดิม

ข้อกำหนดฮาร์ดแวร์:

- ไม่ใช้ cash drawer ที่เชื่อมกับระบบ
- ไม่ใช้ thermal printer หรือใบเสร็จกระดาษ
- ใบเสร็จเป็น E-slip เท่านั้น และส่ง/แสดงผ่านหน้าจอ, QR, email หรือ LINE ตาม
  consent และ feature flag
- รองรับ barcode scanner แบบ keyboard wedge และกล้อง browser เป็น optional
- ต้องใช้งานด้วย touch ได้โดยไม่พึ่ง hover หรือ physical keyboard

## 2. การประยุกต์เข้ากับ PSEvent เดิม

### 2.1 สถาปัตยกรรมเป้าหมาย

```text
POS Browser/PWA on managed device
  -> POS frontend bundle/subdomain or Plesk HTTPS gateway
  -> Cloud Run Node.js API boundary
      -> MongoDB replica set: operational source of truth
      -> private GCS: canonical E-slip images
      -> Stripe: card/PromptPay payment processor
      -> Brevo Transactional Email API: email receipt/OTP/fallback alerts
      -> LINE Messaging API: optional manager alert
      -> Secret Manager/KMS: provider secrets and encryption keys
      -> MariaDB: optional reporting mirror only
```

- POS UI อาจอยู่เป็น frontend bundle/route/subdomain แยกจาก Event UI ได้ แต่ต้องใช้
  SSO/Identity contract, Event catalog/context API และ trusted origin ที่กำหนด
- Plesk ทำหน้าที่ SPA/gateway เท่านั้น ห้ามเก็บ Stripe secret, Mongo URI,
  database password, GCP credential, Brevo API key หรือ LINE channel access token
- Cloud Run เป็น component เดียวที่เรียก Stripe, MongoDB, GCS, KMS, Brevo และ LINE
- POS ทุก record ต้องผูก `organizationId`, `eventId`, `vendorId` และ
  `locationId`; ห้าม fallback ไป current Event ใน write operation
- SSO/Identity เป็นเจ้าของ login/session/step-up auth; POS ต้องตรวจ `pos:*`,
  event/vendor/location/terminal/shift scope ซ้ำทุก write
- Event System เป็นเจ้าของ event setup/registration/check-in และ POS ห้ามแก้
  participant registration record โดยตรงนอก contract ที่อนุมัติ
- MariaDB ยังคงเป็น reporting mirror และต้องคง `SQL_PRIMARY_STORE=false`
- POS/Inventory ห้าม reuse `Package.stock/sold` โดยตรง ต้องมี inventory ledger
  ใหม่และใช้ migration/adapter ที่ตรวจสอบได้หากต้องนำ Package เดิมมาขาย

### 2.2 Source of Truth Matrix

| Domain | Source of truth | Secondary/cache |
|---|---|---|
| Product, variant, location | MongoDB | IndexedDB read cache |
| Order, payment state | MongoDB + Stripe event evidence | IndexedDB pending view |
| Inventory quantity | immutable MongoDB movement ledger | materialized balance |
| Shift/float/close | MongoDB | IndexedDB close draft |
| Canonical E-slip image | private GCS | IndexedDB device cache |
| E-slip metadata/hash | MongoDB | MariaDB reporting mirror |
| Stripe fee/net | Stripe Balance Transaction reconciled into MongoDB | reports/mirror |
| PO/goods receipt/AP | MongoDB | MariaDB reporting mirror |
| Offline commands | IndexedDB outbox until server acknowledgement | server idempotency record |

IndexedDB ไม่ใช่หลักฐานทางบัญชีและไม่ใช่ backup เพราะผู้ใช้, browser, OS หรือ
storage pressure สามารถล้างหรือแก้ข้อมูลได้

## 3. ผู้ใช้ บทบาท และสิทธิ์

### 3.1 บทบาท

- `pos_cashier`: ขายสินค้าในกะ/จุดขายที่ได้รับมอบหมาย, ยืนยัน float และ blind
  close ของตน
- `pos_supervisor`: ช่วยปลด incident, void ก่อนชำระ และอนุมัติ override ตาม
  policy แต่ดู expected close ก่อน cashier submit ไม่ได้
- `store_manager`: เปิด/ปิด/ตรวจรับกะ, กำหนด float, review variance,
  negative-stock override และ alert
- `inventory_staff`: รับสินค้า, transfer, count และ adjustment ตาม location
- `procurement_admin`: จัดการ supplier, PO, force close และ approval
- `accountant`: อ่าน settlement/AP, reconcile fee/refund/payout และ export
- `auditor`: อ่าน order, ledger, shift close และ audit โดยแก้ข้อมูลไม่ได้
- `event_admin/superadmin`: ตั้ง policy และ role mapping ใน Event scope

### 3.2 Permission ที่ต้องเพิ่ม

- `pos:sell`, `pos:void`, `pos:refund`, `pos:negative-stock-override`
- `shift:open`, `shift:acknowledge`, `shift:close`, `shift:review`
- `inventory:read`, `inventory:receive`, `inventory:transfer`,
  `inventory:adjust`
- `po:manage`, `po:approve`, `po:force-close`
- `settlement:read`, `settlement:reconcile`, `pos:report-export`
- `pos:device-manage`, `pos:policy-manage`

ทุก permission ต้องตรวจทั้ง role, organization, Event, vendor, location และกะ
ห้ามใช้ role name อย่างเดียวเป็น authorization

### 3.3 Separation of Duties

- Cashier ห้ามเปิดกะหรือแก้ float ของตนเอง
- ผู้เปิดกะไม่ควรเป็นผู้อนุมัติ variance ของกะเดียวกัน เว้นแต่มี break-glass
  reason และ audit
- ผู้สร้าง PO ที่เกิน approval threshold ห้าม approve PO นั้นเอง
- Inventory adjustment, force close PO, refund หลังปิดกะ และ delete/void
  หลังชำระต้องใช้ step-up authentication และ reason code

## 4. Data Contract และหลักการร่วม

### 4.1 Identifier และจำนวนเงิน

- Public identifier ใช้ opaque UUID/ULID; ห้ามใช้ลำดับที่เดาได้เป็น credential
- จำนวนเงินทุก field ใช้ integer หน่วยสตางค์ เช่น `amountMinor=1050` เท่ากับ
  10.50 บาท ห้ามใช้ floating point
- Currency ของ Event POS Phase 1 คือ `THB`; order หนึ่งรายการห้ามมีหลาย currency
- เก็บทั้ง UTC timestamp และ `businessDate` ตาม Event timezone
- Price, tax, discount, surcharge และ cost ต้อง snapshot ลง order line ตอนขาย
  เพื่อไม่ให้การแก้ catalog เปลี่ยนรายงานย้อนหลัง
- Counter/receipt number ต้อง unique ต่อ Event/location/business date และออกจาก
  atomic counter; เลขขาดช่วงได้และห้ามนำเลขเดิมกลับมาใช้
- Node.js/MongoDB ใช้ field แบบ camelCase ตาม codebase เดิม ส่วน SQL/report/export
  ใช้ snake_case ผ่าน explicit mapper; `hasNegativeStockOverride` ต้อง map เป็น
  `has_negative_stock_override` และ `totalPayableAmountMinor` ต้อง map เป็น
  `total_payable_amount_minor` โดยห้ามมี mapper สองชุดให้ความหมายต่างกัน

### 4.2 Collection เป้าหมาย

- `PosLocations`, `PosTerminals`, `PosDeviceSessions`
- `PosShifts`, `ShiftCloseSubmissions`, `ShiftReconciliationFindings`
- `Products`, `ProductVariants`, `InventoryBalances`, `InventoryMovements`
- `StockReservations`, `PosOrders`, `PosPayments`, `PaymentProviderEvents`
- `ESlipRecords`, `Suppliers`, `PurchaseOrders`, `GoodsReceipts`
- `AccountsPayableEntries`, `ManagerAlerts`, `IdempotencyRecords`

ข้อมูลทางการเงินและ stock movement ต้อง append-only หลังสถานะ final การแก้ไขใช้
reversal/adjustment record ที่อ้าง record เดิม ห้าม update/delete ประวัติทิ้ง

### 4.3 State Machine หลัก

Shift:

```text
DRAFT -> OPEN_PENDING_ACK -> OPEN -> CLOSING -> SUBMITTED
      -> REVIEW_REQUIRED -> APPROVED -> CLOSED
```

Order:

```text
DRAFT -> CHECKOUT_PENDING -> PAYMENT_PENDING -> PAID -> FULFILLED
                  |              |       -> PARTIALLY_REFUNDED -> REFUNDED
                  +-> CANCELLED  +-> PAYMENT_FAILED/EXPIRED
```

Purchase Order:

```text
DRAFT -> APPROVED -> SENT -> PARTIALLY_RECEIVED -> FULLY_RECEIVED -> CLOSED
                       |                 +-> CLOSED (force close)
                       +-> CANCELLED
```

Transition ทุกตัวต้องใช้ server-side allowlist, optimistic version และ audit;
client ส่งสถานะปลายทางเองโดยไม่มี action-specific endpoint ไม่ได้

## 5. Shift และ Cash Float Management

### POS-SHF-001: เปิดกะโดยผู้จัดการ

- Manager เลือก Event, vendor, location, terminal, cashier, เวลาเริ่ม และ float
- Cashier หนึ่งคนมีได้ไม่เกินหนึ่งกะ `OPEN_PENDING_ACK/OPEN/CLOSING` ต่อ
  location เว้นแต่ policy อนุญาต multi-terminal
- Terminal หนึ่งเครื่องมี active shift ได้ไม่เกินหนึ่งกะ
- `cashFloatMinor` เป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไปและมี upper limit ตาม policy
- Cashless Day ใช้ `cashPolicy=cashless`, float ต้องเป็น 0 และ payment method
  cash ต้องถูกปิดทั้ง UI และ backend
- การเปิดกะต้องมี manager identity, timestamp, policy version และ audit

### POS-SHF-002: Lock Screen และ Float Acknowledgement

- POS ต้อง lock เมื่อไม่มี active device session/shift, shift ยังไม่ acknowledge,
  shift ถูก suspend หรือ session หมดอายุ
- Lock ต้องบังคับที่ API ด้วย ไม่ใช่เพียงซ่อนปุ่มใน frontend
- หลัง manager มอบหมายกะ Cashier เห็นเฉพาะ float ที่ต้องรับและรายละเอียดกะ
- Cashier กด `ได้รับครบ` หรือ `ได้รับไม่ครบ`; กรณีไม่ครบต้องระบุ actual amount
  และ reason แล้วส่งกลับให้ manager แก้/อนุมัติก่อน unlock
- Acknowledgement ต้องบันทึก cashier, terminal, server timestamp, amount,
  device session และ policy version
- การ refresh/offline ห้ามข้าม acknowledgement; cache ใช้แสดงสถานะได้แต่ server
  เป็นผู้อนุญาต unlock

### POS-SHF-003: Blind Close

- ตอน Cashier ปิดกะ API ห้ามส่ง expected cash, expected online amount,
  variance หรือจำนวน order ที่ควรมีลง browser ก่อน submit
- ต้องไม่ฝังค่า expected ใน HTML, React state, IndexedDB, log หรือ hidden field
- Cashier ยืนยันว่า float ถูกแยกครบหรือไม่; ถ้าไม่ครบระบุ actual float/reason
- Cashier นับ denomination ที่เปิดใช้ เช่น 1,000/500/100/50/20 บาท และ
  10/5/2/1 บาท ระบบคำนวณ declared cash จาก count ที่เป็นจำนวนเต็มไม่ติดลบ
- Cashier กรอก declared PromptPay/card count และ total แยก payment method
- Close draft auto-save ลง IndexedDB แต่ต้องเข้ารหัสระดับ application เมื่อมี
  note ที่อาจมีข้อมูลอ่อนไหวและต้องลบหลัง server acknowledge/retention หมด
- Submit ต้องมี idempotency key; duplicate submit ต้องคืน close record เดิม
- หลัง submit ค่า declared ถูก freeze และ server จึงคำนวณ variance/reconciliation

สูตรขั้นต่ำ:

```text
expectedCash = openingFloat + cashSales + cashIn
             - cashRefunds - cashOut - cashDrops
cashVariance = declaredCashIncludingSeparatedFloat - expectedCash
```

ต้องกำหนดให้ชัดว่า denomination count รวม float ที่แยกไว้หรือไม่; ค่าเริ่มต้น
คือรวมทั้งหมดและเก็บ `declaredFloatMinor` แยกเพื่อป้องกัน double count

### POS-SHF-004: Manager Review และ Reopen

- Manager เห็น declared, expected, variance และ findings หลัง Cashier submit เท่านั้น
- Variance threshold กำหนดต่อ Event/location/payment method
- กะที่ mismatch ต้องเป็น `REVIEW_REQUIRED` และห้ามหายจาก dashboard
- การแก้ declaration ใช้ amendment version ใหม่พร้อม reason/approver; ห้ามแก้
  submission เดิม
- Reopen shift หลัง submit ต้องใช้ step-up, change reference และเหตุผล
- ปิดกะสำเร็จเมื่อ payment, E-slip manifest และ inventory reconciliation ผ่านหรือ
  manager ยอมรับ exception ที่มี owner/due date

## 6. หน้าจอขายและ Order Flow

### POS-SALE-001: Catalog และตะกร้า

- แสดง product/variant เฉพาะ Event/vendor/location ที่ active และขายได้
- รองรับค้นหาชื่อ, SKU, barcode และหมวดหมู่
- Barcode ซ้ำภายใน active scope ต้องถูก reject ตอนจัดการ catalog
- สแกนซ้ำเพิ่ม quantity ได้ หรือแก้ quantity ด้วย stepper/numeric input
- Quantity ต้องเป็น integer > 0 และไม่เกิน per-line/per-order policy
- แก้ quantity แล้วต้องคำนวณ subtotal, discount, tax และ total บน server ซ้ำ
  ตอน checkout; client calculation ใช้ preview เท่านั้น
- ตะกร้าต้อง auto-save แบบ debounce ลง IndexedDB โดยแยก key ตาม Event,
  terminal, cashier และ shift
- เมื่อเปิดเครื่องใหม่ต้องถามให้ Cashier restore/discard cart พร้อมแสดงอายุและ
  terminal เดิม; discard ต้อง audit เฉพาะเมื่อ cart เคยเข้าสู่ checkout

### POS-SALE-002: Pricing

- Server เป็นผู้ resolve price list, promotion, discount, tax และ surcharge policy
- Manual discount/price override ต้องมี permission, reason และ approval threshold
- Order line เก็บ `catalogPriceMinor`, `discountMinor`, `taxMinor`,
  `netLineMinor`, product name/SKU snapshot และ pricing policy version
- Total ต้องตรวจ invariant: ผลรวม line, discount, tax, surcharge และ rounding
  ตรงกับ amount ที่ส่ง Stripeทุกครั้ง
- ห้ามเปลี่ยน amount หลังสร้าง PaymentIntent; ต้อง cancel intent เดิมและสร้างใหม่

### POS-SALE-003: Negative Stock Soft Warning

- Availability ใช้ `onHand - activeAllocation`; ห้ามดูแค่ field `stock`
- ถ้า availability หลังขาย < 0 ให้ server ตอบ conflict code
  `NEGATIVE_STOCK_CONFIRMATION_REQUIRED` พร้อม current availability/version
- UI แสดง warning สีเหลือง ไม่ใช้สี/ข้อความที่ดูเหมือน payment success
- Cashier ต้องมี `pos:negative-stock-override` หรือขอ supervisor approval และ
  เลือก reason เช่น count lag, damaged record, emergency sale
- Confirmation request ต้องมี short-lived challenge/version เพื่อกันการใช้
  confirmation เก่าหลัง stock เปลี่ยน
- เมื่อยืนยัน ระบบเขียน movement ให้ balance ติดลบได้และบันทึก
  `hasNegativeStockOverride=true` (report alias
  `has_negative_stock_override=true`), approver, reason และ observed stock ใน order
- Manager dashboard ต้องมี unresolved negative stock queue; การรับของภายหลัง
  ไม่ลบ finding เดิม
- หาก policy ของสินค้าเป็น `hard_stop` ห้าม override แม้ Cashier มี permission

### POS-SALE-004: Commit, Void, Refund

- Cash sale commit order และ inventory movements ใน MongoDB transaction เดียว
- Stripe sale reserve stock ตอนเริ่ม checkout และ commit movement เมื่อ webhook
  ยืนยัน `PAID`; failed/expired intent ต้อง release reservation แบบ idempotent
- Void ก่อนชำระต้อง release reservation และเก็บเหตุผล
- หลัง `PAID` ใช้ refund/reversal flow เท่านั้น ห้ามเปลี่ยน order เป็น cancelled
- Partial refund ต้องอ้าง line/quantity หรือ explicit amount reason และคืน stock
  เฉพาะนโยบาย `restockable` ที่ผ่านการรับคืนจริง
- Duplicate request จาก retry ต้องสร้าง order/payment/movement เพียงชุดเดียว

## 7. Payment และ Stripe

### POS-PAY-001: Payment Method Policy

- รองรับ `cash`, `stripe_promptpay`, `stripe_card`; method อื่นปิดโดย default
- Cashless Day ปิด cash ที่ backend ไม่ใช่เพียง UI
- Split tender และ tip ไม่อยู่ใน Phase 1 เว้นแต่มี Requirement/state model เพิ่ม
- Internet ขาดต้องปิด Stripe checkout; ห้ามแสดง payment success จาก QR,
  screenshot หรือ client callback โดยไม่มี server confirmation

### POS-PAY-002: PaymentIntent และ Idempotency

- Backend สร้าง Stripe PaymentIntent ด้วย amount/currency จาก order snapshot
- ใช้ idempotency key แบบสุ่มต่อ checkout attempt และเก็บเฉพาะ hash เมื่อใช้เป็น
  bearer-like value
- เก็บ Stripe object ID ตาม least exposure; client secret ส่งเฉพาะ session ที่
  สร้าง intent และห้าม log/persist เกินอายุ checkout
- Client status เป็นเพียง UX hint; fulfillment ต้องเกิดจาก verified webhook
- Webhook ต้องตรวจ `Stripe-Signature` กับ raw body, deduplicate `event.id`,
  รองรับ event มาซ้ำ/สลับลำดับ และตอบเร็วหลัง durable enqueue/transaction
- Webhook amount, currency, account/live mode, metadata Event/order และ payment
  method ต้องตรงกับ order ก่อนเปลี่ยนเป็น `PAID`
- `processing` ไม่เท่ากับ `paid`; inventory/receipt finalization ต้องรอ success
- มี reconciliation job ดึงสถานะ provider แบบ bounded สำหรับ webhook ที่หาย
  โดยไม่ polling ทุก order ถี่จนชน rate limit

### POS-PAY-003: PromptPay

- PromptPay รับเฉพาะ THB และแสดง QR จาก Stripe flow
- QR ต้องผูก payment attempt, amount และ expiry; ห้ามนำ static vendor QR ของ
  Digital Wallet มาใช้แทน Stripe PromptPay
- เมื่อ intent สำเร็จแล้ว UI ต้องหยุดแสดง QR และเตือนว่าไม่ควรสแกนซ้ำ
- กรณี payment เกิน/ซ้ำต้องเข้า exception queue และไม่สร้างยอดขายซ้ำ
- Refund/partial refund ต้องรองรับขั้นตอนที่ Stripe อาจต้องติดต่อผู้ชำระเพื่อขอ
  ข้อมูลบัญชี; UI ห้ามรับรองว่าจะคืนเงินทันที
- ต้นทุน PromptPay ที่รวมในราคาสินค้าต้องเก็บเป็น pricing policy/cost model ไม่
  แสดงเป็น Stripe fee ที่ยังไม่เกิดจริง

### POS-PAY-004: Card Surcharge

- Feature `CARD_SURCHARGE_ENABLED` ปิดโดย default
- เปิดได้เมื่อฝ่ายกฎหมาย/บัญชี, Stripe account agreement และ card network/acquirer
  policy ที่ใช้จริงอนุมัติ พร้อมเก็บ approval reference/effective date
- Surcharge ต้องแสดงแยกก่อนยืนยัน, ห้ามซ่อน, ห้ามเกิน cap ที่อนุมัติ และต้องรวม
  ใน PaymentIntent amount/receipt/tax treatment อย่างสอดคล้อง
- หาก rule เปลี่ยน ระบบต้อง version policy; order เก่าใช้ snapshot เดิม
- ถ้า validation/approval หมดอายุ backend ต้อง fail closed และคิด surcharge 0

### POS-PAY-005: Stripe Fee และ Settlement

- Fee ที่แสดงตอนขายเป็น `estimatedFeeMinor` เท่านั้น
- Actual `feeMinor` และ `netSettlementMinor` ต้องมาจาก Stripe Balance
  Transaction/settlement reconciliation ไม่คำนวณจากเปอร์เซ็นต์คงที่
- เก็บ provider object mapping, available date, payout reference และ
  reconciliation status โดยไม่เก็บข้อมูลบัตร
- Refund, fee refund, chargeback, reserve, FX และ payout adjustment ต้องเป็น
  ledger entry แยก ไม่เขียนทับยอด sale เดิม

## 8. E-Slip และ Local-First Storage

### POS-SLP-001: Canonical E-Slip

- Node.js สร้าง E-slip หลัง verified payment success หรือ cash commit เท่านั้น
- ใช้ renderer ที่ deterministic และ pin version/font/template
- E-slip ต้องมี opaque receipt number, order time, location, items, amount,
  payment method แบบ masked, refund state และ verification ID/QR
- ห้ามมี PAN, CVC, Stripe client secret, raw provider payload หรือ PII ที่ไม่จำเป็น
- Image ต้นฉบับเก็บใน private GCS พร้อม checksum, object generation, purpose,
  Event scope และ retention; MongoDB เก็บ metadata ไม่เก็บ binary
- Signed URL อายุสั้น, `Cache-Control: private/no-store` ตาม flow และทุก access
  ต้องตรวจสิทธิ์/audit

### POS-SLP-002: ปุ่มบันทึกสลิปและ IndexedDB

- หลัง server สร้าง receipt UI ต้องพยายาม cache E-slip ลง IndexedDB อัตโนมัติ
- ปุ่ม `บันทึกสลิป` หมายถึง retry/ยืนยัน local cache หรือบันทึกผ่าน Web Share /
  Files API ที่รองรับ ไม่ใช่การสร้างหลักฐานการชำระ
- Local record เก็บ receipt ID, server checksum, order ID, savedAt, sync state
  และ blob ที่ผ่าน size cap
- UI แสดง `บันทึกในเครื่องแล้ว`, `รอบันทึก`, `พื้นที่ไม่พอ` หรือ `ตรวจสอบไม่ผ่าน`
  อย่างชัดเจน
- การลืมกดปุ่มอาจเป็น operational finding แต่ห้ามทำให้ canonical receipt หาย
- เมื่อ IndexedDB unavailable/เต็ม ระบบยังขายออนไลน์ได้ถ้า server/GCS พร้อม แต่
  ต้องเตือน manager และกำหนดว่าจะ block กะใหม่หรือไม่ตาม policy

### POS-SLP-003: Close Manifest และ Batch Upload

- ตอนปิดกะ client ส่ง manifest ของ receipt ID/checksum/local state ก่อน
- Server เปรียบเทียบกับ paid orders/canonical E-slip ในกะโดยไม่เชื่อ count/amount
  จาก client
- Upload เฉพาะ blob ที่ server ขอเพราะ canonical object ขาดหรือ checksum ต้อง
  ตรวจซ้ำ; ห้ามอัปโหลดรูปซ้ำทุกใบโดยไม่มีเหตุผล
- แต่ละ upload ใช้ idempotency key, checksum, content signature และ size limit
- Queue ส่งแบบ bounded concurrency, retry exponential backoff + jitter,
  pause/resume และเก็บ server acknowledgement ต่อไฟล์
- Resume ต้องเริ่มจากไฟล์ที่ยังไม่ได้ acknowledge ไม่เริ่ม batch ใหม่
- Server reject blob ที่ receipt/Event/shift ไม่ตรง, image decode ไม่ได้,
  checksum ผิด หรือ receipt ถูก revoke

### POS-SLP-004: Local Data Security

- POS ใช้ managed device, OS account แยก, screen lock, disk encryption และ browser
  profile เฉพาะงาน
- IndexedDB ห้ามเก็บ card data, provider secret, full webhook, auth refresh token
  หรือ customer PII ที่ไม่จำเป็น
- Device cache มี TTL และ purge หลัง shift approved + grace period
- Logout/revoke device ต้องล้าง key/cache ตาม policy แต่ pending outbox ต้องถูก
  quarantine เพื่อให้ manager recovery ไม่สูญข้อมูลเงียบ
- WebCrypto non-extractable key ช่วยลด casual exposure แต่ห้ามกล่าวอ้างว่า
  ป้องกัน XSS/local administrator ได้; CSP/XSS prevention และ device control ยังจำเป็น

## 9. Offline-First และ State Recovery

### POS-OFF-001: Connectivity State

UI ต้องมีสถานะ `ONLINE`, `DEGRADED`, `OFFLINE`, `SYNCING`, `CONFLICT` และแสดง
สถานะจริงโดยไม่ใช้สีอย่างเดียว

| Action | Online | Offline default |
|---|---|---|
| ดู cached catalog | ได้ | ได้พร้อมเวลา sync ล่าสุด |
| แก้/กู้ cart | ได้ | ได้ |
| Stripe PromptPay/card | ได้ | ห้ามเริ่ม/ยืนยัน |
| Cash sale | ได้ | ปิดโดย default; เปิดได้ด้วย approved offline-cash policy |
| Float acknowledgement | ต้อง server confirm | ห้าม unlock ใหม่ |
| Blind close draft | ได้ | บันทึก draft ได้ แต่ submit final ไม่ได้ |
| PO receiving/stock adjustment | ได้ | queue draft ได้; ห้ามถือว่า committed |

### POS-OFF-002: Client Outbox

- ทุก queued command มี `commandId`, idempotency key, aggregate ID/version,
  dependency, createdAt, device/shift identity และ payload hash
- Outbox แยก command metadata จาก blob; ห้าม log payload อ่อนไหว
- Sync ตาม dependency เช่น order ก่อน receipt manifest และ goods receipt ก่อน AP
- Network timeout ถือเป็น unknown outcome; ต้อง query idempotency/status ก่อน retry
- Server acknowledgement ต้อง durable ก่อน client ลบ command
- Conflict ต้องหยุดเฉพาะ aggregate ที่เกี่ยวข้องและให้ user resolve; ห้าม last-write-wins
  กับ money, payment, shift close หรือ inventory
- ไม่พึ่ง Background Sync API อย่างเดียวเพราะ browser support ต่างกัน; ต้องมี
  app-level resume เมื่อเปิดหน้าใหม่

### POS-OFF-003: Offline Cash Exception

หากธุรกิจต้องเปิด cash sale ตอน offline ต้องผ่าน phase/approval แยกและมี:

- pre-issued terminal order number range ที่ไม่ซ้ำ
- catalog/policy version ที่ยังไม่หมดอายุ
- per-order และ per-shift offline amount limit
- local append-only journal + hash chain
- explicit `OFFLINE_UNVERIFIED` state; ห้ามออก final verified receipt ก่อน sync
- server reconciliation/idempotent commit และ conflict queue
- supervisor approval เมื่อ stock ติดลบหรือ policy เปลี่ยนระหว่าง offline

ค่าเริ่มต้น Phase 1 คือ `OFFLINE_CASH_SALES_ENABLED=false`

### POS-OFF-004: Recovery

- Refresh/crash ต้องกู้ active shift context, cart, pending payment view, close draft
  และ outbox หลัง re-authentication
- ห้าม restore cart จาก Event/vendor/shift อื่น
- Payment pending ต้องถาม server/Stripe-backed status ก่อนให้ retry
- Client clock drift เกิน threshold ต้องเตือนและใช้ server timestamp เป็นหลัก
- Browser storage corruption ต้อง isolate record, ไม่ล้างทั้งหมดอัตโนมัติ และสร้าง
  metadata-only diagnostic report

## 10. Shift Reconciliation และ Manager Alerts

### POS-REC-001: Cross-check

Server ต้องเปรียบเทียบอย่างน้อย:

- declared cash กับ expected cash ledger
- declared PromptPay/card count/amount กับ paid provider orders
- Stripe paid orders กับ verified webhook/event reconciliation
- paid orders กับ canonical E-slip records และ client manifest
- order lines กับ inventory sale/reversal movements
- refund กับ returned/restocked quantity
- negative stock override ที่ยังไม่ review

Finding ใช้ severity `INFO/WARNING/CRITICAL`, code ที่คงที่, amount/count delta,
owner, due date, status และ resolution audit โดยไม่เปิด PII ใน notification

### POS-REC-002: Alert Channel

- LINE Notify ห้ามใช้ เพราะบริการยุติแล้ว
- ช่องทางที่อนุมัติคือ LINE Messaging API push ผ่าน Official Account และ Web
  Dashboard; email fallback ต้องส่งผ่าน Brevo Transactional Email API หรือ
  approved SMTP fallback เท่านั้น
- LINE recipient ต้อง opt-in/add friend และผูกกับ manager account ตามนโยบาย
- Alert ส่งผ่าน durable outbox, deduplicate และ retry แบบ bounded
- ข้อความ LINE แสดง Event/location/shift/finding code/severity/ลิงก์ dashboard
  เท่านั้น ห้ามใส่ชื่อผู้ซื้อ, slip image, token หรือรายละเอียดการเงินเกินจำเป็น
- Dashboard เป็น source of truth; LINE/Brevo delivery fail ห้ามทำให้ close
  transaction rollback
- ต้องตรวจ quota/ค่าใช้จ่าย Messaging API และมี fallback เมื่อ block/quota เต็ม

## 11. Inventory Management

### POS-INV-001: Unified Inventory Ledger

- สต๊อกรวมศูนย์แต่แยก balance ต่อ `eventId/locationId/variantId`
- Movement type อย่างน้อย: `OPENING`, `PURCHASE_RECEIPT`, `SALE`,
  `SALE_REVERSAL`, `RETURN`, `TRANSFER_OUT`, `TRANSFER_IN`, `ADJUSTMENT`,
  `DAMAGE`, `RESERVATION_COMMIT`
- Movement เป็น immutable มี quantity delta, unit, source type/ID, actor,
  reason, server time และ idempotency key
- `InventoryBalance` เป็น materialized projection ที่ update ใน transaction เดียวกับ
  movement; reconciliation ต้องสร้าง balance ใหม่จาก ledger เพื่อตรวจ drift ได้
- Quantity รองรับ integer Phase 1; สินค้าที่ขายเป็นน้ำหนักต้องเพิ่ม decimal/UOM
  design ก่อนเปิด
- Adjustment ห้ามใช้แก้ยอดขายย้อนหลังและต้องมี count session/approval

### POS-INV-002: Stock Reservation/Soft Allocation

- Online order สร้าง reservation แบบ atomic พร้อม `expiresAt`, quantity และ source
- Availability = on hand - active reservations; TTL deletion อย่างเดียวห้ามเป็น
  business release mechanism ต้องมี expiry worker/query semantics
- Checkout ของ POS สามารถ reserve ช่วงสั้นเมื่อเริ่ม payment เพื่อกัน oversell
- Commit/release ต้อง idempotent และอ้าง reservation เดิม
- Expired payment/order ต้อง release; paid webhook ที่มาหลัง expiry เข้า conflict
  policy ไม่สร้าง movement ซ้ำ
- กำหนด channel priority, reservation TTL และ negative override policy ต่อ Event
- Manager ดู active/expired/stuck reservation และสั่ง release ด้วย audit ได้

### POS-INV-003: Transfer, Count และ Reconciliation

- Transfer ใช้คู่ movement OUT/IN ที่ผูก transfer ID เดียวและมี in-transit state
- Location ปลายทางต้องรับยืนยัน; lost/damaged ระหว่างทางใช้ adjustment แยก
- Cycle count ซ่อน system quantity ได้แบบ blind count และคำนวณ variance หลัง submit
- Negative balance และ ledger projection mismatch ต้องสร้าง alert
- Report ต้องแยก on hand, allocated, available, in transit และ negative quantity

## 12. Purchase Order และ Goods Receipt

### POS-PO-001: Purchase Order

- PO มี supplier, Event/location, currency, line SKU/UOM, ordered quantity,
  unit cost snapshot, tax/discount/charge, expected date และ approval status
- PO number unique และ immutable หลัง approved; amendment ใช้ version/change order
- Ordered, received, accepted, rejected, cancelled และ outstanding quantity แยกกัน
- ห้าม receive เกิน outstanding เว้นแต่ over-receive tolerance/approval

### POS-PO-002: Partial Receiving

- Goods Receipt เป็นเอกสารแยกจาก PO และรองรับหลาย receipt ต่อ PO
- Admin ระบุ received, accepted, damaged/rejected, lot/expiry (ถ้ามี), location,
  supplier document และ note
- `Keep PO Open`: update เฉพาะ accepted quantity/movement และสถานะ
  `PARTIALLY_RECEIVED`; outstanding ยังคงเปิด
- `Force Close`: ต้องมี `po:force-close`, step-up, reason และ approval; cancel
  outstanding โดยไม่สร้าง stock/payable
- รับครบเปลี่ยน `FULLY_RECEIVED`; `CLOSED` หมายถึงไม่มี action ค้างและผ่าน review
- Duplicate receipt submit ต้องไม่เพิ่ม stock/AP ซ้ำ

### POS-PO-003: Accounts Payable

AP ตั้งจาก accepted quantity จริง:

```text
linePayable = acceptedQuantity * lockedUnitCost
totalPayable = sum(linePayable) + allocatedAcceptedCharges
             + acceptedTax - acceptedDiscount
```

ค่าที่ persist ใช้ `totalPayableAmountMinor` และ projection/report ใช้
`total_payable_amount_minor`; ทั้งสองต้องเป็น integer หน่วยสตางค์และมาจากสูตร
เดียวกัน ส่วนชื่อธุรกิจ `total_payable_amount` เป็น display/decimal projection
ที่ derive จาก minor unit เท่านั้น ห้ามใช้ floating point field นี้เป็น source of truth

- Rejected/damaged ที่ไม่รับเข้า stock ไม่ตั้ง payable เว้นแต่ contract ระบุและมี
  accounting adjustment แยก
- AP entry อ้าง Goods Receipt และ supplier invoice; unique ป้องกัน invoice ซ้ำ
- Credit note, return-to-vendor และ cost variance ใช้ adjustment ledger
- Force close PO ไม่ลบ AP ที่เกิดจาก receipt ก่อนหน้า
- Payment status ของ AP แยก `UNBILLED/OPEN/PARTIALLY_PAID/PAID/DISPUTED/VOID`

## 13. Accounting และ Reporting

### POS-ACC-001: Revenue Structure

รายงานต้องแยก:

- `merchandiseGrossMinor`: ราคาสินค้าก่อน discount/refund
- `discountMinor`, `taxMinor`, `surchargeMinor`
- `customerPaidGrossMinor`: ยอดที่ลูกค้าชำระจริง
- `estimatedGatewayFeeMinor` และ `actualGatewayFeeMinor`
- `refundMinor`, `chargebackMinor`, `adjustmentMinor`
- `netSettlementMinor`: actual Stripe balance impact หลัง fee

ห้ามใช้คำว่า Net Revenue แทน payout โดยไม่ระบุสูตร/สถานะ เพราะ payout อาจรวม
หลายวัน, reserve, refund หรือ adjustment

### POS-ACC-002: Reconciliation Dimensions

- รายงานตาม Event, vendor, location, terminal, shift, cashier, business date,
  product, payment method และ provider settlement
- Timezone/cutoff ต้อง versioned; การเปลี่ยน cutoff ห้ามเปลี่ยน report เก่า
- แยก `operational sale date`, `provider available date`, `payout date`
- Export ต้องมี permission, reason, watermark/hash, row limit และ audit
- MariaDB mirror อ่านเพื่อ report ได้หลัง protection audit/reconciliation ผ่าน แต่
  write transaction ยังคงเกิดใน MongoDB

### POS-ACC-003: Tax/Receipt Boundary

- ก่อนเรียก E-slip ว่าใบกำกับภาษี ต้องผ่านการทบทวนรูปแบบ เลขประจำตัวผู้เสียภาษี,
  VAT, running number, retention และข้อกำหนดกรมสรรพากรที่ใช้จริง
- ค่าเริ่มต้นใช้คำว่า `ใบเสร็จอิเล็กทรอนิกส์/หลักฐานการขาย` และไม่อ้างว่าเป็น
  e-Tax Invoice
- Tax rule, surcharge treatment และ refund document ต้องมี accounting/legal
  approval ก่อน production

## 14. Infrastructure, HA, Backup และ DR

### POS-INF-001: MongoDB High Availability

- Production POS ต้องใช้ replica set อย่างน้อย 3 data-bearing nodes: 1 primary,
  2 secondary; ห้ามใช้ arbiter แทน data-bearing secondary สำหรับ durability gate
- กระจายอย่างน้อย 3 availability zones เมื่อ provider/region รองรับ
- Connection string ต้องเป็น replica-set/SRV, TLS, auth, retryable writes และ
  `w=majority`; transaction สำคัญ commit ด้วย majority write concern
- Driver ต้อง handle primary election/transient errors แบบ bounded และยืนยัน
  idempotency ก่อน retry unknown commit result
- ต้องทดสอบ failover ระหว่าง load โดย order/payment/stock ไม่ซ้ำหรือสูญ
- ห้ามรับรอง absolute zero downtime; กำหนด SLO เช่น recovery ภายใน 60 วินาที
  และ UI แสดง retry/unknown state อย่างปลอดภัย
- Database multi-region อย่างเดียวไม่ทำให้ระบบทน region outage หาก Cloud Run,
  GCS, Plesk หรือ provider integrations ยัง single-region

### POS-INF-002: Backup และ PITR

- เปิด automated encrypted snapshot อย่างน้อย daily
- เปิด continuous backup/PITR ตาม tier ที่รองรับ โดยกำหนด restore window ขั้นต่ำ
  7 วันหรือค่าที่ RPO/กฎหมายอนุมัติ
- กำหนด daily/weekly/monthly retention และ immutable/compliance policy ตามสิทธิ์
- Backup admin แยกจาก application runtime; runtime ห้ามลบ backup
- Restore ไป isolated environment อย่างน้อยรายไตรมาสและก่อน data migration ใหญ่
- Restore test ต้องตรวจ count, ledger checksum, index, encryption/decryption,
  payment/inventory invariant และเวลาที่ใช้จริง
- บันทึก RPO/RTO, snapshot/restore ID, operator, result และ cleanup evidence

### POS-INF-003: Geo-Redundancy

- Mongo backup ต้องมี additional copy ใน region อื่นเมื่อ POS production tier
  กำหนด regional-loss protection
- Canonical E-slip ใช้ GCS dual-region หรือ independent secondary bucket ผ่าน
  approved asynchronous replication
- Cross-bucket replication ต้องกำหนด deletion/lifecycle/retention แยก เพราะ
  source deletion และ lifecycle อาจไม่ replicate ตามที่คาด
- Replication lag ต้อง monitor; secondary copy checksum/inventory ต้องตรวจได้
- Encryption key/restore access ต้องพร้อมใน DR region โดยไม่ export plaintext key
- ต้องทำ regional-loss tabletop และ restore drill; backup copy ไม่เท่ากับ
  automatic failover

### POS-INF-004: Cost Gate

- งบ Google Cloud เดิม 1,000 บาท/เดือนไม่ถือว่าครอบคลุม MongoDB Atlas,
  Stripe fee, LINE quota หรือ Plesk fee โดยอัตโนมัติ
- 3-node HA, PITR และ cross-region copy มีค่าใช้จ่ายเพิ่มและต้องทำ forecast จาก
  storage, write rate, receipt size, retention, transfer และ restore testจริง
- ห้ามเปิด dual-region/cross-bucket replication, Pub/Sub หรือ dedicated Atlas
  tier จาก routine deploy โดยไม่มี cost approval
- หาก forecast รวมเกิน budget ต้องเลือกระหว่างปรับงบ, ลด retention/traffic ที่
  ไม่กระทบกฎหมาย, ใช้ backup DR แทน active multi-region หรือเลื่อน go-live;
  ห้ามลด TLS, backup, majority write หรือ audit เพื่อประหยัด
- Billing alert เป็นเพียงการแจ้งเตือน ไม่ใช่ hard cap และต้องมี owner ตอบสนอง

## 15. Security, Privacy และ PCI Boundary

### POS-SEC-001: Stripe/PCI

- ใช้ Stripe Checkout/Elements/SDK ที่ทำให้ card data ส่งตรงไป Stripe
- Backend/frontend/log/database ห้ามรับหรือเก็บ PAN เต็ม, CVC, magnetic stripe,
  PIN หรือ raw payment method payload
- Stripe secret/webhook secret อยู่ pinned Secret Manager version และ runtime SA
  อ่านได้เฉพาะ secret ที่จำเป็น
- Webhook endpoint มี signature verification, body-size limit, rate protection,
  duplicate handling และ metadata-only log
- ทำ PCI scope/SAQ assessment กับผู้รับผิดชอบก่อน production; การใช้ Stripe ไม่
  ทำให้ PCI obligation หายอัตโนมัติ

### POS-SEC-002: Authentication และ Device

- Cashier/manager ใช้ admin session เดิมพร้อม short idle timeout สำหรับ POS
- Action การเงินสำคัญใช้ step-up OTP/MFA และห้าม share account
- Register terminal ด้วย opaque device ID, approved location และ revoke state;
  browser fingerprint ไม่ใช้เป็น sole authentication
- Session ผูก Event/vendor/location/device/shift และ rotate เมื่อเปิดกะใหม่
- Lost device ต้อง revoke ได้และ pending local data มี incident procedure
- POS route ใช้ CSP, CSRF, exact origin, rate limit และ no-store สำหรับ sensitive UI

### POS-SEC-003: Data Protection

- ชื่อ/ข้อมูล supplier/cashier note ที่อ่อนไหวใช้ field encryption/blind index
  ตาม policy เดิม
- E-slip และ export private by default; public verification คืนข้อมูลขั้นต่ำ
- Audit log ห้ามเก็บ denomination note, PII, signed URL, Stripe secret/object body
  หรือ IndexedDB payload เต็ม
- กำหนด retention ต่อ order, receipt, payment, shift, alert และ device cache พร้อม
  legal hold/deletion workflow
- Data export/delete request ต้องไม่ทำลาย accounting record ที่กฎหมายต้องเก็บ;
  ใช้ masking/pseudonymization ตาม approved policy

## 16. API Contract เป้าหมาย

ทุก write endpoint ต้องมี auth, permission/scope, CSRF (เมื่อ cookie auth),
`Idempotency-Key`, schema validation, body limit, audit และ structured error code

| Endpoint | หน้าที่ |
|---|---|
| `POST /api/pos/shifts` | Manager เปิดกะและกำหนด float |
| `POST /api/pos/shifts/:id/acknowledge` | Cashier ยืนยัน float |
| `GET /api/pos/runtime` | คืน terminal/shift/catalog policy โดยไม่คืน blind expected |
| `POST /api/pos/shifts/:id/close-draft` | Validate close draft โดยไม่คำนวณ expected ให้ client |
| `POST /api/pos/shifts/:id/submit-close` | Freeze declaration และเริ่ม reconcile |
| `POST /api/pos/shifts/:id/review` | Manager approve/reject/amend finding |
| `POST /api/pos/orders` | สร้าง draft order |
| `PUT /api/pos/orders/:id/cart` | แก้ cart ด้วย aggregate version |
| `POST /api/pos/orders/:id/checkout` | Snapshot price/reserve stock |
| `POST /api/pos/orders/:id/negative-stock-confirm` | ยืนยัน override challenge |
| `POST /api/pos/orders/:id/payment-intents` | สร้าง Stripe intent |
| `GET /api/pos/orders/:id/payment-status` | กู้ unknown payment state |
| `POST /api/integrations/stripe/webhook` | Verified Stripe events |
| `GET /api/pos/receipts/:id` | Metadata/signed access ตามสิทธิ์ |
| `POST /api/pos/shifts/:id/receipt-manifest` | Compare local/canonical receipt |
| `POST /api/pos/receipt-recovery-uploads` | Upload blob ที่ server ร้องขอ |
| `GET /api/inventory/availability` | On hand/allocated/available ตาม scope |
| `POST /api/inventory/reservations` | Online soft allocation |
| `POST /api/inventory/transfers` | สร้าง transfer |
| `POST /api/inventory/counts` | Submit blind count |
| `POST /api/purchase-orders` | สร้าง PO |
| `POST /api/purchase-orders/:id/approve` | Approve PO |
| `POST /api/purchase-orders/:id/receipts` | Partial/full goods receipt |
| `POST /api/purchase-orders/:id/force-close` | ปิดยอดค้างแบบมี approval |
| `GET /api/accounting/settlements` | Gross/fee/net reconciliation |

List endpoint ต้องมี pagination, bounded page size, indexed filter และ export
แยกจาก interactive query

## 17. Observability และ Audit

Metrics ขั้นต่ำ:

- order/payment success/failure/unknown และ webhook lag/duplicate
- shift open/ack/close duration, variance และ unresolved findings
- negative stock override, inventory drift, reservation expiry/stuck
- IndexedDB/cache failure, outbox depth/age/conflict และ receipt checksum mismatch
- Stripe settlement mismatch, alert delivery failure และ LINE quota
- Mongo election/retry/transaction abort, backup status, PITR/replication lag
- GCS upload/sign error, replication lag และ storage/egress forecast

Log ใช้ request/trace/order/shift ID ที่ไม่เป็น bearer token และต้อง redact
payment/PII ทุกชั้น Alert ต้องมี runbook, severity, owner, deduplication และ
acknowledgement

## 18. Performance และ UX

- Cached catalog search/scan feedback เป้าหมาย p95 <= 200 ms บนอุปกรณ์ที่รองรับ
- Online cart server validation p95 <= 1 วินาทีใน normal load
- Payment success UI ต้องเปลี่ยนหลัง server-confirmed state และไม่ freeze หน้าจอ
- Touch target ขั้นต่ำ 44x44 CSS px, รองรับ landscape/portrait และตัวอักษรไทย
- Quantity/amount ต้องไม่ล้น container และมี confirmation ก่อน action irreversible
- แสดง loading/retry/unknown ชัดเจน; ห้ามให้ Cashierกดจ่ายซ้ำเพราะ spinner ค้าง
- Barcode field ต้องรับ focus ได้รวดเร็วโดยไม่เปิด keyboard บนอุปกรณ์ที่ใช้ scanner
- Lock screen ไม่แสดงยอดขาย/PII จากกะก่อน

## 19. Edge Cases ที่ต้องรองรับ

- Cashier กด checkout ซ้ำ/สอง tab/สอง terminal
- Payment สำเร็จแต่ client ปิด, webhook ซ้ำ/มาช้า/สลับลำดับ
- PromptPay QR ถูกสแกนซ้ำหรือสำเร็จหลัง reservation หมดอายุ
- Card success แต่ fee/balance transaction ยังไม่พร้อม
- Refund หลัง shift approved หรือข้าม business date
- Stock ถูกขายพร้อมกันจาก POS และ online จนเกิด negative override
- Manager เปลี่ยน price/policy ระหว่าง cart กับ checkout
- Browser storage เต็ม, private mode, quota eviction หรือ IndexedDB corruption
- เครื่องดับระหว่างเขียน outbox/หลัง server commit ก่อน client acknowledge
- Close manifest มี receipt ของ Event/shift อื่นหรือ blob ถูกแก้
- Cash denomination total ไม่ตรง declared float/revenue
- PO รับบางส่วนหลายครั้ง, receipt retry, over-receive, damaged/rejected
- Force close PO ขณะที่ receipt request กำลังทำงาน
- Supplier invoice ซ้ำหรือ cost/tax เปลี่ยนหลังรับของ
- Mongo primary election ระหว่าง payment/inventory transaction
- Backup/replication job ล้ม, secondary region unavailable หรือ key access ขาด

## 20. Test และ Acceptance Criteria

### 20.1 Automated Tests

- Unit: money arithmetic, pricing snapshot, denomination, surcharge cap,
  availability, AP formula, state transition
- Contract: RBAC/Event scope, idempotency, blind response omission, webhook
  signature/dedup/order, E-slip allowlist
- Concurrency: quantity/stock/reservation, duplicate cash sale, duplicate webhook,
  partial receive และ close submit
- Offline: crash recovery, queue resume, unknown outcome, conflict, storage quota
- Security: CSRF/XSS, cross-Event IDOR, device revoke, log redaction, malicious image
- Integration: Stripe test mode card/PromptPay success/fail/refund, GCS private object,
  LINE failure fallback
- Resilience: Mongo election, retryable commit, GCS/provider timeout และ rollback

### 20.2 Manual Acceptance

1. Manager เปิดกะ float 2,000 บาทและ Cashier ต้อง acknowledge ก่อนขาย
2. Cashless Day float 0 และ backend ปฏิเสธ cash sale
3. Blind close browser/network payload ไม่มี expected amount ก่อน submit
4. Quantity เพิ่มหลายชิ้นโดยไม่สแกนซ้ำและยอด server ตรงทุก line
5. Stock <= 0 แสดง warning, permission/reason ครบ และ ledger ติดลบหนึ่งครั้ง
6. Stripe success จาก client โดยไม่มี webhook ไม่ทำให้ order เป็น paid
7. Webhook ซ้ำอย่างน้อย 3 ครั้งสร้าง sale/stock/E-slip เพียงครั้งเดียว
8. Refresh/ไฟดับกู้ cart/outbox ได้โดยไม่สร้าง charge/order ซ้ำ
9. IndexedDB ถูกล้างแล้ว canonical E-slip ยังดาวน์โหลดตามสิทธิ์จาก GCS ได้
10. Close manifest ขาด/เกิน/ผิด checksum สร้าง finding และแจ้ง manager
11. Network หลุดระหว่าง recovery upload แล้ว resume จากไฟล์ค้าง
12. Partial receiving ทั้ง keep open/force close ทำ stock/AP จาก accepted จริง
13. Online reservation กับ POS sale พร้อมกันไม่เกิด silent oversell
14. Stripe report แยก customer gross, actual fee, refund และ net ได้
15. Mongo primary failover ระหว่าง load ไม่สูญหรือ duplicate financial record
16. PITR restore และ cross-region receipt restore ผ่าน checksum/invariant

## 21. Rollout และ Migration

Phase 0 - Design/controls:

- อนุมัติ payment/surcharge/tax/cash/offline policy, role matrix, RPO/RTO และงบ
- สร้าง Stripe test account/webhook, LINE Official Account และ device policy
- ตรวจ Mongo replica set/backup tier และ GCS DR optionจริง

Phase 1 - Online POS pilot:

- Catalog, shift/float, online-only cash/Stripe, order/inventory ledger, E-slip GCS
- IndexedDB cart/cache แต่ `OFFLINE_CASH_SALES_ENABLED=false`
- ใช้ location/สินค้า pilot และ Stripe test mode ก่อน live mode

Phase 2 - Inventory/PO/accounting:

- reservation, transfer/count, PO/partial receipt/AP, settlement reconciliation
- MariaDB reporting projectionเปิดหลัง protection audit

Phase 3 - Resilience/DR:

- approved offline cash exception, HA/load/failover, PITR, cross-region backup,
  restore drill และ incident exercise

ข้อมูล Package เดิมต้อง migrate แบบ dry-run, count/checksum, mapping approval และ
rollback; ห้ามเปลี่ยน Package stock ไปเป็น POS opening balance อัตโนมัติ

## 22. Business Decisions ที่ต้องปิดก่อนพัฒนา

ค่า default ที่ fail-safe ระหว่างรอคำตอบ:

| Decision | Default |
|---|---|
| รับเงินสดหรือ cashless only | กำหนดต่อ Event; cashless ปิด cash ที่ backend |
| Offline cash sale | ปิด |
| Card surcharge | ปิดจน legal/acquirer approval |
| Split tender/tip | ไม่รองรับ Phase 1 |
| Negative stock | เปิดเฉพาะ permission + reason; hard-stop รายสินค้าได้ |
| Tax invoice | E-slip ไม่ใช่ e-Tax Invoice |
| Receipt local cache TTL | purge หลัง shift approved + approved grace |
| Inventory unit | integer unit เท่านั้น |
| PITR window | อย่างน้อย 7 วันเมื่อ tier รองรับ |
| Geo strategy | ห้ามเปิดก่อน cost/RPO/RTO approval |
| Manager notification | Dashboard เป็นหลัก, LINE Messaging API เป็นเสริม |

## 23. Definition of Done สำหรับ POS/Inventory

POS/Inventory พร้อม production เมื่อ:

1. Requirement/business decision และ threat model ได้รับอนุมัติ
2. API/model/index/migration ผ่าน review และ dry-run บนข้อมูลสำเนา
3. Stripe test/live webhook, idempotency และ settlement reconciliation ผ่าน
4. Blind close ไม่เปิด expected amount ก่อน submit ทุกช่องทาง
5. Money/order/payment/inventory/PO/AP invariants ผ่าน concurrency test
6. IndexedDB recovery/queue/security และ managed-device runbook ผ่าน
7. E-slip canonical GCS, retention, signed access และ restore ผ่าน
8. Mongo 3-node HA, majority write, election test, backup/PITR/restore ผ่าน
9. Geo backup/receipt replication ผ่าน หรือมี approved risk acceptance ที่ไม่
   อ้างว่ารองรับ regional loss
10. RBAC/Event/vendor/location/device scope และ separation of duties ผ่าน
11. PCI, PDPA, surcharge, receipt/tax และ retention ได้รับผู้รับผิดชอบอนุมัติ
12. Monitoring/alert/runbook/rollback/load test และ cost forecast ผ่าน
13. Forecast อยู่ในงบที่อนุมัติ; Budget alert และ owner พร้อม
14. Feature flag/canary/pilot/rollback ป้องกันกระทบ Event flow เดิม

## 24. Authoritative References

- [Stripe PromptPay payments](https://docs.stripe.com/payments/promptpay)
- [Stripe PaymentIntent status and webhook fulfillment](https://docs.stripe.com/payments/payment-intents/verifying-status)
- [Stripe webhook handling](https://docs.stripe.com/webhooks?lang=node)
- [Stripe Balance Transaction fields](https://docs.stripe.com/api/balance_transactions/object)
- [LINE Notify termination](https://developers.line.biz/en/news/2025/04/01/line-notify/)
- [LINE Messaging API push messages](https://developers.line.biz/en/docs/messaging-api/sending-messages/)
- [MongoDB replica-set write concern](https://www.mongodb.com/docs/manual/core/replica-set-write-concern/)
- [MongoDB Atlas disaster recovery](https://www.mongodb.com/docs/atlas/architecture/current/disaster-recovery/)
- [Cloud Storage location and redundancy](https://docs.cloud.google.com/storage/docs/bucket-locations)
- [Cloud Storage cross-bucket replication](https://docs.cloud.google.com/storage/docs/availability-durability)
