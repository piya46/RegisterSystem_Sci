const Prize = require('../models/prize');
const Participant = require('../models/participant');
const mongoose = require('mongoose');
const { auditSensitiveAccess } = require('../helpers/sensitiveAuditLog');
const { serverError, pickAllowed } = require('../utils/httpResponses');
const { revealParticipantObject } = require('../utils/fieldEncryption');
const { applyEventYearFilter, eventYearFromRequest, getCurrentEventYear, normalizeEventYear } = require('../utils/eventYear');

const PRIZE_FIELDS = ['name', 'totalQuantity', 'image', 'eventYear'];

function revealWinnerParticipant(winner) {
  if (!winner?.participantId || typeof winner.participantId !== 'object') return winner;
  return {
    ...winner,
    participantId: revealParticipantObject(winner.participantId),
  };
}

function revealPrize(prize) {
  const obj = typeof prize.toObject === 'function' ? prize.toObject() : { ...prize };
  obj.winners = (obj.winners || []).map(revealWinnerParticipant);
  return obj;
}

exports.listPrizes = async (req, res) => {
  try {
    const eventYear = eventYearFromRequest(req) || await getCurrentEventYear();
    const prizes = await Prize.find(applyEventYearFilter({}, eventYear))
      .populate('winners.participantId', 'fields.name fields.department fields.dept registeredPoint')
      .sort({ createdAt: -1 });
    const safePrizes = prizes.map(revealPrize);
    await auditSensitiveAccess({
      req,
      action: 'SENSITIVE_DECRYPT_PRIZE_WINNERS',
      purpose: 'admin_prize_winner_list',
      resource: 'prizes.participants',
      eventYear,
      recordCount: safePrizes.reduce((sum, prize) => sum + (prize.winners?.length || 0), 0),
      fields: ['participant.fields.name', 'participant.fields.department'],
    });
    res.json(safePrizes);
  } catch (err) { serverError(res, err); }
};

exports.listPublicPrizes = async (req, res) => {
  try {
    const eventYear = eventYearFromRequest(req) || await getCurrentEventYear();
    const prizes = await Prize.find(applyEventYearFilter({}, eventYear))
      .populate('winners.participantId', 'fields.name fields.dept fields.department registeredPoint')
      .sort({ createdAt: -1 })
      .lean();

    const maskName = (name = '') => {
      const cleanName = String(name).trim();
      if (!cleanName) return 'ไม่ทราบชื่อ';
      return cleanName.length <= 3 ? `${cleanName[0]}***` : `${cleanName.slice(0, 3)}***`;
    };

    const safePrizes = prizes.map(revealPrize).map((prize) => ({
      _id: prize._id,
      name: prize.name,
      totalQuantity: prize.totalQuantity,
      remainingQuantity: prize.remainingQuantity,
      winners: (prize.winners || []).map((winner) => ({
        wonAt: winner.wonAt,
        participantName: maskName(winner.participantId?.fields?.name),
        department: winner.participantId?.fields?.department || winner.participantId?.fields?.dept || ''
      }))
    }));
    await auditSensitiveAccess({
      req,
      action: 'SENSITIVE_DECRYPT_PUBLIC_PRIZE_WINNERS_MASKED',
      purpose: 'public_prize_winner_list',
      resource: 'prizes.participants',
      eventYear,
      recordCount: safePrizes.reduce((sum, prize) => sum + (prize.winners?.length || 0), 0),
      fields: ['participant.fields.name'],
      extra: { masked: true },
    });

    res.json(safePrizes);
  } catch (err) {
    serverError(res, err);
  }
};

exports.createPrize = async (req, res) => {
  try {
    const payload = pickAllowed(req.body, PRIZE_FIELDS);
    const totalQuantity = Number.parseInt(payload.totalQuantity, 10);
    if (!payload.name || !Number.isFinite(totalQuantity) || totalQuantity < 1) {
      return res.status(400).json({ error: 'กรุณาระบุชื่อและจำนวนรางวัลให้ถูกต้อง' });
    }
    const prize = await Prize.create({
      name: payload.name,
      totalQuantity,
      remainingQuantity: totalQuantity,
      image: payload.image || null,
      eventYear: normalizeEventYear(payload.eventYear || await getCurrentEventYear())
    });
    res.json(prize);
  } catch (err) { serverError(res, err); }
};

