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
  vm.runInContext(fonte + '\n;this.__exp = { Progressao: typeof Progressao !== "undefined" ? Progressao : null, BancoQuestoes: typeof BancoQuestoes !== "undefined" ? BancoQuestoes : null };', ctx);
  return ctx.__exp;
}

test('QA-4: leitura local saneia progresso adulterado (recorde acima da fase, fase pulada)', () => {
  const adulterado = { versao: 1, dados: { fasesDesbloqueadas: ['penaltis', 'falta', 'final'], melhorGols: { penaltis: 7 }, melhorPontuacao: { penaltis: 700 } } };
  const { Progressao } = carregar(['progressao.js'], { mathgol_progressao: JSON.stringify(adulterado) });
  assert.equal(Progressao.melhorGols('penaltis'), 3);                // limitado as 3 cobrancas
  assert.equal(Progressao.melhorPontuacao('penaltis'), 300);         // limitado a 3 x 100
  assert.equal(Progressao.faseDesbloqueada('falta'), true);          // 3 gols em Penaltis liberam Falta
  assert.equal(Progressao.faseDesbloqueada('final'), false);         // sem gols em Falta, Final nao
});

test('leitura local: somente "final" desbloqueada vira so Penaltis', () => {
  const { Progressao } = carregar(['progressao.js'], { mathgol_progressao: JSON.stringify({ versao: 1, dados: { fasesDesbloqueadas: ['final'] } }) });
  assert.equal(Progressao.faseDesbloqueada('penaltis'), true);
  assert.equal(Progressao.faseDesbloqueada('falta'), false);
  assert.equal(Progressao.faseDesbloqueada('final'), false);
});

test('DEF-23: nenhum resultado domina o banco (fácil e médio: no máximo 15%)', () => {
  const { BancoQuestoes } = carregar(['questions.js', 'banco-questoes.js']);
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
