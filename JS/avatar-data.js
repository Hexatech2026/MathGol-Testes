// avatar-data.js - avatares usando EXCLUSIVAMENTE a biblioteca pixel-art
// do DiceBear (https://api.dicebear.com/9.x/pixel-art/svg).
// Cada seed gera um rosto diferente.
//
// v1.5: lista REDUZIDA (antes eram 48 rostos em 6 abas). Agora a criança
// começa com 6 avatares grátis e libera os outros na Loja com Cruzeiros.
// `nome` é o texto mostrado/lido pelo leitor de tela; `seed` é o que vai
// para a URL do DiceBear (e para o perfil salvo).

var ESTILO_AVATAR = 'pixel-art';

// Grátis desde o início.
var AVATARES_GRATIS = [
  { seed: 'Pele',     nome: 'Craque' },
  { seed: 'Marta',    nome: 'Craque Rainha' },
  { seed: 'Tigre',    nome: 'Tigre' },
  { seed: 'Foguete',  nome: 'Foguete' },
  { seed: 'Numero10', nome: 'Camisa 10' },
  { seed: 'Azul',     nome: 'Azulão' }
];

// Vendidos na Loja (aba "Avatares").
var AVATARES_LOJA = [
  { seed: 'Ronaldinho', nome: 'Bruxo',       preco: 80 },
  { seed: 'Kaka',       nome: 'Maestro',     preco: 80 },
  { seed: 'Leao',       nome: 'Leão',        preco: 80 },
  { seed: 'Panda',      nome: 'Panda',       preco: 80 },
  { seed: 'Coruja',     nome: 'Coruja',      preco: 80 },
  { seed: 'Raposa',     nome: 'Raposa',      preco: 80 },
  { seed: 'Trovao',     nome: 'Trovão',      preco: 100 },
  { seed: 'Fenix',      nome: 'Fênix',       preco: 100 },
  { seed: 'Astronauta', nome: 'Astronauta',  preco: 100 },
  { seed: 'Pirata',     nome: 'Pirata',      preco: 100 },
  { seed: 'Dinossauro', nome: 'Dinossauro',  preco: 100 },
  { seed: 'Dourado',    nome: 'Dourado',     preco: 120 }
];

var AVATAR_PADRAO = { seed: 'Pele' };

// Todas as seeds validas (pra validacao)
var SEEDS_PERMITIDAS = AVATARES_GRATIS.concat(AVATARES_LOJA).map(function(a) { return a.seed; });

function nomeDoAvatar(seed) {
  var todos = AVATARES_GRATIS.concat(AVATARES_LOJA);
  for (var i = 0; i < todos.length; i++) if (todos[i].seed === seed) return todos[i].nome;
  return seed;
}
