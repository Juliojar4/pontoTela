# CMS de Mídia Indoor (DOOH) — MVP

Sistema mínimo para você rodar telas de propaganda em pontos comerciais e vender espaço
para anunciantes locais. Sem mensalidade de software: você é o dono.

## Componentes
- **server.js** — backend (Node/Express). Guarda tudo em `data.sqlite` (SQLite, via `node:sqlite`
  nativo do Node — sem dependência extra) e as mídias em `uploads/`. Protege o painel com login
  por senha única (sessão via cookie).
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
ADMIN_PASSWORD=sua-senha SESSION_SECRET=uma-string-aleatoria npm start
```
Abra o painel em: http://localhost:3000/ (redireciona pra `/admin/`)

Pra desenvolver o front com hot-reload (proxying `/api` pro Express rodando em :3000):
```bash
cd frontend
npm start               # serve o app admin em :4200
npm run start:player    # serve o app player em :4200 (rode em outro terminal/porta)
```

## Variáveis de ambiente
- `ADMIN_PASSWORD` — senha do painel. **Obrigatória** pra login funcionar; sem ela o servidor sobe mas ninguém consegue entrar.
- `SESSION_SECRET` — string usada pra assinar o cookie de sessão. Sem ela, uma é gerada aleatoriamente a cada boot e todo mundo é deslogado ao reiniciar o processo — defina uma fixa em produção.
- `PORT` — porta do servidor (padrão 3000).

## Fluxo de uso
1. **Login** → entre com a senha definida em `ADMIN_PASSWORD`.
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
- Use PM2 ou systemd pra manter o processo `node server.js` no ar, com `ADMIN_PASSWORD` e
  `SESSION_SECRET` definidos no ambiente.
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
