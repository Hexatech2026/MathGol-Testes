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

const PERSONAGENS = [
  'Capitão', 'Fera', 'Relâmpago', 'Craque', 'Foguete',
  'Furacão', 'Campeão', 'Guerreiro', 'Fenômeno', 'Trovão',
  'Meteoro', 'Torpedo', 'Escudo', 'Cometa', 'Raio',
  'Capitã', 'Estrela', 'Campeã', 'Guerreira', 'Fênix',
  'Centelha', 'Valente', 'Coragem', 'Vitória', 'Aurora',
  'Heroína', 'Lenda', 'Chama', 'Brilho', 'Medalha'
];

const ANIMAIS = [
  'Tigre', 'Águia', 'Onça', 'Leão', 'Gavião',
  'Puma', 'Lobo', 'Falcão', 'Pantera', 'Tubarão',
  'Golfinho', 'Coruja', 'Raposa', 'Jaguar', 'Fênix',
  'Coelho', 'Lince', 'Arara', 'Borboleta', 'Flamingo'
];

const SELECOES = [
  { id: 'brasil',     nome: 'Brasil',     bandeira: 'br',     corPrimaria: '#2E9E5B', corSecundaria: '#FFC63B' },
  { id: 'argentina',  nome: 'Argentina',  bandeira: 'ar',     corPrimaria: '#6EC1E4', corSecundaria: '#FFFDF6' },
  { id: 'alemanha',   nome: 'Alemanha',   bandeira: 'de',     corPrimaria: '#21303B', corSecundaria: '#E0343B' },
  { id: 'franca',     nome: 'Franca',     bandeira: 'fr',     corPrimaria: '#3A5FCD', corSecundaria: '#E0343B' },
  { id: 'japao',      nome: 'Japao',      bandeira: 'jp',     corPrimaria: '#FFFDF6', corSecundaria: '#E0343B' },
  { id: 'portugal',   nome: 'Portugal',   bandeira: 'pt',     corPrimaria: '#2E9E5B', corSecundaria: '#E0343B' },
  { id: 'espanha',    nome: 'Espanha',    bandeira: 'es',     corPrimaria: '#E0343B', corSecundaria: '#FFC63B' },
  { id: 'italia',     nome: 'Italia',     bandeira: 'it',     corPrimaria: '#3A5FCD', corSecundaria: '#FFFDF6' },
  { id: 'inglaterra', nome: 'Inglaterra', bandeira: 'gb-eng', corPrimaria: '#FFFDF6', corSecundaria: '#E0343B' },
  { id: 'colombia',   nome: 'Colombia',   bandeira: 'co',     corPrimaria: '#FFC63B', corSecundaria: '#3A5FCD' },
  { id: 'mexico',     nome: 'Mexico',     bandeira: 'mx',     corPrimaria: '#2E9E5B', corSecundaria: '#FFFDF6' },
  { id: 'coreia',     nome: 'Coreia',     bandeira: 'kr',     corPrimaria: '#E0343B', corSecundaria: '#3A5FCD' }
];

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
