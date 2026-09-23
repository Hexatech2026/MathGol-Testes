// progressao.js — sistema de progressao entre fases.
// TODAS as fases usam a mesma mecanica de cobranca de penalti (resposta →
// mira → forca → chute). O que muda de uma fase pra outra e so:
// quantidade de cobrancas, tempo para responder e nivel das contas.
// Fase 1: Penaltis (3 cobrancas, 15 s)
// Fase 2: Falta    (5 cobrancas, 12 s, contas sobem 1 nivel)
// Fase 3: Final    (7 cobrancas, 10 s, contas sobem mais 1 nivel)
// Obs.: "Falta" e so o nome da fase; nao existe mecanica de cobranca de
// falta (barreira etc.).
//
// Desbloqueia a proxima fase ao fazer >= 2 gols na fase atual.
// Progresso salvo em localStorage (e Firebase quando disponivel).
//
// HU-07: persistência versionada e tolerante a dados antigos/corrompidos.
// O valor salvo tem o formato { versao, dados }. Registros salvos antes
// deste versionamento (sem o campo "versao") são tratados como legado e
// migrados no lugar, sem perder o progresso já conquistado pela criança.
// Qualquer campo com formato inesperado é ignorado individualmente (usa
// o padrão daquele campo) em vez de descartar o restante do progresso.

