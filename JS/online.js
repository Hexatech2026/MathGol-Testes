// online.js — HU-21: duelo online, cada crianca no seu aparelho.
//
// Um jogador cria a partida e recebe um codigo de 4 digitos; o outro entra
// digitando o codigo. Os dois respondem AS MESMAS perguntas, no mesmo
// nivel, e o placar dos dois aparece ao vivo.
//
// POR QUE AS PERGUNTAS VAO COMO NUMEROS, E NAO COMO TEXTO
// A partida guarda so [a, b, tipo] de cada conta. Cada aparelho monta o
// enunciado localmente com montarPergunta() — o mesmo de sempre. Assim
// nenhum texto escrito por outro cliente chega na tela da crianca, e o
// documento fica pequeno o bastante para a regra do Firestore conferir.
// As alternativas sao sorteadas em cada aparelho: a conta e a mesma, a
// ordem dos botoes nao precisa ser.
//
// QUEDA DE CONEXAO (CA-21.7)
// Cada lado carimba atualizadoEm a cada poucos segundos. O outro lado NAO
// compara relogios (o do servidor e o do navegador divergem): ele marca,
// no proprio relogio, quando viu o documento do adversario mudar pela
// ultima vez. Passou o limite sem mudanca, a partida encerra avisando.
//
// Sem chat e sem texto livre (CA-21.8): o que vai para a nuvem e apelido,
// avatar e numeros. A regra do Firestore so deixa cada um gravar o
// proprio documento.

