// bordas.js — molduras (bordas) do avatar.
//
// Cada borda e so uma classe CSS ("borda-<id>", em CSS/tema-v2.css) aplicada
// numa moldura redonda em volta da imagem do avatar. Nada de imagem nova:
// carrega instantaneo e funciona sem internet.
//
// Como a crianca ganha cada borda:
//   - gratis desde o inicio;
//   - comprada na Loja (aba "Bordas"), id na carteira = "borda:<id>";
//   - premio de uma conquista (conquistas.js).
//
// O id da borda escolhida mora no perfil local (conta.js) e vai junto no
// estado da nuvem. Id desconhecido (backup antigo, item removido) volta
// para a borda padrao em vez de quebrar a tela.

var BORDAS = [
  { id: 'simples',   nome: 'Clássica',      origem: 'gratis' },
  { id: 'grama',     nome: 'Gramado',       origem: 'gratis' },
  { id: 'ceu',       nome: 'Céu Azul',      origem: 'gratis' },
  { id: 'ouro',      nome: 'Ouro',          origem: 'loja', preco: 60 },
  { id: 'gelo',      nome: 'Gelo',          origem: 'loja', preco: 120 },
  { id: 'arco-iris', nome: 'Arco-íris',     origem: 'loja', preco: 150, animada: true },
  { id: 'fogo',      nome: 'Fogo',          origem: 'loja', preco: 150, animada: true },
  { id: 'neon',      nome: 'Neon',          origem: 'loja', preco: 180, animada: true },
  { id: 'galaxia',   nome: 'Galáxia',       origem: 'loja', preco: 220, animada: true },
  { id: 'estrela',   nome: 'Estrela',       origem: 'conquista', conquista: 'primeiro-gol' },
  { id: 'raio',      nome: 'Relâmpago',     origem: 'conquista', conquista: 'relampago', animada: true },
  { id: 'coroa',     nome: 'Coroa',         origem: 'conquista', conquista: 'gols-50' },
  { id: 'trofeu',    nome: 'Campeão',       origem: 'conquista', conquista: 'campeao', animada: true }
];

var BORDA_PADRAO = 'simples';

function bordaPorId(id) {
  for (var i = 0; i < BORDAS.length; i++) if (BORDAS[i].id === id) return BORDAS[i];
  return null;
}

// A crianca pode usar esta borda agora?
function bordaDisponivel(borda) {
  if (!borda) return false;
  if (borda.origem === 'gratis') return true;
  if (borda.origem === 'loja') return typeof Carteira !== 'undefined' && Carteira.possui('borda:' + borda.id);
  if (borda.origem === 'conquista') return typeof Conquistas !== 'undefined' && Conquistas.feita(borda.conquista);
  return false;
}

// Texto curto de "como ganhar" para bordas ainda bloqueadas.
function comoGanharBorda(borda) {
  if (borda.origem === 'loja') return 'Na Loja';
  if (borda.origem === 'conquista' && typeof Conquistas !== 'undefined') {
    var c = Conquistas.porId(borda.conquista);
    return c ? 'Conquista: ' + c.nome : 'Conquista';
  }
  return '';
}

// Avatar dentro da moldura. tamanho: 'p' (topo), 'm' (grades), 'g' (perfil).
// Montado com createElement (nada de innerHTML).
function criarAvatarComBorda(seed, bordaId, tamanho) {
  var borda = bordaPorId(bordaId) || bordaPorId(BORDA_PADRAO);
  var moldura = document.createElement('span');
  moldura.className = 'moldura-avatar moldura-' + (tamanho || 'm') + ' borda-' + borda.id;
  var img = document.createElement('img');
  img.className = 'moldura-avatar-img';
  img.alt = '';
  img.decoding = 'async';
  img.src = gerarUrlAvatar(seed);
  img.onerror = function() { this.onerror = null; this.src = gerarAvatarFallbackLocal(seed); };
  moldura.appendChild(img);
  return moldura;
}
