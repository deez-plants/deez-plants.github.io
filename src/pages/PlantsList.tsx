import { useMemo, useState } from 'react';
import type { PlantId } from '../types/ids';
import type { DerivedPlant, DerivedState } from '../types/derived';
import type { Adherence } from '../types/plant';
import { healthBand } from '../score/score';
import './PlantsList.css';

/** The state word under the pill. Rule 2: a word about what happened, never a
    score; rule 9: never an instruction to act. */
const STATE_WORD: Record<Adherence, string> = {
  on: 'Kept',
  slip: 'Slipping',
  behind: 'Behind',
};

/**
 * The plants list. Search over name and species; archived plants never appear
 * here or in the count — both read `state.collection.active_count` /
 * `state.order`, never a hardcoded 22 (rule: derived, not written into code).
 *
 * Rows follow DESIGN_REFERENCE.md screen 02 exactly: thumbnail, ID in mono,
 * name, the health figure in a coloured pill, and the adherence state word
 * beneath it. Chevron.
 *
 * They previously carried the full three-line `ScoreBlock` and the room, on
 * the grounds that rule 6 admits no compact variant. That was wrong twice
 * over: the reference specifies the pill outright, and the resulting rows
 * were tall enough to hit its own "lessons already learned once — plant list
 * cards were previously too tall… prefer compact rows". The pill is recorded
 * as a deliberate exception in FIELD_DEFINITIONS.md section 3b. A pill is
 * how you *find* a plant; the full block, on the plant's own page, is how you
 * *read* its score.
 */

export interface PlantsListProps {
  state: DerivedState;
  /** media_id -> object URL. */
  thumbs: Map<string, string>;
  onOpen: (plant_id: PlantId) => void;
  onCare: () => void;
}

type Filter = 'all' | 'attention' | 'due' | 'off-schedule';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'due', label: 'Due' },
  { key: 'off-schedule', label: 'Not on schedule' },
];

/** `attention` mirrors the same behind/stale rule Home's Needs-attention list
    uses (`state.collection.needs_attention`) — same concept, same reading,
    just checked per-row here instead of built as a collection-wide list.
    `due` is "would show under Home's DUE block" (past interval or due today).
    `off-schedule` is specifically slip/behind — a status judgement, not a
    date — so it excludes a plant that's merely due today but still on time. */
function matchesFilter(p: DerivedPlant, filter: Filter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'attention': return p.attention.includes('behind') || p.attention.includes('health_stale');
    case 'due': return p.adherence.days_past !== null && p.adherence.days_past >= 0;
    case 'off-schedule': return p.adherence.state !== 'on';
  }
}

interface Group {
  name: string;
  plants: DerivedPlant[];
}

/** Display grouping — every active plant appears somewhere, unlike
    `careRound.ts`'s `selectionGroups`, which is selection-oriented and drops
    planters with only one plant in them. Plants with no planter, and any
    planter left with just one plant after filtering, land in "No planter". */
function groupByPlanter(plants: DerivedPlant[]): Group[] {
  const byPlanter = new Map<string, DerivedPlant[]>();
  const none: DerivedPlant[] = [];
  for (const p of plants) {
    if (!p.planter) { none.push(p); continue; }
    const list = byPlanter.get(p.planter);
    if (list) list.push(p);
    else byPlanter.set(p.planter, [p]);
  }
  const groups: Group[] = [...byPlanter]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, list]) => ({ name, plants: list }));
  if (none.length) groups.push({ name: 'No planter', plants: none });
  return groups;
}

export default function PlantsList({ state, thumbs, onOpen, onCare }: PlantsListProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [grouped, setGrouped] = useState(false);

  const active = useMemo(
    () => state.order.map((id) => state.plants[id]).filter((p) => !p.archived),
    [state],
  );

  const q = query.trim().toLowerCase();
  const visible = active
    .filter((p) => matchesFilter(p, filter))
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.species.toLowerCase().includes(q));

  const groups = grouped ? groupByPlanter(visible) : null;

  const row = (p: DerivedPlant) => {
    const hero = p.hero ?? p.photos[0];
    const url = hero ? thumbs.get(hero) : undefined;
    const health = p.health.current;
    return (
      <li key={p.plant_id}>
        <button type="button" className="plants-row" onClick={() => onOpen(p.plant_id)}>
          {url
            ? <img className="plants-thumb" src={url} alt="" width={64} height={64} />
            : <span className="plants-thumb plants-thumb-empty" />}
          <span className="plants-row-body">
            <span className="plants-row-id">{p.plant_id}</span>
            <span className="plants-row-name">{p.name}</span>
          </span>
          <span className="plants-row-state">
            {/* An unrated plant gets an empty pill, never a stand-in number
                (rule 1) — DESIGN_REFERENCE.md screen 02's own "a plant with
                no rating (the pill shows no number)" state. */}
            <span className={health === null ? 'plants-pill none' : `plants-pill ${healthBand(health)}`}>
              {health ?? '—'}
            </span>
            <span className={`plants-word ${p.adherence.state}`}>{STATE_WORD[p.adherence.state]}</span>
          </span>
          <span className="plants-row-chev" aria-hidden="true">›</span>
        </button>
      </li>
    );
  };

  return (
    <main className="plants">
      <h1 className="plants-title">Plants</h1>

      <button type="button" className="plants-care" onClick={onCare}>
        Log care
      </button>

      <input
        type="search"
        className="plants-search"
        placeholder={`Search ${state.collection.active_count} plants…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="plants-chips">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={filter === f.key ? 'plants-chip on' : 'plants-chip'}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="plants-chips">
        <button
          type="button"
          className={!grouped ? 'plants-chip on' : 'plants-chip'}
          aria-pressed={!grouped}
          onClick={() => setGrouped(false)}
        >
          All {visible.length}
        </button>
        <button
          type="button"
          className={grouped ? 'plants-chip on' : 'plants-chip'}
          aria-pressed={grouped}
          onClick={() => setGrouped(true)}
        >
          By planter
        </button>
      </div>

      <p className="plants-count">
        {q ? `${visible.length} of ${state.collection.active_count} match` : `${state.collection.active_count} active`}
      </p>

      {groups ? (
        <div className="plants-groups">
          {groups.map((g) => (
            <section key={g.name} className="plants-group">
              <span className="plants-group-label">{g.name.toUpperCase()} · {g.plants.length}</span>
              <ul className="plants-items">{g.plants.map(row)}</ul>
            </section>
          ))}
          {groups.length === 0 && <p className="plants-empty">No plants match.</p>}
        </div>
      ) : (
        <ul className="plants-items">
          {visible.map(row)}
          {visible.length === 0 && (
            <li className="plants-empty">
              {q ? <>No plants match "{query}".</> : 'No plants match this filter.'}
            </li>
          )}
        </ul>
      )}
    </main>
  );
}
