// Fluxo da cobranca: resposta → mira → forca → chute (itens 1–13 e 17).
const { test, expect } = require('@playwright/test');
const A = require('./ajudantes');

test.describe('regra da cobranca (cena 3D)', () => {
  test('1. resposta correta avanca SOMENTE para a mira', async ({ page }) => {
    const erros = await A.abrirJogo(page);
    await A.iniciarPartida(page);
    await expect(page.locator('#jogo-penalti canvas')).toHaveCount(1);
    await A.espionar(page);
    await A.responder(page, true);
    await A.esperarEtapa(page, 'mira');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => estado.etapa)).toBe('mira');
    await expect(page.locator('#camada-mira')).toBeVisible();
    await expect(page.locator('#bloco-forca')).toBeHidden();
    await expect(page.locator('#area-respostas')).toBeHidden();
    expect(await page.evaluate(() => window.__contagem.finalizar)).toBe(0);
    expect(erros).toEqual([]);
  });

  test('2. resposta errada finaliza UMA cobranca como defesa (mesmo com clique duplo)', async ({ page }) => {
    const erros = await A.abrirJogo(page);
    await A.iniciarPartida(page, { pausa: 60000 });
    await A.espionar(page);
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('.botao-resposta')).find(b => b.getAttribute('data-zona') !== estado.zonaCorreta);
      b.setAttribute('data-teste-alvo', '1');
    });
    await page.dblclick('[data-teste-alvo="1"]');
    await A.esperarEtapa(page, 'finalizada');
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({ lista: estado.resultadosCobrancas, n: window.__contagem.finalizar }));
    expect(r.n).toBe(1);
    expect(r.lista).toHaveLength(1);
    expect(r.lista[0].resultado).toBe('defesa');
    expect(erros).toEqual([]);
  });

  for (const caso of [
    { nome: '4. correta + centro + forca ideal → gol', forca: 0.55, esperado: 'gol', motivo: null },
    { nome: '5a. correta + centro + forca minima → fora', forca: 0, esperado: 'fora', motivo: 'fraco' },
    { nome: '5b. correta + centro + forca maxima → fora', forca: 1, esperado: 'fora', motivo: 'alto' }
  ]) {
    test(caso.nome, async ({ page }) => {
      const erros = await A.abrirJogo(page);
      await A.iniciarPartida(page, { pausa: 60000 });
      await A.espionar(page);
      await A.fixarForca(page, caso.forca);
      await A.responder(page, true);
      await A.esperarEtapa(page, 'mira');
      // Mira no centro: Enter confirma a posicao inicial (centro do gol).
      await page.keyboard.press('Enter');
      await A.esperarEtapa(page, 'forca');
      await page.keyboard.press('Enter');
      await A.esperarEtapa(page, 'finalizada');
      const c = await page.evaluate(() => estado.resultadosCobrancas[0]);
      expect(c.resultado).toBe(caso.esperado);
      expect(c.motivoFora).toBe(caso.motivo);
      expect(c.resultado).not.toBe('defesa'); // 6. correta nunca e defesa
      expect(erros).toEqual([]);
    });
  }

  test('teclado: setas movem a mira e o foco vai para a superficie do jogo', async ({ page }) => {
    await A.abrirJogo(page);
    await A.iniciarPartida(page, { pausa: 60000 });
    await A.responder(page, true);
    await A.esperarEtapa(page, 'mira');
    await expect(page.locator('#superficie-jogo')).toBeFocused();
    const antes = await page.locator('#alvo-mira').evaluate(el => parseFloat(el.style.left));
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const depois = await page.locator('#alvo-mira').evaluate(el => parseFloat(el.style.left));
    expect(depois).toBeGreaterThan(antes);
    await expect(page.locator('#instrucoes-jogo')).toContainText('setas do teclado');
  });
});

