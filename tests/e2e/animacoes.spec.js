// Animacoes da cena 3D: goleiro nao atravessa o chao, bola nao fica
// suspensa, torcida nao clareia ate o branco, fundo decorativo some.
const { test, expect } = require('@playwright/test');
const A = require('./ajudantes');

// Coleta amostras de depurar() a cada quadro durante `ms` (ou ate a cena
// resetar, se `ateResetar`). O WebGL por software dos testes e lento, entao
// o criterio e o estado da cena, nao um tempo fixo.
async function amostrar(page, acao, ms, ateResetar) {
  return page.evaluate(({ acao, ms, ateResetar }) => new Promise(resolve => {
    const jogo = estado.jogoPenalti;
    const amostras = [];
    const t0 = performance.now();
    let saiuDoLugar = false;
    (function passo() {
      const d = jogo.depurar();
      amostras.push(Object.assign({ t: performance.now() - t0 }, d));
      if (Math.abs(d.goleiroRotZ) > 0.5) saiuDoLugar = true;
      const resetou = ateResetar && saiuDoLugar && d.goleiroRotZ === 0;
      if (!resetou && performance.now() - t0 < ms) requestAnimationFrame(passo); else resolve(amostras);
    })();
    // eslint-disable-next-line no-new-func
    new Function('jogo', acao)(jogo);
  }), { acao, ms, ateResetar });
}

test.beforeEach(async ({ page }) => {
  await A.abrirJogo(page);
  await A.iniciarPartida(page, { pausa: 60000 });
  await page.evaluate(() => pararTimer());
});

for (const zona of ['topo-direita', 'baixo-esquerda', 'topo-esquerda']) {
  test(`goleiro mergulha (${zona}), cai de forma continua e fica deitado NO chao, sem atravessar`, async ({ page }) => {
    const a = await amostrar(page, `jogo.chutar('${zona}', function(){})`, 20000, true);
    const menorY = Math.min(...a.map(x => x.goleiroMinY));
    expect(menorY).toBeGreaterThan(-0.03);                       // nunca abaixo do gramado
    // Deitado e parado = queda terminada (rotacao exatamente na final).
    const deitado = a.filter(x => Math.abs(Math.abs(x.goleiroRotZ) - Math.PI / 2) < 0.0005);
    expect(deitado.length).toBeGreaterThan(3);                   // fica deitado um tempo
    // Apoiado no chao (a pequena acomodada/quique sobe no maximo ~5 cm).
    for (const x of deitado) expect(Math.abs(x.goleiroMinY)).toBeLessThan(0.12);
    expect(Math.min(...deitado.map(x => Math.abs(x.goleiroMinY)))).toBeLessThan(0.03); // encosta no chao
    // Queda continua: sem saltos grandes de rotacao entre quadros.
    // (a amostragem depende da taxa de quadros: WebGL por software e lento,
    // entao so compara quadros proximos no tempo)
    for (let i = 1; i < a.length; i++) {
      if (a[i].t - a[i - 1].t < 40) expect(Math.abs(a[i].goleiroRotZ - a[i - 1].goleiroRotZ)).toBeLessThan(0.35);
    }
  });
}

for (const caso of [{ nome: 'por cima', forca: 1, x: 0 }, { nome: 'pela lateral', forca: 0.55, x: 3.58 }]) {
  test(`bola ${caso.nome} continua o voo e cai no chao (nao fica suspensa)`, async ({ page }) => {
    const a = await amostrar(page, `jogo.chutarLivre({ x: ${caso.x}, y: 1.3 }, ${caso.forca}, 0.5, function(){})`, 6000);
    const atras = a.filter(x => x.bola.z < -0.5);
    expect(atras.length).toBeGreaterThan(5);
    const ultima = atras[atras.length - 1];
    expect(ultima.bola.y).toBeLessThan(0.3);                     // no gramado
    expect(ultima.bola.z).toBeLessThan(-2);                      // atras do gol
  });
}

test('torcida comemora sem clarear ate o branco e volta as cores-base', async ({ page }) => {
  const a = await amostrar(page, `jogo.chutarLivre({ x: 0, y: 1.3 }, 0.55, 0.5, function(){})`, 8000);
  const max = Math.max(...a.map(x => x.torcidaClareamento));
  expect(max).toBeGreaterThan(0.05);   // houve comemoracao
  expect(max).toBeLessThan(0.32);      // sem acumular ate o branco
  expect(a[a.length - 1].torcidaClareamento).toBeLessThan(0.001);
});

test('gol grande no palco e fundo decorativo oculto durante a partida', async ({ page }) => {
  const d = await page.evaluate(() => estado.jogoPenalti.depurar());
  const larguraGol = d.gol[1].leftPercent - d.gol[0].leftPercent;
  expect(larguraGol).toBeGreaterThan(48); // era ~35%
  await expect(page.locator('.campo-animado')).toBeHidden();
  await expect(page.locator('.fundo-tematico')).toBeHidden();
  await page.evaluate(() => sairParaMenu());
  await expect(page.locator('.campo-animado')).toBeVisible();
});
