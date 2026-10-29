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
// Sobe de 300 para 900 ms: a etapa 1 (conta certa) precisa de tempo de
// tela para a crianca ver a torcida reagir antes de ir para a mira.
var PAUSA_ANTES_DA_MIRA = 900;
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

// ======================================================================
// Festa da jogada — as duas etapas (Sprint 4)
// ======================================================================
//
// O retorno do professor na Sprint 4 foi: "tanto quando a crianca acerta
// quanto quando erra aparece um feedback, mas sem destaque; precisei
// prestar muita atencao para ver". A .mensagem-feedback continua no
// lugar (e dela que os testes leem o texto), mas quem fala com a
// crianca agora e a FAIXA, que ocupa o meio do campo.
//
// A jogada tem duas etapas, e elas sao avaliadas separadamente:
//
//   ETAPA 1  a conta. Acertou -> torcida da um grito curto, o batedor
//            fica em pose confiante e a faixa marca "conta certa".
//   ETAPA 2  o chute. Gol -> festa completa. Fora/defesa COM a conta
//            certa -> acolhimento, porque a parte de matematica, que e
//            o que o jogo ensina, ela acertou.
//
// Por isso existem tres conjuntos de frase, e nao dois: errar o chute
// depois de acertar a conta nao e a mesma coisa que errar a conta.
var FRASES_GOL = [
  'GOLAÇO! Você é um craque da matemática!',
  'INCRÍVEL! Resposta e chute perfeitos!',
  'QUE GOL! A conta certa virou gol!',
  'ESPETACULAR! Matemática e futebol juntos!',
  'SHOW DE BOLA! Você acertou tudo!'
];
// Acertou a conta, perdeu o gol. Nunca "voce errou": a conta estava certa.
var FRASES_QUASE = [
  'Quase lá! Sua conta estava certinha, você é muito inteligente. Tente o chute de novo, você consegue!',
  'A conta você matou! Faltou só o chute. Na próxima a bola entra!',
  'Isso! A matemática estava perfeita. Agora é só caprichar na pontaria!',
  'Você acertou o mais difícil, que era a conta. O gol vem na próxima!'
];
// Errou a conta: convida a tentar de novo, sem dizer que ela é ruim.
var FRASES_CONTA = [
  'Não foi dessa vez! Vamos tentar a próxima conta juntos?',
  'Ops! Essa escapou. A próxima é sua!',
  'Errar faz parte do treino. Bora para a próxima!'
];
var FRASES_ACERTO_CONTA = ['Conta certa! Agora é o chute!', 'Isso! Resposta correta!', 'Acertou! Prepara o pé!'];

function sortear(lista) { return lista[Math.floor(Math.random() * lista.length)]; }

// Mostra a faixa grande no meio do campo. duracao em ms; 0 = fica ate
// alguem chamar esconderFaixa(). Sempre passa pela sessao: sair da
// partida no meio nao pode deixar a faixa acesa na tela seguinte.
// Tempo minimo que a faixa fica na tela. Existe por causa do movimento
// reduzido: ali as animacoes duram 1 ms, a cobranca seguinte entra quase
// na hora e a faixa era apagada antes de alguem conseguir ler. A frase e
// conteudo, nao enfeite — quem desligou animacao tambem precisa dela.
var TEMPO_MINIMO_FAIXA = 1600;
var faixaDesde = 0;

function mostrarFaixa(tipo, texto, duracao) {
  var faixa = document.getElementById('faixa-celebracao');
  var alvo = document.getElementById('faixa-celebracao-texto');
  if (!faixa || !alvo) return;
  faixa.classList.remove('saindo');
  faixa.setAttribute('data-tipo', tipo);
  alvo.textContent = texto;
  faixa.hidden = false;
  faixaDesde = Date.now();
  if (duracao > 0) agendarNaSessao(function() { esconderFaixa(); }, duracao);
}

// Chamada quando a pergunta seguinte entra. Se a faixa acabou de subir,
// adia a limpeza ate completar o tempo minimo de leitura.
function limparFaixaDaCobrancaAnterior() {
  var faixa = document.getElementById('faixa-celebracao');
  if (!faixa || faixa.hidden) return;
  var naTela = Date.now() - faixaDesde;
  if (naTela >= TEMPO_MINIMO_FAIXA) { esconderFaixa(); return; }
  agendarNaSessao(function() { esconderFaixa(); }, TEMPO_MINIMO_FAIXA - naTela);
}

function esconderFaixa() {
  var faixa = document.getElementById('faixa-celebracao');
  if (!faixa || faixa.hidden) return;
  faixa.classList.add('saindo');
  // Espera a animacao de saida; se o navegador estiver com movimento
  // reduzido ela nao roda, mas o timeout fecha do mesmo jeito.
  agendarNaSessao(function() {
    faixa.hidden = true;
    faixa.classList.remove('saindo');
  }, 260);
}

// Pede a cena 3D a reacao de torcida + pose do batedor. A cena 2D nao
// tem reagir(): neste caso so a faixa aparece, e esta tudo certo.
function reagirNaCena(tipo) {
  var jogo = estado.jogoPenalti;
  if (jogo && typeof jogo.reagir === 'function') jogo.reagir(tipo);
}

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

// Os avatares sao arquivos NOSSOS, servidos junto com o jogo. Antes vinham
// da api.dicebear.com: isso custava uma requisicao a um dominio de terceiro
// no navegador da crianca (apontamento SEC-05 de LGPD), levava mais de 6
// segundos para desenhar numa conexao boa e, pior, sorteava um rosto humano
// qualquer — o avatar chamado "Tigre" nunca foi um tigre. O nome do arquivo
// e a MESMA seed de antes, entao os perfis ja salvos continuam valendo.
function gerarUrlAvatar(seed) {
  return '../Imagens/avatares/' + encodeURIComponent(seed) + '.svg';
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
  // v2.0: avisos de conquista guardados durante a partida saem agora.
  if (typeof Toasts !== 'undefined') Toasts.liberar();
  if (idTela === 'tela-menu' && typeof TelasV2 !== 'undefined') TelasV2.atualizarResumos();
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
  ['bloco-forca', 'bloco-altura', 'mensagem-etapa', 'incentivo-jogo', 'faixa-celebracao'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.hidden = true;
  });
  // A festa roda em requestAnimationFrame proprio: sem isto ela
  // continuaria desenhando depois de sair da partida (mesma familia dos
  // defeitos DEF-01/DEF-02 da Sprint 3).
  if (typeof Festa !== 'undefined') Festa.parar();
  var tela = document.getElementById('tela-fase1');
  if (tela) tela.classList.remove('foco-campo');
}

// Telas que podem ser abertas de varios lugares (Loja e Tutorial) guardam
// de onde vieram; o "voltar" leva de volta pra la (e redesenha a tela,
// pra ja mostrar o que foi comprado).
var origemTela = { 'tela-loja': 'tela-menu', 'tela-tutorial': 'tela-menu',
  'tela-conquistas': 'tela-menu', 'tela-perfil': 'tela-menu' };

