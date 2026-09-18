import { useMemo, useState } from 'react';
import type { DerivedState, Snapshot } from '../types/derived';
import type { PlantId } from '../types/ids';
import { formatDayMonth } from '../lib/dates';
import { healthBand } from '../score/score';
import './SinceLastTime.css';

/**
 * DESIGN_REFERENCE.md screen 17 — "saved states stacked for comparison. What
 * changed since a chosen earlier point."
 *
 * A snapshot is written whenever a review package is built — so "last time"
 * means "the last AI round", which is the rhythm the owner actually works in —
 * and whenever he marks a point here by hand. Until 2026-09-18 one was written
 * on every Update commit; care logs now count immediately and there is no
 * commit to hang it on. The last five are kept
 * (`SNAPSHOT_LIMIT`). Each is a whole frozen `DerivedState`, so comparing is a
 * matter of reading two states side by side — never of recomputing history,
 * which rule 10 forbids anyway.
 *
 * **What this screen does not do** is guess. A plant rated 5 then, unrated
 * now, has not "fallen": it has not been looked at. A plant that did not exist
 * in the older snapshot is new, not improved. Both get said in words rather
 * than being folded into a number, because a comparison screen that quietly
 * treats absence as a value is how a record starts lying.
 */

export interface SinceLastTimeProps {
  state: DerivedState;
  /** Oldest first, as `boot` provides them. */
  snapshots: readonly Snapshot[];
  backLabel: string;
  onBack: () => void;
  onOpenPlant: (plant_id: PlantId) => void;
  /** Save the state as it stands as a point to compare against later. */
  onMarkPoint: () => Promise<void> | void;
}

type Row =
  | { kind: 'moved'; plant_id: PlantId; name: string; from: number; to: number; delta: number }
  | { kind: 'rated'; plant_id: PlantId; name: string; to: number }
  | { kind: 'unrated'; plant_id: PlantId; name: string; from: number }
  | { kind: 'new'; plant_id: PlantId; name: string; to: number | null }
  | { kind: 'archived'; plant_id: PlantId; name: string };

export default function SinceLastTime({
  state, snapshots, backLabel, onBack, onOpenPlant, onMarkPoint,
}: SinceLastTimeProps) {
  const [marking, setMarking] = useState(false);
  // Newest first: the most recent saved state is the one you usually mean by
  // "last time".
  const choices = useMemo(() => [...snapshots].reverse(), [snapshots]);
  const [pick, setPick] = useState(0);
  const against = choices[pick];

  const rows = useMemo<Row[]>(() => {
    if (!against) return [];
    const then = against.state;
    const out: Row[] = [];

    for (const id of state.order) {
      const now = state.plants[id];
      const was = then.plants[id];
      if (!now) continue;

      if (!was) {
        out.push({ kind: 'new', plant_id: id, name: now.name, to: now.health.current });
        continue;
      }
      if (now.archived && !was.archived) {
        out.push({ kind: 'archived', plant_id: id, name: now.name });
        continue;
      }
      if (now.archived) continue;

      const a = was.health.current;
      const b = now.health.current;
      if (a === null && b !== null) out.push({ kind: 'rated', plant_id: id, name: now.name, to: b });
      else if (a !== null && b === null) out.push({ kind: 'unrated', plant_id: id, name: now.name, from: a });
      else if (a !== null && b !== null && a !== b) {
        out.push({ kind: 'moved', plant_id: id, name: now.name, from: a, to: b, delta: b - a });
      }
    }

    // Biggest movement first, falls before rises — what you would want to look
    // at. Ordering a list is not the same as claiming a cause.
    const weight = (r: Row) => (r.kind === 'moved' ? Math.abs(r.delta) + (r.delta < 0 ? 0.5 : 0) : 0);
    return out.sort((x, y) => weight(y) - weight(x));
  }, [state, against]);

  const days = against
    ? Math.round((new Date(`${state.as_of}T00:00:00`).getTime()
      - new Date(`${against.taken}T00:00:00`).getTime()) / 86_400_000)
    : 0;

  return (
    <main className="since">
      <button type="button" className="screen-back since-back" onClick={onBack}>‹ {backLabel}</button>
      <h1 className="since-title">Since last time</h1>

      {/* The manual half of where snapshots come from. The other is building a
          review package, which marks a point on its own. */}
      <button
        type="button"
        className="since-mark"
        disabled={marking}
        onClick={() => { setMarking(true); void Promise.resolve(onMarkPoint()).finally(() => setMarking(false)); }}
      >
        {marking ? 'Marking…' : 'Mark this point'}
      </button>

      {choices.length === 0 ? (
        <>
          <p className="since-dek">Nothing saved to compare against yet.</p>
          <p className="since-empty">
            A point is saved whenever you build a review package, and whenever
            you tap Mark this point above. The last five are kept. Once there
            are two, this screen shows what moved between them.
          </p>
        </>
      ) : (
        <>
          <p className="since-dek">
            Comparing today against a saved state.{' '}
            {days === 0 ? 'Both from today.' : `${days} day${days === 1 ? '' : 's'} apart.`}
          </p>

          <div className="since-picks">
            {choices.map((s, i) => (
              <button
                key={`${s.taken}-${i}`}
                type="button"
                className={i === pick ? 'since-pick on' : 'since-pick'}
                onClick={() => setPick(i)}
              >
                {formatDayMonth(s.taken)}
              </button>
            ))}
          </div>

          <div className="since-summary">
            <span className="since-summary-now">
              {state.collection.average_health === null
                ? 'Not rated'
                : `${state.collection.average_health.toFixed(1)} /10`}
            </span>
            <span className="since-summary-then">
              was {against.state.collection.average_health === null
                ? 'not rated'
                : `${against.state.collection.average_health.toFixed(1)}`}
              {' '}on {formatDayMonth(against.taken)}
            </span>
          </div>

          <p className="since-count">
            {rows.length === 0
              ? 'Nothing changed between these two.'
              : `${rows.length} plant${rows.length === 1 ? '' : 's'} changed`}
          </p>

          <div className="since-rows">
            {rows.map((r) => (
              <button
                key={r.plant_id}
                type="button"
                className="since-row"
                onClick={() => onOpenPlant(r.plant_id)}
              >
                <span className="since-row-name">{r.name}</span>
                {r.kind === 'moved' && (
                  <span className="since-row-move">
                    <span className={`since-pill ${healthBand(r.from)}`}>{r.from}</span>
                    <span className="since-arrow" aria-hidden="true">→</span>
                    <span className={`since-pill ${healthBand(r.to)}`}>{r.to}</span>
                  </span>
                )}
                {r.kind === 'rated' && (
                  <span className="since-row-note">
                    first rating <span className={`since-pill ${healthBand(r.to)}`}>{r.to}</span>
                  </span>
                )}
                {/* Absence is never a fall. Saying so is the point. */}
                {r.kind === 'unrated' && (
                  <span className="since-row-note quiet">was {r.from}, not rated since</span>
                )}
                {r.kind === 'new' && <span className="since-row-note quiet">added since</span>}
                {r.kind === 'archived' && <span className="since-row-note quiet">archived</span>}
              </button>
            ))}
          </div>

          <p className="since-foot">
            A plant that was rated then and is not rated now has not fallen —
            it has not been looked at. This screen says which is which rather
            than folding the two together.
          </p>
        </>
      )}
    </main>
  );
}
