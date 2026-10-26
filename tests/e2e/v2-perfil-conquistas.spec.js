// v2.0 — menu novo, conquistas, perfil/bordas, codigo do craque e placas.
const { test, expect } = require('@playwright/test');
const A = require('./ajudantes');

const carteira = (saldo, itens = []) => ({ versao: 1, dados: { saldo, totalGanho: saldo + 500, itens } });

test('menu: cartao do jogador e atalhos abrem Conquistas e voltam', async ({ page }) => {
  const erros = await A.abrirJogo(page);
  await expect(page.locator('#cartao-jogador-nome')).toHaveText('Novo craque');
  await expect(page.locator('#selo-conquistas')).toHaveText('0/18');
  await page.click('#botao-conquistas');
  await expect(page.locator('#tela-conquistas')).toHaveClass(/tela-ativa/);
  await expect(page.locator('#lista-conquistas .conquista')).toHaveCount(18);
  await page.click('#botao-voltar-conquistas');
  await expect(page.locator('#tela-menu')).toHaveClass(/tela-ativa/);
  expect(erros).toEqual([]);
});

test('perfil: trocar a borda salva, rende a medalha "Estiloso" e aparece no menu', async ({ page }) => {
  const erros = await A.abrirJogo(page);
  await page.click('#cartao-jogador');
  await expect(page.locator('#tela-perfil')).toHaveClass(/tela-ativa/);
  await expect(page.locator('#grade-bordas .item-borda')).toHaveCount(await page.evaluate(() => BORDAS.length));
  await page.locator('#grade-bordas .item-borda', { hasText: 'Gramado' }).click();
  await expect(page.locator('#perfil-avatar-grande .moldura-avatar')).toHaveClass(/borda-grama/);
  const perfil = await page.evaluate(() => JSON.parse(localStorage.getItem('mathgol_perfil')));
  expect(perfil.dados.borda).toBe('grama');
  expect(await page.evaluate(() => Conquistas.feita('estiloso'))).toBe(true);
  await expect(page.locator('.toast')).toContainText('Estiloso');
  await page.click('#botao-voltar-perfil');
  await expect(page.locator('#cartao-jogador-avatar .moldura-avatar')).toHaveClass(/borda-grama/);
  expect(erros).toEqual([]);
});

