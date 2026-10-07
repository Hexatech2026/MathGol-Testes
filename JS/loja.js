// loja.js — Loja do Craque: a criança gasta Cruzeiros (Carteira) em
// seleções, times do Brasileirão Série A 2026, avatares e nomes.
//
// Fluxo de compra (pensado para criança, sem compra por engano):
//   toque em "Comprar" → modal "Comprar X por N Cruzeiros?" → "Sim, comprar!"
// Sem saldo suficiente, o botão fica desabilitado e mostra quanto falta.
// Tudo montado com createElement/textContent (nada de innerHTML).

var Loja = (function() {
  'use strict';

  var abaAtiva = 'selecao';
  var itemPendente = null;
  var timerStatus = null;

  var NOME_TIPO = {
    selecao: 'a seleção',
    clube: 'o time',
    avatar: 'o avatar',
    nome: 'o nome'
  };

  function el(id) { return document.getElementById(id); }

  function abrir(origem, aba) {
    if (origem && origem !== 'tela-loja') origemTela['tela-loja'] = origem;
    if (aba) abaAtiva = aba;
    mostrarStatus('');
    renderizar();
    mostrarTela('tela-loja');
  }

  function sair() {
    reabrirTela(origemTela['tela-loja'] || 'tela-menu');
  }

  function mostrarStatus(texto) {
    var s = el('status-loja');
    if (!s) return;
    s.textContent = texto;
    if (timerStatus) clearTimeout(timerStatus);
    if (texto) timerStatus = setTimeout(function() { s.textContent = ''; }, 5000);
  }

  function atualizarSaldo() {
    var saldo = Carteira.saldo();
    var v = el('saldo-loja-valor');
    var m = el('saldo-loja-moeda');
    if (v) v.textContent = String(saldo);
    if (m) m.textContent = saldo === 1 ? 'Cruzeiro' : 'Cruzeiros';
  }

  function marcarAbas() {
    document.querySelectorAll('#abas-loja .aba-loja').forEach(function(b) {
      var ativa = b.getAttribute('data-aba') === abaAtiva;
      b.classList.toggle('aba-ativa', ativa);
      b.setAttribute('aria-pressed', ativa ? 'true' : 'false');
    });
  }

  // Desenho do item: bandeira, escudo genérico, avatar ou etiqueta de nome.
  function criarVisual(item, grande) {
    if (item.tipo === 'selecao' || item.tipo === 'clube') {
      var v = criarVisualTime(item.time, 'cartao-bandeira');
      if (v) return v;
    }
    if (item.tipo === 'avatar') {
      var moldura = document.createElement('span');
      moldura.className = 'loja-avatar' + (grande ? ' loja-avatar-grande' : '');
      var img = document.createElement('img');
      img.src = gerarUrlAvatar(item.seed);
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = function() { this.onerror = null; this.src = gerarAvatarFallbackLocal(item.seed); };
      moldura.appendChild(img);
      return moldura;
    }
    var etiqueta = document.createElement('span');
    etiqueta.className = 'loja-etiqueta-nome';
    etiqueta.textContent = item.subtipo === 'animal' ? '🐾' : '⭐';
    return etiqueta;
  }

  function criarPreco(valor) {
    var p = document.createElement('span');
    p.className = 'loja-preco';
    var icone = document.createElement('img');
    icone.className = 'icone-cruzeiro';
    icone.src = '../Imagens/estrela-cruzeiro.png';
    icone.alt = '';
    p.appendChild(icone);
    p.appendChild(document.createTextNode(String(valor)));
    return p;
  }

  function renderizar() {
    atualizarSaldo();
    marcarAbas();
    var grade = el('grade-loja');
    grade.textContent = '';
    var saldo = Carteira.saldo();
    var itens = catalogoLoja().filter(function(i) { return i.tipo === abaAtiva; });

    if (abaAtiva === 'nome') {
      // Separa "Personagem" (primeira palavra) de "Animal" (segunda).
      renderizarGrupo(grade, 'Primeira palavra (personagem)', itens.filter(function(i) { return i.subtipo === 'personagem'; }), saldo);
      renderizarGrupo(grade, 'Segunda palavra (animal)', itens.filter(function(i) { return i.subtipo === 'animal'; }), saldo);
      return;
    }
    if (abaAtiva === 'clube') {
      var aviso = document.createElement('p');
      aviso.className = 'loja-aviso-grupo';
      aviso.textContent = 'Os 20 times da Série A 2026. Escudos ilustrativos com as cores de cada time.';
      grade.appendChild(aviso);
    }
    var lista = document.createElement('div');
    lista.className = 'loja-lista';
    itens.forEach(function(item) { lista.appendChild(criarCartaoItem(item, saldo)); });
    grade.appendChild(lista);
  }

  function renderizarGrupo(grade, titulo, itens, saldo) {
    var h = document.createElement('h3');
    h.className = 'subtitulo-secao loja-titulo-grupo';
    h.textContent = titulo;
    grade.appendChild(h);
    var lista = document.createElement('div');
    lista.className = 'loja-lista';
    itens.forEach(function(item) { lista.appendChild(criarCartaoItem(item, saldo)); });
    grade.appendChild(lista);
  }

  function criarCartaoItem(item, saldo) {
    var possui = Carteira.possui(item.id);
    var cartao = document.createElement('div');
    cartao.className = 'item-loja item-loja-' + item.tipo + (possui ? ' item-loja-possui' : '');
    cartao.setAttribute('data-item', item.id);

    cartao.appendChild(criarVisual(item));
    var nome = document.createElement('span');
    nome.className = 'item-loja-nome';
    nome.textContent = item.nome;
    cartao.appendChild(nome);

    var botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'botao-comprar';
    if (possui) {
      botao.disabled = true;
      botao.classList.add('comprado');
      botao.textContent = '✓ É seu!';
      botao.setAttribute('aria-label', item.nome + ': já é seu');
    } else {
      botao.appendChild(document.createTextNode('Comprar '));
      botao.appendChild(criarPreco(item.preco));
      var faltam = item.preco - saldo;
      if (faltam > 0) {
        botao.disabled = true;
        botao.classList.add('sem-saldo');
        botao.setAttribute('aria-label', item.nome + ': custa ' + Carteira.formatar(item.preco) + '. Faltam ' + faltam + '.');
        var falta = document.createElement('span');
        falta.className = 'item-loja-falta';
        falta.textContent = 'Faltam ' + faltam;
        cartao.appendChild(falta);
      } else {
        botao.setAttribute('aria-label', 'Comprar ' + item.nome + ' por ' + Carteira.formatar(item.preco));
        botao.addEventListener('click', function() { pedirConfirmacao(item, botao); });
      }
    }
    cartao.appendChild(botao);
    return cartao;
  }

  function pedirConfirmacao(item, origem) {
    SFX.clique();
    itemPendente = item;
    el('titulo-compra').textContent = 'Comprar ' + item.nome + '?';
    var visual = el('visual-compra');
    visual.textContent = '';
    visual.appendChild(criarVisual(item, true));
    var texto = el('texto-compra');
    texto.textContent = 'Comprar ' + NOME_TIPO[item.tipo] + ' ' + item.nome + ' por ' + Carteira.formatar(item.preco) +
      '? Vão sobrar ' + Carteira.formatar(Carteira.saldo() - item.preco) + '.';
    Modal.abrir(el('sobreposicao-compra'), origem, { aoFechar: function() { itemPendente = null; } });
  }

  function confirmarCompra() {
    var item = itemPendente;
    if (!item) return;
    var resultado = Carteira.comprar(item.id, item.preco);
    itemPendente = null;
    Modal.fechar();
    if (resultado.ok) {
      SFX.faseLiberada();
      var dica = item.tipo === 'avatar' || item.tipo === 'nome'
        ? ' Escolha na tela "Monte seu craque".'
        : ' Escolha na tela "Escolha seu time".';
      mostrarStatus('🎉 Agora ' + item.nome + ' é seu!' + dica);
      if (typeof Narracao !== 'undefined') Narracao.falar('Agora ' + item.nome + ' é seu!');
    } else if (resultado.motivo === 'saldo') {
      mostrarStatus('Ainda faltam ' + Carteira.formatar(resultado.faltam) + '. Faça mais gols!');
    } else if (resultado.motivo === 'ja-possui') {
      mostrarStatus(item.nome + ' já é seu!');
    }
    renderizar();
    // O foco volta para o cartao do item (o botao antigo foi redesenhado).
    var cartao = document.querySelector('#grade-loja [data-item="' + cssEscapar(item.id) + '"] .botao-comprar');
    var foco = cartao && !cartao.disabled ? cartao : el('status-loja');
    if (foco) {
      if (foco.id === 'status-loja') foco.setAttribute('tabindex', '-1');
      try { foco.focus({ preventScroll: false }); } catch (e) {}
    }
  }

  function cssEscapar(v) {
    return (window.CSS && CSS.escape) ? CSS.escape(v) : String(v).replace(/["\\]/g, '\\$&');
  }

  function init() {
    document.querySelectorAll('#abas-loja .aba-loja').forEach(function(b) {
      b.addEventListener('click', function() {
        SFX.clique();
        abaAtiva = b.getAttribute('data-aba');
        renderizar();
      });
    });
    el('botao-sair-loja').addEventListener('click', function() { SFX.clique(); sair(); });
    el('botao-loja').addEventListener('click', function() { SFX.clique(); abrir('tela-menu'); });
    el('botao-confirmar-compra').addEventListener('click', confirmarCompra);
    el('botao-cancelar-compra').addEventListener('click', function() { SFX.clique(); Modal.fechar(); });
    Modal.ligarFundo(el('sobreposicao-compra'));
    Carteira.aoMudar(function() { if (telaAtivaId() === 'tela-loja') atualizarSaldo(); });
  }

  return { abrir: abrir, sair: sair, renderizar: renderizar, init: init };
})();

function initLoja() { Loja.init(); }
