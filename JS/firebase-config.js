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
//
// v2.0 — CÓDIGO DO CRAQUE (ver JS/codigo-craque.js)
// A criança pode transformar a conta anônima numa conta com código, para
// continuar de outro aparelho. Usa o provedor "E-mail/senha" do Firebase
// com um e-mail SINTÉTICO (não é e-mail de ninguém) e o código como senha.
// PRÉ-REQUISITO: habilitar também o provedor "E-mail/senha" no Console.
// Sem ele, "Criar meu código" mostra um aviso e o resto do jogo segue igual.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  EmailAuthProvider,
  linkWithCredential,
  unlink,
  signInWithEmailAndPassword,
  reauthenticateWithCredential,
  signOut,
  deleteUser
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
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
let resolverUsuario;
let usuarioPronto = new Promise(resolve => { resolverUsuario = resolve; });
let loginAnonimoFalhou = false;
const ouvintesConta = [];

function avisarConta() {
  const status = statusConta();
  ouvintesConta.forEach(fn => { try { fn(status); } catch (e) { console.warn('Erro num ouvinte da conta:', e); } });
}

onAuthStateChanged(auth, user => {
  if (user) {
    usuarioAtual = user;
    resolverUsuario(user);
    avisarConta();
    return;
  }
  usuarioAtual = null;
  avisarConta();
  // Sem sessão salva: cria um usuário anônimo.
  signInAnonymously(auth).catch(erro => {
    loginAnonimoFalhou = true;
    avisarConta();
    console.warn('Login anônimo indisponível (o provedor "Anônimo" está habilitado?). Jogo segue offline:', erro);
  });
}, erro => {
  console.warn('Falha ao observar a autenticação:', erro);
});

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

// ---------- v2.0: Código do craque ----------

function temCodigo(user) {
  return !!(user && user.providerData && user.providerData.some(p => p.providerId === 'password'));
}

function statusConta() {
  return {
    pronta: !!usuarioAtual,
    nuvemFora: !usuarioAtual && loginAnonimoFalhou,
    temCodigo: temCodigo(usuarioAtual)
  };
}

function aoMudarConta(fn) {
  if (typeof fn !== 'function') return;
  ouvintesConta.push(fn);
  fn(statusConta());
}

// Erros do Auth em frases que uma criança (ou o professor) entende.
function erroAmigavel(erro) {
  if (erro && erro.code === 'codigo-invalido') return erro; // já é uma frase pronta
  const c = erro && erro.code;
  const mapa = {
    'auth/operation-not-allowed': 'O código do craque ainda não foi ligado neste servidor. Peça para a professora ou o professor avisar a equipe.',
    'auth/invalid-credential': 'Código não encontrado. Confira cada letra e tente de novo.',
    'auth/wrong-password': 'Código não encontrado. Confira cada letra e tente de novo.',
    'auth/user-not-found': 'Código não encontrado. Confira cada letra e tente de novo.',
    'auth/invalid-email': 'Código não encontrado. Confira cada letra e tente de novo.',
    'auth/too-many-requests': 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem internet agora. Tente de novo quando a conexão voltar.',
    'auth/user-disabled': 'Este código foi desativado.',
    'auth/requires-recent-login': 'Por segurança, digite seu código atual antes de continuar.'
  };
  const e = new Error(mapa[c] || 'Não deu certo agora. Tente de novo em instantes.');
  e.code = c || 'desconhecido';
  return e;
}

function credencialDoCodigo(codigo) {
  const C = window.CodigoCraque;
  const email = C && C.email(codigo, firebaseConfig.authDomain);
  if (!email) {
    const e = new Error('O código tem 16 letras e números. Confira se digitou todos.');
    e.code = 'codigo-invalido';
    throw e;
  }
  return EmailAuthProvider.credential(email, C.senha(codigo));
}

// Cria (ou troca) o código da conta ATUAL. O uid continua o mesmo, então
// nada do que a criança já fez se perde. Trocar = desliga o código antigo
// (ele para de funcionar na hora) e liga um novo. Devolve o código.
async function criarCodigo() {
  const user = await aguardarUsuario();
  if (!user) throw erroAmigavel({ code: 'auth/network-request-failed' });
  try {
    if (temCodigo(user)) await unlink(user, 'password');
    // O começo do código vira o "e-mail" sintético; se outro código já
    // começar igual (raríssimo), sorteia de novo.
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      const codigo = window.CodigoCraque.gerar();
      try {
        await linkWithCredential(user, credencialDoCodigo(codigo));
        avisarConta();
        return codigo;
      } catch (erro) {
        if (erro && (erro.code === 'auth/email-already-in-use' || erro.code === 'auth/credential-already-in-use')) continue;
        throw erro;
      }
    }
    throw new Error('Não foi possível gerar um código livre.');
  } catch (erro) {
    throw erro && erro.code ? erroAmigavel(erro) : erro;
  }
}

