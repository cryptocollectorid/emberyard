// Shared helpers: a seeded RNG for deterministic captures, small math, and a
// scratch-vector pool so the hot loops never allocate. Every module imports
// from here instead of making its own throwaway objects.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Breadth-first search over a waypoint graph. Nodes are { x, z, links: [idx] }.
// Returns an array of node indices from start to goal (inclusive), or [].
export function findPath(nodes, start, goal) {
  if (start === goal) return [start];
  const prev = new Int16Array(nodes.length).fill(-1);
  const queue = [start];
  prev[start] = start;
  for (let head = 0; head < queue.length; head += 1) {
    const at = queue[head];
    for (const next of nodes[at].links) {
      if (prev[next] !== -1) continue;
      prev[next] = at;
      if (next === goal) {
        const path = [goal];
        let cur = goal;
        while (cur !== start) {
          cur = prev[cur];
          path.push(cur);
        }
        path.reverse();
        return path;
      }
      queue.push(next);
    }
  }
  return [];
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.hypot(dx, dz);
}
