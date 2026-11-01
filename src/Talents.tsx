import { useEffect, useMemo, useState } from 'react';
import raw from './data/talents.json';
import {
  type Plan, type Talent, type TalentClass, type TalentData,
  canAdd, decode, encode, lockReason, requiredLevel, spent, treeSpent, validate,
} from './talents';

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
  const [linkMode, setLinkMode] = useState(Boolean(fromUrl));

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
    navigator.clipboard?.writeText(url);
    setMsg('Talent link copied.');
  }

  function pickClass(id: string) {
    setClassId(id);
    setPicked(null);
    setMsg('');
    if (!linkMode) return;
    const next = classById(id);
    if (!next) return;
    const saved = store[id];
    const code = saved && decode(next, saved, CAP) ? saved : encode(next, {});
    history.replaceState(null, '', location.pathname + '#t=' + next.id + '.' + code);
  }

  const total = spent(plan);
  const active = cls.trees.flatMap(t => t.talents).find(t => t.id === picked) || null;
  const activeRank = active ? plan[active.id] || 0 : 0;

  return <section>
    <p className="lead">Left-click a talent to add a point and right-click to remove one (use the minus button on a phone); a row stays locked until that tree has 5 points per row.</p>
    <p className="legend"><span className="tag beta">beta</span> is a talent new or changed in Forever and may change at launch. <span className="src-key">src</span> opens the client read; <span className="src-key">notes</span> opens another source. Deep dives: {DEEP.map(([label, href], i) => <span key={href}>{i ? ' · ' : ''}<a href={href} target="_blank" rel="noopener">{label}</a></span>)}</p>
    <div className="chips">{data.classes.map(c => <button key={c.id} className={c.id === cls.id ? 'on' : ''} onClick={() => pickClass(c.id)}>{c.name}</button>)}</div>
    <div className="stats">
      <div data-testid="talent-points"><b>{total}</b>/{CAP} points</div>
      <div data-testid="talent-level">Level <b>{requiredLevel(total, data.meta.firstLevel)}</b></div>
      {cls.trees.map(t => <div key={t.id}>{t.name} <b>{treeSpent(t, plan)}</b></div>)}
      <button type="button" className={onlyChanged ? 'on' : ''} onClick={() => setOnlyChanged(v => !v)}>Changed in Forever</button>
      <button type="button" onClick={share}>Copy talent link</button>
      <button type="button" onClick={() => commit({})}>Reset all</button>
    </div>
    {cls.note && <p className="note" data-testid="class-note">{cls.note}</p>}
    {badLink && <p className="bad">This saved link does not match the current trees, so it was not applied.</p>}
    {msg && <p className={msg.startsWith('Removed') || msg.startsWith('This') ? 'bad' : 'note'} data-testid="talent-msg">{msg}</p>}
    <div className={'talent-trees' + (onlyChanged ? ' only-changed' : '')}>
      {cls.trees.map(tree => <div className="card" key={tree.id}>
        <h3>{tree.name} <small>{treeSpent(tree, plan)}{tree.confirmed ? '' : ' · unconfirmed'}</small></h3>
        {tree.note && <p className="note">{tree.note}</p>}
        <div className="talent-grid" style={{ gridTemplateColumns: `repeat(${tree.cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: data.meta.rows * tree.cols }, (_, i) => {
            const row = Math.floor(i / tree.cols) + 1;
            const col = i % tree.cols + 1;
            const talent = tree.talents.find(t => t.row === row && t.col === col);
            if (!talent) return <div key={i} className="slot" />;
            const rank = plan[talent.id] || 0;
            const locked = !canAdd(cls, plan, talent, CAP) && rank === 0;
            const changed = talent.status !== 'same';
            return <div key={talent.id}
              data-testid={'talent-' + talent.id}
              data-rank={rank}
              className={'talent' + (rank ? ' has' : '') + (locked ? ' locked' : '') + (changed ? ' beta' : ' same') + (picked === talent.id ? ' picked' : '')}
              onClick={() => add(talent)}
              onContextMenu={e => { e.preventDefault(); remove(talent); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add(talent); } }}
              role="button" tabIndex={0}
              title={talent.name}>
              {changed && <span className="tag beta">beta</span>}
              <b>{talent.name}</b>
              <span className="rkline"><small>{rank}/{talent.max}</small>
              {rank > 0 && <button type="button" className="rm" aria-label={'Remove a point from ' + talent.name} onClick={e => { e.stopPropagation(); remove(talent); }}>−</button>}</span>
            </div>;
          })}
        </div>
        <button type="button" onClick={() => resetTree(tree.id)}>Reset {tree.name}</button>
      </div>)}
    </div>
    <div className="card tip" data-testid="talent-tip">
      {active ? <Tip cls={cls} plan={plan} talent={active} rank={activeRank} /> : <p className="note">Select a talent to read its current rank and the next rank. {data.meta.rule}</p>}
    </div>
  </section>;
}

function Tip({ cls, plan, talent, rank }: { cls: TalentClass; plan: Plan; talent: Talent; rank: number }) {
  const why = lockReason(cls, plan, talent, CAP);
  const req = talent.req ? cls.trees.flatMap(t => t.talents).find(t => t.id === talent.req) : undefined;
  return <>
    <h3>{talent.name} <small>{rank}/{talent.max}{talent.status !== 'same' ? ` · ${talent.status}` : ''}</small></h3>
    {talent.cost && <p>{talent.cost}</p>}
    {rank > 0 && <p><b>Rank {rank}.</b> {talent.ranks[rank - 1]}</p>}
    {rank < talent.max && <p><b>{rank === 0 ? 'Rank 1.' : `Next, rank ${rank + 1}.`}</b> {talent.ranks[rank]}</p>}
    {req && <p className="note">Requires {req.max}/{req.max} {req.name}. You have {plan[req.id] || 0}.</p>}
    {why && rank < talent.max && <p className="note">{why}.</p>}
    {talent.note && <p className="note">{talent.note}</p>}
    {talent.src && talent.src.length > 0 && <p>{talent.src.map((href, i) => <span key={href}>{i ? ' · ' : ''}<a href={href} target="_blank" rel="noopener">{i === 0 ? 'src' : 'notes'}</a></span>)}</p>}
  </>;
}
