import * as THREE from 'three';
import type { CharacterDef } from './characters';
import type { JointName } from '../animations/types';

/* ================================================================== */
/*  Procedural fighter rig builder — 4 body builds × 7 hair styles ×  */
/*  7 accessories give every one of the 15 fighters a distinct        */
/*  silhouette. Model space: forward = +z, limbs hang toward -y.      */
/* ================================================================== */

export interface ClothSway {
  obj: THREE.Object3D;
  baseX: number;
  baseZ: number;
  phase: number;
  amp: number;
}

export interface FighterRig {
  root: THREE.Group;
  inner: THREE.Group;
  joints: Record<JointName, THREE.Object3D>;
  hipsAnchorY: number;
  trimMaterials: THREE.MeshStandardMaterial[];
  clothSway: ClothSway[];
  dispose: () => void;
}

const std = (color: string, roughness = 0.55, metalness = 0.08): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

const trim = (color: string, intensity = 1.6): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, metalness: 0.2 });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], parent: THREE.Object3D, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0], pos[1], pos[2]);
  m.castShadow = shadow;
  parent.add(m);
  return m;
}

function joint(name: string, pos: [number, number, number], parent: THREE.Object3D): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(pos[0], pos[1], pos[2]);
  parent.add(o);
  return o;
}

const BUILD_FACTOR: Record<CharacterDef['build'], { limb: number; torso: number; shoulder: number }> = {
  muscular: { limb: 1.12, torso: 1.16, shoulder: 1.2 },
  athletic: { limb: 1.0, torso: 1.0, shoulder: 1.0 },
  heavy: { limb: 1.34, torso: 1.42, shoulder: 1.3 },
  lean: { limb: 0.86, torso: 0.9, shoulder: 0.88 },
};

