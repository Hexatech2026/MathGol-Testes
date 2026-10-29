// titulos.js — titulos do craque (v2.2).
//
// O titulo aparece embaixo do nome: no cartao do menu, no perfil e no
// painel do professor. A crianca escolhe um em "Meu craque". Cada titulo
// tem uma origem:
//   - gratis desde o inicio;
//   - premio de uma conquista (conquistas.js) — "conquista: <id>".
//
// Alguns usam as gírias que estão na moda entre as crianças (6-7, aura,
// ego, brabo). Sempre no sentido positivo: nada de deboche com quem erra.
//
// O id escolhido mora no perfil local (conta.js → perfil.titulo) e vai
// junto no estado da nuvem. Id desconhecido volta para o padrao.

var TITULOS = [
  { id: 'estreante',      texto: 'Estreante',               origem: 'gratis' },
  { id: 'boleiro',        texto: 'Boleiro de Fé',           origem: 'gratis' },
  { id: 'aprendiz',       texto: 'Aprendiz das Contas',     origem: 'gratis' },
  { id: 'artilheiro',     texto: 'Artilheiro',              origem: 'conquista', conquista: 'gols-10' },
  { id: 'calculadora',    texto: 'Calculadora Humana',      origem: 'conquista', conquista: 'contas-10' },
  { id: 'relampago',      texto: 'Mais Rápido que o Raio',  origem: 'conquista', conquista: 'relampago' },
  { id: 'seis-sete',      texto: 'Seis-Sete! 🤲',           origem: 'conquista', conquista: 'seis-sete' },
  { id: 'aura',           texto: '+1000 de Aura',           origem: 'conquista', conquista: 'aura-maxima' },
  { id: 'ego',            texto: 'Ego de Campeão',          origem: 'conquista', conquista: 'ego-campeao' },
  { id: 'brabo',          texto: 'Brabo das Contas',        origem: 'conquista', conquista: 'contas-50' },
  { id: 'maquina',        texto: 'Máquina de Calcular',     origem: 'conquista', conquista: 'contas-100' },
  { id: 'lenda',          texto: 'Lenda do Gol',            origem: 'conquista', conquista: 'gols-50' },
  { id: 'rei-do-gol',     texto: 'Rei do Gol',              origem: 'conquista', conquista: 'gols-100' },
  { id: 'raiz',           texto: 'Craque Raiz',             origem: 'conquista', conquista: 'partidas-25' },
  { id: 'mundialista',    texto: 'Mundialista',             origem: 'conquista', conquista: 'copa-estreia' },
  { id: 'finalista',      texto: 'Finalista da Copa',       origem: 'conquista', conquista: 'copa-final' },
  { id: 'campeao-mundo',  texto: 'Campeão do Mundo 🏆',     origem: 'conquista', conquista: 'copa-campeao' },
  { id: 'nervos-de-aco',  texto: 'Nervos de Aço',           origem: 'conquista', conquista: 'morte-subita' },
  { id: 'var',            texto: 'Aprovado pelo VAR',       origem: 'conquista', conquista: 'var-aprovado' },
  { id: 'resenha',        texto: 'Rei da Resenha',          origem: 'conquista', conquista: 'duelo' },
  { id: 'botao',          texto: 'Mestre do Botão',         origem: 'conquista', conquista: 'botao-vitoria' },
  { id: 'mito',           texto: 'Mito',                    origem: 'conquista', conquista: 'medalhas-20' }
];

var TITULO_PADRAO = 'estreante';

function tituloPorId(id) {
  for (var i = 0; i < TITULOS.length; i++) if (TITULOS[i].id === id) return TITULOS[i];
  return null;
}

function tituloDisponivel(t) {
  if (!t) return false;
  if (t.origem === 'gratis') return true;
  if (t.origem === 'conquista') return typeof Conquistas !== 'undefined' && Conquistas.feita(t.conquista);
  return false;
}

function comoGanharTitulo(t) {
  if (t.origem === 'conquista' && typeof Conquistas !== 'undefined') {
    var c = Conquistas.porId(t.conquista);
    return c ? 'Conquista: ' + c.nome : 'Conquista';
  }
  return '';
}
