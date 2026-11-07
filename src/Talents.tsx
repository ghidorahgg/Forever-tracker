import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import raw from './data/talents.json';
import {
  type Plan, type Talent, type TalentClass, type TalentData,
  canAdd, decode, encode, lockReason, requiredLevel, spent, treeSpent, validate,
} from './talents';
import { routeLinks, type Box, type Pt, type Routed } from './talent-arrows';

const data = raw as TalentData;
const CAP = data.meta.points;
const KEY = 'ghidorah-forever-talents-v1';
const DEEP = [
  ['Hunter & Druid', 'https://news.blizzard.com/en-us/article/24301515/world-of-warcraft-forever-class-deep-dives-hunter-and-druid'],
  ['Mage & Shaman', 'https://news.blizzard.com/en-us/article/24302097/world-of-warcraft-forever-class-deep-dives-mage-and-shaman'],
  ['Priest & Warrior', 'https://news.blizzard.com/en-us/article/24301514/world-of-warcraft-forever-class-deep-dives-priest-and-warrior'],
  ['Rogue & Warlock', 'https://news.blizzard.com/en-us/article/24310968/world-of-warcraft-forever-class-deep-dives-rogue-and-warlock'],
] as const;

type Store = Record<string, string>;

function readStore(): Store {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; }
  catch { return {}; }
}

function hashCode(): { classId: string; code: string } | null {
  const m = location.hash.match(/^#t=([a-z]+)\.([0-9-]+)$/);
  return m ? { classId: m[1], code: m[2] } : null;
}

function classById(id: string) {
  return data.classes.find(c => c.id === id);
}

function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const apply = () => setMatch(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [query]);
  return match;
}

/** Break only very long single words, and do it in the middle so a letter is not stranded. */
function talentLabel(name: string) {
  return name.replace(/[A-Za-z]{12,}/g, word => {
    const suffix = word.match(/(ization|isation|master|ment)$/);
    const at = suffix?.index && suffix.index > 3 ? suffix.index : Math.ceil(word.length / 2);
    return word.slice(0, at) + '\u200b' + word.slice(at);
  });
}

function placeTip(anchor: DOMRect, w: number, h: number) {
  const m = 8;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const above = anchor.top - m;
  const below = vh - anchor.bottom - m;
  let top = above >= h || above >= below ? anchor.top - h - m : anchor.bottom + m;
  let left = anchor.left + anchor.width / 2 - w / 2;
  if (top < m || top + h > vh - m) {
    const spaceRight = vw - anchor.right - m;
    const spaceLeft = anchor.left - m;
    left = spaceRight >= w || spaceRight >= spaceLeft ? anchor.right + m : anchor.left - w - m;
    top = anchor.top + anchor.height / 2 - h / 2;
  }
  left = Math.max(m, Math.min(left, vw - w - m));
  top = Math.max(m, Math.min(top, vh - h - m));
  return { left, top };
}

