// avatar-data.js - avatares usando EXCLUSIVAMENTE a biblioteca pixel-art
// do DiceBear (https://api.dicebear.com/9.x/pixel-art/svg).
// Cada seed gera um rosto diferente. Organizados por categorias tematicas
// pra facilitar a navegacao da crianca, mas TODOS usam pixel-art.

var ESTILO_AVATAR = 'pixel-art';

var CATEGORIAS_AVATAR = [
  {
    id: 'craques',
    nome: 'Craques',
    seeds: ['Neymar','Messi','Ronaldo','Marta','Zidane','Pele','Ronaldinho','Kaka']
  },
  {
    id: 'bichos',
    nome: 'Bichos',
    seeds: ['Tigre','Aguia','Onca','Leao','Golfinho','Coruja','Raposa','Panda']
  },
  {
    id: 'herois',
    nome: 'Herois',
    seeds: ['Flash','Trovao','Raio','Escudo','Fenix','Cometa','Estrela','Meteoro']
  },
  {
    id: 'diversao',
    nome: 'Diversao',
    seeds: ['Pizza','Foguete','Arcoiris','Sorvete','Dinossauro','Unicornio','Pirata','Astronauta']
  },
  {
    id: 'numeros',
    nome: 'Numeros',
    seeds: ['Numero7','Numero10','Numero9','Numero1','Numero11','Numero5','Numero3','Numero8']
  },
  {
    id: 'cores',
    nome: 'Cores',
    seeds: ['Azul','Verde','Amarelo','Vermelho','Roxo','Laranja','Rosa','Dourado']
  }
];

var AVATAR_PADRAO = { seed: 'Pele' };

// Todas as seeds validas (pra validacao)
var SEEDS_PERMITIDAS = [];
CATEGORIAS_AVATAR.forEach(function(cat) {
  cat.seeds.forEach(function(s) {
    if (SEEDS_PERMITIDAS.indexOf(s) === -1) SEEDS_PERMITIDAS.push(s);
  });
});
