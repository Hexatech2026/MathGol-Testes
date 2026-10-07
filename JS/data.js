// data.js - listas fixas (fallback) para apelido, seleções, dificuldades.
// Textos visíveis sempre com acentuação correta (DEF-22).
// A crianca ESCOLHE um personagem + um animal pra montar o apelido (nao
// digita nada). Listas podem vir do Firestore via carregarConfiguracoes().

// ---------- Nomes do craque (apelido = personagem + animal) ----------
// v1.5: listas REDUZIDAS. A criança começa com poucas opções grátis e
// libera as outras na Loja, gastando Cruzeiros (ver JS/carteira.js).
// Cada palavra tem no máximo 20 caracteres (mesma regra da validação).
let PERSONAGENS = [
  'Capitão', 'Capitã', 'Craque', 'Fera',
  'Foguete', 'Estrela', 'Raio', 'Campeã'
];
// Vendidos na Loja (aba "Nomes").
let PERSONAGENS_LOJA = [
  'Relâmpago', 'Furacão', 'Fenômeno', 'Trovão',
  'Cometa', 'Guerreira', 'Lenda', 'Fênix'
];

let ANIMAIS = [
  'Tigre', 'Onça', 'Leão', 'Águia', 'Coruja', 'Golfinho'
];
let ANIMAIS_LOJA = [
  'Tubarão', 'Pantera', 'Falcão', 'Lobo', 'Arara', 'Jaguar'
];

// Preço (em Cruzeiros) de cada nome vendido na Loja.
var PRECO_NOME_LOJA = 60;

