import * as THREE from 'three';

// ===== Audio (WebAudio synthesis — no external assets) =====
const audio = (() => {
  let ctx = null;
  let musicGain = null;
  let masterGain = null;
  let musicNodes = [];
  let musicTimer = 0;
  let musicStep = 0;
  let muted = false;

  function init() {
    if (ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ctx = new Ctx();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.18;
    musicGain.connect(masterGain);
  }

  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function blip({ freq = 600, dur = 0.1, type = 'square', vol = 0.25, slide = 0, attack = 0.005 } = {}) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise({ dur = 0.2, vol = 0.3, lp = 1200 } = {}) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lp;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filter); filter.connect(g); g.connect(masterGain);
    src.start(t0);
  }

  const sfx = {
    coin: () => blip({ freq: 1100, dur: 0.09, type: 'triangle', vol: 0.22, slide: 600 }),
    jump: () => blip({ freq: 320, dur: 0.18, type: 'square', vol: 0.18, slide: 500 }),
    roll: () => noise({ dur: 0.18, vol: 0.18, lp: 700 }),
    powerup: () => {
      blip({ freq: 440, dur: 0.12, type: 'triangle', vol: 0.22, slide: 300 });
      setTimeout(() => blip({ freq: 740, dur: 0.14, type: 'triangle', vol: 0.22, slide: 400 }), 90);
      setTimeout(() => blip({ freq: 1100, dur: 0.18, type: 'triangle', vol: 0.22, slide: 600 }), 180);
    },
    hit: () => {
      noise({ dur: 0.4, vol: 0.45, lp: 600 });
      blip({ freq: 110, dur: 0.45, type: 'sawtooth', vol: 0.3, slide: -60 });
    },
    lane: () => blip({ freq: 540, dur: 0.06, type: 'sine', vol: 0.12, slide: 200 }),
    mission: () => {
      blip({ freq: 660, dur: 0.1, type: 'triangle', vol: 0.2 });
      setTimeout(() => blip({ freq: 990, dur: 0.18, type: 'triangle', vol: 0.22 }), 120);
    },
  };

  // Simple looping music: 16-step bass + arp pattern in C minor pentatonic
  const NOTES = { C2: 65.41, Eb2: 77.78, F2: 87.31, G2: 98.0, Bb2: 116.54, C3: 130.81, Eb3: 155.56, F3: 174.61, G3: 196.0, Bb3: 233.08, C4: 261.63, Eb4: 311.13, G4: 392.0 };
  const bassPattern = ['C2','C2','G2','C2', 'Bb2','C2','G2','F2', 'Eb2','C2','G2','F2', 'Bb2','C2','G2','C2'];
  const arpPattern  = ['C4','Eb4','G4','Eb4', 'F3','Bb3','C4','Bb3', 'Eb3','G3','Bb3','G3', 'F3','Bb3','C4','Eb4'];
  const STEP_DUR = 0.18;

  function scheduleStep(step, when) {
    if (!ctx || muted) return;
    const bassF = NOTES[bassPattern[step % 16]];
    const arpF  = NOTES[arpPattern[step % 16]];
    // bass
    const o1 = ctx.createOscillator(); const g1 = ctx.createGain();
    o1.type = 'triangle'; o1.frequency.value = bassF;
    g1.gain.setValueAtTime(0, when);
    g1.gain.linearRampToValueAtTime(0.55, when + 0.01);
    g1.gain.exponentialRampToValueAtTime(0.001, when + STEP_DUR * 0.95);
    o1.connect(g1); g1.connect(musicGain);
    o1.start(when); o1.stop(when + STEP_DUR);
    // arp (only every other step for groove)
    if (step % 2 === 0) {
      const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
      o2.type = 'square'; o2.frequency.value = arpF;
      g2.gain.setValueAtTime(0, when);
      g2.gain.linearRampToValueAtTime(0.18, when + 0.005);
      g2.gain.exponentialRampToValueAtTime(0.001, when + STEP_DUR * 0.6);
      o2.connect(g2); g2.connect(musicGain);
      o2.start(when); o2.stop(when + STEP_DUR);
    }
    // hi-hat-like noise on offbeats
    if (step % 2 === 1) {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4000;
      const g = ctx.createGain(); g.gain.value = 0.12;
      src.connect(hp); hp.connect(g); g.connect(musicGain);
      src.start(when);
    }
    musicNodes.push({ stop: when + STEP_DUR + 0.1 });
  }

  let musicRunning = false;
  function startMusic() {
    if (!ctx || musicRunning || muted) return;
    musicRunning = true;
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setValueAtTime(0.18, ctx.currentTime);
    musicStep = 0;
    musicTimer = ctx.currentTime + 0.05;
    pump();
  }
  function pump() {
    if (!musicRunning || !ctx) return;
    const now = ctx.currentTime;
    while (musicTimer < now + 0.4) {
      scheduleStep(musicStep, musicTimer);
      musicTimer += STEP_DUR;
      musicStep++;
    }
    setTimeout(pump, 100);
  }
  function stopMusic() {
    if (!ctx || !musicRunning) return;
    musicRunning = false;
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
  }

  return {
    init, resume,
    play: (name) => sfx[name] && sfx[name](),
    startMusic, stopMusic,
    setMuted: v => { muted = v; if (v) stopMusic(); },
    isMuted: () => muted,
  };
})();

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

  // Hoverboard (hidden until power-up active)
  const board = new THREE.Group();
  const deck = boxMesh(1.6, 0.12, 0.55, 0x45e07b, { emissive: 0x45e07b, emissiveI: 0.4 });
  deck.position.y = 0;
  board.add(deck);
  const stripe = boxMesh(1.62, 0.04, 0.18, 0xffffff, { emissive: 0xffffff, emissiveI: 0.5 });
  stripe.position.y = 0.07;
  board.add(stripe);
  // Glow underside
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.0),
    new THREE.MeshBasicMaterial({ color: 0x45e07b, transparent: true, opacity: 0.55 }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.18;
  board.add(glow);
  // Trucks/wheels (decorative — they hover, but it sells the form)
  for (const dx of [-0.55, 0.55]) {
    const tr = boxMesh(0.22, 0.16, 0.28, 0x222233);
    tr.position.set(dx, -0.08, 0);
    board.add(tr);
  }
  board.position.y = 0.05;
  board.visible = false;
  root.add(board);

  // Jetpack (hidden until power-up active)
  const pack2 = new THREE.Group();
  const tank = boxMesh(0.8, 1.0, 0.4, 0xff3da6, { emissive: 0xff3da6, emissiveI: 0.4 });
  tank.position.set(0, 1.55, -0.55);
  pack2.add(tank);
  const tankCap = boxMesh(0.5, 0.1, 0.3, 0xffffff);
  tankCap.position.set(0, 2.05, -0.55);
  pack2.add(tankCap);
  // Two nozzles
  for (const dx of [-0.22, 0.22]) {
    const noz = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.16, 0.22, 10),
      mat(0x222233, { metal: 0.5 }),
    );
    noz.position.set(dx, 0.95, -0.55);
    pack2.add(noz);
  }
  pack2.visible = false;
  root.add(pack2);

  // Jet flame group
  const flames = new THREE.Group();
  for (const dx of [-0.22, 0.22]) {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.7, 10),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9 }),
    );
    flame.rotation.x = Math.PI;
    flame.position.set(dx, 0.55, -0.55);
    flame.userData.base = 0.55;
    flames.add(flame);
  }
  flames.visible = false;
  root.add(flames);

  root.userData.parts = { legL, legR, armL, armR, shoeL, shoeR, handL, handR, head, cap, torso, blob, board, pack2, flames };
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
  tilt: 0,
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

