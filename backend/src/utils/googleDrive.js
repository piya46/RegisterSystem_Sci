const { google } = require('googleapis');
const { Readable } = require('stream');
const logger = require('./logger');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

async function uploadToDrive(fileName, fileBuffer, mimeType) {
  try {
    const auth = new google.auth.JWT(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      SCOPES
    );

    const drive = google.drive({ version: 'v3', auth });
    const bufferStream = new Readable();
    bufferStream.push(fileBuffer);
    bufferStream.push(null);

    const fileMetadata = {
      name: fileName,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
    };

    const media = {
      mimeType: mimeType,
      body: bufferStream,
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
    });

    return response.data;
  } catch (error) {
    logger.error(`[GoogleDrive] Upload Failed: ${error.message}`);
    throw error;
  }
}

module.exports = { uploadToDrive };