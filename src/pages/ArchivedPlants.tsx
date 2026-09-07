import { useMemo } from 'react';
import type { DerivedState } from '../types/derived';
import { formatDayMonthYear } from '../lib/dates';
import './ArchivedPlants.css';

/**
 * DESIGN_REFERENCE.md screen 12. Rows read straight off the `Archive` event
 * (`archived_date`/`archived_reason` — rule 8, never a state patch).
 *
 * No Restore action here: the event model (`FIELD_DEFINITIONS.md` section 5)
 * has no "un-archive" event type, and archiving itself isn't wired up to any
 * write path yet (see the `project-spider-plant-status` memory) — this is a
 * real gap in the model, not a UI omission, so the mock's Restore button
 * isn't built rather than built to do nothing.
 */

export interface ArchivedPlantsProps {
  state: DerivedState;
  backLabel: string;
  onBack: () => void;
}

export default function ArchivedPlants({ state, backLabel, onBack }: ArchivedPlantsProps) {
  const archived = useMemo(
    () => state.order.map((id) => state.plants[id]).filter((p) => p.archived),
    [state],
  );

  return (
    <main className="archived">
      <button type="button" className="archived-back" onClick={onBack}>‹ {backLabel}</button>

      <h1 className="archived-title">Archived</h1>
      <p className="archived-sub">IDs are never reused. Records and history are kept.</p>

      {archived.length > 0 && (
        <ul className="archived-rows">
          {archived.map((p) => (
            <li key={p.plant_id} className="archived-row">
              <span className="archived-row-id">{p.plant_id}</span>
              <span className="archived-row-name">{p.name}</span>
              {p.archived_reason && <span className="archived-row-reason">{p.archived_reason}</span>}
              {p.archived_date && (
                <span className="archived-row-date">{formatDayMonthYear(p.archived_date)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
