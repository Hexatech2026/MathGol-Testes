// v2.0 — conquistas, codigo do craque e estado da nuvem.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../JS/codigo-craque.js');
const Q = require('../../JS/conquistas.js');
const V = require('../../JS/backup-validacao.js');

// ---------- Codigo do craque ----------

test('codigo: 16 caracteres, so do alfabeto sem O/0/I/L/1', () => {
  for (let i = 0; i < 200; i++) {
    const c = C.gerar();
    assert.equal(c.length, 16);
    assert.match(c, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{16}$/);
  }
});

test('codigo: sorteio sem vies (descarta bytes >= 248)', () => {
  // Fonte fixa: 248..255 devem ser ignorados; 0 vira "A", 30 vira "9".
  let chamada = 0;
  const fonte = n => { chamada++; return Array.from({ length: n }, (_, i) => (i % 2 ? 250 : (chamada === 1 ? 0 : 30))); };
  const c = C.gerar(fonte);
  assert.equal(c.length, 16);
  assert.ok(!/[^A9]/.test(c), 'so A (0) e 9 (30) podem sair: ' + c);
});

test('codigo: limpar aceita tracos, espacos e minusculas; recusa letras que nao existem', () => {
  assert.equal(C.limpar('abcd-efgh-jkmn-pqrs'), 'ABCDEFGHJKMNPQRS');
  assert.equal(C.limpar(' ABCD EFGH JKMN PQRS '), 'ABCDEFGHJKMNPQRS');
  assert.equal(C.limpar('ABCD-EFGH-JKMN-PQR'), null);        // curto
  assert.equal(C.limpar('ABCD-EFGH-JKMN-PQRO'), null);       // O nao existe
  assert.equal(C.limpar('ABCD-EFGH-JKMN-PQR1'), null);       // 1 nao existe
  assert.equal(C.formatar('abcdefghjkmnpqrs'), 'ABCD-EFGH-JKMN-PQRS');
});

test('codigo: e-mail sintetico usa so o comeco; a senha e o codigo inteiro', () => {
  assert.equal(C.email('ABCD-EFGH-JKMN-PQRS', 'math-gol.firebaseapp.com'), 'craque.abcdef@math-gol.firebaseapp.com');
  assert.equal(C.senha('abcd-efgh-jkmn-pqrs'), 'ABCDEFGHJKMNPQRS');
  assert.equal(C.email('curto', 'x.com'), null);
});

// ---------- Conquistas ----------

function memoria(inicial) {
  const dados = Object.assign({}, inicial);
  return { ler: k => (k in dados ? dados[k] : null), gravar: (k, v) => { dados[k] = v; }, dados };
}

function nova(opcoes = {}) {
  const arm = opcoes.arm || memoria();
  const pagos = [];
  const q = Q.criar(arm, { validar: V.validarConquistas, pagarPremio: m => pagos.push(m.id), hoje: opcoes.hoje });
  return { q, arm, pagos };
}

test('conquistas: primeiro gol, relampago e premio pago uma vez so', () => {
  const { q, pagos } = nova();
  assert.deepEqual(q.registrar('gol', { tipo: 'meia' }).map(m => m.id), ['primeiro-gol']);
  assert.deepEqual(q.registrar('gol', { tipo: 'meia' }), []);          // nao repete
  assert.deepEqual(q.registrar('conta-certa', { tempoMs: 3500 }), []);
  assert.deepEqual(q.registrar('conta-certa', { tempoMs: 2900 }).map(m => m.id), ['relampago']);
  assert.deepEqual(pagos, ['primeiro-gol', 'relampago']);
});

test('conquistas: metas por contador (10 contas certas)', () => {
  const { q } = nova();
  for (let i = 0; i < 9; i++) q.registrar('conta-certa', { tempoMs: 8000 });
  assert.equal(q.feita('contas-10'), false);
  assert.equal(q.progresso(q.porId('contas-10')), 0.9);
  // v2.2: as 10 foram seguidas, entao sai junto o "+1000 de Aura".
  assert.deepEqual(q.registrar('conta-certa', { tempoMs: 8000 }).map(m => m.id), ['contas-10', 'aura-maxima']);
});

test('v2.2: aura so com 10 SEGUIDAS; errar zera a sequencia', () => {
  const { q } = nova();
  for (let i = 0; i < 9; i++) q.registrar('conta-certa', { tempoMs: 8000 });
  q.registrar('conta-errada');
  q.registrar('conta-certa', { tempoMs: 8000 });
  assert.equal(q.feita('contas-10'), true);
  assert.equal(q.feita('aura-maxima'), false);
});

test('v2.2: 6-7, ego de campeao, Copa, VAR e Mito', () => {
  const { q } = nova();
  assert.deepEqual(q.registrar('gol', { tipo: 'meia', pontos: 67 }).map(m => m.id).sort(), ['primeiro-gol', 'seis-sete']);
  for (let i = 0; i < 3; i++) q.registrar('partida-fim', { faseId: 'penaltis', gols: 3, total: 3, resumo: 'GGG', pontuacao: 200 });
  assert.equal(q.feita('ego-campeao'), true);
  assert.deepEqual(q.registrar('copa-jogo', { venceu: true, morteSubita: true }).map(m => m.id).sort(), ['copa-estreia', 'morte-subita']);
  assert.deepEqual(q.registrar('copa-avancou', { etapa: 'quartas' }).map(m => m.id), ['copa-quartas']);
  q.registrar('copa-campeao');
  assert.equal(q.contador('copas'), 1);
  for (let i = 0; i < 5; i++) q.registrar('var-confirmado');
  assert.equal(q.feita('var-5'), true);
  ['comemoracao-trocada', 'numero-trocado', 'titulo-trocado', 'duelo-fim', 'borda-trocada', 'codigo-criado'].forEach(e => q.registrar(e));
  q.registrar('botao-fim', { venceu: true });
  assert.equal(q.feita('medalhas-20'), false); // 18 ate aqui
  q.registrar('copa-avancou', { etapa: 'dezesseis' });
  q.registrar('copa-avancou', { etapa: 'final' });
  assert.ok(q.quantasFeitas() >= 20);
  assert.equal(q.feita('medalhas-20'), true);
});