// ---------- Times ----------
// categoria: 'selecao' (bandeira da flagcdn) ou 'clube' (escudo genérico
// desenhado com as cores do time + sigla; NÃO usamos escudos oficiais).
// preco: 0 = grátis desde o início; > 0 = comprado na Loja.
// corPrimaria/corSecundaria pintam a camisa do batedor na cena 3D/2D.
let SELECOES = [
  // Grátis (seleções iniciais reduzidas para 4)
  { id: 'brasil',     categoria: 'selecao', preco: 0,   nome: 'Brasil',     bandeira: 'br',     corPrimaria: '#2E9E5B', corSecundaria: '#FFC63B' },
  { id: 'argentina',  categoria: 'selecao', preco: 0,   nome: 'Argentina',  bandeira: 'ar',     corPrimaria: '#6EC1E4', corSecundaria: '#FFFDF6' },
  { id: 'franca',     categoria: 'selecao', preco: 0,   nome: 'França',     bandeira: 'fr',     corPrimaria: '#3A5FCD', corSecundaria: '#E0343B' },
  { id: 'alemanha',   categoria: 'selecao', preco: 0,   nome: 'Alemanha',   bandeira: 'de',     corPrimaria: '#21303B', corSecundaria: '#E0343B' },
  // Seleções da Loja
  { id: 'portugal',   categoria: 'selecao', preco: 150, nome: 'Portugal',   bandeira: 'pt',     corPrimaria: '#C8102E', corSecundaria: '#2E9E5B' },
  { id: 'espanha',    categoria: 'selecao', preco: 150, nome: 'Espanha',    bandeira: 'es',     corPrimaria: '#E0343B', corSecundaria: '#FFC63B' },
  { id: 'italia',     categoria: 'selecao', preco: 150, nome: 'Itália',     bandeira: 'it',     corPrimaria: '#3A5FCD', corSecundaria: '#FFFDF6' },
  { id: 'inglaterra', categoria: 'selecao', preco: 150, nome: 'Inglaterra', bandeira: 'gb-eng', corPrimaria: '#FFFDF6', corSecundaria: '#E0343B' },
  { id: 'holanda',    categoria: 'selecao', preco: 150, nome: 'Holanda',    bandeira: 'nl',     corPrimaria: '#F36C21', corSecundaria: '#21303B' },
  { id: 'uruguai',    categoria: 'selecao', preco: 120, nome: 'Uruguai',    bandeira: 'uy',     corPrimaria: '#5CBFEB', corSecundaria: '#21303B' },
  { id: 'japao',      categoria: 'selecao', preco: 120, nome: 'Japão',      bandeira: 'jp',     corPrimaria: '#1B3C8C', corSecundaria: '#FFFDF6' },
  { id: 'marrocos',   categoria: 'selecao', preco: 120, nome: 'Marrocos',   bandeira: 'ma',     corPrimaria: '#C1272D', corSecundaria: '#006233' },
  { id: 'colombia',   categoria: 'selecao', preco: 120, nome: 'Colômbia',   bandeira: 'co',     corPrimaria: '#FFC63B', corSecundaria: '#3A5FCD' },
  { id: 'mexico',     categoria: 'selecao', preco: 120, nome: 'México',     bandeira: 'mx',     corPrimaria: '#2E9E5B', corSecundaria: '#FFFDF6' },
  { id: 'estados-unidos', categoria: 'selecao', preco: 120, nome: 'Estados Unidos', bandeira: 'us', corPrimaria: '#FFFDF6', corSecundaria: '#1B3C8C' },
  { id: 'coreia',     categoria: 'selecao', preco: 120, nome: 'Coreia',     bandeira: 'kr',     corPrimaria: '#E0343B', corSecundaria: '#3A5FCD' },

  // Brasileirão Série A 2026 (os 20 clubes da temporada). Todos na Loja.
  { id: 'athletico-pr',  categoria: 'clube', preco: 200, nome: 'Athletico-PR',  sigla: 'CAP', corPrimaria: '#C8102E', corSecundaria: '#111111' },
  { id: 'atletico-mg',   categoria: 'clube', preco: 200, nome: 'Atlético-MG',   sigla: 'CAM', corPrimaria: '#111111', corSecundaria: '#FFFFFF' },
  { id: 'bahia',         categoria: 'clube', preco: 200, nome: 'Bahia',         sigla: 'BAH', corPrimaria: '#0047AB', corSecundaria: '#E30613' },
  { id: 'botafogo',      categoria: 'clube', preco: 200, nome: 'Botafogo',      sigla: 'BOT', corPrimaria: '#111111', corSecundaria: '#FFFFFF' },
  { id: 'bragantino',    categoria: 'clube', preco: 200, nome: 'Bragantino',    sigla: 'RBB', corPrimaria: '#FFFFFF', corSecundaria: '#D2003C' },
  { id: 'chapecoense',   categoria: 'clube', preco: 200, nome: 'Chapecoense',   sigla: 'CHA', corPrimaria: '#00843D', corSecundaria: '#FFFFFF' },
  { id: 'corinthians',   categoria: 'clube', preco: 200, nome: 'Corinthians',   sigla: 'COR', corPrimaria: '#FFFFFF', corSecundaria: '#111111' },
  { id: 'coritiba',      categoria: 'clube', preco: 200, nome: 'Coritiba',      sigla: 'CFC', corPrimaria: '#00543C', corSecundaria: '#FFFFFF' },
  { id: 'cruzeiro',      categoria: 'clube', preco: 200, nome: 'Cruzeiro',      sigla: 'CRU', corPrimaria: '#0033A0', corSecundaria: '#FFFFFF' },
  { id: 'flamengo',      categoria: 'clube', preco: 200, nome: 'Flamengo',      sigla: 'FLA', corPrimaria: '#C8102E', corSecundaria: '#111111' },
  { id: 'fluminense',    categoria: 'clube', preco: 200, nome: 'Fluminense',    sigla: 'FLU', corPrimaria: '#7A1E3A', corSecundaria: '#00613C' },
  { id: 'gremio',        categoria: 'clube', preco: 200, nome: 'Grêmio',        sigla: 'GRE', corPrimaria: '#0D80BF', corSecundaria: '#111111' },
  { id: 'internacional', categoria: 'clube', preco: 200, nome: 'Internacional', sigla: 'INT', corPrimaria: '#E30613', corSecundaria: '#FFFFFF' },
  { id: 'mirassol',      categoria: 'clube', preco: 200, nome: 'Mirassol',      sigla: 'MIR', corPrimaria: '#FFD200', corSecundaria: '#00843D' },
  { id: 'palmeiras',     categoria: 'clube', preco: 200, nome: 'Palmeiras',     sigla: 'PAL', corPrimaria: '#006437', corSecundaria: '#FFFFFF' },
  { id: 'remo',          categoria: 'clube', preco: 200, nome: 'Remo',          sigla: 'REM', corPrimaria: '#0A1F5C', corSecundaria: '#FFFFFF' },
  { id: 'santos',        categoria: 'clube', preco: 200, nome: 'Santos',        sigla: 'SAN', corPrimaria: '#FFFFFF', corSecundaria: '#111111' },
  { id: 'sao-paulo',     categoria: 'clube', preco: 200, nome: 'São Paulo',     sigla: 'SAO', corPrimaria: '#FFFFFF', corSecundaria: '#E30613' },
  { id: 'vasco',         categoria: 'clube', preco: 200, nome: 'Vasco',         sigla: 'VAS', corPrimaria: '#111111', corSecundaria: '#FFFFFF' },
  { id: 'vitoria',       categoria: 'clube', preco: 200, nome: 'Vitória',       sigla: 'VIT', corPrimaria: '#E30613', corSecundaria: '#111111' }
];

