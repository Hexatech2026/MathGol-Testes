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
  // [a, b, tipo] — o nível da chave define o que é apropriado ali.
  //
  // Os resultados são distribuídos de propósito: no máximo DUAS contas por
  // resultado, e a forma varia (5 = 2+3 e 5 = 1+4). A primeira versão disto
  // tinha seis contas que davam 8 no nível 1, e o teste DEF-23 de vocês pegou:
  // com resultado repetido a criança decora a resposta em vez de calcular.
  var BANCO = {
    1: [ // Somar até 10 — começa bem pequeno de propósito
      [1,1,'soma'], [1,2,'soma'], [2,2,'soma'], [2,3,'soma'], [3,3,'soma'],
      [3,4,'soma'], [4,4,'soma'], [4,5,'soma'], [5,5,'soma'], [2,1,'soma'],
      [1,3,'soma'], [1,4,'soma'], [4,2,'soma'], [5,2,'soma'], [2,6,'soma'],
      [2,7,'soma'], [7,3,'soma']
    ],
    2: [ // Subtrair até 10
      [2,1,'subtracao'], [3,1,'subtracao'], [4,1,'subtracao'], [5,1,'subtracao'], [6,1,'subtracao'],
      [7,1,'subtracao'], [8,1,'subtracao'], [9,1,'subtracao'], [10,1,'subtracao'], [6,5,'subtracao'],
      [7,5,'subtracao'], [7,4,'subtracao'], [8,4,'subtracao'], [8,3,'subtracao'], [9,3,'subtracao'],
      [9,2,'subtracao'], [10,2,'subtracao']
    ],
    3: [ // Soma e subtração até 10
      [2,1,'subtracao'], [1,1,'soma'], [1,2,'soma'], [2,2,'soma'], [2,3,'soma'],
      [3,3,'soma'], [3,4,'soma'], [4,4,'soma'], [4,5,'soma'], [5,5,'soma'],
      [6,5,'subtracao'], [6,4,'subtracao'], [6,3,'subtracao'], [6,2,'subtracao'], [6,1,'subtracao'],
      [5,1,'soma'], [1,6,'soma'], [6,2,'soma']
    ],
    4: [ // Passar do 10 (resultado 11–20)
      [5,6,'soma'], [6,6,'soma'], [6,7,'soma'], [7,7,'soma'], [7,8,'soma'],
      [8,8,'soma'], [8,9,'soma'], [9,9,'soma'], [9,10,'soma'], [10,10,'soma'],
      [3,8,'soma'], [8,4,'soma'], [4,9,'soma'], [5,9,'soma'], [9,6,'soma'],
      [9,7,'soma'], [7,10,'soma'], [8,10,'soma']
    ],
    5: [ // Subtrair de números até 20
      [11,9,'subtracao'], [11,8,'subtracao'], [11,7,'subtracao'], [11,6,'subtracao'], [11,5,'subtracao'],
      [11,4,'subtracao'], [11,3,'subtracao'], [11,2,'subtracao'], [11,1,'subtracao'], [12,1,'subtracao'],
      [13,1,'subtracao'], [14,1,'subtracao'], [15,1,'subtracao'], [16,1,'subtracao'], [17,1,'subtracao'],
      [18,1,'subtracao'], [19,1,'subtracao'], [20,1,'subtracao']
    ],
    6: [ // Somar 2 dígitos sem "vai um"
      [10,10,'soma'], [10,11,'soma'], [11,11,'soma'], [11,12,'soma'], [12,12,'soma'],
      [12,13,'soma'], [13,13,'soma'], [13,14,'soma'], [14,14,'soma'], [14,15,'soma'],
      [10,20,'soma'], [11,20,'soma'], [12,20,'soma'], [13,20,'soma'], [14,20,'soma'],
      [20,15,'soma'], [20,16,'soma'], [20,17,'soma']
    ],
    7: [ // Somar e subtrair 2 dígitos (com reagrupamento)
      [20,10,'subtracao'], [21,10,'subtracao'], [22,10,'subtracao'], [23,10,'subtracao'], [24,10,'subtracao'],
      [25,10,'subtracao'], [26,10,'subtracao'], [27,10,'subtracao'], [28,10,'subtracao'], [29,10,'subtracao'],
      [10,10,'soma'], [10,11,'soma'], [11,11,'soma'], [11,12,'soma'], [12,12,'soma'],
      [12,13,'soma'], [13,13,'soma'], [13,14,'soma']
    ],
    8: [ // Tabuada de 2 a 5
      [2,2,'multiplicacao'], [2,3,'multiplicacao'], [2,4,'multiplicacao'], [3,3,'multiplicacao'], [2,5,'multiplicacao'],
      [3,4,'multiplicacao'], [2,7,'multiplicacao'], [3,5,'multiplicacao'], [4,4,'multiplicacao'], [3,6,'multiplicacao'],
      [4,5,'multiplicacao'], [3,7,'multiplicacao'], [4,6,'multiplicacao'], [5,5,'multiplicacao'], [3,9,'multiplicacao'],
      [4,7,'multiplicacao'], [5,6,'multiplicacao'], [4,8,'multiplicacao']
    ],
    9: [ // Tabuada completa
      [2,2,'multiplicacao'], [2,3,'multiplicacao'], [2,4,'multiplicacao'], [3,3,'multiplicacao'], [2,5,'multiplicacao'],
      [3,4,'multiplicacao'], [2,7,'multiplicacao'], [3,5,'multiplicacao'], [4,4,'multiplicacao'], [3,6,'multiplicacao'],
      [4,5,'multiplicacao'], [3,7,'multiplicacao'], [4,6,'multiplicacao'], [5,5,'multiplicacao'], [3,9,'multiplicacao'],
      [4,7,'multiplicacao'], [5,6,'multiplicacao'], [4,8,'multiplicacao']
    ],
    10: [ // Dividir por 2 a 5
      [4,2,'divisao'], [6,2,'divisao'], [8,2,'divisao'], [10,2,'divisao'], [12,2,'divisao'],
      [14,2,'divisao'], [16,2,'divisao'], [18,2,'divisao'], [20,2,'divisao'], [8,4,'divisao'],
      [12,4,'divisao'], [16,4,'divisao'], [20,4,'divisao'], [24,4,'divisao'], [28,4,'divisao'],
      [32,4,'divisao'], [36,4,'divisao'], [40,4,'divisao']
    ],
    11: [ // Divisão completa
      [4,2,'divisao'], [6,2,'divisao'], [8,2,'divisao'], [10,2,'divisao'], [12,2,'divisao'],
      [14,2,'divisao'], [16,2,'divisao'], [18,2,'divisao'], [20,2,'divisao'], [12,6,'divisao'],
      [18,6,'divisao'], [24,6,'divisao'], [30,6,'divisao'], [36,6,'divisao'], [42,6,'divisao'],
      [48,6,'divisao'], [54,6,'divisao'], [60,6,'divisao']
    ],
    12: [ // Tudo junto
      [30,6,'divisao'], [36,6,'divisao'], [42,6,'divisao'], [48,6,'divisao'], [54,6,'divisao'],
      [20,10,'subtracao'], [21,10,'subtracao'], [22,10,'subtracao'], [23,10,'subtracao'], [24,10,'subtracao'],
      [25,10,'subtracao'], [26,10,'subtracao'], [27,10,'subtracao'], [28,10,'subtracao'], [29,10,'subtracao'],
      [10,10,'soma'], [10,11,'soma'], [11,11,'soma']
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
