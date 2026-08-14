# DBD Table Dictionary

เอกสารนี้แสดงแบบ DBD/Data Dictionary ว่าแต่ละตารางหรือ collection เก็บข้อมูลอะไร มี field สำคัญอะไรบ้าง และสัมพันธ์กับตารางอื่นอย่างไร

สถานะของตาราง:

- `Implemented`: มี model/schema ใน codebase แล้ว
- `SQL Mirror`: มี DDL ใน reporting mirror แล้ว ใช้สำหรับ report/BI ไม่ใช่ primary write
- `Planned`: ออกแบบไว้ใน PRD/roadmap แต่ยังไม่พบ implementation ครบ

## 1. Core Event and Registration DB

### 1.1 `organizations`

สถานะ: `Implemented`

เก็บข้อมูลหน่วยงาน/เจ้าของกิจกรรม เช่น มหาวิทยาลัย คณะ บริษัท หรือทีมที่เป็นเจ้าของ event

| Field | Type | เก็บข้อมูลอะไร |
|---|---|---|
| `_id` | ObjectId | รหัสหน่วยงาน |
| `name` | String | ชื่อหน่วยงาน |
| `slug` | String | key สำหรับอ้างอิงแบบอ่านง่าย ต้องไม่ซ้ำ |
| `description` | String | รายละเอียดหน่วยงาน |
| `status` | String | สถานะ `active` หรือ `archived` |
| `securityPolicy` | Object | policy เช่น ต้องใช้ MFA, ต้อง audit ตอน decrypt/export, อนุญาต public registration |
| `metadata` | Object | ข้อมูลเสริมที่ยังไม่ fix schema |
| `createdAt`, `updatedAt` | Date | วันเวลาสร้าง/แก้ไข |

ความสัมพันธ์: 1 organization มีหลาย `eventseries`, `events`, และใช้กำหนดสิทธิ์ใน `admins.organizationIds`

### 1.2 `eventseries`

สถานะ: `Implemented`

เก็บชุดกิจกรรมต่อเนื่อง เช่น งานคืนสู่เหย้ารายปี หรือ event series เดียวกันหลายปี

| Field | Type | เก็บข้อมูลอะไร |
|---|---|---|
| `_id` | ObjectId | รหัสชุดกิจกรรม |
| `organizationId` | ObjectId | อ้างอิง `organizations._id` |
| `name` | String | ชื่อชุดกิจกรรม |
| `slug` | String | key ของชุดกิจกรรม ต้องไม่ซ้ำภายใน organization |
| `description` | String | รายละเอียดชุดกิจกรรม |
| `status` | String | `active` หรือ `archived` |
| `defaultLinkingMode` | String | ค่าเริ่มต้นการเชื่อมข้อมูลข้าม event: `isolated`, `series-linked`, `manual-linked` |
| `metadata` | Object | ข้อมูลเสริม |
| `createdAt`, `updatedAt` | Date | วันเวลาสร้าง/แก้ไข |

ความสัมพันธ์: 1 `eventseries` มีหลาย `events`

### 1.3 `events`

สถานะ: `Implemented`

เก็บรอบกิจกรรมจริงที่เปิดลงทะเบียน เช่น งานปี 2026 เป็น root scope ของข้อมูลกิจกรรม

| Field | Type | เก็บข้อมูลอะไร |
|---|---|---|
| `_id` | ObjectId | รหัส event |
| `organizationId` | ObjectId | อ้างอิง `organizations._id` |
| `seriesId` | ObjectId | อ้างอิง `eventseries._id` |
| `name` | String | ชื่องาน |
| `slug` | String | key สำหรับ public URL เช่น `/e/:slug` |
| `eventYear` | String | ปีงาน ใช้รองรับข้อมูล legacy/report |
| `status` | String | lifecycle เช่น `draft`, `published`, `registration_open`, `registration_closed`, `event_day`, `archived` |
| `startsAt`, `endsAt` | Date | วันเวลาเริ่ม/สิ้นสุดงาน |
| `timezone` | String | timezone ของงาน |
| `branding` | Object | logo, cover image, สีหลัก/รอง/accent |
| `publicLinks` | Object | path ของ landing, register, check-in, report |
| `publication` | Object | เวลา publish, เปิด/ปิดลงทะเบียน, consent version |
| `linkingMode` | String | วิธีเชื่อมข้อมูลข้าม event |
| `linkedEventIds` | ObjectId[] | event ที่เชื่อมเองแบบ manual |
| `config` | Object | feature flags, register windows, kiosk windows, welcome/contact, maintenance |
| `layouts` | Object | layout ของ landing page, registration form, dashboard, ticket, report |
| `templates` | Object | template email/report |
| `versionHistory` | Array | snapshot version ตอน publish หรือแก้ layout |
| `archivedAt`, `activatedAt` | Date | วันเวลา archive/activate |
| `createdAt`, `updatedAt` | Date | วันเวลาสร้าง/แก้ไข |

