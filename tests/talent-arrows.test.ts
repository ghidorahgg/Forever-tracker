import { readFileSync } from 'node:fs';
import { routeLinks, type Box, type Link } from '../src/talent-arrows.ts';
import { decode, encode, type TalentClass, type TalentData } from '../src/talents.ts';

const data = JSON.parse(readFileSync(new URL('../src/data/talents.json', import.meta.url), 'utf8')) as TalentData;

const ICON = 60;
const GAP_X = 14;
const GAP_Y = 18;
const ORIGIN = 8;

function layout(cls: TalentClass, treeIndex: number) {
  const tree = cls.trees[treeIndex];
  const boxes: Box[] = [];
  for (let row = 1; row <= data.meta.rows; row++) {
    for (let col = 1; col <= tree.cols; col++) {
      const talent = tree.talents.find(t => t.row === row && t.col === col);
      boxes.push({
        id: talent ? talent.id : `empty-${tree.id}-${row}-${col}`,
        row,
        col,
        x: ORIGIN + (col - 1) * (ICON + GAP_X),
        y: ORIGIN + (row - 1) * (ICON + GAP_Y),
        w: ICON,
        h: ICON,
        filled: Boolean(talent),
      });
    }
  }
  const links: Link[] = tree.talents.filter(t => t.req).map(t => ({ from: t.req!, to: t.id, active: false }));
  return { tree, boxes, links };
}

function vertical(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.x - b.x) < 1;
}
function horizontal(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.y - b.y) < 1;
}

function hits(x1: number, y1: number, x2: number, y2: number, box: Box, pad: number) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  const L = box.x - pad;
  const R = box.x + box.w + pad;
  const T = box.y - pad;
  const B = box.y + box.h + pad;
  if (Math.abs(x1 - x2) <= 0.75) return x1 > L && x1 < R && maxY > T && minY < B;
  return y1 > T && y1 < B && maxX > L && minX < R;
}

function crosses(a1: { x: number; y: number }, a2: { x: number; y: number }, b1: { x: number; y: number }, b2: { x: number; y: number }) {
  const aH = Math.abs(a1.y - a2.y) < 1;
  const bH = Math.abs(b1.y - b2.y) < 1;
  if (aH === bH) return false;
  const h1 = aH ? a1 : b1;
  const h2 = aH ? a2 : b2;
  const v1 = aH ? b1 : a1;
  const v2 = aH ? b2 : a2;
  const hx0 = Math.min(h1.x, h2.x);
  const hx1 = Math.max(h1.x, h2.x);
  const vy0 = Math.min(v1.y, v2.y);
  const vy1 = Math.max(v1.y, v2.y);
  return v1.x > hx0 + 1 && v1.x < hx1 - 1 && h1.y > vy0 + 1 && h1.y < vy1 - 1;
}

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failed++; console.error('FAIL', msg); }
}

for (const cls of data.classes) {
  const empty = encode(cls, {});
  const back = decode(cls, empty, data.meta.points);
  assert(back !== null && Object.keys(back).length === 0, `${cls.id} empty roundtrip`);
  for (let i = 0; i < cls.trees.length; i++) {
    const { tree, boxes, links } = layout(cls, i);
    const routed = routeLinks(links, boxes);
    assert(routed.length === links.length, `${cls.id}/${tree.name} routed ${routed.length}/${links.length}`);
    const byId = new Map(boxes.map(b => [b.id, b]));
    for (const arrow of routed) {
      const from = byId.get(arrow.from)!;
      const to = byId.get(arrow.to)!;
      for (let s = 1; s < arrow.points.length; s++) {
        const p = arrow.points[s - 1];
        const q = arrow.points[s];
        assert(vertical(p, q) || horizontal(p, q), `${cls.id}/${tree.name} ${arrow.from}->${arrow.to} diagonal`);
        for (const box of boxes) {
          if (!box.filled) continue;
          if (hits(p.x, p.y, q.x, q.y, box, 1.2)) {
            assert(false, `${cls.id}/${tree.name} ${arrow.from}->${arrow.to} crosses ${box.id}`);
          }
        }
      }
      const end = arrow.points[arrow.points.length - 1];
      const prev = arrow.points[arrow.points.length - 2];
      const tcx = to.x + to.w / 2;
      const tcy = to.y + to.h / 2;
      const gapToBox = (p: { x: number; y: number }, box: Box) => {
        const dx = p.x < box.x ? box.x - p.x : p.x > box.x + box.w ? p.x - (box.x + box.w) : 0;
        const dy = p.y < box.y ? box.y - p.y : p.y > box.y + box.h ? p.y - (box.y + box.h) : 0;
        return Math.hypot(dx, dy);
      };
      const endGap = gapToBox(end, to);
      const closer = Math.hypot(end.x - tcx, end.y - tcy) < Math.hypot(prev.x - tcx, prev.y - tcy) - 0.4;
      assert(endGap > 0.4 && endGap < 8 && closer, `${cls.id}/${tree.name} ${arrow.from}->${arrow.to} arrowhead misses the talent (${endGap.toFixed(1)})`);
      if (from.col === to.col && from.row !== to.row) {
        assert(arrow.points.length === 2 && vertical(arrow.points[0], arrow.points[1]),
          `${cls.id}/${tree.name} ${arrow.from}->${arrow.to} should be a straight column, got ${arrow.points.length} pts`);
      }
      if (from.row === to.row && from.col !== to.col) {
        assert(arrow.points.length === 2 && horizontal(arrow.points[0], arrow.points[1]),
          `${cls.id}/${tree.name} ${arrow.from}->${arrow.to} should be a straight row, got ${JSON.stringify(arrow.points)}`);
      }
    }
    for (let a = 0; a < routed.length; a++) {
      for (let b = a + 1; b < routed.length; b++) {
        const A = routed[a].points;
        const B = routed[b].points;
        for (let i = 1; i < A.length; i++) {
          for (let j = 1; j < B.length; j++) {
            if (crosses(A[i - 1], A[i], B[j - 1], B[j])) {
              assert(false, `${cls.id}/${tree.name} crossing ${routed[a].from}->${routed[a].to} x ${routed[b].from}->${routed[b].to}`);
            }
          }
        }
      }
    }
  }
}

if (failed) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
}
console.log(`ok ${data.classes.length} classes, arrows clear`);
