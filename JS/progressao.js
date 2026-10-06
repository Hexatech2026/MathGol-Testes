// progressao.js — sistema de progressao entre fases.
// Fase 1: Penaltis (3 cobrancas) — ja existe
// Fase 2: Falta (5 cobrancas, timer menor, dificuldade sobe)
// Fase 3: Final (7 cobrancas, timer curto, dificuldade maxima)
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
      cobrancas: 3,
      timerMax: 15,
      golsParaDesbloquear: 2, // gols minimos para desbloquear a proxima
      dificuldadeForcar: null  // usa a dificuldade escolhida pelo jogador
    },
    {
      id: 'falta',
      nome: 'Falta',
      icone: '🥅',
      descricao: '5 cobranças — goleiro mais esperto!',
      cobrancas: 5,
      timerMax: 12,
      golsParaDesbloquear: 3,
      dificuldadeForcar: null // sobe 1 nivel automaticamente
    },
    {
      id: 'final',
      nome: 'Final',
      icone: '🏆',
      descricao: '7 cobranças — vale o título!',
      cobrancas: 7,
      timerMax: 10,
      golsParaDesbloquear: null, // ultima fase
      dificuldadeForcar: null
    }
  ];

  // Quanto o nível sobe a cada fase.
  //
  // ANTES isto era um mapa de 3 dificuldades e o salto era brutal: quem
  // escolhia "facil" encarava a fase 3 em "dificil" — ou seja, saía de
  // 2 + 3 e caía em 7 × 9 e divisões na mesma sessão. Era a reclamação
  // principal de quem testou.
  //
  // Agora a escada tem 12 degraus (niveis.js) e cada fase sobe UM. Da fase 1
  // à 3 o jogador anda 2 degraus pequenos, não 2 abismos.
  var PASSO_POR_FASE = 1;

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

  // Nível efetivo de uma fase: o nível de partida + um degrau por fase.
  //
  // Aceita tanto um número (nível novo) quanto 'facil'/'medio'/'dificil'
  // (progresso salvo antes da escada existir), traduzido por niveis.js.
  function nivelEfetivo(nivelOuDificuldade, faseId) {
    var base = typeof nivelOuDificuldade === 'number'
      ? nivelOuDificuldade
      : nivelDaDificuldadeAntiga(nivelOuDificuldade);
    var idx = indiceFase(faseId);
    return obterNivel(base + idx * PASSO_POR_FASE).id; // obterNivel já limita em 1..12
  }

  // Nome antigo mantido: main.js e qualquer código de fora continuam
  // chamando dificuldadeEfetiva() sem saber que agora devolve um nível.
  function dificuldadeEfetiva(nivelOuDificuldade, faseId) {
    return nivelEfetivo(nivelOuDificuldade, faseId);
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
    nivelEfetivo: nivelEfetivo,
    registrarResultado: registrarResultado,
    melhorPontuacao: melhorPontuacao,
    melhorGols: melhorGols
  };
})();
