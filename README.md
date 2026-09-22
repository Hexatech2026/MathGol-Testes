# MathGol

Jogo de pênaltis com matemática para crianças do fundamental. Cada zona do
gol é uma alternativa da pergunta: chutar na zona certa = gol; chutar na
zona errada = o goleiro defende ali mesmo.

100% anônimo: sem nome real, sem e-mail, sem cadastro — só um token
aleatório salvo no navegador (`localStorage`).

## Estrutura do projeto

Os arquivos ficam separados por tipo, cada um na sua pasta:

```
CSS/      styles.css
Config/   firestore.rules
HTML/     index.html
Imagens/  favicon.ico, hexatech-logo.png, hexatech-logo-hero.png, estrela-cruzeiro.png
JS/       data.js, avatar-data.js, questions.js, banco-questoes.js, narration.js,
          sfx.js, game.js, progressao.js, main.js, firebase-config.js, seed-firestore.js
raiz/     README.md, package.json, package-lock.json, vercel.json
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

## O que mudou nesta rodada (contraste + ritmo do pênalti)

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

### 2. Ritmo da animação do pênalti

A jogada inteira se resolvia em ~700ms: a criança clicava e o resultado já
estava na tela, sem dar pra ver o jogador chutar nem a bola entrar. Agora
dura ~1430ms, dividida em momentos que dá pra acompanhar:

| Momento | Antes | Agora |
|---|---|---|
| Preparação do chute (perna vai e volta) | 220ms | 420ms |
| Voo da bola até o gol | 480ms | 950ms |
| Mergulho do goleiro | 420ms | 780ms |
| Bola afundando na rede (no gol) | — | 260ms (novo) |
| Pausa antes da próxima pergunta | 1500ms | 1900ms |

Os tempos ficam todos na constante `TEMPO`, no topo de `JS/game.js`, então
dá pra ajustar o ritmo num lugar só. **`prefers-reduced-motion` continua
respeitado**: quem pede menos movimento resolve a jogada em ~100ms, com a
mesma ordem de eventos (contato → resultado → finalização).

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

## Rodando localmente

Como `firebase-config.js` é carregado como módulo ES (`type="module"`),
**abrir o `index.html` direto com duplo clique não funciona** (o navegador
bloqueia módulos carregados via `file://`). Sirva a pasta por HTTP:

```bash
npx serve .
# ou
python3 -m http.server
```

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
