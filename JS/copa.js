// copa.js — v2.2: o jogo vira a Copa do Mundo 2026.
//
// No lugar de "Pênaltis → Falta → Final", a criança disputa a Copa com a
// seleção (ou o time) que escolheu:
//
//   Fase de grupos   3 jogos · 3 cobranças · 15 s   (contas no nível escolhido)
//   16 avos, oitavas,
//   quartas e semi   5 cobranças · 12 s              (contas 1 degrau acima)
//   Final            7 cobranças · 10 s              (contas 2 degraus acima)
//
// Cada jogo é uma disputa de pênaltis: a cada cobrança da criança, o
// adversário também bate (simulado). Nos grupos vale empate; no mata-mata,
// empate vai para a MORTE SÚBITA (uma cobrança de cada lado até alguém
// errar). Os degraus de dificuldade andam SEMPRE no mesmo tipo de conta
// (niveis.js → nivelAcimaMesmoTipo).
//
// Os 12 grupos são os do sorteio real da Copa 2026 (48 seleções; EUA, México
// e Canadá são sedes). Passam os 2 primeiros de cada grupo e os 8 melhores
// terceiros (32 times). Os outros jogos da Copa são simulados com uma
// semente fixa, então a tabela não muda quando a página recarrega.
// O mata-mata é um chaveamento simplificado: os adversários saem dos
// classificados, ficando mais fortes a cada fase.
//
// Por baixo, cada jogo usa as fases que já existiam (faseId 'penaltis',
// 'falta', 'final'): assim o histórico, a nuvem e o backup não mudam de
// formato. Estado salvo: localStorage "mathgol_copa" (validado por
// ValidacaoBackup.validarCopa) e no estado da nuvem (código do craque).

