// backend/src/utils/emailTemplates.js

const getOtpTemplate = (otp, ref, name = 'สมาชิก') => {
  // ธีมสีลูกเสือ
  const colors = {
    primary: '#F4B400',    // เหลือง (ผ้าพันคอ)
    secondary: '#5D4037',  // น้ำตาลเข้ม (ชุด/เข็มขัด)
    bg: '#FFFDF5',         // พื้นหลังครีมจางๆ
    white: '#FFFFFF',
    text: '#333333'
  };

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');
        body { font-family: 'Sarabun', sans-serif; background-color: ${colors.bg}; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background-color: ${colors.white}; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background-color: ${colors.primary}; padding: 20px; text-align: center; color: ${colors.secondary}; }
        .content { padding: 30px; text-align: center; color: ${colors.text}; }
        .otp-box { background-color: #FEF9E7; border: 2px dashed ${colors.primary}; border-radius: 8px; padding: 15px; margin: 20px 0; display: inline-block; }
        .otp-code { font-size: 32px; font-weight: bold; letter-spacing: 5px; color: ${colors.secondary}; margin: 0; }
        .ref-code { font-size: 14px; color: #666; margin-top: 5px; }
        .footer { background-color: ${colors.secondary}; padding: 15px; text-align: center; color: rgba(255,255,255,0.8); font-size: 12px; }
        .btn { display: inline-block; padding: 10px 20px; background-color: ${colors.secondary}; color: ${colors.white}; text-decoration: none; border-radius: 4px; margin-top: 20px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin:0; font-size: 24px;">⛺ ระบบยืนยันตัวตน</h1>
        </div>

        <div class="content">
          <h2 style="color: ${colors.secondary};">สวัสดีคุณ ${name}</h2>
          <p>เราได้รับคำขอ OTP เพื่อดำเนินการในระบบ กรุณาใช้รหัสนี้ภายใน 5 นาที</p>
          
          <div class="otp-box">
            <p class="otp-code">${otp}</p>
          </div>
          
          <div class="ref-code">
            <strong>Ref Code: ${ref}</strong>
          </div>

          <p style="margin-top: 30px; font-size: 14px; color: #888;">
            *หากคุณไม่ได้ทำรายการนี้ โปรดเพิกเฉยต่ออีเมลฉบับนี้
          </p>
        </div>

        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} PSTDEV</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

module.exports = { getOtpTemplate };