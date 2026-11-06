require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const QRCode = require('qrcode');
const { generateSecret, verifyTotp, otpauthUri, encryptSecret, decryptSecret } = require('./lib/totp');
const google = require('./lib/google');

// Sem estas variaveis o login nao funciona (e a senha antiga nao existe mais): nao sobe.
const REQUIRED_ENV = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'ADMIN_EMAIL', 'TOTP_ENCRYPTION_KEY'];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length) {
  console.error('ERRO: variaveis de ambiente obrigatorias ausentes: ' + missingEnv.join(', ') + '. Veja o .env.example.');
  process.exit(1);
}
if (!/^[0-9a-fA-F]{64}$/.test(process.env.TOTP_ENCRYPTION_KEY)) {
  console.error('ERRO: TOTP_ENCRYPTION_KEY deve ter 64 caracteres hexadecimais (openssl rand -hex 32).');
  process.exit(1);
}
const TOTP_KEY = process.env.TOTP_ENCRYPTION_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL.trim().toLowerCase();

const app = express();
app.set('trust proxy', 1); // atras do Caddy: confia no X-Forwarded-For do 1o hop pra pegar o IP real
const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data.sqlite');
const LEGACY_DATA_FILE = path.join(__dirname, 'data.json');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

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
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL,
    googleSub TEXT,
    totpSecret TEXT,
    totpEnabledAt INTEGER,
    totpLastStep INTEGER,
    authEpoch INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL
  );
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
// O admin nasce (ou e promovido) a partir de ADMIN_EMAIL a cada subida.
db.prepare("INSERT INTO users (id, email, role, createdAt) VALUES (?, ?, 'admin', ?) ON CONFLICT(email) DO UPDATE SET role = 'admin'")
  .run(crypto.randomBytes(6).toString('hex'), ADMIN_EMAIL, Date.now());
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

// ---------- SEO: host canonico + controle de indexacao ----------
// O dominio canonico e https://pontotela.com.br (sem www). Servir o mesmo site
// em dois hosts divide os sinais entre duas URLs e e justamente o que trava a
// busca por marca "pontotela". 301 permanente concentra tudo num endereco so.
const CANONICAL_HOST = process.env.CANONICAL_HOST || 'pontotela.com.br';
app.use((req, res, next) => {
  const host = (req.headers.host || '').toLowerCase();
  if (host === 'www.' + CANONICAL_HOST) {
    return res.redirect(301, 'https://' + CANONICAL_HOST + req.originalUrl);
  }
  next();
});
// Painel, player, galerias e uploads sao ferramentas, nao conteudo de busca.
// O robots.txt ja pede pra nao rastrear; o header garante que nada disso entre
// no indice mesmo se for descoberto por link externo (robots.txt nao desindexa).
const NO_INDEX_PREFIXES = ['/admin', '/tv', '/player', '/g', '/uploads', '/api', '/entrar', '/auth', '/minhatela'];
app.use((req, res, next) => {
  const p = req.path;
  const isScreenShortUrl = /^\/\d+(\/|$)/.test(p);
  if (isScreenShortUrl || NO_INDEX_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix + '/'))) {
    res.set('X-Robots-Tag', 'noindex, nofollow');
  }
  next();
});

