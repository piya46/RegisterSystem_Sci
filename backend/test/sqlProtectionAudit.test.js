const test = require('node:test');
const assert = require('node:assert/strict');
const { PROTECTION_AUDITS } = require('../src/scripts/auditSqlMirrorProtection');

test('SQL protection audit returns aggregate counts without selecting protected values', () => {
  assert.deepEqual(
    PROTECTION_AUDITS.map(({ name }) => name),
    [
      'participant_qr',
      'participant_identity_indices',
      'vendor_qr',
      'transaction_tokens',
      'receipt_number',
    ]
  );
  for (const { sql } of PROTECTION_AUDITS) {
    assert.match(sql, /SELECT COALESCE\(SUM\(CASE/);
    assert.match(sql, /AS violations/);
    assert.doesNotMatch(
      sql,
      /SELECT\s+(?:qr_code|qr_code_id|email_blind_index|phone_blind_index|name_blind_index|line_user_blind_index|idempotency_key|verification_code|receipt_number)\b/i
    );
  }
});
