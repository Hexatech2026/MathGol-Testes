// main.js - orquestra navegacao, timer de resposta, pontuacao por velocidade.
// Apelido TRAVADO: crianca escolhe 1 personagem + 1 animal (sem digitar).
//
// Fluxo da cobranca (regra em regras-chute.js, compartilhada com o 3D, o
// modo simplificado 2D e os testes):
//
//   PERGUNTA
//   ├─ resposta errada ou tempo esgotado → defesa do goleiro
//   └─ resposta correta → mira → forca → chute → gol (bola dentro) | fora
//
// Resposta correta impede a defesa, mas NAO garante gol.
//
// v6 (correcoes de QA):
//   - Ciclo de vida da partida com sessaoJogoId: todo timeout/callback
//     assincrono e vinculado a sessao e ignorado se ela ja acabou (voltar,
//     logo, reiniciar, resultado). finalizarCobranca e idempotente.
//   - Um unico fluxo de Pointer Events (sem click + touchend duplicados):
//     um toque = exatamente uma transicao. Teclado: setas movem a mira,
//     Enter/Espaco confirmam.
//   - Etapa "altura" (tipo de chute) com efeito REAL no resultado:
//     rasteiro / meia-altura / cavadinha (ver regras-chute.js). Ordem:
//     resposta → mira → altura → forca → chute (a faixa ideal da forca
//     depende do tipo escolhido).
//   - Trava de entrada: logo depois de mudar de etapa, cliques/toques/Enter
//     sao ignorados por um instante (duplo clique nao pula etapas).
//   - Sem WebGL/Three.js: modo simplificado 2D com a MESMA regra (nunca
//     mais gol automatico).
//   - Firebase: identidade = Firebase Auth anonimo (uid), nao mais um token
//     no localStorage.

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
  // HU-07: cada cobranca fica registrada como objeto estruturado.
  // resultado: 'gol' | 'defesa' | 'fora'.
  resultadosCobrancas: [],
  perguntaAtual: null,
  zonaCorreta: null,
  jogoPenalti: null,
  timerInicio: 0,
  timerInterval: null,
  timerSegundos: 15,
  ultimoSegundoAlertado: null,
  // Etapa da cobranca atual (ver ETAPA). Protege contra dupla finalizacao
  // e contra respostas/toques fora de hora.
  etapa: 'ociosa'
};

var ETAPA = {
  OCIOSA: 'ociosa',         // sem partida em andamento
  RESPOSTA: 'resposta',     // aguardando a crianca responder a conta
  TRANSICAO: 'transicao',   // acertou: pequena pausa antes da mira
  MIRA: 'mira',
  ALTURA: 'altura',
  FORCA: 'forca',
  CHUTE: 'chute',           // animacao em andamento
  FINALIZADA: 'finalizada'  // resultado registrado; aguardando a proxima
};

var TOTAL_COBRANCAS = 3;
var TIMER_MAX = 15;

// Pausa entre a resposta correta e o inicio da mira.
// v1.5: animacoes mais rapidas (antes 500 ms).
var PAUSA_ANTES_DA_MIRA = 300;
// Tempo que o resultado fica na tela antes da proxima pergunta. Tem que ser
// maior que TEMPO.ANTES_DE_RESETAR (game.js) pra bola ja estar na marca.
// v1.5: 2200 → 1500 ms (ANTES_DE_RESETAR agora e 1200 ms).
var PAUSA_ENTRE_COBRANCAS = 1500;

// Passo da mira pelo teclado (metros no plano do gol).
var PASSO_MIRA_TECLADO = { x: 0.3, y: 0.2 };

// Depois que uma etapa comeca, entradas sao ignoradas por este tempo. Um
// duplo clique/toque (segundo clique em ~100–400 ms) confirma so UMA etapa;
// a proxima exige um toque novo e deliberado.
var TRAVA_ENTRADA_MS = 450;

var NOME_TIPO = { rasteiro: 'rasteiro', meia: 'meia-altura', cavadinha: 'cavadinha' };
var FRASES_INCENTIVO = ['Quase! Tenta de novo!', 'Boa tentativa!', 'Não desista!', 'Você consegue!', 'Na próxima vai!'];

// Rotulos amigaveis das zonas do gol (resumo da tela de resultado, HU-07).
// So existe zona no caminho de resposta errada / tempo esgotado.
var ROTULO_ZONA = {
  'topo-esquerda': 'canto superior esquerdo',
  'topo-direita': 'canto superior direito',
  'meio': 'meio do gol',
  'baixo-esquerda': 'canto inferior esquerdo',
  'baixo-direita': 'canto inferior direito'
};

// Schema versionado do ultimo resultado salvo localmente (HU-07).
var VERSAO_ULTIMO_RESULTADO = 2;

// Ordem fixa das 5 alternativas <-> 5 zonas (usada no caminho de defesa).
var ORDEM_ZONAS = ['topo-esquerda', 'topo-direita', 'meio', 'baixo-esquerda', 'baixo-direita'];

// Mensagens do chute que nao entrou, por motivo (regras-chute.js).
var MENSAGEM_FORA = {
  fraco: 'Chute fraquinho! A bola não chegou ao gol. ❌',
  alto: 'Forte demais! Passou por cima do gol. ❌',
  lado: 'Pra fora! ❌'
};
var NARRACAO_FORA = {
  fraco: 'Chute fraco! A bola não chegou.',
  alto: 'Forte demais! Por cima do gol.',
  lado: 'Pra fora!'
};

// ======================================================================
// Ciclo de vida da partida
// ======================================================================
// Toda partida tem um sessaoJogoId. Timeouts e callbacks assincronos
// (animacoes do game.js/game-2d.js) sao vinculados ao id da sessao em que
// foram criados; se a sessao mudou (saiu, reiniciou, foi pro resultado),
// eles simplesmente nao fazem nada. Os timeouts tambem ficam registrados
// para serem cancelados de uma vez em encerrarJogoEmAndamento().

var cicloPartida = {
  sessaoJogoId: 0,
  timeouts: []
};

function telaAtivaId() {
  var t = document.querySelector('.tela.tela-ativa');
  return t ? t.id : null;
}

// Protecao principal: id da sessao. A tela ativa e so uma checagem extra.
function sessaoValida(idSessao) {
  return idSessao === cicloPartida.sessaoJogoId && telaAtivaId() === 'tela-fase1';
}

function agendarNaSessao(fn, ms) {
  var idSessao = cicloPartida.sessaoJogoId;
  var handle = setTimeout(function() {
    var i = cicloPartida.timeouts.indexOf(handle);
    if (i !== -1) cicloPartida.timeouts.splice(i, 1);
    if (!sessaoValida(idSessao)) return;
    fn();
  }, ms);
  cicloPartida.timeouts.push(handle);
  return handle;
}

function vincularSessao(fn) {
  var idSessao = cicloPartida.sessaoJogoId;
  return function() {
    if (!sessaoValida(idSessao)) return undefined;
    return fn.apply(this, arguments);
  };
}

function invalidarSessao() {
  cicloPartida.sessaoJogoId++;
  cicloPartida.timeouts.forEach(clearTimeout);
  cicloPartida.timeouts = [];
}

// ---------- Barras de altura e de forca ----------
// Oscilam sozinhas entre 0 e 1; um toque/clique/Enter trava o valor atual.
var FORCA_CICLO_MS = 1750;
var ALTURA_CICLO_MS = 1900;

