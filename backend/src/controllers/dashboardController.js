const Participant = require('../models/participant');
const Admin = require('../models/admin');
const Donation = require('../models/Donation');
const Event = require('../models/event');
const { auditSensitiveAccess } = require('../helpers/sensitiveAuditLog');
const { revealParticipantObject } = require('../utils/fieldEncryption');
const { eventScopeFromRequest } = require('../utils/eventYear');
const { serverError } = require('../utils/httpResponses');
const { REGISTRATION_TYPES, ONSITE_REGISTRATION_TYPES } = require('../utils/registrationTypes');

function idString(value) {
  return value ? String(value) : '';
}

exports.getDashboardSummary = async (req, res) => {
  try {
    const eventScope = await eventScopeFromRequest(req, { isDeleted: false }, { requireEventIdentity: true });
    const baseFilter = eventScope.filter;
    // -------- สถิติโดยรวม (รายการ/participant) --------
    const [
      totalRegistered,
      checkedIn,
      cancelled,
      onlineRegistered,
      onsiteRegistered,
      onsiteStaffRegistered,
      onsiteKioskRegistered,
      selfRegisterRegistered,
    ] = await Promise.all([
      Participant.countDocuments(baseFilter),
      Participant.countDocuments({ ...baseFilter, status: 'checkedIn' }),
      Participant.countDocuments({ ...baseFilter, status: 'cancelled' }),
      Participant.countDocuments({ ...baseFilter, registrationType: REGISTRATION_TYPES.ONLINE }),
      Participant.countDocuments({ ...baseFilter, registrationType: { $in: ONSITE_REGISTRATION_TYPES } }),
      Participant.countDocuments({ ...baseFilter, registrationType: REGISTRATION_TYPES.ONSITE_STAFF }),
      Participant.countDocuments({ ...baseFilter, registrationType: REGISTRATION_TYPES.ONSITE_KIOSK }),
      Participant.countDocuments({ ...baseFilter, registrationType: REGISTRATION_TYPES.SELF_REGISTER })
    ]);

    const notCheckedIn = Math.max(0, totalRegistered - checkedIn - cancelled);
    const checkinRate = totalRegistered > 0 ? Number(((checkedIn / totalRegistered) * 100).toFixed(2)) : 0;

    // -------- Followers รวม และตามสถานะ --------
    // รวมผู้ติดตาม + แยกตามสถานะ
    const followersStat = await Participant.aggregate([
      { $match: baseFilter },
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
      Participant.countDocuments({ ...baseFilter, registeredAt: { $gte: sevenDaysAgo } }),
      Participant.countDocuments({ ...baseFilter, registeredAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } })
    ]);

    let growthRate = 0;
    if (newParticipantsPrev7Days > 0) {
      growthRate = Number((((newParticipantsLast7Days - newParticipantsPrev7Days) / newParticipantsPrev7Days) * 100).toFixed(2));
    } else if (newParticipantsLast7Days > 0) {
      growthRate = 100.00;
    }

    // -------- Peak Hour (รวมผู้ติดตาม) --------
    const peakHourAgg = await Participant.aggregate([
      { $match: { ...baseFilter, status: 'checkedIn', checkedInAt: { $ne: null } } },
      {
        $project: {
          hour: { $hour: { date: '$checkedInAt', timezone: 'Asia/Bangkok' } },
          followerCount: { $ifNull: ['$followers', 0] }
        }
      },
      {
        $group: {
          _id: '$hour',
          participantCount: { $sum: 1 },
          followerCount: { $sum: '$followerCount' },
          totalCount: { $sum: { $add: [1, '$followerCount'] } }
        }
      },
      { $sort: { totalCount: -1 } },
      { $limit: 1 }
    ]);
    const peakHour = peakHourAgg.length ? peakHourAgg[0]._id : null;
    const peakHourCount = peakHourAgg.length ? peakHourAgg[0].totalCount : 0;

    // -------- Peak Day (นับรายการลงทะเบียน) --------
    const peakDayAgg = await Participant.aggregate([
      { $match: { ...baseFilter, registeredAt: { $ne: null } } },
      {
        $project: {
          day: { $dateToString: { format: '%Y-%m-%d', date: '$registeredAt', timezone: 'Asia/Bangkok' } },
          followerCount: { $ifNull: ['$followers', 0] }
        }
      },
      { $group: { _id: '$day', count: { $sum: 1 }, followerCount: { $sum: '$followerCount' } } },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]);
    const peakDay = peakDayAgg.length ? peakDayAgg[0]._id : null;
    const peakDayCount = peakDayAgg.length ? peakDayAgg[0].count : 0;

    // -------- Check-in by hour (มีทั้ง participantCount และ totalCount) --------
    const checkinByHour = await Participant.aggregate([
      { $match: { ...baseFilter, status: 'checkedIn', checkedInAt: { $ne: null } } },
      {
        $project: {
          hour: { $hour: { date: '$checkedInAt', timezone: 'Asia/Bangkok' } },
          followerCount: { $ifNull: ['$followers', 0] }
        }
      },
      {
        $group: {
          _id: '$hour',
          participantCount: { $sum: 1 },
          followerCount: { $sum: '$followerCount' },
          totalCount: { $sum: { $add: [1, '$followerCount'] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // -------- Registration by day (มีทั้ง count และ totalCount) --------
    const registrationByDay = await Participant.aggregate([
      { $match: { ...baseFilter, registeredAt: { $ne: null } } },
      {
        $project: {
          day: { $dateToString: { format: '%Y-%m-%d', date: '$registeredAt', timezone: 'Asia/Bangkok' } },
          followerCount: { $ifNull: ['$followers', 0] }
        }
      },
      {
        $group: {
          _id: '$day',
          count: { $sum: 1 },
          followerCount: { $sum: '$followerCount' },
          totalCount: { $sum: { $add: [1, '$followerCount'] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // -------- By Registration Point (รองรับ OID/สตริง + เคส online/onsite + fallback ชื่อเดิม) --------
    const byRegistrationPoint = await Participant.aggregate([
      {
        $match: {
          ...baseFilter,
          $or: [
            { registeredPointId: { $ne: null } },
            { registeredPoint: { $ne: null } },
            { registeredPointName: { $exists: true, $ne: '' } }
          ]
        }
      },

      // ระบุชนิดค่า: objectId จริง, สตริง 24-hex, หรือสตริงทั่วไป
      {
        $addFields: {
          _type: { $type: "$registeredPoint" },
          _nameFromField: {
            $cond: [
              { $gt: [{ $strLenCP: { $trim: { input: { $ifNull: ["$registeredPointName", ""] } } } }, 0] },
              { $trim: { input: { $ifNull: ["$registeredPointName", ""] } } },
              null
            ]
          },
          _isHexStr: {
            $cond: [
              { $eq: [{ $type: "$registeredPoint" }, "string"] },
              { $regexMatch: { input: "$registeredPoint", regex: /^[a-f\d]{24}$/i } },
              false
            ]
          }
        }
      },
      {
        $addFields: {
          rp_oid: {
            $cond: [
              { $ne: ["$registeredPointId", null] },
              "$registeredPointId",
              {
                $cond: [
                  { $eq: ["$_type", "objectId"] },
                  "$registeredPoint",
                  { $cond: ["$_isHexStr", { $toObjectId: "$registeredPoint" }, null] }
                ]
              }
            ]
          },
          rp_nameRaw: {
            $cond: [
              { $ne: ["$_nameFromField", null] },
              "$_nameFromField",
              {
                $cond: [
                  { $or: [{ $eq: ["$_type", "objectId"] }, "$_isHexStr"] },
                  null,
                  { $toString: "$registeredPoint" }
                ]
              }
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
          displayName: { $first: "$rp_nameRaw" },
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
            $ifNull: ["$_point.name", { $ifNull: ["$displayName", { $ifNull: ["$_mappedName", { $ifNull: ["$_capFromKey", "ไม่ทราบจุด"] }] }] }]
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
      { $match: { ...baseFilter, 'fields.dept': { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$fields.dept',
          registered: { $sum: 1 },
          checkedIn: { $sum: { $cond: [{ $eq: ['$status', 'checkedIn'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          followerRegistered: { $sum: { $ifNull: ['$followers', 0] } },
          followerCheckedIn: { $sum: { $cond: [{ $eq: ['$status', 'checkedIn'] }, { $ifNull: ['$followers', 0] }, 0] } }
        }
      },
      {
        $project: {
          department: '$_id',
          registered: 1,
          checkedIn: 1,
          cancelled: 1,
          followerRegistered: 1,
          followerCheckedIn: 1,
          totalRegisteredPeople: { $add: ['$registered', '$followerRegistered'] },
          totalCheckedInPeople: { $add: ['$checkedIn', '$followerCheckedIn'] },
          _id: 0
        }
      },
      { $sort: { department: 1 } }
    ]);

    // -------- By Year --------
    const byYear = await Participant.aggregate([
      { $match: { ...baseFilter, 'fields.date_year': { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$fields.date_year',
          registered: { $sum: 1 },
          checkedIn: { $sum: { $cond: [{ $eq: ['$status', 'checkedIn'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          followerRegistered: { $sum: { $ifNull: ['$followers', 0] } },
          followerCheckedIn: { $sum: { $cond: [{ $eq: ['$status', 'checkedIn'] }, { $ifNull: ['$followers', 0] }, 0] } }
        }
      },
      {
        $project: {
          year: '$_id',
          registered: 1,
          checkedIn: 1,
          cancelled: 1,
          followerRegistered: 1,
          followerCheckedIn: 1,
          totalRegisteredPeople: { $add: ['$registered', '$followerRegistered'] },
          totalCheckedInPeople: { $add: ['$checkedIn', '$followerCheckedIn'] },
          _id: 0
        }
      },
      { $sort: { year: 1 } }
    ]);

    // -------- ผู้ใช้ที่เช็คอิน --------
    const checkedInUsers = await Participant.aggregate([
      { $match: { ...baseFilter, status: 'checkedIn', registeredBy: { $ne: null } } },
      { $group: { _id: '$registeredBy', count: { $sum: 1 } } },
      { $lookup: { from: 'admins', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { userId: '$user._id', username: { $ifNull: ['$user.username', 'Unknown'] }, fullName: { $ifNull: ['$user.fullName', 'Unknown'] }, count: 1 } },
      { $sort: { count: -1 } }
    ]);

    // -------- ผู้ใช้ที่ลงทะเบียน (ทั้งหมด) --------
    const registeredByUsers = await Participant.aggregate([
      { $match: { ...baseFilter, registeredBy: { $ne: null } } },
      { $group: { _id: '$registeredBy', count: { $sum: 1 } } },
      { $lookup: { from: 'admins', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { userId: '$user._id', username: { $ifNull: ['$user.username', 'Unknown'] }, fullName: { $ifNull: ['$user.fullName', 'Unknown'] }, count: 1 } },
      { $sort: { count: -1 } }
    ]);

    // -------- เช็คอินล่าสุด --------
    const lastCheckedInDocs = await Participant.find(
      { ...baseFilter, status: 'checkedIn' },
      { 'fields.name': 1, checkedInAt: 1 }
    ).sort({ checkedInAt: -1 }).limit(10).lean();

    const lastCheckedIn = lastCheckedInDocs.map(revealParticipantObject).map(d => ({
      _id: d._id,
      fullName: d.fields?.name || '-',
      checkedInAt: d.checkedInAt
    }));
    await auditSensitiveAccess({
      req,
      action: 'SENSITIVE_DECRYPT_DASHBOARD_RECENTS',
      purpose: 'admin_dashboard_recent_checkins',
      resource: 'participants',
      eventYear: eventScope.eventYear,
      recordCount: lastCheckedIn.length,
      fields: ['participant.fields.name'],
    });

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
      eventId: eventScope.eventId,
      eventYear: eventScope.eventYear,

      // base counters
      totalRegistered,
      checkedIn,
      cancelled,
      notCheckedIn,
      checkinRate,
      onlineRegistered,
      onsiteRegistered,
      onsiteStaffRegistered,
      onsiteKioskRegistered,
      selfRegisterRegistered,

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
      registeredByUsers,
      lastCheckedIn
    });
  } catch (error) {
    console.error('Error in getDashboardSummary:', error);
    serverError(res, error);
  }
};

exports.getDashboardComparison = async (req, res) => {
  try {
    const eventScope = await eventScopeFromRequest(req, { isDeleted: false }, { requireEventIdentity: true });
    let events = [];
    if (eventScope.eventId) {
      const event = await Event.findById(eventScope.eventId).select('name eventYear seriesId organizationId status');
      if (event?.seriesId) {
        events = await Event.find({ seriesId: event.seriesId }).select('name eventYear seriesId organizationId status').sort({ eventYear: -1 });
      } else if (event) {
        events = [event];
      }
    }
    const eventIds = events.map((event) => event._id);
    const participantMatch = eventIds.length
      ? { isDeleted: false, eventId: { $in: eventIds } }
      : eventScope.filter;
    const donationMatch = eventIds.length
      ? { eventId: { $in: eventIds } }
      : { eventId: eventScope.eventId };

    const [participantRows, donationRows] = await Promise.all([
      Participant.aggregate([
        { $match: participantMatch },
        {
          $group: {
            _id: { eventId: '$eventId', eventYear: '$eventYear' },
            registered: { $sum: 1 },
            checkedIn: { $sum: { $cond: [{ $eq: ['$status', 'checkedIn'] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
            followers: { $sum: { $ifNull: ['$followers', 0] } },
            checkedInFollowers: { $sum: { $cond: [{ $eq: ['$status', 'checkedIn'] }, { $ifNull: ['$followers', 0] }, 0] } },
            online: { $sum: { $cond: [{ $eq: ['$registrationType', REGISTRATION_TYPES.ONLINE] }, 1, 0] } },
            onsite: { $sum: { $cond: [{ $in: ['$registrationType', ONSITE_REGISTRATION_TYPES] }, 1, 0] } },
            onsiteStaff: { $sum: { $cond: [{ $eq: ['$registrationType', REGISTRATION_TYPES.ONSITE_STAFF] }, 1, 0] } },
            onsiteKiosk: { $sum: { $cond: [{ $eq: ['$registrationType', REGISTRATION_TYPES.ONSITE_KIOSK] }, 1, 0] } },
            selfRegister: { $sum: { $cond: [{ $eq: ['$registrationType', REGISTRATION_TYPES.SELF_REGISTER] }, 1, 0] } },
          },
        },
      ]),
      Donation.aggregate([
        { $match: donationMatch },
        {
          $group: {
            _id: { eventId: '$eventId', eventYear: '$eventYear' },
            amount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const donationsByKey = new Map();
    donationRows.forEach((row) => {
      donationsByKey.set(`${idString(row._id.eventId)}:${row._id.eventYear || ''}`, row);
    });

    const participantsByKey = new Map();
    participantRows.forEach((row) => {
      participantsByKey.set(`${idString(row._id.eventId)}:${row._id.eventYear || ''}`, row);
    });

    const rows = events.map((event) => {
      const eventId = idString(event._id);
      const year = String(event.eventYear || '');
      const participants = participantsByKey.get(`${eventId}:${year}`) || {};
      const donation = donationsByKey.get(`${eventId}:${year}`) || {};
      const registered = participants.registered || 0;
      const checkedIn = participants.checkedIn || 0;
      const followers = participants.followers || 0;
      const checkedInFollowers = participants.checkedInFollowers || 0;
      const totalPeople = registered + followers;
      const checkedInPeople = checkedIn + checkedInFollowers;
      return {
        eventId,
        eventName: event.name,
        eventYear: year,
        status: event.status,
        registered,
        checkedIn,
        cancelled: participants.cancelled || 0,
        followers,
        totalPeople,
        checkedInPeople,
        checkinRate: registered > 0 ? Number(((checkedIn / registered) * 100).toFixed(2)) : 0,
        peopleCheckinRate: totalPeople > 0 ? Number(((checkedInPeople / totalPeople) * 100).toFixed(2)) : 0,
        online: participants.online || 0,
        onsite: participants.onsite || 0,
        onsiteStaff: participants.onsiteStaff || 0,
        onsiteKiosk: participants.onsiteKiosk || 0,
        selfRegister: participants.selfRegister || 0,
        donationAmount: donation.amount || 0,
        donationCount: donation.count || 0,
      };
    });

    const rowsWithDelta = rows.map((row, index) => {
      const previous = rows[index + 1] || null;
      const registeredDelta = previous ? row.registered - previous.registered : null;
      const checkinRateDelta = previous ? Number((row.checkinRate - previous.checkinRate).toFixed(2)) : null;
      const donationDelta = previous ? row.donationAmount - previous.donationAmount : null;
      return { ...row, delta: { registered: registeredDelta, checkinRate: checkinRateDelta, donationAmount: donationDelta } };
    });

    res.json({
      success: true,
      data: {
        scope: eventScope.eventId ? 'series' : 'catalog',
        rows: rowsWithDelta,
        fields: [
          'eventYear',
          'eventName',
          'registered',
          'checkedIn',
          'followers',
          'totalPeople',
          'checkinRate',
          'peopleCheckinRate',
          'online',
          'onsite',
          'onsiteStaff',
          'onsiteKiosk',
          'selfRegister',
          'donationAmount',
          'delta.registered',
          'delta.checkinRate',
          'delta.donationAmount',
        ],
      },
    });
  } catch (error) {
    serverError(res, error);
  }
};
