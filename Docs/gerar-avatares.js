// gerar-avatares.js — desenha os 18 avatares de Imagens/avatares/*.svg.
//
// Rodar:  node Docs/gerar-avatares.js
//
// O nome de cada arquivo e a MESMA seed gravada nos perfis (avatar-data.js),
// entao refazer os desenhos nao troca o avatar de ninguem.
//
// Estilo v2.0: fundo de estadio com luz, personagem com sombra suave,
// brilho nos olhos, bochechas e camisa com gola. Tudo vetorial, sem
// fonte externa, ~2-4 KB por arquivo.

const fs = require('fs');
const path = require('path');

const PASTA = path.join(__dirname, '..', 'Imagens', 'avatares');

// ---------- Pecas comuns ----------

function svg(nome, fundo, corpo, defsExtra = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="${nome}">` +
    `<title>${nome}</title><defs>` +
    `<radialGradient id="bg" cx="50%" cy="32%" r="75%"><stop offset="0" stop-color="${fundo[0]}"/><stop offset="1" stop-color="${fundo[1]}"/></radialGradient>` +
    `<radialGradient id="luz" cx="50%" cy="0%" r="70%"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.45"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>` +
    `<clipPath id="c"><circle cx="60" cy="60" r="60"/></clipPath>${defsExtra}</defs>` +
    `<g clip-path="url(#c)"><rect width="120" height="120" fill="url(#bg)"/>` +
    `<ellipse cx="60" cy="8" rx="70" ry="52" fill="url(#luz)"/>` +
    `<path d="M-10 112 Q60 92 130 112 L130 130 L-10 130Z" fill="#FFFFFF" opacity="0.10"/>` +
    `<circle cx="18" cy="26" r="2" fill="#FFFFFF" opacity="0.5"/><circle cx="100" cy="20" r="1.6" fill="#FFFFFF" opacity="0.5"/>` +
    `<circle cx="104" cy="44" r="1.2" fill="#FFFFFF" opacity="0.4"/><circle cx="12" cy="50" r="1.2" fill="#FFFFFF" opacity="0.4"/>` +
    corpo + `</g><circle cx="60" cy="60" r="58" fill="none" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="3"/></svg>`;
}

function grad(id, a, b, vertical = true) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
}

function escurecer(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f))));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

// Olhos com iris, pupila e dois brilhos.
function olhos(cx1, cx2, cy, iris = '#3B2A1A', grande = 1) {
  const um = cx => `<ellipse cx="${cx}" cy="${cy}" rx="${5.4 * grande}" ry="${6.2 * grande}" fill="#FFFFFF"/>` +
    `<circle cx="${cx + 0.4}" cy="${cy + 0.8}" r="${3.9 * grande}" fill="${iris}"/>` +
    `<circle cx="${cx + 0.4}" cy="${cy + 0.8}" r="${2.1 * grande}" fill="#120B05"/>` +
    `<circle cx="${cx - 1.2}" cy="${cy - 1.2}" r="${1.4 * grande}" fill="#FFFFFF"/>` +
    `<circle cx="${cx + 1.9}" cy="${cy + 2.2}" r="${0.7 * grande}" fill="#FFFFFF" opacity="0.8"/>`;
  return um(cx1) + um(cx2);
}

function bochechas(y = 70, cor = '#FF7B7B') {
  return `<ellipse cx="44" cy="${y}" rx="5" ry="3" fill="${cor}" opacity="0.32"/><ellipse cx="76" cy="${y}" rx="5" ry="3" fill="${cor}" opacity="0.32"/>`;
}

// Sorriso aberto com dentes e lingua.
function sorriso(y = 74, largura = 10, cor = '#7A2E2A') {
  return `<path d="M${60 - largura} ${y} Q60 ${y + largura * 1.15} ${60 + largura} ${y} Z" fill="${cor}"/>` +
    `<path d="M${60 - largura + 1.5} ${y + 0.4} Q60 ${y + 3} ${60 + largura - 1.5} ${y + 0.4} L${60 + largura - 2.5} ${y + 2.2} Q60 ${y + 4} ${60 - largura + 2.5} ${y + 2.2}Z" fill="#FFFFFF"/>` +
    `<ellipse cx="60" cy="${y + largura * 0.78}" rx="${largura * 0.45}" ry="${largura * 0.22}" fill="#E8636B"/>`;
}