var Online = (function() {

  var COBRANCAS = 5;
  var SINAL_MS = 5000;          // carimbo de "estou aqui"
  var LIMITE_SUMICO_MS = 20000; // sem mudanca por tanto tempo = caiu

  var atual = null;      // { codigo, nivel, perguntas, souDono }
  var euUid = null;
  var jogadores = [];    // [{ uid, apelido, avatarSeed, gols, pontuacao, cobranca, fim }]
  var vistoPorUltimo = {};
  var ouvintes = [];
  var cancelarObserva = null;
  var timerSinal = null;
  var timerVigia = null;
  var encerradaPorQueda = false;

  function temFirebase() {
    return !!(window.FirebaseMathGol && window.FirebaseMathGol.criarPartida);
  }

  function estaOnline() { return !!atual; }
  function codigo() { return atual ? atual.codigo : null; }
  function nivel() { return atual ? atual.nivel : null; }
  function totalCobrancas() { return COBRANCAS; }
  function caiuAConexao() { return encerradaPorQueda; }

  // ---------- Perguntas combinadas ----------

  // Sorteia as contas da partida uma unica vez, no aparelho de quem cria.
  function sortearPerguntas(nivelId, tipos) {
    var filtros = (tipos && tipos.length) ? { tipos: tipos } : null;
    var lista = [];
    for (var i = 0; i < COBRANCAS; i++) {
      var p = BancoQuestoes.sortearPergunta(nivelId, filtros);
      lista.push({ a: p.a, b: p.b, tipo: p.tipo });
    }
    return lista;
  }

  // Monta a pergunta do indice pedido com o gerador de sempre.
  function perguntaDa(indice) {
    if (!atual || !atual.perguntas[indice]) return null;
    var q = atual.perguntas[indice];
    return montarPergunta(q.a, q.b, q.tipo, atual.nivel);
  }

  // ---------- Entrar e sair ----------

  function meuPerfil() {
    var p = (typeof Conta !== 'undefined' && Conta.perfil && Conta.perfil()) || {};
    return {
      apelido: (typeof Conta !== 'undefined' && Conta.apelido()) || 'Craque',
      avatarSeed: String(p.avatarSeed || '').slice(0, 40)
    };
  }

  function criar(nivelId, tipos) {
    if (!temFirebase()) return Promise.resolve(null);
    var perguntas = sortearPerguntas(nivelId, tipos);
    return window.FirebaseMathGol.criarPartida({ nivel: nivelId, perguntas: perguntas })
      .then(function(r) {
        if (!r) return null;
        atual = { codigo: r.codigo, nivel: nivelId, perguntas: perguntas, souDono: true };
        euUid = r.uid;
        return comecarAObservar().then(function() { return atual; });
      });
  }

  function entrar(codigoDigitado) {
    if (!temFirebase()) return Promise.resolve({ ok: false, motivo: 'offline' });
    var cod = String(codigoDigitado || '').replace(/\D/g, '');
    if (cod.length !== 4) return Promise.resolve({ ok: false, motivo: 'formato' });

    return window.FirebaseMathGol.buscarPartida(cod).then(function(p) {
      if (!p) return { ok: false, motivo: 'nao-encontrada' };
      if (p.status === 'fim') return { ok: false, motivo: 'encerrada' };
      atual = {
        codigo: cod,
        nivel: p.nivel || 1,
        perguntas: Array.isArray(p.perguntas) ? p.perguntas : [],
        souDono: false
      };
      if (!atual.perguntas.length) { atual = null; return { ok: false, motivo: 'nao-encontrada' }; }
      return window.FirebaseMathGol.entrarNaPartida(cod, meuPerfil()).then(function(uid) {
        if (!uid) { atual = null; return { ok: false, motivo: 'offline' }; }
        euUid = uid;
        return comecarAObservar().then(function() { return { ok: true, partida: atual }; });
      });
    }).catch(function(erro) {
      console.warn('Nao foi possivel entrar na partida:', erro);
      atual = null;
      return { ok: false, motivo: 'offline' };
    });
  }

  function sair() {
    pararDeObservar();
    atual = null;
    jogadores = [];
    vistoPorUltimo = {};
    encerradaPorQueda = false;
    avisar();
  }

  // ---------- Ao vivo ----------

  function aoMudar(fn) { if (typeof fn === 'function') ouvintes.push(fn); }

  function avisar() {
    var foto = { jogadores: jogadores.slice(), eu: eu(), adversario: adversario(), queda: encerradaPorQueda };
    for (var i = 0; i < ouvintes.length; i++) {
      try { ouvintes[i](foto); } catch (e) { console.warn('Ouvinte do duelo online falhou:', e); }
    }
  }

  function eu() {
    for (var i = 0; i < jogadores.length; i++) if (jogadores[i].uid === euUid) return jogadores[i];
    return null;
  }

  function adversario() {
    for (var i = 0; i < jogadores.length; i++) if (jogadores[i].uid !== euUid) return jogadores[i];
    return null;
  }

  function comecarAObservar() {
    pararDeObservar();
    if (!atual) return Promise.resolve(false);
    var cod = atual.codigo;

    cancelarObserva = window.FirebaseMathGol.observarPartida(cod, function(lista) {
      if (!atual || atual.codigo !== cod) return;
      // Marca, no relogio DESTE aparelho, quando cada documento mudou.
      var agora = Date.now();
      lista.forEach(function(j) {
        var anterior = acharNaLista(jogadores, j.uid);
        if (!anterior || mudou(anterior, j)) vistoPorUltimo[j.uid] = agora;
        else if (!vistoPorUltimo[j.uid]) vistoPorUltimo[j.uid] = agora;
      });
      jogadores = lista;
      avisar();
    });

    timerSinal = setInterval(function() { sinalizar(); }, SINAL_MS);
    timerVigia = setInterval(function() { conferirQueda(); }, 4000);
    return sinalizar().then(function() { return true; });
  }

  function acharNaLista(lista, uid) {
    for (var i = 0; i < lista.length; i++) if (lista[i].uid === uid) return lista[i];
    return null;
  }

  function mudou(a, b) {
    return a.gols !== b.gols || a.pontuacao !== b.pontuacao ||
           a.cobranca !== b.cobranca || a.fim !== b.fim;
  }

  function conferirQueda() {
    if (!atual || encerradaPorQueda) return;
    var outro = adversario();
    if (!outro || outro.fim) return;      // ainda nao entrou, ou ja terminou
    var visto = vistoPorUltimo[outro.uid] || 0;
    if (visto && Date.now() - visto > LIMITE_SUMICO_MS) {
      encerradaPorQueda = true;
      avisar();
    }
  }

  function pararDeObservar() {
    if (typeof cancelarObserva === 'function') cancelarObserva();
    cancelarObserva = null;
    if (timerSinal) { clearInterval(timerSinal); timerSinal = null; }
    if (timerVigia) { clearInterval(timerVigia); timerVigia = null; }
  }

  // ---------- Reportar a propria jogada ----------

  var meuEstado = { gols: 0, pontuacao: 0, cobranca: 0, fim: false };

  function sinalizar() {
    if (!atual || !temFirebase()) return Promise.resolve(false);
    return window.FirebaseMathGol.entrarNaPartida(
      atual.codigo, Object.assign({}, meuPerfil(), meuEstado));
  }

  // Chamada ao fim de cada cobranca. Pontos pela mesma regra de velocidade
  // do jogo normal (CA-21.4) — quem calcula e o main.js.
  function reportar(dados) {
    if (!atual) return Promise.resolve(false);
    meuEstado.gols = Math.max(0, Math.min(COBRANCAS, parseInt(dados.gols, 10) || 0));
    meuEstado.pontuacao = Math.max(0, Math.min(COBRANCAS * 100, parseInt(dados.pontuacao, 10) || 0));
    meuEstado.cobranca = Math.max(0, Math.min(COBRANCAS, parseInt(dados.cobranca, 10) || 0));
    meuEstado.fim = !!dados.fim;
    return sinalizar();
  }

  function zerarPlacar() {
    meuEstado = { gols: 0, pontuacao: 0, cobranca: 0, fim: false };
  }

  // -1 empate, 0 eu venci, 1 o adversario venceu, null ainda nao deu
  function vencedor() {
    var a = eu(), b = adversario();
    if (!a) return null;
    if (!b) return encerradaPorQueda ? 0 : null;
    if (a.gols === b.gols) {
      if (a.pontuacao === b.pontuacao) return -1;
      return a.pontuacao > b.pontuacao ? 0 : 1;
    }
    return a.gols > b.gols ? 0 : 1;
  }

  return {
    COBRANCAS: COBRANCAS,
    estaOnline: estaOnline,
    codigo: codigo,
    nivel: nivel,
    totalCobrancas: totalCobrancas,
    caiuAConexao: caiuAConexao,
    criar: criar,
    entrar: entrar,
    sair: sair,
    perguntaDa: perguntaDa,
    aoMudar: aoMudar,
    eu: eu,
    adversario: adversario,
    reportar: reportar,
    zerarPlacar: zerarPlacar,
    vencedor: vencedor
  };
})();
