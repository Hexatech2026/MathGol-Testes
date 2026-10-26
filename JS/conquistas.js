// conquistas.js — medalhas que a crianca desbloqueia jogando.
//
// O jogo AVISA o que aconteceu (registrar(evento, dados)); este modulo
// conta, decide quais medalhas sairam, paga o premio (Cruzeiros e/ou uma
// borda de avatar) e chama quem quiser mostrar o aviso na tela.
//
// Eventos:
//   'conta-certa'        { tempoMs }
//   'gol'                { tipo: 'rasteiro'|'meia'|'cavadinha'|null }
//   'partida-fim'        { faseId, gols, total, resumo: 'GDGF...' }
//   'fase-desbloqueada'  { faseId }
//   'compra'             {}
//   'borda-trocada'      {}
//   'codigo-criado'      {}
//
// Armazenamento: localStorage "mathgol_conquistas", formato versionado
//   { versao: 1, dados: { feitas: { id: 'ISO' }, contadores: {...} } }
// validado por ValidacaoBackup.validarConquistas (mesma regra do backup e
// da nuvem). Valor corrompido = recomeca vazio, sem quebrar o jogo.
//
// Nunca ha conquista por ERRAR: as medalhas premiam acerto, esforco e
// constancia (o jogo e para criancas; errar faz parte).

