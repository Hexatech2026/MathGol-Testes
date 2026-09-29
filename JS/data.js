// data.js - listas fixas (fallback) para apelido, selecoes, dificuldades.
// A crianca ESCOLHE um personagem + um animal pra montar o apelido (nao
// digita nada). Listas podem vir do Firestore via carregarConfiguracoes().

let PERSONAGENS = [
  'Capitao', 'Fera', 'Relampago', 'Craque', 'Foguete',
  'Furacao', 'Campeao', 'Guerreiro', 'Fenomeno', 'Trovao',
  'Meteoro', 'Torpedo', 'Escudo', 'Cometa', 'Raio',
  'Capita', 'Estrela', 'Campea', 'Guerreira', 'Fenix',
  'Centelha', 'Valente', 'Coragem', 'Vitoria', 'Aurora',
  'Heroina', 'Lenda', 'Chama', 'Brilho', 'Medalha'
];

let ANIMAIS = [
  'Tigre', 'Aguia', 'Onca', 'Leao', 'Gaviao',
  'Puma', 'Lobo', 'Falcao', 'Pantera', 'Tubarao',
  'Golfinho', 'Coruja', 'Raposa', 'Jaguar', 'Fenix',
  'Coelho', 'Lince', 'Arara', 'Borboleta', 'Flamingo'
];

let SELECOES = [
  { id: 'brasil',     nome: 'Brasil',     bandeira: 'br',     corPrimaria: '#2E9E5B', corSecundaria: '#FFC63B' },
  { id: 'argentina',  nome: 'Argentina',  bandeira: 'ar',     corPrimaria: '#6EC1E4', corSecundaria: '#FFFDF6' },
  { id: 'alemanha',   nome: 'Alemanha',   bandeira: 'de',     corPrimaria: '#21303B', corSecundaria: '#E0343B' },
  { id: 'franca',     nome: 'Franca',     bandeira: 'fr',     corPrimaria: '#3A5FCD', corSecundaria: '#E0343B' },
  { id: 'japao',      nome: 'Japao',      bandeira: 'jp',     corPrimaria: '#FFFDF6', corSecundaria: '#E0343B' },
  { id: 'portugal',   nome: 'Portugal',   bandeira: 'pt',     corPrimaria: '#2E9E5B', corSecundaria: '#E0343B' },
  { id: 'espanha',    nome: 'Espanha',    bandeira: 'es',     corPrimaria: '#E0343B', corSecundaria: '#FFC63B' },
  { id: 'italia',     nome: 'Italia',     bandeira: 'it',     corPrimaria: '#3A5FCD', corSecundaria: '#FFFDF6' },
  { id: 'inglaterra', nome: 'Inglaterra', bandeira: 'gb-eng', corPrimaria: '#FFFDF6', corSecundaria: '#E0343B' },
  { id: 'colombia',   nome: 'Colombia',   bandeira: 'co',     corPrimaria: '#FFC63B', corSecundaria: '#3A5FCD' },
  { id: 'mexico',     nome: 'Mexico',     bandeira: 'mx',     corPrimaria: '#2E9E5B', corSecundaria: '#FFFDF6' },
  { id: 'coreia',     nome: 'Coreia',     bandeira: 'kr',     corPrimaria: '#E0343B', corSecundaria: '#3A5FCD' }
];

let DIFICULDADES = [
  { id: 'facil',   nome: 'Facil',   descricao: '+ e - ate 10',        icone: '1' },
  { id: 'medio',   nome: 'Medio',   descricao: '+ - ate 20 e tabuada', icone: '2' },
  { id: 'dificil', nome: 'Dificil', descricao: 'x e /',                icone: '3' }
];

function aplicarConfiguracoesRemotas(config) {
  if (!config) return;
  // So aceita a lista remota se ela tiver pelo menos tantos itens quanto a
  // lista local. Evita que um Firestore desatualizado/parcial (ex.: seed
  // antigo, com menos paises do que o jogo tem hoje) apague opcoes que ja
  // existem no codigo — a lista so cresce/atualiza, nunca encolhe por causa
  // de dados remotos incompletos.
  if (Array.isArray(config.personagens) && config.personagens.length >= PERSONAGENS.length) PERSONAGENS = config.personagens;
  if (Array.isArray(config.animais) && config.animais.length >= ANIMAIS.length) ANIMAIS = config.animais;
  if (Array.isArray(config.selecoes) && config.selecoes.length >= SELECOES.length) SELECOES = config.selecoes;
  if (Array.isArray(config.dificuldades) && config.dificuldades.length >= DIFICULDADES.length) DIFICULDADES = config.dificuldades;
}

const MENSAGENS_RESULTADO = {
  0: [
    'Valeu por jogar! Bora treinar mais e voltar pra fazer gol!',
    'Hoje o goleiro tava inspirado! Tenta de novo, voce consegue!',
    'Nao desiste! Cada tentativa te deixa mais craque!',
    'O importante e tentar! Vamos de novo?'
  ],
  1: [
    'Bom comeco! Voce ja fez um gol, bora buscar mais!',
    'Um gol e so o aquecimento! Tenta de novo pra fazer mais!',
    'Ja ta no caminho certo! Mais uma rodada e voce arrebenta!',
    'Boa! Um gol ja e vitoria! Quer tentar fazer dois agora?'
  ],
  2: [
    'Quase perfeito! Faltou so um golzinho! Tenta de novo!',
    'Dois gols! Ta quase la, falta so um pra fase perfeita!',
    'Impressionante! Mais uma tentativa e voce fecha com 3!',
    'Show! Dois de tres! Bora buscar a fase perfeita?'
  ],
  3: [
    'FASE PERFEITA! Voce e o Craque das Contas!',
    'Tres de tres! Ninguem segura voce! Bora pro proximo desafio!',
    'Perfeito! Acho que esse nivel ta facil demais pra voce!',
    'Goleada! Manda bem assim no proximo nivel tambem!',
    'Hat-trick de contas certas! Voce e fera demais!'
  ]
};

function sortearMensagemResultado(gols) {
  var lista = MENSAGENS_RESULTADO[gols] || MENSAGENS_RESULTADO[0];
  return lista[Math.floor(Math.random() * lista.length)];
}
