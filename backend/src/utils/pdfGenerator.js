const PDFDocument = require('pdfkit-table');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
require('dayjs/locale/th');

// Config Paths
const fontRegularPath = path.join(__dirname, '../fonts/Prompt-Regular.ttf');
const fontBoldPath = path.join(__dirname, '../fonts/Prompt-Bold.ttf');
const logoPath = path.join(__dirname, '../public/logo.png'); 

// เช็คไฟล์
const hasFont = fs.existsSync(fontRegularPath);
const hasLogo = fs.existsSync(logoPath);

exports.generatePDF = async (reportData, requestedBy = 'System') => {
  return new Promise((resolve, reject) => {
    try {
      // 1. ตั้งค่าหน้ากระดาษ A4 แนวนอน (Landscape)
      const doc = new PDFDocument({ 
        margin: 30, 
        size: 'A4', 
        layout: 'landscape',
        bufferPages: true 
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // โหลด Font เริ่มต้น
      if (hasFont) doc.font(fontRegularPath);

      // ---------------------------------------------------------
      // 2. ส่วนหัว (Header)
      // ---------------------------------------------------------
      let headerX = 30;
      let headerY = 25;

      // ถ้ามี Logo ให้วาง Logo
      if (hasLogo) {
        doc.image(logoPath, 30, 20, { width: 45 });
        headerX = 85; // ขยับข้อความหนี Logo
      }

      // ชื่อรายงาน (ตัวหนา สีดำ)
      if (hasFont) doc.font(fontBoldPath);
      doc.fontSize(18).fillColor('#000000') // สีดำตามสั่ง
         .text('รายงานสรุปข้อมูลผู้ลงทะเบียน', headerX, headerY);
      
      // วันที่ (ตัวธรรมดา สีเทาเข้มเกือบดำ)
      if (hasFont) doc.font(fontRegularPath);
      doc.fontSize(10).fillColor('#333333')
         .text(`ข้อมูล ณ วันที่ ${dayjs().locale('th').format('DD MMMM YYYY เวลา HH:mm น.')}`, headerX, headerY + 25);

      doc.moveDown(1.5); // เว้นบรรทัดก่อนเริ่มตาราง

      // ---------------------------------------------------------
      // 3. เตรียมข้อมูลตาราง (Data Processing)
      // ---------------------------------------------------------
      if (!reportData || !reportData.rows || reportData.rows.length === 0) {
        doc.moveDown(2);
        doc.fontSize(14).text('--- ไม่พบข้อมูล ---', { align: 'center' });
      } else {
        
        // แปลงข้อมูลเป็น Array ของ Array (สำหรับ pdfkit-table)
        const tableBody = reportData.rows.map(row => {
          // จัด Format ข้อความ
          const colInfo = `${row.fullName}\n(${row.nickName}) รุ่น ${row.year}\nสาขา: ${row.dept}`;
          const colContact = `${row.phone}\n${row.email}`;
          
          // เช็คผู้ติดตาม
          const followers = parseInt(row.followers || 0);
          const followerText = followers > 0 ? `ผู้ติดตาม: ${followers} คน` : '-';
          const colRegis = `${row.type}\n${followerText}`;
          
          // ข้อมูลการเงิน/ช่วยเหลือ
          const colSpecial = `${row.special}`;
          const colDonate = `${row.donationInfo}`;

          return [
            row.seq,
            colInfo,
            colContact,
            colRegis,
            colSpecial,
            colDonate
          ];
        });

        // ---------------------------------------------------------
        // 4. ตั้งค่าตาราง (Table Config) - เน้นสวยงามและอ่านง่าย
        // ---------------------------------------------------------
        const table = {
          headers: [
            { label: "#", width: 30, align: 'center' },
            { label: "ข้อมูลนักศึกษา", width: 230, align: 'left' },
            { label: "ติดต่อ", width: 170, align: 'left' },
            { label: "ลงทะเบียน", width: 110, align: 'left' },
            { label: "ช่วยเหลือพิเศษ", width: 110, align: 'left' },
            { label: "ข้อมูลบริจาค", width: 100, align: 'left' }
          ],
          rows: tableBody
        };

        // วาดตาราง
        doc.table(table, {
          // ความกว้างรวม
          width: 750, 
          // 4.1 หัวตาราง (Header Style)
          prepareHeader: () => {
             if (hasFont) doc.font(fontBoldPath).fontSize(10);
             doc.fillColor('#000000'); // ตัวหนังสือดำ
          },
          // 4.2 เนื้อหาตาราง (Row Style)
          prepareRow: (row, i) => {
             // *** สำคัญมาก: ต้องสั่ง Font ใหม่ทุกแถว ไม่งั้นภาษาไทยหาย ***
             if (hasFont) doc.font(fontRegularPath).fontSize(9);
             doc.fillColor('#000000'); // ตัวหนังสือดำ
             
             // สลับสีบรรทัด (Zebra Striping) - เทาจางๆ สลับ ขาว
             // ใช้ try-catch กัน Error ในบางเวอร์ชั่น
             try {
                if (i % 2 === 0) {
                  doc.addBackground(new Array(6).fill(null), '#F9F9F9', 0.1); 
                }
             } catch(e) {}
          },
          // เส้นขอบและ Padding
          padding: 8,
          divider: {
            header: { disabled: false, width: 1, opacity: 1 }, // เส้นใต้หัวหนาหน่อย
            horizontal: { disabled: false, width: 0.5, opacity: 0.3 } // เส้นแบ่งบรรทัดบางๆ
          }
        });
      }

      // 5. Footer (เลขหน้า)
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        const bottom = doc.page.height - 25;
        doc.fontSize(8).fillColor('#666666'); // สีเทาอ่อนสำหรับ Footer พอ
        doc.text(`พิมพ์โดย: ${requestedBy} | Register System`, 30, bottom, { align: 'left' });
        doc.text(`หน้า ${i + 1} / ${range.count}`, doc.page.width - 100, bottom, { align: 'right' });
      }

      doc.end();

    } catch (err) {
      console.error('PDF Generation Error:', err);
      reject(err);
    }
  });
};