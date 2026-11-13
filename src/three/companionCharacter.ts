import * as THREE from 'three';
import type { CompanionAnimState } from '../types/workspace';

export interface CompanionRig {
  root: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  head: THREE.Group;
  irisL: THREE.Mesh;
  irisR: THREE.Mesh;
  eyelidL: THREE.Mesh;
  eyelidR: THREE.Mesh;
  lashL: THREE.Mesh;
  lashR: THREE.Mesh;
  browL: THREE.Mesh;
  browR: THREE.Mesh;
  mouthClosed: THREE.Mesh;
  mouthOpen: THREE.Mesh;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  wristL: THREE.Group;
  wristR: THREE.Group;
  hairBackGroup: THREE.Group;
  braidL: THREE.Group;
  braidR: THREE.Group;
  skirtLeft: THREE.Group;
  skirtRight: THREE.Group;
  toolGroup: THREE.Group;
  thoughtGroup: THREE.Group;
  talkRing: THREE.Mesh;
  dispose: () => void;
}

/**
 * Smooth 4-stop anime cel-shading gradient map for silky figurine/VRM rendering
 * without harsh plastic specular blobs.
 */
function createAnimeToonGradient(): THREE.DataTexture {
  const stops = new Uint8Array([
    172, 175, 194, 255, // soft cool shadow
    210, 212, 224, 255, // mid-shadow transition
    240, 241, 246, 255, // lit pastel midtone
    255, 255, 255, 255, // crisp studio highlight
  ]);
  const tex = new THREE.DataTexture(stops, 4, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function createSkinTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Smooth warm porcelain base matching anime VRM skin
  ctx.fillStyle = '#fff1eb';
  ctx.fillRect(0, 0, 512, 512);

  // NOTE: On Three.js SphereGeometry, +Z (front of face) maps to u = 0.25 (x = 128 on 512px canvas)!
  const drawBlush = (cx: number, cy: number) => {
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 28);
    grad.addColorStop(0, 'rgba(244, 128, 148, 0.34)');
    grad.addColorStop(0.55, 'rgba(244, 128, 148, 0.14)');
    grad.addColorStop(1, 'rgba(244, 128, 148, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 28, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  drawBlush(98, 286);
  drawBlush(158, 286);

  // Delicate soft anime nose blush highlight right at u = 0.25 (x = 128)
  const noseGrad = ctx.createRadialGradient(128, 284, 1, 128, 284, 10);
  noseGrad.addColorStop(0, 'rgba(232, 148, 148, 0.26)');
  noseGrad.addColorStop(1, 'rgba(232, 148, 148, 0)');
  ctx.fillStyle = noseGrad;
  ctx.beginPath();
  ctx.arc(128, 284, 10, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates an almond-shaped anime sclera texture with soft upper-lid drop shadow
 * and transparent exterior cutout so eyes sit cleanly inside the face contour.
 */
function createAlmondScleraTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 192);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(22, 102);
  ctx.bezierCurveTo(62, 30, 194, 28, 234, 96);
  ctx.bezierCurveTo(206, 154, 62, 156, 22, 102);
  ctx.closePath();
  ctx.clip();

  // Clean soft porcelain-white sclera
  const baseGrad = ctx.createLinearGradient(0, 28, 0, 156);
  baseGrad.addColorStop(0, '#cfd4ea');
  baseGrad.addColorStop(0.28, '#f5f6fc');
  baseGrad.addColorStop(0.65, '#ffffff');
  baseGrad.addColorStop(1, '#f4f2fa');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, 256, 192);

  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates crisp upper anime eyelashes, winged outer lash, double-eyelid crease,
 * and subtle lower lash edge framing the almond eye cleanly.
 */
function createEyelashFrameTexture(isRightEye: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 192);

  ctx.save();
  if (isRightEye) {
    // Mirror horizontally so outer wing always sweeps outward
    ctx.translate(256, 0);
    ctx.scale(-1, 1);
  }

  // Subtle double-eyelid crease above main lash
  ctx.strokeStyle = 'rgba(138, 108, 128, 0.45)';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(52, 54);
  ctx.bezierCurveTo(110, 22, 178, 26, 220, 60);
  ctx.stroke();

  // Thick, silky dark-plum upper lash arch with winged outer flare (on x=22 side = outer corner)
  ctx.fillStyle = '#251a3a';
  ctx.beginPath();
  ctx.moveTo(10, 92);
  ctx.bezierCurveTo(48, 30, 186, 24, 236, 94);
  ctx.bezierCurveTo(192, 46, 62, 48, 24, 102);
  ctx.lineTo(10, 92);
  ctx.closePath();
  ctx.fill();

  // Outer wing lash wisps
  ctx.strokeStyle = '#251a3a';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(28, 76);
  ctx.quadraticCurveTo(14, 68, 6, 58);
  ctx.stroke();

  // Delicate lower lash rim
  ctx.strokeStyle = 'rgba(64, 46, 90, 0.42)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(64, 146);
  ctx.quadraticCurveTo(132, 156, 198, 140);
  ctx.stroke();

  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createVioletIrisTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);

  // Soft outer limbal ring
  ctx.beginPath();
  ctx.ellipse(128, 128, 106, 118, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#260b4d';
  ctx.fill();
  ctx.save();
  ctx.clip();

  // Rich luminous anime violet-to-lavender vertical gradient
  const grad = ctx.createLinearGradient(0, 12, 0, 244);
  grad.addColorStop(0, '#230847');
  grad.addColorStop(0.28, '#531cb3');
  grad.addColorStop(0.62, '#8b5cf6');
  grad.addColorStop(0.86, '#ddd6fe');
  grad.addColorStop(1, '#faf5ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Radial iris striations
  ctx.save();
  ctx.translate(128, 128);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(35,8,71,0.22)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 32, Math.sin(a) * 36);
    ctx.lineTo(Math.cos(a) * 102, Math.sin(a) * 112);
    ctx.stroke();
  }
  ctx.restore();

  // Deep centered anime pupil
  ctx.fillStyle = '#180436';
  ctx.beginPath();
  ctx.ellipse(128, 120, 32, 42, 0, 0, Math.PI * 2);
  ctx.fill();

  // Luminous lower crescent reflection
  ctx.fillStyle = 'rgba(248, 245, 255, 0.72)';
  ctx.beginPath();
  ctx.ellipse(128, 198, 56, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Upper eyelid shadow arc
  const lidShadow = ctx.createLinearGradient(0, 0, 0, 102);
  lidShadow.addColorStop(0, 'rgba(26, 8, 56, 0.78)');
  lidShadow.addColorStop(1, 'rgba(26, 8, 56, 0)');
  ctx.fillStyle = lidShadow;
  ctx.fillRect(0, 0, 256, 102);

  // Crisp anime specular catchlights (painted directly so no harsh Three.js glare blob!)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(84, 84, 21, 18, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(170, 170, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(166, 76, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Silky silver-white hair strand texture with subtle root-to-tip lavender shading
 * and a soft horizontal anime "angel ring" sheen band.
 */
function createHairTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const base = ctx.createLinearGradient(0, 0, 0, 512);
  base.addColorStop(0, '#dfe4f5');
  base.addColorStop(0.22, '#f1f4fc');
  base.addColorStop(0.32, '#ffffff'); // anime angel-ring sheen highlight
  base.addColorStop(0.42, '#eef2fb');
  base.addColorStop(0.82, '#e2e7f7');
  base.addColorStop(1, '#cfd7ef');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 512);

  // Fine vertical hair fiber striations
  for (let x = 0; x < 256; x += 4) {
    ctx.fillStyle = x % 8 === 0 ? 'rgba(182, 192, 224, 0.16)' : 'rgba(255, 255, 255, 0.28)';
    ctx.fillRect(x, 0, 2, 512);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Soft fine-gauge slate-grey knit texture (low contrast so there is zero optical moiré).
 */
function createRibbedFabricTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#6c7589';
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 8) {
    ctx.fillStyle = x % 16 === 0 ? '#636c80' : '#747e92';
    ctx.fillRect(x, 0, 4, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createDressTierTexture(baseHex: string, hemHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, baseHex);
  grad.addColorStop(0.84, baseHex);
  grad.addColorStop(0.95, hemHex);
  grad.addColorStop(1, '#eef4ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRadialShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
  grad.addColorStop(0, 'rgba(68, 78, 108, 0.24)');
  grad.addColorStop(0.55, 'rgba(92, 104, 138, 0.09)');
  grad.addColorStop(1, 'rgba(92, 104, 138, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Builds an appealing, softer anime head silhouette: fuller cheeks, gentle V-jaw taper,
 * delicate chin, and smooth front eye-plane curvature so curved eyes sit flush without bulging.
 */
function createSculptedHeadGeo(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.118, 48, 36);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Fuller anime cheekbones and soft V-chin taper
    if (y < -0.01) {
      const t = THREE.MathUtils.clamp((-y - 0.01) / 0.108, 0, 1);
      const ease = t * t * (3 - 2 * t);
      x *= 1 - ease * 0.36;
      z *= 1 - ease * 0.24;
      y -= ease * 0.008;
    }

    // Subtle soft nose tip right at center lower-mid face (x=0, y=-0.028)
    if (z > 0.04) {
      const noseX = Math.abs(x) / 0.016;
      const noseY = (y + 0.024) / 0.022;
      if (noseX < 1 && Math.abs(noseY) < 1) {
        const w = (1 - noseX) * (1 - Math.abs(noseY));
        z += w * 0.0075;
      }

      // Gently flatten orbital cheek plane so curved almond eyes rest seamlessly flush
      for (const ex of [-0.04, 0.04]) {
        const dx = (x - ex) / 0.032;
        const dy = (y + 0.004) / 0.025;
        const d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          z -= (1 - d2) * 0.007;
        }
      }
    }

    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a shallow spherical-curved quad for anime eye layers so they wrap naturally
 * around the face contour without looking flat or sticking out like spheres.
 */
function createCurvedEyePatchGeo(
  width: number,
  height: number,
  curveDepth = 0.009,
): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, height, 10, 8);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const nx = x / (width * 0.5);
    const ny = y / (height * 0.5);
    const pullBack = (nx * nx * 0.72 + ny * ny * 0.28) * curveDepth;
    pos.setZ(i, -pullBack);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a contoured anime hair ribbon blade with UVs for silky hair strands + angel-ring sheen.
 */
function createSculptedHairBlade(
  points: THREE.Vector3[],
  widthStart: number,
  widthMid: number,
  thickness: number,
  mat: THREE.Material,
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  const steps = 28;
  const ringPts = 8;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const upRef = new THREE.Vector3(0, 0, 1);
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const center = curve.getPointAt(t);
    curve.getTangentAt(t, tangent).normalize();

    normal.crossVectors(tangent, upRef);
    if (normal.lengthSq() < 0.001) {
      normal.set(1, 0, 0);
    } else {
      normal.normalize();
    }
    binormal.crossVectors(normal, tangent).normalize();

    const wProfile =
      t < 0.36
        ? THREE.MathUtils.lerp(widthStart, widthMid, t / 0.36)
        : THREE.MathUtils.lerp(widthMid, widthStart * 0.05, Math.pow((t - 0.36) / 0.64, 1.2));
    const hProfile = thickness * (1 - Math.pow(t, 1.35) * 0.88);

    for (let j = 0; j < ringPts; j++) {
      const a = (j / ringPts) * Math.PI * 2;
      const lx = Math.cos(a) * wProfile;
      const lz = Math.sin(a) * hProfile;
      positions.push(
        center.x + normal.x * lx + binormal.x * lz,
        center.y + normal.y * lx + binormal.y * lz,
        center.z + normal.z * lx + binormal.z * lz,
      );
      uvs.push(j / ringPts, 1 - t);
    }
  }

  for (let i = 0; i < steps; i++) {
    const rowA = i * ringPts;
    const rowB = (i + 1) * ringPts;
    for (let j = 0; j < ringPts; j++) {
      const jNext = (j + 1) % ringPts;
      indices.push(rowA + j, rowB + j, rowA + jNext);
      indices.push(rowA + jNext, rowB + j, rowB + jNext);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

/**
 * Smooth interlocked chevron hair braid (angled teardrop plaits hugging tightly, not pearl spheres).
 */
function createChevronBraid(
  points: THREE.Vector3[],
  widthStart: number,
  widthEnd: number,
  segments: number,
  mat: THREE.Material,
  track: <T extends { dispose: () => void }>(item: T) => T,
): THREE.Group {
  const group = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(points);
  const plaitGeo = track(new THREE.OctahedronGeometry(1, 2));
  const tangent = new THREE.Vector3();

  for (let i = 0; i < segments; i++) {
    const t = i / Math.max(segments - 1, 1);
    const pt = curve.getPointAt(t);
    curve.getTangentAt(t, tangent);
    const w = THREE.MathUtils.lerp(widthStart, widthEnd, t);
    const side = i % 2 === 0 ? -1 : 1;

    const plait = new THREE.Mesh(plaitGeo, mat);
    plait.position.set(pt.x + side * w * 0.24, pt.y, pt.z);
    plait.scale.set(w * 0.92, w * 1.65, w * 0.56);
    plait.rotation.z = side * 0.56;
    plait.castShadow = true;
    group.add(plait);
  }
  return group;
}

function createPleatedSkirtSectionGeo(
  rTop: number,
  rBottom: number,
  height: number,
  thetaStart: number,
  thetaLength: number,
  pleatCount: number,
  pleatDepth: number,
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(
    rTop,
    rBottom,
    height,
    40,
    10,
    true,
    thetaStart,
    thetaLength,
  );
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const vFactor = THREE.MathUtils.clamp((height * 0.5 - y) / height, 0, 1);
    const angle = Math.atan2(x, z);
    const wave = Math.sin(angle * pleatCount) * pleatDepth * vFactor;
    const radial = Math.hypot(x, z) || 1;
    const drape = -Math.pow(vFactor, 2.1) * 0.032;
    const nextR = radial + wave + drape;
    pos.setX(i, (x / radial) * nextR);
    pos.setZ(i, (z / radial) * nextR);
    pos.setY(i, y + Math.cos(angle * pleatCount) * 0.011 * vFactor);
  }
  geo.computeVertexNormals();
  return geo;
}

function createIcePetalGeo(width: number, length: number, thickness: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(-width * 0.58, -length * 0.34, 0, -length);
  shape.quadraticCurveTo(width * 0.58, -length * 0.34, 0, 0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.3,
    bevelSize: width * 0.05,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

function createFlowerBrooch(
  mat: THREE.Material,
  centerMat: THREE.Material,
  scale = 1,
): THREE.Group {
  const group = new THREE.Group();
  const petalGeo = new THREE.SphereGeometry(0.019 * scale, 10, 8);
  petalGeo.scale(0.92, 0.3, 1.45);
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const petal = new THREE.Mesh(petalGeo, mat);
    petal.position.set(
      Math.cos(angle) * 0.013 * scale,
      Math.sin(angle) * 0.013 * scale,
      0,
    );
    petal.rotation.z = angle + Math.PI / 2;
    group.add(petal);
  }
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.0055 * scale, 10, 8),
    centerMat,
  );
  core.scale.set(1, 1, 0.6);
  core.position.z = 0.005 * scale;
  group.add(core);
  return group;
}

export function buildCompanionCharacter(maxAnisotropy = 4): CompanionRig {
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const toonGrad = track(createAnimeToonGradient());
  const skinTex = track(createSkinTexture());
  skinTex.anisotropy = maxAnisotropy;
  const scleraTex = track(createAlmondScleraTexture());
  scleraTex.anisotropy = maxAnisotropy;
  const lashTexL = track(createEyelashFrameTexture(false));
  const lashTexR = track(createEyelashFrameTexture(true));
  const irisTex = track(createVioletIrisTexture());
  irisTex.anisotropy = maxAnisotropy;
  const hairTex = track(createHairTexture());
  hairTex.anisotropy = maxAnisotropy;
  const knitTex = track(createRibbedFabricTexture());
  knitTex.anisotropy = maxAnisotropy;
  const skyTierTex = track(createDressTierTexture('#9ec2f2', '#c8defa'));
  const lavenderTierTex = track(createDressTierTexture('#b6bcf6', '#dcdffd'));
  const shadowTex = track(createRadialShadowTexture());

  const skinMat = track(
    new THREE.MeshToonMaterial({
      color: 0xfff0ea,
      gradientMap: toonGrad,
    }),
  );
  const faceSkinMat = track(
    new THREE.MeshToonMaterial({
      map: skinTex,
      gradientMap: toonGrad,
    }),
  );
  const scleraMat = track(
    new THREE.MeshBasicMaterial({
      map: scleraTex,
      transparent: true,
      alphaTest: 0.08,
    }),
  );
  const irisMat = track(
    new THREE.MeshBasicMaterial({
      map: irisTex,
      transparent: true,
      alphaTest: 0.1,
    }),
  );
  const lashMatL = track(
    new THREE.MeshBasicMaterial({
      map: lashTexL,
      transparent: true,
      alphaTest: 0.05,
    }),
  );
  const lashMatR = track(
    new THREE.MeshBasicMaterial({
      map: lashTexR,
      transparent: true,
      alphaTest: 0.05,
    }),
  );
  const browMat = track(
    new THREE.MeshBasicMaterial({
      color: 0x858eab,
    }),
  );
  const hairMat = track(
    new THREE.MeshToonMaterial({
      map: hairTex,
      gradientMap: toonGrad,
    }),
  );
  const hairShadowMat = track(
    new THREE.MeshToonMaterial({
      color: 0xdfe4f4,
      gradientMap: toonGrad,
    }),
  );
  const skyDressMat = track(
    new THREE.MeshToonMaterial({
      map: skyTierTex,
      gradientMap: toonGrad,
      side: THREE.DoubleSide,
    }),
  );
  const skyPanelMat = track(
    new THREE.MeshToonMaterial({
      color: 0xa2c4f3,
      gradientMap: toonGrad,
      side: THREE.DoubleSide,
    }),
  );
  const icePetalMat = track(
    new THREE.MeshToonMaterial({
      color: 0xcbe0fb,
      gradientMap: toonGrad,
      side: THREE.DoubleSide,
    }),
  );
  const lavenderRuffleMat = track(
    new THREE.MeshToonMaterial({
      map: lavenderTierTex,
      gradientMap: toonGrad,
      side: THREE.DoubleSide,
    }),
  );
  const knitMat = track(
    new THREE.MeshToonMaterial({
      map: knitTex,
      gradientMap: toonGrad,
    }),
  );
  const tightsMat = track(
    new THREE.MeshToonMaterial({
      color: 0x353f59,
      gradientMap: toonGrad,
    }),
  );
  const gloveMat = track(
    new THREE.MeshToonMaterial({
      color: 0x38425e,
      gradientMap: toonGrad,
    }),
  );
  const gauntletMat = track(
    new THREE.MeshToonMaterial({
      color: 0x8497c4,
      gradientMap: toonGrad,
    }),
  );
  const bootMat = track(
    new THREE.MeshToonMaterial({
      color: 0x6b8cc9,
      gradientMap: toonGrad,
    }),
  );
  const flowerMat = track(
    new THREE.MeshToonMaterial({
      color: 0xa7a8ec,
      gradientMap: toonGrad,
    }),
  );
  const flowerCenterMat = track(
    new THREE.MeshToonMaterial({
      color: 0x7c7cc8,
      gradientMap: toonGrad,
    }),
  );
  const laceMat = track(
    new THREE.MeshBasicMaterial({
      color: 0x3b4768,
    }),
  );
  const lipMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xa66370,
    }),
  );
  const mouthDarkMat = track(
    new THREE.MeshBasicMaterial({
      color: 0x7c3445,
    }),
  );

  const root = new THREE.Group();

  // Soft seamless ground contact shadow (no hard horizon floor seam!)
  const groundShadow = new THREE.Mesh(
    track(new THREE.CircleGeometry(0.62, 40)),
    track(
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
      }),
    ),
  );
  groundShadow.rotation.x = -Math.PI / 2;
  groundShadow.position.y = 0.002;
  root.add(groundShadow);

  const talkRing = new THREE.Mesh(
    track(new THREE.RingGeometry(0.45, 0.48, 48)),
    track(
      new THREE.MeshBasicMaterial({
        color: 0x6366f1,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    ),
  );
  talkRing.rotation.x = -Math.PI / 2;
  talkRing.position.y = 0.008;
  root.add(talkRing);

  const hips = new THREE.Group();
  hips.position.y = 0.94;
  root.add(hips);

  // Seamless Sculpted Legs + Cross-Strapped Ankle Boots
  const legProfile = [
    new THREE.Vector2(0.062, 0.02),
    new THREE.Vector2(0.056, -0.14),
    new THREE.Vector2(0.047, -0.32),
    new THREE.Vector2(0.042, -0.41),
    new THREE.Vector2(0.045, -0.54),
    new THREE.Vector2(0.034, -0.71),
    new THREE.Vector2(0.03, -0.78),
  ];
  const legLatheGeo = track(new THREE.LatheGeometry(legProfile, 24));

  const buildLeg = (side: -1 | 1) => {
    const legGroup = new THREE.Group();
    legGroup.position.set(side * 0.068, 0, 0);

    const legMesh = new THREE.Mesh(legLatheGeo, tightsMat);
    legMesh.castShadow = true;
    legGroup.add(legMesh);

    const bootShaft = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.048, 0.042, 0.155, 18)),
      bootMat,
    );
    bootShaft.position.y = -0.785;
    bootShaft.castShadow = true;
    legGroup.add(bootShaft);

    const cuff = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.056, 0.047, 0.048, 18)),
      skyPanelMat,
    );
    cuff.position.y = -0.722;
    cuff.rotation.z = -side * 0.09;
    legGroup.add(cuff);

    const strapA = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.045, 0.0055, 6, 18)),
      gauntletMat,
    );
    strapA.rotation.set(Math.PI / 2 + 0.24, 0.2 * side, 0);
    strapA.position.y = -0.785;
    legGroup.add(strapA);

    const strapB = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.044, 0.0055, 6, 18)),
      gauntletMat,
    );
    strapB.rotation.set(Math.PI / 2 - 0.24, -0.2 * side, 0);
    strapB.position.y = -0.822;
    legGroup.add(strapB);

    const foot = new THREE.Mesh(
      track(new THREE.CapsuleGeometry(0.038, 0.102, 8, 12)),
      bootMat,
    );
    foot.rotation.x = Math.PI / 2;
    foot.position.set(0, -0.892, 0.042);
    foot.castShadow = true;
    legGroup.add(foot);

    const heel = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.04, 0.042, 0.04)),
      tightsMat,
    );
    heel.position.set(0, -0.912, -0.012);
    legGroup.add(heel);

    return legGroup;
  };

  hips.add(buildLeg(-1));
  hips.add(buildLeg(1));

  // Central Soft Ribbed Knit Tunic Skirt (open-ended & waist-matched so zero horizontal shelf appears)
  const tunicSkirt = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.082, 0.128, 0.27, 28, 1, true, -0.78, 1.56)),
    knitMat,
  );
  tunicSkirt.position.y = -0.055;
  tunicSkirt.scale.set(1.04, 1, 0.8);
  tunicSkirt.castShadow = true;
  hips.add(tunicSkirt);

  const tunicHem = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.128, 0.13, 0.026, 28, 1, true, -0.78, 1.56)),
    knitMat,
  );
  tunicHem.position.y = -0.2;
  tunicHem.scale.set(1.04, 1, 0.8);
  hips.add(tunicHem);

  // Waist-to-hip base band sealing torso and skirt cleanly in back/sides
  const hipBand = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.082, 0.12, 0.12, 24, 1, true, 0.34, Math.PI * 2 - 0.68)),
    skyPanelMat,
  );
  hipBand.position.y = 0.02;
  hipBand.scale.set(1.05, 1, 0.82);
  hips.add(hipBand);

  // Slender Tapered Ice-Petal Peplum (swept gracefully along hip contour, not jutting outward)
  const petalGeo = track(createIcePetalGeo(0.068, 0.19, 0.007));

  const buildSkirtWing = (side: -1 | 1) => {
    const wing = new THREE.Group();

    for (let p = 0; p < 3; p++) {
      const yawGroup = new THREE.Group();
      yawGroup.rotation.y = side * (0.64 + p * 0.44);

      const petal = new THREE.Mesh(petalGeo, p === 1 ? icePetalMat : skyPanelMat);
      petal.position.set(0, 0.016 - p * 0.012, 0.132);
      petal.rotation.x = -0.19;
      petal.castShadow = true;
      yawGroup.add(petal);
      wing.add(yawGroup);
    }

    // Mid Sky-Blue Pleated Ruffled Tier
    const midThetaStart = side > 0 ? Math.PI * 0.25 : -Math.PI * 0.94;
    const midGeo = track(
      createPleatedSkirtSectionGeo(0.124, 0.295, 0.43, midThetaStart, Math.PI * 0.69, 14, 0.016),
    );
    const midTier = new THREE.Mesh(midGeo, skyDressMat);
    midTier.position.y = -0.195;
    midTier.castShadow = true;
    wing.add(midTier);

    // Lower Periwinkle Pleated Ruffled Train
    const lowerThetaStart = side > 0 ? Math.PI * 0.34 : -Math.PI * 0.96;
    const lowerGeo = track(
      createPleatedSkirtSectionGeo(0.21, 0.38, 0.33, lowerThetaStart, Math.PI * 0.62, 16, 0.02),
    );
    const lowerTier = new THREE.Mesh(lowerGeo, lavenderRuffleMat);
    lowerTier.position.y = -0.445;
    lowerTier.castShadow = true;
    wing.add(lowerTier);

    // Flush hip 5-petal flower clasp
    const hipClasp = createFlowerBrooch(flowerMat, flowerCenterMat, 0.78);
    hipClasp.position.set(side * 0.088, 0.04, 0.112);
    hipClasp.rotation.y = side * 0.48;
    wing.add(hipClasp);

    // Split Rear Waterfall Drapes with 3 Flush Lavender Flowers
    const backDrapeStart = side > 0 ? Math.PI * 0.64 : -Math.PI * 0.94;
    const backDrapeGeo = track(
      createPleatedSkirtSectionGeo(0.118, 0.245, 0.55, backDrapeStart, Math.PI * 0.3, 8, 0.012),
    );
    const backDrape = new THREE.Mesh(backDrapeGeo, skyDressMat);
    backDrape.position.y = -0.255;
    backDrape.castShadow = true;
    wing.add(backDrape);

    for (let f = 0; f < 3; f++) {
      const t = (f + 0.45) / 3;
      const yPos = 0.02 - t * 0.54;
      const rAtY = THREE.MathUtils.lerp(0.118, 0.245, t) + 0.008;
      const theta = side * (Math.PI * 0.87 - f * 0.06);
      const backFlower = createFlowerBrooch(flowerMat, flowerCenterMat, 0.76);
      backFlower.position.set(
        Math.sin(theta) * rAtY,
        yPos,
        Math.cos(theta) * rAtY,
      );
      backFlower.rotation.y = theta;
      backFlower.rotation.x = -0.2;
      wing.add(backFlower);
    }

    return wing;
  };

  const skirtLeft = buildSkirtWing(-1);
  const skirtRight = buildSkirtWing(1);
  hips.add(skirtLeft);
  hips.add(skirtRight);

  // Sculpted Hourglass Spine / Upper Torso (seamless transition into knit tunic below)
  const spine = new THREE.Group();
  spine.position.y = 0.06;
  hips.add(spine);

  const torsoProfile = [
    new THREE.Vector2(0.095, -0.065), // extends cleanly inside waist/skirt seam
    new THREE.Vector2(0.075, 0.055), // slim tapered waist
    new THREE.Vector2(0.089, 0.14),
    new THREE.Vector2(0.103, 0.215), // natural soft bust
    new THREE.Vector2(0.095, 0.285),
    new THREE.Vector2(0.068, 0.335),
    new THREE.Vector2(0.04, 0.355),
  ];
  const torsoKnitCore = new THREE.Mesh(
    track(new THREE.LatheGeometry(torsoProfile, 26)),
    knitMat,
  );
  torsoKnitCore.scale.set(1.04, 1, 0.78);
  spine.add(torsoKnitCore);

  // Symmetric Tailored Open-Front Sky-Blue Bodice Panels hugging torso curve cleanly down to hip flare
  const bodiceProfile = [
    new THREE.Vector2(0.102, -0.055),
    new THREE.Vector2(0.08, 0.055),
    new THREE.Vector2(0.096, 0.14),
    new THREE.Vector2(0.11, 0.215),
    new THREE.Vector2(0.102, 0.275),
  ];
  for (const side of [-1, 1] as const) {
    const thetaStart = side > 0 ? 0.32 : Math.PI;
    const thetaLength = Math.PI - 0.32;
    const panel = new THREE.Mesh(
      track(new THREE.LatheGeometry(bodiceProfile, 22, thetaStart, thetaLength)),
      skyPanelMat,
    );
    panel.scale.set(1.05, 1, 0.81);
    panel.castShadow = true;
    spine.add(panel);
  }

  // Delicate Fine Corset Lacing & Waist Bow
  for (const side of [-1, 1] as const) {
    const loop = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.011, 0.0024, 6, 14, Math.PI * 1.4)),
      laceMat,
    );
    loop.position.set(side * 0.01, 0.056, 0.072);
    loop.rotation.z = side * 0.35;
    spine.add(loop);

    const cord = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.0014, 0.0014, 0.098, 6)),
      laceMat,
    );
    cord.position.set(side * 0.007, -0.002, 0.074);
    cord.rotation.z = side * 0.08;
    spine.add(cord);
  }

  for (let i = 0; i < 4; i++) {
    const yPos = 0.094 + i * 0.036;
    const zDepth = 0.075 + i * 0.0055;
    const laceA = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.0014, 0.0014, 0.044, 6)),
      laceMat,
    );
    laceA.position.set(0, yPos, zDepth);
    laceA.rotation.z = 0.72;
    spine.add(laceA);

    const laceB = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.0014, 0.0014, 0.044, 6)),
      laceMat,
    );
    laceB.position.set(0, yPos, zDepth);
    laceB.rotation.z = -0.72;
    spine.add(laceB);
  }

  // Ribbed Collar
  const collar = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.038, 0.048, 0.052, 20)),
    knitMat,
  );
  collar.position.y = 0.358;
  spine.add(collar);

  // Seamless Arms + Flush Gauntlets + Slim Tapered Gloved Hands
  const forearmProfile = [
    new THREE.Vector2(0.0265, 0.02), // snugly overlaps upper arm radius without shelf gap
    new THREE.Vector2(0.0285, -0.025),
    new THREE.Vector2(0.026, -0.105),
    new THREE.Vector2(0.0235, -0.172),
  ];
  const forearmGeo = track(new THREE.LatheGeometry(forearmProfile, 20));

  const buildArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.125, 0.302, 0);

    // Sculpted Shoulder Armor Cap + Cold-Shoulder Sleeve Drape
    const cap = new THREE.Mesh(
      track(new THREE.SphereGeometry(0.046, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56)),
      gauntletMat,
    );
    cap.rotation.z = -side * 0.42;
    shoulder.add(cap);

    const flower = createFlowerBrooch(flowerMat, flowerCenterMat, 0.78);
    flower.position.set(side * 0.032, 0.008, 0.028);
    flower.rotation.y = side * 0.85;
    shoulder.add(flower);

    const sleeveDrape = new THREE.Mesh(
      track(
        createPleatedSkirtSectionGeo(
          0.038,
          0.064,
          0.27,
          side > 0 ? Math.PI * 0.46 : -Math.PI * 1.16,
          Math.PI * 0.7,
          6,
          0.007,
        ),
      ),
      skyDressMat,
    );
    sleeveDrape.position.set(side * 0.015, -0.138, -0.018);
    sleeveDrape.rotation.z = side * 0.08;
    shoulder.add(sleeveDrape);

    // Smooth seamless upper arm sphere-tapered into forearm gauntlet
    const upperArm = new THREE.Mesh(
      track(new THREE.CapsuleGeometry(0.025, 0.175, 10, 14)),
      skinMat,
    );
    upperArm.position.y = -0.1;
    upperArm.castShadow = true;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.195, 0);
    shoulder.add(elbow);

    const gauntlet = new THREE.Mesh(forearmGeo, gauntletMat);
    gauntlet.castShadow = true;
    elbow.add(gauntlet);

    const wristTrim = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.0245, 0.0036, 6, 16)),
      skyPanelMat,
    );
    wristTrim.rotation.x = Math.PI / 2;
    wristTrim.position.y = -0.168;
    elbow.add(wristTrim);

    const wrist = new THREE.Group();
    wrist.position.y = -0.176;
    elbow.add(wrist);

    const palm = new THREE.Mesh(
      track(new THREE.CapsuleGeometry(0.013, 0.02, 6, 10)),
      gloveMat,
    );
    palm.scale.set(0.76, 1, 1.16);
    palm.position.y = -0.018;
    wrist.add(palm);

    const thumb = new THREE.Mesh(
      track(new THREE.CapsuleGeometry(0.0038, 0.014, 4, 8)),
      gloveMat,
    );
    thumb.position.set(-side * 0.009, -0.02, 0.012);
    thumb.rotation.x = 0.42;
    thumb.rotation.z = -side * 0.25;
    wrist.add(thumb);

    const fingerOffsets = [-0.009, -0.003, 0.003, 0.009];
    const fingerLengths = [0.018, 0.021, 0.019, 0.015];
    for (let f = 0; f < 4; f++) {
      const finger = new THREE.Mesh(
        track(new THREE.CapsuleGeometry(0.0033, fingerLengths[f], 4, 8)),
        gloveMat,
      );
      finger.position.set(-side * 0.004, -0.042 - fingerLengths[f] * 0.28, fingerOffsets[f]);
      finger.rotation.z = -side * 0.16;
      wrist.add(finger);
    }

    return { shoulder, elbow, wrist };
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);
  spine.add(leftArm.shoulder);
  spine.add(rightArm.shoulder);

  // Head + Soft Almond Cel-Shaded Anime Face
  const head = new THREE.Group();
  head.position.y = 0.398;
  spine.add(head);

  const neck = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.027, 0.033, 0.06, 18)),
    skinMat,
  );
  neck.position.y = 0.014;
  head.add(neck);

  const headGeo = track(createSculptedHeadGeo());
  const headMesh = new THREE.Mesh(headGeo, faceSkinMat);
  headMesh.position.y = 0.132;
  headMesh.scale.set(1.03, 0.99, 0.94);
  headMesh.castShadow = true;
  head.add(headMesh);

  // Curved Almond Anime Eyes Flush on Face Surface (unobstructed & larger for clear anime warmth)
  const scleraPatchGeo = track(createCurvedEyePatchGeo(0.048, 0.036, 0.0095));
  const irisPatchGeo = track(createCurvedEyePatchGeo(0.028, 0.03, 0.0035));
  const lashPatchGeo = track(createCurvedEyePatchGeo(0.052, 0.039, 0.01));

  const buildEye = (side: -1 | 1) => {
    const eyeSocket = new THREE.Group();
    eyeSocket.position.set(side * 0.04, 0.122, 0.1045);
    eyeSocket.rotation.y = side * 0.22;

    const sclera = new THREE.Mesh(scleraPatchGeo, scleraMat);
    eyeSocket.add(sclera);

    const iris = new THREE.Mesh(irisPatchGeo, irisMat);
    iris.position.set(-side * 0.001, -0.001, 0.0014);
    eyeSocket.add(iris);

    const lash = new THREE.Mesh(lashPatchGeo, side > 0 ? lashMatR : lashMatL);
    lash.position.set(0, 0.0005, 0.0026);
    eyeSocket.add(lash);

    // Smooth Animated Blinking Eyelid matching eye patch width
    const eyelid = new THREE.Mesh(
      track(createCurvedEyePatchGeo(0.05, 0.037, 0.01)),
      skinMat,
    );
    eyelid.position.set(0, 0.016, 0.0035);
    eyelid.scale.y = 0.04;
    eyelid.visible = false;
    eyeSocket.add(eyelid);

    // Delicate Thin Eyebrow Arch
    const brow = new THREE.Mesh(
      track(new THREE.CapsuleGeometry(0.0013, 0.025, 4, 8)),
      browMat,
    );
    brow.rotation.z = Math.PI / 2 + side * 0.04;
    brow.position.set(0, 0.028, 0.001);
    eyeSocket.add(brow);

    head.add(eyeSocket);
    return { iris, eyelid, lash, brow };
  };

  const leftEye = buildEye(-1);
  const rightEye = buildEye(1);

  // Delicate Anime Smile + Subtle Talking Open Mouth (cleanly proportioned to chin!)
  const mouthGroup = new THREE.Group();
  mouthGroup.position.set(0, 0.075, 0.094);
  head.add(mouthGroup);

  const smileCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.0105, 0.0016, -0.001),
    new THREE.Vector3(0, -0.0009, 0.0016),
    new THREE.Vector3(0.0105, 0.0016, -0.001),
  ]);
  const mouthClosed = new THREE.Mesh(
    track(new THREE.TubeGeometry(smileCurve, 12, 0.00115, 6, false)),
    lipMat,
  );
  mouthGroup.add(mouthClosed);

  const mouthOpen = new THREE.Mesh(
    track(new THREE.CircleGeometry(0.0072, 16)),
    mouthDarkMat,
  );
  mouthOpen.scale.set(1.05, 0.25, 1);
  mouthOpen.position.z = 0.0018;
  mouthOpen.visible = false;
  mouthGroup.add(mouthOpen);

  // Silver-white Hair Cap
  const hairCap = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.126, 30, 22, 0, Math.PI * 2, 0, Math.PI * 0.58)),
    hairMat,
  );
  hairCap.position.set(0, 0.145, -0.006);
  hairCap.scale.set(1.04, 1.0, 0.98);
  hairCap.rotation.x = -0.18;
  head.add(hairCap);

  // Layered Parted Forehead Bangs sweeping gracefully above brow/upper-lash level so eyes stay 100% clear!
  const bangBlades: Array<{ pts: THREE.Vector3[]; ws: number; wm: number; th: number }> = [
    // Center delicate nose-bridge wisp
    {
      pts: [
        new THREE.Vector3(0.0, 0.264, 0.032),
        new THREE.Vector3(-0.004, 0.208, 0.12),
        new THREE.Vector3(-0.006, 0.144, 0.12),
      ],
      ws: 0.01,
      wm: 0.013,
      th: 0.0055,
    },
    {
      pts: [
        new THREE.Vector3(0.004, 0.264, 0.032),
        new THREE.Vector3(0.01, 0.208, 0.12),
        new THREE.Vector3(0.012, 0.148, 0.119),
      ],
      ws: 0.01,
      wm: 0.013,
      th: 0.0055,
    },
    // Inner arched bangs ending cleanly above eye crease (y = 0.156)
    {
      pts: [
        new THREE.Vector3(-0.014, 0.262, 0.028),
        new THREE.Vector3(-0.028, 0.206, 0.118),
        new THREE.Vector3(-0.026, 0.156, 0.116),
      ],
      ws: 0.015,
      wm: 0.018,
      th: 0.006,
    },
    {
      pts: [
        new THREE.Vector3(0.014, 0.262, 0.028),
        new THREE.Vector3(0.028, 0.206, 0.118),
        new THREE.Vector3(0.026, 0.156, 0.116),
      ],
      ws: 0.015,
      wm: 0.018,
      th: 0.006,
    },
    // Mid-brow sculpted locks arching gracefully up over outer eye lashes
    {
      pts: [
        new THREE.Vector3(-0.028, 0.256, 0.022),
        new THREE.Vector3(-0.052, 0.204, 0.111),
        new THREE.Vector3(-0.056, 0.154, 0.107),
      ],
      ws: 0.017,
      wm: 0.02,
      th: 0.0065,
    },
    {
      pts: [
        new THREE.Vector3(0.028, 0.256, 0.022),
        new THREE.Vector3(0.052, 0.204, 0.111),
        new THREE.Vector3(0.056, 0.154, 0.107),
      ],
      ws: 0.017,
      wm: 0.02,
      th: 0.0065,
    },
    // Outer temple locks framing eye corners down along cheeks
    {
      pts: [
        new THREE.Vector3(-0.044, 0.246, 0.016),
        new THREE.Vector3(-0.084, 0.178, 0.092),
        new THREE.Vector3(-0.082, 0.095, 0.094),
      ],
      ws: 0.02,
      wm: 0.024,
      th: 0.0075,
    },
    {
      pts: [
        new THREE.Vector3(0.044, 0.246, 0.016),
        new THREE.Vector3(0.084, 0.178, 0.092),
        new THREE.Vector3(0.082, 0.095, 0.094),
      ],
      ws: 0.02,
      wm: 0.024,
      th: 0.0075,
    },
  ];
  for (const b of bangBlades) {
    const blade = createSculptedHairBlade(b.pts, b.ws, b.wm, b.th, hairMat);
    blade.castShadow = false; // prevent dark shadow smudges across forehead/cheeks
    track(blade.geometry);
    head.add(blade);
  }

  // Face-framing cheekbone & collarbone hime locks hugging head without side gaps
  for (const side of [-1, 1] as const) {
    const cheekRibbon = createSculptedHairBlade(
      [
        new THREE.Vector3(side * 0.072, 0.222, 0.022),
        new THREE.Vector3(side * 0.106, 0.11, 0.052),
        new THREE.Vector3(side * 0.092, -0.025, 0.078),
        new THREE.Vector3(side * 0.068, -0.14, 0.096),
      ],
      0.025,
      0.028,
      0.011,
      hairMat,
    );
    track(cheekRibbon.geometry);
    head.add(cheekRibbon);

    // Side temple fill curtain sealing ear/cheek transition cleanly
    const templeCurtain = createSculptedHairBlade(
      [
        new THREE.Vector3(side * 0.09, 0.2, -0.01),
        new THREE.Vector3(side * 0.118, 0.06, 0.012),
        new THREE.Vector3(side * 0.108, -0.16, 0.028),
      ],
      0.026,
      0.032,
      0.012,
      hairShadowMat,
    );
    track(templeCurtain.geometry);
    head.add(templeCurtain);
  }

  // Smooth Interlocked Braided Crown Halo
  const haloPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = THREE.MathUtils.lerp(-Math.PI * 0.64, Math.PI * 0.64, i / 12);
    haloPoints.push(
      new THREE.Vector3(
        Math.sin(a) * 0.128,
        0.172 - Math.abs(Math.sin(a)) * 0.02,
        -Math.cos(a) * 0.125 - 0.004,
      ),
    );
  }
  const crownBraid = createChevronBraid(haloPoints, 0.013, 0.013, 28, hairMat, track);
  head.add(crownBraid);

  // Twin Woven Slender Front Braids draping forward gracefully over shoulders/chest
  const buildSideBraid = (side: -1 | 1) => {
    const group = new THREE.Group();
    group.position.set(side * 0.105, 0.145, -0.01);
    const braidPts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(side * 0.044, -0.14, 0.046),
      new THREE.Vector3(side * 0.068, -0.31, 0.078),
      new THREE.Vector3(side * 0.056, -0.43, 0.058),
    ];
    const braid = createChevronBraid(braidPts, 0.011, 0.006, 30, hairMat, track);
    group.add(braid);

    const tie = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.007, 0.007, 0.012, 10)),
      bootMat,
    );
    tie.position.set(side * 0.058, -0.425, 0.06);
    group.add(tie);

    const tip = createSculptedHairBlade(
      [
        new THREE.Vector3(side * 0.058, -0.425, 0.06),
        new THREE.Vector3(side * 0.05, -0.52, 0.048),
      ],
      0.0085,
      0.0065,
      0.005,
      hairMat,
    );
    track(tip.geometry);
    group.add(tip);
    return group;
  };
  const braidL = buildSideBraid(-1);
  const braidR = buildSideBraid(1);
  head.add(braidL);
  head.add(braidR);

  // Lush Sweeping Back Hair Curtain + Center Back Braid
  const hairBackGroup = new THREE.Group();
  hairBackGroup.position.set(0, 0.155, -0.032);
  head.add(hairBackGroup);

  const centerBraid = createChevronBraid(
    [
      new THREE.Vector3(0, 0.01, -0.095),
      new THREE.Vector3(0, -0.18, -0.116),
      new THREE.Vector3(0, -0.37, -0.128),
      new THREE.Vector3(0, -0.52, -0.118),
    ],
    0.018,
    0.011,
    32,
    hairMat,
    track,
  );
  hairBackGroup.add(centerBraid);

  const centerTie = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.01, 0.01, 0.015, 12)),
    bootMat,
  );
  centerTie.position.set(0, -0.515, -0.118);
  hairBackGroup.add(centerTie);

  const centerTip = createSculptedHairBlade(
    [
      new THREE.Vector3(0, -0.515, -0.118),
      new THREE.Vector3(0, -0.65, -0.102),
    ],
    0.013,
    0.01,
    0.007,
    hairMat,
  );
  track(centerTip.geometry);
  hairBackGroup.add(centerTip);

  const backCurtainSpecs = [
    { x0: 0, x1: 0, x2: 0.02, yEnd: -0.92, z1: -0.148, curlX: -0.04, ws: 0.092, wm: 0.112, mat: hairShadowMat },
    { x0: -0.045, x1: -0.075, x2: -0.125, yEnd: -0.88, z1: -0.14, curlX: 0.055, ws: 0.075, wm: 0.095, mat: hairMat },
    { x0: 0.045, x1: 0.075, x2: 0.125, yEnd: -0.88, z1: -0.14, curlX: -0.055, ws: 0.075, wm: 0.095, mat: hairMat },
    { x0: -0.085, x1: -0.14, x2: -0.215, yEnd: -0.82, z1: -0.118, curlX: 0.065, ws: 0.065, wm: 0.082, mat: hairMat },
    { x0: 0.085, x1: 0.14, x2: 0.215, yEnd: -0.82, z1: -0.118, curlX: -0.065, ws: 0.065, wm: 0.082, mat: hairMat },
    { x0: -0.11, x1: -0.185, x2: -0.27, yEnd: -0.72, z1: -0.09, curlX: 0.055, ws: 0.056, wm: 0.068, mat: hairShadowMat },
    { x0: 0.11, x1: 0.185, x2: 0.27, yEnd: -0.72, z1: -0.09, curlX: -0.055, ws: 0.056, wm: 0.068, mat: hairShadowMat },
    { x0: -0.12, x1: -0.21, x2: -0.3, yEnd: -0.58, z1: -0.052, curlX: 0.04, ws: 0.045, wm: 0.052, mat: hairMat },
    { x0: 0.12, x1: 0.21, x2: 0.3, yEnd: -0.58, z1: -0.052, curlX: -0.04, ws: 0.045, wm: 0.052, mat: hairMat },
  ];

  for (const c of backCurtainSpecs) {
    const blade = createSculptedHairBlade(
      [
        new THREE.Vector3(c.x0 * 0.55, 0.035, -0.045),
        new THREE.Vector3(c.x1 * 0.9, -0.32, c.z1),
        new THREE.Vector3(c.x2 * 0.95, c.yEnd * 0.72, c.z1 - 0.024),
        new THREE.Vector3(c.x2, c.yEnd * 0.94, c.z1 + 0.025),
        new THREE.Vector3(c.x2 + c.curlX, c.yEnd, c.z1 + 0.068),
      ],
      c.ws,
      c.wm,
      0.017,
      c.mat,
    );
    track(blade.geometry);
    hairBackGroup.add(blade);
  }

  // Holographic Tool Ring (visible in 'using_tool' state)
  const toolGroup = new THREE.Group();
  toolGroup.position.set(0, 1.14, 0.34);
  toolGroup.scale.setScalar(0.001);
  root.add(toolGroup);

  const ringMat = track(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
    }),
  );
  const outerRing = new THREE.Mesh(
    track(new THREE.TorusGeometry(0.24, 0.006, 10, 48)),
    ringMat,
  );
  toolGroup.add(outerRing);

  const innerRing = new THREE.Mesh(
    track(new THREE.TorusGeometry(0.16, 0.0045, 8, 36)),
    ringMat,
  );
  toolGroup.add(innerRing);

  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const node = new THREE.Mesh(
      track(new THREE.OctahedronGeometry(0.02, 0)),
      ringMat,
    );
    node.position.set(Math.cos(angle) * 0.24, Math.sin(angle) * 0.24, 0);
    toolGroup.add(node);
  }

  // Thought Crystals (visible in 'thinking' state)
  const thoughtGroup = new THREE.Group();
  thoughtGroup.position.set(0, 1.69, 0);
  thoughtGroup.scale.setScalar(0.001);
  root.add(thoughtGroup);

  const crystalMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xa78bfa,
    }),
  );
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const crystal = new THREE.Mesh(
      track(new THREE.OctahedronGeometry(0.022, 0)),
      crystalMat,
    );
    crystal.position.set(Math.cos(angle) * 0.24, 0.045 * i, Math.sin(angle) * 0.24);
    thoughtGroup.add(crystal);
  }

  return {
    root,
    hips,
    spine,
    head,
    irisL: leftEye.iris,
    irisR: rightEye.iris,
    eyelidL: leftEye.eyelid,
    eyelidR: rightEye.eyelid,
    lashL: leftEye.lash,
    lashR: rightEye.lash,
    browL: leftEye.brow,
    browR: rightEye.brow,
    mouthClosed,
    mouthOpen,
    shoulderL: leftArm.shoulder,
    shoulderR: rightArm.shoulder,
    elbowL: leftArm.elbow,
    elbowR: rightArm.elbow,
    wristL: leftArm.wrist,
    wristR: rightArm.wrist,
    hairBackGroup,
    braidL,
    braidR,
    skirtLeft,
    skirtRight,
    toolGroup,
    thoughtGroup,
    talkRing,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

export function updateCompanionAnimation(
  rig: CompanionRig,
  state: CompanionAnimState,
  elapsed: number,
  dt: number,
  gaze: { x: number; y: number } = { x: 0, y: 0 },
) {
  const safeDt = Math.min(dt, 0.08);
  const k = 7.5;

  // Natural blinking every ~3.8 seconds: smooth upper-eyelid drape + lash sweep down
  const blinkCycle = elapsed % 3.8;
  const isBlinking = blinkCycle > 3.65;
  const targetLidScale = isBlinking ? 1.0 : 0.04;
  rig.eyelidL.scale.y = THREE.MathUtils.damp(rig.eyelidL.scale.y, targetLidScale, 28, safeDt);
  rig.eyelidR.scale.y = THREE.MathUtils.damp(rig.eyelidR.scale.y, targetLidScale, 28, safeDt);
  const lidProgress = THREE.MathUtils.clamp((rig.eyelidL.scale.y - 0.04) / 0.96, 0, 1);
  rig.eyelidL.position.y = 0.014 - lidProgress * 0.014;
  rig.eyelidR.position.y = 0.014 - lidProgress * 0.014;
  rig.eyelidL.visible = rig.eyelidL.scale.y > 0.08;
  rig.eyelidR.visible = rig.eyelidR.scale.y > 0.08;
  rig.lashL.position.y = 0.0005 - lidProgress * 0.01;
  rig.lashR.position.y = 0.0005 - lidProgress * 0.01;

  // Smooth Eye Tracking within the almond sclera frame
  const gazeX = THREE.MathUtils.clamp(gaze.x, -1, 1) * 0.0032 + Math.sin(elapsed * 0.7) * 0.0007;
  const gazeY = THREE.MathUtils.clamp(gaze.y, -1, 1) * 0.0018 - 0.0008;
  rig.irisL.position.x = THREE.MathUtils.damp(rig.irisL.position.x, -0.001 + gazeX, 12, safeDt);
  rig.irisL.position.y = THREE.MathUtils.damp(rig.irisL.position.y, gazeY, 12, safeDt);
  rig.irisR.position.x = THREE.MathUtils.damp(rig.irisR.position.x, 0.001 + gazeX, 12, safeDt);
  rig.irisR.position.y = THREE.MathUtils.damp(rig.irisR.position.y, gazeY, 12, safeDt);

  let hipY = 0.94 + Math.sin(elapsed * 1.6) * 0.007;
  let spineRotX = 0;
  let spineRotY = 0;
  let headRotX = -gaze.y * 0.06 + Math.sin(elapsed * 1.1) * 0.018;
  let headRotY = gaze.x * 0.12 + Math.sin(elapsed * 0.55) * 0.035;
  let headRotZ = 0;

  let shLX = 0.03;
  let shLZ = -0.15;
  let elLX = -0.16;
  let elLZ = 0.04;
  let wrLX = 0;

  let shRX = 0.03;
  let shRZ = 0.15;
  let elRX = -0.16;
  let elRZ = -0.04;
  let wrRX = 0;

  let browTilt = 0.04;
  let browY = 0.026;
  let mouthOpenScale = 0.1;

  let targetToolScale = 0.001;
  let targetThoughtScale = 0.001;
  let targetTalkOpacity = 0;

  if (state === 'idle') {
    hipY = 0.94 + Math.sin(elapsed * 1.7) * 0.006;
    spineRotY = Math.sin(elapsed * 0.42) * 0.028;
    shLZ = -0.16 + Math.sin(elapsed * 1.2) * 0.018;
    shRZ = 0.16 - Math.sin(elapsed * 1.2) * 0.018;
    headRotZ = Math.sin(elapsed * 0.68) * 0.02;
  } else if (state === 'talking') {
    hipY = 0.94 + Math.sin(elapsed * 3.0) * 0.01;
    spineRotY = Math.sin(elapsed * 2.1) * 0.045;
    headRotX = -gaze.y * 0.06 + Math.sin(elapsed * 4.2) * 0.038;
    headRotY = gaze.x * 0.1 + Math.sin(elapsed * 1.8) * 0.085;
    headRotZ = Math.sin(elapsed * 2.4) * 0.03;

    shLX = -0.4 + Math.sin(elapsed * 3.2) * 0.12;
    shLZ = -0.22;
    elLX = -0.96 + Math.sin(elapsed * 3.8) * 0.14;
    elLZ = -0.18;
    wrLX = Math.sin(elapsed * 4.5) * 0.15;

    shRX = -0.2 + Math.cos(elapsed * 2.7) * 0.09;
    shRZ = 0.24;
    elRX = -0.62 + Math.cos(elapsed * 3.0) * 0.11;
    wrRX = Math.cos(elapsed * 4.0) * 0.12;

    browTilt = 0.02;
    browY = 0.028;
    mouthOpenScale = 0.32 + Math.abs(Math.sin(elapsed * 9.5)) * 0.72;
    targetTalkOpacity = 0.36 + Math.sin(elapsed * 6) * 0.16;
  } else if (state === 'using_tool') {
    hipY = 0.935 + Math.sin(elapsed * 2.4) * 0.007;
    spineRotX = 0.08;
    headRotX = 0.11 + Math.sin(elapsed * 2.0) * 0.018;
    headRotY = gaze.x * 0.08 + Math.sin(elapsed * 1.4) * 0.04;

    shLX = -0.74 + Math.sin(elapsed * 6.2) * 0.055;
    shLZ = -0.05;
    elLX = -0.72 + Math.cos(elapsed * 7.8) * 0.075;
    elLZ = -0.22;

    shRX = -0.74 + Math.cos(elapsed * 6.2) * 0.055;
    shRZ = 0.05;
    elRX = -0.72 + Math.sin(elapsed * 7.8) * 0.075;
    elRZ = 0.22;

    browTilt = 0.08;
    targetToolScale = 1.0;
    rig.toolGroup.rotation.z = elapsed * 0.95;
    rig.toolGroup.children[1].rotation.z = -elapsed * 1.8;
  } else if (state === 'thinking') {
    hipY = 0.948 + Math.sin(elapsed * 1.3) * 0.01;
    spineRotY = -0.07;
    headRotX = -0.04 + Math.sin(elapsed * 1.1) * 0.02;
    headRotY = 0.14 + gaze.x * 0.08;
    headRotZ = -0.07;

    shLX = -0.88;
    shLZ = -0.14;
    elLX = -1.58 + Math.sin(elapsed * 1.5) * 0.035;
    elLZ = -0.24;
    wrLX = 0.18;

    shRX = 0.04;
    shRZ = 0.2;
    elRX = -0.28;

    browTilt = 0.09;
    browY = 0.025;
    targetThoughtScale = 1.0;
    rig.thoughtGroup.rotation.y = elapsed * 0.75;
    rig.thoughtGroup.position.y = 1.68 + Math.sin(elapsed * 1.6) * 0.02;
  }

  rig.hips.position.y = THREE.MathUtils.damp(rig.hips.position.y, hipY, k, safeDt);
  rig.spine.rotation.x = THREE.MathUtils.damp(rig.spine.rotation.x, spineRotX, k, safeDt);
  rig.spine.rotation.y = THREE.MathUtils.damp(rig.spine.rotation.y, spineRotY, k, safeDt);
  rig.head.rotation.x = THREE.MathUtils.damp(rig.head.rotation.x, headRotX, k, safeDt);
  rig.head.rotation.y = THREE.MathUtils.damp(rig.head.rotation.y, headRotY, k, safeDt);
  rig.head.rotation.z = THREE.MathUtils.damp(rig.head.rotation.z, headRotZ, k, safeDt);

  rig.shoulderL.rotation.x = THREE.MathUtils.damp(rig.shoulderL.rotation.x, shLX, k, safeDt);
  rig.shoulderL.rotation.z = THREE.MathUtils.damp(rig.shoulderL.rotation.z, shLZ, k, safeDt);
  rig.elbowL.rotation.x = THREE.MathUtils.damp(rig.elbowL.rotation.x, elLX, k, safeDt);
  rig.elbowL.rotation.z = THREE.MathUtils.damp(rig.elbowL.rotation.z, elLZ, k, safeDt);
  rig.wristL.rotation.x = THREE.MathUtils.damp(rig.wristL.rotation.x, wrLX, k, safeDt);

  rig.shoulderR.rotation.x = THREE.MathUtils.damp(rig.shoulderR.rotation.x, shRX, k, safeDt);
  rig.shoulderR.rotation.z = THREE.MathUtils.damp(rig.shoulderR.rotation.z, shRZ, k, safeDt);
  rig.elbowR.rotation.x = THREE.MathUtils.damp(rig.elbowR.rotation.x, elRX, k, safeDt);
  rig.elbowR.rotation.z = THREE.MathUtils.damp(rig.elbowR.rotation.z, elRZ, k, safeDt);
  rig.wristR.rotation.x = THREE.MathUtils.damp(rig.wristR.rotation.x, wrRX, k, safeDt);

  rig.browL.rotation.z = THREE.MathUtils.damp(rig.browL.rotation.z, Math.PI / 2 - browTilt, 10, safeDt);
  rig.browR.rotation.z = THREE.MathUtils.damp(rig.browR.rotation.z, Math.PI / 2 + browTilt, 10, safeDt);
  rig.browL.position.y = THREE.MathUtils.damp(rig.browL.position.y, browY, 10, safeDt);
  rig.browR.position.y = THREE.MathUtils.damp(rig.browR.position.y, browY, 10, safeDt);

  rig.mouthOpen.scale.y = THREE.MathUtils.damp(rig.mouthOpen.scale.y, mouthOpenScale, 20, safeDt);
  const isMouthOpen = state === 'talking' && rig.mouthOpen.scale.y > 0.25;
  rig.mouthOpen.visible = isMouthOpen;
  rig.mouthClosed.visible = !isMouthOpen;

  rig.hairBackGroup.rotation.x = 0.025 + Math.sin(elapsed * 1.5) * 0.02;
  rig.braidL.rotation.z = Math.sin(elapsed * 1.7 + 0.5) * 0.025;
  rig.braidR.rotation.z = -Math.sin(elapsed * 1.7 + 0.5) * 0.025;
  rig.skirtLeft.rotation.z = Math.sin(elapsed * 1.4) * 0.014;
  rig.skirtRight.rotation.z = -Math.sin(elapsed * 1.4) * 0.014;

  const curToolScale = THREE.MathUtils.damp(rig.toolGroup.scale.x, targetToolScale, 8, safeDt);
  rig.toolGroup.scale.setScalar(curToolScale);
  rig.toolGroup.visible = curToolScale > 0.01;

  const curThoughtScale = THREE.MathUtils.damp(rig.thoughtGroup.scale.x, targetThoughtScale, 8, safeDt);
  rig.thoughtGroup.scale.setScalar(curThoughtScale);
  rig.thoughtGroup.visible = curThoughtScale > 0.01;

  const talkMat = rig.talkRing.material as THREE.MeshBasicMaterial;
  talkMat.opacity = THREE.MathUtils.damp(talkMat.opacity, targetTalkOpacity, 10, safeDt);
  const ringScale = state === 'talking' ? 1 + Math.sin(elapsed * 6) * 0.07 : 1;
  rig.talkRing.scale.setScalar(ringScale);
}
