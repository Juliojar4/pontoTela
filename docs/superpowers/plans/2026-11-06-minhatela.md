# /minhatela Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donos de tela entram com Google + Google Authenticator em `/minhatela` e gerenciam até 6 imagens e a ordem da própria tela; o admin passa a usar o mesmo login, sem senha.

**Architecture:** O backend segue em `server.js` (Express + `node:sqlite`), com TOTP/cifragem, OAuth e detecção de imagem em `lib/`. As páginas `/entrar` e `/minhatela` são HTML/JS puros em `public/minhatela/`, como `public/gallery`. A lista continua em `playlist_items`, protegida por uma versão calculada do conteúdo.

**Tech Stack:** Node 24, Express 4, `node:sqlite`, `node:crypto`, `node:test`, multer, `qrcode` (nova dependência da raiz; já é usada pelo frontend), Angular (painel admin).

**Spec:** `docs/superpowers/specs/2026-11-06-minhatela-design.md`. Leia antes de qualquer tarefa.

## Global Constraints

- Limite do dono: **6 imagens por tela**. Duração: **inteiro de 3 a 7**, padrão **7**.
- Upload do dono: só **JPEG, PNG e WebP**, verificados pelo conteúdo, até **10 MB**.
- TOTP: **SHA-1, 6 dígitos, 30 s, ±1 janela**, sem reaproveitar código.
- Tentativas de código: **5 erros em 5 minutos**, por conta e por IP.
- Sem senha: `/api/login` e `ADMIN_PASSWORD` deixam de existir.
- Dono nunca recebe nome de anunciante nem datas de campanha.
- `public/tv/player.js` permanece em **ES5**.
- Textos da interface em português; commits no padrão do repositório (`[ADD]:`, `[FIX]:`, `[CHORE]:`).
- Trabalhe na branch `feat/minhatela`. **Nunca faça push para `master`**: isso publica em produção e tira a senha do ar. Não misture no commit alterações preexistentes de `schedule.component.ts` e `media-picker.component.*` (ver Pré-requisito).

## Pré-requisito

O working tree tem alterações não commitadas em `schedule.component.ts`, `media-picker.component.ts` e `media-picker.component.spec.ts`. A Tarefa 6 edita `schedule.component.ts`. Antes de começar, o dono do repositório precisa commitar essas alterações em `master` ou decidir descartá-las. Não comece sem isso.

## Review Focus

1. Foto HEIC do iPhone, arquivo que não é imagem ou maior que 10 MB: mensagem clara e nada gravado no disco. (Tarefa 4)
2. Toque duplo em adicionar com 5 imagens: só uma entra. (Tarefa 4)
3. E-mail do Google com maiúsculas diferentes do cadastro: entra normalmente. Login cancelado no Google: volta para `/entrar` com aviso. (Tarefa 2)
4. Admin remove a conta ou zera o 2FA de quem está logado: o próximo pedido dessa pessoa recebe 401. (Tarefa 2, reset; Tarefa 6, remoção)
5. Imagem excluída que a TV ainda tenta exibir: nenhuma impressão registrada e `/api/play` vazia quando era a última. (Tarefa 3)

---

### Task 1: Servidor testável e biblioteca TOTP

**Files:**
- Create: `lib/totp.js`, `test/minhatela.test.js`
- Modify: `server.js`, `package.json`

**Interfaces:**
- Produces, em `lib/totp.js`: `generateSecret(): string` (base32, 20 bytes); `verifyTotp(secret: string, code: string, now: number, lastStep: number|null): number|null`, que devolve a janela aceita ou `null`; `otpauthUri(secret: string, email: string): string` (emissor `PontoTela`); `encryptSecret(plain: string, keyHex: string): string`; `decryptSecret(blob: string, keyHex: string): string` (AES-256-GCM, IV aleatório).
- Produces, em `server.js`: `module.exports = { app, db }`; `DB_FILE` e `UPLOAD_DIR` aceitam `process.env.DB_FILE` e `process.env.UPLOAD_DIR`; `app.listen` só com `require.main === module`.

