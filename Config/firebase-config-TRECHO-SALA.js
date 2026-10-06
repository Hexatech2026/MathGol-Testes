// =====================================================================
// TRECHO PARA COLAR NO SEU JS/firebase-config.js
//
// Nao substitua o arquivo — ele tem o Auth anonimo, o validador e o
// writeBatch de voces. Faca as 3 mudancas abaixo.
// =====================================================================


// ---------------------------------------------------------------------
// MUDANCA 1 — acrescentar "onSnapshot" ao import do firestore.
//
// Seu import hoje:
//
//   import {
//     getFirestore, doc, setDoc, getDoc, getDocs, collection,
//     serverTimestamp, writeBatch
//   } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
//
// Fica assim (so entrou onSnapshot):
//
//   import {
//     getFirestore, doc, setDoc, getDoc, getDocs, collection,
//     serverTimestamp, writeBatch, onSnapshot
//   } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
// ---------------------------------------------------------------------


// ---------------------------------------------------------------------
// MUDANCA 2 — colar este bloco inteiro antes do window.FirebaseMathGol = {...}
// ---------------------------------------------------------------------

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


// ---------------------------------------------------------------------
// MUDANCA 3 — acrescentar as 5 funcoes ao window.FirebaseMathGol.
//
// O seu export hoje tem:
//   aguardarUsuario, carregarConfiguracoes, salvarPerfil, salvarProgresso,
//   buscarProgresso, exportarDadosFirebase, restaurarDadosFirebase
//
// Acrescente estas cinco linhas na lista:
//
//   criarSala,
//   buscarSala,
//   atualizarSala,
//   entrarNaSala,
//   observarAlunos
// ---------------------------------------------------------------------
