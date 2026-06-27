const Package = require('../models/Package');
const auditLog = require('../helpers/auditLog');
const { serverError, pickAllowed } = require('../utils/httpResponses');
const { applyEventYearFilter, eventYearFromRequest, getCurrentEventYear, normalizeEventYear } = require('../utils/eventYear');

const PACKAGE_FIELDS = [
  'name',
  'description',
  'price',
  'items',
  'orderDeadline',
  'pickupLocations',
  'isDeliveryAvailable',
  'isActive',
  'eventYear'
];

// ดึงแพ็กเกจทั้งหมด (ใช้ได้ทั้ง User และ Admin)
exports.getAllPackages = async (req, res) => {
  try {
    const eventYear = eventYearFromRequest(req) || await getCurrentEventYear();
    const packages = await Package.find(applyEventYearFilter({ isActive: true }, eventYear));
    res.json({ success: true, data: packages });
  } catch (error) {
    serverError(res);
  }
};

// เพิ่มแพ็กเกจใหม่ (Admin)
exports.createPackage = async (req, res) => {
  try {
    const payload = pickAllowed(req.body, PACKAGE_FIELDS);
    payload.eventYear = normalizeEventYear(payload.eventYear || await getCurrentEventYear());
    const newPackage = await Package.create(payload);
    auditLog({ req, action: 'CREATE_PACKAGE', detail: `Created package: ${newPackage.name}` });
    res.status(201).json({ success: true, data: newPackage });
  } catch (error) {
    serverError(res);
  }
};

// อัปเดตแพ็กเกจและสต๊อก (Admin)
exports.updatePackage = async (req, res) => {
  try {
    const updates = pickAllowed(req.body, PACKAGE_FIELDS);
    if (updates.eventYear !== undefined) updates.eventYear = normalizeEventYear(updates.eventYear);
    const updatedPackage = await Package.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true });
    if (!updatedPackage) return res.status(404).json({ error: 'ไม่พบแพ็กเกจ' });
    auditLog({ req, action: 'UPDATE_PACKAGE', detail: `Updated package ID: ${req.params.id}` });
    res.json({ success: true, data: updatedPackage });
  } catch (error) {
    serverError(res);
  }
};

// ลบแพ็กเกจ (Admin - Soft Delete หรือ Hard Delete)
exports.deletePackage = async (req, res) => {
  try {
    await Package.findByIdAndDelete(req.params.id);
    auditLog({ req, action: 'DELETE_PACKAGE', detail: `Deleted package ID: ${req.params.id}` });
    res.json({ success: true, message: 'ลบแพ็กเกจสำเร็จ' });
  } catch (error) {
    serverError(res);
  }
};
