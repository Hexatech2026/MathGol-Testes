// telas-v2.js — partes de interface da v2.0:
//   Toasts           avisos que deslizam no topo (conquista, boas-vindas)
//   tela-conquistas  todas as medalhas, com progresso
//   tela-perfil      "Meu craque": avatar, numeros, bordas e codigo
//   cartao-jogador   atalho para o perfil no menu
//   estrelas         1 a 3 estrelas no resultado
//   toque            ondinha + vibracao curta nos botoes (celular)
//
// Tudo montado com createElement/textContent (nada de innerHTML), como no
// resto do jogo. Respeita prefers-reduced-motion e o alto contraste.

var Toasts = (function() {
  'use strict';
  var fila = [];
  var mostrando = 0;
  var MAXIMO_VISIVEIS = 2;
  var DURACAO = 4200;

  // Durante a partida os avisos esperam: nada cobre o campo ou a pergunta.
  function emPartida() { return document.body.classList.contains('em-partida'); }

  function mostrar(aviso) {
    fila.push(aviso);
    proximo();
  }

  function proximo() {
    if (emPartida() || mostrando >= MAXIMO_VISIVEIS || !fila.length) return;
    var aviso = fila.shift();
    var area = document.getElementById('toasts');
    if (!area) return;
    mostrando++;
    var t = document.createElement('div');
    t.className = 'toast' + (aviso.medalha ? ' toast-medalha' : ''); // a area #toasts ja e aria-live
    var icone = document.createElement('span');
    icone.className = 'toast-icone';
    icone.setAttribute('aria-hidden', 'true');
    icone.textContent = aviso.icone || '⭐';
    var corpo = document.createElement('span');
    corpo.className = 'toast-corpo';
    var titulo = document.createElement('strong');
    titulo.className = 'toast-titulo';
    titulo.textContent = aviso.titulo;
    corpo.appendChild(titulo);
    if (aviso.texto) {
      var texto = document.createElement('span');
      texto.className = 'toast-texto';
      texto.textContent = aviso.texto;
      corpo.appendChild(texto);
    }
    t.appendChild(icone);
    t.appendChild(corpo);
    area.appendChild(t);
    requestAnimationFrame(function() { t.classList.add('toast-entrando'); });
    var sair = function() {
      if (!t.parentNode) return;
      t.classList.add('toast-saindo');
      setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); mostrando--; proximo(); }, 350);
    };
    t.addEventListener('click', sair);
    setTimeout(sair, aviso.duracao || DURACAO);
  }

  // Ao sair da partida, solta o que ficou guardado.
  function liberar() { proximo(); }

  return { mostrar: mostrar, liberar: liberar };
})();

