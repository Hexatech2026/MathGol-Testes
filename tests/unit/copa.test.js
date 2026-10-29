// v2.2 — Copa do Mundo 2026 (JS/copa.js) + validacao do estado salvo.
const test = require('node:test');
const assert = require('node:assert');
const CopaDados = require('../../JS/copa.js');
const V = require('../../JS/backup-validacao.js');

function memoria() {
  const m = {};
  return { ler: k => (k in m ? m[k] : null), gravar: (k, v) => { m[k] = v; }, remover: k => { delete m[k]; }, m };
}
const TIMES = {
  brasil: { id: 'brasil', nome: 'Brasil', bandeira: 'br' },
  italia: { id: 'italia', nome: 'Itália', bandeira: 'it' },
  flamengo: { id: 'flamengo', nome: 'Flamengo', bandeira: null }
};
function nova(sel, semente) {
  const arm = memoria();
  const copa = CopaDados.criar(arm, { resolverTime: id => TIMES[id], validar: o => V.validarCopa(o) });
  copa.iniciar(sel, semente);
  return { copa, arm };
}
// Joga um jogo inteiro com placar escolhido para a crianca.
function jogar(copa, golsVoce, golsAdv) {
  const jogo = copa.proximoJogo();
  jogo.golsAdv = golsAdv;
  for (let i = 0; i < golsAdv; i++) jogo.chutesAdv.push(true);
  return copa.registrarJogo(jogo, golsVoce);
}

test('grupos reais da Copa 2026: 12 grupos, 48 selecoes, Brasil no grupo C', () => {
  const letras = Object.keys(CopaDados.GRUPOS);
  assert.deepStrictEqual(letras, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
  const todas = letras.flatMap(g => CopaDados.GRUPOS[g].map(t => t[0]));
  assert.strictEqual(todas.length, 48);
  assert.strictEqual(new Set(todas).size, 48);
  assert.deepStrictEqual(CopaDados.GRUPOS.C.map(t => t[1]), ['Brasil', 'Marrocos', 'Escócia', 'Haiti']);
  const { copa } = nova('brasil', 7);
  assert.strictEqual(copa.estado().grupo, 'C');
});

test('time de fora da Copa (clube, Italia) entra como convidado num grupo', () => {
  for (const sel of ['flamengo', 'italia']) {
    const { copa } = nova(sel, 12345);
    const r = copa.resumo();
    const linhas = r.tabelas[r.grupo];
    assert.strictEqual(linhas.length, 4);
    assert.ok(linhas.some(l => l.time.voce && l.time.nome === TIMES[sel].nome));
  }
});

test('jornada: 3 jogos de grupo (3 cobrancas), mata-mata de 5 e final de 7', () => {
  const { copa } = nova('brasil', 99);
  const fases = [];
  for (let i = 0; i < 8; i++) {
    const j = copa.proximoJogo();
    assert.ok(j, 'jogo ' + i);
    fases.push(j.faseId);
    const r = jogar(copa, 3, 0);
    if (i === 2) assert.strictEqual(r.classificou, true);
  }
  assert.deepStrictEqual(fases, ['penaltis', 'penaltis', 'penaltis', 'falta', 'falta', 'falta', 'falta', 'final']);
  assert.strictEqual(copa.estado().status, 'campeao');
  assert.strictEqual(copa.proximoJogo(), null);
});

test('adversarios do grupo sao os 3 rivais reais e nao se repetem no mata-mata', () => {
  const { copa } = nova('brasil', 2024);
  const advs = [];
  for (let i = 0; i < 8; i++) { advs.push(copa.proximoJogo().adversario.id); jogar(copa, 2, 0); }
  assert.deepStrictEqual(advs.slice(0, 3).sort(), ['gb-sct', 'ht', 'ma']);
  assert.strictEqual(new Set(advs).size, 8);
});

test('perder no mata-mata elimina; empate no grupo vale ponto', () => {
  const { copa } = nova('brasil', 5);
  const e = jogar(copa, 1, 1);
  assert.strictEqual(e.resultado, 'empate');
  assert.strictEqual(e.bonus, CopaDados.BONUS.empateGrupo);
  jogar(copa, 3, 0); jogar(copa, 3, 0);
  const r = jogar(copa, 0, 2);
  assert.strictEqual(r.eliminado, true);
  assert.strictEqual(copa.estado().status, 'eliminado');
});

test('morte subita: so no mata-mata e so com empate', () => {
  const { copa } = nova('brasil', 3);
  const grupo = copa.proximoJogo();
  grupo.golsAdv = 2;
  assert.strictEqual(copa.precisaMorteSubita(grupo, 2), false);
  jogar(copa, 3, 0); jogar(copa, 3, 0); jogar(copa, 3, 0);
  const mm = copa.proximoJogo();
  mm.golsAdv = 3; mm.chutesAdv = [true, true, true, false, false];
  assert.strictEqual(copa.precisaMorteSubita(mm, 3), true);
  assert.strictEqual(copa.precisaMorteSubita(mm, 4), false);
});

test('tabela e adversarios nao mudam ao recarregar (semente salva)', () => {
  const { copa, arm } = nova('brasil', 777);
  jogar(copa, 2, 1);
  const antes = JSON.stringify(copa.resumo().tabelas);
  const copa2 = CopaDados.criar(arm, { resolverTime: id => TIMES[id], validar: o => V.validarCopa(o) });
  assert.strictEqual(JSON.stringify(copa2.resumo().tabelas), antes);
  assert.strictEqual(copa2.proximoJogo().adversario.id, copa.proximoJogo().adversario.id);
});

test('chute do adversario: chance maior contra time forte e na final', () => {
  const { copa } = nova('brasil', 1);
  const base = { etapa: CopaDados.ETAPAS[0], adversario: { forca: 1 }, golsAdv: 0, chutesAdv: [] };
  const forte = { etapa: CopaDados.ETAPAS[7], adversario: { forca: 5 }, golsAdv: 0, chutesAdv: [] };
  assert.strictEqual(copa.chuteAdversario(base, () => 0.4), false);   // p = 0.33
  assert.strictEqual(copa.chuteAdversario(forte, () => 0.6), true);   // p = 0.705
});

test('validarCopa recusa estado adulterado', () => {
  const { copa } = nova('brasil', 11);
  jogar(copa, 2, 1);
  const bom = { versao: 1, dados: copa.estado() };
  assert.strictEqual(V.validarCopa(bom), true);
  const ruins = [
    Object.assign({}, bom.dados, { grupo: 'Z' }),
    Object.assign({}, bom.dados, { status: 'tetra' }),
    Object.assign({}, bom.dados, { jogos: [{ etapa: 'final', adv: 'ar', gp: 1, gc: 0, ms: false }] }),
    Object.assign({}, bom.dados, { jogos: [{ etapa: 'grupo1', adv: '<x>', gp: 1, gc: 0, ms: false }] }),
    Object.assign({}, bom.dados, { extra: 1 })
  ];
  ruins.forEach(d => assert.strictEqual(V.validarCopa({ versao: 1, dados: d }), false));
  // E entra no estado da nuvem.
  assert.ok(V.validarEstadoNuvem({ versao: 1, atualizadoEm: 1, copa: bom.dados }));
});
