// main.js - orquestra navegacao, timer de resposta, pontuacao por velocidade.
// Apelido TRAVADO: crianca escolhe 1 personagem + 1 animal (sem digitar).
// v2: + efeitos sonoros (sfx.js), banco de questoes (banco-questoes.js),
//       sistema de progressao entre fases (progressao.js).
// v3: + acessibilidade revisada (HU-08), persistencia estruturada e
//       versionada do resultado (HU-07) e bloqueio anti-clique-residual
//       na fase de penalti.
// v4: + mecanica de penalti em 4 etapas separadas (documento de melhorias):
//       responder a conta (fora do gol) -> mirar (mouse/toque, area livre
//       do gol) -> forca (barra oscilante, um toque trava) -> chute.
//       Resposta CORRETA garante que o goleiro nao pode defender, mas a
//       mira e a forca ainda podem mandar a bola pra fora. Resposta
//       ERRADA e tempo esgotado continuam com o comportamento antigo
//       (defesa imediata na zona escolhida), sem nenhuma mudanca.
// v5: + etapa de altura (barra igual a de forca, entre forca e chute):
//       0 = chute rasteiro, 1 = cavadinha. So muda o arco/velocidade
//       visual do chute (chutarLivre em game.js) — nao interfere no
//       calculo de gol/fora, que continua so em funcao de mira + forca.
//       + botao de tela cheia no topo (Fullscreen API, com fallback
//       silencioso — some se o navegador nao suportar).

var estado = {
  personagemEscolhido: null,
  animalEscolhido: null,
  apelido: '',
  avatarSeed: AVATAR_PADRAO.seed,
  selecaoId: null,
  dificuldadeId: null,
  faseAtual: 'penaltis',
  cobrancaAtual: 0,
  gols: 0,
  pontuacao: 0,
  // HU-07: cada cobranca fica registrada como objeto estruturado (zona
  // escolhida, zona correta, resultado, se estourou o tempo, pontos e
  // tempo usado). resultado agora pode ser 'gol' | 'defesa' | 'fora'.
  resultadosCobrancas: [],
  perguntaAtual: null,
  zonaCorreta: null,
  jogoPenalti: null,
  token: null,
  timerInicio: 0,
  timerInterval: null,
  timerSegundos: 15,
  // Trava para garantir que cada cobranca finalize exatamente uma vez.
  cobrancaFinalizada: false
};

var TOTAL_COBRANCAS = 3;
var TIMER_MAX = 15;

// Tempo que o resultado ("GOOOL!" / "O goleiro defendeu!" / "Pra fora!")
// fica na tela antes de carregar a proxima pergunta. Acompanha o ritmo da
// animacao do penalti (ver TEMPO em game.js): tem que ser maior que
// TEMPO.ANTES_DE_RESETAR pra bola ja estar de volta na marca.
var PAUSA_ENTRE_COBRANCAS = 2200;
var categoriaAvatarAtiva = CATEGORIAS_AVATAR[0].id;

// Rotulos amigaveis das zonas do gol, usados no resumo de cobrancas da
// tela de resultado (HU-07) e em mensagens acessiveis por texto. So se
// aplica ao caminho de resposta errada / tempo esgotado (chute livre nao
// tem "zona", tem ponto continuo).
var ROTULO_ZONA = {
  'topo-esquerda': 'canto superior esquerdo',
  'topo-direita': 'canto superior direito',
  'meio': 'meio do gol',
  'baixo-esquerda': 'canto inferior esquerdo',
  'baixo-direita': 'canto inferior direito'
};

// Schema versionado do ultimo resultado salvo (HU-07).
var VERSAO_ULTIMO_RESULTADO = 1;

// Ordem fixa das 5 alternativas <-> 5 zonas internas (usada so no caminho
// de resposta errada / tempo esgotado, pra reaproveitar o chutar() antigo
// sem nenhuma mudanca nele).
var ORDEM_ZONAS = ['topo-esquerda', 'topo-direita', 'meio', 'baixo-esquerda', 'baixo-direita'];

// Funcao de limpeza da etapa de mira/forca em andamento (se houver), pra
// nao deixar listeners de clique presos em #jogo-penalti caso o jogador
// saia da tela no meio dessas etapas (voltar / menu). Setada por
// avancarParaMira/avancarParaForca, limpa ao confirmar ou ao encerrar.
var cancelarEtapaAtual = null;

// ---------- Barra de forca (etapa 3) e de altura (etapa 4) ----------
// As duas usam o mesmo mecanismo: oscilam sozinhas entre um minimo e um
// maximo; um toque/clique trava o valor atual (estilo "para o ponteiro").
// Nao dependem do game.js.
var FORCA_CICLO_MS = 1750;
var ALTURA_CICLO_MS = 1850;

function criarControleBarraOscilante(idPreenchimento, cicloMs, propriedadeCss) {
  var ativa = false;
  var rafId = 0;
  var valorAtual = 0;
  var inicioTempo = 0;
  return {
    iniciar: function() {
      ativa = true;
      inicioTempo = performance.now();
      var el = document.getElementById(idPreenchimento);
      function quadro(agora) {
        if (!ativa) return;
        var progresso = ((agora - inicioTempo) % cicloMs) / cicloMs;
        // Onda 0..1 comecando subindo a partir do meio, pra nao nascer parada nas pontas.
        valorAtual = (Math.sin(progresso * Math.PI * 2 - Math.PI / 2) + 1) / 2;
        if (el) el.style[propriedadeCss] = (6 + valorAtual * 90) + '%';
        rafId = requestAnimationFrame(quadro);
      }
      rafId = requestAnimationFrame(quadro);
    },
    parar: function() {
      ativa = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      return valorAtual;
    }
  };
}

// Forca preenche na horizontal (largura); altura preenche na vertical
// (altura do preenchimento, de baixo pra cima) — faz mais sentido pra
// crianca associar "barra sobe" com "chute mais alto".
var controleForca = criarControleBarraOscilante('preenchimento-forca', FORCA_CICLO_MS, 'width');
var controleAltura = criarControleBarraOscilante('preenchimento-altura', ALTURA_CICLO_MS, 'height');

function iniciarBarraForca() { controleForca.iniciar(); }
function pararBarraForca() { return controleForca.parar(); }
function iniciarBarraAltura() { controleAltura.iniciar(); }
function pararBarraAltura() { return controleAltura.parar(); }

// URL SEMPRE com pixel-art, nunca outro estilo. Seed muda = rosto muda.
function gerarUrlAvatar(seed) {
  return 'https://api.dicebear.com/9.x/pixel-art/svg?seed=' + encodeURIComponent(seed);
}