export default function Talents() {
  const fromUrl = hashCode();
  const urlClass = fromUrl && classById(fromUrl.classId);
  const [classId, setClassId] = useState(urlClass ? urlClass.id : 'warrior');
  const [store, setStore] = useState<Store>(() => {
    const saved = readStore();
    if (urlClass && fromUrl) saved[urlClass.id] = fromUrl.code;
    return saved;
  });
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [msg, setMsg] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState(Boolean(fromUrl));
  const touchUi = useMedia('(pointer: coarse), (max-width: 1180px)');
  const canHover = useMedia('(hover: hover) and (pointer: fine)');
  const hideTimer = useRef<number | null>(null);
  const floatId = useId();

  const cls = classById(classId) as TalentClass;
  const decoded = useMemo(() => decode(cls, store[classId] || '', CAP), [cls, store, classId]);
  const badLink = Boolean(store[classId]) && decoded === null;
  const plan: Plan = decoded || {};

  useEffect(() => {
    if (!fromUrl || !urlClass) return;
    if (decode(urlClass, fromUrl.code, CAP) === null) {
      setMsg('This talent link does not match the current trees.');
      return;
    }
    try {
      const saved = readStore();
      saved[urlClass.id] = fromUrl.code;
      localStorage.setItem(KEY, JSON.stringify(saved));
    } catch { /* the hash still reloads the build */ }
  }, []);

  function commit(next: Plan, announce = '') {
    const safe = validate(cls, next, CAP);
    const code = encode(cls, safe);
    const stored = { ...store, [cls.id]: code };
    setStore(stored);
    try { localStorage.setItem(KEY, JSON.stringify(stored)); } catch { /* keep the in-memory build */ }
    if (linkMode) history.replaceState(null, '', location.pathname + '#t=' + cls.id + '.' + code);
    setMsg(announce);
  }

  function add(talent: Talent) {
    if ((plan[talent.id] || 0) >= talent.max) { setPicked(talent.id); return; }
    const why = lockReason(cls, plan, talent, CAP);
    if (why) { setMsg(why); setPicked(talent.id); return; }
    commit({ ...plan, [talent.id]: (plan[talent.id] || 0) + 1 });
    setPicked(talent.id);
  }

  function remove(talent: Talent) {
    const rank = plan[talent.id] || 0;
    if (!rank) return;
    const before = spent(plan);
    const next = { ...plan, [talent.id]: rank - 1 };
    const safe = validate(cls, next, CAP);
    const lost = before - 1 - spent(safe);
    commit(safe, lost > 0 ? `Removed ${lost} dependent rank${lost === 1 ? '' : 's'} that lost their unlock.` : '');
    setPicked(talent.id);
  }

  function resetTree(treeId: string) {
    const tree = cls.trees.find(t => t.id === treeId);
    if (!tree) return;
    const next = { ...plan };
    for (const t of tree.talents) delete next[t.id];
    commit(validate(cls, next, CAP));
  }

  function share() {
    const code = encode(cls, plan);
    const url = location.origin + location.pathname + '#t=' + cls.id + '.' + code;
    setLinkMode(true);
    history.replaceState(null, '', url);
    const pending = navigator.clipboard?.writeText(url);
    pending?.catch(() => { /* the address bar still holds the link */ });
    setMsg('Talent link copied.');
  }

  function pickClass(id: string) {
    setClassId(id);
    setPicked(null);
    setHoverId(null);
    setFocusId(null);
    setMsg('');
    if (!linkMode) return;
    const next = classById(id);
    if (!next) return;
    const saved = store[id];
    const code = saved && decode(next, saved, CAP) ? saved : encode(next, {});
    history.replaceState(null, '', location.pathname + '#t=' + next.id + '.' + code);
  }

  function cancelHide() {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }
  function scheduleHide() {
    cancelHide();
    hideTimer.current = window.setTimeout(() => setHoverId(null), 160);
  }

  const total = spent(plan);
  const left = CAP - total;
  const active = cls.trees.flatMap(t => t.talents).find(t => t.id === picked) || null;
  const activeRank = active ? plan[active.id] || 0 : 0;
  const tipId = canHover ? (hoverId || focusId) : null;
  const tipTalent = tipId ? cls.trees.flatMap(t => t.talents).find(t => t.id === tipId) || null : null;
  const tipAnchor = tipTalent ? document.querySelector<HTMLElement>(`[data-testid="talent-${tipTalent.id}"]`) : null;

  return <section className={touchUi ? 'calc has-dock' : 'calc'}>
    <p className="lead">Click a talent to add a rank. Right-click or Shift-click removes one. On a phone, tap a talent, then use Add rank and Remove rank. Each earlier row costs 5 points in that tree, and a linked talent must be maxed.</p>
    <p className="legend"><span className="pip-key" aria-hidden="true" /> is new or changed in Forever and may change at launch. <span className="src-key">src</span> opens the client read; <span className="src-key">notes</span> opens another source. Deep dives: {DEEP.map(([label, href], i) => <span key={href}>{i ? ' · ' : ''}<a href={href} target="_blank" rel="noopener">{label}</a></span>)}</p>
    <div className="chips">{data.classes.map(c => <button key={c.id} type="button" className={c.id === cls.id ? 'on' : ''} aria-pressed={c.id === cls.id} onClick={() => pickClass(c.id)}>{c.name}</button>)}</div>
    <div className="calc-bar">
      <div className="calc-left" data-testid="talent-points">
        <b>{left}</b>
        <span>points left</span>
        <small>{total}/{CAP} spent</small>
        <div className="meter" aria-hidden="true"><span style={{ width: `${(total / CAP) * 100}%` }} /></div>
      </div>
      <div data-testid="talent-level">Level <b>{requiredLevel(total, data.meta.firstLevel)}</b></div>
      <div className="calc-split">{cls.trees.map(t => <div key={t.id}>{t.name} <b>{treeSpent(t, plan)}</b></div>)}</div>
      <div className="calc-actions">
        <button type="button" className={onlyChanged ? 'on' : ''} aria-pressed={onlyChanged} onClick={() => setOnlyChanged(v => !v)}>Changed in Forever</button>
        <button type="button" onClick={share}>Copy talent link</button>
        <button type="button" onClick={() => commit({})}>Reset all</button>
      </div>
    </div>
    {cls.note && <p className="note" data-testid="class-note">{cls.note}</p>}
    {badLink && <p className="bad">This saved link does not match the current trees, so it was not applied.</p>}
    {msg && <p className={msg.startsWith('Removed') || msg.startsWith('This') ? 'bad' : 'note'} data-testid="talent-msg" aria-live="polite">{msg}</p>}
    <div className={'talent-trees' + (onlyChanged ? ' only-changed' : '')}>
      {cls.trees.map((tree, i) => <TreeView
        key={cls.id + ':' + tree.id}
        spec={i}
        tree={tree}
        cls={cls}
        plan={plan}
        picked={picked}
        onlyChanged={onlyChanged}
        touchUi={touchUi}
        canHover={canHover}
        floatId={floatId}
        tipId={tipId}
        onAdd={add}
        onRemove={remove}
        onPick={setPicked}
        onHover={id => { cancelHide(); setHoverId(id); }}
        onLeave={scheduleHide}
        onFocus={setFocusId}
        onBlur={() => setFocusId(null)}
        onReset={() => resetTree(tree.id)}
      />)}
    </div>
    <div className="card tip" data-testid="talent-tip">
      {active ? <>
        <TipBody cls={cls} plan={plan} talent={active} rank={activeRank} />
      </> : <p className="note">Select a talent to read its current rank and the next rank. {data.meta.rule}</p>}
    </div>
    {touchUi && <div className="touch-dock">
      {active ? <>
        <div className="who"><b>{active.name}</b><small>{activeRank}/{active.max}</small></div>
        <button type="button" onClick={() => remove(active)} disabled={activeRank === 0}>Remove</button>
        <button type="button" onClick={() => add(active)} disabled={!canAdd(cls, plan, active, CAP)}>Add</button>
      </> : <p>Tap a talent, then add or remove a rank.</p>}
    </div>}
    {canHover && tipTalent && tipAnchor && <FloatTip
      id={floatId}
      anchor={tipAnchor}
      cls={cls}
      plan={plan}
      talent={tipTalent}
      rank={plan[tipTalent.id] || 0}
      onEnter={cancelHide}
      onLeave={scheduleHide}
    />}
  </section>;
}

