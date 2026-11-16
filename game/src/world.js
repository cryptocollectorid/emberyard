// Rustyard: an original industrial depot map, 64 x 48 m, built from boxes and
// cylinders. Two plant sites (Silo west, Crane east), three lanes (west, mid,
// east), and cover that breaks sightlines without closing them. Every solid
// is an AABB collider for players and bots and a surface bullets stop on.
// Flat ground (y = 0) keeps movement and bot pathing robust.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WALL_H = 5;
const BOUND_X = 32;
const BOUND_Z = 24;

// Waypoint graph bots navigate on. Links are bidirectional.
const WAYPOINTS = [
  { x: 0, z: -21, links: [1, 2, 7] }, // 0 ember spawn
  { x: 0, z: -17, links: [0, 2, 7, 12] }, // 1 ember yard
  { x: -26, z: -18, links: [0, 1, 3] }, // 2 west top
  { x: -26, z: -10, links: [2, 4, 17] }, // 3 west site A approach
  { x: -26, z: -2, links: [3, 5, 23] }, // 4 west mid
  { x: -26, z: 6, links: [4, 6, 19] }, // 5 west low
  { x: -26, z: 14, links: [5, 19, 25] }, // 6 west vanguard side
  { x: 26, z: -18, links: [0, 1, 8] }, // 7 east top
  { x: 26, z: -10, links: [7, 9, 20, 22] }, // 8 east site B approach
  { x: 26, z: -2, links: [8, 10, 24] }, // 9 east mid
  { x: 26, z: 6, links: [9, 11, 22, 24] }, // 10 east low
  { x: 26, z: 14, links: [10, 26] }, // 11 east vanguard side
  { x: 0, z: -14, links: [1, 13, 28, 29] }, // 12 mid top
  { x: 0, z: -8, links: [12, 14, 28, 29] }, // 13 mid site fork
  { x: 0, z: 0, links: [13, 15, 23, 24] }, // 14 mid
  { x: 0, z: 8, links: [14, 16, 23, 24] }, // 15 mid low
  { x: 0, z: 14, links: [15, 25, 26, 27] }, // 16 mid vanguard
  { x: -21, z: -12, links: [3, 18, 19, 28] }, // 17 site A
  { x: -16, z: -12, links: [17, 28] }, // 18 site A door
  { x: -21, z: -5, links: [17, 4, 5] }, // 19 site A south
  { x: 21, z: -12, links: [8, 21, 22, 29] }, // 20 site B
  { x: 16, z: -12, links: [20, 29] }, // 21 site B door
  { x: 21, z: -5, links: [20, 9, 10] }, // 22 site B south
  { x: -8, z: 0, links: [14, 15, 28] }, // 23 west connector
  { x: 8, z: 0, links: [14, 15, 29] }, // 24 east connector
  { x: -8, z: 17, links: [16, 6, 27] }, // 25 vanguard west
  { x: 8, z: 17, links: [16, 11, 27] }, // 26 vanguard east
  { x: 0, z: 21, links: [25, 26] }, // 27 vanguard spawn
  { x: -14, z: -8, links: [13, 17, 23] }, // 28 west-mid link
  { x: 14, z: -8, links: [13, 20, 24] }, // 29 east-mid link
];
const SITES = [
  { id: 'A', name: 'SILO', center: new THREE.Vector3(-21, 0, -12), radius: 6.5 },
  { id: 'B', name: 'CRANE', center: new THREE.Vector3(21, 0, -12), radius: 6.5 },
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const mat = {};
  for (const name of Object.keys(PALETTE)) {
    mat[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const rust = new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.85, metalness: 0.15 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x5a646e, roughness: 0.45, metalness: 0.55 });
  const containerTeal = new THREE.MeshStandardMaterial({ color: 0x2e7f74, roughness: 0.7, metalness: 0.2 });
  const containerRust = new THREE.MeshStandardMaterial({ color: 0x9a4a2e, roughness: 0.7, metalness: 0.2 });

  const colliders = [];
  const shootables = [];
  const mapRects = [];

  function box(w, h, d, x, y, z, material, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
      mapRects.push({ x: x - w / 2, z: z - d / 2, w, d });
    }
    return mesh;
  }

  function cylinder(r, h, x, z, material) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18), material);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    // AABB approximation for collision and bullets.
    colliders.push(new THREE.Box3(new THREE.Vector3(x - r, 0, z - r), new THREE.Vector3(x + r, h, z + r)));
    shootables.push(mesh);
    mapRects.push({ x: x - r, z: z - r, w: r * 2, d: r * 2 });
    return mesh;
  }

  // Floor: two-tone checker slabs so movement and distance read at a glance.
  const slab = 4;
  for (let ix = -8; ix < 8; ix += 1) {
    for (let iz = -6; iz < 6; iz += 1) {
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(slab, 0.1, slab),
        (ix + iz) % 2 === 0 ? mat.canvas : mat.surface,
      );
      tile.position.set(ix * slab + 2, -0.05, iz * slab + 2);
      tile.receiveShadow = true;
      group.add(tile);
    }
  }

  // Perimeter walls.
  box(2 * BOUND_X + 0.8, WALL_H, 0.8, 0, WALL_H / 2, -BOUND_Z - 0.4, mat.surface);
  box(2 * BOUND_X + 0.8, WALL_H, 0.8, 0, WALL_H / 2, BOUND_Z + 0.4, mat.surface);
  box(0.8, WALL_H, 2 * BOUND_Z + 0.8, -BOUND_X - 0.4, WALL_H / 2, 0, mat.surface);
  box(0.8, WALL_H, 2 * BOUND_Z + 0.8, BOUND_X + 0.4, WALL_H / 2, 0, mat.surface);

  // Interior walls that make corners and split the lanes.
  box(0.6, 3.4, 10, -12, 1.7, -14, mat.surface);
  box(0.6, 3.4, 10, 12, 1.7, -14, mat.surface);
  box(10, 3.4, 0.6, -12, 1.7, 4, mat.surface);
  box(10, 3.4, 0.6, 12, 1.7, 4, mat.surface);
  box(0.6, 3.0, 8, -6, 1.5, 12, mat.surface);
  box(0.6, 3.0, 8, 6, 1.5, 12, mat.surface);

  // Site A: two grain silos + crate cover.
  cylinder(2.2, 6.5, -25, -15, steel);
  cylinder(2.2, 5.2, -19, -17.5, rust);
  box(6, 2.6, 2.4, -24, 1.3, -7.5, containerTeal);
  box(2.4, 1.2, 1.2, -17.5, 0.6, -9.5, mat.hairline);
  box(1.2, 1.2, 1.2, -23.5, 0.6, -11.5, mat.hairline);
  box(1.2, 0.9, 1.2, -18.5, 0.45, -14.5, mat.hairline);

  // Site B: a gantry crane (legs + beam) + container cover.
  box(0.8, 7, 0.8, 17.5, 3.5, -16.5, steel);
  box(0.8, 7, 0.8, 24.5, 3.5, -16.5, steel);
  box(8.4, 0.8, 1.0, 21, 7.2, -16.5, steel);
  box(6, 2.6, 2.4, 24, 1.3, -7.5, containerRust);
  box(2.4, 1.2, 1.2, 17.5, 0.6, -9.5, mat.hairline);
  box(1.2, 1.2, 1.2, 23.5, 0.6, -11.5, mat.hairline);
  box(1.2, 0.9, 1.2, 18.5, 0.45, -14.5, mat.hairline);

  // Mid cover: a pillar kept off the centre line so the x = 0 lane stays
  // walkable, crate stacks and low walls.
  box(1.4, 4.2, 1.4, 3, 2.1, -4, mat.hairline);
  box(2.4, 1.2, 1.2, -3.5, 0.6, 1.5, mat.hairline);
  box(1.2, 1.2, 1.2, -3.5, 1.8, 1.5, mat.hairline);
  box(2.4, 1.2, 1.2, 4, 0.6, -1.5, mat.hairline);
  box(3.6, 1.1, 1.2, -8, 0.55, 8.5, mat.hairline);
  box(3.6, 1.1, 1.2, 8, 0.55, 8.5, mat.hairline);
  box(1.6, 0.8, 1.6, -26, 0.4, 2, mat.hairline);
  box(1.6, 0.8, 1.6, 26, 0.4, 2, mat.hairline);
  box(1.6, 0.8, 1.6, -14, 0.4, -18, mat.hairline);
  box(1.6, 0.8, 1.6, 14, 0.4, -18, mat.hairline);

  // Site markers: flat accent strips on the floor so a site reads from afar.
  for (const site of SITES) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.06, 0.5),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
    );
    strip.position.set(site.center.x, 0.03, site.center.z + 3.4);
    group.add(strip);
  }

  // Light: warm key from the south-east, cool fill from the north, sky gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.45);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 2.5);
  key.position.set(18, 26, 16);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -38;
  key.shadow.camera.right = 38;
  key.shadow.camera.top = 30;
  key.shadow.camera.bottom = -30;
  key.shadow.camera.far = 80;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.65);
  fill.position.set(-14, 18, -20);
  scene.add(fill);

  // Axis-separated circle-vs-AABB movement used by the player and the bots.
  const probe = { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  function overlaps(x, z, radius, height) {
    probe.minX = x - radius;
    probe.maxX = x + radius;
    probe.minZ = z - radius;
    probe.maxZ = z + radius;
    for (const c of colliders) {
      if (c.max.y < 0.05 || c.min.y > height) continue;
      if (probe.maxX > c.min.x && probe.minX < c.max.x && probe.maxZ > c.min.z && probe.minZ < c.max.z) return true;
    }
    return false;
  }

  function moveBody(pos, radius, height, dx, dz) {
    const nx = pos.x + dx;
    if (!overlaps(nx, pos.z, radius, height)) pos.x = nx;
    const nz = pos.z + dz;
    if (!overlaps(pos.x, nz, radius, height)) pos.z = nz;
    pos.x = Math.max(-BOUND_X + radius, Math.min(BOUND_X - radius, pos.x));
    pos.z = Math.max(-BOUND_Z + radius, Math.min(BOUND_Z - radius, pos.z));
  }

  // Segment vs AABB test (slab method) for line of sight.
  function segmentBlocked(ax, ay, az, bx, by, bz) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    for (const c of colliders) {
      let tmin = 0;
      let tmax = 1;
      const mins = [c.min.x, c.min.y, c.min.z];
      const maxs = [c.max.x, c.max.y, c.max.z];
      const os = [ax, ay, az];
      const ds = [dx, dy, dz];
      let hit = true;
      for (let i = 0; i < 3; i += 1) {
        if (Math.abs(ds[i]) < 1e-9) {
          if (os[i] < mins[i] || os[i] > maxs[i]) { hit = false; break; }
        } else {
          let t1 = (mins[i] - os[i]) / ds[i];
          let t2 = (maxs[i] - os[i]) / ds[i];
          if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
          if (t1 > tmin) tmin = t1;
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) { hit = false; break; }
        }
      }
      if (hit && tmax > 0 && tmin < 1) return true;
    }
    return false;
  }

  return {
    colliders,
    shootables,
    waypoints: WAYPOINTS,
    sites: SITES,
    mapRects,
    bounds: { x: BOUND_X, z: BOUND_Z },
    spawns: {
      vanguard: [
        new THREE.Vector3(-4, 0, 21), new THREE.Vector3(-1.5, 0, 21.5),
        new THREE.Vector3(1.5, 0, 21.5), new THREE.Vector3(4, 0, 21),
        new THREE.Vector3(0, 0, 19.5),
      ],
      ember: [
        new THREE.Vector3(-4, 0, -21), new THREE.Vector3(-1.5, 0, -21.5),
        new THREE.Vector3(1.5, 0, -21.5), new THREE.Vector3(4, 0, -21),
        new THREE.Vector3(0, 0, -19.5),
      ],
    },
    moveBody,
    overlaps,
    lineOfSight(ax, ay, az, bx, by, bz) {
      return !segmentBlocked(ax, ay, az, bx, by, bz);
    },
    siteAt(x, z) {
      for (const site of SITES) {
        const d = Math.hypot(x - site.center.x, z - site.center.z);
        if (d <= site.radius) return site;
      }
      return null;
    },
    nearestWaypoint(x, z) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < WAYPOINTS.length; i += 1) {
        const d = (WAYPOINTS[i].x - x) ** 2 + (WAYPOINTS[i].z - z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    },
  };
}
