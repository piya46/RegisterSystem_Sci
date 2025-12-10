const sendMail = require('./sendMail');

/**
 * ส่งอีเมล E-Ticket พร้อม QR Code (ปรับโฉมใหม่สวยงาม Modern Gold Theme)
 */
exports.sendTicketMail = async function sendTicketMail(toEmail, participant) {
  try {
    const qrText = participant.qrCode || participant._id || 'no-code';
    const name = participant.fields?.name || "-";
    const year = participant.fields?.date_year || "-";
    const dept = participant.fields?.dept || "-";

    // สร้าง URL รูป QR Code (ใช้ API ที่เชื่อถือได้)
    // เพิ่ม margin และกำหนดสีพื้นหลังเพื่อให้ดูสะอาดตา
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&bgcolor=ffffff&data=${encodeURIComponent(qrText)}`;
    
    // ลิงก์สำหรับติดต่อแจ้งปัญหา
    const contactUrl = `mailto:piyaton56@gmail.com?subject=Help%20Ticket%20${qrText}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>E-Ticket</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
        <div style="padding: 40px 20px; background-color: #f4f4f4;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.08);">
            
            <div style="background: linear-gradient(135deg, #FFC107 0%, #FF8F00 100%); padding: 40px 20px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; text-transform: uppercase; letter-spacing: 2px; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                🎟 บัตรเข้าร่วมงาน
              </h1>
              <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 16px; font-weight: 500;">
                งานคืนเหย้า "เสือเหลืองคืนถิ่น"
              </p>
            </div>

            <div style="padding: 40px 30px; text-align: center;">
              
              <p style="font-size: 20px; color: #333; margin: 0 0 5px;">
                สวัสดีคุณ <strong>${name}</strong> 👋
              </p>
              <p style="color: #666; font-size: 15px; line-height: 1.6; margin-top: 0;">
                ขอบคุณที่ลงทะเบียนเข้าร่วมงาน<br>กรุณาแสดง QR Code นี้ให้เจ้าหน้าที่สแกนเพื่อเข้างาน
              </p>

              <div style="margin: 30px 0;">
                <div style="display: inline-block; padding: 15px; border: 2px dashed #FFB300; border-radius: 16px; background-color: #fff;">
                  <img src="${qrImageUrl}" alt="QR Code" style="width: 220px; height: 220px; display: block; border-radius: 8px;" />
                </div>
                <div style="margin-top: 12px;">
                  <span style="background-color: #FFF8E1; color: #FF8F00; padding: 6px 16px; border-radius: 20px; font-family: monospace; font-size: 14px; font-weight: bold; border: 1px solid #FFECB3;">
                    ${qrText}
                  </span>
                </div>
              </div>

              <div style="background-color: #FFFDE7; border-radius: 12px; padding: 25px; margin-bottom: 30px; text-align: left; border: 1px solid #FFF9C4;">
                <table width="100%" style="border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0; color: #795548; font-size: 14px; border-bottom: 1px solid #FFF59D;">ชื่อ-นามสกุล</td>
                    <td style="padding: 10px 0; color: #333; font-weight: bold; text-align: right; border-bottom: 1px solid #FFF59D;">${name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #795548; font-size: 14px; border-bottom: 1px solid #FFF59D;">ภาควิชา</td>
                    <td style="padding: 10px 0; color: #333; font-weight: bold; text-align: right; border-bottom: 1px solid #FFF59D;">${dept}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #795548; font-size: 14px;">รุ่นปีการศึกษา</td>
                    <td style="padding: 10px 0; color: #333; font-weight: bold; text-align: right;">${year}</td>
                  </tr>
                </table>
              </div>

              <a href="${qrImageUrl}" download="E-Ticket.png" style="display: inline-block; background-color: #FFC107; color: #000; text-decoration: none; padding: 15px 35px; border-radius: 50px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 15px rgba(255, 193, 7, 0.4); transition: transform 0.2s;">
                ⬇️ บันทึก QR Code
              </a>
              
              <p style="margin-top: 25px; font-size: 13px; color: #999;">
                หมายเหตุ: คุณสามารถแคปหน้าจอนี้เก็บไว้ในมือถือเพื่อความสะดวกรวดเร็ว
              </p>
            </div>

            <div style="background-color: #3E2723; color: #BCAAA4; padding: 25px; text-align: center; font-size: 12px;">
              <p style="margin: 0 0 10px;">พบปัญหาในการใช้งาน? <a href="${contactUrl}" style="color: #FFC107; text-decoration: none;">ติดต่อทีมงาน</a></p>
              <p style="margin: 0; opacity: 0.7;">&copy; 2026 Register System Sci. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return sendMail(
      toEmail,
      `🎫 E-Ticket ของคุณ: ${name}`,
      `นี่คือ E-Ticket สำหรับเข้างานของคุณ (${qrText}) กรุณาเปิดดูในโหมด HTML`,
      html
    );
  } catch (error) {
    console.error("Error sending ticket mail:", error);
    throw error;
  }
};

/**
 * ส่งอีเมลแจ้ง Reset Password (ปรับโฉมใหม่ให้เข้ากัน)
 */
exports.sendResetPasswordMail = async function sendResetPasswordMail(toEmail, newPassword, username) {
  try {
    const html = `
      <div style="background-color: #f4f4f4; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
        <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
          
          <div style="background: #D32F2F; padding: 30px; text-align: center;">
            <h2 style="color: #fff; margin: 0; font-size: 24px;">🔐 Password Reset</h2>
          </div>

          <div style="padding: 40px 30px; text-align: center;">
            <p style="font-size: 16px; color: #333; margin-top: 0;">เรียนคุณ <strong>${username}</strong></p>
            <p style="color: #666; margin-bottom: 30px; line-height: 1.5;">
              รหัสผ่านของคุณถูกรีเซ็ตเรียบร้อยแล้ว<br>กรุณาใช้รหัสผ่านชั่วคราวด้านล่างนี้เพื่อเข้าสู่ระบบ
            </p>

            <div style="background: #FFEBEE; color: #C62828; font-size: 28px; font-weight: bold; letter-spacing: 3px; padding: 20px; border-radius: 8px; border: 2px dashed #EF9A9A; display: inline-block; margin-bottom: 30px;">
              ${newPassword}
            </div>

            <p style="font-size: 14px; color: #D32F2F; background: #FFEBEE; padding: 10px; border-radius: 6px; display: inline-block;">
              ⚠️ เพื่อความปลอดภัย กรุณาเปลี่ยนรหัสผ่านทันทีหลังจากเข้าสู่ระบบ
            </p>
          </div>

          <div style="background: #FAFAFA; padding: 20px; text-align: center; font-size: 12px; color: #aaa; border-top: 1px solid #eee;">
            หากคุณไม่ได้เป็นผู้ร้องขอการเปลี่ยนรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบทันที
          </div>
        </div>
      </div>
    `;

    await sendMail(
      toEmail,
      'แจ้งการรีเซ็ตรหัสผ่าน (Password Reset)',
      `รหัสผ่านใหม่ของคุณคือ: ${newPassword}`,
      html
    );
  } catch (err) {
    console.error("Error sending reset password mail:", err);
    throw err;
  }
};