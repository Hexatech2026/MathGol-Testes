// narration.js — camada fina sobre a Web Speech API (SpeechSynthesis) do
// navegador. Sem custo, sem serviço externo. Pode ser ligada/desligada pela
// criança no menu de acessibilidade.
//
// Garante fala única por vez: qualquer chamada nova (ou cancelamento
// explícito) cancela a fala pendente antes de iniciar outra, evitando
// falas concorrentes/repetidas ao trocar de pergunta ou de tela. Guarda o
// último texto falado para permitir "Ouvir novamente" sem duplicar lógica
// em quem chama.
//
// ───────────────────────────────────────────────────────────────────────
// AJUSTE MANUAL DA VOZ — é aqui que se mexe
// ───────────────────────────────────────────────────────────────────────
// Duas coisas deixavam a narração sem graça:
//
//   1. A voz era a PRIMEIRA voz pt- que o navegador listasse. Em quase
//      todo Windows isso cai numa voz velha e robótica, mesmo quando há
//      uma voz natural instalada ao lado. Agora existe um ranking
//      (VOZES_PREFERIDAS) que procura as boas primeiro.
//
//   2. Tudo era falado com o mesmo rate e o mesmo pitch: a pergunta, o
//      gol e a defesa saíam no mesmo tom morto. Agora cada situação tem
//      seu TOM (tabela TONS abaixo).
//
// Para ajustar, mexa SÓ nas duas tabelas abaixo. Use a página
// Docs/laboratorio-de-voz.html para testar os valores antes de colar aqui:
// ela lista as vozes da máquina e deixa arrastar rate/pitch ouvindo as
// frases reais do jogo.
//
// rate  = velocidade. 1 é o normal. Abaixo de 0,8 arrasta; acima de 1,25
//         a criança perde o número da conta.
// pitch = altura. 1 é o normal. Acima de 1,4 fica estridente no alto-falante
//         de Chromebook; abaixo de 0,9 fica pesado demais para criança.
// volume= 0 a 1.
//
// ───────────────────────────────────────────────────────────────────────
// v2.1 — FALAS GRAVADAS (locutor de verdade)
// ───────────────────────────────────────────────────────────────────────
// Quando a frase pedida existe em JS/falas.js (pelo id em opcoes.fala ou
// pelo próprio texto), toca o MP3 de Audio/falas/. Se o arquivo não
// carregar ou o navegador bloquear o som, cai na voz sintetizada com o
// mesmo texto — a criança nunca fica sem a fala.
//
// opcoes.esperar: em vez de cortar o locutor, espera a fala atual acabar
// (ex.: "Gol!" e logo depois "GOLAÇO! Você é um craque da matemática!").
// tempoRestante(): quanto ainda falta de fala gravada (com a da fila). O
// main.js usa para a próxima pergunta não cortar o locutor no meio.

