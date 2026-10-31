// Ishlatish: npm run hash -- "parol"   → SUPERADMIN_PASSWORD_HASH uchun qiymat
const bcrypt = require('bcryptjs');
const pw = process.argv[2];
if (!pw || pw.length < 8) { console.error('Parol kamida 8 belgi bo\'lsin:  npm run hash -- "parol"'); process.exit(1); }
bcrypt.hash(pw, 12).then(h => console.log(h));