function gerarAvatarFallbackLocal(seed) {
  var inicial = (seed || '?').charAt(0).toUpperCase();
  var cores = ['#2E9E5B', '#3AA9D6', '#FFC63B', '#E1493F', '#9B59B6'];
  var cor = cores[seed.length % cores.length];
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="' + cor + '"/><text x="50" y="50" dy="0.35em" text-anchor="middle" font-family="sans-serif" font-size="42" font-weight="600" fill="#FFFDF6">' + inicial + '</text></svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// ---------- Navegacao ----------

var TELA_ANTERIOR = {
  'tela-apelido':    'tela-menu',
  'tela-selecao':    'tela-apelido',
  'tela-dificuldade':'tela-selecao',
  'tela-fases':      'tela-dificuldade',
  'tela-fase1':      'tela-fases',
  'tela-resultado':  'tela-fases'
};

function mostrarTela(idTela) {
  Narracao.cancelar();
  document.querySelectorAll('.tela').forEach(function(t) { t.classList.remove('tela-ativa'); });
  document.getElementById(idTela).classList.add('tela-ativa');
  var logo = document.getElementById('logo-mini');
  var botaoVoltar = document.getElementById('botao-voltar');
  var naTelaPrincipal = idTela === 'tela-menu';
  if (logo) logo.classList.toggle('escondido', naTelaPrincipal);
  if (botaoVoltar) botaoVoltar.classList.toggle('escondido', naTelaPrincipal);

  var botaoOuvir = document.getElementById('botao-ouvir-novamente');
  if (botaoOuvir) botaoOuvir.hidden = (idTela !== 'tela-fase1');
}

function encerrarJogoEmAndamento() {
  pararTimer();
  pararBarraForca();
  pararBarraAltura();
  if (cancelarEtapaAtual) { cancelarEtapaAtual(); cancelarEtapaAtual = null; }
  if (estado.jogoPenalti) { estado.jogoPenalti.destruir(); estado.jogoPenalti = null; }
}

function voltarTelaAnterior() {
  var telaAtual = document.querySelector('.tela.tela-ativa');
  if (!telaAtual) return;
  var anteriorId = TELA_ANTERIOR[telaAtual.id];
  if (!anteriorId) return;
  SFX.clique();
  if (telaAtual.id === 'tela-fase1') encerrarJogoEmAndamento();
  mostrarTela(anteriorId);
}

function sairParaMenu() {
  encerrarJogoEmAndamento();
  mostrarTela('tela-menu');
}

function initNavegacaoTopo() {
  document.getElementById('botao-voltar').addEventListener('click', voltarTelaAnterior);
  document.getElementById('botao-logo').addEventListener('click', function() {
    SFX.clique();
    sairParaMenu();
  });
}

function initMenu() {
  document.getElementById('botao-jogar').addEventListener('click', function() {
    SFX.clique();
    irParaApelido();
  });
}

// ---------- Tela cheia (Fullscreen API, com fallback silencioso) ----------

function elementoTelaCheiaAtual() {
  return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
}

function alternarTelaCheia() {
  SFX.clique();
  var raiz = document.documentElement;
  if (!elementoTelaCheiaAtual()) {
    var pedir = raiz.requestFullscreen || raiz.webkitRequestFullscreen || raiz.msRequestFullscreen;
    if (pedir) pedir.call(raiz);
  } else {
    var sair = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (sair) sair.call(document);
  }
}

function atualizarBotaoTelaCheia() {
  var botao = document.getElementById('botao-tela-cheia');
  if (!botao) return;
  var ativo = !!elementoTelaCheiaAtual();
  botao.textContent = ativo ? '⤢' : '⛶';
  botao.setAttribute('aria-label', ativo ? 'Sair da tela cheia' : 'Entrar em tela cheia');
  botao.setAttribute('aria-pressed', ativo ? 'true' : 'false');
}

function initTelaCheia() {
  var botao = document.getElementById('botao-tela-cheia');
  if (!botao) return;
  var raiz = document.documentElement;
  var suportado = raiz.requestFullscreen || raiz.webkitRequestFullscreen || raiz.msRequestFullscreen;
  if (!suportado) { botao.hidden = true; return; } // navegador sem suporte — some em vez de falhar
  botao.addEventListener('click', alternarTelaCheia);
  ['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'].forEach(function(evento) {
    document.addEventListener(evento, atualizarBotaoTelaCheia);
  });
  atualizarBotaoTelaCheia();
}

// ---------- Apelido: crianca ESCOLHE personagem + animal ----------

function irParaApelido() {
  renderizarListaPersonagens();
  renderizarListaAnimais();
  renderizarAbasAvatar();
  renderizarGradeAvatares();
  atualizarPreviewApelido();
  atualizarPreviewAvatar();
  mostrarTela('tela-apelido');
}

function renderizarListaPersonagens() {
  var container = document.getElementById('lista-personagens');
  container.innerHTML = '';
  PERSONAGENS.forEach(function(p) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip-escolha';
    btn.textContent = p;
    if (estado.personagemEscolhido === p) btn.classList.add('chip-ativo');
    btn.addEventListener('click', function() {
      SFX.clique();
      estado.personagemEscolhido = p;
      container.querySelectorAll('.chip-escolha').forEach(function(c) { c.classList.remove('chip-ativo'); });
      btn.classList.add('chip-ativo');
      atualizarPreviewApelido();
    });
    container.appendChild(btn);
  });
}

function renderizarListaAnimais() {
  var container = document.getElementById('lista-animais');
  container.innerHTML = '';
  ANIMAIS.forEach(function(a) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip-escolha';
    btn.textContent = a;
    if (estado.animalEscolhido === a) btn.classList.add('chip-ativo');
    btn.addEventListener('click', function() {
      SFX.clique();
      estado.animalEscolhido = a;
      container.querySelectorAll('.chip-escolha').forEach(function(c) { c.classList.remove('chip-ativo'); });
      btn.classList.add('chip-ativo');
      atualizarPreviewApelido();
    });
    container.appendChild(btn);
  });
}

function atualizarPreviewApelido() {
  var texto = '';
  if (estado.personagemEscolhido && estado.animalEscolhido) {
    texto = estado.personagemEscolhido + ' ' + estado.animalEscolhido;
  } else if (estado.personagemEscolhido) {
    texto = estado.personagemEscolhido + ' ???';
  } else if (estado.animalEscolhido) {
    texto = '??? ' + estado.animalEscolhido;
  } else {
    texto = 'Escolha acima';
  }
  estado.apelido = (estado.personagemEscolhido && estado.animalEscolhido)
    ? estado.personagemEscolhido + ' ' + estado.animalEscolhido : '';
  document.getElementById('texto-apelido').textContent = texto;

  var botao = document.getElementById('botao-confirmar-apelido');
  botao.disabled = !estado.apelido;
}