test('conquistas: hat-trick, partida perfeita e campeao saem do resumo da partida', () => {
  const { q } = nova();
  const ids = q.registrar('partida-fim', { faseId: 'final', gols: 7, total: 7, resumo: 'GGGGGGG' }).map(m => m.id).sort();
  assert.deepEqual(ids, ['campeao', 'hat-trick', 'partida-perfeita', 'primeiro-gol']);
  const { q: q2 } = nova();
  assert.deepEqual(q2.registrar('partida-fim', { faseId: 'penaltis', gols: 2, total: 3, resumo: 'GDG' }).map(m => m.id), ['primeiro-gol']);
});

test('conquistas: dias diferentes contam uma vez por dia', () => {
  let dia = '2026-10-20';
  const { q } = nova({ hoje: () => dia });
  q.registrar('partida-fim', { gols: 0, total: 3, resumo: 'DDD' });
  q.registrar('partida-fim', { gols: 0, total: 3, resumo: 'DDD' });
  assert.equal(q.contador('dias'), 1);
  dia = '2026-10-21'; q.registrar('partida-fim', { gols: 0, total: 3, resumo: 'DDD' });
  dia = '2026-10-23';
  assert.deepEqual(q.registrar('partida-fim', { gols: 0, total: 3, resumo: 'DDD' }).map(m => m.id), ['dias-3']);
});

test('conquistas: salva no formato validado e relê; lixo no armazenamento e ignorado', () => {
  const { q, arm } = nova();
  q.registrar('gol', { tipo: 'cavadinha' });
  const salvo = JSON.parse(arm.dados[Q.CHAVE]);
  assert.equal(V.validarConquistas(salvo), true);
  const { q: relida } = nova({ arm });
  assert.equal(relida.feita('cavadinha'), true);
  assert.equal(relida.contador('gols'), 1);
  const { q: suja } = nova({ arm: memoria({ [Q.CHAVE]: '{"versao":1,"dados":{"feitas":{"<script>":"x"}}}' }) });
  assert.equal(suja.quantasFeitas(), 0);
});

test('conquistas: nunca ha medalha por errar', () => {
  Q.LISTA.forEach(c => assert.ok(!/err|perd/i.test(c.id), c.id));
});

// ---------- Validacao: perfil, conquistas e estado da nuvem ----------

const estado = (extra = {}) => Object.assign({
  versao: 1, atualizadoEm: 1761000000000,
  carteira: { saldo: 50, totalGanho: 120, itens: ['borda:ouro', 'avatar:Leao'] },
  progressao: { fasesDesbloqueadas: ['penaltis', 'falta'], melhorPontuacao: { penaltis: 180 }, melhorGols: { penaltis: 2 } },
  conquistas: { feitas: { 'primeiro-gol': '2026-10-20T10:00:00.000Z' }, contadores: { gols: 3, contasCertas: 5, partidas: 2, compras: 1, dias: 1, ultimoDia: '2026-10-20' } },
  perfil: { personagem: 'Fera', animal: 'Tigre', avatarSeed: 'Leao', borda: 'ouro' }
}, extra);

test('estado da nuvem: aceita o formato certo e devolve copia', () => {
  const e = estado();
  const limpo = V.validarEstadoNuvem(e);
  assert.ok(limpo);
  assert.deepEqual(limpo, e);
  assert.notEqual(limpo.carteira, e.carteira);
});

test('estado da nuvem: recusa campo extra, dado pessoal e valores impossiveis', () => {
  assert.equal(V.validarEstadoNuvem(estado({ email: 'x@y.com' })), null);
  assert.equal(V.validarEstadoNuvem(estado({ perfil: { nomeReal: 'Ana' } })), null);
  assert.equal(V.validarEstadoNuvem(estado({ carteira: { saldo: 10, totalGanho: 5, itens: [] } })), null);
  assert.equal(V.validarEstadoNuvem(estado({ progressao: { fasesDesbloqueadas: ['penaltis', 'final'] } })), null);
  assert.equal(V.validarEstadoNuvem(estado({ versao: 2 })), null);
  assert.equal(V.validarEstadoNuvem(estado({ perfil: { borda: '<img src=x onerror=alert(1)>' } })), null);
});

test('backup local aceita as chaves novas (conquistas e perfil) e a borda na carteira', () => {
  const backup = {
    versao: 1, tipo: 'mathgol-backup-local', exportadoEm: '2026-10-23T12:00:00.000Z',
    dados: {
      mathgol_conquistas: JSON.stringify({ versao: 1, dados: estado().conquistas }),
      mathgol_perfil: JSON.stringify({ versao: 1, dados: estado().perfil }),
      mathgol_carteira: JSON.stringify({ versao: 1, dados: estado().carteira })
    }
  };
  const r = V.analisarArquivo(JSON.stringify(backup));
  assert.equal(r.ok, true, r.erro);
  assert.equal(r.entradas.length, 3);
});
