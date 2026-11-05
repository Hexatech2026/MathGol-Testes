// HU-15 (pausa da sala) e HU-21 (duelo online).
//
// A nuvem e substituida por um FirebaseMathGol de mentira montado DENTRO da
// pagina, antes dos scripts do jogo. Assim o fluxo inteiro — tela de pausa,
// relogio congelado, placar ao vivo, queda de conexao — roda sem rede e sem
// depender do projeto real. As REGRAS de seguranca destas duas HUs tem
// teste proprio em tests/rules/firestore.rules.test.js.
const { test, expect } = require('@playwright/test');
const A = require('./ajudantes');

// Nuvem falsa: guarda a sala e os jogadores da partida em memoria e avisa
// os observadores, igual ao onSnapshot faria.
async function nuvemDeMentira(page, opcoes = {}) {
  await page.addInitScript(({ sala }) => {
    const estadoNuvem = {
      sala: sala,
      salaObs: [],
      partidas: {},
      partidaObs: {},
      uid: 'uid-de-teste'
    };
    window.__nuvem = estadoNuvem;

    const avisarSala = () => estadoNuvem.salaObs.forEach(fn => fn(estadoNuvem.sala && Object.assign({}, estadoNuvem.sala)));
    const avisarPartida = (cod) => (estadoNuvem.partidaObs[cod] || []).forEach(fn =>
      fn(Object.values(estadoNuvem.partidas[cod].jogadores).map(j => Object.assign({}, j))));

    // Degraus que o teste usa para "ser" o professor ou o adversario.
    window.__pausar = (v) => { estadoNuvem.sala.pausada = v; avisarSala(); };
    window.__advResponde = (cod, dados) => {
      const p = estadoNuvem.partidas[cod];
      Object.assign(p.jogadores['uid-adversario'], dados);
      avisarPartida(cod);
    };
    window.__advSome = (cod) => { estadoNuvem.partidaObs[cod] = []; };

    window.FirebaseMathGol = {
      carregarConfiguracoes: () => Promise.resolve(null),
      buscarSala: (c) => Promise.resolve(estadoNuvem.sala && estadoNuvem.sala.codigo === c ? Object.assign({}, estadoNuvem.sala) : null),
      entrarNaSala: () => Promise.resolve(true),
      atualizarSala: (c, m) => { Object.assign(estadoNuvem.sala, m); avisarSala(); return Promise.resolve(true); },
      observarSala: (c, fn) => { estadoNuvem.salaObs.push(fn); fn(Object.assign({}, estadoNuvem.sala)); return () => { estadoNuvem.salaObs = estadoNuvem.salaObs.filter(f => f !== fn); }; },
      observarAlunos: () => () => {},
      criarPartida: (d) => {
        const cod = '4242';
        estadoNuvem.partidas[cod] = {
          dono: estadoNuvem.uid, nivel: d.nivel, perguntas: d.perguntas, status: 'esperando',
          jogadores: { [estadoNuvem.uid]: { uid: estadoNuvem.uid, apelido: 'Eu', gols: 0, pontuacao: 0, cobranca: 0, fim: false } }
        };
        return Promise.resolve({ codigo: cod, uid: estadoNuvem.uid });
      },
      buscarPartida: (c) => Promise.resolve(estadoNuvem.partidas[c] ? Object.assign({ codigo: c }, estadoNuvem.partidas[c]) : null),
      entrarNaPartida: (c, j) => {
        const p = estadoNuvem.partidas[c];
        if (!p) return Promise.resolve(null);
        p.jogadores[estadoNuvem.uid] = Object.assign({ uid: estadoNuvem.uid }, p.jogadores[estadoNuvem.uid], j);
        avisarPartida(c);
        return Promise.resolve(estadoNuvem.uid);
      },
      observarPartida: (c, fn) => {
        (estadoNuvem.partidaObs[c] = estadoNuvem.partidaObs[c] || []).push(fn);
        if (estadoNuvem.partidas[c]) fn(Object.values(estadoNuvem.partidas[c].jogadores).map(j => Object.assign({}, j)));
        return () => { estadoNuvem.partidaObs[c] = (estadoNuvem.partidaObs[c] || []).filter(f => f !== fn); };
      }
    };
    // O jogo so liga a sala quando este evento chega (carregar-externos.js).
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => document.dispatchEvent(new Event('mathgol:firebase-pronto')), 0);
    });
  }, { sala: opcoes.sala || null });
}

