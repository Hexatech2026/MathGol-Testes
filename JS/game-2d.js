// game-2d.js — modo SIMPLIFICADO do penalti (2D, so DOM + CSS).
//
// Usado quando o Three.js nao carrega (CDN fora do ar, sem internet) ou
// quando o navegador nao tem WebGL (new THREE.WebGLRenderer lanca erro).
// Implementa EXATAMENTE o mesmo contrato de game.js e usa a MESMA regra
// de gol/fora (regras-chute.js). Ou seja: sem WebGL a crianca continua
// mirando e escolhendo a forca, e uma resposta certa NUNCA vira gol
// automatico nem defesa.
//
//   criarJogoPenalti2D(containerId, selecaoId) -> {
//     modo: '2d', chutar, iniciarMira, moverMiraTela, moverMiraDelta,
//     pararMira, chutarLivre(ponto, forca, altura, cb), destruir
//   }
//
// Todos os timers internos ficam registrados e sao cancelados em
// destruir(), pra nenhuma animacao "orfa" disparar depois de sair da tela.

function criarJogoPenalti2D(containerId, selecaoId) {
  'use strict';
  var container = document.getElementById(containerId);
  if (!container) throw new Error('Container do jogo nao encontrado: ' + containerId);
  if (typeof RegrasChute === 'undefined') throw new Error('regras-chute.js nao carregou');

  var reduzMovimento = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function d(ms) { return reduzMovimento ? 1 : ms; }

  var TEMPO = { CORRIDA: 450, VOO: 750, ANTES_DE_RESETAR: 1500 };

  // Projecao simples do plano do gol (metros) para % do palco.
  // O gol ocupa de 20% a 80% da largura; chao em 78%, travessao em 30%.
  var ESCALA_X = 30 / RegrasChute.GOL.meiaLargura;
  var CHAO = 78, TRAVESSAO = 30;
  var ESCALA_Y = (CHAO - TRAVESSAO) / RegrasChute.GOL.altura;
  var MARCA = { left: 50, top: 93 };

  function paraTela(p) {
    return { leftPercent: 50 + p.x * ESCALA_X, topPercent: CHAO - p.y * ESCALA_Y };
  }
  function daTela(leftPercent, topPercent) {
    return { x: (leftPercent - 50) / ESCALA_X, y: (CHAO - topPercent) / ESCALA_Y };
  }

  var ZONAS = {
    'topo-esquerda':  { x: -2.5, y: 2.0 },
    'topo-direita':   { x:  2.5, y: 2.0 },
    'meio':           { x:  0,   y: 1.3 },
    'baixo-esquerda': { x: -2.5, y: 0.55 },
    'baixo-direita':  { x:  2.5, y: 0.55 }
  };

  var cor = '#3A5FCD';
  if (typeof SELECOES !== 'undefined' && Array.isArray(SELECOES)) {
    var sel = SELECOES.find(function(s) { return s.id === selecaoId; });
    if (sel && /^#[0-9a-fA-F]{6}$/.test(sel.corPrimaria || '')) cor = sel.corPrimaria;
  }

  // ---------- Cena ----------
  var cena = document.createElement('div');
  cena.className = 'cena-2d';
  cena.setAttribute('aria-hidden', 'true');

  var gol = document.createElement('div');
  gol.className = 'cena-2d-gol';
  gol.style.left = (50 - 30) + '%';
  gol.style.width = '60%';
  gol.style.top = TRAVESSAO + '%';
  gol.style.height = (CHAO - TRAVESSAO) + '%';

  var goleiro = document.createElement('div');
  goleiro.className = 'cena-2d-goleiro';

  var batedor = document.createElement('div');
  batedor.className = 'cena-2d-batedor';
  batedor.style.background = cor;

  var bola = document.createElement('div');
  bola.className = 'cena-2d-bola';

  cena.appendChild(gol);
  cena.appendChild(goleiro);
  cena.appendChild(batedor);
  cena.appendChild(bola);
  container.appendChild(cena);

  // ---------- Timers rastreados ----------
  var vivo = true;
  var emAnimacao = false;
  var timers = [];
  function depois(ms, fn) {
    var id = setTimeout(function() {
      timers.splice(timers.indexOf(id), 1);
      if (vivo) fn();
    }, ms);
    timers.push(id);
  }

  function posicionar(el, leftPercent, topPercent, duracaoMs) {
    el.style.transitionDuration = (duracaoMs || 0) + 'ms';
    el.style.left = leftPercent + '%';
    el.style.top = topPercent + '%';
  }

  function resetar() {
    posicionar(bola, MARCA.left, MARCA.top, 0);
    var baseGoleiro = paraTela({ x: 0, y: 0 });
    posicionar(goleiro, baseGoleiro.leftPercent, baseGoleiro.topPercent, 0);
    goleiro.classList.remove('mergulho-esquerda', 'mergulho-direita', 'goleiro-no-chao');
    bola.classList.remove('bola-cavadinha');
    posicionar(batedor, 44, 98, 0);
    cena.classList.remove('cena-2d-gol-marcado');
  }
  resetar();

  function animarCobranca(destinoTela, poseGoleiroTela, aoContato, aoTerminarVoo) {
    emAnimacao = true;
    posicionar(batedor, 48, 96, d(TEMPO.CORRIDA));
    depois(d(TEMPO.CORRIDA), function() {
      if (typeof SFX !== 'undefined' && SFX.chute) SFX.chute();
      if (aoContato) aoContato();
      posicionar(goleiro, poseGoleiroTela.leftPercent, poseGoleiroTela.topPercent, d(TEMPO.VOO));
      goleiro.classList.add(poseGoleiroTela.leftPercent < 50 ? 'mergulho-esquerda' : 'mergulho-direita');
      posicionar(bola, destinoTela.leftPercent, destinoTela.topPercent, d(TEMPO.VOO));
      depois(d(TEMPO.VOO), function() {
        emAnimacao = false;
        // Goleiro termina deitado no gramado (nunca abaixo da linha do chao).
        goleiro.classList.add('goleiro-no-chao');
        // Deitado, a "espessura" do corpo (7% da largura = ~12,4% da altura
        // num palco 16:9) fica metade acima da linha do chao: sobe metade.
        posicionar(goleiro, poseGoleiroTela.leftPercent, CHAO - 6.2, d(260));
        aoTerminarVoo();
        depois(reduzMovimento ? 60 : TEMPO.ANTES_DE_RESETAR, resetar);
      });
    });
  }

  // Resposta errada / tempo esgotado: goleiro vai na bola e defende.
  function chutar(zonaId, aoFinalizar) {
    if (emAnimacao || !vivo) return false;
    var alvo = ZONAS[zonaId] || ZONAS.meio;
    var tela = paraTela(alvo);
    var poseGoleiro = paraTela({ x: alvo.x * 0.85, y: Math.max(0, alvo.y - 0.6) });
    animarCobranca(tela, poseGoleiro, null, function() {
      posicionar(bola, tela.leftPercent, tela.topPercent + 8, d(250)); // rebote
      if (aoFinalizar) aoFinalizar({ gol: false, fora: false, motivo: 'defesa' });
    });
    return true;
  }

  // ---------- Mira ----------
  var pontoMira = RegrasChute.limitarMira(RegrasChute.CENTRO_GOL);
  var aoAtualizarMira = null;
  function notificar() { if (aoAtualizarMira) aoAtualizarMira(paraTela(pontoMira), pontoMira); }

  function iniciarMira(aoAtualizar) {
    pontoMira = RegrasChute.limitarMira(RegrasChute.CENTRO_GOL);
    aoAtualizarMira = aoAtualizar || null;
    notificar();
  }
  function moverMiraTela(clientX, clientY) {
    if (!aoAtualizarMira) return;
    var rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var p = daTela((clientX - rect.left) / rect.width * 100, (clientY - rect.top) / rect.height * 100);
    pontoMira = RegrasChute.limitarMira(p);
    notificar();
  }
  function moverMiraDelta(dx, dy) {
    if (!aoAtualizarMira) return;
    pontoMira = RegrasChute.limitarMira({ x: pontoMira.x + dx, y: pontoMira.y + dy });
    notificar();
  }
  function pararMira() {
    aoAtualizarMira = null;
    return { x: pontoMira.x, y: pontoMira.y };
  }

  // ---------- Chute livre (resposta correta) ----------
  function chutarLivre(ponto, forca, altura, aoFinalizar) {
    if (typeof altura === 'function' && aoFinalizar === undefined) { aoFinalizar = altura; altura = undefined; }
    if (emAnimacao || !vivo) return false;
    var r = RegrasChute.calcularResultadoChute(ponto, forca, altura, RegrasChute.aleatorio);
    bola.classList.toggle('bola-cavadinha', r.tipo === 'cavadinha');
    var destinoTela;
    if (r.motivo === 'fraco') {
      // Bola morre rolando antes da linha do gol.
      destinoTela = { leftPercent: 50 + r.destino.x * ESCALA_X * 0.6, topPercent: CHAO + 7 };
    } else if (r.motivo === 'alto') {
      destinoTela = paraTela({ x: r.destino.x, y: Math.max(r.destino.y, RegrasChute.GOL.altura + 0.6) });
    } else {
      destinoTela = paraTela(r.destino);
    }
    // Goleiro sempre vai pro lado oposto — resposta certa nunca e defendida.
    var lado = r.destino.x >= 0 ? -1 : 1;
    var poseGoleiro = paraTela({ x: lado * 2.4, y: 0.6 });
    animarCobranca(destinoTela, poseGoleiro, null, function() {
      if (r.dentro) cena.classList.add('cena-2d-gol-marcado');
      if (aoFinalizar) aoFinalizar({ gol: r.dentro, fora: !r.dentro, motivo: r.motivo, tipo: r.tipo });
    });
    return true;
  }

  function destruir() {
    if (!vivo) return;
    vivo = false;
    timers.forEach(clearTimeout);
    timers = [];
    aoAtualizarMira = null;
    if (cena.parentNode) cena.parentNode.removeChild(cena);
  }

  return {
    modo: '2d',
    chutar: chutar,
    iniciarMira: iniciarMira,
    moverMiraTela: moverMiraTela,
    moverMiraDelta: moverMiraDelta,
    pararMira: pararMira,
    chutarLivre: chutarLivre,
    destruir: destruir
  };
}
