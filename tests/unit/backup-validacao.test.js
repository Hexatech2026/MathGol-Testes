// Testes da validacao de backup e de resultados (JS/backup-validacao.js).
// Rodar: npm run test:unit
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../../JS/backup-validacao.js');

const resultadoValido = () => ({
  versaoEsquema: 2, faseId: 'penaltis', dificuldadeId: 'facil', selecaoId: 'brasil',
  gols: 2, totalCobrancas: 3, pontuacao: 150, tempoTotalSegundos: 12,
  resumoCobrancas: 'GFG', data: '2026-09-22T12:00:00.000Z'
});

function backupLocal(dados, extra) {
  return JSON.stringify(Object.assign({ versao: 1, tipo: 'mathgol-backup-local', exportadoEm: '2026-09-22T12:00:00.000Z', dados }, extra));
}

const progressoOk = JSON.stringify({ versao: 1, dados: { fasesDesbloqueadas: ['penaltis', 'falta'], melhorPontuacao: { penaltis: 250 }, melhorGols: { penaltis: 3 } } });
const progresso = dados => JSON.stringify({ versao: 1, dados });
const acessOk = JSON.stringify({ altoContraste: true, espacoDislexia: false, narracaoAtiva: true, sfxAtivo: true });

test('backup local valido e aceito e so devolve chaves permitidas', () => {
  const r = V.analisarArquivo(backupLocal({ mathgol_progressao: progressoOk, mathgol_acessibilidade: acessOk, mathgol_token: 'abc' }));
  assert.equal(r.ok, true, r.erro);
  assert.deepEqual(r.entradas.map(e => e.chave).sort(), ['mathgol_acessibilidade', 'mathgol_progressao']);
});

test('antigo mathgol_token e ignorado (nunca restaurado como credencial)', () => {
  const r = V.analisarArquivo(backupLocal({ mathgol_token: 'uuid-antigo', mathgol_acessibilidade: acessOk }));
  assert.equal(r.ok, true);
  assert.ok(!r.entradas.some(e => e.chave === 'mathgol_token'));
});

test('chave estranha no backup local → recusado', () => {
  const r = V.analisarArquivo(backupLocal({ mathgol_acessibilidade: acessOk, 'firebase:authUser:x': '{}' }));
  assert.equal(r.ok, false);
  assert.match(r.erro, /desconhecidos/);
});

test('chave com prefixo mathgol_ mas fora da lista → recusado', () => {
  const r = V.analisarArquivo(backupLocal({ mathgol_qualquer: '{}' }));
  assert.equal(r.ok, false);
});

test('arquivo grande demais → recusado', () => {
  const grande = 'x'.repeat(V.TAMANHO_MAXIMO_BYTES + 1);
  const r = V.analisarArquivo(grande, grande.length);
  assert.equal(r.ok, false);
  assert.match(r.erro, /grande demais/);
});

test('versao e tipo sao validados', () => {
  assert.equal(V.analisarArquivo(backupLocal({ mathgol_acessibilidade: acessOk }, { versao: 99 })).ok, false);
  assert.equal(V.analisarArquivo(JSON.stringify({ versao: 1, tipo: 'outra-coisa', dados: {} })).ok, false);
  assert.equal(V.analisarArquivo('nao e json').ok, false);
  assert.equal(V.analisarArquivo('[]').ok, false);
  assert.equal(V.analisarArquivo('').ok, false);
});

test('valor adulterado (formato errado) → recusado', () => {
  const adulterado = JSON.stringify({ versao: 1, dados: { fasesDesbloqueadas: ['penaltis', 'hackeada'] } });
  assert.equal(V.analisarArquivo(backupLocal({ mathgol_progressao: adulterado })).ok, false);
  assert.equal(V.analisarArquivo(backupLocal({ mathgol_acessibilidade: '{"altoContraste":"sim"}' })).ok, false);
  assert.equal(V.analisarArquivo(backupLocal({ mathgol_acessibilidade: 42 })).ok, false);
  assert.equal(V.analisarArquivo(backupLocal({ mathgol_acessibilidade: '{nao-json' })).ok, false);
});

test('backup local incompleto → erro amigavel', () => {
  const r = V.analisarArquivo(JSON.stringify({ versao: 1, tipo: 'mathgol-backup-local' }));
  assert.equal(r.ok, false);
  assert.match(r.erro, /incompleto/);
});

test('backup da nuvem: resultados precisa ser array', () => {
  const base = { versao: 2, tipo: 'mathgol-backup-firebase', exportadoEm: 'x', perfil: null };
  assert.equal(V.analisarArquivo(JSON.stringify(Object.assign({}, base, { resultados: {} }))).ok, false);
  assert.equal(V.analisarArquivo(JSON.stringify(base)).ok, false);
  assert.equal(V.analisarArquivo(JSON.stringify(Object.assign({}, base, { resultados: [] }))).ok, true);
});

