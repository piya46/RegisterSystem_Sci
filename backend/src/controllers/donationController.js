const Donation = require('../models/Donation');
const { sendLineDonationAlert } = require('../utils/lineNotify');
const auditLog = require('../helpers/auditLog'); 

exports.createDonation = async (req, res) => {
  try {
    const { userId, firstName, lastName, amount, transferDateTime, source, isPackage, packageType, size, slipUrl, address, pickupMethod, pickupLocation } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'จำนวนเงินต้องมากกว่า 0' });
    }

    const newDonation = new Donation({
      userId,
      firstName,
      lastName,
      amount,
      transferDateTime,
      source: source || 'PRE_REGISTER',
      isPackage: !!isPackage,
      packageType: packageType || "",
      size: size || "",
      slipUrl: slipUrl || "",
      address: address || "",
      pickupMethod: pickupMethod || "",
      pickupLocation: pickupLocation || ""
    });

    const savedDonation = await newDonation.save();

    await sendLineDonationAlert(savedDonation);

    auditLog({
      req,
      action: 'CREATE_DONATION',
      detail: `Donation received: ${amount} THB from ${firstName} ${lastName} (${source || 'PRE_REGISTER'})`,
      status: 201,
      error: null
    });

    res.status(201).json({
      success: true,
      message: 'บันทึกข้อมูลและแจ้งเตือนสำเร็จ',
      data: savedDonation
    });

  } catch (error) {
    console.error(error);
    auditLog({
      req,
      action: 'CREATE_DONATION_ERROR',
      detail: 'Failed to create donation',
      status: 500,
      error: error.message
    });

    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

exports.getDonationSummary = async (req, res) => {
  try {
    const donations = await Donation.find().sort({ createdAt: -1 });
    
    const totalAmount = donations.reduce((sum, item) => sum + item.amount, 0);
    const preRegisterTotal = donations.filter(d => d.source === 'PRE_REGISTER').reduce((sum, item) => sum + item.amount, 0);
    const supportSystemTotal = donations.filter(d => d.source === 'SUPPORT_SYSTEM').reduce((sum, item) => sum + item.amount, 0);

    res.json({
      success: true,
      stats: {
        totalAmount,
        totalCount: donations.length,
        breakdown: {
          preRegister: { count: donations.filter(d => d.source === 'PRE_REGISTER').length, amount: preRegisterTotal },
          supportSystem: { count: donations.filter(d => d.source === 'SUPPORT_SYSTEM').length, amount: supportSystemTotal }
        }
      },
      transactions: donations
    });

  } catch (error) {
    auditLog({
      req,
      action: 'GET_DONATION_SUMMARY_ERROR',
      detail: 'Failed to fetch summary',
      status: 500,
      error: error.message
    });
    res.status(500).json({ message: 'Error fetching summary' });
  }
};

// สำหรับ Admin แก้ไขข้อมูล (รวมถึงอัปโหลดลิงก์สลิปย้อนหลัง)
exports.updateDonation = async (req, res) => {
  try {
    const updatedDonation = await Donation.findByIdAndUpdate(
      req.params.id, 
      { $set: req.body }, 
      { new: true }
    );
    if (!updatedDonation) return res.status(404).json({ message: 'ไม่พบรายการสนับสนุน' });

    auditLog({ req, action: 'UPDATE_DONATION', detail: `Updated donation ID: ${req.params.id}`, status: 200 });
    res.json({ success: true, message: 'อัปเดตสำเร็จ', data: updatedDonation });
  } catch (error) {
    res.status(500).json({ message: 'Error updating donation', error: error.message });
  }
};

// สำหรับ Admin ลบข้อมูล
exports.deleteDonation = async (req, res) => {
  try {
    const deletedDonation = await Donation.findByIdAndDelete(req.params.id);
    if (!deletedDonation) return res.status(404).json({ message: 'ไม่พบรายการสนับสนุน' });

    auditLog({ req, action: 'DELETE_DONATION', detail: `Deleted donation ID: ${req.params.id}`, status: 200 });
    res.json({ success: true, message: 'ลบรายการสำเร็จ' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting donation', error: error.message });
  }
};