# MathGol

Jogo de pênaltis com matemática para crianças do fundamental. Cada zona do
gol é uma alternativa da pergunta: chutar na zona certa = gol; chutar na
zona errada = o goleiro defende ali mesmo.

100% anônimo: sem nome real, sem e-mail, sem cadastro — só um token
aleatório salvo no navegador (`localStorage`).

## Estrutura do projeto

Os arquivos ficam separados por tipo, cada um na sua pasta:

```
.vscode/  settings.json, extensions.json, tasks.json, launch.json
CSS/      styles.css
Config/   firestore.rules
HTML/     index.html
Imagens/  favicon.ico, hexatech-logo.png, hexatech-logo-hero.png, estrela-cruzeiro.png
JS/       data.js, avatar-data.js, questions.js, banco-questoes.js, narration.js,
          sfx.js, game.js, progressao.js, main.js, firebase-config.js, seed-firestore.js
raiz/     README.md, COMO-RODAR.md, package.json, package-lock.json, vercel.json
```

| Arquivo | O que é |
|---|---|
| `HTML/index.html` | página principal |
| `CSS/styles.css` | todo o CSS |
| `JS/data.js` | listas padrão (apelidos, seleções, dificuldades) + mensagens de resultado |
| `JS/avatar-data.js` | categorias/estilos de avatar (DiceBear) da tela de personalizar |
| `JS/questions.js` | gerador das perguntas de matemática por dificuldade |
| `JS/banco-questoes.js` | banco curado de questões + validação de cada pergunta |
| `JS/narration.js` | narração por voz (Web Speech API) |
| `JS/sfx.js` | efeitos sonoros gerados na hora (Web Audio API, sem arquivos de áudio) |
| `JS/game.js` | cena 3D do pênalti em Three.js (r149) |
| `JS/progressao.js` | desbloqueio de fases e recordes salvos |
| `JS/main.js` | navegação entre telas e orquestração do estado do jogo |
| `JS/firebase-config.js` | inicializa o Firebase no navegador e fala com o Firestore |
| `JS/seed-firestore.js` | script Node que popula o Firestore (rodar 1x, localmente) |
| `Config/firestore.rules` | regras de segurança do Firestore (publicar no Console) |
| `vercel.json` | faz `/` servir `HTML/index.html` no deploy |
| `package.json` | dependências do `seed-firestore.js` (`dotenv`, `firebase-admin`) |

Como o `index.html` está dentro de `HTML/`, os caminhos dentro dele são
relativos (`../CSS/styles.css`, `../JS/main.js`, `../Imagens/...`) e o
`vercel.json` cuida de apontar a raiz do site pra ele.

**Não existe pasta `api/`.** O jogo fala direto com o Firestore pelo
navegador (via `JS/firebase-config.js`); as antigas funções serverless
(`api/session.js`, `api/progress.js`) não eram mais usadas por nada — eram
sobra de uma versão anterior — então foram removidas. Isso também significa
que o site é **estático puro**: não precisa configurar nenhuma variável de
ambiente pra ele funcionar publicado (as variáveis do `.env` só existem pra
você rodar `npm run seed` na sua máquina).

## Banco de questões — escada de 12 níveis

### O problema que isso resolve

Existiam 3 dificuldades (`facil` / `medio` / `dificil`) e a fase escalava
sozinha assim:

```
facil → fase 1 facil · fase 2 medio · fase 3 dificil
```

Ou seja: a criança somava `2 + 3` na fase 1 e encarava `7 × 9` e divisão na
fase 3, na mesma sessão. Com só três degraus, cada passo era um abismo. Era a
reclamação de quem testou.

### A escada nova (`JS/niveis.js`)

12 níveis pequenos. Cada um declara **tipo de operação** e **quantidade de
dígitos**, então dá pra pedir "só subtração de 2 dígitos" sem tocar em código.

