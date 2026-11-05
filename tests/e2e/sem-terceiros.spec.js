// DEF-39 / SEC-11: nada de terceiro no navegador da criança.
//
// Critério de saída do relatório de QA da Sprint 5: "o jogo abre em 3D,
// com bandeiras e fontes, com os três domínios bloqueados no navegador".
// Aqui TODO domínio externo é bloqueado (nem o Three.js é servido de
// mentira, como nos outros testes) e a partida tem que abrir em 3D.
const { test, expect } = require('@playwright/test');

const DOMINIOS_PROIBIDOS = ['cdn.jsdelivr.net', 'flagcdn.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'api.dicebear.com'];

async function bloquearTudoLaFora(page) {
  const pedidos = [];
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, route => {
    pedidos.push(route.request().url());
    return route.abort();
  });
  return pedidos;
}

test('DEF-39: 3D, bandeiras e fontes com todos os domínios de fora bloqueados', async ({ page }) => {
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  const pedidosExternos = await bloquearTudoLaFora(page);
  await page.addInitScript(() => localStorage.setItem('mathgol_tutorial_visto', '1'));

  await page.goto('/HTML/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.MathGolExternos && window.MathGolExternos.three !== 'carregando', null, { timeout: 25000 });

  // 1. Three.js veio do próprio jogo.
  expect(await page.evaluate(() => window.MathGolExternos.three)).toBe('ok');
  expect(await page.evaluate(() => typeof THREE !== 'undefined')).toBe(true);

  // 2. A partida abre em 3D (sem cair no modo simplificado).
  await page.evaluate(() => {
    estado.selecaoId = 'brasil'; estado.dificuldadeId = 1; estado.faseAtual = 'penaltis';
    iniciarPartida();
  });
  await page.waitForFunction(() => estado.etapa === 'resposta', null, { timeout: 20000 });
  expect(await page.locator('#aviso-modo-jogo').isVisible()).toBe(false);
  expect(await page.evaluate(() => !!document.querySelector('#jogo-penalti canvas'))).toBe(true);

  // 3. As bandeiras carregam, do próprio domínio.
  await page.evaluate(() => { encerrarJogoEmAndamento(); irParaSelecao(); });
  const bandeiras = page.locator('#grade-selecoes img');
  await expect(bandeiras.first()).toBeVisible();
  // loading="lazy": espera o arquivo chegar antes de medir.
  await bandeiras.first().evaluate(img => img.complete && img.naturalWidth > 0
    ? true
    : new Promise(r => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); }));
  const infoBandeira = await bandeiras.first().evaluate(img => ({
    src: img.getAttribute('src'),
    carregou: img.complete && img.naturalWidth > 0
  }));
  expect(infoBandeira.src).toMatch(/^\.\.\/Imagens\/bandeiras\//);
  expect(infoBandeira.carregou).toBe(true);

  // 4. As fontes do jogo foram aplicadas (não caiu na fonte do sistema).
  const fontes = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map(f => f.family + ':' + f.status);
  });
  expect(fontes.some(f => f.startsWith('Fredoka') && f.endsWith('loaded'))).toBe(true);
  expect(fontes.some(f => f.startsWith('Atkinson Hyperlegible'))).toBe(true);

  // 5. Nenhum pedido saiu para os domínios de terceiro.
  const vazou = pedidosExternos.filter(u => DOMINIOS_PROIBIDOS.some(d => u.includes(d)));
  expect(vazou).toEqual([]);
  expect(erros).toEqual([]);
});

test('DEF-39: o HTML e o CSS não apontam mais para os CDNs de fonte e bandeira', async ({ page }) => {
  await page.goto('/HTML/index.html', { waitUntil: 'domcontentloaded' });
  const html = await page.content();
  ['fonts.googleapis.com', 'fonts.gstatic.com', 'flagcdn.com'].forEach(d => {
    expect(html.includes(d)).toBe(false);
  });
});