ความสัมพันธ์: 1 event มีหลาย `participants`, `participantfields`, `registrationpoints`, `donations`, `packages`, `prizes`, `wallets`, `vendors`, `receipts`, `storedobjects`

### 1.4 `participantfields`

สถานะ: `Implemented`

เก็บโครงฟอร์มลงทะเบียนแบบ dynamic ว่า event นี้ต้องถาม field อะไรบ้าง

| Field | Type | เก็บข้อมูลอะไร |
|---|---|---|
| `_id` | ObjectId | รหัส field |
| `organizationId`, `seriesId`, `eventId` | ObjectId | scope ของ field |
| `eventYear` | String | legacy scope |
| `name` | String | key ที่จะไปอยู่ใน `participants.fields` |
| `label` | String | ชื่อ field ที่แสดงบนฟอร์ม |
| `type` | String | ชนิด input: `text`, `email`, `number`, `select`, `date` |
| `required` | Boolean | จำเป็นต้องกรอกหรือไม่ |
| `options` | String[] | ตัวเลือกสำหรับ select |
| `order` | Number | ลำดับการแสดงผล |
| `enabled` | Boolean | เปิด/ปิด field |

ความสัมพันธ์: `participants.fields[name]` จะเก็บค่าที่ผู้ลงทะเบียนกรอกจาก field นี้

### 1.5 `registrationpoints`

สถานะ: `Implemented`

เก็บจุดลงทะเบียน จุดเช็คอิน kiosk หรือ self-register ที่ผูกกับ event

| Field | Type | เก็บข้อมูลอะไร |
|---|---|---|
| `_id` | ObjectId | รหัสจุดลงทะเบียน |
| `organizationId`, `seriesId`, `eventId` | ObjectId | scope ของจุด |
| `eventYear` | String | legacy scope |
| `name` | String | ชื่อจุด |
| `description` | String | รายละเอียด |
| `type` | String | `onsite`, `meeting`, `kiosk`, `self_register`, `checkin`, `other` |
| `enabled` | Boolean | เปิดใช้งานหรือไม่ |
| `allowedStaff` | ObjectId[] | admin/staff ที่ใช้จุดนี้ได้ |
| `deviceIds` | String[] | device ที่อนุญาต |
| `kioskPolicy` | Object | policy เช่น camera, fullscreen, idle timeout, reset timeout |
| `createdAt`, `updatedAt` | Date | วันเวลาสร้าง/แก้ไข |

ความสัมพันธ์: `participants.registeredPointId` อ้างจุดที่ใช้ลงทะเบียนหรือเช็คอิน

### 1.6 `participants`

สถานะ: `Implemented`

เก็บข้อมูลผู้ลงทะเบียน/ผู้เข้าร่วมงาน

