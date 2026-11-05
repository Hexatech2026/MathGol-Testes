// Testes das regras do Firestore (Config/firestore.rules) no Firebase Emulator.
//
// Rodar (precisa de Java 11+ instalado):
//   npm run test:rules
// O script sobe o emulador do Firestore, roda este arquivo e derruba o
// emulador no fim. Nada aqui toca o projeto real (projectId "demo-...").
const test = require('node:test');
const { before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, getDocs, collection, deleteDoc, serverTimestamp, Timestamp } = require('firebase/firestore');

let env;

const resumo = (extra = {}) => Object.assign({
  versaoEsquema: 2, faseId: 'penaltis', dificuldadeId: 'facil', selecaoId: 'brasil',
  gols: 2, totalCobrancas: 3, pontuacao: 150, tempoTotalSegundos: 12,
  resumoCobrancas: 'GFG', data: '2026-09-22T12:00:00.000Z'
}, extra);

const resultado = (extra = {}) => Object.assign(resumo(), { criadoEm: serverTimestamp() }, extra);
const perfil = (extra = {}) => Object.assign({ apelido: 'Fera Tigre', avatarSeed: 'Bola1', atualizadoEm: serverTimestamp(), ultimoAcessoEm: serverTimestamp() }, extra);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-mathgol',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', '..', 'Config', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080
    }
  });
});

after(async () => { if (env) await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'personagens', 'fera'), { texto: 'Fera' });
    await setDoc(doc(db, 'selecoes', 'brasil'), { nome: 'Brasil', bandeira: 'br' });
    await setDoc(doc(db, 'jogadores', 'bob'), { apelido: 'Raio Lobo' });
    await setDoc(doc(db, 'jogadores', 'bob', 'resultados', 'r1'), Object.assign(resumo(), { criadoEm: Timestamp.now() }));
    await setDoc(doc(db, 'apelidos', 'bob'), { apelido: 'Raio Lobo' });
    // Documento legado da versao com "token" (UUID do navegador).
    await setDoc(doc(db, 'jogadores', '3f1c9a2e-0000-4000-8000-000000000000'), { apelido: 'Antigo' });
  });
});

const alice = () => env.authenticatedContext('alice').firestore();
const bob = () => env.authenticatedContext('bob').firestore();
const anonimo = () => env.unauthenticatedContext().firestore();

test('configuracoes publicas continuam legiveis (inclusive sem login)', async () => {
  await assertSucceeds(getDoc(doc(anonimo(), 'personagens', 'fera')));
  await assertSucceeds(getDocs(collection(anonimo(), 'selecoes')));
  await assertFails(setDoc(doc(alice(), 'selecoes', 'brasil'), { nome: 'Hack' }));
});

test('usuario nao autenticado nao acessa dados privados', async () => {
  const db = anonimo();
  await assertFails(getDoc(doc(db, 'jogadores', 'bob')));
  await assertFails(getDocs(collection(db, 'jogadores')));
  await assertFails(getDocs(collection(db, 'jogadores', 'bob', 'resultados')));
  await assertFails(getDoc(doc(db, 'apelidos', 'bob')));
  await assertFails(setDoc(doc(db, 'jogadores', 'bob'), { apelido: 'x' }));
});

test('usuario autenticado acessa apenas os proprios documentos', async () => {
  const db = alice();
  await assertSucceeds(setDoc(doc(db, 'jogadores', 'alice'), perfil()));
  await assertSucceeds(getDoc(doc(db, 'jogadores', 'alice')));
  await assertSucceeds(setDoc(doc(db, 'jogadores', 'alice', 'resultados', 'abc'), resultado()));
  await assertSucceeds(getDocs(collection(db, 'jogadores', 'alice', 'resultados')));
  await assertSucceeds(setDoc(doc(db, 'apelidos', 'alice'), { apelido: 'Fera Tigre', avatarSeed: 'Bola1', atualizadoEm: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db, 'jogadores', 'alice'), { ultimoAcessoEm: serverTimestamp(), ultimoResultado: resumo() }, { merge: true }));
  // v2.0 (LGPD art. 18): o dono apaga os PROPRIOS dados ("Apagar meus dados").
  await assertSucceeds(deleteDoc(doc(db, 'jogadores', 'alice', 'resultados', 'abc')));
  await assertSucceeds(deleteDoc(doc(db, 'jogadores', 'alice')));
  await assertSucceeds(deleteDoc(doc(db, 'apelidos', 'alice')));
});

