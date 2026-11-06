// Login com Google (Authorization Code no servidor). Le as variaveis na hora do uso.
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

function authUrl({ state, nonce }) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email',
    state,
    nonce,
    prompt: 'select_account',
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + q;
}

// Troca o code pelo id_token e valida as claims. Nao confere a assinatura: o token vem
// direto do Google por TLS, na resposta a esta chamada.
async function exchangeCode(code, expectedNonce) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error('token endpoint ' + res.status);
  const { id_token } = await res.json();
  const c = JSON.parse(Buffer.from(String(id_token).split('.')[1] || '', 'base64url').toString('utf8'));
  if (!ISSUERS.includes(c.iss)) throw new Error('iss invalido');
  if (c.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error('aud invalido');
  if (!(c.exp * 1000 > Date.now())) throw new Error('token expirado');
  if (!expectedNonce || c.nonce !== expectedNonce) throw new Error('nonce invalido');
  if (c.email_verified !== true && c.email_verified !== 'true') throw new Error('e-mail nao verificado');
  if (!c.sub || !c.email) throw new Error('claims ausentes');
  return { sub: String(c.sub), email: String(c.email) };
}

module.exports = { authUrl, exchangeCode };