function TreeView({ spec, tree, cls, plan, picked, onlyChanged, touchUi, canHover, floatId, tipId, onAdd, onRemove, onPick, onHover, onLeave, onFocus, onBlur, onReset }: {
  spec: number;
  tree: TalentClass['trees'][number];
  cls: TalentClass;
  plan: Plan;
  picked: string | null;
  onlyChanged: boolean;
  touchUi: boolean;
  canHover: boolean;
  floatId: string;
  tipId: string | null;
  onAdd: (t: Talent) => void;
  onRemove: (t: Talent) => void;
  onPick: (id: string) => void;
  onHover: (id: string) => void;
  onLeave: () => void;
  onFocus: (id: string) => void;
  onBlur: () => void;
  onReset: () => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [routes, setRoutes] = useState<Routed[]>([]);
  const points = treeSpent(tree, plan);
  const byId = new Map(tree.talents.map(t => [t.id, t]));

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const measure = () => setRoutes(measureRoutes(board, tree));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(board);
    let cancel = false;
    document.fonts?.ready.then(() => { if (!cancel) measure(); });
    return () => { cancel = true; ro.disconnect(); };
  }, [tree]);

  return <div className="spec" data-spec={spec}>
    <div className="spec-head">
      <h3>{tree.name}{tree.confirmed ? '' : <small> · unconfirmed</small>}</h3>
      <b className={points ? 'spec-pts hot' : 'spec-pts'}>{points}</b>
      <button type="button" className="tiny" onClick={onReset} aria-label={'Reset ' + tree.name}>Reset</button>
    </div>
    {tree.note && <p className="note">{tree.note}</p>}
    <div className="spec-body">
      <div className="tier-rail" aria-hidden="true">
        {Array.from({ length: data.meta.rows }, (_, i) => {
          const need = i * data.meta.tierPoints;
          return <span key={need} className={points >= need ? 'on' : ''}>{need}</span>;
        })}
      </div>
      <div className="board" ref={boardRef}>
        <svg className="links" aria-hidden="true">
          {routes.map(route => {
            const from = byId.get(route.from);
            const to = byId.get(route.to);
            if (!from || !to) return null;
            if (onlyChanged && (from.status === 'same' || to.status === 'same')) return null;
            const lit = (plan[from.id] || 0) >= from.max;
            const geom = arrowGeometry(route.points);
            if (!geom) return null;
            return <g key={route.to} className={lit ? 'link on' : 'link'}>
              <path d={geom.d} />
              <polygon points={geom.poly} />
            </g>;
          })}
        </svg>
        <div className="talent-grid" style={{ gridTemplateColumns: `repeat(${tree.cols}, var(--icon))` }}>
          {Array.from({ length: data.meta.rows * tree.cols }, (_, i) => {
            const row = Math.floor(i / tree.cols) + 1;
            const col = i % tree.cols + 1;
            const talent = tree.talents.find(t => t.row === row && t.col === col);
            if (!talent) return <div key={i} className="cell slot" data-cell={`${row}-${col}`} data-row={row} data-col={col} />;
            const rank = plan[talent.id] || 0;
            const maxed = rank >= talent.max;
            const locked = rank === 0 && !canAdd(cls, plan, talent, CAP);
            const state = maxed ? 'maxed' : rank > 0 ? 'partial' : locked ? 'locked' : 'open';
            const changed = talent.status !== 'same';
            const why = lockReason(cls, plan, talent, CAP);
            return <div
              key={talent.id}
              className={'cell' + (changed ? '' : ' same')}
              data-cell={`${row}-${col}`}
              data-row={row}
              data-col={col}
              data-talent={talent.id}>
              <button
                type="button"
                data-testid={'talent-' + talent.id}
                data-rank={rank}
                data-state={state}
                className={'glyph ' + state + (changed ? ' changed' : '') + (picked === talent.id ? ' picked' : '')}
                aria-label={`${talent.name}, rank ${rank} of ${talent.max}. ${changed ? 'Changed in Forever. ' : ''}${why && rank < talent.max ? why : maxed ? 'Maxed' : 'Available'}`}
                aria-describedby={tipId === talent.id ? floatId : undefined}
                onClick={e => {
                  if (touchUi) { onPick(talent.id); return; }
                  if (e.shiftKey) onRemove(talent);
                  else onAdd(talent);
                }}
                onContextMenu={e => { e.preventDefault(); if (touchUi) onPick(talent.id); else onRemove(talent); }}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdd(talent); }
                  if (e.key === 'Backspace' || e.key === '-' || e.key === '_') { e.preventDefault(); onRemove(talent); }
                }}
                onMouseEnter={() => canHover && onHover(talent.id)}
                onMouseLeave={() => canHover && onLeave()}
                onFocus={() => { onFocus(talent.id); onPick(talent.id); }}
                onBlur={onBlur}>
                {changed && <span className="pip" aria-hidden="true" />}
                <span className="nm">{talentLabel(talent.name)}</span>
                <span className="rank">{rank}/{talent.max}</span>
              </button>
            </div>;
          })}
        </div>
      </div>
    </div>
  </div>;
}

