// backup-validacao.js — validacao PURA (sem DOM, sem Firebase) de:
//   - arquivos de backup (local e da nuvem) antes de restaurar;
//   - resultados de partida antes de gravar no Firestore.
//
// Os mesmos limites estao repetidos em Config/firestore.rules (a regra do
// servidor e a que vale de verdade; esta validacao evita mandar lixo e da
// uma mensagem amigavel pra crianca/professor).
//
// Funciona no navegador (window.ValidacaoBackup) e no Node (testes).

(function(raiz) {
  'use strict';

  var TIPO_LOCAL = 'mathgol-backup-local';
  var TIPO_FIREBASE = 'mathgol-backup-firebase';
  var VERSAO_BACKUP_LOCAL = 1;
  var VERSAO_BACKUP_FIREBASE = 2;
  var TAMANHO_MAXIMO_BYTES = 256 * 1024;   // arquivo inteiro
  var TAMANHO_MAXIMO_VALOR = 32 * 1024;    // cada valor do localStorage
  var MAXIMO_RESULTADOS = 500;

  // Unicas chaves do localStorage que um backup local pode restaurar.
  var CHAVES_LOCAIS_PERMITIDAS = ['mathgol_acessibilidade', 'mathgol_progressao', 'mathgol_ultimo_resultado'];
  // Chaves de versoes antigas: aceitas no arquivo, mas IGNORADAS (o antigo
  // token nunca foi credencial e nao e mais usado para nada).
  var CHAVES_LEGADAS_IGNORADAS = ['mathgol_token'];

  var COBRANCAS_POR_FASE = { penaltis: 3, falta: 5, final: 7 };
  var DIFICULDADES = ['facil', 'medio', 'dificil'];
  var ID_VALIDO = /^[a-z0-9_-]{1,32}$/;
  var ID_DOCUMENTO = /^[A-Za-z0-9_-]{1,64}$/;
  var TEMPO_MAX_POR_COBRANCA = 15;

  function objetoSimples(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v) &&
      (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
  }
  function inteiroEntre(v, min, max) {
    return typeof v === 'number' && Math.floor(v) === v && v >= min && v <= max;
  }
  function textoAte(v, max) {
    return typeof v === 'string' && v.length > 0 && v.length <= max && !/[<>\u0000-\u001f]/.test(v);
  }
  function somenteChaves(obj, permitidas) {
    return Object.keys(obj).every(function(k) { return permitidas.indexOf(k) !== -1; });
  }
  function dataIsoValida(v) {
    return typeof v === 'string' && v.length <= 40 &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v) && !isNaN(Date.parse(v));
  }

  // ---------- Resultado de partida (mesmo esquema das regras) ----------
  var CAMPOS_RESULTADO = ['versaoEsquema', 'faseId', 'dificuldadeId', 'selecaoId', 'gols',
    'totalCobrancas', 'pontuacao', 'tempoTotalSegundos', 'resumoCobrancas', 'data'];

  function validarResultadoPartida(r) {
    if (!objetoSimples(r)) return 'resultado não é um objeto';
    if (!somenteChaves(r, CAMPOS_RESULTADO)) return 'resultado com campos inesperados';
    if (r.versaoEsquema !== 2) return 'versão do esquema incompatível';
    var total = COBRANCAS_POR_FASE[r.faseId];
    if (!total) return 'fase desconhecida';
    if (r.totalCobrancas !== total) return 'quantidade de cobranças não corresponde à fase';
    if (DIFICULDADES.indexOf(r.dificuldadeId) === -1) return 'dificuldade desconhecida';
    if (typeof r.selecaoId !== 'string' || !ID_VALIDO.test(r.selecaoId)) return 'seleção inválida';
    if (!inteiroEntre(r.gols, 0, total)) return 'gols fora do limite';
    if (!inteiroEntre(r.pontuacao, r.gols * 10, r.gols * 100)) return 'pontuação fora do limite';
    if (!inteiroEntre(r.tempoTotalSegundos, 0, total * TEMPO_MAX_POR_COBRANCA)) return 'tempo fora do limite';
    if (typeof r.resumoCobrancas !== 'string' || !/^[GDTF]+$/.test(r.resumoCobrancas) ||
        r.resumoCobrancas.length !== total) return 'resumo das cobranças inválido';
    if (r.resumoCobrancas.replace(/[^G]/g, '').length !== r.gols) return 'resumo não bate com os gols';
    if (!dataIsoValida(r.data)) return 'data inválida';
    return null;
  }

  function copiarResultado(r) {
    var c = {};
    CAMPOS_RESULTADO.forEach(function(k) { c[k] = r[k]; });
    return c;
  }

  function validarPerfil(p) {
    if (!objetoSimples(p)) return null;
    var perfil = {};
    if (p.apelido !== undefined) { if (!textoAte(p.apelido, 40)) return null; perfil.apelido = p.apelido; }
    if (p.avatarSeed !== undefined) { if (!textoAte(p.avatarSeed, 40)) return null; perfil.avatarSeed = p.avatarSeed; }
    return (perfil.apelido || perfil.avatarSeed) ? perfil : null;
  }

  // ---------- Valores do localStorage ----------
  var PREFS_ACESSIBILIDADE = ['altoContraste', 'espacoDislexia', 'narracaoAtiva', 'sfxAtivo'];

  function validarAcessibilidade(obj) {
    return objetoSimples(obj) && somenteChaves(obj, PREFS_ACESSIBILIDADE) &&
      Object.keys(obj).every(function(k) { return typeof obj[k] === 'boolean'; });
  }

  var ORDEM_FASES = ['penaltis', 'falta', 'final'];
  // Gols minimos na fase anterior para uma fase ser desbloqueada.
  var GOLS_PARA_DESBLOQUEAR = { falta: { fase: 'penaltis', gols: 2 }, final: { fase: 'falta', gols: 3 } };

  function mapaPorFaseInteiro(m, limite) {
    return objetoSimples(m) && Object.keys(m).every(function(k) {
      return COBRANCAS_POR_FASE[k] && inteiroEntre(m[k], 0, limite(k));
    });
  }

  // Progresso local coerente com as fases (DEF-17): recordes dentro do que
  // a fase permite, pontos compativeis com os gols e fases desbloqueadas
  // em ordem e apoiadas pelos gols da fase anterior. Validacao de formato e
  // coerencia — nao e prova de autenticidade (o dado mora no navegador).
  function validarProgressao(obj) {
    if (!objetoSimples(obj)) return false;
    var dados = obj;
    if (obj.versao !== undefined) {
      if (!somenteChaves(obj, ['versao', 'dados']) || obj.versao !== 1) return false;
      dados = obj.dados;
    }
    if (!objetoSimples(dados) || !somenteChaves(dados, ['fasesDesbloqueadas', 'melhorPontuacao', 'melhorGols'])) return false;

    var gols = dados.melhorGols || {};
    var pontos = dados.melhorPontuacao || {};
    if (!mapaPorFaseInteiro(gols, function(f) { return COBRANCAS_POR_FASE[f]; })) return false;
    if (!mapaPorFaseInteiro(pontos, function(f) { return COBRANCAS_POR_FASE[f] * 100; })) return false;
    var coerente = Object.keys(COBRANCAS_POR_FASE).every(function(f) {
      var g = gols[f] || 0, p = pontos[f] || 0;
      if (p > g * 100) return false;      // cada gol vale no maximo 100
      if (g > 0 && p < 10) return false;   // e no minimo 10
      return true;
    });
    if (!coerente) return false;

    var fases = dados.fasesDesbloqueadas;
    if (fases !== undefined) {
      if (!Array.isArray(fases) || fases.length === 0 || fases.length > 3) return false;
      for (var i = 0; i < fases.length; i++) {
        if (fases[i] !== ORDEM_FASES[i]) return false; // em ordem, sem pular, sem repetir
        var requisito = GOLS_PARA_DESBLOQUEAR[fases[i]];
        if (requisito && (gols[requisito.fase] || 0) < requisito.gols) return false;
      }
    }
    return true;
  }

  function validarUltimoResultado(obj) {
    // Informativo (o jogo nao le de volta); exige so o envelope versionado.
    return objetoSimples(obj) && somenteChaves(obj, ['versao', 'dados']) &&
      (obj.versao === 1 || obj.versao === 2) && objetoSimples(obj.dados);
  }

  var VALIDADORES_LOCAIS = {
    mathgol_acessibilidade: validarAcessibilidade,
    mathgol_progressao: validarProgressao,
    mathgol_ultimo_resultado: validarUltimoResultado
  };

  // ---------- Backups ----------
  function validarBackupLocal(b) {
    if (!somenteChaves(b, ['versao', 'tipo', 'exportadoEm', 'dados'])) return { ok: false, erro: 'O arquivo tem campos que um backup do MathGol não tem.' };
    if (b.versao !== VERSAO_BACKUP_LOCAL) return { ok: false, erro: 'Versão de backup incompatível com este jogo.' };
    if (!objetoSimples(b.dados)) return { ok: false, erro: 'Backup incompleto: faltam os dados.' };
    var entradas = [];
    var chaves = Object.keys(b.dados);
    for (var i = 0; i < chaves.length; i++) {
      var chave = chaves[i];
      if (CHAVES_LEGADAS_IGNORADAS.indexOf(chave) !== -1) continue;
      if (CHAVES_LOCAIS_PERMITIDAS.indexOf(chave) === -1) {
        return { ok: false, erro: 'O backup contém dados desconhecidos e foi recusado.' };
      }
      var valor = b.dados[chave];
      if (typeof valor !== 'string' || valor.length > TAMANHO_MAXIMO_VALOR) {
        return { ok: false, erro: 'O backup parece adulterado e foi recusado.' };
      }
      var interpretado;
      try { interpretado = JSON.parse(valor); } catch (e) {
        return { ok: false, erro: 'O backup parece adulterado e foi recusado.' };
      }
      if (!VALIDADORES_LOCAIS[chave](interpretado)) {
        return { ok: false, erro: 'O backup parece adulterado e foi recusado.' };
      }
      entradas.push({ chave: chave, valor: valor });
    }
    if (!entradas.length) return { ok: false, erro: 'Backup vazio: não há nada para restaurar.' };
    return { ok: true, tipo: 'local', entradas: entradas };
  }

  function validarBackupFirebase(b) {
    if (b.versao === 1) {
      return { ok: false, erro: 'Este backup da nuvem é de uma versão antiga do jogo e não pode ser restaurado.' };
    }
    if (b.versao !== VERSAO_BACKUP_FIREBASE) return { ok: false, erro: 'Versão de backup incompatível com este jogo.' };
    if (!somenteChaves(b, ['versao', 'tipo', 'exportadoEm', 'perfil', 'resultados'])) {
      return { ok: false, erro: 'O arquivo tem campos que um backup do MathGol não tem.' };
    }
    if (!Array.isArray(b.resultados)) return { ok: false, erro: 'Backup incompleto: a lista de resultados está faltando ou corrompida.' };
    if (b.resultados.length > MAXIMO_RESULTADOS) return { ok: false, erro: 'O backup tem resultados demais e foi recusado.' };
    var perfil = null;
    if (b.perfil !== null && b.perfil !== undefined) {
      perfil = validarPerfil(b.perfil);
      if (!perfil) return { ok: false, erro: 'O perfil do backup parece adulterado e foi recusado.' };
    }
    var resultados = [];
    for (var i = 0; i < b.resultados.length; i++) {
      var item = b.resultados[i];
      if (!objetoSimples(item) || !objetoSimples(item.dados) || !somenteChaves(item, ['id', 'dados'])) {
        return { ok: false, erro: 'Um dos resultados do backup está corrompido.' };
      }
      if (item.id !== undefined && (typeof item.id !== 'string' || !ID_DOCUMENTO.test(item.id))) {
        return { ok: false, erro: 'Um dos resultados do backup está corrompido.' };
      }
      var erro = validarResultadoPartida(item.dados);
      if (erro) return { ok: false, erro: 'Um dos resultados do backup foi recusado (' + erro + ').' };
      // Copia: nunca altera o objeto lido do arquivo.
      resultados.push({ id: item.id || null, dados: copiarResultado(item.dados) });
    }
    return { ok: true, tipo: 'firebase', dados: { perfil: perfil, resultados: resultados } };
  }

  // Ponto de entrada: texto do arquivo → { ok, tipo, entradas|dados } ou { ok:false, erro }.
  function analisarArquivo(texto, tamanhoBytes) {
    var tamanho = typeof tamanhoBytes === 'number' ? tamanhoBytes : (texto ? texto.length : 0);
    if (tamanho > TAMANHO_MAXIMO_BYTES || (texto && texto.length > TAMANHO_MAXIMO_BYTES)) {
      return { ok: false, erro: 'Arquivo grande demais para ser um backup do MathGol.' };
    }
    if (typeof texto !== 'string' || !texto.trim()) return { ok: false, erro: 'O arquivo está vazio.' };
    var dados;
    try { dados = JSON.parse(texto); } catch (e) {
      return { ok: false, erro: 'Este arquivo não é um backup válido (não é JSON).' };
    }
    if (!objetoSimples(dados)) return { ok: false, erro: 'Este arquivo não é um backup do MathGol.' };
    if (dados.tipo === TIPO_LOCAL) return validarBackupLocal(dados);
    if (dados.tipo === TIPO_FIREBASE) return validarBackupFirebase(dados);
    return { ok: false, erro: 'Arquivo de backup não reconhecido.' };
  }

  var ValidacaoBackup = {
    TIPO_LOCAL: TIPO_LOCAL,
    TIPO_FIREBASE: TIPO_FIREBASE,
    VERSAO_BACKUP_LOCAL: VERSAO_BACKUP_LOCAL,
    VERSAO_BACKUP_FIREBASE: VERSAO_BACKUP_FIREBASE,
    TAMANHO_MAXIMO_BYTES: TAMANHO_MAXIMO_BYTES,
    CHAVES_LOCAIS_PERMITIDAS: CHAVES_LOCAIS_PERMITIDAS.slice(),
    COBRANCAS_POR_FASE: COBRANCAS_POR_FASE,
    analisarArquivo: analisarArquivo,
    validarBackupLocal: validarBackupLocal,
    validarBackupFirebase: validarBackupFirebase,
    validarResultadoPartida: validarResultadoPartida,
    validarPerfil: validarPerfil,
    copiarResultado: copiarResultado,
    validarProgressao: validarProgressao
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ValidacaoBackup;
  else raiz.ValidacaoBackup = ValidacaoBackup;
})(typeof window !== 'undefined' ? window : this);
