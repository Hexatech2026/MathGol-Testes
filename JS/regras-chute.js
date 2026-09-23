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
//   └─ resposta correta → mira → altura (tipo de chute) → forca → chute
//        ├─ bola dentro da area valida do gol → GOL
//        └─ bola fora                         → FORA
//
// Resposta correta NUNCA vira defesa, mas tambem NAO garante gol.
//
// Tipos de chute (escolhidos pela barra de altura) — cada um muda o
// resultado de verdade, nao so a animacao:
//   rasteiro   : bola baixa (nao sobe acima de 0,9 m, entao nao pega o
//                angulo), mais precisa na lateral; pede forca MAIOR.
//   meia-altura: o chute "normal".
//   cavadinha  : bola sobe e cai por cima (termina ~0,35 m acima da mira e
//                um pouco mais pro centro); pede forca MENOR. Mirar alto
//                de cavadinha passa por cima do travessao.
//
// Garantias (testadas):
//   - Mira fora do gol = fora, com qualquer forca (forca ruim nunca "salva").
//   - Forca dentro da faixa ideal do tipo e sempre a melhor escolha: se o
//     chute ideal sai, qualquer outra forca tambem sai.
//   - No centro do gol, forca 0 e forca 1 saem em todos os tipos.
//
// Unidades: metros no plano do gol (z = 0). x = lateral (0 = centro),
// y = altura do CENTRO da bola a partir do chao.

