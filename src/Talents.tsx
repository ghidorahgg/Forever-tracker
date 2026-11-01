import { useEffect, useMemo, useRef, useState } from 'react';
import raw from './data/talents.json';
import {
  addPoint, canAdd, canRemove, decodeBuild, encodeBuild, parseTalentHash, removePoint, requiredLevel,
  resetTree, rulesOf, talentById, totalPoints, treePoints, wowheadUrl,
  type Ranks, type Talent, type TalentClass, type TalentData, type TalentTree,
} from './talentCalc';

const data = raw as TalentData;
const rules = rulesOf(data.meta);
const STORE = 'ghidorah-forever-talents-v1';
const ICON = 'https://wow.zamimg.com/images/wow/icons/medium/';

type Store = { last: string; builds: Record<string, string> };

function loadStore(): Store {
  try {
    const rawStore = localStorage.getItem(STORE);
    if (!rawStore) return { last: data.classes[0].id, builds: {} };
    const parsed = JSON.parse(rawStore) as Partial<Store>;
    const builds = parsed.builds && typeof parsed.builds === 'object' ? parsed.builds : {};
    const last = typeof parsed.last === 'string' ? parsed.last : data.classes[0].id;
    return { last, builds };
  } catch {
    return { last: data.classes[0].id, builds: {} };
  }
}

function classById(id: string): TalentClass {
  return data.classes.find(c => c.id === id) || data.classes[0];
}

function pageUrl(classId: string, code: string): string {
  const hash = code ? `#t=${classId}/${code}` : `#t=${classId}`;
  return location.origin + location.pathname + location.search + hash;
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(w => w && w !== 'of' && w !== 'the');
  return parts.slice(0, 3).map(w => w[0]).join('').toUpperCase();
}

function RankCopy({ tree, talent, rank }: { tree: TalentTree; talent: Talent; rank: number }) {
  const max = talent.ranks.length;
  const req = talent.requires ? talentById(tree, talent.requires.id) : undefined;
  const tier = talent.row * rules.pointsPerTier;
  return <>
    {rank > 0 && <p><b>Current rank {rank}/{max}.</b> {talent.ranks[rank - 1]}</p>}
    {rank < max && <p><b>Next rank {rank + 1}/{max}.</b> {talent.ranks[rank]}</p>}
    {tier > 0 && <p className="reqline">Requires {tier} points in earlier rows of {tree.name}.</p>}
    {req && talent.requires && <p className="reqline">Requires {req.name} ({talent.requires.points}).</p>}
  </>;
}

function TalentCell({
  tree, talent, rank, locked, active, onAdd, onRemove, onEnter, onLeave,
}: {
  tree: TalentTree;
  talent: Talent;
  rank: number;
  locked: boolean;
  active: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onEnter: (el: HTMLElement) => void;
  onLeave: () => void;
}) {
  const [iconOk, setIconOk] = useState(true);
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const suppress = useRef(false);
  const longAt = useRef(0);
  const clearTimer = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };
  const max = talent.ranks.length;
  return <div className="tcell" style={{ gridRow: talent.row + 1, gridColumn: talent.col + 1 }}
    onMouseEnter={e => onEnter(e.currentTarget)} onMouseLeave={onLeave}>
    <button type="button"
      className={'tnode' + (rank ? ' has' : '') + (rank >= max ? ' max' : '') + (locked ? ' locked' : '') + (active ? ' on' : '')}
      data-testid={`talent-${talent.id}`}
      data-rank={rank}
      aria-label={`${talent.name}, rank ${rank} of ${max}`}
      onPointerDown={e => {
        if (e.pointerType === 'mouse' || e.button !== 0) return;
        suppress.current = false;
        origin.current = { x: e.clientX, y: e.clientY };
        timer.current = window.setTimeout(() => {
          timer.current = null;
          suppress.current = true;
          longAt.current = Date.now();
          onRemove();
        }, 500);
      }}
      onPointerMove={e => {
        const o = origin.current;
        if (!o) return;
        if (Math.hypot(e.clientX - o.x, e.clientY - o.y) > 10) clearTimer();
      }}
      onPointerUp={clearTimer}
      onPointerLeave={clearTimer}
      onPointerCancel={clearTimer}
      onClick={() => {
        if (suppress.current) { suppress.current = false; return; }
        onAdd();
      }}
      onContextMenu={e => {
        e.preventDefault();
        if (Date.now() - longAt.current < 800) return;
        onRemove();
      }}>
      {iconOk ? <img src={ICON + talent.icon + '.jpg'} alt="" width={32} height={32} draggable={false} onError={() => setIconOk(false)} /> : <span className="ticon" aria-hidden="true">{initials(talent.name)}</span>}
      <span className="tname">{talent.name}</span>
      <span className="trank">{rank}/{max}</span>
    </button>
    {rank > 0 && <button type="button" className="tminus" aria-label={`Remove a point from ${talent.name}`} onClick={e => { e.stopPropagation(); onRemove(); }}>−</button>}
  </div>;
}

