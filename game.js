import * as THREE from 'three';

// ===== Constants =====
const LANE_X = [-2.4, 0, 2.4];
const GRAVITY = -55;
const JUMP_V = 17;
const ROLL_TIME = 0.55;
const BASE_SPEED = 18;
const MAX_SPEED = 46;
const SPEED_RAMP = 0.18; // per second
const WORLD_LENGTH = 320;
const SPAWN_AHEAD = 220;
const DESPAWN_BEHIND = 30;

const COLORS = {
  sky: 0x87cfff,
  ground: 0x3a3146,
  rail: 0x9aa3b3,
  tie: 0x5a3a22,
  gravel: 0x4a4554,
  wallA: 0x2c2444,
  wallB: 0x1c1530,
  platform: 0xe7d9b8,
  trainRed: 0xd83a3a,
  trainYellow: 0xffcb2e,
  trainBlue: 0x2d8eff,
  trainGreen: 0x45e07b,
  graffitiPink: 0xff3da6,
  graffitiCyan: 0x2ee6ff,
  graffitiYellow: 0xffd23f,
  buildingA: 0xf2ad5c,
  buildingB: 0xe66c8a,
  buildingC: 0x6dc5e8,
  buildingD: 0xc8a4ff,
};

// ===== Renderer / Scene =====
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.sky);
scene.fog = new THREE.Fog(COLORS.sky, 70, 180);

const camera = new THREE.PerspectiveCamera(
  62, window.innerWidth / window.innerHeight, 0.1, 400
);
camera.position.set(0, 6.2, -9);
camera.lookAt(0, 2.5, 8);

// ===== Lights =====
const hemi = new THREE.HemisphereLight(0xffffff, 0x4a3b6a, 0.85);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2d4, 1.3);
sun.position.set(20, 40, -10);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 100;
sun.shadow.camera.left = -25;
sun.shadow.camera.right = 25;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
sun.shadow.bias = -0.0005;
scene.add(sun);

const fill = new THREE.DirectionalLight(0x99c2ff, 0.35);
fill.position.set(-10, 20, -20);
scene.add(fill);

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ===== Materials cache =====
const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + ':' + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.rough ?? 0.7,
    metalness: opts.metal ?? 0.05,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveI ?? 0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    flatShading: opts.flat ?? true,
  });
  matCache.set(key, m);
  return m;
}

// Helper: rounded box-ish using BoxGeometry; cartoon style is fine.
function boxMesh(w, h, d, color, opts = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, mat(color, opts));
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  return m;
}

function group(...children) {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}