function measureRoutes(board: HTMLElement, tree: TalentClass['trees'][number]): Routed[] {
  const origin = board.getBoundingClientRect();
  const boxes: Box[] = [];
  board.querySelectorAll<HTMLElement>('[data-cell]').forEach(el => {
    const rect = el.getBoundingClientRect();
    boxes.push({
      id: el.dataset.talent || `empty-${el.dataset.cell}`,
      row: Number(el.dataset.row),
      col: Number(el.dataset.col),
      x: rect.left - origin.left,
      y: rect.top - origin.top,
      w: rect.width,
      h: rect.height,
      filled: Boolean(el.dataset.talent),
    });
  });
  const links = tree.talents.filter(t => t.req).map(t => ({ from: t.req!, to: t.id, active: false }));
  return routeLinks(links, boxes);
}

function arrowGeometry(points: Pt[]) {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const dx = last.x - prev.x;
  const dy = last.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const size = Math.min(7, Math.max(5, len * 0.45));
  const base = { x: last.x - ux * size, y: last.y - uy * size };
  const px = -uy * 3.15;
  const py = ux * 3.15;
  const line = [...points.slice(0, -1), base];
  const d = line.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const poly = `${last.x.toFixed(1)},${last.y.toFixed(1)} ${(base.x + px).toFixed(1)},${(base.y + py).toFixed(1)} ${(base.x - px).toFixed(1)},${(base.y - py).toFixed(1)}`;
  return { d, poly };
}

