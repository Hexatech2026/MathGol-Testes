// v1.5: carteira de Cruzeiros, Loja (seleções, Brasileirão 2026, avatares,
// nomes) e tutorial do pênalti.
const { test, expect } = require('@playwright/test');
const A = require('./ajudantes');

const carteira = (saldo, itens = []) => ({ versao: 1, dados: { saldo, totalGanho: saldo + 500, itens } });

test('primeiro "Jogar" abre o tutorial; terminar leva ao "Monte seu craque" e nao repete', async ({ page }) => {
  const erros = await A.abrirJogo(page, { tutorial: true });
  await page.locator('#botao-jogar').click({ force: true });
  await expect(page.locator('#tela-tutorial')).toHaveClass(/tela-ativa/);
  await expect(page.locator('#botao-tutorial-anterior')).toBeDisabled();
  const total = await page.evaluate(() => Tutorial.totalPassos);
  for (let i = 1; i < total; i++) await page.click('#botao-tutorial-proximo');
  await expect(page.locator('#passo-tutorial-contador')).toHaveText(`Passo ${total} de ${total}`);
  await expect(page.locator('#botao-tutorial-pular')).toBeHidden();
  await page.click('#botao-tutorial-proximo');
  await expect(page.locator('#tela-apelido')).toHaveClass(/tela-ativa/);
  await page.evaluate(() => mostrarTela('tela-menu'));
  await page.locator('#botao-jogar').click({ force: true });
  await expect(page.locator('#tela-apelido')).toHaveClass(/tela-ativa/);
  expect(erros).toEqual([]);
});

test('"Como jogar" do menu: setas do teclado navegam e "Pular" volta ao menu', async ({ page }) => {
  await A.abrirJogo(page);
  await page.click('#botao-tutorial');
  await expect(page.locator('#passo-tutorial-contador')).toHaveText(/Passo 1 de/);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#passo-tutorial-contador')).toHaveText(/Passo 2 de/);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#passo-tutorial-contador')).toHaveText(/Passo 1 de/);
  await page.click('#botao-tutorial-pular');
  await expect(page.locator('#tela-menu')).toHaveClass(/tela-ativa/);
});

test('listas reduzidas: so os itens gratis aparecem sem compras', async ({ page }) => {
  await A.abrirJogo(page);
  await page.locator('#botao-jogar').click({ force: true });
  expect(await page.locator('#lista-personagens .chip-escolha').count()).toBe(await page.evaluate(() => PERSONAGENS.length));
  expect(await page.locator('#lista-animais .chip-escolha').count()).toBe(await page.evaluate(() => ANIMAIS.length));
  expect(await page.locator('#grade-avatares .item-avatar').count()).toBe(await page.evaluate(() => AVATARES_GRATIS.length));
  await page.evaluate(() => irParaSelecao());
  expect(await page.locator('#grade-selecoes .cartao').count()).toBe(4);
  await expect(page.locator('#grade-clubes')).toBeHidden();
});

test('catalogo do Brasileirao tem os 20 clubes da Serie A 2026', async ({ page }) => {
  await A.abrirJogo(page);
  const ids = await page.evaluate(() => SELECOES.filter(s => s.categoria === 'clube').map(s => s.id).sort());
  expect(ids).toEqual(['athletico-pr', 'atletico-mg', 'bahia', 'botafogo', 'bragantino', 'chapecoense', 'corinthians',
    'coritiba', 'cruzeiro', 'flamengo', 'fluminense', 'gremio', 'internacional', 'mirassol', 'palmeiras', 'remo',
    'santos', 'sao-paulo', 'vasco', 'vitoria']);
});