// ===== Player =====
function buildPlayer() {
  const root = new THREE.Group();

  // Body / hoodie
  const torso = boxMesh(0.95, 1.0, 0.55, 0xff3da6); // pink hoodie
  torso.position.y = 1.55;
  root.add(torso);

  // Hood collar accent
  const collar = boxMesh(0.85, 0.18, 0.5, 0xffffff);
  collar.position.y = 1.95;
  root.add(collar);

  // Lower body / jeans
  const hipsLeft = boxMesh(0.36, 0.45, 0.45, 0x2350a8);
  hipsLeft.position.set(-0.22, 0.95, 0);
  root.add(hipsLeft);
  const hipsRight = boxMesh(0.36, 0.45, 0.45, 0x2350a8);
  hipsRight.position.set(0.22, 0.95, 0);
  root.add(hipsRight);

  // Legs (animated)
  const legL = boxMesh(0.32, 0.85, 0.4, 0x1d3f8c);
  legL.position.set(-0.22, 0.45, 0);
  legL.userData.basePos = legL.position.clone();
  const legR = legL.clone(); legR.position.x = 0.22;
  legR.userData.basePos = legR.position.clone();
  root.add(legL); root.add(legR);

  // Sneakers
  const shoeL = boxMesh(0.36, 0.18, 0.5, 0xffffff);
  shoeL.position.set(-0.22, 0.05, 0.05);
  shoeL.userData.basePos = shoeL.position.clone();
  const shoeR = shoeL.clone(); shoeR.position.x = 0.22;
  shoeR.userData.basePos = shoeR.position.clone();
  // sneaker stripe
  const stripeL = boxMesh(0.38, 0.04, 0.18, 0xff3da6);
  stripeL.position.set(0, 0.02, 0.1);
  shoeL.add(stripeL);
  const stripeR = stripeL.clone();
  shoeR.add(stripeR);
  root.add(shoeL); root.add(shoeR);

  // Arms
  const armL = boxMesh(0.28, 0.85, 0.32, 0xff3da6);
  armL.position.set(-0.62, 1.5, 0);
  armL.userData.basePos = armL.position.clone();
  const armR = armL.clone(); armR.position.x = 0.62;
  armR.userData.basePos = armR.position.clone();
  root.add(armL); root.add(armR);

  // Hands
  const handL = boxMesh(0.26, 0.22, 0.3, 0xffd2a6);
  handL.position.set(-0.62, 1.05, 0);
  handL.userData.basePos = handL.position.clone();
  const handR = handL.clone(); handR.position.x = 0.62;
  handR.userData.basePos = handR.position.clone();
  root.add(handL); root.add(handR);

  // Head
  const head = boxMesh(0.6, 0.6, 0.6, 0xffd2a6);
  head.position.y = 2.35;
  root.add(head);

  // Cap
  const cap = boxMesh(0.7, 0.18, 0.65, 0x2ee6ff);
  cap.position.y = 2.72;
  root.add(cap);
  const brim = boxMesh(0.7, 0.06, 0.3, 0x2ee6ff);
  brim.position.set(0, 2.65, 0.4);
  root.add(brim);

  // Backpack
  const pack = boxMesh(0.7, 0.7, 0.3, 0xffd23f);
  pack.position.set(0, 1.55, -0.35);
  root.add(pack);
  const packStrap = boxMesh(0.7, 0.1, 0.05, 0xc97e00);
  packStrap.position.set(0, 1.7, -0.18);
  root.add(packStrap);

  // Headphones detail
  const earL = boxMesh(0.12, 0.18, 0.18, 0xff3da6);
  earL.position.set(-0.34, 2.4, 0);
  root.add(earL);
  const earR = earL.clone(); earR.position.x = 0.34;
  root.add(earR);

  // Shadow blob (extra contact shadow)
  const shadowGeo = new THREE.CircleGeometry(0.9, 24);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.35,
  });
  const blob = new THREE.Mesh(shadowGeo, shadowMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  root.add(blob);

  root.userData.parts = { legL, legR, armL, armR, shoeL, shoeR, handL, handR, head, cap, torso, blob };
  return root;
}

const player = buildPlayer();
scene.add(player);

const playerState = {
  laneIndex: 1,
  targetX: 0,
  y: 0,
  vy: 0,
  rolling: false,
  rollTime: 0,
  jumping: false,
  alive: true,
  hover: false,
  jet: false,
  speed: BASE_SPEED,
  distance: 0,
};

function animatePlayer(dt, running) {
  const t = performance.now() * 0.001;
  const p = player.userData.parts;
  if (!running) return;

  // Run cycle speed scales with movement speed
  const cycle = t * (playerState.speed * 0.55);
  const swing = Math.sin(cycle) * 0.9;
  const swing2 = Math.cos(cycle) * 0.9;

  // legs
  p.legL.position.z = p.legL.userData.basePos.z + swing * 0.35;
  p.legR.position.z = p.legR.userData.basePos.z - swing * 0.35;
  p.legL.position.y = p.legL.userData.basePos.y + Math.max(0, swing) * 0.18;
  p.legR.position.y = p.legR.userData.basePos.y + Math.max(0, -swing) * 0.18;

  // shoes follow legs
  p.shoeL.position.z = p.shoeL.userData.basePos.z + swing * 0.55;
  p.shoeR.position.z = p.shoeR.userData.basePos.z - swing * 0.55;
  p.shoeL.position.y = p.shoeL.userData.basePos.y + Math.max(0, swing) * 0.25;
  p.shoeR.position.y = p.shoeR.userData.basePos.y + Math.max(0, -swing) * 0.25;

  // arms (counter swing)
  p.armL.position.z = p.armL.userData.basePos.z - swing * 0.28;
  p.armR.position.z = p.armR.userData.basePos.z + swing * 0.28;
  p.armL.rotation.x = -swing * 0.6;
  p.armR.rotation.x = swing * 0.6;
  p.handL.position.z = p.handL.userData.basePos.z - swing * 0.5;
  p.handR.position.z = p.handR.userData.basePos.z + swing * 0.5;
  p.handL.position.y = p.handL.userData.basePos.y + swing2 * 0.05;
  p.handR.position.y = p.handR.userData.basePos.y - swing2 * 0.05;

  // body bob
  p.torso.position.y = 1.55 + Math.abs(swing) * 0.06;
  p.head.position.y = 2.35 + Math.abs(swing) * 0.06;
  p.cap.position.y = 2.72 + Math.abs(swing) * 0.06;
}

