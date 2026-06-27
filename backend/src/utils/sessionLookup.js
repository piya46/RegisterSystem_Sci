const Session = require('../models/session');
const { hashSessionToken } = require('./sessionToken');

async function findSessionByToken(token) {
  const tokenHash = hashSessionToken(token);
  let session = await Session.findOne({ tokenHash }).select('+token +tokenHash +previousTokenHash +previousTokenHashes.tokenHash');
  if (session) return { matched: 'current', session, tokenHash };

  session = await Session.findOne({
    $or: [
      {
        previousTokenHash: tokenHash,
        previousTokenExpiresAt: { $gt: new Date() },
      },
      {
        previousTokenHashes: {
          $elemMatch: {
            tokenHash,
            expiresAt: { $gt: new Date() }
          }
        }
      }
    ]
  }).select('+token +tokenHash +previousTokenHash +previousTokenHashes.tokenHash');
  if (session) return { matched: 'previous', session, tokenHash };

  session = await Session.findOne({ token }).select('+token +tokenHash +previousTokenHash +previousTokenHashes.tokenHash');
  if (session && !session.tokenHash) {
    await Session.updateOne(
      { _id: session._id },
      { $set: { tokenHash }, $unset: { token: 1 } }
    );
    session.tokenHash = tokenHash;
    session.token = undefined;
    return { matched: 'legacy', session, tokenHash };
  }

  return { matched: null, session: null, tokenHash };
}

module.exports = { findSessionByToken };
