// firebase-config.js — inicializa o Firebase no navegador e expõe funções
// para salvar/ler progresso no Firestore.
//
// IDENTIDADE E SEGURANÇA
// O jogador é identificado pelo Firebase Authentication ANÔNIMO
// (signInAnonymously): sem nome real, sem e-mail, sem senha. Cada navegador
// recebe um uid emitido e assinado pelo Firebase, e as regras do Firestore
// (Config/firestore.rules) só deixam cada uid ler/gravar os PRÓPRIOS
// documentos: jogadores/{uid}, jogadores/{uid}/resultados/*, apelidos/{uid}.
//
// Versões anteriores usavam um UUID gerado no navegador ("mathgol_token")
// como chave dos documentos e regras "if true". Isso NÃO era proteção:
// qualquer pessoa podia listar, ler, alterar ou apagar dados de qualquer
// jogador. Esse token não é mais usado para nada.
//
// PRÉ-REQUISITO: habilitar o provedor "Anônimo" em Firebase Console →
// Authentication → Método de login. Sem isso, o login falha e o jogo segue
// normalmente, só que sem salvar na nuvem.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  serverTimestamp,
  writeBatch,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

// A config web do Firebase é pública por natureza (vai para o navegador);
// quem protege os dados são o Auth + as regras do Firestore.
const firebaseConfig = {
  apiKey: "AIzaSyCuXs5SDtMxjnIFxk_2NFE0pJhoF3D5agE",
  authDomain: "math-gol.firebaseapp.com",
  projectId: "math-gol",
  storageBucket: "math-gol.firebasestorage.app",
  messagingSenderId: "679250124585",
  appId: "1:679250124585:web:d394982f5ea1931def2138"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Tempo máximo que uma gravação espera a autenticação ficar pronta. O jogo
// nunca espera: as gravações rodam em segundo plano.
const ESPERA_MAXIMA_AUTH_MS = 15000;

// ---------- Autenticação anônima ----------

let usuarioAtual = null;
let authIndisponivel = false;
let resolverUsuario;
const usuarioPronto = new Promise(resolve => { resolverUsuario = resolve; });

onAuthStateChanged(auth, user => {
  if (user) {
    usuarioAtual = user;
    resolverUsuario(user);
    return;
  }
  // Sem sessão salva: cria um usuário anônimo.
  signInAnonymously(auth).catch(erro => {
    authIndisponivel = true;
    resolverUsuario(null); // libera quem está esperando, em vez de deixar travado até o timeout

    // auth/configuration-not-found não é bug de código: é o provedor
    // "Anônimo" desligado no Console do Firebase. Vale uma mensagem que
    // diz o que fazer, em vez de despejar o stack trace do SDK.
    if (erro && erro.code === 'auth/configuration-not-found') {
      console.warn(
        '[MathGol] Login anônimo DESLIGADO no Firebase.\n' +
        '  Console do Firebase → Authentication → Sign-in method → Anonymous → Ativar.\n' +
        '  Até lá o jogo funciona normalmente, mas NADA é salvo na nuvem:\n' +
        '  sem progresso, sem carteira e sem Sala do Professor.'
      );
      return;
    }
    console.warn('[MathGol] Login anônimo indisponível; jogo segue offline:', erro);
  });
}, erro => {
  authIndisponivel = true;
  resolverUsuario(null);
  console.warn('[MathGol] Falha ao observar a autenticação:', erro);
});

// Quem precisa explicar ao usuário por que a nuvem não respondeu (ex.: a tela
// da Sala) consulta isto em vez de adivinhar.
function nuvemIndisponivel() { return authIndisponivel; }

// Enfileira quem chama até o uid existir (sem bloquear o jogo). Se o login
// não ficar pronto no tempo limite, devolve null e a gravação é pulada.
function aguardarUsuario(limiteMs = ESPERA_MAXIMA_AUTH_MS) {
  if (usuarioAtual) return Promise.resolve(usuarioAtual);
  return Promise.race([
    usuarioPronto,
    new Promise(resolve => setTimeout(() => resolve(null), limiteMs))
  ]);
}

function validador() {
  if (!window.ValidacaoBackup) throw new Error('backup-validacao.js não carregou');
  return window.ValidacaoBackup;
}

// ---------- Configurações (listas que também existem fixas no data.js) ----------
// Leitura pública (regras). Os dados são validados no data.js antes de
// entrar no jogo; se algo falhar, o jogo usa as listas fixas.

async function buscarListaSimples(nomeColecao, campo) {
  const snap = await getDocs(collection(db, nomeColecao));
  return snap.docs.map(d => d.data()[campo]).filter(v => typeof v === 'string');
}

async function buscarListaComId(nomeColecao) {
  const snap = await getDocs(collection(db, nomeColecao));
  return snap.docs.map(d => Object.assign({}, d.data(), { id: d.id }));
}

async function carregarConfiguracoes() {
  const resultado = { personagens: [], animais: [], selecoes: [], dificuldades: [] };
  const aviso = nome => erro => console.warn(`Não foi possível carregar "${nome}" do Firebase, usando padrão:`, erro);

  await Promise.all([
    buscarListaSimples('personagens', 'texto').then(l => { resultado.personagens = l; }).catch(aviso('personagens')),
    buscarListaSimples('animais', 'texto').then(l => { resultado.animais = l; }).catch(aviso('animais')),
    buscarListaComId('selecoes').then(l => { resultado.selecoes = l; }).catch(aviso('selecoes')),
    buscarListaComId('dificuldades').then(l => { resultado.dificuldades = l; }).catch(aviso('dificuldades'))
  ]);

  return resultado;
}

// ---------- Perfil (apelido + avatar) ----------
// Gravado em jogadores/{uid} e em apelidos/{uid} (coleção só com apelido +
// avatar, pensada para moderação futura). Ambos só acessíveis pelo dono.

async function salvarPerfil(dados) {
  const perfil = validador().validarPerfil({ apelido: dados && dados.apelido, avatarSeed: dados && dados.avatarSeed });
  if (!perfil) { console.warn('Perfil inválido; não foi salvo na nuvem.'); return false; }

  const user = await aguardarUsuario();
  if (!user) { console.warn('Perfil salvo só localmente (sem login na nuvem).'); return false; }

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'jogadores', user.uid), Object.assign({}, perfil, {
      atualizadoEm: serverTimestamp(),
      ultimoAcessoEm: serverTimestamp()
    }), { merge: true });
    batch.set(doc(db, 'apelidos', user.uid), Object.assign({}, perfil, {
      atualizadoEm: serverTimestamp()
    }));
    await batch.commit();
    return true;
  } catch (erro) {
    console.warn('Perfil salvo só localmente (Firebase indisponível):', erro);
    return false;
  }
}

