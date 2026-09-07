import { useMemo } from 'react';
import type { PlantId } from '../types/ids';
import type { DerivedPlant, DerivedState } from '../types/derived';
import { ScoreBlock } from '../score/ScoreBlock';
import { collectionScore } from '../score/score';
import './Home.css';

/**
 * The daily surface (DESIGN_REFERENCE.md screen 01). Everything here reads
 * `DerivedState` — nothing on this screen computes a health figure (rule 1) or
 * invents a schedule the record doesn't hold.
 *
 * Left out of this pass, and why:
 * - The catch-up banner needs a stored "last opened" timestamp, which nothing
 *   writes yet.
 * - The health sparkline needs a history of collection-average snapshots,
 *   which `DerivedState` doesn't keep (only the single most recent previous
 *   average survives, via `collectionScore`).
 * - The handoff log and the "session held on this device" notice both belong
 *   to export/import and capture, neither built yet — showing them here would
 *   mean inventing zeros.
 * - `feed` is free text on every plant (FIELD_DEFINITIONS.md section 4), not
 *   an interval with a due date the way `water` is. So DUE and Do next are
 *   water-only here, honestly, rather than a fabricated feed schedule.
 */

export interface HomeProps {
  state: DerivedState;
  onOpenPlant: (plant_id: PlantId) => void;
  onCare: () => void;
  onPlaceholder: (title: string, subtitle?: string) => void;
  onArchived: () => void;
  onAdherenceHistory: () => void;
}

/** No band thresholds are specified anywhere in the spec — this is a
    reasonable reading of the mock's 1-10 scale, not a derived fact. */
function band(value: number): 'good' | 'holding' | 'struggling' {
  if (value >= 7) return 'good';
  if (value >= 4) return 'holding';
  return 'struggling';
}

const NEEDS_ATTENTION_CAP = 6;
const MOST_URGENT_CAP = 6;