const estado = (extra = {}) => Object.assign({
  versao: 1, atualizadoEm: 1761000000000,
  carteira: { saldo: 50, totalGanho: 120, itens: ['borda:ouro', 'avatar:Leao'] },
  progressao: { fasesDesbloqueadas: ['penaltis', 'falta'], melhorPontuacao: { penaltis: 180 }, melhorGols: { penaltis: 2 } },
  conquistas: { feitas: { 'primeiro-gol': '2026-10-20T10:00:00.000Z' }, contadores: { gols: 3, contasCertas: 5, partidas: 2, compras: 1, dias: 1, ultimoDia: '2026-10-20' } },
  perfil: { personagem: 'Fera', animal: 'Tigre', avatarSeed: 'Leao', borda: 'ouro' }
}, extra);

test('v2.0: estado do craque (codigo do craque) so com formato valido', async () => {
  const db = alice();
  const ref = doc(db, 'jogadores', 'alice');
  await assertSucceeds(setDoc(ref, { estado: estado() }, { merge: true }));
  await assertFails(setDoc(ref, { estado: estado({ email: 'x@y.com' }) }, { merge: true }));                 // campo extra (dado pessoal)
  await assertFails(setDoc(ref, { estado: estado({ carteira: { saldo: 9999999, totalGanho: 9999999, itens: [] } }) }, { merge: true }));
  await assertFails(setDoc(ref, { estado: estado({ carteira: { saldo: 10, totalGanho: 5, itens: [] } }) }, { merge: true })); // saldo > ganho
  await assertFails(setDoc(ref, { estado: estado({ perfil: { nomeReal: 'Ana' } }) }, { merge: true }));
  await assertFails(setDoc(doc(bob(), 'jogadores', 'alice'), { estado: estado() }, { merge: true }));     // nunca no doc de outro
});

test('usuario A nao le nem altera dados de B', async () => {
  const db = alice();
  await assertFails(getDoc(doc(db, 'jogadores', 'bob')));
  await assertFails(getDocs(collection(db, 'jogadores')));
  await assertFails(getDocs(collection(db, 'jogadores', 'bob', 'resultados')));
  await assertFails(getDoc(doc(db, 'jogadores', 'bob', 'resultados', 'r1')));
  await assertFails(getDoc(doc(db, 'apelidos', 'bob')));
  await assertFails(setDoc(doc(db, 'jogadores', 'bob'), perfil()));
  await assertFails(setDoc(doc(db, 'jogadores', 'bob', 'resultados', 'x'), resultado()));
  await assertFails(setDoc(doc(db, 'apelidos', 'bob'), { apelido: 'Hack' }));
  await assertFails(deleteDoc(doc(db, 'jogadores', 'bob')));
  await assertFails(deleteDoc(doc(db, 'jogadores', 'bob', 'resultados', 'r1')));
  // E o proprio B continua lendo o que e dele.
  await assertSucceeds(getDoc(doc(bob(), 'jogadores', 'bob')));
});

test('documentos antigos por token ficam inacessiveis para qualquer cliente', async () => {
  const id = '3f1c9a2e-0000-4000-8000-000000000000';
  await assertFails(getDoc(doc(alice(), 'jogadores', id)));
  await assertFails(setDoc(doc(alice(), 'jogadores', id), { apelido: 'Meu agora' }));
});

