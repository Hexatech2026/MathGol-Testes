// botao.js — v2.2: futebol de botão com VAR de expressões numéricas.
//
// Campo visto de cima, em <canvas> 2D (funciona em qualquer aparelho, sem
// WebGL). Cada time tem 4 botões; a vez alterna. Na sua vez: arraste um
// botão do seu time PARA TRÁS e solte (estilingue) — ele bate na bola.
// Teclado: ← → mira, ↑ ↓ força, N troca de botão, Enter chuta.
//
// Todo gol vai para o VAR (var.js + #sobreposicao-var): o gol só é
// confirmado quando quem fez resolve uma expressão numérica do tipo de conta
// escolhido. Errou? A alternativa some e o VAR continua analisando, até
// acertar. Gol do computador o VAR confirma sozinho.
//
// Modos: contra o computador (CPU simples: escolhe o botão que está atrás
// da bola e mira no gol, com um pouco de erro) ou 2 jogadores no mesmo
// aparelho. Quem fizer 3 gols ganha.

var FutebolBotao = (function() {
  'use strict';

  // Mundo lógico (o canvas escala para caber na tela).
  var W = 300, H = 450, GOL = 96, R_BOLA = 8, R_BOTAO = 16;
  var GOLS_PARA_VENCER = 3;
  var ATRITO_BOLA = 0.986, ATRITO_BOTAO = 0.955, PARADO = 0.04;
  var FORCA_MAX = 11;

  var canvas, ctx, escala = 1, raf = 0;
  var corpos = [], bola = null;
  var modo = 'cpu', vez = 0, placar = [0, 0], nomes = ['Você', 'Computador'];
  var cores = [['#2E9E5B', '#FFC63B'], ['#E0343B', '#FFFDF6']];
  var estadoJogo = 'parado';  // 'mirando' | 'rolando' | 'var' | 'fim' | 'parado'
  var mira = null;            // { corpo, ang, forca, arrastando }
  var origem = 'tela-fases';
  var expressaoAtual = null, golPendente = null, nivelVar = 1;

  function el(id) { return document.getElementById(id); }

  // ---------- Montagem ----------
  function corpo(time, x, y, num) {
    return { time: time, x: x, y: y, vx: 0, vy: 0, r: R_BOTAO, m: 3, num: num };
  }
  function posicionar(quemSai) {
    corpos = [
      corpo(0, 150, 425, 1), corpo(0, 85, 345, 2), corpo(0, 215, 345, 3), corpo(0, 150, 285, 9),
      corpo(1, 150, 25, 1), corpo(1, 85, 105, 2), corpo(1, 215, 105, 3), corpo(1, 150, 165, 9)
    ];
    bola = { bola: true, x: 150, y: 225 + (quemSai === 0 ? 22 : -22), vx: 0, vy: 0, r: R_BOLA, m: 1 };
    corpos.push(bola);
  }

  // ---------- Física ----------
  function passoFisica() {
    var mexendo = false;
    corpos.forEach(function(c) {
      c.x += c.vx; c.y += c.vy;
      var a = c.bola ? ATRITO_BOLA : ATRITO_BOTAO;
      c.vx *= a; c.vy *= a;
      if (Math.abs(c.vx) < PARADO && Math.abs(c.vy) < PARADO) { c.vx = 0; c.vy = 0; } else mexendo = true;
      // Paredes. A bola passa pela boca do gol; botão não.
      var naBoca = c.bola && c.x > (W - GOL) / 2 + c.r && c.x < (W + GOL) / 2 - c.r;
      if (c.x < c.r) { c.x = c.r; c.vx = Math.abs(c.vx) * 0.8; }
      if (c.x > W - c.r) { c.x = W - c.r; c.vx = -Math.abs(c.vx) * 0.8; }
      if (!naBoca) {
        if (c.y < c.r) { c.y = c.r; c.vy = Math.abs(c.vy) * 0.8; }
        if (c.y > H - c.r) { c.y = H - c.r; c.vy = -Math.abs(c.vy) * 0.8; }
      }
    });
    // Colisões entre discos (elásticas, com massa).
    for (var i = 0; i < corpos.length; i++) {
      for (var j = i + 1; j < corpos.length; j++) {
        var a = corpos[i], b = corpos[j];
        var dx = b.x - a.x, dy = b.y - a.y, dist = Math.sqrt(dx * dx + dy * dy), min = a.r + b.r;
        if (dist === 0 || dist >= min) continue;
        var nx = dx / dist, ny = dy / dist, sobra = (min - dist) / 2;
        a.x -= nx * sobra; a.y -= ny * sobra; b.x += nx * sobra; b.y += ny * sobra;
        var rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel <= 0) continue;
        var imp = (1.9 * rel) / (1 / a.m + 1 / b.m);
        a.vx -= (imp / a.m) * nx; a.vy -= (imp / a.m) * ny;
        b.vx += (imp / b.m) * nx; b.vy += (imp / b.m) * ny;
        mexendo = true;
      }
    }
    return mexendo;
  }

  // Gol: bola passou inteira da linha de fundo dentro da boca.
  function golFeito() {
    if (bola.y < -R_BOLA) return 0;      // gol no alto = do time 0 (baixo)
    if (bola.y > H + R_BOLA) return 1;
    return -1;
  }

  // ---------- Vez e CPU ----------
  function textoVez() {
    if (estadoJogo === 'fim') return '';
    if (modo === 'cpu' && vez === 1) return '🤖 Vez do computador...';
    return (modo === 'cpu' ? 'Sua vez' : 'Vez de ' + nomes[vez]) + ': arraste um botão do time ' + (vez === 0 ? 'de baixo' : 'de cima') + ' para trás e solte!';
  }
  function atualizarPlacar() {
    el('botao-placar').textContent = placar[0] + ' x ' + placar[1];
    el('botao-nome-a').style.background = cores[0][0];
    el('botao-nome-a').style.color = cores[0][1];
    el('botao-nome-b').style.background = cores[1][0];
    el('botao-nome-b').style.color = cores[1][1];
    el('botao-nome-a').textContent = nomes[0];
    el('botao-nome-b').textContent = nomes[1];
    el('botao-vez').textContent = textoVez();
  }

  function comecarVez() {
    estadoJogo = 'mirando';
    var meus = corpos.filter(function(c) { return c.time === vez; });
    // Teclado: começa no botão mais perto da bola.
    meus.sort(function(a, b) { return dist2(a, bola) - dist2(b, bola); });
    mira = { corpo: meus[0], ang: Math.atan2(bola.y - meus[0].y, bola.x - meus[0].x), forca: 0.6, arrastando: false };
    atualizarPlacar();
    if (modo === 'cpu' && vez === 1) setTimeout(jogadaCpu, 700);
  }
  function dist2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }

  function chutar(c, ang, forca) {
    var v = Math.max(0.15, Math.min(1, forca)) * FORCA_MAX;
    c.vx = Math.cos(ang) * v; c.vy = Math.sin(ang) * v;
    estadoJogo = 'rolando';
    mira = null;
    if (typeof SFX !== 'undefined' && SFX.chute) SFX.chute();
    el('botao-vez').textContent = '';
  }

  // CPU: escolhe o botão que tem o melhor ângulo para empurrar a bola na
  // direção do gol de baixo e mira no "ponto de contato" atrás da bola.
  function jogadaCpu() {
    if (estadoJogo !== 'mirando' || vez !== 1) return;
    var alvo = { x: W / 2 + (Math.random() - 0.5) * GOL * 0.6, y: H + 20 };
    var dx = alvo.x - bola.x, dy = alvo.y - bola.y, d = Math.sqrt(dx * dx + dy * dy);
    var contato = { x: bola.x - (dx / d) * (R_BOLA + R_BOTAO), y: bola.y - (dy / d) * (R_BOLA + R_BOTAO) };
    var meus = corpos.filter(function(c) { return c.time === 1; });
    meus.sort(function(a, b) {
      // Prefere quem está "atrás" da bola (acima dela) e perto.
      return (dist2(a, contato) + (a.y > bola.y ? 40000 : 0)) - (dist2(b, contato) + (b.y > bola.y ? 40000 : 0));
    });
    var c = meus[0];
    var ang = Math.atan2(contato.y - c.y, contato.x - c.x) + (Math.random() - 0.5) * 0.22;
    var forca = Math.min(1, 0.55 + Math.sqrt(dist2(c, contato)) / 400 + Math.random() * 0.2);
    chutar(c, ang, forca);
  }

  // ---------- Loop ----------
  function quadro() {
    raf = requestAnimationFrame(quadro);
    if (typeof telaAtivaId === 'function' && telaAtivaId() !== 'tela-botao') { parar(); return; }
    if (estadoJogo === 'rolando') {
      var mexendo = false;
      for (var k = 0; k < 2; k++) mexendo = passoFisica() || mexendo;
      var g = golFeito();
      if (g >= 0) { aoGol(g); }
      else if (!mexendo) { vez = 1 - vez; comecarVez(); }
    }
    desenhar();
  }
  function parar() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  // ---------- Gol + VAR ----------
  function aoGol(time) {
    estadoJogo = 'var';
    corpos.forEach(function(c) { c.vx = 0; c.vy = 0; });
    golPendente = time;
    if (typeof SFX !== 'undefined' && SFX.gol) SFX.gol();
    var cpu = modo === 'cpu' && time === 1;
    if (cpu) {
      el('botao-vez').textContent = '📺 VAR confere o gol do computador... confirmado!';
      if (typeof Narracao !== 'undefined') Narracao.falar('Gol do computador. O VAR confirmou.', { tom: 'quase' });
      setTimeout(function() { confirmarGol(); }, 1600);
      return;
    }
    if (typeof Narracao !== 'undefined') Narracao.falar('Gol! Vai para o VAR!', { tom: 'gol' });
    abrirVar();
  }

  function abrirVar() {
    expressaoAtual = VAR.gerarExpressao(nivelVar);
    var lista = el('alternativas-var');
    lista.textContent = '';
    el('expressao-var').textContent = expressaoAtual.texto + ' = ?';
    el('dica-var').textContent = expressaoAtual.dica;
    el('aviso-var').textContent = '';
    el('aviso-var').className = 'aviso-sala';
    el('titulo-var').textContent = '📺 VAR: gol ' + (modo === 'cpu' ? 'seu' : 'de ' + nomes[golPendente]) + ' em análise';
    expressaoAtual.alternativas.forEach(function(v) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'botao-resposta botao-var';
      b.textContent = String(v);
      b.setAttribute('aria-label', 'Resposta ' + v);
      b.addEventListener('click', function() { responderVar(b, v); });
      lista.appendChild(b);
    });
    Modal.abrir(el('sobreposicao-var'), canvas, {
      // Fechou sem resolver (Esc)? O gol continua em análise: reabre.
      aoFechar: function() { if (estadoJogo === 'var' && golPendente !== null) setTimeout(reabrirVar, 250); }
    });
    if (typeof Narracao !== 'undefined') Narracao.falar(expressaoAtual.falado, { tom: 'pergunta', esperar: true });
  }
  function reabrirVar() {
    if (estadoJogo !== 'var' || golPendente === null) return;
    Modal.abrir(el('sobreposicao-var'), canvas, { aoFechar: function() { if (estadoJogo === 'var' && golPendente !== null) setTimeout(reabrirVar, 250); } });
  }

  function responderVar(botao, valor) {
    if (!expressaoAtual || golPendente === null) return;
    if (valor === expressaoAtual.resultado) {
      botao.classList.add('acertou');
      el('aviso-var').textContent = '✅ GOL CONFIRMADO! ' + expressaoAtual.texto + ' = ' + expressaoAtual.resultado;
      el('aviso-var').className = 'aviso-sala aviso-ok';
      if (typeof Conquistas !== 'undefined' && (modo === 'cpu' || golPendente === 0)) Conquistas.registrar('var-confirmado');
      if (typeof Carteira !== 'undefined' && (modo === 'cpu' || golPendente === 0)) Carteira.adicionar(10);
      if (typeof Narracao !== 'undefined') Narracao.falar('Gol confirmado!', { tom: 'gol' });
      setTimeout(function() {
        var time = golPendente;
        golPendente = null; // antes de fechar: o aoFechar nao reabre
        Modal.fechar();
        golPendente = time;
        confirmarGol();
      }, 1100);
      return;
    }
    // Errou: o VAR continua analisando. Tira so a alternativa errada.
    botao.disabled = true;
    botao.classList.add('errou');
    el('aviso-var').textContent = '🔎 O VAR continua analisando... Confira de novo: ' + expressaoAtual.dica;
    el('aviso-var').className = 'aviso-sala aviso-erro';
    if (typeof SFX !== 'undefined' && SFX.defesa) SFX.defesa();
  }

  function confirmarGol() {
    var time = golPendente;
    golPendente = null;
    expressaoAtual = null;
    placar[time]++;
    atualizarPlacar();
    if (placar[time] >= GOLS_PARA_VENCER) { fim(time); return; }
    // Quem sofreu o gol sai jogando.
    vez = 1 - time;
    posicionar(vez);
    comecarVez();
  }

  function fim(vencedor) {
    estadoJogo = 'fim';
    var texto = modo === 'cpu'
      ? (vencedor === 0 ? '🏆 Você venceu o computador por ' + placar[0] + ' x ' + placar[1] + '!' : '🤖 O computador venceu desta vez. Revanche?')
      : '🏆 ' + nomes[vencedor] + ' venceu por ' + Math.max(placar[0], placar[1]) + ' x ' + Math.min(placar[0], placar[1]) + '!';
    el('botao-vez').textContent = texto;
    if (typeof Narracao !== 'undefined') Narracao.falar(texto.replace(/[🏆🤖]/g, ''), { tom: 'resultado' });
    if (modo === 'cpu' && typeof Conquistas !== 'undefined') Conquistas.registrar('botao-fim', { venceu: vencedor === 0 });
    if (modo === 'cpu' && vencedor === 0 && typeof Carteira !== 'undefined') Carteira.adicionar(30);
    if (modo === '2j' && typeof Conquistas !== 'undefined') Conquistas.registrar('duelo-fim');
    if (typeof Festa !== 'undefined' && vencedor === 0) { /* a festa e da partida 3D; aqui so o texto */ }
    el('botao-escolha').hidden = false;
    el('botao-botao-cpu').textContent = '🤖 Jogar de novo contra o computador';
  }

  // ---------- Desenho ----------
  function desenhar() {
    if (!ctx) return;
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    // Gramado listrado.
    for (var i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? '#2F9E55' : '#35AC5D'; ctx.fillRect(0, i * H / 9, W, H / 9 + 1); }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.beginPath(); ctx.moveTo(3, H / 2); ctx.lineTo(W - 3, H / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 40, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeRect((W - 160) / 2, 3, 160, 60); ctx.strokeRect((W - 160) / 2, H - 63, 160, 60);
    // Gols.
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect((W - GOL) / 2, 0, GOL, 4); ctx.fillRect((W - GOL) / 2, H - 4, GOL, 4);
    // Mira (estilingue).
    if (mira && estadoJogo === 'mirando' && !(modo === 'cpu' && vez === 1)) {
      var c = mira.corpo, comp = 30 + 70 * mira.forca;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.cos(mira.ang) * comp, c.y + Math.sin(mira.ang) * comp); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 5, 0, Math.PI * 2); ctx.strokeStyle = '#FFE14D'; ctx.stroke();
    }
    corpos.forEach(function(c) {
      ctx.beginPath(); ctx.arc(c.x + 2, c.y + 3, c.r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      if (c.bola) {
        ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.strokeStyle = '#21303B'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(c.x, c.y, 3, 0, Math.PI * 2); ctx.fillStyle = '#21303B'; ctx.fill();
        return;
      }
      ctx.fillStyle = cores[c.time][0]; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = cores[c.time][1]; ctx.stroke();
      ctx.fillStyle = cores[c.time][1]; ctx.font = 'bold 13px Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(c.num), c.x, c.y + 1);
    });
  }

  function ajustarTamanho() {
    if (!canvas) return;
    var caixa = canvas.parentNode;
    var larg = Math.min(caixa.clientWidth || 300, 420, Math.max(220, (window.innerHeight - 260) / 1.5));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = larg + 'px';
    canvas.style.height = (larg * 1.5) + 'px';
    canvas.width = Math.round(larg * dpr);
    canvas.height = Math.round(larg * 1.5 * dpr);
    escala = canvas.width / W;
  }

  // ---------- Entrada: ponteiro e teclado ----------
  function pontoLogico(ev) {
    var r = canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * W / r.width, y: (ev.clientY - r.top) * H / r.height };
  }
  function humanoJoga() { return estadoJogo === 'mirando' && !(modo === 'cpu' && vez === 1); }

  function aoApertar(ev) {
    if (!humanoJoga() || !ev.isPrimary) return;
    var p = pontoLogico(ev);
    var meu = corpos.filter(function(c) { return c.time === vez && dist2(c, p) <= (c.r + 12) * (c.r + 12); })[0];
    if (!meu) return;
    canvas.setPointerCapture(ev.pointerId);
    mira = { corpo: meu, ang: mira ? mira.ang : 0, forca: 0, arrastando: true, id: ev.pointerId };
    ev.preventDefault();
  }
  function aoMover(ev) {
    if (!mira || !mira.arrastando || ev.pointerId !== mira.id) return;
    var p = pontoLogico(ev), c = mira.corpo;
    var dx = c.x - p.x, dy = c.y - p.y; // puxou para tras: chuta para a frente
    mira.ang = Math.atan2(dy, dx);
    mira.forca = Math.min(1, Math.sqrt(dx * dx + dy * dy) / 90);
  }
  function aoSoltar(ev) {
    if (!mira || !mira.arrastando || ev.pointerId !== mira.id) return;
    mira.arrastando = false;
    if (mira.forca < 0.08) return; // toque sem puxar: nao chuta
    chutar(mira.corpo, mira.ang, mira.forca);
  }
  function aoTeclar(ev) {
    if (!humanoJoga() || !mira) return;
    var k = ev.key;
    if (k === 'ArrowLeft') mira.ang -= 0.08;
    else if (k === 'ArrowRight') mira.ang += 0.08;
    else if (k === 'ArrowUp') mira.forca = Math.min(1, mira.forca + 0.08);
    else if (k === 'ArrowDown') mira.forca = Math.max(0.1, mira.forca - 0.08);
    else if (k === 'n' || k === 'N') {
      var meus = corpos.filter(function(c) { return c.time === vez; });
      mira.corpo = meus[(meus.indexOf(mira.corpo) + 1) % meus.length];
    } else if (k === 'Enter' || k === ' ') chutar(mira.corpo, mira.ang, mira.forca);
    else return;
    ev.preventDefault();
  }

  // ---------- Telas ----------
  function abrir(de) {
    origem = de || 'tela-fases';
    if (typeof origemTela !== 'undefined') origemTela['tela-botao'] = origem;
    el('botao-escolha').hidden = false;
    el('botao-jogo').hidden = true;
    el('botao-botao-cpu').textContent = '🤖 Contra o computador';
    estadoJogo = 'parado';
    mostrarTela('tela-botao');
  }

  function comecar(novoModo) {
    modo = novoModo;
    placar = [0, 0];
    var eu = (typeof Conta !== 'undefined' && Conta.apelido()) || 'Você';
    nomes = modo === 'cpu' ? ['Você', 'Computador'] : [eu, 'Jogador 2'];
    // Cor do time A = time escolhido (data.js); B = contraste.
    var t = typeof SELECOES !== 'undefined' && typeof estado !== 'undefined'
      ? SELECOES.find(function(s) { return s.id === estado.selecaoId; }) : null;
    cores[0] = [t && t.corPrimaria ? t.corPrimaria : '#2E9E5B', t && t.corSecundaria ? t.corSecundaria : '#FFC63B'];
    // Adversario vermelho; se o time da crianca ja for vermelho, azul.
    var r0 = parseInt(cores[0][0].slice(1, 3), 16), g0 = parseInt(cores[0][0].slice(3, 5), 16);
    cores[1] = r0 > 170 && g0 < 110 ? ['#3A5FCD', '#FFFDF6'] : ['#E0343B', '#FFFDF6'];
    // Nivel do VAR = nivel escolhido (ou o da sala).
    nivelVar = typeof Sala !== 'undefined' && Sala.estaNaSala() && Sala.nivelDaSala()
      ? Sala.nivelDaSala() : (typeof estado !== 'undefined' && typeof estado.dificuldadeId === 'number' ? estado.dificuldadeId
        : (typeof nivelDaDificuldadeAntiga === 'function' ? nivelDaDificuldadeAntiga(estado.dificuldadeId) : 1));
    el('botao-escolha').hidden = true;
    el('botao-jogo').hidden = false;
    ajustarTamanho();
    vez = 0;
    posicionar(0);
    comecarVez();
    parar();
    raf = requestAnimationFrame(quadro);
    try { canvas.focus({ preventScroll: true }); } catch (e) {}
  }

  function init() {
    canvas = el('botao-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', aoApertar);
    canvas.addEventListener('pointermove', aoMover);
    canvas.addEventListener('pointerup', aoSoltar);
    canvas.addEventListener('pointercancel', function() { if (mira) mira.arrastando = false; });
    canvas.addEventListener('keydown', aoTeclar);
    window.addEventListener('resize', function() { if (estadoJogo !== 'parado') ajustarTamanho(); });
    el('botao-botao-cpu').addEventListener('click', function() { if (typeof SFX !== 'undefined') SFX.selecionar(); comecar('cpu'); });
    el('botao-botao-2j').addEventListener('click', function() { if (typeof SFX !== 'undefined') SFX.selecionar(); comecar('2j'); });
    el('botao-sair-botao').addEventListener('click', function() {
      if (typeof SFX !== 'undefined') SFX.clique();
      parar(); estadoJogo = 'parado';
      if (typeof reabrirTela === 'function') reabrirTela(origem); else mostrarTela(origem);
    });
    var ouvir = el('botao-ouvir-var');
    if (ouvir) ouvir.addEventListener('click', function() {
      if (expressaoAtual && typeof Narracao !== 'undefined') Narracao.falar(expressaoAtual.falado, { tom: 'pergunta', forcar: true });
    });
  }

  // Para testes e diagnostico.
  function depurar() {
    return { estado: estadoJogo, vez: vez, placar: placar.slice(), modo: modo, golPendente: golPendente,
      expressao: expressaoAtual ? { texto: expressaoAtual.texto, resultado: expressaoAtual.resultado } : null,
      bola: bola ? { x: bola.x, y: bola.y } : null };
  }
  // Para testes: forca um gol do time (sem precisar mirar).
  function simularGol(time) { if (estadoJogo === 'mirando' || estadoJogo === 'rolando') aoGol(time); }

  return { init: init, abrir: abrir, comecar: comecar, depurar: depurar, simularGol: simularGol };
})();

document.addEventListener('DOMContentLoaded', function() { FutebolBotao.init(); });
