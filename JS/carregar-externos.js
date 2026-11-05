// carregar-externos.js — carrega as dependencias de CDN SEM bloquear a pagina.
//
// Antes, o Three.js era um <script> comum (bloqueava o parser) e o Firebase
// era um <script type="module"> (o DOMContentLoaded espera por ele e pelos
// imports). Se um CDN ficasse PENDENTE (nem erro, nem resposta), o menu
// nunca ficava funcional. Agora:
//   - Three.js: <script async> injetado; se nao chegar, cada partida usa o
//     modo simplificado 2D (mesma regra). Quando chegar, as proximas
//     partidas ja usam o 3D.
//
// DEF-39 (SEC-11): o Three.js agora e servido pelo PROPRIO jogo
// (Vendor/three.min.js, a mesma r149 que vinha do jsDelivr). O CDN ficou
// so como segunda tentativa, para o caso de o arquivo local faltar num
// deploy incompleto. Com a rede de terceiros bloqueada, a cena 3D abre.
//   - Firebase: import() dinamico do modulo; ao terminar dispara o evento
//     "mathgol:firebase-pronto". Sem ele o jogo so nao salva na nuvem.
//   - Fontes: <link media="print" onload> no HTML (fallback: fonte do sistema).
//
// Estado consultavel em window.MathGolExternos (ex.: para diagnostico).

(function() {
  'use strict';
  var LIMITE_MS = 10000;

  var externos = window.MathGolExternos = { three: 'carregando', firebase: 'carregando' };
  var base = (document.currentScript && document.currentScript.src) || location.href;

  // Local primeiro; o CDN e so a rede de seguranca de um deploy sem Vendor/.
  var FONTES_THREE = [
    new URL('../Vendor/three.min.js', base).href,
    'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js'
  ];

  // ---------- Three.js ----------
  if (typeof THREE !== 'undefined') {
    externos.three = 'ok';
  } else {
    var limite = setTimeout(function() {
      if (externos.three === 'carregando') externos.three = 'lento';
    }, LIMITE_MS);

    (function tentar(i) {
      if (i >= FONTES_THREE.length) { clearTimeout(limite); externos.three = 'erro'; return; }
      var script = document.createElement('script');
      script.src = FONTES_THREE[i];
      script.async = true;
      if (i > 0) script.crossOrigin = 'anonymous'; // só faz sentido no CDN
      script.onload = function() {
        if (typeof THREE !== 'undefined') { clearTimeout(limite); externos.three = 'ok'; return; }
        tentar(i + 1);
      };
      script.onerror = function() { tentar(i + 1); };
      document.head.appendChild(script);
    })(0);
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
