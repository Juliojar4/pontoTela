# /minhatela: contas para donos de tela

## Por que existe

Hoje só o admin (Julio) mexe na programação, usando uma senha única que dá acesso a tudo.
A `/minhatela` permite que o dono de um estabelecimento troque as próprias imagens sem
depender do admin, sem colocar em risco os anúncios vendidos nem as telas de outros donos.

Legenda: **[decidido]** veio do Julio. **[escolha do desenho]** é uma suposição apresentada
a ele sem objeção ou uma decisão técnica deste documento, e pode ser contestada.

## Objetivos

- Dono entra em `/minhatela` e gerencia as próprias imagens na própria tela, pelo celular.
- Todo login, de admin e de dono, exige Google e Google Authenticator. **[decidido]**
- Os anúncios continuam sob controle do admin.

## Fora do escopo

- Cadastro aberto, relatórios para donos e aprovação prévia das imagens.
- Vídeos enviados pelo dono.
- Códigos de recuperação e "confiar neste dispositivo".
- Envio de e-mails.

## O que não pode acontecer

- Dono remover, adicionar ou editar anúncio, ou alterar a duração ou as datas dele.
- Dono ver ou alterar tela de outro dono, ou acessar qualquer rota do admin.
- Admin ficar trancado fora depois do deploy.
- Imagens do dono entrarem na contagem de impressões usada como prova para anunciantes.
- Upload do dono executar código na origem do site (HTML ou SVG servidos em `/uploads`).

## Regras do dono

- **[decidido]** No máximo **6 imagens**. Limite por tela. **[escolha do desenho]**
- **[decidido]** Duração escolhida pelo dono, com **máximo de 7 segundos**. Número inteiro de
  **3 a 7**, padrão 7; o mínimo de 3 é **[escolha do desenho]**.
- **[decidido]** Pode **mover qualquer item** da sequência, inclusive anúncios, mas só adiciona
  e exclui as próprias imagens. Como resultado, o dono pode agrupar anúncios, mas cada um
  continua aparecendo uma vez por volta.
- **[escolha do desenho]** Publicação imediata. O admin pode remover imagem de dono na
  Programação.
- **[escolha do desenho]** Mudança feita pelo dono chega à TV em até 5 minutos, no ciclo atual do
  player (`POLL_MS`). Ele não aciona `reloadAt`, que reiniciaria a sequência no meio de um
  anúncio. Quando o admin remove imagem de dono, o caso é de moderação: a remoção aciona
  `reloadAt`, e a TV atualiza em até cerca de 25 segundos.
- **[escolha do desenho]** Na `/minhatela`, o anúncio aparece com miniatura, cadeado e o rótulo
  "Anúncio", sem nome do anunciante nem datas. Todos os anúncios da lista são mostrados,
  inclusive os fora do período de campanha.

## Tela

**[decidido]** Modelo A, em lista, para celular: uma linha por item, arrastando pelo ☰. O
cabeçalho mostra o nome da tela e "N de 6 imagens suas". A linha do dono tem miniatura, tempo
editável e excluir. A linha de anúncio tem miniatura e cadeado. Ao atingir 6 imagens, o botão
"+ Adicionar imagem" fica desabilitado.

**[escolha do desenho]** Página em HTML/CSS/JS puro servida pelo Express, como
`public/gallery`, no mesmo tema escuro. Dono com várias telas escolhe a tela em um seletor.
Arrastar precisa funcionar no toque (Pointer Events, pois o drag nativo do HTML não funciona
em celular), com botões ↑ ↓ como alternativa acessível.

## Login

**[decidido]** Entrar com Google e depois Authenticator, para todos.

1. Clique em "Entrar com Google", em fluxo Authorization Code no servidor, com `state` e
   `nonce`. **[escolha do desenho]** Validar `iss`, `aud`, `exp`, `nonce` e `email_verified`.
2. O e-mail precisa estar cadastrado (comparação sem diferenciar maiúsculas). Google não
   cadastrado é recusado e nenhuma conta é criada. No primeiro login, guardar o `sub` do Google
   e, a partir daí, identificar a conta por ele. **[escolha do desenho]**
3. Primeiro acesso: mostrar QR, confirmar com um código válido e só então ativar. Demais
   acessos: pedir o código.
4. Só depois disso a sessão vale. Admin vai para `/admin/`, dono para `/minhatela`. Um único
   fluxo e uma única página de código atendem os dois.

**[escolha do desenho]** Sem senha: `/api/login` e o formulário de senha do admin são removidos
e `ADMIN_PASSWORD` deixa de ser usada. A tela de login do admin vira o botão do Google.

Requisitos de segurança **[escolha do desenho]**:
- TOTP SHA-1, 6 dígitos, 30 segundos, tolerância de ±1 janela. Testar com os vetores da RFC 6238.
- Código já usado não vale de novo (guardar a última janela aceita).
- Limitar tentativas por conta e por IP. O limite atual por IP não basta.
- Segredo TOTP cifrado no banco (AES-256-GCM, chave em `TOTP_ENCRYPTION_KEY`), porque
  `scripts/backup.sh` copia o `data.sqlite` para o Google Drive.
- `req.session.regenerate` ao concluir cada etapa, cookie `secure` em produção.
- Estado "Google ok, falta código" é separado do estado autenticado e não abre nenhuma rota de
  API além da de verificação.

## Autorização

**[escolha do desenho]**
- `requireAdmin` passa a proteger todas as rotas atuais que usam `requireAuth`.
- `requireOwner` protege as rotas novas da `/minhatela`, e toda rota confere se a tela é do
  usuário logado, a partir da sessão.
