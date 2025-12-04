const Participant = require('../models/participant');
const Admin = require('../models/admin');

exports.getDashboardSummary = async (req, res) => {
  try {
    // -------- สถิติโดยรวม (รายการ/participant) --------
    const [totalRegistered, checkedIn, cancelled, onlineRegistered, onsiteRegistered] = await Promise.all([
      Participant.countDocuments({ isDeleted: false }),
      Participant.countDocuments({ isDeleted: false, status: 'checkedIn' }),
      Participant.countDocuments({ isDeleted: false, status: 'cancelled' }),
      Participant.countDocuments({ isDeleted: false, registrationType: 'online' }),
      Participant.countDocuments({ isDeleted: false, registrationType: 'onsite' })
    ]);

    const notCheckedIn = Math.max(0, totalRegistered - checkedIn - cancelled);
    const checkinRate = totalRegistered > 0 ? Number(((checkedIn / totalRegistered) * 100).toFixed(2)) : 0;

    // -------- Followers รวม และตามสถานะ --------
    // รวมผู้ติดตาม + แยกตามสถานะ
    const followersStat = await Participant.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: '$status',
          followers: { $sum: { $ifNull: ['$followers', 0] } },
          participants: { $sum: 1 }
        }
      }
    ]);
    const followersByStatus = followersStat.reduce((acc, r) => {
      acc[r._id || 'registered'] = { followers: r.followers, participants: r.participants };
      return acc;
    }, {});
    const totalFollowers = Object.values(followersByStatus).reduce((s, v) => s + (v.followers || 0), 0);
    const checkedInFollowers = followersByStatus['checkedIn']?.followers || 0;
    const cancelledFollowers = followersByStatus['cancelled']?.followers || 0;
    const registeredFollowers = followersByStatus['registered']?.followers || 0;

    const totalPeopleRegistered = totalRegistered + totalFollowers;
    const totalPeopleCheckedIn = checkedIn + checkedInFollowers;
    const totalPeopleCancelled = cancelled + cancelledFollowers;
    const totalPeopleNotCheckedIn = Math.max(0, totalPeopleRegistered - totalPeopleCheckedIn - totalPeopleCancelled);

    // -------- 7 วันล่าสุด --------
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [newParticipantsLast7Days, newParticipantsPrev7Days] = await Promise.all([
      Participant.countDocuments({ isDeleted: false, registeredAt: { $gte: sevenDaysAgo } }),
      Participant.countDocuments({ isDeleted: false, registeredAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } })
    ]);

    let growthRate = 0;
    if (newParticipantsPrev7Days > 0) {
      growthRate = Number((((newParticipantsLast7Days - newParticipantsPrev7Days) / newParticipantsPrev7Days) * 100).toFixed(2));
    } else if (newParticipantsLast7Days > 0) {
      growthRate = 100.00;
    }

    // -------- Peak Hour (รวมผู้ติดตาม) --------
    const peakHourAgg = await Participant.aggregate([
      { $match: { isDeleted: false, status: 'checkedIn', checkedInAt: { $ne: null } } },
      { $project: {
          hour: { $hour: { date: '$checkedInAt', timezone: 'Asia/Bangkok' } },
          followerCount: { $ifNull: ['$followers', 0] }
      }},
      { $group: {
          _id: '$hour',
          participantCount: { $sum: 1 },
          followerCount: { $sum: '$followerCount' },
          totalCount: { $sum: { $add: [1, '$followerCount'] } }
      }},
      { $sort: { totalCount: -1 } },
      { $limit: 1 }
    ]);
    const peakHour = peakHourAgg.length ? peakHourAgg[0]._id : null;
    const peakHourCount = peakHourAgg.length ? peakHourAgg[0].totalCount : 0;

    // -------- Peak Day (นับรายการลงทะเบียน) --------
    const peakDayAgg = await Participant.aggregate([
      { $match: { isDeleted: false, registeredAt: { $ne: null } } },
      { $project: {
          day: { $dateToString: { format: '%Y-%m-%d', date: '$registeredAt', timezone: 'Asia/Bangkok' } },
          followerCount: { $ifNull: ['$followers', 0] }
      }},
      { $group: { _id: '$day', count: { $sum: 1 }, followerCount: { $sum: '$followerCount' } } },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]);
    const peakDay = peakDayAgg.length ? peakDayAgg[0]._id : null;
    const peakDayCount = peakDayAgg.length ? peakDayAgg[0].count : 0;

    // -------- Check-in by hour (มีทั้ง participantCount และ totalCount) --------
    const checkinByHour = await Participant.aggregate([
      { $match: { isDeleted: false, status: 'checkedIn', checkedInAt: { $ne: null } } },
      { $project: {
          hour: { $hour: { date: '$checkedInAt', timezone: 'Asia/Bangkok' } },
          followerCount: { $ifNull: ['$followers', 0] }
      }},
      { $group: {
          _id: '$hour',
          participantCount: { $sum: 1 },
          followerCount: { $sum: '$followerCount' },
          totalCount: { $sum: { $add: [1, '$followerCount'] } }
      }},
      { $sort: { _id: 1 } }
    ]);

    // -------- Registration by day (มีทั้ง count และ totalCount) --------
    const registrationByDay = await Participant.aggregate([
      { $match: { isDeleted: false, registeredAt: { $ne: null } } },
      { $project: {
          day: { $dateToString: { format: '%Y-%m-%d', date: '$registeredAt', timezone: 'Asia/Bangkok' } },
          followerCount: { $ifNull: ['$followers', 0] }
      }},
      { $group: {
          _id: '$day',
          count: { $sum: 1 },
          followerCount: { $sum: '$followerCount' },
          totalCount: { $sum: { $add: [1, '$followerCount'] } }
      }},
      { $sort: { _id: 1 } }
    ]);

  // -------- By Registration Point (รองรับ OID/สตริง + เคส online/onsite + fallback ชื่อเดิม) --------