| Field | Type | เก็บข้อมูลอะไร |
|---|---|---|
| `_id` | ObjectId | รหัสผู้เข้าร่วม |
| `qrCode` | String | QR/e-ticket code ต้องไม่ซ้ำ |
| `fields` | Object | ข้อมูลที่ผู้ใช้กรอกจาก dynamic form เช่น ชื่อ อีเมล เบอร์ ภาควิชา |
| `secureIndex` | Object | blind index สำหรับค้นหา field ที่ปกป้อง |
| `secureSearch` | String[] | token สำหรับ secure search |
| `organizationId`, `seriesId`, `eventId` | ObjectId | scope ของ event |
| `eventYear` | String | ปีงาน/legacy scope |
| `tags` | String[] | tag เสริม |
| `status` | String | `registered`, `checkedIn`, `cancelled` |
| `checkedInAt` | Date | เวลาเช็คอิน |
| `registeredAt` | Date | เวลาลงทะเบียน |
| `certificateVerificationId` | String | opaque id สำหรับ verify certificate |
| `registrationIdempotencyKeyHash` | String | hash กัน submit ซ้ำ |
| `registeredBy` | ObjectId | admin/staff ที่ลงทะเบียนให้ |
| `registeredPointId` | ObjectId | จุดลงทะเบียน |
| `registeredPointName` | String | ชื่อจุดแบบ denormalized |
| `isDeleted` | Boolean | soft delete |
| `registrationType` | String | `online`, `onsite`, `onsite_staff`, `onsite_kiosk`, `self_register` |
| `followers` | Number | จำนวนผู้ติดตาม |
| `consent` | String/null | สถานะ consent |
| `specialAssistance` | Mixed | ข้อมูลความช่วยเหลือพิเศษ |
| `isForfeited`, `isRevoked` | Boolean | สถานะสิทธิ์รางวัล/certificate |
| `prizeId`, `prizeWonAt` | ObjectId/Date | รางวัลที่ได้รับและเวลาได้รับ |
| `authProviders` | String[] | ช่องทาง login เช่น email, line, google |
| `lineUserId` | String | LINE user id |
| `lineDisplayName`, `linePictureUrl` | String | ข้อมูล LINE profile |
| `lastLoginAt`, `lastLogoutAt` | Date | เวลาการใช้งานบัญชี |
| `trustedDevices` | Array | device ที่เชื่อถือ |
| `notificationPreferences` | Object | การรับแจ้งเตือนผ่าน LINE/email/coupon/check-in/certificate |

ความสัมพันธ์: ผูกกับ `events`, `registrationpoints`, `admins`, `prizes`, `wallets`, `receipts`, `participantsessions`

## 2. Authentication and Admin DB

### 2.1 `admins`

สถานะ: `Implemented`

เก็บผู้ดูแล เจ้าหน้าที่ และสิทธิ์การเข้าถึงระบบหลังบ้าน

| Field | Type | เก็บข้อมูลอะไร |
|---|---|---|
| `_id` | ObjectId | รหัส admin/staff |
| `username` | String | username |
| `passwordHash` | String | password hash |
| `role` | String[] | role เช่น admin, staff, event_manager |
| `permissions` | String[] | permission แบบละเอียด |
| `organizationIds` | ObjectId[] | organization ที่เข้าถึงได้ |
| `eventIds` | ObjectId[] | event ที่เข้าถึงได้ |
| `email` | String | email ต้องไม่ซ้ำ |
| `fullName` | String | ชื่อผู้ใช้ |
| `registrationPoints` | ObjectId[] | จุดลงทะเบียนที่ได้รับมอบหมาย |
| `avatarUrl`, `avatarObjectRef` | String | รูป profile |
| `googleId` | String | Google login id |
| `resetPassword*` | Mixed | OTP/Ref/expire/attempt สำหรับ reset password |
| `actionOtp*` | Mixed | OTP/Ref/expire/attempt สำหรับ action สำคัญ |
| `mustChangePassword` | Boolean | บังคับเปลี่ยนรหัส |

ความสัมพันธ์: อ้าง `organizations`, `events`, `registrationpoints`; ถูกอ้างโดย `sessions`, `participants.registeredBy`, event version history

### 2.2 `sessions`

สถานะ: `Implemented`

เก็บ session ของ admin/staff แบบ hash token

| Field | Type | เก็บข้อมูลอะไร |
|---|---|---|
| `_id` | ObjectId | รหัส session |
| `userId` | ObjectId | อ้าง `admins._id` |
| `tokenHash` | String | hash ของ token ปัจจุบัน |
| `previousTokenHash`, `previousTokenHashes` | String/Array | token rotation grace |
| `userAgent`, `ip` | String | client metadata |
| `createdAt`, `lastActivityAt` | Date | เวลาใช้งาน |
| `expiresAt`, `absoluteExpiresAt` | Date | อายุ session |
| `revoked` | Boolean | ถูก revoke หรือไม่ |