// Busto de jogador: ombros com camisa, gola em V, numero no peito.
function busto(camisa, detalhe, numero, pele) {
  const sombra = escurecer(camisa, 0.82);
  return `<path d="M14 124 Q16 92 42 88 L78 88 Q104 92 106 124Z" fill="${camisa}"/>` +
    `<path d="M14 124 Q16 92 42 88 L46 88 Q30 98 28 124Z" fill="${sombra}" opacity="0.6"/>` +
    `<rect x="52" y="76" width="16" height="15" rx="6" fill="${escurecer(pele, 0.86)}"/>` +
    `<path d="M48 88 L60 102 L72 88 L67 88 L60 96 L53 88Z" fill="${detalhe}"/>` +
    (numero ? `<text x="84" y="112" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="13" fill="${detalhe}">${numero}</text>` : '') +
    `<path d="M20 124 Q22 104 36 98" stroke="${detalhe}" stroke-width="3" fill="none" opacity="0.8"/>` +
    `<path d="M100 124 Q98 104 84 98" stroke="${detalhe}" stroke-width="3" fill="none" opacity="0.8"/>`;
}

// Cabeca humana com sombreado. extras: pedacos desenhados por cima.
function cabeca(pele, opcoes = {}) {
  const sombra = escurecer(pele, 0.84);
  const iris = opcoes.iris || '#3B2A1A';
  return `<ellipse cx="37" cy="60" rx="5" ry="7" fill="${sombra}"/><ellipse cx="83" cy="60" rx="5" ry="7" fill="${sombra}"/>` +
    `<ellipse cx="60" cy="57" rx="24" ry="27" fill="url(#pele)"/>` +
    (opcoes.cabeloAtras || '') +
    `<path d="M45 76 Q60 88 75 76 Q70 84 60 85 Q50 84 45 76Z" fill="${sombra}" opacity="0.45"/>` +
    olhos(50, 70, 58, iris) +
    `<path d="M44 49 Q50 45 55 48" stroke="${opcoes.sobrancelha || '#2B1A10'}" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
    `<path d="M65 48 Q70 45 76 49" stroke="${opcoes.sobrancelha || '#2B1A10'}" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
    `<path d="M58 64 Q60 67 62 64" stroke="${sombra}" stroke-width="2" fill="none" stroke-linecap="round"/>` +
    bochechas(69) +
    (opcoes.boca || sorriso(72, 8)) +
    (opcoes.cabelo || '');
}

function jogador(nome, fundo, pele, camisa, detalhe, numero, opcoes) {
  const defs = grad('pele', pele, escurecer(pele, 0.9));
  return svg(nome, fundo, busto(camisa, detalhe, numero, pele) + cabeca(pele, opcoes), defs);
}

// ---------- Cabelos ----------

