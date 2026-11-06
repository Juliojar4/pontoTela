# CMS de Mídia Indoor (DOOH) — MVP

Sistema mínimo para você rodar telas de propaganda em pontos comerciais e vender espaço
para anunciantes locais. Sem mensalidade de software: você é o dono.

## Componentes
- **server.js** — backend (Node/Express). Guarda tudo em `data.sqlite` (SQLite, via `node:sqlite`
  nativo do Node — sem dependência extra) e as mídias em `uploads/`. Protege o painel com login
  Google + código do Google Authenticator (sessão via cookie).
- **frontend/** — workspace Angular com dois apps:
  - **admin** — painel: login, cadastra telas, envia mídias, monta a programação, gera relatórios.
  - **player** — o que roda na TV/box. Toca a playlist em loop, registra cada exibição e usa
    Angular Service Worker pra continuar tocando mesmo se a internet cair.
- Os builds do Angular vão para `public/admin/` e `public/player/` (gerados, não versionados),
  de onde o Express os serve.

## Como rodar (local)
```bash
npm install
npm run build          # builda os dois apps Angular pra public/admin e public/player
npm start              # com o .env preenchido (veja Variáveis de ambiente)
```
Abra o painel em: http://localhost:3000/ (redireciona pra `/admin/`)

Pra desenvolver o front com hot-reload (proxying `/api` pro Express rodando em :3000):
```bash
cd frontend
npm start               # serve o app admin em :4200
npm run start:player    # serve o app player em :4200 (rode em outro terminal/porta)
```

## Variáveis de ambiente
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` — credenciais OAuth do Google. **Obrigatórias**: sem qualquer uma o servidor registra o erro e não sobe.
- `ADMIN_EMAIL` — e-mail Google do administrador. **Obrigatória**. Ao subir, o servidor cria essa conta como admin (ou promove, se já existir).
- `TOTP_ENCRYPTION_KEY` — 64 caracteres hexadecimais que cifram o segredo do Authenticator no banco (o backup do `data.sqlite` vai pro Google Drive). **Obrigatória**. Gere com `openssl rand -hex 32` e guarde: se mudar, os segredos já gravados deixam de abrir, então rode `scripts/reset-2fa.js` para cada conta (todas recadastram o Authenticator).
- `SESSION_SECRET` — string usada pra assinar o cookie de sessão. Sem ela, uma é gerada aleatoriamente a cada boot e todo mundo é deslogado ao reiniciar o processo — defina uma fixa em produção.
- `PORT` — porta do servidor (padrão 3000).

## Login com Google + Authenticator
1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto, configure a **tela de consentimento OAuth** (escopos `openid` e `email`) e publique em produção.
2. Em *Credenciais*, crie um **ID do cliente OAuth** do tipo *Aplicativo da Web*. Em *URIs de redirecionamento autorizados* registre exatamente o valor de `GOOGLE_REDIRECT_URI`, ex.: `https://pontotela.com.br/auth/google/callback`.
3. Coloque Client ID, Secret, a URI, `ADMIN_EMAIL` e `TOTP_ENCRYPTION_KEY` no `.env` do servidor.
4. No primeiro acesso a pessoa entra com o Google, escaneia o QR no Google Authenticator e confirma um código. Nos próximos, informa só o código. Só e-mails já cadastrados entram.
5. **Perdeu o celular?** No servidor: `node scripts/reset-2fa.js email@da.conta`. Zera o Authenticator, derruba as sessões abertas dela e a conta cadastra de novo no próximo login.

**Ordem obrigatória no deploy:** o push em `master` publica sozinho e a senha antiga deixa de existir. Antes do push, configure o `.env` do servidor com as variáveis acima e registre a URI de callback no Google Cloud. Como as sessões ficam em memória, cada deploy pede novo login.

## Publicação
Siga esta ordem. O push em `master` publica sozinho e remove a senha antiga.
1. Registre `http://localhost:3000/auth/google/callback` como segunda URI no Google Cloud e faça o login completo localmente, com credenciais reais.
2. Preencha o `.env` do servidor, confirme que `pm2 describe dooh` mostra `exec cwd` como `/root/dooh-cms` e rode `scripts/backup.sh`.
3. Faça o push e entre como admin na hora, com uma sessão SSH aberta: o `reset-2fa.js` precisa dela se algo falhar no cadastro do Authenticator.
4. Reinicie o app em cada TV uma vez: uma TV em tela cheia rebusca a lista, mas não recarrega o `player.js`.
5. Teste o arrastar em um celular de verdade e a lista vazia em uma TV de verdade, com e sem internet.

## Fluxo de uso
1. **Login** → "Entrar com Google" e depois o código do Authenticator.
2. **Telas** → cadastre um ponto (ex.: "Academia X"). Copie o link do player.
3. **Mídias** → envie a arte/vídeo do anunciante (imagem ou mp4).
4. **Programação** → escolha a tela, adicione as mídias, defina a duração de cada uma e,
   se quiser, as datas de início/fim da campanha.
5. Na TV/box, abra o **link do player** em tela cheia (F11 no navegador, ou app kiosk no Android).
   O player não precisa de login.
6. **Relatórios** → mostre ao anunciante quantas vezes o anúncio dele apareceu (sua prova de entrega).

## Colocar no ar de verdade (barato)
- Suba num servidorzinho (VPS de ~R$20/mês, ou uma máquina sua com IP fixo/no-ip).
- Rode `npm install && npm run build` a cada deploy (o `build` já builda os dois apps Angular).
- Use PM2 ou systemd pra manter o processo `node server.js` no ar, com as variáveis do `.env` (login Google e
  `SESSION_SECRET`) definidas no ambiente.
- Coloque um Nginx na frente pra TLS/domínio.
- Aponte um domínio simples.
- Em cada box, configure o navegador para abrir a URL do player em kiosk no boot.
  No Android TV dá pra usar o app "Fully Kiosk Browser" (grátis) para abrir sozinho e em tela cheia.

## Observações
- `data.sqlite` é o "banco". Faça backup dele de vez em quando (é um arquivo único).
- Se você vem de uma versão antiga com `data.json`, o server migra automaticamente na primeira
  subida com SQLite e renomeia o arquivo antigo para `data.json.migrated` (fica de backup).
- Vídeos entram sem áudio (autoplay em kiosk exige mudo). Coloque legenda na arte se precisar.
- Requer Node 22.5+ (usa o módulo nativo `node:sqlite`). A VPS já roda Node 24.
