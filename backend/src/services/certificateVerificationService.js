const Participant = require('../models/participant');
const {
  generateCertificateVerificationId,
  normalizeCertificateVerificationId,
} = require('../utils/certificateVerification');

const MISSING_VERIFICATION_ID = {
  $or: [
    { certificateVerificationId: { $exists: false } },
    { certificateVerificationId: null },
    { certificateVerificationId: '' },
  ],
};

async function ensureCertificateVerificationId(participant) {
  if (!participant?._id) throw new Error('Participant is required to issue a certificate verification ID');

  const selectedValue = normalizeCertificateVerificationId(participant.certificateVerificationId);
  if (selectedValue) return selectedValue;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = generateCertificateVerificationId();
    try {
      const updated = await Participant.findOneAndUpdate(
        { _id: participant._id, ...MISSING_VERIFICATION_ID },
        {
          $set: {
            certificateVerificationId: candidate,
            certificateVerificationIssuedAt: new Date(),
          },
        },
        { new: true, runValidators: true }
      ).select('+certificateVerificationId');

      if (updated?.certificateVerificationId) return updated.certificateVerificationId;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }

    const current = await Participant.findById(participant._id).select('+certificateVerificationId');
    const currentValue = normalizeCertificateVerificationId(current?.certificateVerificationId);
    if (currentValue) return currentValue;
  }

  throw new Error('Unable to issue a unique certificate verification ID');
}

module.exports = {
  ensureCertificateVerificationId,
};