- Admin não usa as rotas de dono; ele já tem a Programação.

## Dados

**[escolha do desenho]** Migração no estilo atual de `server.js` (`CREATE TABLE IF NOT EXISTS`
e checagem em `pragma_table_info`).

- Nova tabela `users`: id, email único, role (`admin`/`owner`), googleSub, totpSecret cifrado,
  totpEnabledAt, totpLastStep, createdAt.
- `screens.ownerId`: cada tela tem no máximo um dono; um dono pode ter várias telas.
- `media.ownerScreenId`: preenchido indica imagem de dono, ligada a uma única tela. Vazio indica
  mídia do admin. A posse fica com a tela, então trocar o dono mantém as imagens.
- A sequência continua em `playlist_items`, no formato que o player e a galeria já leem.
  A galeria pública do QR mostra também as imagens do dono.
- A quantidade de imagens do dono é contada pelos itens da lista daquela tela, nunca só por
  `media`, para uma imagem fora da lista não ocupar vaga.

## Pontos do código existente que mudam

- `PUT /api/playlists/:screenId` apaga e recria a lista a partir do que o painel carregou antes.
  **[escolha do desenho]** Toda leitura da lista devolve uma versão. A reordenação do dono e todo
  `PUT` do admin a conferem: lista desatualizada responde 409, nada é gravado e a tela avisa e
  recarrega. Adicionar, editar e apagar do dono agem sobre ids de item e respondem 404 quando o
  item já não existe; o `POST` do admin só acrescenta ao fim. Nenhum dado é perdido quando os
  dois editam ao mesmo tempo.
- A reordenação do dono usa uma rota própria que aceita apenas uma permutação exata da lista
  atual, sem alterar duração nem datas de anúncio.
- A remoção de imagem de dono pelo admin usa rota própria, que apaga registro, item da lista e
  arquivo. Tirá-la de um `PUT` não vale como remoção: o `PUT` do admin precisa manter todas as
  imagens de dono da lista atual, senão responde 400.
- `POST /api/impression` só registra mídia que existe e não tem `ownerScreenId`, para o relatório
  do anunciante seguir limpo mesmo depois que a imagem for excluída (a TV ainda pode tentar
  exibi-la por até 5 minutos).
- **[decidido]** Em `public/tv/player.js`, resposta bem-sucedida com lista vazia passa a limpar a
  programação (também no cache local) e a TV mostra "Sem conteúdo programado". Em falha de rede ou
  erro do servidor, continua repetindo a última programação válida, como hoje. Isso também vale
  quando todas as campanhas de uma tela vencem. Manter o código em ES5 e testar em uma TV real.
- `GET /api/media` e o seletor de mídia do admin não listam imagens de dono. A Programação do
  admin as mostra marcadas como "do dono", com opção de remover.
- `DELETE /api/screens/:id` também apaga as imagens de dono daquela tela, inclusive os arquivos.
- Excluir imagem do dono remove registro, item da lista e arquivo.
- Upload do dono em rota própria, usando o `multer` existente: aceita apenas JPEG, PNG e WebP,
  verificados pelo conteúdo do arquivo (não pelo mimetype enviado), até 10 MB, com extensão
  definida pelo servidor. Conferir o limite de 6 no servidor, em transação.
- Painel admin (tela Telas): cadastrar e-mail do dono, vincular à tela, zerar 2FA, remover conta.
  Remover conta desvincula as telas e encerra o acesso; as imagens seguem na tela.

## Implantação e recuperação

O push em `master` publica sozinho em produção (`.github/workflows/deploy.yml`), e a senha do
admin deixa de existir nesse momento. Por isso, **antes do push**, o `.env` do servidor precisa
de `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `TOTP_ENCRYPTION_KEY` e `ADMIN_EMAIL`, e a URI de
callback precisa estar registrada no Google Cloud.

- Ao subir, o servidor cria o admin a partir de `ADMIN_EMAIL`, se não existir. Sem as variáveis
  obrigatórias, o servidor registra erro claro e não sobe.
- `scripts/reset-2fa.js <email>`, rodado no servidor, zera o 2FA de qualquer conta. É a saída se
  o admin perder o celular. **[escolha do desenho]**
- As sessões ficam em memória (`MemoryStore`), então cada deploy pede novo login. Mantido como
  está nesta versão.
- O README precisa documentar as novas variáveis e a criação das credenciais do Google.

## O que o Julio precisa providenciar

- Projeto no Google Cloud com a tela de consentimento OAuth em produção (escopos básicos:
  `openid email`), Client ID e Secret.

## Testes

- Teste único em `node:test`, sem dependência nova, cobrindo: vetores TOTP, reutilização de
  código, limite de 6, limite de 7 segundos, reordenação (permutação válida e inválida), dono
  tentando remover anúncio, dono acessando tela alheia, dono em rota de admin, e sessão com
  Google sem código acessando a API.
- Verificação manual do login real com Google, do arrastar em celular de verdade e, em uma TV real,
  da lista vazia (com e sem internet).

## Liberdade de quem constrói

Nomes de rotas e colunas, estrutura interna do código, textos da interface e organização dos
arquivos, respeitando as decisões acima.

## Atenção ao começar

O repositório tem alterações não commitadas em `schedule.component.ts` e
`media-picker.component.ts`, mais o novo `media-picker.component.spec.ts`. Não são deste
trabalho e tocam a mesma área; não as sobrescrever nem misturar no mesmo commit.