var TelasV2 = (function() {
  'use strict';

  function el(id) { return document.getElementById(id); }
  function clique() { if (typeof SFX !== 'undefined') SFX.clique(); }

  // ---------- Conquistas: aviso ----------

  function avisarMedalhas(medalhas) {
    medalhas.forEach(function(m) {
      var premio = [];
      if (m.premio && m.premio.cruzeiros) premio.push('+' + m.premio.cruzeiros + ' Cruzeiros');
      if (m.premio && m.premio.borda) {
        var b = bordaPorId(m.premio.borda);
        if (b) premio.push('borda ' + b.nome);
      }
      // v2.2: titulos e comemoracoes que esta medalha libera.
      desbloqueiosDa(m.id).forEach(function(t) { premio.push(t); });
      Toasts.mostrar({
        medalha: true,
        icone: m.icone,
        titulo: 'Conquista: ' + m.nome + '!',
        texto: premio.length ? 'Ganhou ' + premio.join(' e ') + '.' : m.descricao
      });
      if (typeof SFX !== 'undefined' && !document.body.classList.contains('em-partida')) SFX.faseLiberada();
    });
    atualizarResumos();
  }

  function desbloqueiosDa(idConquista) {
    var r = [];
    (typeof TITULOS !== 'undefined' ? TITULOS : []).forEach(function(t) {
      if (t.conquista === idConquista) r.push('o título "' + t.texto + '"');
    });
    (typeof COMEMORACOES !== 'undefined' ? COMEMORACOES : []).forEach(function(c) {
      if (c.conquista === idConquista) r.push('a comemoração ' + c.nome);
    });
    return r;
  }

  // ---------- Tela de conquistas ----------

  function renderizarConquistas() {
    var lista = el('lista-conquistas');
    if (!lista) return;
    lista.textContent = '';
    var feitas = Conquistas.quantasFeitas(), total = Conquistas.total();
    el('conquistas-resumo').textContent = feitas + ' de ' + total + ' conquistas';
    el('conquistas-barra').style.width = Math.round(100 * feitas / total) + '%';
    // Feitas primeiro? Nao: ordem fixa, para a crianca achar cada uma no
    // mesmo lugar. A cor e o cadeado mostram o que falta.
    Conquistas.LISTA.forEach(function(c) {
      var feita = Conquistas.feita(c.id);
      var li = document.createElement('li');
      li.className = 'conquista' + (feita ? ' conquista-feita' : '');
      var medalha = document.createElement('span');
      medalha.className = 'conquista-medalha';
      medalha.setAttribute('aria-hidden', 'true');
      medalha.textContent = feita ? c.icone : '🔒';
      li.appendChild(medalha);

      var info = document.createElement('span');
      info.className = 'conquista-info';
      var nome = document.createElement('strong');
      nome.className = 'conquista-nome';
      nome.textContent = c.nome;
      var desc = document.createElement('span');
      desc.className = 'conquista-descricao';
      desc.textContent = c.descricao;
      info.appendChild(nome);
      info.appendChild(desc);
      if (c.meta && !feita) {
        var atual = Math.min(c.meta, Conquistas.contador(c.contador));
        var barra = document.createElement('span');
        barra.className = 'conquista-progresso';
        barra.setAttribute('role', 'progressbar');
        barra.setAttribute('aria-valuemin', '0');
        barra.setAttribute('aria-valuemax', String(c.meta));
        barra.setAttribute('aria-valuenow', String(atual));
        barra.setAttribute('aria-label', c.nome + ': ' + atual + ' de ' + c.meta);
        var cheio = document.createElement('span');
        cheio.style.width = Math.round(100 * atual / c.meta) + '%';
        barra.appendChild(cheio);
        var num = document.createElement('span');
        num.className = 'conquista-numero';
        num.textContent = atual + '/' + c.meta;
        info.appendChild(barra);
        info.appendChild(num);
      }
      li.appendChild(info);

      var premio = document.createElement('span');
      premio.className = 'conquista-premio';
      if (c.premio && c.premio.cruzeiros) {
        var ic = criarIconeCruzeiro('');
        premio.appendChild(ic);
        premio.appendChild(document.createTextNode(String(c.premio.cruzeiros)));
      }
      if (c.premio && c.premio.borda) {
        var mb = document.createElement('span');
        mb.className = 'conquista-premio-borda';
        mb.textContent = '+ borda';
        premio.appendChild(mb);
      }
      if (desbloqueiosDa(c.id).length) {
        var mt = document.createElement('span');
        mt.className = 'conquista-premio-borda';
        mt.textContent = '+ prêmio';
        mt.title = desbloqueiosDa(c.id).join(', ');
        premio.appendChild(mt);
      }
      li.appendChild(premio);
      li.setAttribute('aria-label', c.nome + (feita ? ', conquistada. ' : ', ainda não conquistada. ') + c.descricao);
      lista.appendChild(li);
    });
  }

  function abrirConquistas(origem) {
    origemTela['tela-conquistas'] = origem || 'tela-menu';
    renderizarConquistas();
    mostrarTela('tela-conquistas');
  }

  // ---------- Perfil ("Meu craque") ----------

  function renderizarPerfil() {
    var p = Conta.perfil();
    var seed = p.avatarSeed || estado.avatarSeed || AVATAR_PADRAO.seed;
    var borda = Conta.bordaAtual();
    var caixa = el('perfil-avatar-grande');
    caixa.textContent = '';
    caixa.appendChild(criarAvatarComBorda(seed, borda, 'g'));
    el('perfil-nome').textContent = Conta.apelido() || 'Novo craque';
    el('perfil-gols').textContent = String(Conquistas.contador('gols'));
    el('perfil-conquistas').textContent = Conquistas.quantasFeitas() + '/' + Conquistas.total();
    el('perfil-partidas').textContent = String(Conquistas.contador('partidas'));
    var titulo = Conta.tituloAtual();
    el('perfil-titulo').textContent = titulo ? titulo.texto : '';
    var selo = el('perfil-selo');
    selo.hidden = !Conta.verificado();
    selo.setAttribute('aria-label', 'Craque verificado: tem o código do craque');
    selo.title = 'Verificado: tem o código do craque';
    renderizarCamisa();
    renderizarTitulos();
    renderizarComemoracoes();
    renderizarBordas(seed, borda);
    renderizarStatusCodigo();
  }

  // ---------- v2.2: camisa, titulos e comemoracoes ----------

  function renderizarCamisa() {
    el('previa-camisa-nome').textContent = Conta.nomeCamisa();
    el('previa-camisa-numero').textContent = Conta.numeroCamisa();
    var input = el('input-numero-camisa');
    if (document.activeElement !== input) input.value = Conta.numeroCamisa();
    // A previa usa as cores do time escolhido (o mesmo que vai pra cena 3D).
    var time = typeof SELECOES !== 'undefined' && typeof estado !== 'undefined'
      ? SELECOES.find(function(s) { return s.id === estado.selecaoId; }) : null;
    var previa = el('previa-camisa');
    previa.style.setProperty('--camisa-p', (time && time.corPrimaria) || '#3A5FCD');
    previa.style.setProperty('--camisa-s', (time && time.corSecundaria) || '#FFFDF6');
  }

  function salvarNumero(n) {
    n = Math.max(1, Math.min(99, Math.round(Number(n) || 10)));
    if (String(n) === Conta.numeroCamisa() && Conta.perfil().numero) { renderizarCamisa(); return; }
    Conta.salvarPerfil({ numero: String(n) });
    Conquistas.registrar('numero-trocado');
    renderizarCamisa();
  }

  function renderizarTitulos() {
    var grade = el('grade-titulos');
    grade.textContent = '';
    var ativo = Conta.tituloAtual();
    TITULOS.forEach(function(t) {
      var livre = tituloDisponivel(t);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip-escolha chip-titulo' + (livre ? '' : ' chip-bloqueado') + (ativo && ativo.id === t.id ? ' chip-ativo' : '');
      b.setAttribute('aria-pressed', ativo && ativo.id === t.id ? 'true' : 'false');
      b.textContent = (livre ? '' : '🔒 ') + t.texto;
      b.setAttribute('aria-label', livre ? 'Usar o título ' + t.texto : 'Título ' + t.texto + ': bloqueado. ' + comoGanharTitulo(t));
      if (!livre) b.title = comoGanharTitulo(t);
      b.addEventListener('click', function() {
        clique();
        if (!livre) { abrirConquistas('tela-perfil'); return; }
        if (ativo && ativo.id === t.id) return;
        Conta.salvarPerfil({ titulo: t.id });
        Conquistas.registrar('titulo-trocado');
        renderizarPerfil();
        atualizarCartaoJogador();
      });
      grade.appendChild(b);
    });
  }

  function renderizarComemoracoes() {
    var grade = el('grade-comemoracoes');
    grade.textContent = '';
    var ativa = Conta.comemoracaoAtual();
    COMEMORACOES.forEach(function(c) {
      var livre = comemoracaoDisponivel(c);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'item-comemoracao' + (livre ? '' : ' item-borda-bloqueada') + (c.id === ativa ? ' item-borda-ativa' : '');
      b.setAttribute('aria-pressed', c.id === ativa ? 'true' : 'false');
      var ic = document.createElement('span');
      ic.className = 'item-comemoracao-icone';
      ic.setAttribute('aria-hidden', 'true');
      ic.textContent = c.icone;
      var nome = document.createElement('span');
      nome.className = 'item-borda-nome';
      nome.textContent = c.nome;
      b.appendChild(ic);
      b.appendChild(nome);
      if (!livre) {
        var como = document.createElement('span');
        como.className = 'item-borda-como';
        como.textContent = '🔒 ' + comoGanharComemoracao(c);
        b.appendChild(como);
        b.setAttribute('aria-label', 'Comemoração ' + c.nome + ': bloqueada. ' + comoGanharComemoracao(c));
      } else {
        b.setAttribute('aria-label', 'Usar a comemoração ' + c.nome + '. ' + c.descricao);
      }
      b.title = c.descricao;
      b.addEventListener('click', function() {
        clique();
        if (!livre) {
          if (c.origem === 'loja' && typeof Loja !== 'undefined') Loja.abrir('tela-perfil', 'comemoracao');
          else abrirConquistas('tela-perfil');
          return;
        }
        if (c.id === ativa) return;
        Conta.salvarPerfil({ comemoracao: c.id });
        Conquistas.registrar('comemoracao-trocada');
        renderizarPerfil();
      });
      grade.appendChild(b);
    });
  }

  function renderizarBordas(seed, ativa) {
    var grade = el('grade-bordas');
    grade.textContent = '';
    BORDAS.forEach(function(b) {
      var livre = bordaDisponivel(b);
      var botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'item-borda' + (livre ? '' : ' item-borda-bloqueada') + (b.id === ativa ? ' item-borda-ativa' : '');
      botao.setAttribute('aria-pressed', b.id === ativa ? 'true' : 'false');
      botao.appendChild(criarAvatarComBorda(seed, b.id, 'm'));
      var nome = document.createElement('span');
      nome.className = 'item-borda-nome';
      nome.textContent = b.nome;
      botao.appendChild(nome);
      if (!livre) {
        var como = document.createElement('span');
        como.className = 'item-borda-como';
        como.textContent = '🔒 ' + comoGanharBorda(b);
        botao.appendChild(como);
        botao.setAttribute('aria-label', 'Borda ' + b.nome + ': bloqueada. ' + comoGanharBorda(b));
      } else {
        botao.setAttribute('aria-label', 'Usar a borda ' + b.nome);
      }
      botao.addEventListener('click', function() {
        clique();
        if (!livre) {
          if (b.origem === 'loja' && typeof Loja !== 'undefined') Loja.abrir('tela-perfil', 'borda');
          else abrirConquistas('tela-perfil');
          return;
        }
        if (b.id === Conta.bordaAtual()) return;
        Conta.salvarPerfil({ borda: b.id });
        Conquistas.registrar('borda-trocada');
        renderizarPerfil();
        atualizarCartaoJogador();
        var g = el('perfil-avatar-grande');
        g.classList.remove('pulo'); void g.offsetWidth; g.classList.add('pulo');
      });
      grade.appendChild(botao);
    });
  }

  function renderizarStatusCodigo() {
    var s = Conta.status();
    var texto = el('codigo-status');
    var criar = el('botao-criar-codigo');
    if (!window.FirebaseMathGol) {
      texto.textContent = 'Conectando ao servidor… O código precisa de internet.';
      criar.textContent = 'Criar meu código';
    } else if (s.temCodigo) {
      texto.textContent = '✅ Seu progresso está protegido por um código. Esqueceu? Gere um novo aqui (o antigo para de funcionar).';
      criar.textContent = 'Gerar código novo';
    } else {
      texto.textContent = 'Crie um código para continuar de outro computador ou celular sem perder nada.';
      criar.textContent = 'Criar meu código';
    }
  }

  function abrirPerfil(origem) {
    origemTela['tela-perfil'] = origem || 'tela-menu';
    renderizarPerfil();
    mostrarTela('tela-perfil');
  }

  // ---------- Cartao do jogador (menu) ----------

  function atualizarCartaoJogador() {
    var caixa = el('cartao-jogador-avatar');
    if (!caixa) return;
    var p = Conta.perfil();
    caixa.textContent = '';
    caixa.appendChild(criarAvatarComBorda(p.avatarSeed || AVATAR_PADRAO.seed, Conta.bordaAtual(), 'p'));
    var nome = el('cartao-jogador-nome');
    nome.textContent = Conta.apelido() || 'Novo craque';
    if (Conta.verificado()) {
      var selo = document.createElement('span');
      selo.className = 'selo-verificado selo-verificado-p';
      selo.textContent = '✔';
      selo.setAttribute('aria-hidden', 'true');
      nome.appendChild(selo);
    }
    var titulo = Conta.tituloAtual();
    el('cartao-jogador-detalhe').textContent = (titulo ? titulo.texto + '  ·  ' : '') +
      '🏅 ' + Conquistas.quantasFeitas() + '/' + Conquistas.total();
    el('cartao-jogador').setAttribute('aria-label', 'Meu craque: ' + (Conta.apelido() || 'novo craque') + '. Ver perfil, bordas e código.');
  }

  function atualizarResumos() {
    atualizarCartaoJogador();
    var selo = el('selo-conquistas');
    if (selo) selo.textContent = Conquistas.quantasFeitas() + '/' + Conquistas.total();
    var ativa = typeof telaAtivaId === 'function' ? telaAtivaId() : '';
    if (ativa === 'tela-conquistas') renderizarConquistas();
    if (ativa === 'tela-perfil') renderizarPerfil();
  }

  // ---------- Estrelas do resultado ----------

  function mostrarEstrelas(gols, total) {
    var caixa = el('estrelas-resultado');
    if (!caixa) return;
    var n = gols <= 0 ? 0 : (gols >= total ? 3 : (gols / total >= 0.6 ? 2 : 1));
    caixa.textContent = '';
    caixa.setAttribute('aria-label', n + (n === 1 ? ' estrela' : ' estrelas') + ' de 3');
    for (var i = 0; i < 3; i++) {
      var s = document.createElement('span');
      s.className = 'estrela' + (i < n ? ' estrela-acesa' : '');
      s.style.animationDelay = (0.25 + i * 0.22) + 's';
      s.textContent = '★';
      caixa.appendChild(s);
    }
  }

  // ---------- Toque: ondinha + vibracao curta ----------

  function ligarToque() {
    var reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.addEventListener('pointerdown', function(ev) {
      // Fora da partida: ali o toque e medido pelos testes e nada pode
      // entrar dentro dos botoes de resposta.
      var alvo = ev.target.closest && ev.target.closest('.botao, .atalho, .cartao, .item-borda, .cartao-jogador');
      if (!alvo || alvo.disabled) return;
      if (ev.pointerType === 'touch' && navigator.vibrate && typeof SFX !== 'undefined' && SFX.estaAtivo && SFX.estaAtivo()) {
        try { navigator.vibrate(8); } catch (e) {}
      }
      if (reduz) return;
      var r = alvo.getBoundingClientRect();
      var onda = document.createElement('span');
      onda.className = 'onda-toque';
      var tam = Math.max(r.width, r.height);
      onda.style.width = onda.style.height = tam + 'px';
      onda.style.left = (ev.clientX - r.left - tam / 2) + 'px';
      onda.style.top = (ev.clientY - r.top - tam / 2) + 'px';
      if (getComputedStyle(alvo).position === 'static') alvo.style.position = 'relative';
      alvo.classList.add('com-onda');
      alvo.appendChild(onda);
      setTimeout(function() { if (onda.parentNode) onda.parentNode.removeChild(onda); }, 600);
    }, { passive: true });
  }

  function init() {
    Conquistas.aoDesbloquear(avisarMedalhas);
    Conta.aoMudar(atualizarResumos);
    if (typeof Carteira !== 'undefined') Carteira.aoMudar(function() { if (telaAtivaId() === 'tela-perfil') renderizarPerfil(); });

    var ligar = function(id, fn) { var b = el(id); if (b) b.addEventListener('click', function() { clique(); fn(b); }); };
    ligar('cartao-jogador', function() { abrirPerfil('tela-menu'); });
    ligar('botao-conquistas', function() { abrirConquistas('tela-menu'); });
    ligar('botao-voltar-conquistas', function() { voltarTelaAnterior(); });
    ligar('botao-voltar-perfil', function() { voltarTelaAnterior(); });
    ligar('botao-perfil-conquistas', function() { abrirConquistas('tela-perfil'); });
    ligar('botao-editar-craque', function() { irParaApelido({ voltarParaPerfil: true }); });
    ligar('botao-numero-menos', function() { salvarNumero(Number(Conta.numeroCamisa()) <= 1 ? 99 : Number(Conta.numeroCamisa()) - 1); });
    ligar('botao-numero-mais', function() { salvarNumero(Number(Conta.numeroCamisa()) >= 99 ? 1 : Number(Conta.numeroCamisa()) + 1); });
    var inputNumero = el('input-numero-camisa');
    if (inputNumero) {
      inputNumero.addEventListener('change', function() { salvarNumero(inputNumero.value); });
      inputNumero.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') { ev.preventDefault(); salvarNumero(inputNumero.value); } });
    }

    ligarToque();
    atualizarResumos();

    try {
      if (sessionStorage.getItem('mathgol_aviso_inicio') === 'trocou') {
        sessionStorage.removeItem('mathgol_aviso_inicio');
        Toasts.mostrar({ icone: '🔄', titulo: 'Pronto!', texto: 'Este aparelho está livre para um novo craque.' });
      }
    } catch (e) {}
  }

  return {
    init: init,
    abrirConquistas: abrirConquistas,
    abrirPerfil: abrirPerfil,
    renderizarPerfil: renderizarPerfil,
    atualizarResumos: atualizarResumos,
    mostrarEstrelas: mostrarEstrelas
  };
})();
