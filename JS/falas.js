// falas.js — catalogo das falas GRAVADAS pelo locutor (Audio/falas/*.mp3).
//
// Gravadas a partir de Docs/Dreamina-Takes-MathGol.txt: cada id abaixo e
// o codigo entre colchetes do roteiro, e o texto e EXATAMENTE o que foi
// lido. A narracao (narration.js) toca o arquivo quando o jogo pede uma
// destas frases; o que nao foi gravado (a conta da vez, "Agora X e seu!")
// continua na voz sintetizada do navegador.
//
// O jogo pode pedir a fala de dois jeitos:
//   - pelo id:    Narracao.falar(texto, { fala: 'tutorial-03' })
//   - pelo texto: Narracao.falar('Gol!') — o texto e comparado sem
//     acento, maiuscula, pontuacao nem emoji (ver chave()), entao "❌" ou
//     uma virgula a mais nao impedem de achar a gravacao.
//
// duracao (ms): medida nos arquivos. Serve para o jogo saber quanto falta
// do locutor ANTES do navegador terminar de baixar o audio.
//
// Para trocar uma fala: grave de novo com o MESMO id, substitua o arquivo
// em Audio/falas/ e, se o texto mudou, atualize aqui.

(function(raiz) {
  'use strict';

  var FALAS = {
    // Take 1 — comemoracao
    'gol-01': ['Gol!', 730],
    'gol-02': ['GOLAÇO! Você é um craque da matemática!', 2530],
    'gol-03': ['INCRÍVEL! Resposta e chute perfeitos!', 2870],
    'gol-04': ['QUE GOL! A conta certa virou gol!', 2530],
    'gol-05': ['ESPETACULAR! Matemática e futebol juntos!', 2740],
    'gol-06': ['SHOW DE BOLA! Você acertou tudo!', 2270],
    'acerto-01': ['Conta certa! Agora é o chute!', 2040],
    'acerto-02': ['Isso! Resposta correta!', 1800],
    'acerto-03': ['Acertou! Prepara o pé!', 1490],
    // Take 2 — erro e consolo
    'quase-01': ['Quase lá! Sua conta estava certinha, você é muito inteligente. Tente o chute de novo, você consegue!', 6160],
    'quase-02': ['A conta você matou! Faltou só o chute. Na próxima a bola entra!', 4210],
    'quase-03': ['Isso! A matemática estava perfeita. Agora é só caprichar na pontaria!', 4780],
    'quase-04': ['Você acertou o mais difícil, que era a conta. O gol vem na próxima!', 4180],
    'fora-01': ['Chute fraco! A bola não chegou.', 1850],
    'fora-02': ['Forte demais! Por cima do gol.', 2220],
    'fora-03': ['Pra fora!', 970],
    'defesa-01': ['O goleiro defendeu!', 1440],
    'defesa-02': ['Tempo esgotado! O goleiro defendeu.', 2640],
    'conta-01': ['Não foi dessa vez! Vamos tentar a próxima conta juntos?', 3470],
    'conta-02': ['Ops! Essa escapou. A próxima é sua!', 2640],
    'conta-03': ['Errar faz parte do treino. Bora para a próxima!', 3110],
    // Take 3 — fim da fase
    'fim-00-01': ['Valeu por jogar! Bora treinar mais e voltar pra fazer gol!', 3580],
    'fim-00-02': ['Hoje o goleiro tava inspirado! Tenta de novo, você consegue!', 3600],
    'fim-00-03': ['Não desiste! Cada tentativa te deixa mais craque!', 3370],
    'fim-00-04': ['O importante é tentar! Vamos de novo?', 2590],
    'fim-01-01': ['Bom começo! Você já fez um gol, bora buscar mais!', 3240],
    'fim-01-02': ['Um gol é só o aquecimento! Tenta de novo pra fazer mais!', 3600],
    'fim-01-03': ['Já tá no caminho certo! Mais uma rodada e você arrebenta!', 3580],
    'fim-01-04': ['Boa! Um gol já é vitória! Quer tentar fazer dois agora?', 3790],
    'fim-02-01': ['Quase perfeito! Faltou só um golzinho! Tenta de novo!', 3710],
    'fim-02-02': ['Dois gols! Tá quase lá, falta só um pra fase perfeita!', 3470],
    'fim-02-03': ['Impressionante! Mais uma tentativa e você fecha com 3!', 3660],
    'fim-02-04': ['Show! Dois de três! Bora buscar a fase perfeita?', 3290],
    'fim-03-01': ['FASE PERFEITA! Você é o Craque das Contas!', 2640],
    'fim-03-02': ['Três de três! Ninguém segura você! Bora pro próximo desafio!', 4020],
    'fim-03-03': ['Perfeito! Acho que esse nível tá fácil demais pra você!', 3580],
    'fim-03-04': ['Goleada! Manda bem assim no próximo nível também!', 3290],
    'fim-03-05': ['Hat-trick de contas certas! Você é fera demais!', 3420],
    'fim-ger-01': ['Bom começo! Você já balançou a rede, bora buscar mais!', 3600],
    'fim-ger-02': ['Já tá no caminho certo! Mais uma rodada e você arrebenta!', 3370],
    'fim-ger-03': ['Muito bem! Mais da metade das cobranças viraram gol!', 3580],
    'fim-ger-04': ['Show! Falta pouco pra fase perfeita!', 2530],
    'fim-ger-05': ['FASE PERFEITA! Você é o Craque das Contas!', 2640],
    'fim-ger-06': ['Nenhuma cobrança perdida! Ninguém segura você!', 2870],
    // Take 4 — tutorial (o jogo pede pelo id: o titulo na tela tem numero)
    'tutorial-01': ['Responda a conta. Leia a conta e toque na resposta certa antes do tempo acabar. Quanto mais rápido você responder, mais Cruzeiros ganha no gol!', 9220],
    'tutorial-02': ['Errou? O goleiro defende. Se a resposta estiver errada ou o tempo acabar, o goleiro pega a bola. Sem problema: na próxima cobrança você tenta de novo!', 9610],
    'tutorial-03': ['Acertou? Mire no gol! Com a conta certa, você escolhe onde chutar. Mova a mira com o dedo, o mouse ou as setas e toque para travar. Se a mira ficar vermelha, ela está fora do gol!', 12070],
    'tutorial-04': ['Escolha o tipo de chute. A barra vai e volta sozinha. Toque para escolher: Rasteiro, bola baixinha; Meia-altura, vai onde você mirou; ou Cavadinha, bola por cima, com toque leve.', 12490],
    'tutorial-05': ['Acerte a força. Agora a barra de força enche e esvazia. Toque quando ela estiver na faixa verde ideal. Fraco demais, a bola não chega. Forte demais, passa por cima do gol!', 11550],
    'tutorial-06': ['Gol! Ganhe Cruzeiros. Cada gol vale Cruzeiros. Junte seus Cruzeiros e compre seleções, times do Brasileirão, avatares e nomes novos na Loja. Bora jogar!', 10890]
  };

  // Falas da partida: baixadas quando a partida comeca, para o gol nao
  // esperar a rede. As do fim e do tutorial sao baixadas so quando usadas.
  var DA_PARTIDA = Object.keys(FALAS).filter(function(id) {
    return /^(gol|acerto|quase|fora|defesa|conta)-/.test(id);
  });

  // Texto -> chave de comparacao: sem acento, minusculo, so letras e
  // numeros separados por um espaco.
  function chave(texto) {
    return String(texto || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  var PORCHAVE = {};
  Object.keys(FALAS).forEach(function(id) {
    var k = chave(FALAS[id][0]);
    if (!PORCHAVE[k]) PORCHAVE[k] = id; // textos repetidos usam a primeira gravacao
  });

  var Falas = {
    PASTA: '../Audio/falas/',
    existe: function(id) { return Object.prototype.hasOwnProperty.call(FALAS, id); },
    texto: function(id) { return FALAS[id] ? FALAS[id][0] : ''; },
    duracao: function(id) { return FALAS[id] ? FALAS[id][1] : 0; },
    idDoTexto: function(texto) { return PORCHAVE[chave(texto)] || null; },
    ids: function() { return Object.keys(FALAS); },
    daPartida: function() { return DA_PARTIDA.slice(); },
    chave: chave
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Falas;
  else raiz.Falas = Falas;
})(typeof window !== 'undefined' ? window : this);
