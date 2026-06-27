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
  'pickupLocation',
  'eventYear'
];

function trimString(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function isAdminSession(req) {
  return req.auth?.type === 'admin_session' && isAdmin(req.user);
}

function contextRefsForYear(context, eventYear) {
  if (normalizeEventYear(context?.eventYear) !== normalizeEventYear(eventYear)) return {};
  return {
    organizationId: context.organizationId,
    seriesId: context.seriesId,
    eventId: context.eventId,
  };
}

function featureDisabled(event, key) {
  return event?.config?.enabledFeatures && event.config.enabledFeatures[key] === false;
}

exports.createDonation = async (req, res) => {
  const dbSession = await mongoose.startSession();
  try {
    if (!isAdminSession(req)) {
      const isHuman = await verifyTurnstile(req.body?.cfToken, req.ip);
      if (!isHuman) {
        auditLog({ req, action: 'DONATION_BOT_BLOCK', detail: 'Turnstile verification failed', status: 400 });
        return res.status(400).json({
          error: 'Security Check Failed',
          message: 'ไม่ผ่านการตรวจสอบความปลอดภัย กรุณาลองใหม่อีกครั้ง'
        });
      }
    }

    const { firstName, lastName, amount, transferDateTime, source, isPackage, packageType, size, slipUrl, address, pickupMethod, pickupLocation } = req.body;
    const numericAmount = Number(amount);
    const transferDate = new Date(transferDateTime);
    const packageSelected = isPackage === true || isPackage === 'true';
    const eventContext = await getEventContextFromRequest(req, { requireEventIdentity: true, requirePublic: !isAdminSession(req) });
    if (featureDisabled(eventContext.event, 'donations')) {
      return res.status(403).json({ message: 'กิจกรรมนี้ไม่ได้เปิดฟีเจอร์ผู้สนับสนุน' });
    }
    if (packageSelected && featureDisabled(eventContext.event, 'packages')) {
      return res.status(403).json({ message: 'กิจกรรมนี้ไม่ได้เปิดฟีเจอร์แพ็กเกจ' });
    }
    const eventYear = normalizeEventYear(req.body.eventYear || eventContext.eventYear || await getCurrentEventYear());

    if (!firstName || !lastName) return res.status(400).json({ message: 'กรุณาระบุชื่อและนามสกุล' });
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return res.status(400).json({ message: 'จำนวนเงินต้องมากกว่า 0' });
    if (Number.isNaN(transferDate.getTime())) return res.status(400).json({ message: 'รูปแบบวันเวลาโอนไม่ถูกต้อง' });
    if (source && !['PRE_REGISTER', 'SUPPORT_SYSTEM'].includes(source)) return res.status(400).json({ message: 'ช่องทางการสนับสนุนไม่ถูกต้อง' });
    if (pickupMethod && !['DELIVERY', 'PICKUP'].includes(pickupMethod)) return res.status(400).json({ message: 'วิธีรับสินค้าไม่ถูกต้อง' });

    if (packageSelected) {
      if (!packageType || !size) return res.status(400).json({ message: 'กรุณาระบุแพ็กเกจและขนาด' });

      const selectedPackage = await Package.findOne({
        name: packageType,
        ...(eventContext.eventId ? { eventId: eventContext.eventId } : { eventYear }),
        isActive: true
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
      ...contextRefsForYear(eventContext, eventYear),
      eventYear
    };

    const newDonation = new Donation(protectDonationPayload(donationPayload));
    let savedDonation;

    await dbSession.withTransaction(async () => {
      savedDonation = await newDonation.save({ session: dbSession });

      // ตัดสต๊อกแบบ atomic: update สำเร็จเฉพาะเมื่อ sold < stock ณ เวลานั้นจริง
      if (packageSelected && packageType && size) {
        const stockUpdate = await Package.updateOne(
          {
            name: packageType,
            ...(eventContext.eventId ? { eventId: eventContext.eventId } : { eventYear }),
            isActive: true,
            $or: [
              { orderDeadline: { $exists: false } },
              { orderDeadline: null },
              { orderDeadline: { $gte: new Date() } },
            ],
            $expr: {
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
                            { $lt: [{ $ifNull: ['$$sizeEntry.sold', 0] }, { $ifNull: ['$$sizeEntry.stock', 0] }] }
                          ]
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          { $inc: { "items.$[].sizes.$[sizeElem].sold": 1 } },
          { arrayFilters: [{ "sizeElem.size": size }], session: dbSession }
        );

        if (stockUpdate.modifiedCount !== 1) {
          const err = new Error('สินค้าขนาดนี้หมดสต๊อกแล้ว');
          err.statusCode = 409;
          throw err;
        }
      }
    });

    const safeDonation = revealDonationObject(savedDonation);
    await sendLineDonationAlert(safeDonation);
    auditLog({ req, action: 'CREATE_DONATION', detail: `Donation received: ${numericAmount} THB`, status: 201 });
    res.status(201).json({ success: true, message: 'บันทึกข้อมูลและแจ้งเตือนสำเร็จ', data: safeDonation });
  } catch (error) {
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
    const eventScope = await eventScopeFromRequest(req, {}, { requireEventIdentity: true });
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
  try {
    const updates = pickAllowed(req.body, DONATION_FIELDS);
    if (updates.eventYear !== undefined) {
      updates.eventYear = normalizeEventYear(updates.eventYear);
      updates.organizationId = null;
      updates.seriesId = null;
      updates.eventId = null;
    }
    const updatedDonation = await Donation.findByIdAndUpdate(req.params.id, { $set: protectDonationPayload(updates) }, { new: true, runValidators: true });
    if (!updatedDonation) return res.status(404).json({ message: 'ไม่พบรายการสนับสนุน' });
    res.json({ success: true, message: 'อัปเดตสำเร็จ', data: revealDonationObject(updatedDonation) });
  } catch (error) { serverError(res, error); }
};

exports.deleteDonation = async (req, res) => {
  try {
    const deletedDonation = await Donation.findByIdAndDelete(req.params.id);
    if (!deletedDonation) return res.status(404).json({ message: 'ไม่พบรายการสนับสนุน' });
    res.json({ success: true, message: 'ลบรายการสำเร็จ' });
  } catch (error) { serverError(res, error); }
};
