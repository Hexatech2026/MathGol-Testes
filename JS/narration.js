// narration.js — camada fina sobre a Web Speech API (SpeechSynthesis) do
// navegador. Sem custo, sem serviço externo. Pode ser ligada/desligada pela
// criança no menu de acessibilidade.
//
// Garante fala única por vez: qualquer chamada nova (ou cancelamento
// explícito) cancela a fala pendente antes de iniciar outra, evitando
// falas concorrentes/repetidas ao trocar de pergunta ou de tela. Guarda o
// último texto falado para permitir "Ouvir novamente" sem duplicar lógica
// em quem chama.

const Narracao = (() => {
  let ativa = true;
  let vozPt = null;
  let ultimoTexto = '';

  function carregarVoz() {
    if (!('speechSynthesis' in window)) return;
    const vozes = window.speechSynthesis.getVoices();
    vozPt = vozes.find(v => v.lang && v.lang.toLowerCase().startsWith('pt')) || null;
  }

  if ('speechSynthesis' in window) {
    carregarVoz();
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

  function falar(texto) {
    if (!texto) return;
    ultimoTexto = texto;
    if (!ativa || !('speechSynthesis' in window)) return;
    cancelar();
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = 'pt-BR';
    if (vozPt) utterance.voice = vozPt;
    utterance.rate = 0.95;
    utterance.pitch = 1.05;
    window.speechSynthesis.speak(utterance);
  }

  // Repete o último texto falado (ex.: botão "Ouvir novamente"), sem alterar
  // nenhum estado do jogo (cronômetro, pontuação etc.) — é responsabilidade
  // de quem chama decidir *o que* deve ser repetido, guardando o texto certo
  // antes de chamar falar().
  function repetir() {
    if (!ultimoTexto) return;
    falar(ultimoTexto);
  }

  function alternar(valor) {
    ativa = valor;
    if (!ativa) cancelar();
  }

  function estaAtiva() {
    return ativa;
  }

  return { falar, repetir, cancelar, alternar, estaAtiva };
})();