function TipBody({ cls, plan, talent, rank, compact }: { cls: TalentClass; plan: Plan; talent: Talent; rank: number; compact?: boolean }) {
  const why = lockReason(cls, plan, talent, CAP);
  const req = talent.req ? cls.trees.flatMap(t => t.talents).find(t => t.id === talent.req) : undefined;
  const tree = cls.trees.find(t => t.talents.some(x => x.id === talent.id));
  const status = talent.status === 'changed' ? 'Changed in Forever' : talent.status === 'new' ? 'New in Forever' : '';
  return <>
    <h3>{talent.name}</h3>
    <p className="tip-rank">Rank {rank}/{talent.max}{status ? ` · ${status}` : ''}</p>
    {talent.cost && <p className="tip-cost">{talent.cost}</p>}
    {rank > 0 && <p><b>Rank {rank}.</b> {talent.ranks[rank - 1]}</p>}
    {rank < talent.max && <p className="tip-next"><b>{rank === 0 ? 'Rank 1.' : `Next, rank ${rank + 1}.`}</b> {talent.ranks[rank]}</p>}
    {req && <p className="note">Requires {req.max}/{req.max} {req.name}. You have {plan[req.id] || 0}.</p>}
    {tree && <p className="note">Row {talent.row} opens at {(talent.row - 1) * data.meta.tierPoints} points in {tree.name}.</p>}
    {why && rank < talent.max && <p className="note">{why}.</p>}
    {talent.note && <p className="note">{talent.note}</p>}
    {!compact && talent.src && talent.src.length > 0 && <p>{talent.src.map((href, i) => <span key={href}>{i ? ' · ' : ''}<a href={href} target="_blank" rel="noopener">{i === 0 ? 'src' : 'notes'}</a></span>)}</p>}
    {compact && <p className="tip-hint">Click to add a rank. Right-click or Shift-click to remove one.</p>}
  </>;
}

function FloatTip({ id, anchor, cls, plan, talent, rank, onEnter, onLeave }: {
  id: string;
  anchor: HTMLElement;
  cls: TalentClass;
  plan: Plan;
  talent: Talent;
  rank: number;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const box = anchor.getBoundingClientRect();
      setPos(placeTip(box, el.offsetWidth, el.offsetHeight));
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchor, talent, rank, plan, cls]);
  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      className="float-tip"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}>
      <TipBody cls={cls} plan={plan} talent={talent} rank={rank} compact />
    </div>,
    document.body,
  );
}