const cabelos = {
  curtoCacheado: cor => `<path d="M36 52 Q34 28 60 27 Q86 28 84 52 Q80 40 72 38 Q66 34 60 36 Q52 34 46 38 Q40 41 36 52Z" fill="${cor}"/>` +
    [40, 47, 54, 61, 68, 75, 81].map((x, i) => `<circle cx="${x}" cy="${33 + (i % 2) * 3}" r="5.2" fill="${cor}"/>`).join(''),
  rabo: cor => `<path d="M34 58 Q32 26 60 26 Q88 26 86 58 Q84 44 76 38 Q68 33 60 34 Q50 33 43 39 Q36 45 34 58Z" fill="${cor}"/>` +
    `<path d="M50 34 Q60 44 78 40" stroke="${escurecer(cor, 1.3)}" stroke-width="2" fill="none" opacity="0.5"/>` +
    `<circle cx="60" cy="25" r="8" fill="${cor}"/><circle cx="60" cy="25" r="3" fill="#E0343B"/>`,
  rastaFaixa: (cor, faixa) => `<path d="M33 66 Q28 30 60 26 Q92 30 87 66 Q84 46 60 40 Q36 46 33 66Z" fill="${cor}"/>` +
    [30, 35, 85, 90].map(x => `<path d="M${x} 52 Q${x - 2} 72 ${x + 1} 88" stroke="${cor}" stroke-width="5" fill="none" stroke-linecap="round"/>`).join('') +
    `<path d="M36 44 Q60 32 84 44" stroke="${faixa}" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  ladoRisca: cor => `<path d="M35 54 Q34 28 60 27 Q88 28 85 54 Q83 40 74 36 L52 38 Q42 40 35 54Z" fill="${cor}"/>` +
    `<path d="M52 30 Q48 34 50 39" stroke="${escurecer(cor, 1.4)}" stroke-width="1.6" fill="none"/>`,
};

// ---------- Avatares ----------

const AVATARES = {
  Pele: () => jogador('Craque', ['#3CC07A', '#0E5A33'], '#7A4A2A', '#FFD23F', '#1E8E4E', '10',
    { cabelo: cabelos.curtoCacheado('#1A120C'), sobrancelha: '#1A120C' }),

  Marta: () => jogador('Craque Rainha', ['#7AA2FF', '#22348C'], '#C98B5E', '#3A5FCD', '#FFFDF6', '10',
    { cabelo: cabelos.rabo('#3A2414'), iris: '#4A2E14', sobrancelha: '#3A2414' }),

  Ronaldinho: () => jogador('Bruxo', ['#FFB36B', '#B4461E'], '#8A5A3B', '#1D3E8C', '#FFC63B', '10',
    { cabelo: cabelos.rastaFaixa('#1A120C', '#FFFDF6'), boca: sorriso(71, 11), sobrancelha: '#1A120C' }),

  Kaka: () => jogador('Maestro', ['#9BD7F2', '#2C6E9C'], '#F2C9A0', '#FFFDF6', '#E0343B', '8',
    { cabelo: cabelos.ladoRisca('#6A3E1E'), iris: '#3D6B2A', sobrancelha: '#6A3E1E' }),

  Numero10: () => svg('Camisa 10', ['#3CC07A', '#0E5A33'],
    `<path d="M30 40 L46 30 Q60 38 74 30 L90 40 L100 58 L88 64 L86 104 L34 104 L32 64 L20 58Z" fill="url(#cam)" stroke="#0B3D2B" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<path d="M46 30 Q60 42 74 30" fill="none" stroke="#1E8E4E" stroke-width="5"/>` +
    `<text x="60" y="88" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="34" fill="#1E8E4E" stroke="#FFFDF6" stroke-width="1.5">10</text>` +
    `<path d="M38 70 L38 100" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M92 24 l2 5 5 .6 -3.8 3.4 1.1 5 -4.3 -2.6 -4.3 2.6 1.1 -5 -3.8 -3.4 5 -.6Z" fill="#FFE14D"/>`,
    grad('cam', '#FFE066', '#F2B705')),

  Azul: () => svg('Azulão', ['#8ED8FF', '#1E5FA8'],
    `<ellipse cx="60" cy="76" rx="30" ry="32" fill="url(#ave)"/>` +
    `<ellipse cx="60" cy="86" rx="17" ry="18" fill="#CFE9FF"/>` +
    `<path d="M32 70 Q20 80 30 96 Q36 86 40 78Z" fill="#1E4E9C"/><path d="M88 70 Q100 80 90 96 Q84 86 80 78Z" fill="#1E4E9C"/>` +
    `<path d="M50 44 Q54 34 60 40 Q66 30 70 42" fill="#2A6FD6"/>` +
    olhos(50, 70, 64, '#1A2A4A', 1.05) +
    `<path d="M54 74 L66 74 L60 82Z" fill="#FFB020"/><path d="M54 74 L66 74 L60 77Z" fill="#FFD25C"/>` +
    bochechas(74) +
    `<circle cx="92" cy="104" r="11" fill="#FFFDF6" stroke="#21303B" stroke-width="1.5"/><path d="M92 98 l4 3 -1.5 5 -5 0 -1.5 -5Z" fill="#21303B"/>`,
    grad('ave', '#4FA3F7', '#1E4E9C')),

  Tigre: () => svg('Tigre', ['#FFC46B', '#C55A11'],
    `<circle cx="34" cy="38" r="11" fill="#F08A24"/><circle cx="34" cy="38" r="6" fill="#FFD9B3"/>` +
    `<circle cx="86" cy="38" r="11" fill="#F08A24"/><circle cx="86" cy="38" r="6" fill="#FFD9B3"/>` +
    `<ellipse cx="60" cy="64" rx="34" ry="32" fill="url(#pelo)"/>` +
    `<path d="M60 34 L56 46 L60 44 L64 46Z M40 46 Q46 50 44 58 M80 46 Q74 50 76 58 M28 64 L40 66 M28 72 L40 72 M92 64 L80 66 M92 72 L80 72" stroke="#3B1F0A" stroke-width="3" fill="#3B1F0A" stroke-linecap="round"/>` +
    `<ellipse cx="60" cy="78" rx="18" ry="14" fill="#FFF3E2"/>` +
    olhos(48, 72, 58, '#3E7D2A') +
    `<path d="M54 70 Q60 66 66 70 Q60 76 54 70Z" fill="#E86A6A"/>` +
    `<path d="M60 74 L60 78 M60 78 Q54 84 50 79 M60 78 Q66 84 70 79" stroke="#3B1F0A" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    grad('pelo', '#FFA640', '#E3701A')),

  Leao: () => svg('Leão', ['#FFE08A', '#C88A10'],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => {
      const a = i / 12 * Math.PI * 2;
      return `<circle cx="${(60 + Math.cos(a) * 34).toFixed(1)}" cy="${(64 + Math.sin(a) * 33).toFixed(1)}" r="15" fill="${i % 2 ? '#B85A1A' : '#D9751F'}"/>`;
    }).join('') +
    `<circle cx="38" cy="40" r="8" fill="#F3B23A"/><circle cx="82" cy="40" r="8" fill="#F3B23A"/>` +
    `<ellipse cx="60" cy="66" rx="27" ry="27" fill="url(#rosto)"/>` +
    `<ellipse cx="60" cy="78" rx="15" ry="11" fill="#FFF3E2"/>` +
    olhos(49, 71, 61, '#6B3E12') +
    `<path d="M54 72 Q60 68 66 72 Q60 78 54 72Z" fill="#6B3E12"/>` +
    `<path d="M60 76 L60 80 M60 80 Q55 85 51 81 M60 80 Q65 85 69 81" stroke="#6B3E12" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
    bochechas(74),
    grad('rosto', '#FFD25C', '#F2A922')),

  Panda: () => svg('Panda', ['#B8F0C8', '#2E8C55'],
    `<circle cx="36" cy="36" r="12" fill="#1F1F24"/><circle cx="84" cy="36" r="12" fill="#1F1F24"/>` +
    `<ellipse cx="60" cy="64" rx="32" ry="30" fill="url(#branco)"/>` +
    `<ellipse cx="47" cy="61" rx="9" ry="11" transform="rotate(-20 47 61)" fill="#1F1F24"/>` +
    `<ellipse cx="73" cy="61" rx="9" ry="11" transform="rotate(20 73 61)" fill="#1F1F24"/>` +
    `<circle cx="48" cy="61" r="4" fill="#FFFFFF"/><circle cx="48.6" cy="61.6" r="2.4" fill="#120B05"/><circle cx="47.2" cy="60" r="1" fill="#FFFFFF"/>` +
    `<circle cx="72" cy="61" r="4" fill="#FFFFFF"/><circle cx="72.6" cy="61.6" r="2.4" fill="#120B05"/><circle cx="71.2" cy="60" r="1" fill="#FFFFFF"/>` +
    `<ellipse cx="60" cy="74" rx="5" ry="3.5" fill="#1F1F24"/>` +
    `<path d="M60 77 L60 80 M60 80 Q55 85 51 81 M60 80 Q65 85 69 81" stroke="#1F1F24" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
    bochechas(74) +
    `<path d="M62 22 Q68 12 76 16 Q70 20 66 28Z" fill="#4CB36A"/>`,
    grad('branco', '#FFFFFF', '#DCE3E8')),

  Coruja: () => svg('Coruja', ['#C9A6FF', '#4B2A8C'],
    `<path d="M32 40 L40 22 L48 38Z M88 40 L80 22 L72 38Z" fill="#7A4A26"/>` +
    `<ellipse cx="60" cy="70" rx="32" ry="38" fill="url(#pena)"/>` +
    `<ellipse cx="60" cy="88" rx="18" ry="20" fill="#E8C9A0"/>` +
    [0, 1, 2].map(i => `<path d="M${50 + i * 10} ${82 + (i % 2) * 4} q5 5 10 0" stroke="#B88A5A" stroke-width="2" fill="none"/>`).join('') +
    `<circle cx="46" cy="56" r="14" fill="#FFF1D6"/><circle cx="74" cy="56" r="14" fill="#FFF1D6"/>` +
    `<circle cx="46" cy="57" r="9" fill="#FFB020"/><circle cx="74" cy="57" r="9" fill="#FFB020"/>` +
    `<circle cx="46" cy="57" r="5.5" fill="#120B05"/><circle cx="74" cy="57" r="5.5" fill="#120B05"/>` +
    `<circle cx="44" cy="54.5" r="2" fill="#FFFFFF"/><circle cx="72" cy="54.5" r="2" fill="#FFFFFF"/>` +
    `<path d="M55 66 L65 66 L60 75Z" fill="#F08A24"/>` +
    `<path d="M40 104 h40" stroke="#5A3A1A" stroke-width="5" stroke-linecap="round"/>`,
    grad('pena', '#A0703F', '#6B4321')),

  Raposa: () => svg('Raposa', ['#FFD08A', '#B4461E'],
    `<path d="M28 52 L32 18 L52 40Z" fill="#E8641E"/><path d="M33 44 L35 26 L46 40Z" fill="#3B1F0A"/>` +
    `<path d="M92 52 L88 18 L68 40Z" fill="#E8641E"/><path d="M87 44 L85 26 L74 40Z" fill="#3B1F0A"/>` +
    `<path d="M26 56 Q30 34 60 34 Q90 34 94 56 Q92 80 60 98 Q28 80 26 56Z" fill="url(#raposa)"/>` +
    `<path d="M30 62 Q46 68 60 98 Q74 68 90 62 Q84 84 60 98 Q36 84 30 62Z" fill="#FFF3E2"/>` +
    olhos(48, 72, 58, '#7A4A12') +
    `<ellipse cx="60" cy="84" rx="5" ry="3.6" fill="#21303B"/>` +
    `<path d="M60 87 L60 90 M60 90 Q56 94 53 91 M60 90 Q64 94 67 91" stroke="#21303B" stroke-width="2.2" fill="none" stroke-linecap="round"/>` +
    bochechas(74),
    grad('raposa', '#FF8A3D', '#D9541A')),

  Dinossauro: () => svg('Dinossauro', ['#C8F59A', '#3C8C2A'],
    [26, 38, 50, 62].map((x, i) => `<path d="M${x} ${44 - i * 4} l7 -12 l7 12Z" fill="#FF8A3D"/>`).join('') +
    `<path d="M20 70 Q20 36 58 34 Q96 34 100 62 Q102 86 70 92 L40 92 Q20 88 20 70Z" fill="url(#dino)"/>` +
    `<path d="M50 80 Q74 92 98 72 Q96 88 70 94 Q56 94 50 80Z" fill="#A6E07A"/>` +
    olhos(58, 80, 56, '#2E6B1A', 1.05) +
    `<circle cx="90" cy="66" r="1.8" fill="#1F4A12"/><circle cx="96" cy="64" r="1.8" fill="#1F4A12"/>` +
    `<path d="M62 78 Q76 86 92 76" stroke="#1F4A12" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
    `<path d="M70 79 l2 4 2 -3.4 M80 80 l2 4 2 -4" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="1.6"/>` +
    `<ellipse cx="66" cy="70" rx="5" ry="3" fill="#FF7B7B" opacity="0.35"/>` +
    `<path d="M36 98 q4 10 12 0 M60 98 q4 10 12 0" fill="#5FB33E"/>`,
    grad('dino', '#7BD650', '#3E9A2A')),

  Fenix: () => svg('Fênix', ['#FFB36B', '#8C1E1E'],
    `<path d="M60 108 Q30 96 20 64 Q36 76 42 72 Q30 56 34 36 Q46 54 52 56 Q50 38 60 22 Q70 38 68 56 Q74 54 86 36 Q90 56 78 72 Q84 76 100 64 Q90 96 60 108Z" fill="url(#fogo)"/>` +
    `<path d="M60 100 Q44 92 40 72 Q50 80 54 76 Q50 60 60 46 Q70 60 66 76 Q70 80 80 72 Q76 92 60 100Z" fill="#FFE14D" opacity="0.9"/>` +
    `<ellipse cx="60" cy="70" rx="16" ry="18" fill="#FF7A1A"/>` +
    olhos(53, 67, 66, '#7A1E00', 0.85) +
    `<path d="M56 75 L64 75 L60 82Z" fill="#FFC63B"/>` +
    bochechas(74),
    grad('fogo', '#FFD23F', '#E0343B')),

  Foguete: () => svg('Foguete', ['#5B6BFF', '#120B3D'],
    [[20, 30], [96, 26], [28, 86], [98, 80], [14, 60]].map(([x, y]) => `<path d="M${x} ${y} l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5Z" fill="#FFE14D"/>`).join('') +
    `<g transform="rotate(35 60 60)">` +
    `<path d="M60 12 Q78 30 76 72 L44 72 Q42 30 60 12Z" fill="url(#casco)"/>` +
    `<path d="M60 12 Q70 22 72 34 L48 34 Q50 22 60 12Z" fill="#E0343B"/>` +
    `<circle cx="60" cy="48" r="9" fill="#8ED8FF" stroke="#FFFDF6" stroke-width="3"/><circle cx="57" cy="45" r="3" fill="#FFFFFF" opacity="0.8"/>` +
    `<path d="M44 60 L32 78 L44 74Z M76 60 L88 78 L76 74Z" fill="#E0343B"/>` +
    `<path d="M48 72 Q60 104 72 72Z" fill="#FFB020"/><path d="M53 72 Q60 92 67 72Z" fill="#FFE14D"/>` +
    `</g>`,
    grad('casco', '#FFFFFF', '#C9D3DD', false)),

  Astronauta: () => {
    const defs = grad('pele', '#E8B98C', '#D9A273') + grad('visor', '#2A3A8C', '#0B1240');
    return svg('Astronauta', ['#7A5BFF', '#160B3D'],
      [[18, 24], [100, 30], [22, 92]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="#FFFFFF"/>`).join('') +
      `<path d="M16 124 Q18 92 42 88 L78 88 Q102 92 104 124Z" fill="#E9EEF3"/>` +
      `<rect x="50" y="98" width="20" height="12" rx="3" fill="#3A5FCD"/><circle cx="55" cy="104" r="2" fill="#E0343B"/><circle cx="65" cy="104" r="2" fill="#FFE14D"/>` +
      `<circle cx="60" cy="56" r="34" fill="#F4F7FA" stroke="#C9D3DD" stroke-width="3"/>` +
      `<ellipse cx="60" cy="58" rx="24" ry="22" fill="url(#visor)"/>` +
      `<ellipse cx="60" cy="60" rx="17" ry="17" fill="url(#pele)"/>` +
      olhos(53, 67, 58, '#3B2A1A', 0.8) + bochechas(66) + sorriso(68, 6) +
      `<path d="M42 46 Q48 38 58 38" stroke="#FFFFFF" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.65"/>` +
      `<circle cx="94" cy="56" r="4" fill="#E0343B"/>`, defs);
  },

  Pirata: () => jogador('Pirata', ['#5ED1D9', '#0E4F6B'], '#D9A273', '#E0343B', '#FFFDF6', '',
    {
      sobrancelha: '#3A2414',
      cabelo: `<path d="M30 44 Q60 14 90 44 Q60 36 30 44Z" fill="#21303B"/>` +
        `<path d="M24 46 Q60 30 96 46 L92 50 Q60 38 28 50Z" fill="#3B3B46"/>` +
        `<circle cx="60" cy="31" r="5" fill="#FFFDF6"/><path d="M57 37 l6 0 M56 30 l2 2 M64 30 l-2 2" stroke="#21303B" stroke-width="1.4"/>` +
        `<ellipse cx="70" cy="58" rx="8" ry="7" fill="#1A1A1A"/><path d="M38 48 L78 58 M78 58 L86 52" stroke="#1A1A1A" stroke-width="2.4"/>` +
        `<circle cx="84" cy="66" r="3" fill="none" stroke="#FFC63B" stroke-width="2"/>`
    }),

  Trovao: () => svg('Trovão', ['#6BA6FF', '#1A2A6B'],
    `<path d="M24 64 Q18 46 36 42 Q40 26 58 30 Q72 18 84 34 Q102 34 98 54 Q106 70 88 74 L34 74 Q20 74 24 64Z" fill="url(#nuvem)"/>` +
    olhos(48, 70, 54, '#1A2A4A', 0.95) + bochechas(62) +
    `<path d="M52 62 Q60 68 68 62" stroke="#1A2A4A" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
    `<path d="M62 72 L48 96 L60 94 L52 116 L76 86 L63 88 L70 72Z" fill="#FFE14D" stroke="#E8AC1D" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M30 84 l-6 10 M94 80 l6 12" stroke="#8ED8FF" stroke-width="3" stroke-linecap="round"/>`,
    grad('nuvem', '#FFFFFF', '#C8D6EA')),

  Dourado: () => svg('Dourado', ['#FFF0A8', '#B7790A'],
    `<path d="M38 30 L82 30 Q84 66 60 74 Q36 66 38 30Z" fill="url(#ouro)"/>` +
    `<path d="M38 36 Q22 36 24 50 Q26 62 42 60" stroke="#E8AC1D" stroke-width="5" fill="none"/>` +
    `<path d="M82 36 Q98 36 96 50 Q94 62 78 60" stroke="#E8AC1D" stroke-width="5" fill="none"/>` +
    `<rect x="54" y="72" width="12" height="14" fill="#E8AC1D"/><rect x="40" y="86" width="40" height="12" rx="4" fill="#8A5A00"/>` +
    `<rect x="46" y="98" width="28" height="6" rx="3" fill="#6B4300"/>` +
    olhos(51, 69, 46, '#6B3E12', 0.85) + bochechas(55) + sorriso(57, 6, '#7A3E00') +
    `<path d="M44 34 Q46 54 52 62" stroke="#FFFFFF" stroke-width="3" fill="none" opacity="0.55" stroke-linecap="round"/>` +
    [[24, 26], [96, 22], [100, 84], [18, 80]].map(([x, y]) => `<path d="M${x} ${y} l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5Z" fill="#FFFFFF"/>`).join(''),
    grad('ouro', '#FFE066', '#E8AC1D'))
};

fs.mkdirSync(PASTA, { recursive: true });
let total = 0;
Object.keys(AVATARES).forEach(seed => {
  const conteudo = AVATARES[seed]();
  fs.writeFileSync(path.join(PASTA, seed + '.svg'), conteudo, 'utf8');
  total += conteudo.length;
  console.log(seed.padEnd(12), conteudo.length + ' bytes');
});
console.log('Total:', Object.keys(AVATARES).length, 'avatares,', Math.round(total / 1024), 'KB');
