// Testes da regra pura da cobranca (JS/regras-chute.js).
// Rodar: npm run test:unit
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../JS/regras-chute.js');

const CENTRO = { x: 0, y: 1.3 };
const FORCA_IDEAL = (R.FORCA_IDEAL.min + R.FORCA_IDEAL.max) / 2;
const rngFixo = v => () => v;
// Varre varios valores do gerador aleatorio pra provar que o resultado
// nao depende da sorte quando o criterio e deterministico.
const SORTEIOS = [0, 0.1, 0.25, 0.49, 0.5, 0.51, 0.75, 0.9, 0.999];

test('centro + forca ideal → gol (qualquer sorteio)', () => {
  for (const s of SORTEIOS) {
    const r = R.calcularResultadoChute(CENTRO, FORCA_IDEAL, rngFixo(s));
    assert.equal(r.dentro, true);
    assert.equal(r.motivo, 'gol');
    assert.deepEqual(r.destino, CENTRO, 'forca ideal mantem a bola exatamente na mira');
    assert.equal(R.resolverCobranca(true, r), 'gol');
  }
});

test('forca ideal em toda a faixa mantem a bola na mira', () => {
  for (let f = R.FORCA_IDEAL.min; f <= R.FORCA_IDEAL.max; f += 0.05) {
    const r = R.calcularResultadoChute({ x: 1.5, y: 0.8 }, f, rngFixo(0.9));
    assert.equal(r.destino.x, 1.5);
    assert.equal(r.destino.y, 0.8);
    assert.equal(r.dentro, true);
  }
});

test('centro + forca minima → fora (bola nao chega), qualquer sorteio', () => {
  for (const s of SORTEIOS) {
    const r = R.calcularResultadoChute(CENTRO, 0, rngFixo(s));
    assert.equal(r.dentro, false);
    assert.equal(r.motivo, 'fraco');
    assert.equal(R.resolverCobranca(true, r), 'fora');
  }
});

test('centro + forca maxima → fora (por cima), qualquer sorteio', () => {
  for (const s of SORTEIOS) {
    const r = R.calcularResultadoChute(CENTRO, 1, rngFixo(s));
    assert.equal(r.dentro, false);
    assert.equal(r.motivo, 'alto');
    assert.equal(R.resolverCobranca(true, r), 'fora');
  }
});

test('forca levemente fora da faixa ainda e perdoada no centro (adequado a criancas)', () => {
  const fraca = R.calcularResultadoChute(CENTRO, R.FORCA_IDEAL.min - 0.05, rngFixo(0.5));
  const forte = R.calcularResultadoChute(CENTRO, R.FORCA_IDEAL.max + 0.05, rngFixo(0.5));
  assert.equal(fraca.dentro, true);
  assert.equal(forte.dentro, true);
});

test('mira extrema + forca ruim → grande chance de sair', () => {
  const miras = [{ x: 3.4, y: 1.3 }, { x: -3.4, y: 1.3 }, { x: 3.4, y: 2.2 }, { x: -3.4, y: 0.4 }];
  const forcasRuins = [0.1, 0.2, 0.9];
  let fora = 0, total = 0;
  for (const m of miras) {
    for (const f of forcasRuins) {
      for (let i = 0; i < 100; i++) {
        const r = R.calcularResultadoChute(m, f, rngFixo(i / 100));
        total++;
        if (!r.dentro) fora++;
      }
    }
  }
  assert.ok(fora / total >= 0.7, `esperava >= 70% fora, veio ${(100 * fora / total).toFixed(1)}%`);
});

test('mira extrema + forca ideal → gol (acertar a forca vale a pena)', () => {
  const r = R.calcularResultadoChute({ x: 3.4, y: 2.2 }, FORCA_IDEAL, rngFixo(0.1));
  assert.equal(r.dentro, true);
});

test('mira fora da area de selecao e limitada', () => {
  const r = R.calcularResultadoChute({ x: 99, y: -5 }, FORCA_IDEAL, rngFixo(0.5));
  assert.equal(r.mira.x, R.AREA_SELECAO.xMax);
  assert.equal(r.mira.y, R.AREA_SELECAO.yMin);
});

test('entradas invalidas nao quebram e usam padrao seguro', () => {
  const r = R.calcularResultadoChute(null, NaN, () => NaN);
  assert.equal(typeof r.dentro, 'boolean');
  assert.equal(r.forca, 0.5);
});

test('resposta correta NUNCA resulta em defesa', () => {
  for (let f = 0; f <= 1; f += 0.05) {
    for (let x = -3.6; x <= 3.6; x += 0.6) {
      for (let y = 0.15; y <= 2.55; y += 0.4) {
        for (const s of [0, 0.5, 0.99]) {
          const r = R.calcularResultadoChute({ x, y }, f, rngFixo(s));
          const desfecho = R.resolverCobranca(true, r);
          assert.notEqual(desfecho, 'defesa');
          assert.equal(desfecho, r.dentro ? 'gol' : 'fora');
        }
      }
    }
  }
  assert.equal(R.resolverCobranca(true, null), 'fora', 'sem chute valido nunca e gol automatico');
});

test('resposta errada (ou tempo esgotado) → sempre defesa', () => {
  assert.equal(R.resolverCobranca(false, null), 'defesa');
  assert.equal(R.resolverCobranca(false, { dentro: true }), 'defesa');
});
