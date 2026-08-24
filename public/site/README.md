# Site institucional do PontoTela

Landing page estática (HTML/CSS/JS puro, sem build). O Express serve esta pasta
na raiz do domínio — veja `server.js`, logo depois das rotas `/admin` e `/player`.

    public/site/
      index.html     conteúdo e estrutura das seções
      styles.css     visual
      main.js        CONFIG + animações
      img/           favicon + fotos reais (a colocar)

Deploy: entra junto com o deploy normal (`git push` na master). Não precisa buildar nada.

## O que falta preencher

Tudo que ainda não tem dado real aparece na página com um marcador amarelo
`[[PREENCHER: ...]]`. Para achar todos:

    grep -n "PREENCHER" public/site/index.html public/site/main.js

### 1. WhatsApp (mais urgente)
`public/site/main.js` → `CONFIG.whatsapp`. Só dígitos, com 55 + DDD.
Enquanto estiver com o placeholder, aparece uma tarja de aviso no topo do site
e os botões não abrem o WhatsApp. A tarja some sozinha quando o número entra.

Depois de preencher, troque também o número escrito por extenso no bloco
"WhatsApp comercial: ..." lá no fim do `index.html`.

### 2. Números da rede
`public/site/main.js` → `CONFIG.stats` (telas, pontos, horas).
Enquanto forem `null`, o site mostra o marcador em vez de inventar número.

### 3. Fotos reais dos pontos
Substituir os quadros tracejados por fotos de verdade. Coloque os arquivos em
`public/site/img/` e troque a `<div class="shot-ph">` por uma `<img>`:

    <img src="img/ponto-01.jpg" alt="Tela do PontoTela instalada na barbearia X">

Arquivos esperados: `ponto-01.jpg`, `ponto-02.jpg`, `ponto-03.jpg`, `ambiente.jpg`.
Foto de celular do ponto real vale mais que banco de imagem.

### 4. Preço e condições
- preço do pacote "3 barbearias"
- quantas trocas de arte estão inclusas
- duração mínima do contrato (aparece no FAQ)

### 5. Nomes e bairros das barbearias
Na seção "Onde as telas estão". Confirme antes com os donos dos pontos.

### 6. Rodapé
E-mail comercial e Instagram, se existirem.

## Notas

- O relatório da seção "prova de entrega" é um **exemplo ilustrativo** e está
  rotulado como tal na página. Os valores estão em `CONFIG.reportDemo`.
- O mockup de TV do hero é uma simulação em CSS, com legenda dizendo isso.
  Os anúncios de exemplo são fictícios.
- Não há formulário, backend, nem coleta de lead: todo CTA vai pro WhatsApp.
