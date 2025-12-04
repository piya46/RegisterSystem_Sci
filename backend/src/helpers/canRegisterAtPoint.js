module.exports = function canRegisterAtPoint(user, pointId) {
  if (!user || !Array.isArray(user.role)) return false;
  if (user.role.includes('admin')) return true;
  if (user.role.includes('staff') && Array.isArray(user.registrationPoints)) {
    return user.registrationPoints.some(id => id.toString() === pointId.toString());
  }
  return false;
};
