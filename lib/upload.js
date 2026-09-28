const { Readable } = require('stream');
const { google } = require('googleapis');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

function uploadToCloudinary(buffer, fileName) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'order-entry-app', public_id: fileName, resource_type: 'auto' },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

function getOAuthClient() {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.OAUTH_CLIENT_ID,
    process.env.OAUTH_CLIENT_SECRET,
    `${process.env.APP_BASE_URL}/oauth2callback`
  );
  if (process.env.OAUTH_REFRESH_TOKEN) {
    oAuth2Client.setCredentials({ refresh_token: process.env.OAUTH_REFRESH_TOKEN });
  }
  return oAuth2Client;
}

async function uploadToDrive(buffer, fileName, mimeType) {
  const auth = getOAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const file = await drive.files.create({
    requestBody: { name: fileName, parents: [process.env.DRIVE_FOLDER_ID] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, webViewLink'
  });

  await drive.permissions.create({
    fileId: file.data.id,
    requestBody: { role: 'reader', type: 'anyone' }
  });

  return file.data.webViewLink;
}

// Uploads to Cloudinary by default (most reliable)
// Google Drive can be re-enabled once OAuth refresh token is regenerated
async function uploadPhoto(buffer, fileName, mimeType) {
  // Using Cloudinary as primary upload method
  return uploadToCloudinary(buffer, fileName);
  
  // Commented out - Google Drive OAuth token needs to be refreshed
  // if (process.env.OAUTH_REFRESH_TOKEN && process.env.DRIVE_FOLDER_ID) {
  //   try {
  //     return await uploadToDrive(buffer, fileName, mimeType);
  //   } catch (err) {
  //     console.error('Google Drive upload failed, falling back to Cloudinary:', err.message);
  //     return uploadToCloudinary(buffer, fileName);
  //   }
  // }
  // return uploadToCloudinary(buffer, fileName);
}

module.exports = { uploadPhoto, getOAuthClient };