// ---------- Progresso ----------
// resumo = main.js → montarResumoPartida(): versaoEsquema, faseId,
// dificuldadeId, selecaoId, gols, totalCobrancas, pontuacao,
// tempoTotalSegundos, resumoCobrancas (G/D/T/F) e data (ISO).

async function salvarProgresso(resumo) {
  const V = validador();
  const erroValidacao = V.validarResultadoPartida(resumo);
  if (erroValidacao) { console.warn('Resultado não enviado (' + erroValidacao + ').'); return false; }

  const user = await aguardarUsuario();
  if (!user) { console.warn('Progresso salvo só localmente (sem login na nuvem).'); return false; }

  try {
    const dados = V.copiarResultado(resumo);
    const jogadorRef = doc(db, 'jogadores', user.uid);
    const batch = writeBatch(db);
    batch.set(doc(collection(jogadorRef, 'resultados')), Object.assign({}, dados, { criadoEm: serverTimestamp() }));
    batch.set(jogadorRef, { ultimoAcessoEm: serverTimestamp(), ultimoResultado: dados }, { merge: true });
    await batch.commit();
    return true;
  } catch (erro) {
    console.warn('Progresso salvo só localmente (Firebase indisponível):', erro);
    return false;
  }
}

async function buscarProgresso() {
  const user = await aguardarUsuario();
  if (!user) return null;
  try {
    const snap = await getDoc(doc(db, 'jogadores', user.uid));
    if (!snap.exists()) return null;
    return snap.data().ultimoResultado || null;
  } catch (erro) {
    console.warn('Não foi possível buscar progresso do Firebase:', erro);
    return null;
  }
}

// ---------- HU-14: Sala do Professor ----------
//
// Um codigo curto e opaco identifica a sala. O professor dita o codigo em
// voz alta; as criancas digitam e entram. A identidade de quem entra
// continua sendo o uid anonimo do Auth — nenhum dado pessoal novo.
//
//   salas/{codigo}                 -> { nome, nivel, tipos, dono, criadoEm }
//   salas/{codigo}/alunos/{uid}    -> { apelido, avatarSeed, gols, pontuacao }

