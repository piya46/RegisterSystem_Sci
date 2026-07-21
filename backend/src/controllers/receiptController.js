const mongoose = require('mongoose');
const Receipt = require('../models/Receipt');
const Participant = require('../models/participant');
const Counter = require('../models/counter');
const { serverError } = require('../utils/httpResponses');

exports.generateReceipt = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  let participantEventId = null;

  try {
    const { participantId, amount, details } = req.body;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      const error = new Error('Receipt amount must be a non-negative number');
      error.statusCode = 400;
      throw error;
    }

    const participant = await Participant.findById(participantId).session(session);
    if (!participant) {
      throw new Error('Participant not found');
    }

    const eventId = participant.eventId;
    if (!eventId) {
      throw new Error('Participant is not linked to an event');
    }
    participantEventId = eventId;

    // Check if participant already has a receipt to prevent duplicates
    const existing = await Receipt.findOne({ participantId, eventId }).session(session);
    if (existing) {
      await session.abortTransaction();
      session.endSession();
      return res.json({ success: true, receipt: existing });
    }

    const counter = await Counter.findOneAndUpdate(
      { _id: `receipt:${eventId}` },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, session }
    );
    const eventSuffix = String(eventId).slice(-6).toUpperCase();
    const paddedNumber = String(counter.seq).padStart(5, '0');
    const receiptNumber = `REC-${eventSuffix}-${paddedNumber}`;

    const newReceipt = new Receipt({
      receiptNumber,
      participantId,
      eventId: participant.eventId,
      amount: numericAmount,
      details
    });

    await newReceipt.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({ success: true, receipt: newReceipt });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    if (err?.code === 11000 && req.body?.participantId && participantEventId) {
      const existing = await Receipt.findOne({
        participantId: req.body.participantId,
        eventId: participantEventId,
      });
      if (existing) return res.json({ success: true, receipt: existing });
    }
    console.error('Generate Receipt Error:', err);
    serverError(res, err);
  }
};
