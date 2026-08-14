function boolEnv(name, env = process.env) {
  return ['true', '1', 'yes', 'on'].includes(String(env[name] || '').trim().toLowerCase());
}

function parseMailbox(value) {
  const raw = String(value || '').trim();
  if (!raw) return { name: '', email: '' };
  const match = raw.match(/^(?:"?([^"<]*)"?\s*)?<([^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)>$/);
  if (match) {
    return {
      name: String(match[1] || '').trim(),
      email: String(match[2] || '').trim(),
    };
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)
    ? { name: '', email: raw }
    : { name: raw, email: '' };
}

function normalizedEmailProvider(env = process.env) {
  const configured = String(env.EMAIL_PROVIDER || 'auto').trim().toLowerCase();
  if (!['auto', 'brevo', 'smtp', 'none'].includes(configured)) {
    throw new Error('EMAIL_PROVIDER must be auto, brevo, smtp, or none');
  }
  if (configured !== 'auto') return configured;
  if (String(env.BREVO_API_KEY || '').trim()) return 'brevo';
  if (String(env.SMTP_HOST || '').trim()) return 'smtp';
  return 'none';
}

function brevoSender(env = process.env) {
  const explicit = {
    name: String(env.BREVO_FROM_NAME || env.EMAIL_FROM_NAME || '').trim(),
    email: String(env.BREVO_FROM_EMAIL || env.EMAIL_FROM || '').trim(),
  };
  if (explicit.email) return explicit;
  const parsed = parseMailbox(env.SMTP_FROM || env.SMTP_USER);
  return {
    name: explicit.name || parsed.name || 'PSEvent',
    email: parsed.email,
  };
}

function smtpConfigured(env = process.env) {
  return Boolean(
    String(env.SMTP_HOST || '').trim()
    && String(env.SMTP_USER || '').trim()
    && String(env.SMTP_PASS || '').trim()
  );
}

function brevoConfigured(env = process.env) {
  const sender = brevoSender(env);
  return Boolean(String(env.BREVO_API_KEY || '').trim() && sender.email);
}

function emailDeliveryConfigured(env = process.env) {
  const provider = normalizedEmailProvider(env);
  if (provider === 'none') return false;
  if (provider === 'brevo') return brevoConfigured(env);
  if (provider === 'smtp') return smtpConfigured(env);
  return false;
}

function emailFeatureEnabled(env = process.env) {
  return boolEnv('PARTICIPANT_EMAIL_LOGIN_ENABLED', env)
    || normalizedEmailProvider(env) !== 'none';
}

module.exports = {
  brevoConfigured,
  brevoSender,
  emailDeliveryConfigured,
  emailFeatureEnabled,
  normalizedEmailProvider,
  parseMailbox,
  smtpConfigured,
};
