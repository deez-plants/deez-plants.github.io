import { useEffect, useMemo, useState } from 'react';
import type { PlantId } from '../types/ids';
import type { DerivedPlant, DerivedState, Snapshot } from '../types/derived';
import { ScoreBlock } from '../score/ScoreBlock';
import { collectionScore, healthBand } from '../score/score';
import { Icon } from '../components/Icon';
import { openDeezPlants } from '../db/schema';
import { formatDayMonth } from '../lib/dates';
import type { ISODate } from '../types/ids';
import './Home.css';

/**
 * The daily surface (DESIGN_REFERENCE.md screen 01). Everything here reads
 * `DerivedState` — nothing on this screen computes a health figure (rule 1) or
 * invents a schedule the record doesn't hold.
 *
 * Left out of this pass, and why:
 * - The catch-up banner needs a stored "last opened" timestamp, which nothing
 *   writes yet.
 * - The health sparkline and the handoff log are both here as of 2026-09-08.
 *   Each reads real stored history and draws nothing when there is none —
 *   a collection rated once today has one bar, not an invented trend.
 * - The reference's "1 session held on this device only · Back up now" row is
 *   deliberately absent until backup itself exists. A button that cannot back
 *   anything up would be worse than no row — and the row is the reminder that
 *   backup was always part of this design, not a later idea.
 * - `feed` is free text on every plant (FIELD_DEFINITIONS.md section 4), not
 *   an interval with a due date the way `water` is. So DUE and Do next are
 *   water-only here, honestly, rather than a fabricated feed schedule.
 */

export interface HomeProps {
  state: DerivedState;
  /** Oldest first. Frozen collection averages, one per Update commit. */
  snapshots: readonly Snapshot[];
  onOpenPlant: (plant_id: PlantId) => void;
  onPlaceholder: (title: string, subtitle?: string) => void;
  onArchived: () => void;
  onAdherenceHistory: () => void;
  onHealthHistory: () => void;
  onAddPlant: () => void;
  onPreparePackage: () => void;
  onApplyUpdate: () => void;
  onBackup: () => void;
}

/** One line per package sent or update applied, newest first. */
interface HandoffEntry {
  id: string;
  kind: 'sent' | 'applied';
  date: ISODate;
  detail: string;
}

const HANDOFF_CAP = 4;
const NEEDS_ATTENTION_CAP = 6;
const MOST_URGENT_CAP = 6;