(function(raiz) {
  'use strict';

  var CHAVE = 'mathgol_copa';
  var VERSAO = 1;

  // [código da bandeira (flagcdn), nome, força 1..5]
  var GRUPOS = {
    A: [['mx', 'México', 4], ['za', 'África do Sul', 2], ['kr', 'Coreia do Sul', 3], ['cz', 'Tchéquia', 3]],
    B: [['ca', 'Canadá', 3], ['ba', 'Bósnia', 2], ['qa', 'Catar', 2], ['ch', 'Suíça', 4]],
    C: [['br', 'Brasil', 5], ['ma', 'Marrocos', 4], ['gb-sct', 'Escócia', 3], ['ht', 'Haiti', 1]],
    D: [['us', 'Estados Unidos', 4], ['py', 'Paraguai', 3], ['tr', 'Turquia', 3], ['au', 'Austrália', 3]],
    E: [['de', 'Alemanha', 5], ['ec', 'Equador', 3], ['ci', 'Costa do Marfim', 3], ['cw', 'Curaçao', 1]],
    F: [['nl', 'Holanda', 5], ['jp', 'Japão', 4], ['tn', 'Tunísia', 2], ['se', 'Suécia', 3]],
    G: [['be', 'Bélgica', 5], ['eg', 'Egito', 3], ['ir', 'Irã', 3], ['nz', 'Nova Zelândia', 2]],
    H: [['es', 'Espanha', 5], ['uy', 'Uruguai', 4], ['sa', 'Arábia Saudita', 2], ['cv', 'Cabo Verde', 1]],
    I: [['fr', 'França', 5], ['no', 'Noruega', 3], ['sn', 'Senegal', 4], ['iq', 'Iraque', 2]],
    J: [['ar', 'Argentina', 5], ['dz', 'Argélia', 3], ['at', 'Áustria', 3], ['jo', 'Jordânia', 2]],
    K: [['pt', 'Portugal', 5], ['co', 'Colômbia', 4], ['cd', 'RD Congo', 2], ['uz', 'Uzbequistão', 2]],
    L: [['gb-eng', 'Inglaterra', 5], ['hr', 'Croácia', 4], ['pa', 'Panamá', 2], ['gh', 'Gana', 2]]
  };
  var LETRAS = Object.keys(GRUPOS);

  var ETAPAS = [
    { id: 'grupo1',    nome: '1ª rodada do grupo', curto: 'Grupo · 1ª rodada', faseId: 'penaltis', mataMata: false, nivel: 0 },
    { id: 'grupo2',    nome: '2ª rodada do grupo', curto: 'Grupo · 2ª rodada', faseId: 'penaltis', mataMata: false, nivel: 0 },
    { id: 'grupo3',    nome: '3ª rodada do grupo', curto: 'Grupo · 3ª rodada', faseId: 'penaltis', mataMata: false, nivel: 0 },
    { id: 'dezesseis', nome: '16 avos de final',   curto: '16 avos',          faseId: 'falta',    mataMata: true,  nivel: 1 },
    { id: 'oitavas',   nome: 'Oitavas de final',   curto: 'Oitavas',          faseId: 'falta',    mataMata: true,  nivel: 1 },
    { id: 'quartas',   nome: 'Quartas de final',   curto: 'Quartas',          faseId: 'falta',    mataMata: true,  nivel: 1 },
    { id: 'semi',      nome: 'Semifinal',          curto: 'Semifinal',        faseId: 'falta',    mataMata: true,  nivel: 1 },
    { id: 'final',     nome: 'A GRANDE FINAL',     curto: 'Final',            faseId: 'final',    mataMata: true,  nivel: 2 }
  ];
  var IDS_ETAPA = ETAPAS.map(function(e) { return e.id; });

  // Cruzeiros extras da Copa (além dos da partida e das conquistas).
  var BONUS = { vitoriaGrupo: 20, empateGrupo: 5, classificou: 50, vitoriaMataMata: 40, campeao: 150 };
  var LIMITE_MORTE_SUBITA = 8;

  // ---------- Sorteio com semente (a tabela não muda ao recarregar) ----------
  function rng(semente) {
    var a = semente >>> 0;
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function poisson(lambda, r) {
    var L = Math.exp(-lambda), k = 0, p = 1;
    do { k++; p *= r(); } while (p > L && k < 10);
    return k - 1;
  }
  function hash(texto) {
    var h = 2166136261;
    for (var i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function etapaPorId(id) {
    for (var i = 0; i < ETAPAS.length; i++) if (ETAPAS[i].id === id) return ETAPAS[i];
    return null;
  }

  // ---------- Times ----------
  // Cada time: { id, nome, bandeira, forca, grupo, voce }
  function timesDaCopa(c, timeDoJogador) {
    var times = [];
    LETRAS.forEach(function(g) {
      GRUPOS[g].forEach(function(t, i) {
        times.push({ id: t[0], nome: t[1], bandeira: t[0], forca: t[2], grupo: g, pote: i, voce: false });
      });
    });
    // A seleção da criança já está na Copa? Ela assume o lugar dela.
    var meu = times.filter(function(t) { return t.bandeira === timeDoJogador.bandeira; })[0];
    if (!meu) {
      // Time de fora (Itália, clube do Brasileirão): entra como convidado no
      // lugar do time do pote 4 do grupo sorteado.
      meu = times.filter(function(t) { return t.grupo === c.grupo && t.pote === 3; })[0];
    }
    meu.voce = true;
    meu.nome = timeDoJogador.nome;
    meu.bandeira = timeDoJogador.bandeira || null;
    meu.id = 'voce';
    return times;
  }

  function grupoDaSelecao(bandeira, semente) {
    for (var i = 0; i < LETRAS.length; i++) {
      if (GRUPOS[LETRAS[i]].some(function(t) { return t[0] === bandeira; })) return LETRAS[i];
    }
    return LETRAS[semente % LETRAS.length];
  }

  // ---------- Fase de grupos ----------
  function linhaVazia(t) { return { time: t, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, pts: 0 }; }
  function aplicarPlacar(la, lb, ga, gb) {
    la.j++; lb.j++; la.gp += ga; la.gc += gb; lb.gp += gb; lb.gc += ga;
    if (ga > gb) { la.v++; lb.d++; la.pts += 3; }
    else if (ga < gb) { lb.v++; la.d++; lb.pts += 3; }
    else { la.e++; lb.e++; la.pts++; lb.pts++; }
  }
  function ordenar(linhas) {
    return linhas.sort(function(a, b) {
      return b.pts - a.pts || (b.gp - b.gc) - (a.gp - a.gc) || b.gp - a.gp ||
        b.time.forca - a.time.forca || (a.time.voce ? -1 : b.time.voce ? 1 : 0) || a.time.nome.localeCompare(b.time.nome);
    });
  }

  // Tabelas dos 12 grupos. Jogos da criança: os que ela já jogou contam
  // com o placar real; os dela que ainda não aconteceram ficam de fora.
  // Os outros jogos do grupo "acontecem" na mesma rodada que os dela.
  var RODADAS = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  function tabelas(c, times) {
    var r = rng(c.semente);
    var rodadasJogadas = Math.min(3, c.jogos.length);
    var res = {};
    LETRAS.forEach(function(g) {
      var doGrupo = times.filter(function(t) { return t.grupo === g; });
      var linhas = doGrupo.map(linhaVazia);
      RODADAS.forEach(function(rodada, ir) {
        rodada.forEach(function(par) {
          var a = doGrupo[par[0]], b = doGrupo[par[1]];
          // Sorteia sempre (mesma sequência da semente), mesmo sem usar.
          var ga = poisson(Math.max(0.3, 1.25 + 0.3 * (a.forca - b.forca)), r);
          var gb = poisson(Math.max(0.3, 1.25 + 0.3 * (b.forca - a.forca)), r);
          // A Copa inteira anda junto com a criança: rodada que ela ainda
          // não jogou também não aconteceu nos outros grupos.
          if (ir >= rodadasJogadas) return;
          if (a.voce || b.voce) {
            var jogo = c.jogos[ir];
            if (!jogo) return;
            var meuGol = jogo.gp, delesGol = jogo.gc;
            if (a.voce) { ga = meuGol; gb = delesGol; } else { ga = delesGol; gb = meuGol; }
          }
          aplicarPlacar(linhas[doGrupo.indexOf(a)], linhas[doGrupo.indexOf(b)], ga, gb);
        });
      });
      res[g] = ordenar(linhas);
    });
    return res;
  }

  // Adversário da criança em cada rodada do grupo (mesma tabela de RODADAS).
  function adversarioNoGrupo(times, grupo, rodada) {
    var doGrupo = times.filter(function(t) { return t.grupo === grupo; });
    var iVoce = doGrupo.findIndex(function(t) { return t.voce; });
    var par = RODADAS[rodada].filter(function(p) { return p.indexOf(iVoce) !== -1; })[0];
    return doGrupo[par[0] === iVoce ? par[1] : par[0]];
  }

  // Classificados (32): 1º e 2º de cada grupo + 8 melhores 3ºs.
  function classificados(tabs) {
    var lista = [], terceiros = [];
    LETRAS.forEach(function(g) {
      lista.push(tabs[g][0].time, tabs[g][1].time);
      terceiros.push(tabs[g][2]);
    });
    ordenar(terceiros).slice(0, 8).forEach(function(l) { lista.push(l.time); });
    return lista;
  }

  // ---------- Estado da Copa ----------
  function novo(timeDoJogador, semente) {
    var s = (typeof semente === 'number' ? semente : Math.floor(Math.random() * 2147483647)) >>> 0;
    return {
      selecaoId: String(timeDoJogador.id || 'brasil').slice(0, 32),
      grupo: grupoDaSelecao(timeDoJogador.bandeira, s),
      semente: s,
      jogos: [],
      status: 'andando'
    };
  }

  function criar(armazenamento, opcoes) {
    opcoes = opcoes || {};
    var validar = opcoes.validar || function() { return true; };
    var resolverTime = opcoes.resolverTime || function(id) { return { id: id, nome: id, bandeira: null }; };
    var c = null;

    function carregar() {
      c = null;
      var bruto = null;
      try { bruto = JSON.parse(armazenamento.ler(CHAVE)); } catch (e) { bruto = null; }
      if (bruto && validar(bruto)) c = JSON.parse(JSON.stringify(bruto.dados));
    }
    function salvar() {
      try {
        if (c) armazenamento.gravar(CHAVE, JSON.stringify({ versao: VERSAO, dados: c }));
        else armazenamento.remover(CHAVE);
      } catch (e) {}
    }

    function times() { return timesDaCopa(c, resolverTime(c.selecaoId)); }

    function iniciar(selecaoId, semente) {
      c = novo(resolverTime(selecaoId), semente);
      salvar();
      return c;
    }

    function etapaAtual() {
      if (!c || c.status !== 'andando') return null;
      return ETAPAS[c.jogos.length] || null;
    }

    // Adversário do próximo jogo. No mata-mata sai dos classificados,
    // sorteado com a semente: quanto mais longe, mais forte.
    function adversario(etapa) {
      var ts = times();
      var idx = IDS_ETAPA.indexOf(etapa.id);
      if (!etapa.mataMata) return adversarioNoGrupo(ts, c.grupo, idx);
      var vivos = classificados(tabelas(c, ts)).filter(function(t) {
        return !t.voce && !c.jogos.some(function(j) { return j.adv === t.id; });
      });
      var r = rng(c.semente ^ hash(etapa.id));
      var minimo = Math.min(5, 2 + (idx - 3));          // 16 avos >= 2 ... final >= 5
      var fortes = vivos.filter(function(t) { return t.forca >= minimo; });
      var pool = fortes.length ? fortes : vivos;
      return pool[Math.floor(r() * pool.length)];
    }

    // Tudo que a tela e a partida precisam do próximo jogo.
    function proximoJogo() {
      var etapa = etapaAtual();
      if (!etapa) return null;
      var adv = adversario(etapa);
      var eu = times().filter(function(t) { return t.voce; })[0];
      return {
        etapa: etapa, faseId: etapa.faseId, mataMata: etapa.mataMata,
        voce: eu, adversario: adv,
        golsAdv: 0, chutesAdv: [], morteSubita: false
      };
    }

    // Uma cobrança do adversário (chance cresce com a força e a fase).
    function chuteAdversario(jogo, aleatorio) {
      var idx = IDS_ETAPA.indexOf(jogo.etapa.id);
      var p = 0.28 + 0.05 * jogo.adversario.forca + 0.025 * idx;
      var gol = (aleatorio || Math.random)() < p;
      jogo.chutesAdv.push(gol);
      if (gol) jogo.golsAdv++;
      return gol;
    }

    // No mata-mata, empate depois das cobranças normais = mais uma rodada.
    function precisaMorteSubita(jogo, golsVoce) {
      if (!jogo.mataMata || golsVoce !== jogo.golsAdv) return false;
      var extras = jogo.chutesAdv.length - ({ penaltis: 3, falta: 5, final: 7 }[jogo.faseId] || 0);
      return extras < LIMITE_MORTE_SUBITA;
    }

    // Fecha o jogo e anda a Copa. Devolve o que aconteceu, para a tela.
    function registrarJogo(jogo, golsVoce) {
      var etapa = jogo.etapa;
      var gp = Math.max(0, Math.min(20, golsVoce | 0)), gc = Math.max(0, Math.min(20, jogo.golsAdv | 0));
      // Morte súbita sem fim (limite): a criança leva — nunca trava a Copa.
      if (etapa.mataMata && gp === gc) gp++;
      c.jogos.push({ etapa: etapa.id, adv: jogo.adversario.id, gp: gp, gc: gc, ms: !!jogo.morteSubita });
      var r = { etapa: etapa, adversario: jogo.adversario, gp: gp, gc: gc, morteSubita: !!jogo.morteSubita,
        resultado: gp > gc ? 'vitoria' : (gp === gc ? 'empate' : 'derrota'), bonus: 0,
        classificou: false, eliminado: false, campeao: false, proxima: null, posicao: null };

      if (!etapa.mataMata) {
        r.bonus += r.resultado === 'vitoria' ? BONUS.vitoriaGrupo : (r.resultado === 'empate' ? BONUS.empateGrupo : 0);
        if (c.jogos.length === 3) {
          var tabs = tabelas(c, times());
          r.posicao = tabs[c.grupo].findIndex(function(l) { return l.time.voce; }) + 1;
          r.classificou = classificados(tabs).some(function(t) { return t.voce; });
          if (r.classificou) r.bonus += BONUS.classificou;
          else { c.status = 'eliminado'; r.eliminado = true; }
        }
      } else if (r.resultado === 'vitoria') {
        r.bonus += BONUS.vitoriaMataMata;
        if (etapa.id === 'final') { c.status = 'campeao'; r.campeao = true; r.bonus += BONUS.campeao; }
      } else {
        c.status = 'eliminado'; r.eliminado = true;
      }
      if (c.status === 'andando') r.proxima = ETAPAS[c.jogos.length] || null;
      salvar();
      return r;
    }

    // Para a tela: grupo da criança, todos os grupos e a campanha.
    function resumo() {
      if (!c) return null;
      var ts = times();
      var tabs = tabelas(c, ts);
      var campanha = c.jogos.map(function(j) {
        var adv = ts.filter(function(t) { return t.id === j.adv; })[0] || { nome: j.adv, bandeira: null };
        return { etapa: etapaPorId(j.etapa), adversario: adv, gp: j.gp, gc: j.gc, morteSubita: j.ms };
      });
      return { grupo: c.grupo, tabelas: tabs, campanha: campanha, status: c.status,
        selecaoId: c.selecaoId, proximo: proximoJogo() };
    }

    carregar();

    return {
      CHAVE: CHAVE,
      ativa: function() { return !!c; },
      estado: function() { return c ? JSON.parse(JSON.stringify(c)) : null; },
      iniciar: iniciar,
      proximoJogo: proximoJogo,
      chuteAdversario: chuteAdversario,
      precisaMorteSubita: precisaMorteSubita,
      registrarJogo: registrarJogo,
      resumo: resumo,
      exportar: function() { return c ? JSON.parse(JSON.stringify(c)) : null; },
      recarregar: carregar,
      apagar: function() { c = null; salvar(); }
    };
  }

  var api = { criar: criar, GRUPOS: GRUPOS, ETAPAS: ETAPAS, IDS_ETAPA: IDS_ETAPA, CHAVE: CHAVE, BONUS: BONUS };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  raiz.CopaDados = api;
  raiz.Copa = criar({
    ler: function(k) { return localStorage.getItem(k); },
    gravar: function(k, v) { localStorage.setItem(k, v); },
    remover: function(k) { localStorage.removeItem(k); }
  }, {
    validar: function(obj) {
      return typeof ValidacaoBackup !== 'undefined' && ValidacaoBackup.validarCopa
        ? ValidacaoBackup.validarCopa(obj) : !!(obj && obj.versao === VERSAO && obj.dados);
    },
    // Time escolhido (data.js) → nome e bandeira. Clube não tem bandeira:
    // entra na Copa como convidado.
    resolverTime: function(id) {
      var t = (typeof SELECOES !== 'undefined' ? SELECOES : []).filter(function(s) { return s.id === id; })[0];
      return { id: id, nome: t ? t.nome : 'Seu time', bandeira: t && t.categoria === 'selecao' ? t.bandeira : null };
    }
  });
})(typeof window !== 'undefined' ? window : this);
