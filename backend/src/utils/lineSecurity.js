const crypto = require('crypto');
const axios = require('axios');
const LineOAuthState = require('../models/lineOAuthState');

function boolEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(String(raw).toLowerCase());
}

function lineLoginChannelId() {
  return process.env.LINE_LOGIN_CHANNEL_ID || process.env.LINE_CLIENT_ID || process.env.LINE_CHANNEL_ID || '';
}

function lineLoginEnabled() {
  return boolEnv('LINE_LOGIN_ENABLED', Boolean(lineLoginChannelId()));
}

function lineWebhookSecret() {
  return process.env.LINE_WEBHOOK_CHANNEL_SECRET || process.env.LINE_CHANNEL_SECRET || '';
}

function lineLoginChannelSecret() {
  return process.env.LINE_LOGIN_CHANNEL_SECRET || process.env.LINE_CLIENT_SECRET || process.env.LINE_CHANNEL_SECRET || '';
}

function requireLineLoginChannelId() {
  if (!lineLoginEnabled()) {
    const err = new Error('LINE login is not enabled');
    err.statusCode = 503;
    throw err;
  }
  const channelId = lineLoginChannelId();
  if (!channelId && process.env.NODE_ENV === 'production') {
    const err = new Error('LINE login channel id is not configured');
    err.statusCode = 500;
    throw err;
  }
  return channelId;
}

function requireLineLoginChannelSecret() {
  const channelSecret = lineLoginChannelSecret();
  if (!channelSecret) {
    const err = new Error('LINE login channel secret is not configured');
    err.statusCode = 500;
    throw err;
  }
  return channelSecret;
}

function lineOAuthStateSecret() {
  const secret = process.env.SESSION_TOKEN_HASH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    const err = new Error('LINE OAuth state secret is not configured');
    err.statusCode = 500;
    throw err;
  }
  return secret;
}

function hashLineOAuthState(state) {
  return crypto.createHmac('sha256', lineOAuthStateSecret()).update(String(state || '')).digest('hex');
}

function lineRedirectAllowlist() {
  return [
    process.env.LINE_LOGIN_CALLBACK_URL,
    ...(process.env.LINE_LOGIN_CALLBACK_URLS || '').split(','),
  ].map((value) => String(value || '').trim()).filter(Boolean);
}

function assertAllowedRedirectUri(redirectUri) {
  const uri = String(redirectUri || process.env.LINE_LOGIN_CALLBACK_URL || '').trim();
  if (!uri) {
    const err = new Error('LINE callback URL is not configured');
    err.statusCode = 500;
    throw err;
  }

  const allowlist = lineRedirectAllowlist();
  const isDevLocal = process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//.test(uri);
  if (allowlist.length > 0 && !allowlist.includes(uri) && !isDevLocal) {
    const err = new Error('LINE callback URL is not allowed');
    err.statusCode = 400;
    throw err;
  }
  if (process.env.NODE_ENV === 'production' && allowlist.length === 0) {
    const err = new Error('LINE callback URL allowlist is not configured');
    err.statusCode = 500;
    throw err;
  }
  return uri;
}

async function createLineAuthorizationRequest({ redirectUri, action = 'login', participantId = null, eventId = null, eventYear = '' } = {}) {
  const channelId = requireLineLoginChannelId();
  if (!channelId) {
    const err = new Error('LINE login channel id is required');
    err.statusCode = 500;
    throw err;
  }
  const allowedRedirectUri = assertAllowedRedirectUri(redirectUri);
  const state = crypto.randomBytes(24).toString('base64url');
  const nonce = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + Number(process.env.LINE_OAUTH_STATE_TTL_MS || 10 * 60 * 1000));
  await LineOAuthState.create({
    stateHash: hashLineOAuthState(state),
    nonce,
    action: ['login', 'link'].includes(action) ? action : 'login',
    participantId,
    eventId,
    eventYear,
    redirectUri: allowedRedirectUri,
    expiresAt,
  });

  const url = new URL('https://access.line.me/oauth2/v2.1/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', channelId);
  url.searchParams.set('redirect_uri', allowedRedirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', process.env.LINE_LOGIN_SCOPE || 'profile openid email');
  url.searchParams.set('nonce', nonce);

  return {
    authorizationUrl: url.toString(),
    state,
    nonce,
    expiresAt,
  };
}

async function verifyLineAccessToken(accessToken) {
  if (!accessToken) return null;
  const channelId = requireLineLoginChannelId();

  const verifyRes = await axios.get('https://api.line.me/oauth2/v2.1/verify', {
    params: { access_token: accessToken },
    timeout: 7000,
  });
  if (channelId && String(verifyRes.data?.client_id) !== String(channelId)) {
    const err = new Error('LINE access token audience mismatch');
    err.statusCode = 401;
    throw err;
  }

  const profileRes = await axios.get('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 7000,
  });

  return {
    source: 'access_token',
    lineUserId: profileRes.data?.userId,
    displayName: profileRes.data?.displayName || '',
    pictureUrl: profileRes.data?.pictureUrl || '',
    email: '',
  };
}