export default function Home({
  state, snapshots, onOpenPlant, onPlaceholder, onArchived, onAdherenceHistory, onHealthHistory, onAddPlant,
  onPreparePackage, onApplyUpdate, onBackup,
}: HomeProps) {
  const active = useMemo(
    () => state.order.map((id) => state.plants[id]).filter((p) => !p.archived),
    [state],
  );

  const rated = active.filter((p) => p.health.current !== null);
  const bands = { good: 0, holding: 0, struggling: 0 };
  for (const p of rated) bands[healthBand(p.health.current as number)]++;
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

  // Every saved collection average, oldest first. Snapshots with no rating in
  // them are dropped rather than plotted as zero — an unrated collection has
  // no average, and inventing one would be rule 1 by the back door.
  // The handoff log reads the `packages` and `applied_updates` stores, which
  // no derived state carries — they are bookkeeping about the round-trip, not
  // about plants. Empty until a package has actually been built.
  const [handoff, setHandoff] = useState<HandoffEntry[]>([]);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const db = await openDeezPlants();
        const [packages, applied] = await Promise.all([
          db.getAll('packages'),
          db.getAll('applied_updates'),
        ]);
        const rows: HandoffEntry[] = [
          ...packages.map((p): HandoffEntry => ({
            id: `pkg-${p.package_id}`,
            kind: 'sent',
            date: p.generated,
            detail: `${p.plant_ids.length} plants · ${p.event_ids.length} entries`,
          })),
          ...applied.map((a): HandoffEntry => ({
            id: `upd-${a.package_id}`,
            kind: 'applied',
            date: a.applied,
            detail: `${a.accepted_count} of ${a.accepted_count + a.rejected_count} approved`,
          })),
        ].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
        if (live) setHandoff(rows);
      } catch {
        // The log is a convenience. A read failure must not take Home down.
      }
    })();
    return () => { live = false; };
  }, [state]);

  const sparkline = snapshots
    .map((s) => s.state.collection.average_health)
    .filter((v): v is number => v !== null);

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

      {/* No Log care button here any more. It moved to the top of this screen
          when the tab bar had no Log tab; now that it does, a second way in
          from the screen you are already on is just a bigger target for the
          same thing. Removed 2026-09-12 at the owner's request. */}

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
        {/* The sparkline. One bar per saved snapshot, oldest at the left —
            the collection average frozen at each Update. Two bars are the
            minimum worth drawing: a single reading is a dot, not a shape,
            and section 3 forbids rendering a trend line over ratings. */}
        {sparkline.length > 1 && (
          <div className="home-spark" aria-hidden="true">
            {sparkline.map((v, i) => (
              <span
                key={i}
                className={`home-spark-bar ${healthBand(v)}`}
                style={{ height: `${10 + v * 4}px` }}
              />
            ))}
          </div>
        )}
        <button type="button" className="home-link" onClick={onHealthHistory}>
          History ›
        </button>
      </section>

      <section className="home-card">
        <div className="home-card-head">
          <span className="home-label">CARE ADHERENCE</span>
          {/* Rule 2: counts, never a score. "16 of 22" is how many plants are
              on schedule — a count of plants, not a mark out of ten. */}
          <span className="home-headline">{onSchedule} of {active.length}</span>
        </div>
        {active.length > 0 && (
          <div className="home-bands" aria-hidden="true">
            {onSchedule > 0 && <span className="home-band home-band-good" style={{ flexGrow: onSchedule }} />}
            {slipping > 0 && <span className="home-band home-band-holding" style={{ flexGrow: slipping }} />}
            {behind > 0 && <span className="home-band home-band-struggling" style={{ flexGrow: behind }} />}
          </div>
        )}
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
                  {/* The plant's name on its own line, what and how far past
                      underneath — the same shape Needs attention uses. It was
                      one cramped row with the care tag first, which buried the
                      name in the middle: the name is the thing you scan for,
                      and the owner said it read as a mess. */}
                  <button type="button" className="home-row" onClick={() => onOpenPlant(p.plant_id)}>
                    <span className="home-row-body">
                      <span className="home-row-name">{p.name}</span>
                      <span className="home-row-meta">
                        <span className="home-row-tag water">WATER</span>
                        <span className="home-row-days">
                          {/* Rule 9: how long since the interval, never an
                              instruction to water. */}
                          {days > 0
                            ? `${days} day${days === 1 ? '' : 's'} past interval`
                            : 'interval is up today'}
                        </span>
                      </span>
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

      {handoff.length > 0 && (
        <section className="home-card">
          <span className="home-label">HANDOFF LOG</span>
          <ul className="home-handoff">
            {handoff.slice(0, HANDOFF_CAP).map((h) => (
              <li key={h.id}>
                <span className={`home-handoff-kind ${h.kind}`}>
                  {h.kind === 'sent' ? 'Package sent' : 'Update applied'}
                </span>
                <span className="home-handoff-detail">{h.detail}</span>
                <span className="home-handoff-date">{formatDayMonth(h.date)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="home-utility">
        {/* Section 8. The reference has always had this row; it was waiting
            on there being something behind it. */}
        <button type="button" className="home-util-row backup" onClick={onBackup}>
          <span className="home-row-icon"><Icon name="apply" size={22} /></span>
          <span className="home-row-body">
            <span className="home-row-name">Back up now</span>
            <span className="home-row-sub">
              {active.length} plants held on this device only
            </span>
          </span>
          <span className="home-row-chev" aria-hidden="true">›</span>
        </button>
        <button type="button" className="home-util-row" onClick={onAddPlant}>
          <span className="home-row-icon add"><Icon name="add" size={22} /></span>
          <span className="home-row-body">
            <span className="home-row-name">Add a new plant</span>
          </span>
          <span className="home-row-chev" aria-hidden="true">›</span>
        </button>
        <button type="button" className="home-util-row" onClick={onPreparePackage}>
          <span className="home-row-icon"><Icon name="pkg" size={22} /></span>
          <span className="home-row-body">
            <span className="home-row-name">Prepare review package</span>
          </span>
          <span className="home-row-chev" aria-hidden="true">›</span>
        </button>
        <button type="button" className="home-util-row" onClick={onApplyUpdate}>
          <span className="home-row-icon"><Icon name="apply" size={22} /></span>
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
          <span className="home-row-icon quiet"><Icon name="pot" size={22} /></span>
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
