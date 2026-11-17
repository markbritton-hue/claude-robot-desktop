import * as THREE from '../node_modules/three/build/three.module.js';

const wrap = document.getElementById('three-canvas');
const W = 300, H = 300;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(W, H);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
wrap.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 100);
camera.position.set(0, 0, 7);
camera.lookAt(0, 0, 0);

// Richer lighting
scene.add(new THREE.AmbientLight(0xfff4e8, 0.6));

const key = new THREE.DirectionalLight(0xfff0dd, 2.2);
key.position.set(4, 6, 6);
key.castShadow = true;
key.shadow.mapSize.set(512, 512);
key.shadow.radius = 4;
scene.add(key);

const fill = new THREE.DirectionalLight(0xffd4a0, 0.5);
fill.position.set(-4, 2, 3);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xff3300, 0.6);
rim.position.set(0, -5, -4);
scene.add(rim);

// Cool blue back light for depth
const back = new THREE.DirectionalLight(0x4488ff, 0.25);
back.position.set(0, 3, -6);
scene.add(back);

const S = 0.32;
const D = 0.9;

// Materials with more character
const bodyMat = new THREE.MeshStandardMaterial({
  color: 0xC05828, roughness: 0.4, metalness: 0.15,
  envMapIntensity: 1.0,
});
const darkMat = new THREE.MeshStandardMaterial({
  color: 0x7A3010, roughness: 0.5, metalness: 0.1,
});
const eyeMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, roughness: 0.1, metalness: 0.0,
  emissive: 0xdddddd, emissiveIntensity: 0.1,
});
const pupilMat = new THREE.MeshStandardMaterial({
  color: 0x111111, roughness: 0.05, metalness: 0.3,
});
const screenMat = new THREE.MeshStandardMaterial({
  color: 0x1a1a2e, roughness: 0.3, metalness: 0.4,
  emissive: 0x0a0a1a, emissiveIntensity: 0.5,
});
const glowMat = new THREE.MeshStandardMaterial({
  color: 0x00ccff, roughness: 0.3, metalness: 0.0,
  emissive: 0x0066aa, emissiveIntensity: 0.8,
});
const mouthMat = new THREE.MeshStandardMaterial({
  color: 0x3a1500, roughness: 0.6, metalness: 0.0,
});

function b(w, h, mat, x=0, y=0, depth=D) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, depth), mat);
  m.position.set(x * S, y * S, 0);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const robot = new THREE.Group();
scene.add(robot);

// --- Body ---
robot.add(b(7, 5, bodyMat, 0, 0));

// Subtle panel lines — thin dark strips on body face
const panelH = new THREE.Mesh(new THREE.BoxGeometry(5.5*S, 0.08*S, 0.05), darkMat);
panelH.position.set(0, -0.5*S, D*0.5+0.01);
robot.add(panelH);

// --- Ears ---
robot.add(b(1, 3, bodyMat, -4, 1));
robot.add(b(1, 3, bodyMat,  4, 1));

// Ear accent dots (small glowing circles on ears)
[-4, 4].forEach(ex => {
  const dot = new THREE.Mesh(new THREE.BoxGeometry(0.4*S, 0.4*S, 0.06), glowMat);
  dot.position.set(ex*S, 1.5*S, D*0.5+0.02);
  robot.add(dot);
});

// --- Legs ---
robot.add(b(2, 2, bodyMat, -1.5, -3.5));
robot.add(b(2, 2, bodyMat,  1.5, -3.5));

// Leg bottom trim (darker band)
[-1.5, 1.5].forEach(lx => {
  const trim = new THREE.Mesh(new THREE.BoxGeometry(2*S, 0.3*S, D+0.02), darkMat);
  trim.position.set(lx*S, -4.35*S, 0);
  robot.add(trim);
});

// --- Antenna ---
const antennaStem = new THREE.Mesh(new THREE.BoxGeometry(0.3*S, 1.2*S, 0.3*S), darkMat);
antennaStem.position.set(0, 3.1*S, 0);
antennaStem.castShadow = true;
robot.add(antennaStem);

const antennaBall = new THREE.Mesh(new THREE.SphereGeometry(0.22*S, 8, 8), glowMat);
antennaBall.position.set(0, 3.85*S, 0);
robot.add(antennaBall);

// --- Chest screen ---
const chestScreen = new THREE.Mesh(new THREE.BoxGeometry(3*S, 1.2*S, 0.12), screenMat);
chestScreen.position.set(0, -0.9*S, D*0.5+0.01);
robot.add(chestScreen);

// Screen scanline glow
const scanline = new THREE.Mesh(new THREE.BoxGeometry(2.6*S, 0.15*S, 0.04), glowMat);
scanline.position.set(0, -0.9*S, D*0.5+0.06);
robot.add(scanline);

// --- Mouth ---
const mouth = new THREE.Mesh(new THREE.BoxGeometry(2.2*S, 0.28*S, 0.1), mouthMat);
mouth.position.set(0, -1.6*S, D*0.5+0.01);
robot.add(mouth);

