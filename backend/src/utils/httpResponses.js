function serverError(res, errorOrMessage = 'Server error') {
  if (errorOrMessage && typeof errorOrMessage === 'object') {
    if (errorOrMessage.code === 'E2EE_CLIENT_DECRYPT_REQUIRED') {
      return res.status(errorOrMessage.statusCode || 409).json({
        error: 'E2EE strict mode requires client-side decrypt for this operation',
        code: errorOrMessage.code,
      });
    }
    if (errorOrMessage.statusCode && errorOrMessage.statusCode < 500) {
      return res.status(errorOrMessage.statusCode).json({ error: errorOrMessage.message || 'Bad request' });
    }
    return res.status(500).json({ error: 'Server error' });
  }
  const message = errorOrMessage;
  return res.status(500).json({ error: message });
}

function pickAllowed(source, allowedFields) {
  return allowedFields.reduce((acc, field) => {
    if (Object.prototype.hasOwnProperty.call(source || {}, field)) {
      acc[field] = source[field];
    }
    return acc;
  }, {});
}

module.exports = { serverError, pickAllowed };
