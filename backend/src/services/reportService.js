const Participant = require('../models/participant');
const Donation = require('../models/Donation');

exports.getReportData = async () => {
  const participants = await Participant.find({ isDeleted: false }).lean();
  const donations = await Donation.find({}).lean();

  // สร้าง Map สำหรับค้นหา Donation ด้วย "ชื่อ นามสกุล"
  const donationMap = {};
  donations.forEach(d => {
    const key = `${d.firstName} ${d.lastName}`.trim().toLowerCase();
    if (!donationMap[key]) donationMap[key] = { amount: 0, details: [] };
    donationMap[key].amount += d.amount;
    
    let detail = `${d.amount.toLocaleString()}฿`;
    if (d.isPackage) detail += ` (${d.packageType})`;
    donationMap[key].details.push(detail);
  });

  // เตรียมข้อมูลแต่ละแถว
  const rows = participants.map((p, index) => {
    const f = p.fields || {};
    const fullNameRaw = (f.name || '').trim();
    const spaceIdx = fullNameRaw.indexOf(' ');
    const fname = spaceIdx > 0 ? fullNameRaw.substring(0, spaceIdx) : fullNameRaw;
    const lname = spaceIdx > 0 ? fullNameRaw.substring(spaceIdx + 1) : '';
    
    const matchKey = fullNameRaw.toLowerCase();
    const don = donationMap[matchKey];

    return [
      (index + 1).toString(),
      fname || '-',
      lname || '-',
      f.nickname || '-',
      f.phone || '-',
      f.email || '-',
      f.dept || '-',
      f.date_year || '-',
      (p.followers || 0).toString(),
      p.registrationType === 'onsite' ? 'หน้างาน' : 'ออนไลน์',
      p.specialAssistance || '-',
      don ? 'Yes' : 'No',
      don ? don.details.join(', ') : '-'
    ];
  });

  return {
    count: participants.length,
    rows
  };
};