test('esquema do jogador: campos inesperados, tipos e tamanhos', async () => {
  const db = alice();
  await assertFails(setDoc(doc(db, 'jogadores', 'alice'), perfil({ admin: true })));
  await assertFails(setDoc(doc(db, 'jogadores', 'alice'), perfil({ apelido: 'x'.repeat(41) })));
  await assertFails(setDoc(doc(db, 'jogadores', 'alice'), perfil({ apelido: 123 })));
  await assertFails(setDoc(doc(db, 'jogadores', 'alice'), perfil({ ultimoResultado: resumo({ gols: 7 }) })));
  await assertFails(setDoc(doc(db, 'apelidos', 'alice'), { apelido: 'Fera', extra: 1 }));
});

test('esquema do resultado: limites plausiveis e campos inesperados', async () => {
  const db = alice();
  const ref = id => doc(db, 'jogadores', 'alice', 'resultados', id);
  await assertSucceeds(setDoc(ref('ok5'), resultado({ faseId: 'falta', totalCobrancas: 5, resumoCobrancas: 'GDTFG', gols: 2 })));
  await assertFails(setDoc(ref('a'), resultado({ gols: 4 })));                               // mais gols que cobrancas
  await assertFails(setDoc(ref('b'), resultado({ pontuacao: 9999 })));                       // pontos impossiveis
  await assertFails(setDoc(ref('c'), resultado({ tempoTotalSegundos: 600 })));               // tempo impossivel
  await assertFails(setDoc(ref('d'), resultado({ resumoCobrancas: 'GGG' })));                // resumo x gols
  await assertFails(setDoc(ref('e'), resultado({ totalCobrancas: 5 })));                     // total x fase
  await assertFails(setDoc(ref('f'), resultado({ faseId: 'copa' })));                        // fase desconhecida
  await assertFails(setDoc(ref('g'), resultado({ trapaca: true })));                         // campo extra
  await assertFails(setDoc(ref('h'), resultado({ gols: 2.5 })));                             // tipo errado
  await assertFails(setDoc(ref('i'), resultado({ criadoEm: Timestamp.fromDate(new Date('2020-01-01')) }))); // data forjada
  const semData = resultado(); delete semData.data;
  await assertFails(setDoc(ref('j'), semData));                                               // campo obrigatorio
});

// ---------- HU-14: Sala do Professor (card R03) ----------
// alice = professora dona da sala ABC-123; bob = aluno; carol = outra pessoa
// logada que sabe o codigo.
const carol = () => env.authenticatedContext('carol').firestore();
const sala = (extra = {}) => Object.assign({ nome: '5A manha', nivel: 3, tipos: ['soma'], dono: 'alice', criadoEm: serverTimestamp() }, extra);
const aluno = (extra = {}) => Object.assign({ apelido: 'Raio Lobo', gols: 2, pontuacao: 150, fase: 'penaltis', nivelId: 3, verificado: false, atualizadoEm: serverTimestamp() }, extra);

async function semearSala() {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'salas', 'ABC-123'), { nome: '5A manha', nivel: 3, tipos: [], dono: 'alice', criadoEm: Timestamp.now() });
    await setDoc(doc(db, 'salas', 'ABC-123', 'alunos', 'bob'), { apelido: 'Raio Lobo', gols: 2, pontuacao: 150 });
  });
}

test('sala: professor cria a sala so em nome proprio e com formato valido', async () => {
  await assertSucceeds(setDoc(doc(alice(), 'salas', 'XYZ-789'), sala()));
  await assertFails(setDoc(doc(alice(), 'salas', 'XYZ-790'), sala({ dono: 'bob' })));       // dono alheio
  await assertFails(setDoc(doc(alice(), 'salas', 'xyz790'), sala()));                      // codigo fora do formato
  await assertFails(setDoc(doc(alice(), 'salas', 'XYZ-791'), sala({ nivel: 13 })));         // nivel fora da escada
  await assertFails(setDoc(doc(alice(), 'salas', 'XYZ-792'), sala({ tipos: ['potencia'] }))); // tipo inexistente
  await assertFails(setDoc(doc(alice(), 'salas', 'XYZ-793'), sala({ extra: 1 })));          // campo inesperado
  await assertFails(setDoc(doc(anonimo(), 'salas', 'XYZ-794'), sala()));                    // sem login
});

