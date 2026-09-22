// main.js - orquestra navegacao, timer de chute, pontuacao por velocidade.
// Apelido TRAVADO: crianca escolhe 1 personagem + 1 animal (sem digitar).
// v2: + efeitos sonoros (sfx.js), banco de questoes (banco-questoes.js),
//       sistema de progressao entre fases (progressao.js).
// v3: + acessibilidade revisada (HU-08), persistencia estruturada e
//       versionada do resultado (HU-07) e bloqueio anti-clique-residual
//       na fase de penalti.

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
  // HU-07: cada cobranca agora fica registrada como objeto estruturado
  // (zona escolhida, zona correta, resultado, se estourou o tempo, pontos
  // e tempo usado), nao mais como string solta ("gol"/"defesa").
  resultadosCobrancas: [],
  perguntaAtual: null,
  zonaCorreta: null,
  jogoPenalti: null,
  token: null,
  timerInicio: 0,
  timerInterval: null,
  timerSegundos: 15,
  // Trava para garantir que cada cobranca finalize exatamente uma vez,
  // mesmo se o tempo esgotar bem no instante de um clique (secao 5 do
  // documento de melhorias).
  cobrancaFinalizada: false
};

var TOTAL_COBRANCAS = 3;
var TIMER_MAX = 15;

// Tempo que o resultado ("GOOOL!" / "O goleiro defendeu!") fica na tela
// antes de carregar a proxima pergunta. Acompanha o ritmo mais lento da
// animacao do penalti (ver TEMPO em game.js): tem que ser maior que
// TEMPO.ANTES_DE_RESETAR pra bola ja estar de volta na marca.
var PAUSA_ENTRE_COBRANCAS = 2200;
var categoriaAvatarAtiva = CATEGORIAS_AVATAR[0].id;

// Rotulos amigaveis das zonas do gol, usados no resumo de cobrancas da
// tela de resultado (HU-07) e em mensagens acessiveis por texto.
var ROTULO_ZONA = {
  'topo-esquerda': 'canto superior esquerdo',
  'topo-direita': 'canto superior direito',
  'meio': 'meio do gol',
  'baixo-esquerda': 'canto inferior esquerdo',
  'baixo-direita': 'canto inferior direito'
};

// Schema versionado do ultimo resultado salvo (HU-07): tolera dados
// antigos/corrompidos sem quebrar a leitura futura desse registro.
var VERSAO_ULTIMO_RESULTADO = 1;

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

// Mapa de "tela anterior" pra cada tela — usado pelo botao de voltar (←).
// tela-fase1 volta pra escolha de fase (abandona a cobranca atual).
// tela-resultado tambem volta pra escolha de fase, junto com os botoes
// dedicados que ja existem la (Escolher fase / Voltar ao menu).
var TELA_ANTERIOR = {
  'tela-apelido':    'tela-menu',
  'tela-selecao':    'tela-apelido',
  'tela-dificuldade':'tela-selecao',
  'tela-fases':      'tela-dificuldade',
  'tela-fase1':      'tela-fases',
  'tela-resultado':  'tela-fases'
};

function mostrarTela(idTela) {
  // Cancela qualquer fala pendente/em andamento ao trocar de tela — evita
  // narracao de uma tela "vazando" para a proxima (secao 1, Narracao).
  Narracao.cancelar();
  document.querySelectorAll('.tela').forEach(function(t) { t.classList.remove('tela-ativa'); });
  document.getElementById(idTela).classList.add('tela-ativa');
  var logo = document.getElementById('logo-mini');
  var botaoVoltar = document.getElementById('botao-voltar');
  var naTelaPrincipal = idTela === 'tela-menu';
  if (logo) logo.classList.toggle('escondido', naTelaPrincipal);
  if (botaoVoltar) botaoVoltar.classList.toggle('escondido', naTelaPrincipal);

  // Botao "Ouvir novamente" so faz sentido durante a rodada de perguntas.
  var botaoOuvir = document.getElementById('botao-ouvir-novamente');
  if (botaoOuvir) botaoOuvir.hidden = (idTela !== 'tela-fase1');
}

