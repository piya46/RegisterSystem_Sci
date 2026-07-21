const nodemailer = require('nodemailer');

const transporter = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
}) : null;

module.exports = async function sendMail(to, subject, text, html = null, options = {}) {
  if (!transporter || process.env.MOCK_EMAIL === 'true') {
    if (process.env.NODE_ENV === 'production') {
      const error = new Error('Email delivery is not configured');
      error.code = 'EMAIL_DELIVERY_NOT_CONFIGURED';
      throw error;
    }
    console.log('--------------------------------------------------');
    console.log('📧 MOCK EMAIL SENT:');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Text Body:\n${text || html}`);
    console.log('--------------------------------------------------');
    return { success: true, mocked: true };
  }
  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
    ...options
  };
  return transporter.sendMail(mailOptions);
};
