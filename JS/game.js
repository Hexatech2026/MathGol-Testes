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
// v2 (21/10): personagens refeitos. Batedor e goleiro agora tem esqueleto
// articulado (joelho, cotovelo, pescoco, pe) com malhas arredondadas, e
// toda animacao de corpo passa por poses-chave interpoladas com curva
// suave — ver "PERSONAGENS" e "POSES" abaixo.
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
// Pe de apoio planta ao lado da bola; o pe do chute passa pelo meio dela.
const PLANTIO_BATEDOR = { x: -0.12, z: 11.6 };
const CONTATO_BATEDOR = { x: -0.12, z: 11.5 };
const GOLEIRO_BASE = { x: 0, y: 1.2, z: 0.3 }; // centro do tronco
const ALCANCE_MAOS = 0.95; // do centro do tronco ate as maos, com bracos para cima

// Ritmo da animacao (ms). Tudo passa por d() para respeitar prefers-reduced-motion.
// v1.5: animacoes ~35% mais rapidas (valores antigos no comentario).
const TEMPO = {
  CORRIDA: 480,           // batedor corre ate a marca               (760)
  PERNA_TRAS: 200,        // batedor arma o chute                   (300)
  PERNA_FRENTE: 180,      // perna desce ate encostar na bola       (280)
  PERNA_VOLTA: 240,       // pe volta a posicao de descanso         (350)
  VOO_BOLA: 800,          // bola voa ate a zona                    (1200)
  GIRO_BOLA: 4 * Math.PI,
  MERGULHO_GOLEIRO: 680,  // goleiro mergulha acompanhando a bola   (1000)
  IMPACTO_DEFESA: 180,    // impacto da defesa (visual)             (250)
  BOLA_NA_REDE: 280,      // a bola afunda na rede depois do gol    (400)
  REBOTE: 280,            // rebote na defesa                       (400)
  VIBRACAO_REDE: 220,     // rede balanca                           (300)
  // v2: as tres reacoes abaixo cabem antes do reset (1200 ms). Com 1600 ms
  // a festa da torcida e a do batedor eram cortadas no meio pelo reset e
  // "pulavam" de volta ao repouso na frente da crianca.
  COMEMORA_TORCIDA: 1150, // torcida vibra no gol                   (1600)
  LAMENTA_TORCIDA: 900,   // torcida lamenta na defesa/fora         (700)
  ANIMA_TORCIDA: 900,     // grito curto quando a crianca acerta a conta
  POSE_BATEDOR: 420,      // troca de pose do batedor
  COMEMORA_BATEDOR: 1150, // pulos e soco no ar depois do gol       (1500)
  LAMENTA_BATEDOR: 1100,  // maos na cabeca depois de perder
  ANTES_DE_RESETAR: 1200  // pausa antes de resetar                 (1800)
};
// O chute e um clipe unico (corrida + armar + contato + volta), sem
// emendas entre etapas. O contato fica no mesmo instante de antes.
const TOTAL_CHUTE = TEMPO.CORRIDA + TEMPO.PERNA_TRAS + TEMPO.PERNA_FRENTE + TEMPO.PERNA_VOLTA;
const CONTATO_MS = TEMPO.CORRIDA + TEMPO.PERNA_TRAS + Math.round(TEMPO.PERNA_FRENTE * 0.86);

