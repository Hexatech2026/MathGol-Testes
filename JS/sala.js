// sala.js — HU-14: Sala do Professor.
//
// O professor cria uma sala e recebe um codigo curto (ABC-123). Ele dita o
// codigo; cada crianca digita e entra. A partir dai o nivel das contas e o
// que o professor escolheu, e os resultados aparecem no painel dele.
//
// Sem login proprio, sem e-mail, sem nome real: a identidade continua sendo
// o uid anonimo do Firebase Auth, igual ao resto do jogo. O apelido montado
// no jogo e o que identifica a crianca no painel.
//
// O codigo da sala fica em localStorage so pra nao precisar digitar de novo
// a cada partida no mesmo computador. A verdade esta sempre no Firestore.
//
// IMPORTANTE: o Firebase chega tarde (import dinamico em
// carregar-externos.js), entao nada aqui assume que window.FirebaseMathGol
// ja existe — cada funcao confere antes de usar.

var Sala = (function() {

  var CHAVE = 'mathgol_sala';

  var atual = null;            // { codigo, nome, nivel, tipos }
  var cancelarObserva = null;

  // ---------- Estado ----------

  function estaNaSala() { return !!atual; }
  function codigo() { return atual ? atual.codigo : null; }
  function nome() { return atual ? atual.nome : null; }
  function nivelDaSala() { return atual ? atual.nivel : null; }

  // Filtros que o banco de questoes entende. Sala sem tipos marcados = o
  // nivel manda sozinho.
  function filtrosDaSala() {
    if (!atual || !atual.tipos || !atual.tipos.length) return null;
    return { tipos: atual.tipos };
  }

  function lembrar(codigoSala) {
    try {
      if (codigoSala) localStorage.setItem(CHAVE, codigoSala);
      else localStorage.removeItem(CHAVE);
    } catch (e) {}
  }

  function codigoLembrado() {
    try { return localStorage.getItem(CHAVE); } catch (e) { return null; }
  }

  function temFirebase() {
    return !!(window.FirebaseMathGol && window.FirebaseMathGol.buscarSala);
  }

  // ---------- Lado da crianca ----------

  function entrar(codigoDigitado, aluno) {
    if (!temFirebase()) return Promise.resolve({ ok: false, motivo: 'offline' });

    return window.FirebaseMathGol.buscarSala(codigoDigitado).then(function(sala) {
      if (!sala) return { ok: false, motivo: 'nao-encontrada' };

      atual = {
        codigo: sala.codigo,
        nome: sala.nome || 'Turma',
        nivel: sala.nivel || 1,
        tipos: Array.isArray(sala.tipos) ? sala.tipos : []
      };
      lembrar(atual.codigo);

      return window.FirebaseMathGol.entrarNaSala(atual.codigo, aluno || {})
        .then(function() { return { ok: true, sala: atual }; });
    }).catch(function(erro) {
      console.warn('Nao foi possivel entrar na sala:', erro);
      return { ok: false, motivo: 'offline' };
    });
  }

  function sair() {
    atual = null;
    lembrar(null);
    pararDeObservar();
  }

  // Reabre a sala guardada neste navegador, se ainda existir no servidor.
  // Chamada quando o Firebase fica pronto, nao no DOMContentLoaded.
  function restaurar() {
    var guardado = codigoLembrado();
    if (!guardado || !temFirebase()) return Promise.resolve(false);
    return entrar(guardado, {}).then(function(r) {
      if (!r.ok) lembrar(null); // sala apagada ou codigo invalido: esquece
      return r.ok;
    });
  }

  // Manda o resultado da fase pro painel do professor.
  function reportarResultado(dados) {
    if (!atual || !temFirebase()) return Promise.resolve(false);
    return window.FirebaseMathGol.entrarNaSala(atual.codigo, dados);
  }

  // ---------- Lado do professor ----------

  function criar(dados) {
    if (!temFirebase()) return Promise.resolve(null);
    return window.FirebaseMathGol.criarSala(dados).then(function(codigoNovo) {
      if (!codigoNovo) return null;
      return {
        codigo: codigoNovo,
        nome: dados.nome,
        nivel: dados.nivel,
        tipos: dados.tipos || []
      };
    });
  }

  function mudarNivel(codigoSala, nivel, tipos) {
    if (!temFirebase()) return Promise.resolve(false);
    return window.FirebaseMathGol.atualizarSala(codigoSala, {
      nivel: nivel,
      tipos: tipos || []
    }).then(function(ok) {
      if (ok && atual && atual.codigo === codigoSala) {
        atual.nivel = nivel;
        atual.tipos = tipos || [];
      }
      return ok;
    });
  }

  // Lista ao vivo. O cancelamento fica guardado aqui dentro de proposito:
  // listener de Firestore esquecido aberto consome leitura sem parar.
  function observar(codigoSala, aoMudar) {
    pararDeObservar();
    if (!temFirebase()) return;
    cancelarObserva = window.FirebaseMathGol.observarAlunos(codigoSala, aoMudar);
  }

  function pararDeObservar() {
    if (typeof cancelarObserva === 'function') cancelarObserva();
    cancelarObserva = null;
  }

  return {
    estaNaSala: estaNaSala,
    codigo: codigo,
    nome: nome,
    nivelDaSala: nivelDaSala,
    filtrosDaSala: filtrosDaSala,
    entrar: entrar,
    sair: sair,
    restaurar: restaurar,
    reportarResultado: reportarResultado,
    criar: criar,
    mudarNivel: mudarNivel,
    observar: observar,
    pararDeObservar: pararDeObservar
  };
})();
