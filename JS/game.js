// game.js — cena 3D do pênalti (Three.js r149, build UMD via CDN).
//
// Contrato com o main.js (o modo simplificado 2D, game-2d.js, implementa
// exatamente o mesmo contrato):
//   criarJogoPenalti(containerId, selecaoId) -> {
//     modo: '3d',
//     chutar(zonaId, aoFinalizar),     // resposta ERRADA / tempo esgotado: o goleiro
//                                      // pula na zona chutada e DEFENDE. Sempre defesa.
//     iniciarMira(aoAtualizarPosicaoTela), // liga a mira (comeca no centro do gol)
//     moverMiraTela(clientX, clientY), // mira segue ponteiro (mouse/toque/caneta)
//     moverMiraDelta(dx, dy),          // mira por teclado (metros)
//     pararMira() -> {x, y},           // trava e devolve o ponto mirado
//     chutarLivre(pontoMira, forca, altura, aoFinalizar), // resposta CERTA: o goleiro
//                                      // nunca alcanca, mas mira + altura (tipo de chute:
//                                      // rasteiro/meia/cavadinha) + forca decidem gol ou
//                                      // fora (RegrasChute.calcularResultadoChute).
//                                      // aoFinalizar({gol, fora, motivo, tipo})
//     depurar() -> {goleiroMinY, bola, gol...}  // leitura p/ testes
//     destruir()
//   }
//
// Quem ouve ponteiro e teclado e o main.js (Pointer Events, um unico
// fluxo); este arquivo so converte coordenadas de tela em pontos do gol.
// A decisao de gol/fora NAO mora aqui: vem de regras-chute.js, que e
// compartilhado com o modo 2D e com os testes.
//
// Mantido: camisa da selecao (HU-16), chute so sai quando o pe encosta na
// bola (HU-18), som do chute no contato (HU-09), torcida reagindo (HU-17)
// e prefers-reduced-motion (mesma ordem de eventos, duracoes minimas).
//
// Unidades: metros. Eixo x = lateral (negativo = esquerda da tela), y = altura,
// z = profundidade (gol em z=0, marca do penalti em z=11, camera atras).

const ALTURA_BOLA = 0.22;
const GOL_MEIA_LARGURA = 3.66, GOL_ALTURA = 2.44; // raio da bola (maior que a real, para ler bem na tela)

// Pontos do plano do gol (z=0) que cada alternativa representa (usado so
// no caminho de resposta errada / tempo esgotado — chutar(), sempre defesa).
const ZONAS = {
  'topo-esquerda':  { x: -2.5, y: 2.0 },
  'topo-direita':   { x:  2.5, y: 2.0 },
  'meio':           { x:  0,   y: 1.3 },
  'baixo-esquerda': { x: -2.5, y: 0.55 },
  'baixo-direita':  { x:  2.5, y: 0.55 }
};

// Camera mais fechada no gol (o gol ocupa ~50% da largura do palco, antes
// ~35%), com o batedor INTEIRO no quadro e sem cobrir o gol quando ele
// chega na bola (menos de 1% do gol encoberto). Parametros escolhidos por
// busca numerica com a propria projecao do Three.js; a mira usa esta mesma
// camera (raycast), entao continua alinhada com o gol desenhado.
const CAMERA = { fov: 22, pos: [0.6, 3.5, 21], alvo: [0, -1, 0] };
const INICIO_BATEDOR = { x: -1.4, z: 12.4 };
const PONTO_BOLA = { x: 0, y: ALTURA_BOLA, z: 11 };
const PLANTIO_BATEDOR = { x: -0.3, z: 11.55 };
const GOLEIRO_BASE = { x: 0, y: 1.2, z: 0.3 }; // centro do tronco
const ALCANCE_MAOS = 0.95; // do centro do tronco ate as maos, com bracos para cima

// Ritmo da animacao (ms). Tudo passa por d() para respeitar prefers-reduced-motion.
const TEMPO = {
  CORRIDA: 760,           // batedor caminha ate a marca
  PERNA_TRAS: 300,        // batedor arma o chute
  PERNA_FRENTE: 280,      // perna desce ate encostar na bola
  PERNA_VOLTA: 350,       // pe volta a posicao de descanso
  VOO_BOLA: 1200,         // bola voa ate a zona
  GIRO_BOLA: 4 * Math.PI,
  MERGULHO_GOLEIRO: 1000, // goleiro mergulha acompanhando a bola
  IMPACTO_DEFESA: 250,    // impacto da defesa (visual)
  BOLA_NA_REDE: 400,      // a bola afunda na rede depois do gol
  REBOTE: 400,            // rebote na defesa
  VIBRACAO_REDE: 300,     // rede balanca
  COMEMORA_TORCIDA: 1600, // torcida vibra no gol
  LAMENTA_TORCIDA: 600,   // torcida lamenta na defesa/fora
  ANTES_DE_RESETAR: 1800  // pausa antes de resetar
};

const CAMISA_PRIMARIA_PADRAO = 0x3a5fcd;
const CAMISA_SECUNDARIA_PADRAO = 0xfffdf6;
const CORES_TORCIDA = [0xe0343b, 0xffc63b, 0x3a5fcd, 0xfffdf6, 0x2e9e5b];

// Converte "#RRGGBB" em numero hex. Retorna o fallback se o valor for
// invalido/ausente — nunca lanca erro.
function corHexParaNumero(hex, fallback) {
  if (typeof hex !== 'string') return fallback;
  const numero = parseInt(hex.replace('#', ''), 16);
  return isNaN(numero) ? fallback : numero;
}

const EASE = {
  linear: function(u) { return u; },
  sineOut: function(u) { return Math.sin(u * Math.PI / 2); },
  quadOut: function(u) { return 1 - (1 - u) * (1 - u); },
  cubicIn: function(u) { return u * u * u; },
  quadIn: function(u) { return u * u; },
  sineInOut: function(u) { return 0.5 - 0.5 * Math.cos(u * Math.PI); }
};

