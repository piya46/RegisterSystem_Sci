const ParticipantField = require('../models/participantField');

exports.createField = async (req, res) => {
  const { name, label, type, required, options, order } = req.body;
  if (!name || !label) return res.status(400).json({ error: 'Name and label are required' });

  const exists = await ParticipantField.findOne({ name });
  if (exists) return res.status(400).json({ error: 'Field name exists' });

  const field = await ParticipantField.create({ name, label, type, required, options, order });
  res.json(field);
};

exports.listFields = async (req, res) => {
  const fields = await ParticipantField.find().sort('order');
  res.json(fields);
};

exports.updateField = async (req, res) => {
  const field = await ParticipantField.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!field) return res.status(404).json({ error: 'Field not found' });
  res.json(field);
};

exports.deleteField = async (req, res) => {
  await ParticipantField.findByIdAndDelete(req.params.id);
  res.json({ message: 'Field deleted' });
};
