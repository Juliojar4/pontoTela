// TOTP (RFC 6238): SHA-1, 6 digitos, passo de 30 s, janela +-1. So built-ins do node.
const crypto = require('node:crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_MS = 30000;

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  let bits = 0, value = 0;
  const out = [];
  for (const c of str.replace(/=+$/, '').toUpperCase()) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error('base32 invalido');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(key, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}

// Codigo vigente em `now` (ms). Usado nos testes.
function codeAt(secret, now) {
  return hotp(base32Decode(secret), Math.floor(now / STEP_MS));
}

// `now` em ms. Devolve a janela aceita (maior que lastStep) ou null.
function verifyTotp(secret, code, now, lastStep) {
  if (!/^\d{6}$/.test(String(code))) return null;
  const key = base32Decode(secret);
  const step = Math.floor(now / STEP_MS);
  const given = Buffer.from(String(code));
  for (const w of [step - 1, step, step + 1]) {
    if (w < 0 || (lastStep != null && w <= lastStep)) continue;
    if (crypto.timingSafeEqual(Buffer.from(hotp(key, w)), given)) return w;
  }
  return null;
}

function otpauthUri(secret, email) {
  return 'otpauth://totp/PontoTela:' + encodeURIComponent(email) +
    '?secret=' + secret + '&issuer=PontoTela&algorithm=SHA1&digits=6&period=30';
}

// AES-256-GCM; blob = base64(iv[12] | tag[16] | ciphertext)
function encryptSecret(plain, keyHex) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}

function decryptSecret(blob, keyHex) {
  const b = Buffer.from(blob, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}

module.exports = { codeAt, generateSecret, verifyTotp, otpauthUri, encryptSecret, decryptSecret };
