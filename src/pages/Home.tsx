import { useEffect, useMemo, useState } from 'react';
import type { EventId, PlantId } from '../types/ids';
import type { DerivedPlant, DerivedState, Snapshot } from '../types/derived';
import type { StoredEvent } from '../types/event';
import { ScoreBlock } from '../score/ScoreBlock';
import { collectionScore, healthBand } from '../score/score';
import { Icon } from '../components/Icon';
import { openDeezPlants, META_KEY } from '../db/schema';
import {
  buildBoard, commitLabel, counts, ratingsLine, restingLine, toggle,
  SECTION_CAP, type Basket,
} from '../care/board';
import { BoardRowView } from '../components/BoardRow';
import { RecentlyLogged } from '../components/RecentlyLogged';
import { logBoard, undoBoard } from '../care/boardCommit';
import { ratePlant } from '../care/rate';
import { isConfirmedSent } from '../package/registry';
import { daysBetween, formatDayMonth } from '../lib/dates';
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
  onArchived: () => void;
  onAdherenceHistory: () => void;
  onHealthHistory: () => void;
  onAddPlant: () => void;
  onPreparePackage: () => void;
  onApplyUpdate: () => void;
  onBackup: () => void;
  /** Null until a backup has been saved. */
  lastBackup: ISODate | null;
  onSinceLastTime: () => void;
  /** Save the state as it stands as a point to compare against later. */
  onMarkPoint: () => Promise<void> | void;
  /** Today, for the recheck dates and the catch-up count. */
  as_of: ISODate;
  /** The raw log, for Recently logged. Read directly rather than through
      derived state: taking an entry back needs the entry, not its effect. */
  events: readonly StoredEvent[];
  /** Straight to one plant's Log care screen — what tapping a row's name does.
      The original design asked for this from the start and the app never did
      it, so every row sent you to the plant page to find the grid yourself. */
  onLogCare: (plant_id: PlantId) => void;
  /** Re-read and rebuild after the board writes entries. */
  onChanged: () => Promise<void> | void;
}

/**
 * One line per package built or sent, and per update applied, newest first.
 *
 * `built` is the 2026-09-21 addition: a package recorded at build time whose
 * "did it save?" was never answered. It used to be invisible here, which is
 * how a real reviewed round came to be missing from the log entirely.
 */
interface HandoffEntry {
  id: string;
  kind: 'sent' | 'built' | 'applied';
  date: ISODate;
  detail: string;
}

const HANDOFF_CAP = 4;