function setRollingPose(rolling) {
  // Compress player vertically when rolling.
  player.scale.y = rolling ? 0.55 : 1;
  player.userData.parts.blob.material.opacity = rolling ? 0.5 : 0.35;
}

// ===== World container =====
// All environment lives in `world` and is scrolled toward the camera.
const world = new THREE.Group();
scene.add(world);

// ===== Sky / clouds =====
function buildClouds() {
  const cloudGroup = new THREE.Group();
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
  for (let i = 0; i < 18; i++) {
    const c = new THREE.Group();
    const n = 3 + Math.floor(Math.random() * 3);
    for (let j = 0; j < n; j++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(2 + Math.random() * 2, 8, 6),
        cloudMat,
      );
      puff.position.set(j * 2.5 - n, Math.random() * 0.8, Math.random() * 1.5);
      c.add(puff);
    }
    c.position.set(
      (Math.random() - 0.5) * 200,
      30 + Math.random() * 18,
      (Math.random() - 0.2) * 250 + 30,
    );
    cloudGroup.add(c);
  }
  return cloudGroup;
}
const clouds = buildClouds();
scene.add(clouds);

// Distant skyline (parallax) — billboards behind everything
function buildSkyline(side) {
  const g = new THREE.Group();
  const colors = [COLORS.buildingA, COLORS.buildingB, COLORS.buildingC, COLORS.buildingD];
  for (let i = 0; i < 22; i++) {
    const w = 4 + Math.random() * 4;
    const h = 8 + Math.random() * 22;
    const d = 4 + Math.random() * 3;
    const b = boxMesh(w, h, d, colors[i % colors.length]);
    b.position.set(side * (18 + Math.random() * 6), h / 2, i * 12 - 60 + Math.random() * 6);
    b.castShadow = false; b.receiveShadow = false;
    // windows pattern via emissive specks (simple): add a few small boxes
    const winRows = Math.floor(h / 2);
    for (let r = 0; r < winRows; r++) {
      if (Math.random() < 0.5) continue;
      const win = boxMesh(0.4, 0.5, 0.05, 0xffe89c, { emissive: 0xffd23f, emissiveI: 0.8, cast: false });
      win.position.set((Math.random() - 0.5) * (w - 1), -h / 2 + r * 2 + 1, d / 2 + 0.01);
      b.add(win);
    }
    g.add(b);
  }
  return g;
}
const skylineL = buildSkyline(-1);
const skylineR = buildSkyline(1);
scene.add(skylineL); scene.add(skylineR);

// ===== Tile system =====
// Track is built from repeating tiles of fixed length.
const TILE_LEN = 40;
const TILE_COUNT = 8;

