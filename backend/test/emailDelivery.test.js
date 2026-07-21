const test = require('node:test');
const assert = require('node:assert/strict');

const ORIGINAL_ENV = { ...process.env };
const SEND_MAIL_PATH = require.resolve('../src/utils/sendMail');

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
