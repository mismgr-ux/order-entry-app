-- Run this in Neon's SQL Editor

CREATE TABLE IF NOT EXISTS job_applications (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  contact_number VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  position_applied_for VARCHAR(255),
  education TEXT,
  work_experience TEXT,
  resume_file VARCHAR(500),
  why_join TEXT,
  synced_to_sheet BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
