const ParticipantField = require('../models/participantField');
const auditLog = require('../helpers/auditLog'); // ✅ Import Audit Log

// รายชื่อ Type ที่อนุญาตให้สร้างได้
const ALLOWED_TYPES = ['text', 'number', 'email', 'tel', 'select', 'radio', 'checkbox', 'textarea', 'date', 'file'];

exports.createField = async (req, res) => {
  try {
    const { name, label, type, required, options, order } = req.body;
    
    // 1. Validation
    if (!name || !label || !type) {
        return res.status(400).json({ error: 'Name, label, and type are required' });
    }
    if (!ALLOWED_TYPES.includes(type)) {
        return res.status(400).json({ error: 'Invalid field type' });
    }
    // ถ้าเป็น select/radio ต้องมี options
    if (['select', 'radio', 'checkbox'].includes(type) && (!options || options.length === 0)) {
        return res.status(400).json({ error: 'Options are required for this type' });
    }

    const exists = await ParticipantField.findOne({ name });
    if (exists) return res.status(400).json({ error: 'Field name exists' });

    const field = await ParticipantField.create({ name, label, type, required, options, order });

    // 2. Audit Log
    auditLog({ req, action: 'CREATE_FIELD', detail: `Created field: ${name} (${type})` });

    res.json(field);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server Error' });
  }
};

exports.listFields = async (req, res) => {
  try {
    const fields = await ParticipantField.find().sort('order');
    res.json(fields);
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
};

exports.updateField = async (req, res) => {
  try {
    const { name, label, type } = req.body;
    
    // Validation (ถ้ามีการส่งมา)
    if (type && !ALLOWED_TYPES.includes(type)) {
        return res.status(400).json({ error: 'Invalid field type' });
    }

    const field = await ParticipantField.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!field) return res.status(404).json({ error: 'Field not found' });

    // Audit Log
    auditLog({ req, action: 'UPDATE_FIELD', detail: `Updated field: ${field.name}` });

    res.json(field);
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
};

exports.deleteField = async (req, res) => {
  try {
    const field = await ParticipantField.findByIdAndDelete(req.params.id);
    if (field) {
        auditLog({ req, action: 'DELETE_FIELD', detail: `Deleted field: ${field.name}` });
    }
    res.json({ message: 'Field deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
};