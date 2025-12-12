const Participant = require('../models/participant');
const Donation = require('../models/Donation');

exports.getReportData = async () => {
  try {
    const participants = await Participant.find({ isDeleted: false }).lean();
    const donations = await Donation.find({}).lean();

    // 1. เตรียมตัวแปรสรุปผล (Summary Object)
    const summary = {
      totalParticipants: participants.length,
      totalFollowers: 0,
      totalDonation: 0,
      byYear: {},    // แยกตามรุ่น/ปี
      byDept: {},    // แยกตามภาควิชา
      specialNeeds: [] // รายการช่วยเหลือพิเศษ
    };

    // คำนวณยอดเงินบริจาครวม
    const donationMap = {};
    donations.forEach(d => {
      const amount = d.amount || 0;
      summary.totalDonation += amount;

      // Map ไว้ใส่ในตารางรายคน
      if (!d.firstName) return;
      const key = `${d.firstName} ${d.lastName || ''}`.trim().toLowerCase();
      if (!donationMap[key]) donationMap[key] = { amount: 0, details: [] };
      
      donationMap[key].amount += amount;
      let detail = `${amount.toLocaleString()}฿`;
      if (d.isPackage) detail += ` (${d.packageType})`;
      donationMap[key].details.push(detail);
    });

    // 2. Loop ข้อมูลคนเพื่อสร้าง Rows และนับสถิติ
    const rows = participants.map((p, index) => {
      const f = p.fields || {};
      const fullNameRaw = (f.name || '').trim();
      
      // แยกชื่อ-นามสกุล
      let fname = fullNameRaw; 
      let lname = '';
      const spaceIdx = fullNameRaw.indexOf(' ');
      if (spaceIdx > 0) {
        fname = fullNameRaw.substring(0, spaceIdx);
        lname = fullNameRaw.substring(spaceIdx + 1);
      }
      
      // ดึงข้อมูล
      const year = f.date_year || 'ไม่ระบุ'; // รุ่นปี
      const dept = f.dept || 'ไม่ระบุ';      // ภาควิชา
      const special = p.specialAssistance || '-';

      // นับจำนวนผู้ติดตาม
      let followers = 0;
      if (Array.isArray(p.followers)) followers = p.followers.length;
      else if (typeof p.followers === 'number') followers = p.followers;

      // --- อัปเดตข้อมูลสรุป (Summary) ---
      summary.totalFollowers += followers;

      // นับแยกปี (รุ่น)
      if (!summary.byYear[year]) summary.byYear[year] = 0;
      summary.byYear[year]++;

      // นับแยกภาควิชา
      if (!summary.byDept[dept]) summary.byDept[dept] = 0;
      summary.byDept[dept]++;

      // เก็บข้อมูลช่วยเหลือพิเศษ (เฉพาะที่มีข้อมูล)
      if (special && special !== '-' && special.trim() !== '') {
        summary.specialNeeds.push(`(${year}) ${fname}: ${special}`);
      }
      // -----------------------------------

      const matchKey = fullNameRaw.toLowerCase();
      const don = donationMap[matchKey];

      return {
        seq: (index + 1).toString(),
        fullName: `${fname} ${lname}`.trim(),
        nickName: f.nickname || '-',
        dept: dept,
        year: year,
        phone: f.phone || '-',
        email: f.email || '-',
        type: p.registrationType === 'onsite' ? 'หน้างาน' : 'ออนไลน์',
        followers: followers,
        special: special,
        donationInfo: don ? don.details.join(', ') : '-'
      };
    });

    // จัดเรียงข้อมูลสรุปให้สวยงาม (เช่น เรียงปีจากมากไปน้อย)
    // แปลง Object เป็น Array เพื่อส่งไปวนลูปแสดงผล
    const sortedYears = Object.entries(summary.byYear)
      .sort((a, b) => b[1] - a[1]) // เรียงตามจำนวนคนมากไปน้อย
      .map(([key, val]) => ({ label: key, count: val }));

    const sortedDepts = Object.entries(summary.byDept)
      .sort((a, b) => b[1] - a[1])
      .map(([key, val]) => ({ label: key, count: val }));

    return { 
      count: rows.length, 
      rows, 
      summary: { ...summary, sortedYears, sortedDepts } // ส่ง summary กลับไปด้วย
    };

  } catch (error) {
    console.error('Report Service Error:', error);
    return { count: 0, rows: [], summary: {} };
  }
};