const sendMail = require('../utils/sendMail');

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const info = await sendMail(to, subject, text, html);
    return { success: true, messageId: info.messageId, mocked: Boolean(info.mocked) };
  } catch (error) {
    console.error('Error sending email:', { code: error.code || 'EMAIL_SEND_FAILED' });
    return { success: false, error };
  }
};

module.exports = {
  sendEmail
};