function criarControleBarraOscilante(idPreenchimento, cicloMs) {
  var ativa = false;
  var rafId = 0;
  var valorAtual = 0;
  var inicioTempo = 0;
  return {
    iniciar: function() {
      ativa = true;
      valorAtual = 0;
      inicioTempo = performance.now();
      var el = document.getElementById(idPreenchimento);
      function quadro(agora) {
        if (!ativa) return;
        var progresso = ((agora - inicioTempo) % cicloMs) / cicloMs;
        // Onda 0..1 comecando de baixo.
        valorAtual = (Math.sin(progresso * Math.PI * 2 - Math.PI / 2) + 1) / 2;
        if (el) el.style.width = (6 + valorAtual * 90) + '%';
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

var controleForca = criarControleBarraOscilante('preenchimento-forca', FORCA_CICLO_MS);
var controleAltura = criarControleBarraOscilante('preenchimento-altura', ALTURA_CICLO_MS);

function iniciarBarraForca() { controleForca.iniciar(); }
function pararBarraForca() { return controleForca.parar(); }
function iniciarBarraAltura() { controleAltura.iniciar(); }
function pararBarraAltura() { return controleAltura.parar(); }

// Desenha na barra a faixa de forca ideal DO TIPO de chute escolhido
// (mesmos limites da regra: cavadinha pede forca menor, rasteiro maior).
function desenharFaixaIdealForca(tipoId) {
  var faixa = document.getElementById('faixa-ideal-forca');
  if (!faixa || typeof RegrasChute === 'undefined') return;
  var tipo = RegrasChute.TIPOS[tipoId] || RegrasChute.TIPOS.meia;
  var ini = 6 + tipo.forcaIdeal.min * 90;
  var fim = 6 + tipo.forcaIdeal.max * 90;
  faixa.style.left = ini + '%';
  faixa.style.width = (fim - ini) + '%';
}

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

// Marca 1 item selecionado num grupo (visual + aria-pressed).
function marcarSelecionado(container, seletor, classe, escolhido) {
  container.querySelectorAll(seletor).forEach(function(el) {
    var ativo = el === escolhido;
    el.classList.toggle(classe, ativo);
    el.setAttribute('aria-pressed', ativo ? 'true' : 'false');
  });
}

// ---------- Navegacao ----------

var TELA_ANTERIOR = {
  'tela-apelido':    'tela-menu',
  'tela-selecao':    'tela-apelido',
  'tela-dificuldade':'tela-selecao',
  'tela-fases':      'tela-dificuldade',
  'tela-fase1':      'tela-fases',
  'tela-resultado':  'tela-fases',
  'tela-entrar-sala':'tela-menu',
  'tela-professor':  'tela-menu'
};

// opcoes.focar === false: nao move o foco (ex.: carga inicial da pagina).
function mostrarTela(idTela, opcoes) {
  Narracao.cancelar();
  document.querySelectorAll('.tela').forEach(function(t) { t.classList.remove('tela-ativa'); });
  var tela = document.getElementById(idTela);
  tela.classList.add('tela-ativa');
  var logo = document.getElementById('logo-mini');
  var botaoVoltar = document.getElementById('botao-voltar');
  var naTelaPrincipal = idTela === 'tela-menu';
  if (logo) logo.classList.toggle('escondido', naTelaPrincipal);
  if (botaoVoltar) botaoVoltar.classList.toggle('escondido', naTelaPrincipal);

  var botaoOuvir = document.getElementById('botao-ouvir-novamente');
  if (botaoOuvir) botaoOuvir.hidden = (idTela !== 'tela-fase1');
  // Durante a partida o fundo animado (e o "GOL!" decorativo) some.
  document.body.classList.toggle('em-partida', idTela === 'tela-fase1');
  atualizarSaldoTopo();

  // Leva o foco (e o leitor de tela) para o titulo da nova tela.
  if (!opcoes || opcoes.focar !== false) {
    var titulo = tela.querySelector('[data-titulo-tela]') || tela.querySelector('h1, h2');
    if (titulo) {
      if (!titulo.hasAttribute('tabindex')) titulo.setAttribute('tabindex', '-1');
      try { titulo.focus({ preventScroll: true }); } catch (e) { titulo.focus(); }
    }
  }
}

function encerrarJogoEmAndamento() {
  invalidarSessao();
  pararTimer();
  cancelarEtapaInterativa();
  pararBarraForca();
  pararBarraAltura();
  estado.etapa = ETAPA.OCIOSA;
  if (estado.jogoPenalti) {
    try { estado.jogoPenalti.pararMira(); } catch (e) {}
    estado.jogoPenalti.destruir();
    estado.jogoPenalti = null;
  }
  var camada = document.getElementById('camada-mira');
  if (camada) camada.hidden = true;
  ['bloco-forca', 'bloco-altura', 'mensagem-etapa', 'incentivo-jogo'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.hidden = true;
  });
  var tela = document.getElementById('tela-fase1');
  if (tela) tela.classList.remove('foco-campo');
}

// Telas que podem ser abertas de varios lugares (Loja e Tutorial) guardam
// de onde vieram; o "voltar" leva de volta pra la (e redesenha a tela,
// pra ja mostrar o que foi comprado).
var origemTela = { 'tela-loja': 'tela-menu', 'tela-tutorial': 'tela-menu' };

function reabrirTela(idTela) {
  if (idTela === 'tela-apelido') { irParaApelido(); return; }
  if (idTela === 'tela-selecao') { irParaSelecao(); return; }
  if (idTela === 'tela-fases') { irParaFases(); return; }
  if (idTela === 'tela-resultado') { atualizarGanhoCarteira(); }
  mostrarTela(idTela);
}

function voltarTelaAnterior() {
  var telaAtual = document.querySelector('.tela.tela-ativa');
  if (!telaAtual) return;
  if (origemTela[telaAtual.id]) {
    SFX.clique();
    if (telaAtual.id === 'tela-tutorial' && typeof Tutorial !== 'undefined') Tutorial.marcarVisto();
    reabrirTela(origemTela[telaAtual.id]);
    return;
  }
  var anteriorId = TELA_ANTERIOR[telaAtual.id];
  if (!anteriorId) return;
  SFX.clique();
  if (telaAtual.id === 'tela-fase1') encerrarJogoEmAndamento();
  if (anteriorId === 'tela-fases') { irParaFases(); return; }
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
    // Primeira vez: mostra o tutorial antes de montar o craque.
    if (typeof Tutorial !== 'undefined' && !Tutorial.jaVisto()) {
      Tutorial.abrir('tela-menu', { aoTerminar: irParaApelido });
      return;
    }
    irParaApelido();
  });
  var botaoTutorial = document.getElementById('botao-tutorial');
  if (botaoTutorial) botaoTutorial.addEventListener('click', function() {
    SFX.clique();
    if (typeof Tutorial !== 'undefined') Tutorial.abrir('tela-menu');
  });
}

// ---------- Saldo de Cruzeiros (topo) ----------

function atualizarSaldoTopo() {
  var valor = document.getElementById('saldo-topo');
  var botao = document.getElementById('botao-saldo');
  if (!valor || !botao || typeof Carteira === 'undefined') return;
  var saldo = Carteira.saldo();
  valor.textContent = String(saldo);
  botao.setAttribute('aria-label', 'Seus ' + Carteira.formatar(saldo) + '. Abrir a Loja');
  // Na propria Loja o saldo ja aparece grande; na partida, ha o placar.
  var ativa = telaAtivaId();
  botao.hidden = ativa === 'tela-loja' || ativa === 'tela-fase1';
}

function initSaldoTopo() {
  var botao = document.getElementById('botao-saldo');
  if (botao) botao.addEventListener('click', function() {
    SFX.clique();
    var atual = telaAtivaId();
    if (typeof Loja !== 'undefined' && atual && atual !== 'tela-fase1') Loja.abrir(atual);
  });
  if (typeof Carteira !== 'undefined') Carteira.aoMudar(atualizarSaldoTopo);
  atualizarSaldoTopo();
}

// ---------- Tela cheia (Fullscreen API) ----------

function elementoTelaCheiaAtual() {
  return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
}

// Chama a API e SEMPRE devolve uma Promise tratada: navegadores antigos
// (webkit/ms) retornam undefined; os novos retornam uma Promise que pode
// ser rejeitada (ex.: sem gesto do usuario, iframe sem permissao).
function chamarApiTelaCheia(fn, alvo) {
  try {
    return Promise.resolve(fn.call(alvo));
  } catch (erro) {
    return Promise.reject(erro);
  }
}

function alternarTelaCheia() {
  var botao = document.getElementById('botao-tela-cheia');
  if (!botao || botao.getAttribute('aria-busy') === 'true') return;
  SFX.clique();
  var raiz = document.documentElement;
  var entrar = !elementoTelaCheiaAtual();
  var fn = entrar
    ? (raiz.requestFullscreen || raiz.webkitRequestFullscreen || raiz.msRequestFullscreen)
    : (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen);
  if (!fn) return;

  botao.setAttribute('aria-busy', 'true');
  chamarApiTelaCheia(fn, entrar ? raiz : document)
    .catch(function(erro) {
      console.warn('Tela cheia nao disponivel agora:', erro);
    })
    .then(function() {
      botao.removeAttribute('aria-busy');
      atualizarBotaoTelaCheia();
    });
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
  ['fullscreenerror', 'webkitfullscreenerror'].forEach(function(evento) {
    document.addEventListener(evento, atualizarBotaoTelaCheia);
  });
  atualizarBotaoTelaCheia();
}

// ---------- Apelido: crianca ESCOLHE personagem + animal ----------

function irParaApelido() {
  // Se um item escolhido deixou de existir (ex.: backup restaurado), limpa.
  if (estado.personagemEscolhido && personagensDisponiveis().indexOf(estado.personagemEscolhido) === -1) estado.personagemEscolhido = null;
  if (estado.animalEscolhido && animaisDisponiveis().indexOf(estado.animalEscolhido) === -1) estado.animalEscolhido = null;
  if (avataresDisponiveis().map(function(a) { return a.seed; }).indexOf(estado.avatarSeed) === -1) estado.avatarSeed = AVATAR_PADRAO.seed;
  renderizarListaPersonagens();
  renderizarListaAnimais();
  renderizarGradeAvatares();
  atualizarPreviewApelido();
  atualizarPreviewAvatar();
  mostrarTela('tela-apelido');
}

// Grátis + comprados na Loja (na ordem: grátis primeiro).
function itemComprado(idItem) {
  return typeof Carteira !== 'undefined' && Carteira.possui(idItem);
}
function personagensDisponiveis() {
  return PERSONAGENS.concat(PERSONAGENS_LOJA.filter(function(n) { return itemComprado('nome:' + n); }));
}
function animaisDisponiveis() {
  return ANIMAIS.concat(ANIMAIS_LOJA.filter(function(n) { return itemComprado('nome:' + n); }));
}
function avataresDisponiveis() {
  return AVATARES_GRATIS.concat(AVATARES_LOJA.filter(function(a) { return itemComprado('avatar:' + a.seed); }));
}
function timeDisponivel(time) {
  return !(time.preco > 0) || itemComprado(idItemTime(time));
}

function renderizarListaChips(idContainer, itens, campoEstado, comprados) {
  var container = document.getElementById(idContainer);
  container.textContent = '';
  itens.forEach(function(texto) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip-escolha';
    btn.textContent = texto;
    if (comprados && comprados.indexOf(texto) !== -1) btn.classList.add('chip-comprado');
    var ativo = estado[campoEstado] === texto;
    btn.classList.toggle('chip-ativo', ativo);
    btn.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    btn.addEventListener('click', function() {
      SFX.clique();
      estado[campoEstado] = texto;
      marcarSelecionado(container, '.chip-escolha', 'chip-ativo', btn);
      atualizarPreviewApelido();
    });
    container.appendChild(btn);
  });
}

function renderizarListaPersonagens() { renderizarListaChips('lista-personagens', personagensDisponiveis(), 'personagemEscolhido', PERSONAGENS_LOJA); }
function renderizarListaAnimais() { renderizarListaChips('lista-animais', animaisDisponiveis(), 'animalEscolhido', ANIMAIS_LOJA); }

