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

// Lighting
scene.add(new THREE.AmbientLight(0xfff4e8, 0.6));
const key = new THREE.DirectionalLight(0xfff0dd, 2.2);
key.position.set(4, 6, 6); key.castShadow = true;
key.shadow.mapSize.set(512, 512); key.shadow.radius = 4;
scene.add(key);
const fill = new THREE.DirectionalLight(0xffd4a0, 0.5);
fill.position.set(-4, 2, 3); scene.add(fill);
const rim = new THREE.DirectionalLight(0xff6600, 1.0);
rim.position.set(0, -5, -4); scene.add(rim);
const back = new THREE.DirectionalLight(0x4488ff, 0.25);
back.position.set(0, 3, -6); scene.add(back);

// Mood light — changes color by emotion
const moodLight = new THREE.PointLight(0xffffff, 0, 3);
moodLight.position.set(0, 1, 2);
scene.add(moodLight);

const S = 0.32, D = 0.9;

const bodyMat  = new THREE.MeshStandardMaterial({ color: 0xFF6B1A, roughness: 0.35, metalness: 0.2 });
const darkMat  = new THREE.MeshStandardMaterial({ color: 0xCC3D00, roughness: 0.45, metalness: 0.15 });
const eyeMat   = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.0, emissive: 0xdddddd, emissiveIntensity: 0.1 });
const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.05, metalness: 0.3 });
const screenMat= new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.3, metalness: 0.4, emissive: 0x0a0a1a, emissiveIntensity: 0.5 });
const glowMat  = new THREE.MeshStandardMaterial({ color: 0x00ccff, roughness: 0.3, emissive: 0x0066aa, emissiveIntensity: 0.8 });
const mouthMat = new THREE.MeshStandardMaterial({ color: 0x3a1500, roughness: 0.6 });

function b(w, h, mat, x=0, y=0, depth=D) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w*S, h*S, depth), mat);
  m.position.set(x*S, y*S, 0);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

const robot = new THREE.Group();
scene.add(robot);

robot.add(b(7, 5, bodyMat, 0, 0));
const panelH = new THREE.Mesh(new THREE.BoxGeometry(5.5*S, 0.08*S, 0.05), darkMat);
panelH.position.set(0, -0.5*S, D*0.5+0.01); robot.add(panelH);

robot.add(b(1, 3, bodyMat, -4, 1));
robot.add(b(1, 3, bodyMat,  4, 1));

const earDots = [];
[-4, 4].forEach(ex => {
  const dot = new THREE.Mesh(new THREE.BoxGeometry(0.4*S, 0.4*S, 0.06), glowMat.clone());
  dot.position.set(ex*S, 1.5*S, D*0.5+0.02);
  robot.add(dot); earDots.push(dot);
});

robot.add(b(2, 2, bodyMat, -1.5, -3.5));
robot.add(b(2, 2, bodyMat,  1.5, -3.5));
[-1.5, 1.5].forEach(lx => {
  const trim = new THREE.Mesh(new THREE.BoxGeometry(2*S, 0.3*S, D+0.02), darkMat);
  trim.position.set(lx*S, -4.35*S, 0); robot.add(trim);
});

const antennaStem = new THREE.Mesh(new THREE.BoxGeometry(0.3*S, 1.2*S, 0.3*S), darkMat);
antennaStem.position.set(0, 3.1*S, 0); antennaStem.castShadow = true; robot.add(antennaStem);
const antennaBall = new THREE.Mesh(new THREE.SphereGeometry(0.22*S, 8, 8), glowMat.clone());
antennaBall.position.set(0, 3.85*S, 0); robot.add(antennaBall);

const chestScreen = new THREE.Mesh(new THREE.BoxGeometry(3*S, 1.2*S, 0.12), screenMat);
chestScreen.position.set(0, -0.9*S, D*0.5+0.01); robot.add(chestScreen);
const scanline = new THREE.Mesh(new THREE.BoxGeometry(2.6*S, 0.15*S, 0.04), glowMat.clone());
scanline.position.set(0, -0.9*S, D*0.5+0.06); robot.add(scanline);

const mouth = new THREE.Mesh(new THREE.BoxGeometry(2.2*S, 0.28*S, 0.1), mouthMat);
mouth.position.set(0, -1.6*S, D*0.5+0.01); robot.add(mouth);
[-1, 1].forEach(mx => {
  const corner = new THREE.Mesh(new THREE.BoxGeometry(0.28*S, 0.28*S, 0.1), darkMat);
  corner.position.set(mx*1.25*S, -1.6*S, D*0.5+0.01); robot.add(corner);
});

const eyeL = new THREE.Mesh(new THREE.BoxGeometry(1.6*S, 1.6*S, D*0.2), eyeMat);
eyeL.position.set(-1.8*S, 0.8*S, D*0.5+0.01); robot.add(eyeL);
const eyeR = new THREE.Mesh(new THREE.BoxGeometry(1.6*S, 1.6*S, D*0.2), eyeMat);
eyeR.position.set(1.8*S, 0.8*S, D*0.5+0.01); robot.add(eyeR);

