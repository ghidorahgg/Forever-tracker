import { useMemo, useState } from 'react';
import raw from './data/dungeon-quests.json';

type Quest = {
  id: number;
  name: string;
  faction: 'Alliance' | 'Horde' | 'Both';
  reqLevel: number | null;
  level: number | null;
  giver: string;
  startZone: string;
  classes: string[];
  chain: string;
  rewards: string;
  task: string;
  note: string;
  wowhead: string;
  wing?: string;
};
type Dungeon = {
  id: string;
  name: string;
  minLevel: number;
  maxLevel: number;
  location: string;
  quests: Quest[];
};
const data = raw as unknown as { meta: { counts: { total: number; alliance: number; horde: number; both: number } }; dungeons: Dungeon[] };

const WINGS: Record<string, string[]> = {
  sm: ['Graveyard', 'Library', 'Graveyard, Armory & Cathedral', 'All wings'],
  dmaul: ['East', 'West', 'North', 'Class books'],
  mara: ['Wicked Grotto', 'Foulspore Cavern', 'Earth Song Falls', 'All wings'],
  strat: ['Main Gate', 'Service Entrance'],
};

function visibleFaction(q: Quest, fac: 'All' | 'Alliance' | 'Horde') {
  if (fac === 'All') return true;
  return q.faction === fac || q.faction === 'Both';
}

export default function DungeonQuests({ done, onToggle }: { done: number[]; onToggle: (id: number, on: boolean) => void }) {
  const [fac, setFac] = useState<'All' | 'Alliance' | 'Horde'>('All');
  const [query, setQuery] = useState('');
  const doneSet = useMemo(() => new Set(done), [done]);
  const q = query.trim().toLowerCase();
  const counts = data.meta.counts;
  let shown = 0;
  let shownDone = 0;

  return <section>
    <p className="lead">Check off Classic dungeon quests. Filter by faction, search, and open any quest on Wowhead.</p>
    <p className="legend"><span className="tag classic">classic</span> is Classic-era data and may differ in Forever.</p>
    <div className="qfilters">
      <input type="search" value={query} placeholder="Search quests, givers, zones" aria-label="Search dungeon quests" onChange={e => setQuery(e.target.value)} />
      <div className="chips">
        {(['All', 'Alliance', 'Horde'] as const).map(f => <button key={f} type="button" className={fac === f ? 'on' : ''} onClick={() => setFac(f)}>{f}</button>)}
      </div>
    </div>
    <p className="note">{counts.total} Classic quests: {counts.alliance} Alliance, {counts.horde} Horde, {counts.both} both. Alliance and Horde filters keep the shared quests.</p>
    {data.dungeons.map(d => {
      const factionQuests = d.quests.filter(quest => visibleFaction(quest, fac));
      if (!factionQuests.length) return null;
      const matches = q ? factionQuests.filter(quest => {
        const hay = [quest.name, quest.giver, quest.startZone, quest.chain, quest.rewards, quest.task, quest.note, quest.wing || '', d.name, d.location, String(quest.id)].join(' ').toLowerCase();
        return hay.includes(q);
      }) : factionQuests;
      if (!matches.length) return null;
      shown += matches.length;
      shownDone += matches.filter(quest => doneSet.has(quest.id)).length;
      const wings = WINGS[d.id];
      const groups = wings
        ? wings.map(w => ({ wing: w, quests: matches.filter(quest => quest.wing === w) })).filter(g => g.quests.length)
        : [{ wing: '', quests: matches }];
      const factionDone = factionQuests.filter(quest => doneSet.has(quest.id)).length;
      return <div className="card" key={d.id}>
        <h3>{d.name} <small>{d.location} · {d.minLevel}–{d.maxLevel}</small> <small>{factionDone}/{factionQuests.length}</small></h3>
        {groups.map(g => <div key={g.wing || 'all'}>
          {g.wing && <h4 className="wingh">{g.wing} <small>{factionQuests.filter(quest => quest.wing === g.wing && doneSet.has(quest.id)).length}/{factionQuests.filter(quest => quest.wing === g.wing).length}</small></h4>}
          <div className="qlist">{g.quests.map(quest => {
            const on = doneSet.has(quest.id);
            return <div key={quest.id} className={'qrow' + (on ? ' done' : '')} onClick={() => onToggle(quest.id, !on)}>
              <input type="checkbox" checked={on} aria-label={quest.name} onClick={e => e.stopPropagation()} onChange={e => onToggle(quest.id, e.target.checked)} />
              <div className="qbody">
                <a href={quest.wowhead} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{quest.name}</a>
                <small className="qmeta">{quest.faction} · req {quest.reqLevel ?? '?'} · level {quest.level ?? '?'} · {quest.giver}{quest.startZone ? `, ${quest.startZone}` : ''}{quest.classes.length ? ` · ${quest.classes.join(', ')}` : ''}</small>
                {quest.task && <small className="qmeta">{quest.task}</small>}
                {quest.chain && <small className="qmeta">{quest.chain}</small>}
                {quest.rewards && <small className="qmeta">{quest.rewards}</small>}
                {quest.note && <small className="qmeta">{quest.note}</small>}
              </div>
              <span className={'tag ' + quest.faction.toLowerCase()}>{quest.faction}</span>
            </div>;
          })}</div>
        </div>)}
      </div>;
    })}
    {shown === 0 && <p className="note">No quests match.</p>}
    {shown > 0 && q && <p className="note">{shownDone}/{shown} shown quests checked.</p>}
    <p className="credit">Quest data from <a href="https://www.wowhead.com/classic" target="_blank" rel="noopener noreferrer">Wowhead</a>.</p>
  </section>;
}
