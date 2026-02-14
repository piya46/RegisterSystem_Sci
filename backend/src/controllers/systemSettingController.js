const SystemSetting = require('../models/SystemSetting');
const auditLog = require('../helpers/auditLog');

exports.getSettings = async (req, res) => {
  try {
    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = await SystemSetting.create({});
    }
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ error: 'Server error', detail: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = await SystemSetting.create(req.body);
    } else {
      settings = await SystemSetting.findOneAndUpdate(
        { _id: settings._id },
        { $set: req.body },
        { new: true }
      );
    }
    auditLog({ req, action: 'UPDATE_SYSTEM_SETTINGS', detail: 'Admin updated system settings' });
    res.json({ success: true, data: settings, message: 'บันทึกการตั้งค่าสำเร็จ' });
  } catch (error) {
    res.status(500).json({ error: 'Server error', detail: error.message });
  }
};