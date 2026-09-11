import { useMemo } from 'react';
import type { DerivedState } from '../types/derived';
import type { StoredEvent } from '../types/event';
import type { PlantId } from '../types/ids';
import { answeredCount, careChanges } from '../score/whatWorks';
import { formatDayMonth } from '../lib/dates';
import { healthBand } from '../score/score';
import './WhatWorks.css';

/**
 * DESIGN_REFERENCE.md screen 18. Each care change you made, with your ratings
 * either side of it.
 *
 * **Not a claim of causation.** The reference says so outright, and it is the
 * whole design of the screen: the two readings sit side by side, the movement
 * between them is stated as a number with its elapsed days, and nothing
 * anywhere says the change caused it. There is no "what worked" ranking, no
 * best-change summary, no average. A rating moves for reasons this record
 * never saw — the weather, a move across the room, the plant simply settling —
 * and the person who looked at it is better placed than any arithmetic.
 *
 * The honest failure mode of a screen like this is looking authoritative. The
 * copy works against that on purpose.
 */

export interface WhatWorksProps {
  state: DerivedState;
  events: readonly StoredEvent[];
  backLabel: string;
  onBack: () => void;
  onOpenPlant: (plant_id: PlantId) => void;
}

function movement(delta: number | null, days: number | null): string {
  if (delta === null || days === null) return '';
  const size = Math.abs(delta) < 0.05 ? 'no change' : `${delta > 0 ? '+' : ''}${delta}`;
  if (size === 'no change') return `no change over ${days} day${days === 1 ? '' : 's'}`;
  return `${size} over ${days} day${days === 1 ? '' : 's'}`;
}

export default function WhatWorks({ state, events, backLabel, onBack, onOpenPlant }: WhatWorksProps) {
  const changes = useMemo(() => careChanges(state, events), [state, events]);
  const answered = answeredCount(changes);

  return (
    <main className="works">
      <button type="button" className="works-back" onClick={onBack}>‹ {backLabel}</button>
      <h1 className="works-title">What works</h1>
      <p className="works-dek">
        Every change you made to how a plant is cared for, with your ratings
        either side of it.
      </p>

      {/* The screen's own conscience, stated before any data. */}
      <p className="works-caveat">
        <strong>This is not a claim about cause.</strong> The ratings are shown
        and the reading is yours. A plant moves for reasons this record never
        saw, and two numbers cannot tell them apart.
      </p>

      <p className="works-count">
        {changes.length === 0
          ? 'No care changes recorded yet.'
          : `${changes.length} change${changes.length === 1 ? '' : 's'} · ${answered} with a rating on both sides`}
      </p>

      {changes.length === 0 && (
        <p className="works-empty">
          This fills in as you adjust a plant&rsquo;s watering interval, feed,
          light, soil or pot — from Info and settings, or by approving an AI
          proposal. Rate the plant before and after and the two readings appear
          here side by side.
        </p>
      )}

      <div className="works-list">
        {changes.map((c) => (
          <section className="works-item" key={c.event_id}>
            <div className="works-head">
              <button type="button" className="works-plant" onClick={() => onOpenPlant(c.plant_id)}>
                {c.plant_name}
              </button>
              <span className="works-date">{formatDayMonth(c.date)}</span>
            </div>

            <p className="works-what">
              <span className="works-field">{c.label}</span>
              {' '}
              <span className="works-from">{c.from ?? 'not set'}</span>
              <span className="works-arrow" aria-label="changed to"> → </span>
              <span className="works-to">{c.to ?? 'not set'}</span>
              {/* Section 8: which hand set a value is part of the record. */}
              {c.source === 'ai' && <span className="works-by">AI</span>}
            </p>

            <div className="works-ratings">
              <div className="works-side">
                <span className="works-side-label">Before</span>
                {c.before ? (
                  <span className={`works-pill ${healthBand(c.before.value)}`}>{c.before.value}</span>
                ) : (
                  <span className="works-pill none">—</span>
                )}
                <span className="works-side-date">
                  {c.before ? formatDayMonth(c.before.date) : 'not rated'}
                </span>
              </div>

              <div className="works-side">
                <span className="works-side-label">After</span>
                {c.after ? (
                  <span className={`works-pill ${healthBand(c.after.value)}`}>{c.after.value}</span>
                ) : (
                  <span className="works-pill none">—</span>
                )}
                <span className="works-side-date">
                  {c.after ? formatDayMonth(c.after.date) : 'not rated since'}
                </span>
              </div>
            </div>

            {/* The delta never appears without its elapsed days — §3b's rule,
                and the reason is sharper here than anywhere: two points over
                eight months and two points over a week are different facts. */}
            {c.delta !== null ? (
              <p className="works-move">{movement(c.delta, c.elapsed_days)}</p>
            ) : (
              <p className="works-move open">
                {c.before
                  ? 'Nothing to compare yet — rate this plant and the other half appears.'
                  : 'No rating from before this change, so there is nothing to sit beside.'}
              </p>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