function updatePlayerGear(dt, t) {
  const p = player.userData.parts;
  const hover = gameState.powerups.hover > 0;
  const jet = gameState.powerups.jet > 0;

  // Hoverboard: visible when hover power active. Stop the run cycle leg
  // motion (glue legs to the board surface) and add a gentle bob/tilt.
  p.board.visible = hover;
  if (hover) {
    p.board.position.y = 0.05 + Math.sin(t * 5) * 0.04;
    p.board.rotation.z = -player.rotation.z * 0.6;
    p.shoeL.position.z = p.shoeL.userData.basePos.z;
    p.shoeR.position.z = p.shoeR.userData.basePos.z;
    p.legL.position.z = p.legL.userData.basePos.z;
    p.legR.position.z = p.legR.userData.basePos.z;
    p.shoeL.position.y = p.shoeL.userData.basePos.y + 0.18;
    p.shoeR.position.y = p.shoeR.userData.basePos.y + 0.18;
    // Tail trail on the ground
    if (Math.random() < 0.7) spawnTrail();
  }

  // Jetpack + flames: visible when jet active.
  p.pack2.visible = jet;
  p.flames.visible = jet;
  if (jet) {
    for (const f of p.flames.children) {
      const flick = 0.55 + Math.sin(t * 30 + f.position.x * 5) * 0.15;
      f.position.y = f.userData.base - 0.25 + flick * 0.2;
      f.scale.y = 0.7 + Math.random() * 0.6;
      f.material.color.setHex(Math.random() < 0.5 ? 0xffd23f : 0xff7a1a);
    }
    // Smoke trail behind
    if (Math.random() < 0.5) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.25 + Math.random() * 0.2, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.5 }),
      );
      puff.position.copy(player.position);
      puff.position.y += 1.0 + Math.random() * 0.4;
      puff.position.z -= 0.6;
      puff.userData = { life: 0.6 };
      trailGroup.add(puff);
    }
  }
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
  // Overhead wire frame — kept high above camera (cam.y ≈ 6.2) so it
  // doesn't slice through the playfield view. Thin pylons + a single
  // longitudinal cable per side sells the look without blocking sight.
  const archCount = 2;
  for (let i = 0; i < archCount; i++) {
    const archZ = -TILE_LEN / 2 + 10 + i * (TILE_LEN / archCount);
    // Pylons on the far edges, behind the wall trim
    for (const side of [-1, 1]) {
      const pylon = boxMesh(0.18, 4, 0.18, 0x222233, { cast: false });
      pylon.position.set(side * 8.4, 7.0, archZ);
      tile.add(pylon);
    }
    // Thin top-bar between pylons
    const top = boxMesh(17, 0.08, 0.1, 0x222233, { cast: false });
    top.position.set(0, 9.0, archZ);
    tile.add(top);
  }
  // Long parallel cables along the tile length, off to the sides
  for (const side of [-1, 1]) {
    const cable = boxMesh(0.04, 0.04, TILE_LEN, 0x111122, { cast: false });
    cable.position.set(side * 7.5, 8.6, 0);
    tile.add(cable);
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
    const c = d.children[d.children.length - 1];
    c.traverse?.(o => {
      // Don't dispose the cached coin geometry/material (it's reused)
      if (o.geometry && o.geometry !== coinGeometry) o.geometry.dispose?.();
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
  g.userData = { kind: 'jump', hw: 1.05, hh: 0.5, hd: 0.3, baseY: 0, cy: 0.5 };
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
  g.userData = { kind: 'low', hw: 1.2, hh: 0.45, hd: 0.2, baseY: 0, cy: 2.55 };
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
  g.userData = { kind: 'jump', hw: 0.4, hh: 0.4, hd: 0.4, baseY: 0, cy: 0.4 };
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

  g.userData = { kind: 'train', hw: 1.05, hh: 1.3, hd: length / 2, baseY: 0, cy: 1.4, length };
  return g;
}

function makeMovingTrain(length = 18) {
  const t = makeTrain(length);
  t.userData.kind = 'train';
  t.userData.moving = true;
  t.userData.speed = -10; // moves away
  return t;
}

function makeBarrel() {
  // Rolling oil barrel — kind 'jump' (jump over). Animates by spinning.
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 1.2, 14),
    mat(0xd83a3a, { rough: 0.6 }),
  );
  body.rotation.z = Math.PI / 2; // lie on side, axis along x
  body.position.y = 0.55;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  // Hoop bands
  for (const dx of [-0.45, 0, 0.45]) {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.57, 0.57, 0.06, 14),
      mat(0x222233),
    );
    band.rotation.z = Math.PI / 2;
    band.position.set(dx, 0.55, 0);
    g.add(band);
  }
  // Hazard label
  const label = boxMesh(0.5, 0.4, 0.04, 0xffd23f);
  label.position.set(0, 0.55, 0.55);
  g.add(label);
  g.userData = { kind: 'jump', hw: 0.6, hh: 0.55, hd: 0.55, baseY: 0, cy: 0.55, rolling: true };
  return g;
}

function makeCrate() {
  // Wooden crate — kind 'jump'. Slightly smaller than a barrier.
  const g = new THREE.Group();
  const body = boxMesh(1.2, 1.1, 1.1, 0xb87333, { rough: 0.9 });
  body.position.y = 0.55;
  g.add(body);
  // Plank seams
  for (const y of [0.2, 0.55, 0.9]) {
    const seam = boxMesh(1.22, 0.05, 1.12, 0x6e3d00);
    seam.position.y = y;
    g.add(seam);
  }
  // Stamp
  const stamp = boxMesh(0.5, 0.3, 0.04, 0x222233);
  stamp.position.set(0, 0.55, 0.56);
  g.add(stamp);
  g.userData = { kind: 'jump', hw: 0.6, hh: 0.55, hd: 0.55, baseY: 0, cy: 0.55, falling: true };
  return g;
}

function makeFence() {
  // Electric fence — kind 'jump' (jump over), tall posts and crackling
  // bolts that pulse.
  const g = new THREE.Group();
  const postL = boxMesh(0.18, 1.4, 0.18, 0x222233);
  postL.position.set(-1.0, 0.7, 0); g.add(postL);
  const postR = postL.clone(); postR.position.x = 1.0; g.add(postR);
  const insulatorL = boxMesh(0.22, 0.18, 0.22, 0xffffff);
  insulatorL.position.set(-1.0, 1.5, 0); g.add(insulatorL);
  const insulatorR = insulatorL.clone(); insulatorR.position.x = 1.0; g.add(insulatorR);
  // Three horizontal cables glowing yellow
  const cables = [];
  for (let i = 0; i < 3; i++) {
    const cable = boxMesh(2.0, 0.04, 0.04, 0xffd23f, { emissive: 0xffd23f, emissiveI: 0.9, cast: false });
    cable.position.y = 0.4 + i * 0.4;
    g.add(cable);
    cables.push(cable);
  }
  // Bolt sprite (an emissive bar that pulses position randomly)
  const bolt = boxMesh(2.0, 0.06, 0.06, 0x88ccff, { emissive: 0x88ccff, emissiveI: 1.5, cast: false });
  bolt.position.y = 0.8;
  g.add(bolt);
  g.userData = { kind: 'jump', hw: 1.0, hh: 0.6, hd: 0.2, baseY: 0, cy: 0.6, fence: true, bolt };
  return g;
}

function makeOpenTrain(length = 16) {
  // Train car with a passable opening in the middle so the player can
  // run through it. Implemented as two halves with a gap.
  const g = new THREE.Group();
  const colors = [COLORS.trainRed, COLORS.trainYellow, COLORS.trainBlue, COLORS.trainGreen];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const halfLen = (length - 4) / 2; // 4m gap
  for (const sign of [-1, 1]) {
    const z = sign * (halfLen / 2 + 2);
    const body = boxMesh(2.0, 2.3, halfLen, color, { rough: 0.5 });
    body.position.set(0, 1.4, z); g.add(body);
    const roof = boxMesh(2.1, 0.18, halfLen, 0x222233);
    roof.position.set(0, 2.55, z); g.add(roof);
    const stripe = boxMesh(2.05, 0.25, halfLen, 0xffffff);
    stripe.position.set(0, 1.8, z); g.add(stripe);
    // End cap (nearer the gap)
    const cap = boxMesh(2.1, 2.3, 0.18, 0x222233);
    cap.position.set(0, 1.4, z - sign * (halfLen / 2 + 0.05)); g.add(cap);
    // Windows
    const winCount = Math.max(1, Math.floor(halfLen / 2.5));
    for (let i = 0; i < winCount; i++) {
      const w = boxMesh(0.12, 0.55, 1.2, 0x9be6ff, { emissive: 0x88c0ff, emissiveI: 0.5 });
      w.position.set(1.06, 2.0, z - halfLen / 2 + 1.0 + i * (halfLen / winCount));
      g.add(w);
      const w2 = w.clone(); w2.position.x = -1.06; g.add(w2);
    }
    // Wheels
    for (let i = 0; i < 2; i++) {
      const wh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.3, 12),
        mat(0x111122),
      );
      wh.rotation.z = Math.PI / 2;
      wh.position.set(0, 0.3, z - halfLen / 3 + i * (halfLen / 1.5));
      g.add(wh);
    }
  }
  // Two collider segments — we tag the group as 'openTrain' and store
  // both extents so the collision pass handles them separately.
  g.userData = {
    kind: 'openTrain',
    hw: 1.05, hh: 1.3, hd: 0,
    baseY: 0, cy: 1.4,
    segments: [
      { z: -(halfLen / 2 + 2), hd: halfLen / 2 + 0.1 },
      { z:  (halfLen / 2 + 2), hd: halfLen / 2 + 0.1 },
    ],
    length,
  };
  return g;
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
  g.userData = { kind: 'ramp', hw: 1.1, hh: 0.5, hd: 1.7, baseY: 0, cy: 0.5 };
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
  m.userData = { kind: 'coin', hw: 0.4, hh: 0.4, hd: 0.4, cy: 0 };
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

  g.userData = { kind: 'powerup', power: kind, hw: 0.6, hh: 0.6, hd: 0.6, baseY: 1.6, cy: 0 };
  return g;
}

