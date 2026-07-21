export function paymentSlipFromResponse(data = {}) {
  return {
    amount: data.amount,
    vendorName: data.vendorName,
    transactionId: data.transactionId,
    paymentMethod: data.paymentMethod || 'coins',
    menuItemName: data.menuItemName || '',
    remainingBalance: data.remainingBalance,
    serverTime: data.serverTime,
    slipExpiresAt: data.slipExpiresAt,
    slipNonce: data.slipNonce,
    verificationCode: data.verificationCode,
    dailyThemeCode: data.dailyThemeCode,
    eventYear: data.eventYear,
  };
}
