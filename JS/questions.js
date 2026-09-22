// questions.js — gera perguntas de matemática de acordo com a dificuldade
// escolhida. Cada pergunta tem 4 alternativas (1 correta + 3 distratoras
// plausíveis), pensadas para botões grandes de toque.

function inteiroEntre(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function embaralhar(array) {
  const copia = [...array];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// Gera 4 distratoras diferentes do resultado correto (total de 5 alternativas,
// uma para cada zona do gol), próximas o bastante para não serem óbvias, mas
// nunca negativas nem absurdas.
function gerarAlternativas(correta) {
  const alternativas = new Set([correta]);
  let tentativas = 0;
  while (alternativas.size < 5 && tentativas < 80) {
    tentativas++;
    const desvio = inteiroEntre(-5, 5) || 1;
    const candidata = correta + desvio;
    if (candidata >= 0) alternativas.add(candidata);
  }
  return embaralhar([...alternativas]).map(valor => ({
    valor,
    correta: valor === correta
  }));
}

function montarPergunta(a, b, operador) {
  let resultado;
  let textoOperador;
  let textoFalado;

  switch (operador) {
    case '+':
      resultado = a + b;
      textoOperador = '+';
      textoFalado = `Quanto é ${a} mais ${b}?`;
      break;
    case '-':
      resultado = a - b;
      textoOperador = '−';
      textoFalado = `Quanto é ${a} menos ${b}?`;
      break;
    case '×':
      resultado = a * b;
      textoOperador = '×';
      textoFalado = `Quanto é ${a} vezes ${b}?`;
      break;
    case '÷':
      resultado = a / b;
      textoOperador = '÷';
      textoFalado = `Quanto é ${a} dividido por ${b}?`;
      break;
  }

  return {
    texto: `${a} ${textoOperador} ${b}`,
    textoFalado,
    resultado,
    alternativas: gerarAlternativas(resultado)
  };
}

function gerarPerguntaFacil() {
  const operador = Math.random() < 0.5 ? '+' : '-';
  if (operador === '+') {
    const a = inteiroEntre(1, 8);
    const b = inteiroEntre(1, 10 - a);
    return montarPergunta(a, b, '+');
  } else {
    const a = inteiroEntre(2, 10);
    const b = inteiroEntre(1, a);
    return montarPergunta(a, b, '-');
  }
}

function gerarPerguntaMedio() {
  const opcoes = ['+', '-', '×'];
  const operador = opcoes[inteiroEntre(0, 2)];
  if (operador === '+') {
    const a = inteiroEntre(5, 15);
    const b = inteiroEntre(1, 20 - a);
    return montarPergunta(a, b, '+');
  } else if (operador === '-') {
    const a = inteiroEntre(10, 20);
    const b = inteiroEntre(1, a);
    return montarPergunta(a, b, '-');
  } else {
    const a = inteiroEntre(2, 5);
    const b = inteiroEntre(2, 5);
    return montarPergunta(a, b, '×');
  }
}

function gerarPerguntaDificil() {
  const operador = Math.random() < 0.5 ? '×' : '÷';
  if (operador === '×') {
    const a = inteiroEntre(2, 10);
    const b = inteiroEntre(2, 10);
    return montarPergunta(a, b, '×');
  } else {
    // Divisão sempre exata: sorteia o resultado e o divisor primeiro.
    const b = inteiroEntre(2, 10);
    const resultado = inteiroEntre(2, 10);
    const a = b * resultado;
    return montarPergunta(a, b, '÷');
  }
}

function gerarPergunta(dificuldade) {
  switch (dificuldade) {
    case 'facil': return gerarPerguntaFacil();
    case 'medio': return gerarPerguntaMedio();
    case 'dificil': return gerarPerguntaDificil();
    default: return gerarPerguntaFacil();
  }
}