- [ ] **Step 1: Escrever testes que falham** em `test/minhatela.test.js`, com `node:test`:
  - Vetor RFC 6238: segredo base32 de `12345678901234567890`, em `now = 59000`, aceita `287082` e devolve a janela `1`.
  - `verifyTotp` aceita ±1 janela e recusa ±2.
  - O mesmo código com `lastStep` igual à janela devolve `null`.
  - Cifrar e decifrar devolve o original; dois `encryptSecret` diferem; blob adulterado lança erro.
- [ ] **Step 2: Rodar** `node --test test/`. Esperado: FAIL por módulo ausente.
- [ ] **Step 3: Implementar** `lib/totp.js`, com comparação em `crypto.timingSafeEqual`, e as mudanças em `server.js`. Adicionar `"test": "node --test test/"` em `package.json`.
- [ ] **Step 4: Rodar** `npm test`. Esperado: PASS. Conferir também `node server.js` subindo localmente.
- [ ] **Step 5: Commit** `[ADD]: TOTP library and testable server`.

### Task 2: Login Google + Authenticator e guardas

**Files:**
- Create: `lib/google.js`, `scripts/reset-2fa.js`, `public/minhatela/entrar.html`, `public/minhatela/entrar.js`, `public/minhatela/minhatela.css`
- Modify: `server.js`, `package.json`, `package-lock.json`, `.env.example`, `README.md`, `frontend/projects/admin/src/app/core/auth.service.ts`, `frontend/projects/admin/src/app/core/auth.interceptor.ts`, `frontend/projects/admin/src/app/features/login/login.component.ts`
- Test: `test/minhatela.test.js`

**Interfaces:**
- Consumes: `lib/totp.js`.
- Produces, em `lib/google.js`: `authUrl({ state, nonce }): string`; `exchangeCode(code, expectedNonce): Promise<{ sub, email }>`, que chama `fetch` em `https://oauth2.googleapis.com/token` e valida `iss` (`https://accounts.google.com` ou `accounts.google.com`), `aud`, `exp`, `nonce` e `email_verified`. Lança erro se algo falhar. Não checar assinatura: o `id_token` vem direto do Google por TLS.
- Produces, tabela `users`: `id TEXT PK, email TEXT UNIQUE NOT NULL` (minúsculo), `role TEXT NOT NULL, googleSub TEXT, totpSecret TEXT, totpEnabledAt INTEGER, totpLastStep INTEGER, authEpoch INTEGER NOT NULL DEFAULT 0, createdAt INTEGER NOT NULL`.
- Produces, sessão: `req.session.oauth = { state, nonce }`, `req.session.pending = { userId, enrollSecret? }`, `req.session.user = { id, role, authEpoch }`.
- Produces, guardas: `requireAdmin` e `requireOwner` releem o usuário no banco a cada pedido e devolvem 401 se ele não existir ou o `authEpoch` for outro; 403 se o papel for errado.
- Produces, rotas:
  - `GET /auth/google` redireciona ao Google.
  - `GET /auth/google/callback` redireciona para `/entrar` ou `/entrar?erro=google|nao-cadastrado`.
  - `GET /api/auth/state` devolve `{ step: 'google'|'enroll'|'code'|'done', redirect?, qr?, secret? }`.
  - `POST /api/auth/verify { code }` devolve `{ redirect }`, ou 401 / 429.
  - `POST /api/logout`.
  - `GET /api/me` devolve `{ authenticated: boolean }`, verdadeiro só para admin com sessão completa.
  - `GET /entrar` serve `public/minhatela/entrar.html`.

