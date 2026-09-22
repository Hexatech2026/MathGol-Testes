// regras-chute.js — regra PURA da cobranca (sem DOM, sem Three.js).
//
// E a unica fonte de verdade de "gol / fora / defesa", compartilhada pela
// cena 3D (game.js), pelo modo simplificado 2D (game-2d.js) e pelos testes
// automatizados (tests/unit). Nenhuma funcao daqui toca em tela, som ou
// tempo; a aleatoriedade vem de um gerador injetavel (rng), para os testes
// serem deterministicos.
//
// Contrato da cobranca:
//
//   PERGUNTA
//   ├─ resposta errada ou tempo esgotado → DEFESA do goleiro
//   └─ resposta correta → mira → forca → chute
//        ├─ bola dentro da area valida do gol → GOL
//        └─ bola fora                         → FORA
//
// Resposta correta NUNCA vira defesa, mas tambem NAO garante gol.
//
// Unidades: metros no plano do gol (z = 0). x = lateral (0 = centro),
// y = altura a partir do chao.

(function(raiz) {
  'use strict';

  // Gol oficial: 7,32 m x 2,44 m.
  var GOL = { meiaLargura: 3.66, altura: 2.44 };

  // Onde a mira pode ficar: um pouco maior que a area valida, deixando uma
  // margem de risco perto das traves (mirar colado na trave e arriscado).
  var AREA_SELECAO = { xMin: -3.6, xMax: 3.6, yMin: 0.15, yMax: 2.55 };

  // O que conta como "dentro do gol". Um pouco menor que o gol real pra bola
  // nunca "atravessar" a trave visualmente.
  var AREA_VALIDA = { xMin: -3.5, xMax: 3.5, yMin: 0.05, yMax: 2.32 };

  // Faixa de forca ideal: dentro dela a bola vai exatamente onde a crianca
  // mirou. A barra de forca desenha essa faixa, pra ficar compreensivel.
  var FORCA_IDEAL = { min: 0.35, max: 0.75 };

  // Forca FRACA: a bola perde altura e pode nao chegar ao gol (morre antes
  // da linha). Com forca 0 ela cai QUEDA_MAX metros abaixo da mira — a
  // partir do centro do gol (y = 1.3) isso ja fica abaixo da area valida.
  var QUEDA_MAX = 1.6;
  // Forca FORTE: a bola sobe e pode passar por cima do travessao. Com
  // forca 1 ela sobe SUBIDA_MAX metros — do centro (1.3) vai a 2.9 > 2.32.
  var SUBIDA_MAX = 1.6;
  // Forca fora da faixa ideal tambem tira precisao lateral: ate
  // DESVIO_LATERAL_MAX metros para um lado aleatorio, proporcional ao erro.
  var DESVIO_LATERAL_MAX = 1.2;
  // A partir daqui (|x| em metros) a mira e considerada "colada na trave".
  var MIRA_EXTREMA_X = 2.5;

  var CENTRO_GOL = { x: 0, y: 1.3 };

  function limitar(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function numeroOu(v, padrao) {
    return (typeof v === 'number' && isFinite(v)) ? v : padrao;
  }

  function limitarMira(ponto) {
    var p = ponto || CENTRO_GOL;
    return {
      x: limitar(numeroOu(p.x, CENTRO_GOL.x), AREA_SELECAO.xMin, AREA_SELECAO.xMax),
      y: limitar(numeroOu(p.y, CENTRO_GOL.y), AREA_SELECAO.yMin, AREA_SELECAO.yMax)
    };
  }

  function dentroDaAreaValida(p) {
    return p.x >= AREA_VALIDA.xMin && p.x <= AREA_VALIDA.xMax &&
           p.y >= AREA_VALIDA.yMin && p.y <= AREA_VALIDA.yMax;
  }

  // Calcula onde a bola cruza o plano do gol a partir da mira e da forca.
  //   pontoMira: {x, y} em metros (e limitado a AREA_SELECAO)
  //   forca: 0..1 (valor travado na barra)
  //   rng: funcao () => [0, 1) — padrao Math.random; injete nos testes.
  // Retorna { destino:{x,y}, dentro:bool, motivo }, com motivo em
  //   'gol' | 'fraco' (nao chegou / rasteira morta) | 'alto' (por cima) |
  //   'lado' (fora pela lateral).
  function calcularResultadoChute(pontoMira, forca, rng) {
    var aleatorio = typeof rng === 'function' ? rng : Math.random;
    var mira = limitarMira(pontoMira);
    var f = limitar(numeroOu(forca, 0.5), 0, 1);

    var fraqueza = 0; // 0 (ideal) .. 1 (forca 0)
    var excesso = 0;  // 0 (ideal) .. 1 (forca 1)
    if (f < FORCA_IDEAL.min) fraqueza = (FORCA_IDEAL.min - f) / FORCA_IDEAL.min;
    else if (f > FORCA_IDEAL.max) excesso = (f - FORCA_IDEAL.max) / (1 - FORCA_IDEAL.max);

    var erro = Math.max(fraqueza, excesso);
    // Intensidade do desvio lateral e deterministica (depende so do erro de
    // forca); a DIRECAO e sorteada. Mirando perto da trave, o chute mal
    // batido tende a abrir (75% das vezes vai pro lado de fora) — por isso
    // mira extrema + forca ruim tem grande chance de sair.
    var sorteio = limitar(numeroOu(aleatorio(), 0.5), 0, 1);
    var sinal;
    if (Math.abs(mira.x) >= MIRA_EXTREMA_X) {
      var ladoDeFora = mira.x > 0 ? 1 : -1;
      sinal = sorteio < 0.75 ? ladoDeFora : -ladoDeFora;
    } else {
      sinal = sorteio < 0.5 ? -1 : 1;
    }
    var desvioX = sinal * DESVIO_LATERAL_MAX * erro;

    var destino = {
      x: mira.x + desvioX,
      y: mira.y - fraqueza * QUEDA_MAX + excesso * SUBIDA_MAX
    };

    var motivo = 'gol';
    if (destino.y < AREA_VALIDA.yMin) motivo = 'fraco';
    else if (destino.y > AREA_VALIDA.yMax) motivo = 'alto';
    else if (destino.x < AREA_VALIDA.xMin || destino.x > AREA_VALIDA.xMax) motivo = 'lado';

    return { destino: destino, dentro: motivo === 'gol', motivo: motivo, forca: f, mira: mira };
  }

  // Resolve o desfecho da cobranca a partir da resposta e (se houver) do chute.
  //   respostaCorreta: bool
  //   chute: retorno de calcularResultadoChute (obrigatorio se correta)
  // Retorna 'gol' | 'fora' | 'defesa'.
  function resolverCobranca(respostaCorreta, chute) {
    if (!respostaCorreta) return 'defesa';
    // Resposta correta: o goleiro NUNCA defende. Sem chute valido, a bola
    // nao entrou — conta como fora, jamais como gol automatico.
    if (!chute || chute.dentro !== true) return 'fora';
    return 'gol';
  }

  var RegrasChute = {
    GOL: GOL,
    AREA_SELECAO: AREA_SELECAO,
    AREA_VALIDA: AREA_VALIDA,
    FORCA_IDEAL: FORCA_IDEAL,
    CENTRO_GOL: CENTRO_GOL,
    limitarMira: limitarMira,
    dentroDaAreaValida: dentroDaAreaValida,
    calcularResultadoChute: calcularResultadoChute,
    resolverCobranca: resolverCobranca,
    // Gerador usado pelo jogo. Os testes E2E podem trocar por um fixo.
    aleatorio: function() { return Math.random(); }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RegrasChute;
  else raiz.RegrasChute = RegrasChute;
})(typeof window !== 'undefined' ? window : this);
