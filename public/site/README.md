# Site institucional do PontoTela

Landing page estática (HTML/CSS/JS puro, sem build). O Express serve esta pasta
na raiz do domínio — veja `server.js`, logo depois das rotas `/admin` e `/player`.

    public/site/
      index.html     conteúdo e estrutura das seções
      styles.css     visual
      main.js        CONFIG + animações
      img/           favicon

Deploy: entra junto com o deploy normal (`git push` na master). Não precisa buildar nada.

## Pra quem o site fala

O público é o **dono do estabelecimento** (barbearia, pet shop, lanchonete...),
não o anunciante. O objetivo da página é uma coisa só: convencer o comércio a
receber uma tela. O argumento central é que **não custa nada pro estabelecimento**
e que o processo é todo por nossa conta.

Enquanto a rede está sendo montada, a página **não fala de preço, não mostra
inventário de telas e não promete números de audiência** — não temos ponto
instalado ainda e o site não inventa dado.

O tom é de conversa, não de folheto: frases curtas, "a gente" no lugar de
"a empresa", "zap" no lugar de "WhatsApp comercial", e nenhuma promessa que a
gente não possa cumprir na primeira visita. Ao mexer no texto, leia em voz alta:
se não soar como alguém explicando no balcão, reescreva.

Seções, na ordem: hero → a ideia → nosso processo (4 passos) → o que roda na
tela → o combinado (o que cada lado coloca) → sem custo → FAQ → CTA.

## Contato

Canal único: WhatsApp **(15) 99627-3799**, configurado em
`main.js` → `CONFIG.whatsapp` (`5515996273799`) e escrito por extenso no CTA
final e no rodapé do `index.html`. Não há e-mail, formulário, backend nem
coleta de lead — todo CTA vai pro WhatsApp.

## Quando a rede existir

Coisas que só entram no site depois de terem dado real:

- fotos dos pontos instalados (`img/ponto-01.jpg`, `ambiente.jpg`)
- número de telas / pontos / horas de exibição
- seção voltada ao anunciante (planos, preço, exclusividade de categoria,
  relatório de exibições) — o histórico dessa versão está no git

## Visual

O hero é claro (creme com um brilho verde no alto à direita e um laranja fraco
embaixo à esquerda) — a versão anterior era preta e ficou pesada demais pro
assunto. As seções escuras seguem existindo no meio da página pra dar ritmo:
verde em "o que roda na tela" e carvão em "sem custo".

## Notas

- A seção "A ideia" é montada em volta da **régua da espera** (`.espera-card` /
  `.rail` no CSS): a linha do tempo de uma espera de 31 minutos, com os marcos
  em que a tela fala em verde e o desfecho em laranja. Os minutos são um exemplo
  narrativo, não medição — se um dia virarem dado real, é só trocar os textos.
- O mockup de TV do hero é uma simulação em CSS, com legenda dizendo isso.
  As peças de exemplo são fictícias e mostram conteúdo *do próprio comércio*.
- `CONFIG.slideDuration` controla o tempo de cada peça no mockup.
