const ParticipantField = require('../models/participantField');
const { serverError, pickAllowed } = require('../utils/httpResponses');

const FIELD_FIELDS = ['name', 'label', 'type', 'required', 'options', 'order', 'enabled'];

exports.createField = async (req, res) => {
  try {
    const { name, label, type, required, options, order, enabled } = pickAllowed(req.body, FIELD_FIELDS);
    if (!name || !label) return res.status(400).json({ error: 'Name and label are required' });

    const exists = await ParticipantField.findOne({ name });
    if (exists) return res.status(400).json({ error: 'Field name exists' });

    const field = await ParticipantField.create({ name, label, type, required, options, order, enabled });
    res.json(field);
  } catch (err) {
    serverError(res);
  }
};

exports.listFields = async (req, res) => {
  try {
    const fields = await ParticipantField.find().sort('order');
    res.json(fields);
  } catch (err) {
    serverError(res);
  }
};

exports.updateField = async (req, res) => {
  try {
    const updates = pickAllowed(req.body, FIELD_FIELDS);
    const field = await ParticipantField.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!field) return res.status(404).json({ error: 'Field not found' });
    res.json(field);
  } catch (err) {
    serverError(res);
  }
};

exports.deleteField = async (req, res) => {
  try {
    await ParticipantField.findByIdAndDelete(req.params.id);
    res.json({ message: 'Field deleted' });
  } catch (err) {
    serverError(res);
  }
};