| Nível | Nome | Tipo | Tamanho |
|---|---|---|---|
| 1 | Primeiros gols | soma | até 10 |
| 2 | Tirando de pouquinho | subtração | até 10 |
| 3 | Vai e volta | soma, subtração | até 10 |
| 4 | Passando do 10 | soma | resultado 11–18 |
| 5 | Voltando do 20 | subtração | 2 dígitos |
| 6 | Dezenas certinhas | soma | 2 dígitos, sem "vai um" |
| 7 | Com o vai um | soma, subtração | 2 dígitos |
| 8 | Tabuada do começo | multiplicação | ×2 a ×5 |
| 9 | Tabuada inteira | multiplicação | ×2 a ×10 |
| 10 | Dividindo igual | divisão exata | ÷2 a ÷5 |
| 11 | Divisão inteira | divisão exata | ÷2 a ÷10 |
| 12 | Craque das contas | as quatro | misto |

**A fase agora sobe UM degrau** (`PASSO_POR_FASE` em `progressao.js`). Quem
começa no 5 faz 5 → 6 → 7, não 5 → 11.

Progresso antigo não se perde: `DIFICULDADE_PARA_NIVEL` traduz
`facil → 1`, `medio → 4`, `dificil → 8`.

### Banco curado mais simples de revisar

Cada entrada virou `[a, b, tipo]` — o enunciado, o texto falado e as 5
alternativas saem de `montarPergunta()`, o mesmo caminho do gerador. Antes as
distratoras eram escritas à mão uma a uma, o que é onde erro de digitação
aparece. Um professor consegue revisar a lista inteira agora.

As distratoras também acompanham a grandeza do resultado: errar "48" por 1
unidade era quase sorteio, então em número grande as opções se afastam mais.

O banco se autoconfere ao carregar e avisa no console se alguma conta for
inválida (divisão não exata, subtração negativa).

## HU-14 — Sala do Professor

Mesmo molde do "código do craque": o professor cria a sala, recebe um código
curto (`K4P-7MN`) e dita para a turma. Sem login, sem e-mail, sem nome real.

**O professor pode:**
- escolher o nível das contas da turma e trocar no meio da aula
- restringir a sala a tipos de conta (só subtração, por exemplo)
- acompanhar a turma ao vivo — apelido, gols e pontos, ordenado por gols

**A criança:** digita o código no menu e pronto. O nível passa a ser o que o
professor definiu, e a tela de escolha de nível some (ela não escolhe mais).
A sala fica lembrada no navegador, então não precisa digitar de novo.

```
salas/{codigo}                 → { nome, nivel, tipos, dono, criadoEm }
salas/{codigo}/alunos/{token}  → { apelido, avatarSeed, gols, pontuacao, fase }
```

O painel usa `onSnapshot` (lista ao vivo). O cancelamento é guardado dentro do
módulo e chamado ao sair da tela — listener de Firestore esquecido aberto
consome leitura sem parar.

### A ressalva de segurança

`dono` guarda o token do professor mas **não é autenticação**: quem souber o
código pode mudar o nível da sala, e a lista de alunos é legível por qualquer
um com o código. Para turma real isso precisa de Firebase Auth anônimo com
checagem de `dono` nas regras.

Enquanto o conteúdo é apelido + placar (sem nome real, sem e-mail), o risco é
baixo — mas é exatamente o que o card **R03** tem que resolver antes de rodar
com turma de verdade. Está comentado em `Config/firestore.rules`.

## HU-22 / HU-23 — Loja e Cruzeiros

A pontuação deixou de morrer no fim da fase: agora vira **Cruzeiros**, a moeda
do jogo (o mesmo ícone de estrela que já aparecia no placar).

### O que passou a ser pago

Antes tudo era liberado. Agora a criança começa com o mínimo e compra o resto:

| | Grátis | Na loja |
|---|---|---|
| Seleções | 2 (Brasil, Argentina) | 10 |
| Clubes do Brasileirão 2026 | — | 20 |
| Personagens | 6 | 24 |
| Animais | 5 | 15 |
| Avatares | 8 (categoria Craques) | 40 |

Preços em `JS/loja-dados.js` (`PRECOS`) e a lista do que nasce livre em
`LIBERADO_DE_INICIO`. Uma fase rende de 120 a 180 Cruzeiros, então: nome ~ meia
fase, seleção ~ 1 fase, clube ~ 1 fase e meia. **Todos os clubes custam igual de
propósito** — preço diferente por time vira discussão na sala de aula.

