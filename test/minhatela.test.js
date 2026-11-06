// Env de teste ANTES de qualquer require do server.js (ele valida as variaveis ao carregar).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'minhatela-'));
Object.assign(process.env, {
  DB_FILE: path.join(TMP, 'test.sqlite'),
  UPLOAD_DIR: path.join(TMP, 'uploads'),
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost/auth/google/callback',
  ADMIN_EMAIL: 'admin@x.com',
  TOTP_ENCRYPTION_KEY: 'ab'.repeat(32),
  SESSION_SECRET: 'test-session-secret',
});

const { test, after } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const { codeAt, generateSecret, verifyTotp, otpauthUri, encryptSecret, decryptSecret } = require('../lib/totp');

// base32 de "12345678901234567890" (vetor RFC 6238)
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('vetor RFC 6238 aceita 287082 e devolve a janela 1', () => {
  assert.strictEqual(verifyTotp(RFC_SECRET, '287082', 59000, null), 1);
});

test('aceita +-1 janela e recusa +-2', () => {
  assert.strictEqual(verifyTotp(RFC_SECRET, '287082', 59000 + 30000, null), 1);
  assert.strictEqual(verifyTotp(RFC_SECRET, '287082', 59000 - 30000, null), 1);
  assert.strictEqual(verifyTotp(RFC_SECRET, '287082', 59000 + 60000, null), null);
  assert.strictEqual(verifyTotp(RFC_SECRET, '287082', 59000 - 60000, null), null);
});

test('nao reaproveita codigo ja usado', () => {
  assert.strictEqual(verifyTotp(RFC_SECRET, '287082', 59000, 1), null);
});

test('segredo gerado e uri otpauth', () => {
  const s = generateSecret();
  assert.match(s, /^[A-Z2-7]{32}$/);
  const u = otpauthUri(s, 'a@b.com');
  assert.ok(u.startsWith('otpauth://totp/PontoTela:a%40b.com?'));
  assert.ok(u.includes('secret=' + s) && u.includes('issuer=PontoTela'));
});

test('cifrar e decifrar', () => {
  const key = 'ab'.repeat(32);
  const a = encryptSecret('segredo', key);
  assert.strictEqual(decryptSecret(a, key), 'segredo');
  assert.notStrictEqual(a, encryptSecret('segredo', key));
  const buf = Buffer.from(a, 'base64');
  buf[buf.length - 1] ^= 1;
  assert.throws(() => decryptSecret(buf.toString('base64'), key));
});

// ---------- Login Google + Authenticator ----------
const { app, db } = require('../server');

const server = app.listen(0);
const BASE = 'http://127.0.0.1:' + server.address().port;
const realFetch = globalThis.fetch;
let nextIdToken = null;
// So a URL de token do Google e simulada; o resto (nosso proprio servidor) usa o fetch de verdade.
globalThis.fetch = (url, opts) => String(url).startsWith('https://oauth2.googleapis.com/token')
  ? Promise.resolve(new Response(JSON.stringify({ id_token: nextIdToken }), { headers: { 'content-type': 'application/json' } }))
  : realFetch(url, opts);
after(() => { globalThis.fetch = realFetch; server.close(); db.close(); fs.rmSync(TMP, { recursive: true, force: true }); });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims) => b64({ alg: 'none' }) + '.' + b64(claims) + '.sig';
let ipSeq = 0;
const secrets = {}; // email -> segredo TOTP mostrado no cadastro

// Cliente com jar de cookies manual e IP proprio (X-Forwarded-For), pra o limite por IP nao vazar entre testes.
function newClient() {
  const jar = new Map();
  const ip = '10.0.0.' + (++ipSeq);
  return {
    async req(url, { method = 'GET', body } = {}) {
      const res = await realFetch(BASE + url, {
        method, redirect: 'manual', body: body && JSON.stringify(body),
        headers: { 'x-forwarded-for': ip, cookie: [...jar].map(([k, v]) => k + '=' + v).join('; '), ...(body && { 'content-type': 'application/json' }) },
      });
      for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
      return res;
    },
    async json(url, opts) { const r = await this.req(url, opts); return { status: r.status, ...(await r.json().catch(() => ({}))) }; },
  };
}

