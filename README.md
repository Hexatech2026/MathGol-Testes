# MathGol

Jogo de pênaltis com matemática para crianças do fundamental. A criança
responde uma conta e, se acertar, escolhe **onde** chutar, **que tipo de
chute** (rasteiro, meia-altura ou cavadinha) e com **que força**.

```text
PERGUNTA
├─ Resposta errada ou tempo esgotado
│  └─ Defesa do goleiro
└─ Resposta correta
   ├─ Escolha da mira
   ├─ Escolha da altura (tipo de chute)
   ├─ Escolha da força
   └─ Chute
      ├─ Bola dentro → gol
      └─ Bola fora → fora
```

Resposta correta impede a defesa do goleiro, mas **não garante gol**: mira,
tipo de chute e força decidem. A regra fica em uma função pura, `JS/regras-chute.js`,
compartilhada pela cena 3D, pelo modo simplificado 2D e pelos testes.

### Tipos de chute (barra de altura)

A altura **muda o resultado de verdade** (não é só animação):

| Tipo (barra) | Efeito | Faixa ideal de força |
|---|---|---|
| ⬇️ Rasteiro (esquerda) | bola baixa: não sobe acima de 0,9 m (não pega o ângulo), desvia menos para o lado | 45%–85% (pede força) |
| ⚽ Meia-altura (meio) | a bola vai onde a criança mirou | 35%–75% |
| ☁️ Cavadinha (direita) | bola sobe e cai ~0,35 m acima da mira, um pouco mais para o centro; mirar alto passa por cima | 15%–50% (pede toque leve) |

A faixa "ideal" aparece marcada na barra de força (com texto, não só cor) e
muda conforme o tipo escolhido.

### Força

| Força | O que acontece |
|---|---|
| Dentro da faixa ideal do tipo | a bola vai para o ponto calculado pelo tipo |
| Fraca demais | a bola perde altura e pode não chegar ao gol |
| Forte demais | a bola sobe e pode passar por cima do travessão |
| Fora da faixa | a bola também desvia para o lado (mirar colado na trave fica arriscado) |

Garantias testadas: no centro do gol, força mínima e máxima **sempre** vão
para fora em todos os tipos; mira fora do gol é fora com qualquer força; e a
força ideal é sempre a melhor escolha (uma força ruim nunca "salva" um
chute). A bola conta como dentro só se passar **inteira** (o raio da bola
é descontado das traves e do travessão).

Sem nome real, sem e-mail e sem cadastro: a nuvem usa **login anônimo** do
Firebase.

## Estrutura do projeto

```
index.html   entrada na raiz → redireciona para HTML/index.html (link relativo)
HTML/        index.html (o jogo)
CSS/         styles.css
JS/          regras-chute.js, backup-validacao.js, carregar-externos.js, data.js, avatar-data.js,
             questions.js, banco-questoes.js, narration.js, sfx.js,
             game.js, game-2d.js, progressao.js, main.js,
             firebase-config.js, seed-firestore.js
Config/      firestore.rules
Imagens/     logos, estrela, favicon, foto da equipe
tests/       unit/ (Node), e2e/ (Playwright), rules/ (Firebase Emulator)
raiz         package.json, firebase.json, playwright.config.js, vercel.json
```

| Arquivo | O que é |
|---|---|
| `JS/regras-chute.js` | **regra pura** de gol / fora / defesa (sem DOM, testável) |
| `JS/game.js` | cena 3D do pênalti (Three.js r149) |
| `JS/game-2d.js` | modo simplificado 2D (DOM + CSS), mesmo contrato e mesma regra do 3D |
| `JS/main.js` | navegação, ciclo de vida da partida, mira/força (Pointer Events + teclado), modais |
| `JS/backup-validacao.js` | validação de backups e de resultados antes de gravar |
| `JS/data.js` | listas padrão + validação das configurações vindas do Firestore |
| `JS/progressao.js` | fases, desbloqueio e recordes (localStorage) |
| `JS/firebase-config.js` | Firebase Auth anônimo + Firestore |
| `JS/seed-firestore.js` | script Node que popula as coleções de configuração |
| `Config/firestore.rules` | regras de segurança (publicar no Console) |

## Fases

As três fases usam **a mesma mecânica de pênalti**. Muda só a quantidade de
cobranças, o tempo para responder e o nível das contas:

| Fase | Cobranças | Tempo | Desbloqueia a próxima com |
|---|---|---|---|
| Pênaltis | 3 | 15 s | 2 gols |
| Falta | 5 | 12 s | 3 gols |
| Final | 7 | 10 s | — |

