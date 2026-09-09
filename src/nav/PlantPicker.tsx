import { useMemo, useState } from 'react';
import type { PlantId } from '../types/ids';
import type { DerivedState } from '../types/derived';
import './PlantPicker.css';

export interface PlantPickerProps {
  state: DerivedState;
  thumbs: Map<string, string>;
  /** What picking a plant will open — named on screen so the question is
      "which plant's photos?", not a bare list of plants. */
  destination: string;
  backLabel: string;
  onBack: () => void;
  onPick: (plant_id: PlantId) => void;
}

/**
 * Asks which plant, for the All-pages rows whose destination is plant-scoped.
 *
 * Those five rows (Plant detail, History, Photos, More about this plant, Info
 * and settings) used to open a placeholder telling the owner to go to the
 * Plants tab and open a plant instead — a dead end that named the fix rather
 * than doing it. The rows are worth keeping in All pages, so the missing plant
 * is asked for here.
 *
 * Archived plants are left out: every destination behind this picker is a
 * screen about a plant you still keep, and the archived list is its own row.
 */
export default function PlantPicker({
  state, thumbs, destination, backLabel, onBack, onPick,
}: PlantPickerProps) {
  const [query, setQuery] = useState('');

  const active = useMemo(
    () => state.order.map((id) => state.plants[id]).filter((p) => !p.archived),
    [state],
  );

  const q = query.trim().toLowerCase();
  const visible = active.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.plant_id.toLowerCase().includes(q),
  );

  return (
    <main className="picker">
      <button type="button" className="picker-back" onClick={onBack}>‹ {backLabel}</button>
      <h1 className="picker-title">Which plant?</h1>
      <p className="picker-sub">Opens {destination}.</p>

      <input
        className="picker-search"
        type="search"
        value={query}
        placeholder="Search by name or ID"
        aria-label="Search plants"
        onChange={(e) => setQuery(e.target.value)}
      />

      <ul className="picker-rows">
        {visible.map((p) => {
          const hero = p.hero ?? p.photos[0];
          const url = hero ? thumbs.get(hero) : undefined;
          return (
            <li key={p.plant_id}>
              <button type="button" className="picker-row" onClick={() => onPick(p.plant_id)}>
                {url
                  ? <img className="picker-thumb" src={url} alt="" width={56} height={56} />
                  : <span className="picker-thumb picker-thumb-empty" />}
                <span className="picker-row-body">
                  <span className="picker-row-id">{p.plant_id}</span>
                  <span className="picker-row-name">{p.name}</span>
                </span>
                <span className="picker-row-chev" aria-hidden="true">›</span>
              </button>
            </li>
          );
        })}
      </ul>

      {visible.length === 0 && <p className="picker-empty">No plant matches “{query}”.</p>}
    </main>
  );
}