function criarJogoPenalti(containerId, selecaoId) {
  const container = document.getElementById(containerId);
  if (!container) throw new Error('Container do jogo nao encontrado: ' + containerId);

  const reduzMovimento = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function d(duracaoNormal) { return reduzMovimento ? 1 : duracaoNormal; }

  // Selecao escolhida define a camisa do batedor; sem selecao, camisa neutra.
  let selecaoEscolhida = null;
  if (typeof SELECOES !== 'undefined' && Array.isArray(SELECOES)) {
    selecaoEscolhida = SELECOES.find(function(s) { return s.id === selecaoId; }) || null;
  }
  const corPrimaria = corHexParaNumero(selecaoEscolhida && selecaoEscolhida.corPrimaria, CAMISA_PRIMARIA_PADRAO);
  const corSecundaria = corHexParaNumero(selecaoEscolhida && selecaoEscolhida.corSecundaria, CAMISA_SECUNDARIA_PADRAO);

  // Lanca se o navegador nao tiver WebGL — o main.js ja trata (jogo sem cena).
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const cena = new THREE.Scene();
  cena.background = new THREE.Color(0x8ecae6);
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 16 / 9, 0.1, 200);
  camera.position.set(CAMERA.pos[0], CAMERA.pos[1], CAMERA.pos[2]);
  camera.lookAt(CAMERA.alvo[0], CAMERA.alvo[1], CAMERA.alvo[2]);

  cena.add(new THREE.HemisphereLight(0xffffff, 0x3f8f5a, 1.0));
  const sol = new THREE.DirectionalLight(0xffffff, 0.55);
  sol.position.set(6, 12, 10);
  cena.add(sol);

  const mat = function(cor) { return new THREE.MeshLambertMaterial({ color: cor }); };

  // ---------- Campo ----------
  for (let i = 0; i < 14; i++) {
    const faixa = new THREE.Mesh(new THREE.PlaneGeometry(60, 3), mat(i % 2 ? 0x2a9455 : 0x2e9e5b));
    faixa.rotation.x = -Math.PI / 2;
    faixa.position.set(0, 0, -7.5 + i * 3);
    cena.add(faixa);
  }
  const matLinha = new THREE.MeshBasicMaterial({ color: 0xfffdf6 });
  function linha(x, z, largura, comprimento) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(largura, comprimento), matLinha);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.015, z);
    cena.add(m);
  }
  linha(0, 0, 40, 0.14);            // linha de fundo
  linha(0, 5.5, 18.32, 0.14);       // pequena area
  linha(-9.16, 2.75, 0.14, 5.5);
  linha(9.16, 2.75, 0.14, 5.5);
  linha(0, 16.5, 40.32, 0.14);      // grande area
  const marca = new THREE.Mesh(new THREE.CircleGeometry(0.14, 16), matLinha);
  marca.rotation.x = -Math.PI / 2;
  marca.position.set(0, 0.016, PONTO_BOLA.z);
  cena.add(marca);

  // ---------- Torcida (arquibancada atras do gol) ----------
  const torcida = new THREE.Group();
  const LINHAS = 4, COLUNAS = 36;
  const cabecas = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 8, 6), mat(0xffffff), LINHAS * COLUNAS);
  const corpos = new THREE.InstancedMesh(new THREE.BoxGeometry(0.75, 0.7, 0.5), mat(0xffffff), LINHAS * COLUNAS);
  const matriz = new THREE.Matrix4();
  const corTmp = new THREE.Color();
  let idx = 0;
  // Posicao e cor-base de cada torcedor: as animacoes sempre partem daqui
  // (nunca da cor/posicao "atual"), pra nao acumular clareamento.
  const baseTorcida = [];
  for (let r = 0; r < LINHAS; r++) {
    const yLinha = 1.4 + r * 0.85, zLinha = -9.2 - r * 0.8;
    const degrau = new THREE.Mesh(new THREE.BoxGeometry(46, 0.6, 1.0), mat(0x1c2b3a));
    degrau.position.set(0, yLinha - 0.95, zLinha);
    cena.add(degrau);
    for (let c = 0; c < COLUNAS; c++) {
      const x = (c - COLUNAS / 2) * 1.15 + (r % 2) * 0.55;
      corTmp.setHex(CORES_TORCIDA[(c * 3 + r) % CORES_TORCIDA.length]);
      baseTorcida.push({ x: x, y: yLinha, z: zLinha, cor: corTmp.getHex(),
        fase: ((idx * 0.618) % 1) * Math.PI * 2, amplitude: 0.18 + 0.3 * (((idx * 37) % 10) / 10) });
      matriz.makeTranslation(x, yLinha, zLinha);
      cabecas.setMatrixAt(idx, matriz);
      cabecas.setColorAt(idx, corTmp);
      matriz.makeTranslation(x, yLinha - 0.6, zLinha);
      corpos.setMatrixAt(idx, matriz);
      corpos.setColorAt(idx, corTmp);
      idx++;
    }
  }
  const paredao = new THREE.Mesh(new THREE.BoxGeometry(50, 9, 0.5), mat(0x1c2b3a));
  paredao.position.set(0, 4.5, -13);
  cena.add(paredao);
  torcida.add(cabecas, corpos);
  cena.add(torcida);

  // ---------- Gol e rede ----------
  const matTrave = mat(0xfffdf6);
  const LARG_GOL = 7.32, ALT_GOL = 2.44, PROF_REDE = 1.9;
  [-1, 1].forEach(function(lado) {
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, ALT_GOL, 10), matTrave);
    poste.position.set(lado * LARG_GOL / 2, ALT_GOL / 2, 0);
    cena.add(poste);
  });
  const travessao = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, LARG_GOL + 0.14, 10), matTrave);
  travessao.rotation.z = Math.PI / 2;
  travessao.position.set(0, ALT_GOL, 0);
  cena.add(travessao);

  // A rede e um grupo centrado no seu proprio meio, para "vibrar" por escala.
  const rede = new THREE.Group();
  rede.position.set(0, ALT_GOL / 2, -PROF_REDE / 2);
  const matRede = new THREE.LineBasicMaterial({ color: 0xfffdf6, transparent: true, opacity: 0.55 });
  function painelRede(o, u, v, nu, nv) {
    const p = [];
    for (let i = 0; i <= nu; i++) {
      const a = i / nu;
      p.push(o.x + u.x * a, o.y + u.y * a, o.z + u.z * a, o.x + u.x * a + v.x, o.y + u.y * a + v.y, o.z + u.z * a + v.z);
    }
    for (let j = 0; j <= nv; j++) {
      const b = j / nv;
      p.push(o.x + v.x * b, o.y + v.y * b, o.z + v.z * b, o.x + v.x * b + u.x, o.y + v.y * b + u.y, o.z + v.z * b + u.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    rede.add(new THREE.LineSegments(geo, matRede));
  }
  const hw = LARG_GOL / 2, hh = ALT_GOL / 2, hp = PROF_REDE / 2;
  painelRede({ x: -hw, y: -hh, z: -hp }, { x: LARG_GOL, y: 0, z: 0 }, { x: 0, y: ALT_GOL, z: 0 }, 24, 8);   // fundo
  painelRede({ x: -hw, y: -hh, z: hp }, { x: 0, y: 0, z: -PROF_REDE }, { x: 0, y: ALT_GOL, z: 0 }, 6, 8);   // lateral esq.
  painelRede({ x: hw, y: -hh, z: hp }, { x: 0, y: 0, z: -PROF_REDE }, { x: 0, y: ALT_GOL, z: 0 }, 6, 8);    // lateral dir.
  painelRede({ x: -hw, y: hh, z: hp }, { x: LARG_GOL, y: 0, z: 0 }, { x: 0, y: 0, z: -PROF_REDE }, 24, 6);  // teto
  cena.add(rede);

  // ---------- Sombras simples (circulos escuros no chao) ----------
  const matSombra = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
  function criarSombra(raio) {
    const s = new THREE.Mesh(new THREE.CircleGeometry(raio, 20), matSombra);
    s.rotation.x = -Math.PI / 2;
    s.position.y = 0.02;
    return s;
  }

  // ---------- Personagens (primitivas 3D; frente = +z local) ----------
  function criarPessoa(cores) {
    const raiz = new THREE.Group();
    const pele = mat(0xe8b98c), camisa = mat(cores.camisa), detalhe = mat(cores.detalhe);
    const calcao = mat(cores.calcao), meia = mat(cores.meia), luva = mat(cores.luva), preto = mat(0x21303b);

    function perna(x) {
      const g = new THREE.Group();
      g.position.set(x, 0.95, 0);
      const coxa = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.78, 3, 8), pele); coxa.position.y = -0.47;
      const short = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.125, 0.3, 10), calcao); short.position.y = -0.12;
      const canela = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.09, 0.42, 10), meia); canela.position.y = -0.66;
      const chuteira = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.28), preto); chuteira.position.set(0, -0.93, 0.06);
      g.add(coxa, short, canela, chuteira);
      raiz.add(g);
      return g;
    }
    const pernaChute = perna(-0.11); // lado que fica virado para a bola quando o batedor olha o gol
    const pernaApoio = perna(0.11);

    // Tronco (pivo no quadril) — leva torso, cabeca e bracos, para poder inclinar.
    const tronco = new THREE.Group();
    tronco.position.y = 0.95;
    const corpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.34, 3, 10), camisa);
    corpo.position.y = 0.33; corpo.scale.set(1.25, 1, 0.75);
    const faixa = new THREE.Mesh(new THREE.CylinderGeometry(0.178, 0.178, 0.09, 12), detalhe);
    faixa.position.y = 0.38; faixa.scale.set(1.25, 1, 0.75);
    const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 10), pele); cabeca.position.y = 0.83;
    const cabelo = new THREE.Mesh(new THREE.SphereGeometry(0.132, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(0x2b1d14));
    cabelo.position.y = 0.84; cabelo.rotation.x = -0.25;
    const olhoE = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), preto); olhoE.position.set(-0.05, 0.85, 0.115);
    const olhoD = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), preto); olhoD.position.set(0.05, 0.85, 0.115);
    tronco.add(corpo, faixa, cabeca, cabelo, olhoE, olhoD);

    function braco(x) {
      const g = new THREE.Group();
      g.position.set(x, 0.57, 0);
      const manga = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.22, 8), camisa); manga.position.y = -0.11;
      const ante = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.34, 3, 8), pele); ante.position.y = -0.36;
      const mao = new THREE.Mesh(new THREE.SphereGeometry(0.078, 8, 8), luva); mao.position.y = -0.6;
      g.add(manga, ante, mao);
      tronco.add(g);
      return g;
    }
    const bracoE = braco(-0.25);
    const bracoD = braco(0.25);
    raiz.add(tronco);
    return { raiz: raiz, tronco: tronco, pernaChute: pernaChute, pernaApoio: pernaApoio, bracoE: bracoE, bracoD: bracoD };
  }

  const batedorObj = criarPessoa({ camisa: corPrimaria, detalhe: corSecundaria, calcao: corSecundaria, meia: corPrimaria, luva: 0xe8b98c });
  const batedor = new THREE.Group();
  batedor.add(batedorObj.raiz);
  batedor.rotation.y = Math.PI; // de costas para a camera, olhando o gol
  const sombraBatedor = criarSombra(0.45);
  cena.add(batedor, sombraBatedor);

  const goleiroObj = criarPessoa({ camisa: 0x21303b, detalhe: 0xffc63b, calcao: 0x21303b, meia: 0x21303b, luva: 0xffc63b });
  goleiroObj.raiz.position.y = -GOLEIRO_BASE.y; // pivo da cena = centro do tronco
  const goleiro = new THREE.Group();
  goleiro.add(goleiroObj.raiz);
  const sombraGoleiro = criarSombra(0.5);
  cena.add(goleiro, sombraGoleiro);

  // ---------- Alto contraste: ajusta TODAS as cores 3D para acessibilidade ----------
  var coresOriginaisGoleiro = [];
  goleiroObj.raiz.traverse(function(child) {
    if (child.isMesh && child.material && child.material.color) {
      coresOriginaisGoleiro.push({ mesh: child, cor: child.material.color.getHex() });
    }
  });

  var altoContrasteAtivo = false;

  function aplicarAltoContraste() {
    var ativo = document.body.classList.contains('alto-contraste');
    if (ativo === altoContrasteAtivo) return;
    altoContrasteAtivo = ativo;

    if (ativo) {
      coresOriginaisGoleiro.forEach(function(item) {
        var hex = item.cor;
        if (hex === 0x21303b) {
          item.mesh.material.color.setHex(0xff6600);
        } else if (hex === 0xffc63b) {
          item.mesh.material.color.setHex(0xffffff);
        }
      });
      cena.background.setHex(0x1a3a5c);
      cena.children.forEach(function(child) {
        if (child.isMesh && child.material && child.material.color) {
          var hex = child.material.color.getHex();
          if (hex === 0x1c2b3a) child.material.color.setHex(0x2c4a6a);
        }
      });
    } else {
      coresOriginaisGoleiro.forEach(function(item) {
        item.mesh.material.color.setHex(item.cor);
      });
      cena.background.setHex(0x8ecae6);
      cena.children.forEach(function(child) {
        if (child.isMesh && child.material && child.material.color) {
          var hex = child.material.color.getHex();
          if (hex === 0x2c4a6a) child.material.color.setHex(0x1c2b3a);
        }
      });
    }
  }
  aplicarAltoContraste();

  var observadorContraste = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      if (m.attributeName === 'class') aplicarAltoContraste();
    });
  });
  observadorContraste.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // ---------- Bola (esfera branca + 12 "gomos" escuros) ----------
  const bola = new THREE.Group();
  const bolaMalha = new THREE.Group();
  bolaMalha.add(new THREE.Mesh(new THREE.SphereGeometry(ALTURA_BOLA, 20, 14), mat(0xfffdf6)));
  const matGomo = new THREE.MeshBasicMaterial({ color: 0x21303b });
  const vistos = {};
  const ico = new THREE.IcosahedronGeometry(1, 0).getAttribute('position');
  for (let i = 0; i < ico.count; i++) {
    const n = new THREE.Vector3(ico.getX(i), ico.getY(i), ico.getZ(i)).normalize();
    const chave = n.x.toFixed(3) + ',' + n.y.toFixed(3) + ',' + n.z.toFixed(3);
    if (vistos[chave]) continue;
    vistos[chave] = true;
    const gomo = new THREE.Mesh(new THREE.CircleGeometry(ALTURA_BOLA * 0.3, 5), matGomo);
    gomo.position.copy(n).multiplyScalar(ALTURA_BOLA * 1.003);
    gomo.lookAt(n.clone().multiplyScalar(2));
    bolaMalha.add(gomo);
  }
  bola.add(bolaMalha);
  const sombraBola = criarSombra(ALTURA_BOLA * 1.1);
  cena.add(bola, sombraBola);

  // ---------- Mini-motor de animacao ----------
  const tweens = [];
  function animar(duracao, aoAtualizar, aoTerminar, opcoes) {
    const t = {
      dur: Math.max(1, duracao), atraso: (opcoes && opcoes.atraso) || 0,
      ease: (opcoes && opcoes.ease) || EASE.linear,
      aoAtualizar: aoAtualizar, aoTerminar: aoTerminar, t0: null, cancelado: false
    };
    tweens.push(t);
    return t;
  }
  function atualizarTweens(agora) {
    tweens.slice().forEach(function(t) {
      if (t.cancelado) { tweens.splice(tweens.indexOf(t), 1); return; }
      if (t.t0 === null) t.t0 = agora;
      const dec = agora - t.t0 - t.atraso;
      if (dec < 0) return;
      const u = Math.min(1, dec / t.dur);
      if (t.aoAtualizar) t.aoAtualizar(t.ease(u), u);
      if (u >= 1) {
        tweens.splice(tweens.indexOf(t), 1);
        if (t.aoTerminar) t.aoTerminar();
      }
    });
  }
  function pulso(duracao, aplicar, aoTerminar) {
    animar(d(duracao), function(e, u) { aplicar(Math.sin(Math.PI * u)); }, function() { aplicar(0); if (aoTerminar) aoTerminar(); });
  }

  // ---------- Estado ----------
  let emAnimacao = false;
  let goleiroLivre = true;
  let offTorcida = 0;
  let resetPendente = null;
  let vivo = true;
  let rafId = 0;

  function aplicarTorcidaBase() {
    for (let i = 0; i < baseTorcida.length; i++) {
      const b = baseTorcida[i];
      corTmp.setHex(b.cor);
      matriz.makeTranslation(b.x, b.y, b.z);
      cabecas.setMatrixAt(i, matriz); cabecas.setColorAt(i, corTmp);
      matriz.makeTranslation(b.x, b.y - 0.6, b.z);
      corpos.setMatrixAt(i, matriz); corpos.setColorAt(i, corTmp);
    }
    cabecas.instanceMatrix.needsUpdate = true; corpos.instanceMatrix.needsUpdate = true;
    cabecas.instanceColor.needsUpdate = true; corpos.instanceColor.needsUpdate = true;
  }

  function resetar() {
    resetPendente = null;
    bola.position.set(PONTO_BOLA.x, PONTO_BOLA.y, PONTO_BOLA.z);
    bola.visible = true;
    bolaMalha.rotation.set(0, 0, 0);
    goleiro.position.set(GOLEIRO_BASE.x, GOLEIRO_BASE.y, GOLEIRO_BASE.z);
    goleiro.rotation.set(0, 0, 0);
    goleiro.scale.set(1, 1, 1);
    goleiroObj.bracoE.rotation.set(0, 0, -0.6);
    goleiroObj.bracoD.rotation.set(0, 0, 0.6);
    batedor.position.set(INICIO_BATEDOR.x, 0, INICIO_BATEDOR.z);
    [batedorObj.pernaChute, batedorObj.pernaApoio, batedorObj.bracoE, batedorObj.bracoD, batedorObj.tronco].forEach(function(p) { p.rotation.set(0, 0, 0); });
    rede.scale.set(1, 1, 1);
    offTorcida = 0;
    aplicarTorcidaBase();
    goleiroLivre = true;
  }
  resetar();

  // Comemoracao: cada torcedor pula com fase e amplitude proprias (grupos
  // nao sincronizados) e o brilho e SEMPRE calculado a partir da cor-base,
  // entao nunca acumula ate o branco. No fim volta suavemente a base.
  function comemorarTorcida() {
    const branco = new THREE.Color(0xffffff);
    const base = new THREE.Color();
    animar(d(TEMPO.COMEMORA_TORCIDA), function(e, u) {
      const envelope = Math.sin(Math.PI * Math.min(1, u * 1.15)); // sobe e desce suave
      for (let i = 0; i < baseTorcida.length; i++) {
        const b = baseTorcida[i];
        const onda = Math.abs(Math.sin(u * Math.PI * 5 + b.fase));
        const salto = b.amplitude * onda * Math.max(0, envelope);
        matriz.makeTranslation(b.x, b.y + salto, b.z);
        cabecas.setMatrixAt(i, matriz);
        matriz.makeTranslation(b.x, b.y - 0.6 + salto, b.z);
        corpos.setMatrixAt(i, matriz);
        base.setHex(b.cor);
        corTmp.copy(base).lerp(branco, 0.28 * onda * Math.max(0, envelope));
        cabecas.setColorAt(i, corTmp);
        corpos.setColorAt(i, corTmp);
      }
      cabecas.instanceMatrix.needsUpdate = true; corpos.instanceMatrix.needsUpdate = true;
      cabecas.instanceColor.needsUpdate = true; corpos.instanceColor.needsUpdate = true;
    }, aplicarTorcidaBase);
  }

  function lamentarTorcida() {
    animar(d(TEMPO.LAMENTA_TORCIDA), function(e, u) {
      offTorcida = -Math.sin(u * Math.PI) * 0.22;
    }, function() { offTorcida = 0; });
  }

  function ajustarTamanho() {
    const w = container.clientWidth || 640, h = container.clientHeight || 360;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  ajustarTamanho();
  let observador = null;
  if (typeof ResizeObserver !== 'undefined') {
    observador = new ResizeObserver(ajustarTamanho);
    observador.observe(container);
  } else {
    window.addEventListener('resize', ajustarTamanho);
  }

  // ---------- Loop de render ----------
  function quadro(agora) {
    if (!vivo) return;
    rafId = requestAnimationFrame(quadro);
    atualizarTweens(agora);
    const t = agora / 1000;
    torcida.position.y = (reduzMovimento ? 0 : Math.sin(t * 4.2) * 0.06) + offTorcida;
    if (goleiroLivre && !reduzMovimento) goleiro.position.x = GOLEIRO_BASE.x + Math.sin(t * 1.6) * 0.18;
    sombraBola.visible = bola.visible;
    sombraBola.position.set(bola.position.x, 0.02, bola.position.z);
    sombraBola.scale.setScalar(Math.max(0.5, 1 - (bola.position.y - ALTURA_BOLA) * 0.25));
    sombraBatedor.position.set(batedor.position.x, 0.02, batedor.position.z);
    sombraGoleiro.position.set(goleiro.position.x, 0.02, goleiro.position.z);
    renderer.render(cena, camera);
  }
  rafId = requestAnimationFrame(quadro);

  // ---------- Chute (batedor) ----------
  function animarChute(aoContato) {
    const b = batedorObj;
    animar(d(TEMPO.CORRIDA), function(e, u) {
      batedor.position.x = INICIO_BATEDOR.x + (PLANTIO_BATEDOR.x - INICIO_BATEDOR.x) * e;
      batedor.position.z = INICIO_BATEDOR.z + (PLANTIO_BATEDOR.z - INICIO_BATEDOR.z) * e;
      const passo = Math.sin(u * Math.PI * 3) * 0.7;
      b.pernaChute.rotation.x = passo; b.pernaApoio.rotation.x = -passo;
      b.bracoE.rotation.x = passo * 0.8; b.bracoD.rotation.x = -passo * 0.8;
    }, function() {
      animar(d(TEMPO.PERNA_TRAS), function(e) {
        b.pernaChute.rotation.x = 0.9 * e;
        b.tronco.rotation.x = 0.15 * e;
        b.bracoE.rotation.x = 0; b.bracoD.rotation.x = 0;
      }, function() {
        let tocou = false;
        animar(d(TEMPO.PERNA_FRENTE), function(e) {
          b.pernaChute.rotation.x = 0.9 - 2.1 * e;
          b.pernaChute.rotation.z = -0.3 * e;
          b.tronco.rotation.x = 0.15 - 0.4 * e;
          if (!tocou && e >= 0.64) {
            tocou = true;
            if (typeof SFX !== 'undefined' && SFX.chute) SFX.chute();
            aoContato();
          }
        }, function() {
          animar(d(TEMPO.PERNA_VOLTA), function(e) {
            b.pernaChute.rotation.x = -1.2 * (1 - e);
            b.pernaChute.rotation.z = -0.3 * (1 - e);
            b.tronco.rotation.x = -0.25 * (1 - e);
          }, null, { atraso: reduzMovimento ? 0 : 120, ease: EASE.sineOut });
        }, { ease: EASE.cubicIn });
      }, null, { ease: EASE.sineOut });
    });
  }

  // ---------- Goleiro ----------
  // Altura do pivo (centro do tronco) que deixa o ponto mais baixo do corpo
  // exatamente no chao para uma dada pose. Calculada com a caixa real do
  // modelo, pra o goleiro nunca atravessar o gramado.
  const caixaTmp = new THREE.Box3();
  function alturaDeApoio(rotZ, pose) {
    const salvo = {
      pos: goleiro.position.clone(), rot: goleiro.rotation.clone(),
      e: goleiroObj.bracoE.rotation.clone(), d: goleiroObj.bracoD.rotation.clone()
    };
    goleiro.position.set(0, 0, GOLEIRO_BASE.z);
    goleiro.rotation.set(0, 0, rotZ);
    goleiroObj.bracoE.rotation.set(pose.armX, 0, -pose.armZ);
    goleiroObj.bracoD.rotation.set(pose.armX, 0, pose.armZ);
    goleiro.updateMatrixWorld(true);
    caixaTmp.setFromObject(goleiro);
    const apoio = -caixaTmp.min.y;
    goleiro.position.copy(salvo.pos); goleiro.rotation.copy(salvo.rot);
    goleiroObj.bracoE.rotation.copy(salvo.e); goleiroObj.bracoD.rotation.copy(salvo.d);
    goleiro.updateMatrixWorld(true);
    return apoio;
  }

  function poseDoPonto(alvo) {
    const lado = alvo.x >= 0 ? 1 : -1;
    const ang = alvo.y > 1.5 ? 0.95 : 1.4;
    const phi = -lado * ang;
    const pose = { x: alvo.x + ALCANCE_MAOS * Math.sin(phi), y: alvo.y - ALCANCE_MAOS * Math.cos(phi), rotZ: phi, armZ: 2.9, armX: 0, zBola: 0.45 };
    pose.y = Math.max(pose.y, alturaDeApoio(phi, pose) + 0.02); // mergulho nunca abaixo do chao
    return pose;
  }

  function poseGoleiro(zonaId) {
    if (zonaId === 'meio') return { x: 0, y: GOLEIRO_BASE.y, rotZ: 0, armZ: 0.25, armX: -1.3, zBola: 0.95 };
    return poseDoPonto(ZONAS[zonaId]);
  }

  // Resposta correta: o goleiro sempre mergulha pro lado OPOSTO ao destino
  // real da bola, entao nunca alcanca (quem decide gol/fora e a regra).
  function poseGoleiroEsquiva(destino) {
    const lado = destino.x >= 0 ? -1 : 1;
    const alto = Math.random() < 0.5;
    return poseDoPonto({ x: lado * (2.3 + Math.random() * 0.6), y: alto ? 2.0 : 0.55 });
  }

  function mergulharGoleiro(pose, aoTerminar) {
    const g0 = { x: goleiro.position.x, y: GOLEIRO_BASE.y };
    // Altura minima (corpo encostando no chao) ao longo do mergulho, para
    // a interpolacao nunca "afundar" os pes no gramado no meio do salto.
    const apoio = [];
    for (let i = 0; i <= 10; i++) {
      const e = i / 10;
      apoio.push(alturaDeApoio(pose.rotZ * e, { armX: pose.armX * e, armZ: 0.6 + (pose.armZ - 0.6) * e }));
    }
    function apoioEm(e) {
      const k = Math.min(9.999, Math.max(0, e * 10)), i = Math.floor(k), f = k - i;
      return apoio[i] + (apoio[i + 1] - apoio[i]) * f;
    }
    animar(d(TEMPO.MERGULHO_GOLEIRO), function(e) {
      goleiro.position.x = g0.x + (pose.x - g0.x) * e;
      goleiro.position.y = Math.max(g0.y + (pose.y - g0.y) * e, apoioEm(e) + 0.01);
      goleiro.rotation.z = pose.rotZ * e;
      goleiroObj.bracoE.rotation.set(pose.armX * e, 0, -(0.6 + (pose.armZ - 0.6) * e));
      goleiroObj.bracoD.rotation.set(pose.armX * e, 0, 0.6 + (pose.armZ - 0.6) * e);
    }, function() {
      deitarGoleiro(pose);
      if (aoTerminar) aoTerminar();
    }, { ease: EASE.sineOut });
  }

  // Depois do mergulho o goleiro cai deitado de lado, de forma continua
  // (gravidade no Y, giro suave), da uma pequena acomodada e FICA no chao
  // ate a cena resetar. Nunca desce abaixo do gramado: a altura final vem
  // da caixa real do corpo (alturaDeApoio). Defesa no meio: fica em pe.
  function deitarGoleiro(pose) {
    if (Math.abs(pose.rotZ) < 0.01) {
      animar(d(500), function(e) {
        goleiroObj.bracoE.rotation.x = pose.armX * (1 - 0.5 * e);
        goleiroObj.bracoD.rotation.x = pose.armX * (1 - 0.5 * e);
      }, null, { ease: EASE.sineInOut });
      return;
    }
    const lado = pose.rotZ > 0 ? 1 : -1;
    const rotFinal = lado * Math.PI / 2;
    // Deitado, os bracos ficam esticados na linha do corpo (acima da
    // cabeca): o apoio no chao e o ombro/quadril, como uma pessoa de lado,
    // e nao a mao "escorando" o corpo no ar.
    const bracosDeitado = { armX: 0.25, armZ: Math.PI };
    const yFinal = alturaDeApoio(rotFinal, bracosDeitado) + 0.005;
    const ini = { x: goleiro.position.x, y: goleiro.position.y, rot: goleiro.rotation.z,
      armX: goleiroObj.bracoD.rotation.x, armZ: goleiroObj.bracoD.rotation.z };
    const deslize = -lado * 0.25; // escorrega um pouco na direcao do mergulho
    animar(d(520), function(e, u) {
      const g = EASE.quadIn(u);                 // queda com aceleracao
      goleiro.position.y = ini.y + (yFinal - ini.y) * g;
      goleiro.rotation.z = ini.rot + (rotFinal - ini.rot) * EASE.sineInOut(u);
      goleiro.position.x = ini.x + deslize * EASE.sineOut(u);
      const armZ = ini.armZ + (bracosDeitado.armZ - ini.armZ) * EASE.sineInOut(u);
      const armX = ini.armX + (bracosDeitado.armX - ini.armX) * EASE.sineInOut(u);
      goleiroObj.bracoE.rotation.set(armX, 0, -armZ);
      goleiroObj.bracoD.rotation.set(armX, 0, armZ);
      // Durante a queda nunca abaixo do chao (bracos mudando de pose).
      goleiro.position.y = Math.max(goleiro.position.y, yFinal);
    }, function() {
      goleiro.position.y = yFinal;
      goleiro.rotation.z = rotFinal;
      // Acomodada curta (quique pequeno) e depois fica parado no chao.
      animar(d(220), function(e, u) {
        goleiro.position.y = yFinal + 0.05 * Math.sin(Math.PI * u);
      }, function() { goleiro.position.y = yFinal; });
    });
  }

  // ---------- Bola ----------
  // Voo ate o plano do gol pela trajetoria da regra (em s = 1 a bola esta
  // EXATAMENTE no destino calculado). Depois o voo continua: entra na rede
  // (gol), passa por cima / por fora e cai no chao (fora) — a bola nunca
  // fica parada no ar.
  function voarBola(destino, arco, duracao, aoCruzar) {
    const ini = { x: bola.position.x, y: bola.position.y, z: bola.position.z };
    animar(duracao, function(e, u) {
      const p = RegrasChute.pontoTrajetoria(ini, destino, arco, e);
      bola.position.set(p.x, Math.max(ALTURA_BOLA, p.y), p.z);
      bolaMalha.rotation.x = -u * TEMPO.GIRO_BOLA;
      bolaMalha.rotation.z = u * TEMPO.GIRO_BOLA * 0.3;
    }, aoCruzar, { ease: EASE.quadOut });
  }

  function cairNoChao(duracao) {
    const y0 = bola.position.y;
    animar(d(duracao), function(e, u) {
      bola.position.y = y0 + (ALTURA_BOLA - y0) * EASE.quadIn(u);
    }, function() { bola.position.y = ALTURA_BOLA; });
  }

  function continuarVoo(motivo, destino) {
    const lado = destino.x >= 0 ? 1 : -1;
    if (motivo === 'gol') {
      const z0 = bola.position.z, y0 = bola.position.y;
      animar(d(TEMPO.BOLA_NA_REDE), function(e) {
        bola.position.z = z0 + (-1.5 - z0) * e;
        bola.position.y = y0 + (Math.max(ALTURA_BOLA, y0 - 0.3) - y0) * e;
      }, function() { cairNoChao(300); }, { ease: EASE.sineOut });
      return;
    }
    // Fora: segue na mesma direcao por cima do travessao / por fora da
    // trave e cai atras do gol.
    const p0 = { x: bola.position.x, y: bola.position.y, z: bola.position.z };
    const alvo = motivo === 'alto'
      ? { x: p0.x * 1.1, y: Math.max(p0.y + 0.5, GOL_ALTURA + 0.7), z: -2.6 }
      : { x: p0.x + lado * 1.2, y: p0.y + 0.15, z: -2.2 };
    animar(d(320), function(e) {
      bola.position.set(p0.x + (alvo.x - p0.x) * e, p0.y + (alvo.y - p0.y) * e, p0.z + (alvo.z - p0.z) * e);
    }, function() {
      const z1 = bola.position.z;
      animar(d(380), function(e, u) {
        bola.position.z = z1 - 1.4 * e;
      }, null, { ease: EASE.sineOut });
      cairNoChao(380);
    });
  }

  // ---------- Resposta errada / tempo esgotado: defesa ----------
  function chutar(zonaId, aoFinalizar) {
    if (emAnimacao || !vivo) return false;
    const alvo = ZONAS[zonaId] || ZONAS.meio;
    if (resetPendente) { tweens.length = 0; resetar(); }
    emAnimacao = true;
    goleiroLivre = false;

    const pose = poseGoleiro(ZONAS[zonaId] ? zonaId : 'meio');
    const fim = { x: alvo.x, y: alvo.y, z: pose.zBola };

    function iniciarBolaEGoleiro() {
      mergulharGoleiro(pose, function() {
        pulso(TEMPO.IMPACTO_DEFESA, function(s) { goleiro.scale.set(1 + 0.08 * s, 1 - 0.1 * s, 1); });
      });
      const ini = { x: bola.position.x, y: bola.position.y, z: bola.position.z };
      animar(d(TEMPO.VOO_BOLA), function(e, u) {
        bola.position.set(
          ini.x + (fim.x - ini.x) * e,
          Math.max(ALTURA_BOLA, ini.y + (fim.y - ini.y) * e + 4 * u * (1 - u) * 0.5),
          ini.z + (fim.z - ini.z) * e
        );
        bolaMalha.rotation.x = -u * TEMPO.GIRO_BOLA;
        bolaMalha.rotation.z = u * TEMPO.GIRO_BOLA * 0.3;
      }, function() {
        emAnimacao = false;
        // Rebote: a bola volta pro campo e cai no gramado.
        const z0 = bola.position.z;
        animar(d(TEMPO.REBOTE), function(e) { bola.position.z = z0 + 1.2 * e; }, null, { ease: EASE.sineOut });
        cairNoChao(TEMPO.REBOTE);
        lamentarTorcida();
        if (aoFinalizar) aoFinalizar({ gol: false, fora: false, motivo: 'defesa' });
        resetPendente = animar(reduzMovimento ? 60 : TEMPO.ANTES_DE_RESETAR, null, resetar);
      }, { ease: EASE.quadOut });
    }

    animarChute(iniciarBolaEGoleiro);
    return true;
  }

  // ---------- Mira livre (apos resposta correta) ----------
  // So converte coordenadas; quem escuta ponteiro/teclado e o main.js.
  var raycasterMira = new THREE.Raycaster();
  var planoGol = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // z = 0
  var pontoMiraAtual = { x: RegrasChute.CENTRO_GOL.x, y: RegrasChute.CENTRO_GOL.y };
  var aoAtualizarMira = null;

  function calcularPontoMundo(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    raycasterMira.setFromCamera({ x: ndcX, y: ndcY }, camera);
    const alvo = new THREE.Vector3();
    const atingiu = raycasterMira.ray.intersectPlane(planoGol, alvo);
    return atingiu ? { x: alvo.x, y: alvo.y } : null;
  }

  function pontoParaTela(ponto) {
    const v = new THREE.Vector3(ponto.x, ponto.y, 0);
    v.project(camera);
    return { leftPercent: (v.x * 0.5 + 0.5) * 100, topPercent: (-v.y * 0.5 + 0.5) * 100 };
  }

  function notificarMira() {
    if (aoAtualizarMira) aoAtualizarMira(pontoParaTela(pontoMiraAtual), pontoMiraAtual);
  }

  function iniciarMira(aoAtualizar) {
    pontoMiraAtual = RegrasChute.limitarMira(RegrasChute.CENTRO_GOL);
    aoAtualizarMira = aoAtualizar || null;
    renderer.domElement.style.cursor = 'crosshair';
    notificarMira();
  }

  function moverMiraTela(clientX, clientY) {
    if (!aoAtualizarMira) return;
    const bruto = calcularPontoMundo(clientX, clientY);
    if (!bruto) return;
    pontoMiraAtual = RegrasChute.limitarMira(bruto);
    notificarMira();
  }

  function moverMiraDelta(dx, dy) {
    if (!aoAtualizarMira) return;
    pontoMiraAtual = RegrasChute.limitarMira({ x: pontoMiraAtual.x + dx, y: pontoMiraAtual.y + dy });
    notificarMira();
  }

  function pararMira() {
    aoAtualizarMira = null;
    renderer.domElement.style.cursor = '';
    return { x: pontoMiraAtual.x, y: pontoMiraAtual.y };
  }

  // ---------- Chute livre (apos mira + altura + forca) ----------
  function chutarLivre(pontoMira, forca, altura, aoFinalizar) {
    if (typeof altura === 'function' && aoFinalizar === undefined) { aoFinalizar = altura; altura = undefined; }
    if (emAnimacao || !vivo) return false;
    if (resetPendente) { tweens.length = 0; resetar(); }
    emAnimacao = true;
    goleiroLivre = false;

    const r = RegrasChute.calcularResultadoChute(pontoMira, forca, altura, RegrasChute.aleatorio);
    const tipo = RegrasChute.TIPOS[r.tipo];
    const pose = poseGoleiroEsquiva(r.destino);
    // Cavadinha e mais lenta; rasteiro e forte, mais rapidos.
    const fatorTipo = r.tipo === 'cavadinha' ? 1.35 : (r.tipo === 'rasteiro' ? 0.85 : 1);
    const duracaoVoo = d(Math.round(TEMPO.VOO_BOLA * (1.3 - r.forca * 0.6) * fatorTipo));

    function iniciarBolaEGoleiro() {
      mergulharGoleiro(pose);
      if (r.motivo === 'fraco') {
        // Nao chega ao gol: rola, perde velocidade e para antes da linha.
        const ini = { x: bola.position.x, y: bola.position.y, z: bola.position.z };
        const fim = { x: r.destino.x * 0.5, z: 2.4 };
        animar(duracaoVoo, function(e, u) {
          bola.position.set(ini.x + (fim.x - ini.x) * e, ALTURA_BOLA + (r.tipo === 'cavadinha' ? 1.2 : 0.25) * 4 * u * (1 - u), ini.z + (fim.z - ini.z) * e);
          bolaMalha.rotation.x = -u * TEMPO.GIRO_BOLA;
        }, terminar, { ease: EASE.quadOut });
        return;
      }
      voarBola(r.destino, tipo.arcoVisual, duracaoVoo, function() {
        continuarVoo(r.motivo, r.destino);
        terminar();
      });
    }

    function terminar() {
      emAnimacao = false;
      if (r.dentro) {
        pulso(TEMPO.VIBRACAO_REDE, function(s) { rede.scale.set(1 + 0.05 * s, 1 + 0.05 * s, 1 + 0.05 * s); });
        comemorarTorcida();
      } else {
        lamentarTorcida();
      }
      if (aoFinalizar) aoFinalizar({ gol: r.dentro, fora: !r.dentro, motivo: r.motivo, tipo: r.tipo });
      resetPendente = animar(reduzMovimento ? 60 : TEMPO.ANTES_DE_RESETAR, null, resetar);
    }

    animarChute(iniciarBolaEGoleiro);
    return true;
  }

  // Leitura para testes/diagnostico (sem efeito colateral).
  function depurar() {
    goleiro.updateMatrixWorld(true);
    caixaTmp.setFromObject(goleiro);
    // Quanto a torcida esta "clareada" em relacao a cor-base (0 = base,
    // 1 = branco). Deve ficar abaixo de ~0.3 e voltar a 0.
    let clareamento = 0;
    const atual = new THREE.Color(), base = new THREE.Color();
    for (let i = 0; i < baseTorcida.length; i++) {
      cabecas.getColorAt(i, atual); base.setHex(baseTorcida[i].cor);
      ['r', 'g', 'b'].forEach(function(c) {
        if (base[c] < 0.98) clareamento = Math.max(clareamento, (atual[c] - base[c]) / (1 - base[c]));
      });
    }
    return {
      torcidaClareamento: clareamento,
      goleiroMinY: caixaTmp.min.y,
      goleiroRotZ: goleiro.rotation.z,
      bola: { x: bola.position.x, y: bola.position.y, z: bola.position.z },
      emAnimacao: emAnimacao,
      gol: [pontoParaTela({ x: -GOL_MEIA_LARGURA, y: 0 }), pontoParaTela({ x: GOL_MEIA_LARGURA, y: GOL_ALTURA })]
    };
  }

  function destruir() {
    if (!vivo) return;
    vivo = false;
    cancelAnimationFrame(rafId);
    tweens.length = 0;
    pararMira();
    if (observador) observador.disconnect(); else window.removeEventListener('resize', ajustarTamanho);
    if (observadorContraste) observadorContraste.disconnect();
    cena.traverse(function(o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function(m) { if (m.map) m.map.dispose(); m.dispose(); }); }
    });
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  return { modo: '3d', chutar, iniciarMira, moverMiraTela, moverMiraDelta, pararMira, chutarLivre, depurar, destruir };
}
