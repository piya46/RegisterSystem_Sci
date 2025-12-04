// const sendMail = require('./sendMail');

// module.exports = async function sendTicketMail(toEmail, participant) {
//   try {
//     const qrText = participant.qrCode || participant._id || 'no-code';

//     // สร้าง URL ของรูป QR code จาก API
//     const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrText)}`;

//     const html = `
//       <div style="font-family:sans-serif;max-width:500px;margin:auto">
//         <h2>นี่คือ E-Ticket สำหรับเข้างานของคุณ</h2>
//         <p>กรุณาแสดง QR Code ด้านล่างให้เจ้าหน้าที่สแกนในวันงาน</p>
//         <img src="${qrImageUrl}" style="width:220px;height:220px;border:1px solid #eee" alt="QR Code"/>
//         <p style="margin-top:2em"><b>เลขตั๋ว (Ticket ID):</b> ${qrText}</p>
//         <p>หากมีปัญหาโปรดติดต่อทีมงาน</p>
//       </div>
//     `;

//     return sendMail(
//       toEmail,
//       'E-Ticket งานคืนเหย้า (สำหรับเข้างาน)',
//       'นี่คือ E-Ticket สำหรับเข้างาน กรุณาแสดง QR Code ในอีเมลนี้เพื่อเข้างาน',
//       html
//     );
//   } catch (error) {
//     console.error("Error sending ticket mail:", error);
//     throw error;
//   }
// };

const sendMail = require('./sendMail');

module.exports = async function sendTicketMail(toEmail, participant) {
  try {
    const qrText = participant.qrCode || participant._id || 'no-code';
    const name = participant.fields?.name || "-";
    const year = participant.fields?.date_year || "-";
    const dept = participant.fields?.dept || "-";

    // QR PNG (ดาวน์โหลด/แสดง)
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrText)}`;

    // mailto สำหรับติดต่อทีมงาน (subject พร้อม Ticket ID)
    const contactMailto = `mailto:contact@pstpyst.com?subject=ปัญหาเกี่ยวกับ%20Ticket%20ID%3A%20${encodeURIComponent(qrText)}&body=โปรดแจ้งรายละเอียดปัญหาของคุณที่นี่%0A%0ATicket ID: ${encodeURIComponent(qrText)}`;

    const html = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #fff8e1; padding: 32px 12px; color: #5a4400; max-width: 420px; margin: auto; border-radius: 14px; box-shadow: 0 10px 28px rgba(255, 193, 7, 0.3);">
        <div style="text-align: center; margin-bottom: 22px;">
          <h1 style="font-weight: 700; font-size: 28px; margin: 0;">🎫 E-Ticket</h1>
          <p style="font-weight: 600; font-size: 16px; margin: 6px 0 0;">งานคืนเหย้า</p>
        </div>

        <div style="text-align: center; margin-bottom: 24px;">
          <img src="${qrImageUrl}" alt="QR Code" style="width: 220px; height: 220px; border-radius: 12px; border: 3px solid #ffca28; box-shadow: 0 0 18px #ffca2833;" />
          <div>
            <a href="${qrImageUrl}" download="E-Ticket_${name}_${qrText}.png"
              style="display: inline-block; margin-top: 12px; background: #ffca28; color: #4a3e00; font-weight: 700; text-decoration: none; padding: 10px 24px; border-radius: 24px; font-size: 14px; box-shadow: 0 6px 12px rgba(255, 202, 40, 0.45); transition: background-color 0.3s;">
              ⬇ ดาวน์โหลด QR E-Ticket
            </a>
          </div>
        </div>

        <div style="background: #fff3cd; padding: 14px 20px; border-radius: 14px; color: #664d03; font-weight: 600; font-size: 15px; line-height: 1.4;">
          <p style="margin: 4px 0;"><b>ชื่อ:</b> ${name}</p>
          <p style="margin: 4px 0;"><b>ปีการศึกษา:</b> ${year}</p>
          <p style="margin: 4px 0;"><b>สาขา:</b> ${dept}</p>
        </div>

        <p style="margin-top: 18px; font-size: 14px; font-weight: 600; color: #a68400; text-align: center;">
          Ticket ID: <span style="color: #ffb300; font-weight: 700;">${qrText}</span>
        </p>

        <p style="font-size: 14px; line-height: 1.5; color: #6b5300; text-align: center; margin-top: 6px;">
          กรุณาแสดง QR Code ด้านบนให้เจ้าหน้าที่ในวันงาน
        </p>

        <hr style="border: none; border-bottom: 1px solid #ffecb3; margin: 24px 0;" />

        <div style="text-align: center;">
          <a href="${contactMailto}"
            style="background: #ffd54f; color: #5a4400; font-weight: 700; font-size: 15px; padding: 12px 28px; border-radius: 28px; text-decoration: none; box-shadow: 0 6px 14px rgba(255, 213, 79, 0.4); display: inline-block; transition: background-color 0.3s;">
            📧 ติดต่อทีมงาน (แจ้งปัญหา)
          </a>
        </div>
      </div>
    `;

   return sendMail(
  toEmail,
  'E-Ticket งานคืนเหย้า (สำหรับเข้างาน)',
  'นี่คือ E-Ticket สำหรับเข้างาน กรุณาแสดง QR Code ในอีเมลนี้เพื่อเข้างาน',
  html,
  {
    headers: {
      'Sensitivity': 'Company-Confidential',
      'X-Priority': '1 (Highest)',
      'X-MSMail-Priority': 'High',
      'Importance': 'High'
    }
  }
);


  } catch (error) {
    console.error("Error sending ticket mail:", error);
    throw error;
  }
};

