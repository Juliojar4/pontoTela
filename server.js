require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const app = express();
app.set('trust proxy', 1); // atras do Caddy: confia no X-Forwarded-For do 1o hop pra pegar o IP real
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data.sqlite');
const LEGACY_DATA_FILE = path.join(__dirname, 'data.json');
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

// ---------- Banco (SQLite) ----------
const dbIsNew = !fs.existsSync(DB_FILE);
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS screens (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT DEFAULT '',
    createdAt INTEGER NOT NULL,
    lastSeen INTEGER
  );
  CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    originalName TEXT NOT NULL,
    type TEXT NOT NULL,
    advertiser TEXT DEFAULT '',
    createdAt INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS playlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    screenId TEXT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
    mediaId TEXT NOT NULL,
    duration INTEGER NOT NULL DEFAULT 10,
    startDate TEXT,
    endDate TEXT,
    position INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_playlist_screen ON playlist_items(screenId, position);
  CREATE TABLE IF NOT EXISTS impressions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    screenId TEXT NOT NULL,
    mediaId TEXT NOT NULL,
    ts INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_impressions_ts ON impressions(ts);
  CREATE INDEX IF NOT EXISTS idx_impressions_screen ON impressions(screenId);
  CREATE TABLE IF NOT EXISTS counters (
    name TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  );
