// Fullscreen (14), fases (15), layout (16), backup (18) e modais.
const { test, expect } = require('@playwright/test');
const A = require('./ajudantes');

// Progresso coerente (a leitura local saneia fases sem os gols que as liberam).
const TODAS_LIBERADAS = { versao: 1, dados: { fasesDesbloqueadas: ['penaltis', 'falta', 'final'], melhorPontuacao: { penaltis: 150, falta: 240 }, melhorGols: { penaltis: 2, falta: 3 } } };

test('14. fullscreen rejeitado nao gera Promise rejection e restaura o botao', async ({ page }) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = function() { return Promise.reject(new TypeError('Permissions check failed')); };
  });
  const erros = await A.abrirJogo(page);
  const botao = page.locator('#botao-tela-cheia');
  await botao.click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__rejeicoes)).toEqual([]);
  await expect(botao).not.toHaveAttribute('aria-busy', 'true');
  await expect(botao).toHaveAttribute('aria-label', 'Entrar em tela cheia');
  await expect(botao).toHaveAttribute('aria-pressed', 'false');
  await botao.click(); // continua utilizavel
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__rejeicoes)).toEqual([]);
  expect(erros).toEqual([]);
});

test('14b. fullscreen que lanca erro sincrono tambem e tratado', async ({ page }) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = function() { throw new Error('bloqueado'); };
  });
  const erros = await A.abrirJogo(page);
  await page.click('#botao-tela-cheia');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__rejeicoes)).toEqual([]);
  expect(erros).toEqual([]);
});

for (const caso of [
  { fase: 'falta', total: 5, titulo: 'Fim da fase Falta!', rotulo: 'Falta', timer: '12s' },
  { fase: 'final', total: 7, titulo: 'Fim da Final!', rotulo: 'Final', timer: '10s' }
]) {
  test(`15. fase ${caso.fase}: titulo, quantidade de cobrancas e resultado corretos`, async ({ page }) => {
    const erros = await A.abrirJogo(page, { progressao: TODAS_LIBERADAS, semThree: true });
    await A.iniciarPartida(page, { fase: caso.fase, pausa: 30 });
    await expect(page.locator('#titulo-fase')).toContainText(caso.rotulo);
    await expect(page.locator('#cabecalho-fase .bolinha-cobranca')).toHaveCount(caso.total);
    await expect(page.locator('#timer-display')).toHaveText(caso.timer);
    for (let i = 0; i < caso.total; i++) {
      await A.esperarEtapa(page, 'resposta');
      await A.responder(page, false);
      await page.waitForFunction(n => estado.resultadosCobrancas.length === n || document.querySelector('#tela-resultado.tela-ativa'), i + 1);
    }
    await expect(page.locator('#tela-resultado')).toHaveClass(/tela-ativa/);
    await expect(page.locator('#titulo-resultado')).toHaveText(caso.titulo);
    await expect(page.locator('#placar-final')).toHaveText('0 / ' + caso.total);
    await expect(page.locator('#lista-cobrancas li')).toHaveCount(caso.total);
    const salvo = await page.evaluate(() => JSON.parse(localStorage.getItem('mathgol_ultimo_resultado')));
    expect(salvo.dados.faseId).toBe(caso.fase);
    expect(salvo.dados.totalCobrancas).toBe(caso.total);
    expect(salvo.dados.resumoCobrancas).toHaveLength(caso.total);
    expect(salvo.dados.pontuacao).toBe(0);
    expect(erros).toEqual([]);
  });
}

test('fases bloqueadas usam disabled + aria-disabled', async ({ page }) => {
  await A.abrirJogo(page);
  await page.evaluate(() => { estado.selecaoId = 'brasil'; estado.dificuldadeId = 'facil'; irParaFases(); });
  const bloqueados = page.locator('#grade-fases .cartao-bloqueado');
  await expect(bloqueados).toHaveCount(2);
  for (const el of await bloqueados.all()) {
    await expect(el).toBeDisabled();
    await expect(el).toHaveAttribute('aria-disabled', 'true');
  }
  const livre = page.locator('#grade-fases .cartao:not(.cartao-bloqueado)').first();
  await livre.click();
  await expect(livre).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#botao-confirmar-fase')).toBeEnabled();
});

test('fluxo completo pela interface, com foco no titulo de cada tela', async ({ page }) => {
  const erros = await A.abrirJogo(page);
  await page.locator('#botao-jogar').click({ force: true }); // botao CTA pulsa (animacao)
  await expect(page.locator('#tela-apelido h2')).toBeFocused();
  await page.locator('#lista-personagens .chip-escolha').first().click();
  await page.locator('#lista-animais .chip-escolha').first().click();
  await expect(page.locator('#lista-animais .chip-escolha').first()).toHaveAttribute('aria-pressed', 'true');
  await page.click('#botao-confirmar-apelido');
  await page.locator('#grade-selecoes .cartao').first().click();
  await page.click('#botao-confirmar-selecao');
  await page.locator('#grade-dificuldades .cartao').first().click();
  await page.click('#botao-confirmar-dificuldade');
  await page.locator('#grade-fases .cartao').first().click();
  await page.click('#botao-confirmar-fase');
  await expect(page.locator('#titulo-fase')).toBeFocused();
  await A.esperarEtapa(page, 'resposta');
  expect(erros).toEqual([]);
});

