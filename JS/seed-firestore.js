// seed-firestore.js — carga inicial (seed) do Firestore.
//
// Sobe as listas que hoje moram fixas em data.js pro Firestore de
// verdade, cada lista na sua PRÓPRIA coleção (pra não misturar tudo numa
// coleção só):
//   - personagens  → um doc por palavra usada no apelido sorteado (ex.: "Capitão")
//   - animais      → um doc por palavra usada no apelido sorteado (ex.: "Tigre")
//   - selecoes     → um doc por time (id = brasil, argentina, ...)
//   - dificuldades → um doc por nível (id = facil, medio, dificil)
//
// O jogo (firebase-config.js → carregarConfiguracoes()) só LÊ essas
// coleções; quem escreve é este script, usando o Admin SDK — por isso as
// regras do Firestore podem manter escrita bloqueada pro cliente
// (ver firestore.rules) sem quebrar o seed.
//
// Como rodar:
//   1. Preencha o .env (ou exporte as variáveis) com as credenciais do
//      Firebase Admin — ver .env.example.
//   2. npm run seed
//
// É seguro rodar mais de uma vez: usa .set() (sobrescreve), não .add().

require('dotenv').config();
const admin = require('firebase-admin');

// ---------- Firebase Admin (mesma lógica que antes vivia em api/_lib/firebaseAdmin.js) ----------

function getFirestore() {
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    // No painel da Vercel (e em .env), quebras de linha da chave privada
    // costumam vir escapadas como "\n" literal — precisamos convertê-las
    // de volta para quebras de linha reais antes de passar pro SDK.
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        'Variáveis de ambiente do Firebase ausentes (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY). Confira o arquivo .env (veja .env.example).'
      );
    }

    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }

  return admin.firestore();
}

// ---------- Conteúdo inicial (mesmas listas que ficam fixas em data.js) ----------

// v1.5: o catálogo (nomes, seleções e os 20 clubes da Série A 2026) é
// lido direto de JS/data.js, pra não existirem duas listas diferentes.
// Obs.: o jogo agora usa do Firestore só AJUSTES de nome/cores dos times e
// as dificuldades (ver aplicarConfiguracoesRemotas em data.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const contexto = {};
vm.createContext(contexto);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8') +
  '\n;this.__dados = { PERSONAGENS: PERSONAGENS.concat(PERSONAGENS_LOJA), ANIMAIS: ANIMAIS.concat(ANIMAIS_LOJA), SELECOES: SELECOES };',
  contexto
);
const { PERSONAGENS, ANIMAIS, SELECOES } = contexto.__dados;

const DIFICULDADES = [
  { id: 'facil',    nome: 'Fácil',    descricao: '+ e − até 10',      icone: '⭐' },
  { id: 'medio',    nome: 'Médio',    descricao: '+ − até 20 e tabuada', icone: '⭐⭐' },
  { id: 'dificil',  nome: 'Difícil',  descricao: '× e ÷',              icone: '⭐⭐⭐' }
];

// Vira slug (a-z0-9-) pra virar id de documento, mesmo com acento/espaço.
function slugificar(texto) {
  return texto
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // tira acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function semearListaSimples(db, nomeColecao, itens) {
  console.log(`\n== ${nomeColecao} (${itens.length} itens) ==`);
  for (const texto of itens) {
    const id = slugificar(texto);
    await db.collection(nomeColecao).doc(id).set({ texto });
    console.log(`  ok: ${id} → "${texto}"`);
  }
}

async function semearListaComId(db, nomeColecao, itens) {
  console.log(`\n== ${nomeColecao} (${itens.length} itens) ==`);
  for (const { id, ...campos } of itens) {
    await db.collection(nomeColecao).doc(id).set(campos);
    console.log(`  ok: ${id} →`, campos);
  }
}

async function main() {
  const db = getFirestore();

  await semearListaSimples(db, 'personagens', PERSONAGENS);
  await semearListaSimples(db, 'animais', ANIMAIS);
  await semearListaComId(db, 'selecoes', SELECOES);
  await semearListaComId(db, 'dificuldades', DIFICULDADES);

  console.log('\n✅ Seed concluído.');
}

main().catch(erro => {
  console.error('\n❌ Seed falhou:', erro);
  process.exit(1);
});
