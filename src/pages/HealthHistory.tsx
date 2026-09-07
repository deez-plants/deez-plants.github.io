import { useMemo } from 'react';
import type { DerivedState, Snapshot } from '../types/derived';
import { healthBand } from '../score/score';
import { monthAbbr, shiftMonths } from '../lib/dates';
import './HealthHistory.css';

/**
 * DESIGN_REFERENCE.md screen 06: "Your judgement of the collection over
 * time. Nothing here is calculated from care." Reached from Home's HEALTH
 * block. Rule 1: no number here is ever labelled health except a rating a
 * human actually gave — this reads `average_health`, which `derive()` itself
 * already computes only from plants someone rated (an unrated plant is left
 * out, never folded in as a middling value).
 *
 * `derive()` doesn't filter its input by date — calling it with a past
 * `as_of` replays the whole log, not a true historical snapshot. Rather than
 * teach it a date-filtering mode, this reads the same `snapshots` store
 * Adherence history uses (Section 5's "last five," saved on every Update):
 * each one already carries a `collection.average_health` frozen at the
 * moment it was taken.
 */

export interface HealthHistoryProps {
  state: DerivedState;
  /** Oldest first. */
  snapshots: Snapshot[];
  backLabel: string;
  onBack: () => void;
}

const MONTHS_SHOWN = 6;

export default function HealthHistory({ state, snapshots, backLabel, onBack }: HealthHistoryProps) {
  const months = useMemo(() => {
    const bars: { label: string; average: number | null }[] = [];
    for (let i = MONTHS_SHOWN - 1; i >= 0; i--) {
      const monthDate = shiftMonths(state.as_of, -i);
      const nextMonth = shiftMonths(state.as_of, -i + 1);
      // Last snapshot taken within this calendar month, if any.
      let average: number | null = null;
      for (const s of snapshots) {
        if (s.taken >= monthDate && s.taken < nextMonth) average = s.state.collection.average_health;
      }
      bars.push({ label: monthAbbr(monthDate), average });
    }
    return bars;
  }, [snapshots, state.as_of]);

  const maxAverage = Math.max(1, ...months.map((m) => m.average ?? 0));
  const current = state.collection.average_health;

  return (
    <main className="hlh">
      <button type="button" className="hlh-back" onClick={onBack}>‹ {backLabel}</button>

      <h1 className="hlh-title">Health history</h1>
      <p className="hlh-sub">
        Your judgement of the collection over time. Nothing here is
        calculated from care.
      </p>

      <section className="hlh-card">
        <span className="hlh-label">LAST SIX MONTHS</span>
        <div className="hlh-bars">
          {months.map((m, i) => (
            <div key={i} className="hlh-bar-col">
              <span className="hlh-bar-avg">{m.average !== null ? m.average.toFixed(1) : '–'}</span>
              <span
                className={`hlh-bar hlh-bar-${m.average === null ? 'empty' : healthBand(m.average)}`}
                style={{ height: m.average === null ? '6px' : `${8 + (m.average / maxAverage) * 72}px` }}
              />
              <span className="hlh-bar-label">{m.label}</span>
            </div>
          ))}
        </div>
      </section>

      <p className="hlh-note">
        Each figure is the mean of the plants rated at the time — an unrated
        plant is left out, never counted as a middling value. A blank bar
        means no Update landed in that month.
      </p>

      <section className="hlh-card">
        <span className="hlh-label">NOW</span>
        <p className="hlh-card-line">
          {current !== null
            ? <>{state.collection.rated_count} of {state.collection.active_count} rated · average {current.toFixed(1)}</>
            : <>{state.collection.rated_count} of {state.collection.active_count} rated</>}
        </p>
      </section>
    </main>
  );
}
