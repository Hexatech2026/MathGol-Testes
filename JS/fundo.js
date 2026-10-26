// fundo.js — fundo vivo das telas (menu, escolhas, loja, resultado).
//
// Um estadio a noite desenhado em <canvas>: ceu com estrelas piscando,
// refletores varrendo o ceu, flashes de camera na arquibancada, gramado
// listrado e "bolhas" com contas e bolas de futebol subindo devagar.
// Tem profundidade (parallax): as camadas se mexem um pouco com o mouse
// ou com a inclinacao do celular.
//
// Pensado para o Chromebook e para o celular:
//   - no maximo 30 quadros por segundo, resolucao limitada (DPR <= 1.5,
//     1.25 em tela pequena) e quantidade de particulas pela area da tela;
//   - PARA de desenhar com a aba escondida e durante a partida (o campo 3D
//     precisa da maquina inteira);
//   - prefers-reduced-motion: desenha UM quadro parado e nada se mexe.
// Decorativo (aria-hidden no HTML). Sem canvas 2D, o fundo CSS continua.

var FundoVivo = (function() {
  'use strict';

  var canvas = null, ctx = null, rafId = 0;
  var W = 0, H = 0, dpr = 1;
  var ultimo = 0, tempo = 0;
  var reduz = false;
  var alvoPx = 0, alvoPy = 0, px = 0, py = 0; // parallax (-1..1)
  var estrelas = [], bolhas = [], flashes = [], torcida = [];
  var SIMBOLOS = ['+', '−', '×', '÷', '=', '2', '3', '5', '7', '10', '½', '⚽'];
  var CORES_BOLHA = ['#FFC63B', '#3AA9D6', '#2E9E5B', '#FF7A59', '#B15BD6', '#FFFDF6'];

  function aleatorio(a, b) { return a + Math.random() * (b - a); }

  function medir() {
    var pequena = Math.min(window.innerWidth, window.innerHeight) < 600;
    dpr = Math.min(window.devicePixelRatio || 1, pequena ? 1.25 : 1.5);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    prepararCeu();
    criarCena();
  }

  function criarCena() {
    var area = W * H;
    var nEstrelas = Math.round(Math.min(140, area / 9000));
    var nBolhas = Math.round(Math.max(7, Math.min(22, area / 52000)));
    estrelas = [];
    for (var i = 0; i < nEstrelas; i++) {
      estrelas.push({ x: Math.random() * W, y: Math.random() * H * 0.62, r: aleatorio(0.5, 1.7), fase: Math.random() * 6.3, vel: aleatorio(0.8, 2.4) });
    }
    bolhas = [];
    for (var j = 0; j < nBolhas; j++) bolhas.push(novaBolha(true));
    // Arquibancada: fileiras de "cabecinhas" na silhueta do estadio.
    torcida = [];
    var linhas = 4, passo = W < 500 ? 9 : 11;
    for (var l = 0; l < linhas; l++) {
      for (var x = -10; x < W + 10; x += passo) {
        torcida.push({ x: x + (l % 2) * passo / 2, l: l, cor: CORES_BOLHA[(x / passo + l * 3) % CORES_BOLHA.length | 0], fase: Math.random() * 6.3 });
      }
    }
    flashes = [];
  }

  function novaBolha(espalhar) {
    var pequena = W < 500;
    var r = aleatorio(pequena ? 14 : 18, pequena ? 26 : 36);
    return {
      x: Math.random() * W,
      y: espalhar ? aleatorio(H * 0.05, H * 1.0) : H + r + aleatorio(0, H * 0.2),
      r: r,
      vy: aleatorio(9, 22),
      fase: Math.random() * 6.3,
      giro: aleatorio(-0.5, 0.5),
      prof: aleatorio(0.4, 1),            // profundidade: perto = maior e mais rapido
      simbolo: SIMBOLOS[Math.floor(Math.random() * SIMBOLOS.length)],
      cor: CORES_BOLHA[Math.floor(Math.random() * CORES_BOLHA.length)]
    };
  }

  // ---------- Desenho ----------

  // O ceu nao muda: desenhado uma vez numa camada propria (a cada resize)
  // e so copiado em cada quadro — mais leve no celular.
  var camadaCeu = null;
  function prepararCeu() {
    camadaCeu = document.createElement('canvas');
    camadaCeu.width = canvas.width;
    camadaCeu.height = canvas.height;
    var c = camadaCeu.getContext('2d');
    if (!c) { camadaCeu = null; return; }
    var g = c.createLinearGradient(0, 0, 0, camadaCeu.height);
    g.addColorStop(0, '#081A3A');
    g.addColorStop(0.55, '#123E78');
    g.addColorStop(0.8, '#1C6B8F');
    g.addColorStop(1, '#1F7A45');
    c.fillStyle = g;
    c.fillRect(0, 0, camadaCeu.width, camadaCeu.height);
  }
  function ceu() {
    if (camadaCeu) { ctx.drawImage(camadaCeu, 0, 0, W, H); return; }
    ctx.fillStyle = '#123E78';
    ctx.fillRect(0, 0, W, H);
  }

  function desenharEstrelas(t) {
    ctx.fillStyle = '#FFFDF6';
    for (var i = 0; i < estrelas.length; i++) {
      var e = estrelas[i];
      var brilho = reduz ? 0.6 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * e.vel + e.fase));
      ctx.globalAlpha = brilho * 0.85;
      ctx.beginPath();
      ctx.arc(e.x + px * 6, e.y + py * 4, e.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Refletores nos cantos de cima, varrendo o ceu em leque.
  function refletores(t) {
    var torres = [{ x: W * 0.06, lado: 1 }, { x: W * 0.94, lado: -1 }];
    var topo = H * 0.12;
    torres.forEach(function(torre, k) {
      var base = torre.x + px * 10;
      var ang = (reduz ? 0.55 : 0.5 + 0.22 * Math.sin(t * 0.35 + k * 1.7)) * torre.lado;
      ctx.save();
      ctx.translate(base, topo);
      ctx.rotate(ang);
      var comp = Math.max(W, H) * 1.1;
      var grad = ctx.createLinearGradient(0, 0, 0, comp);
      grad.addColorStop(0, 'rgba(255, 246, 210, 0.22)');
      grad.addColorStop(1, 'rgba(255, 246, 210, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
      ctx.lineTo(comp * 0.16, comp); ctx.lineTo(-comp * 0.16, comp);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // Poste e lampadas.
      ctx.fillStyle = '#0B1B33';
      ctx.fillRect(base - 3, topo, 6, H);
      ctx.fillStyle = '#FFF4C9';
      for (var a = 0; a < 3; a++) {
        ctx.beginPath(); ctx.arc(base - 9 + a * 9, topo - 4, 3.6, 0, Math.PI * 2); ctx.fill();
      }
      var halo = ctx.createRadialGradient(base, topo - 4, 0, base, topo - 4, 46);
      halo.addColorStop(0, 'rgba(255,244,201,0.55)');
      halo.addColorStop(1, 'rgba(255,244,201,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(base, topo - 4, 46, 0, Math.PI * 2); ctx.fill();
    });
  }

  function arquibancada(t) {
    var topo = H * 0.70 + py * 6;
    ctx.fillStyle = '#0D2747';
    ctx.beginPath();
    ctx.moveTo(0, topo + 30);
    ctx.quadraticCurveTo(W / 2, topo - 26, W, topo + 30);
    ctx.lineTo(W, H); ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
    // Torcida: cabecinhas que "pulam" de leve.
    for (var i = 0; i < torcida.length; i++) {
      var p = torcida[i];
      var curva = topo + 30 - 56 * (1 - Math.pow((p.x / W) * 2 - 1, 2)) * 0.5;
      var y = curva + 12 + p.l * 11 - (reduz ? 0 : Math.max(0, Math.sin(t * 3 + p.fase)) * 2.2);
      ctx.fillStyle = p.cor;
      ctx.globalAlpha = 0.55 - p.l * 0.08;
      ctx.beginPath(); ctx.arc(p.x + px * 3, y, 3.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Flashes de camera.
    if (!reduz && Math.random() < 0.18) {
      flashes.push({ x: Math.random() * W, y: topo + aleatorio(18, 60), vida: 1 });
    }
    for (var f = flashes.length - 1; f >= 0; f--) {
      var fl = flashes[f];
      var g = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, 14);
      g.addColorStop(0, 'rgba(255,255,255,' + (0.9 * fl.vida) + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(fl.x, fl.y, 14, 0, Math.PI * 2); ctx.fill();
      fl.vida -= 0.12;
      if (fl.vida <= 0) flashes.splice(f, 1);
    }
  }

  function gramado() {
    var topo = H * 0.86 + py * 8;
    var faixas = 7;
    for (var i = 0; i < faixas; i++) {
      ctx.fillStyle = i % 2 ? '#2A9455' : '#2E9E5B';
      var y0 = topo + (H - topo) * (i / faixas);
      ctx.fillRect(0, y0, W, (H - topo) / faixas + 1);
    }
    ctx.strokeStyle = 'rgba(255,253,246,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(W / 2 + px * 12, H + 10, Math.min(W * 0.32, 220), (H - topo) * 0.75, 0, Math.PI, 2 * Math.PI);
    ctx.stroke();
  }

  function desenharBolhas(t, dt) {
    for (var i = 0; i < bolhas.length; i++) {
      var b = bolhas[i];
      if (!reduz) {
        b.y -= b.vy * b.prof * dt;
        if (b.y < -b.r * 2) bolhas[i] = b = novaBolha(false);
      }
      var x = b.x + Math.sin(t * 0.6 + b.fase) * 14 * b.prof + px * 18 * b.prof;
      var y = b.y + py * 12 * b.prof;
      var r = b.r * (0.65 + 0.35 * b.prof);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(reduz ? 0 : Math.sin(t * b.giro + b.fase) * 0.35);
      ctx.globalAlpha = 0.18 + 0.32 * b.prof;
      if (b.simbolo === '⚽') {
        ctx.fillStyle = '#FFFDF6';
        ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#21303B';
        ctx.beginPath();
        for (var k = 0; k < 5; k++) {
          var a = -Math.PI / 2 + k * Math.PI * 2 / 5;
          ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.32);
        }
        ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = b.cor;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = Math.min(1, 0.45 + 0.5 * b.prof);
        ctx.fillStyle = b.cor === '#FFFDF6' || b.cor === '#FFC63B' ? '#123E78' : '#FFFDF6';
        ctx.font = '700 ' + Math.round(r * 1.05) + 'px Fredoka, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b.simbolo, 0, r * 0.06);
        // brilho
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function desenhar(t, dt) {
    px += (alvoPx - px) * 0.06;
    py += (alvoPy - py) * 0.06;
    ceu();
    desenharEstrelas(t);
    refletores(t);
    desenharBolhas(t, dt);
    arquibancada(t);
    gramado();
  }

  // ---------- Laco ----------

  function deveDesenhar() {
    return !document.hidden && !document.body.classList.contains('em-partida') &&
      !document.body.classList.contains('alto-contraste');
  }

  function quadro(agora) {
    rafId = 0;
    if (!deveDesenhar()) return; // retoma por "visibilitychange"/observador
    agendar();
    if (agora - ultimo < 33) return; // ~30 fps
    var dt = ultimo ? Math.min(0.1, (agora - ultimo) / 1000) : 0;
    ultimo = agora;
    tempo += dt;
    desenhar(tempo, dt);
  }

  function agendar() { if (!rafId && !reduz) rafId = requestAnimationFrame(quadro); }

  function retomar() {
    if (!canvas) return;
    if (reduz) { desenhar(0, 0); return; }
    if (deveDesenhar()) { ultimo = 0; agendar(); }
  }

  function init() {
    var caixa = document.querySelector('.campo-animado');
    if (!caixa) return;
    canvas = document.createElement('canvas');
    canvas.className = 'fundo-vivo';
    canvas.setAttribute('aria-hidden', 'true');
    ctx = canvas.getContext('2d');
    if (!ctx) { canvas = null; return; }
    caixa.textContent = '';
    caixa.appendChild(canvas);
    reduz = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    medir();
    desenhar(0, 0);

    var timerResize = null;
    window.addEventListener('resize', function() {
      clearTimeout(timerResize);
      timerResize = setTimeout(function() { medir(); desenhar(tempo, 0); }, 120);
    });
    document.addEventListener('visibilitychange', retomar);
    // Volta a desenhar quando a partida acaba (classe "em-partida" sai).
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(retomar).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    if (!reduz) {
      window.addEventListener('pointermove', function(ev) {
        alvoPx = (ev.clientX / Math.max(1, W)) * 2 - 1;
        alvoPy = (ev.clientY / Math.max(1, H)) * 2 - 1;
      }, { passive: true });
      window.addEventListener('deviceorientation', function(ev) {
        if (ev.gamma == null || ev.beta == null) return;
        alvoPx = Math.max(-1, Math.min(1, ev.gamma / 30));
        alvoPy = Math.max(-1, Math.min(1, (ev.beta - 45) / 30));
      }, { passive: true });
    }
    retomar();
  }

  return { init: init };
})();
