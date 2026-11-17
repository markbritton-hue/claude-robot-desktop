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

// Darker orange
const S = 0.32; // scale — 1 pixel unit in the logo
const D = 0.9;  // depth (Z thickness)

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

// Logo shape mapped to pixel grid (body = 7w x 5h, centered at 0,0)
// Body center at origin → x: -3.5 to 3.5, y: -2.5 to 2.5

// Main body: 7 wide x 5 tall
robot.add(b(7, 5, bodyMat, 0, 0));

// Left ear
robot.add(b(1, 3, bodyMat, -4, 1));

// Right ear
robot.add(b(1, 3, bodyMat, 4, 1));

// Left leg
robot.add(b(2, 2, bodyMat, -1.5, -3.5));

// Right leg
robot.add(b(2, 2, bodyMat, 1.5, -3.5));

// White eye sclera
const eyeL = new THREE.Mesh(new THREE.BoxGeometry(1.5*S, 1.5*S, D*0.2), eyeMat);
eyeL.position.set(-1.8*S, 0.8*S, D*0.5 + 0.01);
robot.add(eyeL);

const eyeR = new THREE.Mesh(new THREE.BoxGeometry(1.5*S, 1.5*S, D*0.2), eyeMat);
eyeR.position.set(1.8*S, 0.8*S, D*0.5 + 0.01);
robot.add(eyeR);

// Black pupils — sit proud of the sclera, track mouse
const pupilL = new THREE.Mesh(new THREE.BoxGeometry(0.7*S, 0.7*S, D*0.05), pupilMat);
pupilL.position.set(-1.8*S, 0.8*S, D*0.5 + 0.04);
robot.add(pupilL);

const pupilR = new THREE.Mesh(new THREE.BoxGeometry(0.7*S, 0.7*S, D*0.05), pupilMat);
pupilR.position.set(1.8*S, 0.8*S, D*0.5 + 0.04);
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

// Mouse tracking — screen coords normalised to [-1, 1]
const mouse = new THREE.Vector2();
document.addEventListener('mousemove', e => {
  mouse.x = (e.clientX / window.screen.width)  * 2 - 1;
  mouse.y = (e.clientY / window.screen.height) * 2 - 1;
});

let state = 'idle';
let talkT = 0;
const clock = new THREE.Clock();
export function setState(s) { state = s; talkT = 0; }

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  robot.position.y = Math.sin(t * 1.4) * 0.08;

  // Pupils follow cursor within the white sclera
  const px = Math.max(-0.3, Math.min(0.3,  mouse.x * 0.4)) * S;
  const py = Math.max(-0.3, Math.min(0.3, -mouse.y * 0.4)) * S;
  pupilL.position.set(-1.8*S + px, 0.8*S + py, D*0.5 + 0.04);
  pupilR.position.set( 1.8*S + px, 0.8*S + py, D*0.5 + 0.04);

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
