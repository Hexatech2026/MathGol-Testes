// Testes da regra pura da cobranca (JS/regras-chute.js).
// Rodar: npm run test:unit
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../JS/regras-chute.js');

const CENTRO = { x: 0, y: 1.3 };
const TIPOS = ['rasteiro', 'meia', 'cavadinha'];
const idealDe = tipo => (R.TIPOS[tipo].forcaIdeal.min + R.TIPOS[tipo].forcaIdeal.max) / 2;
const rngFixo = v => () => v;
const SORTEIOS = [0, 0.1, 0.25, 0.49, 0.5, 0.51, 0.75, 0.9, 0.999];
const chutar = (mira, forca, tipo, s) => R.calcularResultadoChute(mira, forca, tipo, rngFixo(s));

test('centro + forca ideal → gol em todos os tipos (qualquer sorteio)', () => {
  for (const tipo of TIPOS) {
    for (const s of SORTEIOS) {
      const r = chutar(CENTRO, idealDe(tipo), tipo, s);
      assert.equal(r.motivo, 'gol', tipo);
      assert.equal(R.resolverCobranca(true, r), 'gol');
    }
  }
});

test('meia-altura com forca ideal mantem a bola exatamente na mira', () => {
  const f = R.TIPOS.meia.forcaIdeal;
  for (let forca = f.min; forca <= f.max; forca += 0.05) {
    const r = chutar({ x: 1.5, y: 0.8 }, forca, 'meia', 0.9);
    assert.deepEqual(r.destino, { x: 1.5, y: 0.8 });
  }
});

test('centro + forca 0 e forca 1 → fora em TODOS os tipos', () => {
  for (const tipo of TIPOS) {
    for (const s of SORTEIOS) {
      assert.equal(chutar(CENTRO, 0, tipo, s).dentro, false, `${tipo} forca 0`);
      assert.equal(chutar(CENTRO, 1, tipo, s).dentro, false, `${tipo} forca 1`);
    }
  }
  assert.equal(chutar(CENTRO, 0, 'meia', 0.5).motivo, 'fraco');
  assert.equal(chutar(CENTRO, 1, 'meia', 0.5).motivo, 'alto');
});

test('assinatura antiga (mira, forca, rng) continua valendo como meia-altura', () => {
  const r = R.calcularResultadoChute(CENTRO, 0, () => 0.5);
  assert.equal(r.tipo, 'meia');
  assert.equal(r.motivo, 'fraco');
});

test('altura muda o tipo: <1/3 rasteiro, meio meia-altura, >=2/3 cavadinha', () => {
  assert.equal(R.tipoPorAltura(0).id, 'rasteiro');
  assert.equal(R.tipoPorAltura(0.32).id, 'rasteiro');
  assert.equal(R.tipoPorAltura(0.5).id, 'meia');
  assert.equal(R.tipoPorAltura(0.7).id, 'cavadinha');
  assert.equal(R.tipoPorAltura(1).id, 'cavadinha');
  assert.equal(R.tipoPorAltura(undefined).id, 'meia');
});

test('altura tem efeito REAL e testavel no resultado', () => {
  // Rasteiro nao sobe: mirando no angulo, a bola passa baixa.
  const rasteiroAlto = chutar({ x: 2.5, y: 2.0 }, idealDe('rasteiro'), 'rasteiro', 0.5);
  assert.equal(rasteiroAlto.destino.y, R.TIPOS.rasteiro.alturaMaxima);
  // Cavadinha mirada alto passa por cima (meia-altura na mesma mira entra).
  assert.equal(chutar({ x: 0, y: 2.0 }, idealDe('cavadinha'), 'cavadinha', 0.5).motivo, 'alto');
  assert.equal(chutar({ x: 0, y: 2.0 }, idealDe('meia'), 'meia', 0.5).motivo, 'gol');
  // Forca fraca (0.25): cavadinha entra; rasteiro morre antes do gol.
  assert.equal(chutar(CENTRO, 0.25, 'cavadinha', 0.5).motivo, 'gol');
  assert.equal(chutar(CENTRO, 0.25, 'rasteiro', 0.5).motivo, 'fraco');
  // Forca forte (0.8): rasteiro entra; cavadinha vai por cima.
  assert.equal(chutar(CENTRO, 0.8, 'rasteiro', 0.5).motivo, 'gol');
  assert.equal(chutar(CENTRO, 0.8, 'cavadinha', 0.5).motivo, 'alto');
  // Cavadinha puxa a bola um pouco pro centro.
  assert.ok(Math.abs(chutar({ x: 3.0, y: 1.0 }, idealDe('cavadinha'), 'cavadinha', 0.5).destino.x) < 3.0);
});

