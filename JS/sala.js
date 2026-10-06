// sala.js — HU-14: Sala do Professor.
//
// COMO FUNCIONA
// O professor cria uma sala e recebe um código curto (ABC-123), no mesmo
// molde do "código do craque" da loja. Ele dita o código; cada criança
// digita e entra. A partir daí o nível das contas é o que o professor
// escolheu, e os resultados de cada criança aparecem no painel dele.
//
// Sem login, sem e-mail, sem nome real — o apelido montado no jogo é o que
// identifica a criança no painel. A sala é a única coisa compartilhada.
//
// O código da sala fica em localStorage só pra não precisar digitar de novo
// a cada partida no mesmo computador. A verdade está sempre no Firestore.

var Sala = (function() {

  var CHAVE = 'mathgol_sala';

  var atual = null;       // { codigo, nome, nivel, tipos }
  var cancelarObserva = null;

  // ---------- Estado ----------

  function estaNaSala() { return !!atual; }
  function codigo() { return atual ? atual.codigo : null; }
  function nome() { return atual ? atual.nome : null; }
  function nivelDaSala() { return atual ? atual.nivel : null; }

  // Filtros que o banco de questões entende. Sala sem tipos marcados = o
  // nível manda sozinho.
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

  // ---------- Criança entra ----------

  async function entrar(codigoDigitado, token, aluno) {
    if (!window.FirebaseMathGol) return { ok: false, motivo: 'offline' };

    var sala = await window.FirebaseMathGol.buscarSala(codigoDigitado);
    if (!sala) return { ok: false, motivo: 'nao-encontrada' };

    atual = {
      codigo: sala.codigo,
      nome: sala.nome || 'Turma',
      nivel: sala.nivel || 1,
      tipos: Array.isArray(sala.tipos) ? sala.tipos : []
    };
    lembrar(atual.codigo);

    if (token) await window.FirebaseMathGol.entrarNaSala(atual.codigo, token, aluno || {});
    return { ok: true, sala: atual };
  }

  function sair() {
    atual = null;
    lembrar(null);
    pararDeObservar();
  }

  // Reabre a sala guardada no navegador, se ainda existir no servidor.
  async function restaurar(token) {
    var guardado = codigoLembrado();
    if (!guardado || !window.FirebaseMathGol) return false;
    var r = await entrar(guardado, token, {});
    if (!r.ok) lembrar(null); // sala apagada ou código inválido: esquece
    return r.ok;
  }

  // Manda o resultado da fase pro painel do professor.
  async function reportarResultado(token, dados) {
    if (!atual || !token || !window.FirebaseMathGol) return false;
    return await window.FirebaseMathGol.entrarNaSala(atual.codigo, token, dados);
  }

  // ---------- Professor ----------

  async function criar(tokenProfessor, dados) {
    if (!window.FirebaseMathGol) return null;
    var codigoNovo = await window.FirebaseMathGol.criarSala(tokenProfessor, dados);
    if (!codigoNovo) return null;
    return { codigo: codigoNovo, nome: dados.nome, nivel: dados.nivel, tipos: dados.tipos || [] };
  }

  async function mudarNivel(codigoSala, nivel, tipos) {
    if (!window.FirebaseMathGol) return false;
    var ok = await window.FirebaseMathGol.atualizarSala(codigoSala, { nivel: nivel, tipos: tipos || [] });
    if (ok && atual && atual.codigo === codigoSala) {
      atual.nivel = nivel;
      atual.tipos = tipos || [];
    }
    return ok;
  }

  // Lista ao vivo. SEMPRE cancelar ao sair da tela — por isso o módulo
  // guarda o cancelamento em vez de devolver pra quem chamou esquecer.
  function observar(codigoSala, aoMudar) {
    pararDeObservar();
    if (!window.FirebaseMathGol) return;
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
