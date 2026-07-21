const Prize = require('../models/prize');
const Participant = require('../models/participant');
const mongoose = require('mongoose');
const { auditSensitiveAccess } = require('../helpers/sensitiveAuditLog');
const { serverError, pickAllowed } = require('../utils/httpResponses');
const { revealParticipantObject } = require('../utils/fieldEncryption');
const { eventScopeFromRequest, getEventContextFromRequest, getCurrentEventYear, normalizeEventYear } = require('../utils/eventYear');
const { bucketTimestamp, maskDisplayName } = require('../utils/publicPrivacy');
const auditLog = require('../helpers/auditLog');

const PRIZE_FIELDS = ['name', 'totalQuantity', 'image', 'eventYear'];

function contextRefsForYear(context, eventYear) {
  if (normalizeEventYear(context?.eventYear) !== normalizeEventYear(eventYear)) return {};
  return {
    organizationId: context.organizationId,
    seriesId: context.seriesId,
    eventId: context.eventId,
  };
}

function scopeForPrize(prize, prizeEventYear) {
  if (!prize.eventId) return { eventYear: prizeEventYear };
  return { eventId: prize.eventId };
}

function featureDisabled(event, key) {
  return event?.config?.enabledFeatures && event.config.enabledFeatures[key] === false;
}

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
    const eventScope = await eventScopeFromRequest(req, {}, { requireEventIdentity: true });
    if (featureDisabled(eventScope.event, 'luckyDraw')) {
      return res.json([]);
    }
    const { eventYear, filter } = eventScope;
    const prizes = await Prize.find(filter)
      .populate('winners.participantId', 'fields.name fields.department fields.dept registeredPoint registeredPointName')
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
    const eventScope = await eventScopeFromRequest(req, {}, { requireEventIdentity: true, requirePublic: true, requireAccess: false });
    if (featureDisabled(eventScope.event, 'luckyDraw')) {
      return res.json([]);
    }
    const { eventYear, filter } = eventScope;
    const prizes = await Prize.find(filter)
      .populate('winners.participantId', 'fields.name fields.dept fields.department registeredPoint registeredPointName')
      .sort({ createdAt: -1 })
      .lean();

    const safePrizes = prizes.map(revealPrize).map((prize) => ({
      name: prize.name,
      totalQuantity: prize.totalQuantity,
      remainingQuantity: prize.remainingQuantity,
      winners: (prize.winners || []).map((winner) => ({
        wonAt: bucketTimestamp(winner.wonAt, 1),
        participantName: maskDisplayName(winner.participantId?.fields?.name),
        department: String(
          winner.participantId?.fields?.department || winner.participantId?.fields?.dept || ''
        ).slice(0, 80),
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

    res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=10');
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
    const eventContext = await getEventContextFromRequest(req, { requireEventIdentity: true });
    if (featureDisabled(eventContext.event, 'luckyDraw')) {
      return res.status(403).json({ error: 'กิจกรรมนี้ไม่ได้เปิดฟีเจอร์สุ่มผู้โชคดี' });
    }
    const eventYear = normalizeEventYear(payload.eventYear || eventContext.eventYear || await getCurrentEventYear());
    const prize = await Prize.create({
      name: payload.name,
      totalQuantity,
      remainingQuantity: totalQuantity,
      image: payload.image || null,
      ...contextRefsForYear(eventContext, eventYear),
      eventYear
    });
    res.json(prize);
  } catch (err) { serverError(res, err); }
};

exports.deletePrize = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'รหัสของรางวัลไม่ถูกต้อง' });
    }
    const eventContext = await getEventContextFromRequest(req, { requireEventIdentity: true });
    const prize = await Prize.findOne({ _id: req.params.id, eventId: eventContext.eventId });
    if (!prize) return res.status(404).json({ error: 'ไม่พบของรางวัลในกิจกรรมนี้' });
    if ((prize.winners || []).length > 0) {
      return res.status(409).json({ error: 'ไม่สามารถลบรางวัลที่มีผู้ชนะแล้ว กรุณายกเลิกผู้ชนะให้ครบก่อน' });
    }
    const deletion = await Prize.deleteOne({
      _id: prize._id,
      eventId: eventContext.eventId,
      'winners.0': { $exists: false },
    });
    if (deletion.deletedCount !== 1) {
      return res.status(409).json({ error: 'รางวัลมีผู้ชนะเพิ่มขึ้นระหว่างดำเนินการ กรุณาตรวจสอบใหม่' });
    }
    auditLog({ req, action: 'DELETE_PRIZE', detail: `eventId=${eventContext.eventId}; prizeId=${prize._id}` });
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
      const eventContext = await getEventContextFromRequest(req, { requireEventIdentity: true });
      if (featureDisabled(eventContext.event, 'luckyDraw') || String(prize.eventId || '') !== String(eventContext.eventId || '')) {
        const err = new Error('กิจกรรมนี้ไม่ได้เปิดฟีเจอร์สุ่มผู้โชคดี หรือของรางวัลไม่อยู่ในกิจกรรมนี้');
        err.statusCode = 403;
        throw err;
      }
      if (prize.remainingQuantity <= 0) {
        const err = new Error('ของรางวัลหมดแล้ว');
        err.statusCode = 400;
        throw err;
      }

      // Existing embedded winners are still the source for legacy data.
      const prizeEventYear = normalizeEventYear(prize.eventYear || await getCurrentEventYear());
      const prizeScope = scopeForPrize(prize, prizeEventYear);
      const allPrizes = await Prize.find(prizeScope).session(session);
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
              ...prizeScope,
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
            ...prizeScope,
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
  const session = await mongoose.startSession();
  try {
    const { prizeId, winnerId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(prizeId) || !mongoose.Types.ObjectId.isValid(winnerId)) {
      return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วนหรือรูปแบบไม่ถูกต้อง' });
    }

    const eventContext = await getEventContextFromRequest(req, { requireEventIdentity: true });
    if (featureDisabled(eventContext.event, 'luckyDraw')) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์จัดการรางวัลของกิจกรรมนี้' });
    }

    let updatedPrize = null;
    await session.withTransaction(async () => {
      const prize = await Prize.findOne({
        _id: prizeId,
        eventId: eventContext.eventId,
      }).session(session);
      if (!prize) {
        const error = new Error('ไม่พบของรางวัลในกิจกรรมนี้');
        error.statusCode = 404;
        throw error;
      }

      const originalLength = prize.winners.length;
      prize.winners = prize.winners.filter(
        (winner) => String(winner.participantId) !== String(winnerId)
      );
      const removedCount = originalLength - prize.winners.length;
      if (removedCount === 0) {
        const error = new Error('ไม่พบรายชื่อผู้ชนะท่านนี้ หรือถูกยกเลิกไปแล้ว');
        error.statusCode = 409;
        throw error;
      }

      const participant = await Participant.findOneAndUpdate(
        { _id: winnerId, eventId: eventContext.eventId },
        {
          $set: { isForfeited: true },
          $unset: { prizeId: 1, prizeWonAt: 1 },
        },
        { new: true, session }
      );
      if (!participant) {
        const error = new Error('ไม่พบผู้ชนะในกิจกรรมนี้');
        error.statusCode = 409;
        throw error;
      }

      prize.remainingQuantity = Math.min(
        prize.totalQuantity,
        prize.remainingQuantity + removedCount
      );
      await prize.save({ session });
      updatedPrize = prize;
    });

    auditLog({
      req,
      action: 'CANCEL_PRIZE_WINNER',
      detail: `eventId=${eventContext.eventId}; prizeId=${prizeId}; participantId=${winnerId}`,
    });
    return res.json({ message: 'ยกเลิกสิทธิ์สำเร็จ โควต้าถูกคืนแล้ว', prize: updatedPrize });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    return serverError(res, err);
  } finally {
    session.endSession();
  }
};
