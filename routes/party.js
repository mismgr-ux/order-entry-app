const express = require('express');
const multer = require('multer');
const { neonPool, localPool } = require('../lib/db');
const { uploadPhoto } = require('../lib/upload');
const { appendToSheet, formatTimestamp } = require('../lib/sheets');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const partyUpload = upload.fields([
  { name: 'aadhaar_attachment', maxCount: 1 },
  { name: 'gst_attachment', maxCount: 1 },
  { name: 'pan_attachment', maxCount: 1 },
  { name: 'bank_attachment', maxCount: 1 }
]);

router.post('/submit-party', partyUpload, async (req, res) => {
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

  const send = (key, label) => {
    const f = files[key][0];
    return uploadPhoto(f.buffer, `${Date.now()}-${label}-${f.originalname}`, f.mimetype);
  };

  let urls;
  try {
    urls = {
      aadhaar: await send('aadhaar_attachment', 'aadhaar'),
      gst: await send('gst_attachment', 'gst'),
      pan: await send('pan_attachment', 'pan'),
      bank: await send('bank_attachment', 'bank')
    };
  } catch (err) {
    console.error('Party attachment upload failed:', err.message);
    return res.status(500).json({ success: false, message: 'File upload karte waqt error aayi.' });
  }

  const values = [
    applied_for, owner_name, owner_phone, email || null, aadhaar_no || null, urls.aadhaar,
    company_name || null, address || null, gst_number || null, urls.gst, pan_number || null, urls.pan,
    bank_account_no || null, urls.bank, billing_address || null, delivery_address || null, landmark || null,
    role_applied_for || null, state || null, city || null, area_requested || null
  ];
  const insertSql = `INSERT INTO party_onboarding (
      applied_for, owner_name, owner_phone, email, aadhaar_no, aadhaar_attachment,
      company_name, address, gst_number, gst_attachment, pan_number, pan_attachment,
      bank_account_no, bank_attachment, billing_address, delivery_address, landmark,
      role_applied_for, state, city, area_requested
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`;

  let partyId;
  try {
    const result = await neonPool.query(insertSql + ' RETURNING id', values);
    partyId = result.rows[0].id;
  } catch (err) {
    console.error('Neon insert (party_onboarding) failed:', err);
    return res.status(500).json({ success: false, message: 'Database mein save karte waqt error aayi.' });
  }

  if (localPool) {
    try {
      await localPool.query(insertSql, values);
    } catch (err) {
      console.error('Local insert (party_onboarding) skipped/failed (not critical):', err.message);
    }
  }

  try {
    await appendToSheet(process.env.SPREADSHEET_ID, 'PartyOnboarding', [
      partyId, applied_for, owner_name, owner_phone, email || '', aadhaar_no || '', urls.aadhaar,
      company_name || '', address || '', gst_number || '', urls.gst, pan_number || '', urls.pan,
      bank_account_no || '', urls.bank, billing_address || '', delivery_address || '', landmark || '',
      role_applied_for || '', state || '', city || '', area_requested || '', formatTimestamp(new Date())
    ]);
    await neonPool.query(`UPDATE party_onboarding SET synced_to_sheet = TRUE WHERE id = $1`, [partyId]);
  } catch (err) {
    console.error('Sheet sync (party_onboarding) failed:', err.message);
  }

  res.json({ success: true, message: 'Party saved successfully!', partyId });
});

module.exports = router;