Item bloqueado **não some da tela**: aparece com cadeado e leva direto pra aba
certa da loja. A criança precisa ver que existe pra querer juntar.

### Clubes: escudos são desenhados por nós

Os 20 participantes da Série A 2026 (subiram da B: Coritiba, Athletico-PR,
Chapecoense e Remo). `JS/loja-dados.js` guarda só **cores e sigla** de cada
clube; o escudo é um SVG autoral gerado por `Loja.escudo()`.

**Nenhum escudo oficial é reproduzido ou baixado** — os escudos dos clubes são
marca registrada. Se alguém trocar isso por arte oficial, a decisão sobre uso
de marca passa a ser de vocês.

### Carteira mora no Firebase, não no navegador

`jogadores/{token}` guarda `saldo` e `comprados`. Nada em `localStorage`: a
criança joga no laboratório e quase nunca pega a mesma máquina duas vezes.

Só que o **token nasce no navegador** — em outro computador ela seria um
jogador novo. Por isso existe o **código do craque**: um código de 6 caracteres
(`ABC-123`) que ela anota e digita em qualquer máquina pra voltar com os
Cruzeiros e as compras. Continua anônimo — o código aponta pro mesmo token
opaco de sempre, sem nome nem e-mail.

O alfabeto do código não tem `0`, `O`, `1`, `I` nem `L`, pra não gerar dúvida
ao copiar do papel.

### Duas decisões de segurança que valem revisar

1. **`Loja.creditar()` se recusa a somar se a carteira não foi lida.** Sem isso,
   uma falha de rede no início somaria em cima de um saldo zerado e apagaria
   tudo que a criança tinha.
2. **A compra só desconta depois que o Firestore confirma.** Se a gravação
   falhar, o saldo e os itens voltam ao que eram.

E uma que **não** está resolvida: `codigos/{codigo}` tem leitura aberta, então
quem testar códigos em massa encontra contas de terceiros. Sem dado pessoal e
sem ranking isso é tolerável, mas é exatamente o que o card **R03** precisa
reavaliar antes de rodar com turma de verdade.

### Arquivos

| Arquivo | O que faz |
|---|---|
| `JS/loja-dados.js` | catálogo: clubes, preços, o que nasce livre |
| `JS/loja.js` | carteira, compra e o gerador de escudo SVG |
| `JS/firebase-config.js` | `buscarCarteira`, `salvarCarteira`, código do craque |
| `Config/firestore.rules` | regra nova da coleção `codigos` |

## O que mudou na rodada anterior (HU-24 + ritmo do pênalti)

### 1. HU-24 — Créditos dos desenvolvedores

Botão **"Créditos"** no menu inicial abre um modal com a equipe. Cada
integrante tem um botão **ⓘ Sobre mim** que expande a apresentação dele
(acordeão: abrir uma fecha as outras).

| Integrante | Papel |
|---|---|
| Danillo Fernandes Gomes | Full Stack |
| Pablo Neris Santiago | Product Owner |
| Daniel Bandeira Baldini | Scrum + QA |

Mais o card da **Faculdade Cruzeiro Do Sul — Unidade Paulista** e a
assinatura da equipe HexaTech. O painel é rolável (`max-height: 86vh`) e o
botão vira só o ícone em telas abaixo de 400px. Funciona em alto contraste
e com espaçamento para dislexia.

Onde mexer: `HTML/index.html` (bloco `#sobreposicao-creditos`),
`CSS/styles.css` (seção "Modal de creditos") e `JS/main.js`
(`initCreditos()`).

### 2. HU-24 — Backup de código e banco de dados

Botão **"💾 Backup"** no menu inicial, com três ações:

| Ação | O que faz |
|---|---|
| 📥 Exportar Progresso Local | baixa um `.json` com tudo que está no `localStorage` (token, preferências de acessibilidade, recordes, fases desbloqueadas) |
| ☁️ Exportar Dados do Firebase | baixa um `.json` com o documento do jogador, o histórico completo de resultados e o apelido salvo no Firestore |
| 📤 Restaurar Backup | lê um `.json` dos dois tipos acima e restaura — o local recarrega a página, o do Firebase faz `merge` no Firestore |