(function(raiz) {
  'use strict';

  var CHAVE = 'mathgol_conquistas';
  var VERSAO = 1;

  // meta: quando existe, a medalha tem barra de progresso (contador / meta).
  // premio.cruzeiros vai para a carteira; premio.borda libera uma moldura.
  var LISTA = [
    { id: 'primeiro-gol',     icone: '🥅', nome: 'Primeiro Gol',        descricao: 'Faça seu primeiro gol.',                         premio: { cruzeiros: 20, borda: 'estrela' } },
    { id: 'contas-10',        icone: '🧮', nome: 'Calculadora Humana',  descricao: 'Acerte 10 contas.',                              meta: 10, contador: 'contasCertas', premio: { cruzeiros: 30 } },
    { id: 'contas-50',        icone: '🧠', nome: 'Gênio da Matemática', descricao: 'Acerte 50 contas.',                              meta: 50, contador: 'contasCertas', premio: { cruzeiros: 80 } },
    { id: 'relampago',        icone: '⚡', nome: 'Relâmpago',           descricao: 'Acerte uma conta em menos de 3 segundos.',       premio: { cruzeiros: 30, borda: 'raio' } },
    { id: 'gols-10',          icone: '⚽', nome: 'Artilheiro',          descricao: 'Faça 10 gols.',                                  meta: 10, contador: 'gols', premio: { cruzeiros: 40 } },
    { id: 'gols-50',          icone: '👑', nome: 'Goleador Lendário',   descricao: 'Faça 50 gols.',                                  meta: 50, contador: 'gols', premio: { cruzeiros: 120, borda: 'coroa' } },
    { id: 'hat-trick',        icone: '🎩', nome: 'Hat-trick',           descricao: 'Faça 3 gols seguidos na mesma partida.',         premio: { cruzeiros: 40 } },
    { id: 'partida-perfeita', icone: '💯', nome: 'Partida Perfeita',    descricao: 'Faça gol em todas as cobranças de uma fase.',    premio: { cruzeiros: 60 } },
    { id: 'cavadinha',        icone: '☁️', nome: 'Cavadinha de Craque', descricao: 'Faça um gol de cavadinha.',                      premio: { cruzeiros: 30 } },
    { id: 'rasteiro',         icone: '🐍', nome: 'Rasteirinho',         descricao: 'Faça um gol rasteiro.',                          premio: { cruzeiros: 20 } },
    { id: 'fase-falta',       icone: '🔓', nome: 'Rumo à Falta',        descricao: 'Desbloqueie a fase Falta.',                      premio: { cruzeiros: 30 } },
    { id: 'fase-final',       icone: '🏟️', nome: 'Finalista',           descricao: 'Desbloqueie a Final.',                           premio: { cruzeiros: 50 } },
    { id: 'campeao',          icone: '🏆', nome: 'Campeão!',            descricao: 'Faça 5 gols ou mais na Final.',                  premio: { cruzeiros: 150, borda: 'trofeu' } },
    { id: 'partidas-10',      icone: '💪', nome: 'Nunca Desiste',       descricao: 'Jogue 10 partidas.',                             meta: 10, contador: 'partidas', premio: { cruzeiros: 50 } },
    { id: 'dias-3',           icone: '📅', nome: 'Treino em Dia',       descricao: 'Jogue em 3 dias diferentes.',                    meta: 3, contador: 'dias', premio: { cruzeiros: 60 } },
    { id: 'colecionador',     icone: '🛍️', nome: 'Colecionador',        descricao: 'Compre 3 itens na Loja.',                        meta: 3, contador: 'compras', premio: { cruzeiros: 40 } },
    { id: 'estiloso',         icone: '✨', nome: 'Estiloso',            descricao: 'Troque a borda do seu avatar.',                  premio: { cruzeiros: 10 } },
    { id: 'craque-seguro',    icone: '🔐', nome: 'Craque Seguro',       descricao: 'Crie o seu código do craque.',                   premio: { cruzeiros: 30 } }
  ];

  var CONTADORES = ['contasCertas', 'gols', 'partidas', 'compras', 'dias'];
  var LIMITE_CONTADOR = 1000000;

  function hojeLocal() {
    var d = new Date();
    var m = d.getMonth() + 1, dia = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dia < 10 ? '0' : '') + dia;
  }

  function vazio() {
    return { feitas: {}, contadores: { contasCertas: 0, gols: 0, partidas: 0, compras: 0, dias: 0, ultimoDia: '' } };
  }

  // armazenamento: { ler(chave), gravar(chave, texto) } — localStorage no
  // navegador, um objeto simples nos testes.
  function criar(armazenamento, opcoes) {
    opcoes = opcoes || {};
    var dados = vazio();
    var ouvintes = [];
    var pagarPremio = opcoes.pagarPremio || function() {};
    var validar = opcoes.validar || function() { return true; };
    var hoje = opcoes.hoje || hojeLocal;

    function carregar() {
      dados = vazio();
      var bruto = null;
      try { bruto = JSON.parse(armazenamento.ler(CHAVE)); } catch (e) { bruto = null; }
      if (!bruto || !validar(bruto)) return;
      var d = bruto.dados;
      Object.keys(d.feitas || {}).forEach(function(id) { if (porId(id)) dados.feitas[id] = d.feitas[id]; });
      CONTADORES.forEach(function(c) {
        var v = d.contadores && d.contadores[c];
        if (typeof v === 'number' && isFinite(v) && v >= 0) dados.contadores[c] = Math.min(LIMITE_CONTADOR, Math.floor(v));
      });
      if (d.contadores && typeof d.contadores.ultimoDia === 'string') dados.contadores.ultimoDia = d.contadores.ultimoDia;
    }

    function salvar() {
      try { armazenamento.gravar(CHAVE, JSON.stringify({ versao: VERSAO, dados: dados })); } catch (e) {}
    }

    function porId(id) {
      for (var i = 0; i < LISTA.length; i++) if (LISTA[i].id === id) return LISTA[i];
      return null;
    }

    function feita(id) { return !!dados.feitas[id]; }

    function somar(contador, n) {
      dados.contadores[contador] = Math.min(LIMITE_CONTADOR, (dados.contadores[contador] || 0) + (n || 1));
    }

    // Conta o dia de hoje uma vez so (dias diferentes jogados).
    function marcarDia() {
      var h = hoje();
      if (dados.contadores.ultimoDia !== h) {
        dados.contadores.ultimoDia = h;
        somar('dias');
      }
    }

    // Decide as medalhas novas a partir do evento + contadores.
    function avaliar(evento, d) {
      var novas = [];
      function tentar(id, condicao) { if (condicao && !feita(id)) novas.push(id); }
      // Medalhas por contador (meta) valem para qualquer evento.
      LISTA.forEach(function(c) {
        if (c.meta && c.contador) tentar(c.id, (dados.contadores[c.contador] || 0) >= c.meta);
      });
      if (evento === 'conta-certa') tentar('relampago', typeof d.tempoMs === 'number' && d.tempoMs < 3000);
      if (evento === 'gol') {
        tentar('primeiro-gol', true);
        tentar('cavadinha', d.tipo === 'cavadinha');
        tentar('rasteiro', d.tipo === 'rasteiro');
      }
      if (evento === 'partida-fim') {
        var resumo = String(d.resumo || '');
        tentar('primeiro-gol', d.gols > 0);
        tentar('hat-trick', resumo.indexOf('GGG') !== -1);
        tentar('partida-perfeita', d.total > 0 && d.gols === d.total);
        tentar('campeao', d.faseId === 'final' && d.gols >= 5);
      }
      if (evento === 'fase-desbloqueada') {
        tentar('fase-falta', d.faseId === 'falta');
        tentar('fase-final', d.faseId === 'final');
      }
      tentar('estiloso', evento === 'borda-trocada');
      tentar('craque-seguro', evento === 'codigo-criado');
      return novas;
    }

    function registrar(evento, d) {
      d = d || {};
      if (evento === 'conta-certa') somar('contasCertas');
      if (evento === 'gol') somar('gols');
      if (evento === 'partida-fim') { somar('partidas'); marcarDia(); }
      if (evento === 'compra') somar('compras');

      var novas = avaliar(evento, d);
      var agora = new Date().toISOString();
      novas.forEach(function(id) { dados.feitas[id] = agora; });
      salvar();
      var medalhas = novas.map(porId);
      medalhas.forEach(function(m) { pagarPremio(m); });
      if (medalhas.length) {
        ouvintes.forEach(function(fn) {
          try { fn(medalhas); } catch (e) { console.warn('Erro num ouvinte de conquistas:', e); }
        });
      }
      return medalhas;
    }

    function progresso(c) {
      if (feita(c.id)) return 1;
      if (!c.meta) return 0;
      return Math.min(1, (dados.contadores[c.contador] || 0) / c.meta);
    }

    function contador(nome) { return dados.contadores[nome] || 0; }

    carregar();

    return {
      CHAVE: CHAVE,
      LISTA: LISTA,
      porId: porId,
      feita: feita,
      registrar: registrar,
      progresso: progresso,
      contador: contador,
      total: function() { return LISTA.length; },
      quantasFeitas: function() { return Object.keys(dados.feitas).length; },
      exportar: function() { return JSON.parse(JSON.stringify({ versao: VERSAO, dados: dados })); },
      recarregar: carregar,
      aoDesbloquear: function(fn) { if (typeof fn === 'function') ouvintes.push(fn); }
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { criar: criar, LISTA: LISTA, CHAVE: CHAVE };
    return;
  }

  raiz.Conquistas = criar({
    ler: function(k) { return localStorage.getItem(k); },
    gravar: function(k, v) { localStorage.setItem(k, v); }
  }, {
    validar: function(obj) {
      return typeof ValidacaoBackup !== 'undefined' && ValidacaoBackup.validarConquistas
        ? ValidacaoBackup.validarConquistas(obj) : !!(obj && obj.versao === VERSAO && obj.dados);
    },
    pagarPremio: function(medalha) {
      if (medalha.premio && medalha.premio.cruzeiros && typeof Carteira !== 'undefined') {
        Carteira.adicionar(medalha.premio.cruzeiros);
      }
    }
  });
})(typeof window !== 'undefined' ? window : this);
