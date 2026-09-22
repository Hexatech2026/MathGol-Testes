// firebase-config.js — inicializa o Firebase no navegador e expõe funções
// para criar sessão anônima e salvar/ler progresso diretamente no Firestore.
// Sem dado pessoal: o "jogador" é identificado por um token opaco (UUID)
// gerado no próprio browser e salvo em localStorage.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCuXs5SDtMxjnIFxk_2NFE0pJhoF3D5agE",
  authDomain: "math-gol.firebaseapp.com",
  projectId: "math-gol",
  storageBucket: "math-gol.firebasestorage.app",
  messagingSenderId: "679250124585",
  appId: "1:679250124585:web:d394982f5ea1931def2138"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ---------- Geração de token ----------

function gerarToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback pra navegadores que não têm randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ---------- Sessão ----------

async function obterOuCriarToken() {
  let token = null;
  try { token = localStorage.getItem('mathgol_token'); } catch (e) {}
  if (token) return token;

  token = gerarToken();

  try {
    await setDoc(doc(db, 'jogadores', token), {
      criadoEm: serverTimestamp(),
      ultimoAcessoEm: serverTimestamp()
    });
  } catch (erro) {
    console.warn('Firebase indisponível ao criar sessão; jogo segue offline:', erro);
  }

  try { localStorage.setItem('mathgol_token', token); } catch (e) {}
  return token;
}

// ---------- Configurações (listas que antes eram só fixas no data.js) ----------

// Cada lista mora na sua própria coleção no Firestore, pra não misturar
// tudo numa coleção só (ver seed-firestore.js, que faz a carga
// inicial dessas coleções a partir das mesmas listas que já existiam em
// data.js). Se uma coleção estiver vazia ou o Firestore estiver
// indisponível, essa lista simplesmente não é sobrescrita e o jogo segue
// com o padrão fixo definido em data.js.
async function buscarListaSimples(nomeColecao, campo) {
  const snap = await getDocs(collection(db, nomeColecao));
  return snap.docs.map(d => d.data()[campo]).filter(Boolean);
}