- [ ] **Step 1: Escrever testes que falham.** Criar o helper `loginAs(email)`: substitui `globalThis.fetch` só para a URL de token do Google, com `id_token` JWT sem assinatura, percorre o fluxo com jar de cookies manual e gera o código com o segredo de `/api/auth/state`. Sobe o `app` em porta efêmera, com `DB_FILE` e `UPLOAD_DIR` temporários e env de teste definida antes do `require`. Afirmar:
  - `state` errado redireciona com `erro=google`; callback com `error=access_denied` também.
  - E-mail não cadastrado redireciona com `erro=nao-cadastrado` e não cria linha em `users`.
  - `Admin@X.com` entra na conta `admin@x.com`; depois disso, outro `sub` com o mesmo e-mail é recusado.
  - Sessão com Google e sem código recebe 401 em `GET /api/screens`, e `GET /api/me` devolve `authenticated: false`.
  - Sem confirmar o código, `totpSecret` segue nulo e o próximo login volta a `enroll`.
  - O mesmo código não vale em um segundo login.
  - O 6º código errado recebe 429.
  - Admin vai para `/admin/`, dono para `/minhatela`.
  - Dono, inserido direto em `users`, recebe 403 em `GET /api/screens`.
  - `POST /api/login` responde 404.
  - Depois de rodar `scripts/reset-2fa.js <email>` em processo filho, a sessão aberta recebe 401 e o próximo login volta a `enroll`.
  - Processo filho sem `GOOGLE_CLIENT_ID` sai com código 1 e cita a variável no stderr.
- [ ] **Step 2: Rodar** `npm test`. Esperado: FAIL.
- [ ] **Step 3: Implementar o backend.**
  - Variáveis obrigatórias ao subir, com `process.exit(1)` e mensagem clara: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `ADMIN_EMAIL` e `TOTP_ENCRYPTION_KEY` (64 caracteres hex, `openssl rand -hex 32`). A checagem também roda no `require` dos testes.
  - Criar ou promover o admin a partir de `ADMIN_EMAIL`.
  - Trocar todo `requireAuth` por `requireAdmin` e remover `/api/login`, `ADMIN_PASSWORD` e `loginAttempts` por senha.
  - Limite: helper único por chave (`u:<id>`, `ip:<ip>`), 5 erros em 5 minutos.
  - Usar `req.session.regenerate` depois do Google e depois do código.
  - Cookie com `secure: 'auto'`, que funciona atrás do Caddy graças a `trust proxy`.
  - Incluir `/entrar`, `/auth` e `/minhatela` em `NO_INDEX_PREFIXES`.
  - O QR do cadastro é gerado no servidor com `QRCode.toDataURL(otpauthUri(...))`. O segredo fica só na sessão até ser confirmado.
  - `scripts/reset-2fa.js`: abre o banco, zera `totpSecret`, `totpEnabledAt` e `totpLastStep`, e incrementa `authEpoch`.
- [ ] **Step 4: Rodar** `npm test`. Esperado: PASS.
- [ ] **Step 5: Implementar as telas.**
  - `entrar.html` e `entrar.js`, conforme `step`: botão "Entrar com Google"; QR, chave manual e campo do código; ou só o campo do código com `inputmode="numeric" autocomplete="one-time-code"`.
  - Erros: `nao-cadastrado` mostra "Este Google não tem acesso. Fale com o administrador."; `google` mostra "Não foi possível entrar com o Google. Tente de novo."
  - No Angular, `login.component.ts` vira um link para `/auth/google`. Remover `login()` de `auth.service.ts` e a exceção de `/api/login` do interceptor.
- [ ] **Step 6: Documentar.** `.env.example` e `README.md`: novas variáveis, criação das credenciais OAuth, URI de callback, `reset-2fa.js` e a ordem obrigatória (configurar o servidor antes do push).
- [ ] **Step 7: Verificar** `npm test` e `npm run build`. Esperado: ambos sem erro.
- [ ] **Step 8: Commit** `[ADD]: Google and authenticator login`.

### Task 3: Proteção da programação e impressões

**Files:**
- Modify: `server.js`
- Test: `test/minhatela.test.js`