// Alfabeto sem 0/O/1/I/L: o codigo e copiado do quadro pra tela, e esses
// caracteres geram erro de leitura.
const ALFABETO_SALA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function sortearCodigoSala() {
  let c = '';
  for (let i = 0; i < 6; i++) {
    c += ALFABETO_SALA.charAt(Math.floor(Math.random() * ALFABETO_SALA.length));
  }
  return c.slice(0, 3) + '-' + c.slice(3);
}

function normalizarCodigoSala(codigo) {
  const limpo = String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return limpo.length === 6 ? limpo.slice(0, 3) + '-' + limpo.slice(3) : limpo;
}

// Aceita so o que a sala precisa, no formato certo. Vale o mesmo cuidado do
// resto do arquivo: nada do cliente entra no Firestore sem conferencia.
function limparDadosSala(dados) {
  const TIPOS_OK = ['soma', 'subtracao', 'multiplicacao', 'divisao'];
  const nivel = parseInt(dados && dados.nivel, 10);
  const tipos = Array.isArray(dados && dados.tipos)
    ? dados.tipos.filter(t => TIPOS_OK.indexOf(t) !== -1)
    : [];
  return {
    nome: String((dados && dados.nome) || 'Turma').slice(0, 40),
    nivel: (isFinite(nivel) && nivel >= 1 && nivel <= 12) ? nivel : 1,
    tipos: tipos
  };
}

async function criarSala(dados) {
  const user = await aguardarUsuario();
  if (!user) { console.warn('Sala nao criada (sem login na nuvem).'); return null; }

  const limpo = limparDadosSala(dados);
  try {
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const codigo = sortearCodigoSala();
      const jaExiste = await getDoc(doc(db, 'salas', codigo));
      if (jaExiste.exists()) continue;

      await setDoc(doc(db, 'salas', codigo), Object.assign({}, limpo, {
        dono: user.uid,
        criadoEm: serverTimestamp()
      }));
      return codigo;
    }
    console.warn('Nao foi possivel gerar um codigo de sala livre.');
    return null;
  } catch (erro) {
    console.warn('Nao foi possivel criar a sala:', erro);
    return null;
  }
}

async function buscarSala(codigo) {
  const cod = normalizarCodigoSala(codigo);
  if (cod.length !== 7) return null;
  try {
    const snap = await getDoc(doc(db, 'salas', cod));
    if (!snap.exists()) return null;
    return Object.assign({ codigo: cod }, snap.data());
  } catch (erro) {
    console.warn('Nao foi possivel ler a sala:', erro);
    return null;
  }
}

// Só manda os campos que mudaram. Mandar o objeto inteiro aqui apagaria o
// nome da turma a cada troca de nível, porque quem chama não tem o nome em
// mãos — era um bug na primeira versão disto.
async function atualizarSala(codigo, mudancas) {
  const cod = normalizarCodigoSala(codigo);
  if (cod.length !== 7) return false;

  const TIPOS_OK = ['soma', 'subtracao', 'multiplicacao', 'divisao'];
  const dados = {};
  if (mudancas && mudancas.nivel !== undefined) {
    const n = parseInt(mudancas.nivel, 10);
    dados.nivel = (isFinite(n) && n >= 1 && n <= 12) ? n : 1;
  }
  if (mudancas && Array.isArray(mudancas.tipos)) {
    dados.tipos = mudancas.tipos.filter(t => TIPOS_OK.indexOf(t) !== -1);
  }
  if (!Object.keys(dados).length) return true; // nada a fazer

  try {
    await setDoc(doc(db, 'salas', cod), dados, { merge: true });
    return true;
  } catch (erro) {
    console.warn('Nao foi possivel atualizar a sala:', erro);
    return false;
  }
}

// A crianca se anuncia na sala. Chamado ao entrar e de novo no fim de cada
// fase, com o resultado — e o que alimenta o painel do professor.
async function entrarNaSala(codigo, aluno) {
  const cod = normalizarCodigoSala(codigo);
  if (cod.length !== 7) return false;

  const user = await aguardarUsuario();
  if (!user) return false;

  const gols = parseInt(aluno && aluno.gols, 10);
  const pontos = parseInt(aluno && aluno.pontuacao, 10);
  const nivel = parseInt(aluno && aluno.nivelId, 10);

  try {
    await setDoc(doc(collection(doc(db, 'salas', cod), 'alunos'), user.uid), {
      apelido: String((aluno && aluno.apelido) || 'Craque').slice(0, 40),
      avatarSeed: String((aluno && aluno.avatarSeed) || '').slice(0, 40),
      gols: isFinite(gols) && gols >= 0 ? gols : 0,
      pontuacao: isFinite(pontos) && pontos >= 0 ? pontos : 0,
      fase: String((aluno && aluno.fase) || '').slice(0, 20),
      nivelId: (isFinite(nivel) && nivel >= 1 && nivel <= 12) ? nivel : 1,
      atualizadoEm: serverTimestamp()
    }, { merge: true });
    return true;
  } catch (erro) {
    console.warn('Nao foi possivel entrar na sala:', erro);
    return false;
  }
}

