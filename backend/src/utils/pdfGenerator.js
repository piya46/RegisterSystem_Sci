const PDFDocument = require('pdfkit-table');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
require('dayjs/locale/th');

// Config Paths
const fontRegularPath = path.join(__dirname, '../fonts/Prompt-Regular.ttf');
const fontBoldPath = path.join(__dirname, '../fonts/Prompt-Bold.ttf');
const logoPath = path.join(__dirname, '../public/logo.png');
const hasFont = fs.existsSync(fontRegularPath);
const hasLogo = fs.existsSync(logoPath);

exports.generatePDF = async (reportData, requestedBy = 'System') => {
  return new Promise((resolve, reject) => {
    try {
      // --- 1. Setup Document ---
      // กลับมาใช้ Margin ปกติ 30pt ทุกด้าน ไม่ต้องกันที่ด้านล่างแล้ว
      const margin = 30; 
      
      const doc = new PDFDocument({
        margin: margin,
        size: 'A4',
        layout: 'landscape',
        bufferPages: true // สำคัญ: ต้องเปิดไว้เพื่อวนลูปกลับมาเขียนเลขหน้าทีหลัง
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // --- 2. คำนวณพื้นที่ ---
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const contentWidth = pageWidth - (margin * 2);
      
      // จุดต่ำสุดที่ยอมให้เนื้อหาอยู่ (ลบ Margin ล่างปกติ)
      const bottomSafeLimit = pageHeight - margin;

      if (hasFont) doc.font(fontRegularPath);

      // --- 3. ส่วนหัว (Main Title) ---
      // ขยับหัวข้อหลักลงมานิดหน่อย (Y + 10) เพื่อให้ไม่ชนกับเลขหน้าที่เราจะแปะมุมขวาบน
      let headerY = margin + 10; 
      let headerX = margin;

      if (hasLogo) {
        doc.image(logoPath, headerX, headerY - 5, { width: 45 });
        headerX += 55;
      }

      if (hasFont) doc.font(fontBoldPath);
      doc.fillColor('#000000').fontSize(18)
         .text('รายงานสรุปข้อมูลผู้ลงทะเบียน', headerX, headerY);

      if (hasFont) doc.font(fontRegularPath);
      doc.fillColor('#000000').fontSize(10)
         .text(`ข้อมูล ณ วันที่ ${dayjs().locale('th').format('DD MMMM YYYY เวลา HH:mm:ss น.')}`, headerX, headerY + 25);

      doc.moveDown(2); // เว้นบรรทัดให้ห่างจากหัวข้อหน่อย

      // --- 4. ตาราง (Table) ---
      if (!reportData || !reportData.rows || reportData.rows.length === 0) {
        doc.moveDown(2);
        doc.text('--- ไม่พบข้อมูล ---', { align: 'center' });
      } else {
        const tableBody = reportData.rows.map((row, index) => {
          return [
             (index + 1).toString(),
             `${row.fullName}\n(${row.nickName}) รุ่น ${row.year}\nสาขา: ${row.dept}`,
             `เบอร์โทรศัพท์: ${row.phone}\n อีเมล: ${row.email}`,
             `${row.type}\n${row.followers > 0 ? `ผู้ติดตาม: ${row.followers}` : '-'}`,
             row.special,
             row.donationInfo
           ];
        });

        const table = {
          headers: [
            { label: "ลำดับ", width: 40, align: 'center' },
            { label: "ข้อมูลผู้เข้าร่วมงาน", width: 220, align: 'left' },
            { label: "ติดต่อ", width: 160, align: 'left' },
            { label: "ลงทะเบียน", width: 110, align: 'left' },
            { label: "ช่วยเหลือพิเศษ", width: 110, align: 'left' },
            { label: "ข้อมูลบริจาค", width: 110, align: 'left' } 
          ],
          rows: tableBody
        };

        doc.table(table, {
          x: margin,
          width: contentWidth,
          prepareHeader: () => {
             if (hasFont) doc.font(fontBoldPath).fontSize(10);
             doc.fillColor('#000000');
          },
          prepareRow: (row, i) => {
             try { if (i % 2 === 0) doc.addBackground(new Array(6).fill(null), '#F4F4F4', 0.1); } catch(e) {}
             doc.fillColor('#000000').opacity(1);
             if (hasFont) doc.font(fontRegularPath).fontSize(9);
          },
          padding: 8,
        });
      }

      // --- 5. ส่วนสรุป (Summary) ---
      const summary = reportData.summary || {};
      
      const checkSpace = (requiredSpace) => {
        if (doc.y + requiredSpace > bottomSafeLimit) {
          doc.addPage();
          doc.y = margin + 20; // ขึ้นหน้าใหม่ ให้เว้นข้างบนไว้นิดหน่อยเผื่อ Header
        }
      };

      checkSpace(150);
      doc.moveDown(2);

      // เส้นคั่น
      doc.moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).strokeColor('#CCCCCC').stroke();
      doc.moveDown(1);

      // หัวข้อ
      if (hasFont) doc.font(fontBoldPath);
      doc.fontSize(14).fillColor('#000000').text('บทสรุปภาพรวม', margin, doc.y);
      doc.moveDown(0.5);

      // --- 5.1 KPI Boxes ---
      const boxHeight = 60;
      checkSpace(boxHeight + 20);

      const boxTopY = doc.y;
      const boxGap = 15;
      const boxWidth = (contentWidth - (boxGap * 2)) / 3;

      const drawStatBox = (index, title, value) => {
        const x = margin + ((boxWidth + boxGap) * index);
        doc.roundedRect(x, boxTopY, boxWidth, boxHeight, 5).fillAndStroke('#F9F9F9', '#E0E0E0');
        
        if (hasFont) doc.font(fontBoldPath);
        doc.fillColor('#000000').fontSize(18)
           .text(value, x + 10, boxTopY + 12, { width: boxWidth - 20, align: 'right' });
        
        if (hasFont) doc.font(fontRegularPath);
        doc.fillColor('#555555').fontSize(10)
           .text(title, x + 10, boxTopY + 15, { width: boxWidth - 20, align: 'left' });
      };

      drawStatBox(0, 'ผู้ลงทะเบียน', `${summary.totalParticipants || 0} คน`);
      drawStatBox(1, 'ผู้ติดตามรวม', `${summary.totalFollowers || 0} คน`);
      drawStatBox(2, 'ยอดบริจาค', `${(summary.totalDonation || 0).toLocaleString()} ฿`);

      doc.y = boxTopY + boxHeight + 20;

      // --- 5.2 Lists ---
      checkSpace(100);
      const listStartY = doc.y;
      const colWidth = (contentWidth - 20) / 2;

      const drawList = (x, title, items) => {
        let localY = listStartY;
        if (hasFont) doc.font(fontBoldPath);
        doc.fontSize(11).fillColor('#000000').text(title, x, localY);
        doc.moveTo(x, localY + 16).lineTo(x + colWidth, localY + 16).lineWidth(0.5).strokeColor('#000000').stroke();
        localY += 22;
        if (hasFont) doc.font(fontRegularPath);
        doc.fontSize(10);
        items.slice(0, 8).forEach((item) => {
           doc.text(item.label, x, localY, { width: colWidth - 50, align: 'left' });
           doc.text(`${item.count} คน`, x, localY, { width: colWidth, align: 'right' });
           localY += 14;
        });
        return localY;
      };

      const yLeft = drawList(margin, 'แยกตามรุ่น/ปี (Top 8)', summary.sortedYears || []);
      const yRight = drawList(margin + colWidth + 20, 'แยกตามสาขา (Top 8)', summary.sortedDepts || []);

      doc.y = Math.max(yLeft, yRight) + 20;

      // --- 5.3 Special Needs ---
      checkSpace(60); 
      if (hasFont) doc.font(fontBoldPath);
      doc.fontSize(11).fillColor('#000000').text('รายการขอความช่วยเหลือพิเศษ', margin, doc.y);
      doc.moveTo(margin, doc.y + 14).lineTo(pageWidth - margin, doc.y + 14).stroke();
      doc.moveDown(1.5);
      
      if (hasFont) doc.font(fontRegularPath);
      doc.fontSize(10);

      if (summary.specialNeeds && summary.specialNeeds.length > 0) {
        summary.specialNeeds.forEach(txt => {
          checkSpace(15); 
          doc.text(`• ${txt}`, margin + 10, doc.y);
          doc.moveDown(0.4);
        });
      } else {
         doc.fillColor('#777777').text('- ไม่มี -', margin + 10, doc.y);
      }

      // --- 6. Global Header Loop (ย้ายมาขวาบน) ---
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        
        // ตำแหน่ง: มุมขวาบน (Top Right)
        // margin = 30, เราจะวางไว้ที่ y = 15 (เหนือ margin เนื้อหา)
        const topY = 15; 
        
        doc.fontSize(8).fillColor('#888888'); // สีเทาจางๆ ดูสะอาดตา

        // เขียนชิดขวา
        doc.text(
            `พิมพ์โดย: ${requestedBy} จาก Registration Management | หน้า ${i + 1} / ${range.count}`, 
            margin, // เริ่มต้นที่ margin ซ้าย แต่...
            topY, 
            { 
                align: 'right', // สั่งให้ชิดขวา
                width: contentWidth // ความกว้างเต็มหน้า เพื่อให้มันดีดไปขวาสุดได้
            }
        );
      }

      doc.end();

    } catch (err) {
      console.error('PDF Generation Error:', err);
      reject(err);
    }
  });
};