// game.js — cena 3D do pênalti (Three.js r149, build UMD via CDN).
//
// Contrato com o main.js (inalterado em relação à versão Phaser):
//   criarJogoPenalti(containerId, selecaoId) -> { chutar(zonaId, correta, aoFinalizar), destruir() }
// Cada zona do gol é uma alternativa da pergunta: zona certa = gol (o goleiro
// pula para OUTRA zona); zona errada = o goleiro pula exatamente na zona
// chutada e defende. Sem sorteio de resultado.
//
// Diferença importante: os botões .botao-zona (HTML) ficam por cima do canvas.
// Como agora a câmera é 3D, as posições left/top desses botões são calculadas
// projetando cada zona do gol na tela (posicionarBotoes) e aplicadas como
// estilo inline — por isso os percentuais do CSS deixam de mandar enquanto o
// jogo está montado (destruir() devolve o controle ao CSS).
//
// Mantido da versão 2D: camisa da seleção (HU-16), chute só sai quando o pé
// encosta na bola (HU-18), som do chute no contato (HU-09), torcida reagindo
// (HU-17), e prefers-reduced-motion (animações praticamente instantâneas, com a
// mesma ordem de eventos).
//
// Unidades: metros. Eixo x = lateral (negativo = esquerda da tela), y = altura,
// z = profundidade (gol em z=0, marca do pênalti em z=11, câmera atrás).

const ALTURA_BOLA = 0.22; // raio da bola (maior que a real, para ler bem na tela)

// Pontos do plano do gol (z=0) que cada alternativa representa.
const ZONAS = {
  'topo-esquerda':  { x: -2.5, y: 2.0 },
  'topo-direita':   { x:  2.5, y: 2.0 },
  'meio':           { x:  0,   y: 1.3 },
  'baixo-esquerda': { x: -2.5, y: 0.55 },
  'baixo-direita':  { x:  2.5, y: 0.55 }
};

const CAMERA = { fov: 34, pos: [1.2, 4.4, 19], alvo: [0, -1.5, 0] };
const PONTO_BOLA = { x: 0, y: ALTURA_BOLA, z: 11 };
const INICIO_BATEDOR = { x: -1.0, z: 13.4 };
const PLANTIO_BATEDOR = { x: -0.3, z: 11.55 };
const GOLEIRO_BASE = { x: 0, y: 1.2, z: 0.3 }; // centro do tronco
const ALCANCE_MAOS = 0.95; // do centro do tronco até as mãos, com braços para cima

// Ritmo da animação (ms). Tudo passa por d() para respeitar prefers-reduced-motion.
// Valores calibrados para a animação ser claramente perceptível (não instantânea)
// e ao mesmo tempo manter o ritmo de jogo fluido.
const TEMPO = {
  CORRIDA: 760,           // batedor caminha até a marca
  PERNA_TRAS: 300,        // batedor arma o chute
  PERNA_FRENTE: 280,      // perna desce até encostar na bola
  PERNA_VOLTA: 350,       // pé volta à posição de descanso
  VOO_BOLA: 1200,         // bola voa até a zona
  GIRO_BOLA: 4 * Math.PI,
  MERGULHO_GOLEIRO: 1000, // goleiro mergulha acompanhando a bola
  IMPACTO_DEFESA: 250,    // impacto da defesa (visual)
  BOLA_NA_REDE: 400,      // a bola afunda na rede depois do gol
  REBOTE: 400,            // rebote na defesa
  VIBRACAO_REDE: 300,     // rede balança
  COMEMORA_TORCIDA: 1600, // torcida vibra no gol
  LAMENTA_TORCIDA: 600,   // torcida lamenta na defesa
  ANTES_DE_RESETAR: 1800  // pausa antes de resetar
};

const CAMISA_PRIMARIA_PADRAO = 0x3a5fcd;
const CAMISA_SECUNDARIA_PADRAO = 0xfffdf6;
const CORES_TORCIDA = [0xe0343b, 0xffc63b, 0x3a5fcd, 0xfffdf6, 0x2e9e5b];

