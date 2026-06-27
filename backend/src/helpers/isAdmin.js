const { isAdminLike } = require('../utils/permissions');

module.exports = function isAdmin(user) {
  return isAdminLike(user);
};