async function buscarListaComId(nomeColecao) {
  const snap = await getDocs(collection(db, nomeColecao));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function carregarConfiguracoes() {
  const resultado = { personagens: [], animais: [], selecoes: [], dificuldades: [] };

  await Promise.all([
    buscarListaSimples('personagens', 'texto').then(lista => { resultado.personagens = lista; }).catch(erro => {
      console.warn('Não foi possível carregar "personagens" do Firebase, usando padrão:', erro);
    }),
    buscarListaSimples('animais', 'texto').then(lista => { resultado.animais = lista; }).catch(erro => {
      console.warn('Não foi possível carregar "animais" do Firebase, usando padrão:', erro);
    }),
    buscarListaComId('selecoes').then(lista => { resultado.selecoes = lista; }).catch(erro => {
      console.warn('Não foi possível carregar "selecoes" do Firebase, usando padrão:', erro);
    }),
    buscarListaComId('dificuldades').then(lista => { resultado.dificuldades = lista; }).catch(erro => {
      console.warn('Não foi possível carregar "dificuldades" do Firebase, usando padrão:', erro);
    })
  ]);

  return resultado;
}

// ---------- Perfil (apelido + avatar escolhidos na tela de personalizar) ----------

// Salva o apelido e o avatar escolhidos em DOIS lugares:
//   1. jogadores/{token}        → atalho, junto com o resto da conta do jogador
//   2. apelidos/{token}         → coleção própria, só com apelido + avatar
//      (pensada pra uma futura tela de "quem já jogou" ou moderação de apelidos,
//      sem precisar ler o documento inteiro do jogador)
async function salvarPerfil(token, dados) {
  if (!token) return;

  const perfil = {
    apelido: dados.apelido,
    avatarSeed: dados.avatarSeed,
    atualizadoEm: serverTimestamp()
  };

  try {
    await setDoc(doc(db, 'jogadores', token), {
      ...perfil,
      ultimoAcessoEm: serverTimestamp()
    }, { merge: true });

    await setDoc(doc(db, 'apelidos', token), perfil, { merge: true });
  } catch (erro) {
    console.warn('Perfil salvo só localmente (Firebase indisponível):', erro);
  }
}

// ---------- Progresso ----------

async function salvarProgresso(token, dados) {
  if (!token) return;

  try {
    const resultado = {
      apelido: dados.apelido,
      selecaoId: dados.selecaoId,
      dificuldadeId: dados.dificuldadeId,
      gols: dados.gols,
      criadoEm: serverTimestamp()
    };

    // Salva no histórico (subcoleção) e atualiza o atalho no documento do jogador
    const jogadorRef = doc(db, 'jogadores', token);
    await addDoc(collection(jogadorRef, 'resultados'), resultado);
    await setDoc(jogadorRef, {
      ultimoAcessoEm: serverTimestamp(),
      ultimoResultado: {
        apelido: dados.apelido,
        selecaoId: dados.selecaoId,
        dificuldadeId: dados.dificuldadeId,
        gols: dados.gols,
        criadoEm: new Date().toISOString()
      }
    }, { merge: true });
  } catch (erro) {
    console.warn('Progresso salvo só localmente (Firebase indisponível):', erro);
  }
}

async function buscarProgresso(token) {
  if (!token) return null;

  try {
    const snap = await getDoc(doc(db, 'jogadores', token));
    if (!snap.exists()) return null;
    return snap.data().ultimoResultado || null;
  } catch (erro) {
    console.warn('Não foi possível buscar progresso do Firebase:', erro);
    return null;
  }
}

// ---------- Backup / Export ----------

async function exportarDadosFirebase(token) {
  var backup = {
    versao: 1,
    tipo: 'mathgol-backup-firebase',
    exportadoEm: new Date().toISOString(),
    token: token,
    jogador: null,
    resultados: [],
    apelido: null
  };

  try {
    // Dados do jogador
    var jogadorSnap = await getDoc(doc(db, 'jogadores', token));
    if (jogadorSnap.exists()) {
      backup.jogador = jogadorSnap.data();
    }

    // Histórico de resultados (subcoleção)
    var resultadosSnap = await getDocs(collection(doc(db, 'jogadores', token), 'resultados'));
    resultadosSnap.forEach(function(d) {
      backup.resultados.push({ id: d.id, ...d.data() });
    });

    // Apelido
    var apelidoSnap = await getDoc(doc(db, 'apelidos', token));
    if (apelidoSnap.exists()) {
      backup.apelido = apelidoSnap.data();
    }
  } catch (erro) {
    console.warn('Erro ao exportar dados do Firebase:', erro);
    throw erro;
  }

  return backup;
}

async function restaurarDadosFirebase(token, backup) {
  if (!backup || backup.tipo !== 'mathgol-backup-firebase') {
    throw new Error('Arquivo de backup inválido');
  }

  try {
    // Restaura dados do jogador
    if (backup.jogador) {
      await setDoc(doc(db, 'jogadores', token), {
        ...backup.jogador,
        restauradoEm: serverTimestamp(),
        ultimoAcessoEm: serverTimestamp()
      }, { merge: true });
    }

    // Restaura apelido
    if (backup.apelido) {
      await setDoc(doc(db, 'apelidos', token), {
        ...backup.apelido,
        restauradoEm: serverTimestamp()
      }, { merge: true });
    }

    // Restaura resultados
    for (var i = 0; i < backup.resultados.length; i++) {
      var r = backup.resultados[i];
      var rid = r.id;
      delete r.id;
      await setDoc(doc(collection(doc(db, 'jogadores', token), 'resultados'), rid), r);
    }
  } catch (erro) {
    console.warn('Erro ao restaurar backup:', erro);
    throw erro;
  }
}

// Exporta pro escopo global pra ser usado pelo main.js (que não é módulo ES)
window.FirebaseMathGol = {
  obterOuCriarToken,
  carregarConfiguracoes,
  salvarPerfil,
  salvarProgresso,
  buscarProgresso,
  exportarDadosFirebase,
  restaurarDadosFirebase
};
