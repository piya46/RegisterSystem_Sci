// backend/src/controllers/publicController.js
const jwt = require('jsonwebtoken');
const Participant = require('../models/participant');

// [ส่วนเดิม]
exports.generateKioskToken = async (req, res) => {
  try {
    const { pointId } = req.body;
    if (!pointId) return res.status(400).json({ error: 'ต้องระบุ Registration Point' });
    const token = jwt.sign( { role: 'kiosk_device', pointId, createdBy: req.user._id }, process.env.JWT_SECRET, { expiresIn: '12h' } );
    res.json({ token });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

// [ส่วนเดิม]
exports.getPublicReport = async (req, res) => {
  try {
    const participants = await Participant.find({ isDeleted: false, status: 'checkedIn' }, 'fields.name fields.department registeredPoint checkedInAt tags').lean();
    const maskedData = participants.map(p => {
      let maskedName = p.fields?.name ? p.fields.name.substring(0, 3) + '***' : 'Unknown';
      return { name: maskedName, department: p.fields?.department || '', point: p.registeredPoint, checkedInAt: p.checkedInAt, tags: p.tags || [] };
    });
    res.json({ totalCheckedIn: maskedData.length, data: maskedData });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

// 🌟 [เพิ่มใหม่] ดึงข้อมูลสถิติสำหรับหน้า Live Dashboard
exports.getPublicDashboardStats = async (req, res) => {
  try {
    // ดึงเฉพาะคนที่ Check-in แล้ว
    const participants = await Participant.find(
      { isDeleted: false, status: 'checkedIn' }, 
      'fields.dept fields.date_year followers'
    ).lean();
    
    let totalCheckedIn = participants.length;
    let totalFollowers = 0;
    let deptCount = {};
    let yearCount = {};

    participants.forEach(p => {
      // นับรวมผู้ติดตาม
      totalFollowers += (p.followers || 0);
      
      // นับแยกภาควิชา
      const dept = p.fields?.dept || 'ไม่ระบุภาควิชา';
      deptCount[dept] = (deptCount[dept] || 0) + 1;

      // นับแยกปีการศึกษา
      const year = p.fields?.date_year || 'ไม่ระบุปีการศึกษา';
      yearCount[year] = (yearCount[year] || 0) + 1;
    });

    res.json({
      totalCheckedIn,
      totalFollowers,
      totalAttendees: totalCheckedIn + totalFollowers,
      // แปลง Object ให้เป็น Array และเรียงลำดับจากมากไปน้อย
      deptStats: Object.keys(deptCount).map(k => ({ name: k, count: deptCount[k] })).sort((a,b) => b.count - a.count),
      yearStats: Object.keys(yearCount).map(k => ({ name: k, count: yearCount[k] })).sort((a,b) => b.count - a.count),
      updatedAt: new Date() // ส่งเวลาที่ Query ข้อมูลกลับไปด้วย
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};