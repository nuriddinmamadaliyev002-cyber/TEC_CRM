// schema.sql ni bazaga qo'llaydi (qayta ishga tushirish xavfsiz — IF NOT EXISTS)
require('dotenv').config();
const fs = require('fs'), path = require('path');
const pool = require('../src/db');
(async () => {
  try {
    await pool.query(fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8'));
    console.log('✅ Baza sxemasi tayyor');
  } catch (e) { console.error('❌', e.message); process.exitCode = 1; }
  finally { await pool.end(); }
})();
