import * as THREE from './three.module.js';
import runtime from './runtime.js';
import {world} from './world.js';
import physicsManager from './physics-manager.js';
import {rigManager} from './rig.js';

const localVector = new THREE.Vector3();
const localEuler = new THREE.Euler();

class NpcManager {
  constructor() {
    this.npcs = [];
  }
  async addNpc(o, componentIndex) {
    const npc = await world.addNpc(o.contentId, null, o.position, o.quaternion);
    
    const mesh = npc;
    const animations = mesh.getAnimations();
    const component = mesh.getComponents()[componentIndex];
    let  {idleAnimation = ['idle'], aggroDistance, walkSpeed = 1} = component;
    if (idleAnimation) {
      if (!Array.isArray(idleAnimation)) {
        idleAnimation = [idleAnimation];
      }
    } else {
      idleAnimation = [];
    }

    const idleAnimationClips = idleAnimation.map(name => animations.find(a => a.name === name)).filter(a => !!a);
    // console.log('got clips', npc, idleAnimationClips);
    const updateFns = [];
    if (idleAnimationClips.length > 0) {
      // hacks
      {
        mesh.position.y = 0;
        localEuler.setFromQuaternion(mesh.quaternion, 'YXZ');
        localEuler.x = 0;
        localEuler.z = 0;
        mesh.quaternion.setFromEuler(localEuler);
      }
      
      const mixer = new THREE.AnimationMixer(mesh);
      const idleActions = idleAnimationClips.map(idleAnimationClip => mixer.clipAction(idleAnimationClip));
      for (const idleAction of idleActions) {
        idleAction.play();
      }
      
      updateFns.push(timeDiff => {
        const deltaSeconds = timeDiff / 1000;
        mixer.update(deltaSeconds);
      });
    }

    let animation = null;
    updateFns.push(timeDiff => {
      const _updatePhysics = () => {
        const physicsIds = mesh.getPhysicsIds();
        for (const physicsId of physicsIds) {
          physicsManager.setPhysicsTransform(physicsId, mesh.position, mesh.quaternion, mesh.scale);
        }
      };

      if (animation) {
        mesh.position.add(localVector.copy(animation.velocity).multiplyScalar(timeDiff/1000));
        console.log('velo update', timeDiff, mesh.position.toArray(), animation.velocity.toArray());
        animation.velocity.add(localVector.copy(physicsManager.getGravity()).multiplyScalar(timeDiff/1000));
        if (mesh.position.y < 0) {
          animation = null;
        }
        
        _updatePhysics();
      } else {
        const head = rigManager.localRig.model.isVrm ? rigManager.localRig.modelBones.Head : rigManager.localRig.model;
        const position = head.getWorldPosition(localVector);
        position.y = 0;
        const distance = mesh.position.distanceTo(position);
        const minDistance = 1;
        let moveDelta;
        if (distance > minDistance) {
          const direction = position.clone().sub(mesh.position).normalize();
          const maxMoveDistance = distance - minDistance;
          const moveDistance = Math.min(walkSpeed * timeDiff * 1000, maxMoveDistance);
          moveDelta = direction.clone().multiplyScalar(moveDistance);
          mesh.position.add(moveDelta);
          mesh.quaternion.slerp(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction), 0.1);
          
          _updatePhysics();
        } else {
          moveDelta = new THREE.Vector3();
        }
      }
    });
    npc.addEventListener('hit', e => {
      const euler = new THREE.Euler().setFromQuaternion(e.quaternion, 'YXZ');
      euler.x = 0;
      euler.z = 0;
      const quaternion = new THREE.Quaternion().setFromEuler(euler);
      const hitSpeed = 1;
      animation = {
        velocity: new THREE.Vector3(0, 6, -1).applyQuaternion(quaternion).multiplyScalar(hitSpeed),
      };
    });
    npc.update = timeDiff => {
      for (const fn of updateFns) {
        fn(timeDiff);
      }
    };
    this.npcs.push(npc);
  }
  removeNpc(npc) {
    throw new Error('not implemented');
  }
  update(timeDiff) {
    for (const npc of this.npcs) {
      npc.update(timeDiff);
    }
  }
}
const npcManager = new NpcManager();
export default npcManager;