const Narracao = (() => {
  let ativa = true;
  let vozPt = null;
  let ultimoTexto = '';
  let ultimoTom = 'padrao';
  let ultimaFala = null;
  let vozForcada = null; // nome exato de voz, se a equipe fixar uma

  // ── TABELA 1: que voz usar ────────────────────────────────────────────
  // Procurada na ordem. O teste é "o nome da voz CONTÉM este texto",
  // sem acento e sem diferenciar maiúscula. A primeira que existir na
  // máquina vence. Não achando nenhuma, cai em qualquer voz pt-.
  //
  // A ordem foi montada das vozes mais naturais para as mais sintéticas:
  // as "Natural"/"Online" da Microsoft e as do Google soam bem melhor que
  // as locais antigas (Daniel/Maria), que são as que vinham sendo pegas.
  // v2.1: o locutor gravado é homem; a conta (que continua sintetizada)
  // soa mais coerente com uma voz masculina natural, então Antonio subiu.
  const VOZES_PREFERIDAS = [
    'antonio',            // Windows · pt-BR natural (voz masculina)
    'francisca',          // Windows 11 · pt-BR natural, muito clara
    'thalita',            // Windows 11 · pt-BR natural
    'brenda',             // Windows · pt-BR natural
    'google portugues do brasil',
    'google português do brasil',
    'luciana',            // macOS / iOS · pt-BR
    'joana',              // macOS · pt-PT, serve de reserva
    'daniel',             // Windows local antiga — penúltimo recurso
    'maria'               // Windows local antiga
  ];

  // ── TABELA 2: como falar cada coisa ───────────────────────────────────
  // Mexa nos números daqui para deixar mais ou menos animado.
  const TONS = {
    // A conta. Tem que ser a fala mais clara do jogo: devagar e neutra.
    pergunta:  { rate: 0.92, pitch: 1.02, volume: 1 },
    // Gol. É o momento de festa: rápido e agudo.
    gol:       { rate: 1.18, pitch: 1.38, volume: 1 },
    // Quase: bola fora, na trave. Animado, mas sem festa.
    quase:     { rate: 1.06, pitch: 1.15, volume: 1 },
    // Defesa / erro. Acolhedor, nunca de repreensão: mais devagar e mais
    // grave do que o normal. Subir o pitch aqui soa como deboche.
    defesa:    { rate: 0.94, pitch: 0.96, volume: 0.95 },
    // Fim da fase, resumo do placar.
    resultado: { rate: 1.0,  pitch: 1.12, volume: 1 },
    // Compra na Loja: comemoração curta.
    premio:    { rate: 1.1,  pitch: 1.3,  volume: 1 },
    // Tutorial e textos de instrução: didático, sem pressa.
    instrucao: { rate: 0.9,  pitch: 1.05, volume: 1 },
    // Qualquer chamada que não informe o tom.
    padrao:    { rate: 0.95, pitch: 1.05, volume: 1 }
  };

  function semAcento(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function carregarVoz() {
    if (!('speechSynthesis' in window)) return;
    const vozes = window.speechSynthesis.getVoices();
    if (!vozes.length) return;
    const emPt = vozes.filter(v => v.lang && v.lang.toLowerCase().startsWith('pt'));
    const candidatas = emPt.length ? emPt : vozes;

    // 1) voz fixada pela equipe, se houver
    if (vozForcada) {
      const fixa = vozes.find(v => semAcento(v.name) === semAcento(vozForcada));
      if (fixa) { vozPt = fixa; return; }
    }
    // 2) ranking de qualidade
    for (const alvo of VOZES_PREFERIDAS) {
      const achada = candidatas.find(v => semAcento(v.name).indexOf(semAcento(alvo)) !== -1);
      if (achada) { vozPt = achada; return; }
    }
    // 3) pt-BR antes de pt-PT; depois qualquer pt-
    vozPt = emPt.find(v => v.lang.toLowerCase() === 'pt-br') || emPt[0] || null;
  }

  if ('speechSynthesis' in window) {
    carregarVoz();
    // A lista de vozes chega assíncrona em quase todo navegador: sem este
    // callback a primeira fala sai com a voz padrão do sistema.
    window.speechSynthesis.onvoiceschanged = carregarVoz;
  }

  // Cancela qualquer fala em andamento/enfileirada. Chamado antes de toda
  // nova fala e também ao trocar de tela ou desligar a narração, para nunca
  // deixar fala antiga "vazando" para o contexto seguinte.
  // ── Falas gravadas ────────────────────────────────────────────────────
  const audios = {};        // id -> <audio>, criado uma vez e reaproveitado
  let audioAtual = null;    // { id, el, fimEm } da fala gravada tocando
  let fila = null;          // { texto, opcoes } esperando a fala atual acabar
  // v2.2 — UMA voz por vez. Relato da equipe: com a criança rápida, saíam
  // duas vozes juntas. Causa: speechSynthesis.cancel() não cala na hora
  // as vozes "Online"/naturais do Chrome (o áudio já veio da rede), e a
  // gravação seguinte começava por cima. Agora toda fala tem uma GERAÇÃO:
  // qualquer coisa de uma geração antiga que tente começar é descartada, e
  // a gravação só começa depois de a síntese calar de verdade.
  let geracao = 0;
  const ESPERA_SILENCIO_MS = 400;

  function temGravacoes() { return typeof Falas !== 'undefined' && typeof Audio !== 'undefined'; }

  function audioDa(id) {
    if (!audios[id]) {
      const el = new Audio();
      el.preload = 'auto';
      el.src = Falas.PASTA + id + '.mp3';
      audios[id] = el;
    }
    return audios[id];
  }

  // Baixa antes as falas que vão ser usadas (ex.: as da partida).
  function preCarregar(ids) {
    if (!temGravacoes()) return;
    (ids || []).forEach(function(id) { if (Falas.existe(id)) audioDa(id); });
  }

  function falaDoPedido(texto, opcoes) {
    if (!temGravacoes()) return null;
    if (opcoes && opcoes.fala && Falas.existe(opcoes.fala)) return opcoes.fala;
    return Falas.idDoTexto(texto);
  }

  function pararGravada() {
    if (!audioAtual) return;
    const el = audioAtual.el;
    audioAtual = null;
    try { el.pause(); el.currentTime = 0; } catch (e) {}
  }

  function terminouGravada(el) {
    if (!audioAtual || audioAtual.el !== el) return;
    audioAtual = null;
    if (fila) { const proxima = fila; fila = null; falar(proxima.texto, proxima.opcoes); }
  }

  // Nenhuma outra gravação tocando (nem uma que escapou do audioAtual).
  function calarTodasAsGravacoes(excetoEl) {
    Object.keys(audios).forEach(function(k) {
      const el = audios[k];
      if (el !== excetoEl && !el.paused) { try { el.pause(); el.currentTime = 0; } catch (e) {} }
    });
  }

  function sinteseFalando() {
    return 'speechSynthesis' in window && (window.speechSynthesis.speaking || window.speechSynthesis.pending);
  }

  function calarSintese() {
    if (!('speechSynthesis' in window)) return;
    try { window.speechSynthesis.pause(); } catch (e) {}
    try { window.speechSynthesis.cancel(); } catch (e) {}
  }

  // Espera a síntese calar (no máximo ESPERA_SILENCIO_MS) e só então
  // começa — se ainda for a fala da vez.
  function quandoEmSilencio(minhaGeracao, fn) {
    const inicio = Date.now();
    (function conferir() {
      if (minhaGeracao !== geracao) return;
      if (!sinteseFalando() || Date.now() - inicio >= ESPERA_SILENCIO_MS) {
        if (sinteseFalando()) calarSintese();
        try { window.speechSynthesis && window.speechSynthesis.resume(); } catch (e) {}
        fn();
        return;
      }
      setTimeout(conferir, 40);
    })();
  }

  function tocarGravada(id, texto, ajuste) {
    const el = audioDa(id);
    calarTodasAsGravacoes(el);
    const duracao = isFinite(el.duration) && el.duration > 0 ? el.duration * 1000 : Falas.duracao(id);
    audioAtual = { id: id, el: el, fimEm: Date.now() + duracao };
    el.volume = ajuste.volume;
    el.onended = function() { terminouGravada(el); };
    try { el.currentTime = 0; } catch (e) {}
    let promessa;
    try { promessa = el.play(); } catch (e) { promessa = Promise.reject(e); }
    if (promessa && typeof promessa.catch === 'function') {
      promessa.catch(function() {
        // Sem arquivo, sem rede ou som bloqueado pelo navegador: a mesma
        // frase sai na voz sintetizada.
        if (!audioAtual || audioAtual.el !== el) return;
        audioAtual = null;
        falarSintetizado(texto, ajuste);
        if (fila) { const proxima = fila; fila = null; falar(proxima.texto, proxima.opcoes); }
      });
    }
  }

  function falarSintetizado(texto, ajuste) {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = 'pt-BR';
    if (vozPt) utterance.voice = vozPt;
    utterance.rate = ajuste.rate;
    utterance.pitch = ajuste.pitch;
    utterance.volume = ajuste.volume;
    // O Chrome guarda o pause() de calarSintese() mesmo depois do cancel():
    // sem o resume() a fala nova ficaria presa na fila, muda.
    try { window.speechSynthesis.resume(); } catch (e) {}
    window.speechSynthesis.speak(utterance);
  }

  // Quanto falta (ms) de fala gravada, contando a que está na fila.
  function tempoRestante() {
    let ms = audioAtual ? Math.max(0, audioAtual.fimEm - Date.now()) : 0;
    if (audioAtual && fila) {
      const idFila = falaDoPedido(fila.texto, fila.opcoes);
      if (idFila) ms += Falas.duracao(idFila);
    }
    return ms;
  }

  function cancelar() {
    geracao++;
    fila = null;
    pararGravada();
    calarTodasAsGravacoes(null);
    calarSintese();
  }

  // opcoes.forcar: fala mesmo com a narração automática desligada — usado
  //   quando a criança PEDE para ouvir (botão "Ouvir novamente", tutorial).
  // opcoes.tom: chave da tabela TONS. Tom desconhecido cai em 'padrao'.
  // opcoes.fala: id da gravação (JS/falas.js); sem ele, procura pelo texto.
  // opcoes.esperar: deixa a fala gravada atual terminar antes desta.
  function falar(texto, opcoes) {
    if (!texto) return;
    var forcar = !!(opcoes && opcoes.forcar);
    var tom = (opcoes && opcoes.tom && TONS[opcoes.tom]) ? opcoes.tom : 'padrao';
    ultimoTexto = texto;
    ultimoTom = tom;
    ultimaFala = opcoes && opcoes.fala ? opcoes.fala : null;
    if (!ativa && !forcar) return;
    if (opcoes && opcoes.esperar && audioAtual) {
      fila = { texto: texto, opcoes: Object.assign({}, opcoes, { esperar: false }) };
      return;
    }
    const aindaFalando = sinteseFalando();
    cancelar();
    const minha = geracao;
    const ajuste = TONS[tom];
    const id = falaDoPedido(texto, opcoes);
    const comecar = function() {
      if (minha !== geracao) return;
      if (id) tocarGravada(id, texto, ajuste); else falarSintetizado(texto, ajuste);
    };
    // A síntese anterior ainda soando: espera ela calar antes de começar.
    if (aindaFalando) quandoEmSilencio(minha, comecar); else comecar();
  }

  // Repete o último texto falado (ex.: botão "Ouvir novamente"), sem alterar
  // nenhum estado do jogo (cronômetro, pontuação etc.) — é responsabilidade
  // de quem chama decidir *o que* deve ser repetido, guardando o texto certo
  // antes de chamar falar(). Repete no MESMO tom em que foi dito.
  function repetir() {
    if (!ultimoTexto) return;
    falar(ultimoTexto, { tom: ultimoTom, fala: ultimaFala || undefined });
  }

  function alternar(valor) {
    ativa = valor;
    if (!ativa) cancelar();
  }

  function estaAtiva() {
    return ativa;
  }

  // ── Ferramentas de ajuste (usadas pelo laboratório de voz) ────────────
  // Lista o que a máquina tem, para a equipe escolher sem adivinhar.
  function vozesDisponiveis() {
    if (!('speechSynthesis' in window)) return [];
    return window.speechSynthesis.getVoices()
      .filter(v => v.lang && v.lang.toLowerCase().startsWith('pt'))
      .map(v => ({ nome: v.name, lang: v.lang, local: v.localService }));
  }

  function vozEmUso() {
    return vozPt ? { nome: vozPt.name, lang: vozPt.lang, local: vozPt.localService } : null;
  }

  // Fixa uma voz pelo nome exato (ou null para voltar ao ranking).
  function fixarVoz(nome) {
    vozForcada = nome || null;
    carregarVoz();
    return vozEmUso();
  }

  // Lê/ajusta um tom em tempo de execução — o laboratório usa isto para
  // deixar a equipe testar antes de colar os números na tabela TONS.
  function tom(nome, novo) {
    if (!TONS[nome]) return null;
    if (novo) {
      if (typeof novo.rate === 'number') TONS[nome].rate = novo.rate;
      if (typeof novo.pitch === 'number') TONS[nome].pitch = novo.pitch;
      if (typeof novo.volume === 'number') TONS[nome].volume = novo.volume;
    }
    return Object.assign({}, TONS[nome]);
  }

  // Para diagnóstico e testes: id da gravação tocando agora (ou null).
  function falaGravadaAtual() { return audioAtual ? audioAtual.id : null; }

  return {
    falar, repetir, cancelar, alternar, estaAtiva,
    vozesDisponiveis, vozEmUso, fixarVoz, tom,
    preCarregar, tempoRestante, falaGravadaAtual
  };
})();