### 2.3 `participantsessions`

สถานะ: `Implemented`

เก็บ session ของ participant

| Field | Type | เก็บข้อมูลอะไร |
|---|---|---|
| `_id` | ObjectId | รหัส session |
| `participantId` | ObjectId | อ้าง `participants._id` |
| `tokenHash` | String | hash token |
| `previousTokenHash`, `previousTokenHashes` | String/Array | token rotation |
| `provider` | String | `email`, `line`, `liff` |
| `eventId`, `eventYear` | ObjectId/String | event scope |
| `userAgent`, `ip`, `deviceLabel` | String | device/client metadata |
| `lastActivityAt`, `expiresAt`, `absoluteExpiresAt` | Date | session lifetime |
| `revoked`, `revokedAt`, `revokedReason` | Boolean/Date/String | revoke status |

### 2.4 `participantauthchallenges`

สถานะ: `Implemented`

เก็บ OTP challenge สำหรับ participant login หรือ step-up

| Field | Type | เก็บข้อมูลอะไร |
|---|---|---|
| `_id` | ObjectId | รหัส challenge |
| `participantId`, `participantIds` | ObjectId/ObjectId[] | participant ที่เกี่ยวข้อง |
| `emailHash` | String | hash ของ email |
| `otpHash` | String | hash ของ OTP |
| `ref` | String | reference ที่แสดงให้ผู้ใช้ |
| `purpose` | String | `login` หรือ `step_up` |
| `action` | String | action ที่ต้อง step-up |
| `attempts` | Number | จำนวนครั้งที่ลอง |
| `usedAt` | Date | เวลาใช้งาน OTP |
| `expiresAt` | Date | หมดอายุและ TTL delete |

### 2.5 `registrationreusechallenges`

สถานะ: `Implemented`

เก็บ OTP สำหรับดึงข้อมูลลงทะเบียนจาก event เก่ามาใช้ event ใหม่

| Field | Type | เก็บข้อมูลอะไร |
|---|---|---|
| `_id` | ObjectId | รหัส challenge |
| `email`, `emailHash` | String | email แบบ protected และ hash |
| `eventId`, `seriesId` | ObjectId | scope ที่ใช้หา |
| `targetEventId` | ObjectId | event ใหม่ที่จะลงทะเบียน |
| `sourceEventId` | ObjectId | event เดิมที่เอาข้อมูลมา |
| `participantId` | ObjectId | participant เดิม |
| `otpHash` | String | hash OTP |
| `ref` | String | reference |
| `attempts` | Number | จำนวนครั้งที่ลอง |
| `usedAt`, `expiresAt` | Date | used/expire |

## 3. Event Operation DB

| Table/Collection | สถานะ | เก็บข้อมูลอะไร | Field สำคัญ |
|---|---|---|---|
| `donations` | Implemented | รายการสนับสนุน/โอนเงิน/ซื้อ package | `eventId`, `firstName`, `lastName`, `amount`, `transferDateTime`, `source`, `isPackage`, `packageType`, `size`, `slipUrl`, `address`, `pickupMethod`, `pickupLocation`, `idempotencyKeyHash`, `isDeleted` |
| `packages` | Implemented | package ที่ขายพร้อม stock/sold แบบ embedded | `eventId`, `name`, `description`, `price`, `items.itemName`, `items.sizes.size`, `items.sizes.stock`, `items.sizes.sold`, `orderDeadline`, `pickupLocations`, `isActive`, `deletedAt` |
| `prizes` | Implemented | ของรางวัลและรายชื่อผู้ชนะ | `eventId`, `name`, `totalQuantity`, `remainingQuantity`, `image`, `winners.participantId`, `winners.wonAt` |
| `wallets` | Implemented | wallet coin/coupon ของ participant | `participantId`, `eventId`, `coinBalance`, `coupons.couponId`, `coupons.name`, `coupons.quantity`, `isActive` |
| `guesttokens` | Implemented | token แชร์ wallet ให้ guest ใช้จ่าย | `parentWalletId`, `tokenHash`, `limitAmount`, `spentAmount`, `expiresAt`, `isActive`, `revokedAt`, `lastUsedAt` |
| `vendors` | Implemented | ร้านค้า/จุดรับชำระ | `eventId`, `name`, `qrCodeId`, `pricingMode`, `fixedPrice`, `minAmount`, `maxAmount`, `menuItems`, `isActive` |
| `transactions` | Implemented | รายการจ่ายเงิน/refund/reversal/topup | `walletId`, `guestTokenId`, `vendorId`, `type`, `idempotencyKey`, `paymentMethod`, `amount`, `couponId`, `menuItemId`, `status`, `balanceBefore`, `balanceAfter`, `verificationCode`, `reversalOf`, `eventId` |
| `receipts` | Implemented | ใบเสร็จ participant/event | `receiptNumber`, `participantId`, `eventId`, `amount`, `issuedAt`, `details` |

