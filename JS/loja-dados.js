// loja-dados.js — catálogo da loja: o que é grátis, o que se compra e por quanto.
//
// Moeda do jogo: CRUZEIROS (o mesmo ícone de estrela que já aparecia no placar).
// A criança ganha Cruzeiros jogando e gasta aqui.
//
// ATENÇÃO aos escudos dos clubes: os escudos oficiais são marca registrada dos
// times. Este arquivo guarda apenas as CORES e a SIGLA de cada clube; o escudo
// em si é desenhado por nós em SVG (ver escudo() em loja.js) — forma autoral,
// nenhuma arte de terceiro é reproduzida ou baixada.

// ---------- Preços (em Cruzeiros) ----------
//
// Calibragem: uma fase completa rende por volta de 120 a 180 Cruzeiros
// (ver PONTOS_POR_GOL em main.js). Então:
//   personagem/animal ~ meia fase · avatar ~ meia fase · seleção ~ 1 fase
//   clube ~ 1 fase e meia
// Todos os clubes custam o MESMO de propósito: preço diferente por time vira
// discussão de "meu time vale menos" na sala de aula.
var PRECOS = {
  personagem: 50,
  animal: 50,
  avatar: 75,
  selecao: 150,
  clube: 200
};

// ---------- O que nasce liberado ----------
//
// Tudo que não estiver nestas listas precisa ser comprado.
var LIBERADO_DE_INICIO = {
  selecoes:    ['brasil', 'argentina'],
  personagens: ['Capitao', 'Fera', 'Craque', 'Estrela', 'Campea', 'Valente'],
  animais:     ['Tigre', 'Aguia', 'Leao', 'Coruja', 'Raposa'],
  // Uma categoria inteira de avatares (8 seeds) — ver avatar-data.js
  avatares:    ['Neymar', 'Messi', 'Ronaldo', 'Marta', 'Zidane', 'Pele', 'Ronaldinho', 'Kaka']
};

// ---------- Clubes do Brasileirão Série A 2026 ----------
//
// Os 20 participantes da temporada 2026 (subiram da Série B 2025: Coritiba,
// Athletico Paranaense, Chapecoense e Remo).
//
// corPrimaria / corSecundaria alimentam a camisa do batedor na cena 3D, do
// mesmo jeito que as seleções já faziam. sigla é o texto do escudo.
var CLUBES_BRASILEIRAO = [
  { id: 'athletico-pr',  nome: 'Athletico-PR',  sigla: 'CAP', uf: 'PR', corPrimaria: '#E30613', corSecundaria: '#101010' },
  { id: 'atletico-mg',   nome: 'Atlético-MG',   sigla: 'CAM', uf: 'MG', corPrimaria: '#101010', corSecundaria: '#FFFDF6' },
  { id: 'bahia',         nome: 'Bahia',         sigla: 'BAH', uf: 'BA', corPrimaria: '#1D63B4', corSecundaria: '#E0343B' },
  { id: 'botafogo',      nome: 'Botafogo',      sigla: 'BOT', uf: 'RJ', corPrimaria: '#101010', corSecundaria: '#FFFDF6' },
  { id: 'chapecoense',   nome: 'Chapecoense',   sigla: 'CHA', uf: 'SC', corPrimaria: '#12793D', corSecundaria: '#FFFDF6' },
  { id: 'corinthians',   nome: 'Corinthians',   sigla: 'COR', uf: 'SP', corPrimaria: '#101010', corSecundaria: '#FFFDF6' },
  { id: 'coritiba',      nome: 'Coritiba',      sigla: 'CFC', uf: 'PR', corPrimaria: '#0B6B3A', corSecundaria: '#FFFDF6' },
  { id: 'cruzeiro',      nome: 'Cruzeiro',      sigla: 'CRU', uf: 'MG', corPrimaria: '#1E4B9C', corSecundaria: '#FFFDF6' },
  { id: 'flamengo',      nome: 'Flamengo',      sigla: 'FLA', uf: 'RJ', corPrimaria: '#E0343B', corSecundaria: '#101010' },
  { id: 'fluminense',    nome: 'Fluminense',    sigla: 'FLU', uf: 'RJ', corPrimaria: '#7A1C38', corSecundaria: '#0F6B3C' },
  { id: 'gremio',        nome: 'Grêmio',        sigla: 'GRE', uf: 'RS', corPrimaria: '#3A7BD5', corSecundaria: '#101010' },
  { id: 'internacional', nome: 'Internacional', sigla: 'INT', uf: 'RS', corPrimaria: '#E0343B', corSecundaria: '#FFFDF6' },
  { id: 'mirassol',      nome: 'Mirassol',      sigla: 'MIR', uf: 'SP', corPrimaria: '#FFC63B', corSecundaria: '#12793D' },
  { id: 'palmeiras',     nome: 'Palmeiras',     sigla: 'PAL', uf: 'SP', corPrimaria: '#0B7A3E', corSecundaria: '#FFFDF6' },
  { id: 'bragantino',    nome: 'Bragantino',    sigla: 'RBB', uf: 'SP', corPrimaria: '#FFFDF6', corSecundaria: '#E0343B' },
  { id: 'remo',          nome: 'Remo',          sigla: 'REM', uf: 'PA', corPrimaria: '#1B3C8C', corSecundaria: '#FFFDF6' },
  { id: 'santos',        nome: 'Santos',        sigla: 'SAN', uf: 'SP', corPrimaria: '#FFFDF6', corSecundaria: '#101010' },
  { id: 'sao-paulo',     nome: 'São Paulo',     sigla: 'SAO', uf: 'SP', corPrimaria: '#FFFDF6', corSecundaria: '#E0343B' },
  { id: 'vasco',         nome: 'Vasco',         sigla: 'VAS', uf: 'RJ', corPrimaria: '#101010', corSecundaria: '#FFFDF6' },
  { id: 'vitoria',       nome: 'Vitória',       sigla: 'VIT', uf: 'BA', corPrimaria: '#E0343B', corSecundaria: '#101010' }
];

// ---------- Helpers ----------

function estaLiberadoDeInicio(tipo, id) {
  var lista = LIBERADO_DE_INICIO[tipo];
  return !!lista && lista.indexOf(id) !== -1;
}

// Preço de um item pelo tipo. Item desconhecido nunca sai de graça por engano.
function precoDoItem(tipo) {
  return PRECOS[tipo] !== undefined ? PRECOS[tipo] : Infinity;
}

// Chave usada para guardar a compra. Prefixada pelo tipo pra um avatar
// chamado "Estrela" não colidir com o personagem "Estrela".
function chaveItem(tipo, id) {
  return tipo + ':' + id;
}
