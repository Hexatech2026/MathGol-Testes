// limpar-expirados.js — HU-20: apaga o que passou do prazo de retenção.
//
// POR QUE ESTE SCRIPT EXISTE
// A política de retenção (Docs/POLITICA-DE-DADOS.md) seria cumprida pelo
// TTL do Firestore, mas o TTL exige o plano Blaze (com forma de pagamento)
// e o projeto está no Spark. Este script faz o mesmo trabalho pelo Admin
// SDK, que funciona no plano gratuito.
//
// E faz uma coisa a MAIS que o TTL: apaga as subcoleções. O TTL do
// Firestore apaga só o documento e deixa `salas/{codigo}/alunos` e
// `jogadores/{uid}/resultados` órfãos para sempre. Então, mesmo que um dia
// o projeto vá para o Blaze, este script continua sendo necessário.
//
// O QUE ELE APAGA
//   salas/{codigo}      + alunos/      quando expiraEm já passou
//   partidas/{codigo}   + jogadores/   quando expiraEm já passou
//   jogadores/{uid}     + resultados/  quando expiraEm já passou
//                       e o apelidos/{uid} correspondente
//
// Documento SEM o campo expiraEm nunca é tocado: a consulta por
// expiraEm <= agora não o encontra. É o lado seguro — perfis criados antes
// da HU-20 ficam guardados até a criança entrar de novo e ganhar a data.
//
// COMO RODAR
//   1. Preencha o .env com as credenciais do Admin SDK (ver .env.example).
//   2. npm run limpar          → só MOSTRA o que seria apagado
//   3. npm run limpar -- --apagar   → apaga de verdade
//
// O padrão é não apagar nada de propósito. Numa rotina de dados de
// criança, o custo de um engano é alto demais para o padrão ser destrutivo.

require('dotenv').config();
const admin = require('firebase-admin');

function getFirestore() {
  if (!admin.apps.length) {
    // Com o emulador no ar não existe credencial para apresentar, e nem
    // faz falta: ele aceita qualquer projeto. Serve para ensaiar a
    // limpeza sem encostar no banco de verdade —
    //   npx firebase emulators:exec --only firestore --project demo-mathgol "npm run limpar"
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'demo-mathgol' });
      return admin.firestore();
    }
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        'Variáveis de ambiente do Firebase ausentes (FIREBASE_PROJECT_ID, ' +
        'FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY). Confira o .env.'
      );
    }
    admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
  }
  return admin.firestore();
}

// O que limpar, e o que cada um arrasta junto.
const ALVOS = [
  { colecao: 'salas', subcolecoes: ['alunos'], rotulo: 'salas de aula' },
  { colecao: 'partidas', subcolecoes: ['jogadores'], rotulo: 'duelos online' },
  { colecao: 'jogadores', subcolecoes: ['resultados'], rotulo: 'perfis', espelho: 'apelidos' }
];

const LOTE = 400;   // o writeBatch do Firestore aceita 500 operações

// Em modo "apagar" não precisa de cursor: a página seguinte já não
// enxerga o que saiu. Em simulação nada sai, então o cursor é obrigatório
// para não reler a mesma página para sempre.
async function apagarSubcolecao(db, docRef, nome, apagarDeVerdade) {
  let total = 0;
  let ultimo = null;
  while (true) {
    let consulta = docRef.collection(nome).orderBy('__name__').limit(LOTE);
    if (!apagarDeVerdade && ultimo) consulta = consulta.startAfter(ultimo);
    const snap = await consulta.get();
    if (snap.empty) break;
    total += snap.size;
    ultimo = snap.docs[snap.docs.length - 1];
    if (apagarDeVerdade) {
      const lote = db.batch();
      snap.docs.forEach(d => lote.delete(d.ref));
      await lote.commit();
    }
    if (snap.size < LOTE) break;
  }
  return total;
}

async function limparColecao(db, alvo, agora, apagarDeVerdade) {
  const conta = { documentos: 0, filhos: 0, espelhos: 0 };
  let ultimo = null;

  const PAGINA = 50;
  while (true) {
    let consulta = db.collection(alvo.colecao)
      .where('expiraEm', '<=', agora)
      .orderBy('expiraEm')
      .limit(PAGINA);
    if (!apagarDeVerdade && ultimo) consulta = consulta.startAfter(ultimo);

    const snap = await consulta.get();
    if (snap.empty) break;
    ultimo = snap.docs[snap.docs.length - 1];

    for (const doc of snap.docs) {
      for (const sub of alvo.subcolecoes) {
        conta.filhos += await apagarSubcolecao(db, doc.ref, sub, apagarDeVerdade);
      }
      if (alvo.espelho) {
        const espelho = db.collection(alvo.espelho).doc(doc.id);
        if ((await espelho.get()).exists) {
          conta.espelhos++;
          if (apagarDeVerdade) await espelho.delete();
        }
      }
      if (apagarDeVerdade) await doc.ref.delete();
      conta.documentos++;
    }

    if (snap.size < PAGINA) break;   // era a última página
  }
  return conta;
}

async function principal() {
  const apagarDeVerdade = process.argv.includes('--apagar');
  const db = getFirestore();
  const agora = admin.firestore.Timestamp.now();

  console.log(apagarDeVerdade
    ? '⚠️  APAGANDO de verdade. Prazos em Docs/POLITICA-DE-DADOS.md.\n'
    : 'Simulação: nada será apagado. Use --apagar para valer.\n');

  let totalDocs = 0;
  for (const alvo of ALVOS) {
    const c = await limparColecao(db, alvo, agora, apagarDeVerdade);
    totalDocs += c.documentos;
    const extras = [
      c.filhos ? c.filhos + ' em subcoleções' : null,
      c.espelhos ? c.espelhos + ' em ' + alvo.espelho : null
    ].filter(Boolean).join(', ');
    console.log(
      (apagarDeVerdade ? 'Apagados' : 'Venceram') + ': ' +
      String(c.documentos).padStart(4) + ' ' + alvo.rotulo +
      (extras ? ' (' + extras + ')' : '')
    );
  }

  if (!totalDocs) console.log('\nNada vencido. Banco em dia.');
  else if (!apagarDeVerdade) console.log('\nPara apagar: npm run limpar -- --apagar');
  await admin.app().delete();
}

principal().catch(erro => {
  console.error('Falhou:', erro.message);
  process.exitCode = 1;
});
