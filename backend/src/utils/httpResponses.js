function serverError(res, message = 'Server error') {
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
