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

// 🌟 ฟังก์ชันช่วยแบ่งชุดข้อมูล (อาร์เรย์) เป็นชุดย่อย ชุดละ N รายการ
const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

exports.generatePDF = async (reportData, requestedBy = 'System') => {
  return new Promise(async (resolve, reject) => {
    try {
      const margin = 30; 
      
      const doc = new PDFDocument({
        margin: margin,
        size: 'A4',
        layout: 'landscape',
        bufferPages: true 
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const contentWidth = pageWidth - (margin * 2);
      const bottomSafeLimit = pageHeight - margin;

      if (hasFont) doc.font(fontRegularPath);

      // --- 1. ส่วนหัว (Main Title) ---
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

      doc.moveDown(2); 

      // --- 2. ตาราง (Table) หั่นชุดละ 8 คน ---
      if (!reportData || !reportData.rows || reportData.rows.length === 0) {
        doc.moveDown(2);
        doc.text('--- ไม่พบข้อมูล ---', { align: 'center' });
      } else {
        
        // 🌟 หั่นอาร์เรย์ข้อมูลผู้ลงทะเบียนให้เหลือสูงสุดหน้าละ 8 คน
        const MAX_ROWS_PER_PAGE = 8;
        const rowChunks = chunkArray(reportData.rows, MAX_ROWS_PER_PAGE);

        // วนลูปวาดตารางทีละหน้า
        for (let c = 0; c < rowChunks.length; c++) {
          const currentChunk = rowChunks[c];
          
          const tableBody = currentChunk.map((row, index) => {
            // คำนวณลำดับเลขรวมให้ต่อเนื่องข้ามหน้า (เช่น หน้าสองเริ่มที่เลข 9)
            const globalIndex = (c * MAX_ROWS_PER_PAGE) + index;
            return [
               (globalIndex + 1).toString(),
               `${row.fullName}\n(${row.nickName}) รุ่น ${row.year}\nสาขา: ${row.dept}`,
               `โทร: ${row.phone}\nอีเมล: ${row.email}`,
               `${row.type}\n${row.followers > 0 ? `ผู้ติดตาม: ${row.followers}` : '-'}`,
               row.special,
               row.donationInfo
             ];
          });

          const table = {
            headers: [
              { label: "ลำดับ", width: 35, align: 'center' },
              { label: "ข้อมูลผู้เข้าร่วมงาน", width: 210, align: 'left' },
              { label: "ติดต่อ", width: 145, align: 'left' },
              { label: "ลงทะเบียน", width: 85, align: 'left' },
              { label: "ช่วยเหลือพิเศษ", width: 150, align: 'left' },
              { label: "ข้อมูลบริจาค", width: 125, align: 'left' } 
            ],
            rows: tableBody
          };

          // 🌟 ถ้าไม่ใช่ชุดข้อมูลแรก (ไม่ใช่หน้าแรก) ให้ตัดขึ้นหน้ากระดาษใหม่ก่อนวาดตารางต่อ
          if (c > 0) {
            doc.addPage();
            doc.y = margin + 20; // รีเซ็ตตำแหน่งแกน Y สำหรับหน้าใหม่
          }

          if (hasFont) doc.font(fontRegularPath).fontSize(9);

          await doc.table(table, {
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
            padding: 6, // ลด Padding ลงเล็กน้อยไม่ให้อึดอัด
          });
        }
      }

      // --- 3. ส่วนสรุป (Summary) ---
      const summary = reportData.summary || {};
      
      // ฟังก์ชันสำหรับเช็คว่าพื้นที่เหลือพอไหม ถ้าไม่พอให้ตัดขึ้นหน้าใหม่
      const checkSpace = (requiredSpace) => {
        if (doc.y + requiredSpace > bottomSafeLimit) {
          doc.addPage();
          doc.y = margin + 20; 
        }
      };

      checkSpace(150);
      doc.moveDown(2);

      // เส้นคั่น
      doc.moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).strokeColor('#CCCCCC').stroke();
      doc.moveDown(1);

      if (hasFont) doc.font(fontBoldPath);
      doc.fontSize(14).fillColor('#000000').text('บทสรุปภาพรวม', margin, doc.y);
      doc.moveDown(0.5);

      // --- 3.1 กล่องสถิติ (KPI Boxes) ---
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

      // --- 3.2 ลิสต์สรุปสาขาและรุ่น ---
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

      // --- 3.3 Special Needs (ความช่วยเหลือพิเศษ) ---
      checkSpace(60); 
      if (hasFont) doc.font(fontBoldPath);
      doc.fontSize(11).fillColor('#000000').text('รายการขอความช่วยเหลือพิเศษ', margin, doc.y);
      doc.moveTo(margin, doc.y + 14).lineTo(pageWidth - margin, doc.y + 14).stroke();
      doc.moveDown(1.5);
      
      if (hasFont) doc.font(fontRegularPath);
      doc.fontSize(10);

      if (summary.specialNeeds && summary.specialNeeds.length > 0) {
        summary.specialNeeds.forEach(txt => {
          const textOptions = { width: contentWidth - 20, align: 'left' };
          const requiredHeight = doc.heightOfString(`• ${txt}`, textOptions);
          checkSpace(requiredHeight + 5); 
          doc.text(`• ${txt}`, margin + 10, doc.y, textOptions);
          doc.moveDown(0.2);
        });
      } else {
         doc.fillColor('#777777').text('- ไม่มี -', margin + 10, doc.y);
      }

      // --- 4. หมายเลขหน้ามุมบนขวา (วนลูปแปะทีหลังสุด) ---
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        const topY = 15; 
        if (hasFont) doc.font(fontRegularPath);
        doc.fontSize(8).fillColor('#888888'); 
        doc.text(
            `พิมพ์โดย: ${requestedBy} จาก Registration Management | หน้า ${i + 1} / ${range.count}`, 
            margin, 
            topY, 
            { align: 'right', width: contentWidth }
        );
      }

      doc.end();

    } catch (err) {
      console.error('PDF Generation Error:', err);
      reject(err);
    }
  });
};