app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  name: 'dooh.sid',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto', maxAge: 30 * 24 * 60 * 60 * 1000 }
}));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '365d' }));
app.use('/admin', express.static(path.join(__dirname, 'public/admin/browser')));
// Player das TVs: HTML/JS estatico em ES5, sem framework. As caixinhas de TV rodam um
// Android System WebView antigo que nao executa o bundle moderno do Angular (tela preta,
// sem erro), entao o player mora fora do build do frontend de proposito.
const PLAYER_DIR = path.join(__dirname, 'public/tv');
const PLAYER_HTML = path.join(PLAYER_DIR, 'index.html');
app.use('/tv', express.static(PLAYER_DIR));
// Galeria publica do ponto: e pra ca que aponta o QR code de cada tela. HTML/JS puro
// (sem build) porque abre no celular de quem passa no ponto comercial.
const GALLERY_DIR = path.join(__dirname, 'public/gallery');
app.use('/g', express.static(GALLERY_DIR));
app.get('/g/:code(\\d+)', (req, res) => {
  if (!resolveScreenId(req.params.code)) return res.status(404).send('Tela nao encontrada');
  res.sendFile(path.join(GALLERY_DIR, 'index.html'));
});
// URL curta que se digita na TV: /1, /2, /3...
app.get('/:code(\\d+)', (req, res) => {
  if (!resolveScreenId(req.params.code)) return res.status(404).send('Tela nao encontrada');
  res.sendFile(PLAYER_HTML);
});
// Manifest por tela: com ele o player pode ser instalado na tela inicial do Android
// (Chrome > menu > "Adicionar a tela inicial") e abrir em tela cheia, sem barra de endereco.
// Precisa ser gerado por tela porque o start_url tem que apontar pra /1, /2...
app.get('/:code(\\d+)/manifest.webmanifest', (req, res) => {
  const code = req.params.code;
  if (!resolveScreenId(code)) return res.status(404).json({ error: 'tela nao encontrada' });
  const row = db.prepare('SELECT name FROM screens WHERE code = ?').get(Number(code));
  res.type('application/manifest+json').json({
    name: 'Player ' + code + (row?.name ? ' - ' + row.name : ''),
    short_name: 'Tela ' + code,
    start_url: '/' + code,
    scope: '/',
    display: 'fullscreen',
    orientation: 'landscape',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [72, 96, 128, 144, 152, 192, 384, 512].map(size => ({
      src: '/tv/icons/icon-' + size + 'x' + size + '.png',
      sizes: size + 'x' + size,
      type: 'image/png',
      purpose: 'any'
    }))
  });
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
app.use('/', express.static(path.join(__dirname, 'public/site'), {
  extensions: ['html'],
  // CSS/JS/imagens do site podem ficar em cache; o HTML nao, senao uma correcao
  // de texto ou de SEO demora dias pra chegar em quem ja visitou.
  maxAge: '7d',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html') || filePath.endsWith('robots.txt') || filePath.endsWith('sitemap.xml') || filePath.endsWith('llms.txt')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
  }
}));
// Fallback pra roteamento client-side das SPAs (ex: /admin/telas ao dar F5)
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/browser/index.html')));

// ---------- Autenticacao: Google + Authenticator ----------
// Tres estados na sessao, nunca misturados (regenerate a cada etapa):
//   oauth   { state, nonce }        entre /auth/google e o callback
//   pending { userId, enrollSecret? } Google ok, falta o codigo: so /api/auth/* enxerga
//   user    { id, role, authEpoch }   logado de verdade
const regenerate = (req, data) => new Promise((resolve, reject) =>
  req.session.regenerate(err => { if (err) return reject(err); Object.assign(req.session, data); resolve(); }));

// Guardas releem o usuario a cada pedido: reset de 2FA (authEpoch) ou exclusao derrubam a sessao na hora.
function sessionUser(req) {
  const s = req.session && req.session.user;
  if (!s) return null;
  const u = db.prepare('SELECT id, email, role, authEpoch FROM users WHERE id = ?').get(s.id);
  return u && u.authEpoch === s.authEpoch ? u : null;
}
const requireRole = role => (req, res, next) => {
  const u = sessionUser(req);
  if (!u) return res.status(401).json({ error: 'nao autenticado' });
  if (u.role !== role) return res.status(403).json({ error: 'sem permissao' });
  req.user = u;
  next();
};
const requireAdmin = requireRole('admin');
const homeFor = u => (u.role === 'admin' ? '/admin/' : '/minhatela');
// Express 4 nao captura rejeicao de handler async: sem isso um erro derrubaria o processo.
const safe = fn => (req, res, next) => fn(req, res, next).catch(next);
const requireOwner = requireRole('owner'); // usado pelas rotas da /minhatela

// Limite de erros de codigo: 5 em 5 minutos, por conta (u:<id>) e por IP (ip:<ip>).
const CODE_WINDOW_MS = 5 * 60 * 1000;
const CODE_MAX_FAILS = 5;
const codeFails = new Map(); // chave -> { count, resetAt }
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of codeFails) if (now > e.resetAt) codeFails.delete(k);
}, CODE_WINDOW_MS).unref();
const isBlocked = keys => keys.some(k => { const e = codeFails.get(k); return e && Date.now() < e.resetAt && e.count >= CODE_MAX_FAILS; });
function recordFail(keys) {
  const now = Date.now();
  for (const k of keys) {
    const e = codeFails.get(k);
    if (e && now < e.resetAt) e.count++;
    else codeFails.set(k, { count: 1, resetAt: now + CODE_WINDOW_MS });
  }
}

app.get('/entrar', (req, res) => res.sendFile(path.join(__dirname, 'public/minhatela/entrar.html')));
app.use('/minhatela/assets', express.static(path.join(__dirname, 'public/minhatela')));

