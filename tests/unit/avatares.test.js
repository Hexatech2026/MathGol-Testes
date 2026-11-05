// DEF-41 / HU-29 (CA-29.3, CA-29.4, CA-29.7): os avatares sao servidos pelo
// proprio jogo. Toda seed declarada precisa ter arquivo, e todo arquivo
// precisa ter seed — uma seed orfa deixa a crianca com o avatar de reserva
// no lugar do que ela escolheu.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..', '..');
const PASTA = path.join(RAIZ, 'Imagens', 'avatares');

const ctx = { window: {}, console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'JS', 'avatar-data.js'), 'utf8'), ctx);

// Array.from, nao .slice(): o array nasce DENTRO do vm e carrega o
// Array.prototype de la, o que faz deepStrictEqual recusar ate dois
// vazios. Array.from devolve um array deste contexto.
const seeds = Array.from(ctx.SEEDS_PERMITIDAS || []);
const arquivos = fs.readdirSync(PASTA).filter(f => f.endsWith('.svg'));

test('toda seed declarada tem arquivo em Imagens/avatares', () => {
  assert.ok(seeds.length > 0, 'nenhuma seed declarada');
  const faltando = seeds.filter(s => !fs.existsSync(path.join(PASTA, s + '.svg')));
  assert.deepStrictEqual(faltando, [], 'seeds sem arquivo: ' + faltando.join(', '));
});

test('todo arquivo de avatar tem seed correspondente', () => {
  const orfaos = arquivos.map(f => f.replace(/\.svg$/, '')).filter(n => seeds.indexOf(n) === -1);
  assert.deepStrictEqual(orfaos, [], 'arquivos sem seed: ' + orfaos.join(', '));
});

test('nenhuma seed duplicada', () => {
  assert.strictEqual(new Set(seeds).size, seeds.length);
});

test('os avatares somados pesam menos de 100 KB (CA-29.7)', () => {
  const total = arquivos.reduce((s, f) => s + fs.statSync(path.join(PASTA, f)).size, 0);
  assert.ok(total < 100 * 1024, 'avatares somam ' + Math.round(total / 1024) + ' KB');
});

test('nenhum avatar busca servico de terceiro (CA-29.2)', () => {
  arquivos.forEach(f => {
    const svg = fs.readFileSync(path.join(PASTA, f), 'utf8');
    // O xmlns do SVG (http://www.w3.org/2000/svg) e identificador, nao
    // endereco buscado: o navegador nunca pede nada dali.
    const externas = (svg.match(/https?:\/\/[^"' )]+/g) || [])
      .filter(u => !u.startsWith('http://www.w3.org/'));
    assert.deepStrictEqual(externas, [], f + ' busca de fora: ' + externas.join(', '));
  });
});
