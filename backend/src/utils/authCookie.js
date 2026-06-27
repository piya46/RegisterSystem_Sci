function boolFromEnv(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function sameSiteFromEnv() {
  const value = String(process.env.COOKIE_SAME_SITE || 'lax').toLowerCase();
  if (['strict', 'lax', 'none'].includes(value)) return value;
  return 'lax';
}

function authCookieOptions(extra = {}) {
  const sameSite = sameSiteFromEnv();
  const secure = boolFromEnv(
    process.env.COOKIE_SECURE,
    process.env.NODE_ENV === 'production' || sameSite === 'none'
  );

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    ...extra,
  };
}

function clearAuthCookie(res) {
  res.clearCookie('token', authCookieOptions());
}

module.exports = {
  authCookieOptions,
  clearAuthCookie,
};