async function googleStep(email, { sub = 'sub-' + email.toLowerCase(), c = newClient(), state } = {}) {
  const start = await c.req('/auth/google');
  assert.strictEqual(start.status, 302);
  const u = new URL(start.headers.get('location'));
  assert.strictEqual(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  nextIdToken = jwt({ iss: 'https://accounts.google.com', aud: 'test-client-id', exp: Math.floor(Date.now() / 1000) + 600,
    nonce: u.searchParams.get('nonce'), email, email_verified: true, sub });
  const cb = await c.req('/auth/google/callback?code=abc&state=' + (state ?? u.searchParams.get('state')));
  return { c, location: cb.headers.get('location') };
}
const wrongCode = (secret) => {
  const valid = [-1, 0, 1].map((d) => codeAt(secret, Date.now() + d * 30000));
  return ['000000', '111111', '222222'].find((x) => !valid.includes(x));
};
async function loginAs(email, opts) {
  const { c, location } = await googleStep(email, opts);
  assert.strictEqual(location, '/entrar');
  const st = await c.json('/api/auth/state');
  if (st.step === 'enroll') secrets[email.toLowerCase()] = st.secret;
  const done = await c.json('/api/auth/verify', { method: 'POST', body: { code: codeAt(secrets[email.toLowerCase()], Date.now()) } });
  return { c, st, done };
}
const addUser = (email, role) => db.prepare('INSERT INTO users (id, email, role, createdAt) VALUES (?, ?, ?, ?)').run(email, email, role, Date.now());

test('state errado ou acesso negado voltam com erro=google', async () => {
  const bad = await googleStep('a@x.com', { state: 'errado' });
  assert.strictEqual(bad.location, '/entrar?erro=google');
  const c = newClient();
  const start = await c.req('/auth/google');
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const denied = await c.req('/auth/google/callback?error=access_denied&state=' + state);
  assert.strictEqual(denied.headers.get('location'), '/entrar?erro=google');
});

test('e-mail nao cadastrado e recusado e nao cria usuario', async () => {
  const { location } = await googleStep('intruso@x.com');
  assert.strictEqual(location, '/entrar?erro=nao-cadastrado');
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM users WHERE email = ?').get('intruso@x.com').n, 0);
});

test('Admin@X.com entra na conta admin@x.com; outro sub com o mesmo e-mail e recusado', async () => {
  const { st, done } = await loginAs('Admin@X.com', { sub: 'sub-admin' });
  assert.strictEqual(st.step, 'enroll');
  assert.strictEqual(done.redirect, '/admin/');
  assert.strictEqual(db.prepare('SELECT googleSub FROM users WHERE email = ?').get('admin@x.com').googleSub, 'sub-admin');
  const other = await googleStep('admin@x.com', { sub: 'sub-outro' });
  assert.strictEqual(other.location, '/entrar?erro=nao-cadastrado');
});

test('Google sem codigo: API barrada e /api/me falso', async () => {
  addUser('semcodigo@x.com', 'admin');
  const { c, location } = await googleStep('semcodigo@x.com');
  assert.strictEqual(location, '/entrar');
  assert.strictEqual((await c.json('/api/screens')).status, 401);
  assert.strictEqual((await c.json('/api/me')).authenticated, false);
});

test('cadastro nao confirmado nao grava segredo e o proximo login volta a enroll', async () => {
  addUser('naoconfirma@x.com', 'owner');
  const a = await googleStep('naoconfirma@x.com');
  assert.strictEqual((await a.c.json('/api/auth/state')).step, 'enroll');
  assert.strictEqual(db.prepare('SELECT totpSecret FROM users WHERE email = ?').get('naoconfirma@x.com').totpSecret, null);
  const b = await googleStep('naoconfirma@x.com');
  assert.strictEqual((await b.c.json('/api/auth/state')).step, 'enroll');
});

test('o mesmo codigo nao vale em um segundo login', async () => {
  addUser('reuso@x.com', 'owner');
  const first = await loginAs('reuso@x.com');
  assert.ok(first.done.redirect);
  const { c } = await googleStep('reuso@x.com');
  assert.strictEqual((await c.json('/api/auth/state')).step, 'code');
  const again = await c.json('/api/auth/verify', { method: 'POST', body: { code: codeAt(secrets['reuso@x.com'], Date.now()) } });
  assert.strictEqual(again.status, 401);
});

test('o 6o codigo errado recebe 429, mesmo com o certo depois', async () => {
  addUser('forca@x.com', 'owner');
  const { c } = await googleStep('forca@x.com');
  const { secret } = await c.json('/api/auth/state');
  const bad = { method: 'POST', body: { code: wrongCode(secret) } };
  for (let i = 0; i < 5; i++) assert.strictEqual((await c.json('/api/auth/verify', bad)).status, 401);
  assert.strictEqual((await c.json('/api/auth/verify', bad)).status, 429);
  const good = await c.json('/api/auth/verify', { method: 'POST', body: { code: codeAt(secret, Date.now()) } });
  assert.strictEqual(good.status, 429);
});

test('limite por conta vale mesmo trocando de IP', async () => {
  addUser('conta@x.com', 'owner');
  await loginAs('conta@x.com'); // cadastra
  for (let i = 0; i < 5; i++) {
    const { c } = await googleStep('conta@x.com');
    assert.strictEqual((await c.json('/api/auth/verify', { method: 'POST', body: { code: wrongCode(secrets['conta@x.com']) } })).status, 401);
  }
  const { c } = await googleStep('conta@x.com');
  assert.strictEqual((await c.json('/api/auth/verify', { method: 'POST', body: { code: wrongCode(secrets['conta@x.com']) } })).status, 429);
});

test('dono vai para /minhatela e recebe 403 em rota de admin', async () => {
  addUser('dono@x.com', 'owner');
  const { c, done } = await loginAs('dono@x.com');
  assert.strictEqual(done.redirect, '/minhatela');
  assert.strictEqual((await c.json('/api/screens')).status, 403);
  assert.strictEqual((await c.json('/api/me')).authenticated, false);
});

test('POST /api/login nao existe mais', async () => {
  assert.strictEqual((await newClient().req('/api/login', { method: 'POST', body: { password: 'x' } })).status, 404);
});

test('reset-2fa derruba a sessao aberta e forca novo cadastro', async () => {
  addUser('reset@x.com', 'admin');
  const { c } = await loginAs('reset@x.com');
  assert.strictEqual((await c.json('/api/screens')).status, 200);
  const parked = (await googleStep('reset@x.com')).c; // passou pelo Google e parou no passo do codigo
  assert.strictEqual((await parked.json('/api/auth/state')).step, 'code');
  const r = spawnSync(process.execPath, [path.join(__dirname, '../scripts/reset-2fa.js'), 'Reset@X.com'], { env: { ...process.env }, cwd: TMP, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual((await c.json('/api/screens')).status, 401);
  assert.strictEqual((await parked.json('/api/auth/state')).step, 'google');
  const stale = await parked.json('/api/auth/verify', { method: 'POST', body: { code: codeAt(secrets['reset@x.com'], Date.now()) } });
  assert.strictEqual(stale.status, 401);
  assert.strictEqual((await parked.json('/api/screens')).status, 401);
  const again = await googleStep('reset@x.com');
  assert.strictEqual((await again.c.json('/api/auth/state')).step, 'enroll');
});

test('servidor sem GOOGLE_CLIENT_ID nao sobe e cita a variavel', () => {
  const env = { ...process.env, PORT: '0' };
  delete env.GOOGLE_CLIENT_ID;
  const r = spawnSync(process.execPath, [path.join(__dirname, '../server.js')], { env, cwd: TMP, encoding: 'utf8', timeout: 10000 });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /GOOGLE_CLIENT_ID/);
});

// ---------- Protecao da programacao e impressoes ----------
let adminP;
const admin = async () => (adminP ??= (async () => { addUser('padmin@x.com', 'admin'); return (await loginAs('padmin@x.com')).c; })());
async function setup() {
  const c = await admin();
  const screen = await c.json('/api/screens', { method: 'POST', body: { name: 'T' } });
  const addOwnerMedia = (screenId, name) => {
    const m = { id: 'om' + Math.random().toString(16).slice(2, 8), filename: name + '.png' };
    fs.writeFileSync(path.join(process.env.UPLOAD_DIR, m.filename), 'x');
    db.prepare('INSERT INTO media (id, filename, originalName, type, ownerScreenId, createdAt) VALUES (?, ?, ?, ?, ?, ?)').run(m.id, m.filename, m.filename, 'image', screenId, Date.now());
    db.prepare('INSERT INTO playlist_items (screenId, mediaId, duration, position) VALUES (?, ?, 10, (SELECT COALESCE(MAX(position)+1,0) FROM playlist_items WHERE screenId = ?))').run(screenId, m.id, screenId);
    return m;
  };
  const adMedia = db.prepare('INSERT INTO media (id, filename, originalName, type, createdAt) VALUES (?, ?, ?, ?, ?)');
  const ad = (n) => { adMedia.run(n, n + '.png', n + '.png', 'image', Date.now()); return n; };
  return { c, screen, addOwnerMedia, ad };
}
const put = (c, s, body) => c.json('/api/playlists/' + s.id, { method: 'PUT', body });
const get = (c, s) => c.json('/api/playlists/' + s.id);
const count = (s) => db.prepare('SELECT COUNT(*) AS n FROM playlist_items WHERE screenId = ?').get(s.id).n;

test('GET da lista devolve version e ownerMedia; PUT com versao velha ou ausente da 409', async () => {
  const { c, screen, addOwnerMedia, ad } = await setup();
  const om = addOwnerMedia(screen.id, 'a1');
  const a = ad('ad1');
  const g = await get(c, screen);
  assert.strictEqual(g.items[0].ownerMedia.id, om.id);
  await c.json('/api/playlists/' + screen.id, { method: 'POST', body: { mediaId: a } });
  assert.strictEqual((await get(c, screen)).items[1].ownerMedia, null);
  assert.strictEqual((await put(c, screen, { version: g.version, items: [] })).status, 409);
  assert.strictEqual((await put(c, screen, { items: [] })).status, 409);
  assert.strictEqual(count(screen), 2);
});

test('PUT sem imagem do dono da lista atual da 400; trocar duracao dela mantem os valores', async () => {
  const { c, screen, addOwnerMedia, ad } = await setup();
  const om = addOwnerMedia(screen.id, 'a2');
  const a = ad('ad2');
  const g = await get(c, screen);
  assert.strictEqual((await put(c, screen, { version: g.version, items: [{ mediaId: a }] })).status, 400);
  assert.strictEqual(count(screen), 1);
  const ok = await put(c, screen, { version: g.version, items: [{ mediaId: a, duration: 7 }, { mediaId: om.id, duration: 99, startDate: '2020-01-01', endDate: '2020-01-02' }] });
  assert.strictEqual(ok.status, 200);
  assert.notStrictEqual(ok.version, g.version);
  const after = (await get(c, screen)).items;
  assert.deepStrictEqual(after.map((i) => [i.mediaId, i.duration, i.startDate]), [[a, 7, null], [om.id, 10, null]]);
});

test('PUT e POST com imagem de dono de outra tela dao 400', async () => {
  const { c, screen, addOwnerMedia } = await setup();
  const other = (await setup()).screen;
  const om = addOwnerMedia(other.id, 'a3');
  const g = await get(c, screen);
  assert.strictEqual((await put(c, screen, { version: g.version, items: [{ mediaId: om.id }] })).status, 400);
  assert.strictEqual((await c.json('/api/playlists/' + screen.id, { method: 'POST', body: { mediaId: om.id } })).status, 400);
  assert.strictEqual(count(screen), 0);
});

test('DELETE /api/owner-media remove item, registro e arquivo e define reloadAt', async () => {
  const { c, screen, addOwnerMedia } = await setup();
  const om = addOwnerMedia(screen.id, 'a4');
  const file = path.join(process.env.UPLOAD_DIR, om.filename);
  assert.strictEqual((await c.json('/api/owner-media/' + om.id, { method: 'DELETE' })).status, 200);
  assert.strictEqual(count(screen), 0);
  assert.strictEqual(db.prepare('SELECT 1 FROM media WHERE id = ?').get(om.id), undefined);
  assert.ok(!fs.existsSync(file));
  assert.ok(db.prepare('SELECT reloadAt FROM screens WHERE id = ?').get(screen.id).reloadAt > 0);
  const play = await c.json('/api/play/' + screen.id);
  assert.strictEqual(play.status, 200);
  assert.deepStrictEqual(play.items, []);
});

test('GET /api/media esconde imagem de dono e DELETE /api/media/:id nela da 400', async () => {
  const { c, screen, addOwnerMedia } = await setup();
  const om = addOwnerMedia(screen.id, 'a5');
  const list = await c.req('/api/media').then((r) => r.json());
  assert.ok(!list.some((m) => m.id === om.id));
  assert.strictEqual((await c.json('/api/media/' + om.id, { method: 'DELETE' })).status, 400);
  assert.ok(db.prepare('SELECT 1 FROM media WHERE id = ?').get(om.id));
});

test('DELETE /api/screens apaga imagens de dono e arquivos, sem tocar em midia do admin', async () => {
  const { c, screen, addOwnerMedia, ad } = await setup();
  const om = addOwnerMedia(screen.id, 'a6');
  const a = ad('ad6');
  assert.strictEqual((await c.json('/api/screens/' + screen.id, { method: 'DELETE' })).status, 200);
  assert.strictEqual(db.prepare('SELECT 1 FROM media WHERE id = ?').get(om.id), undefined);
  assert.ok(!fs.existsSync(path.join(process.env.UPLOAD_DIR, om.filename)));
  assert.ok(db.prepare('SELECT 1 FROM media WHERE id = ?').get(a));
});

test('impressao de midia de dono ou inexistente nao grava', async () => {
  const { c, screen, addOwnerMedia, ad } = await setup();
  const om = addOwnerMedia(screen.id, 'a7');
  const a = ad('ad7');
  for (const mediaId of [om.id, 'nao-existe']) await c.json('/api/impression', { method: 'POST', body: { screenId: screen.id, mediaId } });
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM impressions').get().n, 0);
  await c.json('/api/impression', { method: 'POST', body: { screenId: screen.id, mediaId: a } });
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM impressions').get().n, 1);
});
