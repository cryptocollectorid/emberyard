// The objective: one Ember carrier plants a charge at Silo or Crane, Vanguard
// defuses it. Plant takes 3 s in the site, defuse 5 s, and the charge blows
// 35 s after the plant. The bomb is a small blinking device; its state is
// the round's second win condition beside elimination.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const PLANT_SECONDS = 3;
const DEFUSE_SECONDS = 5;
const BOMB_SECONDS = 35;

export function createObjective(scene, audio) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.28, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.5, metalness: 0.5 }),
  );
  body.position.y = 0.14;
  body.castShadow = true;
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.foe) }),
  );
  lamp.position.set(0.18, 0.32, 0);
  const beepLight = new THREE.PointLight(new THREE.Color(PALETTE.foe), 0, 5);
  beepLight.position.set(0, 0.6, 0);
  group.add(body, lamp, beepLight);

  const state = {
    status: 'idle', // idle | planted | defused | exploded
    site: null,
    position: new THREE.Vector3(),
    timer: 0,
    plantProgress: 0,
    defuseProgress: 0,
    beepAt: 0,
  };

  function reset() {
    state.status = 'idle';
    state.site = null;
    state.timer = 0;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    state.beepAt = 0;
    group.visible = false;
    beepLight.intensity = 0;
  }

  function plantAt(site, position) {
    state.status = 'planted';
    state.site = site;
    state.position.copy(position);
    state.position.y = 0;
    state.timer = BOMB_SECONDS;
    state.beepAt = 0;
    group.position.copy(state.position);
    group.visible = true;
  }

  function defuse() {
    state.status = 'defused';
    state.timer = 0;
    group.visible = false;
    beepLight.intensity = 0;
  }

  function step(dt, time, onExplode) {
    if (state.status !== 'planted') return;
    state.timer -= dt;
    const blink = Math.sin(time * 10) > 0;
    lamp.material.color.set(blink ? PALETTE.foe : '#3a0d0d');
    beepLight.intensity = blink ? 2.5 : 0;
    if (state.timer <= 10 && time >= state.beepAt) {
      state.beepAt = time + 1;
      audio.plantBeep();
    }
    if (state.timer <= 0) {
      state.status = 'exploded';
      group.visible = false;
      beepLight.intensity = 0;
      onExplode(state.position);
    }
  }

  return {
    state,
    reset,
    plantAt,
    defuse,
    step,
    plantSeconds: PLANT_SECONDS,
    defuseSeconds: DEFUSE_SECONDS,
    bombSeconds: BOMB_SECONDS,
  };
}