exports.deletePrize = async (req, res) => {
  try {
    await Prize.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { serverError(res, err); }
};

// สุ่มผู้โชคดี (Lucky Draw)
exports.drawPrize = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { prizeId } = req.params;
    let result = null;

    await session.withTransaction(async () => {
      const prize = await Prize.findById(prizeId).session(session);
      if (!prize) {
        const err = new Error('ไม่พบของรางวัล');
        err.statusCode = 404;
        throw err;
      }
      if (prize.remainingQuantity <= 0) {
        const err = new Error('ของรางวัลหมดแล้ว');
        err.statusCode = 400;
        throw err;
      }

      // Existing embedded winners are still the source for legacy data.
      const prizeEventYear = normalizeEventYear(prize.eventYear || await getCurrentEventYear());
      const allPrizes = await Prize.find({ eventYear: prizeEventYear }).session(session);
      const wonIds = [];
      allPrizes.forEach(p => {
        p.winners.forEach(w => wonIds.push(w.participantId));
      });

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const randomWinner = await Participant.aggregate([
          {
            $match: {
              status: 'checkedIn',
              isDeleted: false,
              eventYear: prizeEventYear,
              isForfeited: { $ne: true },
              _id: { $nin: wonIds },
              $or: [{ prizeWonAt: null }, { prizeWonAt: { $exists: false } }]
            }
          },
          { $sample: { size: 1 } }
        ]).session(session);

        if (!randomWinner || randomWinner.length === 0) break;

        const winnerId = randomWinner[0]._id;
        const wonAt = new Date();
        const reservedWinner = await Participant.findOneAndUpdate(
          {
            _id: winnerId,
            status: 'checkedIn',
            isDeleted: false,
            eventYear: prizeEventYear,
            isForfeited: { $ne: true },
            $or: [{ prizeWonAt: null }, { prizeWonAt: { $exists: false } }]
          },
          { $set: { prizeId: prize._id, prizeWonAt: wonAt } },
          { new: true, session }
        ).select('+secureIndex');

        if (!reservedWinner) continue;

        const updatedPrize = await Prize.findOneAndUpdate(
          {
            _id: prize._id,
            remainingQuantity: { $gt: 0 },
            'winners.participantId': { $ne: winnerId }
          },
          {
            $inc: { remainingQuantity: -1 },
            $push: { winners: { participantId: winnerId, wonAt } }
          },
          { new: true, session }
        );

        if (!updatedPrize) {
          const err = new Error('ของรางวัลหมดแล้ว หรือผู้เข้าร่วมได้รับรางวัลไปแล้ว');
          err.statusCode = 409;
          throw err;
        }

        result = {
          prizeEventYear,
          winner: revealParticipantObject(reservedWinner),
          prize: updatedPrize
        };
        return;
      }

      const err = new Error('ไม่พบผู้ที่มีสิทธิ์รับรางวัล (หรือทุกคนได้รางวัลไปหมดแล้ว)');
      err.statusCode = 400;
      throw err;
    });

    const winner = result.winner;
    await auditSensitiveAccess({
      req,
      action: 'SENSITIVE_DECRYPT_PRIZE_DRAW_WINNER',
      purpose: 'admin_prize_draw',
      resource: 'participants',
      eventYear: result.prizeEventYear,
      recordCount: 1,
      fields: ['participant.fields.name', 'participant.fields.department'],
      extra: { prizeId: String(result.prize._id) },
    });

    res.json({
        message: 'Draw success',
        winner: { 
            _id: winner._id,
            name: winner.fields.name,
            department: winner.fields.department || winner.fields.dept || ''
        },
        prize: result.prize
    });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    serverError(res, err);
  } finally {
    session.endSession();
  }
};

exports.cancelWinner = async (req, res) => {
  try {
    const { prizeId, winnerId } = req.body;
    
    if (!prizeId || !winnerId) {
      return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });
    }

    const prize = await Prize.findById(prizeId);
    if (!prize) return res.status(404).json({ error: 'ไม่พบของรางวัล' });

    // 1. จำจำนวนผู้ชนะก่อนลบไว้
    const originalLength = prize.winners.length;

    // 2. กรองชื่อผู้ที่สละสิทธิ์ออก
    prize.winners = prize.winners.filter(
      w => w.participantId.toString() !== winnerId.toString()
    );

    // 3. ตรวจสอบว่ามีรายชื่อถูกลบออกไป "จริงหรือไม่" 
    if (prize.winners.length < originalLength) {
      // คำนวณจำนวนคนที่ลบออก (เผื่อกรณีรายชื่อซ้ำกัน)
      const removedCount = originalLength - prize.winners.length;
      
      // บวกโควต้าคืนตามจำนวนที่ลบออก
      prize.remainingQuantity += removedCount;

      // 4. ป้องกันจำนวนของรางวัลคงเหลือ เกินจำนวนรางวัลทั้งหมด (Total) ป้องกันการเบิ้ล
      if (prize.remainingQuantity > prize.totalQuantity) {
        prize.remainingQuantity = prize.totalQuantity;
      }

      await prize.save();

      // 🌟 5. อัปเดตข้อมูล Participant ว่าคนนี้ "สละสิทธิ์" (Blacklist) ไปแล้ว
      await Participant.findByIdAndUpdate(winnerId, {
        $set: { isForfeited: true },
        $unset: { prizeId: 1, prizeWonAt: 1 }
      });

      return res.json({ message: "ยกเลิกสิทธิ์สำเร็จ โควต้าถูกคืนแล้ว", prize });
      
    } else {
      // กรณีเผลอกดเบิ้ล หรือไม่มีชื่อนี้แล้ว จะตกมาที่นี่ และไม่โดนบวกโควต้าเพิ่มมั่วๆ ครับ
      return res.status(400).json({ error: "ไม่พบรายชื่อผู้ชนะท่านนี้ (อาจถูกยกเลิกไปแล้ว)" });
    }

  } catch (err) {
    serverError(res, err);
  }
};
