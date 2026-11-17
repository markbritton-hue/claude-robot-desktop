import * as THREE from '../node_modules/three/build/three.module.js';

const wrap = document.getElementById('three-canvas');
const W = 300, H = 300;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(W, H);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
wrap.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 100);
camera.position.set(0, 0, 7);
camera.lookAt(0, 0, 0);

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 1.8);
key.position.set(4, 5, 6);
key.castShadow = true;
scene.add(key);
const fill = new THREE.DirectionalLight(0xffddcc, 0.4);
fill.position.set(-3, 2, 3);
scene.add(fill);
const rim = new THREE.DirectionalLight(0x661100, 0.8);
rim.position.set(0, -4, -3);
scene.add(rim);

const S = 0.32;
const D = 0.9;

const bodyMat  = new THREE.MeshStandardMaterial({ color: 0xB85530, roughness: 0.5, metalness: 0.05 });
const eyeMat   = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.0 });
const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.0 });

function b(w, h, mat, x=0, y=0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, D), mat);
  m.position.set(x * S, y * S, 0);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const robot = new THREE.Group();
scene.add(robot);

robot.add(b(7, 5, bodyMat, 0, 0));
robot.add(b(1, 3, bodyMat, -4, 1)); // left ear
robot.add(b(1, 3, bodyMat,  4, 1)); // right ear
robot.add(b(2, 2, bodyMat, -1.5, -3.5)); // left leg
robot.add(b(2, 2, bodyMat,  1.5, -3.5)); // right leg

// White sclera — slightly larger so pupils have room to roam
const eyeL = new THREE.Mesh(new THREE.BoxGeometry(1.6*S, 1.6*S, D*0.2), eyeMat);
eyeL.position.set(-1.8*S, 0.8*S, D*0.5 + 0.01);
robot.add(eyeL);

const eyeR = new THREE.Mesh(new THREE.BoxGeometry(1.6*S, 1.6*S, D*0.2), eyeMat);
eyeR.position.set(1.8*S, 0.8*S, D*0.5 + 0.01);
robot.add(eyeR);

// Pupils — bigger, sit proud of sclera
const pupilL = new THREE.Mesh(new THREE.BoxGeometry(0.75*S, 0.75*S, D*0.08), pupilMat);
pupilL.position.set(-1.8*S, 0.8*S, D*0.5 + 0.05);
robot.add(pupilL);

const pupilR = new THREE.Mesh(new THREE.BoxGeometry(0.75*S, 0.75*S, D*0.08), pupilMat);
pupilR.position.set(1.8*S, 0.8*S, D*0.5 + 0.05);
robot.add(pupilR);

// Shadow
const shadowMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 8),
  new THREE.ShadowMaterial({ opacity: 0.2 })
);
shadowMesh.rotation.x = -Math.PI / 2;
shadowMesh.position.y = -5 * S;
shadowMesh.receiveShadow = true;
scene.add(shadowMesh);

// Mouse — track relative to the window, centred on where the eyes sit
// Window is 300x500; robot canvas is bottom 300px; eye centre ≈ (150, 310) from top of window
const EYE_X = 150;
const EYE_Y = 310;
const TRACK_RADIUS = 180; // pixels of mouse travel = full pupil deflection

const mouse    = new THREE.Vector2(0, 0); // raw normalised [-1,1]
const pupilTarget = new THREE.Vector2(0, 0); // smoothed target in scene units
const pupilCur    = new THREE.Vector2(0, 0); // current interpolated position

document.addEventListener('mousemove', e => {
  mouse.x =  (e.clientX - EYE_X) / TRACK_RADIUS;
  mouse.y = -(e.clientY - EYE_Y) / TRACK_RADIUS;
});

// Max travel so pupil stays inside sclera: (sclera - pupil) / 2 → (1.6-0.75)/2 * S ≈ 0.136
const MAX_PUPIL = 0.38 * S;

// --- Blink ---
let blinkScale = 1;
let blinking = false;

function triggerBlink() {
  if (blinking) return;
  blinking = true;
  const dur = 120;
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / dur, 1);
    // squash Y: down then back up
    blinkScale = p < 0.5 ? 1 - p * 2 : (p - 0.5) * 2;
    if (p < 1) requestAnimationFrame(step);
    else { blinkScale = 1; blinking = false; }
  }
  requestAnimationFrame(step);
}

// Blink every 3-6 seconds
function scheduleBlink() {
  setTimeout(() => { triggerBlink(); scheduleBlink(); }, 3000 + Math.random() * 3000);
}
scheduleBlink();

let state = 'idle';
let talkT = 0;
const clock = new THREE.Clock();
export function setState(s) { state = s; talkT = 0; }

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  // Bob
  robot.position.y = Math.sin(t * 1.4) * 0.08;

  // Smooth pupil lerp — snappy but not instant
  const tx = Math.max(-MAX_PUPIL, Math.min(MAX_PUPIL, mouse.x * MAX_PUPIL));
  const ty = Math.max(-MAX_PUPIL, Math.min(MAX_PUPIL, mouse.y * MAX_PUPIL));
  pupilCur.x += (tx - pupilCur.x) * 0.12;
  pupilCur.y += (ty - pupilCur.y) * 0.12;

  // Apply blink scale to sclera and pupil Y
  eyeL.scale.y = blinkScale;
  eyeR.scale.y = blinkScale;
  pupilL.scale.y = blinkScale;
  pupilR.scale.y = blinkScale;

  pupilL.position.set(-1.8*S + pupilCur.x, 0.8*S + pupilCur.y, D*0.5 + 0.05);
  pupilR.position.set( 1.8*S + pupilCur.x, 0.8*S + pupilCur.y, D*0.5 + 0.05);

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