// ---------- Avatar ----------

function atualizarPreviewAvatar() {
  var img = document.getElementById('avatar-img');
  var url = gerarUrlAvatar(estado.avatarSeed);
  img.onerror = function() { this.onerror = null; this.src = gerarAvatarFallbackLocal(estado.avatarSeed); };
  img.src = url;
}

function renderizarAbasAvatar() {
  var container = document.getElementById('abas-avatar');
  container.innerHTML = '';
  CATEGORIAS_AVATAR.forEach(function(cat) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'aba-avatar';
    if (cat.id === categoriaAvatarAtiva) btn.classList.add('aba-ativa');
    btn.textContent = cat.nome;
    btn.addEventListener('click', function() {
      SFX.clique();
      categoriaAvatarAtiva = cat.id;
      container.querySelectorAll('.aba-avatar').forEach(function(a) { a.classList.remove('aba-ativa'); });
      btn.classList.add('aba-ativa');
      renderizarGradeAvatares();
    });
    container.appendChild(btn);
  });
}

function renderizarGradeAvatares() {
  var container = document.getElementById('grade-avatares');
  container.innerHTML = '';
  var cat = CATEGORIAS_AVATAR.find(function(c) { return c.id === categoriaAvatarAtiva; });
  if (!cat) return;
  cat.seeds.forEach(function(seed) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'item-avatar';
    if (estado.avatarSeed === seed) btn.classList.add('avatar-selecionado');
    var img = document.createElement('img');
    img.src = gerarUrlAvatar(seed);
    img.alt = seed;
    img.loading = 'lazy';
    img.onerror = function() { this.onerror = null; this.src = gerarAvatarFallbackLocal(seed); };
    btn.appendChild(img);
    btn.addEventListener('click', function() {
      SFX.clique();
      estado.avatarSeed = seed;
      container.querySelectorAll('.item-avatar').forEach(function(i) { i.classList.remove('avatar-selecionado'); });
      btn.classList.add('avatar-selecionado');
      atualizarPreviewAvatar();
    });
    container.appendChild(btn);
  });
}

function initApelido() {
  document.getElementById('botao-confirmar-apelido').addEventListener('click', function() {
    if (!estado.apelido) return;
    SFX.selecionar();
    if (window.FirebaseMathGol && estado.token) {
      window.FirebaseMathGol.salvarPerfil(estado.token, {
        apelido: estado.apelido,
        avatarSeed: estado.avatarSeed
      });
    }
    irParaSelecao();
  });
}

// ---------- Selecao ----------

function irParaSelecao() {
  var grade = document.getElementById('grade-selecoes');
  grade.innerHTML = '';

  var BANDEIRAS_POR_ID = {
    brasil:'br', argentina:'ar', alemanha:'de', franca:'fr', japao:'jp',
    portugal:'pt', espanha:'es', italia:'it', inglaterra:'gb-eng',
    colombia:'co', mexico:'mx', coreia:'kr'
  };

  SELECOES.forEach(function(sel) {
    var codigo = sel.bandeira || BANDEIRAS_POR_ID[sel.id] || '';
    var cartao = document.createElement('button');
    cartao.className = 'cartao';
    cartao.type = 'button';

    var conteudo = '';
    if (codigo) {
      conteudo += '<img class="cartao-bandeira" src="https://flagcdn.com/w80/' + codigo + '.png"';
      conteudo += ' srcset="https://flagcdn.com/w160/' + codigo + '.png 2x"';
      conteudo += ' alt="' + sel.nome + '"';
      conteudo += ' onerror="this.onerror=null;this.src=\'\';">';
    }
    conteudo += '<span class="cartao-titulo">' + sel.nome + '</span>';
    cartao.innerHTML = conteudo;

    cartao.addEventListener('click', function() {
      SFX.clique();
      grade.querySelectorAll('.cartao').forEach(function(c) { c.classList.remove('cartao-selecionado'); });
      cartao.classList.add('cartao-selecionado');
      estado.selecaoId = sel.id;
      document.getElementById('botao-confirmar-selecao').disabled = false;
    });
    grade.appendChild(cartao);
  });
  document.getElementById('botao-confirmar-selecao').disabled = true;
  mostrarTela('tela-selecao');
}

function initSelecao() {
  document.getElementById('botao-confirmar-selecao').addEventListener('click', function() {
    SFX.selecionar();
    irParaDificuldade();
  });
}

// ---------- Dificuldade ----------

function irParaDificuldade() {
  var grade = document.getElementById('grade-dificuldades');
  grade.innerHTML = '';
  DIFICULDADES.forEach(function(dif) {
    var cartao = document.createElement('button');
    cartao.className = 'cartao';
    cartao.type = 'button';
    cartao.innerHTML = '<span class="cartao-icone-dificuldade">' + dif.icone + '</span><span class="cartao-titulo">' + dif.nome + '</span><span class="cartao-descricao">' + dif.descricao + '</span>';
    cartao.addEventListener('click', function() {
      SFX.clique();
      grade.querySelectorAll('.cartao').forEach(function(c) { c.classList.remove('cartao-selecionado'); });
      cartao.classList.add('cartao-selecionado');
      estado.dificuldadeId = dif.id;
      document.getElementById('botao-confirmar-dificuldade').disabled = false;
    });
    grade.appendChild(cartao);
  });
  document.getElementById('botao-confirmar-dificuldade').disabled = true;
  mostrarTela('tela-dificuldade');
}

function initDificuldade() {
  document.getElementById('botao-confirmar-dificuldade').addEventListener('click', function() {
    SFX.selecionar();
    irParaFases();
  });
}

// ---------- Tela de Fases ----------

