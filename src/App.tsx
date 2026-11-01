import { useEffect, useMemo, useState } from 'react';
import data from './data/legacy.json';
import Talents from './Talents';
import DungeonQuests from './DungeonQuests';
type Char = { id: string; name: string; cls: string; race: string; profs: string; level: number; plan: Record<string, number> };
type State = { done: string[]; chars: Char[]; active: string; camp: string[]; group: string[]; campSize?: string; dq?: number[] };
const SIZES = data.meta.campSizes as Record<string, number>;
const CLASSES = ['Druid','Hunter','Mage','Paladin','Priest','Rogue','Shaman','Warlock','Warrior'];
const RACES = ['Human','Dwarf','Night Elf','Gnome','Orc','Undead','Tauren','Troll','Skyborne'];
const CAP = data.meta.pointsCapPerCharacter;
const LAUNCH = new Date(data.meta.launch).getTime();
const KEY = 'ghidorah-forever-v1';
const newChar = (): Char => ({ id: Math.random().toString(36).slice(2, 8), name: 'New hero', cls: 'Warrior', race: 'Human', profs: '', level: 1, plan: {} });
const enc = (s: State) => btoa(unescape(encodeURIComponent(JSON.stringify(s))));
const dec = (h: string): State | null => { try { return JSON.parse(decodeURIComponent(escape(atob(h)))); } catch { return null; } };
function withDungeonChecks(s: State): State {
  return { ...s, dq: Array.isArray(s.dq) ? s.dq : [] };
}
function load(): State {
  const h = location.hash.match(/#p=(.+)/); const fromUrl = h && dec(h[1]); if (fromUrl && Array.isArray(fromUrl.chars) && fromUrl.chars.length) { history.replaceState(null, '', location.pathname); return withDungeonChecks({ ...fromUrl, chars: fromUrl.chars.map(c => ({ ...c, plan: validate(c.plan || {}) })) }); }
  const ls = localStorage.getItem(KEY); if (ls) try { return withDungeonChecks(JSON.parse(ls)); } catch {}
  const c = newChar(); return { done: [], chars: [c], active: c.id, camp: [], group: [], dq: [] };
}
const treeSpent = (plan: Record<string, number>, tree: string) => data.perks.filter(p => p.tree === tree).reduce((a, p) => a + (plan[p.id] || 0), 0);
function canAdd(plan: Record<string, number>, p: typeof data.perks[number], budget: number) {
  const total = Object.values(plan).reduce((a, b) => a + b, 0);
  if (total >= Math.min(CAP, budget) || (plan[p.id] || 0) >= p.maxRanks) return false;
  const spent = treeSpent(plan, p.tree) - (plan[p.id] || 0);
  if (p.column === 2 && spent < 5) return false; if (p.column === 3 && spent < 10) return false;
  if (p.extraPrereq) { const [id, n] = p.extraPrereq.split(':'); if ((plan[id] || 0) < +n) return false; }
  return true;
}
// Remove ranks that no longer satisfy gates/prereqs (cascade), returning a valid plan
export function validate(plan: Record<string, number>): Record<string, number> {
  const out = { ...plan }; let changed = true;
  while (changed) { changed = false;
    for (const p of [...data.perks].sort((a, b) => b.column - a.column)) {
      const r = out[p.id] || 0; if (!r) continue;
      const spent = treeSpent(out, p.tree) - r;
      let bad = (p.column === 2 && spent < 5) || (p.column === 3 && spent < 10);
      if (p.extraPrereq) { const [id, n] = p.extraPrereq.split(':'); if ((out[id] || 0) < +n) bad = true; }
      if (bad) { delete out[p.id]; changed = true; }
    } }
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}
function Countdown() {
  const [now, setNow] = useState(Date.now()); useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const d = LAUNCH - now; if (d <= 0) return <div className="count">WoW: Forever is live!</div>;
  const s = Math.floor(d / 1000);
  return <div className="count">Launch in <b>{Math.floor(s / 86400)}d {Math.floor(s / 3600) % 24}h {Math.floor(s / 60) % 60}m {s % 60}s</b><small>Nov 4, 2026 · 3:00 PM PST</small><small>Your time: {new Date(LAUNCH).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</small></div>;
}
const Tag = ({ c }: { c: string }) => <span className={'tag ' + c}>{c}</span>;
const INTRO_KEY = 'ghidorah-forever-intro-dismissed';
function introDismissed(): boolean {
  try { return localStorage.getItem(INTRO_KEY) === '1'; } catch { return false; }
}
function setIntroDismissed(dismissed: boolean) {
  try {
    if (dismissed) localStorage.setItem(INTRO_KEY, '1');
    else localStorage.removeItem(INTRO_KEY);
  } catch { /* keep the in-memory toggle if storage is blocked */ }
}
function Legend({ src, announced }: { src?: boolean; announced?: boolean }) {
  return <p className="legend"><Tag c="beta" /> is from beta data and may change at launch.{announced && <> <Tag c="announced" /> comes from a public announcement.</>}{src && <> <span className="src-key">src</span> links open the source.</>}</p>;
}
export default function App() {
  const [st, setSt] = useState<State>(load);
  const [tab, setTab] = useState(() => location.hash.startsWith('#t=') ? 'talents' : 'challenges');
  const [msg, setMsg] = useState('');
  const [showIntro, setShowIntro] = useState(() => !introDismissed());
  const size = SIZES[st.campSize || 'Basic'];
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(st)); }, [st]);
  const earned = useMemo(() => data.challenges.filter(c => st.done.includes(c.id)).reduce((a, c) => a + c.points, 0), [st.done]);
  const chRaw = st.chars.find(c => c.id === st.active) || st.chars[0];
  const ch = chRaw;
  const upd = (p: Partial<State>) => setSt(s => ({ ...s, ...p }));
  const updChar = (p: Partial<Char>) => upd({ chars: st.chars.map(c => c.id === ch.id ? { ...c, ...p } : c) });
  const spent = ch ? Object.values(ch.plan).reduce((a, b) => a + b, 0) : 0;
  const share = () => { const url = location.origin + location.pathname + '#p=' + enc(st); navigator.clipboard?.writeText(url); history.replaceState(null, '', url); alert('Share link copied to clipboard'); };
  const dismissIntro = () => { setIntroDismissed(true); setShowIntro(false); };
  const reopenIntro = () => { setIntroDismissed(false); setShowIntro(true); };
  const toggleDq = (id: number, on: boolean) => setSt(s => {
    const cur = Array.isArray(s.dq) ? s.dq : [];
    return { ...s, dq: on ? (cur.includes(id) ? cur : [...cur, id]) : cur.filter(x => x !== id) };
  });
  const cats = [...new Set(data.challenges.map(c => c.category))];
  const next = useMemo(() => {
    const out: string[] = []; if (!ch) return out;
    const lv = [25, 45, 60].find(l => !st.done.includes(`class-${ch.cls}-${l}`.toLowerCase()));
    if (lv) out.push(`Level ${ch.name} (${ch.cls}) to ${lv} for a Legacy Point${ch.level ? ` — currently ${ch.level}` : ''}.`);
    ch.profs.split(',').map(s => s.trim()).filter(Boolean).forEach(p => { const c = data.challenges.find(x => x.category === 'Tradeskills' && x.hint.startsWith(p) && !st.done.includes(x.id)); if (c) out.push(`Raise ${c.hint} → "${c.name}".`); });
    const untried = CLASSES.filter(c => !st.done.includes(`class-${c}-25`.toLowerCase()) && !st.chars.some(x => x.cls === c));
    if (untried.length) out.push(`Roll an alt: a ${untried[0]} to 25 is a quick point (${untried.length} classes untouched).`);
    if (spent < Math.min(CAP, earned)) out.push(`You have ${Math.min(CAP, earned) - spent} unspent point(s) on ${ch.name}.`);
    const r = data.meta.rewards.find(([n]) => (n as number) > earned); if (r) out.push(`${(r[0] as number) - earned} more points until reward: ${r[1]}.`);
    if (ch.level >= 15 && !st.done.includes('dng-0')) out.push('Start the Novice Spelunker dungeon set.');
    return out;
  }, [st, ch, earned, spent]);
  const groupClasses = new Set(st.group);
  return <div className="wrap">
    <header><h1>GhidorahGG <span>Forever Tracker</span></h1><Countdown /></header>
    {showIntro ? <section className="intro" aria-label="About this tracker">
      <div className="intro-top">
        <p>A free, fan-made tracker for WoW: Forever Legacy challenges, alts, perk planning, talent builds, campfires, and Classic dungeon quests, launching November 4, 2026.</p>
        <button type="button" className="howto" onClick={dismissIntro}>Got it</button>
      </div>
      <h2>How to use</h2>
      <ol>
        <li>Tick off challenges to tally Legacy Points.</li>
        <li>Add characters in Characters.</li>
        <li>Plan talent builds in Talents, perk points in Perks, and camps in Camp.</li>
        <li>Open Dungeon Quests to filter Classic dungeon quests by faction and check off the ones you have finished.</li>
        <li>Progress saves in this browser. Share plan sends the tracker. Talents has its own link for a build.</li>
      </ol>
    </section> : <div className="intro-reopen"><button type="button" className="howto" onClick={reopenIntro}>How to use</button></div>}
    <div className="stats"><div><b>{earned}</b> account Legacy Points</div><div><b>{st.done.length}</b>/{data.challenges.length} challenges</div><button onClick={share}>🔗 Share plan</button></div>
    <nav>{([['challenges', 'Challenges'], ['characters', 'Characters'], ['talents', 'Talents'], ['perks', 'Perks'], ['camp', 'Camp'], ['dungeons', 'Dungeon Quests']] as const).map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {tab === 'challenges' && <section>
      <p className="lead">Tick the box on each Legacy challenge you have finished. Your Legacy Points update in the bar above.</p>
      <Legend src />
      {cats.map(cat => { const list = data.challenges.filter(c => c.category === cat);
        return <div className="card" key={cat}><h3>{cat} <small>{list.filter(c => st.done.includes(c.id)).length}/{list.length}</small></h3>
          <div className="grid">{list.map(c => <label key={c.id} className={st.done.includes(c.id) ? 'done' : ''}>
            <input type="checkbox" checked={st.done.includes(c.id)} onChange={e => upd({ done: e.target.checked ? [...st.done, c.id] : st.done.filter(x => x !== c.id) })} />
            <span>{c.name}<small>{c.hint} · <a href={c.sources[0]} target="_blank">src</a></small></span><Tag c={c.confidence} /></label>)}</div></div>; })}
      <p className="note">⚠ {data.meta.notes[0]} </p>
    </section>}
    {tab === 'characters' && <section>
      <p className="lead">Click a character to edit them, or + Add to create an alt, then set class, race, level, and professions.</p>
      <div className="chips">{st.chars.map(c => <button key={c.id} className={c.id === ch?.id ? 'on' : ''} onClick={() => upd({ active: c.id })}>{c.name} <small>{c.level} {c.race} {c.cls}</small></button>)}
        <button onClick={() => { const c = newChar(); upd({ chars: [...st.chars, c], active: c.id }); }}>+ Add</button></div>
      {ch && <div className="card form">
        <label>Name<input value={ch.name} onChange={e => updChar({ name: e.target.value })} /></label>
        <label>Class<select value={ch.cls} onChange={e => updChar({ cls: e.target.value })}>{CLASSES.map(c => <option key={c}>{c}</option>)}</select></label>
        <label>Race<select value={ch.race} onChange={e => updChar({ race: e.target.value })}>{RACES.map(c => <option key={c}>{c}</option>)}</select></label>
        <label>Level<input type="number" min={1} max={60} value={ch.level} onChange={e => updChar({ level: +e.target.value })} /></label>
        <label className="wide">Professions (comma separated)<input value={ch.profs} placeholder="Alchemy, Herbalism" onChange={e => updChar({ profs: e.target.value })} /></label>
        {st.chars.length > 1 && <button className="danger" onClick={() => { const rest = st.chars.filter(c => c.id !== ch.id); upd({ chars: rest, active: rest[0].id }); }}>Delete character</button>}
      </div>}
      <div className="card"><h3>What to do next</h3><ul>{next.map((n, i) => <li key={i}>{n}</li>)}</ul></div>
    </section>}
    {tab === 'talents' && <Talents />}
    {tab === 'perks' && ch && <section>
      <p className="lead">Click + and − to plan perk ranks for this character. A perk stays locked until its tree has enough points.</p>
      <div className="stats"><div>Planning <b>{ch.name}</b>: {spent}/{CAP} planned <small>({Math.min(CAP, earned)} usable now, {earned} earned)</small></div><button onClick={() => updChar({ plan: {} })}>Reset</button></div>
      {msg && <p className="bad" data-testid="cascade">{msg}</p>}
      {earned < CAP && <p className="note">You can plan beyond earned points; extra ranks are shown as "planned".</p>}
      <div className="trees">{['Professions', 'Adventure', 'Resourcefulness'].map(t => <div className="card" key={t}><h3>{t} <small>{treeSpent(ch.plan, t)}</small></h3>
        {data.perks.filter(p => p.tree === t).map(p => { const r = ch.plan[p.id] || 0; const ok = canAdd(ch.plan, p, CAP);
          return <div key={p.id} className={'perk' + (r ? ' has' : '') + (ok || r ? '' : ' locked')}>
            <div><b>{p.name}</b> <small>col {p.column}{p.extraPrereq ? ` · needs ${p.extraPrereq.replace(':', ' ')}` : ''}</small><small className="eff">{p.effect}</small></div>
            <div className="rk"><button disabled={!r} onClick={() => { const np = validate({ ...ch.plan, [p.id]: r - 1 }); const lost = Object.values({ ...ch.plan, [p.id]: r - 1 }).reduce((a, b) => a + b, 0) - Object.values(np).reduce((a, b) => a + b, 0); updChar({ plan: np }); setMsg(lost ? `Removed ${lost} dependent rank(s) that lost their unlock.` : ''); }}>−</button>{r}/{p.maxRanks}<button disabled={!ok} onClick={() => updChar({ plan: { ...ch.plan, [p.id]: r + 1 } })}>+</button></div></div>; })}
      </div>)}</div>
      <p className="note">Gates: column 2 needs 5 points in the tree, column 3 needs 10. "needs" prereqs come from foreverdb.net only (beta). Removing a rank automatically removes any ranks that lose their unlock.</p>
    </section>}
    {tab === 'dungeons' && <DungeonQuests done={st.dq || []} onToggle={toggleDq} />}
    {tab === 'camp' && <section>
      <p className="lead">Click your group's classes, choose a camp size, then tick the camp features you want. Red means that buff will not stack.</p>
      <Legend announced />
      <div className="card"><h3>Your group's classes</h3><div className="chips">{CLASSES.map(c => <button key={c} className={groupClasses.has(c) ? 'on' : ''} onClick={() => upd({ group: groupClasses.has(c) ? st.group.filter(x => x !== c) : [...st.group, c] })}>{c}</button>)}</div></div>
      <div className="card"><h3>Camp Features <small>{st.camp.length}/{size}</small></h3>
        <div className="chips">{Object.entries(SIZES).map(([k, n]) => <button key={k} className={(st.campSize || 'Basic') === k ? 'on' : ''} onClick={() => upd({ campSize: k, camp: st.camp.slice(0, n) })}>{k} ({n})</button>)}</div>
        <div className="grid">{data.camp.map(f => { const on = st.camp.includes(f.name); const clash = f.conflictClass && groupClasses.has(f.conflictClass);
          return <label key={f.name} className={(on ? 'done ' : '') + (on && clash ? 'clash' : '')}>
            <input type="checkbox" checked={on} disabled={!on && st.camp.length >= size} onChange={() => upd({ camp: on ? st.camp.filter(x => x !== f.name) : [...st.camp, f.name] })} />
            <span>{f.name}<small>{f.profession} · {f.buff}{f.conflict ? ` · ✖ ${f.conflict} (${f.conflictClass})` : ''}</small></span><Tag c={f.confidence} /></label>; })}</div>
        <ul>{st.camp.map(n => { const f = data.camp.find(x => x.name === n)!; return f.conflictClass && groupClasses.has(f.conflictClass)
          ? <li key={n} className="bad">⚠ {n} won't stack with {f.conflict} from your {f.conflictClass}. Swap it out.</li>
          : <li key={n} className="good">✔ {n} adds value.</li>; })}</ul>
        {st.camp.length < size && <p className="note">Suggestions: {data.camp.filter(f => !st.camp.includes(f.name) && !(f.conflictClass && groupClasses.has(f.conflictClass))).slice(0, 4).map(f => f.name).join(', ')}</p>}
      </div>
    </section>}
    <footer>
      <p>Unofficial fan site, not affiliated with Blizzard. Made for the <a href="https://www.youtube.com/@GhidorahGG" target="_blank" rel="noopener">GhidorahGG YouTube channel</a>.</p>
      <p>Data from fan sites (<a href="https://wowfdb.com/legacy">wowfdb.com</a>, <a href="https://foreverdb.net/legacy">foreverdb.net</a>, <a href="https://wowforevertalents.com/">wowforevertalents.com</a>), <a href="https://www.wowhead.com/classic">Wowhead Classic</a>, and Blizzard news; may change at launch. Talent tooltips follow client build 1.60.1.70707 and the 30 Oct 2026 hotfix cache. World of Warcraft is a trademark of Blizzard Entertainment, Inc.</p>
    </footer>
  </div>;
}