## 4. System, File, and Audit DB

| Table/Collection | สถานะ | เก็บข้อมูลอะไร | Field สำคัญ |
|---|---|---|---|
| `storedobjects` | Implemented | metadata ไฟล์ local/GCS เช่น logo, slip, avatar | `publicId`, `provider`, `bucket`, `objectKey`, `purpose`, `visibility`, `eventId`, `uploadedBy`, `linkedEntityType`, `linkedEntityId`, `eventLinks`, `contentType`, `sizeBytes`, `sha256`, `status`, `linkExpiresAt`, `retentionUntil` |
| `systemsettings` | Implemented | ค่า global/current event สำหรับ compatibility | `eventName`, `defaultOrganizationId`, `currentEventSeriesId`, `currentEventId`, `currentEventYear`, `eventLinkingMode`, `enableRegister`, `maintenanceMode`, `preRegStartDate`, `preRegEndDate`, `kioskStartDate`, `kioskEndDate` |
| `lineoauthstates` | Implemented | state/nonce สำหรับ LINE OAuth | `stateHash`, `nonce`, `action`, `participantId`, `eventId`, `redirectUri`, `usedAt`, `expiresAt` |
| `sqlmirroroutboxes` | Implemented | queue สำหรับ sync MongoDB ไป SQL mirror | `domain`, `sourceId`, `eventId`, `operation`, `dedupeKey`, `status`, `attemptCount`, `availableAt`, `lockToken`, `lastErrorCode`, `resultSourceHash` |
| `logservers` | Implemented | API/audit log | `user`, `userId`, `method`, `url`, `status`, `ip`, `userAgent`, `action`, `detail`, `error`, `createdAt` |
| `cronlogs` | Implemented | log งาน cron | `jobName`, `status`, `startTime`, `endTime`, `detail` |
| `counters` | Implemented | running sequence | `_id`, `seq` |

## 5. SQL Reporting Mirror DB

สถานะ: `SQL Mirror`

SQL mirror ใช้ชื่อ table แบบ snake_case และมี foreign key จริงเพื่อใช้รายงาน/BI โดยไม่เก็บ plaintext PII ที่ไม่จำเป็น