function irParaFases() {
  var grade = document.getElementById('grade-fases');
  grade.innerHTML = '';

  var fases = Progressao.obterFases();
  fases.forEach(function(fase) {
    var desbloqueada = Progressao.faseDesbloqueada(fase.id);
    var cartao = document.createElement('button');
    cartao.className = 'cartao cartao-fase';
    cartao.type = 'button';
    if (!desbloqueada) cartao.classList.add('cartao-bloqueado');

    var melhorPts = Progressao.melhorPontuacao(fase.id);
    var melhorG = Progressao.melhorGols(fase.id);
    var estrelas = '';
    if (melhorG > 0) {
      for (var i = 0; i < Math.min(melhorG, fase.cobrancas); i++) estrelas += '⭐';
    }

    var conteudo = '<span class="cartao-icone-dificuldade">' + (desbloqueada ? fase.icone : '🔒') + '</span>';
    conteudo += '<span class="cartao-titulo">' + fase.nome + '</span>';
    conteudo += '<span class="cartao-descricao">' + (desbloqueada ? fase.descricao : 'Complete a fase anterior!') + '</span>';
    if (estrelas) conteudo += '<span class="cartao-estrelas">' + estrelas + '</span>';
    if (melhorPts > 0) conteudo += '<span class="cartao-descricao">Recorde: ' + melhorPts + ' <img class="icone-cruzeiro" src="../Imagens/estrela-cruzeiro.png" alt="">Cruzeiro</span>';
    cartao.innerHTML = conteudo;

    cartao.addEventListener('click', function() {
      if (!desbloqueada) return;
      SFX.selecionar();
      grade.querySelectorAll('.cartao').forEach(function(c) { c.classList.remove('cartao-selecionado'); });
      cartao.classList.add('cartao-selecionado');
      estado.faseAtual = fase.id;
      document.getElementById('botao-confirmar-fase').disabled = false;
    });
    grade.appendChild(cartao);
  });
  document.getElementById('botao-confirmar-fase').disabled = true;
  mostrarTela('tela-fases');
}

function initFases() {
  document.getElementById('botao-confirmar-fase').addEventListener('click', function() {
    SFX.selecionar();
    iniciarFase1();
  });
}

// ---------- Fase 1: timer + pontuacao por velocidade ----------

function iniciarFase1() {
  var fase = Progressao.obterFase(estado.faseAtual);
  TOTAL_COBRANCAS = fase.cobrancas;
  TIMER_MAX = fase.timerMax;

  estado.cobrancaAtual = 0;
  estado.gols = 0;
  estado.pontuacao = 0;
  estado.resultadosCobrancas = [];
  estado.cobrancaFinalizada = false;
  cancelarEtapaAtual = null;

  BancoQuestoes.resetarSessao();

  var tituloFase = document.getElementById('titulo-fase');
  if (tituloFase) tituloFase.textContent = fase.icone + ' ' + fase.nome;

  mostrarTela('tela-fase1');
  atualizarBolinhasProgresso();

  if (estado.jogoPenalti) { estado.jogoPenalti.destruir(); estado.jogoPenalti = null; }
  document.getElementById('jogo-penalti').innerHTML = '';

  try {
    if (typeof THREE === 'undefined') throw new Error('Three.js nao carregou');
    estado.jogoPenalti = criarJogoPenalti('jogo-penalti', estado.selecaoId);
  } catch (e) {
    console.warn('Cena 3D indisponivel:', e);
    estado.jogoPenalti = null;
  }

  SFX.apito();
  carregarProximaPergunta();
}

function atualizarBolinhasProgresso() {
  var container = document.getElementById('cabecalho-fase');
  container.innerHTML = '';
  for (var i = 0; i < TOTAL_COBRANCAS; i++) {
    var b = document.createElement('span');
    b.className = 'bolinha-cobranca';
    if (i < estado.resultadosCobrancas.length) {
      var res = estado.resultadosCobrancas[i].resultado;
      b.classList.add(res === 'gol' ? 'acerto' : (res === 'fora' ? 'fora' : 'erro'));
    } else if (i === estado.cobrancaAtual) {
      b.classList.add('atual');
    }
    container.appendChild(b);
  }
}

function iniciarTimer() {
  estado.timerSegundos = TIMER_MAX;
  estado.timerInicio = Date.now();
  atualizarDisplayTimer();
  pararTimer();
  estado.timerInterval = setInterval(function() {
    var decorrido = Math.floor((Date.now() - estado.timerInicio) / 1000);
    estado.timerSegundos = Math.max(0, TIMER_MAX - decorrido);
    atualizarDisplayTimer();

    if (estado.timerSegundos > 0 && estado.timerSegundos <= 4) {
      SFX.timerAlerta();
    }

    if (estado.timerSegundos <= 0) {
      pararTimer();
      tempoEsgotado();
    }
  }, 200);
}

function pararTimer() {
  if (estado.timerInterval) { clearInterval(estado.timerInterval); estado.timerInterval = null; }
}

function atualizarDisplayTimer() {
  var el = document.getElementById('timer-display');
  if (!el) return;
  el.textContent = estado.timerSegundos + 's';
  el.classList.remove('timer-verde', 'timer-amarelo', 'timer-vermelho');
  if (estado.timerSegundos > 8) el.classList.add('timer-verde');
  else if (estado.timerSegundos > 4) el.classList.add('timer-amarelo');
  else el.classList.add('timer-vermelho');
}

// Pontuacao SEMPRE pelo tempo de resposta da conta — capturado no instante
// do clique (ou do estouro do timer), nunca recalculado depois. O tempo
// gasto em mira/forca/altura e na animacao do chute NAO entra nessa conta.
function calcularPontosPorVelocidade(tempoUsadoSegundos) {
  var pontos = Math.max(10, Math.round(100 * (1 - tempoUsadoSegundos / TIMER_MAX)));
  return pontos;
}

// Tempo esgotado = mesmo tratamento de resposta errada de sempre: defesa
// imediata (zona "meio"), sem passar por mira/forca.
function tempoEsgotado() {
  if (estado.cobrancaFinalizada) return;
  estado.cobrancaFinalizada = true;

  SFX.tempoEsgotado();
  document.querySelectorAll('.botao-resposta').forEach(function(b) { b.disabled = true; });
  document.getElementById('mensagem-feedback').textContent = 'Tempo esgotado!';
  var tempoUsadoMs = TIMER_MAX * 1000;
  if (estado.jogoPenalti) {
    estado.jogoPenalti.chutar('meio', false, function() {
      finalizarCobranca({ foiGol: false, zonaEscolhida: null, estourouTempo: true, tempoUsadoMs: tempoUsadoMs });
    });
  } else {
    setTimeout(function() {
      finalizarCobranca({ foiGol: false, zonaEscolhida: null, estourouTempo: true, tempoUsadoMs: tempoUsadoMs });
    }, 500);
  }
}

// ---------- Etapas visuais da cobranca (mostrar/esconder cada bloco) ----------

function mostrarEtapaRespostas() {
  document.getElementById('area-respostas').hidden = false;
  document.getElementById('mensagem-etapa').hidden = true;
  document.getElementById('camada-mira').hidden = true;
  document.getElementById('bloco-forca').hidden = true;
  document.getElementById('bloco-altura').hidden = true;
}

function esconderEtapaRespostas() {
  document.getElementById('area-respostas').hidden = true;
}