(function(raiz) {
  'use strict';

  // Gol oficial: 7,32 m x 2,44 m. Raio da bola na cena (maior que o real,
  // pra ler bem na tela).
  var GOL = { meiaLargura: 3.66, altura: 2.44 };
  var RAIO_BOLA = 0.22;

  // O que conta como "dentro do gol": o CENTRO da bola precisa ficar a
  // pelo menos um raio das traves e do travessao (a bola inteira entra).
  // Abaixo de yMin a bola nao chegou ao gol (rolou e parou antes).
  var AREA_VALIDA = {
    xMin: -(GOL.meiaLargura - RAIO_BOLA),
    xMax: GOL.meiaLargura - RAIO_BOLA,
    yMin: 0.2,
    yMax: GOL.altura - RAIO_BOLA
  };

  // Onde a mira pode ficar: um pouco maior que a area valida. Mirar nessa
  // margem (colado na trave / no travessao) ja e fora.
  var AREA_SELECAO = { xMin: -3.6, xMax: 3.6, yMin: RAIO_BOLA, yMax: 2.55 };

  var QUEDA_MAX = 1.6;          // forca fraca: a bola cai ate isso (m)
  var SUBIDA_MAX = 1.6;         // forca forte: a bola sobe ate isso (m)
  var DESVIO_LATERAL_MAX = 1.2; // forca errada: desvio lateral ate isso (m)
  var MIRA_EXTREMA_X = 2.5;     // |x| a partir do qual a mira e "colada na trave"

  var TIPOS = {
    rasteiro: {
      id: 'rasteiro', nome: 'Rasteiro',
      forcaIdeal: { min: 0.45, max: 0.85 },
      alturaMaxima: 0.9, elevacao: 0, puxarCentro: 0,
      fatorQueda: 1, fatorSubida: 1, fatorLateral: 0.6,
      arcoVisual: 0.05
    },
    meia: {
      id: 'meia', nome: 'Meia-altura',
      forcaIdeal: { min: 0.35, max: 0.75 },
      alturaMaxima: Infinity, elevacao: 0, puxarCentro: 0,
      fatorQueda: 1, fatorSubida: 1, fatorLateral: 1,
      arcoVisual: 0.5
    },
    cavadinha: {
      id: 'cavadinha', nome: 'Cavadinha',
      forcaIdeal: { min: 0.15, max: 0.5 },
      alturaMaxima: Infinity, elevacao: 0.35, puxarCentro: 0.25,
      fatorQueda: 1, fatorSubida: 1.5, fatorLateral: 1,
      arcoVisual: 2.4
    }
  };
  // Faixas da barra de altura (0 = rasteiro, 1 = cavadinha).
  var LIMITES_ALTURA = { rasteiroAte: 1 / 3, cavadinhaDesde: 2 / 3 };

  // Mantido por compatibilidade: faixa do chute padrao (meia-altura).
  var FORCA_IDEAL = TIPOS.meia.forcaIdeal;
  var CENTRO_GOL = { x: 0, y: 1.3 };

  function limitar(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function numeroOu(v, padrao) { return (typeof v === 'number' && isFinite(v)) ? v : padrao; }

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

  function motivoDoPonto(p) {
    if (p.y < AREA_VALIDA.yMin) return 'fraco';
    if (p.y > AREA_VALIDA.yMax) return 'alto';
    if (p.x < AREA_VALIDA.xMin || p.x > AREA_VALIDA.xMax) return 'lado';
    return 'gol';
  }

  // Altura (0..1) → tipo de chute. Sem altura: meia-altura.
  function tipoPorAltura(altura) {
    if (typeof altura === 'string' && TIPOS[altura]) return TIPOS[altura];
    var a = numeroOu(altura, 0.5);
    if (a < LIMITES_ALTURA.rasteiroAte) return TIPOS.rasteiro;
    if (a >= LIMITES_ALTURA.cavadinhaDesde) return TIPOS.cavadinha;
    return TIPOS.meia;
  }

  // Onde a bola iria com a forca IDEAL do tipo (so mira + tipo).
  function destinoIdeal(mira, tipo) {
    return {
      x: mira.x * (1 - tipo.puxarCentro),
      y: Math.min(mira.y, tipo.alturaMaxima) + tipo.elevacao
    };
  }

  // Calcula onde o CENTRO da bola cruza o plano do gol.
  //   pontoMira: {x, y} (limitado a AREA_SELECAO)
  //   forca: 0..1
  //   altura: 0..1 ou id do tipo ('rasteiro' | 'meia' | 'cavadinha'); opcional
  //   rng: () => [0, 1) — padrao Math.random; injete nos testes.
  // (Compativel com a assinatura antiga (mira, forca, rng).)
  // Retorna { destino, dentro, motivo: 'gol'|'fraco'|'alto'|'lado', tipo, forca, mira, ideal }.
  function calcularResultadoChute(pontoMira, forca, altura, rng) {
    if (typeof altura === 'function' && rng === undefined) { rng = altura; altura = undefined; }
    var aleatorio = typeof rng === 'function' ? rng : Math.random;
    var mira = limitarMira(pontoMira);
    var tipo = tipoPorAltura(altura);
    var f = limitar(numeroOu(forca, (tipo.forcaIdeal.min + tipo.forcaIdeal.max) / 2), 0, 1);
    var faixa = tipo.forcaIdeal;
    var ideal = destinoIdeal(mira, tipo);

    var base = { mira: mira, tipo: tipo.id, forca: f, ideal: ideal };

    // 1) Mira fora do gol, ou chute ideal ja saindo (ex.: cavadinha mirada
    //    alto demais): sai com QUALQUER forca. Assim uma forca ruim nunca e
    //    melhor que a ideal.
    var motivoIdeal = !dentroDaAreaValida(mira) ? motivoDoPonto(mira) : motivoDoPonto(ideal);
    if (motivoIdeal !== 'gol') {
      return Object.assign(base, { destino: desviarParaFora(ideal, motivoIdeal), dentro: false, motivo: motivoIdeal });
    }

    // 2) Erro de forca em relacao a faixa ideal do tipo (0 = ideal, 1 = extremo).
    var fraqueza = 0, excesso = 0;
    if (f < faixa.min) fraqueza = (faixa.min - f) / faixa.min;
    else if (f > faixa.max) excesso = (f - faixa.max) / (1 - faixa.max);
    var erro = Math.max(fraqueza, excesso);

    // Intensidade do desvio lateral e deterministica; a DIRECAO e sorteada.
    // Colado na trave, o chute mal batido tende a abrir (75% pro lado de fora).
    var sorteio = limitar(numeroOu(aleatorio(), 0.5), 0, 1);
    var sinal;
    if (Math.abs(mira.x) >= MIRA_EXTREMA_X) {
      var ladoDeFora = mira.x > 0 ? 1 : -1;
      sinal = sorteio < 0.75 ? ladoDeFora : -ladoDeFora;
    } else {
      sinal = sorteio < 0.5 ? -1 : 1;
    }

    var destino = {
      x: ideal.x + sinal * DESVIO_LATERAL_MAX * tipo.fatorLateral * erro,
      y: ideal.y - fraqueza * QUEDA_MAX * tipo.fatorQueda + excesso * SUBIDA_MAX * tipo.fatorSubida
    };
    var motivo = motivoDoPonto(destino);
    return Object.assign(base, { destino: destino, dentro: motivo === 'gol', motivo: motivo });
  }

  // Para desenhar: garante que um destino "fora" fique visivelmente fora.
  function desviarParaFora(p, motivo) {
    var d = { x: p.x, y: p.y };
    if (motivo === 'alto') d.y = Math.max(d.y, AREA_VALIDA.yMax + 0.35);
    else if (motivo === 'fraco') d.y = Math.min(d.y, AREA_VALIDA.yMin - 0.1);
    else if (motivo === 'lado') d.x = (d.x >= 0 ? 1 : -1) * Math.max(Math.abs(d.x), AREA_VALIDA.xMax + 0.35);
    return d;
  }

  // Resolve o desfecho da cobranca. Retorna 'gol' | 'fora' | 'defesa'.
  function resolverCobranca(respostaCorreta, chute) {
    if (!respostaCorreta) return 'defesa';
    // Resposta correta: o goleiro NUNCA defende. Sem chute valido, a bola
    // nao entrou — conta como fora, jamais como gol automatico.
    if (!chute || chute.dentro !== true) return 'fora';
    return 'gol';
  }

  // Trajetoria da bola ate o plano do gol, parametrizada por s em [0, 1]:
  // em s = 1 a bola esta EXATAMENTE no destino calculado (z = 0), qualquer
  // que seja o arco. Usada pela cena 3D; testada nos unitarios.
  function pontoTrajetoria(inicio, destino, arco, s) {
    var t = limitar(numeroOu(s, 0), 0, 1);
    return {
      x: inicio.x + (destino.x - inicio.x) * t,
      y: inicio.y + (destino.y - inicio.y) * t + numeroOu(arco, 0) * 4 * t * (1 - t),
      z: inicio.z + (0 - inicio.z) * t
    };
  }

  var RegrasChute = {
    GOL: GOL,
    RAIO_BOLA: RAIO_BOLA,
    AREA_SELECAO: AREA_SELECAO,
    AREA_VALIDA: AREA_VALIDA,
    FORCA_IDEAL: FORCA_IDEAL,
    TIPOS: TIPOS,
    LIMITES_ALTURA: LIMITES_ALTURA,
    CENTRO_GOL: CENTRO_GOL,
    limitarMira: limitarMira,
    dentroDaAreaValida: dentroDaAreaValida,
    tipoPorAltura: tipoPorAltura,
    calcularResultadoChute: calcularResultadoChute,
    resolverCobranca: resolverCobranca,
    pontoTrajetoria: pontoTrajetoria,
    // Gerador usado pelo jogo. Os testes E2E podem trocar por um fixo.
    aleatorio: function() { return Math.random(); }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RegrasChute;
  else raiz.RegrasChute = RegrasChute;
})(typeof window !== 'undefined' ? window : this);
