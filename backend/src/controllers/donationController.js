const Donation = require('../models/Donation');
const Package = require('../models/Package'); // [เพิ่ม] เรียกใช้ Package Model
const { sendLineDonationAlert } = require('../utils/lineNotify');
const auditLog = require('../helpers/auditLog'); 
const verifyTurnstile = require('../utils/verifyTurnstile');
const isAdmin = require('../helpers/isAdmin');
const { serverError, pickAllowed } = require('../utils/httpResponses');

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

exports.createDonation = async (req, res) => {
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

    if (!firstName || !lastName) return res.status(400).json({ message: 'กรุณาระบุชื่อและนามสกุล' });
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return res.status(400).json({ message: 'จำนวนเงินต้องมากกว่า 0' });
    if (Number.isNaN(transferDate.getTime())) return res.status(400).json({ message: 'รูปแบบวันเวลาโอนไม่ถูกต้อง' });
    if (source && !['PRE_REGISTER', 'SUPPORT_SYSTEM'].includes(source)) return res.status(400).json({ message: 'ช่องทางการสนับสนุนไม่ถูกต้อง' });
    if (pickupMethod && !['DELIVERY', 'PICKUP'].includes(pickupMethod)) return res.status(400).json({ message: 'วิธีรับสินค้าไม่ถูกต้อง' });

    if (packageSelected) {
      if (!packageType || !size) return res.status(400).json({ message: 'กรุณาระบุแพ็กเกจและขนาด' });

      const selectedPackage = await Package.findOne({ name: packageType, isActive: true });
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

    const newDonation = new Donation({
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
      pickupLocation: trimString(pickupLocation) || ""
    });

    const savedDonation = await newDonation.save();

    // [เพิ่ม] ตัดสต๊อกเสื้อ
    if (packageSelected && packageType && size) {
      await Package.findOneAndUpdate(
        { name: packageType, "items.sizes.size": size },
        { $inc: { "items.$[].sizes.$[sizeElem].sold": 1 } },
        { arrayFilters: [{ "sizeElem.size": size }] }
      );
    }

    await sendLineDonationAlert(savedDonation);
    auditLog({ req, action: 'CREATE_DONATION', detail: `Donation received: ${amount} THB from ${firstName} ${lastName}`, status: 201 });
    res.status(201).json({ success: true, message: 'บันทึกข้อมูลและแจ้งเตือนสำเร็จ', data: savedDonation });
  } catch (error) {
    console.error(error);
    auditLog({ req, action: 'CREATE_DONATION_ERROR', detail: 'Failed to create donation', status: 500, error: error.message });
    serverError(res);
  }
};

exports.getDonationSummary = async (req, res) => {
  try {
    const donations = await Donation.find().sort({ createdAt: -1 });
    const totalAmount = donations.reduce((sum, item) => sum + item.amount, 0);
    const preRegisterTotal = donations.filter(d => d.source === 'PRE_REGISTER').reduce((sum, item) => sum + item.amount, 0);
    const supportSystemTotal = donations.filter(d => d.source === 'SUPPORT_SYSTEM').reduce((sum, item) => sum + item.amount, 0);
    res.json({ success: true, stats: { totalAmount, totalCount: donations.length, breakdown: { preRegister: { count: donations.filter(d => d.source === 'PRE_REGISTER').length, amount: preRegisterTotal }, supportSystem: { count: donations.filter(d => d.source === 'SUPPORT_SYSTEM').length, amount: supportSystemTotal } } }, transactions: donations });
  } catch (error) { res.status(500).json({ message: 'Error fetching summary' }); }
};

exports.updateDonation = async (req, res) => {
  try {
    const updates = pickAllowed(req.body, DONATION_FIELDS);
    const updatedDonation = await Donation.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true });
    if (!updatedDonation) return res.status(404).json({ message: 'ไม่พบรายการสนับสนุน' });
    res.json({ success: true, message: 'อัปเดตสำเร็จ', data: updatedDonation });
  } catch (error) { serverError(res, 'Error updating donation'); }
};

exports.deleteDonation = async (req, res) => {
  try {
    const deletedDonation = await Donation.findByIdAndDelete(req.params.id);
    if (!deletedDonation) return res.status(404).json({ message: 'ไม่พบรายการสนับสนุน' });
    res.json({ success: true, message: 'ลบรายการสำเร็จ' });
  } catch (error) { serverError(res, 'Error deleting donation'); }
};
