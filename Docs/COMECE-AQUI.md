# Base para o repositório novo

Este é o **`MathGol-VSCode-v1.5`** — o código de vocês, íntegro — **com o patch
de níveis e Sala do Professor já aplicado**. É só subir inteiro no repositório
de teste novo.

## Como cheguei aqui

Analisei os 10 zips que vocês tinham. Só um continha o projeto completo:

| Zip | Veredito |
|---|---|
| **MathGol-VSCode-v1.5** | ✅ **a base** — único com `carteira.js`, `tutorial.js`, `regras-chute.js`, `game-2d.js` e a loja de vocês |
| MathGol-VSCode-v1.4 / v1.4_1 | parcial — sem carteira, tutorial e loja |
| MathGol-VSCode | meu, antigo |
| MathGol-v8-NIVEIS-SALA | meu — **foi daqui que saíram os arquivos que quebraram o repositório** |
| MathGol-PATCH-niveis-sala | meu — o patch, já aplicado aqui |
| mathgol-3d / -v3 | meus, antigos |
| mathgol-melhorado / -cruzeiro-atualizado | estrutura antiga, sem pasta `JS/` |

Confirmação de que o v1.5 é o estado certo: o `JS/main.js` dele é **byte a byte
igual** ao `main.js` que vocês me mandaram hoje, antes do acidente.

## O que foi aplicado em cima do v1.5

**Arquivos novos (2):**
```
JS/niveis.js   — a escada de 12 níveis
JS/sala.js     — a Sala do Professor
```

**Substituídos (5):**
```
JS/questions.js       JS/banco-questoes.js     ← banco por nível
JS/main.js            HTML/index.html          CSS/styles.css
```

**Editados cirurgicamente (3) — o resto do arquivo intacto:**
```
JS/progressao.js      ESCALAR_DIFICULDADE → PASSO_POR_FASE  (tituloResultado preservado)
JS/firebase-config.js + onSnapshot no import, + 5 funções de sala, + 5 exports
Config/firestore.rules + bloco match /salas/{codigo}
```

**Intocados:** `carteira.js`, `loja.js`, `tutorial.js`, `regras-chute.js`,
`game-2d.js`, `game.js`, `data.js`, `avatar-data.js`, `backup-validacao.js`,
`carregar-externos.js`, `narration.js`, `sfx.js`, `seed-firestore.js`.

## Teste que rodei neste pacote

Servidor local com **todos os arquivos reais** (desta vez sem nenhum stub):

| | |
|---|---|
| 404 locais | **nenhum** |
| Erros de JS | **nenhum** (só CDN, que o meu sandbox bloqueia) |
| Módulos carregados | `Sala`, `NIVEIS`, `Loja`, `Carteira`, `Progressao`, `RegrasChute`, `AVATARES_GRATIS`, `initTutorial` — todos |
| Tela inicial | `tela-menu` |
| Jogar | abre o tutorial (primeira vez) |
| Tutorial / Loja / Entrar na sala / Sou professor / Créditos / Backup | **os 6 respondem** |

O erro `AVATARES_GRATIS is not defined` que derrubava o repositório antigo
**não acontece aqui** — o `avatar-data.js` é o de vocês.

## ⚠️ As regras publicadas hoje NÃO são as de vocês

As regras que estão no ambiente de teste agora são as **minhas antigas**, do
modelo pré-Auth:

| | Regras publicadas (minhas) | Regras de vocês (v1.5) |
|---|---|---|
| Identidade | `jogadores/{token}` | `jogadores/{uid}` com Firebase Auth |
| Acesso | `allow read, write: if true` | `ehDono(uid)` — só o próprio documento |
| Validação de escrita | nenhuma | schema completo, tipos e limites |
| Listar jogadores | permitido | `allow list: if false` |
| `/codigos/` | existe | **não existe** — é feature minha, morta aqui |

Ou seja: o banco está hoje **completamente aberto**, e qualquer um pode ler e
escrever o documento de qualquer criança. O `firestore.rules` deste pacote é o
**de vocês**, íntegro, com o bloco da sala somado no mesmo padrão.

**Publique este arquivo assim que subir o repositório.**

## A sala ficou segura (R03 resolvido para ela)

Como o código de vocês já usa Firebase Auth anônimo, deu pra escrever a regra
direito em vez de deixar aberta:

```
match /salas/{codigo} {
  allow get: if autenticado();              // a criança entra sabendo o código
  allow list: if false;                     // ninguém varre as salas
  allow create: if dono == request.auth.uid && salaValida(...)
  allow update: if resource.data.dono == request.auth.uid && ...
  match /alunos/{uid} {
    allow create, update: if ehDono(uid) && alunoValido(...)   // só o próprio
    allow list:           if ehProfessorDaSala(codigo)         // só o professor
  }
}
```

Saber o código dá **leitura** da sala (é como a criança entra), mas **não** dá
direito de trocar o nível nem de listar a turma. Cada criança só escreve o
próprio documento, com os campos e limites validados.

## Dois defeitos meus que corrigi aqui