const tilePool = [];
function buildTile() {
  const tile = new THREE.Group();

  // Gravel base
  const base = boxMesh(18, 0.6, TILE_LEN, COLORS.gravel, { rough: 1, flat: true });
  base.position.set(0, -0.3, 0);
  base.receiveShadow = true;
  tile.add(base);

  // Three lanes (rails)
  for (const x of LANE_X) {
    // rails (two per lane)
    for (const dx of [-0.7, 0.7]) {
      const rail = boxMesh(0.12, 0.12, TILE_LEN, COLORS.rail, { metal: 0.6, rough: 0.4 });
      rail.position.set(x + dx, 0.06, 0);
      tile.add(rail);
    }
    // ties
    const tieCount = Math.floor(TILE_LEN / 1.6);
    for (let i = 0; i < tieCount; i++) {
      const tie = boxMesh(1.7, 0.12, 0.45, COLORS.tie, { rough: 1 });
      tie.position.set(x, 0.0, -TILE_LEN / 2 + i * 1.6 + 0.8);
      tile.add(tie);
    }
  }

  // Side walls with graffiti
  for (const side of [-1, 1]) {
    const wall = boxMesh(0.6, 5, TILE_LEN, COLORS.wallA);
    wall.position.set(side * 8.5, 2.2, 0);
    tile.add(wall);

    // Top trim
    const trim = boxMesh(0.7, 0.4, TILE_LEN, COLORS.wallB);
    trim.position.set(side * 8.5, 4.7, 0);
    tile.add(trim);

    // Random graffiti panels
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const colorPick = [COLORS.graffitiPink, COLORS.graffitiCyan, COLORS.graffitiYellow][i % 3];
      const panel = boxMesh(0.05, 1.5 + Math.random(), 3 + Math.random() * 2, colorPick, { emissive: colorPick, emissiveI: 0.25 });
      panel.position.set(side * 8.18, 1.5 + Math.random() * 1.5, -TILE_LEN / 2 + 5 + i * (TILE_LEN / n));
      tile.add(panel);
    }

    // Lamp posts every ~20m
    for (let i = 0; i < 2; i++) {
      const post = boxMesh(0.18, 5.5, 0.18, 0x222233);
      post.position.set(side * 8.95, 2.7, -TILE_LEN / 2 + 8 + i * 22);
      tile.add(post);
      const arm = boxMesh(0.8, 0.12, 0.12, 0x222233);
      arm.position.set(side * (8.95 - 0.5 * side), 5.3, -TILE_LEN / 2 + 8 + i * 22);
      tile.add(arm);
      const lamp = boxMesh(0.5, 0.3, 0.5, 0xfff2a8, { emissive: 0xffd070, emissiveI: 1.4, cast: false });
      lamp.position.set(side * (8.95 - 1.0 * side), 5.15, -TILE_LEN / 2 + 8 + i * 22);
      tile.add(lamp);
    }
  }

  // Overhead wire frame
  const archCount = 3;
  for (let i = 0; i < archCount; i++) {
    const arch = boxMesh(17, 0.18, 0.22, 0x222233, { cast: false });
    arch.position.set(0, 6.4, -TILE_LEN / 2 + 6 + i * (TILE_LEN / archCount));
    tile.add(arch);
    // wires
    for (const lx of LANE_X) {
      const wire = boxMesh(0.04, 0.04, TILE_LEN / archCount + 0.5, 0x111122, { cast: false });
      wire.position.set(lx, 6.0, -TILE_LEN / 2 + 6 + i * (TILE_LEN / archCount) + (TILE_LEN / archCount) / 2);
      tile.add(wire);
    }
  }

  // Container for spawned obstacles/coins/powerups
  const dynamic = new THREE.Group();
  tile.add(dynamic);
  tile.userData.dynamic = dynamic;
  tile.userData.populated = false;

  return tile;
}

function clearTileDynamic(tile) {
  const d = tile.userData.dynamic;
  while (d.children.length) {
    const c = d.children.pop();
    c.traverse?.(o => {
      if (o.geometry && o.userData.disposable) o.geometry.dispose?.();
    });
    d.remove(c);
  }
  tile.userData.populated = false;
}

// Initialize tiles
for (let i = 0; i < TILE_COUNT; i++) {
  const t = buildTile();
  t.position.z = i * TILE_LEN;
  world.add(t);
  tilePool.push(t);
}

// ===== Obstacle factories =====
// Each obstacle has userData: kind ("low"|"mid"|"jump"|"train"|"ramp"), bbox half extents.

function makeBarrier() {
  // Mid barrier — must be jumped over.
  const g = new THREE.Group();
  const main = boxMesh(2.0, 0.9, 0.5, 0xffd23f);
  main.position.y = 0.55;
  g.add(main);
  const stripe = boxMesh(2.05, 0.18, 0.52, 0x111133);
  stripe.position.y = 0.7;
  g.add(stripe);
  // legs
  const legL = boxMesh(0.18, 0.5, 0.18, 0x444455);
  legL.position.set(-0.85, 0.25, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.85; g.add(legR);
  g.userData = { kind: 'jump', hw: 1.05, hh: 0.55, hd: 0.3, baseY: 0.55 };
  return g;
}

function makeSign() {
  // Low overhead sign — must be rolled under.
  const g = new THREE.Group();
  const postL = boxMesh(0.18, 3, 0.18, 0x444455);
  postL.position.set(-1, 1.5, 0); g.add(postL);
  const postR = postL.clone(); postR.position.x = 1; g.add(postR);
  const board = boxMesh(2.4, 0.9, 0.18, 0xff3da6, { emissive: 0xff3da6, emissiveI: 0.25 });
  board.position.y = 2.55;
  g.add(board);
  // Text bar
  const bar = boxMesh(2.0, 0.18, 0.2, 0xffffff);
  bar.position.y = 2.55; g.add(bar);
  g.userData = { kind: 'low', hw: 1.2, hh: 0.5, hd: 0.2, baseY: 2.55 };
  return g;
}

function makeCone() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 0.85, 8),
    mat(0xff7a1a, { rough: 0.6 }),
  );
  body.position.y = 0.42;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.32, 0.1, 12),
    mat(0xffffff),
  );
  stripe.position.y = 0.45;
  g.add(stripe);
  const base = boxMesh(0.7, 0.08, 0.7, 0x222233);
  base.position.y = 0.04;
  g.add(base);
  g.userData = { kind: 'jump', hw: 0.4, hh: 0.45, hd: 0.4, baseY: 0.4 };
  return g;
}

