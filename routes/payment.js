const express = require('express');
const multer = require('multer');
const { neonPool, localPool } = require('../lib/db');
const { uploadPhoto } = require('../lib/upload');
const { appendToSheet, formatTimestamp } = require('../lib/sheets');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/submit-payment', upload.single('cheque_file'), async (req, res) => {
  const { party_name, bill_no, bill_amount, credit_note_no, credit_note_amount, cheque_no, cheque_amount } = req.body;

  if (!party_name || !req.file) {
    return res.status(400).json({ success: false, message: 'Party Name aur Cheque Attachment zaroori hain.' });
  }

  let fileUrl;
  try {
    fileUrl = await uploadPhoto(req.file.buffer, `${Date.now()}-${req.file.originalname}`, req.file.mimetype);
  } catch (err) {
    console.error('Cheque upload failed:', err.message);
    return res.status(500).json({ success: false, message: 'File upload karte waqt error aayi.' });
  }

  const values = [party_name, bill_no || null, bill_amount || null, credit_note_no || null, credit_note_amount || null, cheque_no || null, cheque_amount || null, fileUrl];
  const insertSql = `INSERT INTO payments (party_name, bill_no, bill_amount, credit_note_no, credit_note_amount, cheque_no, cheque_amount, cheque_file)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;

  let paymentId;
  try {
    const result = await neonPool.query(insertSql + ' RETURNING id', values);
    paymentId = result.rows[0].id;
  } catch (err) {
    console.error('Neon insert (payments) failed:', err);
    return res.status(500).json({ success: false, message: 'Database mein save karte waqt error aayi.' });
  }

  if (localPool) {
    try {
      await localPool.query(insertSql, values);
    } catch (err) {
      console.error('Local insert (payments) skipped/failed (not critical):', err.message);
    }
  }

  try {
    await appendToSheet(process.env.SPREADSHEET_ID, 'Payments', [
      paymentId, party_name, bill_no || '', bill_amount || '', credit_note_no || '', credit_note_amount || '', cheque_no || '', cheque_amount || '', fileUrl, formatTimestamp(new Date())
    ]);
    await neonPool.query(`UPDATE payments SET synced_to_sheet = TRUE WHERE id = $1`, [paymentId]);
  } catch (err) {
    console.error('Sheet sync (payments) failed:', err.message);
  }

  res.json({ success: true, message: 'Payment saved successfully!', paymentId, fileUrl });
});

module.exports = router;
