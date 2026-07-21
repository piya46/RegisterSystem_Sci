function buildWalletBalancePayload({ wallet, guestToken = null, participant = null }) {
  const guestRemaining = guestToken?.limitAmount !== null && guestToken?.limitAmount !== undefined
    ? Math.max(Number(guestToken.limitAmount) - Number(guestToken.spentAmount || 0), 0)
    : null;

  const payload = {
    coinBalance: guestRemaining === null
      ? wallet.coinBalance
      : Math.min(wallet.coinBalance, guestRemaining),
    coupons: wallet.coupons,
  };

  if (guestToken) {
    payload.guestAccess = {
      limitAmount: guestToken.limitAmount,
      spentAmount: guestToken.spentAmount || 0,
      remainingAmount: guestRemaining,
      expiresAt: guestToken.expiresAt,
    };
  } else {
    payload.walletCoinBalance = wallet.coinBalance;
    payload.guestAccess = null;
    payload.participant = participant;
  }

  return payload;
}

module.exports = {
  buildWalletBalancePayload,
};
