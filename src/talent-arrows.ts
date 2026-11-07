/** Orthogonal prerequisite arrows that stay in the gaps between talent icons. */

export type Box = {
  id: string;
  row: number;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** True when a line must not pass through this rectangle. */
  filled: boolean;
};

export type Pt = { x: number; y: number };

export type Link = { from: string; to: string; active: boolean };

export type Routed = { from: string; to: string; active: boolean; points: Pt[] };

type Seg = { x1: number; y1: number; x2: number; y2: number };

const NEAR = 0.75;

function cluster(values: number[], tol = 2): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const v of sorted) {
    const g = groups[groups.length - 1];
    if (g && v - g[g.length - 1] <= tol) g.push(v);
    else groups.push([v]);
  }
  return groups.map(g => g.reduce((a, b) => a + b, 0) / g.length);
}

function snap(v: number, axes: number[]): number {
  let best = axes[0];
  let d = Math.abs(v - best);
  for (const a of axes) {
    const n = Math.abs(v - a);
    if (n < d) { best = a; d = n; }
  }
  return d <= 3 ? best : v;
}

function minGap(boxes: Box[]): number {
  const gaps: number[] = [];
  const byRow = new Map<number, Box[]>();
  const byCol = new Map<number, Box[]>();
  for (const b of boxes) {
    const row = byRow.get(b.row) || [];
    row.push(b);
    byRow.set(b.row, row);
    const col = byCol.get(b.col) || [];
    col.push(b);
    byCol.set(b.col, col);
  }
  for (const list of byRow.values()) {
    list.sort((a, b) => a.x - b.x);
    for (let i = 1; i < list.length; i++) gaps.push(list[i].x - (list[i - 1].x + list[i - 1].w));
  }
  for (const list of byCol.values()) {
    list.sort((a, b) => a.y - b.y);
    for (let i = 1; i < list.length; i++) gaps.push(list[i].y - (list[i - 1].y + list[i - 1].h));
  }
  const positive = gaps.filter(g => g > 4);
  if (!positive.length) return 14;
  return Math.min(...positive);
}

function hitsFilled(x1: number, y1: number, x2: number, y2: number, boxes: Box[], pad: number): boolean {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  const vertical = Math.abs(x1 - x2) <= NEAR;
  for (const b of boxes) {
    if (!b.filled) continue;
    const L = b.x - pad;
    const R = b.x + b.w + pad;
    const T = b.y - pad;
    const B = b.y + b.h + pad;
    if (vertical) {
      if (x1 <= L || x1 >= R) continue;
      if (maxY <= T || minY >= B) continue;
      return true;
    }
    if (y1 <= T || y1 >= B) continue;
    if (maxX <= L || minX >= R) continue;
    return true;
  }
  return false;
}

function overlaps(a: Seg, b: Seg): boolean {
  const aH = Math.abs(a.y1 - a.y2) <= NEAR;
  const bH = Math.abs(b.y1 - b.y2) <= NEAR;
  if (aH !== bH) return false;
  if (aH) {
    if (Math.abs(a.y1 - b.y1) > 1.5) return false;
    const lo = Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2));
    const hi = Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2));
    return hi - lo > 2;
  }
  if (Math.abs(a.x1 - b.x1) > 1.5) return false;
  const lo = Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2));
  const hi = Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2));
  return hi - lo > 2;
}

function crosses(a: Seg, b: Seg): boolean {
  const aH = Math.abs(a.y1 - a.y2) <= NEAR;
  const bH = Math.abs(b.y1 - b.y2) <= NEAR;
  if (aH === bH) return false;
  const h = aH ? a : b;
  const v = aH ? b : a;
  const hx0 = Math.min(h.x1, h.x2);
  const hx1 = Math.max(h.x1, h.x2);
  const vy0 = Math.min(v.y1, v.y2);
  const vy1 = Math.max(v.y1, v.y2);
  return v.x1 > hx0 + 1 && v.x1 < hx1 - 1 && h.y1 > vy0 + 1 && h.y1 < vy1 - 1;
}

