const { Pool } = require('pg');

// Neon (cloud) is the primary database. This is what powers the live app.
const neonPool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Local PostgreSQL: only reachable on your own computer.
// Writing to it is best-effort; if it is unavailable (e.g. on Vercel) it is skipped.
const localPool = process.env.LOCAL_DB_HOST
  ? new Pool({
      host: process.env.LOCAL_DB_HOST,
      port: process.env.LOCAL_DB_PORT || 5432,
      user: process.env.LOCAL_DB_USER,
      password: process.env.LOCAL_DB_PASSWORD,
      database: process.env.LOCAL_DB_NAME,
      ssl: false
    })
  : null;

module.exports = { neonPool, localPool };
