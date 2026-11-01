export type TalentStatus = 'same' | 'changed' | 'new';

export type Talent = {
  id: string;
  name: string;
  row: number;
  col: number;
  max: number;
  ranks: string[];
  req?: string;
  status: TalentStatus;
  src?: string[];
  cost?: string;
  note?: string;
};

export type TalentTree = {
  id: string;
  name: string;
  cols: number;
  confirmed: boolean;
  note?: string;
  talents: Talent[];
};

export type TalentClass = {
  id: string;
  name: string;
  note?: string;
  trees: TalentTree[];
};

export type TalentData = {
  meta: {
    points: number;
    firstLevel: number;
    tierPoints: number;
    rows: number;
    clientBuild: string;
    hotfix: string;
    rule: string;
  };
  classes: TalentClass[];
};

export type Plan = Record<string, number>;

const byId = (cls: TalentClass) => {
  const map = new Map<string, { talent: Talent; tree: TalentTree }>();
  for (const tree of cls.trees) for (const talent of tree.talents) map.set(talent.id, { talent, tree });
  return map;
};

export const spent = (plan: Plan) => Object.values(plan).reduce((a, b) => a + b, 0);

export const treeSpent = (tree: TalentTree, plan: Plan) =>
  tree.talents.reduce((a, t) => a + (plan[t.id] || 0), 0);

/** Level that can spend this many points. Zero points needs no talent level. */
export const requiredLevel = (points: number, firstLevel: number) =>
  points <= 0 ? 1 : firstLevel - 1 + points;

export function lockReason(cls: TalentClass, plan: Plan, talent: Talent, cap: number): string | null {
  const found = byId(cls).get(talent.id);
  if (!found) return 'Unknown talent';
  const rank = plan[talent.id] || 0;
  if (rank >= talent.max) return null;
  if (spent(plan) >= cap) return `All ${cap} points are spent`;
  const others = treeSpent(found.tree, plan) - rank;
  const need = (talent.row - 1) * 5;
  if (others < need) return `Needs ${need} points in ${found.tree.name}`;
  if (talent.req) {
    const pre = byId(cls).get(talent.req);
    if (!pre || (plan[pre.talent.id] || 0) < pre.talent.max)
      return `Needs ${pre ? pre.talent.max : 1}/${pre ? pre.talent.max : 1} ${pre ? pre.talent.name : talent.req}`;
  }
  return null;
}

export function canAdd(cls: TalentClass, plan: Plan, talent: Talent, cap: number) {
  return lockReason(cls, plan, talent, cap) === null && (plan[talent.id] || 0) < talent.max;
}

/** Drop ranks that no longer meet a row gate or a full-rank link. Deepest first. */
export function validate(cls: TalentClass, plan: Plan, cap = 51): Plan {
  const map = byId(cls);
  const out: Plan = {};
  for (const [id, n] of Object.entries(plan)) {
    const hit = map.get(id);
    if (hit && n > 0) out[id] = Math.min(n, hit.talent.max);
  }
  const ordered = [...map.values()].sort((a, b) => b.talent.row - a.talent.row || b.talent.col - a.talent.col);
  let changed = true;
  while (changed) {
    changed = false;
    for (const { talent, tree } of ordered) {
      const rank = out[talent.id] || 0;
      if (!rank) continue;
      const others = tree.talents.reduce((a, t) => a + (t.id === talent.id ? 0 : (out[t.id] || 0)), 0);
      let bad = others < (talent.row - 1) * 5;
      if (talent.req) {
        const pre = map.get(talent.req);
        if (!pre || (out[pre.talent.id] || 0) < pre.talent.max) bad = true;
      }
      if (bad) { delete out[talent.id]; changed = true; }
    }
  }
  let total = spent(out);
  if (total > cap) {
    for (const { talent } of ordered) {
      if (total <= cap) break;
      const rank = out[talent.id] || 0;
      if (!rank) continue;
      const drop = Math.min(rank, total - cap);
      const next = rank - drop;
      if (next) out[talent.id] = next; else delete out[talent.id];
      total -= drop;
    }
  }
  return out;
}

const orderedTalents = (tree: TalentTree) => [...tree.talents].sort((a, b) => a.row - b.row || a.col - b.col);

export function encode(cls: TalentClass, plan: Plan) {
  return cls.trees.map(tree => orderedTalents(tree).map(t => String(plan[t.id] || 0)).join('')).join('-');
}

/** Null when the code is the wrong length or a digit is above that talent's max. */
export function decode(cls: TalentClass, code: string, cap = 51): Plan | null {
  const parts = code.split('-');
  if (parts.length !== cls.trees.length) return null;
  const plan: Plan = {};
  for (let i = 0; i < cls.trees.length; i++) {
    const talents = orderedTalents(cls.trees[i]);
    const digits = parts[i];
    if (digits.length !== talents.length || !/^\d*$/.test(digits)) return null;
    for (let j = 0; j < talents.length; j++) {
      const n = digits.charCodeAt(j) - 48;
      if (n < 0 || n > talents[j].max) return null;
      if (n) plan[talents[j].id] = n;
    }
  }
  return validate(cls, plan, cap);
}