const CAMISA_PRIMARIA_PADRAO = 0x3a5fcd;
const CAMISA_SECUNDARIA_PADRAO = 0xfffdf6;
const CORES_TORCIDA = [0xe0343b, 0xffc63b, 0x3a5fcd, 0xfffdf6, 0x2e9e5b];
const PELES_TORCIDA = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xa86b45];
const CABELOS_TORCIDA = [0x2b1d14, 0x161210, 0x4a2f1b, 0x7a5230, 0x1f1f1f, 0xc9a25e];

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
  const corTerciaria = corHexParaNumero(selecaoEscolhida && selecaoEscolhida.corTerciaria, corSecundaria);
  const padraoCamisa = (selecaoEscolhida && selecaoEscolhida.padrao) || 'liso';

  // Lanca se o navegador nao tiver WebGL — o main.js ja trata (jogo sem cena).
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  // Sombra de verdade so dos personagens, da bola e das traves (a torcida
  // nao projeta). Mapa de 1024 cobrindo so a area do penalti: barato.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const cena = new THREE.Scene();
  cena.background = new THREE.Color(0x8ecae6);
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 16 / 9, 0.1, 200);
  camera.position.set(CAMERA.pos[0], CAMERA.pos[1], CAMERA.pos[2]);
  camera.lookAt(CAMERA.alvo[0], CAMERA.alvo[1], CAMERA.alvo[2]);

  cena.add(new THREE.HemisphereLight(0xffffff, 0x3f8f5a, 0.85));
  const sol = new THREE.DirectionalLight(0xffffff, 0.6);
  sol.position.set(6, 12, 10);
  sol.target.position.set(0, 0, 5);
  sol.castShadow = true;
  sol.shadow.mapSize.set(1024, 1024);
  sol.shadow.camera.left = -9; sol.shadow.camera.right = 9;
  sol.shadow.camera.top = 9; sol.shadow.camera.bottom = -9;
  sol.shadow.camera.near = 2; sol.shadow.camera.far = 40;
  sol.shadow.bias = -0.0006;
  sol.shadow.normalBias = 0.02;
  cena.add(sol, sol.target);
  // Luz de recorte vinda de tras do gol: separa os bonecos do gramado.
  const contraluz = new THREE.DirectionalLight(0xfff1dc, 0.15);
  contraluz.position.set(-5, 6, -8);
  cena.add(contraluz);

  const mat = function(cor) { return new THREE.MeshLambertMaterial({ color: cor }); };

  // ---------- Campo ----------
  for (let i = 0; i < 14; i++) {
    const faixa = new THREE.Mesh(new THREE.PlaneGeometry(60, 3), mat(i % 2 ? 0x2a9455 : 0x2e9e5b));
    faixa.rotation.x = -Math.PI / 2;
    faixa.position.set(0, 0, -7.5 + i * 3);
    faixa.receiveShadow = true;
    cena.add(faixa);
  }
  // Lambert (e nao Basic) para a sombra dos jogadores cair tambem nas linhas.
  const matLinha = new THREE.MeshLambertMaterial({ color: 0xfffdf6 });
  function linha(x, z, largura, comprimento) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(largura, comprimento), matLinha);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.015, z);
    m.receiveShadow = true;
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
  marca.receiveShadow = true;
  cena.add(marca);

  // ---------- Torcida (arquibancada atras do gol) ----------
  //
  // v2: cada torcedor e corpo arredondado + cabeca com cor de pele + cabelo
  // + um par de bracos que gira a partir do ombro (antes eram tres caixas
  // da cor da camisa). Continua instanciado: 4 malhas para 144 pessoas.
  const torcida = new THREE.Group();
  const LINHAS = 4, COLUNAS = 36, TOTAL_TORCIDA = LINHAS * COLUNAS;

  // Junta varias geometrias numa so (sem depender de BufferGeometryUtils,
  // que nao vem no build UMD).
  function fundirGeometrias(lista) {
    const partes = lista.map(function(g) { return g.index ? g.toNonIndexed() : g; });
    const comUv = partes.every(function(g) { return !!g.attributes.uv; });
    let total = 0;
    partes.forEach(function(g) { total += g.attributes.position.count; });
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
    const uv = comUv ? new Float32Array(total * 2) : null;
    let o = 0;
    partes.forEach(function(g) {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      if (uv) uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  }

  // Em cada articulacao, junta numa malha so as pecas que usam o mesmo
  // material (cranio + nariz + orelhas, ombro + manga, palma + polegar...).
  // Mesmo boneco, menos chamadas de desenho: ~46 malhas viram ~30.
  function fundirPorMaterial(grupo) {
    const porMaterial = new Map();
    grupo.children.forEach(function(o) {
      if (!o.isMesh) return;
      if (!porMaterial.has(o.material)) porMaterial.set(o.material, []);
      porMaterial.get(o.material).push(o);
    });
    porMaterial.forEach(function(lista, m) {
      if (lista.length < 2) return;
      const nova = new THREE.Mesh(fundirGeometrias(lista.map(function(o) {
        o.updateMatrix();
        return o.geometry.clone().applyMatrix4(o.matrix);
      })), m);
      nova.castShadow = lista.some(function(o) { return o.castShadow; });
      lista.forEach(function(o) { grupo.remove(o); });
      grupo.add(nova);
    });
  }

  // Malhas enxutas (~500 triangulos por pessoa): a 10 m da camera nao se
  // ve diferenca, e sao 144 pessoas.
  const geoCorpoTorcida = new THREE.CapsuleGeometry(0.25, 0.3, 2, 9);
  geoCorpoTorcida.scale(1.2, 0.92, 0.8);
  const geoCabecaTorcida = new THREE.SphereGeometry(0.19, 10, 7);
  const geoCabeloTorcida = new THREE.SphereGeometry(0.2, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.5);
  geoCabeloTorcida.rotateX(-0.35);
  geoCabeloTorcida.translate(0, 0.02, -0.01);
  // Bracos em "V", com o pivo no ombro (y = 0) e apontando para cima.
  const geoBracosTorcida = fundirGeometrias([-1, 1].map(function(lado) {
    const b = new THREE.CapsuleGeometry(0.065, 0.36, 2, 6);
    b.translate(0, 0.245, 0);
    b.rotateZ(-lado * 0.3);
    b.translate(lado * 0.27, 0, 0);
    return b;
  }));

  function instanciada(geo) {
    const m = new THREE.InstancedMesh(geo, mat(0xffffff), TOTAL_TORCIDA);
    m.frustumCulled = false; // a esfera de recorte e da geometria-base, nao da arquibancada
    return m;
  }
  const cabecas = instanciada(geoCabecaTorcida);
  const cabelos = instanciada(geoCabeloTorcida);
  const corpos = instanciada(geoCorpoTorcida);
  const bracos = instanciada(geoBracosTorcida);
  const corTmp = new THREE.Color();
  const dummy = new THREE.Object3D();
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
      // Cada torcedor tem fase, amplitude e ritmo proprios: sincronizados,
      // 144 pessoas pulando viram um bloco so, que e o que fazia a
      // arquibancada parecer parada. "sorteio" decide quem levanta o braco
      // primeiro e nunca muda, pra o mesmo torcedor nao piscar entre quadros.
      baseTorcida.push({ x: x, y: yLinha, z: zLinha,
        cor: CORES_TORCIDA[(c * 3 + r) % CORES_TORCIDA.length],
        fase: ((idx * 0.618) % 1) * Math.PI * 2,
        amplitude: 0.18 + 0.3 * (((idx * 37) % 10) / 10),
        ritmo: 0.82 + ((idx * 53) % 7) / 18,
        sorteio: ((idx * 0.7548) % 1) });
      // Pele e cabelo nao mudam nunca: pintados uma vez so.
      corTmp.setHex(PELES_TORCIDA[(idx * 7 + r) % PELES_TORCIDA.length]);
      cabecas.setColorAt(idx, corTmp);
      bracos.setColorAt(idx, corTmp);
      corTmp.setHex(CABELOS_TORCIDA[(idx * 5 + c) % CABELOS_TORCIDA.length]);
      cabelos.setColorAt(idx, corTmp);
      idx++;
    }
  }
  const paredao = new THREE.Mesh(new THREE.BoxGeometry(50, 9, 0.5), mat(0x1c2b3a));
  paredao.position.set(0, 4.5, -13);
  cena.add(paredao);
  torcida.add(cabecas, cabelos, corpos, bracos);
  cena.add(torcida);

  // ---------- Gol e rede ----------
  const matTrave = new THREE.MeshStandardMaterial({ color: 0xfffdf6, roughness: 0.35, metalness: 0.1 });
  const LARG_GOL = 7.32, ALT_GOL = 2.44, PROF_REDE = 1.9;
  [-1, 1].forEach(function(lado) {
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, ALT_GOL, 14), matTrave);
    poste.position.set(lado * LARG_GOL / 2, ALT_GOL / 2, 0);
    poste.castShadow = true;
    cena.add(poste);
  });
  const travessao = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, LARG_GOL + 0.14, 14), matTrave);
  travessao.rotation.z = Math.PI / 2;
  travessao.position.set(0, ALT_GOL, 0);
  travessao.castShadow = true;
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

  // ---------- Sombras de contato (mancha suave sob pes e bola) ----------
  // A sombra "de verdade" vem da luz do sol; esta mancha so assenta o
  // objeto no chao (sem ela os pes parecem flutuar).
  function texturaSombra() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    if (!g) return null;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.5)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  }
  const texSombra = texturaSombra();
  const matSombra = texSombra
    ? new THREE.MeshBasicMaterial({ map: texSombra, transparent: true, depthWrite: false })
    : new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
  function criarSombra(raio) {
    const s = new THREE.Mesh(new THREE.CircleGeometry(raio, 24), matSombra);
    s.rotation.x = -Math.PI / 2;
    s.position.y = 0.02;
    return s;
  }

  // ===================== PERSONAGENS =============================
  //
  // Cada boneco e um esqueleto: quadril > tronco > pescoco, ombro >
  // cotovelo > mao, coxa > joelho > pe. As malhas sao torneadas
  // (LatheGeometry: torso mais largo no peito e fino na cintura, coxa e
  // panturrilha com volume) em vez de caixas e cilindros retos.
  //
  // Lados: D = direito do boneco = -x local; E = esquerdo = +x local.
  // Frente = +z local. Convencao das rotacoes (radianos):
  //   coxa x+  perna para tras        joelho x+  dobra (pe vai para tras)
  //   ombro x- braco para a frente     cotovelo x- dobra (mao vem pra frente)
  //   ombroD z- / ombroE z+ abre o braco para o lado
  //   tronco x+ inclina para a frente  pescoco x+ olha para baixo
  //   pe x+    ponta do pe para baixo
  //
  // Os pes ficam presos ao chao automaticamente ("aterrar"): depois de
  // aplicar a pose, o boneco inteiro desce/sobe ate o pe mais baixo
  // encostar no gramado. Agachar, dar passada e chutar nunca enterram o pe
  // nem deixam o boneco flutuando — era o principal "bug visual" de antes.
  const JUNTAS = ['quadril', 'tronco', 'pescoco',
    'ombroD', 'cotoveloD', 'maoD', 'ombroE', 'cotoveloE', 'maoE',
    'coxaD', 'joelhoD', 'peD', 'coxaE', 'joelhoE', 'peE'];
  const IDX = {};
  JUNTAS.forEach(function(n, i) { IDX[n] = i * 3; });
  const I_VOO = JUNTAS.length * 3;   // canal extra: altura do pulo (pes fora do chao)
  const N_CANAIS = I_VOO + 1;
  const ALTURA_QUADRIL = 0.93, COXA = 0.44, CANELA = 0.42, BRACO = 0.29, ANTEBRACO = 0.255;

  // Pe paralelo ao chao para a pose atual de quadril, coxa e joelho.
  function achatarPe(p, lado) {
    const q = IDX.quadril, c = IDX['coxa' + lado], j = IDX['joelho' + lado], pe = IDX['pe' + lado];
    p[pe] = -(p[q] + p[c] + p[j]);
    p[pe + 2] = -(p[q + 2] + p[c + 2]);
  }

  // Pose = Float32Array com [x, y, z] de cada junta + voo. Juntas que nao
  // aparecem ficam em 0 (descanso); pe sem valor fica paralelo ao chao.
  function pose(def) {
    const p = new Float32Array(N_CANAIS);
    JUNTAS.forEach(function(n) {
      const v = def[n];
      if (!v) return;
      p[IDX[n]] = v[0] || 0; p[IDX[n] + 1] = v[1] || 0; p[IDX[n] + 2] = v[2] || 0;
    });
    if (!def.peD) achatarPe(p, 'D');
    if (!def.peE) achatarPe(p, 'E');
    p[I_VOO] = def.voo || 0;
    return p;
  }

  // Mesma pose, refletida (direita <-> esquerda).
  const PARES = [['ombroD', 'ombroE'], ['cotoveloD', 'cotoveloE'], ['maoD', 'maoE'],
                 ['coxaD', 'coxaE'], ['joelhoD', 'joelhoE'], ['peD', 'peE']];
  function espelhar(p) {
    const o = new Float32Array(N_CANAIS);
    function copiar(de, para) { o[para] = p[de]; o[para + 1] = -p[de + 1]; o[para + 2] = -p[de + 2]; }
    ['quadril', 'tronco', 'pescoco'].forEach(function(n) { copiar(IDX[n], IDX[n]); });
    PARES.forEach(function(par) { copiar(IDX[par[0]], IDX[par[1]]); copiar(IDX[par[1]], IDX[par[0]]); });
    o[I_VOO] = p[I_VOO];
    return o;
  }

  function misturar(a, b, k, out) {
    for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * k;
    return out;
  }

  // Clipe por poses-chave: chaves = [[ms, pose], ...]. Interpola com
  // Hermite cubica (tangentes de Catmull-Rom), entao a velocidade de cada
  // junta e continua de uma chave para a outra — nada de "trancos" nas
  // trocas de etapa, que era o que deixava o chute antigo mecanico.
  // Serve tambem para trilhas de posicao (vetores de qualquer tamanho).
  function clipeChaves(chaves, durTotal, extra) {
    const us = chaves.map(function(c) { return c[0] / durTotal; });
    const ps = chaves.map(function(c) { return c[1]; });
    const n = ps.length, dim = ps[0].length;
    const tg = ps.map(function(p, i) {
      const m = new Float32Array(dim);
      if (i > 0 && i < n - 1) {
        const du = us[i + 1] - us[i - 1];
        for (let k = 0; k < dim; k++) m[k] = (ps[i + 1][k] - ps[i - 1][k]) / du;
      }
      return m;
    });
    return {
      dur: durTotal, laco: false,
      amostrar: function(u, t, out) {
        let i = 0;
        while (i < n - 2 && u > us[i + 1]) i++;
        const h = (us[i + 1] - us[i]) || 1;
        const s = Math.max(0, Math.min(1, (u - us[i]) / h)), s2 = s * s, s3 = s2 * s;
        const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
        const a = ps[i], b = ps[i + 1], ma = tg[i], mb = tg[i + 1];
        for (let k = 0; k < dim; k++) out[k] = h00 * a[k] + h10 * h * ma[k] + h01 * b[k] + h11 * h * mb[k];
        if (extra) extra(out, t, u);
      }
    };
  }
  // Pose parada (em laco), com um movimento procedural opcional por cima.
  function clipeFixo(p, extra) {
    return { dur: 1000, laco: true, amostrar: function(u, t, out) { out.set(p); if (extra) extra(out, t, u); } };
  }

  // ---------- Materiais e camisa ----------
  function matPele(cor) { return new THREE.MeshStandardMaterial({ color: cor, roughness: 0.6, metalness: 0 }); }
  function matTecido(cor, mapa) {
    return new THREE.MeshStandardMaterial({ color: mapa ? 0xffffff : cor, map: mapa || null, roughness: 0.85, metalness: 0 });
  }
  function corCss(n) { return '#' + ('000000' + n.toString(16)).slice(-6); }
  function luminancia(n) { return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }

  // Pinta a camisa do clube (padrao de data.js) e o numero 10 nas costas.
  // u da textura da a volta no torso (0 = peito, 0.5 = costas) e v sobe
  // da cintura ao ombro. 512 x 336 deixa o pixel quadrado no torso.
  function texturaCamisa(padrao, p, s, t, numero) {
    const W = 512, H = 336;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    if (!g) return null;
    const P = corCss(p), S = corCss(s), T = corCss(t);
    g.fillStyle = P; g.fillRect(0, 0, W, H);
    function listrasV(cores, qtd) {
      const w = W / qtd;
      for (let i = 0; i < qtd; i++) { g.fillStyle = cores[i % cores.length]; g.fillRect(Math.floor(i * w), 0, Math.ceil(w) + 1, H); }
    }
    function listrasH(cores, qtd) {
      const h = H / qtd;
      for (let i = 0; i < qtd; i++) { g.fillStyle = cores[i % cores.length]; g.fillRect(0, Math.floor(i * h), W, Math.ceil(h) + 1); }
    }
    if (padrao === 'vertical') listrasV([P, S], 12);
    else if (padrao === 'tricolor-v') listrasV([P, S, T], 12);
    else if (padrao === 'horizontal') listrasH([P, S], 8);
    else if (padrao === 'tricolor-h') listrasH([P, S, T], 9);
    else if (padrao === 'faixa-h') { g.fillStyle = S; g.fillRect(0, H * 0.28, W, H * 0.17); }
    else if (padrao === 'diagonal') {
      // Faixa do ombro ao quadril na frente, continuando pelas costas sem
      // emenda (frente centrada em u = 0, costas em u = 0.5).
      g.fillStyle = S;
      const f = H * 0.11;
      [0, W].forEach(function(dx) {
        g.beginPath();
        g.moveTo(dx - W / 4, -f); g.lineTo(dx + W / 4, H - f); g.lineTo(dx + W / 4, H + f); g.lineTo(dx - W / 4, f);
        g.fill();
      });
      g.beginPath();
      g.moveTo(W / 4, H - f); g.lineTo(3 * W / 4, -f); g.lineTo(3 * W / 4, f); g.lineTo(W / 4, H + f);
      g.fill();
    }
    // Escudinho no peito esquerdo (lado +x = u pequeno).
    g.fillStyle = S;
    g.beginPath(); g.arc(W * 0.07, H * 0.3, 15, 0, Math.PI * 2); g.fill();
    g.strokeStyle = luminancia(s) > 0.55 ? '#1a1a1a' : '#ffffff';
    g.lineWidth = 3; g.stroke();
    if (numero) {
      g.save();
      g.translate(W / 2, H * 0.42);
      g.scale(0.8, 1);
      g.font = 'bold 128px "Arial Black", Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = 12;
      g.strokeStyle = luminancia(s) > 0.55 ? '#1a1a1a' : '#ffffff';
      g.strokeText(numero, 0, 0);
      g.fillStyle = S;
      g.fillText(numero, 0, 0);
      g.restore();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
    return tex;
  }

  // Perfil torneado: [[raio, y], ...] em qualquer ordem vertical.
  function torneado(perfil, segmentos) {
    const pts = perfil.slice();
    if (pts[0][1] > pts[pts.length - 1][1]) pts.reverse(); // de baixo pra cima: normais pra fora
    return new THREE.LatheGeometry(pts.map(function(p) { return new THREE.Vector2(p[0], p[1]); }), segmentos || 16);
  }
  // Reamostra o perfil com y uniforme: a textura da camisa nao estica.
  function perfilUniforme(ctrl, n) {
    const y0 = ctrl[0][1], y1 = ctrl[ctrl.length - 1][1], out = [];
    for (let i = 0; i < n; i++) {
      const y = y0 + (y1 - y0) * i / (n - 1);
      let k = 0;
      while (k < ctrl.length - 2 && y > ctrl[k + 1][1]) k++;
      const a = ctrl[k], b = ctrl[k + 1], f = (y - a[1]) / ((b[1] - a[1]) || 1);
      out.push([a[0] + (b[0] - a[0]) * f, y]);
    }
    return out;
  }
  // Torso: cintura fina, peito largo, ombro caindo ate a gola.
  // A barra fica por fora do calcao (r 0.152 contra 0.14), sem serrilhado.
  const PERFIL_TORSO = [[0.152, -0.07], [0.15, 0.0], [0.142, 0.12], [0.138, 0.2], [0.148, 0.29],
                        [0.164, 0.38], [0.172, 0.45], [0.17, 0.5], [0.158, 0.545], [0.125, 0.585], [0.08, 0.615], [0.055, 0.63]];
  const ESCALA_TORSO = [1.22, 1, 0.76];

  const vTmp = new THREE.Vector3();

  // Cabeca numa malha so: esfera deformada em "ovo", com o rosto afinando
  // ate o queixo (duas esferas sobrepostas deixavam uma emenda no rosto).
  const geoCabeca = (function() {
    const g = new THREE.SphereGeometry(0.105, 32, 24);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const ny = y / 0.105;
      x *= 0.92; y *= 1.06;
      if (ny < 0) {
        const k = ny * ny;
        x *= 1 - 0.28 * k;               // mandibula estreita
        z *= 1 - 0.18 * k;
        y *= 1 + 0.18 * k;               // queixo um pouco mais baixo
        if (z > 0) z += 0.012 * k;       // queixo pra frente
      }
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  })();

  // c: { pele, cabelo, camisa, mapaCamisa, detalhe, calcao, meia, chuteira, luva, mangaLonga }
  function criarRig(c) {
    const raiz = new THREE.Group();
    const juntas = {}, solas = [];
    const mPele = matPele(c.pele);
    const mCamisa = matTecido(c.camisa, c.mapaCamisa);
    const mManga = c.mapaCamisa ? matTecido(c.camisa) : mCamisa;
    const mDetalhe = matTecido(c.detalhe), mCalcao = matTecido(c.calcao), mMeia = matTecido(c.meia);
    const mChuteira = new THREE.MeshStandardMaterial({ color: c.chuteira, roughness: 0.32, metalness: 0.05 });
    const mSola = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.7 });
    const mCabelo = new THREE.MeshStandardMaterial({ color: c.cabelo, roughness: 0.9 });
    const mOlho = new THREE.MeshStandardMaterial({ color: 0xf7f4ee, roughness: 0.3 });
    const mPupila = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.2 });
    const mBoca = new THREE.MeshStandardMaterial({ color: 0x8a3b32, roughness: 0.6 });
    const mLuva = c.luva != null ? matTecido(c.luva) : null;

    function malha(geo, m, pai, x, y, z, semSombra) {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x || 0, y || 0, z || 0);
      o.castShadow = !semSombra;
      pai.add(o);
      return o;
    }
    function junta(nome, pai, x, y, z) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      pai.add(g);
      juntas[nome] = g;
      return g;
    }

    const quadril = junta('quadril', raiz, 0, ALTURA_QUADRIL, 0);

    let marcadorChute = null;
    function perna(l, x) {
      const coxa = junta('coxa' + l, quadril, x, 0, 0);
      malha(torneado([[0.07, 0.0], [0.073, -0.08], [0.067, -0.22], [0.056, -0.36], [0.049, -0.44]], 16), mPele, coxa);
      malha(new THREE.CylinderGeometry(0.084, 0.082, 0.2, 18), mCalcao, coxa, 0, -0.1, 0);
      const joelho = junta('joelho' + l, coxa, 0, -COXA, 0);
      malha(new THREE.SphereGeometry(0.05, 14, 10), mPele, joelho);
      malha(torneado([[0.05, -0.03], [0.058, -0.1], [0.055, -0.18], [0.043, -0.3], [0.035, -0.39], [0.037, -0.43]], 16), mMeia, joelho);
      const pe = junta('pe' + l, joelho, 0, -CANELA, 0);
      const bota = malha(new THREE.CapsuleGeometry(0.042, 0.15, 4, 12), mChuteira, pe, 0, -0.036, 0.045);
      bota.rotation.x = Math.PI / 2;
      bota.scale.set(1.15, 1, 0.85);
      malha(new THREE.BoxGeometry(0.092, 0.016, 0.236), mSola, pe, 0, -0.07, 0.045);
      [-0.07, 0.16].forEach(function(z) {
        const s = new THREE.Object3D();
        s.position.set(0, -0.081, z); // 3 mm abaixo da sola: a caixa do goleiro nunca fica sob o chao
        pe.add(s);
        solas.push(s);
      });
      if (l === 'D') {
        marcadorChute = new THREE.Object3D();
        marcadorChute.position.set(0, -0.02, 0.08); // peito do pe
        pe.add(marcadorChute);
      }
    }
    perna('D', -0.095);
    perna('E', 0.095);

    const tronco = junta('tronco', quadril, 0, 0.02, 0);
    malha(new THREE.LatheGeometry(perfilUniforme(PERFIL_TORSO, 15).map(function(p) { return new THREE.Vector2(p[0], p[1]); }), 32),
      mCamisa, tronco).scale.fromArray(ESCALA_TORSO);
    // O calcao (parte de cima) acompanha o tronco: preso ao quadril, ele
    // "furava" a barra da camisa sempre que o boneco inclinava.
    malha(torneado([[0.155, -0.19], [0.152, -0.14], [0.146, -0.09], [0.138, -0.04]], 24), mCalcao, tronco)
      .scale.fromArray(ESCALA_TORSO);
    const gola = malha(new THREE.TorusGeometry(0.056, 0.012, 8, 22), mDetalhe, tronco, 0, 0.607, 0);
    gola.rotation.x = Math.PI / 2;
    gola.scale.set(1.1, 0.85, 1);
    malha(new THREE.CylinderGeometry(0.044, 0.05, 0.11, 14), mPele, tronco, 0, 0.64, 0);

    // Cabeca: cranio + queixo (forma de ovo), orelhas, nariz, olhos,
    // sobrancelhas, boca e cabelo cobrindo topo e nuca.
    const cabeca = junta('pescoco', tronco, 0, 0.67, 0);
    malha(geoCabeca, mPele, cabeca, 0, 0.115, 0);
    malha(new THREE.SphereGeometry(0.019, 10, 8), mPele, cabeca, 0, 0.098, 0.1, true).scale.set(0.8, 1, 1.15);
    [-1, 1].forEach(function(s) {
      malha(new THREE.SphereGeometry(0.026, 10, 8), mPele, cabeca, s * 0.097, 0.11, -0.005, true).scale.set(0.45, 1, 0.75);
      malha(new THREE.SphereGeometry(0.016, 12, 10), mOlho, cabeca, s * 0.036, 0.125, 0.086, true);
      malha(new THREE.SphereGeometry(0.0085, 8, 6), mPupila, cabeca, s * 0.036, 0.125, 0.1, true);
      const sobr = malha(new THREE.CapsuleGeometry(0.0065, 0.026, 3, 6), mCabelo, cabeca, s * 0.037, 0.149, 0.095, true);
      sobr.rotation.z = Math.PI / 2 + s * 0.12;
    });
    malha(new THREE.CapsuleGeometry(0.006, 0.026, 3, 6), mBoca, cabeca, 0, 0.061, 0.094, true).rotation.z = Math.PI / 2;
    const topo = malha(new THREE.SphereGeometry(0.112, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), mCabelo, cabeca, 0, 0.125, -0.006);
    topo.scale.set(0.96, 1.04, 1.04);
    topo.rotation.x = -0.42;
    const nuca = malha(new THREE.SphereGeometry(0.106, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mCabelo, cabeca, 0, 0.105, -0.012);
    nuca.scale.set(0.95, 1, 1);
    nuca.rotation.x = -1.35;

    function braco(l, x, lado) {
      const ombro = junta('ombro' + l, tronco, x, 0.5, 0);
      malha(new THREE.SphereGeometry(0.057, 16, 12), mManga, ombro, 0, -0.008, 0);
      if (c.mangaLonga) {
        malha(torneado([[0.058, 0], [0.054, -0.12], [0.046, -0.29]], 14), mManga, ombro);
      } else {
        malha(new THREE.CylinderGeometry(0.058, 0.053, 0.17, 16), mManga, ombro, 0, -0.085, 0);
        malha(new THREE.TorusGeometry(0.052, 0.009, 6, 18), mDetalhe, ombro, 0, -0.166, 0).rotation.x = Math.PI / 2;
        malha(torneado([[0.045, -0.1], [0.042, -0.2], [0.036, -0.29]], 12), mPele, ombro);
      }
      const cotovelo = junta('cotovelo' + l, ombro, 0, -BRACO, 0);
      const mAnte = c.mangaLonga ? mManga : mPele;
      malha(new THREE.SphereGeometry(c.mangaLonga ? 0.046 : 0.037, 12, 10), mAnte, cotovelo);
      malha(torneado([[c.mangaLonga ? 0.045 : 0.038, 0], [0.041, -0.07], [0.034, -0.18], [0.028, -0.25]], 12), mAnte, cotovelo);
      const mao = junta('mao' + l, cotovelo, 0, -ANTEBRACO, 0);
      if (mLuva) {
        malha(new THREE.CylinderGeometry(0.036, 0.042, 0.05, 12), mLuva, mao, 0, -0.005, 0);
        malha(new THREE.SphereGeometry(0.05, 14, 10), mLuva, mao, 0, -0.062, 0).scale.set(0.62, 1.35, 1.05);
        const polegar = malha(new THREE.CapsuleGeometry(0.016, 0.035, 3, 8), mLuva, mao, -lado * 0.012, -0.04, 0.05);
        polegar.rotation.x = 0.5;
      } else {
        malha(new THREE.SphereGeometry(0.04, 12, 10), mPele, mao, 0, -0.045, 0).scale.set(0.5, 1.15, 0.85);
        const polegar = malha(new THREE.CapsuleGeometry(0.011, 0.028, 3, 8), mPele, mao, -lado * 0.008, -0.03, 0.028);
        polegar.rotation.x = 0.6;
      }
    }
    braco('D', -0.185, -1);
    braco('E', 0.185, 1);
    Object.keys(juntas).forEach(function(n) { fundirPorMaterial(juntas[n]); });

    const rig = {
      raiz: raiz, juntas: juntas, topo: null, aterrar: false, baseY: 0,
      ultima: new Float32Array(N_CANAIS), marcadorChute: marcadorChute,
      aplicar: function(p) {
        for (let i = 0; i < JUNTAS.length; i++) juntas[JUNTAS[i]].rotation.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
        if (p !== rig.ultima) rig.ultima.set(p);
        const voo = Math.max(0, p[I_VOO]);
        raiz.position.y = rig.baseY;
        if (rig.aterrar && rig.topo) {
          rig.topo.updateMatrixWorld(true);
          let min = Infinity;
          for (let i = 0; i < solas.length; i++) {
            vTmp.setFromMatrixPosition(solas[i].matrixWorld);
            if (vTmp.y < min) min = vTmp.y;
          }
          raiz.position.y = rig.baseY - min + voo;
        } else {
          raiz.position.y = rig.baseY + voo;
        }
      }
    };
    return rig;
  }

  // Controlador de animacao do batedor: toca um clipe por vez e faz
  // crossfade a partir de onde o corpo ESTA (nunca de uma pose fixa), entao
  // trocar de clipe no meio de outro nao da salto. Eventos disparam uma
  // unica vez quando o clipe passa do instante marcado (mesmo se o quadro
  // pular o instante exato — caso do movimento reduzido).
  function criarControlador(rig) {
    const saida = new Float32Array(N_CANAIS), de = new Float32Array(N_CANAIS), amostra = new Float32Array(N_CANAIS);
    let atual = null, relogio = 0;
    function tocar(clipe, op) {
      op = op || {};
      de.set(saida);
      atual = {
        clipe: clipe, t0: null, dur: Math.max(1, op.dur || clipe.dur || 1), fade: op.fade || 0,
        eventos: (op.eventos || []).map(function(e) { return { u: e.u, fn: e.fn, feito: false }; }),
        aoTerminar: op.aoTerminar || null, terminou: false
      };
      if (!atual.fade) {
        // Sem transicao: ja aplica o primeiro quadro, sem esperar o proximo rAF.
        clipe.amostrar(0, relogio / 1000, saida);
        rig.aplicar(saida);
      }
    }
    function atualizar(agora) {
      relogio = agora;
      const a = atual;
      if (!a) return;
      if (a.t0 === null) a.t0 = agora;
      const dec = agora - a.t0;
      const u = a.clipe.laco ? (dec / a.dur) % 1 : Math.min(1, dec / a.dur);
      a.clipe.amostrar(u, agora / 1000, amostra);
      const k = a.fade > 0 ? EASE.sineInOut(Math.min(1, dec / a.fade)) : 1;
      misturar(de, amostra, k, saida);
      rig.aplicar(saida);
      for (let i = 0; i < a.eventos.length; i++) {
        const e = a.eventos[i];
        if (!e.feito && u >= e.u) { e.feito = true; e.fn(); }
      }
      if (!a.clipe.laco && u >= 1 && !a.terminou && atual === a) {
        a.terminou = true;
        if (a.aoTerminar) a.aoTerminar();
      }
    }
    return { tocar: tocar, atualizar: atualizar };
  }

  // ---------- Batedor ----------
  const mapaCamisa = texturaCamisa(padraoCamisa, corPrimaria, corSecundaria, corTerciaria, '10');
  const rigBatedor = criarRig({
    pele: 0xc98d5e, cabelo: 0x2b1d14,
    camisa: corPrimaria, mapaCamisa: mapaCamisa, detalhe: corSecundaria,
    calcao: corSecundaria, meia: corPrimaria, chuteira: 0xf2f2f2, luva: null, mangaLonga: false
  });
  const batedor = new THREE.Group();
  batedor.add(rigBatedor.raiz);
  batedor.rotation.y = Math.PI; // de costas para a camera, olhando o gol
  rigBatedor.topo = batedor;
  rigBatedor.aterrar = true;
  const sombraBatedor = criarSombra(0.42);
  cena.add(batedor, sombraBatedor);
  const ctlBatedor = criarControlador(rigBatedor);

  // ---------- Goleiro ----------
  // Cores do uniforme sao as mesmas de antes: o alto contraste troca
  // exatamente 0x21303b e 0xffc63b.
  const rigGoleiro = criarRig({
    pele: 0x8d5a3b, cabelo: 0x161210,
    camisa: 0x21303b, mapaCamisa: null, detalhe: 0xffc63b,
    calcao: 0x21303b, meia: 0x21303b, chuteira: 0x111111, luva: 0xffc63b, mangaLonga: true
  });
  rigGoleiro.baseY = -GOLEIRO_BASE.y; // pivo da cena = centro do tronco
  const goleiro = new THREE.Group();
  goleiro.add(rigGoleiro.raiz);
  rigGoleiro.topo = goleiro;
  const sombraGoleiro = criarSombra(0.5);
  cena.add(goleiro, sombraGoleiro);

  // ---------- Alto contraste: ajusta TODAS as cores 3D para acessibilidade ----------
  var coresOriginaisGoleiro = [];
  rigGoleiro.raiz.traverse(function(child) {
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
  const esferaBola = new THREE.Mesh(new THREE.SphereGeometry(ALTURA_BOLA, 28, 20),
    new THREE.MeshStandardMaterial({ color: 0xfffdf6, roughness: 0.45, metalness: 0 }));
  esferaBola.castShadow = true;
  bolaMalha.add(esferaBola);
  const matGomo = new THREE.MeshStandardMaterial({ color: 0x21303b, roughness: 0.5 });
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
  // opcoes.canal: um tween novo no mesmo canal cancela o anterior. Evita
  // dois tweens escrevendo na mesma coisa (era o que fazia a torcida e o
  // goleiro "tremerem" quando duas reacoes se sobrepunham).
  const tweens = [];
  function cancelarCanal(canal) {
    tweens.forEach(function(t) { if (t.canal === canal) t.cancelado = true; });
  }
  function animar(duracao, aoAtualizar, aoTerminar, opcoes) {
    const canal = (opcoes && opcoes.canal) || null;
    if (canal) cancelarCanal(canal);
    const t = {
      dur: Math.max(1, duracao), atraso: (opcoes && opcoes.atraso) || 0,
      ease: (opcoes && opcoes.ease) || EASE.linear, canal: canal,
      aoAtualizar: aoAtualizar, aoTerminar: aoTerminar, t0: null, cancelado: false
    };
    tweens.push(t);
    return t;
  }
  function atualizarTweens(agora) {
    tweens.slice().forEach(function(t) {
      if (t.cancelado) { const i = tweens.indexOf(t); if (i >= 0) tweens.splice(i, 1); return; }
      if (t.t0 === null) t.t0 = agora;
      const dec = agora - t.t0 - t.atraso;
      if (dec < 0) return;
      const u = Math.min(1, dec / t.dur);
      if (t.aoAtualizar) t.aoAtualizar(t.ease(u), u);
      if (u >= 1) {
        const i = tweens.indexOf(t);
        if (i >= 0) tweens.splice(i, 1);
        if (t.aoTerminar && !t.cancelado) t.aoTerminar();
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
  let relogioCena = 0;

  // ===================== TORCIDA VIVA ============================
  //
  // Antes a arquibancada inteira subia e descia junto (uma linha no loop
  // de render movia o grupo). 144 pessoas no mesmo compasso leem como um
  // bloco parado. Agora cada torcedor tem fase, amplitude e ritmo
  // proprios, e tres coisas variam com UMA intensidade (0 a 1):
  //
  //   altura do pulo · quantos levantam o braco · brilho da camisa
  //
  // Intensidade por situacao:
  //   0.10  repouso, so um bolinho de movimento (sem clarear NADA: o
  //         teste exige voltar a cor-base exata, e repouso e o estado
  //         em que o jogo passa a maior parte do tempo)
  //   0.50  'acerto'  — a crianca acertou a conta, grito curto
  //   1.00  'gol'     — vai a loucura
  //  -1.00  'erro'    — "uhh": cabeca baixa, maos na cabeca
  //
  // A cor so e tocada quando a intensidade passa de REPOUSO; abaixo
  // disso escrevemos a cor-base exata, entao torcidaClareamento volta a 0.
  // v2: o pulo segue sin² (sobe e desce redondo, sem o "quique" seco do
  // |sin|) e o braco sobe girando do ombro, de forma continua com a
  // intensidade — ninguem mais "pisca" de braco abaixado pra levantado.
  const REPOUSO = 0.10;
  let intensidade = REPOUSO;   // valor corrente, movido por tweens
  let torcidaSuja = true;      // obriga uma escrita de cor no proximo quadro
  let ultimoDesenho = 0;
  let ultimoTTorcida = 0;

  const brancoTorcida = new THREE.Color(0xffffff);
  const baseCor = new THREE.Color();
  const ANG_BRACO_BAIXO = 2.75, ANG_BRACO_ALTO = 0.12;

  // t = relogio em segundos. Chamada pelo loop de render, no maximo ~30x
  // por segundo: torcida nao precisa de 60 fps e o Chromebook agradece.
  function desenharTorcida(t) {
    ultimoTTorcida = t;
    const forca = Math.max(0, intensidade);
    const abatida = Math.max(0, -intensidade);          // o "uhh"
    const animando = forca > REPOUSO + 0.001 || abatida > 0.001;
    const pintar = animando || torcidaSuja;

    for (let i = 0; i < baseTorcida.length; i++) {
      const b = baseTorcida[i];
      let onda = 0, balanco = 0;
      if (!reduzMovimento) {
        const s = Math.sin(t * (2.1 + forca * 5.2) * b.ritmo + b.fase);
        onda = s * s;
        balanco = Math.sin(t * 0.9 * b.ritmo + b.fase * 2) * (0.04 + forca * 0.06);
      }
      const salto = b.amplitude * onda * forca;
      const afunda = abatida * 0.3 * (0.6 + b.sorteio * 0.4);
      const inclina = abatida * 0.35 * (0.5 + b.sorteio * 0.5);
      const y = b.y + salto - afunda;

      dummy.scale.set(1, 1, 1);
      dummy.position.set(b.x + balanco * 0.5, y, b.z + inclina * 0.12);
      dummy.rotation.set(inclina, 0, balanco);
      dummy.updateMatrix();
      cabecas.setMatrixAt(i, dummy.matrix);
      cabelos.setMatrixAt(i, dummy.matrix);

      dummy.position.set(b.x + balanco * 0.15, y - 0.58, b.z);
      dummy.rotation.set(inclina * 0.4, 0, balanco * 0.4);
      dummy.updateMatrix();
      corpos.setMatrixAt(i, dummy.matrix);

      // Bracos: giram do ombro. Em vez de "liga/desliga", cada um levanta
      // aos poucos conforme a intensidade passa do seu limiar.
      let ang = ANG_BRACO_BAIXO, escala = 1, aceno = 0;
      if (!reduzMovimento) {
        if (abatida > 0.05 && b.sorteio > 0.45) {
          ang = ANG_BRACO_BAIXO + (0.5 - ANG_BRACO_BAIXO) * abatida;  // maos na cabeca
          escala = 1 - 0.45 * abatida;
        } else if (abatida <= 0.05) {
          const limiar = 1 - forca * 0.95;
          const levanta = Math.max(0, Math.min(1, (b.sorteio - limiar) / 0.15));
          const vai = levanta * (0.8 + 0.2 * Math.sin(t * 3.4 * b.ritmo + b.fase * 1.7));
          ang = ANG_BRACO_BAIXO + (ANG_BRACO_ALTO - ANG_BRACO_BAIXO) * vai;
          aceno = levanta * 0.22 * Math.sin(t * 5 * b.ritmo + b.fase);
        }
      }
      dummy.position.set(b.x + balanco * 0.3, y - 0.33, b.z);
      dummy.rotation.set(ang, 0, aceno);
      dummy.scale.set(1, escala, 1);
      dummy.updateMatrix();
      bracos.setMatrixAt(i, dummy.matrix);

      if (pintar) {
        baseCor.setHex(b.cor);
        if (animando) {
          // Brilho SEMPRE a partir da cor-base: nunca acumula ate o branco.
          const brilho = 0.28 * onda * Math.max(0, forca - REPOUSO) / (1 - REPOUSO);
          corTmp.copy(baseCor).lerp(brancoTorcida, Math.max(0, brilho));
        } else {
          corTmp.copy(baseCor);
        }
        corpos.setColorAt(i, corTmp);
      }
    }
    cabecas.instanceMatrix.needsUpdate = true;
    cabelos.instanceMatrix.needsUpdate = true;
    corpos.instanceMatrix.needsUpdate = true;
    bracos.instanceMatrix.needsUpdate = true;
    if (pintar) {
      corpos.instanceColor.needsUpdate = true;
      torcidaSuja = animando;   // ainda animando? continua repintando
    }
  }
  cabecas.instanceColor.needsUpdate = true;
  cabelos.instanceColor.needsUpdate = true;
  bracos.instanceColor.needsUpdate = true;

  // Volta a cor exata de cada torcedor e redesenha o repouso. Usada no
  // reset e no fim de cada reacao — e o que garante torcidaClareamento == 0.
  // (Redesenha a partir do mesmo relogio, entao ninguem da salto.)
  let reacaoTorcida = null;
  function aplicarTorcidaBase() {
    intensidade = REPOUSO;
    torcidaSuja = true;
    desenharTorcida(ultimoTTorcida);
  }

  // Leva a intensidade ate `alvo`, segura, e desce suave ate o repouso.
  function moverIntensidade(alvo, duracao) {
    const partida = intensidade;
    return animar(d(duracao), function(e, u) {
      if (u < 0.2) intensidade = partida + (alvo - partida) * EASE.sineInOut(u / 0.2);
      else if (u < 0.65) intensidade = alvo;
      else intensidade = alvo + (REPOUSO - alvo) * EASE.sineInOut((u - 0.65) / 0.35);
    }, function() { reacaoTorcida = null; aplicarTorcidaBase(); }, { canal: 'torcida' });
  }

  // Unica porta de entrada para as reacoes da arquibancada. O jogo e o
  // main.js pedem a mesma reacao no mesmo quadro (fim do chute + resultado):
  // a segunda chamada igual e ignorada em vez de reiniciar a festa.
  function reagirTorcida(tipo) {
    const alvos = { gol: [1, TEMPO.COMEMORA_TORCIDA], acerto: [0.5, TEMPO.ANIMA_TORCIDA], erro: [-1, TEMPO.LAMENTA_TORCIDA] };
    const a = alvos[tipo];
    if (!a) return;
    if (reacaoTorcida && reacaoTorcida.tipo === tipo && tweens.indexOf(reacaoTorcida.tween) >= 0) return;
    reacaoTorcida = { tipo: tipo, tween: moverIntensidade(a[0], a[1]) };
  }

  // ===================== POSES ===================================
  //
  // Valores em radianos, convencao no topo de "PERSONAGENS".
  const B = {};
  B.parado = pose({ tronco: [0.03, 0, 0], ombroD: [0.06, 0, -0.1], cotoveloD: [-0.3, 0, 0],
    ombroE: [0.06, 0, 0.1], cotoveloE: [-0.3, 0, 0],
    coxaD: [0, 0, -0.05], joelhoD: [0.06, 0, 0], coxaE: [0, 0, 0.05], joelhoE: [0.06, 0, 0] });
  // Maos na cintura, peito estufado, queixo erguido.
  B.confiante = pose({ tronco: [-0.07, 0, 0], pescoco: [-0.12, 0, 0],
    ombroD: [0.3, 0, -0.75], cotoveloD: [0, 0, 1.45], maoD: [0, 0, 0.35],
    ombroE: [0.3, 0, 0.75], cotoveloE: [0, 0, -1.45], maoE: [0, 0, -0.35],
    coxaD: [0, 0, -0.11], joelhoD: [0.05, 0, 0], coxaE: [0, 0, 0.11], joelhoE: [0.05, 0, 0] });

  // Corrida + chute. D = perna do chute, E = perna de apoio.
  B.arranque = pose({ tronco: [0.16, 0, 0], pescoco: [0.12, 0, 0],
    ombroD: [0.2, 0, -0.12], cotoveloD: [-0.9, 0, 0], ombroE: [-0.2, 0, 0.12], cotoveloE: [-0.9, 0, 0],
    coxaD: [-0.15, 0, -0.04], joelhoD: [0.3, 0, 0], coxaE: [0.12, 0, 0.04], joelhoE: [0.2, 0, 0] });
  B.passoE = pose({ tronco: [0.2, 0.08, 0], pescoco: [0.15, -0.08, 0],
    ombroE: [0.55, 0, 0.1], cotoveloE: [-1.2, 0, 0], ombroD: [-0.6, 0, -0.1], cotoveloD: [-1.4, 0, 0],
    coxaE: [-0.55, 0, 0.03], joelhoE: [0.25, 0, 0], coxaD: [0.45, 0, -0.03], joelhoD: [0.55, 0, 0], peD: [0.5, 0, 0] });
  B.passagemE = pose({ tronco: [0.2, 0, 0], pescoco: [0.15, 0, 0],
    ombroE: [0.1, 0, 0.1], cotoveloE: [-1.3, 0, 0], ombroD: [-0.1, 0, -0.1], cotoveloD: [-1.3, 0, 0],
    coxaE: [0.05, 0, 0.03], joelhoE: [0.2, 0, 0], coxaD: [-0.35, 0, -0.03], joelhoD: [1.3, 0, 0], peD: [0.35, 0, 0] });
  B.passoD = espelhar(B.passoE);
  B.passada = pose({ tronco: [0.06, 0.05, -0.1], pescoco: [0.25, 0, 0],
    ombroD: [0.5, 0, -0.25], cotoveloD: [-0.9, 0, 0], ombroE: [-0.4, 0, 0.85], cotoveloE: [-0.5, 0, 0],
    coxaD: [0.5, 0, -0.03], joelhoD: [0.65, 0, 0], peD: [0.6, 0, 0],
    coxaE: [-0.7, 0, 0.04], joelhoE: [0.35, 0, 0], peE: [-0.25, 0, 0] });
  B.plantio = pose({ quadril: [0, -0.22, 0], tronco: [-0.04, 0.15, -0.15], pescoco: [0.38, 0, 0],
    ombroD: [0.45, 0, -0.35], cotoveloD: [-0.6, 0, 0], ombroE: [-0.3, 0, 1.2], cotoveloE: [-0.4, 0, 0],
    coxaD: [0.55, 0, -0.05], joelhoD: [1.3, 0, 0], peD: [0.7, 0, 0],
    coxaE: [-0.2, 0, 0.06], joelhoE: [0.42, 0, 0] });
  B.armado = pose({ quadril: [0, -0.35, 0], tronco: [-0.1, 0.22, -0.2], pescoco: [0.42, -0.1, 0],
    ombroD: [0.6, 0, -0.45], cotoveloD: [-0.5, 0, 0], ombroE: [-0.2, 0, 1.4], cotoveloE: [-0.35, 0, 0],
    coxaD: [0.8, 0, -0.05], joelhoD: [1.75, 0, 0], peD: [0.8, 0, 0],
    coxaE: [-0.12, 0, 0.06], joelhoE: [0.45, 0, 0] });
  B.contato = pose({ quadril: [0, 0.15, 0], tronco: [-0.12, -0.05, -0.18], pescoco: [0.45, 0, 0],
    ombroD: [-0.5, 0, -0.3], cotoveloD: [-0.9, 0, 0], ombroE: [-0.35, 0, 1.3], cotoveloE: [-0.35, 0, 0],
    coxaD: [-0.7, 0, 0.04], joelhoD: [0.75, 0, 0], peD: [0.55, 0, 0],
    coxaE: [-0.1, 0, 0.06], joelhoE: [0.4, 0, 0] });
  B.seguimento = pose({ quadril: [0, 0.3, 0], tronco: [-0.16, -0.12, -0.12], pescoco: [0.15, 0, 0],
    ombroD: [-0.8, 0, -0.2], cotoveloD: [-1.0, 0, 0], ombroE: [-0.2, 0, 1.0], cotoveloE: [-0.4, 0, 0],
    coxaD: [-1.25, 0, 0.05], joelhoD: [0.35, 0, 0], peD: [0.6, 0, 0],
    coxaE: [0.05, 0, 0.05], joelhoE: [0.3, 0, 0], peE: [0.25, 0, 0] });
  B.recupera = pose({ tronco: [0.05, 0, -0.04], pescoco: [-0.05, 0, 0],
    ombroD: [-0.1, 0, -0.15], cotoveloD: [-0.6, 0, 0], ombroE: [0, 0, 0.35], cotoveloE: [-0.4, 0, 0],
    coxaD: [-0.45, 0, -0.04], joelhoD: [0.5, 0, 0], peD: [0.3, 0, 0],
    coxaE: [0, 0, 0.05], joelhoE: [0.15, 0, 0] });

  // Comemoracao: agacha, pula com soco no ar, aterrissa, pula de novo com
  // os dois bracos em V, termina de pe com o punho cerrado pra cima.
  B.agacha = pose({ tronco: [0.35, 0, 0], pescoco: [-0.15, 0, 0],
    ombroD: [0.7, 0, -0.2], cotoveloD: [-0.5, 0, 0], ombroE: [0.7, 0, 0.2], cotoveloE: [-0.5, 0, 0],
    coxaD: [-0.8, 0, -0.1], joelhoD: [1.35, 0, 0], coxaE: [-0.8, 0, 0.1], joelhoE: [1.35, 0, 0] });
  B.pulo1 = pose({ voo: 0.3, tronco: [-0.1, 0.1, 0], pescoco: [-0.35, 0, 0],
    ombroD: [-0.25, 0, -2.85], cotoveloD: [-0.15, 0, 0], ombroE: [-0.6, 0, 0.55], cotoveloE: [-1.9, 0, 0],
    coxaD: [-0.25, 0, -0.05], joelhoD: [0.45, 0, 0], peD: [0.6, 0, 0],
    coxaE: [-0.55, 0, 0.05], joelhoE: [0.95, 0, 0], peE: [0.5, 0, 0] });
  B.aterra1 = pose({ tronco: [0.25, 0, 0], pescoco: [-0.1, 0, 0],
    ombroD: [-1.1, 0, -0.45], cotoveloD: [-1.9, 0, 0], ombroE: [-0.4, 0, 0.5], cotoveloE: [-1.8, 0, 0],
    coxaD: [-0.6, 0, -0.08], joelhoD: [1.05, 0, 0], coxaE: [-0.6, 0, 0.08], joelhoE: [1.05, 0, 0] });
  B.pulo2 = pose({ voo: 0.24, tronco: [-0.15, 0, 0], pescoco: [-0.4, 0, 0],
    ombroD: [0, 0, -2.55], cotoveloD: [-0.2, 0, 0], ombroE: [0, 0, 2.55], cotoveloE: [-0.2, 0, 0],
    coxaD: [-0.35, 0, -0.06], joelhoD: [0.7, 0, 0], peD: [0.5, 0, 0],
    coxaE: [-0.35, 0, 0.06], joelhoE: [0.7, 0, 0], peE: [0.5, 0, 0] });
  B.aterra2 = pose({ tronco: [0.15, 0, 0], pescoco: [-0.2, 0, 0],
    ombroD: [0, 0, -2.3], cotoveloD: [-0.3, 0, 0], ombroE: [0, 0, 2.3], cotoveloE: [-0.3, 0, 0],
    coxaD: [-0.45, 0, -0.08], joelhoD: [0.75, 0, 0], coxaE: [-0.45, 0, 0.08], joelhoE: [0.75, 0, 0] });
  B.punho = pose({ tronco: [-0.06, 0, 0.04], pescoco: [-0.25, 0, 0],
    ombroD: [-0.2, 0, -2.8], cotoveloD: [-0.3, 0, 0], ombroE: [-0.5, 0, 0.5], cotoveloE: [-1.75, 0, 0],
    coxaD: [0, 0, -0.1], joelhoD: [0.1, 0, 0], coxaE: [0, 0, 0.1], joelhoE: [0.1, 0, 0] });
  B.punho2 = pose({ tronco: [-0.1, 0, 0.02], pescoco: [-0.3, 0, 0],
    ombroD: [-0.15, 0, -2.9], cotoveloD: [-0.15, 0, 0], ombroE: [-0.6, 0, 0.45], cotoveloE: [-1.9, 0, 0],
    coxaD: [0, 0, -0.1], joelhoD: [0.08, 0, 0], coxaE: [0, 0, 0.1], joelhoE: [0.08, 0, 0] });

  // Lamento: maos na cabeca olhando pra cima, depois curva e desanima.
  B.maosCabeca = pose({ tronco: [-0.12, 0, 0], pescoco: [-0.38, 0, 0],
    ombroD: [-0.35, 0, -2.2], cotoveloD: [0, 0, -2.06], ombroE: [-0.35, 0, 2.2], cotoveloE: [0, 0, 2.06],
    coxaD: [0, 0, -0.08], joelhoD: [0.15, 0, 0], coxaE: [0, 0, 0.08], joelhoE: [0.15, 0, 0] });
  B.maosCabeca2 = pose({ tronco: [0.05, 0, 0], pescoco: [-0.1, 0.15, 0],
    ombroD: [-0.4, 0, -2.15], cotoveloD: [0, 0, -2.1], ombroE: [-0.4, 0, 2.15], cotoveloE: [0, 0, 2.1],
    coxaD: [0, 0, -0.08], joelhoD: [0.2, 0, 0], coxaE: [0, 0, 0.08], joelhoE: [0.2, 0, 0] });
  B.curvado = pose({ tronco: [0.38, 0, 0], pescoco: [0.45, 0, 0],
    ombroD: [-0.55, 0, -2.0], cotoveloD: [0, 0, -2.2], ombroE: [-0.55, 0, 2.0], cotoveloE: [0, 0, 2.2],
    coxaD: [-0.25, 0, -0.08], joelhoD: [0.35, 0, 0], coxaE: [-0.25, 0, 0.08], joelhoE: [0.35, 0, 0] });
  B.desanima = pose({ tronco: [0.3, 0, 0], pescoco: [0.45, 0, 0],
    ombroD: [0.1, 0, -0.12], cotoveloD: [-0.25, 0, 0], ombroE: [0.1, 0, 0.12], cotoveloE: [-0.25, 0, 0],
    coxaD: [-0.1, 0, -0.06], joelhoD: [0.2, 0, 0], coxaE: [-0.1, 0, 0.06], joelhoE: [0.2, 0, 0] });

  // Respiracao + transferencia de peso: o boneco parado nao fica "estatua".
  function respiracao(out, t) {
    if (reduzMovimento) return;
    const r = Math.sin(t * 2.0), p = Math.sin(t * 0.8);
    out[IDX.tronco] += 0.018 * r;
    out[IDX.pescoco] -= 0.012 * r;
    out[IDX.ombroD + 2] -= 0.02 * r;
    out[IDX.ombroE + 2] += 0.02 * r;
    out[IDX.quadril + 2] += 0.035 * p;
    out[IDX.tronco + 2] -= 0.035 * p;
    out[IDX.coxaD + 2] -= 0.035 * p;
    out[IDX.coxaE + 2] -= 0.035 * p;
    achatarPe(out, 'D'); achatarPe(out, 'E');
  }
  // Confiante: respira e "quica" leve nos joelhos, esperando a mira.
  function quicando(out, t) {
    respiracao(out, t);
    if (reduzMovimento) return;
    const q = 0.5 + 0.5 * Math.sin(t * 4.2);
    out[IDX.joelhoD] += 0.08 * q; out[IDX.joelhoE] += 0.08 * q;
    out[IDX.coxaD] -= 0.04 * q; out[IDX.coxaE] -= 0.04 * q;
    achatarPe(out, 'D'); achatarPe(out, 'E');
  }

  const CLIPE_PARADO = clipeFixo(B.parado, respiracao);
  const CLIPE_CONFIANTE = clipeFixo(B.confiante, quicando);
  // Os instantes (ms) acompanham TEMPO: corrida ate 480, arma ate 680,
  // contato em CONTATO_MS (835) e volta ate TOTAL_CHUTE (1100).
  const CLIPE_CHUTE = clipeChaves([
    [0, B.arranque], [120, B.passoE], [215, B.passagemE], [320, B.passoD], [440, B.passada],
    [580, B.plantio], [680, B.armado], [CONTATO_MS, B.contato], [960, B.seguimento], [TOTAL_CHUTE, B.recupera]
  ], TOTAL_CHUTE);
  // Trilha do corpo inteiro no chao: [x, z, giro]. Corre em diagonal virado
  // para a corrida e endireita para o gol ao plantar o pe de apoio.
  const TRILHA_CHUTE = clipeChaves([
    [0, [INICIO_BATEDOR.x, INICIO_BATEDOR.z, Math.PI]],
    [120, [-1.25, 12.28, 2.6]],
    [320, [-0.8, 11.95, 2.45]],
    [440, [-0.45, 11.76, 2.55]],
    [580, [PLANTIO_BATEDOR.x, PLANTIO_BATEDOR.z, Math.PI - 0.1]],
    [CONTATO_MS, [CONTATO_BATEDOR.x, CONTATO_BATEDOR.z, Math.PI]],
    [960, [-0.1, 11.44, Math.PI + 0.04]],
    [TOTAL_CHUTE, [-0.1, 11.4, Math.PI]]
  ], TOTAL_CHUTE);
  const CLIPE_COMEMORA = clipeChaves([
    [0, B.parado], [160, B.agacha], [330, B.pulo1], [500, B.aterra1], [680, B.pulo2],
    [840, B.aterra2], [1000, B.punho], [1150, B.punho2]
  ], 1150);
  const CLIPE_FRUSTRADO = clipeChaves([
    [0, B.parado], [230, B.maosCabeca], [520, B.maosCabeca2], [820, B.curvado], [1100, B.desanima]
  ], 1100);
  // Giro do batedor na comemoracao: vira de frente pra camera (e pra
  // crianca), entao da pra ver o rosto dele comemorando.
  const GIRO_COMEMORA = 0.6;

  // Pose "congelada" de um clipe (movimento reduzido: sem transicao).
  function quadroDe(clipe, u) {
    const p = new Float32Array(N_CANAIS);
    clipe.amostrar(u, 0, p);
    return clipeFixo(p);
  }

  // ---------- Goleiro: poses ----------
  const G = {};
  // Prontidao: base larga, joelhos dobrados, maos abertas na frente.
  G.pronto = pose({ tronco: [0.3, 0, 0], pescoco: [-0.3, 0, 0],
    ombroD: [-0.45, 0, -0.6], cotoveloD: [-0.75, 0, 0], maoD: [0, 0, 0.2],
    ombroE: [-0.45, 0, 0.6], cotoveloE: [-0.75, 0, 0], maoE: [0, 0, -0.2],
    coxaD: [-0.55, 0, -0.2], joelhoD: [0.95, 0, 0], coxaE: [-0.55, 0, 0.2], joelhoE: [0.95, 0, 0] });
  // Mergulho para o lado E (+x): bracos esticados na linha do corpo, perna
  // de cima dobrada, ponta dos pes esticada.
  G.mergulhoE = pose({ tronco: [0, 0, -0.12], pescoco: [-0.15, 0, -0.1],
    ombroD: [0, 0, -3.2], cotoveloD: [-0.1, 0, 0], ombroE: [0, 0, 3.0], cotoveloE: [-0.1, 0, 0],
    coxaE: [0.1, 0, 0.15], joelhoE: [0.2, 0, 0], peE: [0.4, 0, 0],
    coxaD: [-0.7, 0, -0.15], joelhoD: [1.0, 0, 0], peD: [0.5, 0, 0] });
  G.mergulhoD = espelhar(G.mergulhoE);
  // Deitado de lado depois do mergulho (lado E no chao).
  G.deitadoE = pose({ tronco: [0.1, 0, 0], pescoco: [0, 0, 0.2],
    ombroD: [0.15, 0, -3.1], cotoveloD: [-0.2, 0, 0], ombroE: [0.15, 0, 3.0], cotoveloE: [-0.2, 0, 0],
    coxaE: [-0.15, 0, 0.05], joelhoE: [0.3, 0, 0], peE: [0.5, 0, 0],
    coxaD: [-0.8, 0, 0.1], joelhoD: [1.1, 0, 0], peD: [0.5, 0, 0] });
  G.deitadoD = espelhar(G.deitadoE);
  // Bola no meio: agarra na frente do peito e abraca.
  G.agarra = pose({ tronco: [0.1, 0, 0], pescoco: [-0.15, 0, 0],
    ombroD: [-1.35, 0, -0.3], cotoveloD: [-0.55, 0, 0], ombroE: [-1.35, 0, 0.3], cotoveloE: [-0.55, 0, 0],
    coxaD: [-0.25, 0, -0.15], joelhoD: [0.45, 0, 0], coxaE: [-0.25, 0, 0.15], joelhoE: [0.45, 0, 0] });
  G.abraca = pose({ tronco: [0.4, 0, 0], pescoco: [0.2, 0, 0],
    ombroD: [-0.9, 0, -0.1], cotoveloD: [-1.6, 0, 0], ombroE: [-0.9, 0, 0.1], cotoveloE: [-1.6, 0, 0],
    coxaD: [-0.6, 0, -0.15], joelhoD: [1.0, 0, 0], coxaE: [-0.6, 0, 0.15], joelhoE: [1.0, 0, 0] });

  // Goleiro esperando: quica nos joelhos e da "passinhos" laterais no
  // ritmo do balanco (as pernas inclinam pro lado do deslocamento em vez
  // de o corpo deslizar no gramado como um patinador).
  const poseOciosa = new Float32Array(N_CANAIS);
  function goleiroOcioso(t) {
    poseOciosa.set(G.pronto);
    if (!reduzMovimento) {
      const vel = Math.cos(t * 1.6), q = Math.sin(t * 3.2);
      poseOciosa[IDX.joelhoD] += 0.1 * q; poseOciosa[IDX.joelhoE] += 0.1 * q;
      poseOciosa[IDX.coxaD] -= 0.05 * q; poseOciosa[IDX.coxaE] -= 0.05 * q;
      poseOciosa[IDX.coxaD + 2] -= 0.08 * vel; poseOciosa[IDX.coxaE + 2] -= 0.08 * vel;
      poseOciosa[IDX.tronco + 2] += 0.05 * vel;
      poseOciosa[IDX.cotoveloD] -= 0.08 * q; poseOciosa[IDX.cotoveloE] -= 0.08 * q;
      achatarPe(poseOciosa, 'D'); achatarPe(poseOciosa, 'E');
    }
    rigGoleiro.aterrar = true;
    rigGoleiro.aplicar(poseOciosa);
  }

  // Guardamos a pose corrente pra o reset nao deixar o boneco travado
  // com as maos na cabeca.
  let poseAtual = 'neutro';

  function resetar() {
    resetPendente = null;
    ['batedor', 'giro', 'goleiro', 'torcida'].forEach(cancelarCanal);
    reacaoTorcida = null;
    bola.position.set(PONTO_BOLA.x, PONTO_BOLA.y, PONTO_BOLA.z);
    bola.visible = true;
    bolaMalha.rotation.set(0, 0, 0);
    goleiro.position.set(GOLEIRO_BASE.x, GOLEIRO_BASE.y, GOLEIRO_BASE.z);
    goleiro.rotation.set(0, 0, 0);
    goleiro.scale.set(1, 1, 1);
    goleiroOcioso(relogioCena / 1000);
    batedor.position.set(INICIO_BATEDOR.x, 0, INICIO_BATEDOR.z);
    batedor.rotation.set(0, Math.PI, 0);
    poseAtual = 'neutro';
    ctlBatedor.tocar(CLIPE_PARADO);
    rede.scale.set(1, 1, 1);
    offTorcida = 0;
    aplicarTorcidaBase();
    goleiroLivre = true;
  }
  resetar();

  // Mantidos pelos nomes antigos: o resto do arquivo (e os testes) chamam
  // por aqui. Agora sao so atalhos para a reacao correspondente.
  function comemorarTorcida() { reagirTorcida('gol'); }
  function lamentarTorcida() { reagirTorcida('erro'); }

  // ===================== POSES DO BATEDOR =========================
  //
  //   'confiante'  antes de chutar, quando a conta esta certa:
  //                peito estufado, maos na cintura, quicando
  //   'comemora'   depois do gol: vira pra camera, dois pulos, soco no ar
  //   'frustrado'  bola fora ou defesa: maos na cabeca, depois desanima
  //   'neutro'     volta ao descanso (respirando)
  //
  // Toda troca e crossfade a partir da pose em que o corpo esta.
  function voltarAoDescanso() { ctlBatedor.tocar(CLIPE_PARADO, { fade: d(450) }); }

  function poseBatedor(nome) {
    poseAtual = (nome === 'confiante' || nome === 'comemora' || nome === 'frustrado') ? nome : 'neutro';

    if (poseAtual === 'comemora') {
      const giro0 = batedor.rotation.y;
      if (reduzMovimento) {
        batedor.rotation.y = GIRO_COMEMORA;
        ctlBatedor.tocar(quadroDe(CLIPE_COMEMORA, 1));
        return;
      }
      animar(TEMPO.COMEMORA_BATEDOR * 0.45, function(e) {
        batedor.rotation.y = giro0 + (GIRO_COMEMORA - giro0) * e;
      }, null, { ease: EASE.sineInOut, canal: 'giro' });
      ctlBatedor.tocar(CLIPE_COMEMORA, { dur: TEMPO.COMEMORA_BATEDOR, fade: 120, aoTerminar: voltarAoDescanso });
      return;
    }
    if (poseAtual === 'frustrado') {
      if (reduzMovimento) { ctlBatedor.tocar(quadroDe(CLIPE_FRUSTRADO, 230 / 1100)); return; }
      ctlBatedor.tocar(CLIPE_FRUSTRADO, { dur: TEMPO.LAMENTA_BATEDOR, fade: 150, aoTerminar: voltarAoDescanso });
      return;
    }
    if (poseAtual === 'confiante') {
      ctlBatedor.tocar(CLIPE_CONFIANTE, { fade: d(TEMPO.POSE_BATEDOR) });
      return;
    }
    ctlBatedor.tocar(CLIPE_PARADO, { fade: d(TEMPO.POSE_BATEDOR) });
  }

  // Porta unica usada pelo main.js para as duas etapas da jogada.
  function reagir(tipo) {
    if (tipo === 'acerto')    { reagirTorcida('acerto'); poseBatedor('confiante'); return; }
    if (tipo === 'gol')       { reagirTorcida('gol');    poseBatedor('comemora');  return; }
    if (tipo === 'erro')      { reagirTorcida('erro');   poseBatedor('frustrado'); return; }
    if (tipo === 'neutro')    { poseBatedor('neutro'); }
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

  // ---------- Qualidade adaptativa ----------
  // Se a maquina nao segura ~40 fps nos primeiros 120 quadros, desliga a
  // sombra projetada (a mancha de contato continua) e volta a resolucao
  // para 1x. Pensado no Chromebook do laboratorio: o boneco perde a sombra,
  // mas o goleiro e a bola continuam fluidos.
  const AMOSTRAS_DESEMPENHO = 120, QUADRO_LENTO_MS = 25;
  let amostrasQuadro = 0, somaQuadro = 0, ultimoQuadro = 0, qualidadeReduzida = false;
  function vigiarDesempenho(agora) {
    if (qualidadeReduzida || amostrasQuadro >= AMOSTRAS_DESEMPENHO) return;
    const dt = ultimoQuadro ? agora - ultimoQuadro : 0;
    ultimoQuadro = agora;
    if (dt <= 0 || dt > 250) return; // aba escondida / pausa: nao conta
    somaQuadro += dt;
    amostrasQuadro++;
    if (amostrasQuadro === AMOSTRAS_DESEMPENHO && somaQuadro / AMOSTRAS_DESEMPENHO > QUADRO_LENTO_MS) reduzirQualidade();
  }
  function reduzirQualidade() {
    qualidadeReduzida = true;
    renderer.shadowMap.enabled = false;
    renderer.setPixelRatio(1);
    ajustarTamanho();
    cena.traverse(function(o) {
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function(m) { m.needsUpdate = true; });
    });
  }

  // ---------- Loop de render ----------
  function quadro(agora) {
    if (!vivo) return;
    rafId = requestAnimationFrame(quadro);
    relogioCena = agora;
    vigiarDesempenho(agora);
    atualizarTweens(agora);
    const t = agora / 1000;
    torcida.position.y = offTorcida;
    // Cadencia adaptativa. Reescrever as 144 pessoas a 60 fps rouba quadro
    // do goleiro e da bola, que SAO medidos (os testes de animacao amostram
    // quadro a quadro). Repouso a ~15 fps, reacao a ~30 fps.
    const cadencia = (intensidade > REPOUSO + 0.001 || intensidade < -0.001) ? 33 : 66;
    if (agora - ultimoDesenho > cadencia) { ultimoDesenho = agora; desenharTorcida(t); }
    if (goleiroLivre) {
      if (!reduzMovimento) goleiro.position.x = GOLEIRO_BASE.x + Math.sin(t * 1.6) * 0.18;
      goleiroOcioso(t);
    }
    ctlBatedor.atualizar(agora);
    sombraBola.visible = bola.visible;
    sombraBola.position.set(bola.position.x, 0.02, bola.position.z);
    sombraBola.scale.setScalar(Math.max(0.5, 1 - (bola.position.y - ALTURA_BOLA) * 0.25));
    sombraBatedor.position.set(batedor.position.x, 0.02, batedor.position.z);
    sombraGoleiro.position.set(goleiro.position.x, 0.02, goleiro.position.z);
    renderer.render(cena, camera);
  }
  rafId = requestAnimationFrame(quadro);

  // ---------- Chute (batedor) ----------
  // Um clipe so, da arrancada ao pe voltando: corrida em tres passos, pe
  // de apoio planta ao lado da bola, perna arma, quadril gira, contato com
  // o peito do pe e acompanhamento. aoContato dispara no instante do
  // contato (HU-18), junto com o som (HU-09).
  function animarChute(aoContato) {
    const dur = d(TOTAL_CHUTE);
    ctlBatedor.tocar(CLIPE_CHUTE, {
      dur: dur, fade: d(150),
      eventos: [{ u: CONTATO_MS / TOTAL_CHUTE, fn: function() {
        if (typeof SFX !== 'undefined' && SFX.chute) SFX.chute();
        aoContato();
      } }],
      aoTerminar: function() { ctlBatedor.tocar(CLIPE_PARADO, { fade: d(380) }); }
    });
    const p = new Float32Array(3);
    animar(dur, function(e, u) {
      TRILHA_CHUTE.amostrar(u, 0, p);
      batedor.position.x = p[0];
      batedor.position.z = p[1];
      batedor.rotation.y = p[2];
    }, null, { canal: 'batedor' });
  }

  // ---------- Goleiro ----------
  // Aplica pose de membros com o pivo do tronco fixo (sem prender os pes):
  // durante o mergulho quem manda na altura e alturaDeApoio.
  function posarGoleiro(p, corrY) {
    rigGoleiro.aterrar = false;
    rigGoleiro.aplicar(p);
    rigGoleiro.raiz.position.y = rigGoleiro.baseY + (corrY || 0);
  }

  // Altura do pivo (centro do tronco) que deixa o ponto mais baixo do corpo
  // exatamente no chao para uma dada pose. Calculada com a caixa real do
  // modelo, pra o goleiro nunca atravessar o gramado. Devolve o boneco
  // exatamente como estava (nada aparece no quadro).
  const caixaTmp = new THREE.Box3();
  function alturaDeApoio(rotZ, membros, corrY) {
    const salvo = {
      pos: goleiro.position.clone(), rot: goleiro.rotation.clone(),
      pose: rigGoleiro.ultima.slice(), ry: rigGoleiro.raiz.position.y, aterrar: rigGoleiro.aterrar
    };
    goleiro.position.set(0, 0, GOLEIRO_BASE.z);
    goleiro.rotation.set(0, 0, rotZ);
    posarGoleiro(membros, corrY);
    goleiro.updateMatrixWorld(true);
    caixaTmp.setFromObject(goleiro);
    const apoio = -caixaTmp.min.y;
    rigGoleiro.aplicar(salvo.pose);
    rigGoleiro.raiz.position.y = salvo.ry;
    rigGoleiro.aterrar = salvo.aterrar;
    goleiro.position.copy(salvo.pos); goleiro.rotation.copy(salvo.rot);
    goleiro.updateMatrixWorld(true);
    return apoio;
  }

  function poseDoPonto(alvo) {
    const lado = alvo.x >= 0 ? 1 : -1;
    const ang = alvo.y > 1.5 ? 0.95 : 1.4;
    const phi = -lado * ang;
    const membros = lado > 0 ? G.mergulhoE : G.mergulhoD;
    const pose = { x: alvo.x + ALCANCE_MAOS * Math.sin(phi), y: alvo.y - ALCANCE_MAOS * Math.cos(phi), rotZ: phi,
      membros: membros, deitado: lado > 0 ? G.deitadoE : G.deitadoD, zBola: 0.45 };
    pose.y = Math.max(pose.y, alturaDeApoio(phi, membros, 0) + 0.02); // mergulho nunca abaixo do chao
    return pose;
  }

  function poseGoleiro(zonaId) {
    if (zonaId === 'meio') {
      return { x: 0, y: alturaDeApoio(0, G.agarra, 0), rotZ: 0, membros: G.agarra, deitado: G.abraca, zBola: 0.95 };
    }
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
    // Sai da prontidao de onde estiver (pose e agachamento do quadro atual).
    const de = rigGoleiro.ultima.slice();
    const corr0 = rigGoleiro.raiz.position.y - rigGoleiro.baseY;
    const g0 = { x: goleiro.position.x, y: GOLEIRO_BASE.y };
    const tmp = new Float32Array(N_CANAIS);
    // Os bracos chegam um pouco antes do corpo: le como "esticar pra bola".
    function membrosEm(e) { return misturar(de, pose.membros, Math.min(1, e * 1.3), tmp); }
    // Altura minima (corpo encostando no chao) ao longo do mergulho, para
    // a interpolacao nunca "afundar" os pes no gramado no meio do salto.
    const apoio = [];
    for (let i = 0; i <= 10; i++) {
      const e = i / 10;
      apoio.push(alturaDeApoio(pose.rotZ * e, membrosEm(e), corr0 * (1 - e)));
    }
    function apoioEm(e) {
      const k = Math.min(9.999, Math.max(0, e * 10)), i = Math.floor(k), f = k - i;
      return apoio[i] + (apoio[i + 1] - apoio[i]) * f;
    }
    goleiroLivre = false;
    animar(d(TEMPO.MERGULHO_GOLEIRO), function(e) {
      goleiro.position.x = g0.x + (pose.x - g0.x) * e;
      goleiro.position.y = Math.max(g0.y + (pose.y - g0.y) * e, apoioEm(e) + 0.01);
      goleiro.rotation.z = pose.rotZ * e;
      posarGoleiro(membrosEm(e), corr0 * (1 - e));
    }, function() {
      deitarGoleiro(pose);
      if (aoTerminar) aoTerminar();
    }, { ease: EASE.sineOut, canal: 'goleiro' });
  }

  // Depois do mergulho o goleiro cai deitado de lado, de forma continua
  // (gravidade no Y, giro suave), da uma pequena acomodada e FICA no chao
  // ate a cena resetar. Nunca desce abaixo do gramado: a altura vem da
  // caixa real do corpo (alturaDeApoio) em cada trecho da queda. Defesa no
  // meio: fica em pe e abraca a bola.
  function deitarGoleiro(pose) {
    const de = rigGoleiro.ultima.slice();
    const tmp = new Float32Array(N_CANAIS);
    if (Math.abs(pose.rotZ) < 0.01) {
      // Pes no chao do inicio ao fim do abraco (a altura acompanha a pose).
      const apoioMeio = [];
      for (let i = 0; i <= 8; i++) apoioMeio.push(alturaDeApoio(0, misturar(de, pose.deitado, EASE.sineInOut(i / 8), tmp), 0));
      animar(d(500), function(e, u) {
        const k = Math.min(7.999, u * 8), i = Math.floor(k), f = k - i;
        posarGoleiro(misturar(de, pose.deitado, e, tmp), 0);
        goleiro.position.y = apoioMeio[i] + (apoioMeio[i + 1] - apoioMeio[i]) * f + 0.002;
      }, null, { ease: EASE.sineInOut, canal: 'goleiro' });
      return;
    }
    const lado = pose.rotZ > 0 ? 1 : -1;
    const rotFinal = lado * Math.PI / 2;
    // Deitado, os bracos ficam esticados na linha do corpo (acima da
    // cabeca): o apoio no chao e o ombro/quadril, como uma pessoa de lado,
    // e nao a mao "escorando" o corpo no ar.
    const ini = { x: goleiro.position.x, y: goleiro.position.y, rot: goleiro.rotation.z };
    function rotEm(u) { return ini.rot + (rotFinal - ini.rot) * EASE.sineInOut(u); }
    function membrosEm(u) { return misturar(de, pose.deitado, EASE.sineInOut(u), tmp); }
    const apoio = [];
    for (let i = 0; i <= 8; i++) apoio.push(alturaDeApoio(rotEm(i / 8), membrosEm(i / 8), 0));
    const yFinal = apoio[8] + 0.005;
    const deslize = -lado * 0.25; // escorrega um pouco na direcao do mergulho
    animar(d(520), function(e, u) {
      const g = EASE.quadIn(u);                 // queda com aceleracao
      const k = Math.min(7.999, u * 8), i = Math.floor(k), f = k - i;
      const minimo = apoio[i] + (apoio[i + 1] - apoio[i]) * f + 0.005;
      goleiro.rotation.z = rotEm(u);
      goleiro.position.x = ini.x + deslize * EASE.sineOut(u);
      posarGoleiro(membrosEm(u), 0);
      // Durante a queda nunca abaixo do chao (bracos mudando de pose).
      goleiro.position.y = Math.max(ini.y + (yFinal - ini.y) * g, minimo);
    }, function() {
      goleiro.position.y = yFinal;
      goleiro.rotation.z = rotFinal;
      // Acomodada curta (quique pequeno) e depois fica parado no chao.
      animar(d(220), function(e, u) {
        goleiro.position.y = yFinal + 0.05 * Math.sin(Math.PI * u);
      }, function() { goleiro.position.y = yFinal; }, { canal: 'goleiro' });
    }, { canal: 'goleiro' });
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

    const pose = poseGoleiro(ZONAS[zonaId] ? zonaId : 'meio');
    const fim = { x: alvo.x, y: alvo.y, z: pose.zBola };

    function iniciarBolaEGoleiro() {
      mergulharGoleiro(pose, function() {
        pulso(TEMPO.IMPACTO_DEFESA, function(s) { goleiro.scale.set(1 + 0.04 * s, 1 - 0.05 * s, 1); });
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
        resetPendente = animar(TEMPO.ANTES_DE_RESETAR, null, resetar); // R08: mesmo com movimento reduzido, o resultado fica visivel
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
      resetPendente = animar(TEMPO.ANTES_DE_RESETAR, null, resetar); // R08: mesmo com movimento reduzido, o resultado fica visivel
    }

    animarChute(iniciarBolaEGoleiro);
    return true;
  }

  // Leitura para testes/diagnostico (sem efeito colateral).
  function depurar() {
    goleiro.updateMatrixWorld(true);
    caixaTmp.setFromObject(goleiro);
    // Quanto a torcida esta "clareada" em relacao a cor-base (0 = base,
    // 1 = branco). Deve ficar abaixo de ~0.3 e voltar a 0. (v2: a cor da
    // camisa mora no corpo; cabeca agora tem cor de pele.)
    let clareamento = 0;
    const atual = new THREE.Color(), base = new THREE.Color();
    for (let i = 0; i < baseTorcida.length; i++) {
      corpos.getColorAt(i, atual); base.setHex(baseTorcida[i].cor);
      ['r', 'g', 'b'].forEach(function(c) {
        if (base[c] < 0.98) clareamento = Math.max(clareamento, (atual[c] - base[c]) / (1 - base[c]));
      });
    }
    batedor.updateMatrixWorld(true);
    const pe = new THREE.Vector3().setFromMatrixPosition(rigBatedor.marcadorChute.matrixWorld);
    return {
      torcidaClareamento: clareamento,
      goleiroMinY: caixaTmp.min.y,
      goleiroRotZ: goleiro.rotation.z,
      bola: { x: bola.position.x, y: bola.position.y, z: bola.position.z },
      // Peito do pe do chute e distancia dele ate o centro da bola (HU-18).
      peChute: { x: pe.x, y: pe.y, z: pe.z, distanciaBola: pe.distanceTo(bola.position) },
      qualidade: qualidadeReduzida ? 'reduzida' : 'alta',
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

  return { modo: '3d', chutar, iniciarMira, moverMiraTela, moverMiraDelta, pararMira, chutarLivre,
           reagir, poseBatedor, depurar, destruir };
}