// ===== Tile population =====
// We populate tiles when they enter ahead range with a deterministic-ish mix.
let tileSeed = 0;

// Adds a coin to a tile's dynamic group, snapping any falling-crate
// dropY initialiser as needed.
function addCoin(d, x, y, z) {
  const c = makeCoin();
  c.position.set(x, y, z);
  d.add(c);
}

// Coin shapes
function placeCoinLine(d, lane, slotZ, count, yBase = 1.4) {
  for (let i = 0; i < count; i++) {
    const z = slotZ + i * 1.2 - count * 0.6;
    addCoin(d, LANE_X[lane], yBase, z);
  }
}
function placeCoinArch(d, lane, slotZ, count = 7, peak = 2.0) {
  // Coin arch over a barrier — arc up, then back down.
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const y = 1.2 + Math.sin(t * Math.PI) * peak;
    const z = slotZ + (i - (count - 1) / 2) * 0.9;
    addCoin(d, LANE_X[lane], y, z);
  }
}
function placeCoinZigzag(d, slotZ, lanes, length = 9) {
  // Zigzag between provided lanes (must be at least 2). Coin every step,
  // alternating lane every 2 coins.
  const lanePicks = lanes.length >= 2 ? lanes : [0, 1];
  for (let i = 0; i < length; i++) {
    const lane = lanePicks[Math.floor(i / 2) % lanePicks.length];
    const z = slotZ + i * 1.0 - length * 0.5;
    addCoin(d, LANE_X[lane], 1.4, z);
  }
}
function placeCoinRing(d, lane, centerZ, vertical = false) {
  // 10-coin bonus ring. By default a coin ring oriented vertically
  // (you run through it). Set vertical=false for a flat ring on the
  // ground — but vertical reads better in motion.
  const count = 10;
  const radius = 0.9;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const x = LANE_X[lane] + Math.cos(a) * radius;
    const y = 1.4 + Math.sin(a) * radius;
    const z = centerZ + (vertical ? 0 : Math.sin(a) * radius);
    addCoin(d, x, y, z);
  }
  // Glowing torus indicator
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.0, 0.06, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.7 }),
  );
  ring.position.set(LANE_X[lane], 1.4, centerZ);
  if (!vertical) ring.rotation.x = Math.PI / 2;
  ring.userData = { kind: 'decor', spin: true };
  d.add(ring);
}

// ===== Set-pieces (decor only) =====
function makeTunnel() {
  // A wide arched tunnel mouth the player runs through. Built as a
  // U-shape so we don't need geometry CSG. About 12 m deep.
  const g = new THREE.Group();
  const depth = 12;
  // Top ceiling slab
  const ceil = boxMesh(20, 0.8, depth, 0x1a1530);
  ceil.position.y = 8.8;
  g.add(ceil);
  // Pillars
  for (const side of [-1, 1]) {
    const pillar = boxMesh(1.6, 9.0, depth, 0x2c2444);
    pillar.position.set(side * 9.0, 4.5, 0);
    g.add(pillar);
  }
  // Brick arch on the front face (closest to camera approach)
  const arch = boxMesh(20, 1.2, 0.6, 0xb87333);
  arch.position.set(0, 8.4, depth / 2);
  g.add(arch);
  // Tunnel-mouth keystone
  const key = boxMesh(2, 1.4, 0.7, 0xffd23f);
  key.position.set(0, 8.5, depth / 2 + 0.05);
  g.add(key);
  // Inner glow strips along the ceiling
  for (let i = 0; i < 4; i++) {
    const strip = boxMesh(2.4, 0.06, 0.4, 0xffd23f, { emissive: 0xffd23f, emissiveI: 1.4, cast: false });
    strip.position.set(0, 8.3, -depth / 2 + 1 + i * (depth / 4));
    g.add(strip);
  }
  g.userData = { kind: 'decor' };
  return g;
}

function makeBridge() {
  // Overhead bridge crossing the track.
  const g = new THREE.Group();
  const span = boxMesh(22, 0.6, 6, 0x6c7480);
  span.position.y = 9.5;
  g.add(span);
  // Side rails
  for (const side of [-1, 1]) {
    const rail = boxMesh(22, 0.9, 0.18, 0xffd23f);
    rail.position.set(0, 10.2, side * 2.9);
    g.add(rail);
    // Posts
    for (let i = 0; i < 8; i++) {
      const p = boxMesh(0.18, 0.9, 0.18, 0x222233);
      p.position.set(-10.5 + i * 3, 10.0, side * 2.9);
      g.add(p);
    }
  }
  // Support pillars on each side at ground
  for (const side of [-1, 1]) {
    const support = boxMesh(1.6, 9.5, 1.2, 0x44484f);
    support.position.set(side * 9.5, 4.7, 0);
    g.add(support);
  }
  // Tiny pedestrian silhouettes walking across (purely visual)
  for (let i = 0; i < 4; i++) {
    const ped = boxMesh(0.35, 0.8, 0.25, [0xff3da6, 0x2ee6ff, 0xffd23f, 0x45e07b][i]);
    ped.position.set(-6 + i * 4, 10.4, (i % 2 ? -1.5 : 1.5));
    ped.userData.basePos = ped.position.clone();
    g.add(ped);
  }
  g.userData = { kind: 'decor' };
  return g;
}

