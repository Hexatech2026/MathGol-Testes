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
// v2.2:
//   'conta-errada'       {}                       (zera a sequencia de acertos)
//   'gol'                { tipo, pontos }         (pontos: Cruzeiros da cobranca)
//   'partida-fim'        { ..., pontuacao }
//   'copa-jogo'          { venceu, morteSubita }  (cada jogo da Copa 2026)
//   'copa-avancou'       { etapa: 'dezesseis'|'oitavas'|'quartas'|'semi'|'final' }
//   'copa-campeao'       {}
//   'var-confirmado'     {}                       (gol confirmado no VAR)
//   'duelo-fim'          {}                       (duelo de 2 jogadores)
//   'botao-fim'          { venceu }               (futebol de botao)
//   'comemoracao-trocada' | 'numero-trocado' | 'titulo-trocado'  {}
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
    // v2.2 (Copa 2026): os ids continuam os mesmos (estao gravados no
    // progresso de quem ja jogava); so o texto acompanhou as fases novas.
    { id: 'fase-falta',       icone: '🔓', nome: 'Pé Quente',           descricao: 'Faça 2 gols ou mais num jogo de 3 cobranças.',   premio: { cruzeiros: 30 } },
    { id: 'fase-final',       icone: '🎖️', nome: 'Decisivo',            descricao: 'Faça 3 gols ou mais num jogo de 5 cobranças.',   premio: { cruzeiros: 50 } },
    { id: 'campeao',          icone: '🥇', nome: 'Matador da Final',    descricao: 'Faça 5 gols ou mais num jogo de 7 cobranças.',   premio: { cruzeiros: 150, borda: 'trofeu' } },
    { id: 'partidas-10',      icone: '💪', nome: 'Nunca Desiste',       descricao: 'Jogue 10 partidas.',                             meta: 10, contador: 'partidas', premio: { cruzeiros: 50 } },
    { id: 'dias-3',           icone: '📅', nome: 'Treino em Dia',       descricao: 'Jogue em 3 dias diferentes.',                    meta: 3, contador: 'dias', premio: { cruzeiros: 60 } },
    { id: 'colecionador',     icone: '🛍️', nome: 'Colecionador',        descricao: 'Compre 3 itens na Loja.',                        meta: 3, contador: 'compras', premio: { cruzeiros: 40 } },
    { id: 'estiloso',         icone: '✨', nome: 'Estiloso',            descricao: 'Troque a borda do seu avatar.',                  premio: { cruzeiros: 10 } },
    { id: 'craque-seguro',    icone: '🔐', nome: 'Craque Seguro',       descricao: 'Crie o seu código do craque.',                   premio: { cruzeiros: 30 } },

    // v2.2 — mais conquistas. Os prêmios seguem a mesma régua: a medalha
    // fácil paga o preço de um nome da Loja (50), a difícil o de um time.
    { id: 'seis-sete',        icone: '🤲', nome: 'Seis-Sete!',          descricao: 'Faça uma cobrança valer exatamente 67 Cruzeiros (responda em 5 segundos).', premio: { cruzeiros: 67 } },
    { id: 'aura-maxima',      icone: '✨', nome: '+1000 de Aura',       descricao: 'Acerte 10 contas seguidas, sem errar nenhuma.',  premio: { cruzeiros: 100 } },
    { id: 'ego-campeao',      icone: '😎', nome: 'Ego de Campeão',      descricao: 'Faça 3 partidas perfeitas.',                     meta: 3, contador: 'perfeitas', premio: { cruzeiros: 120 } },
    { id: 'contas-100',       icone: '🤖', nome: 'Máquina de Calcular', descricao: 'Acerte 100 contas.',                             meta: 100, contador: 'contasCertas', premio: { cruzeiros: 150 } },
    { id: 'gols-100',         icone: '🦁', nome: 'Rei do Gol',          descricao: 'Faça 100 gols.',                                 meta: 100, contador: 'gols', premio: { cruzeiros: 200 } },
    { id: 'partidas-25',      icone: '🌱', nome: 'Craque Raiz',         descricao: 'Jogue 25 partidas.',                             meta: 25, contador: 'partidas', premio: { cruzeiros: 100 } },
    { id: 'dias-7',           icone: '🗓️', nome: 'Semana de Craque',    descricao: 'Jogue em 7 dias diferentes.',                    meta: 7, contador: 'dias', premio: { cruzeiros: 120 } },
    { id: 'copa-estreia',     icone: '🌎', nome: 'Estreia na Copa',     descricao: 'Jogue a primeira partida da Copa 2026.',         premio: { cruzeiros: 30 } },
    { id: 'copa-grupo',       icone: '📋', nome: 'Passou do Grupo',     descricao: 'Classifique-se na fase de grupos da Copa.',      premio: { cruzeiros: 60 } },
    { id: 'copa-quartas',     icone: '🎯', nome: 'Quartas de Final',    descricao: 'Chegue às quartas de final da Copa.',            premio: { cruzeiros: 80 } },
    { id: 'copa-final',       icone: '🏟️', nome: 'Final da Copa',       descricao: 'Chegue à grande final da Copa 2026.',            premio: { cruzeiros: 120 } },
    { id: 'copa-campeao',     icone: '🏆', nome: 'Campeão do Mundo',    descricao: 'Ganhe a Copa do Mundo 2026.',                    premio: { cruzeiros: 300, borda: 'taca' } },
    { id: 'morte-subita',     icone: '😤', nome: 'Nervos de Aço',       descricao: 'Vença um jogo da Copa na morte súbita.',         premio: { cruzeiros: 60 } },
    { id: 'var-aprovado',     icone: '📺', nome: 'Aprovado pelo VAR',   descricao: 'Confirme um gol no VAR acertando a expressão.',  premio: { cruzeiros: 40 } },
    { id: 'var-5',            icone: '🧐', nome: 'Amigo do VAR',        descricao: 'Confirme 5 gols no VAR.',                        meta: 5, contador: 'vars', premio: { cruzeiros: 80 } },
    { id: 'duelo',            icone: '🤝', nome: 'Resenha com os Amigos', descricao: 'Jogue um duelo com outra pessoa.',             premio: { cruzeiros: 40 } },
    { id: 'botao-vitoria',    icone: '🔘', nome: 'Mestre do Botão',     descricao: 'Vença uma partida de futebol de botão.',         premio: { cruzeiros: 60 } },
    { id: 'showman',          icone: '🎉', nome: 'Showman',             descricao: 'Escolha uma comemoração de gol.',                premio: { cruzeiros: 10 } },
    { id: 'camisa-propria',   icone: '👕', nome: 'Camisa Própria',      descricao: 'Escolha o número da sua camisa.',                premio: { cruzeiros: 10 } },
    { id: 'com-titulo',       icone: '🎖️', nome: 'Tem Título',          descricao: 'Escolha um título para o seu craque.',           premio: { cruzeiros: 10 } },
    { id: 'medalhas-20',      icone: '🐐', nome: 'Mito',                descricao: 'Ganhe 20 conquistas.',                           premio: { cruzeiros: 200 } }
  ];

  var SEQUENCIA_AURA = 10;
  var CONTADORES = ['contasCertas', 'gols', 'partidas', 'compras', 'dias', 'perfeitas', 'copas', 'vars', 'duelos'];
  var LIMITE_CONTADOR = 1000000;

  function hojeLocal() {
    var d = new Date();
    var m = d.getMonth() + 1, dia = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dia < 10 ? '0' : '') + dia;
  }

  function vazio() {
    var c = { ultimoDia: '' };
    CONTADORES.forEach(function(k) { c[k] = 0; });
    return { feitas: {}, contadores: c };
  }

  // armazenamento: { ler(chave), gravar(chave, texto) } — localStorage no
  // navegador, um objeto simples nos testes.
  function criar(armazenamento, opcoes) {
    opcoes = opcoes || {};
    var dados = vazio();
    var ouvintes = [];
    // Contas certas seguidas. Fica so na memoria: a "aura" vale dentro de
    // uma sessao de jogo, e nao precisa de campo novo no backup/nuvem.
    var sequencia = 0;
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
      if (evento === 'conta-certa') {
        tentar('relampago', typeof d.tempoMs === 'number' && d.tempoMs < 3000);
        tentar('aura-maxima', sequencia >= SEQUENCIA_AURA);
      }
      if (evento === 'gol') {
        tentar('primeiro-gol', true);
        tentar('cavadinha', d.tipo === 'cavadinha');
        tentar('rasteiro', d.tipo === 'rasteiro');
        tentar('seis-sete', d.pontos === 67);
      }
      if (evento === 'partida-fim') {
        var resumo = String(d.resumo || '');
        tentar('primeiro-gol', d.gols > 0);
        tentar('hat-trick', resumo.indexOf('GGG') !== -1);
        tentar('partida-perfeita', d.total > 0 && d.gols === d.total);
        tentar('campeao', d.faseId === 'final' && d.gols >= 5);
        tentar('seis-sete', d.pontuacao === 67);
      }
      if (evento === 'fase-desbloqueada') {
        tentar('fase-falta', d.faseId === 'falta');
        tentar('fase-final', d.faseId === 'final');
      }
      if (evento === 'copa-jogo') {
        tentar('copa-estreia', true);
        tentar('morte-subita', !!(d.venceu && d.morteSubita));
      }
      if (evento === 'copa-avancou') {
        tentar('copa-grupo', d.etapa === 'dezesseis');
        tentar('copa-quartas', d.etapa === 'quartas');
        tentar('copa-final', d.etapa === 'final');
      }
      tentar('copa-campeao', evento === 'copa-campeao');
      tentar('var-aprovado', evento === 'var-confirmado');
      tentar('duelo', evento === 'duelo-fim');
      tentar('botao-vitoria', evento === 'botao-fim' && !!d.venceu);
      tentar('estiloso', evento === 'borda-trocada');
      tentar('craque-seguro', evento === 'codigo-criado');
      tentar('showman', evento === 'comemoracao-trocada');
      tentar('camisa-propria', evento === 'numero-trocado');
      tentar('com-titulo', evento === 'titulo-trocado');
      // "Mito" conta as que ja estao feitas + as que saem agora.
      var total = Object.keys(dados.feitas).length + novas.length;
      tentar('medalhas-20', total >= 20);
      return novas;
    }

    function registrar(evento, d) {
      d = d || {};
      if (evento === 'conta-certa') { somar('contasCertas'); sequencia++; }
      if (evento === 'conta-errada') sequencia = 0;
      if (evento === 'gol') somar('gols');
      if (evento === 'partida-fim') {
        somar('partidas'); marcarDia();
        if (d.total > 0 && d.gols === d.total) somar('perfeitas');
      }
      if (evento === 'compra') somar('compras');
      if (evento === 'copa-campeao') somar('copas');
      if (evento === 'var-confirmado') somar('vars');
      if (evento === 'duelo-fim') somar('duelos');

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
