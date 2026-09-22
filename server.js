require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const { Readable } = require('stream');
const { Pool } = require('pg');
const { google } = require('googleapis');
const cloudinary = require('cloudinary').v2;
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage() });

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

app.get('/auth-drive', (req, res) => {
  const oAuth2Client = getOAuthClient();
  const url = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file']
  });
  res.redirect(url);
});

app.get('/oauth2callback', async (req, res) => {
  try {
    const oAuth2Client = getOAuthClient();
    const { tokens } = await oAuth2Client.getToken(req.query.code);
    res.send(`
      <h2>Authorization successful!</h2>
      <p>Copy this refresh token and save it as <b>OAUTH_REFRESH_TOKEN</b> in your environment variables:</p>
      <textarea style="width:100%;height:100px">${tokens.refresh_token}</textarea>
      <p>Once saved, this page is no longer needed.</p>
    `);
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

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

async function uploadPhoto(buffer, fileName, mimeType) {
  if (process.env.OAUTH_REFRESH_TOKEN && process.env.DRIVE_FOLDER_ID) {
    return uploadToDrive(buffer, fileName, mimeType);
  }
  return uploadToCloudinary(buffer, fileName);
}

const neonPool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

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

function formatTimestamp(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const istOffsetMs = 5.5 * 60 * 60000;
  const ist = new Date(date.getTime() + istOffsetMs);
  const day = String(ist.getUTCDate()).padStart(2, '0');
  const month = months[ist.getUTCMonth()];
  const year = String(ist.getUTCFullYear()).slice(-2);
  const hours = String(ist.getUTCHours()).padStart(2, '0');
  const minutes = String(ist.getUTCMinutes()).padStart(2, '0');
  const seconds = String(ist.getUTCSeconds()).padStart(2, '0');
  return `${day}-${month}-${year}:${hours}:${minutes}:${seconds}`;
}

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

app.get('/sync-to-sheet', async (req, res) => {
  try {
    const { rows } = await neonPool.query(
      `SELECT * FROM orders WHERE synced_to_sheet = FALSE ORDER BY id ASC`
    );

    for (const row of rows) {
      await appendToSheet([
        row.id,
        row.party_name,
        row.sales_person,
        row.remarks || '',
        row.file_path,
        formatTimestamp(row.created_at)
      ]);
      await neonPool.query(`UPDATE orders SET synced_to_sheet = TRUE WHERE id = $1`, [row.id]);
    }

    res.json({ success: true, synced: rows.length });
  } catch (err) {
    console.error('Auto-sync failed:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

const partyUpload = upload.fields([
  { name: 'aadhaar_attachment', maxCount: 1 },
  { name: 'gst_attachment', maxCount: 1 },
  { name: 'pan_attachment', maxCount: 1 },
  { name: 'bank_attachment', maxCount: 1 }
]);

app.post('/submit-party', partyUpload, async (req, res) => {
  const {
    applied_for, owner_name, owner_phone, email, aadhaar_no, company_name, address,
    gst_number, pan_number, bank_account_no, billing_address, delivery_address,
    landmark, role_applied_for, state, city, area_requested
  } = req.body;

  const files = req.files || {};
  if (!owner_name || !owner_phone || !applied_for) {
    return res.status(400).json({ success: false, message: 'Applied For, Owner Name aur Owner Phone zaroori hain.' });
  }
  if (!files.aadhaar_attachment || !files.gst_attachment || !files.pan_attachment || !files.bank_attachment) {
    return res.status(400).json({ success: false, message: 'Chaaron attachments (Aadhaar, GST, PAN, Bank) zaroori hain.' });
  }

  let partyId;
  let urls;

  try {
    urls = {
      aadhaar: await uploadPhoto(files.aadhaar_attachment[0].buffer, `${Date.now()}-aadhaar-${files.aadhaar_attachment[0].originalname}`, files.aadhaar_attachment[0].mimetype),
      gst: await uploadPhoto(files.gst_attachment[0].buffer, `${Date.now()}-gst-${files.gst_attachment[0].originalname}`, files.gst_attachment[0].mimetype),
      pan: await uploadPhoto(files.pan_attachment[0].buffer, `${Date.now()}-pan-${files.pan_attachment[0].originalname}`, files.pan_attachment[0].mimetype),
      bank: await uploadPhoto(files.bank_attachment[0].buffer, `${Date.now()}-bank-${files.bank_attachment[0].originalname}`, files.bank_attachment[0].mimetype)
    };
  } catch (err) {
    console.error('Attachment upload failed:', err.message);
    return res.status(500).json({ success: false, message: 'File upload karte waqt error aayi.' });
  }

  try {
    const result = await neonPool.query(
      `INSERT INTO party_onboarding (
        applied_for, owner_name, owner_phone, email, aadhaar_no, aadhaar_attachment,
        company_name, address, gst_number, gst_attachment, pan_number, pan_attachment,
        bank_account_no, bank_attachment, billing_address, delivery_address, landmark,
        role_applied_for, state, city, area_requested
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      RETURNING id`,
      [
        applied_for, owner_name, owner_phone, email || null, aadhaar_no || null, urls.aadhaar,
        company_name || null, address || null, gst_number || null, urls.gst, pan_number || null, urls.pan,
        bank_account_no || null, urls.bank, billing_address || null, delivery_address || null, landmark || null,
        role_applied_for || null, state || null, city || null, area_requested || null
      ]
    );
    partyId = result.rows[0].id;
  } catch (err) {
    console.error('Neon insert (party_onboarding) failed:', err);
    return res.status(500).json({ success: false, message: 'Database mein save karte waqt error aayi.' });
  }

  if (localPool) {
    try {
      await localPool.query(
        `INSERT INTO party_onboarding (
          applied_for, owner_name, owner_phone, email, aadhaar_no, aadhaar_attachment,
          company_name, address, gst_number, gst_attachment, pan_number, pan_attachment,
          bank_account_no, bank_attachment, billing_address, delivery_address, landmark,
          role_applied_for, state, city, area_requested
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [
          applied_for, owner_name, owner_phone, email || null, aadhaar_no || null, urls.aadhaar,
          company_name || null, address || null, gst_number || null, urls.gst, pan_number || null, urls.pan,
          bank_account_no || null, urls.bank, billing_address || null, delivery_address || null, landmark || null,
          role_applied_for || null, state || null, city || null, area_requested || null
        ]
      );
    } catch (err) {
      console.error('Local PostgreSQL insert (party_onboarding) skipped/failed (not critical):', err.message);
    }
  }

  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `PartyOnboarding!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          partyId, applied_for, owner_name, owner_phone, email || '', aadhaar_no || '', urls.aadhaar,
          company_name || '', address || '', gst_number || '', urls.gst, pan_number || '', urls.pan,
          bank_account_no || '', urls.bank, billing_address || '', delivery_address || '', landmark || '',
          role_applied_for || '', state || '', city || '', area_requested || '', formatTimestamp(new Date())
        ]]
      }
    });
    await neonPool.query(`UPDATE party_onboarding SET synced_to_sheet = TRUE WHERE id = $1`, [partyId]);
  } catch (err) {
    console.error('Google Sheet sync (party_onboarding) failed:', err.message);
  }

  res.json({ success: true, message: 'Party saved successfully!', partyId });
});

app.post('/submit-payment', upload.single('cheque_file'), async (req, res) => {
  const { party_name, bill_no, bill_amount, credit_note_no, credit_note_amount, cheque_no, cheque_amount } = req.body;

  if (!party_name || !req.file) {
    return res.status(400).json({ success: false, message: 'Party Name aur Cheque Attachment zaroori hain.' });
  }

  let paymentId;
  let fileUrl;

  try {
    fileUrl = await uploadPhoto(req.file.buffer, `${Date.now()}-${req.file.originalname}`, req.file.mimetype);
  } catch (err) {
    console.error('Cheque upload failed:', err.message);
    return res.status(500).json({ success: false, message: 'File upload karte waqt error aayi.' });
  }

  try {
    const result = await neonPool.query(
      `INSERT INTO payments (party_name, bill_no, bill_amount, credit_note_no, credit_note_amount, cheque_no, cheque_amount, cheque_file)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [party_name, bill_no || null, bill_amount || null, credit_note_no || null, credit_note_amount || null, cheque_no || null, cheque_amount || null, fileUrl]
    );
    paymentId = result.rows[0].id;
  } catch (err) {
    console.error('Neon insert (payments) failed:', err);
    return res.status(500).json({ success: false, message: 'Database mein save karte waqt error aayi.' });
  }

  if (localPool) {
    try {
      await localPool.query(
        `INSERT INTO payments (party_name, bill_no, bill_amount, credit_note_no, credit_note_amount, cheque_no, cheque_amount, cheque_file)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [party_name, bill_no || null, bill_amount || null, credit_note_no || null, credit_note_amount || null, cheque_no || null, cheque_amount || null, fileUrl]
      );
    } catch (err) {
      console.error('Local PostgreSQL insert (payments) skipped/failed (not critical):', err.message);
    }
  }

  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `Payments!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[paymentId, party_name, bill_no || '', bill_amount || '', credit_note_no || '', credit_note_amount || '', cheque_no || '', cheque_amount || '', fileUrl, formatTimestamp(new Date())]]
      }
    });
    await neonPool.query(`UPDATE payments SET synced_to_sheet = TRUE WHERE id = $1`, [paymentId]);
  } catch (err) {
    console.error('Google Sheet sync (payments) failed:', err.message);
  }

  res.json({ success: true, message: 'Payment saved successfully!', paymentId, fileUrl });
});

app.post('/submit-order', upload.single('order_file'), async (req, res) => {
  const { party_name, sales_person, remarks } = req.body;

  if (!party_name || !sales_person || !req.file) {
    return res.status(400).json({ success: false, message: 'Party Name, Sales Person aur File zaroori hain.' });
  }

  let orderId;
  let fileUrl;

  try {
    fileUrl = await uploadPhoto(req.file.buffer, `${Date.now()}-${req.file.originalname}`, req.file.mimetype);
  } catch (err) {
    console.error('Photo upload failed:', err.message);
    return res.status(500).json({ success: false, message: 'File upload karte waqt error aayi.' });
  }

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

  try {
    await appendToSheet([orderId, party_name, sales_person, remarks || '', fileUrl, formatTimestamp(new Date())]);
    await neonPool.query(`UPDATE orders SET synced_to_sheet = TRUE WHERE id = $1`, [orderId]);
  } catch (err) {
    console.error('Google Sheet sync failed (data safe in SQL, will retry later):', err.message);
  }

  res.json({ success: true, message: 'Order saved successfully!', orderId, fileUrl });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
}

module.exports = app;