Os arquivos saem nomeados com a data (`mathgol-backup-local-2026-09-21.json`).
Cada backup carrega `versao` e `tipo`, então a restauração recusa arquivo
que não seja do MathGol em vez de corromper os dados.

Onde mexer: `JS/firebase-config.js` (`exportarDadosFirebase`,
`restaurarDadosFirebase`) e `JS/main.js` (`initBackup()`).

### 3. Ritmo da animação do pênalti

Os tempos ficam todos na constante `TEMPO`, no topo de `JS/game.js`:

| Momento | ms |
|---|---|
| Corrida do batedor | 760 |
| Armar o chute | 300 |
| Perna descendo até a bola | 280 |
| Voo da bola | 1200 |
| Mergulho do goleiro | 1000 |
| Pausa antes de resetar | 1800 |

E `PAUSA_ENTRE_COBRANCAS` (2200ms) fica em `JS/main.js` — tem que ser maior
que `TEMPO.ANTES_DE_RESETAR` pra bola já estar de volta na marca quando a
próxima pergunta entrar. **`prefers-reduced-motion` continua respeitado**:
quem pede menos movimento resolve a jogada quase instantaneamente, com a
mesma ordem de eventos (contato → resultado → finalização).

## Rodadas anteriores (contraste)

### 1. Contraste

Auditoria automática de contraste em todas as 7 telas, nos dois modos
(normal e alto contraste), medindo a cor real de cada texto renderizado
contra o fundo real. Foram encontradas **7 falhas de WCAG AA**, todas
corrigidas:

| Onde | Antes | Agora |
|---|---|---|
| Chips de personagem/animal | **1.00:1** (texto branco sobre fundo branco — invisíveis no alto contraste) | 13.5:1 |
| Zona do gol errada | 2.64:1 | 7.04:1 |
| Selo "Sem texto livre" | 2.64:1 | 7.04:1 |
| Pontuação na tela de resultado | 1.99:1 | 5.82:1 |
| Zona do gol certa | 3.35:1 | 6.70:1 |
| Cronômetro (verde) | 3.35:1 | 6.70:1 |
| Botão "Ouvir novamente" | 3.99:1 | 7.04:1 |

A causa dos chips invisíveis: eles tinham sido desenhados como pílulas
translúcidas pra ficar por cima do cenário escuro do fundo. No **alto
contraste** esse cenário é escondido de propósito, e aí sobrava texto
quase branco sobre fundo branco. Agora os chips são sólidos, com texto
escuro e borda — funcionam com ou sem cenário atrás.

Outras correções de acessibilidade encontradas no caminho:

- O CSS dos avatares usava as classes `.opcao-avatar` / `.opcao-avatar-selecionada`,
  mas o `main.js` cria os botões como `.item-avatar` / `.avatar-selecionado`.
  As regras nunca casavam com nada: os avatares ficavam **sem anel de foco
  pelo teclado** (WCAG 2.4.7) e **sem marcação visível de selecionado**.
- "Selecionado" não depende mais de sombra (o alto contraste remove todas as
  sombras) nem só de cor: chips ganham um ✓ e avatares uma borda grossa.
- A paleta da identidade visual continua a mesma. O que entrou foram
  variantes escuras (`--verde-texto`, `--azul-texto`, `--vermelho-texto`,
  `--amarelo-texto`) usadas **só onde há texto** por cima da cor.

## O que foi corrigido em rodadas anteriores

1. **Avatares da aba "Bichinhos" quebrados (voltava o círculo com a letra
   "B").** A causa: `avatar-data.js` usava o estilo `critters` pra essa
   categoria, mas **esse estilo não existe** na API do DiceBear (a lista
   oficial de estilos não tem `critters`). Toda imagem dessa aba dava 404 e
   caía no fallback local (círculo colorido com a inicial da seed — e como
   todas as seeds começam com "Bola", sempre aparecia "B"). Troquei para
   `big-ears`, que é um estilo real e válido do DiceBear 10.x. As outras 7
   categorias (`thumbs`, `fun-emoji`, `bottts`, `croodles`, `big-smile`,
   `pixel-art`, `notionists`) já eram estilos válidos — conferi um por um.
