// Configuracao dos testes E2E (Playwright). Rodar: npm run test:e2e
//
// Mora em tests/ pra nao poluir a raiz. O npm script passa
// -c tests/playwright.config.js.
//
// ATENCAO (corrigido): o Playwright resolve testDir E o webServer a partir
// da PASTA DESTE ARQUIVO, nao da raiz de onde o npm roda. Por isso testDir
// e './e2e' e o webServer precisa de "cwd" apontando para a raiz — sem ele
// o comando virava tests/tests/servidor-estatico.js e a suite nao subia.
//
// Os testes nao dependem de internet: o Three.js e servido do node_modules
// (mesma versao do CDN) e o Firebase/CDNs externos sao bloqueados.
const path = require('path');
const { defineConfig, devices } = require('@playwright/test');

const RAIZ = path.join(__dirname, '..');
const PORTA = 5173;

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60000,
  fullyParallel: true,
  // workers: 1, nao 2. A cena 3D roda em WebGL por software (SwiftShader) e
  // os testes de animacao e de timer medem tempo enquanto ela renderiza.
  // Com 2 workers eles disputam CPU e falham de forma intermitente
  // (fluxo-cobranca "toque duplo" e o alerta do timer 4-3-2-1 eram os dois
  // que caiam). Medido nesta maquina: 2 workers = 6,5 min com 2 falhas
  // instaveis; 1 worker = 8,3 min e 83/83 verdes. Os 1,8 min a mais compram
  // um resultado em que se pode confiar.
  workers: 1,
  // Rede de seguranca para maquina mais lenta que esta; nao substitui o
  // workers: 1 acima (com 2 workers a repeticao nao era suficiente).
  retries: process.env.CI ? 2 : 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORTA}`,
    ...devices['Desktop Chrome'],
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
  },
  webServer: {
    command: `node tests/servidor-estatico.js ${PORTA}`,
    cwd: RAIZ,
    url: `http://localhost:${PORTA}/HTML/index.html`,
    reuseExistingServer: !process.env.CI
  }
});
