const Donation = require('../models/Donation');
const Package = require('../models/Package'); // [เพิ่ม] เรียกใช้ Package Model
const mongoose = require('mongoose');
const { sendLineDonationAlert } = require('../utils/lineNotify');
const auditLog = require('../helpers/auditLog'); 
const { auditSensitiveAccess } = require('../helpers/sensitiveAuditLog');
const verifyTurnstile = require('../utils/verifyTurnstile');
const isAdmin = require('../helpers/isAdmin');
const { serverError, pickAllowed } = require('../utils/httpResponses');
const { eventScopeFromRequest, getCurrentEventYear, getEventContextFromRequest, normalizeEventYear } = require('../utils/eventYear');
const { protectDonationPayload, revealDonationObject } = require('../utils/fieldEncryption');
const { claimPendingObject, parseObjectReference } = require('../utils/objectStorage');
const { boolEnv } = require('../utils/cloudCostGuardrail');
const {
  hashIdempotencyKey,
  normalizeIdempotencyKey,
  requestFingerprint,
} = require('../utils/idempotency');

const DONATION_FIELDS = [
  'firstName',
  'lastName',
  'amount',
  'transferDateTime',
  'source',
  'isPackage',
  'packageType',
  'size',
  'slipUrl',
  'address',
  'pickupMethod',
  'pickupLocation'
];