"Falta" é só o nome da fase: **não existe** mecânica de cobrança de falta
(barreira etc.). O título do resultado acompanha a fase jogada ("Fim da fase
Pênaltis!", "Fim da fase Falta!", "Fim da Final!").

## Controles

- **Mouse**: mova para mirar, clique para confirmar; clique para travar a altura e a força.
- **Toque**: toque (ou arraste o dedo e solte) para mirar; toque para travar altura e força.
  Cada toque avança exatamente uma etapa.
- **Teclado**: setas movem a mira; **Enter** ou **Espaço** confirmam cada etapa.
- Logo depois de mudar de etapa, entradas são ignoradas por 0,45 s: um
  duplo clique/toque confirma só uma etapa.
- A mira fica vermelha quando está fora do gol e ganha um ✓ quando travada.

## Layout

- **Retrato** (celular em pé): pergunta → campo → controles, com o campo na
  largura toda.
- **Paisagem / desktop**: campo grande à esquerda (≈66% da largura em
  1366×768 e 1920×1080), pergunta e controles à direita.
- O campo é dimensionado pela largura **e** pela altura da janela, então a
  tela cheia só aumenta o campo. Não há zoom nem `transform: scale`, e o
  pinch-to-zoom continua liberado.
- Durante a partida o fundo animado (e o "GOL!" decorativo) e o rodapé
  somem.

## Modo 3D, modo simplificado e modo offline

| Situação | O que acontece |
|---|---|
| Three.js carregou e há WebGL | cena 3D |
| Three.js não carregou (CDN fora, **travado** ou sem internet) ou WebGL indisponível | **modo simplificado 2D**, com aviso discreto "Modo simplificado ativo (sem 3D)". Mesma regra: mira, altura e força continuam valendo |
| Nem o modo 2D consegue abrir | a partida **não começa** e aparece uma mensagem clara. Nunca há gol automático |
| Firebase indisponível | o jogo funciona normalmente; só não salva na nuvem (progresso e recordes ficam no navegador) |

Nenhum CDN bloqueia a abertura do jogo: o Three.js é carregado com
`async`, o Firebase por `import()` dinâmico (`JS/carregar-externos.js`) e as
fontes sem bloquear a renderização. Se um CDN travar (sem responder), o menu
abre normalmente, a partida usa o modo simplificado e a nuvem fica
desligada. O jogo **não funciona 100% offline** na primeira visita: os
próprios arquivos do jogo precisam ser baixados.

### Dependências externas (CDN)

| O quê | De onde |
|---|---|
| Three.js r149 (`three@0.149.0`) | `cdn.jsdelivr.net` |
| Firebase JS SDK 12.18.0 (app, auth, firestore) | `www.gstatic.com` |
| Fontes Fredoka e Atkinson Hyperlegible | `fonts.googleapis.com` |
| Avatares (pixel-art) | `api.dicebear.com` (com fallback local) |
| Bandeiras | `flagcdn.com` |

## Firebase — segurança e configuração

### Como os dados são protegidos

- Cada navegador faz **login anônimo** (`signInAnonymously`). O Firebase emite
  um `uid`; esse `uid` é o id dos documentos do jogador.
- As regras (`Config/firestore.rules`) só deixam cada usuário acessar:
  `jogadores/{uid}`, `jogadores/{uid}/resultados/{id}` e `apelidos/{uid}`.
- Política de leitura/exclusão: o dono só **lê** o próprio documento e
  **lista** o próprio histórico (necessário para o backup). Ninguém lista a
  coleção `jogadores` e **nenhum cliente apaga** dados; exclusão é feita pela
  equipe (Console/Admin SDK), a pedido.
- Toda escrita é validada nas regras: campos permitidos, tipos, tamanho de
  textos e limites plausíveis de gols, pontos e tempo. Campo inesperado é
  recusado.
- As coleções de configuração (`personagens`, `animais`, `selecoes`,
  `dificuldades`) são de leitura pública e escrita negada. O que vem delas é
  validado no navegador e montado com `createElement`/`textContent` (nada de
  `innerHTML` com dado remoto).

> **Importante:** a versão anterior usava um UUID salvo no `localStorage`
> ("token") e regras `allow read, write: if true`. Isso **não era
> proteção**: qualquer pessoa podia listar, ler, alterar ou apagar os dados de
> qualquer jogador. Conhecer um id não é autenticação.

**App Check** pode ser ativado como camada extra contra abuso automatizado
(scripts gravando em massa), mas **não substitui** o login nem as regras.

### Checklist (manual, no Console do Firebase)

1. **Authentication → Método de login → Anônimo → Ativar.**
   Sem isso o login falha e o jogo segue sem salvar na nuvem.
2. **Authentication → Configurações → Domínios autorizados**: adicione o
   domínio do deploy (ex.: `seu-usuario.github.io`, `mathgol.vercel.app`).
3. **Firestore → Regras**: cole `Config/firestore.rules` e publique
   (ou `npx firebase deploy --only firestore:rules`).
4. **Seed das configurações** (uma vez):
   ```bash
   npm install
   cp .env.example .env   # credenciais do Admin SDK (Contas de serviço)
   npm run seed
   ```

### Registros antigos (baseados em token)

Os documentos antigos `jogadores/{token}`, `jogadores/{token}/resultados` e
`apelidos/{token}` continuam no banco, mas **ficam inacessíveis para qualquer
cliente** com as novas regras (o `uid` nunca é igual a um UUID antigo, e o
fallback nega tudo).

Não existe migração automática pelo navegador de propósito: "provar" que um
token era seu é impossível, porque qualquer um podia ler qualquer token. Uma
migração assim deixaria alguém reivindicar os dados de outra pessoa.

O que fazer com eles:

- **Recomendado:** exportar (se quiser guardar) e apagar esses documentos com
  o Admin SDK ou pelo Console. Eles não têm dado pessoal além do apelido
  inventado, mas não há motivo para mantê-los.
- O progresso que importa para a criança (fases desbloqueadas e recordes) está
  no `localStorage` do navegador, que **não foi afetado**.
- O jogo remove a chave `mathgol_token` do navegador ao abrir; ela não é
  exportada nem restaurada em backups.

## Backup

| Ação | O que faz |
|---|---|
| 📥 Exportar Progresso Local | `.json` só com as chaves conhecidas: `mathgol_acessibilidade`, `mathgol_progressao`, `mathgol_ultimo_resultado` |
| ☁️ Exportar Dados do Firebase | `.json` com perfil (apelido + avatar) e histórico de resultados do usuário logado. Sem `uid` e sem token |
| 📤 Restaurar Backup | valida e restaura |

A restauração (e também a leitura normal do progresso local) confere a
coerência com as fases: recorde de gols até o número de cobranças da fase,
pontos entre 10 e 100 por gol, fases desbloqueadas em ordem e só com os gols
que as liberam. A restauração também: limita o arquivo a 256 KB, confere `versao` e `tipo`, aceita
só as chaves da lista acima (chave desconhecida = arquivo recusado; o antigo
`mathgol_token` é ignorado), valida o formato de cada valor e de cada
resultado, exige que `resultados` seja uma lista, não altera o objeto lido do
arquivo e mostra erro amigável para arquivo incompleto, incompatível ou
adulterado. Backups da nuvem do formato antigo (v1, com token) são
recusados. O backup da nuvem é sempre gravado no usuário **atual**.

## Rodando localmente

👉 **Passo a passo em [`COMO-RODAR.md`](COMO-RODAR.md).**

```bash
npm start
# abra http://localhost:5500/  (redireciona para /HTML/index.html)
```

Abrir o arquivo com duplo clique (`file://`) não funciona: o
`firebase-config.js` é um módulo ES.

## Testes

```bash
npm install
npm run test:unit    # regra do chute + validação de backup (Node, sem navegador)
npm run test:e2e     # Playwright: fluxo, toque, teclado, fallback, layout, modais
npm run test:rules   # regras do Firestore no Firebase Emulator (precisa de Java 11+)
npm test             # unit + e2e
```

Os testes E2E não usam internet: o Three.js é servido do `node_modules`
(mesma versão do CDN) e o Firebase é bloqueado. Na primeira vez, se o
Playwright pedir, rode `npx playwright install chromium`.

## Deploy

Site estático, sem build. Nenhuma variável de ambiente é necessária no
deploy (o `.env` só serve para o `npm run seed`).

- **GitHub Pages**: Settings → Pages → Deploy from branch → `main` / `/ (root)`.
  O `index.html` da raiz redireciona para `HTML/index.html` com link
  **relativo**, então funciona em `https://usuario.github.io/repositorio/`.
  URL direta do jogo: `https://usuario.github.io/repositorio/HTML/index.html`.
- **Vercel**: importe o repositório (Framework Preset "Other"). O
  `vercel.json` faz `/` servir `HTML/index.html`.

Depois do deploy, adicione o domínio em **Authentication → Domínios
autorizados** (senão o login anônimo falha nesse domínio).

## Créditos

| Integrante | Papel |
|---|---|
| Danillo Fernandes Gomes | Full Stack |
| Pablo Neris Santiago | Product Owner |
| Daniel Bandeira Baldini | Scrum + QA |

Faculdade Cruzeiro do Sul — Unidade Paulista · Equipe HexaTech.