// Converte "#RRGGBB" em número hex. Retorna o fallback se o valor for
// inválido/ausente — nunca lança erro.
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

  // Seleção escolhida define a camisa do batedor; sem seleção, camisa neutra.
  let selecaoEscolhida = null;
  if (typeof SELECOES !== 'undefined' && Array.isArray(SELECOES)) {
    selecaoEscolhida = SELECOES.find(function(s) { return s.id === selecaoId; }) || null;
  }
  const corPrimaria = corHexParaNumero(selecaoEscolhida && selecaoEscolhida.corPrimaria, CAMISA_PRIMARIA_PADRAO);
  const corSecundaria = corHexParaNumero(selecaoEscolhida && selecaoEscolhida.corSecundaria, CAMISA_SECUNDARIA_PADRAO);

  // Lança se o navegador não tiver WebGL — o main.js já trata (jogo sem cena).
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
  linha(0, 5.5, 18.32, 0.14);       // pequena área
  linha(-9.16, 2.75, 0.14, 5.5);
  linha(9.16, 2.75, 0.14, 5.5);
  linha(0, 16.5, 40.32, 0.14);      // grande área
  const marca = new THREE.Mesh(new THREE.CircleGeometry(0.14, 16), matLinha);
  marca.rotation.x = -Math.PI / 2;
  marca.position.set(0, 0.016, PONTO_BOLA.z);
  cena.add(marca);

  // ---------- Torcida (arquibancada atrás do gol) ----------
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

  // A rede é um grupo centrado no seu próprio meio, para "vibrar" por escala.
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

  // ---------- Sombras simples (círculos escuros no chão) ----------
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

    // Tronco (pivô no quadril) — leva torso, cabeça e braços, para poder inclinar.
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
  batedor.rotation.y = Math.PI; // de costas para a câmera, olhando o gol
  const sombraBatedor = criarSombra(0.45);
  cena.add(batedor, sombraBatedor);

  const goleiroObj = criarPessoa({ camisa: 0x21303b, detalhe: 0xffc63b, calcao: 0x21303b, meia: 0x21303b, luva: 0xffc63b });
  goleiroObj.raiz.position.y = -GOLEIRO_BASE.y; // pivô da cena = centro do tronco
  const goleiro = new THREE.Group();
  goleiro.add(goleiroObj.raiz);
  const sombraGoleiro = criarSombra(0.5);
  cena.add(goleiro, sombraGoleiro);

  // ---------- Alto contraste: ajusta TODAS as cores 3D para acessibilidade ----------
  // Salva as cores originais de cada mesh para poder restaurar ao desligar.
  var coresOriginaisGoleiro = [];
  goleiroObj.raiz.traverse(function(child) {
    if (child.isMesh && child.material && child.material.color) {
      coresOriginaisGoleiro.push({ mesh: child, cor: child.material.color.getHex() });
    }
  });

  var altoContrasteAtivo = false;

  function aplicarAltoContraste() {
    var ativo = document.body.classList.contains('alto-contraste');
    if (ativo === altoContrasteAtivo) return; // sem mudança
    altoContrasteAtivo = ativo;

    if (ativo) {
      // ——— GOLEIRO: cores vibrantes sobre fundo escuro ———
      coresOriginaisGoleiro.forEach(function(item) {
        var hex = item.cor;
        if (hex === 0x21303b) {
          // Camisa/calção/meias escuras → laranja forte (contraste máximo)
          item.mesh.material.color.setHex(0xff6600);
        } else if (hex === 0xffc63b) {
          // Detalhes dourados/luvas → branco puro
          item.mesh.material.color.setHex(0xffffff);
        }
      });

      // ——— CENÁRIO: fundo de alto contraste ———
      cena.background.setHex(0x1a3a5c); // azul bem escuro — goleiro laranja se destaca

      // ——— CAMPO: faixas com mais contraste entre si ———
      cena.children.forEach(function(child) {
        if (child.isMesh && child.material && child.material.color) {
          var hex = child.material.color.getHex();
          // Degraus da arquibancada e paredão: clarear para não engolir a torcida
          if (hex === 0x1c2b3a) child.material.color.setHex(0x2c4a6a);
        }
      });

    } else {
      // ——— RESTAURA tudo ao estado original ———
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

  // Observa mudanças no alto-contraste (toggle do usuário durante o jogo)
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

  // ---------- Mini-motor de animação (substitui os tweens do Phaser) ----------
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
  function pulso(duracao, aplicar, aoTerminar) { // vai e volta (yoyo)
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

  // --- Torcida vibra forte no gol: onda que sobe e desce várias vezes ---
  function comemorarTorcida() {
    // Onda de pulo intensa — 5 saltos com amplitude decrescente
    animar(d(TEMPO.COMEMORA_TORCIDA), function(e, u) {
      var onda = Math.sin(u * Math.PI * 5);
      var envelope = 1 - u * 0.6; // amplitude diminui gradualmente
      offTorcida = Math.abs(onda) * 0.55 * envelope;
    }, function() { offTorcida = 0; });

    // Efeito visual: as cores da torcida "piscam" (brilho extra)
    var corOriginal = new THREE.Color();
    var corBrilho = new THREE.Color();
    animar(d(TEMPO.COMEMORA_TORCIDA * 0.7), function(e, u) {
      var pulso = Math.abs(Math.sin(u * Math.PI * 4));
      for (var i = 0; i < LINHAS * COLUNAS; i++) {
        cabecas.getColorAt(i, corOriginal);
        corBrilho.copy(corOriginal).lerp(new THREE.Color(0xffffff), pulso * 0.35);
        cabecas.setColorAt(i, corBrilho);
        corpos.setColorAt(i, corBrilho);
      }
      cabecas.instanceColor.needsUpdate = true;
      corpos.instanceColor.needsUpdate = true;
    }, function() {
      // Restaura as cores originais
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

  // --- Torcida lamenta suavemente na defesa ---
  function lamentarTorcida() {
    animar(d(TEMPO.LAMENTA_TORCIDA), function(e, u) {
      offTorcida = -Math.sin(u * Math.PI) * 0.22;
    }, function() { offTorcida = 0; });
  }

  // --- Animação de incentivo positivo (texto 3D flutuante no erro) ---
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
    // Remove texto anterior se existir
    if (textoIncentivo) { cena.remove(textoIncentivo); textoIncentivo = null; }

    var frase = FRASES_INCENTIVO[Math.floor(Math.random() * FRASES_INCENTIVO.length)];

    // Cria um sprite com canvas 2D para o texto
    var canvas2d = document.createElement('canvas');
    canvas2d.width = 512; canvas2d.height = 128;
    var ctx = canvas2d.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);

    // Fundo arredondado semi-transparente
    ctx.fillStyle = 'rgba(255, 198, 59, 0.92)';
    ctx.beginPath();
    ctx.roundRect(16, 16, 480, 96, 24);
    ctx.fill();
    ctx.strokeStyle = '#21303B';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Texto
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

    // Animação: aparece subindo, fica, e desaparece
    animar(d(400), function(e) {
      textoIncentivo.material.opacity = e;
      textoIncentivo.position.y = 3.5 + 1.5 * e;
    }, function() {
      // Fica visível por um momento
      animar(d(900), null, function() {
        // Depois desaparece subindo
        animar(d(500), function(e) {
          textoIncentivo.material.opacity = 1 - e;
          textoIncentivo.position.y = 5 + 1.2 * e;
        }, function() {
          if (textoIncentivo) { cena.remove(textoIncentivo); textoIncentivo = null; }
        }, { ease: EASE.sineOut });
      });
    }, { ease: EASE.sineOut });
  }

  // ---------- Botões de zona sobre o canvas ----------
  function posicionarBotoes() {
    camera.updateMatrixWorld();
    const v = new THREE.Vector3();
    Object.keys(ZONAS).forEach(function(id) {
      const botao = document.querySelector('.botao-zona[data-zona="' + id + '"]');
      if (!botao) return;
      v.set(ZONAS[id].x, ZONAS[id].y, 0).project(camera);
      botao.style.left = ((v.x * 0.5 + 0.5) * 100).toFixed(2) + '%';
      botao.style.top = ((-v.y * 0.5 + 0.5) * 100).toFixed(2) + '%';
    });
  }
  function ajustarTamanho() {
    const w = container.clientWidth || 640, h = container.clientHeight || 360;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    posicionarBotoes();
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
  // O batedor corre, arma e chuta; `aoContato` só roda no instante em que o pé
  // encosta na bola — a bola nunca sai do lugar antes disso.
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
        b.tronco.rotation.x = 0.15 * e; // inclina para trás ao armar
        b.bracoE.rotation.x = 0; b.bracoD.rotation.x = 0;
      }, function() {
        let tocou = false;
        animar(d(TEMPO.PERNA_FRENTE), function(e) {
          b.pernaChute.rotation.x = 0.9 - 2.1 * e;
          b.pernaChute.rotation.z = -0.3 * e; // cruza a perna em direção à bola
          b.tronco.rotation.x = 0.15 - 0.4 * e;
          if (!tocou && e >= 0.64) {
            tocou = true;
            if (typeof SFX !== 'undefined' && SFX.chute) SFX.chute(); // HU-09
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

  // Pose final do goleiro para defender uma zona: centro do tronco, inclinação,
  // braços e o z em que as mãos encontram a bola.
  function poseGoleiro(zonaId) {
    const z = ZONAS[zonaId];
    if (zonaId === 'meio') return { x: 0, y: GOLEIRO_BASE.y, rotZ: 0, armZ: 0.25, armX: -1.3, zBola: 0.95 };
    const lado = Math.sign(z.x);
    const ang = z.y > 1.5 ? 0.95 : 1.4; // salto alto (~54°) ou mergulho rasteiro (~80°)
    const phi = -lado * ang;
    return {
      x: z.x + ALCANCE_MAOS * Math.sin(phi),
      y: z.y - ALCANCE_MAOS * Math.cos(phi),
      rotZ: phi, armZ: 2.9, armX: 0, zBola: 0.45
    };
  }

  function chutar(zonaId, correta, aoFinalizar) {
    if (emAnimacao || !vivo) return;
    const alvo = ZONAS[zonaId];
    if (!alvo) return;
    if (resetPendente) { tweens.length = 0; resetar(); } // novo chute antes do reset da jogada anterior
    emAnimacao = true;
    goleiroLivre = false;

    // Certo -> o goleiro vai para outra zona (gol); errado -> na zona chutada (defesa).
    let zonaGoleiro = zonaId;
    if (correta) {
      const outras = Object.keys(ZONAS).filter(function(id) { return id !== zonaId; });
      zonaGoleiro = outras[Math.floor(Math.random() * outras.length)];
    }
    const pose = poseGoleiro(zonaGoleiro);
    const fim = { x: alvo.x, y: alvo.y, z: correta ? -0.35 : pose.zBola };

    function iniciarBolaEGoleiro() {
      // O goleiro sai junto: chega um pouco antes da bola para não parecer teleporte.
      const g0 = { x: goleiro.position.x, y: GOLEIRO_BASE.y };
      animar(d(TEMPO.MERGULHO_GOLEIRO), function(e) {
        goleiro.position.x = g0.x + (pose.x - g0.x) * e;
        goleiro.position.y = g0.y + (pose.y - g0.y) * e;
        goleiro.rotation.z = pose.rotZ * e;
        goleiroObj.bracoE.rotation.set(pose.armX * e, 0, -(0.6 + (pose.armZ - 0.6) * e));
        goleiroObj.bracoD.rotation.set(pose.armX * e, 0, 0.6 + (pose.armZ - 0.6) * e);
      }, function() {
        if (!correta) { // impacto da defesa: o goleiro "encolhe" ao segurar a bola
          pulso(TEMPO.IMPACTO_DEFESA, function(s) { goleiro.scale.set(1 + 0.12 * s, 1 - 0.15 * s, 1); });
          mostrarIncentivo();
        }
      }, { ease: EASE.sineOut });

      // Voo da bola: reta até o alvo com um pequeno arco e giro.
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
          // Gol: a bola afunda na rede, que balança, e a torcida comemora.
          const yRede = Math.max(ALTURA_BOLA, fim.y - 0.25);
          animar(d(TEMPO.BOLA_NA_REDE), function(e) {
            bola.position.z = fim.z + (-1.5 - fim.z) * e;
            bola.position.y = fim.y + (yRede - fim.y) * e;
          }, null, { ease: EASE.sineOut });
          pulso(TEMPO.VIBRACAO_REDE, function(s) { rede.scale.set(1 + 0.05 * s, 1 + 0.05 * s, 1 + 0.05 * s); });
          comemorarTorcida();
        } else {
          // Defesa: a bola quica no goleiro e cai para a frente.
          animar(d(TEMPO.REBOTE), function(e) {
            bola.position.z = fim.z + 0.9 * e;
            bola.position.y = fim.y * (1 - e * e) + ALTURA_BOLA * e * e;
          }, null, { ease: EASE.sineOut });
          lamentarTorcida();
        }
        if (aoFinalizar) aoFinalizar({ gol: correta });
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
    if (observador) observador.disconnect(); else window.removeEventListener('resize', ajustarTamanho);
    if (observadorContraste) observadorContraste.disconnect();
    Object.keys(ZONAS).forEach(function(id) { // devolve as posições dos botões ao CSS
      const botao = document.querySelector('.botao-zona[data-zona="' + id + '"]');
      if (botao) { botao.style.left = ''; botao.style.top = ''; }
    });
    cena.traverse(function(o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function(m) { m.dispose(); }); }
    });
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  return { chutar, destruir };
}