function makeStation() {
  // Two raised platforms on either side of the track, with NPCs
  // waiting and benches/lamps. Length matches half a tile.
  const g = new THREE.Group();
  const len = 24;
  for (const side of [-1, 1]) {
    // Platform slab — raised about 1.1 m
    const slab = boxMesh(3, 1.1, len, 0xe7d9b8);
    slab.position.set(side * 6.5, 0.55, 0);
    g.add(slab);
    // Yellow safety stripe along the inner edge
    const stripe = boxMesh(0.3, 0.05, len, 0xffd23f, { emissive: 0xffd23f, emissiveI: 0.5 });
    stripe.position.set(side * 5.05, 1.13, 0);
    g.add(stripe);
    // Low wall behind the platform
    const back = boxMesh(0.5, 3, len, 0xc0a070);
    back.position.set(side * 7.7, 2.5, 0);
    g.add(back);
    // Roof canopy
    const canopy = boxMesh(3.4, 0.18, len, 0x6c7480);
    canopy.position.set(side * 6.4, 5.3, 0);
    g.add(canopy);
    // Roof supports
    for (let i = 0; i < 4; i++) {
      const sup = boxMesh(0.18, 4.5, 0.18, 0x222233);
      sup.position.set(side * 5.3, 3.0, -len / 2 + 3 + i * (len / 4));
      g.add(sup);
    }
    // Station sign
    const sign = boxMesh(2.6, 0.8, 0.12, 0x2350a8, { emissive: 0x2350a8, emissiveI: 0.4 });
    sign.position.set(side * 5.7, 4.0, 0);
    g.add(sign);
    const signText = boxMesh(2.0, 0.18, 0.14, 0xffffff);
    signText.position.set(side * 5.7, 4.0, 0.01);
    g.add(signText);
    // Bench
    const bench = boxMesh(2, 0.45, 0.6, 0xb87333);
    bench.position.set(side * 6.5, 1.4, -len / 4);
    g.add(bench);
    const benchBack = boxMesh(2, 0.7, 0.12, 0xb87333);
    benchBack.position.set(side * 6.5, 1.85, -len / 4 - 0.25);
    g.add(benchBack);
  }
  // NPCs waiting on platforms with arms that wave
  const wavers = [];
  const colors = [0xff3da6, 0x2ee6ff, 0xffd23f, 0x45e07b, 0x8a4dff, 0xff7a1a];
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1;
    const npc = new THREE.Group();
    const c = colors[i];
    const torso = boxMesh(0.55, 0.8, 0.4, c);
    torso.position.y = 1.7; npc.add(torso);
    const head = boxMesh(0.45, 0.45, 0.45, 0xffd2a6);
    head.position.y = 2.32; npc.add(head);
    const legL = boxMesh(0.25, 0.85, 0.3, 0x222233);
    legL.position.set(-0.13, 0.95, 0); npc.add(legL);
    const legR = legL.clone(); legR.position.x = 0.13; npc.add(legR);
    // Waving arm
    const arm = boxMesh(0.2, 0.7, 0.2, c);
    arm.position.set(side * 0.4, 2.0, 0);
    arm.userData.phase = i * 0.7;
    npc.add(arm);
    wavers.push(arm);
    npc.position.set(side * 6.5, 1.1, -8 + (i % 3) * 6);
    g.add(npc);
  }
  g.userData = { kind: 'decor', wave: wavers };
  return g;
}

function pickGroundObstacle() {
  // Weighted pick. Excludes trains (those are placed separately).
  const r = Math.random();
  if (r < 0.18) return makeBarrier();
  if (r < 0.36) return makeSign();
  if (r < 0.54) return makeCone();
  if (r < 0.66) return makeBarrel();
  if (r < 0.78) {
    const c = makeCrate();
    c.userData.dropY = 6 + Math.random() * 2; // start above, drop in
    c.position.y = c.userData.dropY;
    return c;
  }
  if (r < 0.88) return makeFence();
  return makeRamp();
}

function populateTile(tile, zStart) {
  if (tile.userData.populated) return;
  tile.userData.populated = true;
  const d = tile.userData.dynamic;
  tileSeed++;

  // Skip the first ~70m near spawn so the player has a moment to read
  // the controls before anything spawns in their lane.
  const isFirst = zStart < 70;
  if (isFirst) return;

  // Density: read from gameState (the wave system updates this).
  const density = (gameState && gameState.density) || 1.0;

  // Set-pieces — at most one per tile. Tunnels suppress mid-tile
  // ground obstacles where they'd clip; bridges and stations don't.
  let setPiece = null;
  let setPieceZSpan = null; // [z0, z1] of suppression zone
  const sp = Math.random();
  if (sp < 0.10) {
    setPiece = makeTunnel();
    setPiece.position.set(0, 0, 0);
    setPieceZSpan = [-6, 6]; // suppress obstacles in the 12m mouth
  } else if (sp < 0.20) {
    setPiece = makeBridge();
    setPiece.position.set(0, 0, (Math.random() - 0.5) * (TILE_LEN - 8));
  } else if (sp < 0.32) {
    setPiece = makeStation();
    setPiece.position.set(0, 0, 0);
  }
  if (setPiece) {
    tile.userData.dynamic.add(setPiece);
  }

  // Trains: 35% chance of a long train, 12% chance of an open-train.
  let trainLane = -1;
  let trainStart = 0, trainEnd = 0;
  const trainRoll = Math.random();
  if (trainRoll < 0.35 * density) {
    trainLane = Math.floor(Math.random() * 3);
    const len = 18 + Math.random() * 8;
    const train = (Math.random() < 0.3) ? makeMovingTrain(len) : makeTrain(len);
    train.position.set(LANE_X[trainLane], 0, -TILE_LEN / 2 + 6 + Math.random() * (TILE_LEN - len - 8));
    trainStart = train.position.z - len / 2 - 1;
    trainEnd = train.position.z + len / 2 + 1;
    d.add(train);
  } else if (trainRoll < 0.47 * density) {
    trainLane = Math.floor(Math.random() * 3);
    const len = 16;
    const train = makeOpenTrain(len);
    train.position.set(LANE_X[trainLane], 0, -TILE_LEN / 2 + 8 + Math.random() * (TILE_LEN - len - 10));
    trainStart = train.position.z - len / 2 - 1;
    trainEnd = train.position.z + len / 2 + 1;
    d.add(train);
  }

  // Place obstacles in slots
  const slotCount = 4;
  for (let s = 0; s < slotCount; s++) {
    const slotZ = -TILE_LEN / 2 + 6 + s * (TILE_LEN / slotCount);

    // Tunnel suppression: skip ground obstacles in the tunnel mouth.
    if (setPieceZSpan && slotZ > setPieceZSpan[0] && slotZ < setPieceZSpan[1]) continue;

    const lanesAvailable = [0, 1, 2].filter(li => {
      if (trainLane === li && slotZ > trainStart && slotZ < trainEnd) return false;
      return true;
    });
    if (!lanesAvailable.length) continue;

    // Place 0-2 obstacles in this slot
    const placeCount = Math.random() < 0.55 * density ? 1
                     : (Math.random() < 0.35 * density ? 2 : 0);
    const usedLanes = new Set();
    for (let p = 0; p < placeCount; p++) {
      const lane = lanesAvailable[Math.floor(Math.random() * lanesAvailable.length)];
      if (usedLanes.has(lane)) continue;
      usedLanes.add(lane);
      const ob = pickGroundObstacle();
      ob.position.set(LANE_X[lane], ob.userData.baseY, slotZ);
      // If it was a falling crate the factory set dropY which overrode y; restore.
      if (ob.userData.falling) ob.position.y = ob.userData.dropY;
      // Arch coins over a barrier-like obstacle ~30% of the time.
      if (ob.userData.kind === 'jump' && Math.random() < 0.3) {
        placeCoinArch(d, lane, slotZ, 7, 1.6);
      }
      d.add(ob);
    }

    // Coin shapes in the remaining lane(s)
    const coinLanes = lanesAvailable.filter(li => !usedLanes.has(li));
    if (coinLanes.length && Math.random() < 0.85) {
      const r = Math.random();
      if (r < 0.55 || coinLanes.length < 2) {
        // Straight trail
        const lane = coinLanes[Math.floor(Math.random() * coinLanes.length)];
        const len = 5 + Math.floor(Math.random() * 4);
        placeCoinLine(d, lane, slotZ, len, Math.random() < 0.18 ? 2.5 : 1.4);
      } else if (r < 0.85) {
        // Zigzag across two free lanes
        placeCoinZigzag(d, slotZ, coinLanes, 9);
      } else {
        // Bonus ring
        const lane = coinLanes[Math.floor(Math.random() * coinLanes.length)];
        placeCoinRing(d, lane, slotZ);
      }
    }
  }

  // Power-up — slight bump in chance. Avoid spawning on a train lane.
  if (Math.random() < 0.18) {
    const kinds = ['magnet', 'multiplier', 'speed', 'hover', 'jet'];
    const pk = kinds[Math.floor(Math.random() * kinds.length)];
    const pu = makePowerUp(pk);
    const safeLanes = [0, 1, 2].filter(li => li !== trainLane);
    const lane = safeLanes[Math.floor(Math.random() * safeLanes.length)];
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

// ===== Input =====
const Input = {
  swipeStart: null,
  swipeMin: 30,
};

function changeLane(dir) {
  if (!playerState.alive || gameState.paused || !gameState.running) return;
  const next = Math.max(0, Math.min(2, playerState.laneIndex + dir));
  if (next === playerState.laneIndex) return;
  playerState.laneIndex = next;
  playerState.targetX = LANE_X[next];
  playerState.tilt = dir > 0 ? -0.35 : 0.35;
  audio.play('lane');
  advanceMission('lane');
}
function jump() {
  if (!playerState.alive || gameState.paused || !gameState.running) return;
  if (playerState.y <= 0.001 && !playerState.jumping) {
    playerState.vy = JUMP_V;
    playerState.jumping = true;
    playerState.rolling = false;
    setRollingPose(false);
    audio.play('jump');
  }
}
function roll() {
  if (!playerState.alive || gameState.paused || !gameState.running) return;
  if (playerState.jumping) {
    // fast-fall
    playerState.vy = -30;
    return;
  }
  if (!playerState.rolling) {
    playerState.rolling = true;
    playerState.rollTime = ROLL_TIME;
    setRollingPose(true);
    audio.play('roll');
    advanceMission('roll');
  }
}

// Swipe handler on touch area
const touchArea = document.getElementById('touch-area');
touchArea.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0];
  Input.swipeStart = { x: t.clientX, y: t.clientY, time: performance.now() };
}, { passive: true });
touchArea.addEventListener('touchend', (e) => {
  if (!Input.swipeStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - Input.swipeStart.x;
  const dy = t.clientY - Input.swipeStart.y;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  Input.swipeStart = null;
  if (adx < Input.swipeMin && ady < Input.swipeMin) {
    // Tap = jump
    jump();
    return;
  }
  if (adx > ady) {
    changeLane(dx > 0 ? 1 : -1);
  } else {
    if (dy < 0) jump(); else roll();
  }
}, { passive: true });

// Keyboard fallback
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  switch (e.key) {
    case 'ArrowLeft': case 'a': case 'A': changeLane(-1); break;
    case 'ArrowRight': case 'd': case 'D': changeLane(1); break;
    case 'ArrowUp': case 'w': case 'W': case ' ': jump(); break;
    case 'ArrowDown': case 's': case 'S': roll(); break;
    case 'p': case 'P': case 'Escape': togglePause(); break;
  }
});