function carregarProximaPergunta() {
  estado.cobrancaFinalizada = false;

  var dificuldadeEfetiva = Progressao.dificuldadeEfetiva(estado.dificuldadeId, estado.faseAtual);
  estado.perguntaAtual = BancoQuestoes.sortearPergunta(dificuldadeEfetiva);
  document.getElementById('mensagem-feedback').textContent = '';
  document.getElementById('pergunta-texto').textContent = estado.perguntaAtual.texto;
  mostrarEtapaRespostas();

  estado.zonaCorreta = null;
  var container = document.getElementById('respostas-alternativas');
  container.innerHTML = '';
  ORDEM_ZONAS.forEach(function(zonaId, indice) {
    var alt = estado.perguntaAtual.alternativas[indice];
    var botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'botao-resposta';
    botao.setAttribute('data-zona', zonaId);
    botao.textContent = alt.valor;
    botao.addEventListener('click', function() { responderAlternativa(botao); });
    container.appendChild(botao);
    if (alt.correta) estado.zonaCorreta = zonaId;
  });

  Narracao.falar(estado.perguntaAtual.textoFalado);
  iniciarTimer();
}

function initFase1() {
  // Delegacao removida: cada botao de resposta agora ganha seu proprio
  // listener quando e criado em carregarProximaPergunta() (os botoes nao
  // ficam mais sobre o canvas, entao nao ha mais um container fixo
  // #zonas-gol pra delegar clique).
  var botaoOuvir = document.getElementById('botao-ouvir-novamente');
  if (botaoOuvir) {
    botaoOuvir.addEventListener('click', function() {
      if (estado.perguntaAtual) Narracao.falar(estado.perguntaAtual.textoFalado);
    });
  }
}

// Etapa 1 -> resposta escolhida.
// Correta: avanca pra mira (etapa 2). Errada: mantem o comportamento
// antigo — defesa imediata na zona da alternativa clicada, sem mira.
function responderAlternativa(botaoClicado) {
  if (estado.cobrancaFinalizada) return;

  var tempoUsadoMs = Date.now() - estado.timerInicio;
  pararTimer();
  var zonaId = botaoClicado.getAttribute('data-zona');
  var acertou = zonaId === estado.zonaCorreta;

  document.querySelectorAll('.botao-resposta').forEach(function(b) { b.disabled = true; });
  botaoClicado.classList.add(acertou ? 'acertou' : 'errou');
  botaoClicado.setAttribute('aria-label', (acertou ? 'Acertou! Resposta ' : 'Errou. Resposta ') + botaoClicado.textContent);

  if (acertou) {
    SFX.selecionar();
    document.getElementById('mensagem-feedback').textContent = '✓ Resposta correta!';
    setTimeout(function() { avancarParaMira(tempoUsadoMs); }, 500);
    return;
  }

  estado.cobrancaFinalizada = true;
  document.getElementById('mensagem-feedback').textContent = '✗ Resposta errada!';
  if (estado.jogoPenalti) {
    estado.jogoPenalti.chutar(zonaId, false, function() {
      finalizarCobranca({ foiGol: false, zonaEscolhida: zonaId, estourouTempo: false, tempoUsadoMs: tempoUsadoMs });
    });
  } else {
    setTimeout(function() {
      finalizarCobranca({ foiGol: false, zonaEscolhida: zonaId, estourouTempo: false, tempoUsadoMs: tempoUsadoMs });
    }, 500);
  }
}

// Etapa 2: mira livre dentro do gol (mouse/toque). Um toque na area do
// jogo trava o alvo atual e avanca pra forca.
function avancarParaMira(tempoUsadoMs) {
  esconderEtapaRespostas();
  var msg = document.getElementById('mensagem-etapa');
  msg.hidden = false;
  msg.textContent = 'Escolha onde chutar! 🎯';

  var containerJogo = document.getElementById('jogo-penalti');

  // Sem cena 3D (WebGL indisponivel): pula mira/forca, mas mantem o jogo
  // jogavel — resposta correta = gol direto, igual ao comportamento do
  // fallback ja existente pra chute normal.
  if (!estado.jogoPenalti) {
    msg.hidden = true;
    setTimeout(function() {
      finalizarCobranca({ foiGol: true, zonaEscolhida: null, estourouTempo: false, tempoUsadoMs: tempoUsadoMs });
    }, 400);
    return;
  }

  var camada = document.getElementById('camada-mira');
  camada.hidden = false;
  var alvo = document.getElementById('alvo-mira');

  estado.jogoPenalti.iniciarMira(function(pos) {
    alvo.style.left = pos.leftPercent + '%';
    alvo.style.top = pos.topPercent + '%';
  });

  function aoConfirmarMira() {
    containerJogo.removeEventListener('click', aoConfirmarMira);
    containerJogo.removeEventListener('touchend', aoConfirmarMira);
    cancelarEtapaAtual = null;
    var ponto = estado.jogoPenalti.pararMira();
    camada.hidden = true;
    avancarParaForca(ponto, tempoUsadoMs);
  }
  containerJogo.addEventListener('click', aoConfirmarMira);
  containerJogo.addEventListener('touchend', aoConfirmarMira);
  cancelarEtapaAtual = function() {
    containerJogo.removeEventListener('click', aoConfirmarMira);
    containerJogo.removeEventListener('touchend', aoConfirmarMira);
  };
}

// Etapa 3: barra de forca oscilante. Um toque trava o valor e avanca pra
// etapa de altura.
function avancarParaForca(pontoMira, tempoUsadoMs) {
  var msg = document.getElementById('mensagem-etapa');
  msg.textContent = 'Escolha a força do chute! 💪';
  var bloco = document.getElementById('bloco-forca');
  bloco.hidden = false;
  iniciarBarraForca();

  var containerJogo = document.getElementById('jogo-penalti');
  function aoConfirmarForca() {
    containerJogo.removeEventListener('click', aoConfirmarForca);
    containerJogo.removeEventListener('touchend', aoConfirmarForca);
    cancelarEtapaAtual = null;
    var forca = pararBarraForca();
    bloco.hidden = true;
    SFX.clique();
    avancarParaAltura(pontoMira, forca, tempoUsadoMs);
  }
  containerJogo.addEventListener('click', aoConfirmarForca);
  containerJogo.addEventListener('touchend', aoConfirmarForca);
  cancelarEtapaAtual = function() {
    containerJogo.removeEventListener('click', aoConfirmarForca);
    containerJogo.removeEventListener('touchend', aoConfirmarForca);
    pararBarraForca();
  };
}

