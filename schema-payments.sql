-- Run this in Neon's SQL Editor to create the payments table

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  party_name VARCHAR(255) NOT NULL,
  bill_no VARCHAR(255),
  bill_amount NUMERIC(12,2),
  credit_note_no VARCHAR(255),
  credit_note_amount NUMERIC(12,2),
  cheque_no VARCHAR(255),
  cheque_amount NUMERIC(12,2),
  cheque_file VARCHAR(500),
  synced_to_sheet BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
