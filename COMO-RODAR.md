# Como rodar o MathGol no VS Code

> **Atenção:** dar duplo clique no `index.html` **não funciona**. O
> `firebase-config.js` é um módulo ES (`type="module"`) e o navegador
> bloqueia módulos abertos via `file://`. Tem que servir por HTTP — é o que
> as opções abaixo fazem.

---

## Opção 1 — Live Server (mais fácil, recomendada)

1. Abra a **pasta do projeto** no VS Code
   (`Arquivo > Abrir Pasta...` → selecione a pasta `MathGol-VSCode`).
   Tem que ser a pasta inteira, não só o arquivo HTML.

2. Instale a extensão **Live Server** (o VS Code já vai sugerir ao abrir a
   pasta, porque ela está em `.vscode/extensions.json`).
   Se não sugerir: aba de Extensões (`Ctrl+Shift+X`) → busque
   `Live Server` → autor **Ritwick Dey** → Instalar.

3. No Explorer, abra `HTML/index.html`, clique com o **botão direito** e
   escolha **"Open with Live Server"**.
   (Ou clique em **"Go Live"** na barra azul no canto inferior direito.)

4. O navegador abre em `http://127.0.0.1:5500/HTML/index.html`. Pronto. ✅

> Bônus: o Live Server recarrega a página sozinho toda vez que você salva
> um arquivo — bom pra mexer no CSS e ver na hora.

---

## Opção 2 — Terminal do VS Code

Abra o terminal (`Ctrl+'`) na pasta do projeto e rode:

```bash
npm start
```

Depois abra no navegador: **http://localhost:5500/** (a raiz redireciona
para `HTML/index.html`).

Se não tiver Node instalado, use o Python:

```bash
python3 -m http.server 5500     # macOS / Linux
python -m http.server 5500      # Windows
```

---

## Opção 3 — Tarefa do VS Code

`Terminal > Executar Tarefa...` → **"Servidor local (MathGol)"**

---

## Depurar com breakpoints (F5)

1. Suba o servidor (qualquer opção acima).
2. Aperte **F5** → escolha **"Abrir MathGol no Chrome"**.

O Chrome abre com o depurador conectado: dá pra colocar breakpoint em
`JS/game.js`, `JS/main.js` etc. e inspecionar as variáveis direto no VS Code.

---

## Precisa de internet?

Sim, para o primeiro carregamento. O jogo puxa da CDN:

| O quê | De onde |
|---|---|
| Three.js r149 (cena 3D do pênalti) | `cdn.jsdelivr.net` |
| Firebase SDK 12.18 | `gstatic.com` |
| Fontes Fredoka e Atkinson Hyperlegible | `fonts.googleapis.com` |
| Avatares | `api.dicebear.com` |

**Se o Firebase não responder, o jogo não quebra**: ele cai nas listas
fixas do `JS/data.js` e continua jogável. O que você perde é só o
salvamento na nuvem. Os avatares também têm fallback local (um círculo
colorido com a inicial).

**Se o Three.js não carregar (ou o navegador não tiver WebGL)**, o jogo
entra no **modo simplificado 2D**, com o aviso "Modo simplificado ativo".
Mira e força continuam valendo — acertar a conta nunca vira gol automático.

**Para salvar na nuvem** é preciso ativar o login **Anônimo** no Console do
Firebase (Authentication → Método de login) e publicar
`Config/firestore.rules`. Detalhes no README.

---

## Onde mexer em cada coisa

| Quero mudar... | Abra |
|---|---|
| Velocidade da animação do chute | `JS/game.js` → constante `TEMPO` (topo do arquivo) |
| Pausa entre as cobranças | `JS/main.js` → `PAUSA_ENTRE_COBRANCAS` |
| Regra de gol/fora (faixa de força, desvios) | `JS/regras-chute.js` |
| Modo simplificado sem 3D | `JS/game-2d.js` e `CSS/styles.css` → seção "Modo simplificado 2D" |
| Textos dos créditos / "Sobre mim" | `HTML/index.html` → bloco `#sobreposicao-creditos` |
| Visual dos créditos e do backup | `CSS/styles.css` → seções "Modal de creditos" e "Modal de backup" |
| Perguntas de matemática | `JS/banco-questoes.js` e `JS/questions.js` |
| Cores do tema | `CSS/styles.css` → bloco `:root` (topo do arquivo) |

---

## Problemas comuns

**A tela fica em branco / a página carrega sem estilo**
Você abriu o arquivo direto (`file://`) em vez de servir por HTTP, ou abriu
só o arquivo no VS Code em vez da pasta. Abra a **pasta** e use o Live Server.

**A porta 5500 já está em uso**
Troque o número em `.vscode/settings.json` (`liveServer.settings.port`) e
no `package.json` (`-l 5500`).

**Erro no console: `Failed to load resource` em `cdn.jsdelivr.net`**
Sem internet, ou a rede está bloqueando a CDN. A cena 3D do pênalti não
carrega e o jogo usa o modo simplificado 2D (mesmas regras).

**Console: `auth/operation-not-allowed` ou `auth/admin-restricted-operation`**
O login Anônimo não está ativado no Console do Firebase. O jogo funciona,
mas não salva na nuvem.

**`npm start` reclama que não achou o `npx`**
Instale o Node.js em <https://nodejs.org> (versão LTS) ou use a opção do
Python acima.

---

## Rodar os testes

```bash
npm install
npm run test:unit    # regra do chute e validação de backup (rápido, só Node)
npm run test:e2e     # Playwright (abre um Chromium sem janela)
npm run test:rules   # regras do Firestore no emulador — precisa de Java 11+
```

Se o Playwright reclamar que não achou o navegador, rode uma vez:
`npx playwright install chromium`.

O `test:rules` baixa o emulador do Firestore na primeira execução (precisa
de internet) e usa o projeto de teste `demo-mathgol` — não toca no banco
real.