**Interfaces:**
- Consumes: `requireAdmin` e `loginAs`.
- Produces: colunas `screens.ownerId TEXT` e `media.ownerScreenId TEXT`; `playlistRows(screenId)` lê as linhas em ordem; `listVersion(rows): string` é o SHA-256 do JSON de `mediaId, duration, startDate, endDate`, na ordem.
- Produces, rotas:
  - `GET /api/playlists/:screenId` devolve `{ version, items }`, com `ownerMedia: Media|null` em cada item.
  - `PUT /api/playlists/:screenId { version, items }` devolve `{ ok, version }`, 409 `{ error }` se a versão estiver velha, ou 400.
  - `DELETE /api/owner-media/:mediaId` remove a imagem do dono.
- Produces: `removeOwnerMedia(mediaId)`, helper que apaga item, registro e arquivo, reaproveitado na Tarefa 4.

- [ ] **Step 1: Escrever testes que falham,** inserindo imagem de dono direto no banco:
  - `PUT` com versão velha: 409 e lista intacta.
  - `PUT` sem uma imagem do dono da lista atual: 400 e lista intacta.
  - `PUT` que altera duração ou datas de imagem do dono: grava os valores existentes.
  - `PUT` e `POST` com imagem de dono de outra tela: 400.
  - `DELETE /api/owner-media/:id`: remove item, registro e arquivo, e define `reloadAt`.
  - `GET /api/media` não lista imagens de dono; `DELETE /api/media/:id` em imagem de dono responde 400.
  - `DELETE /api/screens/:id` apaga imagens de dono da tela e seus arquivos, sem tocar em mídias do admin.
  - `POST /api/impression` com mídia de dono ou inexistente não grava nada.
  - Última imagem removida em tela sem anúncios: `/api/play` responde 200 com `items: []`.
- [ ] **Step 2: Rodar** `npm test`. Esperado: FAIL nos novos testes.
- [ ] **Step 3: Implementar** as colunas (padrão `pragma_table_info`), as rotas e os filtros em `server.js`. Toda escrita com mais de um comando roda em transação.
- [ ] **Step 4: Rodar** `npm test`. Esperado: PASS. O painel fica temporariamente incompatível até a Tarefa 6; `PUT` sem `version` responde 409.
- [ ] **Step 5: Commit** `[ADD]: protect owner media in admin playlist`.

### Task 4: API do dono

**Files:**
- Create: `lib/image-type.js`
- Modify: `server.js`
- Test: `test/minhatela.test.js`

**Interfaces:**
- Consumes: `requireOwner`, `listVersion`, `playlistRows` e `removeOwnerMedia`.
- Produces: `imageType(buffer): 'jpg'|'png'|'webp'|null`, por assinatura de bytes.
- Produces, rotas, todas protegidas por `requireOwner`. Tela de outro dono responde **404**. As escritas devolvem o estado:
  - `GET /api/my/screens` devolve `[{ id, code, name, location }]`.
  - `GET /api/my/screens/:id` devolve o estado `{ version, limit: 6, used, items }`, com item `{ itemId, kind: 'own', url, duration, originalName }` ou `{ itemId, kind: 'ad', url, type }`.
  - `POST /api/my/screens/:id/images`: multipart, campo `file`. Entra no fim da lista com duração 7.
  - `PATCH /api/my/screens/:id/items/:itemId { duration }`.
  - `DELETE /api/my/screens/:id/items/:itemId`.
  - `PUT /api/my/screens/:id/order { version, itemIds }`. Permutação inválida: 400. Versão velha: 409.

- [ ] **Step 1: Escrever testes que falham:**
  - Estado do anúncio não contém `advertiser`, `startDate`, `endDate` nem `duration`.
  - 7ª imagem: 409. Duas enviadas juntas com 5 na lista: uma entra e a outra recebe 409.
  - Duração 2, 8 e 3.5: 400; 3 e 7: aceitas.
  - PATCH e DELETE em item de anúncio: 403, com o anúncio intacto.
  - Tela de outro dono, nas cinco rotas com `:id`: 404.
  - Sessão com Google e sem código recebe 401 em `GET /api/my/screens`; admin recebe 403.
  - Reordenar com anúncios muda só `position`: duração e datas seguem iguais. `itemIds` com item faltando, repetido ou estranho: 400. Versão velha: 409.
  - Bytes de HTML, SVG ou HEIC com mimetype `image/png`: 415, com mensagem "Envie uma imagem JPEG, PNG ou WebP.", sem arquivo em `UPLOAD_DIR`.
  - Arquivo de 10 MB + 1 byte: 413, com mensagem "A imagem pode ter no máximo 10 MB.", sem arquivo.
  - Extensão gravada vem do conteúdo, não do nome enviado.
  - Excluir apaga item, registro e arquivo.
  - Imagem do dono aparece em `/api/play` e `/api/gallery`, com a duração escolhida.