test('perfil: borda bloqueada da Loja leva para a aba Bordas; comprar libera no perfil', async ({ page }) => {
  await A.abrirJogo(page, { carteira: carteira(100) });
  await page.click('#cartao-jogador');
  await page.locator('#grade-bordas .item-borda', { hasText: 'Ouro' }).click();
  await expect(page.locator('#tela-loja')).toHaveClass(/tela-ativa/);
  await expect(page.locator('[data-aba="borda"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-item="borda:ouro"] .botao-comprar').click();
  await page.click('#botao-confirmar-compra');
  await expect(page.locator('#saldo-loja-valor')).toHaveText('40');
  await page.click('#botao-sair-loja');
  await expect(page.locator('#tela-perfil')).toHaveClass(/tela-ativa/);
  const ouro = page.locator('#grade-bordas .item-borda', { hasText: 'Ouro' });
  await expect(ouro).not.toHaveClass(/bloqueada/);
  await ouro.click();
  await expect(page.locator('#perfil-avatar-grande .moldura-avatar')).toHaveClass(/borda-ouro/);
});

test('craque escolhido fica salvo para a proxima visita', async ({ page }) => {
  await A.abrirJogo(page);
  await page.locator('#botao-jogar').click({ force: true });
  await page.locator('#lista-personagens .chip-escolha').first().click();
  await page.locator('#lista-animais .chip-escolha').first().click();
  const nome = await page.locator('#texto-apelido').textContent();
  await page.click('#botao-confirmar-apelido');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#tela-menu.tela-ativa'));
  await expect(page.locator('#cartao-jogador-nome')).toHaveText(nome);
  expect(await page.evaluate(() => estado.apelido)).toBe(nome);
});

test('codigo do craque: sem nuvem avisa com calma; letra que nao existe e explicada', async ({ page }) => {
  const erros = await A.abrirJogo(page); // Firebase bloqueado nos testes
  await page.click('#cartao-jogador');
  await page.click('#botao-criar-codigo');
  await expect(page.locator('#aviso-codigo-conta')).toContainText('servidor');
  await page.click('#botao-entrar-codigo');
  await expect(page.locator('#sobreposicao-entrar-codigo')).toHaveClass(/aberta/);
  await page.fill('#input-codigo-craque', 'abcd efgh jkmn pqr0');
  await expect(page.locator('#input-codigo-craque')).toHaveValue('ABCD-EFGH-JKMN-PQR0');
  await page.click('#botao-confirmar-codigo');
  await expect(page.locator('#aviso-entrar-codigo')).toContainText('0');
  await expect(page.locator('#aviso-entrar-codigo')).toContainText('não usa O, I, L, 0 nem 1');
  await page.fill('#input-codigo-craque', 'ABCD-EFGH');
  await page.click('#botao-confirmar-codigo');
  await expect(page.locator('#aviso-entrar-codigo')).toContainText('16 letras');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sobreposicao-entrar-codigo')).not.toHaveClass(/aberta/);
  expect(erros).toEqual([]);
});

test('resultado: estrelas e aviso de conquista depois da partida', async ({ page }) => {
  await A.abrirJogo(page);
  await page.evaluate(() => {
    estado.selecaoId = 'brasil'; estado.dificuldadeId = 'facil'; estado.faseAtual = 'penaltis';
    TOTAL_COBRANCAS = 3; estado.gols = 3; estado.pontuacao = 270;
    estado.resultadosCobrancas = [{ resultado: 'gol', tempoUsado: 2 }, { resultado: 'gol', tempoUsado: 3 }, { resultado: 'gol', tempoUsado: 4 }];
    irParaResultado();
  });
  await expect(page.locator('#estrelas-resultado .estrela-acesa')).toHaveCount(3);
  await expect(page.locator('#estrelas-resultado')).toHaveAttribute('aria-label', '3 estrelas de 3');
  await expect(page.locator('#toasts .toast').first()).toBeVisible();
  const feitas = await page.evaluate(() => ['primeiro-gol', 'hat-trick', 'partida-perfeita', 'fase-falta'].map(id => Conquistas.feita(id)));
  expect(feitas).toEqual([true, true, true, true]);
});

test('placas da torcida sobem no apito e no gol (3D)', async ({ page }) => {
  await A.abrirJogo(page);
  await A.iniciarPartida(page, { pausa: 60000 });
  expect(await page.evaluate(() => estado.jogoPenalti.modo)).toBe('3d');
  expect(await page.evaluate(() => estado.jogoPenalti.depurar().placas)).toMatchObject({ tipo: 'inicio' });
  await page.evaluate(() => estado.jogoPenalti.reagir('gol'));
  expect(await page.evaluate(() => estado.jogoPenalti.depurar().placas)).toMatchObject({ tipo: 'gol' });
  await page.waitForFunction(() => estado.jogoPenalti.depurar().placas === null, null, { timeout: 8000 });
});

for (const vp of [{ width: 320, height: 568 }, { width: 1366, height: 768 }]) {
  test(`telas novas sem rolagem horizontal ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    const erros = await A.abrirJogo(page, { semThree: true });
    const semRolagem = async onde => {
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(m.sw, `rolagem horizontal em ${onde}`).toBeLessThanOrEqual(m.cw);
    };
    await semRolagem('menu');
    await page.evaluate(() => TelasV2.abrirPerfil('tela-menu'));
    await semRolagem('perfil');
    await page.evaluate(() => TelasV2.abrirConquistas('tela-menu'));
    await semRolagem('conquistas');
    await page.evaluate(() => Loja.abrir('tela-menu', 'borda'));
    await semRolagem('loja bordas');
    await page.evaluate(() => Conta.mostrarCodigo('K7PMQX2R8HTBV9WD', document.body));
    await semRolagem('codigo');
    const larguraCodigo = await page.evaluate(() => document.getElementById('codigo-exibido').scrollWidth <= document.getElementById('codigo-exibido').clientWidth + 1);
    expect(larguraCodigo, 'codigo cabe numa linha').toBe(true);
    expect(erros).toEqual([]);
  });
}
