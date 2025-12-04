# Security Policy (นโยบายความปลอดภัย)

ทางทีมผู้พัฒนาระบบ RegisterSystem ให้ความสำคัญกับความปลอดภัยของข้อมูลผู้ใช้งานและระบบเป็นอันดับแรก เราขอขอบคุณล่วงหน้าสำหรับชุมชนและนักพัฒนาที่ช่วยรายงานช่องโหว่เพื่อทำให้ระบบนี้ปลอดภัยยิ่งขึ้น

## Supported Versions (เวอร์ชันที่รองรับ)

เนื่องจากโปรเจกต์นี้มีการอัปเดตอยู่เสมอ เราจะรองรับการแก้ไขความปลอดภัย (Security Patch) เฉพาะเวอร์ชันล่าสุดที่อยู่บน Branch `main` หรือ `production` เท่านั้น

| Version | Supported | Notes |
| ------- | ------------------ | ---------------------- |
| 1.0.0 (Latest) | :white_check_mark: | เวอร์ชันปัจจุบัน (Production) |
| < 1.0.0 | :x: | ไม่รองรับแล้ว |

## Reporting a Vulnerability (การรายงานช่องโหว่)

หากคุณค้นพบช่องโหว่ด้านความปลอดภัย (Security Vulnerability) **กรุณาอย่าเปิดเผยผ่าน Public Issue** บน GitHub เพื่อป้องกันผู้ไม่หวังดีนำไปใช้โจมตีระบบ

กรุณาทำตามขั้นตอนดังนี้:

1.  **แจ้งรายละเอียด:** ส่งรายละเอียดของช่องโหว่มาที่อีเมล **piyaton56@gmail.com**
2.  **ระบุข้อมูล:** โปรดระบุข้อมูลต่อไปนี้เพื่อให้เราตรวจสอบได้เร็วขึ้น:
    * ประเภทของช่องโหว่ (เช่น SQL Injection, XSS, Bypass Auth)
    * Endpoint หรือ URL ที่พบปัญหา
    * ขั้นตอนการจำลองสถานการณ์ (Steps to Reproduce) หรือ Proof of Concept (PoC) Code
3.  **การตอบกลับ:** ทีมงานจะพยายามตอบกลับภายใน 48 ชั่วโมง เพื่อยืนยันว่าได้รับเรื่องแล้ว

## Security Features (มาตรการความปลอดภัยในระบบ)

ระบบ RegisterSystem ได้มีการ Implement มาตรการความปลอดภัยเบื้องต้นไว้ดังนี้:

* **Authentication:** ใช้ **JWT (JSON Web Token)** ในการยืนยันตัวตน พร้อมระบบ **Session Management** ที่สามารถ Revoke (ยกเลิก) Session ได้จากฝั่ง Server
* **Role-Based Access Control (RBAC):** มีการแบ่งสิทธิ์การเข้าถึง API ชัดเจนระหว่าง `admin`, `staff`, และ `kiosk` (ตรวจสอบผ่าน Middleware)
* **Bot Protection:** ใช้ **Cloudflare Turnstile** ในหน้า Login และ Pre-registration เพื่อป้องกันบอท
* **Rate Limiting:** มีการจำกัดจำนวน Request (Rate Limit) เพื่อป้องกันการโจมตีแบบ Brute Force หรือ DDoS ในระดับ Application
* **Data Protection:** รหัสผ่านถูก Hash ด้วย **bcrypt** ก่อนบันทึกลง Database
* **Audit Logs:** ระบบมีการบันทึกการกระทำสำคัญ (Audit Log) ลงใน Database เพื่อตรวจสอบย้อนหลัง

## Out of Scope (สิ่งที่อยู่นอกเหนือขอบเขต)

* การโจมตีแบบ DDoS ที่เน้นทำให้ Network ล่ม (ควรจัดการที่ระดับ Infrastructure)
* Social Engineering (การหลอกลวงเจ้าหน้าที่เพื่อขอข้อมูล)
* Spam หรือ Email Bombing (แม้จะมี Turnstile ช่วยป้องกัน แต่บางกรณีอาจหลุดรอดได้)

---

ขอขอบคุณที่ช่วยกันทำให้ระบบนี้ปลอดภัยยิ่งขึ้น!
