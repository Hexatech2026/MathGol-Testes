// v2.1 — falas gravadas do locutor tocando no jogo.
const { test, expect } = require('@playwright/test');
const A = require('./ajudantes');

test('gol: toca "Gol!" gravado e emenda a frase da faixa; a proxima conta espera o locutor', async ({ page }) => {
  const pedidos = [];
  page.on('request', r => { if (r.url().includes('/Audio/falas/')) pedidos.push(r.url().split('/').pop()); });
  await page.addInitScript(() => {
    // Registra o que tocou (o audio de verdade e decodificado normalmente).
    window.__tocou = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() { window.__tocou.push(this.src.split('/').pop()); return play.apply(this, arguments); };
  });
  await A.abrirJogo(page);
  await A.iniciarPartida(page);
  // A partida ja baixa as falas dela.
  await expect.poll(() => pedidos.filter(p => p.startsWith('gol-')).length).toBeGreaterThan(0);

  const antes = await page.evaluate(() => estado.cobrancaAtual);
  await page.evaluate(() => {
    estado.etapa = 'chute';
    finalizarCobranca({ respostaCorreta: true, bolaDentro: true, tempoUsadoMs: 2000, tipoChute: 'meia' });
  });
  const faixa = await page.locator('#faixa-celebracao-texto').textContent();
  expect(await page.evaluate(() => window.__tocou[window.__tocou.length - 1])).toBe('gol-01.mp3');
  // Quando o "Gol!" acaba, entra a MESMA frase que esta na faixa.
  await page.waitForFunction(() => /^gol-0[2-6]$/.test(Narracao.falaGravadaAtual() || ''), null, { timeout: 5000 });
  const frase = await page.evaluate(() => Falas.texto(Narracao.falaGravadaAtual()));
  expect(frase).toBe(faixa);
  // A proxima conta so entra quando o locutor termina.
  expect(await page.evaluate(() => estado.cobrancaAtual)).toBe(antes + 1);
  expect(await page.evaluate(() => estado.etapa)).not.toBe('resposta');
  await A.esperarEtapa(page, 'resposta', 10000);
  expect(await page.evaluate(() => Narracao.tempoRestante())).toBe(0);
});

test('som bloqueado: a mesma frase sai na voz sintetizada e a partida nao espera a mais', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function() { return Promise.reject(new DOMException('bloqueado', 'NotAllowedError')); };
    window.__falado = [];
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = u => window.__falado.push(u.text);
    }
  });
  await A.abrirJogo(page);
  await A.iniciarPartida(page);
  const t0 = await page.evaluate(() => {
    estado.etapa = 'chute';
    finalizarCobranca({ respostaCorreta: false, estourouTempo: true, tempoUsadoMs: 15000 });
    return Date.now();
  });
  await page.waitForFunction(() => window.__falado.includes('Tempo esgotado! O goleiro defendeu.'));
  await A.esperarEtapa(page, 'resposta', 10000);
  const esperou = await page.evaluate(t => Date.now() - t, t0);
  expect(esperou).toBeLessThan(3000); // so a pausa normal (1,5 s)
});

test('tutorial toca a gravacao de cada passo', async ({ page }) => {
  await page.addInitScript(() => {
    window.__tocou = [];
    HTMLMediaElement.prototype.play = function() { window.__tocou.push(this.src.split('/').pop()); return Promise.resolve(); };
  });
  await A.abrirJogo(page);
  await page.click('#botao-tutorial');
  await expect(page.locator('#tela-tutorial')).toHaveClass(/tela-ativa/);
  await page.click('#botao-tutorial-proximo');
  await page.click('#botao-tutorial-proximo');
  expect(await page.evaluate(() => window.__tocou)).toEqual(['tutorial-01.mp3', 'tutorial-02.mp3', 'tutorial-03.mp3']);
});

test('fim da fase: a mensagem do resultado e falada (antes era cortada pela troca de tela)', async ({ page }) => {
  await page.addInitScript(() => {
    window.__tocou = [];
    HTMLMediaElement.prototype.play = function() { window.__tocou.push(this.src.split('/').pop()); return Promise.resolve(); };
  });
  await A.abrirJogo(page);
  await page.evaluate(() => {
    estado.selecaoId = 'brasil'; estado.dificuldadeId = 'facil'; estado.faseAtual = 'penaltis';
    TOTAL_COBRANCAS = 3; estado.gols = 1; estado.pontuacao = 80;
    estado.resultadosCobrancas = [{ resultado: 'gol', tempoUsado: 2 }, { resultado: 'defesa', tempoUsado: 5 }, { resultado: 'defesa', tempoUsado: 5 }];
    irParaResultado();
  });
  const id = await page.evaluate(() => Narracao.falaGravadaAtual());
  expect(id).toMatch(/^fim-01-0[1-4]$/);
  expect(await page.evaluate(i => Falas.texto(i), id)).toBe(await page.locator('#resumo-resultado').textContent());
});