// ---------- HU-15 ----------

const SALA = { codigo: 'ABC-123', nome: '3 ano B', nivel: 2, tipos: [], pausada: false };

async function entrarNaSala(page) {
  await page.evaluate(() => Sala.entrar('ABC-123', { apelido: 'Fera Tigre' }));
  await page.waitForFunction(() => Sala.estaNaSala());
}

test('HU-15: professor pausa, a turma ve a tela de pausa e o relogio congela', async ({ page }) => {
  await nuvemDeMentira(page, { sala: Object.assign({}, SALA) });
  const erros = await A.abrirJogo(page);
  await entrarNaSala(page);
  await A.iniciarPartida(page);

  const antes = await page.evaluate(() => estado.timerSegundos);

  // CA-15.2: a tela de pausa aparece sem a crianca fazer nada.
  await page.evaluate(() => window.__pausar(true));
  await expect(page.locator('#sobreposicao-pausa')).toHaveClass(/aberta/);

  // CA-15.3: botoes de zona desabilitados e relogio parado.
  expect(await page.evaluate(() => [...document.querySelectorAll('.botao-resposta')].every(b => b.disabled))).toBe(true);
  await page.waitForTimeout(2600);
  expect(await page.evaluate(() => estado.timerSegundos)).toBe(antes);

  // CA-15.5: ao retomar, o relogio continua do ponto em que parou.
  await page.evaluate(() => window.__pausar(false));
  await expect(page.locator('#sobreposicao-pausa')).not.toHaveClass(/aberta/);
  expect(await page.evaluate(() => [...document.querySelectorAll('.botao-resposta')].every(b => b.disabled))).toBe(false);
  await page.waitForTimeout(1500);
  const depois = await page.evaluate(() => estado.timerSegundos);
  expect(depois).toBeLessThan(antes);
  expect(depois).toBeGreaterThanOrEqual(antes - 3); // os 2,6 s de pausa nao contaram
  expect(erros).toEqual([]);
});

test('HU-15 (CA-15.4): o tempo pausado nao conta na pontuacao', async ({ page }) => {
  await nuvemDeMentira(page, { sala: Object.assign({}, SALA) });
  await A.abrirJogo(page);
  await entrarNaSala(page);
  await A.iniciarPartida(page);

  // O relogio da cobranca e medido como (agora - estado.timerInicio), e e
  // esse mesmo numero que vira pontuacao. Entao a prova de que a pausa nao
  // e cobrada da crianca e o DESLOCAMENTO de timerInicio: ele tem que
  // andar para a frente pelo tempo parado. Medir o relogio de parede aqui
  // mediria tambem a lentidao do proprio teste, que varia por rodada.
  const PAUSA_MS = 3000;
  const antes = await page.evaluate(() => { window.__marco = Date.now(); return estado.timerInicio; });
  await page.evaluate(() => window.__pausar(true));
  await expect(page.locator('#sobreposicao-pausa')).toHaveClass(/aberta/);
  await page.waitForTimeout(PAUSA_MS);
  await page.evaluate(() => window.__pausar(false));
  await expect(page.locator('#sobreposicao-pausa')).not.toHaveClass(/aberta/);

  const depois = await page.evaluate(() => estado.timerInicio);
  const deslocou = depois - antes;
  expect(deslocou).toBeGreaterThanOrEqual(PAUSA_MS - 200);
  expect(deslocou).toBeLessThan(PAUSA_MS + 2000);

  // E a pontuacao sai da faixa de quem respondeu rapido. A pontuacao usa
  // o tempo em segundos inteiros: 3 s de pausa cobrados dariam no maximo
  // 80 pontos (100 * (1 - 3/15)), entao qualquer valor acima disso prova
  // que a pausa nao entrou na conta — sem depender da velocidade da
  // maquina, que so muda o resultado em decimos de segundo.
  await A.responder(page, true);
  await A.mirarEChutar(page);
  await page.waitForFunction(() => estado.resultadosCobrancas.length > 0, null, { timeout: 30000 });
  const c = await page.evaluate(() => estado.resultadosCobrancas[0]);
  expect(c.pontos).toBeGreaterThan(83);
});