// ===== Game state =====
const gameState = {
  running: false,
  paused: false,
  score: 0,
  coins: 0,
  best: parseInt(localStorage.getItem('subway-best') || '0', 10),
  bestCoins: parseInt(localStorage.getItem('subway-best-coins') || '0', 10),
  multiplier: 1,
  startTime: 0,
  elapsed: 0,
  powerups: { magnet: 0, multiplier: 0, speed: 0, hover: 0, jet: 0 },
  missions: [],          // three live mission slots
  missionsDone: parseInt(localStorage.getItem('subway-missions-done') || '0', 10),
  wave: 1,
  density: 0.6,          // obstacle density multiplier (ramps with waves)
};

// Mission templates — three fresh ones get rolled each session, and
// completed ones get replaced with a new draw on the fly so you always
// have three live objectives.
const missionTemplates = [
  { kind: 'coin',     goal: 50,  label: 'Collect 50 coins' },
  { kind: 'coin',     goal: 100, label: 'Collect 100 coins' },
  { kind: 'coin',     goal: 250, label: 'Collect 250 coins in one run' },
  { kind: 'distance', goal: 200, label: 'Run 200 m' },
  { kind: 'distance', goal: 500, label: 'Run 500 m' },
  { kind: 'distance', goal: 1000,label: 'Run 1 km' },
  { kind: 'powerup',  goal: 1,   label: 'Activate any power-up' },
  { kind: 'powerup',  goal: 3,   label: 'Activate 3 power-ups' },
  { kind: 'jump',     goal: 8,   label: 'Jump over 8 obstacles' },
  { kind: 'jump',     goal: 20,  label: 'Jump 20 times' },
  { kind: 'lane',     goal: 25,  label: 'Change lanes 25 times' },
  { kind: 'roll',     goal: 6,   label: 'Roll 6 times' },
  { kind: 'mission',  goal: 2,   label: 'Complete 2 missions' },
];

function rollMission(excludeIds = new Set()) {
  const pool = missionTemplates.filter((_, i) => !excludeIds.has(i));
  if (!pool.length) return { ...missionTemplates[0], id: 0, progress: 0, done: false };
  const idx = Math.floor(Math.random() * pool.length);
  const tmpl = pool[idx];
  const realIdx = missionTemplates.indexOf(tmpl);
  return { ...tmpl, id: realIdx, progress: 0, done: false };
}

// ===== HUD elements =====
const HUD = {
  root: document.getElementById('hud'),
  title: document.getElementById('title-screen'),
  pause: document.getElementById('pause-screen'),
  gameover: document.getElementById('gameover-screen'),
  score: document.getElementById('score'),
  coins: document.getElementById('coins'),
  best: document.getElementById('best-score'),
  finalScore: document.getElementById('final-score'),
  finalCoins: document.getElementById('final-coins'),
  finalBest: document.getElementById('final-best'),
  missionsStack: document.getElementById('missions-stack'),
  waveBanner: document.getElementById('wave-banner'),
  waveBannerText: document.getElementById('wave-banner-text'),
  powerups: document.getElementById('powerups'),
  multiplier: document.getElementById('multiplier-badge'),
  multiplierText: document.getElementById('multiplier-text'),
  popups: document.getElementById('popup-layer'),
  speedBlur: document.getElementById('speed-blur'),
  coinCard: document.querySelector('.coin-card'),
};

HUD.best.textContent = gameState.best;

document.getElementById('play-btn').addEventListener('click', startGame);
document.getElementById('retry-btn').addEventListener('click', startGame);
document.getElementById('menu-btn').addEventListener('click', () => {
  HUD.gameover.classList.add('hidden');
  HUD.title.classList.remove('hidden');
  HUD.best.textContent = gameState.best;
});
document.getElementById('pause-btn').addEventListener('click', togglePause);
const muteBtn = document.getElementById('mute-btn');
muteBtn.addEventListener('click', () => {
  const muted = !audio.isMuted();
  audio.setMuted(muted);
  muteBtn.dataset.muted = String(muted);
  if (!muted && gameState.running) audio.startMusic();
});
document.getElementById('resume-btn').addEventListener('click', togglePause);
document.getElementById('quit-btn').addEventListener('click', () => {
  gameState.paused = false;
  gameState.running = false;
  HUD.pause.classList.add('hidden');
  HUD.root.classList.add('hidden');
  HUD.title.classList.remove('hidden');
});

function togglePause() {
  if (!gameState.running) return;
  gameState.paused = !gameState.paused;
  HUD.pause.classList.toggle('hidden', !gameState.paused);
}

function startGame() {
  HUD.title.classList.add('hidden');
  HUD.gameover.classList.add('hidden');
  HUD.pause.classList.add('hidden');
  HUD.root.classList.remove('hidden');

  // Hide hit feedback from any prior run
  document.getElementById('hit-flash').classList.remove('active');
  document.getElementById('busted-stamp').classList.remove('show');

  // Audio needs a user gesture to start (we get one from the play tap)
  audio.init();
  audio.resume();
  audio.startMusic();

  // reset
  resetWorld();
  gameState.running = true;
  gameState.paused = false;
  gameState.score = 0;
  gameState.coins = 0;
  gameState.multiplier = 1;
  gameState.elapsed = 0;
  gameState.startTime = performance.now();
  gameState.powerups = { magnet: 0, multiplier: 0, speed: 0, hover: 0, jet: 0 };
  gameState.slowmo = 0;
  gameState.wave = 1;
  gameState.density = 0.6;
  cameraShake.t = 0; cameraShake.amp = 0;
  rollMissions();
  announceWave(1);
  updateHUD();
  HUD.powerups.innerHTML = '';

  playerState.laneIndex = 1;
  playerState.targetX = 0;
  playerState.y = 0;
  playerState.vy = 0;
  playerState.rolling = false;
  playerState.jumping = false;
  playerState.alive = true;
  playerState.speed = BASE_SPEED;
  playerState.distance = 0;
  playerState.jumpsDone = 0;
  playerState.tilt = 0;
  player.position.set(0, 0, 0);
  player.rotation.set(0, 0, 0);
  setRollingPose(false);

  // Reset death-sequence state and player part transforms
  deathSeq.active = false;
  deathSeq.t = 0;
  const p = player.userData.parts;
  p.cap.position.set(0, 2.72, 0);
  p.cap.rotation.set(0, 0, 0);
  p.armL.rotation.set(0, 0, 0);
  p.armR.rotation.set(0, 0, 0);
  p.board.visible = false;
  p.pack2.visible = false;
  p.flames.visible = false;

  // Reset chasers
  guard.position.set(-1.2, 0, -8);
  guard.rotation.set(0, 0, 0);
  const gp = guard.userData.parts;
  gp.armL.rotation.set(0, 0, 0);
  gp.armR.rotation.set(0, 0, 0);
  dog.position.set(1.5, 0, -7);
  dog.rotation.set(0, 0, 0);
}