function Arrows({ tree, ranks }: { tree: TalentTree; ranks: Ranks }) {
  const id = `arr-${tree.id}`;
  return <svg className="tarrows" viewBox="0 0 4 7" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <marker id={`${id}-on`} markerUnits="userSpaceOnUse" markerWidth="0.18" markerHeight="0.18" refX="0.16" refY="0.09" orient="auto">
        <path d="M0,0 L0.18,0.09 L0,0.18 Z" fill="#e8b94a" />
      </marker>
      <marker id={`${id}-off`} markerUnits="userSpaceOnUse" markerWidth="0.18" markerHeight="0.18" refX="0.16" refY="0.09" orient="auto">
        <path d="M0,0 L0.18,0.09 L0,0.18 Z" fill="#6a5a40" />
      </marker>
    </defs>
    {tree.talents.map(t => {
      if (!t.requires) return null;
      const pre = talentById(tree, t.requires.id);
      if (!pre) return null;
      const met = (ranks[pre.id] || 0) >= t.requires.points;
      const same = pre.row === t.row;
      let x1: number, y1: number, x2: number, y2: number;
      if (same) {
        const forward = pre.col < t.col;
        x1 = pre.col + (forward ? 0.86 : 0.14);
        x2 = t.col + (forward ? 0.14 : 0.86);
        y1 = pre.row + 0.5;
        y2 = t.row + 0.5;
      } else {
        const down = pre.row < t.row;
        x1 = pre.col + 0.5;
        x2 = t.col + 0.5;
        y1 = pre.row + (down ? 0.82 : 0.18);
        y2 = t.row + (down ? 0.18 : 0.82);
      }
      return <line key={t.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={met ? '#e8b94a' : '#6a5a40'} strokeWidth="0.045" markerEnd={`url(#${id}-${met ? 'on' : 'off'})`} />;
    })}
  </svg>;
}

export default function Talents() {
  const [classId, setClassId] = useState(() => {
    const hash = parseTalentHash(location.hash);
    if (hash && data.classes.some(c => c.id === hash.classId)) return hash.classId;
    const store = loadStore();
    return data.classes.some(c => c.id === store.last) ? store.last : data.classes[0].id;
  });
  const [ranks, setRanks] = useState<Ranks>(() => {
    const hash = parseTalentHash(location.hash);
    const id = hash && data.classes.some(c => c.id === hash.classId) ? hash.classId : classById(loadStore().last).id;
    const cls = classById(id);
    const code = hash && hash.classId === cls.id ? hash.code : (loadStore().builds[cls.id] || '');
    return decodeBuild(cls, code, rules);
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);
  const [msg, setMsg] = useState('');
  const cls = classById(classId);
  const spent = totalPoints(cls, ranks);
  const level = requiredLevel(spent, rules.firstPointLevel);
  const code = encodeBuild(cls, ranks);
  const split = cls.trees.map(t => treePoints(t, ranks));

  const active = useMemo(() => {
    if (!activeId) return null;
    for (const tree of cls.trees) {
      const talent = talentById(tree, activeId);
      if (talent) return { tree, talent };
    }
    return null;
  }, [cls, activeId]);

  useEffect(() => {
    const store = loadStore();
    const builds = { ...store.builds };
    if (code) builds[cls.id] = code;
    else delete builds[cls.id];
    try { localStorage.setItem(STORE, JSON.stringify({ last: cls.id, builds })); } catch { /* storage may be blocked */ }
    const hash = code ? `#t=${cls.id}/${code}` : `#t=${cls.id}`;
    if (location.hash !== hash) history.replaceState(null, '', location.pathname + location.search + hash);
  }, [cls, code]);

  useEffect(() => {
    const onHash = () => {
      const hash = parseTalentHash(location.hash);
      if (!hash || !data.classes.some(c => c.id === hash.classId)) return;
      setClassId(hash.classId);
      setRanks(decodeBuild(classById(hash.classId), hash.code, rules));
      setActiveId(null);
      setTip(null);
      setMsg('');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function selectClass(id: string) {
    if (id === cls.id) return;
    const store = loadStore();
    const builds = { ...store.builds };
    if (code) builds[cls.id] = code;
    else delete builds[cls.id];
    try { localStorage.setItem(STORE, JSON.stringify({ last: id, builds })); } catch { /* ignore */ }
    setClassId(id);
    setRanks(decodeBuild(classById(id), builds[id] || '', rules));
    setActiveId(null);
    setTip(null);
    setMsg('');
  }

  function tryAdd(tree: TalentTree, talent: Talent) {
    setActiveId(talent.id);
    if (!canAdd(cls, tree, talent, ranks, rules)) return;
    setMsg('');
    setRanks(addPoint(cls, tree, talent, ranks, rules));
  }

  function tryRemove(tree: TalentTree, talent: Talent) {
    setActiveId(talent.id);
    if (!(ranks[talent.id] > 0)) return;
    if (!canRemove(tree, talent, ranks, rules)) {
      setMsg('That point stays. A higher tier or a prerequisite still needs it.');
      return;
    }
    setMsg('');
    setRanks(removePoint(tree, talent, ranks, rules));
  }

  async function copyLink() {
    const url = pageUrl(cls.id, code);
    try {
      await navigator.clipboard.writeText(url);
      setMsg('Build link copied.');
    } catch {
      setMsg('Build link is in the address bar.');
    }
  }

  const activeRank = active ? (ranks[active.talent.id] || 0) : 0;

  return <section>
    <p className="lead">Click a talent to add a rank. Right-click, long-press, or minus removes one when later talents still allow it.</p>
    <p className="legend"><span className="tag classic">classic</span> is Classic-era 1.12 data. Forever may change these talents.</p>
    <div className="chips" role="tablist" aria-label="Class">
      {data.classes.map(c => <button key={c.id} type="button" className={c.id === cls.id ? 'on' : ''} onClick={() => selectClass(c.id)}>{c.name}</button>)}
    </div>
    <div className="stats" data-testid="talent-summary">
      <div><b>{spent}</b>/51 points</div>
      <div>Required level <b data-testid="talent-level">{level ?? '—'}</b></div>
      <div data-testid="talent-split">{split.join(' / ')}</div>
      <button type="button" disabled={!spent} onClick={() => { setRanks({}); setMsg(''); }}>Reset all</button>
      <button type="button" onClick={copyLink}>Copy build link</button>
      <a data-testid="talent-wowhead" href={wowheadUrl(data.meta.wowhead, cls.id, code)} target="_blank" rel="noopener noreferrer">Wowhead Classic</a>
    </div>
    {msg && <p className="bad" role="status" data-testid="talent-msg">{msg}</p>}
    <div className="talent-readout" data-testid="talent-readout">
      {active ? <>
        <b>{active.talent.name}</b> <small>{active.tree.name} · {activeRank}/{active.talent.ranks.length}</small>
        <RankCopy tree={active.tree} talent={active.talent} rank={activeRank} />
      </> : <p>Select a talent to see the current rank and the next rank.</p>}
    </div>
    <div className="trees">
      {cls.trees.map((tree, i) => {
        const pts = split[i];
        return <div className="card" key={tree.id}>
          <div className="treehead">
            <h3>{tree.name} <small data-testid={`tree-points-${tree.id}`}>{pts}</small></h3>
            <button type="button" disabled={!pts} onClick={() => { setRanks(r => resetTree(tree, r)); setMsg(''); }}>Reset</button>
          </div>
          <div className="tgrid">
            <Arrows tree={tree} ranks={ranks} />
            {tree.talents.map(talent => {
              const rank = ranks[talent.id] || 0;
              return <TalentCell key={talent.id} tree={tree} talent={talent} rank={rank}
                locked={rank === 0 && !canAdd(cls, tree, talent, ranks, rules)}
                active={activeId === talent.id}
                onAdd={() => tryAdd(tree, talent)}
                onRemove={() => tryRemove(tree, talent)}
                onEnter={el => {
                  setActiveId(talent.id);
                  const rect = el.getBoundingClientRect();
                  let x = rect.left;
                  let y = rect.bottom + 8;
                  if (x + 280 > window.innerWidth) x = Math.max(8, window.innerWidth - 288);
                  if (y + 200 > window.innerHeight) y = Math.max(8, rect.top - 188);
                  setTip({ id: talent.id, x, y });
                }}
                onLeave={() => setTip(null)} />;
            })}
          </div>
        </div>;
      })}
    </div>
    {tip && active && tip.id === active.talent.id && <div className="ttip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      <b>{active.talent.name}</b> <small>{activeRank}/{active.talent.ranks.length}</small>
      <RankCopy tree={active.tree} talent={active.talent} rank={activeRank} />
    </div>}
    <p className="note">51 points, one per level from 10 to 60. Each tier needs 5 points in earlier rows of that tree. A point that supports a higher tier or a prerequisite cannot be removed.</p>
    <p className="note">{data.meta.forever}</p>
    <p className="credit">Blizzard deep dives: {data.foreverLinks.map((link, i) => <span key={link.href}>{i > 0 && ' · '}<a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a></span>)}. Trees and tooltips follow <a href={wowheadUrl(data.meta.wowhead, cls.id, code)} target="_blank" rel="noopener noreferrer">Wowhead Classic</a>.</p>
  </section>;
}
