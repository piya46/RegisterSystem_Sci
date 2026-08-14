# Event Registration Setup Checklist

เอกสารนี้คือข้อมูลขั้นต่ำที่ต้องเติมก่อนเปิดระบบลงทะเบียนของแต่ละ Event

## 1. Event Identity

เติมที่: `/workspace` หรือ `/admin/events`

- `Organization`
- `Event Series`
- `Event`
- `Event.slug`
- `Event.eventYear`
- ตั้ง Event นี้เป็น current/active หากต้องการให้ legacy/current public route ใช้งาน

สถานะก่อนเปิด public registration:

- ใช้ `registration_open` สำหรับเปิดลงทะเบียนล่วงหน้า
- ใช้ `event_day` สำหรับวันงาน/onsite ได้ แต่ public pre-registration จะไม่เปิดถ้าไม่ใช่ `registration_open` หรือ `active`

## 2. Event Settings

เติมที่: `/admin/events/:eventId/settings`

- `enabledFeatures.registration = true`
- `enableRegister = true`
- `maintenanceMode = false`
- `preRegStartDate`, `preRegEndDate` สำหรับ public pre-registration
- `kioskStartDate`, `kioskEndDate` สำหรับ onsite/kiosk/self-register
- ถ้าใช้ donation/package ให้เปิด `enabledFeatures.donations` และ `enabledFeatures.packages` เฉพาะ Event นี้

## 3. Participant Fields

เติมที่: `/admin/events/:eventId/registration-fields`

ต้องมี field ที่ enabled:

- `name`, required
- `email`, required
- `phone`, required
- `date_year` หากต้องใช้ปีการศึกษา
- `usr_add` และ `usr_add_post` หากเปิด package/delivery

หมายเหตุ: ถ้ามี field เก่าที่ยังเป็น global fallback ให้ clone/create เป็น Event-scoped หรือรัน migration หลังตั้ง current event ถูกต้อง

## 4. Registration Points

เติมที่: `/admin/events/:eventId/registration-points`

ต้องมีอย่างน้อย 1 point ที่:

- `enabled = true`
- ผูกกับ `eventId` ของ Event นี้
- ตั้ง `type` เช่น `onsite`, `kiosk`, `self_register`, `checkin`
- ถ้าใช้ kiosk ให้ตั้ง `type = kiosk` หรือ `kioskPolicy.allowKioskMode = true`
- ใส่ `allowedStaff` หรือกำหนด staff registration points ในหน้า Admin
- ถ้าต้องล็อกเครื่อง ให้ใส่ `deviceIds`

## 5. Staff และสิทธิ์

เติมที่: `/admin`

- สร้าง/แก้ user role `staff`, `event_manager`, `event_admin`, หรือ `kiosk` สำหรับ registration operator
- เพิ่ม Event นี้ใน `eventIds`
- สำหรับ staff/kiosk onsite/check-in ให้เพิ่ม registration point ใน `registrationPoints`
- เมื่อใช้ MariaDB event registration primary ให้ตรวจว่า point มี `allowedStaff` เป็น Mongo Admin id ของ operator ด้วย

## 6. Package เฉพาะกรณีเปิด Feature

เติมที่: `/admin/events/:eventId/packages`

- เพิ่ม Package ที่ `isActive = true`
- ตรวจ stock/size/deadline
- หากไม่มี package active ให้ปิด `enabledFeatures.packages`

## 7. Migration/Backfill จากข้อมูลเก่า

รัน dry-run ก่อนเสมอ:

```bash
cd backend
npm run migrate:registration-points
npm run migrate:participant-fields
npm run migrate:participant-points
```

ถ้าต้อง bind legacy fields/points เข้ากับ current event ให้ตั้ง current event ให้ถูกก่อน แล้วค่อยรัน apply พร้อม safety gate ตาม runbook production

## 8. Readiness Audit

รันตัวตรวจ setup:

```bash
cd backend
npm run audit:event-registration
```

ตรวจ Event เฉพาะตัว:

```bash
cd backend
npm run audit:event-registration -- --event-id <EVENT_ID>
npm run audit:event-registration -- --event-slug <EVENT_SLUG>
```

ผลลัพธ์:

- `FAIL`: ต้องเติมหรือแก้ก่อนเปิดใช้งาน
- `WARN`: ใช้งานบางส่วนได้ แต่อาจยังไม่พร้อม production หรือยังมี legacy fallback
- `READY`: setup ขั้นต่ำพร้อมสำหรับระบบลงทะเบียนอีเวนต์

## 9. Seed ข้อมูลขั้นต่ำ

ดูแผนก่อนเขียน DB:

```bash
cd backend
npm run seed:event-registration
```

เขียนข้อมูลขั้นต่ำ:

```bash
cd backend
EVENT_REGISTRATION_SETUP_WRITE=true npm run seed:event-registration -- --apply
```

สิ่งที่ seed script ทำ:

- สร้าง Event-scoped participant fields จาก legacy/effective fields หรือ default fields
- บังคับ `name`, `email`, `phone` เป็น required
- สร้าง registration point หลักถ้ายังไม่มี point ที่ enabled ใน Event
- สร้างหรือปรับ kiosk point ได้ด้วย `--ensure-kiosk`, `--point-type kiosk` หรือ `--allow-kiosk true`
- ผูก staff ให้ Event และ point ถ้าระบุ `--staff-id` หรือ `--staff-username`
- เติม staff binding ทั้งฝั่ง `Admin.registrationPoints` และ `RegistrationPoint.allowedStaff`
- ปิด `enabledFeatures.packages` ได้เฉพาะเมื่อระบุ `--disable-empty-packages`

ตัวอย่าง:

```bash
EVENT_REGISTRATION_SETUP_WRITE=true npm run seed:event-registration -- --apply --point-name "จุดลงทะเบียนหลัก"
EVENT_REGISTRATION_SETUP_WRITE=true npm run seed:event-registration -- --apply --ensure-kiosk
EVENT_REGISTRATION_SETUP_WRITE=true npm run seed:event-registration -- --apply --point-name "Kiosk หน้างาน" --point-type kiosk --allow-kiosk true
EVENT_REGISTRATION_SETUP_WRITE=true npm run seed:event-registration -- --apply --staff-username staff01
EVENT_REGISTRATION_SETUP_WRITE=true npm run seed:event-registration -- --apply --staff-username staff01 --staff-point-name "Kiosk หน้างาน"
```
