const { google } = require('googleapis');
const { Readable } = require('stream');
const logger = require('./logger'); 

async function uploadToDrive(fileName, fileBuffer, mimeType) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!clientId || !clientSecret || !refreshToken || !folderId) {
      throw new Error('Missing Google OAuth2 Environment Variables');
    }

    // 1. ตั้งค่า OAuth2 Client
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'https://developers.google.com/oauthplayground' // Redirect URL
    );

    // 2. ใส่ Refresh Token (เพื่อให้ระบบไปขอ Access Token ใหม่เองอัตโนมัติ)
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // 3. แปลง Buffer เป็น Stream
    const bufferStream = new Readable();
    bufferStream.push(fileBuffer);
    bufferStream.push(null);

    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    };

    const media = {
      mimeType: mimeType,
      body: bufferStream,
    };

    // 4. อัปโหลด (รอบนี้ใช้พื้นที่ของคุณเอง ผ่านฉลุยแน่นอน)
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink',
    });

    logger.info(`[GoogleDrive] Uploaded successfully: ${response.data.id}`);
    return response.data;

  } catch (error) {
    logger.error(`[GoogleDrive] Upload Failed: ${error.message}`);
    throw error;
  }
}

module.exports = { uploadToDrive };