// Etapa 4: barra de altura oscilante (mesmo mecanismo da forca). 0 =
// rasteiro, 1 = cavadinha — so muda o arco/velocidade visual do chute em
// game.js, nao interfere no calculo de gol/fora (ja decidido por mira +
// forca). Um toque trava o valor e dispara o chute.
function avancarParaAltura(pontoMira, forca, tempoUsadoMs) {
  var msg = document.getElementById('mensagem-etapa');
  msg.textContent = 'Rasteiro ou no alto? Escolha a altura! ⬆️⬇️';
  var bloco = document.getElementById('bloco-altura');
  bloco.hidden = false;
  iniciarBarraAltura();

  var containerJogo = document.getElementById('jogo-penalti');
  function aoConfirmarAltura() {
    containerJogo.removeEventListener('click', aoConfirmarAltura);
    containerJogo.removeEventListener('touchend', aoConfirmarAltura);
    cancelarEtapaAtual = null;
    var altura = pararBarraAltura();
    bloco.hidden = true;
    msg.hidden = true;
    SFX.clique();

    estado.jogoPenalti.chutarLivre(pontoMira, forca, altura, function(r) {
      finalizarCobranca({
        foiGol: !!r.gol,
        foiFora: !!r.fora,
        zonaEscolhida: null,
        estourouTempo: false,
        tempoUsadoMs: tempoUsadoMs
      });
    });
  }
  containerJogo.addEventListener('click', aoConfirmarAltura);
  containerJogo.addEventListener('touchend', aoConfirmarAltura);
  cancelarEtapaAtual = function() {
    containerJogo.removeEventListener('click', aoConfirmarAltura);
    containerJogo.removeEventListener('touchend', aoConfirmarAltura);
    pararBarraAltura();
  };
}

// HU-07: registra cada cobranca como um objeto estruturado. resultado
// agora pode ser 'gol' | 'defesa' | 'fora'.
function finalizarCobranca(detalhes) {
  var tempoUsadoSegundos = Math.min(TIMER_MAX, Math.max(0, Math.round((detalhes.tempoUsadoMs || 0) / 1000)));
  var pontosGanhos = 0;

  if (detalhes.foiGol) {
    SFX.gol();
    pontosGanhos = calcularPontosPorVelocidade(tempoUsadoSegundos);
    estado.gols++;
    estado.pontuacao += pontosGanhos;
    document.getElementById('mensagem-feedback').innerHTML = 'GOOOL! +' + pontosGanhos + ' <img class="icone-cruzeiro" src="../Imagens/estrela-cruzeiro.png" alt="">Cruzeiro!';
    Narracao.falar('Gol!');
  } else if (detalhes.foiFora) {
    // Reaproveita o som existente de "sem gol" — nao criar SFX novo.
    SFX.defesa();
    document.getElementById('mensagem-feedback').textContent = 'Pra fora! ❌';
    Narracao.falar('Pra fora!');
  } else {
    SFX.defesa();
    if (document.getElementById('mensagem-feedback').textContent !== 'Tempo esgotado!') {
      document.getElementById('mensagem-feedback').textContent = 'O goleiro defendeu!';
    }
    Narracao.falar(detalhes.estourouTempo ? 'Tempo esgotado! O goleiro defendeu.' : 'O goleiro defendeu!');
  }

  estado.resultadosCobrancas.push({
    zonaEscolhida: detalhes.zonaEscolhida,
    zonaCorreta: estado.zonaCorreta,
    resultado: detalhes.foiGol ? 'gol' : (detalhes.foiFora ? 'fora' : 'defesa'),
    estourouTempo: !!detalhes.estourouTempo,
    pontos: pontosGanhos,
    tempoUsado: tempoUsadoSegundos
  });

  estado.cobrancaAtual++;
  atualizarBolinhasProgresso();
  atualizarDisplayPontuacao();

  setTimeout(function() {
    if (estado.cobrancaAtual >= TOTAL_COBRANCAS) { irParaResultado(); }
    else { carregarProximaPergunta(); }
  }, PAUSA_ENTRE_COBRANCAS);
}

function atualizarDisplayPontuacao() {
  var el = document.getElementById('pontuacao-display');
  if (el) el.innerHTML = estado.pontuacao + ' <img class="icone-cruzeiro" src="../Imagens/estrela-cruzeiro.png" alt="estrelinhas Cruzeiro">';
}

// ---------- Resultado ----------

// HU-07: monta o resumo de cada cobranca (zona escolhida + resultado) de
// forma compreensivel pra crianca e acessivel por texto — nunca so por
// cor. resultado 'fora' ganha seu proprio icone/estilo (nem acerto nem
// defesa do goleiro).
function renderizarListaCobrancas() {
  var lista = document.getElementById('lista-cobrancas');
  if (!lista) return;
  lista.textContent = '';

  estado.resultadosCobrancas.forEach(function(cobranca, indice) {
    var item = document.createElement('li');
    var classeResultado = cobranca.resultado === 'gol' ? 'item-cobranca-gol'
      : (cobranca.resultado === 'fora' ? 'item-cobranca-fora' : 'item-cobranca-defesa');
    item.className = 'item-cobranca ' + classeResultado;

    var icone = document.createElement('span');
    icone.className = 'item-cobranca-icone';
    icone.setAttribute('aria-hidden', 'true');
    icone.textContent = cobranca.resultado === 'gol' ? '✓' : (cobranca.resultado === 'fora' ? '➤' : '✗');
    item.appendChild(icone);

    var zonaTexto = cobranca.zonaEscolhida ? (ROTULO_ZONA[cobranca.zonaEscolhida] || cobranca.zonaEscolhida) : null;
    var resultadoTexto = cobranca.resultado === 'gol' ? 'gol' : (cobranca.resultado === 'fora' ? 'chute para fora' : 'defesa');
    var textoCompleto = 'Cobrança ' + (indice + 1) + ' — ' + resultadoTexto;
    if (zonaTexto) textoCompleto = 'Cobrança ' + (indice + 1) + ' — ' + zonaTexto + ' — ' + resultadoTexto;
    if (cobranca.estourouTempo) textoCompleto += ' (tempo esgotado)';

    var texto = document.createElement('span');
    texto.className = 'item-cobranca-texto';
    texto.textContent = textoCompleto;
    item.appendChild(texto);

    lista.appendChild(item);
  });
}

