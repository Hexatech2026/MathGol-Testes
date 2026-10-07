// tutorial.js — tela "Como jogar": ensina, passo a passo, como funciona a
// cobrança de pênalti do MathGol (conta → mira → tipo de chute → força →
// gol → Cruzeiros → Loja).
//
// Abre sozinho na PRIMEIRA vez que a criança toca em "Jogar" e pode ser
// aberto de novo pelo botão "❓ Como jogar" do menu. Fica marcado como
// visto em localStorage ("mathgol_tutorial_visto") ao terminar ou pular.
//
// Ilustrações: SVG/HTML fixos (constantes deste arquivo, sem dado externo),
// animados por CSS. Com prefers-reduced-motion, ficam paradas (CSS).
// Navegação: botões, setas ← → do teclado e narração (se ligada).

var Tutorial = (function() {
  'use strict';

  var CHAVE_VISTO = 'mathgol_tutorial_visto';

  var GOL_SVG =
    '<svg class="tut-gol" viewBox="0 0 200 110">' +
      '<rect x="0" y="96" width="200" height="14" fill="#39B26A"/>' +
      '<rect x="22" y="14" width="156" height="82" fill="#FFFFFF" opacity="0.18"/>' +
      '<g stroke="#FFFDF6" stroke-width="1" opacity="0.5">' +
        '<line x1="48" y1="16" x2="48" y2="96"/><line x1="74" y1="16" x2="74" y2="96"/>' +
        '<line x1="100" y1="16" x2="100" y2="96"/><line x1="126" y1="16" x2="126" y2="96"/>' +
        '<line x1="152" y1="16" x2="152" y2="96"/><line x1="22" y1="40" x2="178" y2="40"/>' +
        '<line x1="22" y1="68" x2="178" y2="68"/>' +
      '</g>' +
      '<rect x="18" y="10" width="6" height="86" fill="#FFFDF6"/>' +
      '<rect x="176" y="10" width="6" height="86" fill="#FFFDF6"/>' +
      '<rect x="18" y="10" width="164" height="6" fill="#FFFDF6"/>' +
    '</svg>';

  var GOLEIRO_SVG =
    '<svg class="tut-goleiro" viewBox="0 0 40 50">' +
      '<circle cx="20" cy="8" r="6" fill="#E8B98C"/>' +
      '<rect x="12" y="14" width="16" height="18" rx="4" fill="#6CACE4"/>' +
      '<rect x="3" y="15" width="9" height="5" rx="2" fill="#FFFDF6"/>' +
      '<rect x="28" y="15" width="9" height="5" rx="2" fill="#FFFDF6"/>' +
      '<rect x="13" y="32" width="5" height="14" rx="2" fill="#21303B"/>' +
      '<rect x="22" y="32" width="5" height="14" rx="2" fill="#21303B"/>' +
    '</svg>';

  var BOLA = '<span class="tut-bola">⚽</span>';

  var PASSOS = [
    {
      titulo: '1. Responda a conta',
      texto: 'Leia a conta e toque na resposta certa antes do tempo acabar. Quanto mais rápido você responder, mais Cruzeiros ganha no gol!',
      ilustracao:
        '<div class="tut-cena tut-cena-conta">' +
          '<div class="tut-pergunta">3 + 4 = ?<span class="tut-timer">12s</span></div>' +
          '<div class="tut-respostas">' +
            '<span>5</span><span>9</span><span class="tut-certa">7</span><span>6</span><span>8</span>' +
          '</div>' +
          '<span class="tut-dedo" aria-hidden="true">👆</span>' +
        '</div>'
    },
    {
      titulo: '2. Errou? O goleiro defende',
      texto: 'Se a resposta estiver errada ou o tempo acabar, o goleiro pega a bola. Sem problema: na próxima cobrança você tenta de novo!',
      ilustracao:
        '<div class="tut-cena tut-cena-defesa">' + GOL_SVG +
          '<div class="tut-goleiro-pos">' + GOLEIRO_SVG + '</div>' +
          '<div class="tut-bola-defesa">' + BOLA + '</div>' +
          '<span class="tut-selo tut-selo-erro">Defesa!</span>' +
        '</div>'
    },
    {
      titulo: '3. Acertou? Mire no gol!',
      texto: 'Com a conta certa, você escolhe onde chutar. Mova a mira com o dedo, o mouse ou as setas e toque para travar. Se a mira ficar vermelha, ela está fora do gol!',
      ilustracao:
        '<div class="tut-cena tut-cena-mira">' + GOL_SVG +
          '<span class="tut-mira"></span>' +
        '</div>'
    },
    {
      titulo: '4. Escolha o tipo de chute',
      texto: 'A barra vai e volta sozinha. Toque para escolher: Rasteiro (bola baixinha), Meia-altura (vai onde você mirou) ou Cavadinha (bola por cima, com toque leve).',
      ilustracao:
        '<div class="tut-cena tut-cena-barra">' +
          '<div class="tut-trilho tut-trilho-altura"><span class="tut-indicador"></span>' +
            '<span class="tut-div"></span><span class="tut-div tut-div-2"></span></div>' +
          '<div class="tut-legenda"><span>⬇️ Rasteiro</span><span>⚽ Meia</span><span>☁️ Cavadinha</span></div>' +
        '</div>'
    },
    {
      titulo: '5. Acerte a força',
      texto: 'Agora a barra de força enche e esvazia. Toque quando ela estiver na faixa verde "ideal". Fraco demais, a bola não chega. Forte demais, passa por cima do gol!',
      ilustracao:
        '<div class="tut-cena tut-cena-barra">' +
          '<div class="tut-trilho"><span class="tut-ideal">ideal</span><span class="tut-enchimento"></span></div>' +
          '<div class="tut-legenda"><span>😴 fraco</span><span>💪 ideal</span><span>🚀 forte</span></div>' +
        '</div>'
    },
    {
      titulo: '6. GOOOL! Ganhe Cruzeiros',
      texto: 'Cada gol vale Cruzeiros ⭐. Junte seus Cruzeiros e compre seleções, times do Brasileirão, avatares e nomes novos na Loja. Bora jogar!',
      ilustracao:
        '<div class="tut-cena tut-cena-gol">' + GOL_SVG +
          '<div class="tut-bola-gol">' + BOLA + '</div>' +
          '<span class="tut-selo tut-selo-gol">GOL! +80 ⭐</span>' +
          '<span class="tut-loja">🛒</span>' +
        '</div>'
    }
  ];

  var passo = 0;
  var aoTerminar = null;

  function el(id) { return document.getElementById(id); }

  function jaVisto() {
    try { return localStorage.getItem(CHAVE_VISTO) === '1'; } catch (e) { return false; }
  }

  function marcarVisto() {
    try { localStorage.setItem(CHAVE_VISTO, '1'); } catch (e) {}
  }

  // origem: tela para onde "voltar"/"Pular" levam se nao houver aoTerminar.
  function abrir(origem, opcoes) {
    origemTela['tela-tutorial'] = origem || 'tela-menu';
    aoTerminar = (opcoes && typeof opcoes.aoTerminar === 'function') ? opcoes.aoTerminar : null;
    passo = 0;
    mostrarTela('tela-tutorial');
    renderizar();
  }

  function renderizar() {
    var p = PASSOS[passo];
    el('passo-tutorial-contador').textContent = 'Passo ' + (passo + 1) + ' de ' + PASSOS.length;
    el('passo-tutorial-titulo').textContent = p.titulo;
    el('passo-tutorial-texto').textContent = p.texto;
    // Constante deste arquivo (nao vem de usuario nem de rede).
    el('ilustracao-tutorial').innerHTML = p.ilustracao;

    var pontos = el('pontos-tutorial');
    pontos.textContent = '';
    for (var i = 0; i < PASSOS.length; i++) {
      var ponto = document.createElement('span');
      ponto.className = 'ponto-tutorial' + (i === passo ? ' ativo' : (i < passo ? ' feito' : ''));
      pontos.appendChild(ponto);
    }

    var anterior = el('botao-tutorial-anterior');
    var proximo = el('botao-tutorial-proximo');
    anterior.disabled = passo === 0;
    var ultimo = passo === PASSOS.length - 1;
    proximo.textContent = ultimo ? (aoTerminar ? 'Bora jogar! ⚽' : 'Entendi! ✅') : 'Próximo →';
    el('botao-tutorial-pular').hidden = ultimo;

    if (typeof Narracao !== 'undefined') Narracao.falar(p.titulo + '. ' + p.texto);
  }

  function irPara(novo) {
    if (novo < 0 || novo >= PASSOS.length) return;
    passo = novo;
    renderizar();
  }

  function concluir() {
    marcarVisto();
    var fn = aoTerminar;
    aoTerminar = null;
    if (fn) fn();
    else reabrirTela(origemTela['tela-tutorial'] || 'tela-menu');
  }

  function init() {
    el('botao-tutorial-anterior').addEventListener('click', function() {
      SFX.clique();
      irPara(passo - 1);
    });
    el('botao-tutorial-proximo').addEventListener('click', function() {
      if (passo === PASSOS.length - 1) { SFX.selecionar(); concluir(); return; }
      SFX.clique();
      irPara(passo + 1);
    });
    el('botao-tutorial-pular').addEventListener('click', function() {
      SFX.clique();
      concluir();
    });
    document.addEventListener('keydown', function(ev) {
      if (telaAtivaId() !== 'tela-tutorial' || Modal.estaAberto()) return;
      if (ev.target && ev.target.closest && ev.target.closest('input, textarea, select')) return;
      if (ev.key === 'ArrowRight') { ev.preventDefault(); irPara(passo + 1); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); irPara(passo - 1); }
    });
  }

  return {
    abrir: abrir,
    jaVisto: jaVisto,
    marcarVisto: marcarVisto,
    totalPassos: PASSOS.length,
    init: init
  };
})();

function initTutorial() { Tutorial.init(); }
