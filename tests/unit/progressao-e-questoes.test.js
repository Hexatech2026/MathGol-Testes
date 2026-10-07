// Leitura local do progresso (DEF-17) e variedade do banco de questoes (DEF-23).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function carregar(arquivos, localStorageInicial) {
  const armazenado = Object.assign({}, localStorageInicial);
  const ctx = {
    console, Math, JSON,
    localStorage: {
      getItem: k => (k in armazenado ? armazenado[k] : null),
      setItem: (k, v) => { armazenado[k] = String(v); },
      removeItem: k => { delete armazenado[k]; }
    }
  };
  vm.createContext(ctx);
  const fonte = arquivos.map(a => fs.readFileSync(path.join(__dirname, '..', '..', 'JS', a), 'utf8')).join('\n;\n');
  vm.runInContext(fonte + '\n;this.__exp = { NIVEIS: typeof NIVEIS !== "undefined" ? NIVEIS : null, obterNivel: typeof obterNivel !== "undefined" ? obterNivel : null, Progressao: typeof Progressao !== "undefined" ? Progressao : null, BancoQuestoes: typeof BancoQuestoes !== "undefined" ? BancoQuestoes : null };', ctx);
  return ctx.__exp;
}

test('QA-4: leitura local saneia progresso adulterado (recorde acima da fase, fase pulada)', () => {
  const adulterado = { versao: 1, dados: { fasesDesbloqueadas: ['penaltis', 'falta', 'final'], melhorGols: { penaltis: 7 }, melhorPontuacao: { penaltis: 700 } } };
  const { Progressao } = carregar(['niveis.js', 'progressao.js'], { mathgol_progressao: JSON.stringify(adulterado) });
  assert.equal(Progressao.melhorGols('penaltis'), 3);                // limitado as 3 cobrancas
  assert.equal(Progressao.melhorPontuacao('penaltis'), 300);         // limitado a 3 x 100
  assert.equal(Progressao.faseDesbloqueada('falta'), true);          // 3 gols em Penaltis liberam Falta
  assert.equal(Progressao.faseDesbloqueada('final'), false);         // sem gols em Falta, Final nao
});

test('leitura local: somente "final" desbloqueada vira so Penaltis', () => {
  const { Progressao } = carregar(['niveis.js', 'progressao.js'], { mathgol_progressao: JSON.stringify({ versao: 1, dados: { fasesDesbloqueadas: ['final'] } }) });
  assert.equal(Progressao.faseDesbloqueada('penaltis'), true);
  assert.equal(Progressao.faseDesbloqueada('falta'), false);
  assert.equal(Progressao.faseDesbloqueada('final'), false);
});

// questions.js e banco-questoes.js passaram a depender de niveis.js (a escada
// de 12 degraus). Os rotulos antigos continuam aceitos e caem no degrau
// equivalente — por isso o teste segue valendo com 'facil'/'medio'/'dificil'.
test('DEF-23: nenhum resultado domina o banco (fácil e médio: no máximo 15%)', () => {
  const { BancoQuestoes } = carregar(['niveis.js', 'questions.js', 'banco-questoes.js']);
  for (const nivel of ['facil', 'medio', 'dificil']) {
    BancoQuestoes.resetarSessao();
    const contagem = {};
    for (let i = 0; i < 20; i++) {
      const p = BancoQuestoes.sortearPergunta(nivel);
      assert.equal(BancoQuestoes.validarPergunta(p), true);
      contagem[p.resultado] = (contagem[p.resultado] || 0) + 1;
    }
    const maior = Math.max(...Object.values(contagem));
    if (nivel !== 'dificil') assert.ok(maior <= 3, `${nivel}: resultado repetido ${maior}x em 20 (${JSON.stringify(contagem)})`);
  }
});


// Cobre a escada nova: cada degrau so gera o que declarou (tipo de operacao e
// tamanho) e nenhuma questao sai invalida.
test('niveis: cada degrau respeita o proprio tipo de operacao', () => {
  const ctx = carregar(['niveis.js', 'questions.js', 'banco-questoes.js']);
  const { BancoQuestoes, NIVEIS, obterNivel } = ctx;
  for (const nv of NIVEIS) {
    BancoQuestoes.resetarSessao();
    for (let i = 0; i < 60; i++) {
      const p = BancoQuestoes.sortearPergunta(nv.id);
      assert.equal(BancoQuestoes.validarPergunta(p), true, `nivel ${nv.id}: questao invalida (${p && p.texto})`);
      assert.ok(nv.tipos.includes(p.tipo), `nivel ${nv.id}: veio "${p.tipo}", esperado um de ${nv.tipos}`);
      assert.ok(Number.isInteger(p.resultado) && p.resultado >= 0, `nivel ${nv.id}: resultado ${p.resultado}`);
    }
  }
});

// A reclamacao que originou a escada: a fase 3 nao pode pular varios degraus.
test('progressao: a fase sobe UM degrau, nao um abismo', () => {
  const { Progressao } = carregar(['niveis.js', 'progressao.js']);
  assert.deepEqual(['penaltis', 'falta', 'final'].map(f => Progressao.dificuldadeEfetiva(5, f)), [5, 6, 7]);
  assert.deepEqual(['penaltis', 'falta', 'final'].map(f => Progressao.dificuldadeEfetiva('facil', f)), [1, 2, 3]);
  // nunca passa do topo da escada
  assert.deepEqual(['penaltis', 'falta', 'final'].map(f => Progressao.dificuldadeEfetiva(12, f)), [12, 12, 12]);
});