export default function Home({ state, onOpenPlant, onCare, onPlaceholder, onArchived, onAdherenceHistory }: HomeProps) {
  const active = useMemo(
    () => state.order.map((id) => state.plants[id]).filter((p) => !p.archived),
    [state],
  );

  const rated = active.filter((p) => p.health.current !== null);
  const bands = { good: 0, holding: 0, struggling: 0 };
  for (const p of rated) bands[band(p.health.current as number)]++;
  const unratedCount = active.length - rated.length;
  const staleCount = active.filter((p) => p.health.stale).length;

  const onSchedule = active.filter((p) => p.adherence.state === 'on').length;
  const slipping = active.filter((p) => p.adherence.state === 'slip').length;
  const behind = active.filter((p) => p.adherence.state === 'behind').length;

  const pastInterval = active.filter((p) => p.adherence.days_past !== null && p.adherence.days_past > 0);
  const dueToday = active.filter((p) => p.adherence.days_past === 0);
  const dueThisWeek = active.filter(
    (p) => p.adherence.days_past !== null && p.adherence.days_past < 0 && p.adherence.days_past >= -6,
  );
  const dueTotal = pastInterval.length + dueToday.length + dueThisWeek.length;

  const needsAttention = state.collection.needs_attention.map((id) => state.plants[id]);

  const mostUrgent = [...pastInterval, ...dueToday]
    .sort((a, b) => (b.adherence.days_past ?? 0) - (a.adherence.days_past ?? 0));

  const attentionReason = (p: DerivedPlant): string => {
    if (p.attention.includes('behind') && p.adherence.days_past !== null && p.adherence.days_past > 0) {
      const n = p.adherence.days_past;
      return `Check soil — ${n} day${n === 1 ? '' : 's'} past interval`;
    }
    if (p.attention.includes('health_stale')) return 'Not looked at in three months';
    return 'Check soil';
  };

  return (
    <main className="home">
      <div className="home-title-row">
        <h1 className="home-title">Deez Plants</h1>
        <span className="home-tracked">{state.collection.active_count} TRACKED</span>
      </div>

      <section className="home-card">
        <ScoreBlock {...collectionScore(state)} />
        {rated.length > 0 && (
          <div className="home-bands" aria-hidden="true">
            {(['good', 'holding', 'struggling'] as const).map((b) => (
              bands[b] > 0 && (
                <span key={b} className={`home-band home-band-${b}`} style={{ flexGrow: bands[b] }} />
              )
            ))}
          </div>
        )}
        <p className="home-bands-line">
          {rated.length > 0 && (
            <>
              {bands.good} doing well · {bands.holding} holding
              {bands.struggling > 0 && <> · {bands.struggling} struggling</>}
            </>
          )}
        </p>
        {(unratedCount > 0 || staleCount > 0) && (
          <p className="home-sub">
            {unratedCount > 0 && <>{unratedCount} not rated yet</>}
            {unratedCount > 0 && staleCount > 0 && ' · '}
            {staleCount > 0 && <>{staleCount} not looked at in three months</>}
          </p>
        )}
        <button
          type="button"
          className="home-link"
          onClick={() => onPlaceholder('Health history', 'Every rating, plant by plant.')}
        >
          History ›
        </button>
      </section>

      <section className="home-card">
        <span className="home-label">CARE ADHERENCE</span>
        <p className="home-card-line">
          {onSchedule} on schedule · {slipping} slipping · {behind} behind
        </p>
        <button type="button" className="home-link" onClick={onAdherenceHistory}>
          History ›
        </button>
      </section>

      <section className="home-card">
        <span className="home-label">DUE</span>
        <p className="home-card-line home-due-total">{dueTotal}</p>
        <div className="home-due-split">
          <div>
            <span className="home-due-n past">{pastInterval.length}</span>
            <span className="home-due-label">Past interval</span>
          </div>
          <div>
            <span className="home-due-n">{dueToday.length}</span>
            <span className="home-due-label">Today</span>
          </div>
          <div>
            <span className="home-due-n">{dueThisWeek.length}</span>
            <span className="home-due-label">This week</span>
          </div>
        </div>
        <p className="home-due-note">Water only — feed has no tracked schedule yet.</p>
      </section>

      <section className="home-card">
        <div className="home-section-head">
          <span className="home-section-title">Needs attention</span>
          <span className="home-badge">{needsAttention.length}</span>
        </div>
        {needsAttention.length === 0 ? (
          <p className="home-sub">Up to date.</p>
        ) : (
          <ul className="home-rows">
            {needsAttention.slice(0, NEEDS_ATTENTION_CAP).map((p) => (
              <li key={p.plant_id}>
                <button type="button" className="home-row" onClick={() => onOpenPlant(p.plant_id)}>
                  <span className="home-row-body">
                    <span className="home-row-name">{p.name}</span>
                    <span className="home-row-sub">{attentionReason(p)}</span>
                  </span>
                  <span className="home-row-chev" aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {needsAttention.length > NEEDS_ATTENTION_CAP && (
          <button
            type="button"
            className="home-link"
            onClick={() => onPlaceholder('Needs attention', `All ${needsAttention.length} plants.`)}
          >
            See all {needsAttention.length} ›
          </button>
        )}
      </section>

      <section className="home-card">
        <div className="home-section-head">
          <span className="home-section-title">Most urgent</span>
        </div>
        {mostUrgent.length === 0 ? (
          <p className="home-sub">Nothing past its watering interval.</p>
        ) : (
          <ul className="home-rows">
            {mostUrgent.slice(0, MOST_URGENT_CAP).map((p) => {
              const days = p.adherence.days_past ?? 0;
              return (
                <li key={p.plant_id}>
                  <button type="button" className="home-row" onClick={() => onOpenPlant(p.plant_id)}>
                    <span className="home-row-tag water">WATER</span>
                    <span className="home-row-body">
                      <span className="home-row-name">{p.name}</span>
                    </span>
                    <span className="home-row-days">
                      {days > 0 ? `${days}d past` : 'due today'}
                    </span>
                    <span className="home-row-chev" aria-hidden="true">›</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {dueTotal > MOST_URGENT_CAP && (
          <button
            type="button"
            className="home-link"
            onClick={() => onPlaceholder('Due', `${dueTotal} plants due or past interval.`)}
          >
            See all {dueTotal} ›
          </button>
        )}
      </section>

      <button type="button" className="home-care" onClick={onCare}>
        Log care
      </button>

      <div className="home-utility">
        <button
          type="button"
          className="home-util-row"
          onClick={() => onPlaceholder('Add a new plant', 'New record with ID and suffix.')}
        >
          <span className="home-row-body">
            <span className="home-row-name">Add a new plant</span>
          </span>
          <span className="home-row-chev" aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          className="home-util-row"
          onClick={() => onPlaceholder('Prepare review package', 'Bundle sessions, photos and events.')}
        >
          <span className="home-row-body">
            <span className="home-row-name">Prepare review package</span>
          </span>
          <span className="home-row-chev" aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          className="home-util-row"
          onClick={() => onPlaceholder('Apply AI update', 'Import one update file, approve changes.')}
        >
          <span className="home-row-body">
            <span className="home-row-name">Apply AI update</span>
          </span>
          <span className="home-row-chev" aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          className="home-util-row"
          onClick={onArchived}
        >
          <span className="home-row-body">
            <span className="home-row-name">Archived plants</span>
            <span className="home-row-sub">{state.collection.archived_count} plants</span>
          </span>
          <span className="home-row-chev" aria-hidden="true">›</span>
        </button>
      </div>
    </main>
  );
}
