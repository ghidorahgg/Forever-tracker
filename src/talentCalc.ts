export interface TalentReq {
  id: string;
  points: number;
}

export interface Talent {
  id: string;
  name: string;
  icon: string;
  row: number;
  col: number;
  ranks: string[];
  requires?: TalentReq;
}

export interface TalentTree {
  id: string;
  name: string;
  talents: Talent[];
}

export interface TalentClass {
  id: string;
  name: string;
  trees: TalentTree[];
}

export interface TalentLink {
  label: string;
  href: string;
}

export interface TalentData {
  meta: {
    ruleset: string;
    pointsMax: number;
    pointsPerTier: number;
    firstPointLevel: number;
    talentCount: number;
    wowhead: string;
    note: string;
    forever: string;
  };
  foreverLinks: TalentLink[];
  classes: TalentClass[];
}

export interface Rules {
  pointsMax: number;
  pointsPerTier: number;
  firstPointLevel: number;
}

export type Ranks = Record<string, number>;

export function rulesOf(meta: TalentData['meta']): Rules {
  return { pointsMax: meta.pointsMax, pointsPerTier: meta.pointsPerTier, firstPointLevel: meta.firstPointLevel };
}

export function treePoints(tree: TalentTree, ranks: Ranks): number {
  let n = 0;
  for (const t of tree.talents) n += ranks[t.id] || 0;
  return n;
}

export function totalPoints(cls: TalentClass, ranks: Ranks): number {
  let n = 0;
  for (const tree of cls.trees) n += treePoints(tree, ranks);
  return n;
}

export function requiredLevel(points: number, firstPointLevel: number): number | null {
  if (points <= 0) return null;
  return firstPointLevel + points - 1;
}

function withRank(ranks: Ranks, id: string, rank: number): Ranks {
  const next = { ...ranks };
  if (rank <= 0) delete next[id];
  else next[id] = rank;
  return next;
}

export function pointsAbove(tree: TalentTree, ranks: Ranks, row: number): number {
  let n = 0;
  for (const t of tree.talents) if (t.row < row) n += ranks[t.id] || 0;
  return n;
}

function placementOk(tree: TalentTree, talent: Talent, ranks: Ranks, rules: Rules): boolean {
  const rank = ranks[talent.id] || 0;
  if (!rank) return true;
  if (rank > talent.ranks.length) return false;
  if (pointsAbove(tree, ranks, talent.row) < talent.row * rules.pointsPerTier) return false;
  if (talent.requires && (ranks[talent.requires.id] || 0) < talent.requires.points) return false;
  return true;
}

export function canAdd(cls: TalentClass, tree: TalentTree, talent: Talent, ranks: Ranks, rules: Rules): boolean {
  const rank = ranks[talent.id] || 0;
  if (rank >= talent.ranks.length) return false;
  if (totalPoints(cls, ranks) >= rules.pointsMax) return false;
  return placementOk(tree, talent, withRank(ranks, talent.id, rank + 1), rules);
}

export function canRemove(tree: TalentTree, talent: Talent, ranks: Ranks, rules: Rules): boolean {
  const rank = ranks[talent.id] || 0;
  if (rank <= 0) return false;
  const next = withRank(ranks, talent.id, rank - 1);
  for (const t of tree.talents) if (!placementOk(tree, t, next, rules)) return false;
  return true;
}

export function addPoint(cls: TalentClass, tree: TalentTree, talent: Talent, ranks: Ranks, rules: Rules): Ranks {
  if (!canAdd(cls, tree, talent, ranks, rules)) return ranks;
  return withRank(ranks, talent.id, (ranks[talent.id] || 0) + 1);
}

export function removePoint(tree: TalentTree, talent: Talent, ranks: Ranks, rules: Rules): Ranks {
  if (!canRemove(tree, talent, ranks, rules)) return ranks;
  return withRank(ranks, talent.id, (ranks[talent.id] || 0) - 1);
}

export function resetTree(tree: TalentTree, ranks: Ranks): Ranks {
  const next = { ...ranks };
  for (const t of tree.talents) delete next[t.id];
  return next;
}

export function encodeBuild(cls: TalentClass, ranks: Ranks): string {
  const parts = cls.trees.map(tree => tree.talents.map(t => String(ranks[t.id] || 0)).join('').replace(/0+$/, ''));
  while (parts.length && parts[parts.length - 1] === '') parts.pop();
  return parts.join('-');
}

export function decodeBuild(cls: TalentClass, code: string, rules: Rules): Ranks {
  const parts = code.trim().split('-');
  const desired = new Map<string, number>();
  cls.trees.forEach((tree, i) => {
    const digits = parts[i] || '';
    tree.talents.forEach((t, j) => {
      const ch = digits[j];
      if (!ch || ch < '0' || ch > '9') return;
      const n = Math.min(parseInt(ch, 10), t.ranks.length);
      if (n > 0) desired.set(t.id, n);
    });
  });
  const ranks: Ranks = {};
  let guard = 0;
  let changed = true;
  while (changed && guard++ < 8) {
    changed = false;
    for (const tree of cls.trees) {
      for (const t of tree.talents) {
        const want = desired.get(t.id) || 0;
        while ((ranks[t.id] || 0) < want && canAdd(cls, tree, t, ranks, rules)) {
          ranks[t.id] = (ranks[t.id] || 0) + 1;
          changed = true;
        }
      }
    }
  }
  return ranks;
}

export function parseTalentHash(hash: string): { classId: string; code: string } | null {
  const m = /^#t=([a-z]+)(?:\/([0-9-]*))?/i.exec(hash);
  if (!m) return null;
  return { classId: m[1].toLowerCase(), code: m[2] || '' };
}

export function wowheadUrl(base: string, classId: string, code: string): string {
  const root = base.replace(/\/$/, '');
  return code ? `${root}/${classId}/${code}` : `${root}/${classId}`;
}

export function talentById(tree: TalentTree, id: string): Talent | undefined {
  return tree.talents.find(t => t.id === id);
}
