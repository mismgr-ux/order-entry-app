const express = require('express');
const multer = require('multer');
const { neonPool, localPool } = require('../lib/db');
const { uploadPhoto } = require('../lib/upload');
const { appendToSheet, formatTimestamp } = require('../lib/sheets');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/submit-submission-details', upload.single('resume_file'), async (req, res) => {
  const {
    email_address, applicant_name, gender, contact_number, email, highest_education,
    position_applied_for, hr_name, source, contact_date, total_experience, last_salary,
    expected_salary, stage, offer_date, doj, salary_offered, decline_reasons, decline_remark,
    remarks_of_ss_hr, remarks_of_reporting_manager
  } = req.body;

  if (!applicant_name || !contact_number) {
    return res.status(400).json({ success: false, message: 'Applicant Name aur Contact Number zaroori hain.' });
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

  const values = [
    email_address || null, applicant_name, gender || null, contact_number, email || null,
    highest_education || null, position_applied_for || null, hr_name || null, source || null,
    contact_date || null, total_experience || null, last_salary || null, expected_salary || null,
    stage || null, offer_date || null, doj || null, salary_offered || null,
    decline_reasons || null, decline_remark || null, fileUrl, remarks_of_ss_hr || null, remarks_of_reporting_manager || null
  ];
  const insertSql = `INSERT INTO submission_details (
      email_address, applicant_name, gender, contact_number, email, highest_education,
      position_applied_for, hr_name, source, contact_date, total_experience, last_salary,
      expected_salary, stage, offer_date, doj, salary_offered, decline_reasons, decline_remark,
      resume_file, remarks_of_ss_hr, remarks_of_reporting_manager
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`;

  let subId;
  try {
    const result = await neonPool.query(insertSql + ' RETURNING id', values);
    subId = result.rows[0].id;
  } catch (err) {
    console.error('Neon insert (submission_details) failed:', err);
    return res.status(500).json({ success: false, message: 'Database mein save karte waqt error aayi.' });
  }

  if (localPool) {
    try {
      await localPool.query(insertSql, values);
    } catch (err) {
      console.error('Local insert (submission_details) skipped/failed (not critical):', err.message);
    }
  }

  try {
    await appendToSheet(process.env.HR_SPREADSHEET_ID, 'Submission_Details', [
      subId, ...values.map(v => (v === null ? '' : v)), formatTimestamp(new Date())
    ]);
  } catch (err) {
    console.error('Sheet sync (submission_details) failed:', err.message);
  }

  res.json({ success: true, message: 'Submission saved successfully!', subId });
});

module.exports = router;
