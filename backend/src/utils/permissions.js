const ROLE_PERMISSIONS = {
  superadmin: [
    'infra:manage',
    'organization:manage',
    'event:manage',
    'event:read',
    'layout:manage',
    'user:manage',
    'participant:manage',
    'participant:export',
    'report:decrypt',
    'encryption:rotate',
    'audit:read',
  ],
  admin: [
    'event:manage',
    'event:read',
    'layout:manage',
    'user:manage',
    'participant:manage',
    'participant:export',
    'report:decrypt',
    'audit:read',
  ],
  org_admin: [
    'organization:manage',
    'event:manage',
    'event:read',
    'layout:manage',
    'user:manage',
    'participant:manage',
    'participant:export',
    'audit:read',
  ],
  event_admin: [
    'event:manage',
    'event:read',
    'layout:manage',
    'participant:manage',
    'participant:export',
    'audit:read',
  ],
  event_manager: [
    'event:manage',
    'event:read',
    'layout:manage',
    'participant:manage',
  ],
  staff: [
    'event:read',
    'participant:checkin',
    'participant:register',
  ],
  kiosk: [
    'participant:checkin',
    'participant:register',
  ],
  auditor: [
    'event:read',
    'audit:read',
  ],
};

function rolesOf(user) {
  if (!user?.role) return [];
  return Array.isArray(user.role) ? user.role.filter(Boolean) : [user.role];
}

function hasRole(user, role) {
  return rolesOf(user).includes(role);
}

function isSuperadmin(user) {
  return hasRole(user, 'superadmin');
}

function isAdminLike(user) {
  return isSuperadmin(user) || hasRole(user, 'admin');
}

function permissionsOf(user) {
  const permissions = new Set(user?.permissions || []);
  rolesOf(user).forEach((role) => {
    (ROLE_PERMISSIONS[role] || []).forEach((permission) => permissions.add(permission));
  });
  return permissions;
}

function hasPermission(user, permission) {
  if (isSuperadmin(user)) return true;
  return permissionsOf(user).has(permission);
}

module.exports = {
  ROLE_PERMISSIONS,
  hasPermission,
  hasRole,
  isAdminLike,
  isSuperadmin,
  permissionsOf,
  rolesOf,
};