var Progressao = (function() {

  var CHAVE_PROGRESSAO = 'mathgol_progressao';
  var VERSAO_PROGRESSAO = 1;

  var FASES = [
    {
      id: 'penaltis',
      nome: 'Pênaltis',
      icone: '⚽',
      descricao: '3 cobranças — aqueça o pé!',
      tituloResultado: 'Fim da fase Pênaltis!',
      cobrancas: 3,
      timerMax: 15,
      golsParaDesbloquear: 2, // gols minimos para desbloquear a proxima
      dificuldadeForcar: null  // usa a dificuldade escolhida pelo jogador
    },
    {
      id: 'falta',
      nome: 'Falta',
      icone: '🥅',
      descricao: '5 cobranças — menos tempo, contas mais difíceis!',
      tituloResultado: 'Fim da fase Falta!',
      cobrancas: 5,
      timerMax: 12,
      golsParaDesbloquear: 3,
      dificuldadeForcar: null // o nivel sobe via ESCALAR_DIFICULDADE
    },
    {
      id: 'final',
      nome: 'Final',
      icone: '🏆',
      descricao: '7 cobranças — vale o título!',
      tituloResultado: 'Fim da Final!',
      cobrancas: 7,
      timerMax: 10,
      golsParaDesbloquear: null, // ultima fase
      dificuldadeForcar: null
    }
  ];

  // Mapa: dificuldade escolhida -> dificuldade efetiva por fase
  var ESCALAR_DIFICULDADE = {
    'facil':   ['facil', 'medio', 'dificil'],
    'medio':   ['medio', 'dificil', 'dificil'],
    'dificil': ['dificil', 'dificil', 'dificil']
  };

  var progresso = {
    fasesDesbloqueadas: ['penaltis'], // sempre comeca com a primeira
    melhorPontuacao: {},              // { faseId: pontos }
    melhorGols: {}                    // { faseId: gols }
  };

  // Valida campo a campo, tolerando dados corrompidos ou de um formato
  // antigo: cada chave só é aceita se tiver o tipo esperado, senão o valor
  // padrão daquele campo específico é mantido (nunca descarta tudo por
  // causa de um único campo ruim).
  function aplicarDadosSalvos(dados) {
    if (!dados || typeof dados !== 'object') return;
    if (Array.isArray(dados.fasesDesbloqueadas) && dados.fasesDesbloqueadas.length &&
        dados.fasesDesbloqueadas.every(function(id) { return typeof id === 'string'; })) {
      progresso.fasesDesbloqueadas = dados.fasesDesbloqueadas;
    }
    if (dados.melhorPontuacao && typeof dados.melhorPontuacao === 'object') {
      var pontuacaoValida = {};
      Object.keys(dados.melhorPontuacao).forEach(function(faseId) {
        var v = dados.melhorPontuacao[faseId];
        if (typeof v === 'number' && isFinite(v)) pontuacaoValida[faseId] = v;
      });
      progresso.melhorPontuacao = pontuacaoValida;
    }
    if (dados.melhorGols && typeof dados.melhorGols === 'object') {
      var golsValidos = {};
      Object.keys(dados.melhorGols).forEach(function(faseId) {
        var v = dados.melhorGols[faseId];
        if (typeof v === 'number' && isFinite(v)) golsValidos[faseId] = v;
      });
      progresso.melhorGols = golsValidos;
    }
  }

  // Saneia o progresso lido do navegador (DEF-17): mesmos limites da
  // validacao de backup. Em vez de descartar tudo, corrige o que for
  // impossivel — recorde acima do que a fase permite, pontos incompativeis
  // com os gols, fase desbloqueada sem os gols da fase anterior.
  function sanear() {
    var gols = {}, pontos = {};
    FASES.forEach(function(f) {
      var g = Math.floor(progresso.melhorGols[f.id] || 0);
      g = Math.min(f.cobrancas, Math.max(0, g));
      var p = Math.floor(progresso.melhorPontuacao[f.id] || 0);
      p = Math.min(g * 100, Math.max(0, p));
      if (g > 0 && p < 10) p = 10 * g;
      if (g > 0) gols[f.id] = g;
      if (p > 0) pontos[f.id] = p;
    });
    var fases = ['penaltis'];
    for (var i = 1; i < FASES.length; i++) {
      var anterior = FASES[i - 1];
      if (progresso.fasesDesbloqueadas.indexOf(FASES[i].id) === -1) break;
      if ((gols[anterior.id] || 0) < anterior.golsParaDesbloquear) break;
      fases.push(FASES[i].id);
    }
    progresso.melhorGols = gols;
    progresso.melhorPontuacao = pontos;
    progresso.fasesDesbloqueadas = fases;
  }

  function carregar() {
    var bruto;
    try { bruto = JSON.parse(localStorage.getItem(CHAVE_PROGRESSAO)); } catch (e) { bruto = null; }
    if (!bruto || typeof bruto !== 'object') return;

    if (typeof bruto.versao === 'number' && bruto.dados) {
      // Formato versionado atual (ou futuro — se a versão mudar, os dados
      // ainda têm as mesmas chaves conhecidas e são aplicados campo a campo).
      aplicarDadosSalvos(bruto.dados);
    } else {
      // Formato legado (pré-versionamento): o próprio objeto raiz é o
      // "dados". Migra em vez de descartar o progresso já salvo.
      aplicarDadosSalvos(bruto);
    }
    sanear();
  }

  function salvar() {
    try {
      localStorage.setItem(CHAVE_PROGRESSAO, JSON.stringify({
        versao: VERSAO_PROGRESSAO,
        dados: progresso
      }));
    } catch (e) {}
  }

  function obterFases() {
    return FASES;
  }

  function faseDesbloqueada(faseId) {
    return progresso.fasesDesbloqueadas.indexOf(faseId) !== -1;
  }

  function obterFase(faseId) {
    return FASES.find(function(f) { return f.id === faseId; }) || FASES[0];
  }

  function indiceFase(faseId) {
    for (var i = 0; i < FASES.length; i++) {
      if (FASES[i].id === faseId) return i;
    }
    return 0;
  }

  function dificuldadeEfetiva(dificuldadeEscolhida, faseId) {
    var idx = indiceFase(faseId);
    var escala = ESCALAR_DIFICULDADE[dificuldadeEscolhida] || ESCALAR_DIFICULDADE['facil'];
    return escala[Math.min(idx, escala.length - 1)];
  }

  // Registra resultado de uma fase. Retorna { desbloqueou: bool, proximaFase: string|null }
  function registrarResultado(faseId, gols, pontuacao) {
    var fase = obterFase(faseId);
    var idx = indiceFase(faseId);

    // Atualiza melhores
    if (!progresso.melhorPontuacao[faseId] || pontuacao > progresso.melhorPontuacao[faseId]) {
      progresso.melhorPontuacao[faseId] = pontuacao;
    }
    if (!progresso.melhorGols[faseId] || gols > progresso.melhorGols[faseId]) {
      progresso.melhorGols[faseId] = gols;
    }

    // Verifica desbloqueio
    var desbloqueou = false;
    var proximaFase = null;
    if (fase.golsParaDesbloquear !== null && gols >= fase.golsParaDesbloquear) {
      var proxIdx = idx + 1;
      if (proxIdx < FASES.length) {
        proximaFase = FASES[proxIdx].id;
        if (progresso.fasesDesbloqueadas.indexOf(proximaFase) === -1) {
          progresso.fasesDesbloqueadas.push(proximaFase);
          desbloqueou = true;
        }
      }
    }

    salvar();
    return { desbloqueou: desbloqueou, proximaFase: proximaFase };
  }

  function melhorPontuacao(faseId) {
    return progresso.melhorPontuacao[faseId] || 0;
  }

  function melhorGols(faseId) {
    return progresso.melhorGols[faseId] || 0;
  }

  // Inicializa ao carregar
  carregar();

  return {
    obterFases: obterFases,
    obterFase: obterFase,
    faseDesbloqueada: faseDesbloqueada,
    dificuldadeEfetiva: dificuldadeEfetiva,
    registrarResultado: registrarResultado,
    melhorPontuacao: melhorPontuacao,
    melhorGols: melhorGols
  };
})();