let DIFICULDADES = [
  { id: 'facil',   nome: 'Fácil',   descricao: '+ e − até 10',         icone: '1' },
  { id: 'medio',   nome: 'Médio',   descricao: '+ − até 20 e tabuada', icone: '2' },
  { id: 'dificil', nome: 'Difícil', descricao: '× e ÷',                icone: '3' }
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
  // v1.5 (Loja): o CATÁLOGO (quais times/nomes existem, preço e categoria)
  // mora no código — senão um Firestore desatualizado traria de volta as
  // listas antigas e grandes, ou sumiria com itens que a criança comprou.
  // Do Firestore aceitamos só AJUSTES nos times que já existem aqui (nome,
  // bandeira e cores) e as dificuldades. Personagens/animais remotos são
  // ignorados (a lista grátis reduzida + a Loja são a fonte da verdade).
  var selecoes = validarLista(config.selecoes, validarSelecao);
  var dificuldades = validarLista(config.dificuldades, validarDificuldade);
  if (selecoes) {
    selecoes.forEach(function(remota) {
      var local = SELECOES.find(function(s) { return s.id === remota.id; });
      if (!local) return;
      local.nome = remota.nome;
      if (remota.bandeira && local.categoria === 'selecao') local.bandeira = remota.bandeira;
      if (remota.corPrimaria) local.corPrimaria = remota.corPrimaria;
      if (remota.corSecundaria) local.corSecundaria = remota.corSecundaria;
    });
  }
  if (dificuldades && dificuldades.length >= DIFICULDADES.length) DIFICULDADES = dificuldades;
}

// ---------- Catálogo da Loja ----------
// Ids dos itens: "<tipo>:<chave>" — selecao:portugal, clube:flamengo,
// avatar:Panda, nome:Furacão. Itens grátis (preco 0) nunca são "comprados":
// já pertencem a todo mundo.
function idItemTime(time) {
  return (time.categoria === 'clube' ? 'clube:' : 'selecao:') + time.id;
}

function catalogoLoja() {
  var itens = [];
  SELECOES.forEach(function(t) {
    if (t.preco > 0) itens.push({ id: idItemTime(t), tipo: t.categoria === 'clube' ? 'clube' : 'selecao', nome: t.nome, preco: t.preco, time: t });
  });
  (typeof AVATARES_LOJA !== 'undefined' ? AVATARES_LOJA : []).forEach(function(a) {
    itens.push({ id: 'avatar:' + a.seed, tipo: 'avatar', nome: a.nome, preco: a.preco, seed: a.seed });
  });
  PERSONAGENS_LOJA.forEach(function(n) {
    itens.push({ id: 'nome:' + n, tipo: 'nome', subtipo: 'personagem', nome: n, preco: PRECO_NOME_LOJA });
  });
  ANIMAIS_LOJA.forEach(function(n) {
    itens.push({ id: 'nome:' + n, tipo: 'nome', subtipo: 'animal', nome: n, preco: PRECO_NOME_LOJA });
  });
  return itens;
}

const MENSAGENS_RESULTADO = {
  0: [
    'Valeu por jogar! Bora treinar mais e voltar pra fazer gol!',
    'Hoje o goleiro tava inspirado! Tenta de novo, você consegue!',
    'Não desiste! Cada tentativa te deixa mais craque!',
    'O importante é tentar! Vamos de novo?'
  ],
  1: [
    'Bom começo! Você já fez um gol, bora buscar mais!',
    'Um gol é só o aquecimento! Tenta de novo pra fazer mais!',
    'Já tá no caminho certo! Mais uma rodada e você arrebenta!',
    'Boa! Um gol já é vitória! Quer tentar fazer dois agora?'
  ],
  2: [
    'Quase perfeito! Faltou só um golzinho! Tenta de novo!',
    'Dois gols! Tá quase lá, falta só um pra fase perfeita!',
    'Impressionante! Mais uma tentativa e você fecha com 3!',
    'Show! Dois de três! Bora buscar a fase perfeita?'
  ],
  3: [
    'FASE PERFEITA! Você é o Craque das Contas!',
    'Três de três! Ninguém segura você! Bora pro próximo desafio!',
    'Perfeito! Acho que esse nível tá fácil demais pra você!',
    'Goleada! Manda bem assim no próximo nível também!',
    'Hat-trick de contas certas! Você é fera demais!'
  ]
};

// Mensagens genéricas (sem número fixo) para fases com 5 ou 7 cobranças.
// As de MENSAGENS_RESULTADO citam "três" e só valem para 3 cobranças.
const MENSAGENS_RESULTADO_GERAIS = {
  zero: MENSAGENS_RESULTADO[0],
  poucos: [
    'Bom começo! Você já balançou a rede, bora buscar mais!',
    'Já tá no caminho certo! Mais uma rodada e você arrebenta!'
  ],
  quase: [
    'Muito bem! Mais da metade das cobranças viraram gol!',
    'Show! Falta pouco pra fase perfeita!'
  ],
  perfeito: [
    'FASE PERFEITA! Você é o Craque das Contas!',
    'Nenhuma cobrança perdida! Ninguém segura você!'
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