test('HU-15 (CA-15.7): quem entra com a sala ja pausada cai na tela de pausa', async ({ page }) => {
  await nuvemDeMentira(page, { sala: Object.assign({}, SALA, { pausada: true }) });
  await A.abrirJogo(page);
  await entrarNaSala(page);
  await expect(page.locator('#sobreposicao-pausa')).toHaveClass(/aberta/);
});

test('HU-15: o botao do professor alterna entre pausar e retomar', async ({ page }) => {
  await nuvemDeMentira(page, { sala: Object.assign({}, SALA) });
  await A.abrirJogo(page);
  await page.evaluate(() => {
    mostrarTela('tela-professor');
    mostrarPainelDaSala({ codigo: 'ABC-123', nome: '3 ano B', nivel: 2, tipos: [] });
  });
  const botao = page.locator('#botao-pausar-sala');
  await expect(botao).toHaveAttribute('aria-pressed', 'false');
  await botao.click();
  await expect(botao).toHaveAttribute('aria-pressed', 'true');
  await expect(botao).toContainText('Retomar');
  expect(await page.evaluate(() => window.__nuvem.sala.pausada)).toBe(true);
  await botao.click();
  await expect(botao).toHaveAttribute('aria-pressed', 'false');
  await expect(botao).toContainText('Pausar');
});

// ---------- HU-21 ----------

async function criarDueloOnline(page) {
  await page.evaluate(() => { estado.selecaoId = 'brasil'; estado.dificuldadeId = 3; irParaFases(); });
  await page.click('#botao-modo-online', { force: true });
  await page.click('#botao-criar-partida', { force: true });
  await expect(page.locator('#codigo-partida')).toHaveText('4242');
}

test('HU-21 (CA-21.1): cria a partida e mostra um codigo de 4 digitos', async ({ page }) => {
  await nuvemDeMentira(page);
  const erros = await A.abrirJogo(page);
  await criarDueloOnline(page);
  expect(await page.locator('#codigo-partida').innerText()).toMatch(/^\d{4}$/);
  expect(erros).toEqual([]);
});

test('HU-21 (CA-21.2): os dois aparelhos recebem as MESMAS contas', async ({ page }) => {
  await nuvemDeMentira(page);
  await A.abrirJogo(page);
  await criarDueloOnline(page);
  const combinadas = await page.evaluate(() => window.__nuvem.partidas['4242'].perguntas);
  expect(combinadas.length).toBe(5);
  // O enunciado e montado no proprio aparelho a partir dos numeros.
  const montadas = await page.evaluate(() => [0, 1, 2, 3, 4].map(i => Online.perguntaDa(i).texto));
  expect(montadas.length).toBe(5);
  montadas.forEach(t => expect(t).toMatch(/^\d+ [+−×÷] \d+$/));
  // Nenhum texto vindo da nuvem: so numeros e o tipo da conta.
  combinadas.forEach(q => {
    expect(Object.keys(q).sort()).toEqual(['a', 'b', 'tipo']);
    expect(['soma', 'subtracao', 'multiplicacao', 'divisao']).toContain(q.tipo);
  });
});

