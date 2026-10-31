const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'today_edu',
  user:     process.env.DB_USER     || 'today_edu_user',
  password: process.env.DB_PASSWORD || '',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
});
pool.on('error', e => console.error('PostgreSQL pool xatolik:', e.message));
module.exports = pool;
