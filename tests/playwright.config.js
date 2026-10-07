// Configuracao dos testes E2E (Playwright). Rodar: npm run test:e2e
//
// Mora em tests/ pra nao poluir a raiz. O npm script passa -c tests/
// playwright.config.js; testDir e o webServer continuam relativos A RAIZ do
// projeto, que e de onde o npm roda.
// Os testes nao dependem de internet: o Three.js e servido do node_modules
// (mesma versao do CDN) e o Firebase/CDNs externos sao bloqueados.
const { defineConfig, devices } = require('@playwright/test');

const PORTA = 5173;

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60000,
  fullyParallel: true,
  workers: 2, // a cena 3D usa WebGL por software (SwiftShader): mais workers = animacoes lentas
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORTA}`,
    ...devices['Desktop Chrome'],
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
  },
  webServer: {
    command: `node tests/servidor-estatico.js ${PORTA}`,
    url: `http://localhost:${PORTA}/HTML/index.html`,
    reuseExistingServer: !process.env.CI
  }
});
