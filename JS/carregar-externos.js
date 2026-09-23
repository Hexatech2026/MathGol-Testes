// carregar-externos.js — carrega as dependencias de CDN SEM bloquear a pagina.
//
// Antes, o Three.js era um <script> comum (bloqueava o parser) e o Firebase
// era um <script type="module"> (o DOMContentLoaded espera por ele e pelos
// imports). Se um CDN ficasse PENDENTE (nem erro, nem resposta), o menu
// nunca ficava funcional. Agora:
//   - Three.js: <script async> injetado; se nao chegar, cada partida usa o
//     modo simplificado 2D (mesma regra). Quando chegar, as proximas
//     partidas ja usam o 3D.
//   - Firebase: import() dinamico do modulo; ao terminar dispara o evento
//     "mathgol:firebase-pronto". Sem ele o jogo so nao salva na nuvem.
//   - Fontes: <link media="print" onload> no HTML (fallback: fonte do sistema).
//
// Estado consultavel em window.MathGolExternos (ex.: para diagnostico).

(function() {
  'use strict';
  var URL_THREE = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
  var LIMITE_MS = 10000;

  var externos = window.MathGolExternos = { three: 'carregando', firebase: 'carregando' };
  var base = (document.currentScript && document.currentScript.src) || location.href;

  // ---------- Three.js ----------
  if (typeof THREE !== 'undefined') {
    externos.three = 'ok';
  } else {
    var script = document.createElement('script');
    script.src = URL_THREE;
    script.async = true;
    script.crossOrigin = 'anonymous';
    var limite = setTimeout(function() {
      if (externos.three === 'carregando') externos.three = 'lento';
    }, LIMITE_MS);
    script.onload = function() { clearTimeout(limite); externos.three = typeof THREE !== 'undefined' ? 'ok' : 'erro'; };
    script.onerror = function() { clearTimeout(limite); externos.three = 'erro'; };
    document.head.appendChild(script);
  }

  // ---------- Firebase (modulo ES carregado sob demanda) ----------
  try {
    var urlFirebase = new URL('firebase-config.js', base).href;
    import(urlFirebase).then(function() {
      externos.firebase = window.FirebaseMathGol ? 'ok' : 'erro';
      if (window.FirebaseMathGol) document.dispatchEvent(new Event('mathgol:firebase-pronto'));
    }).catch(function(erro) {
      externos.firebase = 'erro';
      console.warn('Firebase indisponível; o jogo segue sem salvar na nuvem:', erro);
    });
  } catch (erro) {
    externos.firebase = 'erro';
  }
})();
