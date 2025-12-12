const Participant = require('../models/participant');
const Donation = require('../models/Donation');

exports.getReportData = async () => {
  try {
    const participants = await Participant.find({ isDeleted: false }).lean();
    const donations = await Donation.find({}).lean();

    // Map ข้อมูลบริจาค
    const donationMap = {};
    donations.forEach(d => {
      if (!d.firstName) return;
      const key = `${d.firstName} ${d.lastName || ''}`.trim().toLowerCase();
      if (!donationMap[key]) donationMap[key] = { amount: 0, details: [] };
      
      donationMap[key].amount += d.amount || 0;
      let detail = `${(d.amount || 0).toLocaleString()}฿`;
      if (d.isPackage) detail += ` (${d.packageType})`;
      donationMap[key].details.push(detail);
    });

    const rows = participants.map((p, index) => {
      const f = p.fields || {};
      const fullNameRaw = (f.name || '').trim();
      
      // แยกชื่อ
      let fname = fullNameRaw; 
      let lname = '';
      const spaceIdx = fullNameRaw.indexOf(' ');
      if (spaceIdx > 0) {
        fname = fullNameRaw.substring(0, spaceIdx);
        lname = fullNameRaw.substring(spaceIdx + 1);
      }
      
      const matchKey = fullNameRaw.toLowerCase();
      const don = donationMap[matchKey];

      // คำนวณผู้ติดตาม
      let followerCount = 0;
      if (Array.isArray(p.followers)) followerCount = p.followers.length;
      else if (typeof p.followers === 'number') followerCount = p.followers;

      return {
        seq: (index + 1).toString(),
        fullName: `${fname} ${lname}`.trim(),
        nickName: f.nickname || '-',
        dept: f.dept || '-',
        year: f.date_year || '-',
        phone: f.phone || '-',
        email: f.email || '-',
        type: p.registrationType === 'onsite' ? 'หน้างาน' : 'ออนไลน์',
        followers: followerCount,
        special: p.specialAssistance || '-',
        donationInfo: don ? don.details.join(', ') : '-'
      };
    });

    return { count: rows.length, rows };

  } catch (error) {
    console.error('Report Service Error:', error);
    return { count: 0, rows: [] };
  }
};