function makeTrain(length = 22) {
  // Static train car spanning a single lane. Player must change lane to avoid.
  const g = new THREE.Group();
  const colors = [COLORS.trainRed, COLORS.trainYellow, COLORS.trainBlue, COLORS.trainGreen];
  const color = colors[Math.floor(Math.random() * colors.length)];

  const body = boxMesh(2.0, 2.3, length, color, { rough: 0.5 });
  body.position.y = 1.4;
  g.add(body);

  // Roof
  const roof = boxMesh(2.1, 0.18, length, 0x222233);
  roof.position.y = 2.55;
  g.add(roof);

  // Stripe
  const stripe = boxMesh(2.05, 0.25, length, 0xffffff);
  stripe.position.y = 1.8;
  g.add(stripe);

  // Windows
  const winCount = Math.floor(length / 2.5);
  for (let i = 0; i < winCount; i++) {
    const w = boxMesh(0.12, 0.55, 1.2, 0x9be6ff, { emissive: 0x88c0ff, emissiveI: 0.5 });
    w.position.set(1.06, 2.0, -length / 2 + 1.5 + i * 2.4);
    g.add(w);
    const w2 = w.clone(); w2.position.x = -1.06;
    g.add(w2);
  }

  // Front face (slanted-ish via small box)
  const front = boxMesh(2.1, 1.2, 0.3, 0x222233);
  front.position.set(0, 1.8, length / 2 + 0.1);
  g.add(front);
  const headlight = boxMesh(0.4, 0.2, 0.1, 0xffffe0, { emissive: 0xffffe0, emissiveI: 1.2 });
  headlight.position.set(0, 1.6, length / 2 + 0.27);
  g.add(headlight);

  // Wheels (decorative)
  for (let i = 0; i < 4; i++) {
    const wh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.3, 12),
      mat(0x111122),
    );
    wh.rotation.z = Math.PI / 2;
    wh.position.set(0, 0.3, -length / 2 + 2 + i * (length / 4));
    g.add(wh);
  }

  g.userData = { kind: 'train', hw: 1.05, hh: 1.3, hd: length / 2, baseY: 1.4, length };
  return g;
}

function makeMovingTrain(length = 18) {
  const t = makeTrain(length);
  t.userData.kind = 'train';
  t.userData.moving = true;
  t.userData.speed = -10; // moves away
  return t;
}

function makeRamp() {
  const g = new THREE.Group();
  // simple wedge using BoxGeometry rotated
  const geo = new THREE.BoxGeometry(2.0, 0.3, 3.5);
  // Custom wedge by stretching one edge:
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const y = pos.getY(i);
    if (z > 0 && y > 0) pos.setY(i, y + 1.2);
  }
  geo.computeVertexNormals();
  const ramp = new THREE.Mesh(geo, mat(0xffd23f, { flat: true }));
  ramp.castShadow = true; ramp.receiveShadow = true;
  ramp.position.y = 0.15;
  g.add(ramp);
  const stripe = boxMesh(2.05, 0.06, 0.4, 0x111133);
  stripe.position.set(0, 0.32, 1.5);
  g.add(stripe);
  g.userData = { kind: 'ramp', hw: 1.1, hh: 0.3, hd: 1.7, baseY: 0.15 };
  return g;
}