- [ ] **Step 2: Rodar** `npm test`. Esperado: FAIL nos novos testes.
- [ ] **Step 3: Implementar.** `multer` próprio com `limits.fileSize` de 10 MB em disco, e um middleware de erro que traduz `LIMIT_FILE_SIZE` para 413. Depois do upload, ler o início do arquivo, apagá-lo se for recusado e renomeá-lo com a extensão detectada. Contar pelos itens da lista e inserir em transação síncrona, sem `await` entre a contagem e o `INSERT`. Mudanças do dono não acionam `reloadAt`.
- [ ] **Step 4: Rodar** `npm test`. Esperado: PASS.
- [ ] **Step 5: Commit** `[ADD]: owner screen API`.

### Task 5: Página `/minhatela`

**Files:**
- Create: `public/minhatela/index.html`, `public/minhatela/minhatela.js`
- Modify: `public/minhatela/minhatela.css`, `server.js`, `public/site/robots.txt`

**Interfaces:**
- Consumes: rotas `/api/my/*` da Tarefa 4 e `POST /api/logout`.

- [ ] **Step 1: Servir a página.** `app.use('/minhatela', express.static(...))`, antes do site. Adicionar `Disallow: /minhatela/` e `Disallow: /entrar` em `robots.txt`.
- [ ] **Step 2: Implementar o Modelo A da spec, em celular.**
  - Cabeçalho com nome da tela, "N de 6 imagens suas" e "Sair". Seletor só com mais de uma tela. Sem telas: "Nenhuma tela vinculada. Fale com o administrador."
  - Linha do dono: ☰, miniatura, `originalName` (sempre via `textContent`), `<select>` de 3 a 7 s e excluir, com confirmação.
  - Linha de anúncio: ☰, miniatura (vídeo com `#t=0.1`), "🔒 Anúncio". Sem controle de remoção ou tempo.
  - Arrastar com Pointer Events no ☰ (`touch-action: none` só nele), mais botões ↑ ↓ com `aria-label`.
  - "+ Adicionar imagem": `<input type="file" accept="image/jpeg,image/png,image/webp">`, desabilitado com 6 imagens e durante o envio.
  - Respostas: 401 vai para `/entrar`; 409 avisa "A lista mudou. Atualizamos para você." e aplica o estado novo; demais erros mostram `error`.
  - Aviso fixo: "As mudanças chegam à TV em até 5 minutos."
- [ ] **Step 3: Verificar no navegador,** com o servidor local e largura de 360 px:
  - Enviar, mudar tempo, arrastar, usar ↑ ↓ e excluir, recarregando para confirmar que tudo persistiu.
  - Atingir o limite de 6.
  - Enviar um `.txt` renomeado para `.png` e ver a mensagem de erro.
  - A página sem sessão vai para `/entrar`.
- [ ] **Step 4: Commit** `[ADD]: minhatela owner page`.

### Task 6: Painel admin

**Files:**
- Modify: `server.js`, `frontend/projects/admin/src/app/core/models.ts`, `frontend/projects/admin/src/app/core/playlists.service.ts`, `frontend/projects/admin/src/app/core/screens.service.ts`, `frontend/projects/admin/src/app/features/schedule/schedule.component.ts`, `frontend/projects/admin/src/app/features/screens/screens.component.ts`
- Test: `test/minhatela.test.js`