**1. O patch quebrava o salvamento do progresso.** Eu fiz
`estado.dificuldadeId` virar número (1..12), mas o esquema 2 do resumo — e as
regras, e o `backup-validacao.js` — só aceitam `'facil'/'medio'/'dificil'`.
A escrita seria **recusada em silêncio**. Agora `montarResumoPartida()`
converte: níveis 1-3 → facil, 4-7 → medio, 8-12 → dificil. Testei os 12 níveis
contra o validador de vocês: todos OK.

> Se quiserem guardar o nível exato no histórico, é subir o esquema para 3 e
> ajustar junto `firestore.rules`, `backup-validacao.js` e `tests/rules/`.
> Não fiz porque mexe no contrato de dados e a decisão é de vocês.

**2. `atualizarSala()` apagava o nome da turma** a cada troca de nível — mandava
o objeto inteiro com `nome: 'Turma'` fixo. Agora só envia os campos que mudaram.

## Antes de subir

1. **Publique `Config/firestore.rules`** — as regras atuais estão abertas
2. **Apague os 10 zips** da pasta de downloads
3. Rodem `npm run test:rules` — vocês têm testes de regra em `tests/rules/`,
   e eu **não** escrevi testes para o bloco novo da sala

---

# Rodada de 07/10

## 1. Erro do console: login anônimo desligado

`auth/configuration-not-found` **não é bug de código** — é o provedor Anônimo
desligado no projeto do Firebase:

> Console do Firebase → Authentication → Sign-in method → **Anonymous** → Ativar

Enquanto estiver desligado, o jogo funciona mas **nada é salvo na nuvem**: sem
progresso, sem carteira e sem Sala do Professor.

O que mudei: a mensagem agora diz exatamente isso em vez de despejar o stack
trace do SDK, e `aguardarUsuario()` para de esperar o timeout inteiro quando o
login já falhou. As telas da Sala passaram a explicar o motivo
(`motivoNuvemFora()`) em vez de um "não consegui" genérico.

## 2. Esquema 3 — nível exato gravado, e a fase aparece pro professor

`versaoEsquema: 3` acrescenta **`nivelId` (1..12)** ao resumo da partida.
O que é gravado é o nível **efetivo da fase** (o de partida + um degrau por
fase), que é o que a criança realmente jogou.

- `dificuldadeId` continua no registro, com o balde equivalente, pra qualquer
  código que ainda leia esse campo
- **Esquema 2 continua aceito na leitura**: backup antigo restaura sem erro
- Ajustados juntos: `Config/firestore.rules`, `JS/backup-validacao.js`,
  `JS/main.js` e `JS/firebase-config.js`

No painel do professor cada criança agora mostra duas linhas:

```
  Craque Aguia                         3 ⚽  180
  🥅 Falta · Nível 6 · Dezenas certinhas
```

## 3. Tela inicial enxuta

Eram 6 botões empilhados competindo com o "Jogar". Agora:

- **Jogar** (destaque), e abaixo **Como jogar** e **Loja**
- Um link discreto **"Mais opções"** abre um modal com *Entrar na sala*,
  *Sou professor*, *Créditos* e *Backup*, agrupados em "Para a turma" e
  "Sobre o jogo"

Também tirei o logo grande da HexaTech do menu — ele aparecia junto do mascote,
do título e do subtítulo, quatro elementos de marca empilhados. A HexaTech
continua no rodapé ("Um jogo HexaTech"). **Se quiserem de volta, é uma linha:**
`<img class="logo-hero" src="../Imagens/hexatech-logo-hero.png" alt="HexaTech">`
no começo de `#tela-menu`.

## 4. Raiz organizada

| Saiu da raiz | Foi para |
|---|---|
| `COMO-RODAR.md`, `COMECE-AQUI.md` | `Docs/` |
| `playwright.config.js` | `tests/` (o script `test:e2e` aponta pra lá) |

**Ficou na raiz só o que é obrigatório:** `package.json`, `package-lock.json`
(npm), `vercel.json` (Vercel), `firebase.json` (Firebase CLI), `index.html`
(a entrada que redireciona pra `HTML/`), `README.md` (o GitHub mostra na capa),
`.gitignore`, `.env.example` e `.vscode/`.

## 5. Um defeito que o teste DE VOCÊS pegou

O `DEF-23` reprovou meu banco: no nível 1, o resultado **8 saía 7 vezes em 20**.
Eu tinha herdado isso do banco antigo — com resultado repetido a criança decora
a resposta em vez de somar.

Reescrevi os 12 bancos: no máximo **duas contas por resultado**, e a forma varia
(5 = 2+3 e 5 = 1+4). Também alarguei o nível 4 de 11–18 para 11–20, porque com
só 8 resultados possíveis era matematicamente impossível passar no limite de
15% em 20 perguntas — e "resultado até 20" é o que o nome do nível já dizia.

**Resultado: 37/37 testes passando**, incluindo dois que escrevi para a escada
(cada degrau só gera o tipo que declarou; a fase sobe um degrau e não um abismo).

Também precisei corrigir o harness: `tests/unit/progressao-e-questoes.test.js`
não carregava `niveis.js`, do qual `questions.js` e `progressao.js` agora
dependem.

## O que eu NÃO testei

`npm run test:e2e` e `npm run test:rules` precisam de `node_modules` e do
Firebase Emulator, que eu não tenho aqui. **Rodem os dois antes de publicar** —
o `test:rules` especialmente, porque mexi nas regras.