function atualizarPreviewApelido() {
  var texto = '';
  if (estado.personagemEscolhido && estado.animalEscolhido) {
    texto = estado.personagemEscolhido + ' ' + estado.animalEscolhido;
  } else if (estado.personagemEscolhido) {
    texto = estado.personagemEscolhido + ' ???';
  } else if (estado.animalEscolhido) {
    texto = '??? ' + estado.animalEscolhido;
  } else {
    texto = 'Escolha abaixo';
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

// v1.5: uma grade so (sem abas), com os avatares gratis + os comprados.
function renderizarGradeAvatares() {
  var container = document.getElementById('grade-avatares');
  container.textContent = '';
  avataresDisponiveis().forEach(function(avatar) {
    var seed = avatar.seed;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'item-avatar';
    var ativo = estado.avatarSeed === seed;
    btn.classList.toggle('avatar-selecionado', ativo);
    btn.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    btn.setAttribute('aria-label', 'Avatar ' + avatar.nome);
    var img = document.createElement('img');
    img.src = gerarUrlAvatar(seed);
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = function() { this.onerror = null; this.src = gerarAvatarFallbackLocal(seed); };
    btn.appendChild(img);
    btn.addEventListener('click', function() {
      SFX.clique();
      estado.avatarSeed = seed;
      marcarSelecionado(container, '.item-avatar', 'avatar-selecionado', btn);
      atualizarPreviewAvatar();
      var preview = document.getElementById('avatar-apelido');
      if (preview) { preview.classList.remove('pulo'); void preview.offsetWidth; preview.classList.add('pulo'); }
    });
    container.appendChild(btn);
  });
}

function initApelido() {
  document.getElementById('botao-confirmar-apelido').addEventListener('click', function() {
    if (!estado.apelido) return;
    SFX.selecionar();
    // Nao bloqueia o jogo: o firebase-config.js aguarda a autenticacao
    // anonima ficar pronta (com tempo limite) antes de gravar.
    if (window.FirebaseMathGol) {
      window.FirebaseMathGol.salvarPerfil({
        apelido: estado.apelido,
        avatarSeed: estado.avatarSeed
      });
    }
    irParaSelecao();
  });
  var botaoLoja = document.getElementById('botao-loja-apelido');
  if (botaoLoja) botaoLoja.addEventListener('click', function() {
    SFX.clique();
    if (typeof Loja !== 'undefined') Loja.abrir('tela-apelido', 'nome');
  });
}

// ---------- Selecao ----------

var BANDEIRAS_POR_ID = {
  brasil:'br', argentina:'ar', alemanha:'de', franca:'fr', japao:'jp',
  portugal:'pt', espanha:'es', italia:'it', inglaterra:'gb-eng',
  colombia:'co', mexico:'mx', coreia:'kr'
};

// Escudo generico do clube: duas cores do time + sigla. NAO e o escudo
// oficial (marca registrada); so ajuda a crianca a reconhecer o time.
function criarEscudoClube(time, classeExtra) {
  var escudo = document.createElement('span');
  escudo.className = 'escudo-clube' + (classeExtra ? ' ' + classeExtra : '');
  escudo.setAttribute('aria-hidden', 'true');
  var c1 = COR_VALIDA.test(time.corPrimaria || '') ? time.corPrimaria : '#21303B';
  var c2 = COR_VALIDA.test(time.corSecundaria || '') ? time.corSecundaria : '#FFFDF6';
  escudo.style.setProperty('--cor-1', c1);
  escudo.style.setProperty('--cor-2', c2);
  var sigla = document.createElement('span');
  sigla.className = 'escudo-sigla';
  sigla.textContent = (time.sigla || time.nome.slice(0, 3)).toUpperCase();
  // Texto claro ou escuro conforme a cor de fundo da faixa da sigla.
  sigla.style.color = corEhClara(c1) ? '#111111' : '#FFFFFF';
  escudo.appendChild(sigla);
  return escudo;
}

function corEhClara(hex) {
  var n = parseInt(hex.slice(1), 16);
  var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160;
}

function criarBandeira(codigo, classe) {
  var img = document.createElement('img');
  img.className = classe || 'cartao-bandeira';
  img.src = 'https://flagcdn.com/w80/' + codigo + '.png';
  img.srcset = 'https://flagcdn.com/w160/' + codigo + '.png 2x';
  img.alt = '';
  img.onerror = function() { this.onerror = null; this.hidden = true; };
  return img;
}

// Visual do time: bandeira (selecao) ou escudo generico (clube).
function criarVisualTime(time, classeBandeira) {
  if (time.categoria === 'clube') return criarEscudoClube(time);
  var codigo = time.bandeira || BANDEIRAS_POR_ID[time.id] || '';
  return codigoBandeiraValido(codigo) ? criarBandeira(codigo, classeBandeira) : null;
}

function irParaSelecao() {
  var grade = document.getElementById('grade-selecoes');
  var gradeClubes = document.getElementById('grade-clubes');
  var tituloClubes = document.getElementById('titulo-clubes');
  var botaoConfirmar = document.getElementById('botao-confirmar-selecao');
  grade.textContent = '';
  gradeClubes.textContent = '';

  // Se o time escolhido antes nao estiver mais disponivel, desmarca.
  var escolhido = SELECOES.find(function(t) { return t.id === estado.selecaoId; });
  if (!escolhido || !timeDisponivel(escolhido)) estado.selecaoId = null;

  var todasAsGrades = document.getElementById('tela-selecao');
  var totalClubes = 0;

  // SELECOES ja chega validada (data.js → validarSelecao). Mesmo assim,
  // nada aqui concatena texto em HTML: so createElement/textContent.
  SELECOES.forEach(function(sel) {
    if (!timeDisponivel(sel)) return;
    var ehClube = sel.categoria === 'clube';
    var cartao = document.createElement('button');
    cartao.className = 'cartao' + (ehClube ? ' cartao-clube' : '');
    cartao.type = 'button';
    var ativo = estado.selecaoId === sel.id;
    cartao.classList.toggle('cartao-selecionado', ativo);
    cartao.setAttribute('aria-pressed', ativo ? 'true' : 'false');

    var visual = criarVisualTime(sel);
    if (visual) cartao.appendChild(visual);
    var titulo = document.createElement('span');
    titulo.className = 'cartao-titulo';
    titulo.textContent = sel.nome;
    cartao.appendChild(titulo);

    cartao.addEventListener('click', function() {
      SFX.clique();
      marcarSelecionado(todasAsGrades, '.cartao', 'cartao-selecionado', cartao);
      estado.selecaoId = sel.id;
      botaoConfirmar.disabled = false;
    });
    if (ehClube) { gradeClubes.appendChild(cartao); totalClubes++; }
    else grade.appendChild(cartao);
  });
  gradeClubes.hidden = totalClubes === 0;
  tituloClubes.hidden = totalClubes === 0;
  botaoConfirmar.disabled = !estado.selecaoId;
  mostrarTela('tela-selecao');
}

function initSelecao() {
  document.getElementById('botao-confirmar-selecao').addEventListener('click', function() {
    if (!estado.selecaoId) return;
    SFX.selecionar();
    irParaDificuldade();
  });
  var botaoLoja = document.getElementById('botao-loja-selecao');
  if (botaoLoja) botaoLoja.addEventListener('click', function() {
    SFX.clique();
    if (typeof Loja !== 'undefined') Loja.abrir('tela-selecao', 'clube');
  });
}

// ---------- Dificuldade ----------

function criarSpan(classe, texto) {
  var s = document.createElement('span');
  s.className = classe;
  s.textContent = texto;
  return s;
}

// Escolha do nivel.
//
// Antes esta tela listava DIFICULDADES (facil/medio/dificil). Com so tres
// degraus, a escalada entre fases era um abismo: quem escolhia facil somava
// 2 + 3 na fase 1 e encarava 7 x 9 e divisao na fase 3. Agora lista os 12
// niveis de niveis.js, cada um dizendo o tipo de conta e o tamanho dos
// numeros.
//
// estado.dificuldadeId continua sendo o campo usado pelo resto do codigo —
// so passou a guardar um numero (1..12) em vez de 'facil'/'medio'/'dificil'.
// Progressao.dificuldadeEfetiva() aceita os dois formatos, entao progresso
// salvo antes desta mudanca continua valendo.
function irParaDificuldade() {
  // Numa sala, quem manda no nivel e o professor: nao faz sentido deixar a
  // crianca escolher outro.
  if (Sala.estaNaSala() && Sala.nivelDaSala()) {
    estado.dificuldadeId = Sala.nivelDaSala();
    irParaFases();
    return;
  }

  var grade = document.getElementById('grade-dificuldades');
  grade.textContent = '';
  NIVEIS.forEach(function(nv) {
    var cartao = document.createElement('button');
    cartao.className = 'cartao cartao-nivel';
    cartao.type = 'button';
    cartao.setAttribute('aria-pressed', 'false');
    cartao.setAttribute('aria-label', rotuloNivel(nv.id) + '. ' + nv.descricao);
    cartao.appendChild(criarSpan('cartao-icone-dificuldade', String(nv.id)));
    cartao.appendChild(criarSpan('cartao-titulo', nv.nome));
    cartao.appendChild(criarSpan('cartao-descricao', nv.descricao));
    cartao.appendChild(criarSpan('etiqueta-tipo', nv.tipos.map(function(t) {
      return TIPOS_OPERACAO[t].simbolo;
    }).join(' ')));
    cartao.addEventListener('click', function() {
      SFX.clique();
      marcarSelecionado(grade, '.cartao', 'cartao-selecionado', cartao);
      estado.dificuldadeId = nv.id;
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

function criarIconeCruzeiro(alt) {
  var img = document.createElement('img');
  img.className = 'icone-cruzeiro';
  img.src = '../Imagens/estrela-cruzeiro.png';
  img.alt = alt || '';
  return img;
}

function irParaFases() {
  var grade = document.getElementById('grade-fases');
  grade.textContent = '';

  var fases = Progressao.obterFases();
  fases.forEach(function(fase) {
    var desbloqueada = Progressao.faseDesbloqueada(fase.id);
    var cartao = document.createElement('button');
    cartao.className = 'cartao cartao-fase';
    cartao.type = 'button';
    if (!desbloqueada) {
      cartao.classList.add('cartao-bloqueado');
      cartao.disabled = true;
      cartao.setAttribute('aria-disabled', 'true');
    } else {
      cartao.setAttribute('aria-pressed', 'false');
    }

    var melhorPts = Progressao.melhorPontuacao(fase.id);
    var melhorG = Progressao.melhorGols(fase.id);
    var estrelas = '';
    for (var i = 0; i < Math.min(melhorG, fase.cobrancas); i++) estrelas += '⭐';

    cartao.appendChild(criarSpan('cartao-icone-dificuldade', desbloqueada ? fase.icone : '🔒'));
    cartao.appendChild(criarSpan('cartao-titulo', fase.nome));
    cartao.appendChild(criarSpan('cartao-descricao', desbloqueada ? fase.descricao : 'Complete a fase anterior!'));
    if (estrelas) {
      var spanEstrelas = criarSpan('cartao-estrelas', estrelas);
      spanEstrelas.setAttribute('aria-label', 'Melhor resultado: ' + melhorG + ' de ' + fase.cobrancas + ' gols');
      cartao.appendChild(spanEstrelas);
    }
    if (melhorPts > 0) {
      var recorde = criarSpan('cartao-descricao', 'Recorde: ' + melhorPts + ' ');
      recorde.appendChild(criarIconeCruzeiro(''));
      recorde.appendChild(document.createTextNode(melhorPts === 1 ? 'Cruzeiro' : 'Cruzeiros'));
      cartao.appendChild(recorde);
    }

    if (desbloqueada) {
      cartao.addEventListener('click', function() {
        SFX.selecionar();
        marcarSelecionado(grade, '.cartao:not(.cartao-bloqueado)', 'cartao-selecionado', cartao);
        estado.faseAtual = fase.id;
        document.getElementById('botao-confirmar-fase').disabled = false;
      });
    }
    grade.appendChild(cartao);
  });
  document.getElementById('botao-confirmar-fase').disabled = true;
  mostrarTela('tela-fases');
}

function initFases() {
  document.getElementById('botao-confirmar-fase').addEventListener('click', function() {
    SFX.selecionar();
    iniciarPartida();
  });
}

// ======================================================================
// Partida (usada por TODAS as fases: Penaltis, Falta e Final)
// ======================================================================

// Cria a cena: 3D quando possivel; senao, modo simplificado 2D com a
// mesma regra. Se nem o 2D abrir, devolve null e a partida NAO comeca.
function criarCenaDaPartida() {
  var container = document.getElementById('jogo-penalti');
  container.textContent = '';
  try {
    if (typeof THREE === 'undefined') throw new Error('Three.js nao carregou');
    return criarJogoPenalti('jogo-penalti', estado.selecaoId);
  } catch (erro3d) {
    console.warn('Cena 3D indisponivel, usando o modo simplificado:', erro3d);
    container.textContent = '';
  }
  try {
    return criarJogoPenalti2D('jogo-penalti', estado.selecaoId);
  } catch (erro2d) {
    console.error('Modo simplificado indisponivel:', erro2d);
    container.textContent = '';
    return null;
  }
}

function iniciarPartida() {
  encerrarJogoEmAndamento(); // invalida qualquer sessao anterior
  var fase = Progressao.obterFase(estado.faseAtual);
  estado.faseAtual = fase.id;
  TOTAL_COBRANCAS = fase.cobrancas;
  TIMER_MAX = fase.timerMax;

  estado.cobrancaAtual = 0;
  estado.gols = 0;
  estado.pontuacao = 0;
  estado.resultadosCobrancas = [];
  estado.perguntaAtual = null;

  BancoQuestoes.resetarSessao();

  var tituloFase = document.getElementById('titulo-fase');
  if (tituloFase) tituloFase.textContent = fase.icone + ' ' + fase.nome;

  mostrarTela('tela-fase1');
  atualizarBolinhasProgresso();
  atualizarDisplayPontuacao();
  document.getElementById('mensagem-feedback').textContent = '';

  var aviso = document.getElementById('aviso-modo-jogo');
  estado.jogoPenalti = criarCenaDaPartida();

  if (!estado.jogoPenalti) {
    // Nunca premia gol automatico: sem cena jogavel, nao ha partida.
    aviso.hidden = false;
    aviso.classList.add('aviso-erro');
    aviso.textContent = 'Não foi possível abrir o campo neste navegador. Tente atualizar a página ou usar outro navegador.';
    document.getElementById('area-respostas').hidden = true;
    document.getElementById('pergunta-texto').textContent = '--';
    return;
  }
  aviso.classList.remove('aviso-erro');
  aviso.hidden = estado.jogoPenalti.modo !== '2d';
  aviso.textContent = estado.jogoPenalti.modo === '2d' ? 'Modo simplificado ativo (sem 3D).' : '';

  SFX.apito();
  carregarProximaPergunta();
}

function atualizarBolinhasProgresso() {
  var container = document.getElementById('cabecalho-fase');
  container.textContent = '';
  container.setAttribute('aria-label', 'Cobrança ' + Math.min(estado.cobrancaAtual + 1, TOTAL_COBRANCAS) + ' de ' + TOTAL_COBRANCAS);
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

// ---------- Timer ----------

function iniciarTimer() {
  pararTimer();
  estado.timerSegundos = TIMER_MAX;
  estado.timerInicio = Date.now();
  estado.ultimoSegundoAlertado = null;
  atualizarDisplayTimer();
  var idSessao = cicloPartida.sessaoJogoId;
  estado.timerInterval = setInterval(function() {
    if (!sessaoValida(idSessao) || estado.etapa !== ETAPA.RESPOSTA) { pararTimer(); return; }
    var decorrido = Math.floor((Date.now() - estado.timerInicio) / 1000);
    estado.timerSegundos = Math.max(0, TIMER_MAX - decorrido);
    atualizarDisplayTimer();

    // Um unico alerta por segundo exibido (4, 3, 2, 1), mesmo o intervalo
    // rodando a cada 200 ms.
    if (estado.timerSegundos > 0 && estado.timerSegundos <= 4 &&
        estado.timerSegundos !== estado.ultimoSegundoAlertado) {
      estado.ultimoSegundoAlertado = estado.timerSegundos;
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
// do clique (ou do estouro do timer). Mira, forca e animacao NAO contam.
function calcularPontosPorVelocidade(tempoUsadoSegundos) {
  return Math.max(10, Math.round(100 * (1 - tempoUsadoSegundos / TIMER_MAX)));
}

// ---------- Etapas visuais ----------

function mostrarEtapaRespostas() {
  document.getElementById('area-respostas').hidden = false;
  document.getElementById('mensagem-etapa').hidden = true;
  document.getElementById('camada-mira').hidden = true;
  document.getElementById('bloco-forca').hidden = true;
  document.getElementById('bloco-altura').hidden = true;
  document.getElementById('incentivo-jogo').hidden = true;
  document.getElementById('tela-fase1').classList.remove('foco-campo');
}

function esconderEtapaRespostas() {
  document.getElementById('area-respostas').hidden = true;
}

function carregarProximaPergunta() {
  // Nivel de partida + um degrau por fase (PASSO_POR_FASE em progressao.js).
  // Numa sala, o nivel e o que o professor definiu, e os filtros limitam os
  // tipos de conta (ex.: so subtracao).
  var nivelBase = Sala.estaNaSala() && Sala.nivelDaSala()
    ? Sala.nivelDaSala()
    : estado.dificuldadeId;
  var nivelDaVez = Progressao.dificuldadeEfetiva(nivelBase, estado.faseAtual);
  estado.perguntaAtual = BancoQuestoes.sortearPergunta(nivelDaVez, Sala.filtrosDaSala());
  document.getElementById('mensagem-feedback').textContent = '';
  document.getElementById('pergunta-texto').textContent = estado.perguntaAtual.texto;
  mostrarEtapaRespostas();

  estado.zonaCorreta = null;
  var container = document.getElementById('respostas-alternativas');
  container.textContent = '';
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

  estado.etapa = ETAPA.RESPOSTA;
  atualizarBolinhasProgresso();
  Narracao.falar(estado.perguntaAtual.textoFalado);
  iniciarTimer();
}

function initFase1() {
  var botaoOuvir = document.getElementById('botao-ouvir-novamente');
  if (botaoOuvir) {
    botaoOuvir.addEventListener('click', function() {
      // Pedido explicito da crianca: fala mesmo com a narracao automatica
      // desligada (antes o botao nao fazia nada nesse caso).
      SFX.clique();
      if (estado.perguntaAtual) Narracao.falar(estado.perguntaAtual.textoFalado, { forcar: true });
    });
  }
  desenharFaixaIdealForca('meia');
}

// ---------- Resposta ----------

// Correta: avanca SOMENTE para a mira. Errada: defesa (uma unica vez).
function responderAlternativa(botaoClicado) {
  if (estado.etapa !== ETAPA.RESPOSTA) return;

  var tempoUsadoMs = Date.now() - estado.timerInicio;
  pararTimer();
  var zonaId = botaoClicado.getAttribute('data-zona');
  var acertou = zonaId === estado.zonaCorreta;

  document.querySelectorAll('.botao-resposta').forEach(function(b) { b.disabled = true; });
  botaoClicado.classList.add(acertou ? 'acertou' : 'errou');
  botaoClicado.setAttribute('aria-label', (acertou ? 'Acertou! Resposta ' : 'Errou. Resposta ') + botaoClicado.textContent);

  if (acertou) {
    estado.etapa = ETAPA.TRANSICAO;
    SFX.selecionar();
    document.getElementById('mensagem-feedback').textContent = '✓ Resposta correta!';
    agendarNaSessao(function() { avancarParaMira(tempoUsadoMs); }, PAUSA_ANTES_DA_MIRA);
    return;
  }

  estado.etapa = ETAPA.CHUTE;
  document.getElementById('mensagem-feedback').textContent = '✗ Resposta errada!';
  chutarParaDefesa(zonaId, { respostaCorreta: false, zonaEscolhida: zonaId, estourouTempo: false, tempoUsadoMs: tempoUsadoMs });
}

// Tempo esgotado = mesmo tratamento de resposta errada: defesa no meio.
function tempoEsgotado() {
  if (estado.etapa !== ETAPA.RESPOSTA) return;
  estado.etapa = ETAPA.CHUTE;

  SFX.tempoEsgotado();
  document.querySelectorAll('.botao-resposta').forEach(function(b) { b.disabled = true; });
  document.getElementById('mensagem-feedback').textContent = 'Tempo esgotado!';
  chutarParaDefesa('meio', { respostaCorreta: false, zonaEscolhida: null, estourouTempo: true, tempoUsadoMs: TIMER_MAX * 1000 });
}

function chutarParaDefesa(zonaId, detalhes) {
  var aoFinalizar = vincularSessao(function() { finalizarCobranca(detalhes); });
  var iniciou = estado.jogoPenalti && estado.jogoPenalti.chutar(zonaId, aoFinalizar);
  // Cena ocupada/indisponivel: registra a defesa mesmo assim (sem gol).
  if (!iniciou) agendarNaSessao(function() { finalizarCobranca(detalhes); }, 500);
}

// ---------- Etapas interativas (mira e forca) ----------
// Um unico fluxo de Pointer Events na superficie do jogo:
//   - so o ponteiro primario conta;
//   - a transicao acontece no pointerup DAQUELE ponteiro que deu pointerdown
//     nesta etapa (o "up" de um toque antigo nunca confirma a etapa nova);
//   - nenhum listener de click/touchend: o clique sintetico que o navegador
//     gera depois do toque nao tem efeito;
//   - trava por etapa: depois de confirmar, nada mais e aceito nela.
// Teclado: setas movem a mira; Enter ou Espaco confirmam.

var etapaInterativa = null;

function cancelarEtapaInterativa() {
  if (etapaInterativa) { etapaInterativa.cancelar(); etapaInterativa = null; }
}

function iniciarEtapaInterativa(opcoes) {
  cancelarEtapaInterativa();
  var superficie = document.getElementById('superficie-jogo');
  var idSessao = cicloPartida.sessaoJogoId;
  var ponteiroAtivo = null;
  var travada = false;
  var liberadaEm = performance.now() + TRAVA_ENTRADA_MS;
  // Usa o horario em que a entrada ACONTECEU (ev.timeStamp), nao o horario
  // em que foi processada: num aparelho lento o 2o toque de um duplo toque
  // pode ser entregue tarde, mas continua sendo um duplo toque.
  function aindaTravada(ev) {
    var quando = (ev && typeof ev.timeStamp === 'number' && ev.timeStamp > 0) ? ev.timeStamp : performance.now();
    return quando < liberadaEm;
  }

  function limpar() {
    superficie.removeEventListener('pointerdown', aoPointerDown);
    superficie.removeEventListener('pointermove', aoPointerMove);
    superficie.removeEventListener('pointerup', aoPointerUp);
    superficie.removeEventListener('pointercancel', aoPointerCancel);
    superficie.removeEventListener('keydown', aoTecla);
    superficie.classList.remove('superficie-interativa');
    superficie.tabIndex = -1;
    if (ponteiroAtivo !== null) {
      try { superficie.releasePointerCapture(ponteiroAtivo); } catch (e) {}
    }
    ponteiroAtivo = null;
  }

  function confirmar() {
    if (travada) return;
    travada = true;
    limpar();
    if (etapaInterativa === controle) etapaInterativa = null;
    if (!sessaoValida(idSessao)) return;
    opcoes.aoConfirmar();
  }

  function aoPointerDown(ev) {
    if (travada || !ev.isPrimary) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    // Botoes dentro da superficie (ex.: "Ouvir novamente") fazem so o papel deles.
    if (ev.target && ev.target.closest && ev.target.closest('button')) return;
    // Trava anti-duplo-clique: o 2o clique de um duplo clique nao conta.
    if (aindaTravada(ev)) return;
    ponteiroAtivo = ev.pointerId;
    try { superficie.setPointerCapture(ev.pointerId); } catch (e) {}
    if (opcoes.aoMover) opcoes.aoMover(ev.clientX, ev.clientY);
    ev.preventDefault();
  }

  function aoPointerMove(ev) {
    if (travada || !ev.isPrimary || !opcoes.aoMover) return;
    // Mouse mira so de passar por cima; toque/caneta, arrastando.
    if (ev.pointerType !== 'mouse' && ev.pointerId !== ponteiroAtivo) return;
    opcoes.aoMover(ev.clientX, ev.clientY);
  }

  function aoPointerUp(ev) {
    if (travada || !ev.isPrimary || ev.pointerId !== ponteiroAtivo) return;
    ev.preventDefault();
    confirmar();
  }

  function aoPointerCancel(ev) {
    if (ev.pointerId === ponteiroAtivo) ponteiroAtivo = null;
  }

  function aoTecla(ev) {
    var tecla = ev.key;
    var confirma = tecla === 'Enter' || tecla === ' ' || tecla === 'Spacebar';
    if (confirma) {
      if (ev.target && ev.target !== superficie && ev.target.closest && ev.target.closest('button')) return;
      ev.preventDefault();
      if (!ev.repeat && !aindaTravada(ev)) confirmar();
      return;
    }
    if (!opcoes.aoSeta) return;
    var dx = 0, dy = 0;
    if (tecla === 'ArrowLeft') dx = -1;
    else if (tecla === 'ArrowRight') dx = 1;
    else if (tecla === 'ArrowUp') dy = 1;
    else if (tecla === 'ArrowDown') dy = -1;
    else return;
    ev.preventDefault();
    if (!travada) opcoes.aoSeta(dx, dy);
  }

  superficie.addEventListener('pointerdown', aoPointerDown);
  superficie.addEventListener('pointermove', aoPointerMove);
  superficie.addEventListener('pointerup', aoPointerUp);
  superficie.addEventListener('pointercancel', aoPointerCancel);
  superficie.addEventListener('keydown', aoTecla);
  superficie.classList.add('superficie-interativa');
  superficie.tabIndex = 0;
  document.getElementById('instrucoes-jogo').textContent = opcoes.instrucoes || '';
  try { superficie.focus({ preventScroll: true }); } catch (e) { superficie.focus(); }

  var controle = {
    cancelar: function() { travada = true; limpar(); },
    confirmar: confirmar
  };
  etapaInterativa = controle;
  return controle;
}

// Etapa: mira (ponteiro, arrastar o dedo ou setas).
function avancarParaMira(tempoUsadoMs) {
  if (estado.etapa !== ETAPA.TRANSICAO || !estado.jogoPenalti) return;
  estado.etapa = ETAPA.MIRA;
  esconderEtapaRespostas();
  document.getElementById('tela-fase1').classList.add('foco-campo');
  var msg = document.getElementById('mensagem-etapa');
  msg.hidden = false;
  msg.textContent = 'Escolha onde chutar! 🎯';

  var jogo = estado.jogoPenalti;
  var camada = document.getElementById('camada-mira');
  camada.hidden = false;
  var alvo = document.getElementById('alvo-mira');

  alvo.classList.remove('mira-travada', 'mira-fora');
  jogo.iniciarMira(function(pos, ponto) {
    alvo.style.left = pos.leftPercent + '%';
    alvo.style.top = pos.topPercent + '%';
    // Mira fora do gol fica vermelha (chute sai com qualquer forca).
    alvo.classList.toggle('mira-fora', !!ponto && !RegrasChute.dentroDaAreaValida(ponto));
  });

  iniciarEtapaInterativa({
    instrucoes: 'Mire no gol com o dedo, o mouse ou as setas do teclado. Toque, clique ou aperte Enter para confirmar a mira.',
    aoMover: function(x, y) { jogo.moverMiraTela(x, y); },
    aoSeta: function(dx, dy) { jogo.moverMiraDelta(dx * PASSO_MIRA_TECLADO.x, dy * PASSO_MIRA_TECLADO.y); },
    aoConfirmar: function() {
      var ponto = jogo.pararMira();
      // A mira continua visivel, travada, durante altura e forca.
      alvo.classList.add('mira-travada');
      SFX.clique();
      avancarParaAltura(ponto, tempoUsadoMs);
    }
  });
}

// Etapa: altura = tipo de chute (rasteiro / meia-altura / cavadinha).
// Muda o resultado de verdade: ver RegrasChute.TIPOS.
function avancarParaAltura(pontoMira, tempoUsadoMs) {
  if (estado.etapa !== ETAPA.MIRA) return;
  estado.etapa = ETAPA.ALTURA;
  var msg = document.getElementById('mensagem-etapa');
  msg.textContent = 'Rasteiro, meia-altura ou cavadinha? ⬇️⚽☁️';
  var bloco = document.getElementById('bloco-altura');
  bloco.hidden = false;
  iniciarBarraAltura();

  iniciarEtapaInterativa({
    instrucoes: 'Escolha o tipo de chute na barra: rasteiro à esquerda, meia-altura no meio, cavadinha à direita. Toque, clique ou aperte Enter para travar.',
    aoConfirmar: function() {
      var altura = pararBarraAltura();
      bloco.hidden = true;
      SFX.clique();
      avancarParaForca(pontoMira, altura, tempoUsadoMs);
    }
  });
}

// Etapa: forca (barra oscilante; um toque/clique/Enter trava).
function avancarParaForca(pontoMira, altura, tempoUsadoMs) {
  if (estado.etapa !== ETAPA.ALTURA) return;
  estado.etapa = ETAPA.FORCA;
  var tipo = RegrasChute.tipoPorAltura(altura);
  var msg = document.getElementById('mensagem-etapa');
  msg.textContent = 'Escolha a força do chute! 💪';
  document.getElementById('tipo-escolhido').textContent = '— ' + tipo.nome;
  desenharFaixaIdealForca(tipo.id);
  var bloco = document.getElementById('bloco-forca');
  bloco.hidden = false;
  iniciarBarraForca();

  var dicaTipo = tipo.id === 'cavadinha' ? ' Cavadinha pede força fraquinha.'
    : (tipo.id === 'rasteiro' ? ' Rasteiro pede força forte.' : '');
  iniciarEtapaInterativa({
    instrucoes: 'Chute ' + NOME_TIPO[tipo.id] + '. A barra de força está enchendo: toque, clique ou aperte Enter quando ela estiver na faixa marcada "ideal".' + dicaTipo,
    aoConfirmar: function() {
      var forca = pararBarraForca();
      bloco.hidden = true;
      msg.hidden = true;
      SFX.clique();
      chutarComMiraEForca(pontoMira, forca, altura, tempoUsadoMs);
    }
  });
}

function chutarComMiraEForca(pontoMira, forca, altura, tempoUsadoMs) {
  if (estado.etapa !== ETAPA.FORCA) return;
  estado.etapa = ETAPA.CHUTE;
  document.getElementById('instrucoes-jogo').textContent = '';
  document.getElementById('camada-mira').hidden = true;
  var detalhesBase = { respostaCorreta: true, zonaEscolhida: null, estourouTempo: false, tempoUsadoMs: tempoUsadoMs };
  var aoFinalizar = vincularSessao(function(r) {
    finalizarCobranca({
      respostaCorreta: true,
      bolaDentro: !!(r && r.gol),
      motivo: r && r.motivo,
      tipoChute: r && r.tipo,
      zonaEscolhida: null,
      estourouTempo: false,
      tempoUsadoMs: tempoUsadoMs
    });
  });
  var iniciou = estado.jogoPenalti && estado.jogoPenalti.chutarLivre(pontoMira, forca, altura, aoFinalizar);
  if (!iniciou) {
    // Nunca vira gol automatico: sem animacao, a bola nao entrou.
    agendarNaSessao(function() { finalizarCobranca(Object.assign({ bolaDentro: false, motivo: 'lado' }, detalhesBase)); }, 500);
  }
}

// ---------- Finalizacao (idempotente) ----------

// HU-07: registra cada cobranca como objeto estruturado. So roda UMA vez
// por cobranca: a segunda chamada (clique duplo, callback atrasado) e
// ignorada pela etapa FINALIZADA.
function finalizarCobranca(detalhes) {
  if (estado.etapa === ETAPA.FINALIZADA || estado.etapa === ETAPA.OCIOSA) return;
  estado.etapa = ETAPA.FINALIZADA;
  cancelarEtapaInterativa();

  var tempoUsadoSegundos = Math.min(TIMER_MAX, Math.max(0, Math.round((detalhes.tempoUsadoMs || 0) / 1000)));
  var resultado = RegrasChute.resolverCobranca(!!detalhes.respostaCorreta,
    detalhes.respostaCorreta ? { dentro: !!detalhes.bolaDentro } : null);
  var pontosGanhos = 0;
  var feedback = document.getElementById('mensagem-feedback');

  if (resultado === 'gol') {
    SFX.gol();
    pontosGanhos = calcularPontosPorVelocidade(tempoUsadoSegundos);
    estado.gols++;
    estado.pontuacao += pontosGanhos;
    feedback.textContent = 'GOOOL! +' + pontosGanhos + ' ';
    feedback.appendChild(criarIconeCruzeiro(''));
    feedback.appendChild(document.createTextNode('Cruzeiros!'));
    Narracao.falar('Gol!');
  } else if (resultado === 'fora') {
    // Reaproveita o som existente de "sem gol" — nao criar SFX novo.
    SFX.defesa();
    var motivo = MENSAGEM_FORA[detalhes.motivo] ? detalhes.motivo : 'lado';
    feedback.textContent = MENSAGEM_FORA[motivo];
    Narracao.falar(NARRACAO_FORA[motivo]);
  } else {
    SFX.defesa();
    var frase = FRASES_INCENTIVO[Math.floor(Math.random() * FRASES_INCENTIVO.length)];
    feedback.textContent = (detalhes.estourouTempo ? 'Tempo esgotado! O goleiro defendeu! ' : 'O goleiro defendeu! ') + frase;
    // Incentivo visual dentro do campo, em area segura (nao sai do quadro).
    var incentivo = document.getElementById('incentivo-jogo');
    incentivo.textContent = frase;
    incentivo.hidden = false;
    incentivo.classList.remove('animar'); void incentivo.offsetWidth; incentivo.classList.add('animar');
    Narracao.falar(detalhes.estourouTempo ? 'Tempo esgotado! O goleiro defendeu.' : 'O goleiro defendeu!');
  }

  estado.resultadosCobrancas.push({
    zonaEscolhida: detalhes.zonaEscolhida,
    zonaCorreta: estado.zonaCorreta,
    resultado: resultado,
    motivoFora: resultado === 'fora' ? (detalhes.motivo || 'lado') : null,
    tipoChute: detalhes.tipoChute || null,
    estourouTempo: !!detalhes.estourouTempo,
    pontos: pontosGanhos,
    tempoUsado: tempoUsadoSegundos
  });

  estado.cobrancaAtual++;
  atualizarBolinhasProgresso();
  atualizarDisplayPontuacao();

  agendarNaSessao(function() {
    if (estado.cobrancaAtual >= TOTAL_COBRANCAS) irParaResultado();
    else carregarProximaPergunta();
  }, PAUSA_ENTRE_COBRANCAS);
}

function atualizarDisplayPontuacao() {
  var el = document.getElementById('pontuacao-display');
  if (!el) return;
  el.textContent = estado.pontuacao + ' ';
  el.appendChild(criarIconeCruzeiro('Cruzeiros'));
}

// ---------- Resultado ----------

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
    var resultadoTexto = cobranca.resultado === 'gol' ? 'gol'
      : (cobranca.resultado === 'fora' ? (cobranca.motivoFora === 'fraco' ? 'chute fraco, não chegou ao gol'
        : (cobranca.motivoFora === 'alto' ? 'chute por cima do gol' : 'chute para fora')) : 'defesa');
    var textoCompleto = 'Cobrança ' + (indice + 1) + ' — ' + resultadoTexto;
    if (zonaTexto) textoCompleto = 'Cobrança ' + (indice + 1) + ' — ' + zonaTexto + ' — ' + resultadoTexto;
    if (cobranca.tipoChute && NOME_TIPO[cobranca.tipoChute]) textoCompleto += ' (' + NOME_TIPO[cobranca.tipoChute] + ')';
    if (cobranca.estourouTempo) textoCompleto += ' (tempo esgotado)';

    var texto = document.createElement('span');
    texto.className = 'item-cobranca-texto';
    texto.textContent = textoCompleto;
    item.appendChild(texto);

    lista.appendChild(item);
  });
}

// Codigo compacto por cobranca, salvo no Firestore: G = gol, D = defesa,
// T = defesa por tempo esgotado, F = fora.
function codigoCobranca(c) {
  if (c.resultado === 'gol') return 'G';
  if (c.resultado === 'fora') return 'F';
  return c.estourouTempo ? 'T' : 'D';
}

function montarResumoPartida() {
  var tempoTotal = estado.resultadosCobrancas.reduce(function(s, c) { return s + (c.tempoUsado || 0); }, 0);
  return {
    versaoEsquema: 2,
    faseId: estado.faseAtual,
    dificuldadeId: estado.dificuldadeId,
    selecaoId: estado.selecaoId,
    gols: estado.gols,
    totalCobrancas: TOTAL_COBRANCAS,
    pontuacao: estado.pontuacao,
    tempoTotalSegundos: tempoTotal,
    resumoCobrancas: estado.resultadosCobrancas.map(codigoCobranca).join(''),
    data: new Date().toISOString()
  };
}

function irParaResultado() {
  var fase = Progressao.obterFase(estado.faseAtual);
  var resumo = montarResumoPartida();
  encerrarJogoEmAndamento(); // invalida a sessao: nada mais da partida roda

  var resultadoProgressao = Progressao.registrarResultado(fase.id, estado.gols, estado.pontuacao);

  document.getElementById('titulo-resultado').textContent = fase.tituloResultado;
  document.getElementById('placar-final').textContent = estado.gols + ' / ' + fase.cobrancas;
  var pontuacaoFinal = document.getElementById('pontuacao-final');
  pontuacaoFinal.textContent = estado.pontuacao + ' ';
  pontuacaoFinal.appendChild(criarIconeCruzeiro(''));
  pontuacaoFinal.appendChild(document.createTextNode(estado.pontuacao === 1 ? 'Cruzeiro' : 'Cruzeiros'));

  // Os Cruzeiros da partida vao para a carteira (gastos na Loja).
  ultimoGanho = estado.pontuacao;
  if (typeof Carteira !== 'undefined') Carteira.adicionar(estado.pontuacao);

  // HU-14: manda o resultado pro painel do professor, se estiver numa sala.
  if (Sala.estaNaSala()) {
    Sala.reportarResultado({
      apelido: estado.apelido || 'Craque',
      avatarSeed: estado.avatarSeed,
      gols: estado.gols,
      pontuacao: estado.pontuacao,
      fase: fase.id
    });
  }
  atualizarGanhoCarteira();

  var mensagem = sortearMensagemResultado(estado.gols, fase.cobrancas);
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
      dados: Object.assign({ apelido: estado.apelido, cobrancas: estado.resultadosCobrancas }, resumo)
    }));
  } catch (e) {}

  if (window.FirebaseMathGol) {
    window.FirebaseMathGol.salvarProgresso(resumo);
  }

  Narracao.falar(mensagem);
  mostrarTela('tela-resultado');
}

var ultimoGanho = 0;

function atualizarGanhoCarteira() {
  var el = document.getElementById('ganho-carteira');
  if (!el || typeof Carteira === 'undefined') return;
  el.textContent = (ultimoGanho > 0 ? '+' + Carteira.formatar(ultimoGanho) + ' na sua carteira! ' : '') +
    'Saldo: ' + Carteira.formatar(Carteira.saldo()) + '.';
}

function initResultado() {
  document.getElementById('botao-voltar-menu').addEventListener('click', function() {
    SFX.clique();
    sairParaMenu();
  });
  var botaoLojaResultado = document.getElementById('botao-loja-resultado');
  if (botaoLojaResultado) botaoLojaResultado.addEventListener('click', function() {
    SFX.clique();
    if (typeof Loja !== 'undefined') Loja.abrir('tela-resultado');
  });
  var botaoProxFase = document.getElementById('botao-proxima-fase');
  if (botaoProxFase) {
    botaoProxFase.addEventListener('click', function() {
      SFX.selecionar();
      irParaFases();
    });
  }
}

// ======================================================================
// Modais acessiveis (acessibilidade, creditos, backup)
// ======================================================================
// role="dialog" + aria-modal + aria-labelledby ficam no HTML. Aqui: foco
// entra no modal, Tab fica preso dentro dele, Escape fecha, o foco volta
// pro botao que abriu e o fundo fica inerte (inert) enquanto aberto.

var Modal = (function() {
  var aberto = null; // { sobreposicao, origem, aoFechar }
  var SELETOR_FOCAVEL = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function fundo() {
    return [document.getElementById('app'), document.querySelector('.rodape')].filter(Boolean);
  }

  function focaveis(sobreposicao) {
    return Array.prototype.filter.call(sobreposicao.querySelectorAll(SELETOR_FOCAVEL), function(el) {
      return !el.hidden && el.offsetParent !== null && el.style.display !== 'none';
    });
  }

  function abrir(sobreposicao, origem, opcoes) {
    if (aberto) fechar();
    aberto = { sobreposicao: sobreposicao, origem: origem || document.activeElement, aoFechar: opcoes && opcoes.aoFechar };
    sobreposicao.classList.add('aberta');
    sobreposicao.removeAttribute('aria-hidden');
    fundo().forEach(function(el) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); });
    var dialogo = sobreposicao.querySelector('[role="dialog"]');
    var alvo = dialogo && dialogo.querySelector('h2');
    if (alvo) {
      if (!alvo.hasAttribute('tabindex')) alvo.setAttribute('tabindex', '-1');
      alvo.focus();
    } else {
      var lista = focaveis(sobreposicao);
      if (lista.length) lista[0].focus();
    }
  }

  function fechar() {
    if (!aberto) return;
    var atual = aberto;
    aberto = null;
    atual.sobreposicao.classList.remove('aberta');
    atual.sobreposicao.setAttribute('aria-hidden', 'true');
    fundo().forEach(function(el) { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); });
    if (atual.aoFechar) atual.aoFechar();
    if (atual.origem && typeof atual.origem.focus === 'function') atual.origem.focus();
  }

  document.addEventListener('keydown', function(ev) {
    if (!aberto) return;
    if (ev.key === 'Escape' || ev.key === 'Esc') {
      ev.preventDefault();
      fechar();
      return;
    }
    if (ev.key !== 'Tab') return;
    var lista = focaveis(aberto.sobreposicao);
    if (!lista.length) { ev.preventDefault(); return; }
    var primeiro = lista[0], ultimo = lista[lista.length - 1];
    var ativo = document.activeElement;
    var dentro = aberto.sobreposicao.contains(ativo);
    // Foco no titulo (tabindex=-1) nao esta na lista: Shift+Tab vai pro ultimo.
    if (ev.shiftKey && (ativo === primeiro || !dentro || lista.indexOf(ativo) === -1)) {
      ev.preventDefault(); ultimo.focus();
    } else if (!ev.shiftKey && (ativo === ultimo || !dentro)) {
      ev.preventDefault(); primeiro.focus();
    }
  });

  // Clique fora do painel (no fundo escurecido) fecha.
  function ligarFundo(sobreposicao) {
    sobreposicao.addEventListener('click', function(ev) {
      if (ev.target === sobreposicao && aberto && aberto.sobreposicao === sobreposicao) fechar();
    });
  }

  return { abrir: abrir, fechar: fechar, ligarFundo: ligarFundo, estaAberto: function() { return !!aberto; } };
})();

// ---------- Acessibilidade ----------

function carregarPreferenciasAcessibilidade() {
  var prefs = {};
  try { prefs = JSON.parse(localStorage.getItem('mathgol_acessibilidade') || '{}') || {}; } catch(e) {}
  document.body.classList.toggle('alto-contraste', !!prefs.altoContraste);
  document.body.classList.toggle('espaco-dislexia', !!prefs.espacoDislexia);
  Narracao.alternar(prefs.narracaoAtiva !== undefined ? !!prefs.narracaoAtiva : true);
  SFX.alternar(prefs.sfxAtivo !== undefined ? !!prefs.sfxAtivo : true);
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
  var botaoAbrir = document.getElementById('botao-acessibilidade');
  botaoAbrir.addEventListener('click', function() { Modal.abrir(sobreposicao, botaoAbrir); });
  document.getElementById('botao-fechar-acessibilidade').addEventListener('click', function() { Modal.fechar(); });
  Modal.ligarFundo(sobreposicao);
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
  var botoesSobre = sobreposicao.querySelectorAll('.botao-sobre-mim');

  function recolherBios() {
    botoesSobre.forEach(function(botao) {
      var bio = document.getElementById(botao.getAttribute('aria-controls'));
      botao.setAttribute('aria-expanded', 'false');
      if (bio) bio.hidden = true;
      var card = botao.closest('.dev-card');
      if (card) card.classList.remove('aberto');
    });
  }

  if (botaoAbrir) {
    botaoAbrir.addEventListener('click', function() {
      SFX.clique();
      Modal.abrir(sobreposicao, botaoAbrir, { aoFechar: recolherBios });
    });
  }
  if (botaoFechar) {
    botaoFechar.addEventListener('click', function() {
      SFX.clique();
      Modal.fechar();
    });
  }
  Modal.ligarFundo(sobreposicao);

  botoesSobre.forEach(function(botao) {
    botao.addEventListener('click', function() {
      SFX.clique();
      var bio = document.getElementById(botao.getAttribute('aria-controls'));
      var vaiAbrir = botao.getAttribute('aria-expanded') !== 'true';
      recolherBios();
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

var timerStatusBackup = null;
function mostrarStatusBackup(texto, erro) {
  var el = document.getElementById('backup-status');
  if (!el) return;
  el.textContent = texto;
  el.classList.toggle('erro', !!erro);
  if (timerStatusBackup) clearTimeout(timerStatusBackup);
  timerStatusBackup = setTimeout(function() { el.textContent = ''; }, 6000);
}

function exportarProgressoLocal() {
  var backup = {
    versao: ValidacaoBackup.VERSAO_BACKUP_LOCAL,
    tipo: ValidacaoBackup.TIPO_LOCAL,
    exportadoEm: new Date().toISOString(),
    dados: {}
  };
  try {
    // So as chaves conhecidas. O antigo "mathgol_token" NAO e exportado:
    // ele nunca foi credencial e nao da acesso a nada.
    ValidacaoBackup.CHAVES_LOCAIS_PERMITIDAS.forEach(function(chave) {
      var valor = localStorage.getItem(chave);
      if (valor !== null) backup.dados[chave] = valor;
    });
  } catch (e) {
    console.warn('Erro ao ler localStorage:', e);
  }
  var dataStr = new Date().toISOString().slice(0, 10);
  baixarJSON(backup, 'mathgol-backup-local-' + dataStr + '.json');
  mostrarStatusBackup('✅ Backup local exportado com sucesso!');
}

// Restaura um arquivo de backup ja lido (texto). Separado do FileReader pra
// ficar testavel. Retorna uma Promise<string> com a mensagem de sucesso,
// ou rejeita com uma mensagem amigavel.
function restaurarBackupDeTexto(texto, tamanhoBytes) {
  var analise = ValidacaoBackup.analisarArquivo(texto, tamanhoBytes);
  if (!analise.ok) return Promise.reject(new Error(analise.erro));

  if (analise.tipo === 'local') {
    try {
      analise.entradas.forEach(function(entrada) { localStorage.setItem(entrada.chave, entrada.valor); });
    } catch (e) {
      return Promise.reject(new Error('Não foi possível gravar os dados neste navegador.'));
    }
    return Promise.resolve('local');
  }

  if (!window.FirebaseMathGol) return Promise.reject(new Error('A nuvem (Firebase) não está disponível agora.'));
  return window.FirebaseMathGol.restaurarDadosFirebase(analise.dados).then(function() { return 'firebase'; });
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
      Modal.abrir(sobreposicao, botaoAbrir);
    });
  }
  if (botaoFechar) {
    botaoFechar.addEventListener('click', function() {
      SFX.clique();
      Modal.fechar();
    });
  }
  Modal.ligarFundo(sobreposicao);

  if (botaoLocal) {
    botaoLocal.addEventListener('click', function() {
      SFX.selecionar();
      exportarProgressoLocal();
    });
  }

  if (botaoFirebase) {
    botaoFirebase.addEventListener('click', function() {
      SFX.selecionar();
      if (!window.FirebaseMathGol) {
        mostrarStatusBackup('⚠️ Firebase não disponível.', true);
        return;
      }
      mostrarStatusBackup('⏳ Exportando dados do Firebase...');
      window.FirebaseMathGol.exportarDadosFirebase().then(function(dados) {
        var dataStr = new Date().toISOString().slice(0, 10);
        baixarJSON(dados, 'mathgol-backup-firebase-' + dataStr + '.json');
        mostrarStatusBackup('✅ Backup do Firebase exportado!');
      }).catch(function() {
        mostrarStatusBackup('❌ Não foi possível exportar os dados da nuvem agora.', true);
      });
    });
  }

  if (botaoRestaurar) {
    botaoRestaurar.addEventListener('click', function() {
      SFX.clique();
      inputRestaurar.click();
    });
  }

  // R10: restaurar SUBSTITUI o progresso atual, entao pede confirmacao
  // antes de gravar (o arquivo ja foi validado neste ponto).
  var blocoConfirmar = document.getElementById('confirmar-restauracao');
  var botaoSimRestaurar = document.getElementById('botao-confirmar-restauracao');
  var botaoNaoRestaurar = document.getElementById('botao-cancelar-restauracao');
  var restauracaoPendente = null;

  function esconderConfirmacao() {
    restauracaoPendente = null;
    if (blocoConfirmar) blocoConfirmar.hidden = true;
  }

  function executarRestauracao(texto, tamanho) {
    restaurarBackupDeTexto(texto, tamanho).then(function(tipo) {
      if (tipo === 'local') {
        mostrarStatusBackup('✅ Backup local restaurado! Recarregando...');
        setTimeout(function() { location.reload(); }, 1500);
      } else {
        mostrarStatusBackup('✅ Backup da nuvem restaurado!');
      }
    }).catch(function(erro) {
      mostrarStatusBackup('❌ ' + (erro && erro.message ? erro.message : 'Arquivo de backup inválido.'), true);
    });
  }

  if (botaoSimRestaurar) botaoSimRestaurar.addEventListener('click', function() {
    if (!restauracaoPendente) return;
    SFX.selecionar();
    var p = restauracaoPendente;
    esconderConfirmacao();
    if (botaoRestaurar) botaoRestaurar.focus();
    executarRestauracao(p.texto, p.tamanho);
  });
  if (botaoNaoRestaurar) botaoNaoRestaurar.addEventListener('click', function() {
    SFX.clique();
    esconderConfirmacao();
    mostrarStatusBackup('Restauração cancelada. Nada foi alterado.');
    if (botaoRestaurar) botaoRestaurar.focus();
  });
  // Fechar o modal descarta a confirmacao pendente.
  if (botaoFechar) botaoFechar.addEventListener('click', esconderConfirmacao);
  sobreposicao.addEventListener('click', function(ev) { if (ev.target === sobreposicao) esconderConfirmacao(); });
  document.addEventListener('keydown', function(ev) { if (ev.key === 'Escape') esconderConfirmacao(); });

  if (inputRestaurar) {
    inputRestaurar.addEventListener('change', function(ev) {
      var arquivo = ev.target.files && ev.target.files[0];
      inputRestaurar.value = '';
      esconderConfirmacao();
      if (!arquivo) return;
      if (arquivo.size > ValidacaoBackup.TAMANHO_MAXIMO_BYTES) {
        mostrarStatusBackup('❌ Arquivo grande demais para ser um backup do MathGol.', true);
        return;
      }
      var leitor = new FileReader();
      leitor.onerror = function() { mostrarStatusBackup('❌ Não foi possível ler o arquivo.', true); };
      leitor.onload = function(e) {
        var texto = String(e.target.result || '');
        // Valida ANTES de perguntar: arquivo ruim ja mostra o erro direto.
        var analise = ValidacaoBackup.analisarArquivo(texto, arquivo.size);
        if (!analise.ok) {
          mostrarStatusBackup('❌ ' + analise.erro, true);
          return;
        }
        restauracaoPendente = { texto: texto, tamanho: arquivo.size };
        var el = document.getElementById('backup-status');
        if (el) { el.textContent = ''; el.classList.remove('erro'); }
        if (blocoConfirmar) {
          blocoConfirmar.hidden = false;
          if (botaoNaoRestaurar) botaoNaoRestaurar.focus();
        }
      };
      leitor.readAsText(arquivo);
    });
  }
}

// ---------- HU-14: Sala (lado da crianca) ----------

function atualizarFaixaSala() {
  var faixa = document.getElementById('faixa-sala');
  if (!faixa) return;
  faixa.textContent = '';

  if (!Sala.estaNaSala()) { faixa.hidden = true; return; }
  faixa.hidden = false;

  faixa.appendChild(document.createTextNode('🚪 Sala '));
  var forte = document.createElement('strong');
  forte.textContent = Sala.nome();
  faixa.appendChild(forte);
  faixa.appendChild(document.createTextNode(' · ' + rotuloNivel(Sala.nivelDaSala()) + ' '));

  var sair = document.createElement('button');
  sair.type = 'button';
  sair.className = 'link-sair';
  sair.textContent = 'sair';
  sair.addEventListener('click', function() {
    SFX.clique();
    Sala.sair();
    atualizarFaixaSala();
  });
  faixa.appendChild(sair);
}

function initEntrarSala() {
  var abrir = document.getElementById('botao-entrar-sala');
  var confirmar = document.getElementById('botao-confirmar-sala');
  var voltar = document.getElementById('botao-voltar-entrar-sala');
  var campo = document.getElementById('input-sala');
  var aviso = document.getElementById('aviso-entrar-sala');
  if (!abrir || !confirmar || !campo) return;

  function avisar(txt, classe) {
    aviso.textContent = txt;
    aviso.className = 'aviso-sala' + (classe ? ' ' + classe : '');
  }

  abrir.addEventListener('click', function() {
    SFX.clique();
    avisar('');
    campo.value = '';
    mostrarTela('tela-entrar-sala');
  });
  if (voltar) voltar.addEventListener('click', function() { SFX.clique(); mostrarTela('tela-menu'); });

  confirmar.addEventListener('click', function() {
    SFX.clique();
    var cod = campo.value.trim();
    if (!cod) { avisar('Digite o código primeiro.', 'erro'); return; }

    avisar('Procurando a sala...');
    Sala.entrar(cod, {
      apelido: estado.apelido || 'Craque',
      avatarSeed: estado.avatarSeed
    }).then(function(r) {
      if (!r.ok) {
        avisar(r.motivo === 'offline'
          ? 'Sem conexão com o servidor. Tente de novo em instantes.'
          : 'Sala não encontrada. Confira as letras.', 'erro');
        return;
      }
      avisar('Pronto! Você entrou em ' + r.sala.nome + '.', 'ok');
      atualizarFaixaSala();
      setTimeout(function() { mostrarTela('tela-menu'); }, 1200);
    });
  });
}

// ---------- HU-14: Painel do professor ----------

function preencherSelectNiveis(select, selecionado) {
  if (!select) return;
  select.textContent = '';
  NIVEIS.forEach(function(nv) {
    var o = document.createElement('option');
    o.value = String(nv.id);
    o.textContent = nv.id + ' — ' + nv.nome + ' (' + nv.descricao + ')';
    if (nv.id === selecionado) o.selected = true;
    select.appendChild(o);
  });
}

function tiposMarcados() {
  var marcados = [];
  document.querySelectorAll('#filtros-tipo input:checked').forEach(function(i) {
    marcados.push(i.value);
  });
  return marcados;
}

function renderizarAlunos(lista) {
  var ul = document.getElementById('lista-alunos');
  var contagem = document.getElementById('prof-contagem');
  if (!ul) return;
  contagem.textContent = '(' + lista.length + ')';
  ul.textContent = '';

  if (!lista.length) {
    var vazio = document.createElement('li');
    vazio.className = 'aluno-vazio';
    vazio.textContent = 'Ninguém entrou ainda. Dite o código para a turma.';
    ul.appendChild(vazio);
    return;
  }

  // Mais gols primeiro; empate decide pela pontuacao.
  lista.sort(function(a, b) {
    return (b.gols || 0) - (a.gols || 0) || (b.pontuacao || 0) - (a.pontuacao || 0);
  });

  lista.forEach(function(al) {
    var li = document.createElement('li');
    li.className = 'item-aluno';

    var img = document.createElement('img');
    img.className = 'aluno-avatar';
    img.src = gerarUrlAvatar(al.avatarSeed || AVATAR_PADRAO.seed);
    img.alt = '';
    img.loading = 'lazy';
    li.appendChild(img);

    li.appendChild(criarSpan('aluno-nome', al.apelido || 'Craque'));
    li.appendChild(criarSpan('aluno-placar', (al.gols || 0) + ' ⚽'));
    li.appendChild(criarSpan('aluno-pontos', String(al.pontuacao || 0)));
    ul.appendChild(li);
  });
}

function mostrarPainelDaSala(sala) {
  document.getElementById('prof-sem-sala').hidden = true;
  document.getElementById('prof-com-sala').hidden = false;
  document.getElementById('codigo-sala').textContent = sala.codigo;
  document.getElementById('prof-nivel-atual').textContent = rotuloNivel(sala.nivel);

  var selAtivo = document.getElementById('select-nivel-ativo');
  preencherSelectNiveis(selAtivo, sala.nivel);
  selAtivo.onchange = function() {
    var novo = parseInt(selAtivo.value, 10);
    Sala.mudarNivel(sala.codigo, novo, sala.tipos).then(function() {
      sala.nivel = novo;
      document.getElementById('prof-nivel-atual').textContent = rotuloNivel(novo);
    });
  };

  renderizarAlunos([]);
  Sala.observar(sala.codigo, renderizarAlunos);
}

function initProfessor() {
  var abrir = document.getElementById('botao-professor');
  var criar = document.getElementById('botao-criar-sala');
  var fechar = document.getElementById('botao-fechar-painel');
  var aviso = document.getElementById('aviso-prof');
  if (!abrir || !criar) return;

  function avisar(txt, classe) {
    aviso.textContent = txt;
    aviso.className = 'aviso-sala' + (classe ? ' ' + classe : '');
  }

  // Caixinhas de tipo de conta: deixam o professor restringir a sala a, por
  // exemplo, so subtracao, sem precisar mexer em codigo.
  var caixa = document.getElementById('filtros-tipo');
  if (caixa && !caixa.children.length) {
    Object.keys(TIPOS_OPERACAO).forEach(function(t) {
      var id = 'tipo-' + t;
      var rotulo = document.createElement('label');
      rotulo.className = 'chip-tipo';
      rotulo.setAttribute('for', id);
      var cx = document.createElement('input');
      cx.type = 'checkbox';
      cx.id = id;
      cx.value = t;
      rotulo.appendChild(cx);
      rotulo.appendChild(document.createTextNode(
        ' ' + TIPOS_OPERACAO[t].simbolo + ' ' + TIPOS_OPERACAO[t].nome));
      caixa.appendChild(rotulo);
    });
  }

  abrir.addEventListener('click', function() {
    SFX.clique();
    avisar('');
    preencherSelectNiveis(document.getElementById('select-nivel-sala'), 1);
    document.getElementById('prof-sem-sala').hidden = false;
    document.getElementById('prof-com-sala').hidden = true;
    mostrarTela('tela-professor');
  });

  criar.addEventListener('click', function() {
    SFX.selecionar();
    if (!window.FirebaseMathGol) { avisar('Sem conexão com o servidor.', 'erro'); return; }

    avisar('Criando a sala...');
    Sala.criar({
      nome: (document.getElementById('input-nome-turma').value || '').trim() || 'Turma',
      nivel: parseInt(document.getElementById('select-nivel-sala').value, 10) || 1,
      tipos: tiposMarcados()
    }).then(function(sala) {
      if (!sala) { avisar('Não consegui criar a sala. Tente de novo.', 'erro'); return; }
      avisar('');
      mostrarPainelDaSala(sala);
    });
  });

  if (fechar) fechar.addEventListener('click', function() {
    SFX.clique();
    Sala.pararDeObservar(); // listener do Firestore nao pode ficar aberto
    mostrarTela('tela-menu');
  });
}

// ---------- Init ----------

document.addEventListener('DOMContentLoaded', function() {
  // O antigo identificador "mathgol_token" nao e credencial e nao da acesso
  // a nada (a identidade agora e o uid do Firebase Auth). Remove a sobra.
  try { localStorage.removeItem('mathgol_token'); } catch (e) {}

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
  initSaldoTopo();
  if (typeof initLoja === 'function') initLoja();
  if (typeof initTutorial === 'function') initTutorial();
  initCreditos();
  initBackup();
  initEntrarSala();
  initProfessor();
  mostrarTela('tela-menu', { focar: false });

});

// O Firebase chega depois (import dinamico em carregar-externos.js): quando
// ficar pronto, aplica as configuracoes remotas validadas.
function carregarConfiguracoesRemotas() {
  if (!window.FirebaseMathGol) return;
  // Sala so pode ser reaberta depois que o Firebase existe.
  Sala.restaurar().then(atualizarFaixaSala);

  window.FirebaseMathGol.carregarConfiguracoes().then(function(config) {
    aplicarConfiguracoesRemotas(config);
  }).catch(function(erro) {
    console.warn('Configuracoes remotas indisponiveis; usando padrao:', erro);
  });
}
document.addEventListener('mathgol:firebase-pronto', carregarConfiguracoesRemotas);
