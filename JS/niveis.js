// niveis.js — escada de aprendizagem do MathGol.
//
// POR QUE ISSO EXISTE
// Antes só havia 3 dificuldades (facil / medio / dificil) e a fase escalava
// automaticamente: quem escolhia "facil" caía em "dificil" já na fase 3 e
// encarava 7 × 9 e divisões depois de ter somado 2 + 3. Cada degrau era um
// abismo porque só existiam três degraus.
//
// Agora são 12 níveis pequenos. Cada um declara:
//   tipos   — quais operações entram (soma, subtracao, multiplicacao, divisao)
//   digitos — quantos algarismos os operandos têm
//   faixa   — os limites numéricos de verdade
//
// Assim dá pra o professor pedir "só subtração de 2 dígitos" sem mexer em
// código, e a fase seguinte sobe UM degrau em vez de pular pro fim.

var TIPOS_OPERACAO = {
  soma:           { simbolo: '+', nome: 'Soma',           verbo: 'mais' },
  subtracao:      { simbolo: '−', nome: 'Subtração',      verbo: 'menos' },
  multiplicacao:  { simbolo: '×', nome: 'Multiplicação',  verbo: 'vezes' },
  divisao:        { simbolo: '÷', nome: 'Divisão',        verbo: 'dividido por' }
};

// A escada. A ordem É a progressão — nivel 1 é o primeiro contato, 12 fecha.
//
// "digitos" descreve os OPERANDOS (o que a criança lê na tela), não o
// resultado: 7 + 8 é 1 dígito mesmo dando 15.
var NIVEIS = [
  {
    id: 1,
    nome: 'Primeiros gols',
    descricao: 'Somar até 10',
    tipos: ['soma'],
    digitos: 1,
    faixa: { min: 1, max: 9, resultadoMax: 10 }
  },
  {
    id: 2,
    nome: 'Tirando de pouquinho',
    descricao: 'Subtrair até 10',
    tipos: ['subtracao'],
    digitos: 1,
    faixa: { min: 1, max: 10 }
  },
  {
    id: 3,
    nome: 'Vai e volta',
    descricao: 'Somar e subtrair até 10',
    tipos: ['soma', 'subtracao'],
    digitos: 1,
    faixa: { min: 1, max: 10, resultadoMax: 10 }
  },
  {
    id: 4,
    nome: 'Passando do 10',
    descricao: 'Somas com resultado até 20',
    tipos: ['soma'],
    digitos: 1,
    faixa: { min: 2, max: 9, resultadoMin: 11, resultadoMax: 18 }
  },
  {
    id: 5,
    nome: 'Voltando do 20',
    descricao: 'Subtrair de números até 20',
    tipos: ['subtracao'],
    digitos: 2,
    faixa: { min: 11, max: 20, subtraendoMax: 9 }
  },
  {
    id: 6,
    nome: 'Dezenas certinhas',
    descricao: 'Somar 2 dígitos sem "vai um"',
    tipos: ['soma'],
    digitos: 2,
    faixa: { min: 10, max: 89, semReagrupamento: true }
  },
  {
    id: 7,
    nome: 'Com o vai um',
    descricao: 'Somar e subtrair 2 dígitos',
    tipos: ['soma', 'subtracao'],
    digitos: 2,
    faixa: { min: 10, max: 99 }
  },
  {
    id: 8,
    nome: 'Tabuada do começo',
    descricao: 'Multiplicar por 2, 3, 4 e 5',
    tipos: ['multiplicacao'],
    digitos: 1,
    faixa: { tabuadas: [2, 3, 4, 5], max: 10 }
  },
  {
    id: 9,
    nome: 'Tabuada inteira',
    descricao: 'Multiplicar de 2 até 10',
    tipos: ['multiplicacao'],
    digitos: 1,
    faixa: { tabuadas: [2, 3, 4, 5, 6, 7, 8, 9, 10], max: 10 }
  },
  {
    id: 10,
    nome: 'Dividindo igual',
    descricao: 'Dividir por 2, 3, 4 e 5',
    tipos: ['divisao'],
    digitos: 2,
    faixa: { tabuadas: [2, 3, 4, 5], max: 10 }
  },
  {
    id: 11,
    nome: 'Divisão inteira',
    descricao: 'Dividir de 2 até 10',
    tipos: ['divisao'],
    digitos: 2,
    faixa: { tabuadas: [2, 3, 4, 5, 6, 7, 8, 9, 10], max: 10 }
  },
  {
    id: 12,
    nome: 'Craque das contas',
    descricao: 'As quatro operações misturadas',
    tipos: ['soma', 'subtracao', 'multiplicacao', 'divisao'],
    digitos: 2,
    faixa: { min: 10, max: 99, tabuadas: [2, 3, 4, 5, 6, 7, 8, 9, 10], max10: 10 }
  }
];

var NIVEL_MIN = 1;
var NIVEL_MAX = NIVEIS.length;

function obterNivel(id) {
  var n = parseInt(id, 10);
  if (!isFinite(n)) n = NIVEL_MIN;
  n = Math.max(NIVEL_MIN, Math.min(NIVEL_MAX, n));
  return NIVEIS[n - 1];
}

// Rótulo curto pra tela: "Nível 5 · Subtração · 2 dígitos".
//
// Nos níveis iniciais o que importa pro professor é a faixa numérica, não a
// contagem de algarismos — "até 10" diz mais do que "1 dígito", e evita a
// imprecisão de chamar 10 − 3 de conta de um dígito.
function rotuloNivel(id) {
  var nv = obterNivel(id);
  var tipos = nv.tipos.map(function(t) { return TIPOS_OPERACAO[t].nome; }).join(' e ');
  var tamanho = nv.digitos >= 2
    ? nv.digitos + ' dígitos'
    : 'números até ' + ((nv.faixa && (nv.faixa.resultadoMax || nv.faixa.max)) || 10);
  return 'Nível ' + nv.id + ' · ' + tipos + ' · ' + tamanho;
}

// ---------- Compatibilidade com as 3 dificuldades antigas ----------
//
// Jogadores que já tinham progresso salvo escolheram facil/medio/dificil.
// Esse mapa traduz pra um ponto de partida na escada nova, pra ninguém
// perder o que já tinha nem ser jogado num nível fora do seu.
var DIFICULDADE_PARA_NIVEL = {
  facil:   1,
  medio:   4,
  dificil: 8
};

function nivelDaDificuldadeAntiga(dificuldadeId) {
  return DIFICULDADE_PARA_NIVEL[dificuldadeId] || 1;
}