test('QA-3 (DEF-14): mira fora do gol + forca 0 nunca vira gol', () => {
  // Contraexemplo do relatorio: mira (3,6; 2,55).
  for (let i = 0; i < 10000; i++) {
    const s = i / 10000;
    for (const tipo of TIPOS) {
      assert.equal(chutar({ x: 3.6, y: 2.55 }, 0, tipo, s).dentro, false);
      assert.equal(chutar({ x: 3.6, y: 2.55 }, idealDe(tipo), tipo, s).dentro, false);
    }
  }
  assert.equal(chutar({ x: 3.6, y: 2.55 }, 0.55, 'meia', 0.8).motivo, 'alto');
});

test('DEF-14: forca ideal e SEMPRE a melhor escolha (nenhuma forca ganha dela)', () => {
  const sorteios = [0, 0.2, 0.4, 0.6, 0.8, 0.99];
  for (const tipo of TIPOS) {
    for (let x = -3.6; x <= 3.6001; x += 0.3) {
      for (let y = R.AREA_SELECAO.yMin; y <= R.AREA_SELECAO.yMax + 1e-9; y += 0.2) {
        const golsIdeal = sorteios.filter(s => chutar({ x, y }, idealDe(tipo), tipo, s).dentro).length;
        for (let f = 0; f <= 1.0001; f += 0.05) {
          const gols = sorteios.filter(s => chutar({ x, y }, f, tipo, s).dentro).length;
          assert.ok(gols <= golsIdeal, `${tipo} (${x.toFixed(1)}, ${y.toFixed(2)}) forca ${f.toFixed(2)}: ${gols} > ${golsIdeal}`);
        }
      }
    }
  }
});

test('mira extrema + forca ruim → grande chance de sair', () => {
  const miras = [{ x: 3.4, y: 1.3 }, { x: -3.4, y: 1.3 }, { x: 3.4, y: 2.2 }, { x: -3.4, y: 0.4 }];
  let fora = 0, total = 0;
  for (const m of miras) for (const f of [0.1, 0.2, 0.9]) for (let i = 0; i < 100; i++) {
    total++;
    if (!chutar(m, f, 'meia', i / 100).dentro) fora++;
  }
  assert.ok(fora / total >= 0.7, `esperava >= 70% fora, veio ${(100 * fora / total).toFixed(1)}%`);
});

test('area valida considera o raio da bola (a bola inteira entra)', () => {
  assert.ok(Math.abs(R.AREA_VALIDA.yMax + R.RAIO_BOLA - R.GOL.altura) < 1e-9);
  assert.ok(Math.abs(R.AREA_VALIDA.xMax + R.RAIO_BOLA - R.GOL.meiaLargura) < 1e-9);
  // Contraexemplo do relatorio: mira em y = 2,32 encostaria no travessao → fora.
  assert.equal(chutar({ x: 0, y: 2.32 }, idealDe('meia'), 'meia', 0.5).motivo, 'alto');
});

test('trajetoria cruza o plano do gol EXATAMENTE no destino calculado', () => {
  const inicio = { x: 0, y: 0.22, z: 11 };
  for (const tipo of TIPOS) {
    const r = chutar({ x: 2.1, y: 1.9 }, idealDe(tipo), tipo, 0.5);
    const p = R.pontoTrajetoria(inicio, r.destino, R.TIPOS[tipo].arcoVisual, 1);
    assert.equal(p.z, 0);
    assert.ok(Math.abs(p.x - r.destino.x) < 1e-9 && Math.abs(p.y - r.destino.y) < 1e-9, tipo);
    // E so cruza z = 0 no fim (z decresce monotonicamente).
    for (let s = 0; s < 1; s += 0.05) assert.ok(R.pontoTrajetoria(inicio, r.destino, 2, s).z > 0);
  }
});

test('mira fora da area de selecao e limitada', () => {
  const r = chutar({ x: 99, y: -5 }, 0.55, 'meia', 0.5);
  assert.equal(r.mira.x, R.AREA_SELECAO.xMax);
  assert.equal(r.mira.y, R.AREA_SELECAO.yMin);
});

test('entradas invalidas nao quebram e usam padrao seguro', () => {
  const r = R.calcularResultadoChute(null, NaN, NaN, () => NaN);
  assert.equal(typeof r.dentro, 'boolean');
  assert.equal(r.tipo, 'meia');
});

test('resposta correta NUNCA resulta em defesa', () => {
  for (const tipo of TIPOS) for (let f = 0; f <= 1; f += 0.1) for (let x = -3.6; x <= 3.6; x += 0.9) for (let y = 0.22; y <= 2.55; y += 0.4) {
    const r = chutar({ x, y }, f, tipo, 0.3);
    const desfecho = R.resolverCobranca(true, r);
    assert.notEqual(desfecho, 'defesa');
    assert.equal(desfecho, r.dentro ? 'gol' : 'fora');
  }
  assert.equal(R.resolverCobranca(true, null), 'fora', 'sem chute valido nunca e gol automatico');
});

test('resposta errada (ou tempo esgotado) → sempre defesa', () => {
  assert.equal(R.resolverCobranca(false, null), 'defesa');
  assert.equal(R.resolverCobranca(false, { dentro: true }), 'defesa');
});
