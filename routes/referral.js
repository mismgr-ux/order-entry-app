const express = require('express');
const multer = require('multer');
const { neonPool, localPool } = require('../lib/db');
const { uploadPhoto } = require('../lib/upload');
const { appendToSheet, formatTimestamp } = require('../lib/sheets');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/submit-referral', upload.single('resume_file'), async (req, res) => {
  const { name, address, referred_by, referred_for, any_other_update } = req.body;

  if (!name || !referred_by) {
    return res.status(400).json({ success: false, message: 'Name aur Referred By zaroori hain.' });
  }

  let fileUrl = '';
  if (req.file) {
    try {
      fileUrl = await uploadPhoto(req.file.buffer, `${Date.now()}-${req.file.originalname}`, req.file.mimetype);
    } catch (err) {
      console.error('Resume upload failed:', err.message);
      return res.status(500).json({ success: false, message: 'File upload karte waqt error aayi.' });
    }
  }

  const values = [name, address || null, referred_by, fileUrl, referred_for || null, any_other_update || null];
  const insertSql = `INSERT INTO referral_form (name, address, referred_by, resume_file, referred_for, any_other_update)
    VALUES ($1, $2, $3, $4, $5, $6)`;

  let refId;
  try {
    const result = await neonPool.query(insertSql + ' RETURNING id', values);
    refId = result.rows[0].id;
  } catch (err) {
    console.error('Neon insert (referral_form) failed:', err);
    return res.status(500).json({ success: false, message: 'Database mein save karte waqt error aayi.' });
  }

  if (localPool) {
    try {
      await localPool.query(insertSql, values);
    } catch (err) {
      console.error('Local insert (referral_form) skipped/failed (not critical):', err.message);
    }
  }

  try {
    await appendToSheet(process.env.HR_SPREADSHEET_ID, 'Referral_Form', [
      refId, name, address || '', referred_by, fileUrl, referred_for || '', any_other_update || '', formatTimestamp(new Date())
    ]);
  } catch (err) {
    console.error('Sheet sync (referral_form) failed:', err.message);
  }

  res.json({ success: true, message: 'Referral saved successfully!', refId });
});

module.exports = router;
