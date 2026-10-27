// v2.1 — falas gravadas do locutor (Audio/falas + JS/falas.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Falas = require('../../JS/falas.js');

const RAIZ = path.join(__dirname, '..', '..');
const ler = arq => fs.readFileSync(path.join(RAIZ, arq), 'utf8');

// Textos de uma lista do codigo-fonte: var NOME = [ '...', '...' ];
function lista(fonte, nome) {
  const m = fonte.match(new RegExp('(?:var|const|let)\\s+' + nome + '\\s*=\\s*\\[([\\s\\S]*?)\\];'));
  assert.ok(m, 'lista ' + nome + ' nao encontrada');
  return [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(x => x[1]);
}

test('cada fala do catalogo tem o seu MP3 em Audio/falas', () => {
  for (const id of Falas.ids()) {
    const arq = path.join(RAIZ, 'Audio', 'falas', id + '.mp3');
    assert.ok(fs.existsSync(arq), 'falta ' + id + '.mp3');
    assert.ok(fs.statSync(arq).size > 10000, id + '.mp3 parece vazio');
  }
});

test('nenhum MP3 sobrando sem fala no catalogo', () => {
  const ids = new Set(Falas.ids());
  for (const f of fs.readdirSync(path.join(RAIZ, 'Audio', 'falas'))) {
    assert.ok(ids.has(f.replace(/\.mp3$/, '')), f + ' nao esta em JS/falas.js');
  }
});

test('toda frase que a partida fala tem gravacao', () => {
  const main = ler('JS/main.js');
  const frases = ['FRASES_GOL', 'FRASES_QUASE', 'FRASES_CONTA', 'FRASES_ACERTO_CONTA']
    .flatMap(n => lista(main, n));
  const fora = [...main.match(/var NARRACAO_FORA = \{([\s\S]*?)\};/)[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(x => x[1]);
  for (const t of frases.concat(fora, ['Gol!', 'O goleiro defendeu!', 'Tempo esgotado! O goleiro defendeu.'])) {
    assert.ok(Falas.idDoTexto(t), 'sem gravacao: "' + t + '"');
  }
});

test('todas as mensagens de fim de fase tem gravacao', () => {
  const dados = ler('JS/data.js');
  const bloco = dados.match(/const MENSAGENS_RESULTADO = \{([\s\S]*?)\n\};/)[1] +
    dados.match(/const MENSAGENS_RESULTADO_GERAIS = \{([\s\S]*?)\n\};/)[1];
  const textos = [...bloco.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(x => x[1]);
  assert.ok(textos.length >= 20);
  for (const t of textos) assert.ok(Falas.idDoTexto(t), 'sem gravacao: "' + t + '"');
});

test('o tutorial pede as 6 gravacoes pelo id', () => {
  const tut = ler('JS/tutorial.js');
  assert.match(tut, /fala: 'tutorial-0' \+ \(passo \+ 1\)/);
  for (let i = 1; i <= 6; i++) assert.ok(Falas.existe('tutorial-0' + i));
});

test('comparacao de texto ignora acento, maiuscula, pontuacao e emoji', () => {
  assert.equal(Falas.idDoTexto('gol'), 'gol-01');
  assert.equal(Falas.idDoTexto('Pra fora! ❌'), 'fora-03');
  assert.equal(Falas.idDoTexto('golaco voce e um craque da matematica'), 'gol-02');
  assert.equal(Falas.idDoTexto('6 + 2'), null); // a conta da vez nunca e gravada
});
