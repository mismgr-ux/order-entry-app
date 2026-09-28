const express = require('express');
const multer = require('multer');
const { neonPool, localPool } = require('../lib/db');
const { uploadPhoto } = require('../lib/upload');
const { appendToSheet, formatTimestamp } = require('../lib/sheets');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/submit-order', upload.single('order_file'), async (req, res) => {
  const { party_name, sales_person, remarks } = req.body;

  if (!party_name || !sales_person || !req.file) {
    return res.status(400).json({ success: false, message: 'Party Name, Sales Person aur File zaroori hain.' });
  }

  let fileUrl;
  try {
    fileUrl = await uploadPhoto(req.file.buffer, `${Date.now()}-${req.file.originalname}`, req.file.mimetype);
  } catch (err) {
    console.error('Order file upload failed:', err.message);
    return res.status(500).json({ success: false, message: 'File upload karte waqt error aayi.' });
  }

  const values = [party_name, fileUrl, sales_person, remarks || ''];
  const insertSql = `INSERT INTO orders (party_name, file_path, sales_person, remarks) VALUES ($1, $2, $3, $4)`;

  let orderId;
  try {
    const result = await neonPool.query(insertSql + ' RETURNING id', values);
    orderId = result.rows[0].id;
  } catch (err) {
    console.error('Neon insert (orders) failed:', err);
    return res.status(500).json({ success: false, message: 'Database mein save karte waqt error aayi.' });
  }

  if (localPool) {
    try {
      await localPool.query(insertSql, values);
    } catch (err) {
      console.error('Local insert (orders) skipped/failed (not critical):', err.message);
    }
  }

  try {
    await appendToSheet(process.env.SPREADSHEET_ID, process.env.SHEET_NAME, [orderId, party_name, sales_person, remarks || '', fileUrl, formatTimestamp(new Date())]);
    await neonPool.query(`UPDATE orders SET synced_to_sheet = TRUE WHERE id = $1`, [orderId]);
  } catch (err) {
    console.error('Sheet sync (orders) failed:', err.message);
  }

  res.json({ success: true, message: 'Order saved successfully!', orderId, fileUrl });
});

// Sends any order rows that have not reached the Sheet yet.
router.get('/sync-to-sheet', async (req, res) => {
  try {
    const { rows } = await neonPool.query(`SELECT * FROM orders WHERE synced_to_sheet = FALSE ORDER BY id ASC`);
    for (const row of rows) {
      await appendToSheet(process.env.SPREADSHEET_ID, process.env.SHEET_NAME, [
        row.id, row.party_name, row.sales_person, row.remarks || '', row.file_path, formatTimestamp(row.created_at)
      ]);
      await neonPool.query(`UPDATE orders SET synced_to_sheet = TRUE WHERE id = $1`, [row.id]);
    }
    res.json({ success: true, synced: rows.length });
  } catch (err) {
    console.error('Auto-sync failed:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
