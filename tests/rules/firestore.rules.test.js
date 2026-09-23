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
  // Politica: nenhum cliente apaga, nem os proprios dados.
  await assertFails(deleteDoc(doc(db, 'jogadores', 'alice', 'resultados', 'abc')));
  await assertFails(deleteDoc(doc(db, 'jogadores', 'alice')));
  await assertFails(deleteDoc(doc(db, 'apelidos', 'alice')));
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
