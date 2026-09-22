// game.js — cena 3D do pênalti (Three.js r149, build UMD via CDN).
//
// Contrato com o main.js:
//   criarJogoPenalti(containerId, selecaoId) -> {
//     chutar(zonaId, correta, aoFinalizar),       // chute "fechado" (resposta errada / tempo esgotado):
//                                                  // zona certa = gol (goleiro pula p/ OUTRA zona);
//                                                  // zona errada = goleiro pula exatamente na zona chutada e defende.
//     iniciarMira(aoAtualizarPosicaoTela),         // liga o acompanhamento do mouse/toque no plano do gol
//     pararMira() -> {x, y},                       // trava a mira e devolve o ultimo ponto (mundo)
//     chutarLivre(pontoMira, forca, altura, aoFinalizar), // chute "livre" (resposta CERTA): mira
//                                                  // continua + forca (0..1) definem onde a bola cai
//                                                  // e se entra (goleiro nunca alcanca — a resposta
//                                                  // certa so garante que ele nao pode defender, NAO
//                                                  // garante gol). altura (0..1) e so estetica: 0 =
//                                                  // chute rasteiro (arco baixo, mais rapido), 1 =
//                                                  // cavadinha (arco alto, mais lento) — nao muda se
//                                                  // a bola entra ou nao.
//     destruir()
//   }
//
// Diferenca da versao anterior: as alternativas da pergunta NAO ficam mais
// sobre o canvas/gol (secao 5 do documento de melhorias — gol sempre
// visivel). A mira agora e continua (nao mais 1-de-5 zonas fixas) durante
// o chute apos resposta correta; o caminho de resposta errada / tempo
// esgotado continua usando as 5 zonas fixas internamente (chutar()), sem
// nenhuma mudanca de comportamento.
//
// Mantido da versao anterior: camisa da selecao (HU-16), chute so sai
// quando o pe encosta na bola (HU-18), som do chute no contato (HU-09),
// torcida reagindo (HU-17), e prefers-reduced-motion.
//
// Unidades: metros. Eixo x = lateral (negativo = esquerda da tela), y = altura,
// z = profundidade (gol em z=0, marca do penalti em z=11, camera atras).

const ALTURA_BOLA = 0.22; // raio da bola (maior que a real, para ler bem na tela)

// Pontos do plano do gol (z=0) que cada alternativa representa (usado so
// no caminho de resposta errada / tempo esgotado — chutar()).
const ZONAS = {
  'topo-esquerda':  { x: -2.5, y: 2.0 },
  'topo-direita':   { x:  2.5, y: 2.0 },
  'meio':           { x:  0,   y: 1.3 },
  'baixo-esquerda': { x: -2.5, y: 0.55 },
  'baixo-direita':  { x:  2.5, y: 0.55 }
};

// Area em que a mira pode se mover (secao 6) — um pouco mais larga que a
// area valida, so pra deixar uma margem de risco perto das bordas; nao
// muito maior que isso, pra ficar rapido/facil de mirar pra uma crianca.
const AREA_SELECAO = { xMin: -3.6, xMax: 3.6, yMin: 0.15, yMax: 2.55 };
// Area que conta como "dentro do gol" no calculo do resultado (secao 7).
// Um pouco menor que o gol real (LARG_GOL=7.32 => meia-largura 3.66,
// ALT_GOL=2.44) pra bola nunca "clipar" nas traves visualmente.
const AREA_VALIDA = { xMin: -3.5, xMax: 3.5, yMin: 0.05, yMax: 2.32 };
// Faixa "ideal" de forca (secao 8): dentro dela, sem desvio. Fora dela,
// desvio proporcional a distancia ate a faixa, ate DESVIO_MAX no extremo.
const FORCA_IDEAL = { min: 0.38, max: 0.78 };
const DESVIO_MAX = 1.7;
// Altura do chute (0 = rasteiro, 1 = cavadinha): controla so o FORMATO da
// trajetoria (arco visual) e a velocidade do voo — nao interfere no
// calculo de dentro/fora, que continua so em funcao de mira + forca.
const ALTURA_ARCO_BASE = 0.4;
const ALTURA_ARCO_MAX = 2.6;