function irParaResultado() {
  pararTimer();
  pararBarraForca();
  if (estado.jogoPenalti) { estado.jogoPenalti.destruir(); estado.jogoPenalti = null; }

  var resultadoProgressao = Progressao.registrarResultado(estado.faseAtual, estado.gols, estado.pontuacao);

  document.getElementById('placar-final').textContent = estado.gols + ' / ' + TOTAL_COBRANCAS;
  document.getElementById('pontuacao-final').innerHTML = estado.pontuacao + ' <img class="icone-cruzeiro" src="../Imagens/estrela-cruzeiro.png" alt="">Cruzeiro';

  var mensagem = sortearMensagemResultado(estado.gols);
  document.getElementById('resumo-resultado').textContent = mensagem;

  renderizarListaCobrancas();

  var elDesbloqueio = document.getElementById('mensagem-desbloqueio');
  if (elDesbloqueio) {
    if (resultadoProgressao.desbloqueou && resultadoProgressao.proximaFase) {
      var faseNova = Progressao.obterFase(resultadoProgressao.proximaFase);
      elDesbloqueio.textContent = '🔓 Fase "' + faseNova.nome + '" desbloqueada!';
      elDesbloqueio.classList.add('visivel');
      SFX.faseLiberada();
    } else {
      elDesbloqueio.textContent = '';
      elDesbloqueio.classList.remove('visivel');
      SFX.faseCompleta();
    }
  } else {
    SFX.faseCompleta();
  }

  try {
    localStorage.setItem('mathgol_ultimo_resultado', JSON.stringify({
      versao: VERSAO_ULTIMO_RESULTADO,
      dados: {
        apelido: estado.apelido, selecaoId: estado.selecaoId,
        dificuldadeId: estado.dificuldadeId, faseId: estado.faseAtual,
        gols: estado.gols, pontuacao: estado.pontuacao,
        cobrancas: estado.resultadosCobrancas,
        data: new Date().toISOString()
      }
    }));
  } catch (e) {}

  if (window.FirebaseMathGol && estado.token) {
    window.FirebaseMathGol.salvarProgresso(estado.token, {
      apelido: estado.apelido, selecaoId: estado.selecaoId,
      dificuldadeId: estado.dificuldadeId, faseId: estado.faseAtual,
      gols: estado.gols, pontuacao: estado.pontuacao
    });
  }

  Narracao.falar(mensagem);
  mostrarTela('tela-resultado');
}

function initResultado() {
  document.getElementById('botao-voltar-menu').addEventListener('click', function() {
    SFX.clique();
    sairParaMenu();
  });
  var botaoProxFase = document.getElementById('botao-proxima-fase');
  if (botaoProxFase) {
    botaoProxFase.addEventListener('click', function() {
      SFX.selecionar();
      irParaFases();
    });
  }
}

// ---------- Acessibilidade ----------

function carregarPreferenciasAcessibilidade() {
  var prefs = {};
  try { prefs = JSON.parse(localStorage.getItem('mathgol_acessibilidade') || '{}'); } catch(e) {}
  document.body.classList.toggle('alto-contraste', !!prefs.altoContraste);
  document.body.classList.toggle('espaco-dislexia', !!prefs.espacoDislexia);
  Narracao.alternar(prefs.narracaoAtiva !== undefined ? prefs.narracaoAtiva : true);
  SFX.alternar(prefs.sfxAtivo !== undefined ? prefs.sfxAtivo : true);
  document.getElementById('opcao-alto-contraste').checked = !!prefs.altoContraste;
  document.getElementById('opcao-espaco-dislexia').checked = !!prefs.espacoDislexia;
  document.getElementById('opcao-narracao').checked = prefs.narracaoAtiva !== false;
  var opcaoSfx = document.getElementById('opcao-sfx');
  if (opcaoSfx) opcaoSfx.checked = prefs.sfxAtivo !== false;
}

function salvarPreferenciasAcessibilidade() {
  var opcaoSfx = document.getElementById('opcao-sfx');
  var prefs = {
    altoContraste: document.getElementById('opcao-alto-contraste').checked,
    espacoDislexia: document.getElementById('opcao-espaco-dislexia').checked,
    narracaoAtiva: document.getElementById('opcao-narracao').checked,
    sfxAtivo: opcaoSfx ? opcaoSfx.checked : true
  };
  try { localStorage.setItem('mathgol_acessibilidade', JSON.stringify(prefs)); } catch(e) {}
  document.body.classList.toggle('alto-contraste', prefs.altoContraste);
  document.body.classList.toggle('espaco-dislexia', prefs.espacoDislexia);
  Narracao.alternar(prefs.narracaoAtiva);
  SFX.alternar(prefs.sfxAtivo);
}

function initAcessibilidade() {
  var sobreposicao = document.getElementById('sobreposicao-acessibilidade');
  document.getElementById('botao-acessibilidade').addEventListener('click', function() { sobreposicao.classList.add('aberta'); });
  document.getElementById('botao-fechar-acessibilidade').addEventListener('click', function() { sobreposicao.classList.remove('aberta'); });
  sobreposicao.addEventListener('click', function(ev) { if (ev.target === sobreposicao) sobreposicao.classList.remove('aberta'); });
  ['opcao-alto-contraste', 'opcao-espaco-dislexia', 'opcao-narracao', 'opcao-sfx'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', salvarPreferenciasAcessibilidade);
  });
  carregarPreferenciasAcessibilidade();
}

// ---------- Creditos ----------

