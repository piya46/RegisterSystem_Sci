const nodemailer = require('nodemailer');
require('dotenv').config(); // โหลด .env

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

module.exports = async function sendMail(to, subject, text, html = null) {
  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    ...(html ? { html } : {})
  };
  return transporter.sendMail(mailOptions);
};


// const sgMail = require('@sendgrid/mail');
// require('dotenv').config();

// sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// module.exports = async function sendMail(to, subject, text, html = null) {
//   const msg = {
//     to,
//     from: process.env.SENDGRID_FROM,
//     subject,
//     text,
//     ...(html ? { html } : {})
//   };
//   return sgMail.send(msg);
// };
