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

// ---------- Validacao das configuracoes remotas (Firestore) ----------
// Tudo que vem do Firestore e tratado como dado NAO confiavel: cada item e
// validado campo a campo (formato, tamanho, lista permitida) e so entra no
// jogo se passar. Os componentes da tela sao montados com createElement +
// textContent (main.js), nunca concatenando texto remoto em HTML.

var ID_VALIDO = /^[a-z0-9_-]{1,32}$/;
var COR_VALIDA = /^#[0-9a-fA-F]{6}$/;
// Codigos da flagcdn: ISO 3166-1 alfa-2 (br, ar...) ou subdivisoes do
// Reino Unido (gb-eng, gb-sct, gb-wls, gb-nir).
var BANDEIRA_VALIDA = /^(?:[a-z]{2}|gb-(?:eng|sct|wls|nir))$/;
// Dificuldades que o jogo realmente sabe gerar (banco-questoes/progressao).
var IDS_DIFICULDADE_CONHECIDOS = ['facil', 'medio', 'dificil'];

function codigoBandeiraValido(codigo) {
  return typeof codigo === 'string' && BANDEIRA_VALIDA.test(codigo);
}

function textoValido(v, max) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max &&
    !/[<>\u0000-\u001f]/.test(v);
}

function validarPalavra(v) {
  return textoValido(v, 20) ? v.trim() : null;
}

function validarSelecao(s) {
  if (!s || typeof s !== 'object') return null;
  if (typeof s.id !== 'string' || !ID_VALIDO.test(s.id)) return null;
  if (!textoValido(s.nome, 30)) return null;
  var sel = { id: s.id, nome: s.nome.trim() };
  if (s.bandeira !== undefined) {
    if (!codigoBandeiraValido(s.bandeira)) return null;
    sel.bandeira = s.bandeira;
  }
  if (s.corPrimaria !== undefined) {
    if (typeof s.corPrimaria !== 'string' || !COR_VALIDA.test(s.corPrimaria)) return null;
    sel.corPrimaria = s.corPrimaria;
  }
  if (s.corSecundaria !== undefined) {
    if (typeof s.corSecundaria !== 'string' || !COR_VALIDA.test(s.corSecundaria)) return null;
    sel.corSecundaria = s.corSecundaria;
  }
  return sel;
}

function validarDificuldade(d) {
  if (!d || typeof d !== 'object') return null;
  if (IDS_DIFICULDADE_CONHECIDOS.indexOf(d.id) === -1) return null;
  if (!textoValido(d.nome, 20) || !textoValido(d.descricao, 60) || !textoValido(d.icone, 12)) return null;
  return { id: d.id, nome: d.nome.trim(), descricao: d.descricao.trim(), icone: d.icone.trim() };
}

// Valida uma lista inteira: se QUALQUER item for invalido, a lista remota
// e descartada e o jogo fica com o padrao local (nao mistura parcial).
function validarLista(lista, validador) {
  if (!Array.isArray(lista) || lista.length === 0 || lista.length > 100) return null;
  var saida = [];
  var ids = {};
  for (var i = 0; i < lista.length; i++) {
    var item = validador(lista[i]);
    if (item === null) return null;
    var chave = typeof item === 'string' ? item : item.id;
    if (ids[chave]) return null; // duplicado
    ids[chave] = true;
    saida.push(item);
  }
  return saida;
}

function aplicarConfiguracoesRemotas(config) {
  if (!config || typeof config !== 'object') return;
  // So aceita a lista remota se ela for valida E tiver pelo menos tantos
  // itens quanto a lista local (um Firestore desatualizado nao apaga
  // opcoes que ja existem no codigo).
  var personagens = validarLista(config.personagens, validarPalavra);
  var animais = validarLista(config.animais, validarPalavra);
  var selecoes = validarLista(config.selecoes, validarSelecao);
  var dificuldades = validarLista(config.dificuldades, validarDificuldade);
  if (personagens && personagens.length >= PERSONAGENS.length) PERSONAGENS = personagens;
  if (animais && animais.length >= ANIMAIS.length) ANIMAIS = animais;
  if (selecoes && selecoes.length >= SELECOES.length) SELECOES = selecoes;
  if (dificuldades && dificuldades.length >= DIFICULDADES.length) DIFICULDADES = dificuldades;
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

// Mensagens genericas (sem numero fixo) para fases com 5 ou 7 cobrancas.
// As de MENSAGENS_RESULTADO citam "tres" e so valem para 3 cobrancas.
const MENSAGENS_RESULTADO_GERAIS = {
  zero: MENSAGENS_RESULTADO[0],
  poucos: [
    'Bom comeco! Voce ja balancou a rede, bora buscar mais!',
    'Ja ta no caminho certo! Mais uma rodada e voce arrebenta!'
  ],
  quase: [
    'Muito bem! Mais da metade das cobrancas viraram gol!',
    'Show! Falta pouco pra fase perfeita!'
  ],
  perfeito: [
    'FASE PERFEITA! Voce e o Craque das Contas!',
    'Nenhuma cobranca perdida! Ninguem segura voce!'
  ]
};

function sortearMensagemResultado(gols, totalCobrancas) {
  var total = totalCobrancas || 3;
  var lista;
  if (total === 3) {
    lista = MENSAGENS_RESULTADO[gols] || MENSAGENS_RESULTADO[0];
  } else if (gols <= 0) {
    lista = MENSAGENS_RESULTADO_GERAIS.zero;
  } else if (gols >= total) {
    lista = MENSAGENS_RESULTADO_GERAIS.perfeito;
  } else if (gols * 2 >= total) {
    lista = MENSAGENS_RESULTADO_GERAIS.quase;
  } else {
    lista = MENSAGENS_RESULTADO_GERAIS.poucos;
  }
  return lista[Math.floor(Math.random() * lista.length)];
}