const byRegistrationPoint = await Participant.aggregate([
  { $match: { isDeleted: false, registeredPoint: { $ne: null } } },

  // ระบุชนิดค่า: objectId จริง, สตริง 24-hex, หรือสตริงทั่วไป
  {
    $addFields: {
      _type: { $type: "$registeredPoint" },
      _isHexStr: {
        $and: [
          { $eq: [{ $type: "$registeredPoint" }, "string"] },
          { $regexMatch: { input: "$registeredPoint", regex: /^[a-f\d]{24}$/i } }
        ]
      }
    }
  },
  {
    $addFields: {
      rp_oid: {
        $cond: [
          { $eq: ["$_type", "objectId"] },
          "$registeredPoint",
          { $cond: ["$_isHexStr", { $toObjectId: "$registeredPoint" }, null] }
        ]
      },
      rp_nameRaw: {
        $cond: [
          { $or: [{ $eq: ["$_type", "objectId"] }, "$_isHexStr"] },
          null,
          { $toString: "$registeredPoint" }
        ]
      }
    }
  },
  {
    $addFields: {
      rp_nameKey: {
        $cond: [
          { $ne: ["$rp_nameRaw", null] },
          { $toLower: { $trim: { input: "$rp_nameRaw" } } },
          null
        ]
      }
    }
  },

  // รวมสถิติ
  {
    $group: {
      _id: { oid: "$rp_oid", nameKey: "$rp_nameKey" },
      registered: { $sum: 1 },
      checkedIn: { $sum: { $cond: [{ $eq: ["$status", "checkedIn"] }, 1, 0] } },
      cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
      followerRegistered: { $sum: { $ifNull: ["$followers", 0] } },
      followerCheckedIn: {
        $sum: {
          $cond: [{ $eq: ["$status", "checkedIn"] }, { $ifNull: ["$followers", 0] }, 0]
        }
      }
    }
  },

  // หา RegistrationPoint:
  // - ถ้า oid มี: จับคู่ _id
  // - ถ้า nameKey มี: จับคู่ name แบบ case-insensitive
  {
    $lookup: {
      from: "registrationpoints",
      let: { oid: "$_id.oid", nameKey: "$_id.nameKey" },
      pipeline: [
        {
          $match: {
            $expr: {
              $or: [
                { $and: [{ $ne: ["$$oid", null] }, { $eq: ["$_id", "$$oid"] }] },
                {
                  $and: [
                    { $ne: ["$$nameKey", null] },
                    { $eq: [{ $toLower: { $trim: { input: "$name" } } }, "$$nameKey"] }
                  ]
                }
              ]
            }
          }
        },
        { $limit: 1 }
      ],
      as: "pointDoc"
    }
  },
  { $addFields: { _point: { $arrayElemAt: ["$pointDoc", 0] } } },

  // ตั้งชื่อจุดตามลำดับ:
  // 1) _point.name จากคอลเลกชัน
  // 2) mapping ชื่อพิเศษ (online/onsite)
  // 3) ฟื้นจาก nameKey (capitalize) ถ้ามี
  // 4) สุดท้าย "ไม่ทราบจุด"
  {
    $addFields: {
      _mappedName: {
        $switch: {
          branches: [
            { case: { $eq: ["$_id.nameKey", "online"] }, then: "ลงทะเบียนออนไลน์" },
            { case: { $eq: ["$_id.nameKey", "onsite"] }, then: "ลงทะเบียนหน้างาน" }
          ],
          default: null
        }
      },
      _capFromKey: {
        $cond: [
          { $ne: ["$_id.nameKey", null] },
          {
            $concat: [
              { $toUpper: { $substrCP: ["$_id.nameKey", 0, 1] } },
              { $substrCP: ["$_id.nameKey", 1, { $strLenCP: "$_id.nameKey" }] }
            ]
          },
          null
        ]
      }
    }
  },
  {
    $addFields: {
      pointName: {
        $ifNull: ["$_point.name", { $ifNull: ["$_mappedName", { $ifNull: ["$_capFromKey", "ไม่ทราบจุด"] }] }]
      }
    }
  },

  {
    $project: {
      pointId: "$_id",
      pointName: 1,
      registered: 1,
      checkedIn: 1,
      cancelled: 1,
      followerRegistered: 1,
      followerCheckedIn: 1,
      totalRegisteredPeople: { $add: ["$registered", "$followerRegistered"] },
      totalCheckedInPeople: { $add: ["$checkedIn", "$followerCheckedIn"] },
      _id: 0
    }
  },
  { $sort: { pointName: 1 } }
]);


    // -------- By Department --------
    const byDepartment = await Participant.aggregate([
      { $match: { isDeleted: false, 'fields.dept': { $exists: true, $ne: null } } },
      { $group: {
          _id: '$fields.dept',
          registered: { $sum: 1 },
          checkedIn: { $sum: { $cond: [{ $eq: ['$status', 'checkedIn'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          followerRegistered: { $sum: { $ifNull: ['$followers', 0] } },
          followerCheckedIn: { $sum: { $cond: [{ $eq: ['$status', 'checkedIn'] }, { $ifNull: ['$followers', 0] }, 0] } }
      }},
      { $project: {
          department: '$_id',
          registered: 1,
          checkedIn: 1,
          cancelled: 1,
          followerRegistered: 1,
          followerCheckedIn: 1,
          totalRegisteredPeople: { $add: ['$registered', '$followerRegistered'] },
          totalCheckedInPeople: { $add: ['$checkedIn', '$followerCheckedIn'] },
          _id: 0
      }},
      { $sort: { department: 1 } }
    ]);

    // -------- By Year --------
    const byYear = await Participant.aggregate([
      { $match: { isDeleted: false, 'fields.date_year': { $exists: true, $ne: null } } },
      { $group: {
          _id: '$fields.date_year',
          registered: { $sum: 1 },
          checkedIn: { $sum: { $cond: [{ $eq: ['$status', 'checkedIn'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          followerRegistered: { $sum: { $ifNull: ['$followers', 0] } },
          followerCheckedIn: { $sum: { $cond: [{ $eq: ['$status', 'checkedIn'] }, { $ifNull: ['$followers', 0] }, 0] } }
      }},
      { $project: {
          year: '$_id',
          registered: 1,
          checkedIn: 1,
          cancelled: 1,
          followerRegistered: 1,
          followerCheckedIn: 1,
          totalRegisteredPeople: { $add: ['$registered', '$followerRegistered'] },
          totalCheckedInPeople: { $add: ['$checkedIn', '$followerCheckedIn'] },
          _id: 0
      }},
      { $sort: { year: 1 } }
    ]);

    // -------- ผู้ใช้ที่เช็คอิน --------
    const checkedInUsers = await Participant.aggregate([
      { $match: { isDeleted: false, status: 'checkedIn', registeredBy: { $ne: null } } },
      { $group: { _id: '$registeredBy', count: { $sum: 1 } } },
      { $lookup: { from: 'admins', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { userId: '$user._id', username: '$user.username', fullName: '$user.fullName', count: 1 } },
      { $sort: { count: -1 } }
    ]);

    // -------- เช็คอินล่าสุด --------
    const lastCheckedInDocs = await Participant.find(
      { isDeleted: false, status: 'checkedIn' },
      { 'fields.name': 1, checkedInAt: 1 }
    ).sort({ checkedInAt: -1 }).limit(10).lean();

    const lastCheckedIn = lastCheckedInDocs.map(d => ({
      _id: d._id,
      fullName: d.fields?.name || '-',
      checkedInAt: d.checkedInAt
    }));

    // -------- สรุปสถานะรวม (สำหรับวาดโดนัท) --------
    const statusBreakdown = {
      participants: {
        checkedIn,
        notCheckedIn,
        cancelled,
        total: totalRegistered
      },
      followers: {
        checkedIn: checkedInFollowers,
        notCheckedIn: Math.max(0, totalFollowers - checkedInFollowers - cancelledFollowers),
        cancelled: cancelledFollowers,
        total: totalFollowers
      },
      people: {
        checkedIn: totalPeopleCheckedIn,
        notCheckedIn: totalPeopleNotCheckedIn,
        cancelled: totalPeopleCancelled,
        total: totalPeopleRegistered
      }
    };

    res.json({
      // base counters
      totalRegistered,
      checkedIn,
      cancelled,
      notCheckedIn,
      checkinRate,
      onlineRegistered,
      onsiteRegistered,

      // followers/people
      totalFollowers,
      checkedInFollowers,
      cancelledFollowers,
      registeredFollowers,
      totalPeopleRegistered,
      totalPeopleCheckedIn,
      totalPeopleCancelled,
      totalPeopleNotCheckedIn,

      // growth and peaks
      newParticipantsLast7Days,
      growthRate,
      peakHour,
      peakHourCount,
      peakDay,
      peakDayCount,

      // breakdowns
      statusBreakdown,
      byRegistrationPoint,
      byDepartment,
      byYear,

      // time-series
      checkinByHour,
      registrationByDay,

      // admins & recents
      checkedInUsers,
      lastCheckedIn
    });
  } catch (error) {
    console.error('Error in getDashboardSummary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
