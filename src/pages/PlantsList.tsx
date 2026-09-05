import { useMemo, useState } from 'react';
import type { PlantId } from '../types/ids';
import type { DerivedState } from '../types/derived';
import { ScoreBlock } from '../score/ScoreBlock';
import { plantScore } from '../score/score';
import './PlantsList.css';

/**
 * The plants list. Search over name and species; archived plants never appear
 * here or in the count — both read `state.collection.active_count` /
 * `state.order`, never a hardcoded 22 (rule: derived, not written into code).
 */

export interface PlantsListProps {
  state: DerivedState;
  /** media_id -> object URL. */
  thumbs: Map<string, string>;
  onOpen: (plant_id: PlantId) => void;
  onCare: () => void;
}

export default function PlantsList({ state, thumbs, onOpen, onCare }: PlantsListProps) {
  const [query, setQuery] = useState('');

  const active = useMemo(
    () => state.order.map((id) => state.plants[id]).filter((p) => !p.archived),
    [state],
  );

  const q = query.trim().toLowerCase();
  const visible = q
    ? active.filter((p) => p.name.toLowerCase().includes(q) || p.species.toLowerCase().includes(q))
    : active;

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

      <p className="plants-count">
        {q ? `${visible.length} of ${state.collection.active_count} match` : `${state.collection.active_count} active`}
      </p>

      <ul className="plants-items">
        {visible.map((p) => {
          const hero = p.hero ?? p.photos[0];
          const url = hero ? thumbs.get(hero) : undefined;
          return (
            <li key={p.plant_id}>
              <button type="button" className="plants-row" onClick={() => onOpen(p.plant_id)}>
                {url
                  ? <img className="plants-thumb" src={url} alt="" width={56} height={56} />
                  : <span className="plants-thumb plants-thumb-empty" />}
                <span className="plants-row-body">
                  <span className="plants-row-id">{p.plant_id}</span>
                  <span className="plants-row-name">{p.name}</span>
                  <span className="plants-row-meta">{p.room}</span>
                  <span className="plants-row-score"><ScoreBlock {...plantScore(p)} /></span>
                </span>
                <span className="plants-row-chev" aria-hidden="true">›</span>
              </button>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="plants-empty">No plants match “{query}”.</li>
        )}
      </ul>
    </main>
  );
}