test('sala: quem sabe o codigo le a sala, mas ninguem lista as salas', async () => {
  await semearSala();
  await assertSucceeds(getDoc(doc(bob(), 'salas', 'ABC-123')));
  await assertSucceeds(getDoc(doc(bob(), 'salas', 'NAO-EXI')));   // conferir se o codigo existe
  await assertFails(getDoc(doc(anonimo(), 'salas', 'ABC-123')));
  await assertFails(getDocs(collection(bob(), 'salas')));
  await assertFails(getDocs(collection(alice(), 'salas')));
});

test('sala: so a professora dona troca o nivel, sem trocar o dono', async () => {
  await semearSala();
  await assertSucceeds(setDoc(doc(alice(), 'salas', 'ABC-123'), { nivel: 5, tipos: ['subtracao'] }, { merge: true }));
  await assertFails(setDoc(doc(carol(), 'salas', 'ABC-123'), { nivel: 12 }, { merge: true }));
  await assertFails(setDoc(doc(bob(), 'salas', 'ABC-123'), { nivel: 12 }, { merge: true }));
  await assertFails(setDoc(doc(alice(), 'salas', 'ABC-123'), { dono: 'carol' }, { merge: true }));
  await assertFails(setDoc(doc(carol(), 'salas', 'ABC-123'), sala({ dono: 'carol' })));   // "recriar" por cima
  await assertFails(deleteDoc(doc(alice(), 'salas', 'ABC-123')));
});

test('sala: so a professora ve a turma; cada aluno so escreve o proprio lugar', async () => {
  await semearSala();
  await assertSucceeds(getDocs(collection(alice(), 'salas', 'ABC-123', 'alunos')));
  await assertFails(getDocs(collection(carol(), 'salas', 'ABC-123', 'alunos')));
  await assertFails(getDocs(collection(bob(), 'salas', 'ABC-123', 'alunos')));
  await assertSucceeds(getDoc(doc(bob(), 'salas', 'ABC-123', 'alunos', 'bob')));
  await assertFails(getDoc(doc(carol(), 'salas', 'ABC-123', 'alunos', 'bob')));
  await assertSucceeds(setDoc(doc(carol(), 'salas', 'ABC-123', 'alunos', 'carol'), aluno()));
  await assertFails(setDoc(doc(carol(), 'salas', 'ABC-123', 'alunos', 'bob'), aluno({ gols: 0 })));
  await assertFails(setDoc(doc(carol(), 'salas', 'ABC-123', 'alunos', 'carol'), aluno({ nomeReal: 'Joao' })));
  await assertSucceeds(deleteDoc(doc(bob(), 'salas', 'ABC-123', 'alunos', 'bob')));
});

// ---------- HU-15: pausa da sala ----------

test('sala: so a dona pausa e retoma a aula', async () => {
  await semearSala();
  await assertSucceeds(setDoc(doc(alice(), 'salas', 'ABC-123'), { pausada: true }, { merge: true }));
  await assertSucceeds(setDoc(doc(alice(), 'salas', 'ABC-123'), { pausada: false }, { merge: true }));
  await assertFails(setDoc(doc(carol(), 'salas', 'ABC-123'), { pausada: true }, { merge: true }));
  await assertFails(setDoc(doc(bob(), 'salas', 'ABC-123'), { pausada: true }, { merge: true }));
  await assertFails(setDoc(doc(alice(), 'salas', 'ABC-123'), { pausada: 'sim' }, { merge: true }));
  // A crianca precisa LER a pausa para a tela aparecer.
  await assertSucceeds(getDoc(doc(bob(), 'salas', 'ABC-123')));
});

// ---------- HU-21: duelo online (partidas/{codigo}) ----------

const perguntas = [{ a: 2, b: 3, tipo: 'soma' }, { a: 5, b: 1, tipo: 'subtracao' }];
const partida = (extra = {}) => Object.assign({ dono: 'alice', nivel: 3, perguntas, status: 'esperando', criadoEm: serverTimestamp() }, extra);
const jogadorP = (extra = {}) => Object.assign({ apelido: 'Fera Tigre', avatarSeed: 'Tigre', gols: 1, pontuacao: 80, cobranca: 2, fim: false, atualizadoEm: serverTimestamp() }, extra);