test.describe('16. layout sem rolagem horizontal', () => {
  const LARGURAS = [
    { width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 },
    { width: 768, height: 1024 }, { width: 1366, height: 768 }
  ];
  for (const vp of LARGURAS) {
    test(`${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      const erros = await A.abrirJogo(page, { semThree: vp.width < 768 });
      const semRolagem = async onde => {
        const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        expect(m.sw, `rolagem horizontal em ${onde}`).toBeLessThanOrEqual(m.cw);
      };
      await semRolagem('menu');
      await page.locator('#botao-jogar').click({ force: true }); // botao CTA pulsa (animacao)
      await semRolagem('apelido');
      await page.evaluate(() => { estado.selecaoId = 'brasil'; irParaSelecao(); });
      await semRolagem('selecao');
      await page.evaluate(() => irParaFases());
      await semRolagem('fases');
      await A.iniciarPartida(page, { pausa: 60000 });
      await semRolagem('partida (respostas)');

      // Barra superior: nada se sobrepoe.
      const caixas = await page.evaluate(() => ['#titulo-fase', '#cabecalho-fase', '#timer-display', '#pontuacao-display']
        .map(s => { const r = document.querySelector(s).getBoundingClientRect(); return { s, l: r.left, r: r.right, t: r.top, b: r.bottom }; }));
      for (let i = 0; i < caixas.length; i++) {
        for (let j = i + 1; j < caixas.length; j++) {
          const a = caixas[i], b = caixas[j];
          const sobrepoe = a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
          expect(sobrepoe, `${a.s} sobrepoe ${b.s}`).toBe(false);
        }
        expect(caixas[i].r).toBeLessThanOrEqual(vp.width);
        expect(caixas[i].l).toBeGreaterThanOrEqual(0);
      }

      await A.responder(page, true);
      await A.esperarEtapa(page, 'mira');
      await A.confirmarEtapa(page);
      await A.esperarEtapa(page, 'altura');
      await semRolagem('partida (altura)');
      await A.confirmarEtapa(page);
      await A.esperarEtapa(page, 'forca');
      await semRolagem('partida (forca)');
      await page.evaluate(() => { estado.resultadosCobrancas = [{ resultado: 'gol', estourouTempo: false, tempoUsado: 2, pontos: 90 }]; });
      await page.evaluate(() => irParaResultado());
      await semRolagem('resultado');
      expect(erros).toEqual([]);
    });
  }
});

// QA-5 (DEF-08): mede o campo em janela e em tela cheia, em retrato e
// paisagem, nas etapas de resposta, altura e forca. Controles sempre dentro
// da altura visivel; tela cheia nunca diminui o campo.
async function medirPartida(page) {
  return page.evaluate(() => {
    const r = s => document.querySelector(s).getBoundingClientRect();
    const visiveis = ['.caixa-pergunta', '#area-respostas', '#bloco-altura', '#bloco-forca', '#mensagem-feedback']
      .filter(s => r(s).height > 0).map(s => ({ s, top: r(s).top, bottom: r(s).bottom }));
    return { pw: r('.palco-penalti').width, ph: r('.palco-penalti').height, visiveis,
      vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
  });
}
function conferirDentroDaTela(m) {
  expect(Math.abs(m.pw / m.ph - 16 / 9)).toBeLessThan(0.02);
  for (const v of m.visiveis) {
    expect(v.top, v.s).toBeGreaterThanOrEqual(0);
    expect(v.bottom, `${v.s} abaixo da dobra`).toBeLessThanOrEqual(m.vh + 1);
  }
  expect(m.sw).toBeLessThanOrEqual(m.cw);
}

for (const vp of [
  { width: 360, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 },
  { width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 768, height: 1024 }
]) {
  test(`QA-5 ${vp.width}x${vp.height}: campo em janela e tela cheia, controles visiveis em todas as etapas`, async ({ page }) => {
    await page.setViewportSize(vp);
    const erros = await A.abrirJogo(page, { semThree: true }); // aviso do modo 2D visivel = pior caso de altura
    await A.iniciarPartida(page, { pausa: 60000 });
    const janela = await medirPartida(page);
    conferirDentroDaTela(janela);
    if (vp.width >= 1366) expect(janela.pw / vp.width, 'campo >= 60% da largura').toBeGreaterThanOrEqual(0.6);
    if (vp.width < 700) expect(janela.pw).toBeGreaterThanOrEqual(vp.width - 40); // retrato: largura toda

    await page.click('#botao-tela-cheia');
    const entrou = await page.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 3000 }).then(() => true, () => false);
    test.skip(!entrou, 'navegador de teste nao entrou em tela cheia');
    await page.waitForTimeout(300);
    const cheia = await medirPartida(page);
    expect(cheia.pw, 'tela cheia nao pode diminuir o campo').toBeGreaterThanOrEqual(janela.pw - 1);
    conferirDentroDaTela(cheia);

    await A.responder(page, true);
    await A.esperarEtapa(page, 'mira');
    await A.confirmarEtapa(page);
    await A.esperarEtapa(page, 'altura');
    conferirDentroDaTela(await medirPartida(page));
    await A.confirmarEtapa(page);
    await A.esperarEtapa(page, 'forca');
    conferirDentroDaTela(await medirPartida(page));
    expect(erros).toEqual([]);
  });
}

test.describe('18. restauracao de backup pela interface', () => {
  async function restaurar(page, nome, conteudo) {
    await page.click('#botao-backup');
    await page.setInputFiles('#input-restaurar', { name: nome, mimeType: 'application/json', buffer: Buffer.from(conteudo) });
  }

  test('arquivo com chave estranha e recusado e nada e gravado', async ({ page }) => {
    await A.abrirJogo(page);
    await restaurar(page, 'b.json', JSON.stringify({ versao: 1, tipo: 'mathgol-backup-local', dados: { mathgol_acessibilidade: '{"altoContraste":true}', evil: 'x' } }));
    await expect(page.locator('#backup-status')).toContainText('❌');
    expect(await page.evaluate(() => [localStorage.getItem('evil'), localStorage.getItem('mathgol_acessibilidade')])).toEqual([null, null]);
  });

  test('arquivo grande demais e recusado', async ({ page }) => {
    await A.abrirJogo(page);
    await restaurar(page, 'grande.json', '{"x":"' + 'a'.repeat(300 * 1024) + '"}');
    await expect(page.locator('#backup-status')).toContainText('grande demais');
  });

  test('arquivo que nao e JSON mostra erro amigavel', async ({ page }) => {
    await A.abrirJogo(page);
    await restaurar(page, 'ruim.json', 'isto nao e json');
    await expect(page.locator('#backup-status')).toContainText('não é um backup válido');
  });

  test('backup local valido e restaurado', async ({ page }) => {
    await A.abrirJogo(page);
    await restaurar(page, 'ok.json', JSON.stringify({ versao: 1, tipo: 'mathgol-backup-local', dados: { mathgol_acessibilidade: '{"altoContraste":true}', mathgol_token: 'antigo' } }));
    await expect(page.locator('#backup-status')).toContainText('restaurado');
    expect(await page.evaluate(() => [localStorage.getItem('mathgol_acessibilidade'), localStorage.getItem('mathgol_token')]))
      .toEqual(['{"altoContraste":true}', null]);
  });
});

test('modais: foco entra, Tab fica preso, Escape fecha e o foco volta', async ({ page }) => {
  await A.abrirJogo(page);
  const botao = page.locator('#botao-acessibilidade');
  await botao.click();
  const dialogo = page.locator('#sobreposicao-acessibilidade [role="dialog"]');
  await expect(dialogo).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('#titulo-acessibilidade')).toBeFocused();
  expect(await page.evaluate(() => document.getElementById('app').hasAttribute('inert'))).toBe(true);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.getElementById('sobreposicao-acessibilidade').contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#sobreposicao-acessibilidade')).not.toHaveClass(/aberta/);
  await expect(botao).toBeFocused();
  expect(await page.evaluate(() => document.getElementById('app').hasAttribute('inert'))).toBe(false);

  const creditos = page.locator('#botao-creditos');
  await creditos.click();
  await expect(page.locator('#titulo-creditos')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(creditos).toBeFocused();
});

test('configuracao remota maliciosa nao injeta HTML', async ({ page }) => {
  const erros = await A.abrirJogo(page);
  await page.evaluate(() => {
    const base = SELECOES.map(s => Object.assign({}, s));
    base[0] = Object.assign({}, base[0], { nome: '<img src=x onerror="window.__xss=1">' });
    aplicarConfiguracoesRemotas({ selecoes: base });
    const ok = SELECOES.map(s => Object.assign({}, s));
    ok[1] = Object.assign({}, ok[1], { bandeira: 'x" onerror="window.__xss=1' });
    aplicarConfiguracoesRemotas({ selecoes: ok });
    irParaSelecao();
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await page.locator('#grade-selecoes img[onerror]').count()).toBe(0);
  expect(await page.evaluate(() => SELECOES[0].nome)).toBe('Brasil');
  expect(erros).toEqual([]);
});
