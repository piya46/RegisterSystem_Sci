const PDFDocument = require('pdfkit-table');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
require('dayjs/locale/th');

// ** ต้องมีไฟล์ฟอนต์ภาษาไทยในโฟลเดอร์ fonts **
const fontRegular = path.join(__dirname, '../fonts/Prompt-Regular.ttf');
const fontBold = path.join(__dirname, '../fonts/Prompt-Bold.ttf');
const hasFont = fs.existsSync(fontRegular);

exports.generatePDF = async (reportData, requestedBy = 'System') => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    const buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));

    if (hasFont) doc.font(fontRegular);

    // Header
    doc.fontSize(18).text('รายงานสรุปข้อมูลผู้ลงทะเบียน (ฉบับละเอียด)', { align: 'center' });
    doc.fontSize(10).text(`ข้อมูล ณ วันที่ ${dayjs().locale('th').format('DD MMMM YYYY เวลา HH:mm น.')}`, { align: 'center' });
    doc.moveDown(1);

    // Table Configuration
    const table = {
      title: "",
      headers: [
        { label: "#", width: 25 },
        { label: "ชื่อ", width: 60 },
        { label: "นามสกุล", width: 60 },
        { label: "ชื่อเล่น", width: 40 },
        { label: "เบอร์โทร", width: 60 },
        { label: "อีเมล", width: 80 },
        { label: "ภาควิชา", width: 50 },
        { label: "ปี", width: 30 },
        { label: "ผต.", width: 25 },
        { label: "ประเภท", width: 40 },
        { label: "ความช่วยเหลือ", width: 70 },
        { label: "Support?", width: 40 },
        { label: "ข้อมูลสนับสนุน", width: 120 },
      ],
      rows: reportData.rows,
    };

    doc.table(table, {
      prepareHeader: () => hasFont ? doc.font(fontBold).fontSize(9) : doc.fontSize(9),
      prepareRow: (row, i) => {
        if(hasFont) doc.font(fontRegular).fontSize(8);
        doc.addBackground(row, i % 2 === 0 ? '#f5f5f5' : '#ffffff', 0.1);
      }
    });

    // Footer
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 30;
      doc.fontSize(8).fillColor('#777');
      doc.text(`พิมพ์โดย: ${requestedBy} | ระบบ Register System Sci`, 30, bottom, { align: 'left' });
      doc.text(`หน้า ${i + 1} / ${pages.count}`, doc.page.width - 100, bottom, { align: 'right' });
    }

    doc.end();
  });
};