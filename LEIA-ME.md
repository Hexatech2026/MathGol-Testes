# Patch — Níveis de aprendizagem + Sala do Professor

Pacote **cirúrgico**: feito em cima dos arquivos que vocês me mandaram hoje.
Nada da loja, da carteira, do tutorial, do modo 2D ou das regras de chute foi
tocado.

> ⚠️ **Não use o `MathGol-v8` que eu mandei antes.** Aquele zip tem uma loja
> minha, paralela à de vocês, com API incompatível (`Loja.carregar()` vs
> `Loja.abrir()`). Descompactar por cima quebraria a loja que já funciona.
> Este patch aqui é o caminho certo.

---

## 1. Copiar — arquivos novos, não existe conflito

```
JS/niveis.js      ← novo
JS/sala.js        ← novo
```

## 2. Substituir — módulos fechados, a API pública não mudou

```
JS/questions.js       (continua expondo gerarPergunta)
JS/banco-questoes.js  (continua expondo BancoQuestoes.sortearPergunta)
```

`sortearPergunta()` agora aceita um segundo argumento opcional (filtros da
sala) e aceita nível numérico **ou** `'facil'/'medio'/'dificil'`, então
progresso salvo antes disso continua valendo.

## 3. Substituir — já editados por mim, em cima dos seus

```
HTML/index.html   (2 <script>, 2 botões no menu, 2 seções novas)
CSS/styles.css    (bloco ACRESCENTADO no final; nada acima foi alterado)
JS/main.js        (5 pontos — listados em MUDANCAS-NO-MAIN.md)
```

## 4. Editar à mão — 2 arquivos que eu não tenho

### `JS/progressao.js`

Troque o bloco:

```javascript
var ESCALAR_DIFICULDADE = {
  'facil':   ['facil', 'medio', 'dificil'],
  'medio':   ['medio', 'dificil', 'dificil'],
  'dificil': ['dificil', 'dificil', 'dificil']
};
```

por:

```javascript
// A fase sobe UM degrau na escada de niveis.js, em vez de pular de
// 'facil' direto pra 'dificil' (2 + 3 na fase 1 e 7 x 9 na fase 3).
var PASSO_POR_FASE = 1;
```

E troque a função:

```javascript
function dificuldadeEfetiva(dificuldadeEscolhida, faseId) {
  var idx = indiceFase(faseId);
  var escala = ESCALAR_DIFICULDADE[dificuldadeEscolhida] || ESCALAR_DIFICULDADE['facil'];
  return escala[Math.min(idx, escala.length - 1)];
}
```

por:

```javascript
// Aceita numero (nivel novo) ou 'facil'/'medio'/'dificil' (progresso
// salvo antes da escada existir), traduzido por niveis.js.
function dificuldadeEfetiva(nivelOuDificuldade, faseId) {
  var base = typeof nivelOuDificuldade === 'number'
    ? nivelOuDificuldade
    : nivelDaDificuldadeAntiga(nivelOuDificuldade);
  var idx = indiceFase(faseId);
  return obterNivel(base + idx * PASSO_POR_FASE).id; // obterNivel limita em 1..12
}
```

### `JS/firebase-config.js`

Abra `Config/firebase-config-TRECHO-SALA.js` — são 3 mudanças comentadas
passo a passo (acrescentar `onSnapshot` ao import, colar um bloco de
funções, acrescentar 5 nomes ao `window.FirebaseMathGol`).

## 5. Publicar as regras no Console do Firebase

Acrescente ao `firestore.rules` o bloco de `Config/firestore-TRECHO-SALA.txt`.
**Sem isso a coleção `salas` é negada e a sala não funciona.**

---

## O que muda pro jogador

**Dificuldade.** A tela "Nível do desafio" passa a listar 12 níveis em vez de
3. Cada um diz o tipo de conta e o tamanho dos números. A fase sobe um degrau
só: quem começa no 5 faz 5 → 6 → 7.

**Sala.** Dois botões novos no menu. O professor cria a sala, recebe um código
(`K4P-7MN`) e dita pra turma; pode escolher o nível, trocar no meio da aula,
restringir a tipos de conta e ver a turma ao vivo. A criança digita o código
e o nível passa a ser o do professor.

---

## O que eu testei

Subi um servidor com os seus `index.html`, `styles.css` e `main.js` já
modificados, com stubs no lugar de `carteira.js`, `regras-chute.js`, `loja.js`
e `tutorial.js` (que eu não tenho).

| Verificação | Resultado |
|---|---|
| Carga da página | nenhum erro de JS |
| Tela de nível | 12 cartões, "Primeiros gols" em primeiro |
| Professor cria sala | código + nível exibidos |
| Lista da turma ao vivo | ordena por gols |
| Criança entra com `k4p7mn` | código normalizado, entra |
| Filtro de tipo | 40 sorteios, só subtração |
| Escalada do nível 5 | 5 → 6 → 7 |
| Banco inteiro | 12 níveis, 0 questão inválida |

**O que eu NÃO consegui testar:** a interação com `carteira.js`, `loja.js`,
`regras-chute.js` e `tutorial.js` de verdade — nesses pontos usei stub. Rodem
local antes de publicar.

---

## Uma coisa que ficou pendente

As regras da sala são abertas: quem souber o código pode mudar o nível e ler a
lista de alunos. O campo `dono` guarda o uid do professor mas **não é
checado** nas regras — isso precisa de uma regra que compare `dono` com
`request.auth.uid`.

Com apelido + placar e nada mais, o risco é baixo. Mas é o card **R03** de
novo, e agora com dado de turma envolvido.