// ===== Coin =====
const coinGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.08, 16);
const coinMaterial = new THREE.MeshStandardMaterial({
  color: 0xffcb2e, emissive: 0xffae00, emissiveIntensity: 0.6,
  metalness: 0.7, roughness: 0.25, flatShading: true,
});
function makeCoin() {
  const m = new THREE.Mesh(coinGeometry, coinMaterial);
  m.rotation.x = Math.PI / 2;
  m.castShadow = false;
  m.userData = { kind: 'coin' };
  return m;
}

// ===== Power-ups =====
function makePowerUp(kind) {
  const g = new THREE.Group();
  let core, color;
  if (kind === 'magnet') {
    color = 0xff5e5e;
    core = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.16, 10, 18, Math.PI),
      mat(color, { emissive: color, emissiveI: 0.6, metal: 0.3 }),
    );
    core.rotation.z = Math.PI;
    // tips
    const tipL = boxMesh(0.2, 0.18, 0.2, 0xffffff);
    tipL.position.set(-0.42, 0, 0);
    const tipR = tipL.clone(); tipR.position.x = 0.42;
    g.add(tipL); g.add(tipR);
  } else if (kind === 'multiplier') {
    color = 0xffd23f;
    core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.5, 0),
      mat(color, { emissive: color, emissiveI: 0.7, metal: 0.4 }),
    );
  } else if (kind === 'speed') {
    color = 0x2ee6ff;
    core = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 0.9, 6),
      mat(color, { emissive: color, emissiveI: 0.7 }),
    );
    core.rotation.x = Math.PI / 2;
  } else if (kind === 'hover') {
    color = 0x45e07b;
    core = boxMesh(1.4, 0.18, 0.7, color, { emissive: color, emissiveI: 0.5 });
    core.position.y = 0.05;
    // wing tips
    const tipL = boxMesh(0.2, 0.06, 0.6, 0xffffff);
    tipL.position.set(-0.7, 0.05, 0);
    const tipR = tipL.clone(); tipR.position.x = 0.7;
    g.add(tipL); g.add(tipR);
  } else if (kind === 'jet') {
    color = 0xff3da6;
    core = boxMesh(0.6, 0.9, 0.4, color, { emissive: color, emissiveI: 0.6 });
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.5, 8),
      mat(0xffd23f, { emissive: 0xffae00, emissiveI: 1.2 }),
    );
    flame.rotation.x = Math.PI;
    flame.position.set(0, -0.6, 0);
    g.add(flame);
  }
  core.castShadow = false;
  g.add(core);

  // Glow ring
  const glowGeo = new THREE.RingGeometry(0.6, 1.0, 24);
  const glowMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(glowGeo, glowMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.4;
  g.add(ring);

  g.userData = { kind: 'powerup', power: kind, hw: 0.6, hh: 0.6, hd: 0.6, baseY: 1.6 };
  return g;
}

// ===== Tile population =====
// We populate tiles when they enter ahead range with a deterministic-ish mix.
let tileSeed = 0;

