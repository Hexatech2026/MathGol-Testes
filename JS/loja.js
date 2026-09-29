// loja.js — carteira de Cruzeiros, escudos dos clubes e lógica de compra.
//
// Carteira mora no Firestore (jogadores/{token}), não em localStorage: a
// criança usa o laboratório e quase nunca pega a mesma máquina duas vezes.
// Enquanto o Firebase não responde, a loja abre em modo somente-leitura em
// vez de deixar comprar em cima de um saldo que pode estar errado.

var Loja = (function() {

  var token = null;
  var carteira = { saldo: 0, comprados: [] };
  var pronta = false;      // já leu do Firebase com sucesso
  var carregando = false;

  // ---------- Carteira ----------

  function estaPronta() { return pronta; }
  function saldo() { return carteira.saldo; }

  function temItem(tipo, id) {
    if (estaLiberadoDeInicio(tipo === 'clube' ? 'selecoes' : tipo + 's', id)) return true;
    return carteira.comprados.indexOf(chaveItem(tipo, id)) !== -1;
  }

  // Pergunta direta usada pelas telas de escolha: essa opção está disponível?
  // Clubes nunca nascem liberados; seleções seguem LIBERADO_DE_INICIO.
  function liberado(tipo, id) {
    if (tipo === 'clube') {
      return carteira.comprados.indexOf(chaveItem('clube', id)) !== -1;
    }
    var mapa = { selecao: 'selecoes', personagem: 'personagens', animal: 'animais', avatar: 'avatares' };
    if (estaLiberadoDeInicio(mapa[tipo], id)) return true;
    return carteira.comprados.indexOf(chaveItem(tipo, id)) !== -1;
  }

  async function carregar(tokenJogador) {
    token = tokenJogador;
    if (!token || !window.FirebaseMathGol) return false;
    if (carregando) return pronta;
    carregando = true;
    try {
      var remota = await window.FirebaseMathGol.buscarCarteira(token);
      if (remota) {
        carteira = remota;
        pronta = true;
      }
    } finally {
      carregando = false;
    }
    atualizarSaldoNaTela();
    return pronta;
  }

  // Credita o que a criança ganhou na fase. Só grava se a carteira já foi
  // lida — senão somaria em cima de um saldo zerado e apagaria o que ela tinha.
  async function creditar(valor) {
    if (!pronta || !valor || valor <= 0) return false;
    carteira.saldo += Math.round(valor);
    atualizarSaldoNaTela();
    return await window.FirebaseMathGol.salvarCarteira(token, carteira);
  }

  async function comprar(tipo, id) {
    if (!pronta) return { ok: false, motivo: 'offline' };
    if (liberado(tipo, id)) return { ok: false, motivo: 'ja-tem' };

    var preco = precoDoItem(tipo);
    if (carteira.saldo < preco) return { ok: false, motivo: 'sem-saldo', falta: preco - carteira.saldo };

    // Só desconta depois que o Firebase confirmou, pra não deixar a criança
    // sem os Cruzeiros e sem o item se a gravação falhar.
    var antes = { saldo: carteira.saldo, comprados: carteira.comprados.slice() };
    carteira.saldo -= preco;
    carteira.comprados.push(chaveItem(tipo, id));

    var salvou = await window.FirebaseMathGol.salvarCarteira(token, carteira);
    if (!salvou) {
      carteira = antes;
      atualizarSaldoNaTela();
      return { ok: false, motivo: 'falha-salvar' };
    }
    atualizarSaldoNaTela();
    return { ok: true, preco: preco, saldo: carteira.saldo };
  }

  function atualizarSaldoNaTela() {
    var alvos = document.querySelectorAll('[data-saldo-cruzeiros]');
    for (var i = 0; i < alvos.length; i++) {
      alvos[i].textContent = pronta ? String(carteira.saldo) : '--';
    }
  }

  // ---------- Escudo do clube ----------
  //
  // Desenhado por nós: escudo pentagonal com faixa diagonal nas cores do
  // clube e a sigla no centro. Não reproduz nenhum escudo oficial — esses
  // são marca registrada dos times.
  function escudo(clube, tamanho) {
    var t = tamanho || 56;
    var idFaixa = 'faixa-' + clube.id;
    var claro = corEhClara(clube.corPrimaria);
    var corTexto = claro ? '#21303B' : '#FFFDF6';

    // A sigla fica sobre uma placa na cor primária, não direto sobre a faixa
    // diagonal. Sem isso, time de faixa branca (Atlético-MG, Botafogo) some a
    // sigla branca no meio do escudo.
    return '' +
      '<svg class="escudo-clube" viewBox="0 0 100 112" width="' + t + '" height="' + Math.round(t * 1.12) + '" role="img" aria-label="Escudo do ' + clube.nome + '">' +
        '<defs><clipPath id="' + idFaixa + '">' +
          '<path d="M50 2 L96 20 V60 Q96 92 50 110 Q4 92 4 60 V20 Z"/>' +
        '</clipPath></defs>' +
        '<g clip-path="url(#' + idFaixa + ')">' +
          '<rect x="0" y="0" width="100" height="112" fill="' + clube.corPrimaria + '"/>' +
          '<polygon points="0,112 40,0 74,0 34,112" fill="' + clube.corSecundaria + '"/>' +
          '<rect x="0" y="42" width="100" height="34" fill="' + clube.corPrimaria + '"/>' +
        '</g>' +
        '<path d="M50 2 L96 20 V60 Q96 92 50 110 Q4 92 4 60 V20 Z" fill="none" stroke="#21303B" stroke-width="5"/>' +
        '<line x1="4" y1="42" x2="96" y2="42" stroke="#21303B" stroke-width="2.5"/>' +
        '<line x1="4" y1="76" x2="96" y2="76" stroke="#21303B" stroke-width="2.5"/>' +
        '<text x="50" y="68" text-anchor="middle" font-family="Fredoka, sans-serif" font-size="27" font-weight="700"' +
        ' fill="' + corTexto + '">' + clube.sigla + '</text>' +
      '</svg>';
  }

  // Luminância relativa simplificada — decide se a sigla sai escura ou clara
  // pra continuar legível sobre a cor do clube (times de camisa branca).
  function corEhClara(hex) {
    var h = String(hex).replace('#', '');
    if (h.length !== 6) return false;
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 165;
  }

  return {
    carregar: carregar,
    estaPronta: estaPronta,
    saldo: saldo,
    liberado: liberado,
    temItem: temItem,
    comprar: comprar,
    creditar: creditar,
    escudo: escudo,
    atualizarSaldoNaTela: atualizarSaldoNaTela
  };
})();
