const test = require('node:test');
const assert = require('node:assert/strict');

const ORIGINAL_ENV = { ...process.env };
const SEND_MAIL_PATH = require.resolve('../src/utils/sendMail');
const {
  emailDeliveryConfigured,
  normalizedEmailProvider,
} = require('../src/utils/emailProviderConfig');
const { requiredRuntimeSecretNames } = require('../src/config/runtimeSecrets');

function restoreEnvironment() {
  for (const name of Object.keys(process.env)) {
    if (!(name in ORIGINAL_ENV)) delete process.env[name];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  delete require.cache[SEND_MAIL_PATH];
}

test.afterEach(restoreEnvironment);

test('production mock email fails closed without logging recipient or OTP', async () => {
  process.env.NODE_ENV = 'production';
  process.env.MOCK_EMAIL = 'true';
  delete process.env.SMTP_HOST;
  delete require.cache[SEND_MAIL_PATH];

  const logged = [];
  const originalLog = console.log;
  console.log = (...values) => logged.push(values.join(' '));
  try {
    const sendMail = require(SEND_MAIL_PATH);
    await assert.rejects(
      sendMail('private@example.test', 'OTP', 'OTP: 12345678'),
      (error) => error.code === 'EMAIL_DELIVERY_NOT_CONFIGURED'
    );
  } finally {
    console.log = originalLog;
  }

  assert.equal(logged.join('\n').includes('private@example.test'), false);
  assert.equal(logged.join('\n').includes('12345678'), false);
});

test('Brevo provider builds transactional email payload without SMTP credentials', () => {
  process.env.EMAIL_PROVIDER = 'brevo';
  process.env.BREVO_API_KEY = 'xkeysib-test';
  process.env.BREVO_FROM_EMAIL = 'noreply@example.test';
  process.env.BREVO_FROM_NAME = 'PSEvent';
  process.env.PARTICIPANT_EMAIL_LOGIN_ENABLED = 'true';
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete require.cache[SEND_MAIL_PATH];

  const sendMail = require(SEND_MAIL_PATH);
  const payload = sendMail._internal.brevoPayload(
    'person@example.test',
    'Ticket',
    'Plain ticket',
    '<p>HTML ticket</p>',
    {
      attachments: [{
        filename: 'ticket.png',
        content: Buffer.from('png-bytes'),
        contentType: 'image/png',
        cid: 'ticket-qr',
      }],
    }
  );

  assert.equal(normalizedEmailProvider(), 'brevo');
  assert.equal(emailDeliveryConfigured(), true);
  assert.deepEqual(payload.sender, { name: 'PSEvent', email: 'noreply@example.test' });
  assert.deepEqual(payload.to, [{ email: 'person@example.test' }]);
  assert.equal(payload.subject, 'Ticket');
  assert.equal(payload.textContent, 'Plain ticket');
  assert.equal(payload.htmlContent, '<p>HTML ticket</p>');
  assert.deepEqual(payload.attachment, [{
    name: 'ticket.png',
    content: Buffer.from('png-bytes').toString('base64'),
  }]);
  assert.deepEqual(requiredRuntimeSecretNames().filter((name) => name.includes('BREVO') || name.includes('SMTP')), ['BREVO_API_KEY']);
});

test('Brevo provider inlines cid image attachments for ticket HTML', () => {
  process.env.EMAIL_PROVIDER = 'brevo';
  process.env.BREVO_API_KEY = 'xkeysib-test';
  process.env.BREVO_FROM_EMAIL = 'noreply@example.test';
  delete require.cache[SEND_MAIL_PATH];

  const sendMail = require(SEND_MAIL_PATH);
  const payload = sendMail._internal.brevoPayload(
    'person@example.test',
    'Ticket',
    'Plain ticket',
    '<img src="cid:ticket-qr" alt="QR">',
    {
      attachments: [{
        filename: 'ticket.png',
        content: Buffer.from('png-bytes'),
        contentType: 'image/png',
        cid: 'ticket-qr',
      }],
    }
  );

  assert.equal(
    payload.htmlContent,
    `<img src="data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}" alt="QR">`
  );
  assert.deepEqual(payload.attachment, [{
    name: 'ticket.png',
    content: Buffer.from('png-bytes').toString('base64'),
  }]);
});