function populateTile(tile, zStart) {
  if (tile.userData.populated) return;
  tile.userData.populated = true;
  const d = tile.userData.dynamic;
  tileSeed++;

  // Skip the very first tile near spawn so player can ease in.
  const isFirst = zStart < 30;
  if (isFirst) return;

  // Decide whether to place a long train across one lane (about 25% chance)
  const trainLane = Math.random() < 0.35 ? Math.floor(Math.random() * 3) : -1;
  let trainEnd = -100;
  if (trainLane >= 0) {
    const len = 18 + Math.random() * 8;
    const train = (Math.random() < 0.3) ? makeMovingTrain(len) : makeTrain(len);
    train.position.set(LANE_X[trainLane], train.userData.baseY, -TILE_LEN / 2 + 6 + Math.random() * (TILE_LEN - len - 8));
    trainEnd = train.position.z + len / 2;
    d.add(train);
  }

  // Place obstacles in slots
  const slotCount = 4;
  for (let s = 0; s < slotCount; s++) {
    const slotZ = -TILE_LEN / 2 + 6 + s * (TILE_LEN / slotCount);

    const lanesAvailable = [0, 1, 2].filter(li => {
      if (trainLane === li && slotZ < trainEnd && slotZ > trainEnd - 24) return false;
      return true;
    });
    if (!lanesAvailable.length) continue;

    // Possibly place 1-2 obstacles in this slot
    const placeCount = Math.random() < 0.55 ? 1 : (Math.random() < 0.4 ? 2 : 0);
    const usedLanes = new Set();
    for (let p = 0; p < placeCount; p++) {
      const lane = lanesAvailable[Math.floor(Math.random() * lanesAvailable.length)];
      if (usedLanes.has(lane)) continue;
      usedLanes.add(lane);

      const r = Math.random();
      let ob;
      if (r < 0.3) ob = makeBarrier();
      else if (r < 0.55) ob = makeSign();
      else if (r < 0.8) ob = makeCone();
      else ob = makeRamp();

      ob.position.set(LANE_X[lane], ob.userData.baseY, slotZ);
      d.add(ob);
    }

    // Coin trail in remaining lane(s)
    const coinLanes = lanesAvailable.filter(li => !usedLanes.has(li));
    if (coinLanes.length && Math.random() < 0.85) {
      const lane = coinLanes[Math.floor(Math.random() * coinLanes.length)];
      const trailLen = 5 + Math.floor(Math.random() * 4);
      const yBase = Math.random() < 0.2 ? 2.5 : 1.4; // some arcs jump
      for (let i = 0; i < trailLen; i++) {
        const c = makeCoin();
        const t = i / (trailLen - 1);
        // arch coins occasionally
        const y = yBase + (yBase < 2 ? Math.sin(t * Math.PI) * 0.4 : 0);
        c.position.set(LANE_X[lane], y, slotZ + i * 1.2 - trailLen * 0.6);
        d.add(c);
      }
    }
  }

  // Power-up — about 10% per tile
  if (Math.random() < 0.18) {
    const kinds = ['magnet', 'multiplier', 'speed', 'hover', 'jet'];
    const pk = kinds[Math.floor(Math.random() * kinds.length)];
    const pu = makePowerUp(pk);
    const lane = Math.floor(Math.random() * 3);
    pu.position.set(LANE_X[lane], pu.userData.baseY, -TILE_LEN / 2 + 10 + Math.random() * (TILE_LEN - 20));
    d.add(pu);
  }
}

// ===== Chasers (guard + dog) =====
function buildGuard() {
  const g = new THREE.Group();
  // body — blue uniform
  const torso = boxMesh(1.0, 1.0, 0.6, 0x2350a8);
  torso.position.y = 1.55; g.add(torso);
  const belt = boxMesh(1.05, 0.15, 0.62, 0x111111);
  belt.position.y = 1.18; g.add(belt);
  // legs
  const legL = boxMesh(0.34, 0.95, 0.42, 0x1a3070);
  legL.position.set(-0.24, 0.5, 0); g.add(legL);
  legL.userData.basePos = legL.position.clone();
  const legR = legL.clone(); legR.position.x = 0.24;
  legR.userData.basePos = legR.position.clone(); g.add(legR);
  // arms
  const armL = boxMesh(0.3, 0.9, 0.3, 0x2350a8);
  armL.position.set(-0.65, 1.5, 0); g.add(armL);
  armL.userData.basePos = armL.position.clone();
  const armR = armL.clone(); armR.position.x = 0.65;
  armR.userData.basePos = armR.position.clone(); g.add(armR);
  // head
  const head = boxMesh(0.6, 0.6, 0.6, 0xffd2a6);
  head.position.y = 2.4; g.add(head);
  // hat
  const hat = boxMesh(0.7, 0.22, 0.7, 0x111133);
  hat.position.y = 2.78; g.add(hat);
  const hatBrim = boxMesh(0.78, 0.06, 0.4, 0x111133);
  hatBrim.position.set(0, 2.7, 0.4); g.add(hatBrim);
  // mustache for character
  const mustache = boxMesh(0.4, 0.08, 0.06, 0x553322);
  mustache.position.set(0, 2.3, 0.31); g.add(mustache);

  g.userData.parts = { legL, legR, armL, armR };
  return g;
}

