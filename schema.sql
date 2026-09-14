-- Run this once in your PostgreSQL server (via pgAdmin or psql) to set up the database.
-- First create the database itself (e.g. in pgAdmin: right-click "Databases" -> Create -> Database... -> name it order_entry)
-- Then run the statement below while connected to that "order_entry" database.

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  party_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  sales_person VARCHAR(255) NOT NULL,
  remarks TEXT,
  synced_to_sheet BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
