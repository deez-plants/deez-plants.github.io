import { useMemo, useState } from 'react';
import type { ClockTime, EventId, ISODate, PlantId } from '../types/ids';
import type { CareEventType, StoredEvent } from '../types/event';
import type { DerivedState } from '../types/derived';
import type { Registry } from '../types/plant';
import { openDeezPlants } from '../db/schema';
import {
  COMMON_TIER, EMPTY_DRAFT, NOTE_MAX, RARE_TIER, ROUTINE_TIER,
  addAll, againPrompt, emptyDetailDraft, loggedTodayIds, undoRound,
  eventCount, groupLabel, logDetailEvent, logRound, preselectFor, roundButtonLabel,
  roundCandidates, roundHeading, rowStatus, selectionGroups, toggle,
  type DetailDraft, type RoundAction, type RoundDraft,
} from '../care/careRound';
import { PlantChrome } from '../components/PlantChrome';
import { ScoreBlock } from '../score/ScoreBlock';
import { collectionScore } from '../score/score';
import './CareRoundPage.css';

/**
 * Log care (section 13's weekly path).
 *
 * Pick what you did, then who you did it to. Two taps for a whole watering
 * round, and no per-plant navigation anywhere on the way.
 *
 * **Logging counts immediately** (2026-09-18). One event per plant, and
 * adherence, due dates, needs-attention, calendars and history are all rebuilt
 * from the whole log in one pass (rule 10) before the screen redraws.
 *
 * There used to be an Update button here and a pending badge on every row. Both
 * are gone, and the reason is worth keeping: pending delayed the NUMBERS, never
 * the RECORD — the entry was written the instant you tapped Log and nothing
 * could remove it — so the step offered a safety that did not exist, and
 * charged stale figures on every screen for it. It was not being tapped, and by
 * 17 Sep the owner's own Home screen had been calling plants overdue that he
 * had watered three days earlier.
 *
 * `Undo`, on the confirmation, is the safety it only looked like. See
 * `undoRound`, and `db/events.ts` for the fold.
 */

export interface CareRoundPageProps {
  state: DerivedState;
  /** The raw log — the rows read `last fed` off it for Feed and Prune. */
  events: readonly StoredEvent[];
  registry: Registry;
  /** media_id -> object URL. */
  thumbs: Map<string, string>;
  as_of: ISODate;
  /** Re-read the store and rebuild. Called after every write. */
  onChanged: () => Promise<void> | void;
  /** What the back button reads — the screen it returns to, never a bare "Back"
      (DESIGN_REFERENCE.md section 4 rule 3). */
  backLabel?: string;
  onBack?: () => void;
  /** Set when reached from that plant's own "Log care" — shows the
      single-plant detailed mode for it, alongside the round above. Absent
      from every other entry point (screen 05: this section only makes sense
      once there's a specific plant to detail-log for). */
  detailPlantId?: PlantId;
  /** Active plants, in list order. Only used in single-plant mode. */
  allPlants?: readonly { plant_id: PlantId; name: string }[];
  /** Prev/Next: step sideways to another plant's Log care. Replaces rather
      than pushes — browsing 22 plants should not take 22 taps to back out. */
  onNavigate?: (plant_id: PlantId) => void;
  /** Open this plant's own page from the ID in the strip. */
  onOpenThisPlant?: (plant_id: PlantId) => void;
  /** The Which-plant list: going to a plant is going somewhere NEW, so it
      pushes and the all-plants page stays behind you. Using `onNavigate` here
      was a real bug — it swapped this page out, which is exactly why there
      was no way back to it. */
  onOpenPlant?: (plant_id: PlantId) => void;
  /** From a plant's own Log care back across to the all-plants round. */
  onAllPlants?: () => void;
}

type Flash =
  /** `event_ids` is what Undo takes back — see `undoRound`. */
  | { kind: 'logged'; action: RoundAction; count: number; event_ids: EventId[] }
  | { kind: 'undone'; count: number }
  | { kind: 'error'; message: string };

type DetailFlash =
  | { kind: 'logged'; type: CareEventType }
  | { kind: 'error'; message: string };

