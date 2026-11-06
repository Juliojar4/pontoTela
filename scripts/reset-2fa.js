// Uso (no servidor): node scripts/reset-2fa.js <email>
// Zera o Authenticator da conta e derruba as sessoes abertas dela (authEpoch + 1).
require('dotenv').config();
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) { console.error('Uso: node scripts/reset-2fa.js <email>'); process.exit(1); }

const db = new DatabaseSync(process.env.DB_FILE || path.join(__dirname, '..', 'data.sqlite'));
const r = db.prepare('UPDATE users SET totpSecret = NULL, totpEnabledAt = NULL, totpLastStep = NULL, authEpoch = authEpoch + 1 WHERE email = ?').run(email);
if (!r.changes) { console.error('Nenhuma conta com o e-mail ' + email); process.exit(1); }
console.log('2FA zerado para ' + email + '. No proximo login a conta cadastra o Authenticator de novo.');
