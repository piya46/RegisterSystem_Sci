module.exports = function isAdmin(user) {
  if (!user || !user.role) return false;
  if (Array.isArray(user.role)) return user.role.includes('admin');
  return user.role === 'admin';
};
