// carteira.js — carteira de Cruzeiros (a moeda do MathGol) e itens comprados.
//
// Como a criança ganha Cruzeiros: no fim de cada partida, a pontuação da
// partida (10 a 100 por gol, conforme a rapidez da resposta) vai para a
// carteira. Os Cruzeiros são gastos na Loja (times, avatares e nomes).
//
// Armazenamento: localStorage, chave "mathgol_carteira", formato versionado
//   { versao: 1, dados: { saldo, totalGanho, itens: ["clube:flamengo", ...] } }
// A mesma chave entra no backup local (ValidacaoBackup.validarCarteira).
// Se o valor salvo estiver corrompido, a carteira recomeça zerada em vez
// de quebrar o jogo (e o valor ruim não é sobrescrito até a próxima ação).
//
// Itens grátis (preço 0) NÃO entram na lista: já são de todo mundo.

var Carteira = (function() {
  'use strict';

  var CHAVE = 'mathgol_carteira';
  var VERSAO = 1;
  var SALDO_MAXIMO = 999999;

  var dados = { saldo: 0, totalGanho: 0, itens: [] };
  var ouvintes = [];

  function validar(obj) {
    if (typeof ValidacaoBackup !== 'undefined' && ValidacaoBackup.validarCarteira) {
      return ValidacaoBackup.validarCarteira(obj);
    }
    return !!(obj && obj.versao === VERSAO && obj.dados && typeof obj.dados.saldo === 'number');
  }

  function carregar() {
    var bruto = null;
    try { bruto = JSON.parse(localStorage.getItem(CHAVE)); } catch (e) { bruto = null; }
    if (bruto && validar(bruto)) {
      dados = {
        saldo: bruto.dados.saldo,
        totalGanho: bruto.dados.totalGanho,
        itens: bruto.dados.itens.slice()
      };
    }
  }

  function salvar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ versao: VERSAO, dados: dados }));
    } catch (e) {}
  }

  function avisar() {
    ouvintes.forEach(function(fn) {
      try { fn(dados.saldo); } catch (e) { console.warn('Erro num ouvinte da carteira:', e); }
    });
  }

  function saldo() { return dados.saldo; }
  function totalGanho() { return dados.totalGanho; }
  function itens() { return dados.itens.slice(); }
  function possui(idItem) { return dados.itens.indexOf(idItem) !== -1; }

  // Soma Cruzeiros ganhos (inteiro >= 0). Devolve o novo saldo.
  function adicionar(quantia) {
    var q = Math.floor(Number(quantia) || 0);
    if (q <= 0) return dados.saldo;
    var real = Math.min(q, SALDO_MAXIMO - dados.saldo);
    dados.saldo += real;
    dados.totalGanho += real;
    salvar();
    avisar();
    return dados.saldo;
  }

  // Compra um item. Devolve { ok: true } ou { ok: false, motivo }.
  //   motivo: 'ja-possui' | 'saldo' | 'invalido'
  function comprar(idItem, preco) {
    if (typeof idItem !== 'string' || !/^(selecao|clube|avatar|nome):.{1,32}$/.test(idItem)) {
      return { ok: false, motivo: 'invalido' };
    }
    var p = Math.floor(Number(preco));
    if (!(p > 0)) return { ok: false, motivo: 'invalido' };
    if (possui(idItem)) return { ok: false, motivo: 'ja-possui' };
    if (dados.saldo < p) return { ok: false, motivo: 'saldo', faltam: p - dados.saldo };
    dados.saldo -= p;
    dados.itens.push(idItem);
    salvar();
    avisar();
    return { ok: true };
  }

  function aoMudar(fn) { if (typeof fn === 'function') ouvintes.push(fn); }

  // "1 Cruzeiro" / "25 Cruzeiros"
  function formatar(n) {
    return n + (n === 1 ? ' Cruzeiro' : ' Cruzeiros');
  }

  carregar();

  return {
    CHAVE: CHAVE,
    saldo: saldo,
    totalGanho: totalGanho,
    itens: itens,
    possui: possui,
    adicionar: adicionar,
    comprar: comprar,
    aoMudar: aoMudar,
    formatar: formatar,
    recarregar: function() { carregar(); avisar(); }
  };
})();