| SQL table | เก็บข้อมูลอะไร | Column สำคัญ |
|---|---|---|
| `organizations` | dimension หน่วยงาน | `id`, `mongo_id`, `name`, `slug`, `status`, `security_policy_json`, `source_created_at`, `source_updated_at`, `source_hash` |
| `event_series` | dimension ชุดกิจกรรม | `id`, `mongo_id`, `organization_id`, `name`, `slug`, `status`, `default_linking_mode`, `source_hash` |
| `events` | dimension event | `id`, `mongo_id`, `organization_id`, `series_id`, `name`, `slug`, `event_year`, `status`, `starts_at`, `ends_at`, `timezone`, `linking_mode`, `archived_at`, `activated_at` |
| `participants_core` | participant metadata สำหรับ report โดยไม่เก็บ PII plaintext | `id`, `mongo_id`, `organization_id`, `series_id`, `event_id`, `event_year`, `qr_code`, `status`, `registration_type`, `registered_point_name`, `followers`, `consent_status`, blind indexes, `registered_at`, `checked_in_at` |
| `wallets` | wallet summary | `id`, `mongo_id`, `participant_id`, `event_id`, `event_year`, `event_scope_key`, `coin_balance`, `is_active` |
| `wallet_coupons` | coupon ใน wallet | `id`, `wallet_id`, `coupon_id`, `name`, `quantity` |
| `vendors` | vendor dimension | `id`, `mongo_id`, `event_id`, `event_year`, `name`, `qr_code_id`, `pricing_mode`, `fixed_price`, `min_amount`, `max_amount`, `is_active` |
| `vendor_menu_items` | menu ของ vendor | `id`, `vendor_id`, `source_index`, `item_id`, `name`, `price`, `is_active` |
| `wallet_transactions` | payment/refund/reversal fact | `id`, `mongo_id`, `wallet_id`, `vendor_id`, `event_id`, `guest_token_mongo_id`, `reversal_of_id`, `transaction_type`, `payment_method`, `amount`, `status`, balance fields, `server_time` |
| `receipts` | receipt summary | `id`, `mongo_id`, `receipt_number`, `participant_id`, `event_id`, `amount`, `details_hash`, `issued_at` |
| `donation_summaries` | donation/package summary | `id`, `mongo_id`, `organization_id`, `series_id`, `event_id`, `event_year`, `amount`, `transfer_at`, `source`, `is_package`, `package_type`, `pickup_method`, `is_deleted` |
| `packages` | package summary | `id`, `mongo_id`, `organization_id`, `series_id`, `event_id`, `event_year`, `name`, `description`, `price`, `order_deadline`, `is_delivery_available`, `is_active`, `deleted_at` |
| `package_items` | item ใน package | `id`, `package_id`, `source_index`, `item_name` |
| `package_variants` | size/stock/sold ของ package item | `id`, `package_item_id`, `source_index`, `size_label`, `stock`, `sold` |
| `mirror_backfill_checkpoints` | checkpoint backfill | `domain_name`, `run_id`, `mapper_version`, `high_watermark_mongo_id`, `last_mongo_id`, `processed_count`, `source_checksum`, `completed_at` |
| `schema_migrations` | migration history | `id`, `checksum`, `applied_at` |

## 6. Planned POS and Inventory DB

สถานะ: `Planned`

กลุ่มนี้เป็น structure ที่วางไว้ใน `docs/POS_INVENTORY_PRD.md` แต่ยังไม่ใช่ DB ที่พร้อมใช้งานในระบบ production ปัจจุบัน

