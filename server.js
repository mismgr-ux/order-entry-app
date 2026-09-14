require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const { Pool } = require('pg');
const { google } = require('googleapis');
const cloudinary = require('cloudinary').v2;
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- File upload setup (in-memory, since Vercel has no persistent disk) ----------
const upload = multer({ storage: multer.memoryStorage() });

// ---------- Cloudinary setup (photo/file storage) ----------
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

// ---------- PostgreSQL connection pools ----------
// Neon (cloud) is the primary database — this is what powers the live/hosted app.
const neonPool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Local PostgreSQL — only reachable while running on your own computer.
// Writing to it is "best effort": if it's unavailable (e.g. on Vercel), it's skipped.
const localPool = process.env.LOCAL_DB_HOST
  ? new Pool({
      host: process.env.LOCAL_DB_HOST,
      port: process.env.LOCAL_DB_PORT || 5432,
      user: process.env.LOCAL_DB_USER,
      password: process.env.LOCAL_DB_PASSWORD,
      database: process.env.LOCAL_DB_NAME,
      ssl: false
    })
  : null;

// ---------- Google Sheets auth ----------
async function getSheetsClient() {
  const authOptions = { scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  } else {
    authOptions.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  const auth = new google.auth.GoogleAuth(authOptions);
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

async function appendToSheet(row) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${process.env.SHEET_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
}

// ---------- Main submit endpoint ----------
app.post('/submit-order', upload.single('order_file'), async (req, res) => {
  const { party_name, sales_person, remarks } = req.body;

  if (!party_name || !sales_person || !req.file) {
    return res.status(400).json({ success: false, message: 'Party Name, Sales Person aur File zaroori hain.' });
  }

  let orderId;
  let fileUrl;

  // STEP 1: Upload photo/PDF to Cloudinary first, so we have a permanent link to store
  try {
    fileUrl = await uploadToCloudinary(req.file.buffer, `${Date.now()}-${req.file.originalname}`);
  } catch (err) {
    console.error('Cloudinary upload failed:', err.message);
    return res.status(500).json({ success: false, message: 'File upload karte waqt error aayi.' });
  }

  // STEP 2: Save to Neon (cloud) — this is the source of truth
  try {
    const result = await neonPool.query(
      `INSERT INTO orders (party_name, file_path, sales_person, remarks) VALUES ($1, $2, $3, $4) RETURNING id`,
      [party_name, fileUrl, sales_person, remarks || '']
    );
    orderId = result.rows[0].id;
  } catch (err) {
    console.error('Neon insert failed:', err);
    return res.status(500).json({ success: false, message: 'Database mein save karte waqt error aayi.' });
  }

  // STEP 2b: Also save a copy to local PostgreSQL, if configured and reachable
  if (localPool) {
    try {
      await localPool.query(
        `INSERT INTO orders (party_name, file_path, sales_person, remarks) VALUES ($1, $2, $3, $4)`,
        [party_name, fileUrl, sales_person, remarks || '']
      );
    } catch (err) {
      console.error('Local PostgreSQL insert skipped/failed (not critical):', err.message);
    }
  }

  // STEP 3: Sync row to Google Sheet (data is already safe in SQL even if this fails)
  try {
    await appendToSheet([orderId, party_name, sales_person, remarks || '', fileUrl, new Date().toISOString()]);
    await neonPool.query(`UPDATE orders SET synced_to_sheet = TRUE WHERE id = $1`, [orderId]);
  } catch (err) {
    console.error('Google Sheet sync failed (data safe in SQL, will retry later):', err.message);
  }

  res.json({ success: true, message: 'Order saved successfully!', orderId, fileUrl });
});

const PORT = process.env.PORT || 3000;

// Run a normal local server when started directly (node server.js / npm start).
// On Vercel, this file is imported as a module instead, so listen() is skipped.
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
}

module.exports = app;
