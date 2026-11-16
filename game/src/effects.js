// Pooled visual effects: tracers, impact sparks, hit puffs and explosions.
// Everything is allocated once at boot and reused, so firing never stutters
// and the frame loop makes no new objects.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_POOL = 24;
const SPARK_POOL = 16;
const PUFF_POOL = 12;
const SHARD_POOL = 36;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0,
    }));
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIdx = 0;

  const sparks = [];
  for (let i = 0; i < SPARK_POOL; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.05),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true }),
    );
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0, vel: new THREE.Vector3() });
  }
  let sparkIdx = 0;

  const puffs = [];
  for (let i = 0; i < PUFF_POOL; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.foe), transparent: true, opacity: 0 }),
    );
    mesh.visible = false;
    scene.add(mesh);
    puffs.push({ mesh, life: 0 });
  }
  let puffIdx = 0;

  const shards = [];
  const shardGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  const shardMat = new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.9 });
  const shardMatHot = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  for (let i = 0; i < SHARD_POOL; i += 1) {
    const mesh = new THREE.Mesh(shardGeo, shardMat);
    mesh.visible = false;
    mesh.castShadow = true;
    scene.add(mesh);
    shards.push({ mesh, life: 0, vel: new THREE.Vector3(), spin: 0 });
  }

  const blastLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 22);
  scene.add(blastLight);
  let blastLife = 0;
  const blastSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false }),
  );
  blastSphere.visible = false;
  scene.add(blastSphere);
  let blastRadius = 0;

  function tracer(from, to) {
    const t = tracers[tracerIdx];
    tracerIdx = (tracerIdx + 1) % TRACER_POOL;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.visible = true;
    t.line.material.opacity = 0.85;
    t.life = 0.07;
  }

  function impact(point, normal) {
    const s = sparks[sparkIdx];
    sparkIdx = (sparkIdx + 1) % SPARK_POOL;
    s.mesh.position.copy(point);
    s.mesh.visible = true;
    s.mesh.material.opacity = 1;
    s.mesh.scale.setScalar(1);
    s.vel.copy(normal).multiplyScalar(3.5);
    s.vel.y += 1.5;
    s.life = 0.28;
  }

  function hitPuff(point) {
    const p = puffs[puffIdx];
    puffIdx = (puffIdx + 1) % PUFF_POOL;
    p.mesh.position.copy(point);
    p.mesh.visible = true;
    p.mesh.material.opacity = 0.85;
    p.mesh.scale.setScalar(1);
    p.life = 0.3;
  }

  function explosion(point) {
    blastSphere.position.copy(point);
    blastSphere.position.y = Math.max(0.6, point.y);
    blastSphere.visible = true;
    blastRadius = 0;
    blastLife = 0.5;
    blastLight.position.copy(point);
    blastLight.position.y = 1.2;
    blastLight.intensity = 60;
    for (let i = 0; i < SHARD_POOL; i += 1) {
      const s = shards[i];
      s.mesh.visible = true;
      s.mesh.position.copy(point);
      s.mesh.position.y = Math.max(0.4, point.y);
      s.mesh.material = i % 3 === 0 ? shardMatHot : shardMat;
      const a = (i / SHARD_POOL) * Math.PI * 2;
      const up = 2.5 + (i % 5);
      s.vel.set(Math.cos(a) * (3 + (i % 4)), up, Math.sin(a) * (3 + (i % 4)));
      s.spin = (i % 7) - 3;
      s.life = 0.7 + (i % 5) * 0.08;
      s.mesh.scale.setScalar(1);
    }
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.line.visible = false; t.line.material.opacity = 0; }
      else t.line.material.opacity = t.life / 0.07 * 0.85;
    }
    for (const s of sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.vel.y -= 9 * dt;
      s.mesh.scale.setScalar(Math.max(0.01, s.life / 0.28));
      if (s.life <= 0) s.mesh.visible = false;
    }
    for (const p of puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.mesh.scale.setScalar(1 + (0.3 - p.life) * 2.2);
      p.mesh.material.opacity = Math.max(0, p.life / 0.3) * 0.85;
      if (p.life <= 0) p.mesh.visible = false;
    }
    if (blastLife > 0) {
      blastLife -= dt;
      blastRadius += dt * 26;
      blastSphere.scale.setScalar(Math.max(0.01, blastRadius));
      blastSphere.material.opacity = Math.max(0, blastLife / 0.5) * 0.55;
      blastLight.intensity = Math.max(0, blastLife / 0.5) * 60;
      if (blastLife <= 0) { blastSphere.visible = false; blastLight.intensity = 0; }
    }
    for (const s of shards) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vel.y -= 12 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      if (s.mesh.position.y < 0.06) { s.mesh.position.y = 0.06; s.vel.y = 0; s.vel.x *= 0.6; s.vel.z *= 0.6; }
      s.mesh.rotation.x += s.spin * dt;
      s.mesh.rotation.y += s.spin * 0.7 * dt;
      if (s.life <= 0) s.mesh.visible = false;
    }
  }

  return { tracer, impact, hitPuff, explosion, step };
}
