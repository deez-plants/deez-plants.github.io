import { useMemo } from 'react';
import type { DerivedState, Snapshot } from '../types/derived';
import { monthAbbr, shiftMonths } from '../lib/dates';
import './AdherenceHistory.css';

/**
 * DESIGN_REFERENCE.md screen 07: the factual record of what was due, what was
 * done, how late — never a score out of ten, never called health (rule 2).
 * Reached from Home's CARE ADHERENCE block.
 *
 * The six-month bar chart reads the snapshots Update saves (section 5, kept
 * five deep) — one bar per month, showing whatever snapshot landed last in
 * that month. A fresh install with few Updates behind it will show mostly
 * empty months; that is the honest state, not a bug to paper over with
 * invented data (DESIGN_REFERENCE.md section 5, rule 4).
 */

export interface AdherenceHistoryProps {
  state: DerivedState;
  /** Oldest first. */
  snapshots: Snapshot[];
  backLabel: string;
  onBack: () => void;
}

const MONTHS_SHOWN = 6;

/** No thresholds are specified anywhere in the spec — a reasonable reading of
    the mock's own bar colours, not a derived fact (same caveat as Home's
    health `band` function). */
function attentionBand(count: number): 'good' | 'holding' | 'struggling' {
  if (count <= 2) return 'good';
  if (count <= 4) return 'holding';
  return 'struggling';
}

export default function AdherenceHistory({ state, snapshots, backLabel, onBack }: AdherenceHistoryProps) {
  const active = useMemo(
    () => state.order.map((id) => state.plants[id]).filter((p) => !p.archived),
    [state],
  );

  const onSchedule = active.filter((p) => p.adherence.state === 'on').length;
  const slipping = active.filter((p) => p.adherence.state === 'slip').length;
  const behind = active.filter((p) => p.adherence.state === 'behind').length;
  const total = active.length || 1;

  const months = useMemo(() => {
    const bars: { label: string; count: number | null }[] = [];
    for (let i = MONTHS_SHOWN - 1; i >= 0; i--) {
      const monthDate = shiftMonths(state.as_of, -i);
      const nextMonth = shiftMonths(state.as_of, -i + 1);
      // Last snapshot taken within this calendar month, if any.
      let count: number | null = null;
      for (const s of snapshots) {
        if (s.taken >= monthDate && s.taken < nextMonth) count = s.state.collection.needs_attention.length;
      }
      bars.push({ label: monthAbbr(monthDate), count });
    }
    return bars;
  }, [snapshots, state.as_of]);

  const maxCount = Math.max(1, ...months.map((m) => m.count ?? 0));

  return (
    <main className="adh">
      <button type="button" className="screen-back adh-back" onClick={onBack}>‹ {backLabel}</button>

      <h1 className="adh-title">Care adherence history</h1>
      <p className="adh-sub">{snapshots.length} state{snapshots.length === 1 ? '' : 's'} on record</p>

      <section className="adh-card">
        <span className="adh-label">LAST SIX MONTHS</span>
        <div className="adh-bars">
          {months.map((m, i) => (
            <div key={i} className="adh-bar-col">
              <span className="adh-bar-count">{m.count ?? '–'}</span>
              <span
                className={`adh-bar adh-bar-${m.count === null ? 'empty' : attentionBand(m.count)}`}
                style={{ height: m.count === null ? '6px' : `${8 + (m.count / maxCount) * 72}px` }}
              />
              <span className="adh-bar-label">{m.label}</span>
            </div>
          ))}
        </div>
      </section>

      <p className="adh-note">
        Plants needing attention, month by month. Each bar is the last state
        saved when Update was tapped that month — a blank bar means no Update
        landed in it.
      </p>

      <section className="adh-card">
        <div className="adh-now-head">
          <span className="adh-now-title">Now</span>
          <span className="adh-now-figure">{onSchedule} of {active.length} on schedule</span>
        </div>
        <span className="adh-label">CURRENT STATE</span>
        <p className="adh-card-line">
          {state.collection.rated_count} of {active.length} rated
          {state.collection.average_health !== null && <> · average {state.collection.average_health.toFixed(1)}</>}
        </p>
        <div className="adh-split" aria-hidden="true">
          {onSchedule > 0 && <span className="adh-split-on" style={{ flexGrow: onSchedule }} />}
          {slipping > 0 && <span className="adh-split-slip" style={{ flexGrow: slipping }} />}
          {behind > 0 && <span className="adh-split-behind" style={{ flexGrow: behind }} />}
          {onSchedule + slipping + behind === 0 && <span className="adh-split-on" style={{ flexGrow: total }} />}
        </div>
        <div className="adh-legend">
          <span className="adh-legend-item"><span className="adh-legend-dot on" />{onSchedule} on schedule</span>
          <span className="adh-legend-item"><span className="adh-legend-dot slip" />{slipping} slipping</span>
          <span className="adh-legend-item"><span className="adh-legend-dot behind" />{behind} behind</span>
        </div>
      </section>

      <p className="adh-note">
        Each block is a state saved when you tapped Update. Only Now is live —
        the rest are frozen, so scrolling back is scrolling back.
      </p>
    </main>
  );
}