function rollMissions() {
  // Build three distinct missions
  gameState.missions = [];
  const used = new Set();
  for (let i = 0; i < 3; i++) {
    const m = rollMission(used);
    used.add(m.id);
    gameState.missions.push(m);
  }
  renderMissions();
}

function renderMissions() {
  HUD.missionsStack.innerHTML = '';
  for (const m of gameState.missions) {
    const card = document.createElement('div');
    card.className = 'mission-card' + (m.done ? ' done' : '');
    const pct = Math.min(100, (m.progress / m.goal) * 100);
    card.innerHTML = `
      <div class="mc-check">${m.done ? '✓' : ''}</div>
      <span class="mc-text">${m.label}</span>
      <div class="mc-progress"><div class="mc-fill" style="width:${pct}%"></div></div>
    `;
    HUD.missionsStack.appendChild(card);
    m._el = card;
  }
}

function advanceMission(kind, amount = 1) {
  if (!gameState.missions.length) return;
  let any = false;
  for (let i = 0; i < gameState.missions.length; i++) {
    const m = gameState.missions[i];
    if (m.done || m.kind !== kind) continue;
    m.progress = Math.min(m.goal, m.progress + amount);
    const fill = m._el?.querySelector('.mc-fill');
    if (fill) fill.style.width = ((m.progress / m.goal) * 100) + '%';
    any = true;
    if (m.progress >= m.goal) {
      m.done = true;
      gameState.score += 500;
      gameState.missionsDone++;
      localStorage.setItem('subway-missions-done', String(gameState.missionsDone));
      audio.play('mission');
      showPopup(window.innerWidth / 2, window.innerHeight / 2 - 40, 'MISSION +500', true);
      if (m._el) {
        m._el.classList.add('done', 'flash');
        m._el.querySelector('.mc-check').textContent = '✓';
      }
      // Replace the slot with a fresh mission after a short delay
      setTimeout(() => replaceMissionSlot(i), 1200);
      // Recurse for the meta "complete N missions" mission
      advanceMission('mission');
    }
  }
  return any;
}

function replaceMissionSlot(i) {
  const used = new Set(gameState.missions.map(m => m.id));
  const repl = rollMission(used);
  gameState.missions[i] = repl;
  renderMissions();
}

function announceWave(n) {
  HUD.waveBannerText.textContent = `WAVE ${n}`;
  HUD.waveBanner.classList.remove('show');
  void HUD.waveBanner.offsetWidth;
  HUD.waveBanner.classList.add('show');
}

function updateWaves(dt) {
  // A new wave every ~22s of run time. Density ramps with the wave,
  // but we punctuate each new wave with a brief calm-before-storm
  // dip so the rhythm doesn't feel uniform.
  const waveInterval = 22;
  const wantWave = 1 + Math.floor(gameState.elapsed / waveInterval);
  if (wantWave !== gameState.wave) {
    gameState.wave = wantWave;
    announceWave(wantWave);
  }
  // Density curve: 0.6 -> 1.4 by wave 6, with a 0.6 dip in the first
  // ~3s of every wave.
  const intoWave = gameState.elapsed - (gameState.wave - 1) * waveInterval;
  const calm = intoWave < 3 ? 0.6 : 1.0;
  gameState.density = Math.min(1.4, (0.55 + gameState.wave * 0.13)) * calm;
}

function resetWorld() {
  // Reposition tiles
  for (let i = 0; i < tilePool.length; i++) {
    const t = tilePool[i];
    clearTileDynamic(t);
    t.position.z = i * TILE_LEN - TILE_LEN / 2;
    if (i > 0) populateTile(t, t.position.z);
  }
}
resetWorld();

// ===== HUD update helpers =====
function updateHUD() {
  HUD.score.textContent = Math.floor(gameState.score);
  HUD.coins.textContent = gameState.coins;
}

