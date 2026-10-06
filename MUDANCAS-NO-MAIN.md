# Os 5 pontos alterados no seu `main.js`

Nada mais foi tocado. Se preferir aplicar à mão em vez de substituir o
arquivo, são estes:

### 1. `TELA_ANTERIOR` (~linha 247) — 2 linhas novas
```javascript
  'tela-resultado':  'tela-fases',
  'tela-entrar-sala':'tela-menu',     // novo
  'tela-professor':  'tela-menu'      // novo
```

### 2. `irParaDificuldade()` (~linha 713) — reescrita
Lista `NIVEIS` em vez de `DIFICULDADES`, usando os seus helpers `criarSpan()`
e `marcarSelecionado()`. `estado.dificuldadeId` continua sendo o campo — só
guarda um número (1..12) agora. Se estiver numa sala, pula a tela.

### 3. `carregarProximaPergunta()` (~linha 964) — 2 linhas viram 6
Passa o nível da sala (quando houver) e os filtros de tipo para
`BancoQuestoes.sortearPergunta()`.

### 4. Bloco novo antes de `// ---------- Init ----------`
`atualizarFaixaSala()`, `initEntrarSala()`, `initProfessor()` e auxiliares.
Tudo com `createElement`/`textContent`, sem `innerHTML`, como no resto do
arquivo.

### 5. Três enxertos de uma linha
- no `DOMContentLoaded`: `initEntrarSala();` e `initProfessor();`
- em `carregarConfiguracoesRemotas()`: `Sala.restaurar().then(atualizarFaixaSala);`
  (tem que ser aqui — o Firebase chega depois, via `carregar-externos.js`)
- depois de `Carteira.adicionar(estado.pontuacao);`: reporta o resultado
  para o painel do professor, se estiver numa sala
