// questions.js — gera perguntas respeitando o nível da escada de
// aprendizagem (ver niveis.js): tipo de operação + quantidade de dígitos.
//
// Cada pergunta sai com 5 alternativas (1 correta + 4 distratoras), uma por
// zona do gol, e carrega os metadados { nivel, tipo, digitos } pra o
// professor poder filtrar e pra a tela de resultado explicar o que caiu.

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

// Distratoras próximas o bastante pra exigir a conta, mas nunca negativas.
//
// O desvio acompanha a grandeza do resultado: errar "48" por 1 unidade é
// quase um sorteio, então em número grande as opções se afastam mais.
function gerarAlternativas(correta) {
  const amplitude = correta <= 10 ? 4 : (correta <= 30 ? 6 : 12);
  const alternativas = new Set([correta]);
  let tentativas = 0;
  while (alternativas.size < 5 && tentativas < 120) {
    tentativas++;
    const desvio = inteiroEntre(-amplitude, amplitude) || 1;
    const candidata = correta + desvio;
    if (candidata >= 0) alternativas.add(candidata);
  }
  // Rede de segurança: se o resultado for muito baixo e o sorteio não
  // tiver fechado 5 opções distintas, completa somando pra cima.
  let extra = correta + amplitude + 1;
  while (alternativas.size < 5) { alternativas.add(extra); extra++; }

  return embaralhar([...alternativas]).map(valor => ({
    valor,
    correta: valor === correta
  }));
}

function montarPergunta(a, b, tipo, nivelId) {
  const op = TIPOS_OPERACAO[tipo];
  let resultado;

  switch (tipo) {
    case 'soma':          resultado = a + b; break;
    case 'subtracao':     resultado = a - b; break;
    case 'multiplicacao': resultado = a * b; break;
    case 'divisao':       resultado = a / b; break;
  }

  return {
    texto: `${a} ${op.simbolo} ${b}`,
    textoFalado: `Quanto é ${a} ${op.verbo} ${b}?`,
    resultado,
    alternativas: gerarAlternativas(resultado),
    // Metadados — usados pelo painel do professor e pelo resumo da fase.
    nivel: nivelId,
    tipo,
    digitos: Math.max(String(a).length, String(b).length)
  };
}

// ---------- Um gerador por tipo, guiado pela faixa do nível ----------

function sortearSoma(f) {
  // Soma de 2 dígitos sem "vai um": cada coluna soma menos de 10, que é o
  // degrau antes de aprender reagrupamento.
  if (f.semReagrupamento) {
    const dezA = inteiroEntre(1, 4), dezB = inteiroEntre(1, 9 - dezA);
    const uniA = inteiroEntre(0, 4), uniB = inteiroEntre(0, 9 - uniA);
    return [dezA * 10 + uniA, dezB * 10 + uniB];
  }

  const min = f.min || 1;
  const max = f.max || 9;

  // Nível que pede resultado numa faixa (ex.: passar do 10 e parar em 18).
  if (f.resultadoMin) {
    for (let i = 0; i < 40; i++) {
      const a = inteiroEntre(min, max);
      const b = inteiroEntre(min, max);
      const r = a + b;
      if (r >= f.resultadoMin && r <= (f.resultadoMax || 99)) return [a, b];
    }
    return [9, inteiroEntre(2, 9)]; // fallback sempre dentro da faixa
  }

  // Resultado com teto (ex.: somar até 10 no nível 1).
  if (f.resultadoMax) {
    const a = inteiroEntre(min, Math.min(max, f.resultadoMax - 1));
    const b = inteiroEntre(1, f.resultadoMax - a);
    return [a, b];
  }

  return [inteiroEntre(min, max), inteiroEntre(min, max)];
}

function sortearSubtracao(f) {
  const min = f.min || 1;
  const max = f.max || 10;
  const a = inteiroEntre(Math.max(min, 2), max);
  // subtraendoMax deixa a conta no tamanho certo do nível (ex.: 17 − 8,
  // nunca 17 − 16, que é visualmente grande mas trivial).
  const tetoB = f.subtraendoMax ? Math.min(f.subtraendoMax, a) : a;
  const b = inteiroEntre(1, Math.max(1, tetoB));
  return [a, b]; // nunca negativo: b <= a
}

function sortearMultiplicacao(f) {
  const tabuadas = f.tabuadas || [2, 3, 4, 5];
  const a = tabuadas[inteiroEntre(0, tabuadas.length - 1)];
  const b = inteiroEntre(2, f.max || 10);
  return [a, b];
}

function sortearDivisao(f) {
  // Sempre exata: sorteia divisor e quociente, o dividendo vem do produto.
  const tabuadas = f.tabuadas || [2, 3, 4, 5];
  const divisor = tabuadas[inteiroEntre(0, tabuadas.length - 1)];
  const quociente = inteiroEntre(2, f.max || 10);
  return [divisor * quociente, divisor];
}

// ---------- Entrada principal ----------

function gerarPerguntaDoNivel(nivelId) {
  const nv = obterNivel(nivelId);
  const tipo = nv.tipos[inteiroEntre(0, nv.tipos.length - 1)];
  const f = nv.faixa || {};

  // O nível 12 mistura tudo, então cada tipo usa a faixa que faz sentido
  // pra ele em vez de uma faixa única que não serve pras quatro operações.
  const faixaDoTipo = (tipo === 'multiplicacao' || tipo === 'divisao')
    ? { tabuadas: f.tabuadas, max: f.max10 || f.max || 10 }
    : f;

  let a, b;
  switch (tipo) {
    case 'soma':          [a, b] = sortearSoma(faixaDoTipo); break;
    case 'subtracao':     [a, b] = sortearSubtracao(faixaDoTipo); break;
    case 'multiplicacao': [a, b] = sortearMultiplicacao(faixaDoTipo); break;
    case 'divisao':       [a, b] = sortearDivisao(faixaDoTipo); break;
  }

  return montarPergunta(a, b, tipo, nv.id);
}

// Compatibilidade: código antigo que ainda chama gerarPergunta('facil').
function gerarPergunta(dificuldadeOuNivel) {
  if (typeof dificuldadeOuNivel === 'number') return gerarPerguntaDoNivel(dificuldadeOuNivel);
  return gerarPerguntaDoNivel(nivelDaDificuldadeAntiga(dificuldadeOuNivel));
}
