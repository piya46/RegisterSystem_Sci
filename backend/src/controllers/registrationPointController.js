const RegistrationPoint = require('../models/registrationPoint');
const auditLog = require('../helpers/auditLog');
const isAdmin = require('../helpers/isAdmin');

exports.listAll = async (req, res) => {
  // if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only!' });
  const points = await RegistrationPoint.find({});
  res.json(points);
};

exports.listEnabled = async (req, res) => {
  // public, ไม่ต้องเช็ค
  const points = await RegistrationPoint.find({ enabled: true });
  res.json(points);
};

exports.create = async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only!' });
  const { name, description, type } = req.body;
  const exists = await RegistrationPoint.findOne({ name });
  if (exists) return res.status(400).json({ error: 'Name already exists.' });
  const point = await RegistrationPoint.create({ name, description, type });
  auditLog && auditLog({ req, action: 'CREATE_REGISTRATION_POINT', detail: `name=${name}` });
  res.json(point);
};

exports.update = async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only!' });
  const { id } = req.params;
  const { name, description, type, enabled } = req.body;
  const point = await RegistrationPoint.findByIdAndUpdate(
    id,
    { name, description, type, enabled },
    { new: true }
  );
  if (!point) return res.status(404).json({ error: 'Not found' });
  auditLog && auditLog({ req, action: 'UPDATE_REGISTRATION_POINT', detail: `id=${id}` });
  res.json(point);
};

exports.softDelete = async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only!' });
  const { id } = req.params;
  const point = await RegistrationPoint.findByIdAndUpdate(id, { enabled: false }, { new: true });
  if (!point) return res.status(404).json({ error: 'Not found' });
  auditLog && auditLog({ req, action: 'DELETE_REGISTRATION_POINT', detail: `id=${id}` });
  res.json({ message: 'Disabled registration point', point });
};


