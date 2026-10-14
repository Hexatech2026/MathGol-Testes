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

const Narracao = (() => {
  let ativa = true;
  let vozPt = null;
  let ultimoTexto = '';
  let ultimoTom = 'padrao';
  let vozForcada = null; // nome exato de voz, se a equipe fixar uma

  // ── TABELA 1: que voz usar ────────────────────────────────────────────
  // Procurada na ordem. O teste é "o nome da voz CONTÉM este texto",
  // sem acento e sem diferenciar maiúscula. A primeira que existir na
  // máquina vence. Não achando nenhuma, cai em qualquer voz pt-.
  //
  // A ordem foi montada das vozes mais naturais para as mais sintéticas:
  // as "Natural"/"Online" da Microsoft e as do Google soam bem melhor que
  // as locais antigas (Daniel/Maria), que são as que vinham sendo pegas.
  const VOZES_PREFERIDAS = [
    'francisca',          // Windows 11 · pt-BR natural, muito clara
    'thalita',            // Windows 11 · pt-BR natural
    'brenda',             // Windows · pt-BR natural
    'google portugues do brasil',
    'google português do brasil',
    'luciana',            // macOS / iOS · pt-BR
    'joana',              // macOS · pt-PT, serve de reserva
    'antonio',            // Windows · pt-BR natural (voz masculina)
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
  function cancelar() {
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
  }

  // opcoes.forcar: fala mesmo com a narração automática desligada — usado
  //   quando a criança PEDE para ouvir (botão "Ouvir novamente", tutorial).
  // opcoes.tom: chave da tabela TONS. Tom desconhecido cai em 'padrao'.
  function falar(texto, opcoes) {
    if (!texto) return;
    var forcar = !!(opcoes && opcoes.forcar);
    var tom = (opcoes && opcoes.tom && TONS[opcoes.tom]) ? opcoes.tom : 'padrao';
    ultimoTexto = texto;
    ultimoTom = tom;
    if ((!ativa && !forcar) || !('speechSynthesis' in window)) return;
    cancelar();
    const ajuste = TONS[tom];
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = 'pt-BR';
    if (vozPt) utterance.voice = vozPt;
    utterance.rate = ajuste.rate;
    utterance.pitch = ajuste.pitch;
    utterance.volume = ajuste.volume;
    window.speechSynthesis.speak(utterance);
  }

  // Repete o último texto falado (ex.: botão "Ouvir novamente"), sem alterar
  // nenhum estado do jogo (cronômetro, pontuação etc.) — é responsabilidade
  // de quem chama decidir *o que* deve ser repetido, guardando o texto certo
  // antes de chamar falar(). Repete no MESMO tom em que foi dito.
  function repetir() {
    if (!ultimoTexto) return;
    falar(ultimoTexto, { tom: ultimoTom });
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

  return {
    falar, repetir, cancelar, alternar, estaAtiva,
    vozesDisponiveis, vozEmUso, fixarVoz, tom
  };
})();
