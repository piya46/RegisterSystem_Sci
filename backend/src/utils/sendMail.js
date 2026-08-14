const nodemailer = require('nodemailer');
const axios = require('axios');
const {
  brevoSender,
  emailDeliveryConfigured,
  normalizedEmailProvider,
} = require('./emailProviderConfig');

function smtpTransporter() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

function recipients(value) {
  return String(value || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
    .map((email) => ({ email }));
}

function attachmentContentBase64(attachment) {
  if (!attachment?.content) return '';
  return Buffer.isBuffer(attachment.content)
    ? attachment.content.toString('base64')
    : Buffer.from(String(attachment.content)).toString('base64');
}

function brevoAttachments(attachments = []) {
  if (!Array.isArray(attachments)) return undefined;
  const normalized = attachments
    .filter((attachment) => attachment?.filename && attachment.content)
    .map((attachment) => ({
      name: attachment.filename,
      content: attachmentContentBase64(attachment),
    }));
  return normalized.length ? normalized : undefined;
}

function inlineCidImages(html, attachments = []) {
  let content = html;
  if (!content || !Array.isArray(attachments)) return content;
  for (const attachment of attachments) {
    if (!attachment?.cid || !attachment?.content) continue;
    const contentType = String(attachment.contentType || '').trim().toLowerCase();
    if (!contentType.startsWith('image/')) continue;
    const dataUri = `data:${contentType};base64,${attachmentContentBase64(attachment)}`;
    content = content.split(`cid:${attachment.cid}`).join(dataUri);
  }
  return content;
}

function brevoPayload(to, subject, text, html, options = {}) {
  const sender = brevoSender();
  const htmlContent = inlineCidImages(html, options.attachments);
  const payload = {
    sender,
    to: recipients(to),
    subject,
    ...(htmlContent ? { htmlContent } : {}),
    ...(text ? { textContent: text } : {}),
  };
  const attachment = brevoAttachments(options.attachments);
  if (attachment) payload.attachment = attachment;
  if (options.replyTo) payload.replyTo = typeof options.replyTo === 'string'
    ? { email: options.replyTo }
    : options.replyTo;
  return payload;
}

async function sendBrevo(to, subject, text, html = null, options = {}) {
  const endpoint = process.env.BREVO_TRANSACTIONAL_EMAIL_URL || 'https://api.brevo.com/v3/smtp/email';
  const response = await axios.post(
    endpoint,
    brevoPayload(to, subject, text, html, options),
    {
      headers: {
        accept: 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
      },
      timeout: Number(process.env.BREVO_EMAIL_TIMEOUT_MS || 10000),
    }
  );
  return {
    messageId: response.data?.messageId || response.headers?.['x-message-id'] || null,
    provider: 'brevo',
  };
}

module.exports = async function sendMail(to, subject, text, html = null, options = {}) {
  const provider = normalizedEmailProvider();
  const configured = emailDeliveryConfigured();
  if (!configured || process.env.MOCK_EMAIL === 'true') {
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
  if (provider === 'brevo') return sendBrevo(to, subject, text, html, options);

  const transporter = smtpTransporter();
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

module.exports._internal = {
  brevoPayload,
  brevoAttachments,
  inlineCidImages,
  recipients,
};
