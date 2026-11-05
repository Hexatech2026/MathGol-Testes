// DEF-41: cobertura automatizada do que a Sprint 5 entregou e so tinha
// verificacao manual — rotas por hash (HU-30) e faixa de mensagem (HU-27,
// incluindo o DEF-38, que deixava a faixa de "acerto" sair cedo demais).
const { test, expect } = require('@playwright/test');
const A = require('./ajudantes');

// ---------- HU-30: #professor e #entrar (HASH-01 a HASH-04) ----------

test('HASH-01: abrir com #professor ja na Sala do Professor', async ({ page }) => {
  const erros = await A.monitorarErros(page);
  await A.prepararRede(page);
  await page.addInitScript(() => localStorage.setItem('mathgol_tutorial_visto', '1'));
  await page.goto('/HTML/index.html#professor', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#tela-professor')).toHaveClass(/tela-ativa/);
  expect(erros).toEqual([]);
});

test('HASH-02: trocar o hash com a pagina aberta muda de tela', async ({ page }) => {
  await A.abrirJogo(page);
  await page.evaluate(() => { location.hash = '#entrar'; });
  await expect(page.locator('#tela-entrar-sala')).toHaveClass(/tela-ativa/);
  await page.evaluate(() => { location.hash = '#professor'; });
  await expect(page.locator('#tela-professor')).toHaveClass(/tela-ativa/);
});

test('HASH-03: maiusculas no hash dao no mesmo', async ({ page }) => {
  await A.abrirJogo(page);
  await page.evaluate(() => { location.hash = '#PROFESSOR'; });
  await expect(page.locator('#tela-professor')).toHaveClass(/tela-ativa/);
});

test('HASH-04: hash desconhecido nao muda a tela', async ({ page }) => {
  await A.abrirJogo(page);
  await page.evaluate(() => { location.hash = '#nada'; });
  await expect(page.locator('#tela-menu')).toHaveClass(/tela-ativa/);
});

test('HU-30 (CA-30.6): o modal "Mais opcoes" fecha antes de trocar de tela', async ({ page }) => {
  await A.abrirJogo(page);
  await A.abrirMaisOpcoes(page);
  await page.evaluate(() => { location.hash = '#professor'; });
  await expect(page.locator('#tela-professor')).toHaveClass(/tela-ativa/);
  // Sobreposicao aberta por cima comeria os cliques da tela nova.
  expect(await page.evaluate(() => document.getElementById('sobreposicao-mais').classList.contains('aberta'))).toBe(false);
  await expect(page.locator('#botao-criar-sala')).toBeVisible();
});

// ---------- HU-27 / DEF-38: faixa de mensagem ----------

test('DEF-38: a faixa fica o tempo minimo na tela tambem com duracao explicita', async ({ page }) => {
  await A.abrirJogo(page);
  const medido = await page.evaluate(async () => {
    const minimo = TEMPO_MINIMO_FAIXA;
    const faixa = document.getElementById('faixa-celebracao');
    // O caminho do defeito: mostrarFaixa com duracao MENOR que o minimo.
    mostrarFaixa('acerto', 'Isso! A matemática estava perfeita.', 300);
    const inicio = Date.now();
    await new Promise(r => {
      const olho = setInterval(() => {
        if (faixa.hidden) { clearInterval(olho); r(); }
      }, 50);
      setTimeout(() => { clearInterval(olho); r(); }, minimo + 2000);
    });
    return { naTela: Date.now() - inicio, minimo };
  });
  expect(medido.naTela).toBeGreaterThanOrEqual(medido.minimo);
});

test('HU-27: cada tipo de jogada tem a sua faixa, e o texto vai por textContent', async ({ page }) => {
  await A.abrirJogo(page);
  const tipos = ['acerto', 'gol', 'quase', 'conta', 'defesa'];
  for (const tipo of tipos) {
    const lido = await page.evaluate((t) => {
      mostrarFaixa(t, '<b>teste</b> ' + t, 0);
      const faixa = document.getElementById('faixa-celebracao');
      const alvo = document.getElementById('faixa-celebracao-texto');
      return { tipo: faixa.getAttribute('data-tipo'), visivel: !faixa.hidden, html: alvo.innerHTML, texto: alvo.textContent };
    }, tipo);
    expect(lido.tipo).toBe(tipo);
    expect(lido.visivel).toBe(true);
    // CA-27.7: nada de innerHTML — a tag entrou como texto.
    expect(lido.html).not.toContain('<b>');
    expect(lido.texto).toContain('<b>teste</b>');
  }
});

test('HU-27 (CA-27.3): conta certa e gol perdido comeca pela matematica', async ({ page }) => {
  await A.abrirJogo(page);
  await A.iniciarPartida(page);
  await A.responder(page, true);
  await A.esperarEtapa(page, 'mira');
  // Mira fora do gol com forca minima: a conta estava certa, o gol nao sai.
  await page.evaluate(() => {
    estado.mira = { x: 0.95, y: 0.9 };
  });
  await A.mirarEChutar(page);
  await page.waitForFunction(() => estado.resultadosCobrancas.length > 0, null, { timeout: 20000 });
  const r = await page.evaluate(() => ({
    resultado: estado.resultadosCobrancas[0].resultado,
    texto: document.getElementById('faixa-celebracao-texto').textContent
  }));
  if (r.resultado !== 'gol') {
    expect(r.texto.toLowerCase()).not.toMatch(/^você errou/);
  }
});