`);

// Banco criado antes do heartbeat/reload existir nao tem essas colunas ainda.
const hasLastSeen = db.prepare("SELECT 1 FROM pragma_table_info('screens') WHERE name = 'lastSeen'").get();
if (!hasLastSeen) db.exec('ALTER TABLE screens ADD COLUMN lastSeen INTEGER');
const hasReloadAt = db.prepare("SELECT 1 FROM pragma_table_info('screens') WHERE name = 'reloadAt'").get();
if (!hasReloadAt) db.exec('ALTER TABLE screens ADD COLUMN reloadAt INTEGER');
// Codigo curto e numerico da tela (1, 2, 3...) pra URL do player ficar /1, /2 em vez do id hexadecimal.
const hasCode = db.prepare("SELECT 1 FROM pragma_table_info('screens') WHERE name = 'code'").get();
if (!hasCode) {
  db.exec('ALTER TABLE screens ADD COLUMN code INTEGER');
  const setCode = db.prepare('UPDATE screens SET code = ? WHERE id = ?');
  db.prepare('SELECT id FROM screens ORDER BY createdAt').all().forEach((s, ix) => setCode.run(ix + 1, s.id));
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_screens_code ON screens(code)');

// Primeira vez rodando com SQLite: importa o data.json antigo, se existir.
// Se algo der errado no meio do caminho, desfaz e apaga o .sqlite pra tentar de novo do zero
// no proximo restart do pm2, em vez de ficar com um banco pela metade.
if (dbIsNew && fs.existsSync(LEGACY_DATA_FILE)) {
  console.log('Migrando data.json para data.sqlite...');
  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_DATA_FILE, 'utf8'));
    db.exec('BEGIN');
    const insertScreen = db.prepare('INSERT INTO screens (id, name, location, createdAt) VALUES (?, ?, ?, ?)');
    const insertMedia = db.prepare('INSERT INTO media (id, filename, originalName, type, advertiser, createdAt) VALUES (?, ?, ?, ?, ?, ?)');
    const insertItem = db.prepare('INSERT INTO playlist_items (screenId, mediaId, duration, startDate, endDate, position) VALUES (?, ?, ?, ?, ?, ?)');
    const insertImpression = db.prepare('INSERT INTO impressions (screenId, mediaId, ts) VALUES (?, ?, ?)');

    for (const s of legacy.screens || []) insertScreen.run(s.id, s.name, s.location || '', s.createdAt);
    for (const m of legacy.media || []) insertMedia.run(m.id, m.filename, m.originalName, m.type, m.advertiser || '', m.createdAt);
    for (const screenId of Object.keys(legacy.playlists || {})) {
      (legacy.playlists[screenId] || []).forEach((item, ix) => {
        insertItem.run(screenId, item.mediaId, Number(item.duration) || 10, item.startDate || null, item.endDate || null, ix);
      });
    }
    for (const i of legacy.impressions || []) insertImpression.run(i.screenId, i.mediaId, i.ts);
    db.exec('COMMIT');

    fs.renameSync(LEGACY_DATA_FILE, LEGACY_DATA_FILE + '.migrated');
    console.log('Migracao concluida:', (legacy.screens || []).length, 'telas,', (legacy.media || []).length, 'midias,', (legacy.impressions || []).length, 'impressoes.');
  } catch (err) {
    console.error('Falha na migracao de data.json, desfazendo para tentar de novo no proximo restart:', err);
    try { db.exec('ROLLBACK'); } catch {}
    db.close();
    for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) { try { fs.unlinkSync(f); } catch {} }
    throw err;
  }
}

const id = () => crypto.randomBytes(6).toString('hex');
// Codigo sempre crescente: se uma tela for excluida o numero dela nao volta a ser usado,
// senao uma TV antiga apontada pra /2 passaria a exibir a programacao de outro ponto.
function nextScreenCode() {
  const used = db.prepare("SELECT value FROM counters WHERE name = 'screenCode'").get();
  const max = db.prepare('SELECT COALESCE(MAX(code), 0) AS m FROM screens').get().m;
  const next = Math.max(used?.value ?? 0, max) + 1;
  db.prepare("INSERT INTO counters (name, value) VALUES ('screenCode', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value").run(next);
  return next;
}
// O player pode se identificar pelo codigo curto (/1) ou pelo id antigo (?screen=abc123).
function resolveScreenId(key) {
  if (/^\d+$/.test(key)) {
    const row = db.prepare('SELECT id FROM screens WHERE code = ?').get(Number(key));
    return row ? row.id : null;
  }
  return key;
}

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
// Player das TVs: HTML/JS estatico em ES5, sem framework. As caixinhas de TV rodam um
// Android System WebView antigo que nao executa o bundle moderno do Angular (tela preta,
// sem erro), entao o player mora fora do build do frontend de proposito.
const PLAYER_DIR = path.join(__dirname, 'public/tv');
const PLAYER_HTML = path.join(PLAYER_DIR, 'index.html');
app.use('/tv', express.static(PLAYER_DIR));
// URL curta que se digita na TV: /1, /2, /3...
app.get('/:code(\\d+)', (req, res) => {
  if (!resolveScreenId(req.params.code)) return res.status(404).send('Tela nao encontrada');
  res.sendFile(PLAYER_HTML);
});
// Service worker do player Angular antigo: manda desregistrar em vez de 404, senao a
// versao velha continuaria sendo servida do cache nos aparelhos que ja abriram /player/.
const UNREGISTER_SW =
  'self.addEventListener("install",function(){self.skipWaiting()});' +
  'self.addEventListener("activate",function(e){e.waitUntil(self.registration.unregister().then(function(){' +
  'return self.clients.matchAll()}).then(function(cs){cs.forEach(function(c){c.navigate(c.url)})}))});';
for (const p of ['/ngsw-worker.js', '/player/ngsw-worker.js', '/player/safety-worker.js']) {
  app.get(p, (req, res) => res.type('application/javascript').send(UNREGISTER_SW));
}
// Link antigo (/player/?screen=ID) continua valido e cai no player novo.
app.get(['/player', '/player/*'], (req, res) => res.sendFile(PLAYER_HTML));
// Site institucional (estatico) na raiz do dominio. Fica DEPOIS de /admin e /player,
// e como express.static so responde arquivo existente, as rotas de API abaixo seguem intactas.
app.use('/', express.static(path.join(__dirname, 'public/site'), { extensions: ['html'] }));
// Fallback pra roteamento client-side das SPAs (ex: /admin/telas ao dar F5)
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/browser/index.html')));

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.status(401).json({ error: 'nao autenticado' });
}

// ---------- Autenticacao ----------
// Protecao simples contra forca bruta: N tentativas erradas por IP numa janela de tempo.
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map(); // ip -> { count, resetAt }
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) if (now > entry.resetAt) loginAttempts.delete(ip);
}, LOGIN_WINDOW_MS).unref();

app.post('/api/login', (req, res) => {
  const ip = req.ip;
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (entry && now < entry.resetAt && entry.count >= LOGIN_MAX_ATTEMPTS) {
    return res.status(429).json({ error: `muitas tentativas, tente novamente em ${Math.ceil((entry.resetAt - now) / 1000)}s` });
  }

  const { password } = req.body || {};
  if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
    if (entry && now < entry.resetAt) entry.count++;
    else loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return res.status(401).json({ error: 'senha invalida' });
  }
  loginAttempts.delete(ip);
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
app.get('/api/screens', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM screens ORDER BY createdAt').all());
});
app.post('/api/screens', requireAuth, (req, res) => {
  const s = { id: id(), code: nextScreenCode(), name: req.body.name || 'Tela', location: req.body.location || '', createdAt: Date.now() };
  db.prepare('INSERT INTO screens (id, code, name, location, createdAt) VALUES (?, ?, ?, ?, ?)').run(s.id, s.code, s.name, s.location, s.createdAt);
  res.json(s);
});
app.delete('/api/screens/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM playlist_items WHERE screenId = ?').run(req.params.id);
  db.prepare('DELETE FROM screens WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});
// Marca a tela pra recarregar; o player pega isso no proximo heartbeat (ate ~25s).
app.post('/api/screens/:id/reload', requireAuth, (req, res) => {
  db.prepare('UPDATE screens SET reloadAt = ? WHERE id = ?').run(Date.now(), req.params.id);
  res.json({ ok: true });
});

// ---------- Midias ----------
app.get('/api/media', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM media ORDER BY createdAt').all());
});
app.post('/api/media', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'arquivo obrigatorio' });
  const type = req.file.mimetype.startsWith('video') ? 'video' : 'image';
  const m = {
    id: id(), filename: req.file.filename, originalName: req.file.originalname,
    type, advertiser: req.body.advertiser || '', createdAt: Date.now()
  };
  db.prepare('INSERT INTO media (id, filename, originalName, type, advertiser, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
    .run(m.id, m.filename, m.originalName, m.type, m.advertiser, m.createdAt);
  res.json(m);
});
app.delete('/api/media/:id', requireAuth, (req, res) => {
  const m = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id);
  if (m) { try { fs.unlinkSync(path.join(UPLOAD_DIR, m.filename)); } catch {} }
  db.prepare('DELETE FROM playlist_items WHERE mediaId = ?').run(req.params.id);
  db.prepare('DELETE FROM media WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Programacao (playlist por tela) ----------
app.get('/api/playlists/:screenId', requireAuth, (req, res) => {
  const items = db.prepare('SELECT mediaId, duration, startDate, endDate FROM playlist_items WHERE screenId = ? ORDER BY position').all(req.params.screenId);
  res.json(items);
});
app.post('/api/playlists/:screenId', requireAuth, (req, res) => {
  const { mediaId, duration, startDate, endDate } = req.body;
  const { next } = db.prepare('SELECT COALESCE(MAX(position) + 1, 0) AS next FROM playlist_items WHERE screenId = ?').get(req.params.screenId);
  db.prepare('INSERT INTO playlist_items (screenId, mediaId, duration, startDate, endDate, position) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.params.screenId, mediaId, Number(duration) || 10, startDate || null, endDate || null, next);
  res.json({ ok: true });
});
app.put('/api/playlists/:screenId', requireAuth, (req, res) => {
  db.prepare('DELETE FROM playlist_items WHERE screenId = ?').run(req.params.screenId);
  const insert = db.prepare('INSERT INTO playlist_items (screenId, mediaId, duration, startDate, endDate, position) VALUES (?, ?, ?, ?, ?, ?)');
  (req.body.items || []).forEach((item, ix) => {
    insert.run(req.params.screenId, item.mediaId, Number(item.duration) || 10, item.startDate || null, item.endDate || null, ix);
  });
  res.json({ ok: true });
});

// ---------- Feed que o PLAYER consome (ja filtrado por datas de campanha) ----------
app.get('/api/play/:screenId', (req, res) => {
  const screenId = resolveScreenId(req.params.screenId);
  if (!screenId) return res.status(404).json({ error: 'tela nao encontrada', items: [] });
  const today = new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT p.mediaId, p.duration, p.startDate, p.endDate, m.type, m.filename, m.advertiser
    FROM playlist_items p JOIN media m ON m.id = p.mediaId
    WHERE p.screenId = ?
    ORDER BY p.position
  `).all(screenId);
  const items = rows.filter(r => {
    if (r.startDate && today < r.startDate) return false;
    if (r.endDate && today > r.endDate) return false;
    return true;
  }).map(r => ({ mediaId: r.mediaId, type: r.type, url: '/uploads/' + r.filename, duration: r.duration, advertiser: r.advertiser }));
  res.json({ screenId, items });
});