| Planned table/collection | เก็บข้อมูลอะไร | Field ที่ควรมี |
|---|---|---|
| `PosLocations` | จุดขาย/คลังย่อยใน event | `organizationId`, `eventId`, `vendorId`, `name`, `code`, `status`, `timezone`, `cashPolicy`, `negativeStockPolicy` |
| `PosTerminals` | เครื่องขาย/terminal | `organizationId`, `eventId`, `locationId`, `vendorId`, `terminalCode`, `deviceId`, `status`, `lastSeenAt` |
| `PosDeviceSessions` | session ของ device/terminal | `terminalId`, `deviceId`, `userId`, `shiftId`, `status`, `tokenVersion`, `expiresAt`, `revokedAt` |
| `PosShifts` | กะขาย | `eventId`, `vendorId`, `locationId`, `terminalId`, `cashierId`, `managerId`, `status`, `businessDate`, `cashFloatMinor`, `cashPolicy`, lifecycle timestamps, `version` |
| `ShiftCloseSubmissions` | blind close declaration | `shiftId`, `submittedBy`, `denominations`, `declaredCashMinor`, `declaredFloatMinor`, declared payment totals, `manifestSummary`, `status`, `version` |
| `ShiftReconciliationFindings` | exception/mismatch ตอนปิดกะ | `shiftId`, `code`, `severity`, `amountDeltaMinor`, `countDelta`, `ownerId`, `status`, `dueDate`, `resolvedAt` |
| `Products` | catalog สินค้า | `organizationId`, `eventId`, `vendorId`, `name`, `category`, `status`, `taxPolicy`, `metadata` |
| `ProductVariants` | SKU/variant | `productId`, `sku`, `barcode`, `name`, `priceMinor`, `costMinor`, `unit`, `trackStock`, `stockPolicy`, `status`, `version` |
| `InventoryBalances` | projection ยอดคงเหลือ | `eventId`, `locationId`, `variantId`, `onHandQty`, `allocatedQty`, `availableQty`, `version`, `updatedAt` |
| `InventoryMovements` | immutable stock ledger | `eventId`, `locationId`, `variantId`, `type`, `quantityDelta`, `unit`, `sourceType`, `sourceId`, `actorId`, `reason`, `idempotencyKeyHash`, `createdAt` |
| `StockReservations` | soft allocation/reservation | `eventId`, `locationId`, `variantId`, `sourceType`, `sourceId`, `quantity`, `status`, `expiresAt`, `committedAt`, `releasedAt` |
| `PosOrders` | order/cart/checkout | `eventId`, `vendorId`, `locationId`, `terminalId`, `shiftId`, `cashierId`, `orderNumber`, `businessDate`, `status`, `lines`, `totalMinor`, `currency`, `version` |
| `PosPayments` | payment attempt/result | `orderId`, `provider`, `paymentMethod`, `status`, `amountMinor`, `currency`, `providerPaymentId`, fee/net settlement fields, `paidAt` |
| `PaymentProviderEvents` | webhook/provider evidence | `provider`, `providerEventId`, `paymentId`, `orderId`, `payloadHash`, `status`, `receivedAt`, `processedAt`, `dedupeKey` |
| `ESlipRecords` | e-slip metadata | `eventId`, `orderId`, `paymentId`, `receiptNumber`, `verificationId`, `objectRef`, `checksum`, `objectGeneration`, `status`, `issuedAt` |
| `Suppliers` | supplier master | `organizationId`, `name`, `code`, `contact`, `taxId`, `status`, `secureIndex`, `metadata` |
| `PurchaseOrders` | purchase order | `eventId`, `locationId`, `supplierId`, `poNumber`, `status`, `currency`, `lines`, `orderedAmountMinor`, `approvedBy`, `approvedAt`, `expectedDate`, `version` |
| `GoodsReceipts` | partial/full receiving | `purchaseOrderId`, `eventId`, `locationId`, `supplierDocumentNo`, `lines`, `receivedBy`, `receivedAt`, `status`, `idempotencyKeyHash` |
| `AccountsPayableEntries` | payable จาก accepted goods | `supplierId`, `purchaseOrderId`, `goodsReceiptId`, `invoiceNo`, `status`, `totalPayableAmountMinor`, `paidAmountMinor`, `dueDate` |
| `ManagerAlerts` | alert queue/dashboard/LINE | `eventId`, `severity`, `code`, `sourceType`, `sourceId`, `recipientAdminId`, `channel`, `status`, `dedupeKey`, `sentAt` |
| `IdempotencyRecords` | generic retry/write protection | `scope`, `keyHash`, `requestHash`, `aggregateType`, `aggregateId`, `status`, `responseSummary`, `expiresAt` |

## 7. Minimal DB for Registration Go-Live

ถ้าเปิดลงทะเบียนก่อน โดยยังไม่เปิด POS/Inventory ต้องมีข้อมูลจริงในตารางหลักเหล่านี้:

| Required table/collection | ต้องมีข้อมูลอะไร |
|---|---|
| `organizations` | หน่วยงานเจ้าของ event |
| `eventseries` | ชุดกิจกรรม |
| `events` | event จริง, slug, status ต้องเป็น `registration_open`, config registration ต้องเปิด |
| `participantfields` | field ที่ต้องให้ผู้สมัครกรอก |
| `admins` | admin/staff พร้อม role, permission, event scope |
| `registrationpoints` | จุดลงทะเบียน ถ้าใช้ staff/kiosk/self-register |
| `systemsettings` | current/default event สำหรับหน้า legacy |
| `participants` | ข้อมูลผู้ลงทะเบียนจะถูกสร้างที่นี่ |
| `storedobjects` | logo/cover/slip/avatar metadata ถ้าใช้ managed upload |
| `participantauthchallenges` | ถ้าใช้ participant email OTP |
| `registrationreusechallenges` | ถ้าใช้ reuse registration จาก event เดิม |

