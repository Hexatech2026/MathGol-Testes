// v2.2 — VAR: expressoes numericas do futebol de botao (JS/var.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// niveis.js nao e modulo: roda no contexto global (define obterNivel).
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', '..', 'JS', 'niveis.js'), 'utf8'));
const VAR = require('../../JS/var.js');

// Conta a expressao com a ordem certa (o "gabarito" do teste).
function avaliar(texto) {
  const js = texto.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  assert.match(js, /^[\d\s+\-*/()]+$/);
  return Function('return (' + js + ')')();
}

test('todo nivel gera expressao certa, inteira, sem negativo e com 4 alternativas', () => {
  for (let nivel = 1; nivel <= 12; nivel++) {
    for (let i = 0; i < 300; i++) {
      const e = VAR.gerarExpressao(nivel);
      assert.strictEqual(avaliar(e.texto), e.resultado, `nivel ${nivel}: ${e.texto}`);
      assert.ok(Number.isInteger(e.resultado) && e.resultado >= 0, e.texto);
      assert.strictEqual(e.alternativas.length, 4);
      assert.strictEqual(new Set(e.alternativas).size, 4);
      assert.ok(e.alternativas.includes(e.resultado));
      assert.ok(e.alternativas.every(v => Number.isInteger(v) && v >= 0));
      assert.ok(e.falado.startsWith('Quanto é'));
    }
  }
});

test('a expressao usa o tipo de conta do nivel escolhido', () => {
  const ops = nivel => {
    const vistos = new Set();
    for (let i = 0; i < 200; i++) VAR.gerarExpressao(nivel).texto.replace(/[+−×÷]/g, s => vistos.add(s));
    return [...vistos].sort();
  };
  assert.deepStrictEqual(ops(1), ['+']);            // so soma
  assert.deepStrictEqual(ops(2), ['−']);            // so subtracao
  assert.deepStrictEqual(ops(3), ['+', '−']);       // soma e subtracao
  assert.ok(ops(8).includes('×') && !ops(8).includes('÷'));
  assert.ok(ops(10).includes('÷') && !ops(10).includes('×'));
  assert.deepStrictEqual(ops(12), ['+', '×', '÷', '−'].sort());
});

test('uma alternativa errada costuma ser "da esquerda para a direita" (erro de ordem)', () => {
  assert.strictEqual(VAR.calcularDaEsquerdaParaDireita('3 + 4 × 2'), 14);
  assert.strictEqual(avaliar('3 + 4 × 2'), 11);
  let achou = 0;
  for (let i = 0; i < 100; i++) {
    const e = VAR.gerarExpressao(8);
    const errado = VAR.calcularDaEsquerdaParaDireita(e.texto);
    if (errado !== null && errado !== e.resultado && e.alternativas.includes(errado)) achou++;
  }
  assert.ok(achou > 20, 'pegadinha de ordem aparece: ' + achou);
});
