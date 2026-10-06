// banco-questoes.js — banco curado, organizado pela escada de niveis.js.
//
// MUDOU NESTA VERSÃO
// Antes o banco tinha 3 baldes (facil/medio/dificil) e as distratoras eram
// escritas à mão, uma a uma. Agora cada entrada é só [a, b, tipo]: a conta,
// o enunciado falado e as 5 alternativas saem de montarPergunta(), o mesmo
// caminho do gerador. Menos lugar pra errar e muito mais fácil de um
// professor revisar a lista.
//
// O banco é sorteado primeiro (contas escolhidas a dedo, sem repetir na
// sessão); quando esgota, o gerador de questions.js assume. Toda questão,
// venha de onde vier, passa por validarPergunta() antes de ir pro jogo.

var BancoQuestoes = (function() {

  // [a, b, tipo] — o nível da chave define o que é apropriado ali.
  var BANCO = {
    1: [ // Somar até 10 — começa bem pequeno de propósito
      [1,1,'soma'], [1,2,'soma'], [2,2,'soma'], [1,3,'soma'], [2,3,'soma'],
      [1,4,'soma'], [3,5,'soma'], [6,2,'soma'], [7,1,'soma'], [4,4,'soma'],
      [5,3,'soma'], [2,6,'soma'], [1,8,'soma'], [3,3,'soma'], [4,2,'soma'],
      [5,5,'soma']
    ],
    2: [ // Subtrair até 10
      [5,2,'subtracao'], [8,3,'subtracao'], [7,4,'subtracao'], [9,5,'subtracao'],
      [10,3,'subtracao'], [6,1,'subtracao'], [9,6,'subtracao'], [10,7,'subtracao'],
      [8,5,'subtracao'], [7,2,'subtracao'], [6,4,'subtracao'], [10,4,'subtracao']
    ],
    3: [ // Soma e subtração até 10
      [4,3,'soma'], [6,3,'soma'], [2,7,'soma'], [8,2,'soma'],
      [9,4,'subtracao'], [7,3,'subtracao'], [10,6,'subtracao'], [8,6,'subtracao'],
      [5,4,'soma'], [9,2,'subtracao'], [3,6,'soma'], [10,5,'subtracao']
    ],
    4: [ // Passar do 10 (resultado 11–18)
      [7,8,'soma'], [9,6,'soma'], [8,5,'soma'], [6,7,'soma'], [9,8,'soma'],
      [7,6,'soma'], [8,8,'soma'], [9,9,'soma'], [5,8,'soma'], [6,6,'soma'],
      [9,4,'soma'], [7,7,'soma']
    ],
    5: [ // Subtrair de números até 20
      [14,6,'subtracao'], [18,9,'subtracao'], [15,7,'subtracao'], [16,8,'subtracao'],
      [13,5,'subtracao'], [17,9,'subtracao'], [12,4,'subtracao'], [20,8,'subtracao'],
      [19,7,'subtracao'], [11,3,'subtracao'], [16,9,'subtracao'], [15,6,'subtracao']
    ],
    6: [ // Somar 2 dígitos sem "vai um"
      [23,14,'soma'], [31,25,'soma'], [42,16,'soma'], [54,23,'soma'],
      [12,36,'soma'], [25,41,'soma'], [33,24,'soma'], [61,27,'soma'],
      [14,52,'soma'], [43,35,'soma'], [21,48,'soma'], [52,36,'soma']
    ],
    7: [ // Somar e subtrair 2 dígitos (com reagrupamento)
      [36,27,'soma'], [48,25,'soma'], [59,18,'soma'], [27,39,'soma'],
      [52,18,'subtracao'], [63,27,'subtracao'], [71,35,'subtracao'], [84,46,'subtracao'],
      [45,38,'soma'], [90,42,'subtracao'], [67,29,'soma'], [55,27,'subtracao']
    ],
    8: [ // Tabuada de 2 a 5
      [3,4,'multiplicacao'], [5,3,'multiplicacao'], [4,5,'multiplicacao'], [2,7,'multiplicacao'],
      [3,6,'multiplicacao'], [5,8,'multiplicacao'], [4,7,'multiplicacao'], [2,9,'multiplicacao'],
      [3,8,'multiplicacao'], [5,6,'multiplicacao'], [4,9,'multiplicacao'], [2,10,'multiplicacao']
    ],
    9: [ // Tabuada completa
      [7,8,'multiplicacao'], [6,7,'multiplicacao'], [9,6,'multiplicacao'], [8,8,'multiplicacao'],
      [7,9,'multiplicacao'], [6,9,'multiplicacao'], [8,7,'multiplicacao'], [9,9,'multiplicacao'],
      [6,6,'multiplicacao'], [8,9,'multiplicacao'], [7,7,'multiplicacao'], [10,7,'multiplicacao']
    ],
    10: [ // Dividir por 2 a 5
      [12,3,'divisao'], [20,4,'divisao'], [15,5,'divisao'], [18,2,'divisao'],
      [24,4,'divisao'], [25,5,'divisao'], [16,2,'divisao'], [21,3,'divisao'],
      [30,5,'divisao'], [28,4,'divisao'], [27,3,'divisao'], [14,2,'divisao']
    ],
    11: [ // Divisão completa
      [56,7,'divisao'], [63,9,'divisao'], [48,6,'divisao'], [72,8,'divisao'],
      [54,6,'divisao'], [81,9,'divisao'], [42,7,'divisao'], [64,8,'divisao'],
      [49,7,'divisao'], [36,6,'divisao'], [90,9,'divisao'], [70,10,'divisao']
    ],
    12: [ // Tudo junto
      [47,38,'soma'], [82,45,'subtracao'], [7,9,'multiplicacao'], [56,8,'divisao'],
      [63,29,'soma'], [91,37,'subtracao'], [8,6,'multiplicacao'], [72,9,'divisao'],
      [58,34,'soma'], [75,48,'subtracao'], [9,7,'multiplicacao'], [45,5,'divisao']
    ]
  };

  // ---------- Validação ----------
  //
  // Enunciado e texto falado não vazios, resultado numérico >= 0, exatamente
  // 5 alternativas de valores únicos, exatamente uma correta, e o valor dela
  // batendo com o resultado.
  function validarPergunta(p) {
    if (!p || typeof p.texto !== 'string' || !p.texto.trim()) return false;
    if (typeof p.textoFalado !== 'string' || !p.textoFalado.trim()) return false;
    if (typeof p.resultado !== 'number' || !isFinite(p.resultado) || p.resultado < 0) return false;
    if (!Number.isInteger(p.resultado)) return false; // divisão tem que ser exata
    if (!Array.isArray(p.alternativas) || p.alternativas.length !== 5) return false;

    var vistos = [];
    var corretas = 0;
    var aCorreta = null;

    for (var i = 0; i < p.alternativas.length; i++) {
      var alt = p.alternativas[i];
      if (!alt || typeof alt.valor !== 'number' || !isFinite(alt.valor) || alt.valor < 0) return false;
      if (vistos.indexOf(alt.valor) !== -1) return false;
      vistos.push(alt.valor);
      if (alt.correta) { corretas++; aCorreta = alt; }
    }

    if (corretas !== 1) return false;
    if (!aCorreta || aCorreta.valor !== p.resultado) return false;
    return true;
  }

  // ---------- Sorteio sem repetir na sessão ----------

  var usadas = {};

  function resetarSessao() { usadas = {}; }

  function montarDoBanco(entrada, nivelId) {
    return montarPergunta(entrada[0], entrada[1], entrada[2], nivelId);
  }

  // filtros opcionais { tipos: [...], digitos: n } — usados quando o
  // professor restringe a sala a um tipo de conta específico.
  function obterPergunta(nivelId, filtros) {
    var lista = BANCO[nivelId];
    if (!lista || !lista.length) return null;

    var indices = [];
    for (var i = 0; i < lista.length; i++) {
      if (filtros && filtros.tipos && filtros.tipos.length &&
          filtros.tipos.indexOf(lista[i][2]) === -1) continue;
      indices.push(i);
    }
    if (!indices.length) return null;

    if (!usadas[nivelId]) usadas[nivelId] = [];
    var disponiveis = indices.filter(function(i) { return usadas[nivelId].indexOf(i) === -1; });
    if (!disponiveis.length) { usadas[nivelId] = []; disponiveis = indices.slice(); }

    while (disponiveis.length) {
      var pos = Math.floor(Math.random() * disponiveis.length);
      var indice = disponiveis[pos];
      disponiveis.splice(pos, 1);
      usadas[nivelId].push(indice);
      var p = montarDoBanco(lista[indice], nivelId);
      if (validarPergunta(p)) return p;
      console.warn('BancoQuestoes: entrada inválida no nível ' + nivelId + ', índice ' + indice);
    }
    return null;
  }

  // Aceita número (nível) ou string (dificuldade antiga), pra não quebrar
  // progresso de quem já jogava antes da escada existir.
  function sortearPergunta(nivelOuDificuldade, filtros) {
    var nivelId = typeof nivelOuDificuldade === 'number'
      ? nivelOuDificuldade
      : nivelDaDificuldadeAntiga(nivelOuDificuldade);
    nivelId = obterNivel(nivelId).id;

    var p = obterPergunta(nivelId, filtros);
    if (p) return p;

    p = gerarPerguntaDoNivel(nivelId);
    if (validarPergunta(p)) return p;

    console.warn('BancoQuestoes: gerador retornou questão inválida, tentando de novo.');
    p = gerarPerguntaDoNivel(nivelId);
    if (validarPergunta(p)) return p;

    return montarPergunta(2, 2, 'soma', 1); // rede final
  }

  // ---------- Autoverificação ----------
  //
  // Roda o banco inteiro ao carregar e avisa no console. Pega erro de
  // digitação (divisão não exata, subtração negativa) na hora de desenvolver,
  // nunca interrompe o jogo.
  (function conferirBanco() {
    Object.keys(BANCO).forEach(function(nivel) {
      BANCO[nivel].forEach(function(entrada, i) {
        var p;
        try { p = montarDoBanco(entrada, parseInt(nivel, 10)); } catch (e) { p = null; }
        if (!validarPergunta(p)) {
          console.warn('BancoQuestoes: entrada inválida — nível ' + nivel + ', índice ' + i +
                       ' (' + entrada.join(' ') + ')');
        }
      });
    });
  })();

  function quantidadePorNivel() {
    var r = {};
    Object.keys(BANCO).forEach(function(n) { r[n] = BANCO[n].length; });
    return r;
  }

  return {
    sortearPergunta: sortearPergunta,
    resetarSessao: resetarSessao,
    validarPergunta: validarPergunta,
    quantidadePorNivel: quantidadePorNivel
  };
})();