async function semearPartida() {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'partidas', '1234'), { dono: 'alice', nivel: 3, perguntas, status: 'esperando', criadoEm: Timestamp.now() });
    await setDoc(doc(db, 'partidas', '1234', 'jogadores', 'alice'), { apelido: 'Capita Onca', gols: 0, pontuacao: 0, cobranca: 0, fim: false });
    await setDoc(doc(db, 'partidas', '1234', 'jogadores', 'bob'), { apelido: 'Raio Lobo', gols: 2, pontuacao: 150, cobranca: 3, fim: false });
  });
}

test('partida: criada so em nome proprio, com codigo de 4 digitos', async () => {
  await assertSucceeds(setDoc(doc(alice(), 'partidas', '4321'), partida()));
  await assertFails(setDoc(doc(alice(), 'partidas', '4322'), partida({ dono: 'bob' })));
  await assertFails(setDoc(doc(alice(), 'partidas', 'abcd'), partida()));
  await assertFails(setDoc(doc(alice(), 'partidas', '43'), partida()));
  await assertFails(setDoc(doc(alice(), 'partidas', '4323'), partida({ nivel: 99 })));
  await assertFails(setDoc(doc(alice(), 'partidas', '4324'), partida({ perguntas: [] })));
  await assertFails(setDoc(doc(alice(), 'partidas', '4325'), partida({ chat: 'oi' })));
  await assertFails(setDoc(doc(anonimo(), 'partidas', '4326'), partida()));
});

test('partida: quem tem o codigo le; ninguem varre as partidas', async () => {
  await semearPartida();
  await assertSucceeds(getDoc(doc(bob(), 'partidas', '1234')));
  await assertFails(getDocs(collection(bob(), 'partidas')));
  await assertFails(getDoc(doc(anonimo(), 'partidas', '1234')));
});

test('partida: as contas combinadas nao mudam no meio', async () => {
  await semearPartida();
  await assertSucceeds(setDoc(doc(alice(), 'partidas', '1234'), { status: 'jogando' }, { merge: true }));
  await assertFails(setDoc(doc(alice(), 'partidas', '1234'), { perguntas: [{ a: 9, b: 9, tipo: 'soma' }] }, { merge: true }));
  await assertFails(setDoc(doc(alice(), 'partidas', '1234'), { nivel: 12 }, { merge: true }));
  await assertFails(setDoc(doc(bob(), 'partidas', '1234'), { status: 'fim' }, { merge: true }));
  await assertFails(deleteDoc(doc(alice(), 'partidas', '1234')));
});

test('partida: cada um grava so o proprio placar (CA-21.8)', async () => {
  await semearPartida();
  await assertSucceeds(setDoc(doc(bob(), 'partidas', '1234', 'jogadores', 'bob'), jogadorP()));
  await assertFails(setDoc(doc(bob(), 'partidas', '1234', 'jogadores', 'alice'), jogadorP({ gols: 0 })));
  await assertFails(setDoc(doc(bob(), 'partidas', '1234', 'jogadores', 'bob'), jogadorP({ recado: 'oi' })));
  await assertFails(setDoc(doc(bob(), 'partidas', '1234', 'jogadores', 'bob'), jogadorP({ gols: 99 })));
  await assertFails(setDoc(doc(bob(), 'partidas', '1234', 'jogadores', 'bob'), jogadorP({ pontuacao: -5 })));
});

test('partida: so quem esta dentro ve a lista de jogadores', async () => {
  await semearPartida();
  await assertSucceeds(getDocs(collection(alice(), 'partidas', '1234', 'jogadores')));
  await assertSucceeds(getDocs(collection(bob(), 'partidas', '1234', 'jogadores')));
  // carol sabe o codigo mas nao entrou: nao ve os apelidos da partida.
  await assertFails(getDocs(collection(carol(), 'partidas', '1234', 'jogadores')));
  await assertFails(getDoc(doc(carol(), 'partidas', '1234', 'jogadores', 'bob')));
});
