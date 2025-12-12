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
    // สร้าง Document
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    const buffers = [];

    // เก็บ Buffer
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', (err) => reject(err));

    // ตั้งค่าฟอนต์หลัก
    if (hasFont) doc.font(fontRegular);

    // ---------------------------------------------------------
    // 1. ส่วนหัวรายงาน
    // ---------------------------------------------------------
    doc.fontSize(18).text('รายงานสรุปข้อมูลผู้ลงทะเบียน (ฉบับปรับปรุง)', { align: 'center' });
    doc.fontSize(10).text(`ข้อมูล ณ วันที่ ${dayjs().locale('th').format('DD MMMM YYYY เวลา HH:mm น.')}`, { align: 'center' });
    doc.moveDown(1);

    // Debug: แสดงจำนวนข้อมูลใน Console
    console.log("PDF Generation: จำนวนข้อมูลที่ได้รับ =", reportData?.rows?.length || 0, "แถว");

    // ตรวจสอบว่ามีข้อมูลหรือไม่
    if (!reportData || !reportData.rows || reportData.rows.length === 0) {
        doc.moveDown(2);
        doc.fontSize(14).fillColor('#999999').text('--- ไม่พบข้อมูลผู้ลงทะเบียนในช่วงเวลานี้ ---', { align: 'center' });
    } else {
        // ---------------------------------------------------------
        // 2. จัดเตรียมข้อมูล (Data Mapping)
        // ---------------------------------------------------------
        const formattedRows = reportData.rows.map((row, index) => {
            const fullName = `${row.ชื่อ || ''} ${row.นามสกุล || ''} ${row.ชื่อเล่น ? `(${row.ชื่อเล่น})` : ''}`.trim();
            const academicInfo = `ภาค: ${row.ภาควิชา || '-'} (ปี ${row.ปี || '-'})`;
            const contactInfo = `โทร: ${row.เบอร์โทร || '-'}\nเมล: ${row.อีเมล || '-'}`;
            const statusInfo = `${row.ประเภท || '-'}\n(ช่วย: ${row.ความช่วยเหลือ || '-'})`;

            return [
                (index + 1).toString(),
                `${fullName}\n${academicInfo}`,
                contactInfo,
                statusInfo,
                row.ข้อมูลสนับสนุน || '-'
            ];
        });

        // ---------------------------------------------------------
        // 3. ตั้งค่าตาราง
        // ---------------------------------------------------------
        const table = {
            title: "",
            headers: [
                { label: "#", width: 30, align: 'center' },
                { label: "ข้อมูลนักศึกษา", width: 200, renderer: null },
                { label: "ช่องทางติดต่อ", width: 170, renderer: null },
                { label: "สถานะ & ความช่วยเหลือ", width: 150, renderer: null },
                { label: "ข้อมูลสนับสนุน", width: 200, renderer: null },
            ],
            rows: formattedRows,
        };

        // วาดตาราง
        doc.table(table, {
            prepareHeader: () => hasFont ? doc.font(fontBold).fontSize(10) : doc.fontSize(10),
            prepareRow: (row, i) => {
                if (hasFont) doc.font(fontRegular).fontSize(9);
                
                // [แก้ไข] ปิดบรรทัดนี้เพื่อป้องกัน Error "unsupported number: undefined"
                // doc.addBackground(row, i % 2 === 0 ? '#f9fafb' : '#ffffff', 0.1);
            },
            padding: 5,
            divider: {
                header: { disabled: false, width: 1, opacity: 1 },
                horizontal: { disabled: false, width: 0.5, opacity: 0.5 }
            }
        });
    }

    // ---------------------------------------------------------
    // 4. ส่วนท้ายกระดาษ (Footer)
    // ---------------------------------------------------------
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