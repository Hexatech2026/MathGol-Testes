// Fallback sem Three.js/WebGL (itens 7 e 8) e timer (itens 3 e 20).
const { test, expect } = require('@playwright/test');
const A = require('./ajudantes');

test('7. Three.js ausente: modo simplificado, sem gol automatico', async ({ page }) => {
  const erros = await A.abrirJogo(page, { semThree: true });
  await A.iniciarPartida(page, { pausa: 60000 });
  expect(await page.evaluate(() => typeof THREE)).toBe('undefined');
  expect(await page.evaluate(() => estado.jogoPenalti.modo)).toBe('2d');
  await expect(page.locator('#aviso-modo-jogo')).toBeVisible();
  await expect(page.locator('#aviso-modo-jogo')).toContainText('Modo simplificado');

  await A.espionar(page);
  await A.fixarForca(page, 0); // forca ruim
  await A.responder(page, true);
  await page.waitForTimeout(700);
  // Resposta certa leva para a mira — nunca direto ao gol.
  expect(await page.evaluate(() => estado.etapa)).toBe('mira');
  expect(await page.evaluate(() => estado.gols)).toBe(0);
  await page.keyboard.press('Enter');
  await A.esperarEtapa(page, 'forca');
  await page.keyboard.press('Enter');
  await A.esperarEtapa(page, 'finalizada');
  const c = await page.evaluate(() => estado.resultadosCobrancas[0]);
  expect(c.resultado).toBe('fora');
  expect(await page.evaluate(() => estado.gols)).toBe(0);
  expect(erros).toEqual([]);
});

test('7b. modo simplificado: mira no centro + forca ideal → gol; errada → defesa', async ({ page }) => {
  const erros = await A.abrirJogo(page, { semThree: true });
  await A.iniciarPartida(page, { pausa: 50 });
  await A.espionar(page);
  await A.fixarForca(page, 0.55);
  await A.responder(page, true);
  await A.esperarEtapa(page, 'mira');
  // Mouse tambem funciona no modo 2D.
  const c = await A.centroDoPalco(page);
  await page.mouse.click(c.x, c.y);
  await A.esperarEtapa(page, 'forca');
  await page.mouse.click(c.x, c.y);
  await page.waitForFunction(() => estado.resultadosCobrancas.length === 1);
  expect(await page.evaluate(() => estado.resultadosCobrancas[0].resultado)).toBe('gol');

  await A.esperarEtapa(page, 'resposta');
  await A.responder(page, false);
  await page.waitForFunction(() => estado.resultadosCobrancas.length === 2);
  expect(await page.evaluate(() => estado.resultadosCobrancas[1].resultado)).toBe('defesa');
  expect(erros).toEqual([]);
});

test('8. WebGLRenderer lancando erro ativa o modo simplificado', async ({ page }) => {
  const erros = await A.abrirJogo(page);
  await page.evaluate(() => { THREE.WebGLRenderer = function() { throw new Error('WebGL indisponivel'); }; });
  await A.iniciarPartida(page);
  expect(await page.evaluate(() => estado.jogoPenalti.modo)).toBe('2d');
  await expect(page.locator('#jogo-penalti canvas')).toHaveCount(0);
  await expect(page.locator('#jogo-penalti .cena-2d')).toHaveCount(1);
  await expect(page.locator('#aviso-modo-jogo')).toBeVisible();
  await A.responder(page, true);
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => estado.etapa)).toBe('mira');
  expect(erros).toEqual([]);
});

test('sem 3D e sem 2D: a partida nao comeca e nao ha gol', async ({ page }) => {
  const erros = await A.abrirJogo(page, { semThree: true });
  await page.evaluate(() => {
    window.criarJogoPenalti2D = function() { throw new Error('quebrado'); };
    estado.selecaoId = 'brasil'; estado.dificuldadeId = 'facil'; estado.faseAtual = 'penaltis';
    iniciarPartida();
  });
  await expect(page.locator('#aviso-modo-jogo')).toContainText('Não foi possível abrir o campo');
  await expect(page.locator('#area-respostas')).toBeHidden();
  expect(await page.evaluate(() => ({ etapa: estado.etapa, gols: estado.gols }))).toEqual({ etapa: 'ociosa', gols: 0 });
  expect(erros).toEqual([]);
});

test.describe('timer (relogio controlado)', () => {
  test('3. tempo esgotado finaliza UMA cobranca como defesa', async ({ page }) => {
    await page.clock.install();
    const erros = await A.abrirJogo(page, { semThree: true });
    await A.iniciarPartida(page, { pausa: 60000 });
    await A.espionar(page);
    await page.clock.runFor(16000);
    await page.clock.runFor(3000);
    const r = await page.evaluate(() => ({ lista: estado.resultadosCobrancas, n: window.__contagem.finalizar }));
    expect(r.n).toBe(1);
    expect(r.lista).toHaveLength(1);
    expect(r.lista[0].resultado).toBe('defesa');
    expect(r.lista[0].estourouTempo).toBe(true);
    await expect(page.locator('#mensagem-feedback')).toContainText('Tempo esgotado');
    expect(erros).toEqual([]);
  });

  test('20. alerta do timer toca uma unica vez por segundo (4, 3, 2, 1)', async ({ page }) => {
    await page.clock.install();
    await A.abrirJogo(page, { semThree: true });
    await A.iniciarPartida(page, { pausa: 60000 });
    await A.espionar(page);
    await page.clock.runFor(10500); // 15 → 5 s: nenhum alerta ainda
    expect(await page.evaluate(() => window.__contagem.timerAlerta)).toBe(0);
    await page.clock.runFor(1000);  // exibe 4
    expect(await page.evaluate(() => window.__contagem.timerAlerta)).toBe(1);
    await page.clock.runFor(4500);  // 3, 2, 1 e esgota
    expect(await page.evaluate(() => window.__contagem.timerAlerta)).toBe(4);
  });
});
