// helpers/checkInStatusService.js

const Participant = require('../models/participant');
const { participantFieldMatch } = require('../utils/fieldEncryption');
const { normalizeEventYear } = require('../utils/eventYear');

/**
 * ตรวจสอบว่า participant (เช่น ด้วย phone หรือ email) ได้ check-in แล้วหรือยัง
 * @param {Object} criteria เช่น { field: 'phone', value: '...' }
 * @returns {Promise<boolean>} true = checked in แล้ว, false = ยังไม่เช็คอิน
 */
async function isParticipantCheckedIn(criteria) {
  const found = await Participant.findOne({
    ...participantFieldMatch(criteria.field, criteria.value),
    ...(criteria.eventYear ? { eventYear: normalizeEventYear(criteria.eventYear) } : {}),
    // status: 'checkedIn',
    isDeleted: false
  });
  return !!found;
}
async function isParticipantregister(criteria) {
  const found = await Participant.findOne({
    ...participantFieldMatch(criteria.field, criteria.value),
    ...(criteria.eventYear ? { eventYear: normalizeEventYear(criteria.eventYear) } : {}),
    status: '"registered',
    isDeleted: false
  });
  return !!found;
}

module.exports = { isParticipantCheckedIn };