function buildDog() {
  const g = new THREE.Group();
  const body = boxMesh(0.7, 0.55, 1.4, 0x8a5a2a);
  body.position.set(0, 0.7, 0); g.add(body);
  const head = boxMesh(0.55, 0.55, 0.55, 0x8a5a2a);
  head.position.set(0, 0.85, 0.85); g.add(head);
  const snout = boxMesh(0.3, 0.25, 0.3, 0x6a3e1a);
  snout.position.set(0, 0.7, 1.18); g.add(snout);
  const earL = boxMesh(0.15, 0.25, 0.1, 0x6a3e1a);
  earL.position.set(-0.2, 1.15, 0.78); g.add(earL);
  const earR = earL.clone(); earR.position.x = 0.2; g.add(earR);
  const tail = boxMesh(0.15, 0.6, 0.15, 0x8a5a2a);
  tail.position.set(0, 1.0, -0.85);
  tail.rotation.x = -0.5;
  tail.userData.base = tail.rotation.clone(); g.add(tail);
  // legs
  for (const dx of [-0.22, 0.22]) {
    for (const dz of [-0.45, 0.45]) {
      const leg = boxMesh(0.18, 0.55, 0.2, 0x6a3e1a);
      leg.position.set(dx, 0.27, dz);
      leg.userData.basePos = leg.position.clone();
      g.add(leg);
    }
  }
  g.userData.tail = tail;
  return g;
}

const guard = buildGuard();
guard.position.set(0, 0, -8);
scene.add(guard);
const dog = buildDog();
dog.position.set(2.0, 0, -7);
scene.add(dog);

function animateChasers(dt, t) {
  const cycle = t * 8;
  const swing = Math.sin(cycle) * 0.7;
  // Guard
  const gp = guard.userData.parts;
  gp.legL.position.z = gp.legL.userData.basePos.z + swing * 0.35;
  gp.legR.position.z = gp.legR.userData.basePos.z - swing * 0.35;
  gp.armL.rotation.x = -swing * 0.7;
  gp.armR.rotation.x = swing * 0.7;
  guard.position.y = Math.abs(swing) * 0.06;

  // Dog
  let i = 0;
  for (const child of dog.children) {
    if (child.userData.basePos) {
      const ph = (i % 2 === 0) ? swing : -swing;
      child.position.z = child.userData.basePos.z + ph * 0.25;
      i++;
    }
  }
  dog.userData.tail.rotation.z = Math.sin(t * 14) * 0.4;
  dog.position.y = Math.abs(Math.sin(cycle * 1.2)) * 0.08;
}

// ===== Particle / FX helpers =====
const fxPool = [];
function spawnSparkle(pos, color = 0xffd23f) {
  const count = 8;
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.08 + Math.random() * 0.05, 6, 4),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }),
    );
    m.position.copy(pos);
    const dir = new THREE.Vector3(
      (Math.random() - 0.5) * 4,
      Math.random() * 4 + 1,
      (Math.random() - 0.5) * 4,
    );
    m.userData = { vel: dir, life: 0.5 };
    group.add(m);
  }
  scene.add(group);
  fxPool.push(group);
}

function updateFX(dt) {
  for (let i = fxPool.length - 1; i >= 0; i--) {
    const g = fxPool[i];
    let alive = false;
    for (const m of g.children) {
      m.userData.life -= dt;
      if (m.userData.life > 0) {
        alive = true;
        m.position.addScaledVector(m.userData.vel, dt);
        m.userData.vel.y -= 8 * dt;
        m.material.opacity = Math.max(0, m.userData.life * 2);
      } else {
        m.visible = false;
      }
    }
    if (!alive) {
      scene.remove(g);
      g.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); });
      fxPool.splice(i, 1);
    }
  }
}

// Trail behind player when speed boost active
const trailGroup = new THREE.Group();
scene.add(trailGroup);
function spawnTrail() {
  const p = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.6),
    new THREE.MeshBasicMaterial({ color: 0x2ee6ff, transparent: true, opacity: 0.7 }),
  );
  p.rotation.x = -Math.PI / 2;
  p.position.copy(player.position);
  p.position.y = 0.05;
  p.userData = { life: 0.5 };
  trailGroup.add(p);
}
function updateTrail(dt) {
  for (let i = trailGroup.children.length - 1; i >= 0; i--) {
    const p = trailGroup.children[i];
    p.userData.life -= dt;
    if (p.userData.life <= 0) {
      trailGroup.remove(p);
      p.geometry.dispose(); p.material.dispose();
    } else {
      p.material.opacity = p.userData.life * 1.4;
      p.scale.setScalar(1 + (0.5 - p.userData.life) * 1.5);
    }
  }
}