function reabrirTela(idTela) {
  if (idTela === 'tela-apelido') { irParaApelido(); return; }
  if (idTela === 'tela-perfil' && typeof TelasV2 !== 'undefined') { TelasV2.abrirPerfil(origemTela['tela-perfil']); return; }
  if (idTela === 'tela-conquistas' && typeof TelasV2 !== 'undefined') { TelasV2.abrirConquistas(origemTela['tela-conquistas']); return; }
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

var apelidoVoltaParaPerfil = false;

function irParaApelido(opcoes) {
  apelidoVoltaParaPerfil = !!(opcoes && opcoes.voltarParaPerfil);
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

// v2.0: o craque escolhido fica salvo (conta.js). Ao abrir o jogo, ja vem
// preenchido — a crianca nao precisa montar tudo de novo a cada visita.
function restaurarCraqueSalvo() {
  if (typeof Conta === 'undefined') return;
  var p = Conta.perfil();
  if (p.personagem) estado.personagemEscolhido = p.personagem;
  if (p.animal) estado.animalEscolhido = p.animal;
  if (p.avatarSeed) estado.avatarSeed = p.avatarSeed;
  estado.apelido = Conta.apelido();
}

function initApelido() {
  document.getElementById('botao-confirmar-apelido').addEventListener('click', function() {
    if (!estado.apelido) return;
    SFX.selecionar();
    if (typeof Conta !== 'undefined') {
      Conta.salvarPerfil({
        personagem: estado.personagemEscolhido,
        animal: estado.animalEscolhido,
        avatarSeed: estado.avatarSeed
      });
    }
    // Nao bloqueia o jogo: o firebase-config.js aguarda a autenticacao
    // anonima ficar pronta (com tempo limite) antes de gravar.
    if (window.FirebaseMathGol) {
      window.FirebaseMathGol.salvarPerfil({
        apelido: estado.apelido,
        avatarSeed: estado.avatarSeed
      });
    }
    // Veio do "Meu craque" so para trocar nome/avatar: volta para la.
    if (apelidoVoltaParaPerfil && typeof TelasV2 !== 'undefined') {
      apelidoVoltaParaPerfil = false;
      TelasV2.abrirPerfil(origemTela['tela-perfil']);
      return;
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

// Escudo PROPRIO do clube: cores e padrao da camisa + sigla. NAO e o
// escudo oficial — esse e marca registrada do clube e o jogo esta
// publicado na web. Cores e listras nao sao protegidas, e sao elas que
// a crianca usa pra reconhecer o time de longe.
// O desenho de cada padrao mora no CSS (.escudo-clube[data-padrao=...]).
function criarEscudoClube(time, classeExtra) {
  var escudo = document.createElement('span');
  escudo.className = 'escudo-clube' + (classeExtra ? ' ' + classeExtra : '');
  escudo.setAttribute('aria-hidden', 'true');
  var c1 = COR_VALIDA.test(time.corPrimaria || '') ? time.corPrimaria : '#21303B';
  var c2 = COR_VALIDA.test(time.corSecundaria || '') ? time.corSecundaria : '#FFFDF6';
  // Tricolor sem a 3a cor cai no bicolor em vez de sumir com uma faixa.
  var c3 = COR_VALIDA.test(time.corTerciaria || '') ? time.corTerciaria : c2;
  escudo.style.setProperty('--cor-1', c1);
  escudo.style.setProperty('--cor-2', c2);
  escudo.style.setProperty('--cor-3', c3);
  // Padrao desconhecido (ou lista remota antiga, sem o campo) vira 'liso'.
  escudo.setAttribute('data-padrao', padraoDoEscudo(time.padrao));
  // Camisa clara precisa de aro escuro pra nao sumir no fundo da Loja.
  if (corEhClara(c1)) escudo.setAttribute('data-claro', '1');

  var sigla = document.createElement('span');
  sigla.className = 'escudo-sigla';
  sigla.textContent = (time.sigla || time.nome.slice(0, 3)).toUpperCase();
  // Texto claro ou escuro conforme a cor de fundo da faixa da sigla.
  sigla.style.color = corEhClara(c1) ? '#111111' : '#FFFFFF';
  escudo.appendChild(sigla);
  return escudo;
}

function padraoDoEscudo(valor) {
  var conhecidos = (typeof PADROES_ESCUDO !== 'undefined')
    ? PADROES_ESCUDO
    : ['liso', 'vertical', 'horizontal', 'diagonal', 'faixa-h', 'tricolor-v', 'tricolor-h'];
  return conhecidos.indexOf(valor) === -1 ? 'liso' : valor;
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

// ======================================================================
// v2.2 — Copa do Mundo 2026 (JS/copa.js)
// ======================================================================
// A tela "fases" virou a jornada da Copa: proximo jogo, campanha, tabela do
// grupo e os 12 grupos. O treino livre (as 3 fases antigas) fica embaixo.

// Bandeira pequena de um time da Copa (ou o escudo/bandeira do time da
// crianca, quando ela joga com clube).
function visualTimeCopa(t) {
  if (t.voce) {
    var meu = SELECOES.find(function(s) { return s.id === Copa.estado().selecaoId; });
    var v = meu ? criarVisualTime(meu, 'copa-bandeira') : null;
    if (v) return v;
  }
  if (t.bandeira && codigoBandeiraValido(t.bandeira)) return criarBandeira(t.bandeira, 'copa-bandeira');
  return criarSpan('copa-bandeira copa-bandeira-vazia', '⚽');
}

function linhaTimeCopa(t) {
  var s = document.createElement('span');
  s.className = 'copa-time' + (t.voce ? ' copa-time-voce' : '');
  s.appendChild(visualTimeCopa(t));
  s.appendChild(criarSpan('copa-time-nome', t.voce ? t.nome + ' (você)' : t.nome));
  return s;
}

function tabelaGrupoCopa(letra, linhas, destaque) {
  var tab = document.createElement('table');
  tab.className = 'copa-tabela' + (destaque ? ' copa-tabela-destaque' : '');
  var cap = document.createElement('caption');
  cap.textContent = 'Grupo ' + letra;
  tab.appendChild(cap);
  var cab = document.createElement('tr');
  ['', 'Time', 'P', 'J', 'V', 'E', 'D', 'SG'].forEach(function(h, i) {
    var th = document.createElement('th');
    th.scope = 'col';
    th.textContent = h;
    if (i === 2) th.title = 'Pontos';
    cab.appendChild(th);
  });
  tab.appendChild(cab);
  linhas.forEach(function(l, i) {
    var tr = document.createElement('tr');
    if (l.time.voce) tr.className = 'copa-linha-voce';
    else if (i < 2) tr.className = 'copa-linha-classifica';
    var pos = document.createElement('td'); pos.textContent = (i + 1) + 'º'; tr.appendChild(pos);
    var nome = document.createElement('td'); nome.appendChild(linhaTimeCopa(l.time)); tr.appendChild(nome);
    [l.pts, l.j, l.v, l.e, l.d, l.gp - l.gc].forEach(function(v) {
      var td = document.createElement('td'); td.textContent = String(v); tr.appendChild(td);
    });
    tab.appendChild(tr);
  });
  return tab;
}

function renderizarCopa() {
  var painel = document.getElementById('copa-painel');
  var botao = document.getElementById('botao-jogar-copa');
  var nova = document.getElementById('botao-nova-copa');
  if (!painel || typeof Copa === 'undefined') return;
  painel.textContent = '';

  // Sem Copa ainda (ou terminou): oferece comecar com o time escolhido.
  var r = Copa.ativa() ? Copa.resumo() : null;
  var time = SELECOES.find(function(s) { return s.id === estado.selecaoId; });
  if (!r) {
    var intro = document.createElement('div');
    intro.className = 'copa-cartao copa-intro';
    if (time) {
      var vt = criarVisualTime(time, 'copa-bandeira copa-bandeira-grande');
      if (vt) intro.appendChild(vt);
    }
    intro.appendChild(criarSpan('copa-titulo-cartao', 'Leve ' + (time ? time.nome : 'seu time') + ' até a taça!'));
    intro.appendChild(criarSpan('copa-texto', 'Fase de grupos (3 jogos), depois mata-mata até a grande final. ' +
      'Cada jogo é uma disputa de pênaltis: acerte a conta, mire e chute!'));
    painel.appendChild(intro);
    botao.textContent = 'Começar a Copa! 🏟️';
    botao.disabled = false;
    nova.hidden = true;
    renderizarTodosOsGrupos(null);
    return;
  }

  var outro = time && time.id !== r.selecaoId && r.status === 'andando';
  if (r.proximo) {
    var j = r.proximo;
    var cartao = document.createElement('div');
    cartao.className = 'copa-cartao copa-proximo' + (j.etapa.id === 'final' ? ' copa-proximo-final' : '');
    cartao.appendChild(criarSpan('copa-etapa', j.etapa.nome));
    var confronto = document.createElement('span');
    confronto.className = 'copa-confronto';
    confronto.appendChild(linhaTimeCopa(j.voce));
    confronto.appendChild(criarSpan('copa-x', 'x'));
    confronto.appendChild(linhaTimeCopa(j.adversario));
    cartao.appendChild(confronto);
    var fase = Progressao.obterFase(j.faseId);
    cartao.appendChild(criarSpan('copa-texto', fase.cobrancas + ' cobranças · ' + fase.timerMax + ' s por conta' +
      (j.mataMata ? ' · empate vai para a morte súbita' : '')));
    painel.appendChild(cartao);
    botao.textContent = j.etapa.id === 'final' ? 'Jogar a FINAL! 🏆' : 'Jogar! 🏟️';
    botao.disabled = false;
    if (outro) {
      painel.appendChild(criarSpan('copa-aviso', 'Sua Copa está com ' + (SELECOES.find(function(s) { return s.id === r.selecaoId; }) || { nome: 'outro time' }).nome +
        '. Para jogar com ' + time.nome + ', comece uma nova Copa.'));
    }
  } else {
    var fim = document.createElement('div');
    fim.className = 'copa-cartao ' + (r.status === 'campeao' ? 'copa-campea' : 'copa-eliminada');
    fim.appendChild(criarSpan('copa-titulo-cartao', r.status === 'campeao' ? '🏆 CAMPEÃO DO MUNDO! 🏆' : 'Fim da Copa para você'));
    fim.appendChild(criarSpan('copa-texto', r.status === 'campeao'
      ? 'Você levantou a taça da Copa 2026! Que tal jogar outra Copa num nível mais difícil?'
      : 'Valeu a campanha! Cada conta te deixa mais craque. Bora pra próxima Copa?'));
    painel.appendChild(fim);
    botao.textContent = 'Nova Copa! 🏟️';
    botao.disabled = false;
  }
  nova.hidden = r.status !== 'andando' || !r.campanha.length;

  // Campanha: cada jogo ja feito.
  if (r.campanha.length) {
    var ol = document.createElement('ol');
    ol.className = 'copa-campanha';
    ol.setAttribute('aria-label', 'Sua campanha');
    r.campanha.forEach(function(c) {
      var li = document.createElement('li');
      li.className = 'copa-jogo copa-jogo-' + (c.gp > c.gc ? 'v' : (c.gp === c.gc ? 'e' : 'd'));
      li.appendChild(criarSpan('copa-jogo-etapa', c.etapa.curto));
      li.appendChild(criarSpan('copa-jogo-placar', c.gp + ' x ' + c.gc + (c.morteSubita ? ' (m.s.)' : '')));
      li.appendChild(linhaTimeCopa(c.adversario));
      ol.appendChild(li);
    });
    painel.appendChild(ol);
  }
  painel.appendChild(tabelaGrupoCopa(r.grupo, r.tabelas[r.grupo], true));
  renderizarTodosOsGrupos(r);
}

function renderizarTodosOsGrupos(r) {
  var caixa = document.getElementById('copa-grupos');
  if (!caixa) return;
  caixa.textContent = '';
  if (r) {
    Object.keys(r.tabelas).forEach(function(g) { caixa.appendChild(tabelaGrupoCopa(g, r.tabelas[g], g === r.grupo)); });
    return;
  }
  // Antes de comecar: os grupos do sorteio, sem pontos.
  Object.keys(CopaDados.GRUPOS).forEach(function(g) {
    caixa.appendChild(tabelaGrupoCopa(g, CopaDados.GRUPOS[g].map(function(t) {
      return { time: { nome: t[1], bandeira: t[0], voce: false }, pts: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0 };
    }), false));
  });
}

function jogarCopa() {
  var r = Copa.ativa() ? Copa.resumo() : null;
  if (!r || r.status !== 'andando') Copa.iniciar(estado.selecaoId || 'brasil');
  var jogo = Copa.proximoJogo();
  if (!jogo) { renderizarCopa(); return; }
  estado.copaJogo = jogo;
  // A camisa e a do time da Copa (pode ser outro que o escolhido agora).
  estado.selecaoId = Copa.estado().selecaoId;
  estado.faseAtual = jogo.faseId;
  iniciarPartida();
}

// Titulo da barra da partida: etapa e placar ao vivo contra o adversario.
function tituloCopa() {
  var j = estado.copaJogo;
  return '🌎 ' + j.etapa.curto + (j.morteSubita ? ' · MORTE SÚBITA' : '') + ' · ' +
    estado.gols + ' x ' + j.golsAdv + ' ' + j.adversario.nome;
}

// ======================================================================
// v2.2 — Duelo de pênaltis (2 jogadores no mesmo aparelho)
// ======================================================================
// Cada um bate DUELO_COBRANCAS, alternando (jogador 1, jogador 2, ...).
// Empate: morte súbita em pares, até 3 pares. O jogador 2 escolhe o nome
// numa lista (nada de texto livre). Os Cruzeiros e as conquistas são só do
// dono do aparelho (jogador 1), pelas cobranças dele. O duelo não vai para
// o histórico da nuvem nem para a sala (não é uma fase do jogo).
var DUELO_COBRANCAS = 5;
var DUELO_PARES_EXTRAS = 3;

function vezDoDuelo() { return estado.duelo ? estado.cobrancaAtual % 2 : 0; }
// Conquistas e contas certas contam so para o dono do aparelho.
function vezDoDono() { return !estado.duelo || vezDoDuelo() === 0; }

function tituloDuelo() {
  var d = estado.duelo;
  return '🤝 ' + d.nomes[0] + ' ' + d.gols[0] + ' x ' + d.gols[1] + ' ' + d.nomes[1] +
    (d.extras ? ' · MORTE SÚBITA' : '') + ' · vez de ' + d.nomes[vezDoDuelo()];
}

function abrirDuelo(origem) {
  var n1 = (typeof Conta !== 'undefined' && Conta.apelido()) || estado.apelido || 'Jogador 1';
  document.getElementById('duelo-jogador1').textContent = n1;
  var lista = document.getElementById('duelo-jogadores2');
  var comecar = document.getElementById('botao-comecar-duelo');
  lista.textContent = '';
  comecar.disabled = true;
  var escolhido = null;
  PERSONAGENS.concat(['Convidado', 'Convidada']).forEach(function(nome) {
    if (nome === n1 || nome === n1.split(' ')[0]) return; // dois "Capitão" confundem
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip-escolha';
    chip.textContent = nome;
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', function() {
      SFX.clique();
      escolhido = nome;
      marcarSelecionado(lista, '.chip-escolha', 'chip-ativo', chip);
      comecar.disabled = false;
    });
    lista.appendChild(chip);
  });
  comecar.onclick = function() {
    if (!escolhido) return;
    SFX.selecionar();
    Modal.fechar();
    estado.copaJogo = null;
    estado.duelo = { nomes: [n1, escolhido], gols: [0, 0], extras: 0 };
    estado.faseAtual = 'penaltis'; // relogio de 15 s e contas no nivel escolhido
    iniciarPartida();
  };
  Modal.abrir(document.getElementById('sobreposicao-duelo'), origem);
}

// Placar de cada jogador a partir das cobrancas (par = 1, impar = 2).
function golsDoDuelo() {
  var g = [0, 0];
  estado.resultadosCobrancas.forEach(function(c, i) { if (c.resultado === 'gol') g[i % 2]++; });
  return g;
}

function irParaResultadoDuelo() {
  var d = estado.duelo;
  encerrarJogoEmAndamento();
  var g = golsDoDuelo();
  // Cruzeiros: so as cobrancas do dono do aparelho.
  var pontosDono = estado.resultadosCobrancas.reduce(function(s, c, i) { return s + (i % 2 === 0 ? (c.pontos || 0) : 0); }, 0);
  var vencedor = g[0] > g[1] ? 0 : (g[1] > g[0] ? 1 : -1);
  document.getElementById('titulo-resultado').textContent = vencedor < 0
    ? '🤝 Empate no duelo!' : '🏆 ' + d.nomes[vencedor] + ' venceu o duelo!';
  document.getElementById('placar-final').textContent = g[0] + ' x ' + g[1];
  var pontuacaoFinal = document.getElementById('pontuacao-final');
  pontuacaoFinal.textContent = pontosDono + ' ';
  pontuacaoFinal.appendChild(criarIconeCruzeiro(''));
  pontuacaoFinal.appendChild(document.createTextNode('Cruzeiros de ' + d.nomes[0]));
  ultimoGanho = pontosDono;
  ultimoGanhoConquistas = 0;
  if (typeof Carteira !== 'undefined') {
    var antes = Carteira.saldo();
    Carteira.adicionar(pontosDono);
    if (typeof Conquistas !== 'undefined') Conquistas.registrar('duelo-fim');
    ultimoGanhoConquistas = Math.max(0, Carteira.saldo() - antes - pontosDono);
  }
  atualizarGanhoCarteira();
  var mensagem = vencedor < 0
    ? 'Empatou até na morte súbita! Revanche?'
    : 'Parabéns, ' + d.nomes[vencedor] + '! E ' + d.nomes[1 - vencedor] + ' jogou demais também. Revanche?';
  document.getElementById('resumo-resultado').textContent = mensagem;
  renderizarListaCobrancas();
  var el = document.getElementById('mensagem-desbloqueio');
  if (el) { el.textContent = ''; el.classList.remove('visivel'); }
  if (typeof TelasV2 !== 'undefined') TelasV2.mostrarEstrelas(g[0], DUELO_COBRANCAS);
  SFX.faseCompleta();
  estado.duelo = null;
  mostrarTela('tela-resultado');
  Narracao.falar(mensagem, { tom: 'resultado' });
}

function irParaFases() {
  renderizarCopa();
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
    estado.copaJogo = null; // treino livre: sem adversario, sem Copa
    estado.duelo = null;
    iniciarPartida();
  });
  var jogar = document.getElementById('botao-jogar-copa');
  if (jogar) jogar.addEventListener('click', function() { SFX.selecionar(); estado.duelo = null; jogarCopa(); });
  var duelo = document.getElementById('botao-modo-duelo');
  if (duelo) duelo.addEventListener('click', function() { SFX.clique(); abrirDuelo(duelo); });
  document.getElementById('botao-cancelar-duelo').addEventListener('click', function() { SFX.clique(); Modal.fechar(); });
  Modal.ligarFundo(document.getElementById('sobreposicao-duelo'));
  var botao = document.getElementById('botao-modo-botao');
  if (botao) botao.addEventListener('click', function() {
    SFX.clique();
    if (typeof FutebolBotao !== 'undefined') FutebolBotao.abrir('tela-fases');
  });
  var nova = document.getElementById('botao-nova-copa');
  // Recomecar apaga a campanha: pede um segundo toque para confirmar.
  var confirmarNova = null;
  if (nova) nova.addEventListener('click', function() {
    SFX.clique();
    if (!confirmarNova) {
      nova.textContent = '⚠️ Toque de novo para apagar esta Copa e começar outra';
      confirmarNova = setTimeout(function() { confirmarNova = null; nova.textContent = '🔄 Começar uma nova Copa'; }, 4000);
      return;
    }
    clearTimeout(confirmarNova); confirmarNova = null;
    nova.textContent = '🔄 Começar uma nova Copa';
    Copa.apagar();
    if (typeof Conta !== 'undefined') Conta.marcarMudanca();
    renderizarCopa();
  });
}

// ======================================================================
// Partida (usada por TODAS as fases: Penaltis, Falta e Final)
// ======================================================================

// Cria a cena: 3D quando possivel; senao, modo simplificado 2D com a
// mesma regra. Se nem o 2D abrir, devolve null e a partida NAO comeca.
// v2.2: nome e numero nas costas da camisa e a comemoracao escolhida.
// No duelo (2 jogadores), estado.opcoesCena troca pelo jogador da vez.
function opcoesDaCena() {
  if (estado.opcoesCena) return estado.opcoesCena;
  if (typeof Conta === 'undefined') return {};
  return { nome: Conta.nomeCamisa(), numero: Conta.numeroCamisa(), comemoracao: Conta.comemoracaoAtual() };
}

function criarCenaDaPartida() {
  var container = document.getElementById('jogo-penalti');
  container.textContent = '';
  try {
    if (typeof THREE === 'undefined') throw new Error('Three.js nao carregou');
    return criarJogoPenalti('jogo-penalti', estado.selecaoId, opcoesDaCena());
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
  saldoNoInicioDaPartida = typeof Carteira !== 'undefined' ? Carteira.saldo() : null;

  BancoQuestoes.resetarSessao();

  // v2.2: jogo da Copa comeca do zero contra o mesmo adversario (sair no
  // meio e voltar repete o jogo, sem placar velho).
  if (estado.copaJogo) {
    estado.copaJogo.golsAdv = 0;
    estado.copaJogo.chutesAdv = [];
    estado.copaJogo.morteSubita = false;
  }
  if (estado.duelo) {
    TOTAL_COBRANCAS = DUELO_COBRANCAS * 2;
    estado.duelo.gols = [0, 0];
    estado.duelo.extras = 0;
  }
  var tituloFase = document.getElementById('titulo-fase');
  if (tituloFase) {
    tituloFase.textContent = estado.duelo ? tituloDuelo()
      : (estado.copaJogo ? tituloCopa() : fase.icone + ' ' + fase.nome);
  }

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
  // v2.1: baixa ja as falas do locutor desta partida (gol, quase, defesa...).
  if (typeof Falas !== 'undefined' && Narracao.preCarregar) Narracao.preCarregar(Falas.daPartida());
  // v2.0: a torcida levanta as placas de "VAMOS!" no apito inicial.
  reagirNaCena('inicio');
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
  // A faixa da cobranca anterior sai, mas so depois de ter ficado tempo
  // suficiente na tela para ser lida (ver TEMPO_MINIMO_FAIXA).
  limparFaixaDaCobrancaAnterior();
  if (typeof Festa !== 'undefined') Festa.parar();
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
  Narracao.falar(estado.perguntaAtual.textoFalado, { tom: 'pergunta' });
  iniciarTimer();
}

function initFase1() {
  var botaoOuvir = document.getElementById('botao-ouvir-novamente');
  if (botaoOuvir) {
    botaoOuvir.addEventListener('click', function() {
      // Pedido explicito da crianca: fala mesmo com a narracao automatica
      // desligada (antes o botao nao fazia nada nesse caso).
      SFX.clique();
      if (estado.perguntaAtual) Narracao.falar(estado.perguntaAtual.textoFalado, { forcar: true, tom: 'pergunta' });
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
    if (typeof Conquistas !== 'undefined' && vezDoDono()) Conquistas.registrar('conta-certa', { tempoMs: tempoUsadoMs });
    // v2.2: a cada 10 contas certas seguidas a torcida levanta as placas da AURA.
    estado.sequenciaAcertos = (estado.sequenciaAcertos || 0) + 1;
    document.getElementById('mensagem-feedback').textContent = '✓ Resposta correta!';
    // ETAPA 1: grito curto da torcida + batedor em pose confiante,
    // enquanto a faixa confirma a conta. A pausa antes da mira subiu de
    // 300 para 900 ms: com 300 a crianca nem via que tinha acertado.
    reagirNaCena('acerto');
    if (estado.sequenciaAcertos % 10 === 0) reagirNaCena('aura');
    // v2.1: o locutor tambem comemora a conta certa (a mesma frase da faixa).
    var fraseAcerto = sortear(FRASES_ACERTO_CONTA);
    Narracao.falar(fraseAcerto, { tom: 'premio' });
    mostrarFaixa('acerto', fraseAcerto, PAUSA_ANTES_DA_MIRA - 120);
    agendarNaSessao(function() { avancarParaMira(tempoUsadoMs); }, PAUSA_ANTES_DA_MIRA);
    return;
  }

  estado.etapa = ETAPA.CHUTE;
  estado.sequenciaAcertos = 0;
  if (typeof Conquistas !== 'undefined' && vezDoDono()) Conquistas.registrar('conta-errada');
  document.getElementById('mensagem-feedback').textContent = '✗ Resposta errada!';
  chutarParaDefesa(zonaId, { respostaCorreta: false, zonaEscolhida: zonaId, estourouTempo: false, tempoUsadoMs: tempoUsadoMs });
}

// Tempo esgotado = mesmo tratamento de resposta errada: defesa no meio.
function tempoEsgotado() {
  if (estado.etapa !== ETAPA.RESPOSTA) return;
  estado.etapa = ETAPA.CHUTE;

  SFX.tempoEsgotado();
  estado.sequenciaAcertos = 0;
  if (typeof Conquistas !== 'undefined' && vezDoDono()) Conquistas.registrar('conta-errada');
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
    // v2.1: o locutor grita "Gol!" e emenda a MESMA frase da faixa.
    var fraseGol = sortear(FRASES_GOL);
    Narracao.falar('Gol!', { tom: 'gol' });
    Narracao.falar(fraseGol, { tom: 'gol', esperar: true });
    // ETAPA 2 — gol: torcida a loucura, batedor pula e soca o ar,
    // fogos e confete na tela, faixa verde por cima de tudo.
    reagirNaCena('gol');
    if (typeof Festa !== 'undefined') Festa.iniciar('gol');
    mostrarFaixa('gol', fraseGol, duracaoFaixa(2600));
    if (typeof Conquistas !== 'undefined' && vezDoDono()) Conquistas.registrar('gol', { tipo: detalhes.tipoChute || null, pontos: pontosGanhos });
    // v2.2: easter egg do 6-7 — a cobranca valeu exatamente 67 Cruzeiros
    // (a crianca respondeu em 5 s no relogio de 15 s, ou 4 s no de 12 s).
    if (pontosGanhos === 67) {
      reagirNaCena('seis-sete');
      Narracao.falar('Seis... sete! Sessenta e sete Cruzeiros!', { tom: 'gol', esperar: true });
    }
  } else if (resultado === 'fora') {
    // Reaproveita o som existente de "sem gol" — nao criar SFX novo.
    SFX.defesa();
    var motivo = MENSAGEM_FORA[detalhes.motivo] ? detalhes.motivo : 'lado';
    feedback.textContent = MENSAGEM_FORA[motivo];
    // ETAPA 2 — a conta estava certa e o chute saiu: lamento leve, e a
    // faixa diz em primeiro lugar que a MATEMATICA estava certa. O
    // locutor fala o que houve e emenda o elogio da conta (a frase da faixa).
    var fraseQuase = sortear(FRASES_QUASE);
    Narracao.falar(NARRACAO_FORA[motivo], { tom: 'quase' });
    Narracao.falar(fraseQuase, { tom: 'quase', esperar: true });
    reagirNaCena('erro');
    mostrarFaixa('quase', fraseQuase, duracaoFaixa(3200));
  } else {
    SFX.defesa();
    var frase = FRASES_INCENTIVO[Math.floor(Math.random() * FRASES_INCENTIVO.length)];
    feedback.textContent = (detalhes.estourouTempo ? 'Tempo esgotado! O goleiro defendeu! ' : 'O goleiro defendeu! ') + frase;
    // Incentivo visual dentro do campo, em area segura (nao sai do quadro).
    var incentivo = document.getElementById('incentivo-jogo');
    incentivo.textContent = frase;
    incentivo.hidden = false;
    incentivo.classList.remove('animar'); void incentivo.offsetWidth; incentivo.classList.add('animar');
    Narracao.falar(detalhes.estourouTempo ? 'Tempo esgotado! O goleiro defendeu.' : 'O goleiro defendeu!',
      { tom: 'defesa' });
    reagirNaCena('erro');
    // Defesa cai em dois casos bem diferentes: a crianca acertou a conta
    // e o goleiro pegou, ou ela errou a conta (e ai o chute nem era dela).
    // A frase tem que distinguir — dizer "sua conta estava certinha" para
    // quem errou a conta seria mentira, e a crianca percebe.
    // v2.1: o locutor emenda a frase da faixa. No tempo esgotado, nao: a
    // gravacao "Tempo esgotado! O goleiro defendeu." ja diz o que houve.
    var fraseDefesa;
    if (detalhes.respostaCorreta) {
      fraseDefesa = sortear(FRASES_QUASE);
      Narracao.falar(fraseDefesa, { tom: 'quase', esperar: true });
      mostrarFaixa('quase', fraseDefesa, duracaoFaixa(3200));
    } else if (detalhes.estourouTempo) {
      mostrarFaixa('conta', 'O tempo acabou dessa vez. Na próxima você responde antes!', duracaoFaixa(3000));
    } else {
      fraseDefesa = sortear(FRASES_CONTA);
      Narracao.falar(fraseDefesa, { tom: 'defesa', esperar: true });
      mostrarFaixa('conta', fraseDefesa, duracaoFaixa(3000));
    }
  }

  estado.resultadosCobrancas.push({
    zonaEscolhida: detalhes.zonaEscolhida,
    zonaCorreta: estado.zonaCorreta,
    resultado: resultado,
    motivoFora: resultado === 'fora' ? (detalhes.motivo || 'lado') : null,
    tipoChute: detalhes.tipoChute || null,
    estourouTempo: !!detalhes.estourouTempo,
    pontos: pontosGanhos,
    tempoUsado: tempoUsadoSegundos,
    // v2.2: para o relatorio do professor (conta certa mesmo sem gol).
    respostaCorreta: !!detalhes.respostaCorreta,
    tempoUsadoMs: Math.max(0, Math.min(TIMER_MAX * 1000, Math.round(detalhes.tempoUsadoMs || 0)))
  });

  estado.cobrancaAtual++;
  atualizarBolinhasProgresso();
  atualizarDisplayPontuacao();

  // v2.2 (Copa): o adversario bate a cobranca dele logo depois.
  if (estado.copaJogo) {
    var golAdv = Copa.chuteAdversario(estado.copaJogo);
    var nomeAdv = estado.copaJogo.adversario.nome;
    feedback.appendChild(document.createTextNode(' · ' + nomeAdv + (golAdv ? ': gol ⚽' : ': errou ❌')));
    document.getElementById('titulo-fase').textContent = tituloCopa();
  }

  // v2.2 (duelo): placar de cada jogador.
  if (estado.duelo) {
    estado.duelo.gols = golsDoDuelo();
    document.getElementById('titulo-fase').textContent = tituloDuelo();
  }

  // v2.1: a proxima conta espera o locutor terminar (no maximo 5 s a mais),
  // senao a leitura da pergunta cortaria a frase no meio.
  depoisDoLocutor(function() {
    if (estado.duelo) { seguirDuelo(); return; }
    if (estado.cobrancaAtual < TOTAL_COBRANCAS) { carregarProximaPergunta(); return; }
    // v2.2: mata-mata empatado = MORTE SUBITA, uma cobranca de cada lado.
    if (estado.copaJogo && Copa.precisaMorteSubita(estado.copaJogo, estado.gols)) {
      estado.copaJogo.morteSubita = true;
      TOTAL_COBRANCAS++;
      atualizarBolinhasProgresso();
      document.getElementById('titulo-fase').textContent = tituloCopa();
      Narracao.falar('Empate! Morte súbita: quem errar primeiro perde!', { tom: 'resultado' });
      mostrarFaixa('quase', '⚡ Empate! MORTE SÚBITA: uma cobrança de cada lado!', duracaoFaixa(2200));
      agendarNaSessao(carregarProximaPergunta, 1800);
      return;
    }
    irParaResultado();
  }, PAUSA_ENTRE_COBRANCAS);
}

// v2.2 (duelo): passa a vez com aviso grande; no fim, morte subita em pares.
function seguirDuelo() {
  var d = estado.duelo;
  var morte = false;
  if (estado.cobrancaAtual >= TOTAL_COBRANCAS) {
    var g = golsDoDuelo();
    if (g[0] !== g[1] || d.extras >= DUELO_PARES_EXTRAS) { irParaResultadoDuelo(); return; }
    d.extras++;
    TOTAL_COBRANCAS += 2;
    atualizarBolinhasProgresso();
    morte = true;
    Narracao.falar('Empate! Morte súbita!', { tom: 'resultado' });
  }
  var vez = vezDoDuelo();
  document.getElementById('titulo-fase').textContent = tituloDuelo();
  // O jogador 2 comemora com a dancinha (a comemoracao escolhida e do dono).
  if (estado.jogoPenalti && estado.jogoPenalti.definirComemoracao) {
    estado.jogoPenalti.definirComemoracao(vez === 0 && typeof Conta !== 'undefined' ? Conta.comemoracaoAtual() : 'dancinha');
  }
  mostrarFaixa(morte ? 'quase' : 'acerto', (morte ? '⚡ Empate! Morte súbita! ' : '') + '🔄 Vez de ' + d.nomes[vez] + '!', morte ? 2000 : 1300);
  Narracao.falar('Vez de ' + d.nomes[vez] + '!', { tom: 'instrucao', esperar: true });
  agendarNaSessao(carregarProximaPergunta, morte ? 2000 : 1300);
}

var FOLGA_LOCUTOR_MS = 250;
var ESPERA_MAXIMA_LOCUTOR_MS = 6000;

// Espera a pausa minima e, se o locutor ainda estiver falando, espera ele
// terminar (no maximo ESPERA_MAXIMA_LOCUTOR_MS a mais). Confere de novo no
// fim da pausa, e nao no comeco: se o navegador bloquear o audio, a fala
// gravada cai na hora e a partida nao espera nada a mais.
function depoisDoLocutor(fn, pausaMinima) {
  var inicio = Date.now();
  var limite = pausaMinima + ESPERA_MAXIMA_LOCUTOR_MS;
  function conferir() {
    var falta = Narracao.tempoRestante ? Narracao.tempoRestante() : 0;
    var esperou = Date.now() - inicio;
    if (falta > 0 && esperou < limite) {
      agendarNaSessao(conferir, Math.min(falta + FOLGA_LOCUTOR_MS, limite - esperou));
      return;
    }
    fn();
  }
  agendarNaSessao(conferir, pausaMinima);
}

// A faixa fica na tela pelo menos enquanto o locutor fala a frase dela.
function duracaoFaixa(minimo) {
  var falta = Narracao.tempoRestante ? Narracao.tempoRestante() : 0;
  return Math.max(minimo, falta + 400);
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

// A escada de niveis.js tem 12 degraus, mas o esquema 2 do resumo — e as
// regras do Firestore, e backup-validacao.js — so conhecem 'facil', 'medio'
// e 'dificil'. Gravar o numero direto faria a regra RECUSAR a escrita e o
// progresso sumiria em silencio (so um console.warn).
//
// Entao o resumo salvo continua no vocabulario antigo. Se um dia o time
// quiser guardar o nivel exato no historico, e subir o esquema pra 3 e
// ajustar junto: Config/firestore.rules, JS/backup-validacao.js e
// tests/rules/.
function dificuldadeDoNivel(nivel) {
  if (typeof nivel !== 'number') return nivel; // ja e 'facil'/'medio'/'dificil'
  if (nivel <= 3) return 'facil';
  if (nivel <= 7) return 'medio';
  return 'dificil';
}

// v2.2: numeros da partida para os totais da sala (relatorio do professor).
function estatisticasDaPartida() {
  var c = estado.resultadosCobrancas;
  var certas = c.filter(function(x) { return x.respostaCorreta || x.resultado === 'gol'; }).length;
  return {
    cobrancas: c.length,
    contasCertas: certas,
    contasErradas: c.length - certas,
    gols: estado.gols,
    pontos: estado.pontuacao,
    tempoRespostaMs: c.reduce(function(s, x) {
      return s + (typeof x.tempoUsadoMs === 'number' ? x.tempoUsadoMs : (x.tempoUsado || 0) * 1000);
    }, 0)
  };
}

// v2.2: as cobrancas da MORTE SUBITA (Copa) ficam fora do resumo salvo — o
// esquema 2 (regras do Firestore, backup) exige 3, 5 ou 7 cobrancas por fase.
// Elas contam no placar da Copa e nos Cruzeiros, nao no historico.
function cobrancasRegulares() {
  var n = Progressao.obterFase(estado.faseAtual).cobrancas;
  return estado.resultadosCobrancas.slice(0, n);
}

function montarResumoPartida() {
  var regulares = cobrancasRegulares();
  var golsReg = regulares.filter(function(c) { return c.resultado === 'gol'; }).length;
  var pontosReg = regulares.reduce(function(s, c) { return s + (c.pontos || 0); }, 0);
  var tempoTotal = regulares.reduce(function(s, c) { return s + (c.tempoUsado || 0); }, 0);
  // Nivel efetivo da fase (nivel de partida + um degrau por fase), que e o
  // que a crianca realmente jogou — nao o que ela escolheu no menu.
  var nivelJogado = obterNivel(
    Progressao.dificuldadeEfetiva(
      Sala.estaNaSala() && Sala.nivelDaSala() ? Sala.nivelDaSala() : estado.dificuldadeId,
      estado.faseAtual
    )
  ).id;

  return {
    versaoEsquema: 3,
    faseId: estado.faseAtual,
    nivelId: nivelJogado,
    dificuldadeId: dificuldadeDoNivel(nivelJogado),
    selecaoId: estado.selecaoId,
    gols: estado.resultadosCobrancas.length > regulares.length ? golsReg : estado.gols,
    totalCobrancas: Math.min(TOTAL_COBRANCAS, Progressao.obterFase(estado.faseAtual).cobrancas),
    pontuacao: estado.resultadosCobrancas.length > regulares.length ? pontosReg : estado.pontuacao,
    tempoTotalSegundos: tempoTotal,
    resumoCobrancas: regulares.map(codigoCobranca).join(''),
    data: new Date().toISOString()
  };
}

function irParaResultado() {
  var fase = Progressao.obterFase(estado.faseAtual);
  var resumo = montarResumoPartida();
  encerrarJogoEmAndamento(); // invalida a sessao: nada mais da partida roda

  // Recordes da fase so com as cobrancas normais (sem a morte subita).
  var resultadoProgressao = Progressao.registrarResultado(fase.id, resumo.gols, resumo.pontuacao);

  // v2.2: jogo da Copa — placar contra o adversario e a Copa anda.
  var jogoCopa = estado.copaJogo;
  var copaR = null;
  if (jogoCopa) {
    copaR = Copa.registrarJogo(jogoCopa, estado.gols);
    estado.copaJogo = null;
  }

  document.getElementById('titulo-resultado').textContent = copaR ? tituloResultadoCopa(copaR) : fase.tituloResultado;
  document.getElementById('placar-final').textContent = copaR
    ? copaR.gp + ' x ' + copaR.gc
    : estado.gols + ' / ' + fase.cobrancas;
  var pontuacaoFinal = document.getElementById('pontuacao-final');
  pontuacaoFinal.textContent = estado.pontuacao + ' ';
  pontuacaoFinal.appendChild(criarIconeCruzeiro(''));
  pontuacaoFinal.appendChild(document.createTextNode(estado.pontuacao === 1 ? 'Cruzeiro' : 'Cruzeiros'));

  // Os Cruzeiros da partida vao para a carteira (gastos na Loja). O bonus
  // da Copa (vitoria, classificacao, taca) entra junto.
  var bonusCopa = copaR ? copaR.bonus : 0;
  ultimoGanho = estado.pontuacao + bonusCopa;
  if (typeof Carteira !== 'undefined') Carteira.adicionar(estado.pontuacao + bonusCopa);

  // v2.0: conquistas da partida. Os premios em Cruzeiros entram ANTES de
  // mostrar o saldo, e aparecem separados na frase ("+50 de conquistas").
  ultimoGanhoConquistas = 0;
  if (typeof Conquistas !== 'undefined' && typeof Carteira !== 'undefined') {
    // Conta tambem as medalhas que sairam DURANTE a partida (gol, conta
    // rapida): elas ja estao no saldo e precisam aparecer na frase.
    var saldoAntes = typeof saldoNoInicioDaPartida === 'number'
      ? saldoNoInicioDaPartida + estado.pontuacao + bonusCopa
      : Carteira.saldo();
    if (resultadoProgressao.desbloqueou && resultadoProgressao.proximaFase) {
      Conquistas.registrar('fase-desbloqueada', { faseId: resultadoProgressao.proximaFase });
    }
    if (copaR) {
      Conquistas.registrar('copa-jogo', { venceu: copaR.resultado === 'vitoria', morteSubita: copaR.morteSubita });
      if (copaR.proxima && (copaR.classificou || copaR.etapa.mataMata)) {
        Conquistas.registrar('copa-avancou', { etapa: copaR.proxima.id });
      }
      if (copaR.campeao) Conquistas.registrar('copa-campeao');
    }
    Conquistas.registrar('partida-fim', {
      faseId: fase.id, gols: resumo.gols, total: fase.cobrancas, resumo: resumo.resumoCobrancas,
      pontuacao: estado.pontuacao
    });
    ultimoGanhoConquistas = Math.max(0, Carteira.saldo() - saldoAntes);
    saldoNoInicioDaPartida = null;
  }

  // HU-14: manda o resultado pro painel do professor, se estiver numa sala.
  if (Sala.estaNaSala()) {
    Sala.reportarResultado({
      apelido: estado.apelido || 'Craque',
      avatarSeed: estado.avatarSeed,
      gols: estado.gols,
      pontuacao: estado.pontuacao,
      fase: fase.id,
      nivelId: resumo.nivelId,
      partida: estatisticasDaPartida()
    });
  }
  atualizarGanhoCarteira();

  var mensagem = copaR ? mensagemResultadoCopa(copaR) : sortearMensagemResultado(estado.gols, fase.cobrancas);
  document.getElementById('resumo-resultado').textContent = mensagem;

  renderizarListaCobrancas();

  var elDesbloqueio = document.getElementById('mensagem-desbloqueio');
  if (elDesbloqueio && copaR) {
    // Na Copa, o recado e o que acontece com a campanha.
    elDesbloqueio.textContent = avisoCampanhaCopa(copaR);
    elDesbloqueio.classList.toggle('visivel', !!elDesbloqueio.textContent);
    if (copaR.campeao && typeof Festa !== 'undefined') Festa.iniciar('gol');
    if (copaR.resultado === 'vitoria') SFX.faseLiberada(); else SFX.faseCompleta();
  } else if (elDesbloqueio) {
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
    window.FirebaseMathGol.salvarProgresso(resumoParaNuvem(resumo));
  }

  // v2.0: estrelas e sincronizacao do estado do craque.
  if (typeof TelasV2 !== 'undefined') TelasV2.mostrarEstrelas(estado.gols, fase.cobrancas);
  if (typeof Conta !== 'undefined') Conta.marcarMudanca();

  // A tela antes da fala: mostrarTela() cancela a narracao em andamento, e
  // na ordem antiga a mensagem do resultado era cortada antes de comecar.
  mostrarTela('tela-resultado');
  Narracao.falar(mensagem, { tom: 'resultado' });
}

// ---------- v2.2: textos do resultado de um jogo da Copa ----------
function tituloResultadoCopa(r) {
  if (r.campeao) return '🏆 CAMPEÃO DO MUNDO! 🏆';
  var adv = r.adversario.nome;
  if (r.resultado === 'vitoria') return 'Vitória sobre ' + adv + '!' + (r.morteSubita ? ' (morte súbita)' : '');
  if (r.resultado === 'empate') return 'Empate com ' + adv + '!';
  return adv + ' venceu dessa vez';
}

function mensagemResultadoCopa(r) {
  if (r.campeao) return 'Você é campeão da Copa do Mundo 2026! A matemática levou a taça!';
  if (r.eliminado && r.etapa.mataMata) return 'Fim da Copa nas ' + r.etapa.nome.toLowerCase() + '. Que campanha! Bora tentar outra Copa?';
  if (r.eliminado) return 'Não deu para passar do grupo desta vez. Na próxima Copa você chega mais longe!';
  if (r.resultado === 'vitoria') return 'Vitória! ' + (r.proxima ? 'Próximo jogo: ' + r.proxima.nome + '.' : '');
  if (r.resultado === 'empate') return 'Um ponto na tabela! ' + (r.proxima ? 'Próximo jogo: ' + r.proxima.nome + '.' : '');
  return 'Ainda dá! ' + (r.proxima ? 'Próximo jogo: ' + r.proxima.nome + '.' : '');
}

function avisoCampanhaCopa(r) {
  if (r.campeao) return '🏆 Você ganhou a borda Taça do Mundo e o título "Campeão do Mundo"!';
  if (r.classificou) return '✅ Classificado em ' + r.posicao + 'º lugar no grupo! Agora é mata-mata.';
  if (r.eliminado && !r.etapa.mataMata) return 'Você terminou em ' + r.posicao + 'º lugar no grupo.';
  if (r.proxima && r.etapa.mataMata) return '➡️ Classificado para: ' + r.proxima.nome + '!';
  return '';
}

// O historico na nuvem (regras do Firestore + backup-validacao.js) usa o
// esquema 2, sem o nivel exato. O resumo local passou a sair no esquema 3
// (com nivelId) e, por isso, NENHUM resultado chegava a nuvem: a validacao
// recusava em silencio ("versao do esquema incompativel"). A sala do
// professor continua recebendo o nivel pelo caminho dela.
function resumoParaNuvem(resumo) {
  var copia = {};
  ['faseId', 'dificuldadeId', 'selecaoId', 'gols', 'totalCobrancas', 'pontuacao',
   'tempoTotalSegundos', 'resumoCobrancas', 'data'].forEach(function(k) { copia[k] = resumo[k]; });
  copia.versaoEsquema = 2;
  return copia;
}

var ultimoGanho = 0;
var ultimoGanhoConquistas = 0;
var saldoNoInicioDaPartida = null;

function atualizarGanhoCarteira() {
  var el = document.getElementById('ganho-carteira');
  if (!el || typeof Carteira === 'undefined') return;
  el.textContent = (ultimoGanho > 0 ? '+' + Carteira.formatar(ultimoGanho) + ' na sua carteira! ' : '') +
    (ultimoGanhoConquistas > 0 ? '+' + ultimoGanhoConquistas + ' de conquistas! ' : '') +
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
    devolverFoco(atual.origem);
  }

  // Modal aberto de DENTRO de outro (ex.: Creditos a partir de "Mais
  // opcoes"): quando este fecha, o botao que o abriu ja esta escondido
  // junto com o modal de fora. Focar um elemento invisivel joga o foco no
  // <body> e o teclado volta pro topo do documento. Nesse caso devolvemos
  // pro "Mais opcoes", que e o elemento visivel mais proximo da origem.
  function visivel(el) {
    return !!el && typeof el.focus === 'function' && !el.hidden && el.offsetParent !== null;
  }

  function devolverFoco(origem) {
    if (visivel(origem)) { origem.focus(); return; }
    var alternativa = document.getElementById('botao-mais-opcoes');
    if (visivel(alternativa)) alternativa.focus();
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

// ---------- Mais opcoes ----------
//
// O menu tinha 6 botoes empilhados competindo com o "Jogar". Os quatro que
// nao sao do dia a dia da crianca moram aqui agora. Fechar o modal antes de
// trocar de tela e obrigatorio: senao a sobreposicao fica por cima da tela
// nova e come os cliques.
// Usa o mesmo Modal dos outros (Acessibilidade, Creditos, Backup): foco
// entra no titulo, Tab fica preso dentro, Escape fecha e o fundo vira inert.
// A primeira versao deste modal tinha logica propria e por isso nao punha o
// fundo em inert nem prendia o Tab — o leitor de tela passeava pela tela
// atras da sobreposicao (DEF-A11Y-01).
function fecharMaisOpcoes() {
  var m = document.getElementById('sobreposicao-mais');
  if (!m) return;
  if (m.classList.contains('aberta')) { Modal.fechar(); return; }
  m.classList.remove('aberta');
  m.setAttribute('aria-hidden', 'true');
}

function initMaisOpcoes() {
  var abrir = document.getElementById('botao-mais-opcoes');
  var fechar = document.getElementById('botao-fechar-mais');
  var modal = document.getElementById('sobreposicao-mais');
  if (!abrir || !modal) return;

  abrir.addEventListener('click', function() {
    SFX.clique();
    Modal.abrir(modal, abrir);
  });
  if (fechar) fechar.addEventListener('click', function() { SFX.clique(); Modal.fechar(); });
  Modal.ligarFundo(modal);

  // Entrar na sala e Sou professor TROCAM DE TELA: a sobreposicao tem que
  // sair da frente antes, senao fica por cima da tela nova e come os cliques.
  // Creditos e Backup abrem outro modal — Modal.abrir ja fecha este sozinho,
  // e o foco volta pro "Mais opcoes" quando o de cima fechar.
  ['botao-entrar-sala', 'botao-professor'].forEach(function(id) {
    var b = document.getElementById(id);
    if (b) b.addEventListener('click', fecharMaisOpcoes);
  });
}

// ---------- HU-14: Sala (lado da crianca) ----------

// A sala e a unica tela que NAO funciona offline. Quando a nuvem esta fora,
// diz o motivo em vez de um "nao consegui" generico — na maioria das vezes e
// o provedor Anonimo desligado no Console do Firebase.
function motivoNuvemFora() {
  if (!window.FirebaseMathGol) return 'O servidor ainda esta carregando. Tente de novo em instantes.';
  if (window.FirebaseMathGol.nuvemIndisponivel && window.FirebaseMathGol.nuvemIndisponivel()) {
    return 'O login na nuvem esta desligado neste projeto do Firebase, entao a sala nao funciona. Avise a equipe.';
  }
  return 'Sem conexao com o servidor. Tente de novo em instantes.';
}


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
          ? motivoNuvemFora()
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

// v2.2: sala aberta no painel e a ultima lista recebida (para exportar e
// para redesenhar sem perder o que o professor esta digitando).
var painelSala = { sala: null, alunos: [], pendente: false };

function digitandoNomeDeAluno() {
  var ativo = document.activeElement;
  return !!(ativo && ativo.classList && ativo.classList.contains('campo-nome-aluno'));
}

function renderizarAlunos(lista) {
  var ul = document.getElementById('lista-alunos');
  var contagem = document.getElementById('prof-contagem');
  if (!ul) return;
  painelSala.alunos = lista.slice();
  // A lista chega ao vivo: redesenhar no meio da digitacao apagaria o nome.
  if (digitandoNomeDeAluno()) { painelSala.pendente = true; return; }
  painelSala.pendente = false;
  lista = lista.slice();
  contagem.textContent = '(' + lista.length + ')';
  ul.textContent = '';
  var codigoSala = painelSala.sala ? painelSala.sala.codigo : '';

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

    // Nome em cima, fase + nivel embaixo: o professor precisa saber ONDE a
    // crianca esta, nao so quantos gols fez.
    var info = document.createElement('span');
    info.className = 'aluno-info';
    var nomeReal = al.verificado && codigoSala ? NomesDaTurma.nome(codigoSala, al.uid) : '';
    var linhaNome = criarSpan('aluno-nome', nomeReal || al.apelido || 'Craque');
    if (al.verificado) {
      var selo = criarSpan('selo-verificado', '✔');
      selo.title = 'Verificado: tem o código do craque';
      selo.setAttribute('aria-label', 'verificado');
      linhaNome.appendChild(selo);
    }
    info.appendChild(linhaNome);

    var faseObj = al.fase ? Progressao.obterFase(al.fase) : null;
    var partes = [];
    if (nomeReal) partes.push(al.apelido || 'Craque');
    if (faseObj) partes.push(faseObj.icone + ' ' + faseObj.nome);
    if (al.nivelId) {
      var nv = obterNivel(al.nivelId);
      partes.push('Nível ' + nv.id + ' · ' + nv.nome);
    }
    var t = al.totais || {};
    var totalContas = (t.contasCertas || 0) + (t.contasErradas || 0);
    if (totalContas) partes.push(Math.round(100 * (t.contasCertas || 0) / totalContas) + '% de acerto em ' + (t.partidas || 0) + ' partida(s)');
    info.appendChild(criarSpan('aluno-contexto', partes.length ? partes.join(' · ') : 'ainda não jogou'));

    // Nome de verdade: so para verificados, so neste navegador.
    if (al.verificado && codigoSala) {
      var campo = document.createElement('input');
      campo.type = 'text';
      campo.className = 'campo-nome-aluno';
      campo.maxLength = 60;
      campo.autocomplete = 'off';
      campo.placeholder = 'Nome do aluno (só você vê)';
      campo.value = nomeReal;
      campo.setAttribute('aria-label', 'Nome de verdade de ' + (al.apelido || 'Craque') + ', guardado só neste aparelho');
      var salvarNome = function() {
        NomesDaTurma.definir(codigoSala, al.uid, campo.value);
        setTimeout(function() { if (!digitandoNomeDeAluno()) renderizarAlunos(painelSala.alunos); }, 0);
      };
      campo.addEventListener('change', salvarNome);
      campo.addEventListener('blur', function() { if (painelSala.pendente) setTimeout(function() { renderizarAlunos(painelSala.alunos); }, 0); });
      campo.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') { ev.preventDefault(); campo.blur(); } });
      info.appendChild(campo);
    } else if (!al.verificado) {
      info.appendChild(criarSpan('aluno-dica', 'Sem código do craque: para anotar o nome, peça para criar o código.'));
    }
    li.appendChild(info);

    li.appendChild(criarSpan('aluno-placar', (al.gols || 0) + ' ⚽'));
    li.appendChild(criarSpan('aluno-pontos', String(al.pontuacao || 0)));
    ul.appendChild(li);
  });
}

// v2.2: salas que este professor criou neste aparelho (reabrir sem anotar
// o codigo). Montada com createElement/textContent.
function renderizarMinhasSalas(aoAbrir) {
  var caixa = document.getElementById('prof-minhas-salas');
  var ul = document.getElementById('lista-minhas-salas');
  if (!caixa || !ul) return;
  var salas = SalasDoProfessor.listar();
  caixa.hidden = !salas.length;
  ul.textContent = '';
  salas.forEach(function(s) {
    var li = document.createElement('li');
    li.className = 'item-minha-sala';
    var abrir = document.createElement('button');
    abrir.type = 'button';
    abrir.className = 'botao-minha-sala';
    abrir.appendChild(criarSpan('minha-sala-nome', s.nome));
    abrir.appendChild(criarSpan('minha-sala-codigo', s.codigo));
    abrir.setAttribute('aria-label', 'Abrir a sala ' + s.nome + ', código ' + s.codigo);
    abrir.addEventListener('click', function() { SFX.clique(); aoAbrir(s); });
    var esquecer = document.createElement('button');
    esquecer.type = 'button';
    esquecer.className = 'botao-icone botao-esquecer-sala';
    esquecer.textContent = '✕';
    esquecer.setAttribute('aria-label', 'Tirar a sala ' + s.nome + ' desta lista e apagar os nomes anotados dela');
    esquecer.addEventListener('click', function() {
      SFX.clique();
      SalasDoProfessor.esquecer(s.codigo);
      renderizarMinhasSalas(aoAbrir);
    });
    li.appendChild(abrir);
    li.appendChild(esquecer);
    ul.appendChild(li);
  });
}

function mostrarPainelDaSala(sala) {
  painelSala.sala = sala;
  painelSala.alunos = [];
  SalasDoProfessor.lembrar(sala);
  document.getElementById('aviso-exportar').textContent = '';
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

  function reabrirSala(s) {
    if (!window.FirebaseMathGol) { avisar(motivoNuvemFora(), 'erro'); return; }
    avisar('Abrindo a sala ' + s.codigo + '...');
    window.FirebaseMathGol.buscarSala(s.codigo).then(function(sala) {
      if (!sala) { avisar('A sala ' + s.codigo + ' não existe mais no servidor.', 'erro'); return; }
      avisar('');
      mostrarPainelDaSala({ codigo: sala.codigo, nome: sala.nome || s.nome, nivel: sala.nivel || 1, tipos: sala.tipos || [] });
    });
  }

  function abrirTelaProfessor() {
    avisar('');
    preencherSelectNiveis(document.getElementById('select-nivel-sala'), 1);
    document.getElementById('prof-sem-sala').hidden = false;
    document.getElementById('prof-com-sala').hidden = true;
    renderizarMinhasSalas(reabrirSala);
  }

  abrir.addEventListener('click', function() {
    SFX.clique();
    abrirTelaProfessor();
    mostrarTela('tela-professor');
  });
  // #professor (endereco direto) tambem mostra a lista de salas.
  renderizarMinhasSalas(reabrirSala);

  var avisoExportar = document.getElementById('aviso-exportar');
  function exportar(tipo) {
    if (!painelSala.sala) return;
    SFX.clique();
    if (!painelSala.alunos.length) { avisoExportar.textContent = 'Ainda não há alunos nesta sala.'; return; }
    avisoExportar.textContent = 'Preparando o arquivo...';
    var fn = tipo === 'pdf' ? RelatorioTurma.exportarPdf : RelatorioTurma.exportarExcel;
    fn(painelSala.sala, painelSala.alunos).then(function(r) {
      avisoExportar.textContent = r === 'csv' ? '✅ Sem internet para o Excel: baixei em CSV (o Excel abre igual).'
        : (r === 'impressao' ? '✅ Abri a tabela para imprimir: escolha "Salvar como PDF".' : '✅ Arquivo baixado!');
    });
  }
  var bExcel = document.getElementById('botao-exportar-excel');
  var bPdf = document.getElementById('botao-exportar-pdf');
  if (bExcel) bExcel.addEventListener('click', function() { exportar('excel'); });
  if (bPdf) bPdf.addEventListener('click', function() { exportar('pdf'); });
  var bApagar = document.getElementById('botao-apagar-nomes');
  if (bApagar) bApagar.addEventListener('click', function() {
    if (!painelSala.sala) return;
    SFX.clique();
    NomesDaTurma.apagarSala(painelSala.sala.codigo);
    renderizarAlunos(painelSala.alunos);
    avisoExportar.textContent = 'Nomes desta sala apagados deste aparelho.';
  });

  criar.addEventListener('click', function() {
    SFX.selecionar();
    if (!window.FirebaseMathGol) { avisar(motivoNuvemFora(), 'erro'); return; }

    avisar('Criando a sala...');
    Sala.criar({
      nome: (document.getElementById('input-nome-turma').value || '').trim() || 'Turma',
      nivel: parseInt(document.getElementById('select-nivel-sala').value, 10) || 1,
      tipos: tiposMarcados()
    }).then(function(sala) {
      if (!sala) { avisar(motivoNuvemFora(), 'erro'); return; }
      avisar('');
      mostrarPainelDaSala(sala);
    });
  });

  if (fechar) fechar.addEventListener('click', function() {
    SFX.clique();
    Sala.pararDeObservar(); // listener do Firestore nao pode ficar aberto
    painelSala.sala = null;
    mostrarTela('tela-menu');
  });
}


// ---------- Endereco direto (#professor e #entrar) ----------
// Os dois PACKs entregues ao portal anunciam math-gol.vercel.app/#professor
// como "link exclusivo para professores". Sem isto o endereco cai no menu
// comum e o professor nao encontra a sala. Fecha o modal "Mais opcoes" antes
// de trocar de tela: a sobreposicao aberta fica por cima da tela nova e come
// os cliques (mesmo motivo comentado em fecharMaisOpcoes).
var TELAS_POR_HASH = { professor: 'tela-professor', entrar: 'tela-entrar-sala' };

function abrirPeloEndereco() {
  var chave = (location.hash || '').replace('#', '').toLowerCase();
  var tela = TELAS_POR_HASH[chave];
  if (!tela) return;
  fecharMaisOpcoes();
  mostrarTela(tela);
}

// ---------- Init ----------

document.addEventListener('DOMContentLoaded', function() {
  // O antigo identificador "mathgol_token" nao e credencial e nao da acesso
  // a nada (a identidade agora e o uid do Firebase Auth). Remove a sobra.
  try { localStorage.removeItem('mathgol_token'); } catch (e) {}

  initAcessibilidade();
  // v2.0: perfil salvo, conquistas, telas novas e fundo animado.
  if (typeof Conta !== 'undefined') {
    Conta.init();
    // Entrou com um codigo ou a nuvem trouxe algo mais novo: o craque muda.
    Conta.aoMudar(restaurarCraqueSalvo);
  }
  restaurarCraqueSalvo();
  if (typeof TelasV2 !== 'undefined') TelasV2.init();
  if (typeof FundoVivo !== 'undefined') FundoVivo.init();
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
  initMaisOpcoes();
  initEntrarSala();
  initProfessor();
  mostrarTela('tela-menu', { focar: false });

  // Depois do menu, para que o endereco direto mande na tela inicial.
  abrirPeloEndereco();
  window.addEventListener('hashchange', abrirPeloEndereco);

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
