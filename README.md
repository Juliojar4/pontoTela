# CMS de Mídia Indoor (DOOH) — MVP

Sistema mínimo para você rodar telas de propaganda em pontos comerciais e vender espaço
para anunciantes locais. Sem mensalidade de software: você é o dono.

## Componentes
- **server.js** — backend (Node/Express). Guarda tudo em `data.json` e as mídias em `uploads/`.
- **public/admin.html** — painel: cadastra telas, envia mídias, monta a programação, gera relatórios.
- **public/player.html** — o que roda na TV/box. Toca a playlist em loop e registra cada exibição.
- **public/sw.js** — cache das mídias: se a internet cair, o player continua tocando.

## Como rodar (local)
```bash
npm install
npm start
```
Abra o painel em: http://localhost:3000/admin.html

## Fluxo de uso
1. **Telas** → cadastre um ponto (ex.: "Academia X"). Copie o link do player.
2. **Mídias** → envie a arte/vídeo do anunciante (imagem ou mp4).
3. **Programação** → escolha a tela, adicione as mídias, defina a duração de cada uma e,
   se quiser, as datas de início/fim da campanha.
4. Na TV/box, abra o **link do player** em tela cheia (F11 no navegador, ou app kiosk no Android).
5. **Relatórios** → mostre ao anunciante quantas vezes o anúncio dele apareceu (sua prova de entrega).

## Colocar no ar de verdade (barato)
- Suba num servidorzinho (VPS de ~R$20/mês, ou uma máquina sua com IP fixo/no-ip).
- Aponte um domínio simples.
- Em cada box, configure o navegador para abrir a URL do player em kiosk no boot.
  No Android TV dá pra usar o app "Fully Kiosk Browser" (grátis) para abrir sozinho e em tela cheia.

## Observações
- `data.json` é o "banco". Faça backup dele de vez em quando.
- Vídeos entram sem áudio (autoplay em kiosk exige mudo). Coloque legenda na arte se precisar.
- Para escalar muito (centenas de telas), depois troque o `data.json` por um banco (SQLite/Postgres).