export default function Home({
  state, snapshots, onOpenPlant, onArchived, onAdherenceHistory, onHealthHistory, onAddPlant,
  onPreparePackage, onApplyUpdate, onBackup, lastBackup, onSinceLastTime, onMarkPoint,
  as_of, events, onLogCare, onChanged,
}: HomeProps) {
  const [marking, setMarking] = useState(false);

  const active = useMemo(
    () => state.order.map((id) => state.plants[id]).filter((p) => !p.archived),
    [state],
  );

  /**
   * The board, and what has been ticked on it.
   *
   * One basket for the whole screen rather than one per section: a plant can
   * sit in two lists at once and being asked about it twice is exactly what
   * makes a screen tiring. See `care/board.ts`.
   */
  const board = useMemo(() => buildBoard(state), [state]);
  const [basket, setBasket] = useState<Basket>(() => new Map());
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [comingOpen, setComingOpen] = useState(false);
  const [comingAll, setComingAll] = useState(false);
  const [ratingsOpen, setRatingsOpen] = useState(false);
  const [confirming, setConfirming] = useState<PlantId | null>(null);
  const [logging, setLogging] = useState(false);
  /** How many were just logged, for the Undo that follows. Cleared on leaving
      Home, which is this component unmounting. */
  const [justLogged, setJustLogged] = useState<{ ids: EventId[]; n: number } | null>(null);

  const basketCounts = counts(basket);
  const resting = restingLine(board, as_of);
  const ratings = ratingsLine(board, active.length);

  /**
   * Confirming a rating from the list.
   *
   * Rule 7: confirming without changing is a real action. It writes a `Rate`
   * event and refreshes `health_confirmed` without moving `health_changed`, and
   * it has to be a single tap — which is the whole reason this list exists
   * rather than sending the owner into each plant.
   */
  const confirmRating = async (plant: DerivedPlant) => {
    if (plant.health.current === null || confirming) return;
    setConfirming(plant.plant_id);
    try {
      const db = await openDeezPlants();
      await ratePlant(db, plant.plant_id, plant.health.current, as_of);
      await onChanged();
    } finally {
      setConfirming(null);
    }
  };

  /** Everything ticked, written as ordinary entries in one go. */
  const commit = async () => {
    if (basketCounts.total === 0 || logging) return;
    setLogging(true);
    try {
      const db = await openDeezPlants();
      const result = await logBoard(db, state, basket, as_of);
      setBasket(new Map());
      setJustLogged({ ids: result.event_ids, n: result.watered + result.checked });
      await onChanged();
    } finally {
      setLogging(false);
    }
  };

  /**
   * The immediate undo.
   *
   * It stays until the owner leaves Home rather than expiring on a timer: a
   * countdown you cannot see is a rule you only learn by losing to it. Taking
   * something back later is Void from history, which is its own screen.
   */
  const undo = async () => {
    if (!justLogged || logging) return;
    setLogging(true);
    try {
      const db = await openDeezPlants();
      await undoBoard(db, justLogged.ids, as_of);
      setJustLogged(null);
      await onChanged();
    } finally {
      setLogging(false);
    }
  };

  /**
   * How long since the app was last opened, and what moved while they were
   * away. Written to `meta` on every open — bookkeeping about using the app,
   * not a fact about a plant, so it is deliberately not an event.
   */
  const [catchUp, setCatchUp] = useState<{ days: number; moved: number } | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const db = await openDeezPlants();
        const meta = await db.get('meta', META_KEY);
        if (!meta) return;
        const last = meta.last_opened ?? null;
        await db.put('meta', { ...meta, last_opened: as_of }, META_KEY);
        if (!live || !last) return;
        const away = daysBetween(last, as_of);
        // Three days is the floor the design named. Below that, "caught up"
        // is noise on a screen opened most days.
        if (away < 3) return;
        const moved = active.filter((p) => {
          const past = p.adherence.days_past;
          return past !== null && past >= 0 && past < away;
        }).length;
        setCatchUp({ days: away, moved });
      } catch {
        // The banner is a courtesy. A read failure must not take Home down.
      }
    })();
    return () => { live = false; };
  }, [as_of, active]);

  const rated = active.filter((p) => p.health.current !== null);
  const bands = { good: 0, holding: 0, struggling: 0 };
  for (const p of rated) bands[healthBand(p.health.current as number)]++;
  const unratedCount = active.length - rated.length;
  const staleCount = active.filter((p) => p.health.stale).length;

  const onSchedule = active.filter((p) => p.adherence.state === 'on').length;
  const slipping = active.filter((p) => p.adherence.state === 'slip').length;
  const behind = active.filter((p) => p.adherence.state === 'behind').length;


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
            kind: isConfirmedSent(p) ? 'sent' : 'built',
            date: p.generated,
            detail: isConfirmedSent(p)
              ? `${p.plant_ids.length} plants · ${p.event_ids.length} entries`
              : 'not confirmed sent — open Handoff log',
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

  /** When the last snapshot was taken, so the row can say so. Snapshots are
      capped at five and kept oldest first — the last one is the newest. */
  const lastMarked = snapshots.length ? snapshots[snapshots.length - 1].taken : null;

  const sparkline = snapshots
    .map((s) => s.state.collection.average_health)
    .filter((v): v is number => v !== null);


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
              {bands.good} Good · {bands.holding} Holding
              {bands.struggling > 0 && <> · {bands.struggling} Struggling</>}
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

      {/* The catch-up banner, after the two standing figures. The owner's
          placement: Health and Care adherence are the picture that is always
          true, and this opens the half of the screen that is about what has
          happened and what to do next. */}
      {catchUp && (
        <section className="home-catchup">
          <span className="home-catchup-head">Caught up after {catchUp.days} days away</span>
          <span className="home-catchup-body">
            {catchUp.moved > 0
              ? `${catchUp.moved} plant${catchUp.moved === 1 ? '' : 's'} moved into due.`
              : 'Nothing new came due.'}
            {board.needs_attention.length > 0
              && ` ${board.needs_attention.length} ${board.needs_attention.length === 1 ? 'is' : 'are'} past an interval.`}
          </span>
        </section>
      )}

      {/* ------------------------------------------------------------------
          Needs attention — Due, Most urgent and the old Needs attention card
          merged into one actionable list.

          The owner's screenshot of 1 Oct had all three cards talking about the
          same plant: Due 8, Needs attention 1, Most urgent 1, every one of them
          Purple Shamrock. Three cards, one plant, most of a screen, and nothing
          you could act on without navigating away.

          Rule 9 governs every word here. The list is a prompt to look; a tick
          records what you did after looking. That is why the two buttons carry
          equal weight — the app's guess comes from a date and the person is the
          one holding the can.
          ------------------------------------------------------------------ */}
      <section className="home-card">
        <div className="home-section-head">
          <span className="home-section-title">Needs attention</span>
          {board.needs_attention.length > 0 && (
            <span className="home-count">{board.needs_attention.length}</span>
          )}
        </div>

        {board.needs_attention.length === 0 ? (
          <p className="home-sub">
            {resting ?? 'Nothing past its watering interval.'}
          </p>
        ) : (
          <>
            <ul className="home-board">
              {(attentionOpen ? board.needs_attention : board.needs_attention.slice(0, SECTION_CAP))
                .map((row) => (
                  <li key={row.plant.plant_id}>
                    <BoardRowView
                      row={row}
                      action={basket.get(row.plant.plant_id) ?? null}
                      onOpen={() => onLogCare(row.plant.plant_id)}
                      onTick={(a) => setBasket((b) => toggle(b, row.plant.plant_id, a))}
                    />
                  </li>
                ))}
            </ul>
            {board.needs_attention.length > SECTION_CAP && (
              <button type="button" className="home-link" onClick={() => setAttentionOpen(!attentionOpen)}>
                {attentionOpen ? 'Show fewer ›' : `See all ${board.needs_attention.length} ›`}
              </button>
            )}
            {resting && <p className="home-sub home-resting">{resting}</p>}
          </>
        )}

        {/* One line for however many plants need a rating confirmed. The
            owner's design: rate twenty-two in a sitting and ninety days later
            all twenty-two go stale on the same day, and a wall of rows teaches
            you to ignore the lot. Confirming resets each plant's own ninety
            days, so the cluster breaks itself apart after one pass. */}
        {ratings && (
          <button type="button" className="home-ratings" onClick={() => setRatingsOpen(!ratingsOpen)}>
            <span>{ratings}</span>
            <span className="home-ratings-mark">{ratingsOpen ? '−' : '›'}</span>
          </button>
        )}
        {ratingsOpen && (
          <ul className="home-ratings-list">
            {board.stale_ratings.map((p) => (
              <li key={p.plant_id}>
                <span className="home-ratings-name">
                  {p.name}
                  <span className="home-ratings-said">
                    {p.health.current === null
                      ? 'never rated'
                      : `said ${p.health.current} · ${formatDayMonth(p.health.confirmed as ISODate)}`}
                  </span>
                </span>
                {p.health.current !== null && (
                  <button
                    type="button"
                    className="home-ratings-confirm"
                    disabled={confirming !== null}
                    onClick={() => void confirmRating(p)}
                  >
                    {confirming === p.plant_id ? '…' : `Still ${p.health.current}`}
                  </button>
                )}
                <button type="button" className="home-ratings-change" onClick={() => onOpenPlant(p.plant_id)}>
                  Change
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Coming up — the "7 this week" that was only ever a digit on the old
          Due card. Shut by default at the owner's request: most of the time the
          answer is "nothing yet", and it is one tap away when they are walking
          round with the can. */}
      {board.coming_up.length > 0 && (
        <section className="home-card">
          <button type="button" className="home-fold" onClick={() => setComingOpen(!comingOpen)}>
            <span className="home-section-title">Coming up</span>
            <span className="home-fold-count">{board.coming_up.length} this week</span>
            <span className="home-fold-mark">{comingOpen ? '−' : '+'}</span>
          </button>
          {comingOpen && (
            <>
              <ul className="home-board">
                {(comingAll ? board.coming_up : board.coming_up.slice(0, SECTION_CAP)).map((row) => (
                  <li key={row.plant.plant_id}>
                    <BoardRowView
                      row={row}
                      action={basket.get(row.plant.plant_id) ?? null}
                      onOpen={() => onLogCare(row.plant.plant_id)}
                      onTick={(a) => setBasket((b) => toggle(b, row.plant.plant_id, a))}
                    />
                  </li>
                ))}
              </ul>
              {board.coming_up.length > SECTION_CAP && (
                <button type="button" className="home-link" onClick={() => setComingAll(!comingAll)}>
                  {comingAll ? 'Show fewer ›' : `See all ${board.coming_up.length} ›`}
                </button>
              )}
            </>
          )}
        </section>
      )}


      <RecentlyLogged state={state} events={events} as_of={as_of} onChanged={onChanged} />

      {handoff.length > 0 && (
        <section className="home-card">
          <span className="home-label">HANDOFF LOG</span>
          <ul className="home-handoff">
            {handoff.slice(0, HANDOFF_CAP).map((h) => (
              <li key={h.id}>
                <span className={`home-handoff-kind ${h.kind}`}>
                  {h.kind === 'sent' ? 'Package sent'
                    : h.kind === 'built' ? 'Package built' : 'Update applied'}
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
        <button type="button" className="home-util-row" onClick={onSinceLastTime}>
          <span className="home-row-icon"><Icon name="history" size={22} /></span>
          <span className="home-row-body">
            <span className="home-row-name">Since last time</span>
          </span>
          <span className="home-row-chev" aria-hidden="true">›</span>
        </button>
        {/* The other half of where snapshots come from — a package takes one on
            its own. Here rather than only on Since last time, because marking a
            point is something you do before a change, not while reading one. */}
        <button
          type="button"
          className="home-util-row"
          disabled={marking}
          onClick={() => { setMarking(true); void Promise.resolve(onMarkPoint()).finally(() => setMarking(false)); }}
        >
          <span className="home-row-icon"><Icon name="add" size={22} /></span>
          <span className="home-row-body">
            <span className="home-row-name">{marking ? 'Marking…' : 'Mark this point'}</span>
            {/* It said nothing at all, and the owner forgot what it was for —
                reasonably, since every other utility row here carries a second
                line and this one did not. A snapshot is taken automatically
                when a review package is built; this is the manual one, for a
                moment only they can see coming: before a repotting session,
                before going away, before moving everything around. */}
            <span className="home-row-sub">
              A point for Since last time to compare against
              {lastMarked && ` · last marked ${formatDayMonth(lastMarked)}`}
            </span>
          </span>
        </button>
        <button type="button" className="home-util-row backup" onClick={onBackup}>
          <span className="home-row-icon"><Icon name="apply" size={22} /></span>
          <span className="home-row-body">
            <span className="home-row-name">Back up</span>
            {/* The owner's wording: "Last" then the date, to save the width. */}
            <span className="home-row-sub">
              {lastBackup ? `Last ${formatDayMonth(lastBackup)}` : 'Never backed up'}
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
      {/* One basket for the whole screen, committed once. It stays visible at
          rest rather than appearing from nowhere, so it is never something to
          hunt for — and the wording is "log what you did", because rule 9
          forbids this screen from reading as instructions. */}
      {(basketCounts.total > 0 || justLogged) && (
        <div className="home-bar">
          {justLogged && basketCounts.total === 0 ? (
            <>
              <span className="home-bar-done">Logged {justLogged.n}</span>
              <button type="button" className="home-bar-undo" disabled={logging} onClick={() => void undo()}>
                Undo
              </button>
            </>
          ) : (
            <button
              type="button"
              className="home-bar-commit"
              disabled={logging}
              onClick={() => void commit()}
            >
              {logging ? 'Logging…' : commitLabel(basketCounts)}
            </button>
          )}
        </div>
      )}
    </main>
  );
}
