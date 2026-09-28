-- Run this in Neon's SQL Editor
-- This replaces any earlier "party_onboarding" table with the correct structure.

DROP TABLE IF EXISTS party_onboarding;

CREATE TABLE party_onboarding (
  id SERIAL PRIMARY KEY,
  applied_for VARCHAR(100),
  owner_name VARCHAR(255),
  owner_phone VARCHAR(20),
  email VARCHAR(255),
  aadhaar_no VARCHAR(20),
  aadhaar_attachment VARCHAR(500),
  company_name VARCHAR(255),
  address TEXT,
  gst_number VARCHAR(50),
  gst_attachment VARCHAR(500),
  pan_number VARCHAR(50),
  pan_attachment VARCHAR(500),
  bank_account_no VARCHAR(50),
  bank_attachment VARCHAR(500),
  billing_address TEXT,
  delivery_address TEXT,
  landmark VARCHAR(255),
  role_applied_for VARCHAR(100),
  state VARCHAR(100),
  city VARCHAR(100),
  area_requested VARCHAR(255),
  synced_to_sheet BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