test('comprar um clube: confirma, desconta o saldo e o time aparece na escolha', async ({ page }) => {
  const erros = await A.abrirJogo(page, { carteira: carteira(250) });
  await expect(page.locator('#saldo-topo')).toHaveText('250');
  await page.evaluate(() => irParaSelecao());
  await page.click('#botao-loja-selecao');
  await expect(page.locator('#tela-loja')).toHaveClass(/tela-ativa/);
  await expect(page.locator('[data-aba="clube"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-item="clube:palmeiras"] .botao-comprar').click();
  await expect(page.locator('#sobreposicao-compra')).toHaveClass(/aberta/);
  await page.click('#botao-confirmar-compra');
  await expect(page.locator('#status-loja')).toContainText('Palmeiras');
  await expect(page.locator('#saldo-loja-valor')).toHaveText('50');
  await expect(page.locator('[data-item="clube:palmeiras"] .botao-comprar')).toHaveText(/É seu/);
  // Sem saldo: o proximo clube fica desabilitado e mostra quanto falta.
  await expect(page.locator('[data-item="clube:santos"] .botao-comprar')).toBeDisabled();
  await expect(page.locator('[data-item="clube:santos"] .item-loja-falta')).toHaveText('Faltam 150');
  await page.click('#botao-sair-loja');
  await expect(page.locator('#tela-selecao')).toHaveClass(/tela-ativa/);
  await expect(page.locator('#grade-clubes .cartao')).toHaveCount(1);
  await page.locator('#grade-clubes .cartao').click();
  expect(await page.evaluate(() => estado.selecaoId)).toBe('palmeiras');
  const salvo = await page.evaluate(() => JSON.parse(localStorage.getItem('mathgol_carteira')));
  expect(salvo).toEqual({ versao: 1, dados: { saldo: 50, totalGanho: 750, itens: ['clube:palmeiras'] } });
  expect(erros).toEqual([]);
});

test('"Agora nao" cancela a compra sem gastar', async ({ page }) => {
  await A.abrirJogo(page, { carteira: carteira(500) });
  await page.click('#botao-loja');
  await page.click('[data-aba="avatar"]');
  await page.locator('[data-item="avatar:Panda"] .botao-comprar').click();
  await page.click('#botao-cancelar-compra');
  await expect(page.locator('#sobreposicao-compra')).not.toHaveClass(/aberta/);
  expect(await page.evaluate(() => [Carteira.saldo(), Carteira.possui('avatar:Panda')])).toEqual([500, false]);
});

test('nome e avatar comprados aparecem no "Monte seu craque"', async ({ page }) => {
  await A.abrirJogo(page, { carteira: carteira(10, ['nome:Furacão', 'nome:Tubarão', 'avatar:Panda']) });
  await page.locator('#botao-jogar').click({ force: true });
  await expect(page.locator('#lista-personagens .chip-escolha', { hasText: 'Furacão' })).toHaveCount(1);
  await expect(page.locator('#lista-animais .chip-escolha', { hasText: 'Tubarão' })).toHaveCount(1);
  await expect(page.locator('#grade-avatares [aria-label="Avatar Panda"]')).toHaveCount(1);
});

test('fim da partida deposita os Cruzeiros na carteira', async ({ page }) => {
  await A.abrirJogo(page, { carteira: carteira(100) });
  await page.evaluate(() => {
    estado.selecaoId = 'brasil'; estado.dificuldadeId = 'facil'; estado.faseAtual = 'penaltis';
    TOTAL_COBRANCAS = 3; estado.gols = 2; estado.pontuacao = 150;
    estado.resultadosCobrancas = [
      { resultado: 'gol', tempoUsado: 3 }, { resultado: 'gol', tempoUsado: 4 }, { resultado: 'defesa', tempoUsado: 15, estourouTempo: true }];
    irParaResultado();
  });
  await expect(page.locator('#ganho-carteira')).toContainText('+150 Cruzeiros');
  await expect(page.locator('#ganho-carteira')).toContainText('Saldo: 250 Cruzeiros');
  await expect(page.locator('#saldo-topo')).toHaveText('250');
});

test('carteira adulterada no navegador e ignorada (comeca zerada)', async ({ page }) => {
  await A.abrirJogo(page, { carteira: { versao: 1, dados: { saldo: 99999, totalGanho: 10, itens: [] } } });
  expect(await page.evaluate(() => Carteira.saldo())).toBe(0);
});

test('loja sem rolagem horizontal em 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await A.abrirJogo(page, { semThree: true, carteira: carteira(300) });
  for (const aba of ['selecao', 'clube', 'avatar', 'nome']) {
    await page.evaluate(a => Loja.abrir('tela-menu', a), aba);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(m.sw, `aba ${aba}`).toBeLessThanOrEqual(m.cw);
  }
});
