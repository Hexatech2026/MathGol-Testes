// codigo-craque.js — o "codigo do craque": 16 letras/numeros que a crianca
// guarda para continuar de onde parou em OUTRO aparelho.
//
// POR QUE NAO E O ANTIGO "mathgol_token"
// O token antigo era um UUID gravado no navegador e usado como nome do
// documento no Firestore, com regras "if true": qualquer pessoa lia e
// alterava os dados de qualquer jogador. Ele NAO era credencial.
//
// O codigo do craque e uma credencial de verdade, verificada pelo Firebase
// Authentication (provedor E-mail/senha), sem nenhum dado pessoal:
//   - "e-mail" sintetico:  craque.<6 primeiras letras>@<authDomain do projeto>
//     (nao e um e-mail real; nunca recebe mensagem);
//   - senha: o codigo inteiro (16 caracteres, ~79 bits de aleatoriedade),
//     guardado pelo Firebase so como hash.
// A conta anonima que a crianca ja tem e PROMOVIDA (linkWithCredential): o
// uid nao muda, entao tudo o que ela ja fez continua dela.
//
// Alfabeto sem 0/O/1/I/L (mesmo da sala do professor): o codigo e copiado
// do papel para a tela por uma crianca.
//
// Puro (sem DOM/Firebase): roda no navegador (window.CodigoCraque) e no
// Node (testes).

(function(raiz) {
  'use strict';

  var ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var TAMANHO = 16;
  var TAMANHO_ID = 6;

  // aleatorio(n) -> Uint8Array/array de n bytes. Padrao: crypto do navegador.
  function bytesAleatorios(n) {
    var c = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : null;
    if (!c && typeof require === 'function') { try { c = require('crypto').webcrypto; } catch (e) { c = null; } }
    if (!c) throw new Error('Gerador aleatório seguro indisponível.');
    var b = new Uint8Array(n);
    c.getRandomValues(b);
    return b;
  }

  // Sorteio sem vies: descarta bytes >= 248 (8 x 31) e sorteia de novo.
  function gerar(aleatorio) {
    aleatorio = aleatorio || bytesAleatorios;
    var limite = Math.floor(256 / ALFABETO.length) * ALFABETO.length;
    var saida = '';
    while (saida.length < TAMANHO) {
      var bytes = aleatorio(TAMANHO * 2);
      for (var i = 0; i < bytes.length && saida.length < TAMANHO; i++) {
        if (bytes[i] < limite) saida += ALFABETO.charAt(bytes[i] % ALFABETO.length);
      }
    }
    return saida;
  }

  // Aceita minusculas, espacos e tracos. NAO "corrige" O->0 ou I->1: o
  // alfabeto nao tem esses caracteres, entao qualquer um deles torna o
  // codigo invalido e a tela explica quais letras nao existem no codigo
  // (adivinhar a troca poderia apontar para a conta de outra crianca).
  function limpar(texto) {
    var limpo = String(texto || '').toUpperCase().replace(/[\s\-_.·]/g, '');
    if (limpo.length !== TAMANHO) return null;
    for (var i = 0; i < limpo.length; i++) if (ALFABETO.indexOf(limpo.charAt(i)) === -1) return null;
    return limpo;
  }

  function formatar(codigo) {
    var c = limpar(codigo);
    if (!c) return '';
    return c.slice(0, 4) + '-' + c.slice(4, 8) + '-' + c.slice(8, 12) + '-' + c.slice(12, 16);
  }

  function email(codigo, dominio) {
    var c = limpar(codigo);
    if (!c) return null;
    return 'craque.' + c.slice(0, TAMANHO_ID).toLowerCase() + '@' + dominio;
  }

  function senha(codigo) { return limpar(codigo); }

  var CodigoCraque = {
    ALFABETO: ALFABETO,
    TAMANHO: TAMANHO,
    gerar: gerar,
    limpar: limpar,
    formatar: formatar,
    email: email,
    senha: senha
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CodigoCraque;
  else raiz.CodigoCraque = CodigoCraque;
})(typeof window !== 'undefined' ? window : this);
