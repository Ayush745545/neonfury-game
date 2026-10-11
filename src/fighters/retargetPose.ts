import * as THREE from 'three';
import { ALL_JOINTS, type JointName } from '../animations/types';
import type { PosePlayer } from '../animations/animPlayer';

const PARENT: Record<JointName, JointName | null> = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  shoulderL: 'chest', armL: 'shoulderL', forearmL: 'armL', handL: 'forearmL',
  shoulderR: 'chest', armR: 'shoulderR', forearmR: 'armR', handR: 'forearmR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL',
  thighR: 'hips', shinR: 'thighR', footR: 'shinR',
};

/** Preserve authored bind axes and convert our downward-limb poses to a humanoid T/A-pose.
 * Rotations are solved in world space then returned to the actual parent bone's space;
 * this supports rotated bone axes and extra, unmapped spine/finger bones without flattening the rig.
 */
export class HumanoidPoseRetargeter {
  private root: THREE.Object3D;
  private bones: Partial<Record<JointName, THREE.Object3D>>;
  private target = new Map<JointName, THREE.Quaternion>();
  private rest = new Map<JointName, THREE.Quaternion>();
  private ordered: JointName[];
  private hipsPosition?: THREE.Vector3;
  private euler = new THREE.Euler();
  private rotation = new THREE.Quaternion();
  private rootRotation = new THREE.Quaternion();
  private parentInverse = new THREE.Quaternion();
  private world = new THREE.Quaternion();
  private hipsOffset = new THREE.Vector3();
  private rootLinear = new THREE.Matrix3();
  private hipsParentInverse = new THREE.Matrix4();
  private hipsParentLinear = new THREE.Matrix3();

  constructor(root: THREE.Object3D, bones: Partial<Record<JointName, THREE.Object3D>>) {
    this.root = root;
    this.bones = bones;
    root.updateMatrixWorld(true);
    const rootInverse = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const down = new THREE.Vector3(0, -1, 0);
    const armAlignment: Record<string, THREE.Quaternion> = {};
    for (const side of ['L', 'R']) {
      const arm = bones[`arm${side}` as JointName];
      const forearm = bones[`forearm${side}` as JointName];
      const q = new THREE.Quaternion();
      if (arm && forearm) {
        const dir = forearm.getWorldPosition(new THREE.Vector3()).sub(arm.getWorldPosition(new THREE.Vector3()));
        dir.applyQuaternion(rootInverse).normalize();
        q.setFromUnitVectors(dir, down);
      }
      armAlignment[side] = q;
    }
    for (const joint of ALL_JOINTS) {
      this.target.set(joint, new THREE.Quaternion());
      const bone = bones[joint];
      if (!bone) continue;
      const rest = rootInverse.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
      if (/^(arm|forearm|hand)[LR]$/.test(joint)) rest.premultiply(armAlignment[joint.slice(-1)]);
      this.rest.set(joint, rest);
    }
    this.hipsPosition = bones.hips?.position.clone();
    const depth = (bone: THREE.Object3D): number => { let d = 0; for (let p = bone.parent; p; p = p.parent) d++; return d; };
    this.ordered = ALL_JOINTS.filter((j) => bones[j]).sort((a, b) => depth(bones[a]!) - depth(bones[b]!));
  }

  apply(player: PosePlayer, scale: number): void {
    // Canonical rotations accumulate through the game skeleton, independent of model bind axes.
    for (const joint of ALL_JOINTS) {
      const angles = player.get(joint);
      this.euler.set(...angles);
      this.rotation.setFromEuler(this.euler);
      const parent = PARENT[joint];
      const q = this.target.get(joint)!;
      if (parent) q.copy(this.target.get(parent)!).multiply(this.rotation);
      else q.copy(this.rotation);
    }
    this.root.updateWorldMatrix(true, true);
    const hips = this.bones.hips;
    if (hips && this.hipsPosition) {
      hips.position.copy(this.hipsPosition);
      // Height is in game units along model up, not the Armature's authored local Y.
      this.hipsOffset.set(0, player.curHipsY / (Math.abs(scale) > 0.00001 ? scale : 1), 0);
      this.rootLinear.setFromMatrix4(this.root.matrixWorld);
      this.hipsOffset.applyMatrix3(this.rootLinear);
      if (hips.parent) {
        this.hipsParentInverse.copy(hips.parent.matrixWorld).invert();
        this.hipsParentLinear.setFromMatrix4(this.hipsParentInverse);
        this.hipsOffset.applyMatrix3(this.hipsParentLinear);
      }
      hips.position.add(this.hipsOffset);
    }
    this.root.updateWorldMatrix(true, true);
    this.root.getWorldQuaternion(this.rootRotation);
    for (const joint of this.ordered) {
      const bone = this.bones[joint]!;
      this.world.copy(this.rootRotation).multiply(this.target.get(joint)!).multiply(this.rest.get(joint)!);
      if (bone.parent) {
        bone.parent.getWorldQuaternion(this.parentInverse).invert();
        bone.quaternion.copy(this.parentInverse).multiply(this.world);
      } else bone.quaternion.copy(this.world);
      bone.updateWorldMatrix(false, false);
    }
  }
}
