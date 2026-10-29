// turma.js — v2.2: ferramentas do professor que ficam SO no navegador dele.
//
//   NomesDaTurma     nome de verdade de cada aluno verificado
//   SalasDoProfessor as salas que este professor criou neste aparelho
//   RelatorioTurma   tabela de desempenho + exportar para Excel e PDF
//
// LGPD — o nome de verdade da crianca NUNCA vai para o Firebase. O jogo
// continua sem pedir nome a ninguem; e o professor quem, se quiser, anota
// "Capitao Tigre = Joao" no proprio computador (localStorage), como faria
// numa folha de chamada. So da para anotar nos alunos VERIFICADOS (com o
// codigo do craque): so eles mantem o mesmo uid em qualquer aparelho, entao
// a anotacao nao se perde nem cai no aluno errado. O botao "Apagar nomes
// deste aparelho" remove tudo. Os arquivos exportados sao gerados aqui
// mesmo no navegador — nada e enviado para servidor nenhum.

var NomesDaTurma = (function() {
  'use strict';
  var CHAVE = 'mathgol_prof_nomes';
  var LIMITE_NOME = 60;

  function ler() {
    try {
      var v = JSON.parse(localStorage.getItem(CHAVE));
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch (e) { return {}; }
  }
  function gravar(mapa) { try { localStorage.setItem(CHAVE, JSON.stringify(mapa)); } catch (e) {} }

  function limpar(texto) {
    return String(texto || '').replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, LIMITE_NOME);
  }

  function nome(codigoSala, uid) {
    var sala = ler()[codigoSala];
    return sala && typeof sala[uid] === 'string' ? sala[uid] : '';
  }

  function definir(codigoSala, uid, texto) {
    var mapa = ler();
    var n = limpar(texto);
    if (!mapa[codigoSala] || typeof mapa[codigoSala] !== 'object') mapa[codigoSala] = {};
    if (n) mapa[codigoSala][uid] = n; else delete mapa[codigoSala][uid];
    if (!Object.keys(mapa[codigoSala]).length) delete mapa[codigoSala];
    gravar(mapa);
    return n;
  }

  function apagarSala(codigoSala) { var m = ler(); delete m[codigoSala]; gravar(m); }
  function apagarTudo() { try { localStorage.removeItem(CHAVE); } catch (e) {} }

  return { nome: nome, definir: definir, apagarSala: apagarSala, apagarTudo: apagarTudo, CHAVE: CHAVE };
})();

var SalasDoProfessor = (function() {
  'use strict';
  var CHAVE = 'mathgol_prof_salas';
  var MAXIMO = 30;

  function listar() {
    try {
      var v = JSON.parse(localStorage.getItem(CHAVE));
      return Array.isArray(v) ? v.filter(function(s) { return s && typeof s.codigo === 'string'; }) : [];
    } catch (e) { return []; }
  }

  // Guarda (ou atualiza) a sala no topo da lista.
  function lembrar(sala) {
    var lista = listar().filter(function(s) { return s.codigo !== sala.codigo; });
    lista.unshift({
      codigo: sala.codigo, nome: String(sala.nome || 'Turma').slice(0, 40),
      nivel: sala.nivel || 1, tipos: Array.isArray(sala.tipos) ? sala.tipos : [],
      usadaEm: new Date().toISOString()
    });
    try { localStorage.setItem(CHAVE, JSON.stringify(lista.slice(0, MAXIMO))); } catch (e) {}
  }

  function esquecer(codigo) {
    var lista = listar().filter(function(s) { return s.codigo !== codigo; });
    try { localStorage.setItem(CHAVE, JSON.stringify(lista)); } catch (e) {}
    NomesDaTurma.apagarSala(codigo);
  }

  return { listar: listar, lembrar: lembrar, esquecer: esquecer };
})();

