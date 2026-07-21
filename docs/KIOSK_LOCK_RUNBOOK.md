# OS-level Kiosk Lock Runbook

เอกสารนี้ใช้สำหรับเตรียมเครื่องลงทะเบียนหน้างานที่เปิดหน้า Kiosk/Self-register ของระบบ Event โดยมีเป้าหมายให้ผู้ใช้ทั่วไปออกจากหน้า Kiosk ได้ยาก ลดความเสี่ยงจากการกดปุ่มระบบปฏิบัติการ และทำให้ทีมหน้างานตรวจ readiness ได้ก่อนเปิดใช้งานจริง

## หลักการสำคัญ

- Web fullscreen ไม่สามารถล็อกปุ่มระดับ OS เช่น Alt+Tab, Cmd+Tab, F11, swipe gesture, notification center หรือ power menu ได้
- การล็อกจริงต้องทำที่ OS, browser policy หรือ MDM
- Kiosk URL ต้องเป็นลิงก์ scoped token ของ event/registration point เท่านั้น
- ก่อนเปิดให้ใช้งาน ต้องผ่านหน้า `/kiosk/diagnostic` และตรวจ token, point, event, network, camera, storage, clock และ fullscreen readiness

## Windows

1. สร้าง local user แยกสำหรับ Kiosk เช่น `psevent-kiosk`
2. เปิด Assigned Access หรือ Windows Kiosk Mode ให้รัน Microsoft Edge แบบ single-app kiosk
3. ตั้ง startup URL เป็น `/kiosk/join?token=...` หรือ URL ที่ออกจากระบบ staff/admin
4. ปิด sleep ระหว่างงาน และตั้ง power recovery ให้กลับมาเปิด browser หลัง reboot
5. ปิด notification, update restart และ system shortcut เท่าที่ policy อนุญาต
6. ทดสอบ scanner/camera permission ใน browser profile นี้ก่อนวันงาน

## macOS

1. สร้าง user แยกสำหรับ Kiosk
2. ใช้ MDM/Apple Configurator หรือ Screen Time restrictions เพื่อล็อก app ที่อนุญาต
3. เปิด browser แบบ fullscreen และปิด gesture ที่พาออกจาก fullscreen เท่าที่ทำได้
4. ปิด notification, hot corners, automatic update restart และ sleep
5. ถ้าใช้ iPad แนะนำใช้ Guided Access หรือ Single App Mode ผ่าน MDM แทน browser kiosk บน macOS

## iPad / Tablet

1. ใช้ Guided Access สำหรับงานขนาดเล็ก หรือ MDM Single App Mode สำหรับงานจริง
2. ล็อก orientation ตาม layout ที่ใช้จริง
3. อนุญาต camera permission ก่อนเริ่มงาน
4. ตั้ง auto-lock เป็น Never หรือค่าที่เหมาะสมกับนโยบายแบตเตอรี่
5. เตรียม charger/power bank และทดสอบ network roaming

## Pre-event Checklist

- URL มี scoped token ที่ยังไม่หมดอายุ
- Diagnostic แสดง event/point ถูกต้อง
- Camera scan QR ได้จริง
- เวลาของเครื่องตรงกับ server time ใกล้เคียงกัน
- Fullscreen พร้อมใช้งาน
- Browser ไม่มี saved password/profile ส่วนตัว
- Staff รู้วิธีปลดล็อกเครื่องด้วย admin/staff credential
- มี spare device และ spare network อย่างน้อย 1 ชุด

## Incident Handling

- ถ้าเครื่องออกจาก Kiosk: staff ต้องล็อกหน้าจอหรือกลับเข้า Kiosk URL ใหม่ และตรวจ diagnostic ซ้ำ
- ถ้า token หลุดหรือสงสัยถูกแชร์ผิด: revoke/สร้าง token ใหม่จากระบบ staff/admin และเปลี่ยน URL บนเครื่อง
- ถ้า camera ใช้ไม่ได้: ใช้เครื่องสำรองหรือย้ายไปจุดลงทะเบียน staff mode
- ถ้า internet ช้า: หยุดรับรายการใหม่ชั่วคราวจนกว่าหน้า diagnostic/network จะกลับมาปกติ

## Post-event

- ออกจาก Kiosk mode
- ลบ browser profile/cache/token บนเครื่องเช่า
- ปิด user kiosk หรือเปลี่ยน password
- เก็บ incident log ว่าเครื่องใดมีปัญหา เพื่อปรับ capacity รอบถัดไป
