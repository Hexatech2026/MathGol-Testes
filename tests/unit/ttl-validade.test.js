// HU-20 — o campo que a política de TTL do Firestore vai usar.
//
// POR QUE ESTE TESTE EXISTE
// O TTL apaga o documento quando o campo aponta para um instante JÁ
// PASSADO ("If the value is a time in the past, the document is
// immediately eligible for deletion"). O documento do jogador tem
// "ultimoAcessoEm", que guarda a hora da última entrada e por isso está
// sempre no passado: criar a política sobre ele apagaria TODO perfil de
// criança em 24 h — progresso, Cruzeiros, conquistas e histórico.
//
// A política tem de ser criada sobre "expiraEm", que guarda a data de
// validade (hoje + 12 meses) e é empurrada para a frente a cada acesso.
// Este teste trava essa diferença no código.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'JS', 'firebase-config.js'), 'utf8');

test('a validade do jogador soma um prazo ao agora (nunca é o agora)', () => {
  assert.match(SRC, /function validadeDoJogador\(\)\s*\{\s*return daquiA\(/,
    'validadeDoJogador deve somar um prazo ao instante atual');
  assert.doesNotMatch(SRC, /expiraEm:\s*serverTimestamp\(\)/,
    'expiraEm NUNCA pode receber a hora atual: o TTL apagaria o documento em 24 h');
});

test('toda gravação no documento do jogador renova a validade', () => {
  // O carimbo único evita que um ponto de gravação novo esqueça o campo e
  // deixe o perfil com a validade velha.
  assert.match(SRC, /function marcaDeAcesso\(\)[\s\S]*?ultimoAcessoEm: serverTimestamp\(\)[\s\S]*?expiraEm: validadeDoJogador\(\)/,
    'marcaDeAcesso deve gravar ultimoAcessoEm e expiraEm juntos');

  // Nenhuma gravação solta de ultimoAcessoEm fora do carimbo.
  const soltas = SRC.split('\n')
    .map((linha, i) => ({ linha, n: i + 1 }))
    .filter(x => /ultimoAcessoEm:\s*serverTimestamp\(\)/.test(x.linha))
    .filter(x => !/function marcaDeAcesso/.test(SRC.slice(Math.max(0, SRC.indexOf(x.linha) - 200), SRC.indexOf(x.linha))));
  assert.strictEqual(soltas.length, 0,
    'ultimoAcessoEm gravado fora de marcaDeAcesso() na(s) linha(s): ' + soltas.map(x => x.n).join(', '));
});

test('os três prazos da política de dados estão declarados', () => {
  // Mudar aqui exige mudar Docs/POLITICA-DE-DADOS.md junto.
  assert.match(SRC, /const DIAS_SALA = 30;/);
  assert.match(SRC, /const HORAS_PARTIDA = 24;/);
  assert.match(SRC, /const DIAS_JOGADOR = 365;/);
});