// Mouth corner accents
[-1, 1].forEach(mx => {
  const corner = new THREE.Mesh(new THREE.BoxGeometry(0.28*S, 0.28*S, 0.1), darkMat);
  corner.position.set(mx * 1.25*S, -1.6*S, D*0.5+0.01);
  robot.add(corner);
});

// --- Eyes ---
const eyeL = new THREE.Mesh(new THREE.BoxGeometry(1.6*S, 1.6*S, D*0.2), eyeMat);
eyeL.position.set(-1.8*S, 0.8*S, D*0.5+0.01);
robot.add(eyeL);

const eyeR = new THREE.Mesh(new THREE.BoxGeometry(1.6*S, 1.6*S, D*0.2), eyeMat);
eyeR.position.set(1.8*S, 0.8*S, D*0.5+0.01);
robot.add(eyeR);

// Pupils
const pupilL = new THREE.Mesh(new THREE.BoxGeometry(0.75*S, 0.75*S, D*0.08), pupilMat);
pupilL.position.set(-1.8*S, 0.8*S, D*0.5+0.05);
robot.add(pupilL);

const pupilR = new THREE.Mesh(new THREE.BoxGeometry(0.75*S, 0.75*S, D*0.08), pupilMat);
pupilR.position.set(1.8*S, 0.8*S, D*0.5+0.05);
robot.add(pupilR);

// --- Shadow ---
const shadowMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 8),
  new THREE.ShadowMaterial({ opacity: 0.25 })
);
shadowMesh.rotation.x = -Math.PI / 2;
shadowMesh.position.y = -5*S;
shadowMesh.receiveShadow = true;
scene.add(shadowMesh);

// --- Mouse tracking ---
const EYE_X = 150, EYE_Y = 310, TRACK_RADIUS = 180;
const mouse    = new THREE.Vector2(0, 0);
const pupilCur = new THREE.Vector2(0, 0);
const MAX_PUPIL = 0.38 * S;

document.addEventListener('mousemove', e => {
  mouse.x =  (e.clientX - EYE_X) / TRACK_RADIUS;
  mouse.y = -(e.clientY - EYE_Y) / TRACK_RADIUS;
});

// --- Blink ---
let blinkScale = 1, blinking = false;

function triggerBlink() {
  if (blinking) return;
  blinking = true;
  const dur = 120, start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / dur, 1);
    blinkScale = p < 0.5 ? 1 - p * 2 : (p - 0.5) * 2;
    if (p < 1) requestAnimationFrame(step);
    else { blinkScale = 1; blinking = false; }
  }
  requestAnimationFrame(step);
}
function scheduleBlink() {
  setTimeout(() => { triggerBlink(); scheduleBlink(); }, 3000 + Math.random() * 3000);
}
scheduleBlink();

// --- Scanline animation ---
let scanDir = 1;

let state = 'idle';
let talkT = 0;
const clock = new THREE.Clock();
export function setState(s) { state = s; talkT = 0; }

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  // Bob
  robot.position.y = Math.sin(t * 1.4) * 0.08;

  // Antenna ball pulse
  antennaBall.material.emissiveIntensity = 0.5 + Math.sin(t * 2.5) * 0.4;

  // Scanline sweep across chest screen
  scanline.position.y = -0.9*S + Math.sin(t * 1.8) * 0.3*S;
  scanline.material.emissiveIntensity = 0.5 + Math.sin(t * 3) * 0.3;

  // Ear dot pulse (slow, offset)
  robot.children.filter(c => c.material === glowMat && c !== antennaBall && c !== scanline)
    .forEach((dot, i) => { dot.material.emissiveIntensity = 0.5 + Math.sin(t * 1.5 + i) * 0.4; });

  // Smooth pupil lerp
  const tx = Math.max(-MAX_PUPIL, Math.min(MAX_PUPIL, mouse.x * MAX_PUPIL));
  const ty = Math.max(-MAX_PUPIL, Math.min(MAX_PUPIL, mouse.y * MAX_PUPIL));
  pupilCur.x += (tx - pupilCur.x) * 0.12;
  pupilCur.y += (ty - pupilCur.y) * 0.12;

  // Blink
  eyeL.scale.y  = blinkScale; eyeR.scale.y  = blinkScale;
  pupilL.scale.y = blinkScale; pupilR.scale.y = blinkScale;

  pupilL.position.set(-1.8*S + pupilCur.x, 0.8*S + pupilCur.y, D*0.5+0.05);
  pupilR.position.set( 1.8*S + pupilCur.x, 0.8*S + pupilCur.y, D*0.5+0.05);

  if (state === 'idle') {
    robot.rotation.y = Math.sin(t * 0.3) * 0.1 + mouse.x * 0.14;
    robot.rotation.x = -mouse.y * 0.06 - 0.02;
  }
  if (state === 'talking') {
    talkT += 0.12;
    robot.rotation.y = Math.sin(talkT * 2.5) * 0.12;
    robot.rotation.x = Math.sin(talkT * 3.5) * 0.05;
  }
  if (state === 'thinking') {
    robot.rotation.z = Math.sin(t * 1.2) * 0.07 - 0.08;
    robot.rotation.y = -0.2;
  }

  renderer.render(scene, camera);
}

animate();

wrap.addEventListener('click', () => document.dispatchEvent(new CustomEvent('robot-click')));