const pupilL = new THREE.Mesh(new THREE.BoxGeometry(0.75*S, 0.75*S, D*0.08), pupilMat);
pupilL.position.set(-1.8*S, 0.8*S, D*0.5+0.05); robot.add(pupilL);
const pupilR = new THREE.Mesh(new THREE.BoxGeometry(0.75*S, 0.75*S, D*0.08), pupilMat);
pupilR.position.set(1.8*S, 0.8*S, D*0.5+0.05); robot.add(pupilR);

const shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(8,8), new THREE.ShadowMaterial({ opacity: 0.25 }));
shadowMesh.rotation.x = -Math.PI / 2;
shadowMesh.position.y = -5 * S;
shadowMesh.receiveShadow = true;
scene.add(shadowMesh);

// --- Mouse tracking ---
const EYE_X = 150, EYE_Y = 310, TRACK_RADIUS = 180;
const mouse = new THREE.Vector2(0, 0);
const pupilCur = new THREE.Vector2(0, 0);
const MAX_PUPIL = 0.38 * S;
document.addEventListener('mousemove', e => {
  mouse.x =  (e.clientX - EYE_X) / TRACK_RADIUS;
  mouse.y = -(e.clientY - EYE_Y) / TRACK_RADIUS;
});

// --- Drag to reposition ---
let dragging = false, dragOffX = 0, dragOffY = 0;
wrap.addEventListener('mousedown', e => {
  dragging = true;
  dragOffX = e.screenX - window.screenX;
  dragOffY = e.screenY - window.screenY;
  if (window.electron) window.electron.setIgnoreMouse(false);
});
document.addEventListener('mousemove', e => {
  if (!dragging) return;
  const nx = e.screenX - dragOffX;
  const ny = e.screenY - dragOffY;
  if (window.electron) window.electron.moveWindow(nx, ny);
});
document.addEventListener('mouseup', () => { dragging = false; });

// --- Blink ---
let blinkScale = 1, blinking = false;
function triggerBlink() {
  if (blinking) return; blinking = true;
  const dur = 120, start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / dur, 1);
    blinkScale = p < 0.5 ? 1 - p*2 : (p-0.5)*2;
    if (p < 1) requestAnimationFrame(step);
    else { blinkScale = 1; blinking = false; }
  }
  requestAnimationFrame(step);
}
function scheduleBlink() {
  setTimeout(() => { triggerBlink(); scheduleBlink(); }, 3000 + Math.random() * 3000);
}
scheduleBlink();

// --- Mood system ---
// mood: idle | happy | excited | thinking | working | concerned | question
let mood = 'idle';
let moodT = 0;

const MOOD_COLORS = {
  idle:      new THREE.Color(0x0066aa),
  happy:     new THREE.Color(0x00cc44),
  excited:   new THREE.Color(0xffaa00),
  thinking:  new THREE.Color(0x8844ff),
  working:   new THREE.Color(0x0099ff),
  concerned: new THREE.Color(0xff4400),
  question:  new THREE.Color(0xffdd00),
};

const MOOD_GLOW_INTENSITY = {
  idle: 0, happy: 1.2, excited: 2.0, thinking: 1.0, working: 0.8, concerned: 1.5, question: 1.2,
};

export function setMood(m) {
  mood = m; moodT = 0;
  // Blink on mood change
  triggerBlink();
}

// Map Claude Code states to moods
export function setClaudeState(type) {
  if (type === 'thinking') setMood('thinking');
  else if (type === 'working') setMood('working');
  else if (type === 'question') setMood('question');
  else if (type === 'idle') setMood('idle');
}

// Legacy export
let state = 'idle', talkT = 0;
export function setState(s) {
  state = s; talkT = 0;
  if (s === 'talking') setMood('happy');
  else if (s === 'thinking') setMood('thinking');
  else setMood('idle');
}

