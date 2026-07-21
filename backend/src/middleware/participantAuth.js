const jwt = require('jsonwebtoken');
const Participant = require('../models/participant');
const { assertParticipantSessionActive, assertParticipantTokenFresh } = require('../utils/participantTokens');

module.exports = async function (req, res, next) {
  let token = req.headers.authorization;
  if (token && token.startsWith('Bearer ')) {
    token = token.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const participantId = payload.id || payload.participantId;
    if (payload.role !== 'participant' && !payload.participantId) {
      return res.status(401).json({ error: 'Unauthorized: Invalid role' });
    }

    const participant = await Participant.findById(participantId);
    if (!participant || participant.isDeleted || participant.isRevoked) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }
    assertParticipantTokenFresh(participant, payload);
    const participantSession = await assertParticipantSessionActive(participant, payload, token, req);

    req.participant = participant;
    req.participantAuthPayload = payload;
    req.participantSession = participantSession;
    req.participantToken = token;
    next();
  } catch (err) {
    res.status(err.statusCode || 401).json({ error: err.statusCode ? err.message : 'Unauthorized: Token expired or invalid' });
  }
};