// Entra numa conta que já tem código (outro aparelho). A sessão anônima
// deste navegador é trocada pela do código. Devolve o estado salvo na nuvem.
async function entrarComCodigo(codigo) {
  credencialDoCodigo(codigo); // valida o formato antes de ir à rede
  const C = window.CodigoCraque;
  try {
    const resultado = await signInWithEmailAndPassword(auth, C.email(codigo, firebaseConfig.authDomain), C.senha(codigo));
    usuarioAtual = resultado.user;
    avisarConta();
    return await buscarEstado();
  } catch (erro) {
    throw erroAmigavel(erro);
  }
}

// "Trocar de jogador" neste aparelho (computador da escola): encerra a
// sessão. O onAuthStateChanged cria uma conta anônima nova em seguida.
async function sairDaConta() {
  usuarioPronto = new Promise(resolve => { resolverUsuario = resolve; });
  await signOut(auth);
}

// ---------- v2.0: Estado do craque (tudo o que a criança conquistou) ----------
// Gravado em jogadores/{uid}.estado — validado aqui e nas regras.

async function salvarEstado(estado) {
  const limpo = validador().validarEstadoNuvem(estado);
  if (!limpo) { console.warn('Estado inválido; não foi salvo na nuvem.'); return false; }
  const user = await aguardarUsuario();
  if (!user) return false;
  try {
    await setDoc(doc(db, 'jogadores', user.uid), {
      estado: limpo,
      ultimoAcessoEm: serverTimestamp()
    }, { merge: true });
    return true;
  } catch (erro) {
    console.warn('Estado salvo só localmente (Firebase indisponível):', erro);
    return false;
  }
}

// { perfil: {apelido, avatarSeed} | null, estado: {...} | null }
async function buscarEstado() {
  const user = await aguardarUsuario();
  if (!user) return null;
  const snap = await getDoc(doc(db, 'jogadores', user.uid));
  if (!snap.exists()) return { perfil: null, estado: null };
  const dados = snap.data();
  return {
    perfil: validador().validarPerfil({ apelido: dados.apelido, avatarSeed: dados.avatarSeed }),
    estado: dados.estado ? validador().validarEstadoNuvem(dados.estado) : null
  };
}

// LGPD (art. 18, eliminação): a própria criança/responsável apaga TUDO o
// que está na nuvem — histórico, perfil, estado, a vaga na sala e a conta.
// codigoAtual só é pedido se o Firebase exigir login recente.
async function apagarMeusDados(opcoes) {
  const user = await aguardarUsuario();
  if (!user) throw erroAmigavel({ code: 'auth/network-request-failed' });
  try {
    const jogadorRef = doc(db, 'jogadores', user.uid);
    const resultados = await getDocs(collection(jogadorRef, 'resultados'));
    for (let i = 0; i < resultados.docs.length; i += 400) {
      const batch = writeBatch(db);
      resultados.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    await deleteDoc(doc(db, 'apelidos', user.uid));
    await deleteDoc(jogadorRef);
    const sala = opcoes && opcoes.codigoSala ? normalizarCodigoSala(opcoes.codigoSala) : '';
    if (sala.length === 7) {
      await deleteDoc(doc(collection(doc(db, 'salas', sala), 'alunos'), user.uid)).catch(() => {});
    }
    if (temCodigo(user) && opcoes && opcoes.codigoAtual) {
      await reauthenticateWithCredential(user, credencialDoCodigo(opcoes.codigoAtual));
    }
    await deleteUser(user);
  } catch (erro) {
    throw erro && erro.code ? erroAmigavel(erro) : erro;
  }
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

async function atualizarSala(codigo, mudancas) {
  const cod = normalizarCodigoSala(codigo);
  if (cod.length !== 7) return false;
  try {
    await setDoc(doc(db, 'salas', cod), limparDadosSala(
      Object.assign({ nome: 'Turma' }, mudancas)
    ), { merge: true });
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

  try {
    await setDoc(doc(collection(doc(db, 'salas', cod), 'alunos'), user.uid), {
      apelido: String((aluno && aluno.apelido) || 'Craque').slice(0, 40),
      avatarSeed: String((aluno && aluno.avatarSeed) || '').slice(0, 40),
      gols: isFinite(gols) && gols >= 0 ? gols : 0,
      pontuacao: isFinite(pontos) && pontos >= 0 ? pontos : 0,
      fase: String((aluno && aluno.fase) || '').slice(0, 20),
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
  statusConta,
  aoMudarConta,
  nuvemIndisponivel: () => !usuarioAtual && loginAnonimoFalhou,
  criarCodigo,
  entrarComCodigo,
  sairDaConta,
  salvarEstado,
  buscarEstado,
  apagarMeusDados,
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
