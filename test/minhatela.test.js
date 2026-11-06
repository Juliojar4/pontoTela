const { test } = require('node:test');
const assert = require('node:assert');
const { generateSecret, verifyTotp, otpauthUri, encryptSecret, decryptSecret } = require('../lib/totp');

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
