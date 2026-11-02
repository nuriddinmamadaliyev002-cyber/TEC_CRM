// Fon vazifalari
const pool = require('./db');
const { todayISO } = require('./util');

// Boshlanish sanasi kelgan (yoki o'tgan) «Ochiq» guruhlar avtomatik «Boshlangan» bo'ladi. Teskari yo'nalishda hech narsa o'zgarmaydi.
async function autoStartGroups() {
  const r = await pool.query("UPDATE guruhlar SET holat='boshlangan' WHERE holat='ochiq' AND boshlanish IS NOT NULL AND boshlanish <= $1::date", [todayISO()]);
  if (r.rowCount) console.log(`▶️ ${r.rowCount} ta guruh «Boshlangan» holatiga o'tdi`);
  return r.rowCount;
}
function start() {
  const run = () => autoStartGroups().catch(e => console.error('autoStartGroups:', e.message));
  run();
  setInterval(run, 10 * 60 * 1000).unref();
}
module.exports = { autoStartGroups, start };