// ---------- Heartbeat (o player avisa que esta vivo, pra tela aparecer online no painel) ----------
app.post('/api/heartbeat/:screenId', (req, res) => {
  const screenId = resolveScreenId(req.params.screenId);
  if (!screenId) return res.status(404).json({ error: 'tela nao encontrada' });
  db.prepare('UPDATE screens SET lastSeen = ? WHERE id = ?').run(Date.now(), screenId);
  const row = db.prepare('SELECT reloadAt FROM screens WHERE id = ?').get(screenId);
  res.json({ ok: true, reloadAt: row?.reloadAt ?? null });
});

// ---------- Impressoes (prova de exibicao pro anunciante) ----------
app.post('/api/impression', (req, res) => {
  const { screenId, mediaId } = req.body || {};
  const resolved = screenId ? resolveScreenId(String(screenId)) : null;
  if (resolved && mediaId) {
    db.prepare('INSERT INTO impressions (screenId, mediaId, ts) VALUES (?, ?, ?)').run(resolved, mediaId, Date.now());
  }
  res.json({ ok: true });
});
app.get('/api/report', requireAuth, (req, res) => {
  const { from, to, screenId } = req.query;
  const fromTs = from ? new Date(from).getTime() : 0;
  const toTs = to ? new Date(to).getTime() + 86400000 : Date.now();
  const rows = screenId
    ? db.prepare(`
        SELECT COALESCE(NULLIF(m.advertiser, ''), m.originalName, 'desconhecido') AS advertiser, COUNT(*) AS n
        FROM impressions i LEFT JOIN media m ON m.id = i.mediaId
        WHERE i.ts >= ? AND i.ts <= ? AND i.screenId = ?
        GROUP BY advertiser
      `).all(fromTs, toTs, screenId)
    : db.prepare(`
        SELECT COALESCE(NULLIF(m.advertiser, ''), m.originalName, 'desconhecido') AS advertiser, COUNT(*) AS n
        FROM impressions i LEFT JOIN media m ON m.id = i.mediaId
        WHERE i.ts >= ? AND i.ts <= ?
        GROUP BY advertiser
      `).all(fromTs, toTs);
  const byAdv = {};
  let total = 0;
  for (const r of rows) { byAdv[r.advertiser] = r.n; total += r.n; }
  res.json({ total, byAdvertiser: byAdv });
});

app.listen(PORT, () => {
  console.log('CMS no ar: http://localhost:' + PORT);
  console.log('Painel:     http://localhost:' + PORT + '/admin/');
});