**Interfaces:**
- Consumes: rotas da Tarefa 3.
- Produces, rotas, com `requireAdmin`:
  - `PUT /api/screens/:id/owner { email }`: cria o dono se preciso e vincula. Trocar o dono apaga a conta anterior se ela ficar sem telas. E-mail inválido ou de admin: 400.
  - `POST /api/users/:id/reset-2fa`.
  - `DELETE /api/users/:id`: só `role = owner`; desvincula as telas e mantém as imagens.
  - `GET /api/screens` passa a incluir `ownerId`, `ownerEmail` e `ownerTotpEnabled`.
- Produces, serviço Angular: `PlaylistsService.list(id): Promise<{ version: string; items: PlaylistItem[] }>`, `save(id, version, items)`, `removeOwnerMedia(mediaId)`. `PlaylistItem` ganha `ownerMedia?: Media | null`.

- [ ] **Step 1: Escrever testes que falham:**
  - Dono cadastrado só entra depois de vinculado pelo admin.
  - Trocar o dono mantém imagens na tela, e o dono antigo recebe 401 na próxima requisição e não entra mais.
  - Zerar 2FA leva a `enroll` no próximo login e encerra a sessão aberta.
  - Remover conta: `ownerId` fica nulo, as imagens continuam e a sessão aberta recebe 401.
  - `DELETE` de admin: 400.
  - Dono recebe 403 nas três rotas.
- [ ] **Step 2: Rodar** `npm test`. Esperado: FAIL.
- [ ] **Step 3: Implementar as rotas.** A sessão aberta cai porque a linha em `users` some e o guarda da Tarefa 2 relê o banco; zerar 2FA incrementa `authEpoch`.
- [ ] **Step 4: Rodar** `npm test`. Esperado: PASS.
- [ ] **Step 5: Atualizar a Programação** (`schedule.component.ts`):
  - Guardar `version` a cada `loadList` e enviá-la em todo `save`.
  - Em 409, mostrar o toast "A lista mudou. Recarreguei a programação." e recarregar.
  - `mediaFor` também procura em `ownerMedia` da lista.
  - Item de dono: título "Imagem do dono · <originalName>", sem "editar". "remover" chama `removeOwnerMedia`, com confirmação, e recarrega.
- [ ] **Step 6: Atualizar a tela Telas** (`screens.component.ts`): campo "E-mail do dono" com salvar em cada cartão, situação do 2FA, "zerar 2FA" e "remover conta", com confirmação.
- [ ] **Step 7: Verificar** `npm run build` sem erro e, no navegador: vincular um dono, mover, editar anúncio e remover uma imagem de dono na Programação.
- [ ] **Step 8: Commit** `[ADD]: owner management in admin panel`. Conferir com `git diff --cached` que nada alheio entrou.

### Task 7: Lista vazia na TV e verificação final

**Files:**
- Modify: `public/tv/player.js`

- [ ] **Step 1: Alterar `fetchPlaylist`.** Em `public/tv/player.js`, trocar o comentário e a condição: resposta 2xx com `data.items` array define `items = data.items` e chama `saveCache(items)`, mesmo vazia. O caminho de falha (`onFail`) e resposta inválida não mudam. Código em ES5.
- [ ] **Step 2: Verificar no navegador,** abrindo `/<code>`:
  - Com programação tocando, esvaziar a lista: em até 5 minutos, ou com "recarregar" em até 25 segundos, aparece "Sem conteúdo programado".
  - Parar o servidor com programação tocando: a TV continua repetindo.
  - Recarregar sem rede, com cache, ainda toca a última lista válida.
- [ ] **Step 3: Rodar** `npm test` e `npm run build`. Esperado: tudo sem erro.
- [ ] **Step 4: Commit** `[FIX]: show empty state when playlist is cleared`.
- [ ] **Step 5: Parar e passar ao dono do repositório a verificação que exige ambiente real:**
  - Login com Google de verdade.
  - Arrastar em celular de verdade.
  - Lista vazia em uma TV real, com e sem internet.
  - Antes do merge em `master`: credenciais e variáveis no `.env` do servidor, e URI de callback registrada.