async function sendResetPasswordMail(toEmail, newPassword, username) {
  try {
    const html = `
      <div style="
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        max-width: 480px;
        margin: auto;
        padding: 24px;
        background: #fff8e1;
        border: 2px solid #fbc02d;
        border-radius: 12px;
        color: #4a3400;
      ">
        <h2 style="text-align: center; color: #fbc02d; margin-bottom: 16px;">
          รีเซ็ตรหัสผ่านเสร็จสมบูรณ์
        </h2>
        <p>สวัสดีคุณ <strong>${username}</strong>,</p>
        <p>รหัสผ่านใหม่ของคุณได้รับการตั้งค่าเรียบร้อยแล้ว กรุณาใช้รหัสผ่านด้านล่างเพื่อเข้าสู่ระบบ:</p>
        <div style="
          background: #fbc02d;
          color: #4a3400;
          font-weight: bold;
          font-size: 1.2rem;
          text-align: center;
          padding: 12px 0;
          border-radius: 8px;
          letter-spacing: 2px;
          margin: 16px 0;
          user-select: all;
        ">
          ${newPassword}
        </div>
        <p>แนะนำให้เปลี่ยนรหัสผ่านของคุณทันทีหลังจากเข้าสู่ระบบเพื่อความปลอดภัยสูงสุด</p>
        <hr style="border: none; border-top: 1px solid #fbc02d; margin: 24px 0;" />
        <p style="font-size: 0.85rem; color: #a17c00; text-align: center;">
          หากคุณไม่ได้ร้องขอการเปลี่ยนแปลงนี้ โปรดติดต่อฝ่ายสนับสนุนทันที
        </p>
        <p style="text-align: center; margin-top: 32px;">
          <a href="mailto:contact@pstpyst.com?subject=ปัญหาเรื่องรีเซ็ตรหัสผ่าน&body=Username: ${username}" 
             style="
               background: #fbc02d;
               color: #4a3400;
               padding: 10px 20px;
               border-radius: 6px;
               text-decoration: none;
               font-weight: 600;
               font-size: 1rem;
               box-shadow: 0 4px 10px rgba(251, 192, 45, 0.5);
               display: inline-block;
             ">
            ติดต่อฝ่ายสนับสนุน
          </a>
        </p>
      </div>
    `;

    await sendMail(
      toEmail,
      'แจ้งรีเซ็ตรหัสผ่านของคุณ - งานเสือเหลือง',
      'รหัสผ่านใหม่ของคุณถูกรีเซ็ตแล้ว กรุณาตรวจสอบในอีเมลนี้',
      html
    );
  } catch (err) {
    console.error("Error sending reset password mail:", err);
    throw err;
  }
}
