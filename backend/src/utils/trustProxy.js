const { isIP } = require('node:net');

const NAMED_PROXY_RANGES = new Set(['loopback', 'linklocal', 'uniquelocal']);

function isValidProxyRange(value) {
  if (NAMED_PROXY_RANGES.has(value)) return true;
  if (!String(value).includes('/')) return false;
  const [address, prefixValue] = value.split('/');
  if (!address || !/^\d{1,3}$/.test(String(prefixValue || ''))) return false;
  const prefix = Number(prefixValue);
  const family = isIP(address);
  if (family === 4) return prefix === 32;
  if (family === 6) return prefix === 128;
  return false;
}

function resolveTrustProxy(value = process.env.TRUST_PROXY) {
  const normalized = String(value === undefined ? '1' : value).trim().toLowerCase();
  if (/^[1-9]\d*$/.test(normalized)) return Number(normalized);
  const ranges = normalized.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (ranges.length === 0 || ranges.some((entry) => !isValidProxyRange(entry))) {
    throw new Error('TRUST_PROXY must be a positive hop count or comma-separated named/private ranges and host CIDRs');
  }
  return ranges;
}

module.exports = {
  isValidProxyRange,
  resolveTrustProxy,
};
