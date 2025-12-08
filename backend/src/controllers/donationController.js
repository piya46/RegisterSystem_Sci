const Donation = require('../models/Donation');
const { sendLineDonationAlert } = require('../utils/lineNotify');
const auditLog = require('../helpers/auditLog'); 

exports.createDonation = async (req, res) => {
  try {
    const { userId, firstName, lastName, amount, transferDateTime, source, isPackage, packageType, size } = req.body;

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
      size: size || ""
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