// conta.js — o craque da crianca: perfil escolhido, sincronizacao com a
// nuvem e o CODIGO DO CRAQUE (continuar de outro aparelho).
//
// PERFIL LOCAL — localStorage "mathgol_perfil"
//   { versao: 1, dados: { personagem, animal, avatarSeed, borda } }
// Antes o nome e o avatar so viviam na memoria e a crianca escolhia tudo de
// novo a cada visita. Agora ficam salvos (e entram no backup e na nuvem).
//
// SINCRONIZACAO — "mathgol_sync" guarda quando o progresso local mudou pela
// ultima vez. Ao abrir, se a nuvem tiver algo MAIS NOVO (a crianca jogou em
// outro aparelho com o mesmo codigo), a nuvem vence; senao, o local sobe.
// Sem Firebase, tudo continua funcionando so no aparelho.
//
// LGPD — nada aqui e dado pessoal: o nome e escolhido de listas (nunca
// digitado), o avatar e um desenho, e o codigo nao identifica ninguem.
// A crianca (ou o responsavel) pode apagar tudo pelo botao "Apagar meus
// dados" (ver firebase-config.js → apagarMeusDados).

var Conta = (function() {
  'use strict';

  var CHAVE_PERFIL = 'mathgol_perfil';
  var CHAVE_SYNC = 'mathgol_sync';
  // Tudo que e "da crianca" e sai do aparelho ao trocar de jogador. As
  // preferencias do aparelho (acessibilidade, tutorial visto) ficam.
  var CHAVES_DO_JOGADOR = ['mathgol_carteira', 'mathgol_progressao', 'mathgol_conquistas',
    'mathgol_perfil', 'mathgol_ultimo_resultado', CHAVE_SYNC];

  var perfil = {};
  var ouvintes = [];
  var aplicando = false;
  var timerSync = null;
  var statusNuvem = { pronta: false, nuvemFora: false, temCodigo: false };

  function el(id) { return document.getElementById(id); }
  function ler(chave) { try { return localStorage.getItem(chave); } catch (e) { return null; } }
  function gravar(chave, valor) { try { localStorage.setItem(chave, valor); } catch (e) {} }

  // ---------- Perfil ----------

  function carregarPerfil() {
    perfil = {};
    var bruto = null;
    try { bruto = JSON.parse(ler(CHAVE_PERFIL)); } catch (e) { bruto = null; }
    var ok = bruto && (typeof ValidacaoBackup === 'undefined' || ValidacaoBackup.validarPerfilLocal(bruto));
    if (ok && bruto.dados) perfil = Object.assign({}, bruto.dados);
    if (perfil.borda && typeof bordaPorId === 'function' && !bordaPorId(perfil.borda)) delete perfil.borda;
  }

  function salvarPerfil(mudancas) {
    Object.keys(mudancas || {}).forEach(function(k) {
      var v = mudancas[k];
      if (typeof v === 'string' && v) perfil[k] = v.slice(0, 40); else delete perfil[k];
    });
    gravar(CHAVE_PERFIL, JSON.stringify({ versao: 1, dados: perfil }));
    marcarMudanca();
    avisar();
  }

  function obterPerfil() { return Object.assign({}, perfil); }
  function apelido() { return perfil.personagem && perfil.animal ? perfil.personagem + ' ' + perfil.animal : ''; }

  // Borda que pode ser usada agora (a salva, se ainda estiver disponivel).
  function bordaAtual() {
    var b = typeof bordaPorId === 'function' ? bordaPorId(perfil.borda) : null;
    return b && bordaDisponivel(b) ? b.id : (typeof BORDA_PADRAO !== 'undefined' ? BORDA_PADRAO : 'simples');
  }

  function aoMudar(fn) { if (typeof fn === 'function') ouvintes.push(fn); }
  function avisar() {
    ouvintes.forEach(function(fn) { try { fn(); } catch (e) { console.warn('Erro num ouvinte da conta:', e); } });
  }

  // ---------- Sincronizacao ----------

  function marcaLocal() {
    try {
      var s = JSON.parse(ler(CHAVE_SYNC));
      return s && typeof s.atualizadoEm === 'number' ? s.atualizadoEm : 0;
    } catch (e) { return 0; }
  }

  function gravarMarca(ms) { gravar(CHAVE_SYNC, JSON.stringify({ versao: 1, atualizadoEm: ms })); }

  function marcarMudanca() {
    if (aplicando) return;
    gravarMarca(Date.now());
    agendarSincronizacao();
  }

  function coletarEstado() {
    var e = { versao: 1, atualizadoEm: marcaLocal() || Date.now() };
    if (typeof Carteira !== 'undefined' && Carteira.exportar) e.carteira = Carteira.exportar();
    if (typeof Progressao !== 'undefined' && Progressao.exportar) e.progressao = Progressao.exportar();
    if (typeof Conquistas !== 'undefined') e.conquistas = Conquistas.exportar().dados;
    if (Object.keys(perfil).length) e.perfil = obterPerfil();
    return e;
  }

  // Grava o estado (ja validado) no localStorage e manda cada modulo reler.
  function aplicarEstado(estado) {
    var V = typeof ValidacaoBackup !== 'undefined' ? ValidacaoBackup : null;
    var limpo = V ? V.validarEstadoNuvem(estado) : estado;
    if (!limpo) return false;
    aplicando = true;
    try {
      var partes = { carteira: 'mathgol_carteira', progressao: 'mathgol_progressao', conquistas: 'mathgol_conquistas', perfil: CHAVE_PERFIL };
      Object.keys(partes).forEach(function(k) {
        if (limpo[k]) gravar(partes[k], JSON.stringify({ versao: 1, dados: limpo[k] }));
        else try { localStorage.removeItem(partes[k]); } catch (e) {}
      });
      gravarMarca(limpo.atualizadoEm);
      if (typeof Carteira !== 'undefined') Carteira.recarregar();
      if (typeof Progressao !== 'undefined' && Progressao.recarregar) Progressao.recarregar();
      if (typeof Conquistas !== 'undefined') Conquistas.recarregar();
      carregarPerfil();
    } finally {
      aplicando = false;
    }
    avisar();
    return true;
  }

  function agendarSincronizacao() {
    if (!window.FirebaseMathGol) return;
    if (timerSync) clearTimeout(timerSync);
    timerSync = setTimeout(sincronizarAgora, 1500);
  }

  function sincronizarAgora() {
    if (timerSync) { clearTimeout(timerSync); timerSync = null; }
    if (!window.FirebaseMathGol) return Promise.resolve(false);
    return window.FirebaseMathGol.salvarEstado(coletarEstado());
  }

  // Firebase chegou: decide quem vence (nuvem mais nova ou local).
  function aoFirebasePronto() {
    var F = window.FirebaseMathGol;
    if (!F) return;
    if (F.aoMudarConta) {
      F.aoMudarConta(function(status) {
        statusNuvem = status;
        avisar();
      });
    }
    if (!F.buscarEstado) return;
    F.buscarEstado().then(function(r) {
      if (r && r.estado && r.estado.atualizadoEm > marcaLocal()) {
        if (aplicarEstado(r.estado) && typeof Toasts !== 'undefined') {
          Toasts.mostrar({ icone: '☁️', titulo: 'Progresso atualizado', texto: 'Trouxemos o que você fez no outro aparelho.' });
        }
      } else if (marcaLocal() > 0) {
        agendarSincronizacao();
      }
    }).catch(function(erro) { console.warn('Nao foi possivel comparar com a nuvem:', erro); });
  }

  // ---------- Codigo do craque: telas ----------

  function avisoCodigo(texto, tipo) {
    var a = el('aviso-codigo-conta');
    if (!a) return;
    a.textContent = texto || '';
    a.className = 'aviso-sala' + (tipo ? ' aviso-' + tipo : '');
  }

  function semNuvem() {
    if (!window.FirebaseMathGol) return 'O servidor ainda está carregando. Tente de novo em instantes.';
    if (window.FirebaseMathGol.nuvemIndisponivel && window.FirebaseMathGol.nuvemIndisponivel()) {
      return 'A nuvem está desligada neste servidor, então o código não funciona agora. Avise a equipe.';
    }
    return null;
  }

  function ocupado(botao, sim, texto) {
    if (!botao) return;
    if (sim) { botao.dataset.textoOriginal = botao.textContent; botao.textContent = texto || 'Aguarde…'; }
    else if (botao.dataset.textoOriginal) botao.textContent = botao.dataset.textoOriginal;
    botao.disabled = !!sim;
    botao.setAttribute('aria-busy', sim ? 'true' : 'false');
  }

  function criarCodigo(botao) {
    var motivo = semNuvem();
    if (motivo) { avisoCodigo(motivo, 'erro'); return; }
    ocupado(botao, true, 'Criando…');
    avisoCodigo('');
    window.FirebaseMathGol.criarCodigo().then(function(codigo) {
      ocupado(botao, false);
      mostrarCodigo(codigo, botao);
      if (typeof Conquistas !== 'undefined') { Conquistas.registrar('codigo-criado'); }
      marcarMudanca();
      sincronizarAgora();
    }).catch(function(erro) {
      ocupado(botao, false);
      avisoCodigo(erro.message, 'erro');
    });
  }

  var codigoNaTela = '';

  function mostrarCodigo(codigo, origem) {
    codigoNaTela = CodigoCraque.formatar(codigo);
    var alvo = el('codigo-exibido');
    alvo.textContent = '';
    codigoNaTela.split('-').forEach(function(grupo) {
      var s = document.createElement('span');
      s.className = 'codigo-grupo';
      s.textContent = grupo;
      alvo.appendChild(s);
    });
    alvo.setAttribute('aria-label', 'Seu código: ' + codigoNaTela.split('').join(' '));
    el('status-cartao-codigo').textContent = '';
    if (typeof SFX !== 'undefined') SFX.faseLiberada();
    Modal.abrir(el('sobreposicao-codigo'), origem, {
      aoFechar: function() { codigoNaTela = ''; el('codigo-exibido').textContent = ''; avisar(); }
    });
  }

  function copiarCodigo() {
    var s = el('status-cartao-codigo');
    if (!codigoNaTela) return;
    var fim = function(ok) { s.textContent = ok ? '✅ Copiado! Cole num lugar seguro.' : 'Não deu para copiar. Anote as letras.'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(codigoNaTela).then(function() { fim(true); }, function() { fim(false); });
    } else fim(false);
  }

  // Cartao do craque em PNG (para imprimir ou guardar). Desenhado em canvas,
  // so com o que ja esta na tela: nome escolhido, avatar e o codigo.
  function baixarCartao() {
    var s = el('status-cartao-codigo');
    if (!codigoNaTela) return;
    var W = 900, H = 520;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    if (!g) { s.textContent = 'Não deu para criar o cartão. Anote as letras.'; return; }
    var grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#0B3D2B'); grad.addColorStop(1, '#1E6E4A');
    g.fillStyle = grad; roundRect(g, 0, 0, W, H, 36); g.fill();
    g.strokeStyle = '#FFC63B'; g.lineWidth = 10; roundRect(g, 14, 14, W - 28, H - 28, 28); g.stroke();
    g.fillStyle = '#FFC63B'; g.font = 'bold 54px Fredoka, Arial, sans-serif'; g.textAlign = 'left';
    g.fillText('MathGol', 250, 110);
    g.fillStyle = '#FFFDF6'; g.font = '600 34px Fredoka, Arial, sans-serif';
    g.fillText(apelido() || 'Craque', 250, 160);
    g.font = '24px Arial, sans-serif'; g.fillStyle = '#CFE9DA';
    g.fillText('Cartão do Craque', 250, 198);
    g.fillStyle = '#FFFDF6'; roundRect(g, 60, 250, W - 120, 120, 24); g.fill();
    g.fillStyle = '#0B3D2B'; g.font = 'bold 64px "Courier New", monospace'; g.textAlign = 'center';
    g.fillText(codigoNaTela, W / 2, 333);
    g.fillStyle = '#FFFDF6'; g.font = '24px Arial, sans-serif';
    g.fillText('Guarde com um adulto. Não mande este código para ninguém.', W / 2, 430);
    g.fillText('Em outro aparelho: Menu → "Já tenho meu código".', W / 2, 468);
    var img = new Image();
    img.onload = function() {
      g.save(); g.beginPath(); g.arc(140, 125, 85, 0, Math.PI * 2); g.clip();
      g.drawImage(img, 55, 40, 170, 170); g.restore();
      g.strokeStyle = '#FFC63B'; g.lineWidth = 8; g.beginPath(); g.arc(140, 125, 85, 0, Math.PI * 2); g.stroke();
      salvarPng(cv);
    };
    img.onerror = function() { salvarPng(cv); };
    img.src = gerarUrlAvatar(perfil.avatarSeed || AVATAR_PADRAO.seed);

    function salvarPng(canvas) {
      canvas.toBlob(function(blob) {
        if (!blob) { s.textContent = 'Não deu para criar o cartão. Anote as letras.'; return; }
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'cartao-do-craque-mathgol.png';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
        s.textContent = '✅ Cartão baixado! Imprima ou guarde com um adulto.';
      }, 'image/png');
    }
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // Formata enquanto digita: ABCD-EFGH-JKMN-PQRS.
  function formatarEntrada(input) {
    var limpo = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
    var partes = limpo.match(/.{1,4}/g) || [];
    input.value = partes.join('-');
  }

  function letrasInvalidas(texto) {
    var limpo = String(texto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    var ruins = [];
    for (var i = 0; i < limpo.length; i++) {
      var c = limpo.charAt(i);
      if (CodigoCraque.ALFABETO.indexOf(c) === -1 && ruins.indexOf(c) === -1) ruins.push(c);
    }
    return ruins;
  }

  function abrirEntrar(origem) {
    var input = el('input-codigo-craque');
    input.value = '';
    avisoEntrar('');
    Modal.abrir(el('sobreposicao-entrar-codigo'), origem);
    setTimeout(function() { try { input.focus(); } catch (e) {} }, 30);
  }

  function avisoEntrar(texto, tipo) {
    var a = el('aviso-entrar-codigo');
    a.textContent = texto || '';
    a.className = 'aviso-sala' + (tipo ? ' aviso-' + tipo : '');
  }

  function confirmarEntrar() {
    var input = el('input-codigo-craque');
    var botao = el('botao-confirmar-codigo');
    var ruins = letrasInvalidas(input.value);
    if (ruins.length) {
      avisoEntrar('O código não tem a(s) letra(s) ' + ruins.join(', ') + '. Ele não usa O, I, L, 0 nem 1. Confira de novo.', 'erro');
      return;
    }
    if (!CodigoCraque.limpar(input.value)) { avisoEntrar('O código tem 16 letras e números. Confira se digitou todos.', 'erro'); return; }
    var motivo = semNuvem();
    if (motivo) { avisoEntrar(motivo, 'erro'); return; }
    ocupado(botao, true, 'Entrando…');
    avisoEntrar('Procurando seu craque…');
    window.FirebaseMathGol.entrarComCodigo(input.value).then(function(r) {
      ocupado(botao, false);
      if (r && r.estado) aplicarEstado(r.estado);
      else if (r && r.perfil) {
        // Conta antiga, so com apelido: recomeca o resto do zero.
        CHAVES_DO_JOGADOR.forEach(function(k) { try { localStorage.removeItem(k); } catch (e) {} });
        aplicarEstado({ versao: 1, atualizadoEm: Date.now() });
      }
      Modal.fechar();
      if (typeof SFX !== 'undefined') SFX.faseLiberada();
      if (typeof Toasts !== 'undefined') {
        Toasts.mostrar({ icone: '👋', titulo: 'Que bom te ver de novo!', texto: (apelido() || 'Craque') + ', seu progresso voltou.' });
      }
      if (typeof mostrarTela === 'function') mostrarTela('tela-menu');
    }).catch(function(erro) {
      ocupado(botao, false);
      avisoEntrar(erro.message, 'erro');
    });
  }

  // ---------- Sair / apagar ----------

  var acaoPendente = null;

  function pedirConfirmacao(opcoes, origem) {
    acaoPendente = opcoes;
    el('titulo-confirmar-conta').textContent = opcoes.titulo;
    el('texto-confirmar-conta').textContent = opcoes.texto;
    var campo = el('campo-codigo-confirmar');
    campo.hidden = !opcoes.pedirCodigo;
    el('input-codigo-confirmar').value = '';
    el('aviso-confirmar-conta').textContent = '';
    var b = el('botao-confirmar-conta');
    b.textContent = opcoes.botao;
    b.classList.toggle('botao-perigo', !!opcoes.perigo);
    Modal.abrir(el('sobreposicao-confirmar-conta'), origem, { aoFechar: function() { acaoPendente = null; } });
  }

  function limparJogadorLocal() {
    CHAVES_DO_JOGADOR.forEach(function(k) { try { localStorage.removeItem(k); } catch (e) {} });
    if (typeof Sala !== 'undefined' && Sala.estaNaSala && Sala.estaNaSala()) { try { Sala.sair(); } catch (e) {} }
  }

  function recomecar() {
    // Recarregar e o jeito mais seguro de nao sobrar nada do jogador
    // anterior na memoria (estado da partida, telas ja desenhadas).
    try { sessionStorage.setItem('mathgol_aviso_inicio', 'trocou'); } catch (e) {}
    location.reload();
  }

  function sairDoAparelho(origem) {
    var comCodigo = statusNuvem.temCodigo;
    pedirConfirmacao({
      titulo: 'Sair deste aparelho?',
      texto: comCodigo
        ? 'Seu progresso fica guardado na nuvem. Para voltar, use o seu código do craque.'
        : 'Você ainda NÃO tem código. Se sair agora, o que você conquistou neste aparelho vai se perder. Crie seu código antes!',
      botao: 'Sim, sair',
      perigo: !comCodigo,
      executar: function() {
        var fim = function() { limparJogadorLocal(); recomecar(); };
        if (window.FirebaseMathGol && window.FirebaseMathGol.sairDaConta) {
          return sincronizarAgora().then(function() { return window.FirebaseMathGol.sairDaConta(); }).then(fim, fim);
        }
        fim();
        return Promise.resolve();
      }
    }, origem);
  }

  function apagarDados(origem) {
    pedirConfirmacao({
      titulo: 'Apagar meus dados?',
      texto: 'Isto apaga para sempre o seu progresso, conquistas, Cruzeiros, itens e o código do craque — neste aparelho e na nuvem. Não dá para desfazer. Peça ajuda a um adulto.',
      botao: 'Apagar tudo',
      perigo: true,
      pedirCodigo: false,
      executar: function(codigoDigitado) {
        var F = window.FirebaseMathGol;
        if (!F || !F.apagarMeusDados) { limparJogadorLocal(); recomecar(); return Promise.resolve(); }
        return F.apagarMeusDados({
          codigoSala: typeof Sala !== 'undefined' && Sala.codigo ? Sala.codigo() : '',
          codigoAtual: codigoDigitado || ''
        }).then(function() { limparJogadorLocal(); recomecar(); });
      }
    }, origem);
  }

  function confirmarAcao() {
    var acao = acaoPendente;
    if (!acao) return;
    var botao = el('botao-confirmar-conta');
    var aviso = el('aviso-confirmar-conta');
    var codigo = el('campo-codigo-confirmar').hidden ? '' : el('input-codigo-confirmar').value;
    ocupado(botao, true);
    aviso.textContent = '';
    acao.executar(codigo).then(function() {
      ocupado(botao, false);
    }).catch(function(erro) {
      ocupado(botao, false);
      if (erro && erro.code === 'auth/requires-recent-login') {
        // O Firebase pede o codigo de novo para apagar uma conta com codigo.
        el('campo-codigo-confirmar').hidden = false;
        aviso.textContent = 'Por segurança, digite o seu código do craque e toque em "Apagar tudo" de novo.';
        try { el('input-codigo-confirmar').focus(); } catch (e) {}
        return;
      }
      aviso.textContent = (erro && erro.message) || 'Não deu certo agora. Tente de novo.';
    });
  }

  function status() { return Object.assign({}, statusNuvem); }

  function init() {
    carregarPerfil();
    if (typeof Carteira !== 'undefined') Carteira.aoMudar(marcarMudanca);
    if (typeof Conquistas !== 'undefined') Conquistas.aoDesbloquear(marcarMudanca);

    var ligar = function(id, fn) { var b = el(id); if (b) b.addEventListener('click', function(ev) { if (typeof SFX !== 'undefined') SFX.clique(); fn(b, ev); }); };
    ligar('botao-criar-codigo', function(b) { criarCodigo(b); });
    ligar('botao-entrar-codigo', function(b) { abrirEntrar(b); });
    ligar('botao-tenho-codigo', function(b) { abrirEntrar(b); });
    ligar('botao-copiar-codigo', copiarCodigo);
    ligar('botao-baixar-cartao', baixarCartao);
    ligar('botao-guardei-codigo', function() { Modal.fechar(); });
    ligar('botao-confirmar-codigo', confirmarEntrar);
    ligar('botao-cancelar-codigo', function() { Modal.fechar(); });
    ligar('botao-sair-conta', function(b) { sairDoAparelho(b); });
    ligar('botao-apagar-dados', function(b) { apagarDados(b); });
    ligar('botao-confirmar-conta', confirmarAcao);
    ligar('botao-cancelar-conta', function() { Modal.fechar(); });

    var input = el('input-codigo-craque');
    if (input) {
      input.addEventListener('input', function() { formatarEntrada(input); });
      input.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') { ev.preventDefault(); confirmarEntrar(); } });
    }
    var inputConf = el('input-codigo-confirmar');
    if (inputConf) inputConf.addEventListener('input', function() { formatarEntrada(inputConf); });
    ['sobreposicao-codigo', 'sobreposicao-entrar-codigo', 'sobreposicao-confirmar-conta'].forEach(function(id) {
      if (el(id) && id !== 'sobreposicao-codigo') Modal.ligarFundo(el(id)); // o codigo so fecha no "Ja guardei"
    });

    document.addEventListener('mathgol:firebase-pronto', aoFirebasePronto);
    if (window.FirebaseMathGol) aoFirebasePronto();
  }

  return {
    init: init,
    perfil: obterPerfil,
    apelido: apelido,
    salvarPerfil: salvarPerfil,
    bordaAtual: bordaAtual,
    status: status,
    aoMudar: aoMudar,
    marcarMudanca: marcarMudanca,
    sincronizarAgora: sincronizarAgora,
    coletarEstado: coletarEstado,
    aplicarEstado: aplicarEstado,
    criarCodigo: criarCodigo,
    mostrarCodigo: mostrarCodigo
  };
})();
