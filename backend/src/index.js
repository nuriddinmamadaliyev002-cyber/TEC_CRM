require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const path    = require('path');
const pool    = require('./db');
require('./middleware/jwt'); // JWT_SECRET tekshiruvi

const app  = express();
const PORT = process.env.PORT || 3010;
const HOST = process.env.HOST || '127.0.0.1';

app.set('trust proxy', 1); // nginx ortida: req.ip haqiqiy mijoz IP'si bo'lsin
app.use(helmet({ contentSecurityPolicy: false }));

const origins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => (!origin || origins.includes(origin)) ? cb(null, true) : cb(null, false),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Filial-Id', 'X-Bot-Secret'],
}));
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth',         require('./routes/auth'));
app.use('/api/filiallar',    require('./routes/filiallar'));
app.use('/api/kurs-adminlar', require('./routes/kursAdminlar'));
app.use('/api/rahbar',        require('./routes/rahbar')); // rahbar (superadmin): barcha filiallar bo'yicha jamlama — panel routeridan OLDIN
// DIQQAT: bot routeri panel routeridan OLDIN turishi shart — panel '/api' ga ulangan va panelAuth
// barcha /api/* so'rovlarni ushlaydi (botning X-Bot-Secret'i u yerda 401 olardi).
app.use('/api/bot',          require('./routes/bot'));
app.use('/api',              require('./routes/panel'));

// Web panel (nginx bo'lmasa ham ishlashi uchun)
// HTML/JS/CSS: har safar yangilanganini tekshirsin (ETag → o'zgarmagan bo'lsa 304). Aks holda Cloudflare/brauzer eski fayllarni soatlab ushlab turadi.
app.use(express.static(process.env.WEB_DIR || path.join(__dirname, '../../web'), {
  setHeaders: (res, file) => { if (/\.(html|js|css)$/i.test(file)) res.setHeader('Cache-Control', 'no-cache'); },
}));

app.use('/api', (req, res) => res.status(404).json({ ok: false, error: `Topilmadi: ${req.method} ${req.path}` }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: "Noto'g'ri JSON" });
  if (err.code === '22P02') return res.status(400).json({ ok: false, error: "Noto'g'ri identifikator" });
  console.error('Server xatoligi:', err.message);
  res.status(500).json({ ok: false, error: 'Server xatoligi' });
});

app.listen(PORT, HOST, async () => {
  console.log(`✅ Today Education Centre API: http://${HOST}:${PORT}`);
  try { await pool.query('SELECT NOW()'); console.log('✅ PostgreSQL OK'); require('./jobs').start(); }
  catch (e) { console.error('❌ PostgreSQL xatolik:', e.message); }
});
