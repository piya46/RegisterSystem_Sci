const REGISTRATION_TYPES = Object.freeze({
  ONLINE: 'online',
  ONSITE_LEGACY: 'onsite',
  ONSITE_STAFF: 'onsite_staff',
  ONSITE_KIOSK: 'onsite_kiosk',
  SELF_REGISTER: 'self_register',
});

const ONSITE_REGISTRATION_TYPES = [
  REGISTRATION_TYPES.ONSITE_LEGACY,
  REGISTRATION_TYPES.ONSITE_STAFF,
  REGISTRATION_TYPES.ONSITE_KIOSK,
  REGISTRATION_TYPES.SELF_REGISTER,
];

function registrationTypeFromRequest(req) {
  const role = req.user?.role || [];
  const roles = Array.isArray(role) ? role : [role];

  if (req.auth?.scope === 'self_register_session') return REGISTRATION_TYPES.SELF_REGISTER;
  if (req.auth?.scope === 'kiosk_device' || roles.includes('kiosk')) return REGISTRATION_TYPES.ONSITE_KIOSK;
  return REGISTRATION_TYPES.ONSITE_STAFF;
}

function registrationTypeLabel(type) {
  switch (type) {
    case REGISTRATION_TYPES.ONLINE:
      return 'ออนไลน์';
    case REGISTRATION_TYPES.ONSITE_STAFF:
      return 'หน้างานโดยเจ้าหน้าที่';
    case REGISTRATION_TYPES.ONSITE_KIOSK:
      return 'หน้างานผ่าน Kiosk';
    case REGISTRATION_TYPES.SELF_REGISTER:
      return 'ลงทะเบียนเองผ่าน QR';
    case REGISTRATION_TYPES.ONSITE_LEGACY:
      return 'หน้างาน';
    default:
      return type || '-';
  }
}

module.exports = {
  REGISTRATION_TYPES,
  ONSITE_REGISTRATION_TYPES,
  registrationTypeFromRequest,
  registrationTypeLabel,
};