function showPopup(x, y, text, power = false) {
  const el = document.createElement('div');
  el.className = 'popup' + (power ? ' power' : '');
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.textContent = text;
  HUD.popups.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

const powerLabels = {
  magnet: 'MAGNET', multiplier: '2X COINS',
  speed: 'SPEED', hover: 'HOVER', jet: 'JETPACK',
};
const powerDurations = {
  magnet: 8, multiplier: 12, speed: 6, hover: 10, jet: 7,
};

const powerPills = {};
function showPowerupPill(kind, duration) {
  if (powerPills[kind]) {
    powerPills[kind].remove();
    delete powerPills[kind];
  }
  const pill = document.createElement('div');
  pill.className = 'powerup-pill ' + kind;
  const label = powerLabels[kind];
  pill.innerHTML = `<div class="icon">${kind === 'magnet' ? '🧲' : kind === 'multiplier' ? '×2' : kind === 'speed' ? '⚡' : kind === 'hover' ? '🛹' : '🚀'}</div>${label}<div class="timer"></div>`;
  HUD.powerups.appendChild(pill);
  powerPills[kind] = pill;
  pill.userData = { duration, remaining: duration };
}

function updatePowerupPills(dt) {
  for (const kind of Object.keys(gameState.powerups)) {
    const t = gameState.powerups[kind];
    const pill = powerPills[kind];
    if (t > 0 && pill) {
      const pct = (t / pill.userData.duration) * 100;
      const tEl = pill.querySelector('.timer');
      if (tEl) tEl.style.width = pct + '%';
    } else if (t <= 0 && pill) {
      pill.remove();
      delete powerPills[kind];
    }
  }
}

function activatePower(kind) {
  const dur = powerDurations[kind];
  gameState.powerups[kind] = dur;
  showPowerupPill(kind, dur);
  if (kind === 'multiplier') {
    gameState.multiplier = 2;
    HUD.multiplier.classList.add('show');
    HUD.multiplierText.textContent = 'x2';
  } else if (kind === 'jet' || kind === 'hover') {
    playerState.vy = 0;
  }
  // sparkle around player
  spawnSparkle(player.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
    kind === 'magnet' ? 0xff5e5e :
    kind === 'multiplier' ? 0xffd23f :
    kind === 'speed' ? 0x2ee6ff :
    kind === 'hover' ? 0x45e07b : 0xff3da6);
  showPopup(window.innerWidth / 2, window.innerHeight / 2 - 60, label(kind), true);
  advanceMission('powerup');
  audio.play('powerup');
}

function label(kind) {
  return powerLabels[kind] || kind.toUpperCase();
}

// ===== Collision =====
const playerBox = new THREE.Box3();
const objBox = new THREE.Box3();
const tmpVec = new THREE.Vector3();

function getPlayerHalf() {
  // Width/Depth always similar, Height changes when rolling.
  const hh = playerState.rolling ? 0.5 : 1.2;
  return { hw: 0.45, hh, hd: 0.4 };
}

function aabbOverlap(ax, ay, az, ahw, ahh, ahd, bx, by, bz, bhw, bhh, bhd) {
  return Math.abs(ax - bx) < ahw + bhw &&
         Math.abs(ay - by) < ahh + bhh &&
         Math.abs(az - bz) < ahd + bhd;
}

function handleCollisions(dt) {
  const ph = getPlayerHalf();
  const px = player.position.x;
  const py = player.position.y + ph.hh; // center
  const pz = player.position.z;

  // Magnet radius
  // Jetpack auto-grants magnet pull so coin trails on the ground are
  // still reachable while flying overhead.
  const magnetActive = gameState.powerups.magnet > 0 || gameState.powerups.jet > 0;
  const magnetR = gameState.powerups.jet > 0 ? 9 : (magnetActive ? 6 : 0);

  // Power active flags
  const hover = gameState.powerups.hover > 0;
  const jet = gameState.powerups.jet > 0;
  const invincible = jet || hover;

  for (const tile of tilePool) {
    const d = tile.userData.dynamic;
    if (!d) continue;
    for (let i = d.children.length - 1; i >= 0; i--) {
      const obj = d.children[i];
      // Skip pure-decor objects (no collider, no pickup)
      if (obj.userData.kind === 'decor') {
        if (obj.userData.spin) obj.rotation.z += dt * 1.2;
        if (obj.userData.wave && obj.userData.wave.length) {
          // station NPCs: wave hands
          const t = performance.now() * 0.003;
          for (const npc of obj.userData.wave) {
            npc.rotation.z = Math.sin(t + npc.userData.phase) * 0.6;
          }
        }
        continue;
      }
      // World position of obj
      tmpVec.set(0, 0, 0);
      obj.getWorldPosition(tmpVec);
      const dx = tmpVec.x - px;
      const dz = tmpVec.z - pz;

      // Skip far objects fast (use obj depth for long trains)
      const earlyZ = (obj.userData.hd ?? 1) + 4;
      if (Math.abs(dz) > earlyZ && obj.userData.kind !== 'coin' && obj.userData.kind !== 'powerup') continue;

      // Magnet pulls coins toward player (works in tile-local coords)
      if (obj.userData.kind === 'coin' && magnetActive) {
        const dist = Math.hypot(dx, tmpVec.y - py, dz);
        if (dist < magnetR) {
          const local = d.worldToLocal(new THREE.Vector3(px, py, pz));
          const k = Math.min(1, 6 * dt);
          obj.position.x += (local.x - obj.position.x) * k;
          obj.position.y += (local.y - obj.position.y) * k;
          obj.position.z += (local.z - obj.position.z) * k;
        }
      }

      // Spin coins
      if (obj.userData.kind === 'coin') {
        obj.rotation.y += dt * 6;
      }

      // Bobble power-ups
      if (obj.userData.kind === 'powerup') {
        obj.rotation.y += dt * 1.5;
        obj.position.y = obj.userData.baseY + Math.sin(performance.now() * 0.003 + i) * 0.15;
      }

      // Update moving train
      if (obj.userData.moving) {
        obj.position.z += obj.userData.speed * dt;
      }

      // Per-frame obstacle anims
      if (obj.userData.rolling) {
        // Rolling barrel — spin the body around its long axis (x).
        obj.children[0].rotation.x += dt * 6;
      }
      if (obj.userData.falling && obj.userData.dropY > 0) {
        // Falling crate — settle from above.
        obj.userData.dropY = Math.max(0, obj.userData.dropY - dt * 14);
        obj.position.y = obj.userData.dropY;
      }
      if (obj.userData.fence) {
        // Electric fence — flicker bolt position and brightness.
        const b = obj.userData.bolt;
        b.position.y = 0.4 + Math.random() * 1.0;
        b.material.emissiveIntensity = 0.5 + Math.random() * 1.8;
      }

      // Quick AABB check — within neighborhood
      const owpos = new THREE.Vector3();
      obj.getWorldPosition(owpos);
      const oz = owpos.z;
      const ud = obj.userData;
      const earlyHd = ud.kind === 'openTrain'
        ? Math.max(...ud.segments.map(s => s.hd))
        : (ud.hd ?? 1);
      if (Math.abs(oz - pz) > earlyHd + 1.5) continue;

      const cyWorld = owpos.y + (ud.cy ?? 0);

      // Open-train obstacles: two halves with a passable gap between.
      let hit;
      if (ud.kind === 'openTrain') {
        hit = false;
        for (const seg of ud.segments) {
          if (aabbOverlap(
            owpos.x, cyWorld, oz + seg.z,
            ud.hw, ud.hh, seg.hd,
            px, py, pz,
            ph.hw, ph.hh, ph.hd,
          )) { hit = true; break; }
        }
      } else {
        hit = aabbOverlap(
          owpos.x, cyWorld, oz,
          ud.hw ?? 0.5, ud.hh ?? 0.5, ud.hd ?? 0.5,
          px, py, pz,
          ph.hw, ph.hh, ph.hd,
        );
      }
      if (!hit) continue;

      if (ud.kind === 'coin') {
        gameState.coins++;
        gameState.score += 10 * gameState.multiplier;
        advanceMission('coin');
        spawnSparkle(owpos, 0xffd23f);
        d.remove(obj);
        HUD.coinCard.classList.remove('coin-flash');
        void HUD.coinCard.offsetWidth;
        HUD.coinCard.classList.add('coin-flash');
        audio.play('coin');
        continue;
      }
      if (ud.kind === 'powerup') {
        activatePower(ud.power);
        d.remove(obj);
        continue;
      }
      if (ud.kind === 'ramp') {
        // Launch player up
        if (playerState.y < 0.05) {
          playerState.vy = JUMP_V * 1.1;
          playerState.jumping = true;
          playerState.rolling = false;
          setRollingPose(false);
        }
        continue;
      }
      // Solid obstacle
      if (invincible) {
        // Smash power: destroy small obstacles, but trains stay solid.
        if (ud.kind !== 'train' && ud.kind !== 'openTrain') {
          spawnSparkle(owpos, 0xff3da6);
          d.remove(obj);
          continue;
        } else {
          // can't destroy a train; jetpack flies over but hover doesn't
          if (!jet) { triggerDeath(obj); return; }
        }
      } else {
        // Determine if jump/roll evades
        if (ud.kind === 'jump' && playerState.y > ud.hh + 0.1) continue;
        if (ud.kind === 'low' && playerState.rolling) continue;
        triggerDeath(obj);
        return;
      }
    }
  }
}

function triggerDeath(obj) {
  if (!playerState.alive) return;
  playerState.alive = false;
  deathSeq.t = 0;
  deathSeq.active = true;

  // Visual hit feedback
  const flash = document.getElementById('hit-flash');
  flash.classList.remove('active'); void flash.offsetWidth; flash.classList.add('active');
  const stamp = document.getElementById('busted-stamp');
  stamp.classList.remove('show'); void stamp.offsetWidth; stamp.classList.add('show');

  // Camera shake + brief slow-mo
  cameraShake.t = 0.55;
  cameraShake.amp = 0.55;
  gameState.slowmo = 0.7;

  // FX burst at the impact point
  if (obj) {
    const p = new THREE.Vector3();
    obj.getWorldPosition(p);
    spawnSparkle(p.clone().add(new THREE.Vector3(0, 0.5, 0)), 0xff3da6);
  }
  spawnSparkle(player.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 0xffffff);

  // Hide any active power-up gear immediately
  player.userData.parts.board.visible = false;
  player.userData.parts.pack2.visible = false;
  player.userData.parts.flames.visible = false;

  audio.play('hit');
  audio.stopMusic();

  setTimeout(showGameOver, 1500);
}

const cameraShake = { t: 0, amp: 0 };
const deathSeq = { t: 0, active: false };

function updateDeathSequence(dt) {
  if (!deathSeq.active) return;
  deathSeq.t += dt;
  const t = deathSeq.t;
  const p = player.userData.parts;

  // Phase 1 (0-0.4s): player tumbles forward, guard sprints in.
  // Phase 2 (0.4-0.9s): guard grabs collar, dog leaps with bark.
  // Phase 3 (0.9-1.5s): held in place, camera pulls back.

  // Player flop: rotate forward + drop a little
  player.rotation.x = Math.min(0.9, t * 2.4);
  player.position.y = Math.max(0, playerState.y - t * 0.6);
  // Arms flail back
  p.armL.rotation.x = -1.2 - Math.sin(t * 12) * 0.4;
  p.armR.rotation.x = -1.2 + Math.sin(t * 12) * 0.4;
  // Cap pops off (slide it up and back, fade out via scale)
  p.cap.position.z = -t * 1.5;
  p.cap.position.y = 2.72 + t * 1.2 - t * t * 2;
  p.cap.rotation.x = t * 4;

  // Guard rushes in then locks on
  const gp = guard.userData.parts;
  if (t < 0.45) {
    // Sprint forward fast
    const targetZ = -1.2;
    guard.position.z += (targetZ - guard.position.z) * Math.min(1, 9 * dt);
    guard.position.x += (player.position.x - guard.position.x) * Math.min(1, 6 * dt);
    // Arm-pump fast
    const swing = Math.sin(t * 30) * 1.0;
    gp.legL.position.z = gp.legL.userData.basePos.z + swing * 0.4;
    gp.legR.position.z = gp.legR.userData.basePos.z - swing * 0.4;
    gp.armL.rotation.x = -swing * 1.2;
    gp.armR.rotation.x = swing * 1.2;
  } else {
    // Lunge: arms reach out forward toward player
    gp.armL.rotation.x = -2.0;
    gp.armR.rotation.x = -2.0;
    gp.legL.position.z = gp.legL.userData.basePos.z;
    gp.legR.position.z = gp.legR.userData.basePos.z;
    guard.position.x += (player.position.x - 0.35 - guard.position.x) * Math.min(1, 6 * dt);
    guard.position.z += (player.position.z - 0.6 - guard.position.z) * Math.min(1, 7 * dt);
  }

  // Dog leaps at ~0.3s, peaks ~0.6s
  const leapT = Math.max(0, t - 0.3);
  const leapY = Math.max(0, leapT * 6 - leapT * leapT * 9);
  dog.position.y = leapY;
  dog.position.z += ((player.position.z + 0.4) - dog.position.z) * Math.min(1, 6 * dt);
  dog.position.x += ((player.position.x + 1.0) - dog.position.x) * Math.min(1, 4 * dt);
  dog.rotation.x = -leapT * 1.5;

  // Camera pulls in tighter on the action
  if (t > 0.4) {
    cameraShake.t = Math.max(cameraShake.t, 0.05);
    cameraShake.amp = 0.15;
  }
}

function showGameOver() {
  gameState.running = false;
  if (gameState.score > gameState.best) {
    gameState.best = Math.floor(gameState.score);
    localStorage.setItem('subway-best', gameState.best);
  }
  HUD.finalScore.textContent = Math.floor(gameState.score);
  HUD.finalCoins.textContent = gameState.coins;
  HUD.finalBest.textContent = gameState.best;
  // Hide the BUSTED stamp before the panel opens — it's served its
  // 1.5s purpose and otherwise sits behind the panel doing nothing.
  document.getElementById('busted-stamp').classList.remove('show');
  HUD.gameover.classList.remove('hidden');
}

// ===== Main loop =====
let lastTime = performance.now();
function tick() {
  const now = performance.now();
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  dt = Math.min(dt, 0.05);

  const t = now * 0.001;

  // Animate clouds drift always
  clouds.position.x = Math.sin(t * 0.05) * 5;

  // Slow-mo on death dramatic moment
  if (gameState.slowmo > 0) {
    dt *= 0.25;
    gameState.slowmo -= dt;
  }

  if (gameState.running && !gameState.paused) {
    updateGame(dt, t);
  } else if (gameState.running && gameState.paused) {
    // paused: don't animate world but let camera settle if needed
  } else {
    // gentle player anim on title
    animatePlayer(dt, true);
  }

  updateFX(dt);
  updateTrail(dt);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

function updateGame(dt, t) {
  gameState.elapsed += dt;
  updateWaves(dt);

  // Speed ramp
  const target = Math.min(MAX_SPEED, BASE_SPEED + gameState.elapsed * SPEED_RAMP);
  const speedMul = gameState.powerups.speed > 0 ? 1.5 : 1;
  playerState.speed += (target * speedMul - playerState.speed) * Math.min(1, dt * 1.5);

  // Score from distance
  playerState.distance += playerState.speed * dt;
  gameState.score += playerState.speed * dt * 1.0 * gameState.multiplier;
  advanceMission('distance', playerState.speed * dt);

  // Lateral smoothing + lean into the dodge
  player.position.x += (playerState.targetX - player.position.x) * Math.min(1, 14 * dt);
  if (playerState.tilt !== 0) {
    player.rotation.z += (playerState.tilt - player.rotation.z) * Math.min(1, 12 * dt);
    playerState.tilt *= Math.max(0, 1 - 5 * dt);
    if (Math.abs(playerState.tilt) < 0.02) playerState.tilt = 0;
  } else {
    player.rotation.z += (0 - player.rotation.z) * Math.min(1, 8 * dt);
  }

  // Vertical
  if (gameState.powerups.jet > 0) {
    // hold at altitude
    const hover = 5;
    playerState.y += (hover - playerState.y) * Math.min(1, 4 * dt);
    playerState.vy = 0;
    playerState.jumping = false;
  } else if (gameState.powerups.hover > 0) {
    const target = 0.6;
    playerState.y += (target - playerState.y) * Math.min(1, 6 * dt);
    playerState.vy = 0;
    playerState.jumping = false;
  } else {
    playerState.vy += GRAVITY * dt;
    playerState.y += playerState.vy * dt;
    if (playerState.y <= 0) {
      if (playerState.jumping && playerState.vy < 0) {
        playerState.jumpsDone = (playerState.jumpsDone || 0) + 1;
        advanceMission('jump');
      }
      playerState.y = 0;
      playerState.vy = 0;
      playerState.jumping = false;
    }
  }
  player.position.y = playerState.y;

  // Roll timer
  if (playerState.rolling) {
    playerState.rollTime -= dt;
    if (playerState.rollTime <= 0) {
      playerState.rolling = false;
      setRollingPose(false);
    }
  }

  // Animate player and chasers
  animatePlayer(dt, true);
  updatePlayerGear(dt, t);
  animateChasers(dt, t);

  // Chasers follow behind during normal play; the death sequence
  // takes over the chasers' positions once it's active.
  if (!deathSeq.active) {
    const guardTargetZ = -7;
    guard.position.z += (guardTargetZ - guard.position.z) * Math.min(1, 2.5 * dt);
    guard.position.x += (player.position.x - 1.2 - guard.position.x) * Math.min(1, 3 * dt);
    dog.position.z += ((guardTargetZ + 1.5) - dog.position.z) * Math.min(1, 2.8 * dt);
    dog.position.x += (player.position.x + 1.5 - dog.position.x) * Math.min(1, 3 * dt);
  } else {
    updateDeathSequence(dt);
  }

  // Scroll world
  const scroll = playerState.speed * dt;
  for (const tile of tilePool) {
    tile.position.z -= scroll;
  }
  // Skyline parallax
  skylineL.position.z -= scroll * 0.4;
  skylineR.position.z -= scroll * 0.4;
  if (skylineL.position.z < -120) skylineL.position.z += 240;
  if (skylineR.position.z < -120) skylineR.position.z += 240;

  // Recycle tiles
  for (const tile of tilePool) {
    if (tile.position.z < -TILE_LEN - DESPAWN_BEHIND) {
      // find max z and put behind it
      let maxZ = -Infinity;
      for (const o of tilePool) maxZ = Math.max(maxZ, o.position.z);
      tile.position.z = maxZ + TILE_LEN;
      clearTileDynamic(tile);
      populateTile(tile, tile.position.z);
    }
  }

  // Power-up timers
  for (const kind of Object.keys(gameState.powerups)) {
    if (gameState.powerups[kind] > 0) gameState.powerups[kind] -= dt;
    if (gameState.powerups[kind] < 0) gameState.powerups[kind] = 0;
  }
  if (gameState.powerups.multiplier <= 0 && gameState.multiplier !== 1) {
    gameState.multiplier = 1;
    HUD.multiplier.classList.remove('show');
  }
  updatePowerupPills(dt);

  // Speed boost trail
  if (gameState.powerups.speed > 0 && Math.random() < 0.6) spawnTrail();

  // Camera follow with subtle shake on impact
  const camTarget = new THREE.Vector3(player.position.x * 0.3, 6.2 + (playerState.y > 1 ? 1 : 0), player.position.z - 9);
  camera.position.lerp(camTarget, Math.min(1, 4 * dt));
  if (cameraShake.t > 0) {
    cameraShake.t -= dt;
    const a = cameraShake.amp * Math.max(0, cameraShake.t / 0.55);
    camera.position.x += (Math.random() - 0.5) * a * 2;
    camera.position.y += (Math.random() - 0.5) * a * 1.4;
  }
  camera.lookAt(player.position.x * 0.2, 2 + player.position.y * 0.5, player.position.z + 8);

  // Speed blur visual
  if (playerState.speed > 30) HUD.speedBlur.classList.add('active');
  else HUD.speedBlur.classList.remove('active');

  if (playerState.alive) handleCollisions(dt);

  updateHUD();
}

requestAnimationFrame(tick);