function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const n = out.length;
    if (n >= 1) {
      const last = out[n - 1];
      if (Math.abs(last.x - p.x) < 0.4 && Math.abs(last.y - p.y) < 0.4) continue;
    }
    if (n >= 2) {
      const a = out[n - 2];
      const b = out[n - 1];
      const sameX = Math.abs(a.x - b.x) < 0.4 && Math.abs(b.x - p.x) < 0.4;
      const sameY = Math.abs(a.y - b.y) < 0.4 && Math.abs(b.y - p.y) < 0.4;
      if (sameX || sameY) { out[n - 1] = p; continue; }
    }
    out.push(p);
  }
  return out;
}

type Edge = { to: number; dir: 1 | 2; len: number; seg: Seg };

function routeOne(from: Box, to: Box, boxes: Box[], taken: Seg[]): Pt[] | null {
  const gap = minGap(boxes);
  const pad = Math.max(1.6, Math.min(3.6, gap * 0.26));
  const port = Math.max(1.4, Math.min(pad + 0.8, gap * 0.4));
  const filled = boxes.filter(b => b.filled);

  const xs = cluster(boxes.map(b => b.x + b.w / 2));
  const ys = cluster(boxes.map(b => b.y + b.h / 2));

  const byCol = new Map<number, Box[]>();
  for (const b of boxes) {
    const list = byCol.get(b.col) || [];
    list.push(b);
    byCol.set(b.col, list);
  }
  const cols = [...byCol.keys()].sort((a, b) => a - b);
  for (let i = 0; i < cols.length - 1; i++) {
    const left = byCol.get(cols[i])![0];
    const right = byCol.get(cols[i + 1])![0];
    const gutter = left.x + left.w + (right.x - (left.x + left.w)) / 2;
    if (!xs.some(x => Math.abs(x - gutter) < 2)) xs.push(gutter);
  }
  const byRow = new Map<number, Box[]>();
  for (const b of boxes) {
    const list = byRow.get(b.row) || [];
    list.push(b);
    byRow.set(b.row, list);
  }
  const rows = [...byRow.keys()].sort((a, b) => a - b);
  for (let i = 0; i < rows.length - 1; i++) {
    const top = byRow.get(rows[i])![0];
    const bot = byRow.get(rows[i + 1])![0];
    const gutter = top.y + top.h + (bot.y - (top.y + top.h)) / 2;
    if (!ys.some(y => Math.abs(y - gutter) < 2)) ys.push(gutter);
  }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);

  const nodes: Pt[] = [];
  const at = new Map<string, number>();
  const addNode = (x: number, y: number, lockX = true, lockY = true) => {
    const sx = lockX ? snap(x, xs) : x;
    const sy = lockY ? snap(y, ys) : y;
    const k = `${sx.toFixed(1)},${sy.toFixed(1)}`;
    const prev = at.get(k);
    if (prev !== undefined) return prev;
    const i = nodes.length;
    nodes.push({ x: sx, y: sy });
    at.set(k, i);
    return i;
  };

  for (const x of xs) for (const y of ys) addNode(x, y);

  const portIndex = (box: Box, side: 'n' | 's' | 'e' | 'w') => {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    // Keep the outward coordinate exact so the arrowhead meets the icon instead of a gutter.
    if (side === 'n') return addNode(cx, box.y - port, true, false);
    if (side === 's') return addNode(cx, box.y + box.h + port, true, false);
    if (side === 'w') return addNode(box.x - port, cy, false, true);
    return addNode(box.x + box.w + port, cy, false, true);
  };

  const starts = (['n', 's', 'e', 'w'] as const).map(s => portIndex(from, s));
  const goals = new Set((['n', 's', 'e', 'w'] as const).map(s => portIndex(to, s)));

  const adj: Edge[][] = nodes.map(() => []);
  const link = (i: number, j: number, dir: 1 | 2) => {
    if (i === j) return;
    const a = nodes[i];
    const b = nodes[j];
    if (hitsFilled(a.x, a.y, b.x, b.y, filled, pad)) return;
    const len = Math.hypot(a.x - b.x, a.y - b.y);
    if (len < 0.4) return;
    adj[i].push({ to: j, dir, len, seg: { x1: a.x, y1: a.y, x2: b.x, y2: b.y } });
  };

  const byX = new Map<string, number[]>();
  const byY = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    const xk = n.x.toFixed(1);
    const yk = n.y.toFixed(1);
    const vx = byX.get(xk) || [];
    vx.push(i);
    byX.set(xk, vx);
    const hy = byY.get(yk) || [];
    hy.push(i);
    byY.set(yk, hy);
  });
  for (const list of byX.values()) {
    list.sort((i, j) => nodes[i].y - nodes[j].y);
    for (let k = 1; k < list.length; k++) { link(list[k - 1], list[k], 2); link(list[k], list[k - 1], 2); }
  }
  for (const list of byY.values()) {
    list.sort((i, j) => nodes[i].x - nodes[j].x);
    for (let k = 1; k < list.length; k++) { link(list[k - 1], list[k], 1); link(list[k], list[k - 1], 1); }
  }

  const key = (n: number, d: number) => n * 3 + d;
  const dist = new Map<number, number>();
  const prev = new Map<number, { n: number; d: number } | null>();
  type Q = { n: number; d: number; c: number };
  const pq: Q[] = [];
  for (const s of starts) {
    dist.set(key(s, 0), 0);
    prev.set(key(s, 0), null);
    pq.push({ n: s, d: 0, c: 0 });
  }

  let bestGoal: { n: number; d: number; c: number } | null = null;
  while (pq.length) {
    let bi = 0;
    for (let i = 1; i < pq.length; i++) if (pq[i].c < pq[bi].c) bi = i;
    const cur = pq.splice(bi, 1)[0];
    if (cur.c !== dist.get(key(cur.n, cur.d))) continue;
    if (goals.has(cur.n) && cur.d !== 0 && (!bestGoal || cur.c < bestGoal.c)) bestGoal = cur;
    for (const e of adj[cur.n]) {
      let extra = 0;
      if (cur.d !== 0 && cur.d !== e.dir) extra += 18;
      for (const t of taken) {
        if (overlaps(e.seg, t)) extra += 900;
        else if (crosses(e.seg, t)) extra += 900;
      }
      const nc = cur.c + e.len + extra;
      const nk = key(e.to, e.dir);
      const old = dist.get(nk);
      if (old === undefined || nc + 0.01 < old) {
        dist.set(nk, nc);
        prev.set(nk, { n: cur.n, d: cur.d });
        pq.push({ n: e.to, d: e.dir, c: nc });
      }
    }
  }
  if (!bestGoal) return null;

  const pts: Pt[] = [];
  let walk: { n: number; d: number } | null = { n: bestGoal.n, d: bestGoal.d };
  const guard = new Set<number>();
  while (walk && !guard.has(key(walk.n, walk.d))) {
    guard.add(key(walk.n, walk.d));
    pts.push(nodes[walk.n]);
    walk = prev.get(key(walk.n, walk.d)) || null;
  }
  pts.reverse();
  return simplify(pts);
}

function segmentsOf(pts: Pt[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 1; i < pts.length; i++) out.push({ x1: pts[i - 1].x, y1: pts[i - 1].y, x2: pts[i].x, y2: pts[i].y });
  return out;
}

/** Route every link. Shorter, axis-aligned links claim the direct lane first. */
export function routeLinks(links: Link[], boxes: Box[]): Routed[] {
  const byId = new Map(boxes.map(b => [b.id, b]));
  const ordered = [...links].sort((a, b) => {
    const A = byId.get(a.from);
    const B = byId.get(a.to);
    const C = byId.get(b.from);
    const D = byId.get(b.to);
    const span = (p?: Box, q?: Box) => !p || !q ? 99 : Math.abs(p.row - q.row) + Math.abs(p.col - q.col) * 2;
    return span(A, B) - span(C, D);
  });
  const taken: Seg[] = [];
  const out: Routed[] = [];
  for (const link of ordered) {
    const from = byId.get(link.from);
    const to = byId.get(link.to);
    if (!from || !to) continue;
    const points = routeOne(from, to, boxes, taken);
    if (!points || points.length < 2) continue;
    taken.push(...segmentsOf(points));
    out.push({ from: link.from, to: link.to, active: link.active, points });
  }
  return out;
}
