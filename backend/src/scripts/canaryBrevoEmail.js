require('dotenv').config();

const sendMail = require('../utils/sendMail');
const {
  brevoConfigured,
  brevoSender,
  normalizedEmailProvider,
  smtpConfigured,
} = require('../utils/emailProviderConfig');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const [rawKey, inlineValue] = item.slice(2).split(/=(.*)/s);
    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[rawKey] = true;
    } else {
      args[rawKey] = next;
      index += 1;
    }
  }
  return args;
}

function maskEmail(value) {
  const email = String(value || '').trim();
  const [local, domain] = email.split('@');
  if (!local || !domain) return '';
  const visibleLocal = local.length <= 2 ? `${local[0] || ''}*` : `${local.slice(0, 2)}***`;
  const domainParts = domain.split('.');
  const visibleDomain = domainParts.length > 1
    ? `${domainParts[0].slice(0, 2)}***.${domainParts.slice(1).join('.')}`
    : `${domain.slice(0, 2)}***`;
  return `${visibleLocal}@${visibleDomain}`;
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function readinessSummary({ to }) {
  const provider = normalizedEmailProvider();
  const sender = brevoSender();
  return {
    provider,
    brevoConfigured: brevoConfigured(),
    senderConfigured: Boolean(sender.email),
    senderEmailMasked: maskEmail(sender.email),
    smtpFallbackConfigured: smtpConfigured(),
    recipientConfigured: validEmail(to),
    recipientMasked: maskEmail(to),
  };
}

async function runCanary(args = parseArgs()) {
  const to = args.to || process.env.BREVO_CANARY_TO || process.env.EMAIL_CANARY_TO;
  const send = args.send === true;
  const summary = readinessSummary({ to });

  if (summary.provider !== 'brevo') {
    throw new Error('EMAIL_PROVIDER=brevo is required for the Brevo canary');
  }
  if (!summary.brevoConfigured) {
    throw new Error('Brevo is not fully configured; set BREVO_API_KEY and BREVO_FROM_EMAIL');
  }

  if (!send) {
    return {
      dryRun: true,
      ...summary,
      nextStep: 'Set BREVO_CANARY_TO, then run BREVO_CANARY_WRITE=true npm run canary:brevo-email -- --send',
    };
  }

  if (process.env.BREVO_CANARY_WRITE !== 'true') {
    throw new Error('BREVO_CANARY_WRITE=true is required before sending a real canary email');
  }
  if (!validEmail(to)) {
    throw new Error('A valid --to or BREVO_CANARY_TO email is required');
  }

  const sentAt = new Date().toISOString();
  const result = await sendMail(
    to,
    `PSEvent Brevo canary (${sentAt})`,
    `PSEvent Brevo canary sent at ${sentAt}.`,
    `<p>PSEvent Brevo canary sent at <strong>${sentAt}</strong>.</p>`
  );

  return {
    dryRun: false,
    ...summary,
    delivered: true,
    providerResult: {
      provider: result.provider || 'brevo',
      messageIdPresent: Boolean(result.messageId),
      mocked: Boolean(result.mocked),
    },
  };
}

async function main() {
  const result = await runCanary();
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Brevo canary failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  maskEmail,
  parseArgs,
  readinessSummary,
  runCanary,
  validEmail,
};