// Acompanha a turma ao vivo. Devolve a funcao de cancelamento — quem chama
// PRECISA guardar e chamar ao sair da tela (sala.js ja faz isso), senao o
// listener fica aberto consumindo leitura do Firestore.
function observarAlunos(codigo, aoMudar) {
  const cod = normalizarCodigoSala(codigo);
  if (cod.length !== 7) return function() {};
  try {
    const ref = collection(doc(db, 'salas', cod), 'alunos');
    return onSnapshot(ref, function(snap) {
      const lista = [];
      snap.forEach(function(d) { lista.push(Object.assign({ uid: d.id }, d.data())); });
      aoMudar(lista);
    }, function(erro) {
      console.warn('Observacao da sala interrompida:', erro);
    });
  } catch (erro) {
    console.warn('Nao foi possivel observar a sala:', erro);
    return function() {};
  }
}

// ---------- Backup / Export ----------
// O arquivo NÃO contém uid nem token: não serve como credencial.

async function exportarDadosFirebase() {
  const V = validador();
  const user = await aguardarUsuario();
  if (!user) throw new Error('Sem login na nuvem.');

  const backup = {
    versao: V.VERSAO_BACKUP_FIREBASE,
    tipo: V.TIPO_FIREBASE,
    exportadoEm: new Date().toISOString(),
    perfil: null,
    resultados: []
  };

  const jogadorRef = doc(db, 'jogadores', user.uid);
  const jogadorSnap = await getDoc(jogadorRef);
  if (jogadorSnap.exists()) backup.perfil = V.validarPerfil(jogadorSnap.data());

  const resultadosSnap = await getDocs(collection(jogadorRef, 'resultados'));
  resultadosSnap.forEach(d => {
    const bruto = d.data();
    const dados = V.copiarResultado(bruto);
    if (!V.validarResultadoPartida(dados)) backup.resultados.push({ id: d.id, dados });
  });

  return backup;
}

// dadosValidados = ValidacaoBackup.analisarArquivo(...).dados → { perfil, resultados }.
// Grava SEMPRE no uid atual: um backup nunca dá acesso a dados de outra pessoa.
async function restaurarDadosFirebase(dadosValidados) {
  const user = await aguardarUsuario();
  if (!user) throw new Error('A nuvem não está disponível agora.');
  if (!dadosValidados || !Array.isArray(dadosValidados.resultados)) throw new Error('Arquivo de backup inválido.');

  const V = validador();
  const jogadorRef = doc(db, 'jogadores', user.uid);
  const operacoes = [];

  if (dadosValidados.perfil) {
    const perfil = V.validarPerfil(dadosValidados.perfil);
    if (perfil) {
      operacoes.push(b => b.set(jogadorRef, Object.assign({}, perfil, { atualizadoEm: serverTimestamp(), ultimoAcessoEm: serverTimestamp() }), { merge: true }));
      operacoes.push(b => b.set(doc(db, 'apelidos', user.uid), Object.assign({}, perfil, { atualizadoEm: serverTimestamp() })));
    }
  }

  dadosValidados.resultados.forEach(item => {
    if (V.validarResultadoPartida(item.dados)) return; // nunca grava o que não passa
    const dados = Object.assign(V.copiarResultado(item.dados), { criadoEm: serverTimestamp() });
    const ref = item.id ? doc(jogadorRef, 'resultados', item.id) : doc(collection(jogadorRef, 'resultados'));
    operacoes.push(b => b.set(ref, dados));
  });

  // Lotes de até 400 operações (limite do Firestore é 500).
  for (let i = 0; i < operacoes.length; i += 400) {
    const batch = writeBatch(db);
    operacoes.slice(i, i + 400).forEach(op => op(batch));
    await batch.commit();
  }
}

// Exporta pro escopo global pra ser usado pelo main.js (que não é módulo ES)
window.FirebaseMathGol = {
  aguardarUsuario,
  nuvemIndisponivel,
  carregarConfiguracoes,
  salvarPerfil,
  salvarProgresso,
  buscarProgresso,
  exportarDadosFirebase,
  restaurarDadosFirebase,
  criarSala,
  buscarSala,
  atualizarSala,
  entrarNaSala,
  observarAlunos
};
