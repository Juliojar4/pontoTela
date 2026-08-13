require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

if (!ADMIN_PASSWORD) {
  console.warn('AVISO: ADMIN_PASSWORD nao definida. Defina essa variavel de ambiente para proteger o painel.');
}
if (!process.env.SESSION_SECRET) {
  console.warn('AVISO: SESSION_SECRET nao definida. Sessoes serao invalidadas a cada reinicio do processo.');
}

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { screens: [], media: [], playlists: {}, impressions: [] }; }
}
function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
let db = loadData();

// Impressoes chegam a cada poucos segundos por tela. Em vez de gravar em disco
// a cada impressao, marcamos "dirty" e gravamos em lote a cada 5s.
let dirty = false;
setInterval(() => { if (dirty) { saveData(); dirty = false; } }, 5000);

const id = () => crypto.randomBytes(6).toString('hex');

app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  name: 'dooh.sid',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 }
}));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '365d' }));
app.use('/admin', express.static(path.join(__dirname, 'public/admin/browser')));
app.use('/player', express.static(path.join(__dirname, 'public/player/browser')));
app.get('/', (req, res) => res.redirect('/admin/'));
// Fallback pra roteamento client-side das SPAs (ex: /admin/telas ao dar F5)
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/browser/index.html')));
app.get('/player/*', (req, res) => res.sendFile(path.join(__dirname, 'public/player/browser/index.html')));

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.status(401).json({ error: 'nao autenticado' });
}

// ---------- Autenticacao ----------
app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'senha invalida' });
  }
  req.session.authenticated = true;
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});
app.get('/api/me', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, id() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

// ---------- Telas ----------
app.get('/api/screens', requireAuth, (req, res) => res.json(db.screens));
app.post('/api/screens', requireAuth, (req, res) => {
  const s = { id: id(), name: req.body.name || 'Tela', location: req.body.location || '', createdAt: Date.now() };
  db.screens.push(s);
  if (!db.playlists[s.id]) db.playlists[s.id] = [];
  saveData();
  res.json(s);
});
app.delete('/api/screens/:id', requireAuth, (req, res) => {
  db.screens = db.screens.filter(s => s.id !== req.params.id);
  delete db.playlists[req.params.id];
  saveData();
  res.json({ ok: true });
});

// ---------- Midias ----------
app.get('/api/media', requireAuth, (req, res) => res.json(db.media));
app.post('/api/media', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'arquivo obrigatorio' });
  const type = req.file.mimetype.startsWith('video') ? 'video' : 'image';
  const m = {
    id: id(), filename: req.file.filename, originalName: req.file.originalname,
    type, advertiser: req.body.advertiser || '', createdAt: Date.now()
  };
  db.media.push(m);
  saveData();
  res.json(m);
});
app.delete('/api/media/:id', requireAuth, (req, res) => {
  const m = db.media.find(x => x.id === req.params.id);
  if (m) { try { fs.unlinkSync(path.join(UPLOAD_DIR, m.filename)); } catch {} }
  db.media = db.media.filter(x => x.id !== req.params.id);
  for (const k in db.playlists) db.playlists[k] = db.playlists[k].filter(i => i.mediaId !== req.params.id);
  saveData();
  res.json({ ok: true });
});

// ---------- Programacao (playlist por tela) ----------
app.get('/api/playlists/:screenId', requireAuth, (req, res) => res.json(db.playlists[req.params.screenId] || []));
app.post('/api/playlists/:screenId', requireAuth, (req, res) => {
  const { mediaId, duration, startDate, endDate } = req.body;
  if (!db.playlists[req.params.screenId]) db.playlists[req.params.screenId] = [];
  db.playlists[req.params.screenId].push({
    mediaId, duration: Number(duration) || 10,
    startDate: startDate || null, endDate: endDate || null
  });
  saveData();
  res.json({ ok: true });
});
app.put('/api/playlists/:screenId', requireAuth, (req, res) => {
  db.playlists[req.params.screenId] = req.body.items || [];
  saveData();
  res.json({ ok: true });
});

// ---------- Feed que o PLAYER consome (ja filtrado por datas de campanha) ----------
app.get('/api/play/:screenId', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const items = (db.playlists[req.params.screenId] || []).filter(i => {
    if (i.startDate && today < i.startDate) return false;
    if (i.endDate && today > i.endDate) return false;
    return true;
  }).map(i => {
    const m = db.media.find(x => x.id === i.mediaId);
    if (!m) return null;
    return { mediaId: m.id, type: m.type, url: '/uploads/' + m.filename, duration: i.duration, advertiser: m.advertiser };
  }).filter(Boolean);
  res.json({ screenId: req.params.screenId, items });
});

// ---------- Impressoes (prova de exibicao pro anunciante) ----------
app.post('/api/impression', (req, res) => {
  const { screenId, mediaId } = req.body || {};
  if (screenId && mediaId) { db.impressions.push({ screenId, mediaId, ts: Date.now() }); dirty = true; }
  res.json({ ok: true });
});
app.get('/api/report', requireAuth, (req, res) => {
  const { from, to, screenId } = req.query;
  const fromTs = from ? new Date(from).getTime() : 0;
  const toTs = to ? new Date(to).getTime() + 86400000 : Date.now();
  let imps = db.impressions.filter(i => i.ts >= fromTs && i.ts <= toTs);
  if (screenId) imps = imps.filter(i => i.screenId === screenId);
  const byAdv = {};
  for (const i of imps) {
    const m = db.media.find(x => x.id === i.mediaId);
    const adv = m ? (m.advertiser || m.originalName) : 'desconhecido';
    byAdv[adv] = (byAdv[adv] || 0) + 1;
  }
  res.json({ total: imps.length, byAdvertiser: byAdv });
});

app.listen(PORT, () => {
  console.log('CMS no ar: http://localhost:' + PORT);
  console.log('Painel:     http://localhost:' + PORT + '/admin/');
});