const CAMERA = { fov: 34, pos: [1.2, 4.4, 19], alvo: [0, -1.5, 0] };
const PONTO_BOLA = { x: 0, y: ALTURA_BOLA, z: 11 };
const INICIO_BATEDOR = { x: -1.0, z: 13.4 };
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
  cubicIn: function(u) { return u * u * u; }
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
  for (let r = 0; r < LINHAS; r++) {
    const yLinha = 1.4 + r * 0.85, zLinha = -9.2 - r * 0.8;
    const degrau = new THREE.Mesh(new THREE.BoxGeometry(46, 0.6, 1.0), mat(0x1c2b3a));
    degrau.position.set(0, yLinha - 0.95, zLinha);
    cena.add(degrau);
    for (let c = 0; c < COLUNAS; c++) {
      const x = (c - COLUNAS / 2) * 1.15 + (r % 2) * 0.55;
      corTmp.setHex(CORES_TORCIDA[(c * 3 + r) % CORES_TORCIDA.length]);
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

  function resetar() {
    resetPendente = null;
    bola.position.set(PONTO_BOLA.x, PONTO_BOLA.y, PONTO_BOLA.z);
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
    goleiroLivre = true;
  }
  resetar();

  function comemorarTorcida() {
    animar(d(TEMPO.COMEMORA_TORCIDA), function(e, u) {
      var onda = Math.sin(u * Math.PI * 5);
      var envelope = 1 - u * 0.6;
      offTorcida = Math.abs(onda) * 0.55 * envelope;
    }, function() { offTorcida = 0; });

    var corOriginal = new THREE.Color();
    var corBrilho = new THREE.Color();
    animar(d(TEMPO.COMEMORA_TORCIDA * 0.7), function(e, u) {
      var pulsoV = Math.abs(Math.sin(u * Math.PI * 4));
      for (var i = 0; i < LINHAS * COLUNAS; i++) {
        cabecas.getColorAt(i, corOriginal);
        corBrilho.copy(corOriginal).lerp(new THREE.Color(0xffffff), pulsoV * 0.35);
        cabecas.setColorAt(i, corBrilho);
        corpos.setColorAt(i, corBrilho);
      }
      cabecas.instanceColor.needsUpdate = true;
      corpos.instanceColor.needsUpdate = true;
    }, function() {
      var idx2 = 0;
      var corTmp2 = new THREE.Color();
      for (var r = 0; r < LINHAS; r++) {
        for (var c = 0; c < COLUNAS; c++) {
          corTmp2.setHex(CORES_TORCIDA[(c * 3 + r) % CORES_TORCIDA.length]);
          cabecas.setColorAt(idx2, corTmp2);
          corpos.setColorAt(idx2, corTmp2);
          idx2++;
        }
      }
      cabecas.instanceColor.needsUpdate = true;
      corpos.instanceColor.needsUpdate = true;
    });
  }

  function lamentarTorcida() {
    animar(d(TEMPO.LAMENTA_TORCIDA), function(e, u) {
      offTorcida = -Math.sin(u * Math.PI) * 0.22;
    }, function() { offTorcida = 0; });
  }

  var textoIncentivo = null;
  var FRASES_INCENTIVO = [
    'Quase! Tenta de novo!',
    'Boa tentativa!',
    'Não desista!',
    'Você consegue!',
    'Continue tentando!',
    'Foi por pouco!',
    'Na próxima vai!'
  ];

  function mostrarIncentivo() {
    if (textoIncentivo) { cena.remove(textoIncentivo); textoIncentivo = null; }

    var frase = FRASES_INCENTIVO[Math.floor(Math.random() * FRASES_INCENTIVO.length)];

    var canvas2d = document.createElement('canvas');
    canvas2d.width = 512; canvas2d.height = 128;
    var ctx = canvas2d.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);

    ctx.fillStyle = 'rgba(255, 198, 59, 0.92)';
    ctx.beginPath();
    ctx.roundRect(16, 16, 480, 96, 24);
    ctx.fill();
    ctx.strokeStyle = '#21303B';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#21303B';
    ctx.font = 'bold 38px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(frase, 256, 64);

    var textura = new THREE.CanvasTexture(canvas2d);
    var matSprite = new THREE.SpriteMaterial({ map: textura, transparent: true, opacity: 0 });
    textoIncentivo = new THREE.Sprite(matSprite);
    textoIncentivo.scale.set(8, 2, 1);
    textoIncentivo.position.set(0, 4, 5);
    cena.add(textoIncentivo);

    animar(d(400), function(e) {
      textoIncentivo.material.opacity = e;
      textoIncentivo.position.y = 3.5 + 1.5 * e;
    }, function() {
      animar(d(900), null, function() {
        animar(d(500), function(e) {
          textoIncentivo.material.opacity = 1 - e;
          textoIncentivo.position.y = 5 + 1.2 * e;
        }, function() {
          if (textoIncentivo) { cena.remove(textoIncentivo); textoIncentivo = null; }
        }, { ease: EASE.sineOut });
      });
    }, { ease: EASE.sineOut });
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
    sombraBola.position.set(bola.position.x, 0.02, bola.position.z);
    sombraBola.scale.setScalar(Math.max(0.5, 1 - (bola.position.y - ALTURA_BOLA) * 0.25));
    sombraBatedor.position.set(batedor.position.x, 0.02, batedor.position.z);
    sombraGoleiro.position.set(goleiro.position.x, 0.02, goleiro.position.z);
    renderer.render(cena, camera);
  }
  rafId = requestAnimationFrame(quadro);

  // ---------- Chute ----------
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

  function poseGoleiro(zonaId) {
    const z = ZONAS[zonaId];
    if (zonaId === 'meio') return { x: 0, y: GOLEIRO_BASE.y, rotZ: 0, armZ: 0.25, armX: -1.3, zBola: 0.95 };
    const lado = Math.sign(z.x);
    const ang = z.y > 1.5 ? 0.95 : 1.4;
    const phi = -lado * ang;
    return {
      x: z.x + ALCANCE_MAOS * Math.sin(phi),
      y: z.y - ALCANCE_MAOS * Math.cos(phi),
      rotZ: phi, armZ: 2.9, armX: 0, zBola: 0.45
    };
  }

  // Pose de goleiro "esquivando": usado no chute livre quando a resposta
  // foi correta — o goleiro sempre mergulha pro lado OPOSTO ao destino
  // real da bola, entao nunca alcanca (mas isso nao decide gol/fora: quem
  // decide e a area valida em chutarLivre).
  function poseGoleiroEsquiva(destino) {
    var lado = destino.x >= 0 ? -1 : 1;
    var alto = Math.random() < 0.5;
    var zonaFake = { x: lado * (2.3 + Math.random() * 0.6), y: alto ? 2.0 : 0.55 };
    var ang = zonaFake.y > 1.5 ? 0.95 : 1.4;
    var phi = -Math.sign(zonaFake.x) * ang;
    return {
      x: zonaFake.x + ALCANCE_MAOS * Math.sin(phi),
      y: zonaFake.y - ALCANCE_MAOS * Math.cos(phi),
      rotZ: phi, armZ: 2.9, armX: 0
    };
  }

  // Depois de qualquer lance (gol, defesa ou fora) o goleiro nao pode ficar
  // suspenso na pose do mergulho — ele cai/tomba no chao, com um pequeno
  // atraso (pra nao competir visualmente com a comemoracao/lamento), e so
  // depois disso a cena reseta.
  function quedaGoleiro() {
    var y0 = goleiro.position.y;
    animar(d(420), function(e) {
      goleiro.position.y = y0 * (1 - e);
      goleiro.rotation.x = 0.85 * e;
    }, null, { ease: EASE.cubicIn, atraso: reduzMovimento ? 0 : 180 });
  }

  function chutar(zonaId, correta, aoFinalizar) {
    if (emAnimacao || !vivo) return;
    const alvo = ZONAS[zonaId];
    if (!alvo) return;
    if (resetPendente) { tweens.length = 0; resetar(); }
    emAnimacao = true;
    goleiroLivre = false;

    let zonaGoleiro = zonaId;
    if (correta) {
      const outras = Object.keys(ZONAS).filter(function(id) { return id !== zonaId; });
      zonaGoleiro = outras[Math.floor(Math.random() * outras.length)];
    }
    const pose = poseGoleiro(zonaGoleiro);
    const fim = { x: alvo.x, y: alvo.y, z: correta ? -0.35 : pose.zBola };

    function iniciarBolaEGoleiro() {
      const g0 = { x: goleiro.position.x, y: GOLEIRO_BASE.y };
      animar(d(TEMPO.MERGULHO_GOLEIRO), function(e) {
        goleiro.position.x = g0.x + (pose.x - g0.x) * e;
        goleiro.position.y = g0.y + (pose.y - g0.y) * e;
        goleiro.rotation.z = pose.rotZ * e;
        goleiroObj.bracoE.rotation.set(pose.armX * e, 0, -(0.6 + (pose.armZ - 0.6) * e));
        goleiroObj.bracoD.rotation.set(pose.armX * e, 0, 0.6 + (pose.armZ - 0.6) * e);
      }, function() {
        if (!correta) {
          pulso(TEMPO.IMPACTO_DEFESA, function(s) { goleiro.scale.set(1 + 0.12 * s, 1 - 0.15 * s, 1); });
          mostrarIncentivo();
        }
      }, { ease: EASE.sineOut });

      const ini = { x: bola.position.x, y: bola.position.y, z: bola.position.z };
      animar(d(TEMPO.VOO_BOLA), function(e, u) {
        bola.position.set(
          ini.x + (fim.x - ini.x) * e,
          ini.y + (fim.y - ini.y) * e + 4 * u * (1 - u) * 0.5,
          ini.z + (fim.z - ini.z) * e
        );
        bolaMalha.rotation.x = -u * TEMPO.GIRO_BOLA;
        bolaMalha.rotation.z = u * TEMPO.GIRO_BOLA * 0.3;
      }, function() {
        emAnimacao = false;
        if (correta) {
          const yRede = Math.max(ALTURA_BOLA, fim.y - 0.25);
          animar(d(TEMPO.BOLA_NA_REDE), function(e) {
            bola.position.z = fim.z + (-1.5 - fim.z) * e;
            bola.position.y = fim.y + (yRede - fim.y) * e;
          }, null, { ease: EASE.sineOut });
          pulso(TEMPO.VIBRACAO_REDE, function(s) { rede.scale.set(1 + 0.05 * s, 1 + 0.05 * s, 1 + 0.05 * s); });
          comemorarTorcida();
        } else {
          animar(d(TEMPO.REBOTE), function(e) {
            bola.position.z = fim.z + 0.9 * e;
            bola.position.y = fim.y * (1 - e * e) + ALTURA_BOLA * e * e;
          }, null, { ease: EASE.sineOut });
          lamentarTorcida();
        }
        quedaGoleiro();
        if (aoFinalizar) aoFinalizar({ gol: correta });
        resetPendente = animar(reduzMovimento ? 60 : TEMPO.ANTES_DE_RESETAR, null, resetar);
      }, { ease: EASE.quadOut });
    }

    animarChute(iniciarBolaEGoleiro);
  }

  // ---------- Mira livre (etapa 2, apos resposta correta) ----------
  var raycasterMira = new THREE.Raycaster();
  var planoGol = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // z = 0
  var miraOuvintePointerMove = null;
  var pontoMiraAtual = { x: 0, y: 1.3 };

  function calcularPontoMundo(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 1.3 };
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    raycasterMira.setFromCamera({ x: ndcX, y: ndcY }, camera);
    const alvo = new THREE.Vector3();
    const atingiu = raycasterMira.ray.intersectPlane(planoGol, alvo);
    return atingiu ? alvo : { x: 0, y: 1.3 };
  }

  function clampMira(ponto) {
    return {
      x: Math.min(AREA_SELECAO.xMax, Math.max(AREA_SELECAO.xMin, ponto.x)),
      y: Math.min(AREA_SELECAO.yMax, Math.max(AREA_SELECAO.yMin, ponto.y))
    };
  }

  function pontoParaTela(ponto) {
    const v = new THREE.Vector3(ponto.x, ponto.y, 0);
    v.project(camera);
    return {
      leftPercent: (v.x * 0.5 + 0.5) * 100,
      topPercent: (-v.y * 0.5 + 0.5) * 100
    };
  }

  function iniciarMira(aoAtualizar) {
    pontoMiraAtual = { x: 0, y: 1.3 };
    function mover(clientX, clientY) {
      const bruto = calcularPontoMundo(clientX, clientY);
      pontoMiraAtual = clampMira(bruto);
      if (aoAtualizar) aoAtualizar(pontoParaTela(pontoMiraAtual));
    }
    miraOuvintePointerMove = function(ev) {
      var t = (ev.touches && ev.touches[0]) || ev;
      mover(t.clientX, t.clientY);
    };
    renderer.domElement.style.cursor = 'crosshair';
    renderer.domElement.addEventListener('pointermove', miraOuvintePointerMove);
    renderer.domElement.addEventListener('touchmove', miraOuvintePointerMove, { passive: true });
    if (aoAtualizar) aoAtualizar(pontoParaTela(pontoMiraAtual)); // posicao inicial (centro do gol)
  }

  function pararMira() {
    if (miraOuvintePointerMove) {
      renderer.domElement.removeEventListener('pointermove', miraOuvintePointerMove);
      renderer.domElement.removeEventListener('touchmove', miraOuvintePointerMove);
    }
    miraOuvintePointerMove = null;
    renderer.domElement.style.cursor = '';
    return pontoMiraAtual;
  }

  // ---------- Chute livre (etapa 4, apos mira + forca) ----------
  function calcularResultadoLivre(pontoMira, forca) {
    var f = Math.min(1, Math.max(0, typeof forca === 'number' ? forca : 0.5));
    var distIdeal = 0;
    if (f < FORCA_IDEAL.min) distIdeal = FORCA_IDEAL.min - f;
    else if (f > FORCA_IDEAL.max) distIdeal = f - FORCA_IDEAL.max;
    var faixaFora = Math.max(FORCA_IDEAL.min, 1 - FORCA_IDEAL.max);
    var intensidade = (distIdeal / faixaFora) * DESVIO_MAX;
    var anguloAleatorio = Math.random() * Math.PI * 2;
    var desvioX = Math.cos(anguloAleatorio) * intensidade;
    var desvioY = Math.sin(anguloAleatorio) * intensidade * 0.6;
    var destino = {
      x: pontoMira.x + desvioX,
      y: Math.max(0.02, pontoMira.y + desvioY),
      z: 0
    };
    var dentro = destino.x >= AREA_VALIDA.xMin && destino.x <= AREA_VALIDA.xMax &&
                 destino.y >= AREA_VALIDA.yMin && destino.y <= AREA_VALIDA.yMax;
    return { destino: destino, dentro: dentro };
  }

  function chutarLivre(pontoMira, forca, altura, aoFinalizar) {
    if (emAnimacao || !vivo) return;
    if (resetPendente) { tweens.length = 0; resetar(); }
    emAnimacao = true;
    goleiroLivre = false;

    var forcaClamp = Math.min(1, Math.max(0, typeof forca === 'number' ? forca : 0.5));
    var alturaClamp = Math.min(1, Math.max(0, typeof altura === 'number' ? altura : 0.5));
    var resultado = calcularResultadoLivre(pontoMira || { x: 0, y: 1.3 }, forcaClamp);
    var pose = poseGoleiroEsquiva(resultado.destino);
    var fim = resultado.dentro
      ? { x: resultado.destino.x, y: resultado.destino.y, z: -0.35 }
      : { x: resultado.destino.x * 1.15, y: resultado.destino.y + 0.35, z: -1.1 };

    // Altura so muda o FORMATO do arco (visual) e a velocidade do voo —
    // nao entra no calculo de dentro/fora, que ja foi decidido acima.
    var arcoAltura = ALTURA_ARCO_BASE + alturaClamp * ALTURA_ARCO_MAX;
    // Chute forte = bola chega mais rapido; fraco = mais devagar.
    var duracaoVoo = d(Math.round(TEMPO.VOO_BOLA * (1.3 - forcaClamp * 0.6)));

    function iniciarBolaEGoleiro() {
      const g0 = { x: goleiro.position.x, y: GOLEIRO_BASE.y };
      animar(d(TEMPO.MERGULHO_GOLEIRO), function(e) {
        goleiro.position.x = g0.x + (pose.x - g0.x) * e;
        goleiro.position.y = g0.y + (pose.y - g0.y) * e;
        goleiro.rotation.z = pose.rotZ * e;
        goleiroObj.bracoE.rotation.set(pose.armX * e, 0, -(0.6 + (pose.armZ - 0.6) * e));
        goleiroObj.bracoD.rotation.set(pose.armX * e, 0, 0.6 + (pose.armZ - 0.6) * e);
      }, null, { ease: EASE.sineOut });

      const ini = { x: bola.position.x, y: bola.position.y, z: bola.position.z };
      animar(duracaoVoo, function(e, u) {
        bola.position.set(
          ini.x + (fim.x - ini.x) * e,
          ini.y + (fim.y - ini.y) * e + arcoAltura * u * (1 - u) * 4,
          ini.z + (fim.z - ini.z) * e
        );
        bolaMalha.rotation.x = -u * TEMPO.GIRO_BOLA;
        bolaMalha.rotation.z = u * TEMPO.GIRO_BOLA * 0.3;
      }, function() {
        emAnimacao = false;
        if (resultado.dentro) {
          const yRede = Math.max(ALTURA_BOLA, fim.y - 0.25);
          animar(d(TEMPO.BOLA_NA_REDE), function(e) {
            bola.position.z = fim.z + (-1.5 - fim.z) * e;
            bola.position.y = fim.y + (yRede - fim.y) * e;
          }, null, { ease: EASE.sineOut });
          pulso(TEMPO.VIBRACAO_REDE, function(s) { rede.scale.set(1 + 0.05 * s, 1 + 0.05 * s, 1 + 0.05 * s); });
          comemorarTorcida();
        } else {
          lamentarTorcida();
        }
        quedaGoleiro();
        if (aoFinalizar) aoFinalizar({ gol: resultado.dentro, fora: !resultado.dentro });
        resetPendente = animar(reduzMovimento ? 60 : TEMPO.ANTES_DE_RESETAR, null, resetar);
      }, { ease: EASE.quadOut });
    }

    animarChute(iniciarBolaEGoleiro);
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
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function(m) { m.dispose(); }); }
    });
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  return { chutar, iniciarMira, pararMira, chutarLivre, destruir };
}
