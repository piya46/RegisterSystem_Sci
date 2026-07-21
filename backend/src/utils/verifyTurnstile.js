const axios = require('axios');

function normalizeHostname(value) {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '');
}

function hostnameFromUrl(value) {
  try {
    return normalizeHostname(new URL(value).hostname);
  } catch {
    return '';
  }
}

function turnstileAllowedHostnames() {
  const configured = String(process.env.TURNSTILE_ALLOWED_HOSTNAMES || '')
    .split(',')
    .map(normalizeHostname)
    .filter(Boolean);
  const origins = [
    process.env.FRONTEND_URL,
    ...String(process.env.CORS_ORIGIN || '').split(','),
  ].map(hostnameFromUrl).filter(Boolean);
  return [...new Set([...configured, ...origins])];
}

function validateTurnstileResponse(data, {
  expectedAction = '',
  allowedHostnames = turnstileAllowedHostnames(),
  requireHostname = process.env.NODE_ENV === 'production',
} = {}) {
  if (data?.success !== true) return { valid: false, reason: 'siteverify_failed' };
  if (expectedAction && data.action !== expectedAction) {
    return { valid: false, reason: 'action_mismatch' };
  }

  const hostname = normalizeHostname(data.hostname);
  const allowed = [...new Set((allowedHostnames || []).map(normalizeHostname).filter(Boolean))];
  if (requireHostname && allowed.length === 0) {
    return { valid: false, reason: 'hostname_allowlist_missing' };
  }
  if (allowed.length > 0 && (!hostname || !allowed.includes(hostname))) {
    return { valid: false, reason: 'hostname_mismatch' };
  }
  return { valid: true, reason: 'verified' };
}

function assertTurnstileConfiguration({
  production = process.env.NODE_ENV === 'production',
  secret = process.env.TURNSTILE_SECRET_KEY,
  allowedHostnames = turnstileAllowedHostnames(),
} = {}) {
  if (!production) return;
  if (!secret) throw new Error('TURNSTILE_SECRET_KEY is required in production');
  if (!Array.isArray(allowedHostnames) || allowedHostnames.length === 0) {
    throw new Error('TURNSTILE_ALLOWED_HOSTNAMES or a valid FRONTEND_URL/CORS_ORIGIN is required in production');
  }
}

async function verifyTurnstile(token, ip, { expectedAction = '' } = {}) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    console.warn('Turnstile secret is not configured.');
    return process.env.NODE_ENV !== 'production';
  }
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return false;

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secret);
    formData.append('response', token);
    if (ip) formData.append('remoteip', ip);

    const response = await axios.post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      formData,
      { timeout: 8000 }
    );
    const result = validateTurnstileResponse(response.data, { expectedAction });
    if (!result.valid) {
      console.warn('Turnstile verification rejected.', {
        reason: result.reason,
        errorCodes: Array.isArray(response.data?.['error-codes']) ? response.data['error-codes'] : [],
      });
    }
    return result.valid;
  } catch (error) {
    console.warn('Turnstile verification unavailable.', {
      code: error.code || 'TURNSTILE_NETWORK_ERROR',
    });
    return false;
  }
}

module.exports = verifyTurnstile;
module.exports.assertTurnstileConfiguration = assertTurnstileConfiguration;
module.exports.turnstileAllowedHostnames = turnstileAllowedHostnames;
module.exports.validateTurnstileResponse = validateTurnstileResponse;
