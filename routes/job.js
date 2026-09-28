const express = require('express');
const multer = require('multer');
const { neonPool, localPool } = require('../lib/db');
const { uploadPhoto } = require('../lib/upload');
const { appendToSheet, formatTimestamp } = require('../lib/sheets');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/submit-job', upload.single('resume_file'), async (req, res) => {
  const { name, contact_number, email, address, position_applied_for, education, work_experience, why_join } = req.body;

  if (!name || !contact_number || !position_applied_for || !req.file) {
    return res.status(400).json({ success: false, message: 'Name, Contact Number, Position aur Resume zaroori hain.' });
  }

  let fileUrl;
  try {
    fileUrl = await uploadPhoto(req.file.buffer, `${Date.now()}-${req.file.originalname}`, req.file.mimetype);
  } catch (err) {
    console.error('Resume upload failed:', err.message);
    return res.status(500).json({ success: false, message: 'File upload karte waqt error aayi.' });
  }

  const values = [name, contact_number, email || null, address || null, position_applied_for, education || null, work_experience || null, fileUrl, why_join || null];
  const insertSql = `INSERT INTO job_applications (name, contact_number, email, address, position_applied_for, education, work_experience, resume_file, why_join)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

  let jobId;
  try {
    const result = await neonPool.query(insertSql + ' RETURNING id', values);
    jobId = result.rows[0].id;
  } catch (err) {
    console.error('Neon insert (job_applications) failed:', err);
    return res.status(500).json({ success: false, message: 'Database mein save karte waqt error aayi.' });
  }

  if (localPool) {
    try {
      await localPool.query(insertSql, values);
    } catch (err) {
      console.error('Local insert (job_applications) skipped/failed (not critical):', err.message);
    }
  }

  try {
    await appendToSheet(process.env.HR_SPREADSHEET_ID, 'Job Apply', [
      jobId, name, contact_number, email || '', address || '', position_applied_for, education || '', work_experience || '', fileUrl, why_join || '', formatTimestamp(new Date())
    ]);
    await neonPool.query(`UPDATE job_applications SET synced_to_sheet = TRUE WHERE id = $1`, [jobId]);
  } catch (err) {
    console.error('Sheet sync (job_applications) failed:', err.message);
  }

  res.json({ success: true, message: 'Application saved successfully!', jobId, fileUrl });
});

module.exports = router;