test('backup da nuvem valido e copiado sem alterar o original', () => {
  const original = { versao: 2, tipo: 'mathgol-backup-firebase', exportadoEm: 'x',
    perfil: { apelido: 'Fera Tigre', avatarSeed: 'Bola1' },
    resultados: [{ id: 'abc123', dados: resultadoValido() }] };
  const texto = JSON.stringify(original);
  const r = V.analisarArquivo(texto);
  assert.equal(r.ok, true, r.erro);
  assert.equal(r.dados.resultados[0].id, 'abc123');
  assert.deepEqual(JSON.parse(texto), original);
});

test('backup da nuvem com campo extra, id ruim ou resultado implausivel → recusado', () => {
  const base = () => ({ versao: 2, tipo: 'mathgol-backup-firebase', exportadoEm: 'x', perfil: null, resultados: [{ id: 'a', dados: resultadoValido() }] });
  const b1 = base(); b1.token = 'x';
  const b2 = base(); b2.resultados[0].id = '../outro-usuario';
  const b3 = base(); b3.resultados[0].dados.gols = 99;
  const b4 = base(); b4.resultados[0].dados.admin = true;
  const b5 = base(); b5.perfil = { apelido: '<img src=x onerror=alert(1)>' };
  for (const b of [b1, b2, b3, b4, b5]) assert.equal(V.analisarArquivo(JSON.stringify(b)).ok, false);
});

test('backup da nuvem v1 (formato antigo com token) → recusado com mensagem clara', () => {
  const r = V.analisarArquivo(JSON.stringify({ versao: 1, tipo: 'mathgol-backup-firebase', token: 'uuid', jogador: {}, resultados: [] }));
  assert.equal(r.ok, false);
  assert.match(r.erro, /versão antiga/);
});

test('validarResultadoPartida: limites de gols, pontos, tempo e resumo', () => {
  assert.equal(V.validarResultadoPartida(resultadoValido()), null);
  const casos = [
    r => { r.gols = 4; },
    r => { r.pontuacao = 999; },
    r => { r.pontuacao = 5; },
    r => { r.tempoTotalSegundos = 1000; },
    r => { r.resumoCobrancas = 'GGG'; },
    r => { r.resumoCobrancas = 'GXG'; },
    r => { r.totalCobrancas = 5; },
    r => { r.faseId = 'copa'; },
    r => { r.selecaoId = 'Brasil <b>'; },
    r => { r.data = 'ontem'; },
    r => { r.extra = 1; }
  ];
  for (const alterar of casos) {
    const r = resultadoValido();
    alterar(r);
    assert.notEqual(V.validarResultadoPartida(r), null, JSON.stringify(r));
  }
});

test('QA-4 (DEF-17): progresso incompativel com a fase → recusado', () => {
  const casos = [
    // Contraexemplo do relatorio: Penaltis tem 3 cobrancas.
    { fasesDesbloqueadas: ['final'], melhorGols: { penaltis: 7 }, melhorPontuacao: { penaltis: 700 } },
    { fasesDesbloqueadas: ['final'] },                                   // pula fases
    { fasesDesbloqueadas: ['penaltis', 'final'], melhorGols: { penaltis: 3, falta: 5 }, melhorPontuacao: { penaltis: 300, falta: 500 } },
    { fasesDesbloqueadas: ['penaltis', 'falta'], melhorGols: { penaltis: 1 }, melhorPontuacao: { penaltis: 90 } }, // sem gols pra desbloquear
    { fasesDesbloqueadas: ['penaltis'], melhorGols: { penaltis: 4 } },   // mais gols que cobrancas
    { fasesDesbloqueadas: ['penaltis'], melhorGols: { penaltis: 1 }, melhorPontuacao: { penaltis: 300 } }, // pontos > gols*100
    { fasesDesbloqueadas: ['penaltis'], melhorGols: { penaltis: 2 }, melhorPontuacao: { penaltis: 5 } },   // pontos < gols*10
    { fasesDesbloqueadas: ['penaltis'], melhorGols: { penaltis: 2.5 }, melhorPontuacao: { penaltis: 100 } },
    { fasesDesbloqueadas: ['penaltis', 'penaltis'] }
  ];
  for (const dados of casos) {
    assert.equal(V.validarProgressao(JSON.parse(progresso(dados))), false, JSON.stringify(dados));
    assert.equal(V.analisarArquivo(backupLocal({ mathgol_progressao: progresso(dados) })).ok, false, JSON.stringify(dados));
  }
});

test('progresso coerente com as 3 fases → aceito', () => {
  const ok = { fasesDesbloqueadas: ['penaltis', 'falta', 'final'], melhorGols: { penaltis: 2, falta: 3, final: 7 }, melhorPontuacao: { penaltis: 150, falta: 240, final: 700 } };
  assert.equal(V.validarProgressao({ versao: 1, dados: ok }), true);
  assert.equal(V.validarProgressao({ fasesDesbloqueadas: ['penaltis'] }), true); // legado sem versao
});