function initCreditos() {
  var sobreposicao = document.getElementById('sobreposicao-creditos');
  var botaoAbrir = document.getElementById('botao-creditos');
  var botaoFechar = document.getElementById('botao-fechar-creditos');

  if (botaoAbrir) {
    botaoAbrir.addEventListener('click', function() {
      SFX.clique();
      sobreposicao.classList.add('aberta');
    });
  }
  if (botaoFechar) {
    botaoFechar.addEventListener('click', function() {
      SFX.clique();
      sobreposicao.classList.remove('aberta');
    });
  }
  sobreposicao.addEventListener('click', function(ev) {
    if (ev.target === sobreposicao) sobreposicao.classList.remove('aberta');
  });

  var botoesSobre = sobreposicao.querySelectorAll('.botao-sobre-mim');
  botoesSobre.forEach(function(botao) {
    botao.addEventListener('click', function() {
      SFX.clique();
      var bio = document.getElementById(botao.getAttribute('aria-controls'));
      var vaiAbrir = botao.getAttribute('aria-expanded') !== 'true';

      botoesSobre.forEach(function(outro) {
        var outraBio = document.getElementById(outro.getAttribute('aria-controls'));
        outro.setAttribute('aria-expanded', 'false');
        if (outraBio) outraBio.hidden = true;
        var card = outro.closest('.dev-card');
        if (card) card.classList.remove('aberto');
      });

      if (vaiAbrir) {
        botao.setAttribute('aria-expanded', 'true');
        if (bio) bio.hidden = false;
        var cardAtual = botao.closest('.dev-card');
        if (cardAtual) {
          cardAtual.classList.add('aberto');
          setTimeout(function() {
            cardAtual.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 60);
        }
      }
    });
  });

  function recolherBios() {
    botoesSobre.forEach(function(botao) {
      var bio = document.getElementById(botao.getAttribute('aria-controls'));
      botao.setAttribute('aria-expanded', 'false');
      if (bio) bio.hidden = true;
      var card = botao.closest('.dev-card');
      if (card) card.classList.remove('aberto');
    });
  }
  if (botaoFechar) botaoFechar.addEventListener('click', recolherBios);
  sobreposicao.addEventListener('click', function(ev) {
    if (ev.target === sobreposicao) recolherBios();
  });
}

// ---------- Backup ----------

function baixarJSON(dados, nomeArquivo) {
  var blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function mostrarStatusBackup(texto, erro) {
  var el = document.getElementById('backup-status');
  if (!el) return;
  el.textContent = texto;
  el.classList.toggle('erro', !!erro);
  setTimeout(function() { el.textContent = ''; }, 5000);
}

function exportarProgressoLocal() {
  var backup = {
    versao: 1,
    tipo: 'mathgol-backup-local',
    exportadoEm: new Date().toISOString(),
    dados: {}
  };

  try {
    var chaves = ['mathgol_token', 'mathgol_acessibilidade', 'mathgol_ultimo_resultado',
                  'mathgol_progresso', 'mathgol_fases_desbloqueadas'];
    for (var i = 0; i < chaves.length; i++) {
      var valor = localStorage.getItem(chaves[i]);
      if (valor !== null) {
        backup.dados[chaves[i]] = valor;
      }
    }
    for (var j = 0; j < localStorage.length; j++) {
      var chave = localStorage.key(j);
      if (chave && chave.indexOf('mathgol_') === 0 && !backup.dados[chave]) {
        backup.dados[chave] = localStorage.getItem(chave);
      }
    }
  } catch (e) {
    console.warn('Erro ao ler localStorage:', e);
  }

  var dataStr = new Date().toISOString().slice(0, 10);
  baixarJSON(backup, 'mathgol-backup-local-' + dataStr + '.json');
  mostrarStatusBackup('✅ Backup local exportado com sucesso!');
}

function initBackup() {
  var sobreposicao = document.getElementById('sobreposicao-backup');
  var botaoAbrir = document.getElementById('botao-backup');
  var botaoFechar = document.getElementById('botao-fechar-backup');
  var botaoLocal = document.getElementById('botao-backup-local');
  var botaoFirebase = document.getElementById('botao-backup-firebase');
  var botaoRestaurar = document.getElementById('botao-restaurar-backup');
  var inputRestaurar = document.getElementById('input-restaurar');

  if (botaoAbrir) {
    botaoAbrir.addEventListener('click', function() {
      SFX.clique();
      sobreposicao.classList.add('aberta');
    });
  }
  if (botaoFechar) {
    botaoFechar.addEventListener('click', function() {
      SFX.clique();
      sobreposicao.classList.remove('aberta');
    });
  }
  sobreposicao.addEventListener('click', function(ev) {
    if (ev.target === sobreposicao) sobreposicao.classList.remove('aberta');
  });

  if (botaoLocal) {
    botaoLocal.addEventListener('click', function() {
      SFX.selecionar();
      exportarProgressoLocal();
    });
  }

  if (botaoFirebase) {
    botaoFirebase.addEventListener('click', function() {
      SFX.selecionar();
      if (!window.FirebaseMathGol || !estado.token) {
        mostrarStatusBackup('⚠️ Firebase não disponível.', true);
        return;
      }
      mostrarStatusBackup('⏳ Exportando dados do Firebase...');
      window.FirebaseMathGol.exportarDadosFirebase(estado.token).then(function(dados) {
        var dataStr = new Date().toISOString().slice(0, 10);
        baixarJSON(dados, 'mathgol-backup-firebase-' + dataStr + '.json');
        mostrarStatusBackup('✅ Backup do Firebase exportado!');
      }).catch(function(erro) {
        mostrarStatusBackup('❌ Erro ao exportar: ' + erro.message, true);
      });
    });
  }

  if (botaoRestaurar) {
    botaoRestaurar.addEventListener('click', function() {
      SFX.clique();
      inputRestaurar.click();
    });
  }

  if (inputRestaurar) {
    inputRestaurar.addEventListener('change', function(ev) {
      var arquivo = ev.target.files[0];
      if (!arquivo) return;

      var leitor = new FileReader();
      leitor.onload = function(e) {
        try {
          var dados = JSON.parse(e.target.result);

          if (dados.tipo === 'mathgol-backup-local') {
            var chaves = Object.keys(dados.dados || {});
            for (var i = 0; i < chaves.length; i++) {
              try { localStorage.setItem(chaves[i], dados.dados[chaves[i]]); } catch(err) {}
            }
            mostrarStatusBackup('✅ Backup local restaurado! Recarregando...');
            setTimeout(function() { location.reload(); }, 1500);

          } else if (dados.tipo === 'mathgol-backup-firebase') {
            if (!window.FirebaseMathGol || !estado.token) {
              mostrarStatusBackup('⚠️ Firebase não disponível.', true);
              return;
            }
            mostrarStatusBackup('⏳ Restaurando dados no Firebase...');
            window.FirebaseMathGol.restaurarDadosFirebase(estado.token, dados).then(function() {
              mostrarStatusBackup('✅ Backup do Firebase restaurado!');
            }).catch(function(erro) {
              mostrarStatusBackup('❌ Erro ao restaurar: ' + erro.message, true);
            });

          } else {
            mostrarStatusBackup('❌ Arquivo de backup não reconhecido.', true);
          }
        } catch (erro) {
          mostrarStatusBackup('❌ Arquivo inválido: ' + erro.message, true);
        }
        inputRestaurar.value = '';
      };
      leitor.readAsText(arquivo);
    });
  }
}

// ---------- Init ----------

document.addEventListener('DOMContentLoaded', function() {
  initAcessibilidade();
  initNavegacaoTopo();
  initTelaCheia();
  initMenu();
  initApelido();
  initSelecao();
  initDificuldade();
  initFases();
  initFase1();
  initResultado();
  initCreditos();
  initBackup();
  mostrarTela('tela-menu');

  if (window.FirebaseMathGol) {
    window.FirebaseMathGol.obterOuCriarToken().then(function(t) { estado.token = t; });
    window.FirebaseMathGol.carregarConfiguracoes().then(function(config) {
      aplicarConfiguracoesRemotas(config);
    });
  }
});