app.get('/auth/google', (req, res) => {
  const oauth = { state: crypto.randomBytes(16).toString('hex'), nonce: crypto.randomBytes(16).toString('hex') };
  req.session.oauth = oauth;
  res.redirect(google.authUrl(oauth));
});

app.get('/auth/google/callback', safe(async (req, res) => {
  const oauth = req.session.oauth;
  delete req.session.oauth;
  const { code, state, error } = req.query;
  if (error || !oauth || typeof code !== 'string' || typeof state !== 'string' || state !== oauth.state) {
    return res.redirect('/entrar?erro=google');
  }
  let claims;
  try { claims = await google.exchangeCode(code, oauth.nonce); }
  catch (err) { console.error('Login Google falhou:', err.message); return res.redirect('/entrar?erro=google'); }

  const email = claims.email.toLowerCase();
  let user = db.prepare('SELECT * FROM users WHERE googleSub = ?').get(claims.sub);
  if (!user) {
    // Primeiro login: amarra o sub ao e-mail cadastrado. So amarra se ainda nao tem sub.
    const byEmail = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (byEmail && byEmail.googleSub === null) {
      db.prepare('UPDATE users SET googleSub = ? WHERE id = ? AND googleSub IS NULL').run(claims.sub, byEmail.id);
      user = byEmail;
    }
  }
  if (!user) return res.redirect('/entrar?erro=nao-cadastrado');
  await regenerate(req, { pending: { userId: user.id } });
  res.redirect('/entrar');
}));

app.get('/api/auth/state', safe(async (req, res) => {
  const me = sessionUser(req);
  if (me) return res.json({ step: 'done', redirect: homeFor(me) });
  const pending = req.session.pending;
  const user = pending && db.prepare('SELECT id, totpEnabledAt FROM users WHERE id = ?').get(pending.userId);
  if (!user) return res.json({ step: 'google' });
  if (user.totpEnabledAt) return res.json({ step: 'code' });
  // Segredo novo so vive na sessao; so vai pro banco quando o codigo for confirmado.
  pending.enrollSecret = pending.enrollSecret || generateSecret();
  const email = db.prepare('SELECT email FROM users WHERE id = ?').get(user.id).email;
  res.json({ step: 'enroll', secret: pending.enrollSecret, qr: await QRCode.toDataURL(otpauthUri(pending.enrollSecret, email)) });
}));

app.post('/api/auth/verify', safe(async (req, res) => {
  const pending = req.session.pending;
  const user = pending && db.prepare('SELECT * FROM users WHERE id = ?').get(pending.userId);
  if (!user) return res.status(401).json({ error: 'entre com o Google primeiro' });
  const keys = ['u:' + user.id, 'ip:' + req.ip];
  if (isBlocked(keys)) return res.status(429).json({ error: 'muitas tentativas, tente de novo em alguns minutos' });

  const code = String((req.body || {}).code ?? '').trim();
  const now = Date.now();
  let ok = false;
  if (user.totpEnabledAt) {
    const step = verifyTotp(decryptSecret(user.totpSecret, TOTP_KEY), code, now, user.totpLastStep);
    // O UPDATE condicional garante que dois pedidos simultaneos nao usem o mesmo codigo.
    ok = step !== null && db.prepare('UPDATE users SET totpLastStep = ? WHERE id = ? AND (totpLastStep IS NULL OR totpLastStep < ?)').run(step, user.id, step).changes === 1;
  } else if (pending.enrollSecret) {
    const step = verifyTotp(pending.enrollSecret, code, now, null);
    ok = step !== null && db.prepare('UPDATE users SET totpSecret = ?, totpEnabledAt = ?, totpLastStep = ? WHERE id = ? AND totpEnabledAt IS NULL')
      .run(encryptSecret(pending.enrollSecret, TOTP_KEY), now, step, user.id).changes === 1;
  }
  if (!ok) {
    recordFail(keys);
    return res.status(401).json({ error: 'codigo invalido' });
  }
  await regenerate(req, { user: { id: user.id, role: user.role, authEpoch: user.authEpoch } });
  res.json({ redirect: homeFor(user) });
}));

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});
// So o admin com sessao completa e "autenticado" pro painel Angular.
app.get('/api/me', (req, res) => {
  const u = sessionUser(req);
  res.json({ authenticated: !!u && u.role === 'admin' });
});

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, id() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