// Para o timer e desmonta a cena 3D (Three.js), se estiver rodando — usado sempre
// que se sai da tela-fase1 sem terminar a cobranca (voltar ou ir ao menu).
function encerrarJogoEmAndamento() {
  pararTimer();
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

// ---------- Tela de Fases (NOVO) ----------

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

var ORDEM_ZONAS = ['topo-esquerda', 'topo-direita', 'meio', 'baixo-esquerda', 'baixo-direita'];

function iniciarFase1() {
  // Configura parametros da fase selecionada
  var fase = Progressao.obterFase(estado.faseAtual);
  TOTAL_COBRANCAS = fase.cobrancas;
  TIMER_MAX = fase.timerMax;

  estado.cobrancaAtual = 0;
  estado.gols = 0;
  estado.pontuacao = 0;
  estado.resultadosCobrancas = [];
  estado.cobrancaFinalizada = false;

  // Reseta o banco de questoes pra essa sessao
  BancoQuestoes.resetarSessao();

  // Mostra nome da fase no cabecalho
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
      b.classList.add(estado.resultadosCobrancas[i].resultado === 'gol' ? 'acerto' : 'erro');
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

    // SFX: tick de alerta nos ultimos 4 segundos
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

function calcularPontosPorVelocidade() {
  var tempo = Math.floor((Date.now() - estado.timerInicio) / 1000);
  // Max 100 pontos (resposta instantanea), min 10 (respondeu no limite)
  var pontos = Math.max(10, Math.round(100 * (1 - tempo / TIMER_MAX)));
  return pontos;
}

function tempoEsgotado() {
  // Garante uma única finalização por cobrança: se o clique do jogador e o
  // estouro do timer chegarem quase juntos, só o primeiro a passar por
  // aqui prossegue (secao 5 do documento de melhorias).
  if (estado.cobrancaFinalizada) return;
  estado.cobrancaFinalizada = true;

  SFX.tempoEsgotado();
  document.querySelectorAll('.botao-zona').forEach(function(b) { b.disabled = true; });
  document.getElementById('mensagem-feedback').textContent = 'Tempo esgotado!';
  // Tempo usado = o cronometro inteiro, capturado ja (antes da animacao),
  // pra nao inflar o valor registrado com o tempo da animacao do chute.
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

function carregarProximaPergunta() {
  estado.cobrancaFinalizada = false;

  // Usa o banco de questoes com dificuldade efetiva (escala com a fase)
  var dificuldadeEfetiva = Progressao.dificuldadeEfetiva(estado.dificuldadeId, estado.faseAtual);
  estado.perguntaAtual = BancoQuestoes.sortearPergunta(dificuldadeEfetiva);
  document.getElementById('mensagem-feedback').textContent = '';
  document.getElementById('pergunta-texto').textContent = estado.perguntaAtual.texto;

  estado.zonaCorreta = null;
  ORDEM_ZONAS.forEach(function(zonaId, indice) {
    var alt = estado.perguntaAtual.alternativas[indice];
    var botao = document.querySelector('.botao-zona[data-zona="' + zonaId + '"]');
    botao.textContent = alt.valor;
    botao.disabled = false;
    botao.classList.remove('acertou', 'errou');
    if (alt.correta) estado.zonaCorreta = zonaId;
  });

  Narracao.falar(estado.perguntaAtual.textoFalado);
  iniciarTimer();
}

function initFase1() {
  document.getElementById('zonas-gol').addEventListener('click', function(ev) {
    var botao = ev.target.closest('.botao-zona');
    if (!botao || botao.disabled) return;
    chutarZona(botao);
  });

  // "Ouvir novamente" (secao 1, Narracao): repete a pergunta atual sem
  // reiniciar o cronometro nem alterar nenhum outro estado do jogo.
  var botaoOuvir = document.getElementById('botao-ouvir-novamente');
  if (botaoOuvir) {
    botaoOuvir.addEventListener('click', function() {
      if (estado.perguntaAtual) Narracao.falar(estado.perguntaAtual.textoFalado);
    });
  }
}

function chutarZona(botaoClicado) {
  // Mesma trava de finalização única: um clique que chegue depois que o
  // tempo já esgotou (ou depois de outro clique) é ignorado.
  if (estado.cobrancaFinalizada) return;
  estado.cobrancaFinalizada = true;

  // Tempo usado capturado no instante do clique — antes da animacao do
  // chute, pra o valor registrado refletir o tempo de decisao real.
  var tempoUsadoMs = Date.now() - estado.timerInicio;
  pararTimer();
  var zonaId = botaoClicado.getAttribute('data-zona');
  var acertou = zonaId === estado.zonaCorreta;

  document.querySelectorAll('.botao-zona').forEach(function(b) { b.disabled = true; });
  // O resultado nunca depende so de cor: a classe muda a cor de fundo, mas
  // o rotulo acessivel tambem passa a dizer "Acertou"/"Errou" por texto.
  botaoClicado.classList.add(acertou ? 'acertou' : 'errou');
  botaoClicado.setAttribute('aria-label', (acertou ? 'Acertou! Resposta ' : 'Errou. Resposta ') + botaoClicado.textContent);

  if (estado.jogoPenalti) {
    estado.jogoPenalti.chutar(zonaId, acertou, function(r) {
      finalizarCobranca({ foiGol: r.gol, zonaEscolhida: zonaId, estourouTempo: false, tempoUsadoMs: tempoUsadoMs });
    });
  } else {
    setTimeout(function() {
      finalizarCobranca({ foiGol: acertou, zonaEscolhida: zonaId, estourouTempo: false, tempoUsadoMs: tempoUsadoMs });
    }, 500);
  }
}

// HU-07: registra cada cobranca como um objeto estruturado (zona escolhida,
// zona correta, resultado, se estourou o tempo, pontos e tempo usado) em
// vez de uma string solta — a tela de resultado usa isso para montar um
// resumo compreensivel por crianca e acessivel por texto.
function finalizarCobranca(detalhes) {
  var tempoUsadoSegundos = Math.min(TIMER_MAX, Math.max(0, Math.round((detalhes.tempoUsadoMs || 0) / 1000)));
  var pontosGanhos = 0;

  if (detalhes.foiGol) {
    SFX.gol();
    pontosGanhos = calcularPontosPorVelocidade();
    estado.gols++;
    estado.pontuacao += pontosGanhos;
    document.getElementById('mensagem-feedback').innerHTML = 'GOOOL! +' + pontosGanhos + ' <img class="icone-cruzeiro" src="../Imagens/estrela-cruzeiro.png" alt="">Cruzeiro!';
    Narracao.falar('Gol!');
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
    resultado: detalhes.foiGol ? 'gol' : 'defesa',
    estourouTempo: !!detalhes.estourouTempo,
    pontos: pontosGanhos,
    tempoUsado: tempoUsadoSegundos
  });

  estado.cobrancaAtual++;
  atualizarBolinhasProgresso();
  atualizarDisplayPontuacao();

  // Pausa entre uma cobranca e a proxima. Precisa ser maior que o tempo que
  // a bola leva pra voltar pra marca do penalti (TEMPO.ANTES_DE_RESETAR, em
  // game.js), senao a pergunta seguinte aparece com a bola ainda na rede.
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

// HU-07: monta o resumo de cada cobranca (zona escolhida + acerto/erro) de
// forma compreensivel pra crianca e acessivel por texto — nunca so por
// cor. Construido via DOM (sem innerHTML) porque os textos incluem a zona
// escolhida pelo jogador.
function renderizarListaCobrancas() {
  var lista = document.getElementById('lista-cobrancas');
  if (!lista) return;
  lista.textContent = '';

  estado.resultadosCobrancas.forEach(function(cobranca, indice) {
    var item = document.createElement('li');
    item.className = 'item-cobranca ' + (cobranca.resultado === 'gol' ? 'item-cobranca-gol' : 'item-cobranca-defesa');

    var icone = document.createElement('span');
    icone.className = 'item-cobranca-icone';
    icone.setAttribute('aria-hidden', 'true');
    icone.textContent = cobranca.resultado === 'gol' ? '✓' : '✗';
    item.appendChild(icone);

    var zonaTexto = cobranca.zonaEscolhida ? (ROTULO_ZONA[cobranca.zonaEscolhida] || cobranca.zonaEscolhida) : 'nenhuma zona (tempo esgotado)';
    var resultadoTexto = cobranca.resultado === 'gol' ? 'gol' : 'defesa';
    var textoCompleto = 'Cobrança ' + (indice + 1) + ' — ' + zonaTexto + ' — ' + resultadoTexto;
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
  if (estado.jogoPenalti) { estado.jogoPenalti.destruir(); estado.jogoPenalti = null; }

  // Registra progressao
  var resultadoProgressao = Progressao.registrarResultado(estado.faseAtual, estado.gols, estado.pontuacao);

  document.getElementById('placar-final').textContent = estado.gols + ' / ' + TOTAL_COBRANCAS;
  document.getElementById('pontuacao-final').innerHTML = estado.pontuacao + ' <img class="icone-cruzeiro" src="../Imagens/estrela-cruzeiro.png" alt="">Cruzeiro';

  var mensagem = sortearMensagemResultado(estado.gols);
  document.getElementById('resumo-resultado').textContent = mensagem;

  renderizarListaCobrancas();

  // Mostra/esconde mensagem de desbloqueio
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
    // HU-07: registro versionado, tolerante a leitura futura mesmo se o
    // formato mudar de novo (quem ler, confere "versao" antes de usar).
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

  // "Sobre mim": cada botao abre a bio do seu integrante. Abrir uma fecha
  // as outras (acordeao), pra o painel nao virar um paredao de texto.
  var botoesSobre = sobreposicao.querySelectorAll('.botao-sobre-mim');
  botoesSobre.forEach(function(botao) {
    botao.addEventListener('click', function() {
      SFX.clique();
      var bio = document.getElementById(botao.getAttribute('aria-controls'));
      var vaiAbrir = botao.getAttribute('aria-expanded') !== 'true';

      // Fecha todas antes de abrir a escolhida
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
          // Garante que a bio recem-aberta fique visivel no painel rolavel
          setTimeout(function() {
            cardAtual.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 60);
        }
      }
    });
  });

  // Ao fechar o modal, recolhe todas as bios pra abrir sempre limpo
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
  // Limpa apos 5 segundos
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
    // Coleta todos os dados do localStorage relacionados ao MathGol
    var chaves = ['mathgol_token', 'mathgol_acessibilidade', 'mathgol_ultimo_resultado',
                  'mathgol_progresso', 'mathgol_fases_desbloqueadas'];
    for (var i = 0; i < chaves.length; i++) {
      var valor = localStorage.getItem(chaves[i]);
      if (valor !== null) {
        backup.dados[chaves[i]] = valor;
      }
    }
    // Busca qualquer outra chave mathgol_
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

  // Exportar progresso local (localStorage)
  if (botaoLocal) {
    botaoLocal.addEventListener('click', function() {
      SFX.selecionar();
      exportarProgressoLocal();
    });
  }

  // Exportar dados do Firebase
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

  // Restaurar backup
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
            // Restaurar dados locais
            var chaves = Object.keys(dados.dados || {});
            for (var i = 0; i < chaves.length; i++) {
              try { localStorage.setItem(chaves[i], dados.dados[chaves[i]]); } catch(err) {}
            }
            mostrarStatusBackup('✅ Backup local restaurado! Recarregando...');
            setTimeout(function() { location.reload(); }, 1500);

          } else if (dados.tipo === 'mathgol-backup-firebase') {
            // Restaurar dados do Firebase
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
        // Limpa o input pra permitir selecionar o mesmo arquivo novamente
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
