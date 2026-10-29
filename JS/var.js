// var.js — v2.2: o VAR das expressões numéricas.
//
// No futebol de botão, todo gol vai para o VAR: o gol só é confirmado
// quando a criança resolve uma EXPRESSÃO NUMÉRICA do tipo de conta que ela
// escolheu treinar (o mesmo nível da escada de niveis.js). Errou? O VAR
// continua analisando — a alternativa errada some e ela tenta de novo, até
// acertar. Nunca tira o gol de quem erra: só espera ela chegar lá.
//
// Ordem das operações (é isso que a expressão treina):
//   1º parênteses · 2º × e ÷ · 3º + e − (da esquerda para a direita)
//
// gerarExpressao(nivelId) → { texto, falado, resultado, alternativas[4], dica }
// Funciona no navegador (window.VAR) e no Node (testes).

(function(raiz) {
  'use strict';

  function int(min, max, r) { return min + Math.floor((r || Math.random)() * (max - min + 1)); }

  // Monta a expressão por tipo. Cada gerador devolve { partes, resultado }
  // onde partes é a expressão com os símbolos de verdade (× ÷ −).
  var GERADORES = {
    // a + b + c  ou  (a + b) + c
    soma: function(n, r) {
      var max = n.digitos >= 2 ? 30 : 9;
      var a = int(1, max, r), b = int(1, max, r), c = int(1, max, r);
      return r() < 0.5
        ? { texto: a + ' + ' + b + ' + ' + c, resultado: a + b + c }
        : { texto: '(' + a + ' + ' + b + ') + ' + c, resultado: a + b + c };
    },
    // a − (b − c)  ou  a − b − c, sempre >= 0
    subtracao: function(n, r) {
      var max = n.digitos >= 2 ? 40 : 15;
      if (r() < 0.5) {
        var b = int(2, Math.min(max, 12), r), c = int(1, b - 1, r), a = int(b - c, max, r);
        return { texto: a + ' − (' + b + ' − ' + c + ')', resultado: a - (b - c) };
      }
      var x = int(6, max, r), y = int(1, Math.floor(x / 2), r), z = int(0, x - y, r);
      return { texto: x + ' − ' + y + ' − ' + z, resultado: x - y - z };
    },
    // a + b − c  ou  (a − b) + c
    misto: function(n, r) {
      var max = n.digitos >= 2 ? 40 : 10;
      var a = int(1, max, r), b = int(1, max, r), c = int(0, a + b, r);
      if (r() < 0.5) return { texto: a + ' + ' + b + ' − ' + c, resultado: a + b - c };
      var d = int(0, a, r);
      return { texto: '(' + a + ' − ' + d + ') + ' + b, resultado: a - d + b };
    },
    // a × b + c  ·  (a + b) × c  ·  c + a × b  (a pegadinha da ordem)
    multiplicacao: function(n, r) {
      var tab = (n.faixa && n.faixa.tabuadas) || [2, 3, 4, 5];
      var a = tab[int(0, tab.length - 1, r)], b = int(1, 10, r), c = int(1, 9, r);
      var k = r();
      if (k < 0.34) return { texto: a + ' × ' + b + ' + ' + c, resultado: a * b + c };
      if (k < 0.67) {
        var s = int(1, 5, r);
        return { texto: '(' + s + ' + ' + c + ') × ' + a, resultado: (s + c) * a };
      }
      return { texto: c + ' + ' + a + ' × ' + b, resultado: c + a * b };
    },
    // (a × b) ÷ b + c  ·  a ÷ b + c  ·  c + a ÷ b, sempre exata
    divisao: function(n, r) {
      var tab = (n.faixa && n.faixa.tabuadas) || [2, 3, 4, 5];
      var d = tab[int(0, tab.length - 1, r)], q = int(1, 10, r), c = int(1, 9, r);
      var a = d * q;
      return r() < 0.5
        ? { texto: a + ' ÷ ' + d + ' + ' + c, resultado: q + c }
        : { texto: c + ' + ' + a + ' ÷ ' + d, resultado: c + q };
    },
    // as quatro: (a + b) × c − d  ·  a ÷ b + c × d
    todas: function(n, r) {
      if (r() < 0.5) {
        var a = int(1, 6, r), b = int(1, 6, r), c = int(2, 5, r), d = int(0, (a + b) * c, r);
        return { texto: '(' + a + ' + ' + b + ') × ' + c + ' − ' + d, resultado: (a + b) * c - d };
      }
      var den = int(2, 9, r), q = int(1, 9, r), e = int(2, 9, r), f = int(1, 9, r);
      return { texto: den * q + ' ÷ ' + den + ' + ' + e + ' × ' + f, resultado: q + e * f };
    }
  };

  function geradorDoNivel(n) {
    var t = n.tipos || ['soma'];
    if (t.length >= 4) return 'todas';
    if (t.length === 2) return 'misto';
    return t[0] || 'soma';
  }

  var FALADO = { '+': 'mais', '−': 'menos', '×': 'vezes', '÷': 'dividido por', '(': 'abre parênteses,', ')': ', fecha parênteses' };
  function falar(texto) {
    return texto.replace(/[+−×÷()]/g, function(s) { return ' ' + FALADO[s] + ' '; }).replace(/\s+/g, ' ').trim();
  }

  // 4 alternativas: a certa + 3 erros "de verdade" (fazer na ordem errada,
  // errar por 1, errar por 10) — nada negativo, nada repetido.
  function alternativas(resultado, texto, r) {
    var erros = [resultado + 1, resultado - 1, resultado + 2, resultado + 10, resultado - 10];
    var errado = calcularDaEsquerdaParaDireita(texto);
    if (errado !== null && errado !== resultado) erros.unshift(errado);
    var opcoes = [resultado];
    erros.forEach(function(v) { if (opcoes.length < 4 && v >= 0 && opcoes.indexOf(v) === -1) opcoes.push(v); });
    while (opcoes.length < 4) { var x = resultado + opcoes.length * 3; if (opcoes.indexOf(x) === -1) opcoes.push(x); }
    for (var i = opcoes.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = opcoes[i]; opcoes[i] = opcoes[j]; opcoes[j] = t; }
    return opcoes;
  }

  // O erro mais comum: ignorar parênteses e prioridade e ir da esquerda
  // para a direita. Vira uma das alternativas erradas.
  function calcularDaEsquerdaParaDireita(texto) {
    var tokens = texto.replace(/[()]/g, '').split(' ').filter(Boolean);
    var acc = parseInt(tokens[0], 10);
    for (var i = 1; i + 1 < tokens.length; i += 2) {
      var v = parseInt(tokens[i + 1], 10), op = tokens[i];
      if (op === '+') acc += v; else if (op === '−') acc -= v; else if (op === '×') acc *= v;
      else if (op === '÷') { if (v === 0 || acc % v) return null; acc /= v; }
    }
    return isFinite(acc) && acc >= 0 ? acc : null;
  }

  function gerarExpressao(nivelId, aleatorio) {
    var r = aleatorio || Math.random;
    var n = typeof obterNivel === 'function' ? obterNivel(nivelId)
      : (raiz.NIVEIS_PARA_TESTE && raiz.NIVEIS_PARA_TESTE[(nivelId || 1) - 1]) || { tipos: ['soma'], digitos: 1 };
    var tipo = geradorDoNivel(n);
    var e = GERADORES[tipo](n, r);
    return {
      tipo: tipo,
      texto: e.texto,
      falado: 'Quanto é ' + falar(e.texto) + '?',
      resultado: e.resultado,
      alternativas: alternativas(e.resultado, e.texto, r),
      dica: 'Primeiro os parênteses, depois × e ÷, por último + e −.'
    };
  }

  var api = { gerarExpressao: gerarExpressao, calcularDaEsquerdaParaDireita: calcularDaEsquerdaParaDireita, GERADORES: GERADORES };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  raiz.VAR = api;
})(typeof window !== 'undefined' ? window : this);
