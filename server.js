const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

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
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '365d' }));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, id() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

// ---------- Telas ----------
app.get('/api/screens', (req, res) => res.json(db.screens));
app.post('/api/screens', (req, res) => {
  const s = { id: id(), name: req.body.name || 'Tela', location: req.body.location || '', createdAt: Date.now() };
  db.screens.push(s);
  if (!db.playlists[s.id]) db.playlists[s.id] = [];
  saveData();
  res.json(s);
});
app.delete('/api/screens/:id', (req, res) => {
  db.screens = db.screens.filter(s => s.id !== req.params.id);
  delete db.playlists[req.params.id];
  saveData();
  res.json({ ok: true });
});

// ---------- Midias ----------
app.get('/api/media', (req, res) => res.json(db.media));
app.post('/api/media', upload.single('file'), (req, res) => {
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
app.delete('/api/media/:id', (req, res) => {
  const m = db.media.find(x => x.id === req.params.id);
  if (m) { try { fs.unlinkSync(path.join(UPLOAD_DIR, m.filename)); } catch {} }
  db.media = db.media.filter(x => x.id !== req.params.id);
  for (const k in db.playlists) db.playlists[k] = db.playlists[k].filter(i => i.mediaId !== req.params.id);
  saveData();
  res.json({ ok: true });
});

// ---------- Programacao (playlist por tela) ----------
app.get('/api/playlists/:screenId', (req, res) => res.json(db.playlists[req.params.screenId] || []));
app.post('/api/playlists/:screenId', (req, res) => {
  const { mediaId, duration, startDate, endDate } = req.body;
  if (!db.playlists[req.params.screenId]) db.playlists[req.params.screenId] = [];
  db.playlists[req.params.screenId].push({
    mediaId, duration: Number(duration) || 10,
    startDate: startDate || null, endDate: endDate || null
  });
  saveData();
  res.json({ ok: true });
});
app.put('/api/playlists/:screenId', (req, res) => {
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
app.get('/api/report', (req, res) => {
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
  console.log('Painel:     http://localhost:' + PORT + '/admin.html');
});