export function buildFighterRig(def: CharacterDef): FighterRig {
  const P = def.palette;
  const B = BUILD_FACTOR[def.build];
  const s = def.scale;

  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const G = <T extends THREE.BufferGeometry>(g: T): T => { geos.push(g); return g; };
  const M = <T extends THREE.Material>(m: T): T => { mats.push(m); return m; };

  const skin = M(std(P.skin, 0.62, 0.02));
  const cloth = M(std(P.clothMain, 0.48, 0.12));
  const clothAlt = M(std(P.clothAlt, 0.44, 0.14));
  const gloveM = M(std(P.glove, 0.5, 0.15));
  const hairM = M(std(P.hair, 0.72, 0.05));
  const trimM = M(trim(P.trim, 1.6));
  const trimMats = [trimM];
  const beltM = P.belt ? M(std(P.belt, 0.45, 0.2)) : clothAlt;
  const dark = M(std('#0b0c10', 0.4, 0.3));

  const root = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(s);
  root.add(inner);

  const joints = {} as Record<JointName, THREE.Object3D>;
  const clothSway: ClothSway[] = [];

  /* ---------------- torso ---------------- */
  const hips = joint('hips', [0, 0.98, 0], inner);
  joints.hips = hips;

  mesh(G(new THREE.BoxGeometry(0.30 * B.torso, 0.17, 0.20 * B.torso)), clothAlt, [0, -0.015, 0], hips);
  mesh(G(new THREE.BoxGeometry(0.315 * B.torso, 0.075, 0.215 * B.torso)), beltM, [0, 0.055, 0], hips);
  if (def.build === 'muscular' || def.build === 'heavy') {
    for (const side of [-1, 1]) {
      const tail = joint('beltTail', [side * 0.05, 0.04, -0.08], hips);
      mesh(G(new THREE.BoxGeometry(0.055, 0.34, 0.015)), beltM, [0, -0.17, 0], tail);
      clothSway.push({ obj: tail, baseX: 0.18, baseZ: side * 0.06, phase: side * 1.7, amp: 0.14 });
    }
  }

  const spine = joint('spine', [0, 0.16, 0], hips);
  joints.spine = spine;
  mesh(G(new THREE.CylinderGeometry(0.145 * B.torso, 0.135 * B.torso, 0.18, 10)), skin, [0, 0.09, 0], spine);

  const chest = joint('chest', [0, 0.18, 0], spine);
  joints.chest = chest;
  const bareChest = def.build === 'muscular';
  const torsoR = G(new THREE.CylinderGeometry(0.205 * B.torso, 0.147 * B.torso, 0.35, 12));
  mesh(torsoR, bareChest ? skin : def.build === 'heavy' ? clothAlt : cloth, [0, 0.16, 0], chest);
  if (def.build === 'heavy') {
    const belly = mesh(G(new THREE.SphereGeometry(0.19 * B.torso, 12, 10)), clothAlt, [0, 0.06, 0.03], chest);
    belly.scale.set(1.05, 0.8, 0.9);
  }
  if (bareChest) {
    mesh(G(new THREE.SphereGeometry(0.085 * B.torso, 10, 8)), skin, [-0.075, 0.27, 0.115], chest);
    mesh(G(new THREE.SphereGeometry(0.085 * B.torso, 10, 8)), skin, [0.075, 0.27, 0.115], chest);
    const vest = mesh(G(new THREE.CylinderGeometry(0.225 * B.torso, 0.16 * B.torso, 0.34, 12, 1, true)), cloth, [0, 0.155, -0.012], chest);
    vest.scale.z = 0.86;
    mesh(G(new THREE.BoxGeometry(0.018, 0.3, 0.02)), trimM, [-0.14 * B.torso, 0.16, 0.15], chest);
    mesh(G(new THREE.BoxGeometry(0.018, 0.3, 0.02)), trimM, [0.14 * B.torso, 0.16, 0.15], chest);
  } else {
    // jacket/tank trim
    mesh(G(new THREE.CylinderGeometry(0.075 * B.torso, 0.09 * B.torso, 0.09, 10)), cloth, [0, 0.33, -0.01], chest);
    mesh(G(new THREE.BoxGeometry(0.02, 0.26, 0.02)), trimM, [-0.085 * B.torso, 0.18, 0.175], chest);
    mesh(G(new THREE.BoxGeometry(0.02, 0.26, 0.02)), trimM, [0.085 * B.torso, 0.18, 0.175], chest);
    mesh(G(new THREE.BoxGeometry(0.1 * B.torso, 0.02, 0.02)), trimM, [0, 0.27, 0.185 * B.torso], chest);
    mesh(G(new THREE.SphereGeometry(0.082 * B.shoulder, 10, 8)), clothAlt, [-0.2 * B.shoulder, 0.29, 0], chest);
    mesh(G(new THREE.SphereGeometry(0.082 * B.shoulder, 10, 8)), clothAlt, [0.2 * B.shoulder, 0.29, 0], chest);
    if (def.build === 'athletic' || def.build === 'lean') {
      for (const side of [-1, 1]) {
        const tail = joint('jacketTail', [side * 0.09, 0.0, -0.13], chest);
        mesh(G(new THREE.BoxGeometry(0.13, 0.36, 0.025)), cloth, [0, -0.17, 0], tail);
        mesh(G(new THREE.BoxGeometry(0.02, 0.3, 0.03)), trimM, [side * 0.05, -0.16, 0.005], tail);
        clothSway.push({ obj: tail, baseX: 0.14, baseZ: side * 0.05, phase: side * 2.2, amp: 0.12 });
      }
    }
    if (def.accessory === 'cape') {
      const cape = joint('cape', [0, 0.3, -0.16], chest);
      const cm = mesh(G(new THREE.PlaneGeometry(0.52, 0.95, 4, 8)), clothAlt, [0, -0.45, 0], cape);
      cm.material = M(new THREE.MeshStandardMaterial({ color: P.clothAlt, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide }));
      mesh(G(new THREE.BoxGeometry(0.5, 0.03, 0.02)), trimM, [0, -0.1, 0.01], cape);
      clothSway.push({ obj: cape, baseX: 0.1, baseZ: 0, phase: 0.4, amp: 0.1 });
    }
  }

  const neck = joint('neck', [0, 0.24, 0], chest);
  joints.neck = neck;
  mesh(G(new THREE.CylinderGeometry(0.05 * B.limb, 0.06 * B.limb, 0.09, 8)), skin, [0, 0.04, 0], neck);

  /* ---------------- head ---------------- */
  const head = joint('head', [0, 0.08, 0], neck);
  joints.head = head;
  const skull = mesh(G(new THREE.SphereGeometry(0.115, 16, 14)), skin, [0, 0.1, 0], head);
  skull.scale.set(0.94, 1.12, 1.0);
  mesh(G(new THREE.BoxGeometry(0.13, 0.07, 0.12)), skin, [0, 0.035, 0.035], head);
  const eyeM = M(std('#101318', 0.25, 0.1));
  const eyeGlow = M(trim(def.color, 0.9));
  trimMats.push(eyeGlow);
  const masked = def.accessory === 'mask';
  for (const side of [-1, 1]) {
    if (!masked) {
      const eye = mesh(G(new THREE.SphereGeometry(0.017, 8, 6)), eyeM, [side * 0.045, 0.115, 0.093], head);
      eye.scale.y = 0.7;
      mesh(G(new THREE.BoxGeometry(0.052, 0.014, 0.02)), hairM, [side * 0.045, 0.152, 0.09], head);
    }
    mesh(G(new THREE.BoxGeometry(0.05, 0.008, 0.012)), eyeGlow, [side * 0.045, masked ? 0.125 : 0.138, 0.098], head);
  }
  const nose = mesh(G(new THREE.ConeGeometry(0.016, 0.045, 6)), skin, [0, 0.085, 0.115], head);
  nose.rotation.x = Math.PI * 0.55;
  if (masked) {
    mesh(G(new THREE.BoxGeometry(0.15, 0.1, 0.13)), cloth, [0, 0.055, 0.045], head);
    mesh(G(new THREE.BoxGeometry(0.1, 0.012, 0.01)), trimM, [0, 0.075, 0.108], head);
  }

  // hair
  switch (def.hair) {
    case 'short': {
      const cap = mesh(G(new THREE.SphereGeometry(0.121, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), hairM, [0, 0.105, -0.008], head);
      cap.scale.set(0.95, 1.1, 1.0);
      break;
    }
    case 'spiky': {
      const cap = mesh(G(new THREE.SphereGeometry(0.122, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6)), hairM, [0, 0.104, -0.01], head);
      cap.scale.set(0.96, 1.12, 1.02);
      const spikeG = G(new THREE.ConeGeometry(0.032, 0.14, 5));
      const spikes: [number, number, number, number, number][] = [
        [0, 0.24, -0.02, -0.25, 0], [-0.06, 0.225, -0.03, -0.3, 0.3], [0.06, 0.225, -0.03, -0.3, -0.3],
        [-0.09, 0.19, -0.06, -0.5, 0.6], [0.09, 0.19, -0.06, -0.5, -0.6], [0, 0.2, -0.09, -0.75, 0],
        [-0.05, 0.16, -0.1, -0.9, 0.35], [0.05, 0.16, -0.1, -0.9, -0.35],
      ];
      for (const [x, y, z, rx, rz] of spikes) {
        const sp = mesh(spikeG, hairM, [x, y, z], head);
        sp.rotation.set(rx, 0, rz);
      }
      break;
    }
    case 'long': {
      const cap = mesh(G(new THREE.SphereGeometry(0.123, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58)), hairM, [0, 0.104, -0.01], head);
      cap.scale.set(0.97, 1.12, 1.02);
      const back = joint('hairBack', [0, 0.14, -0.09], head);
      mesh(G(new THREE.BoxGeometry(0.19, 0.42, 0.055)), hairM, [0, -0.2, 0], back);
      mesh(G(new THREE.BoxGeometry(0.02, 0.36, 0.02)), trimM, [0, -0.19, 0.03], back);
      clothSway.push({ obj: back, baseX: 0.06, baseZ: 0, phase: 1.1, amp: 0.07 });
      break;
    }
    case 'ponytail': {
      const cap = mesh(G(new THREE.SphereGeometry(0.121, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56)), hairM, [0, 0.105, -0.008], head);
      cap.scale.set(0.95, 1.1, 1.0);
      const tail = joint('ponytail', [0, 0.17, -0.1], head);
      mesh(G(new THREE.CylinderGeometry(0.028, 0.016, 0.3, 6)), hairM, [0, -0.02, -0.13], tail).rotation.x = -1.1;
      mesh(G(new THREE.BoxGeometry(0.03, 0.02, 0.03)), trimM, [0, 0.0, -0.02], tail);
      clothSway.push({ obj: tail, baseX: 0.12, baseZ: 0, phase: 2.1, amp: 0.12 });
      break;
    }
    case 'mohawk': {
      const finG = G(new THREE.BoxGeometry(0.022, 0.11, 0.075));
      for (let i = 0; i < 6; i++) {
        const fin = mesh(finG, i % 2 === 0 ? hairM : trimM, [0, 0.225 - Math.abs(i - 2.5) * 0.012, 0.075 - i * 0.042], head);
        fin.rotation.x = -0.22 + i * 0.07;
      }
      mesh(G(new THREE.BoxGeometry(0.13, 0.01, 0.16)), hairM, [0, 0.185, -0.02], head);
      break;
    }
    case 'hood': {
      const hood = mesh(G(new THREE.SphereGeometry(0.155, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62)), cloth, [0, 0.1, -0.028], head);
      hood.scale.set(1, 1.12, 1.05);
      mesh(G(new THREE.TorusGeometry(0.115, 0.028, 8, 16, Math.PI * 1.35)), cloth, [0, 0.115, 0.015], head).rotation.set(Math.PI / 2, 0, Math.PI * 0.32);
      mesh(G(new THREE.BoxGeometry(0.015, 0.05, 0.015)), trimM, [0.09, 0.14, 0.08], head);
      break;
    }
    case 'bald':
    default: {
      // subtle scalp sheen line for the machines/monks
      mesh(G(new THREE.BoxGeometry(0.1, 0.008, 0.008)), trimM, [0, 0.19, 0.06], head);
      break;
    }
  }

  // accessories
  if (def.accessory === 'headband') {
    const bandColor = P.belt ?? P.trim;
    const bandM = M(std(bandColor, 0.45, 0.2));
    const band = mesh(G(new THREE.CylinderGeometry(0.119, 0.119, 0.045, 14)), bandM, [0, 0.155, 0], head);
    band.scale.set(0.97, 1, 1.02);
    for (const side of [-1, 1]) {
      const t = joint('bandTail', [side * 0.03, 0.15, -0.11], head);
      mesh(G(new THREE.BoxGeometry(0.045, 0.02, 0.2)), bandM, [0, 0, -0.1], t);
      clothSway.push({ obj: t, baseX: 0.1, baseZ: side * 0.14, phase: side * 2.6 + 1, amp: 0.16 });
    }
  }
  if (def.accessory === 'visor') {
    const v = mesh(G(new THREE.BoxGeometry(0.21, 0.042, 0.06)), M(trim(def.color, 2.4)), [0, 0.122, 0.075], head);
    v.scale.z = 1;
    trimMats.push(v.material as THREE.MeshStandardMaterial);
    for (const side of [-1, 1]) mesh(G(new THREE.BoxGeometry(0.014, 0.05, 0.016)), trimM, [side * 0.104, 0.12, 0.01], head);
  }
  if (def.accessory === 'scarf') {
    mesh(G(new THREE.TorusGeometry(0.075, 0.032, 8, 14)), clothAlt, [0, -0.015, 0], neck).rotation.x = Math.PI / 2;
    const tail = joint('scarfTail', [0.04, -0.03, -0.06], neck);
    mesh(G(new THREE.BoxGeometry(0.075, 0.4, 0.02)), clothAlt, [0, -0.18, 0], tail);
    mesh(G(new THREE.BoxGeometry(0.07, 0.05, 0.022)), trimM, [0, -0.36, 0], tail);
    clothSway.push({ obj: tail, baseX: 0.16, baseZ: 0.05, phase: 0.8, amp: 0.16 });
  }
  if (def.accessory === 'goggles') {
    const strap = mesh(G(new THREE.CylinderGeometry(0.121, 0.121, 0.03, 14)), dark, [0, 0.175, 0], head);
    strap.scale.set(0.97, 1, 1.02);
    for (const side of [-1, 1]) {
      const lens = mesh(G(new THREE.CylinderGeometry(0.036, 0.036, 0.022, 12)), M(trim(def.color, 1.1)), [side * 0.052, 0.178, 0.095], head);
      lens.rotation.x = Math.PI / 2 - 0.25;
    }
  }

  /* ---------------- arms ---------------- */
  const armLen = 0.268;
  const foreLen = 0.252;
  const upR = 0.05 * B.limb;
  const loR = 0.042 * B.limb;

  (['L', 'R'] as const).forEach((side) => {
    const sx = side === 'L' ? 1 : -1;
    const shoulder = joint(`shoulder${side}`, [sx * 0.18 * B.shoulder, 0.26, 0], chest);
    joints[`shoulder${side}` as JointName] = shoulder;
    const arm = joint(`arm${side}`, [sx * 0.035, -0.02, 0], shoulder);
    joints[`arm${side}` as JointName] = arm;
    mesh(G(new THREE.SphereGeometry(0.066 * B.limb * B.shoulder, 10, 8)), bareChest ? skin : cloth, [0, -0.01, 0], arm);
    mesh(G(new THREE.CylinderGeometry(loR + 0.012, upR, armLen, 9)), bareChest ? skin : cloth, [0, -armLen / 2 - 0.01, 0], arm);

    const fore = joint(`forearm${side}`, [0, -armLen - 0.01, 0], arm);
    joints[`forearm${side}` as JointName] = fore;
    mesh(G(new THREE.SphereGeometry(loR + 0.008, 9, 7)), bareChest ? skin : gloveM, [0, 0, 0], fore);
    mesh(G(new THREE.CylinderGeometry(loR - 0.006, loR + 0.008, foreLen, 9)), bareChest ? skin : cloth, [0, -foreLen / 2, 0], fore);
    const gloveLen = 0.115;
    mesh(G(new THREE.CylinderGeometry(loR + 0.014, loR + 0.006, gloveLen, 9)), gloveM, [0, -foreLen + gloveLen / 2 + 0.01, 0], fore);
    mesh(G(new THREE.BoxGeometry(0.014, gloveLen * 0.7, 0.014)), trimM, [sx * (loR + 0.01), -foreLen + gloveLen / 2 + 0.01, 0], fore);
    if (!bareChest) mesh(G(new THREE.BoxGeometry(0.05 * B.limb, 0.02, 0.05 * B.limb)), trimM, [0, -foreLen - 0.015, 0.015], fore);

    const hand = joint(`hand${side}`, [0, -foreLen, 0], fore);
    joints[`hand${side}` as JointName] = hand;
    const fist = mesh(G(new THREE.SphereGeometry(0.048 * B.limb, 9, 7)), skin, [0, -0.035, 0], hand);
    fist.scale.set(0.9, 1.15, 1.05);
    mesh(G(new THREE.BoxGeometry(0.062 * B.limb, 0.05, 0.045 * B.limb)), skin, [0, -0.075, 0.004], hand);
  });

  /* ---------------- legs ---------------- */
  const thighLen = 0.44;
  const shinLen = 0.42;
  const thR = 0.072 * B.limb;
  const shR = 0.053 * B.limb;

  (['L', 'R'] as const).forEach((side) => {
    const sx = side === 'L' ? 1 : -1;
    const thigh = joint(`thigh${side}`, [sx * 0.105 * B.torso, -0.05, 0], hips);
    joints[`thigh${side}` as JointName] = thigh;
    mesh(G(new THREE.CylinderGeometry(shR + 0.012, thR, thighLen, 10)), cloth, [0, -thighLen / 2, 0], thigh);
    if (def.build === 'muscular' || def.build === 'heavy') {
      mesh(G(new THREE.CylinderGeometry(shR + 0.03, thR + 0.035, thighLen * 0.7, 10)), cloth, [0, -thighLen * 0.42, 0], thigh);
    }
    mesh(G(new THREE.BoxGeometry(0.014, thighLen * 0.8, 0.014)), trimM, [sx * (thR + 0.014), -thighLen / 2, 0], thigh);

    const shin = joint(`shin${side}`, [0, -thighLen, 0], thigh);
    joints[`shin${side}` as JointName] = shin;
    mesh(G(new THREE.SphereGeometry(shR + 0.004, 9, 7)), cloth, [0, 0, 0], shin);
    mesh(G(new THREE.CylinderGeometry(shR - 0.016, shR, shinLen, 9)), def.build === 'muscular' ? skin : cloth, [0, -shinLen / 2, 0], shin);
    if (def.build === 'muscular' || def.build === 'heavy') {
      mesh(G(new THREE.CylinderGeometry(shR + 0.012, shR + 0.02, shinLen * 0.55, 9)), cloth, [0, -shinLen * 0.35, 0], shin);
    }

    const foot = joint(`foot${side}`, [0, -shinLen, 0], shin);
    joints[`foot${side}` as JointName] = foot;
    mesh(G(new THREE.BoxGeometry(0.1 * B.limb, 0.075, 0.24)), dark, [0, -0.04, 0.055], foot);
    mesh(G(new THREE.BoxGeometry(0.095 * B.limb, 0.016, 0.235)), trimM, [0, -0.075, 0.055], foot);
  });

  const hipsAnchorY = 0.98;

  const dispose = () => {
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
  };

  return { root, inner, joints, hipsAnchorY, trimMaterials: trimMats, clothSway, dispose };
}