var RelatorioTurma = (function() {
  'use strict';

  // Bibliotecas so baixadas quando o professor pede o arquivo.
  var URL_XLSX = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  var URL_JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
  var URL_AUTOTABLE = 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js';
  var carregados = {};

  function carregar(url) {
    if (!carregados[url]) {
      carregados[url] = new Promise(function(ok, falha) {
        var s = document.createElement('script');
        s.src = url; s.async = true; s.crossOrigin = 'anonymous';
        var limite = setTimeout(function() { falha(new Error('tempo')); }, 12000);
        s.onload = function() { clearTimeout(limite); ok(); };
        s.onerror = function() { clearTimeout(limite); delete carregados[url]; falha(new Error('rede')); };
        document.head.appendChild(s);
      });
    }
    return carregados[url];
  }

  var COLUNAS = ['Nº', 'Aluno', 'Apelido no jogo', 'Verificado', 'Partidas', 'Contas certas', 'Contas erradas',
    '% de acerto', 'Tempo médio (s)', 'Gols', 'Pontos', 'Nível atual', 'Última partida', 'Nota sugerida (0–10)'];

  function numero(v) { var n = Number(v); return isFinite(n) && n >= 0 ? n : 0; }
  function dataDe(v) {
    if (!v) return '';
    var d = typeof v.toDate === 'function' ? v.toDate() : (typeof v.seconds === 'number' ? new Date(v.seconds * 1000) : new Date(v));
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
  }

  // Uma linha por aluno, ja com os calculos. A nota sugerida e so o % de
  // acerto das contas em escala 0–10 (uma casa): o professor decide a nota.
  function linhas(alunos, codigoSala) {
    var ordenados = alunos.slice().sort(function(a, b) {
      var na = NomesDaTurma.nome(codigoSala, a.uid) || a.apelido || '';
      var nb = NomesDaTurma.nome(codigoSala, b.uid) || b.apelido || '';
      return na.localeCompare(nb, 'pt-BR');
    });
    return ordenados.map(function(al, i) {
      var t = al.totais || {};
      var certas = numero(t.contasCertas), erradas = numero(t.contasErradas);
      var total = certas + erradas;
      var pct = total ? Math.round(1000 * certas / total) / 10 : 0;
      var cobr = numero(t.cobrancas);
      var tempoMedio = cobr ? Math.round(numero(t.tempoRespostaMs) / cobr / 100) / 10 : 0;
      var nomeReal = al.verificado ? NomesDaTurma.nome(codigoSala, al.uid) : '';
      return {
        numero: i + 1,
        aluno: nomeReal || '(sem nome anotado)',
        apelido: al.apelido || 'Craque',
        verificado: al.verificado ? 'Sim' : 'Não',
        partidas: numero(t.partidas),
        certas: certas,
        erradas: erradas,
        acerto: pct,
        tempoMedio: tempoMedio,
        gols: numero(t.gols !== undefined ? t.gols : al.gols),
        pontos: numero(t.pontos !== undefined ? t.pontos : al.pontuacao),
        nivel: al.nivelId ? 'Nível ' + al.nivelId + ' · ' + obterNivel(al.nivelId).nome : '',
        ultima: dataDe(al.ultimaPartidaEm || al.atualizadoEm),
        nota: total ? Math.round(pct) / 10 : ''
      };
    });
  }

  function matriz(ls) {
    return ls.map(function(l) {
      return [l.numero, l.aluno, l.apelido, l.verificado, l.partidas, l.certas, l.erradas,
        l.acerto, l.tempoMedio, l.gols, l.pontos, l.nivel, l.ultima, l.nota];
    });
  }

  function nomeArquivo(sala, ext) {
    var base = String(sala.nome || 'turma').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'turma';
    var hoje = new Date().toISOString().slice(0, 10);
    return 'mathgol-' + base + '-' + sala.codigo.replace('-', '') + '-' + hoje + '.' + ext;
  }

  function baixarBlob(blob, nome) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1500);
  }

  // CSV com ";" e BOM: o Excel brasileiro abre direto, com acento certo.
  function csv(ls) {
    var esc = function(v) { var s = String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var corpo = [COLUNAS].concat(matriz(ls).map(function(r) {
      return r.map(function(v) { return typeof v === 'number' ? String(v).replace('.', ',') : v; });
    })).map(function(r) { return r.map(esc).join(';'); }).join('\r\n');
    return new Blob(['﻿' + corpo], { type: 'text/csv;charset=utf-8' });
  }

  function exportarExcel(sala, alunos) {
    var ls = linhas(alunos, sala.codigo);
    return carregar(URL_XLSX).then(function() {
      var XLSX = window.XLSX;
      var ws = XLSX.utils.aoa_to_sheet([['MathGol — ' + (sala.nome || 'Turma') + ' (sala ' + sala.codigo + ')'],
        ['Gerado em ' + new Date().toLocaleString('pt-BR')], []].concat([COLUNAS]).concat(matriz(ls)));
      ws['!cols'] = COLUNAS.map(function(c, i) { return { wch: i === 1 || i === 2 || i === 11 ? 24 : Math.max(10, c.length + 2) }; });
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Desempenho');
      XLSX.writeFile(wb, nomeArquivo(sala, 'xlsx'));
      return 'xlsx';
    }).catch(function() {
      // Sem internet para a biblioteca: CSV, que o Excel abre igual.
      baixarBlob(csv(ls), nomeArquivo(sala, 'csv'));
      return 'csv';
    });
  }

  function exportarPdf(sala, alunos) {
    var ls = linhas(alunos, sala.codigo);
    return carregar(URL_JSPDF).then(function() { return carregar(URL_AUTOTABLE); }).then(function() {
      var jsPDF = window.jspdf.jsPDF;
      var pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      pdf.setFontSize(16);
      pdf.text('MathGol — ' + (sala.nome || 'Turma') + ' (sala ' + sala.codigo + ')', 40, 40);
      pdf.setFontSize(9);
      pdf.text('Gerado em ' + new Date().toLocaleString('pt-BR') +
        '. Nota sugerida = % de acerto das contas em escala de 0 a 10.', 40, 58);
      pdf.autoTable({
        head: [COLUNAS], body: matriz(ls), startY: 70,
        styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [23, 104, 58] },
        alternateRowStyles: { fillColor: [242, 247, 244] }
      });
      pdf.save(nomeArquivo(sala, 'pdf'));
      return 'pdf';
    }).catch(function() {
      imprimir(sala, ls);
      return 'impressao';
    });
  }

  // Reserva do PDF: abre a tabela numa janela e chama "Imprimir" (o
  // professor escolhe "Salvar como PDF"). Montada com textContent.
  function imprimir(sala, ls) {
    var w = window.open('', '_blank');
    if (!w) return;
    var d = w.document;
    d.title = 'MathGol — ' + (sala.nome || 'Turma');
    var estilo = d.createElement('style');
    estilo.textContent = 'body{font-family:Arial,sans-serif;margin:24px}table{border-collapse:collapse;width:100%;font-size:11px}' +
      'th,td{border:1px solid #999;padding:4px 6px;text-align:left}th{background:#17683A;color:#fff}';
    d.head.appendChild(estilo);
    var h = d.createElement('h2'); h.textContent = d.title + ' (sala ' + sala.codigo + ')'; d.body.appendChild(h);
    var t = d.createElement('table');
    var tr = d.createElement('tr');
    COLUNAS.forEach(function(c) { var th = d.createElement('th'); th.textContent = c; tr.appendChild(th); });
    t.appendChild(tr);
    matriz(ls).forEach(function(r) {
      var linha = d.createElement('tr');
      r.forEach(function(v) { var td = d.createElement('td'); td.textContent = String(v); linha.appendChild(td); });
      t.appendChild(linha);
    });
    d.body.appendChild(t);
    w.focus();
    w.print();
  }

  return { linhas: linhas, COLUNAS: COLUNAS, exportarExcel: exportarExcel, exportarPdf: exportarPdf, csv: csv };
})();
