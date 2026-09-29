// banco-questoes.js — banco de questoes curadas por dificuldade (HU-05).
// Complementa o gerador aleatorio de questions.js: primeiro sorteia
// do banco (sem repetir na mesma sessao), quando esgota cai no gerador.
// Cada questao tem texto visual, texto falado, resultado e 5 alternativas
// (1 correta + 4 distratoras plausíveis), uma para cada zona do gol.
//
// Toda questão — venha do banco curado ou do gerador de fallback — passa
// por validarPergunta() antes de ser entregue ao jogo: nunca aceita
// resultado inválido, alternativas repetidas, mais de uma correta ou
// questão malformada. Isso garante que o fallback de questions.js também
// seja seguro, como pede a HU-05.

var BancoQuestoes = (function() {

  // Perguntas pré-montadas. Formato identico ao retorno de gerarPergunta().
  // As alternativas ja vem com 5 opcoes (1 correta + 4 distratoras).

  function q(texto, textoFalado, resultado, distratoras) {
    var alts = [{ valor: resultado, correta: true }];
    distratoras.forEach(function(d) { alts.push({ valor: d, correta: false }); });
    // Embaralha
    for (var i = alts.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = alts[i]; alts[i] = alts[j]; alts[j] = temp;
    }
    return { texto: texto, textoFalado: textoFalado, resultado: resultado, alternativas: alts };
  }

  // Pedagogia por dificuldade:
  // - fácil: adição e subtração simples, resultados não negativos.
  // - médio: adição, subtração e multiplicação básica.
  // - difícil: multiplicação e divisões exatas.
  var BANCO = {
    facil: [
      function(){ return q('2 + 3', 'Quanto é 2 mais 3?', 5, [3, 4, 6, 7]); },
      function(){ return q('1 + 4', 'Quanto é 1 mais 4?', 5, [3, 4, 6, 7]); },
      function(){ return q('3 + 5', 'Quanto é 3 mais 5?', 8, [6, 7, 9, 10]); },
      function(){ return q('6 + 2', 'Quanto é 6 mais 2?', 8, [6, 7, 9, 10]); },
      function(){ return q('7 + 1', 'Quanto é 7 mais 1?', 8, [6, 7, 9, 10]); },
      function(){ return q('4 + 4', 'Quanto é 4 mais 4?', 8, [5, 6, 7, 9]); },
      function(){ return q('5 + 3', 'Quanto é 5 mais 3?', 8, [6, 7, 9, 10]); },
      function(){ return q('2 + 6', 'Quanto é 2 mais 6?', 8, [5, 7, 9, 10]); },
      function(){ return q('1 + 7', 'Quanto é 1 mais 7?', 8, [5, 6, 9, 10]); },
      function(){ return q('5 − 2', 'Quanto é 5 menos 2?', 3, [1, 2, 4, 5]); },
      function(){ return q('8 − 3', 'Quanto é 8 menos 3?', 5, [3, 4, 6, 7]); },
      function(){ return q('7 − 4', 'Quanto é 7 menos 4?', 3, [1, 2, 4, 5]); },
      function(){ return q('9 − 5', 'Quanto é 9 menos 5?', 4, [2, 3, 5, 6]); },
      function(){ return q('10 − 3', 'Quanto é 10 menos 3?', 7, [5, 6, 8, 9]); },
      function(){ return q('6 − 1', 'Quanto é 6 menos 1?', 5, [3, 4, 6, 7]); },
      function(){ return q('4 + 3', 'Quanto é 4 mais 3?', 7, [5, 6, 8, 9]); },
      function(){ return q('9 − 6', 'Quanto é 9 menos 6?', 3, [1, 2, 4, 5]); },
      function(){ return q('1 + 8', 'Quanto é 1 mais 8?', 9, [6, 7, 8, 10]); },
      function(){ return q('10 − 7', 'Quanto é 10 menos 7?', 3, [1, 2, 4, 5]); },
      function(){ return q('3 + 3', 'Quanto é 3 mais 3?', 6, [4, 5, 7, 8]); }
    ],

    medio: [
      function(){ return q('7 + 8', 'Quanto é 7 mais 8?', 15, [12, 13, 14, 16]); },
      function(){ return q('9 + 6', 'Quanto é 9 mais 6?', 15, [13, 14, 16, 17]); },
      function(){ return q('12 + 5', 'Quanto é 12 mais 5?', 17, [15, 16, 18, 19]); },
      function(){ return q('14 − 6', 'Quanto é 14 menos 6?', 8, [6, 7, 9, 10]); },
      function(){ return q('18 − 9', 'Quanto é 18 menos 9?', 9, [7, 8, 10, 11]); },
      function(){ return q('15 − 7', 'Quanto é 15 menos 7?', 8, [6, 7, 9, 10]); },
      function(){ return q('3 × 4', 'Quanto é 3 vezes 4?', 12, [9, 10, 11, 14]); },
      function(){ return q('5 × 3', 'Quanto é 5 vezes 3?', 15, [12, 13, 16, 18]); },
      function(){ return q('4 × 5', 'Quanto é 4 vezes 5?', 20, [15, 16, 18, 22]); },
      function(){ return q('2 × 5', 'Quanto é 2 vezes 5?', 10, [6, 8, 12, 15]); },
      function(){ return q('11 + 7', 'Quanto é 11 mais 7?', 18, [15, 16, 17, 19]); },
      function(){ return q('16 − 8', 'Quanto é 16 menos 8?', 8, [5, 6, 7, 9]); },
      function(){ return q('3 × 3', 'Quanto é 3 vezes 3?', 9, [6, 7, 8, 12]); },
      function(){ return q('4 × 4', 'Quanto é 4 vezes 4?', 16, [12, 14, 15, 18]); },
      function(){ return q('13 + 6', 'Quanto é 13 mais 6?', 19, [16, 17, 18, 20]); },
      function(){ return q('20 − 8', 'Quanto é 20 menos 8?', 12, [10, 11, 13, 14]); },
      function(){ return q('5 × 4', 'Quanto é 5 vezes 4?', 20, [15, 16, 18, 24]); },
      function(){ return q('2 × 4', 'Quanto é 2 vezes 4?', 8, [5, 6, 10, 12]); },
      function(){ return q('17 − 9', 'Quanto é 17 menos 9?', 8, [6, 7, 9, 10]); },
      function(){ return q('6 + 9', 'Quanto é 6 mais 9?', 15, [12, 13, 14, 16]); }
    ],

    dificil: [
      function(){ return q('7 × 8', 'Quanto é 7 vezes 8?', 56, [48, 52, 54, 63]); },
      function(){ return q('6 × 9', 'Quanto é 6 vezes 9?', 54, [45, 48, 56, 63]); },
      function(){ return q('8 × 7', 'Quanto é 8 vezes 7?', 56, [49, 54, 58, 63]); },
      function(){ return q('9 × 6', 'Quanto é 9 vezes 6?', 54, [45, 48, 56, 63]); },
      function(){ return q('42 ÷ 7', 'Quanto é 42 dividido por 7?', 6, [4, 5, 7, 8]); },
      function(){ return q('56 ÷ 8', 'Quanto é 56 dividido por 8?', 7, [5, 6, 8, 9]); },
      function(){ return q('72 ÷ 9', 'Quanto é 72 dividido por 9?', 8, [6, 7, 9, 10]); },
      function(){ return q('36 ÷ 6', 'Quanto é 36 dividido por 6?', 6, [4, 5, 7, 8]); },
      function(){ return q('8 × 9', 'Quanto é 8 vezes 9?', 72, [63, 68, 70, 81]); },
      function(){ return q('7 × 7', 'Quanto é 7 vezes 7?', 49, [42, 46, 48, 56]); },
      function(){ return q('9 × 9', 'Quanto é 9 vezes 9?', 81, [72, 78, 80, 90]); },
      function(){ return q('48 ÷ 6', 'Quanto é 48 dividido por 6?', 8, [6, 7, 9, 10]); },
      function(){ return q('63 ÷ 9', 'Quanto é 63 dividido por 9?', 7, [5, 6, 8, 9]); },
      function(){ return q('54 ÷ 6', 'Quanto é 54 dividido por 6?', 9, [6, 7, 8, 10]); },
      function(){ return q('6 × 7', 'Quanto é 6 vezes 7?', 42, [35, 36, 48, 49]); },
      function(){ return q('10 × 8', 'Quanto é 10 vezes 8?', 80, [64, 70, 72, 90]); },
      function(){ return q('81 ÷ 9', 'Quanto é 81 dividido por 9?', 9, [7, 8, 10, 11]); },
      function(){ return q('5 × 9', 'Quanto é 5 vezes 9?', 45, [36, 40, 50, 54]); },
      function(){ return q('40 ÷ 8', 'Quanto é 40 dividido por 8?', 5, [3, 4, 6, 8]); },
      function(){ return q('7 × 9', 'Quanto é 7 vezes 9?', 63, [54, 56, 70, 72]); }
    ]
  };

  // Valida programaticamente uma questão pronta: enunciado e texto falado
  // não vazios, resultado numérico válido (>= 0), exatamente 5 alternativas
  // com valores únicos e numéricos válidos, exatamente uma marcada como
  // correta, e o valor dessa alternativa batendo com o resultado.
  function validarPergunta(p) {
    if (!p || typeof p.texto !== 'string' || !p.texto.trim()) return false;
    if (typeof p.textoFalado !== 'string' || !p.textoFalado.trim()) return false;
    if (typeof p.resultado !== 'number' || !isFinite(p.resultado) || p.resultado < 0) return false;
    if (!Array.isArray(p.alternativas) || p.alternativas.length !== 5) return false;

    var valoresVistos = [];
    var quantidadeCorretas = 0;
    var alternativaCorreta = null;

    for (var i = 0; i < p.alternativas.length; i++) {
      var alt = p.alternativas[i];
      if (!alt || typeof alt.valor !== 'number' || !isFinite(alt.valor) || alt.valor < 0) return false;
      if (valoresVistos.indexOf(alt.valor) !== -1) return false; // alternativa repetida
      valoresVistos.push(alt.valor);
      if (alt.correta) {
        quantidadeCorretas++;
        alternativaCorreta = alt;
      }
    }

    if (quantidadeCorretas !== 1) return false; // nenhuma ou mais de uma correta
    if (!alternativaCorreta || alternativaCorreta.valor !== p.resultado) return false;
    return true;
  }

  // Controle de quais perguntas do banco ja foram usadas nesta sessao
  var usadas = { facil: [], medio: [], dificil: [] };

  function resetarSessao() {
    usadas = { facil: [], medio: [], dificil: [] };
  }

  function obterPergunta(dificuldade) {
    var lista = BANCO[dificuldade];
    if (!lista) return null;

    // Indices disponiveis (nao usados ainda)
    var disponiveis = [];
    for (var i = 0; i < lista.length; i++) {
      if (usadas[dificuldade].indexOf(i) === -1) disponiveis.push(i);
    }

    // Se esgotou o banco, reseta e volta a sortear
    if (disponiveis.length === 0) {
      usadas[dificuldade] = [];
      for (var j = 0; j < lista.length; j++) disponiveis.push(j);
    }

    // Tenta sortear uma questão válida; se por algum motivo a construída
    // for inválida, marca como usada (pra não insistir nela) e tenta outra
    // dentre as disponíveis, até esgotar as opções desta rodada.
    while (disponiveis.length > 0) {
      var pos = Math.floor(Math.random() * disponiveis.length);
      var indice = disponiveis[pos];
      disponiveis.splice(pos, 1);
      usadas[dificuldade].push(indice);
      var pergunta = lista[indice]();
      if (validarPergunta(pergunta)) return pergunta;
      console.warn('BancoQuestoes: questão malformada ignorada (' + dificuldade + ', índice ' + indice + ')');
    }
    return null;
  }

  // Exporta: tenta o banco primeiro, cai no gerador se necessario. O
  // gerador de fallback (questions.js) também passa pela validação — se
  // por algum motivo gerar algo inválido, tenta mais uma vez antes de usar
  // uma questão mínima garantida, pra nunca travar o jogo.
  function sortearPergunta(dificuldade) {
    var pergunta = obterPergunta(dificuldade);
    if (pergunta) return pergunta;

    pergunta = gerarPergunta(dificuldade);
    if (validarPergunta(pergunta)) return pergunta;

    console.warn('BancoQuestoes: fallback de questions.js retornou questão inválida, tentando novamente.');
    pergunta = gerarPergunta(dificuldade);
    if (validarPergunta(pergunta)) return pergunta;

    return questaoMinimaSegura(dificuldade);
  }

  // Última rede de segurança: uma questão fixa, sempre válida, usada apenas
  // se banco e gerador falharem simultaneamente (nunca deveria acontecer).
  function questaoMinimaSegura(dificuldade) {
    if (dificuldade === 'dificil') return q('6 × 6', 'Quanto é 6 vezes 6?', 36, [30, 32, 40, 42]);
    if (dificuldade === 'medio') return q('6 + 7', 'Quanto é 6 mais 7?', 13, [10, 11, 14, 15]);
    return q('2 + 2', 'Quanto é 2 mais 2?', 4, [2, 3, 5, 6]);
  }

  // Autoverificação do banco inteiro ao carregar o módulo — apenas avisa no
  // console em desenvolvimento; nunca interrompe o jogo.
  (function validarBancoCompleto() {
    Object.keys(BANCO).forEach(function(dificuldade) {
      BANCO[dificuldade].forEach(function(fabrica, indice) {
        var amostra;
        try { amostra = fabrica(); } catch (e) { amostra = null; }
        if (!validarPergunta(amostra)) {
          console.warn('BancoQuestoes: entrada inválida no banco "' + dificuldade + '", índice ' + indice + '.');
        }
      });
    });
  })();

  return {
    sortearPergunta: sortearPergunta,
    resetarSessao: resetarSessao,
    validarPergunta: validarPergunta
  };
})();