function trimString(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function isAdminSession(req) {
  return req.auth?.type === 'admin_session' && isAdmin(req.user);
}

function featureDisabled(event, key) {
  return event?.config?.enabledFeatures && event.config.enabledFeatures[key] === false;
}

function packageScope(eventId, eventYear) {
  return eventId ? { eventId } : { eventYear };
}

function packageAvailabilityExpression(size, { requireCapacity }) {
  return {
    $anyElementTrue: {
      $map: {
        input: '$items',
        as: 'item',
        in: {
          $anyElementTrue: {
            $map: {
              input: '$$item.sizes',
              as: 'sizeEntry',
              in: {
                $and: [
                  { $eq: ['$$sizeEntry.size', size] },
                  requireCapacity
                    ? { $lt: [{ $ifNull: ['$$sizeEntry.sold', 0] }, { $ifNull: ['$$sizeEntry.stock', 0] }] }
                    : { $gt: [{ $ifNull: ['$$sizeEntry.sold', 0] }, 0] },
                ],
              },
            },
          },
        },
      },
    },
  };
}

async function reservePackageUnit({ eventId, eventYear, packageType, size, session }) {
  const result = await Package.updateOne(
    {
      name: packageType,
      ...packageScope(eventId, eventYear),
      isActive: true,
      deletedAt: null,
      $or: [
        { orderDeadline: { $exists: false } },
        { orderDeadline: null },
        { orderDeadline: { $gte: new Date() } },
      ],
      $expr: packageAvailabilityExpression(size, { requireCapacity: true }),
    },
    { $inc: { 'items.$[].sizes.$[sizeElem].sold': 1 } },
    { arrayFilters: [{ 'sizeElem.size': size }], session }
  );
  if (result.modifiedCount !== 1) {
    const error = new Error('สินค้าขนาดนี้หมดสต๊อก ปิดขาย หรือหมดเวลาสั่งแล้ว');
    error.statusCode = 409;
    throw error;
  }
}

async function releasePackageUnit({ eventId, eventYear, packageType, size, session }) {
  const result = await Package.updateOne(
    {
      name: packageType,
      ...packageScope(eventId, eventYear),
      $expr: packageAvailabilityExpression(size, { requireCapacity: false }),
    },
    { $inc: { 'items.$[].sizes.$[sizeElem].sold': -1 } },
    { arrayFilters: [{ 'sizeElem.size': size }], session }
  );
  if (result.modifiedCount !== 1) {
    const error = new Error('ไม่สามารถคืนสต๊อกเดิมได้ กรุณาตรวจสอบความถูกต้องของแพ็กเกจ');
    error.statusCode = 409;
    throw error;
  }
}

function packageSelectionChanged(previous, next) {
  return Boolean(previous.isPackage) !== Boolean(next.isPackage)
    || String(previous.packageType || '') !== String(next.packageType || '')
    || String(previous.size || '') !== String(next.size || '');
}

function safeDonationObject(donation) {
  const result = revealDonationObject(donation);
  delete result.idempotencyKeyHash;
  delete result.idempotencyFingerprint;
  return result;
}

async function findDonationByIdempotency(eventId, keyHash) {
  if (!eventId || !keyHash) return null;
  return Donation.findOne({ eventId, idempotencyKeyHash: keyHash })
    .select('+idempotencyFingerprint');
}

function assertIdempotencyFingerprint(donation, fingerprint) {
  if (donation.idempotencyFingerprint === fingerprint) return;
  const error = new Error('Idempotency-Key นี้ถูกใช้กับข้อมูลรายการอื่นแล้ว');
  error.code = 'IDEMPOTENCY_KEY_REUSED';
  error.statusCode = 409;
  throw error;
}

function respondDonationReplay(req, res, donation) {
  if (donation.isDeleted) {
    return res.status(409).json({ message: 'รายการของ Idempotency-Key นี้ถูกประมวลผลและถูกลบแล้ว' });
  }
  auditLog({
    req,
    action: 'DONATION_IDEMPOTENCY_REPLAY',
    detail: `donationId=${donation._id}`,
    status: 200,
  });
  return res.status(200).json({
    success: true,
    replayed: true,
    message: 'รายการนี้ถูกบันทึกไว้แล้ว',
    data: safeDonationObject(donation),
  });
}

exports.createDonation = async (req, res) => {
  const dbSession = await mongoose.startSession();
  let replayState = null;
  try {
    const adminRequest = isAdminSession(req);
    const { firstName, lastName, amount, transferDateTime, source, isPackage, packageType, size, slipUrl, address, pickupMethod, pickupLocation } = req.body;
    const numericAmount = Number(amount);
    const transferDate = new Date(transferDateTime);
    const packageSelected = isPackage === true || isPackage === 'true';
    const eventContext = await getEventContextFromRequest(req, { requireEventIdentity: true, requirePublic: !adminRequest });
    if (featureDisabled(eventContext.event, 'donations')) {
      return res.status(403).json({ message: 'กิจกรรมนี้ไม่ได้เปิดฟีเจอร์ผู้สนับสนุน' });
    }
    if (packageSelected && featureDisabled(eventContext.event, 'packages')) {
      return res.status(403).json({ message: 'กิจกรรมนี้ไม่ได้เปิดฟีเจอร์แพ็กเกจ' });
    }
    const eventYear = normalizeEventYear(eventContext.eventYear || await getCurrentEventYear());
    const requestedEventYear = req.body.eventYear ? normalizeEventYear(req.body.eventYear) : eventYear;
    if (!eventYear || requestedEventYear !== eventYear) {
      return res.status(400).json({ message: 'ปีของรายการไม่ตรงกับกิจกรรมที่เลือก' });
    }

    if (!firstName || !lastName) return res.status(400).json({ message: 'กรุณาระบุชื่อและนามสกุล' });
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return res.status(400).json({ message: 'จำนวนเงินต้องมากกว่า 0' });
    if (Number.isNaN(transferDate.getTime())) return res.status(400).json({ message: 'รูปแบบวันเวลาโอนไม่ถูกต้อง' });
    if (source && !['PRE_REGISTER', 'SUPPORT_SYSTEM'].includes(source)) return res.status(400).json({ message: 'ช่องทางการสนับสนุนไม่ถูกต้อง' });
    if (pickupMethod && !['DELIVERY', 'PICKUP'].includes(pickupMethod)) return res.status(400).json({ message: 'วิธีรับสินค้าไม่ถูกต้อง' });
    if (!adminRequest && slipUrl && !parseObjectReference(slipUrl)) {
      return res.status(400).json({ message: 'กรุณาอัปโหลดสลิปผ่านระบบของกิจกรรม' });
    }

    const donationPayload = {
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      amount: numericAmount,
      transferDateTime: transferDate,
      source: source || 'PRE_REGISTER',
      isPackage: packageSelected,
      packageType: trimString(packageType) || "",
      size: trimString(size) || "",
      slipUrl: trimString(slipUrl) || "",
      address: trimString(address) || "",
      pickupMethod: pickupMethod || "",
      pickupLocation: trimString(pickupLocation) || "",
      organizationId: eventContext.organizationId,
      seriesId: eventContext.seriesId,
      eventId: eventContext.eventId,
      eventYear
    };
    const idempotencyKey = normalizeIdempotencyKey(req.get('Idempotency-Key'), {
      required: boolEnv('DONATION_IDEMPOTENCY_REQUIRED', process.env.NODE_ENV === 'production'),
    });
    const idempotencyKeyHash = idempotencyKey
      ? hashIdempotencyKey(`donation:${eventContext.eventId}`, idempotencyKey)
      : null;
    const idempotencyFingerprint = idempotencyKeyHash
      ? requestFingerprint({
        ...donationPayload,
        organizationId: String(donationPayload.organizationId || ''),
        seriesId: String(donationPayload.seriesId || ''),
        eventId: String(donationPayload.eventId || ''),
      })
      : null;
    replayState = {
      eventId: eventContext.eventId,
      keyHash: idempotencyKeyHash,
      fingerprint: idempotencyFingerprint,
    };

    const existingDonation = await findDonationByIdempotency(eventContext.eventId, idempotencyKeyHash);
    if (existingDonation) {
      assertIdempotencyFingerprint(existingDonation, idempotencyFingerprint);
      return respondDonationReplay(req, res, existingDonation);
    }

    if (!adminRequest) {
      const isHuman = await verifyTurnstile(req.body?.cfToken, req.ip, { expectedAction: 'donation_create' });
      if (!isHuman && process.env.NODE_ENV === 'production') {
        auditLog({ req, action: 'DONATION_BOT_BLOCK', detail: 'Turnstile verification failed', status: 400 });
        return res.status(400).json({
          error: 'Security Check Failed',
          message: 'ไม่ผ่านการตรวจสอบความปลอดภัย กรุณาลองใหม่อีกครั้ง'
        });
      }
    }

    if (packageSelected) {
      if (!packageType || !size) return res.status(400).json({ message: 'กรุณาระบุแพ็กเกจและขนาด' });

      const selectedPackage = await Package.findOne({
        name: packageType,
        eventId: eventContext.eventId,
        isActive: true,
        deletedAt: null,
      });
      if (!selectedPackage) return res.status(400).json({ message: 'ไม่พบแพ็กเกจที่เลือก หรือแพ็กเกจถูกปิดใช้งานแล้ว' });
      if (selectedPackage.orderDeadline && selectedPackage.orderDeadline < new Date()) {
        return res.status(400).json({ message: 'หมดเวลาสั่งแพ็กเกจนี้แล้ว' });
      }

      const sizeEntry = selectedPackage.items
        .flatMap(item => item.sizes || [])
        .find(itemSize => itemSize.size === size);
      if (!sizeEntry || Number(sizeEntry.sold || 0) >= Number(sizeEntry.stock || 0)) {
        return res.status(400).json({ message: 'สินค้าขนาดนี้หมดสต๊อกแล้ว' });
      }
    }

    const donationId = new mongoose.Types.ObjectId();
    const protectedPayload = protectDonationPayload({
      ...donationPayload,
      idempotencyKeyHash,
      idempotencyFingerprint,
    });
    let savedDonation;

    await dbSession.withTransaction(async () => {
      if (parseObjectReference(slipUrl)) {
        await claimPendingObject(slipUrl, {
          eventId: eventContext.eventId,
          linkedEntityType: 'donation',
          linkedEntityId: donationId,
          session: dbSession,
        });
      }
      [savedDonation] = await Donation.create([{ _id: donationId, ...protectedPayload }], { session: dbSession });

      if (packageSelected && packageType && size) {
        await reservePackageUnit({
          eventId: eventContext.eventId,
          eventYear,
          packageType,
          size,
          session: dbSession,
        });
      }
    });

    const safeDonation = safeDonationObject(savedDonation);
    await sendLineDonationAlert(safeDonation).catch((notificationError) => {
      console.error('[Donation] LINE notification failed:', {
        code: String(notificationError.code || 'LINE_NOTIFICATION_FAILED').slice(0, 80),
      });
      auditLog({
        req,
        action: 'DONATION_LINE_NOTIFICATION_FAILED',
        detail: `donationId=${savedDonation._id}`,
        status: 202,
      });
    });
    auditLog({ req, action: 'CREATE_DONATION', detail: `Donation received: ${numericAmount} THB`, status: 201 });
    res.status(201).json({ success: true, replayed: false, message: 'บันทึกข้อมูลสำเร็จ', data: safeDonation });
  } catch (error) {
    if (replayState?.keyHash) {
      try {
        const existingDonation = await findDonationByIdempotency(replayState.eventId, replayState.keyHash);
        if (existingDonation) {
          assertIdempotencyFingerprint(existingDonation, replayState.fingerprint);
          return respondDonationReplay(req, res, existingDonation);
        }
      } catch (replayError) {
        if (replayError.statusCode) {
          return res.status(replayError.statusCode).json({ message: replayError.message });
        }
      }
    }
    console.error(error);
    auditLog({ req, action: 'CREATE_DONATION_ERROR', detail: 'Failed to create donation', status: error.statusCode || 500, error: error.message });
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    serverError(res, error);
  } finally {
    dbSession.endSession();
  }
};

exports.getDonationSummary = async (req, res) => {
  try {
    const eventScope = await eventScopeFromRequest(req, { isDeleted: false }, { requireEventIdentity: true });
    const { eventYear, filter } = eventScope;
    const donations = (await Donation.find(filter).sort({ createdAt: -1 }))
      .map(revealDonationObject);
    await auditSensitiveAccess({
      req,
      action: 'SENSITIVE_DECRYPT_DONATION_SUMMARY',
      purpose: 'admin_donation_summary',
      resource: 'donations',
      eventYear,
      recordCount: donations.length,
      fields: ['donation.firstName', 'donation.lastName', 'donation.address', 'donation.slipUrl'],
    });
    const totalAmount = donations.reduce((sum, item) => sum + item.amount, 0);
    const preRegisterTotal = donations.filter(d => d.source === 'PRE_REGISTER').reduce((sum, item) => sum + item.amount, 0);
    const supportSystemTotal = donations.filter(d => d.source === 'SUPPORT_SYSTEM').reduce((sum, item) => sum + item.amount, 0);
    res.json({ success: true, stats: { totalAmount, totalCount: donations.length, breakdown: { preRegister: { count: donations.filter(d => d.source === 'PRE_REGISTER').length, amount: preRegisterTotal }, supportSystem: { count: donations.filter(d => d.source === 'SUPPORT_SYSTEM').length, amount: supportSystemTotal } } }, transactions: donations });
  } catch (error) { serverError(res, error); }
};

exports.updateDonation = async (req, res) => {
  const dbSession = await mongoose.startSession();
  try {
    const scope = await eventScopeFromRequest(
      req,
      { _id: req.params.id, isDeleted: { $ne: true } },
      { requireEventIdentity: true }
    );
    const existing = await Donation.findOne(scope.filter);
    if (!existing) return res.status(404).json({ message: 'ไม่พบรายการสนับสนุนในกิจกรรมนี้' });
    const existingPlain = revealDonationObject(existing);
    const updates = pickAllowed(req.body, DONATION_FIELDS);
    if (updates.firstName !== undefined) updates.firstName = String(updates.firstName).trim();
    if (updates.lastName !== undefined) updates.lastName = String(updates.lastName).trim();
    if (updates.firstName === '' || updates.lastName === '') {
      return res.status(400).json({ message: 'ชื่อและนามสกุลต้องไม่เป็นค่าว่าง' });
    }
    if (updates.amount !== undefined) {
      updates.amount = Number(updates.amount);
      if (!Number.isFinite(updates.amount) || updates.amount <= 0) {
        return res.status(400).json({ message: 'จำนวนเงินต้องมากกว่า 0' });
      }
    }
    if (updates.transferDateTime !== undefined) {
      updates.transferDateTime = new Date(updates.transferDateTime);
      if (Number.isNaN(updates.transferDateTime.getTime())) {
        return res.status(400).json({ message: 'รูปแบบวันเวลาโอนไม่ถูกต้อง' });
      }
    }
    if (updates.source !== undefined && !['PRE_REGISTER', 'SUPPORT_SYSTEM'].includes(updates.source)) {
      return res.status(400).json({ message: 'ช่องทางการสนับสนุนไม่ถูกต้อง' });
    }
    if (updates.pickupMethod !== undefined && !['DELIVERY', 'PICKUP', ''].includes(updates.pickupMethod)) {
      return res.status(400).json({ message: 'วิธีรับสินค้าไม่ถูกต้อง' });
    }
    for (const key of ['packageType', 'size', 'slipUrl', 'address', 'pickupLocation']) {
      if (updates[key] !== undefined) updates[key] = trimString(updates[key]) || '';
    }
    if (updates.isPackage !== undefined) updates.isPackage = updates.isPackage === true || updates.isPackage === 'true';

    const previousSlip = String(existingPlain.slipUrl || '');
    const nextSlip = updates.slipUrl === undefined ? previousSlip : String(updates.slipUrl || '');
    if (nextSlip && !parseObjectReference(nextSlip) && nextSlip !== previousSlip) {
      return res.status(400).json({ message: 'กรุณาอัปโหลดสลิปผ่านระบบของกิจกรรม' });
    }

    let updatedDonation;
    await dbSession.withTransaction(async () => {
      const transactionalDonation = await Donation.findOne(scope.filter).session(dbSession);
      if (!transactionalDonation) {
        const error = new Error('ไม่พบรายการสนับสนุนในกิจกรรมนี้');
        error.statusCode = 404;
        throw error;
      }
      const currentPlain = revealDonationObject(transactionalDonation);
      const transactionUpdates = { ...updates };
      const currentSlip = String(currentPlain.slipUrl || '');
      const requestedSlip = transactionUpdates.slipUrl === undefined
        ? currentSlip
        : String(transactionUpdates.slipUrl || '');
      if (requestedSlip && !parseObjectReference(requestedSlip) && requestedSlip !== currentSlip) {
        const error = new Error('กรุณาอัปโหลดสลิปผ่านระบบของกิจกรรม');
        error.statusCode = 400;
        throw error;
      }
      if (requestedSlip !== currentSlip && parseObjectReference(requestedSlip)) {
        await claimPendingObject(requestedSlip, {
          eventId: scope.eventId,
          linkedEntityType: 'donation',
          linkedEntityId: transactionalDonation._id,
          session: dbSession,
        });
      }

      const transactionSelection = {
        isPackage: transactionUpdates.isPackage ?? currentPlain.isPackage,
        packageType: transactionUpdates.packageType ?? currentPlain.packageType,
        size: transactionUpdates.size ?? currentPlain.size,
      };
      if (!transactionSelection.isPackage) {
        transactionSelection.packageType = '';
        transactionSelection.size = '';
        transactionUpdates.packageType = '';
        transactionUpdates.size = '';
      } else if (!transactionSelection.packageType || !transactionSelection.size) {
        const error = new Error('กรุณาระบุแพ็กเกจและขนาด');
        error.statusCode = 400;
        throw error;
      }

      if (packageSelectionChanged(currentPlain, transactionSelection)) {
        if (transactionSelection.isPackage) {
          await reservePackageUnit({
            eventId: scope.eventId,
            eventYear: scope.eventYear,
            packageType: transactionSelection.packageType,
            size: transactionSelection.size,
            session: dbSession,
          });
        }
        if (currentPlain.isPackage) {
          await releasePackageUnit({
            eventId: scope.eventId,
            eventYear: scope.eventYear,
            packageType: currentPlain.packageType,
            size: currentPlain.size,
            session: dbSession,
          });
        }
      }
      transactionalDonation.set(protectDonationPayload(transactionUpdates));
      updatedDonation = await transactionalDonation.save({ session: dbSession });
    });
    if (!updatedDonation) return res.status(404).json({ message: 'ไม่พบรายการสนับสนุน' });
    auditLog({ req, action: 'UPDATE_DONATION', detail: `donationId=${updatedDonation._id}` });
    res.json({ success: true, message: 'อัปเดตสำเร็จ', data: revealDonationObject(updatedDonation) });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    serverError(res, error);
  } finally {
    dbSession.endSession();
  }
};

exports.deleteDonation = async (req, res) => {
  const dbSession = await mongoose.startSession();
  try {
    const scope = await eventScopeFromRequest(
      req,
      { _id: req.params.id, isDeleted: { $ne: true } },
      { requireEventIdentity: true }
    );
    let deletedDonation;
    await dbSession.withTransaction(async () => {
      const donation = await Donation.findOne(scope.filter).session(dbSession);
      if (!donation) return;
      const plain = revealDonationObject(donation);
      if (plain.isPackage) {
        await releasePackageUnit({
          eventId: scope.eventId,
          eventYear: scope.eventYear,
          packageType: plain.packageType,
          size: plain.size,
          session: dbSession,
        });
      }
      donation.isDeleted = true;
      donation.deletedAt = new Date();
      donation.deletedBy = req.user?._id || null;
      deletedDonation = await donation.save({ session: dbSession });
    });
    if (!deletedDonation) return res.status(404).json({ message: 'ไม่พบรายการสนับสนุน' });
    auditLog({ req, action: 'SOFT_DELETE_DONATION', detail: `donationId=${req.params.id}` });
    res.json({ success: true, message: 'ลบรายการสำเร็จ' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    serverError(res, error);
  } finally {
    dbSession.endSession();
  }
};