export default function CareRoundPage({
  state, events, registry, thumbs, as_of, onChanged, backLabel, onBack, detailPlantId,
  allPlants, onNavigate, onOpenThisPlant, onOpenPlant, onAllPlants,
}: CareRoundPageProps) {
  const [draft, setDraft] = useState<RoundDraft>(EMPTY_DRAFT);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [busy, setBusy] = useState(false);

  const [detailDraft, setDetailDraft] = useState<DetailDraft>(() => emptyDetailDraft(as_of));
  const [detailFlash, setDetailFlash] = useState<DetailFlash | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  // **Two pages, and which one this is depends on `detailPlantId`.**
  //
  // Log care was one screen with two sections and it satisfied nobody: from
  // the tab bar you saw only the round, and from a plant you saw both, so the
  // same name led to two different things. The owner's answer, and it is the
  // right one: keep BOTH, as two real pages.
  //
  //   no plant  - the all-plants round, with a list at the top that leaves
  //               this page for whichever plant you tap
  //   a plant   - that plant's own care grid, with the pinned Prev/Next strip,
  //               so you can step 001 -> 002 -> 003 logging detail as you go
  //
  // There is deliberately no in-place plant picker any more. Choosing a plant
  // navigates, so the page you are on always matches the plant named at the
  // top of it - which is what stops care being logged against the wrong one.
  const detailPlant = detailPlantId ? state.plants[detailPlantId] ?? null : null;

  // Both lower tiers start shut. They open if they hold what is already
  // picked, so a selected type is never hidden behind a closed tier.
  const [routineOpen, setRoutineOpen] = useState(
    () => !!detailDraft.type && ROUTINE_TIER.includes(detailDraft.type),
  );
  const [rareOpen, setRareOpen] = useState(
    () => !!detailDraft.type && RARE_TIER.includes(detailDraft.type),
  );

  // Picking an action from a tier must not close the tier under your thumb.
  const openTierFor = (t: CareEventType) => {
    if (ROUTINE_TIER.includes(t)) setRoutineOpen(true);
    if (RARE_TIER.includes(t)) setRareOpen(true);
  };

  const careTypeButton = (t: CareEventType, variant?: 'big' | 'quiet') => (
    <button
      key={t}
      type="button"
      className={[
        'care-detail-type',
        variant ?? '',
        detailDraft.type === t ? 'on' : '',
      ].filter(Boolean).join(' ')}
      aria-pressed={detailDraft.type === t}
      // Tapping the selected type again clears it. The round's own action
      // buttons have always worked this way; this grid did not, so once you
      // had picked Water there was no way back to nothing. Same screen, two
      // behaviours — the owner hit it. Clearing a *pick* is not editing
      // history: nothing is written until you tap the log button.
      onClick={() => {
        setDetailFlash(null);
        setDetailDraft({ ...detailDraft, type: detailDraft.type === t ? null : t });
      }}
    >
      {t}
    </button>
  );

  const roundActionButton = (action: RoundAction, variant?: 'big' | 'quiet') => {
    const on = draft.action === action;
    return (
      <button
        key={action}
        type="button"
        className={['care-action', variant ?? '', on ? 'on' : ''].filter(Boolean).join(' ')}
        aria-pressed={on}
        onClick={() => pickAction(action)}
      >
        <span className="care-action-label">{action}</span>
        {action === 'Water' && (
          <span className="care-action-sub">
            {dueCount ? `${dueCount} past interval` : 'none past interval'}
          </span>
        )}
      </button>
    );
  };

  const plants = useMemo(() => roundCandidates(state), [state]);
  const groups = useMemo(() => selectionGroups(plants, registry), [plants, registry]);
  /**
   * Already logged today, pending events included — the four duplicate Water
   * events of 14 Sep in one line. See `loggedTodayIds`.
   */
  const done = useMemo(
    () => (draft.action ? loggedTodayIds(draft.action, plants, events, as_of) : new Set<PlantId>()),
    [draft.action, plants, events, as_of],
  );
  const dueCount = useMemo(
    () => preselectFor('Water', plants).length,
    [plants],
  );

  const selected = new Set(draft.selected);

  /* ----------------------------------------------------------- selection -- */

  const pickAction = (action: RoundAction) => {
    // Picking Water pre-selects what is past its interval — a starting point to
    // adjust, never a claim that those plants need water (rule 9).
    setFlash(null);
    openTierFor(action);
    setDraft(draft.action === action
      ? EMPTY_DRAFT
      : {
        action,
        // Not what was watered ten minutes ago by hand.
        selected: preselectFor(action, plants, loggedTodayIds(action, plants, events, as_of)),
        note: draft.note,
      });
  };

  const setSelection = (ids: readonly PlantId[]) => {
    setFlash(null);
    setDraft({ ...draft, selected: ids });
  };

  /**
   * A row already logged today takes one extra tap, and says why.
   *
   * The owner's rule is that a second same-day Water should not happen by
   * accident. It is not that it can never happen — you can water twice on a
   * hot day and mean it. So the guard is a question, asked once, on the row
   * itself: nothing is silently dropped and nothing is silently written.
   */
  const [confirming, setConfirming] = useState<PlantId | null>(null);

  const tapRow = (plant_id: PlantId) => {
    if (done.has(plant_id) && !selected.has(plant_id) && confirming !== plant_id) {
      setConfirming(plant_id);
      return;
    }
    setConfirming(null);
    setSelection(toggle(draft.selected, plant_id));
  };

  const rowClass = (on: boolean, alreadyDone: boolean) => {
    const parts = ['care-row'];
    if (on) parts.push('on');
    if (alreadyDone) parts.push('done');
    return parts.join(' ');
  };

  /* -------------------------------------------------------------- writes -- */

  const save = async () => {
    if (!draft.action || !draft.selected.length || busy) return;
    setBusy(true);
    try {
      const db = await openDeezPlants();
      const round = await logRound(db, draft, as_of);
      await onChanged();
      setFlash({
        kind: 'logged',
        action: round.action,
        count: round.event_ids.length,
        event_ids: round.event_ids,
      });
      setDraft({ action: draft.action, selected: [], note: '' });
    } catch (e: unknown) {
      setFlash({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  /**
   * The whole safety net for a mis-tap, and deliberately a narrow one: the
   * round just logged, from the screen that logged it, until you leave.
   *
   * It writes a Void per entry rather than deleting anything — see
   * `undoRound`. History keeps both, which is the honest account.
   */
  const undo = async () => {
    if (busy || flash?.kind !== 'logged') return;
    setBusy(true);
    try {
      const db = await openDeezPlants();
      const count = await undoRound(db, flash.event_ids, as_of);
      await onChanged();
      setFlash({ kind: 'undone', count });
    } catch (e: unknown) {
      setFlash({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const saveDetail = async () => {
    if (!detailPlant || !detailDraft.type || detailBusy) return;
    setDetailBusy(true);
    try {
      const db = await openDeezPlants();
      await logDetailEvent(db, detailPlant.plant_id, detailDraft);
      await onChanged();
      setDetailFlash({ kind: 'logged', type: detailDraft.type });
      setDetailDraft(emptyDetailDraft(as_of));
    } catch (e: unknown) {
      setDetailFlash({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setDetailBusy(false);
    }
  };

  /* -------------------------------------------------------------- render -- */

  return (
    <main className="care">
      {/* Reached from one plant, this gets the shared pinned chrome so you
          can log the same thing down the whole collection without backing
          out each time — one of the three screens the owner named as
          missing it. Reached as the collection round, there is no single
          plant to step through. */}
      {detailPlantId && detailPlant && allPlants && onNavigate ? (
        <PlantChrome
          plant={detailPlant}
          backLabel={backLabel ?? 'Back'}
          onBack={onBack ?? (() => {})}
          allPlants={allPlants}
          onNavigate={onNavigate}
          onOpenPlant={onOpenThisPlant}
        />
      ) : onBack && (
        <button type="button" className="screen-back care-back" onClick={onBack}>‹ {backLabel ?? 'Back'}</button>
      )}

      <div className="care-titlerow">
        <h1 className="care-title">Log care</h1>
        {detailPlant && onAllPlants && (
          <button type="button" className="care-allplants" onClick={onAllPlants}>
            All plants ›
          </button>
        )}
      </div>
      {detailPlant && <p className="care-whose">{detailPlant.name}</p>}

      {/* Two pages, not one screen with two moods (settled 2026-09-14).
          Everything from here to the end of the round belongs to the
          ALL-PLANTS page; the per-plant page shows the care grid and nothing
          else. The owner asked for both to exist and to stop pretending to be
          each other. */}
      {!detailPlant && (
      <>
      {/* The collection score, rendered by the one score component. Nothing on
          this screen computes a health figure; it reads the one the ratings
          give and shows it in the same block as every other screen. */}
      <section className="care-score">
        <ScoreBlock {...collectionScore(state)} />
        <p className="care-score-note">
          {state.collection.rated_count} of {state.collection.active_count} plants rated
        </p>
      </section>

      {/* The same three tiers the per-plant page uses. One interface, so
          there is nothing to relearn moving between them — the owner asked
          for exactly this. What differs is only what happens next: here you
          then choose which plants. */}
      <div className="care-actions two">
        {COMMON_TIER.map((action) => roundActionButton(action, 'big'))}
      </div>

      <button
        type="button"
        className="care-tier"
        aria-expanded={routineOpen}
        onClick={() => setRoutineOpen(!routineOpen)}
      >
        <span>Routine actions</span>
        <span className="care-tier-mark">{routineOpen ? '−' : '+'}</span>
      </button>
      {routineOpen && (
        <div className="care-actions quiet">
          {ROUTINE_TIER.map((action) => roundActionButton(action, 'quiet'))}
        </div>
      )}

      <button
        type="button"
        className="care-tier"
        aria-expanded={rareOpen}
        onClick={() => setRareOpen(!rareOpen)}
      >
        <span>More actions</span>
        <span className="care-tier-mark">{rareOpen ? '−' : '+'}</span>
      </button>
      {rareOpen && (
        <div className="care-actions">
          {RARE_TIER.map((action) => roundActionButton(action))}
        </div>
      )}

      {draft.action && (
        <section className="care-pick">
          <div className="care-pick-head">
            <span className="care-pick-title">{roundHeading(draft.action)}</span>
            <span className="care-pick-count">
              {draft.selected.length} of {plants.length} selected
            </span>
          </div>

          <div className="care-chips">
            {draft.action === 'Water' && (
              <button
                type="button"
                className="care-chip"
                onClick={() => setSelection(preselectFor('Water', plants, done))}
              >
                Past interval
              </button>
            )}
            <button
              type="button"
              className="care-chip"
              onClick={() => setSelection(addAll([], plants.map((p) => p.plant_id), done))}
            >
              All {plants.length - done.size}
            </button>
            <button type="button" className="care-chip" onClick={() => setSelection([])}>
              None
            </button>
            <button
              type="button"
              className="care-chip clear"
              onClick={() => setSelection([])}
            >
              Clear
            </button>
          </div>

          <div className="care-chips">
            {groups.map((g) => (
              <button
                key={`${g.shared_water ? 'planter' : 'room'}:${g.name}`}
                type="button"
                className={g.shared_water ? 'care-chip group shared' : 'care-chip group'}
                onClick={() => setSelection(addAll(draft.selected, g.ids, done))}
                title={g.shared_water ? 'Shared soil — one soak serves all of them' : undefined}
              >
                + {groupLabel(g.name)} <span className="care-chip-n">{g.ids.length}</span>
              </button>
            ))}
          </div>

          <ul className="care-rows">
            {plants.map((p) => {
              const on = selected.has(p.plant_id);
              const status = rowStatus(draft.action as RoundAction, p, events, as_of);
              const hero = p.hero ?? p.photos[0];
              const url = hero ? thumbs.get(hero) : undefined;
              return (
                <li key={p.plant_id}>
                  <button
                    type="button"
                    className={rowClass(on, done.has(p.plant_id))}
                    aria-pressed={on}
                    onClick={() => tapRow(p.plant_id)}
                  >
                    <span className="care-box" aria-hidden="true">{on ? '✓' : ''}</span>
                    {url
                      ? <img className="care-thumb" src={url} alt="" width={52} height={52} />
                      : <span className="care-thumb care-thumb-empty" />}
                    <span className="care-row-body">
                      <span className="care-row-name">{p.name}</span>
                      {/* Rule 9: this states the calendar, never an instruction. */}
                      {confirming === p.plant_id
                        ? (
                          <span className="care-row-status again">
                            {againPrompt(draft.action as RoundAction)}
                          </span>
                        )
                        : <span className={`care-row-status ${status.tone}`}>{status.text}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <label className="care-note-label" htmlFor="care-note">NOTE FOR THE WHOLE ROUND</label>
          <textarea
            id="care-note"
            className="care-note"
            value={draft.note}
            maxLength={NOTE_MAX}
            placeholder="Optional. Applies to every plant selected."
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          />

          {flash && (
            <div className={flash.kind === 'error' ? 'care-flash error' : 'care-flash'}>
              {flash.kind === 'logged' && (
                <>
                  <span className="care-flash-tick" aria-hidden="true">✓</span>
                  <span>
                    <b>{eventCount(flash.count)} logged</b>
                    <span className="care-flash-detail">{flash.action} · counted and current</span>
                  </span>
                  {/* Until you leave this screen. Beyond that it is a correction,
                      which is a different and much larger thing. */}
                  <button
                    type="button"
                    className="care-undo"
                    disabled={busy}
                    onClick={() => void undo()}
                  >
                    Undo
                  </button>
                </>
              )}
              {flash.kind === 'undone' && (
                <>
                  <span className="care-flash-tick" aria-hidden="true">✓</span>
                  <span>
                    <b>{eventCount(flash.count)} undone</b>
                    <span className="care-flash-detail">Taken back. Both stay in history.</span>
                  </span>
                </>
              )}
              {flash.kind === 'error' && <span>{flash.message}</span>}
            </div>
          )}

          <button
            type="button"
            className="care-save"
            disabled={!draft.selected.length || busy}
            onClick={() => void save()}
          >
            {roundButtonLabel(draft)}
          </button>
          <p className="care-save-note">
            Saves one event per plant, so History stays accurate.
          </p>
        </section>
      )}

      {/* One compact bar, BELOW the round.
          This list started life at the top of the page and that was wrong:
          it buried the round, which is the whole reason the screen exists.
          The owner: "that eliminates the entire let's make this easy, water
          all the plants with 2 clicks idea, now I have to scroll down to
          find it." The round comes first; this is the quiet way out of it. */}
      <section className="care-which">
        <label className="care-detail-label" htmlFor="care-which-select">WHICH PLANT</label>
        <select
          id="care-which-select"
          className="care-detail-input care-which-select"
          value=""
          onChange={(e) => {
            const id = e.target.value as PlantId;
            if (id) onOpenPlant?.(id);
          }}
        >
          <option value="">Select a plant…</option>
          {(allPlants ?? []).map((p) => (
            <option key={p.plant_id} value={p.plant_id}>{p.plant_id} · {p.name}</option>
          ))}
        </select>
      </section>
      </>
      )}

      {detailPlant && (
        <section className="care-detail">
          <>

          {/* Three tiers, the lower two shut on arrival (settled 2026-09-13,
              Round 4 of the screens page). Eighteen equal buttons would put
              watering — constant — beside taking cuttings, which happens twice
              a year. Shut, this is shorter than the nine-button grid it
              replaced: the record got richer and the screen got quieter.

              A tier opens if it holds what is already picked, so arriving with
              a type selected never hides it. */}
          <div className="care-detail-grid two">
            {COMMON_TIER.map((t) => careTypeButton(t, 'big'))}
          </div>

          <button
            type="button"
            className="care-tier"
            aria-expanded={routineOpen}
            onClick={() => setRoutineOpen(!routineOpen)}
          >
            <span>Routine actions</span>
            <span className="care-tier-mark">{routineOpen ? '−' : '+'}</span>
          </button>
          {routineOpen && (
            <div className="care-detail-grid quiet">
              {ROUTINE_TIER.map((t) => careTypeButton(t, 'quiet'))}
            </div>
          )}

          <button
            type="button"
            className="care-tier"
            aria-expanded={rareOpen}
            onClick={() => setRareOpen(!rareOpen)}
          >
            <span>More actions</span>
            <span className="care-tier-mark">{rareOpen ? '−' : '+'}</span>
          </button>
          {rareOpen && (
            <div className="care-detail-grid">
              {RARE_TIER.map((t) => careTypeButton(t))}
            </div>
          )}

          <label className="care-detail-field-label" htmlFor="care-detail-date">DATE &amp; TIME</label>
          <div className="care-detail-datetime">
            <input
              id="care-detail-date"
              type="date"
              className="care-detail-input"
              value={detailDraft.date}
              onChange={(e) => setDetailDraft({ ...detailDraft, date: e.target.value as ISODate })}
            />
            <input
              type="time"
              className="care-detail-input"
              aria-label="Time"
              value={detailDraft.time}
              onChange={(e) => setDetailDraft({ ...detailDraft, time: e.target.value as ClockTime })}
            />
          </div>

          <label className="care-detail-field-label" htmlFor="care-detail-notes">NOTES</label>
          <textarea
            id="care-detail-notes"
            className="care-detail-notes"
            value={detailDraft.note}
            maxLength={NOTE_MAX}
            placeholder="Thorough soak. Good drainage."
            onChange={(e) => setDetailDraft({ ...detailDraft, note: e.target.value })}
          />

          <p className="care-detail-photo-note">
            Optional photo, attached to this event — arrives with photo capture, later.
          </p>

          {detailFlash && (
            <div className={detailFlash.kind === 'error' ? 'care-flash error' : 'care-flash'}>
              {detailFlash.kind === 'logged' && (
                <>
                  <span className="care-flash-tick" aria-hidden="true">✓</span>
                  <span>
                    <b>{detailFlash.type} logged</b>
                    <span className="care-flash-detail">
                      Saved and counted.
                    </span>
                  </span>
                </>
              )}
              {detailFlash.kind === 'error' && <span>{detailFlash.message}</span>}
            </div>
          )}

          <button
            type="button"
            className="care-save"
            disabled={!detailDraft.type || detailBusy}
            onClick={() => void saveDetail()}
          >
            {detailDraft.type ? `Log ${detailDraft.type.toLowerCase()}` : 'Pick what you did'}
          </button>
          <p className="care-save-note">Saves one event.</p>
          </>
        </section>
      )}

    </main>
  );
}
