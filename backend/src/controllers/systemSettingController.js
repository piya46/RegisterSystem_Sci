const SystemSetting = require('../models/SystemSetting');
const auditLog = require('../helpers/auditLog');
const { serverError, pickAllowed } = require('../utils/httpResponses');

const SETTING_FIELDS = [
  'eventName',
  'enableRegister',
  'maintenanceMode',
  'enablePickup',
  'enableDelivery',
  'contactEmail',
  'welcomeMessage',
  'preRegStartDate',
  'preRegEndDate',
  'kioskStartDate',
  'kioskEndDate'
];

exports.getSettings = async (req, res) => {
  try {
    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = await SystemSetting.create({});
    }
    res.json({ success: true, data: settings });
  } catch (error) {
    serverError(res);
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const updates = pickAllowed(req.body, SETTING_FIELDS);
    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = await SystemSetting.create(updates);
    } else {
      settings = await SystemSetting.findOneAndUpdate(
        { _id: settings._id },
        { $set: updates },
        { new: true, runValidators: true }
      );
    }
    auditLog({ req, action: 'UPDATE_SYSTEM_SETTINGS', detail: 'Admin updated system settings' });
    res.json({ success: true, data: settings, message: 'บันทึกการตั้งค่าสำเร็จ' });
  } catch (error) {
    serverError(res);
  }
};
