// Env de teste ANTES do require do server.js (ele valida as variaveis ao carregar).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'video-'));
Object.assign(process.env, {
  DB_FILE: path.join(TMP, 'test.sqlite'),
  UPLOAD_DIR: path.join(TMP, 'uploads'),
  GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'x', GOOGLE_REDIRECT_URI: 'http://localhost/cb',
  ADMIN_EMAIL: 'admin@x.com', TOTP_ENCRYPTION_KEY: 'ab'.repeat(32), SESSION_SECRET: 's',
});
const test = require('node:test');
const assert = require('node:assert');
const { db, queueTranscode, queueOwnerWebp, UPLOAD_DIR } = require('../server');
const { probe } = require('../lib/video');

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version']); return true; } catch { return false; } })();

test('video 1440p High vira 1080p Main com nome novo e o original some', { skip: !hasFfmpeg && 'sem ffmpeg' }, async () => {
  const original = 'orig.mp4';
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=2560x1440:rate=30:duration=1',
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', path.join(UPLOAD_DIR, original)]);
  db.prepare("INSERT INTO media (id, filename, originalName, type, createdAt) VALUES ('m1', ?, 'a.mp4', 'video', 0)").run(original);

  await queueTranscode('m1', original);

  const { filename } = db.prepare("SELECT filename FROM media WHERE id = 'm1'").get();
  assert.notStrictEqual(filename, original);
  assert.ok(!fs.existsSync(path.join(UPLOAD_DIR, original)));
  const s = await probe(path.join(UPLOAD_DIR, filename));
  assert.deepStrictEqual([s.codec_name, s.profile, s.width, s.height], ['h264', 'Main', 1920, 1080]);

  // Ja compativel: segunda passada nao mexe.
  await queueTranscode('m1', filename);
  assert.strictEqual(db.prepare("SELECT filename FROM media WHERE id = 'm1'").get().filename, filename);
});

test('WebP animado do dono vira MP4 com a duracao certa; parado e transparente ficam', { skip: !hasFfmpeg && 'sem ffmpeg' }, async () => {
  const sharp = require('sharp');
  // Dimensao impar de proposito: H.264 so aceita par.
  const frames = (n, alpha) => sharp(Buffer.concat(Array.from({ length: n }, (_, i) =>
    Buffer.alloc(321 * 181 * 4, Buffer.from([40 * i, 90, 200, alpha])))),
  { raw: { width: 321, height: 181 * n, channels: 4, pageHeight: 181 } });
  const add = async (name, n, alpha) => {
    await frames(n, alpha).webp({ lossless: true, delay: Array(n).fill(500), loop: 0 }).toFile(path.join(UPLOAD_DIR, name + '.webp'));
    db.prepare("INSERT INTO media (id, filename, originalName, type, ownerScreenId, createdAt) VALUES (?, ?, 'a.webp', 'image', 's1', 0)").run(name, name + '.webp');
  };
  await add('anim', 4, 255);
  await add('parado', 1, 255);
  await add('transp', 4, 100);

  await queueOwnerWebp();

  const get = (id) => db.prepare('SELECT filename, type FROM media WHERE id = ?').get(id);
  const anim = get('anim');
  assert.strictEqual(anim.type, 'video');
  assert.ok(!fs.existsSync(path.join(UPLOAD_DIR, 'anim.webp')));
  const file = path.join(UPLOAD_DIR, anim.filename);
  const s = await probe(file);
  assert.deepStrictEqual([s.codec_name, s.profile, s.width % 2, s.height % 2], ['h264', 'Main', 0, 0]);
  const secs = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString();
  assert.strictEqual(Number(secs), 2);
  for (const name of ['parado', 'transp']) {
    assert.deepStrictEqual({ ...get(name) }, { filename: name + '.webp', type: 'image' });
    assert.ok(fs.existsSync(path.join(UPLOAD_DIR, name + '.webp')));
  }
});
