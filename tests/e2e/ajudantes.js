// Ajudantes compartilhados dos testes E2E.
const path = require('path');
const fs = require('fs');

const THREE_LOCAL = fs.readFileSync(path.join(__dirname, '..', '..', 'node_modules', 'three', 'build', 'three.min.js'));

// Bloqueia tudo que e externo. semThree: simula CDN do Three.js fora do ar.
// travar: lista de trechos de URL cujas requisicoes ficam PENDENTES para
// sempre (CDN travada, sem erro nem resposta).
async function prepararRede(page, { semThree = false, travar = [] } = {}) {
  await page.route(/^https?:\/\/(?!localhost)/, route => {
    const url = route.request().url();
    if (travar.some(t => url.includes(t))) return; // nunca responde
    if (!semThree && url.includes('cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js')) {
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: THREE_LOCAL });
    }
    return route.abort();
  });
}

// Registra erros de pagina e Promises rejeitadas sem tratamento.
async function monitorarErros(page) {
  const erros = [];
  page.on('pageerror', e => erros.push('pageerror: ' + e.message));
  await page.addInitScript(() => {
    window.__rejeicoes = [];
    window.addEventListener('unhandledrejection', ev => {
      window.__rejeicoes.push(String(ev.reason && ev.reason.message || ev.reason));
    });
  });
  return erros;
}

async function abrirJogo(page, opcoes = {}) {
  const erros = await monitorarErros(page);
  await prepararRede(page, opcoes);
  if (opcoes.progressao) {
    await page.addInitScript(p => localStorage.setItem('mathgol_progressao', JSON.stringify(p)), opcoes.progressao);
  }
  // 'domcontentloaded': o evento "load" espera scripts async (CDN travada).
  await page.goto('/HTML/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof iniciarPartida === 'function' && document.querySelector('#tela-menu.tela-ativa'));
  const travaThree = (opcoes.travar || []).some(t => 'cdn.jsdelivr.net'.includes(t) || t.includes('jsdelivr'));
  if (!opcoes.semThree && !travaThree) {
    await page.waitForFunction(() => window.MathGolExternos && window.MathGolExternos.three !== 'carregando');
  }
  return erros;
}

// Comeca uma partida direto (o fluxo de telas tem teste proprio).
async function iniciarPartida(page, { fase = 'penaltis', pausa } = {}) {
  await page.evaluate(({ fase, pausa }) => {
    estado.selecaoId = 'brasil';
    estado.dificuldadeId = 'facil';
    estado.faseAtual = fase;
    if (typeof pausa === 'number') window.PAUSA_ENTRE_COBRANCAS = pausa;
    iniciarPartida();
  }, { fase, pausa });
  await page.waitForFunction(() => estado.etapa === 'resposta');
}

// Instala espioes em funcoes globais (chamadas internas usam o global).
async function espionar(page) {
  await page.evaluate(() => {
    window.__eventos = [];
    window.__contagem = { finalizar: 0, proxima: 0, timerAlerta: 0, chute: 0 };
    const orig = { finalizar: window.finalizarCobranca, proxima: window.carregarProximaPergunta };
    window.finalizarCobranca = function(d) { window.__contagem.finalizar++; window.__eventos.push('finalizar'); return orig.finalizar.apply(this, arguments); };
    window.carregarProximaPergunta = function() { window.__contagem.proxima++; return orig.proxima.apply(this, arguments); };
    const chute = SFX.chute, alerta = SFX.timerAlerta;
    SFX.chute = function() { window.__contagem.chute++; window.__eventos.push('contato'); return chute.apply(this, arguments); };
    SFX.timerAlerta = function() { window.__contagem.timerAlerta++; return alerta.apply(this, arguments); };
  });
}

// Fixa o valor que a barra de forca devolve ao travar.
async function fixarForca(page, valor) {
  await page.evaluate(v => {
    const parar = controleForca.parar;
    controleForca.parar = function() { parar(); return v; };
  }, valor);
}

// Fixa o valor que a barra de altura devolve (0 rasteiro, 0.5 meia, 1 cavadinha).
async function fixarAltura(page, valor) {
  await page.evaluate(v => {
    const parar = controleAltura.parar;
    controleAltura.parar = function() { parar(); return v; };
  }, valor);
}

// Confirma a etapa atual pelo teclado depois da trava anti-duplo-clique.
async function confirmarEtapa(page) {
  await page.waitForTimeout(520);
  await page.keyboard.press('Enter');
}

// Da resposta correta ja respondida ate o chute: mira (centro), altura, forca.
async function mirarEChutar(page) {
  await esperarEtapa(page, 'mira');
  await confirmarEtapa(page);
  await esperarEtapa(page, 'altura');
  await confirmarEtapa(page);
  await esperarEtapa(page, 'forca');
  await confirmarEtapa(page);
}

async function responder(page, certa) {
  await page.evaluate(certa => {
    const botoes = Array.from(document.querySelectorAll('.botao-resposta'));
    const alvo = botoes.find(b => (b.getAttribute('data-zona') === estado.zonaCorreta) === certa);
    alvo.setAttribute('data-teste-alvo', '1');
  }, certa);
  await page.click('[data-teste-alvo="1"]');
}

async function esperarEtapa(page, etapa, timeout = 15000) {
  await page.waitForFunction(e => estado.etapa === e, etapa, { timeout });
}

async function centroDoPalco(page) {
  const box = await page.locator('.palco-penalti').boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

module.exports = {
  prepararRede, monitorarErros, abrirJogo, iniciarPartida, espionar,
  fixarForca, fixarAltura, confirmarEtapa, mirarEChutar, responder, esperarEtapa, centroDoPalco
};