const clock = new THREE.Clock();
const curGlowColor = new THREE.Color(0x0066aa);

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  moodT += 0.016;

  // Lerp mood light color
  const targetColor = MOOD_COLORS[mood] || MOOD_COLORS.idle;
  curGlowColor.lerp(targetColor, 0.05);
  moodLight.color.copy(curGlowColor);
  moodLight.intensity = THREE.MathUtils.lerp(moodLight.intensity, MOOD_GLOW_INTENSITY[mood] || 0, 0.05);

  // Mood-based antenna + ear glow color
  const glowHex = curGlowColor.getHex();
  antennaBall.material.color.set(glowHex);
  antennaBall.material.emissive.set(glowHex);
  earDots.forEach(d => { d.material.color.set(glowHex); d.material.emissive.set(glowHex); });
  scanline.material.color.set(glowHex); scanline.material.emissive.set(glowHex);

  // Bob — faster when excited
  const bobSpeed = mood === 'excited' ? 2.8 : mood === 'happy' ? 2.0 : 1.4;
  const bobAmp   = mood === 'excited' ? 0.18 : 0.08;
  const bobY = Math.sin(t * bobSpeed) * bobAmp;
  robot.position.y = bobY;
  // Notify bag to follow — convert Three.js units to pixels (approx 40px per unit at this camera)
  document.dispatchEvent(new CustomEvent('robot-bob', { detail: Math.round(bobY * -40) }));

  // Antenna pulse — frantic when working
  const antennaSpeed = mood === 'working' ? 6 : mood === 'thinking' ? 4 : 2.5;
  antennaBall.material.emissiveIntensity = 0.5 + Math.sin(t * antennaSpeed) * 0.4;

  // Scanline
  scanline.position.y = -0.9*S + Math.sin(t * 1.8) * 0.3*S;
  scanline.material.emissiveIntensity = 0.5 + Math.sin(t * 3) * 0.3;

  // Ear dots
  earDots.forEach((d, i) => { d.material.emissiveIntensity = 0.5 + Math.sin(t * 1.5 + i) * 0.4; });

  // Mouth scale — smile when happy/excited, neutral otherwise
  const targetMouthScaleX = (mood === 'happy' || mood === 'excited') ? 1.15 : (mood === 'concerned') ? 0.7 : 1.0;
  mouth.scale.x += (targetMouthScaleX - mouth.scale.x) * 0.08;
  // Mouth Y position — slight smile curve effect
  const targetMouthY = (mood === 'happy' || mood === 'excited') ? -1.5*S : (mood === 'concerned') ? -1.7*S : -1.6*S;
  mouth.position.y += (targetMouthY - mouth.position.y) * 0.08;

  // Pupils
  const tx = Math.max(-MAX_PUPIL, Math.min(MAX_PUPIL, mouse.x * MAX_PUPIL));
  const ty = Math.max(-MAX_PUPIL, Math.min(MAX_PUPIL, mouse.y * MAX_PUPIL));
  pupilCur.x += (tx - pupilCur.x) * 0.12;
  pupilCur.y += (ty - pupilCur.y) * 0.12;

  // Wide eyes when excited/question, squint when thinking
  const eyeTargetScale = mood === 'excited' || mood === 'question' ? 1.2 : mood === 'thinking' ? 0.6 : 1.0;
  eyeL.scale.y += (eyeTargetScale * blinkScale - eyeL.scale.y) * 0.1;
  eyeR.scale.y += (eyeTargetScale * blinkScale - eyeR.scale.y) * 0.1;
  pupilL.scale.y = eyeL.scale.y;
  pupilR.scale.y = eyeR.scale.y;

  pupilL.position.set(-1.8*S + pupilCur.x, 0.8*S + pupilCur.y, D*0.5+0.05);
  pupilR.position.set( 1.8*S + pupilCur.x, 0.8*S + pupilCur.y, D*0.5+0.05);

  // Body rotation by mood/state
  if (mood === 'idle') {
    robot.rotation.y = Math.sin(t * 0.3) * 0.1 + mouse.x * 0.14;
    robot.rotation.x = -mouse.y * 0.06 - 0.02;
    robot.rotation.z += (0 - robot.rotation.z) * 0.05;
  } else if (mood === 'thinking') {
    // Tilt head — looking up and to the side
    robot.rotation.z = Math.sin(t * 1.2) * 0.07 - 0.12;
    robot.rotation.y = -0.25;
    robot.rotation.x = -0.1;
  } else if (mood === 'working') {
    // Lean forward, nod
    robot.rotation.x = Math.sin(t * 2) * 0.06 - 0.08;
    robot.rotation.y = Math.sin(t * 1.5) * 0.08;
    robot.rotation.z += (0 - robot.rotation.z) * 0.05;
  } else if (mood === 'excited') {
    talkT += 0.15;
    robot.rotation.y = Math.sin(talkT * 3) * 0.18;
    robot.rotation.x = Math.sin(talkT * 2) * 0.08;
    robot.rotation.z = Math.sin(talkT * 2.5) * 0.06;
  } else if (mood === 'happy' || state === 'talking') {
    talkT += 0.12;
    robot.rotation.y = Math.sin(talkT * 2.5) * 0.12;
    robot.rotation.x = Math.sin(talkT * 3.5) * 0.05;
    robot.rotation.z += (0 - robot.rotation.z) * 0.05;
  } else if (mood === 'question') {
    // Tilt head curiously
    robot.rotation.z = Math.sin(t * 0.8) * 0.05 + 0.15;
    robot.rotation.y = mouse.x * 0.1;
    robot.rotation.x = -0.05;
  } else if (mood === 'concerned') {
    robot.rotation.z = Math.sin(t * 1.5) * 0.04 - 0.1;
    robot.rotation.y = 0;
    robot.rotation.x = 0.05;
  }

  renderer.render(scene, camera);
}

animate();

wrap.addEventListener('click', () => document.dispatchEvent(new CustomEvent('robot-click')));

document.addEventListener('set-mood', e => setMood(e.detail));
document.addEventListener('set-claude-state', e => setClaudeState(e.detail));