async function verifyLineIdToken(idToken, { nonce = '' } = {}) {
  if (!idToken) return null;
  const channelId = requireLineLoginChannelId();
  if (!channelId) {
    const err = new Error('LINE login channel id is required to verify ID token');
    err.statusCode = 500;
    throw err;
  }

  const formData = new URLSearchParams();
  formData.append('id_token', idToken);
  formData.append('client_id', channelId);
  if (nonce) formData.append('nonce', nonce);

  const verifyRes = await axios.post('https://api.line.me/oauth2/v2.1/verify', formData, {
    timeout: 7000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const data = verifyRes.data || {};

  if (data.iss && data.iss !== 'https://access.line.me') {
    const err = new Error('LINE ID token issuer mismatch');
    err.statusCode = 401;
    throw err;
  }
  if (String(data.aud || '') !== String(channelId)) {
    const err = new Error('LINE ID token audience mismatch');
    err.statusCode = 401;
    throw err;
  }
  if (nonce && data.nonce && data.nonce !== nonce) {
    const err = new Error('LINE ID token nonce mismatch');
    err.statusCode = 401;
    throw err;
  }

  return {
    source: 'id_token',
    lineUserId: data.sub,
    displayName: data.name || '',
    pictureUrl: data.picture || '',
    email: data.email || '',
    nonce: data.nonce || '',
  };
}

async function exchangeLineAuthorizationCode({ code, state, redirectUri }) {
  if (!code || !state) return null;
  const stateHash = hashLineOAuthState(state);
  const oauthState = await LineOAuthState.findOne({
    stateHash,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!oauthState) {
    const err = new Error('LINE OAuth state expired or invalid');
    err.statusCode = 401;
    throw err;
  }

  const allowedRedirectUri = assertAllowedRedirectUri(redirectUri || oauthState.redirectUri);
  if (oauthState.redirectUri !== allowedRedirectUri) {
    const err = new Error('LINE callback URL mismatch');
    err.statusCode = 401;
    throw err;
  }

  const formData = new URLSearchParams();
  formData.append('grant_type', 'authorization_code');
  formData.append('code', code);
  formData.append('redirect_uri', allowedRedirectUri);
  formData.append('client_id', requireLineLoginChannelId());
  formData.append('client_secret', requireLineLoginChannelSecret());

  const tokenRes = await axios.post('https://api.line.me/oauth2/v2.1/token', formData, {
    timeout: 7000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const tokenData = tokenRes.data || {};
  const identity = await verifyLineIdToken(tokenData.id_token, { nonce: oauthState.nonce })
    || await verifyLineAccessToken(tokenData.access_token);

  oauthState.usedAt = new Date();
  await oauthState.save();

  return identity ? {
    ...identity,
    source: identity.source === 'id_token' ? 'oauth_code_id_token' : 'oauth_code_access_token',
    oauthState: {
      action: oauthState.action,
      participantId: oauthState.participantId || null,
      eventId: oauthState.eventId || null,
      eventYear: oauthState.eventYear || '',
    },
  } : null;
}

async function resolveLineIdentity(body = {}) {
  const identity = await exchangeLineAuthorizationCode({
    code: body.code,
    state: body.state,
    redirectUri: body.redirectUri,
  }) || await verifyLineIdToken(body.idToken, { nonce: body.nonce || body.expectedNonce || '' })
    || await verifyLineAccessToken(body.accessToken);

  if (identity?.lineUserId) return identity;

  if (boolEnv('LINE_ALLOW_LEGACY_USER_ID_LOGIN', process.env.NODE_ENV !== 'production')) {
    const lineUserId = body.lineUserId || body.userId;
    if (lineUserId) {
      return {
        source: 'legacy_unverified_user_id',
        lineUserId: String(lineUserId),
        displayName: '',
        pictureUrl: '',
        email: '',
      };
    }
  }

  const err = new Error('LINE token is required');
  err.statusCode = 400;
  throw err;
}

function verifyLineWebhookSignature(req) {
  const secret = lineWebhookSecret();
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      const err = new Error('LINE webhook channel secret is not configured');
      err.statusCode = 500;
      throw err;
    }
    return true;
  }

  const signature = req.get('x-line-signature') || '';
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

module.exports = {
  createLineAuthorizationRequest,
  exchangeLineAuthorizationCode,
  lineLoginEnabled,
  resolveLineIdentity,
  verifyLineAccessToken,
  verifyLineIdToken,
  verifyLineWebhookSignature,
};
