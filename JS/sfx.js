// sfx.js — efeitos sonoros usando Web Audio API (zero arquivos externos).
// Cada som é sintetizado programaticamente. Respeita o toggle de áudio
// do painel de acessibilidade e só toca depois de interação do usuário
// (política de autoplay dos navegadores: o AudioContext só é criado na
// primeira chamada, que sempre acontece a partir de um clique/tap).
//
// HU-09: sons curtos, distintos e não agressivos para clique, confirmação,
// apito, chute, gol, defesa, aviso final do timer, tempo esgotado, fase
// completa e desbloqueio. Todos os nós ativos ficam rastreados em `ativos`
// para permitir cortar tudo imediatamente (toggle desligado, ou um som
// "prioritário" que precisa silenciar o que estava tocando antes, evitando
// sobreposição caótica).

var SFX = (function() {
  var ctx = null;
  var ativo = true;
  var indisponivel = false; // true se o navegador bloquear/não suportar AudioContext
  var ativos = []; // nós de áudio (osciladores/buffer sources) tocando agora
  var ultimoTimerAlerta = 0;

  function obterContexto() {
    if (indisponivel) return null;
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        indisponivel = true;
        return null;
      }
    }
    if (ctx.state === 'suspended') {
      // resume() pode rejeitar em alguns navegadores (ex.: política de
      // autoplay mais restrita) — nunca deve virar erro não tratado.
      try {
        var p = ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(function() {});
      } catch (e) {}
    }
    return ctx;
  }

  function registrar(no) {
    ativos.push(no);
  }

  function desregistrar(no) {
    var i = ativos.indexOf(no);
    if (i !== -1) ativos.splice(i, 1);
  }

  // Corta imediatamente tudo que estiver tocando. Usado ao desligar o
  // controle "Efeitos sonoros" e antes de sons "prioritários" (chute, gol,
  // defesa, apito, tempo esgotado) para evitar sobreposição caótica com
  // ticks de alerta ou cliques ainda em andamento.
  function pararTudo() {
    var lista = ativos.slice();
    ativos = [];
    lista.forEach(function(no) {
      try { no.stop(0); } catch (e) {}
      try { no.disconnect(); } catch (e) {}
    });
  }

  // --- Utilitarios de sintese ---

  function tocarTom(freq, duracao, tipo, volume, rampDown) {
    var c = obterContexto();
    if (!c || !ativo) return;
    try {
      var osc = c.createOscillator();
      var gain = c.createGain();
      osc.type = tipo || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume || 0.25, c.currentTime);
      if (rampDown !== false) {
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duracao);
      }
      osc.connect(gain);
      gain.connect(c.destination);
      registrar(osc);
      osc.onended = function() { desregistrar(osc); };
      osc.start(c.currentTime);
      osc.stop(c.currentTime + duracao);
    } catch (e) { /* navegador recusou tocar; falha silenciosa e segura */ }
  }

  function tocarRuido(duracao, volume) {
    var c = obterContexto();
    if (!c || !ativo) return;
    try {
      var tamanho = Math.max(1, Math.floor(c.sampleRate * duracao));
      var buffer = c.createBuffer(1, tamanho, c.sampleRate);
      var dados = buffer.getChannelData(0);
      for (var i = 0; i < tamanho; i++) {
        dados[i] = (Math.random() * 2 - 1) * (1 - i / tamanho);
      }
      var source = c.createBufferSource();
      source.buffer = buffer;
      var gain = c.createGain();
      gain.gain.setValueAtTime(volume || 0.15, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duracao);
      source.connect(gain);
      gain.connect(c.destination);
      registrar(source);
      source.onended = function() { desregistrar(source); };
      source.start();
    } catch (e) { /* falha silenciosa e segura */ }
  }

  // --- Sons do jogo ---

  function apito() {
    // Apito de arbitro: tom agudo duplo
    pararTudo();
    tocarTom(1200, 0.15, 'square', 0.12);
    setTimeout(function() { tocarTom(1400, 0.3, 'square', 0.12); }, 160);
  }

  function chute() {
    // Som curto e seco de impacto no couro — distinto do apito e do gol,
    // tocado no instante em que o pé encosta na bola (ver game.js).
    pararTudo();
    tocarTom(180, 0.08, 'triangle', 0.16, true);
    setTimeout(function() { tocarTom(90, 0.06, 'sine', 0.1); }, 30);
  }

  function gol() {
    // Sequencia ascendente alegre + ruido de torcida
    pararTudo();
    var notas = [523, 659, 784, 1047]; // C5 E5 G5 C6
    notas.forEach(function(f, i) {
      setTimeout(function() { tocarTom(f, 0.25, 'square', 0.15); }, i * 100);
    });
    setTimeout(function() { tocarRuido(0.6, 0.12); }, 200); // torcida
  }

  function defesa() {
    // Tom descendente triste
    pararTudo();
    tocarTom(400, 0.15, 'triangle', 0.2);
    setTimeout(function() { tocarTom(280, 0.3, 'triangle', 0.18); }, 140);
  }

  function tempoEsgotado() {
    // Buzina curta
    pararTudo();
    tocarTom(220, 0.5, 'sawtooth', 0.12);
  }

  function clique() {
    // Click sutil de botao
    tocarTom(800, 0.06, 'sine', 0.1);
  }

  function selecionar() {
    // Pop de confirmacao
    tocarTom(600, 0.08, 'sine', 0.12);
    setTimeout(function() { tocarTom(900, 0.1, 'sine', 0.1); }, 60);
  }

  function timerAlerta() {
    // Tick de urgencia (segundos 4, 3, 2 e 1). Quem garante "um por
    // segundo exibido" e o main.js (ultimoSegundoAlertado); este debounce
    // de 800 ms e so uma rede de seguranca contra ticks empilhados.
    var agora = Date.now();
    if (agora - ultimoTimerAlerta < 800) return;
    ultimoTimerAlerta = agora;
    tocarTom(1000, 0.04, 'square', 0.08);
  }

  function faseCompleta() {
    // Fanfarra curta
    pararTudo();
    var notas = [523, 659, 784, 880, 1047];
    notas.forEach(function(f, i) {
      setTimeout(function() { tocarTom(f, 0.2, 'square', 0.12); }, i * 120);
    });
    setTimeout(function() { tocarRuido(0.4, 0.08); }, 400);
  }

  function faseLiberada() {
    // Som de desbloqueio: arpejo brilhante
    pararTudo();
    var notas = [440, 554, 659, 880];
    notas.forEach(function(f, i) {
      setTimeout(function() { tocarTom(f, 0.15, 'sine', 0.15); }, i * 80);
    });
  }

  function alternar(valor) {
    ativo = valor;
    if (!ativo) pararTudo();
  }

  function estaAtivo() {
    return ativo;
  }

  return {
    apito: apito,
    chute: chute,
    gol: gol,
    defesa: defesa,
    tempoEsgotado: tempoEsgotado,
    clique: clique,
    selecionar: selecionar,
    timerAlerta: timerAlerta,
    faseCompleta: faseCompleta,
    faseLiberada: faseLiberada,
    alternar: alternar,
    estaAtivo: estaAtivo
  };
})();