test.describe('saida no meio da partida (sessao invalidada)', () => {
  test('9. correta e Voltar antes de 500 ms: sem erro e o jogo nao reabre', async ({ page }) => {
    const erros = await A.abrirJogo(page);
    await A.iniciarPartida(page);
    await A.responder(page, true);
    await page.click('#botao-voltar');
    await page.waitForTimeout(1200);
    await expect(page.locator('#tela-fases')).toHaveClass(/tela-ativa/);
    await expect(page.locator('#tela-fase1')).not.toHaveClass(/tela-ativa/);
    await expect(page.locator('#camada-mira')).toBeHidden();
    expect(await page.evaluate(() => estado.etapa)).toBe('ociosa');
    expect(await page.evaluate(() => window.__rejeicoes)).toEqual([]);
    expect(erros).toEqual([]);
  });

  test('10. sair durante a animacao do chute nao executa callbacks posteriores', async ({ page }) => {
    const erros = await A.abrirJogo(page);
    await A.iniciarPartida(page);
    await A.espionar(page);
    await A.fixarForca(page, 0.55);
    await A.responder(page, true);
    await A.esperarEtapa(page, 'mira');
    await page.keyboard.press('Enter');
    await A.esperarEtapa(page, 'forca');
    await page.keyboard.press('Enter');
    await A.esperarEtapa(page, 'chute');
    await page.click('#botao-logo');
    await page.waitForTimeout(5000);
    const r = await page.evaluate(() => ({ n: window.__contagem.finalizar, prox: window.__contagem.proxima, lista: estado.resultadosCobrancas.length, etapa: estado.etapa }));
    expect(r).toEqual({ n: 0, prox: 0, lista: 0, etapa: 'ociosa' });
    await expect(page.locator('#tela-menu')).toHaveClass(/tela-ativa/);
    expect(erros).toEqual([]);
  });

  test('11. sair durante a pausa de 2200 ms nao carrega outra pergunta', async ({ page }) => {
    const erros = await A.abrirJogo(page);
    await A.iniciarPartida(page);
    await A.espionar(page);
    await A.responder(page, false);
    await A.esperarEtapa(page, 'finalizada');
    await page.click('#botao-voltar');
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => ({ prox: window.__contagem.proxima, timer: estado.timerInterval, etapa: estado.etapa }));
    expect(r).toEqual({ prox: 0, timer: null, etapa: 'ociosa' });
    await expect(page.locator('#tela-fases')).toHaveClass(/tela-ativa/);
    expect(erros).toEqual([]);
  });

  test('reiniciar a partida invalida os callbacks da partida anterior', async ({ page }) => {
    const erros = await A.abrirJogo(page);
    await A.iniciarPartida(page);
    await A.espionar(page);
    await A.responder(page, false);
    // Reinicia no meio da animacao da defesa.
    await page.evaluate(() => iniciarPartida());
    await page.waitForTimeout(5000);
    const r = await page.evaluate(() => ({ lista: estado.resultadosCobrancas.length, n: window.__contagem.finalizar, etapa: estado.etapa }));
    expect(r).toEqual({ lista: 0, n: 0, etapa: 'resposta' });
    expect(erros).toEqual([]);
  });
});

test.describe('toque e clique (Pointer Events)', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('12. cada toque muda exatamente UMA etapa', async ({ page }) => {
    const erros = await A.abrirJogo(page);
    await A.iniciarPartida(page, { pausa: 60000 });
    await A.espionar(page);
    await A.fixarForca(page, 0.55);
    await A.responder(page, true);
    await A.esperarEtapa(page, 'mira');
    const c = await A.centroDoPalco(page);
    await page.touchscreen.tap(c.x, c.y);
    await page.waitForTimeout(600); // da tempo de um clique sintetico aparecer
    expect(await page.evaluate(() => estado.etapa)).toBe('forca');
    await page.touchscreen.tap(c.x, c.y);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => estado.etapa)).toBe('chute');
    await A.esperarEtapa(page, 'finalizada');
    expect(await page.evaluate(() => window.__contagem.finalizar)).toBe(1);
    expect(erros).toEqual([]);
  });
});

test('13. clique duplo na etapa de forca nao finaliza duas vezes', async ({ page }) => {
  const erros = await A.abrirJogo(page);
  await A.iniciarPartida(page, { pausa: 60000 });
  await A.espionar(page);
  await A.fixarForca(page, 0.55);
  await A.responder(page, true);
  await A.esperarEtapa(page, 'mira');
  const c = await A.centroDoPalco(page);
  await page.mouse.click(c.x, c.y);
  await A.esperarEtapa(page, 'forca');
  await page.mouse.dblclick(c.x, c.y);
  await A.esperarEtapa(page, 'finalizada');
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({ n: window.__contagem.finalizar, chutes: window.__contagem.chute, lista: estado.resultadosCobrancas.length }));
  expect(r).toEqual({ n: 1, chutes: 1, lista: 1 });
  expect(erros).toEqual([]);
});

test.describe('prefers-reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('17. mantem a ordem logica: contato → resultado, uma vez', async ({ page }) => {
    const erros = await A.abrirJogo(page);
    await A.iniciarPartida(page, { pausa: 60000 });
    await A.espionar(page);
    await A.fixarForca(page, 0.55);
    await A.responder(page, true);
    await A.esperarEtapa(page, 'mira');
    await page.keyboard.press('Enter');
    await A.esperarEtapa(page, 'forca');
    await page.keyboard.press('Enter');
    await A.esperarEtapa(page, 'finalizada');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__eventos)).toEqual(['contato', 'finalizar']);
    expect(await page.evaluate(() => estado.resultadosCobrancas[0].resultado)).toBe('gol');
    expect(erros).toEqual([]);
  });
});
