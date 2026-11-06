// Testa JS/limpar-expirados.js contra o emulador do Firestore.
// Semeia documentos vencidos, no prazo e SEM data de validade, roda o
// script em simulação e depois apagando, e confere o que sobrou.
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');
const admin = require('firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIREBASE_PROJECT_ID = 'demo-mathgol';
process.env.FIREBASE_CLIENT_EMAIL = 'teste@demo-mathgol.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = 'emulador';

admin.initializeApp({ projectId: 'demo-mathgol' });
const db = admin.firestore();
const T = admin.firestore.Timestamp;
const ontem = T.fromMillis(Date.now() - 86400000);
const amanha = T.fromMillis(Date.now() + 86400000);

async function semear() {
  // Vencidos (têm de sair), com subcoleção.
  await db.doc('salas/VEN-001').set({ nome: 'velha', nivel: 1, dono: 'p', expiraEm: ontem });
  await db.doc('salas/VEN-001/alunos/a1').set({ apelido: 'Fera' });
  await db.doc('salas/VEN-001/alunos/a2').set({ apelido: 'Raio' });
  await db.doc('partidas/1111').set({ dono: 'p', nivel: 1, expiraEm: ontem });
  await db.doc('partidas/1111/jogadores/j1').set({ apelido: 'Craque' });
  await db.doc('jogadores/velho').set({ apelido: 'Antigo', expiraEm: ontem });
  await db.doc('jogadores/velho/resultados/r1').set({ gols: 2 });
  await db.doc('apelidos/velho').set({ apelido: 'Antigo' });

  // No prazo (têm de ficar).
  await db.doc('salas/ATU-002').set({ nome: 'atual', nivel: 1, dono: 'p', expiraEm: amanha });
  await db.doc('jogadores/atual').set({ apelido: 'Ativo', expiraEm: amanha });
  await db.doc('apelidos/atual').set({ apelido: 'Ativo' });

  // SEM data de validade: perfil antigo, anterior à HU-20. Não pode sumir.
  await db.doc('jogadores/semdata').set({ apelido: 'Sem data', ultimoAcessoEm: ontem });
  await db.doc('apelidos/semdata').set({ apelido: 'Sem data' });
}

function rodar(apagar) {
  return execFileSync(process.execPath,
    [path.join(__dirname, '..', '..', 'JS', 'limpar-expirados.js')].concat(apagar ? ['--apagar'] : []),
    { encoding: 'utf8', env: process.env });
}

async function existe(caminho) { return (await db.doc(caminho).get()).exists; }

(async () => {
  await semear();

  // 1. Simulação não pode apagar nada.
  const saidaSim = rodar(false);
  assert.match(saidaSim, /Simulação/);
  assert.ok(await existe('salas/VEN-001'), 'simulação apagou a sala vencida');
  assert.ok(await existe('jogadores/velho'), 'simulação apagou o perfil vencido');
  console.log('OK   simulação não apaga nada');
  console.log(saidaSim.trim().split('\n').map(l => '     ' + l).join('\n'));

  // 2. Com --apagar, só o que venceu sai.
  const saida = rodar(true);
  assert.match(saida, /APAGANDO/);
  assert.strictEqual(await existe('salas/VEN-001'), false, 'sala vencida ficou');
  assert.strictEqual(await existe('salas/VEN-001/alunos/a1'), false, 'aluno da sala vencida ficou');
  assert.strictEqual(await existe('partidas/1111'), false, 'partida vencida ficou');
  assert.strictEqual(await existe('partidas/1111/jogadores/j1'), false, 'jogador da partida vencida ficou');
  assert.strictEqual(await existe('jogadores/velho'), false, 'perfil vencido ficou');
  assert.strictEqual(await existe('jogadores/velho/resultados/r1'), false, 'resultado do perfil vencido ficou');
  assert.strictEqual(await existe('apelidos/velho'), false, 'apelido do perfil vencido ficou');
  console.log('OK   apaga o vencido, inclusive subcoleções e apelido');

  assert.ok(await existe('salas/ATU-002'), 'apagou sala no prazo');
  assert.ok(await existe('jogadores/atual'), 'apagou perfil no prazo');
  assert.ok(await existe('apelidos/atual'), 'apagou apelido no prazo');
  console.log('OK   preserva o que está no prazo');

  assert.ok(await existe('jogadores/semdata'), 'apagou perfil SEM data de validade');
  assert.ok(await existe('apelidos/semdata'), 'apagou apelido de perfil sem data');
  console.log('OK   preserva perfil sem data de validade (anterior à HU-20)');

  console.log(saida.trim().split('\n').map(l => '     ' + l).join('\n'));
  await admin.app().delete();
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });
