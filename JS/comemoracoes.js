// comemoracoes.js — comemorações de gol que a criança escolhe (v2.2).
//
// O catálogo (nome, ícone e como ganhar) mora aqui; a animação de cada uma
// está em game.js (COMEMORACOES_3D, mesmo id). No modo simplificado (2D) e
// com "reduzir movimento" o boneco faz a pose final sem o movimento.
//
// Como a criança ganha cada uma:
//   - grátis desde o início;
//   - comprada na Loja (aba "Comemorações"), id na carteira = "comemoracao:<id>";
//   - prêmio de uma conquista (conquistas.js).
//
// O id escolhido mora no perfil local (conta.js → perfil.comemoracao).

var COMEMORACOES = [
  { id: 'classica',   icone: '🙌', nome: 'Clássica',            descricao: 'Dois pulos e soco no ar.',              origem: 'gratis' },
  { id: 'aviaozinho', icone: '✈️', nome: 'Aviãozinho',          descricao: 'Braços abertos, voando pelo gramado.',   origem: 'gratis' },
  { id: 'dancinha',   icone: '🕺', nome: 'Dancinha',            descricao: 'Requebra e mexe os braços no ritmo.',    origem: 'gratis' },
  { id: 'coracao',    icone: '🫶', nome: 'Coração',             descricao: 'Faz um coração para a torcida.',         origem: 'loja', preco: 150 },
  { id: 'robo',       icone: '🤖', nome: 'Robô',                descricao: 'Dança do robô, travadinha.',             origem: 'loja', preco: 200 },
  { id: 'joelhada',   icone: '🧎', nome: 'Joelhada',            descricao: 'Corre e desliza de joelhos.',            origem: 'loja', preco: 250 },
  { id: 'giro',       icone: '🌀', nome: 'Giro no Ar (Siuuu!)', descricao: 'Pula, gira no ar e cai de braços abertos.', origem: 'loja', preco: 350 },
  { id: 'seis-sete',  icone: '🤲', nome: 'Seis-Sete!',          descricao: 'As mãozinhas do 6-7 sobem e descem.',     origem: 'conquista', conquista: 'seis-sete' },
  { id: 'aura',       icone: '✨', nome: 'Aura Máxima',         descricao: 'Braços cruzados e um brilho dourado.',   origem: 'conquista', conquista: 'aura-maxima' }
];

var COMEMORACAO_PADRAO = 'classica';

function comemoracaoPorId(id) {
  for (var i = 0; i < COMEMORACOES.length; i++) if (COMEMORACOES[i].id === id) return COMEMORACOES[i];
  return null;
}

function comemoracaoDisponivel(c) {
  if (!c) return false;
  if (c.origem === 'gratis') return true;
  if (c.origem === 'loja') return typeof Carteira !== 'undefined' && Carteira.possui('comemoracao:' + c.id);
  if (c.origem === 'conquista') return typeof Conquistas !== 'undefined' && Conquistas.feita(c.conquista);
  return false;
}

function comoGanharComemoracao(c) {
  if (c.origem === 'loja') return 'Na Loja';
  if (c.origem === 'conquista' && typeof Conquistas !== 'undefined') {
    var q = Conquistas.porId(c.conquista);
    return q ? 'Conquista: ' + q.nome : 'Conquista';
  }
  return '';
}
