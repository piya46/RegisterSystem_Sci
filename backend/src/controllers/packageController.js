const Package = require('../models/Package');
const auditLog = require('../helpers/auditLog');

// ดึงแพ็กเกจทั้งหมด (ใช้ได้ทั้ง User และ Admin)
exports.getAllPackages = async (req, res) => {
  try {
    const packages = await Package.find({ isActive: true });
    res.json({ success: true, data: packages });
  } catch (error) {
    res.status(500).json({ error: 'Server error', detail: error.message });
  }
};

// เพิ่มแพ็กเกจใหม่ (Admin)
exports.createPackage = async (req, res) => {
  try {
    const newPackage = await Package.create(req.body);
    auditLog({ req, action: 'CREATE_PACKAGE', detail: `Created package: ${newPackage.name}` });
    res.status(201).json({ success: true, data: newPackage });
  } catch (error) {
    res.status(500).json({ error: 'Server error', detail: error.message });
  }
};

// อัปเดตแพ็กเกจและสต๊อก (Admin)
exports.updatePackage = async (req, res) => {
  try {
    const updatedPackage = await Package.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!updatedPackage) return res.status(404).json({ error: 'ไม่พบแพ็กเกจ' });
    auditLog({ req, action: 'UPDATE_PACKAGE', detail: `Updated package ID: ${req.params.id}` });
    res.json({ success: true, data: updatedPackage });
  } catch (error) {
    res.status(500).json({ error: 'Server error', detail: error.message });
  }
};

// ลบแพ็กเกจ (Admin - Soft Delete หรือ Hard Delete)
exports.deletePackage = async (req, res) => {
  try {
    await Package.findByIdAndDelete(req.params.id);
    auditLog({ req, action: 'DELETE_PACKAGE', detail: `Deleted package ID: ${req.params.id}` });
    res.json({ success: true, message: 'ลบแพ็กเกจสำเร็จ' });
  } catch (error) {
    res.status(500).json({ error: 'Server error', detail: error.message });
  }
};