// ---------- Telas ----------
app.get('/api/screens', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM screens ORDER BY createdAt').all());
});
app.post('/api/screens', requireAdmin, (req, res) => {
  const s = { id: id(), code: nextScreenCode(), name: req.body.name || 'Tela', location: req.body.location || '', createdAt: Date.now() };
  db.prepare('INSERT INTO screens (id, code, name, location, createdAt) VALUES (?, ?, ?, ?, ?)').run(s.id, s.code, s.name, s.location, s.createdAt);
  res.json(s);
});
app.delete('/api/screens/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM playlist_items WHERE screenId = ?').run(req.params.id);
  db.prepare('DELETE FROM screens WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});
// Marca a tela pra recarregar; o player pega isso no proximo heartbeat (ate ~25s).
app.post('/api/screens/:id/reload', requireAdmin, (req, res) => {
  db.prepare('UPDATE screens SET reloadAt = ? WHERE id = ?').run(Date.now(), req.params.id);
  res.json({ ok: true });
});

// ---------- Midias ----------
app.get('/api/media', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM media ORDER BY createdAt').all());
});
app.post('/api/media', requireAdmin, upload.single('file'), (req, res) => {
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
app.delete('/api/media/:id', requireAdmin, (req, res) => {
  const m = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id);
  if (m) { try { fs.unlinkSync(path.join(UPLOAD_DIR, m.filename)); } catch {} }
  db.prepare('DELETE FROM playlist_items WHERE mediaId = ?').run(req.params.id);
  db.prepare('DELETE FROM media WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Programacao (playlist por tela) ----------
app.get('/api/playlists/:screenId', requireAdmin, (req, res) => {
  const items = db.prepare('SELECT mediaId, duration, startDate, endDate FROM playlist_items WHERE screenId = ? ORDER BY position').all(req.params.screenId);
  res.json(items);
});
app.post('/api/playlists/:screenId', requireAdmin, (req, res) => {
  const { mediaId, duration, startDate, endDate } = req.body;
  const { next } = db.prepare('SELECT COALESCE(MAX(position) + 1, 0) AS next FROM playlist_items WHERE screenId = ?').get(req.params.screenId);
  db.prepare('INSERT INTO playlist_items (screenId, mediaId, duration, startDate, endDate, position) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.params.screenId, mediaId, Number(duration) || 10, startDate || null, endDate || null, next);
  res.json({ ok: true });
});
app.put('/api/playlists/:screenId', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM playlist_items WHERE screenId = ?').run(req.params.screenId);
  const insert = db.prepare('INSERT INTO playlist_items (screenId, mediaId, duration, startDate, endDate, position) VALUES (?, ?, ?, ?, ?, ?)');
  (req.body.items || []).forEach((item, ix) => {
    insert.run(req.params.screenId, item.mediaId, Number(item.duration) || 10, item.startDate || null, item.endDate || null, ix);
  });
  res.json({ ok: true });
});

// ---------- Feed que o PLAYER consome (ja filtrado por datas de campanha) ----------
// Midias da tela que estao no ar HOJE (respeita as datas de campanha). Usada pelo player
// e pela galeria publica do QR, pra regra de campanha viver num lugar so.
function activeItems(screenId) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT p.mediaId, p.duration, p.startDate, p.endDate, m.type, m.filename, m.advertiser
    FROM playlist_items p JOIN media m ON m.id = p.mediaId
    WHERE p.screenId = ?
    ORDER BY p.position
  `).all(screenId);
  return rows.filter(r => {
    if (r.startDate && today < r.startDate) return false;
    if (r.endDate && today > r.endDate) return false;
    return true;
  }).map(r => ({ mediaId: r.mediaId, type: r.type, url: '/uploads/' + r.filename, duration: r.duration, advertiser: r.advertiser }));
}

app.get('/api/play/:screenId', (req, res) => {
  const screenId = resolveScreenId(req.params.screenId);
  if (!screenId) return res.status(404).json({ error: 'tela nao encontrada', items: [] });
  res.json({ screenId, items: activeItems(screenId) });
});

// Feed da GALERIA publica (o que o QR da tela abre). Mesmo conteudo do player, sem duracao
// mandando no ritmo: quem escaneia avanca e volta na mao.
app.get('/api/gallery/:code', (req, res) => {
  const screenId = resolveScreenId(req.params.code);
  if (!screenId) return res.status(404).json({ error: 'tela nao encontrada', items: [] });
  const row = db.prepare('SELECT code, name, location FROM screens WHERE id = ?').get(screenId);
  res.json({ code: row.code, name: row.name, location: row.location, items: activeItems(screenId) });
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
app.get('/api/report', requireAdmin, (req, res) => {
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

if (require.main === module) app.listen(PORT, () => {
  console.log('CMS no ar: http://localhost:' + PORT);
  console.log('Painel:     http://localhost:' + PORT + '/admin/');
});

module.exports = { app, db };