2. **`<img id="avatar-img" src="">` na tela de personalizar.** Um `src`
   vazio faz o navegador disparar um evento de erro imediatamente ao
   carregar a página (antes de qualquer JS rodar), o que gera ruído
   desnecessário. Removi o atributo `src` do HTML — a imagem só recebe uma
   URL de verdade quando `main.js` monta o avatar.
3. **Código morto removido:** `api/session.js`, `api/progress.js`,
   `api/_lib/` e `scripts/teste-local.js`. Nenhum desses arquivos era mais
   chamado por nada — o jogo mudou pra falar direto com o Firestore há uma
   atualização, e esses arquivos ficaram pra trás (inclusive com comentário
   desatualizado dizendo "o front-end nunca fala direto com o Firestore",
   que já não é verdade). `scripts/seed-firestore.js` continua existindo
   (é usado de verdade), só que agora na raiz e sem depender de
   `api/_lib/firebaseAdmin.js` — a inicialização do Admin SDK foi
   incorporada nele mesmo.
4. **Pastas eliminadas.** `public/`, `api/`, `api/_lib/` e `scripts/` não
   existem mais — tudo na raiz (ver tabela acima).
5. **Conferido e OK (não eram bugs):** a versão do Firebase JS SDK
   (`12.18.0`) e a versão do Phaser (`3.80.1`, agora substituído por Three.js r149) usadas via CDN são válidas e
   atuais; as coordenadas das 5 zonas do gol em `game.js` batem
   exatamente com as posições dos botões em `styles.css`; as regras do
   Firestore (`firestore.rules`) já liberam exatamente as leituras/escritas
   que o código faz.

Se depois de publicar isso você ainda ver algum erro específico no console,
me manda a mensagem exata (e em que tela aparece) que eu já reviso
direcionado.

## Firebase — checklist de configuração

1. **Firestore Database** criado no [Console do
   Firebase](https://console.firebase.google.com/) do projeto `math-gol`,
   em modo produção.
2. **Regras publicadas**: Firestore Database → Regras → cole o conteúdo de
   `firestore.rules` → Publicar. (Ou via CLI: `firebase deploy --only
   firestore:rules`.)
3. **Seed das listas de configuração** (`personagens`, `animais`,
   `selecoes`, `dificuldades`):
   ```bash
   npm install          # instala firebase-admin + dotenv
   cp .env.example .env # preencha com as credenciais (Configurações do
                         # projeto > Contas de serviço > Gerar nova chave privada)
   npm run seed
   ```
   Seguro rodar mais de uma vez — sobrescreve, não duplica. Se alguma
   coleção estiver vazia (antes do seed) ou o Firestore ficar indisponível,
   o jogo cai automaticamente nas listas fixas de `data.js` — nada quebra.

## Rodando localmente (VS Code)

👉 **Passo a passo completo em [`COMO-RODAR.md`](COMO-RODAR.md).**

Resumo: abra a **pasta** do projeto no VS Code, clique com o botão direito
em `HTML/index.html` → **"Open with Live Server"**. Ou, no terminal:

```bash
npm start
# depois abra http://localhost:5500/HTML/index.html
```

Como `firebase-config.js` é carregado como módulo ES (`type="module"`),
**abrir o `index.html` direto com duplo clique não funciona** — o navegador
bloqueia módulos carregados via `file://`. Tem que servir por HTTP.

A pasta `.vscode/` já vem configurada com:

| Arquivo | Pra quê |
|---|---|
| `settings.json` | Live Server servindo a raiz na porta 5500 |
| `extensions.json` | sugere instalar o Live Server ao abrir a pasta |
| `tasks.json` | tarefa "Servidor local (MathGol)" |
| `launch.json` | F5 abre no Chrome com breakpoints funcionando |

## Deploy

Site 100% estático, sem passo de build e sem função serverless — qualquer
host de arquivos estáticos serve:

- **Vercel**: importe o repositório, Framework Preset "Other" (ou deixe em
  branco). Vercel detecta o `index.html` na raiz e publica direto, sem
  precisar de `vercel.json`.
- **GitHub Pages**: Settings → Pages → Deploy from branch → `main` / `/
  (root)`.

Em ambos os casos não é preciso configurar nenhuma variável de ambiente —
elas só são usadas pelo `seed-firestore.js`, que você roda localmente.