test('HU-21 (CA-21.3/21.5): o placar do adversario aparece ao vivo, so com apelido e avatar', async ({ page }) => {
  await nuvemDeMentira(page);
  await A.abrirJogo(page);
  await criarDueloOnline(page);

  // O amigo entra.
  await page.evaluate(() => {
    const p = window.__nuvem.partidas['4242'];
    p.jogadores['uid-adversario'] = { uid: 'uid-adversario', apelido: 'Raio Lobo', avatarSeed: 'Lobo', gols: 0, pontuacao: 0, cobranca: 0, fim: false };
    window.__advResponde('4242', {});
  });
  await expect(page.locator('#lista-jogadores-online li')).toHaveCount(2);
  await expect(page.locator('#lista-jogadores-online')).toContainText('Raio Lobo');
  await expect(page.locator('#botao-comecar-online')).toBeEnabled();

  await page.click('#botao-comecar-online', { force: true });
  await A.esperarEtapa(page, 'resposta');

  // CA-21.5: o gol do amigo entra no placar sem a crianca fazer nada.
  await page.evaluate(() => window.__advResponde('4242', { gols: 2, pontuacao: 170, cobranca: 2 }));
  await expect(page.locator('#titulo-fase')).toContainText('Raio Lobo');
  await expect(page.locator('#titulo-fase')).toContainText('0 x 2');
});

test('HU-21 (CA-21.6): no fim aparece o vencedor e da para voltar ao menu', async ({ page }) => {
  // Cinco cobrancas inteiras com a cena 3D em WebGL por software levam
  // mais que o tempo padrao de um teste nesta maquina.
  test.setTimeout(180000);
  await nuvemDeMentira(page);
  await A.abrirJogo(page);
  await criarDueloOnline(page);
  await page.evaluate(() => {
    const p = window.__nuvem.partidas['4242'];
    p.jogadores['uid-adversario'] = { uid: 'uid-adversario', apelido: 'Raio Lobo', gols: 0, pontuacao: 0, cobranca: 0, fim: false };
    window.__advResponde('4242', {});
  });
  await page.click('#botao-comecar-online', { force: true });
  await A.esperarEtapa(page, 'resposta');

  // O amigo termina com 0 gols; eu faco 5 cobrancas certas.
  await page.evaluate(() => window.__advResponde('4242', { gols: 0, pontuacao: 0, cobranca: 5, fim: true }));
  for (let i = 0; i < 5; i++) {
    await A.esperarEtapa(page, 'resposta');
    await A.responder(page, true);
    await A.mirarEChutar(page);
    await page.waitForTimeout(600);
  }
  await expect(page.locator('#tela-resultado')).toHaveClass(/tela-ativa/, { timeout: 20000 });
  await expect(page.locator('#titulo-resultado')).toContainText('duelo online');
  await expect(page.locator('#botao-voltar-menu')).toBeVisible();
});

test('HU-21 (CA-21.7): se o amigo cai, a partida encerra avisando, sem erro', async ({ page }) => {
  await nuvemDeMentira(page);
  const erros = await A.abrirJogo(page);
  await criarDueloOnline(page);
  await page.evaluate(() => {
    const p = window.__nuvem.partidas['4242'];
    p.jogadores['uid-adversario'] = { uid: 'uid-adversario', apelido: 'Raio Lobo', gols: 1, pontuacao: 90, cobranca: 1, fim: false };
    window.__advResponde('4242', {});
  });
  await page.click('#botao-comecar-online', { force: true });
  await A.esperarEtapa(page, 'resposta');

  // Encurta o limite de sumico e para de ver o adversario.
  await page.evaluate(() => {
    window.__advSome('4242');
    const foto = { jogadores: [], eu: null, adversario: null, queda: true };
    // Força a vigia a concluir que o amigo caiu.
    Online.aoMudar(() => {});
    encerrarOnlinePorQueda();
  });
  await expect(page.locator('#tela-resultado')).toHaveClass(/tela-ativa/);
  await expect(page.locator('#resumo-resultado')).toContainText('saiu do duelo');
  expect(erros).toEqual([]);
});
