// festa.js — confete e fogos de artificio por cima do campo, no gol.
//
// Canvas proprio (#festa-canvas), desenhado so enquanto dura a festa e
// desligado em seguida: nada de loop eterno rodando atras do jogo.
//
// Decisoes que vale conhecer antes de mexer:
//
//   - Nada aqui e essencial. Se o canvas nao existir, se o navegador nao
//     der contexto 2D ou se a maquina estiver com "movimento reduzido"
//     ligado, o modulo simplesmente nao faz nada e o jogo segue igual.
//     A faixa de texto, que e quem de fato comunica o resultado, nao
//     depende deste arquivo.
//
//   - O numero de particulas cai pela metade em tela pequena. O alvo e o
//     Chromebook do laboratorio, nao o notebook de quem programou.
//
//   - Tudo e cancelado por parar(): sair da partida no meio da festa nao
//     pode deixar rAF vivo (foi a familia de defeitos DEF-01/DEF-02 da
//     Sprint 3).

var Festa = (function() {
  var canvas = null, ctx = null, rafId = null;
  var particulas = [];
  var fogosPendentes = [];
  var inicio = 0, duracao = 0;
  var larg = 0, alt = 0, dpr = 1;

  var CORES = ['#FFC63B', '#2E9E5B', '#3AA9D6', '#E0343B', '#FFFDF6', '#B15BD6'];

  function reduzMovimento() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function pegarCanvas() {
    if (canvas) return canvas;
    canvas = document.getElementById('festa-canvas');
    if (!canvas || !canvas.getContext) { canvas = null; return null; }
    ctx = canvas.getContext('2d');
    if (!ctx) { canvas = null; return null; }
    return canvas;
  }

  function medir() {
    var caixa = canvas.getBoundingClientRect();
    larg = Math.max(1, Math.round(caixa.width));
    alt = Math.max(1, Math.round(caixa.height));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(larg * dpr);
    canvas.height = Math.round(alt * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function aleatorio(min, max) { return min + Math.random() * (max - min); }
  function corSorteada() { return CORES[Math.floor(Math.random() * CORES.length)]; }

  // Confete: cai do topo girando, com arrasto no ar.
  function semearConfete(quantidade) {
    for (var i = 0; i < quantidade; i++) {
      particulas.push({
        tipo: 'confete',
        x: aleatorio(0, larg),
        y: aleatorio(-alt * 0.5, -6),
        vx: aleatorio(-24, 24),
        vy: aleatorio(70, 160),
        giro: aleatorio(0, Math.PI * 2),
        velGiro: aleatorio(-5, 5),
        l: aleatorio(5, 10),
        a: aleatorio(7, 13),
        cor: corSorteada(),
        vida: 1
      });
    }
  }

  // Fogos: um ponto sobe, some, e vira um anel de faiscas.
  function estourarFogo(x, y) {
    var cor = corSorteada();
    var faiscas = larg < 380 ? 16 : 26;
    for (var i = 0; i < faiscas; i++) {
      var ang = (Math.PI * 2 * i) / faiscas + aleatorio(-0.1, 0.1);
      var vel = aleatorio(60, 155);
      particulas.push({
        tipo: 'faisca',
        x: x, y: y,
        vx: Math.cos(ang) * vel,
        vy: Math.sin(ang) * vel,
        cor: Math.random() < 0.25 ? '#FFFDF6' : cor,
        r: aleatorio(1.6, 3.2),
        vida: 1,
        decaimento: aleatorio(0.5, 0.95)
      });
    }
  }

  function passo(agora) {
    if (!canvas) return;
    var decorrido = agora - inicio;
    if (decorrido > duracao && particulas.length === 0) { parar(); return; }
    rafId = requestAnimationFrame(passo);

    // Fogos agendados: estouram ao longo da festa, nao todos de uma vez.
    while (fogosPendentes.length && fogosPendentes[0].quando <= decorrido) {
      var f = fogosPendentes.shift();
      estourarFogo(f.x * larg, f.y * alt);
    }

    var dt = Math.min(0.05, (agora - (passo.ultimo || agora)) / 1000);
    passo.ultimo = agora;

    ctx.clearRect(0, 0, larg, alt);
    for (var i = particulas.length - 1; i >= 0; i--) {
      var p = particulas[i];
      if (p.tipo === 'confete') {
        p.vy += 120 * dt;            // gravidade
        p.vx *= 0.995;               // arrasto
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.giro += p.velGiro * dt;
        if (p.y > alt + 20) { particulas.splice(i, 1); continue; }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.giro);
        ctx.fillStyle = p.cor;
        // O achatamento no eixo Y finge o papel girando no ar.
        ctx.fillRect(-p.l / 2, -p.a / 2, p.l, p.a * Math.abs(Math.cos(p.giro)));
        ctx.restore();
      } else {
        p.vy += 190 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vida -= p.decaimento * dt;
        if (p.vida <= 0) { particulas.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, p.vida);
        ctx.fillStyle = p.cor;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  // tipo: 'gol' (fogos + confete) ou 'confete' (so confete).
  function iniciar(tipo) {
    parar();
    if (reduzMovimento()) return false;
    if (!pegarCanvas()) return false;
    canvas.hidden = false;
    medir();

    var pequeno = larg < 380;
    duracao = tipo === 'gol' ? 2600 : 1600;
    semearConfete(pequeno ? 40 : 80);

    if (tipo === 'gol') {
      // Seis estouros espalhados pela metade de cima do campo.
      var pontos = [[0.22, 0.26, 0], [0.74, 0.20, 180], [0.48, 0.14, 420],
                    [0.14, 0.38, 760], [0.86, 0.34, 980], [0.56, 0.30, 1320]];
      for (var i = 0; i < pontos.length; i++) {
        if (pequeno && i % 2 === 1) continue;   // metade no celular
        fogosPendentes.push({ x: pontos[i][0], y: pontos[i][1], quando: pontos[i][2] });
      }
    }

    inicio = performance.now();
    passo.ultimo = inicio;
    rafId = requestAnimationFrame(passo);
    return true;
  }

  function parar() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    particulas.length = 0;
    fogosPendentes.length = 0;
    if (canvas && ctx) {
      ctx.clearRect(0, 0, larg, alt);
      canvas.hidden = true;
    }
  }

  function estaAtiva() { return rafId !== null; }

  return { iniciar: iniciar, parar: parar, estaAtiva: estaAtiva };
})();
