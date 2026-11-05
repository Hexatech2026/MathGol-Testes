// Gera o .zip para subir no repositório de produção.
//
//   node tests/empacotar.js [destino.zip]
//
// Entra no pacote só o que o site precisa para rodar: o jogo, os arquivos
// que ele serve (fontes, bandeiras, avatares, áudio, Three.js) e os
// arquivos que o deploy lê (vercel.json, firebase.json, as regras e os
// documentos). Fica de fora tudo que é de desenvolvimento: node_modules,
// a suíte de testes, o .git e os relatórios do Playwright.
//
// Sem dependência nova: usa o compactador do próprio sistema.
//
// No Windows é o bsdtar (C:\Windows\System32\tar.exe), e NÃO o
// Compress-Archive do PowerShell: o Compress-Archive do Windows
// PowerShell 5.1 grava os caminhos com barra invertida ("HTML\index.html"),
// e um zip assim, descompactado em Linux, vira um punhado de arquivos
// soltos com barra invertida no nome — o deploy sobe quebrado.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const DESTINO = path.resolve(process.argv[2] || path.join(RAIZ, 'mathgol-producao.zip'));

// Entra no pacote.
const INCLUIR = [
  'index.html',
  'HTML', 'CSS', 'JS', 'Imagens', 'Audio', 'Fontes', 'Vendor', 'Config', 'Docs',
  'vercel.json', 'firebase.json', 'package.json', 'package-lock.json',
  'README.md', '.gitignore'
];

// Não entra, mesmo dentro das pastas acima.
const EXCLUIR = [
  /(^|[\\/])node_modules([\\/]|$)/,
  /(^|[\\/])\.git([\\/]|$)/,
  /(^|[\\/])test-results([\\/]|$)/,
  /(^|[\\/])playwright-report([\\/]|$)/,
  /(^|[\\/])\.claude([\\/]|$)/,
  /(^|[\\/])\.env$/,
  /\.zip$/,
  /firebase-debug\.log$/,
  /firestore-debug\.log$/,
  // Instrucoes do patch de niveis/sala, ja aplicado no codigo em 2026.
  // Sao historico: ficam no git, nao no site publicado.
  /(^|[\/])LEIA-ME\.(md|txt)$/,
  /(^|[\/])MUDANCAS-NO-MAIN\.md$/,
  /TRECHO-SALA/
];

function listar(rel) {
  const abs = path.join(RAIZ, rel);
  if (!fs.existsSync(abs)) return [];
  if (EXCLUIR.some(r => r.test(rel))) return [];
  if (!fs.statSync(abs).isDirectory()) return [rel];
  return fs.readdirSync(abs).flatMap(f => listar(path.join(rel, f)));
}

const arquivos = INCLUIR.flatMap(listar);
if (!arquivos.length) {
  console.error('Nada para empacotar — rodou da pasta certa?');
  process.exit(1);
}

// Confere o que não pode faltar: um pacote sem estes arquivos sobe quebrado.
const OBRIGATORIOS = [
  'index.html',
  path.join('HTML', 'index.html'),
  path.join('Config', 'firestore.rules'),
  path.join('Vendor', 'three.min.js'),
  path.join('CSS', 'fontes-locais.css'),
  'vercel.json'
];
const faltando = OBRIGATORIOS.filter(f => !arquivos.includes(f));
if (faltando.length) {
  console.error('Faltando no pacote:', faltando.join(', '));
  process.exit(1);
}

// Monta uma cópia limpa e zipa a partir dela: assim o zip não carrega
// nenhum caminho de exclusão e abre direto na raiz do projeto.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mathgol-'));
const stage = path.join(temp, 'mathgol');
arquivos.forEach(rel => {
  const destino = path.join(stage, rel);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(path.join(RAIZ, rel), destino);
});

if (fs.existsSync(DESTINO)) fs.unlinkSync(DESTINO);

const conteudo = fs.readdirSync(stage);
if (process.platform === 'win32') {
  const bsdtar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  if (!fs.existsSync(bsdtar)) {
    console.error('Não achei o tar do Windows em ' + bsdtar + '.');
    console.error('Compacte a pasta à mão, ou rode este script no Linux/macOS.');
    process.exit(1);
  }
  execFileSync(bsdtar, ['-a', '-c', '-f', DESTINO, ...conteudo], { cwd: stage, stdio: 'inherit' });
} else {
  execFileSync('zip', ['-rq', DESTINO, ...conteudo], { cwd: stage, stdio: 'inherit' });
}

fs.rmSync(temp, { recursive: true, force: true });

// Confere que os caminhos saíram com barra normal: um zip com barra
// invertida descompacta errado fora do Windows.
const bytes = fs.readFileSync(DESTINO);
const marca = Buffer.from('PK\u0003\u0004', 'latin1');
let i = bytes.indexOf(marca);
let comBarraInvertida = 0, conferidos = 0;
while (i !== -1 && conferidos < 400) {
  const tamNome = bytes.readUInt16LE(i + 26);
  const nome = bytes.toString('utf8', i + 30, i + 30 + tamNome);
  if (nome.includes('\\')) comBarraInvertida++;
  conferidos++;
  i = bytes.indexOf(marca, i + 4);
}
if (comBarraInvertida) {
  console.error(`${comBarraInvertida} caminhos com barra invertida no zip — não suba este arquivo.`);
  process.exit(1);
}

const mb = (fs.statSync(DESTINO).size / (1024 * 1024)).toFixed(2);
console.log(`${arquivos.length} arquivos · ${mb} MB · ${conferidos} caminhos conferidos`);
console.log(DESTINO);
