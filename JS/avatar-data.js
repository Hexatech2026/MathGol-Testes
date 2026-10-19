// avatar-data.js - avatares ORIGINAIS da equipe, em SVG, servidos junto com
// o jogo a partir de Imagens/avatares/<seed>.svg.
//
// Antes os rostos vinham da api.dicebear.com. Saiu por tres motivos:
//   1. era uma requisicao a um dominio de terceiro feita pelo navegador da
//      crianca (apontamento SEC-05 de LGPD do relatorio da Sprint 3);
//   2. demorava mais de 6 segundos para desenhar numa conexao boa, e o jogo
//      nao abre direito se a CDN travar (cartao R02 do quadro);
//   3. a biblioteca sorteava um ROSTO HUMANO a partir da seed, entao o
//      avatar chamado "Tigre" nunca foi um tigre, "Leao" nunca foi um leao,
//      e assim por diante. Agora cada desenho e o que o nome diz.
//
// `seed` continua sendo a MESMA de antes de proposito: e o que esta gravado
// nos perfis salvos (localStorage e Firestore). Trocar a seed apagaria o
// avatar escolhido de quem ja joga. `seed` tambem e o nome do arquivo.
// `nome` e o texto mostrado e lido pelo leitor de tela.

var PASTA_AVATARES = '../Imagens/avatares/';

// Gratis desde o inicio.
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
