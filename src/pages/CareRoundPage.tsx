import { useMemo, useState } from 'react';
import type { ClockTime, ISODate, PlantId } from '../types/ids';
import type { CareEventType, StoredEvent } from '../types/event';
import type { DerivedState } from '../types/derived';
import type { Registry } from '../types/plant';
import { openDeezPlants } from '../db/schema';
import {
  COMMON_TIER, EMPTY_DRAFT, NOTE_MAX, RARE_TIER, ROUND_ACTIONS, ROUTINE_TIER,
  addAll, commitUpdate, emptyDetailDraft,
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
 * The two-step: logging is instant and writes one pending event per plant;
 * Update is the commit that recomputes adherence, due dates, needs-attention,
 * calendars and history from the whole log in one pass (rule 10), and saves a
 * snapshot of the state it replaced. Ratings are never touched by it.
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
  /** Swap plant without leaving Log care. */
  onNavigate?: (plant_id: PlantId) => void;
}

type Flash =
  | { kind: 'logged'; action: RoundAction; count: number }
  | { kind: 'folded'; events: number; plants: number }
  | { kind: 'error'; message: string };

type DetailFlash =
  | { kind: 'logged'; type: CareEventType }
  | { kind: 'error'; message: string };

export default function CareRoundPage({
  state, events, registry, thumbs, as_of, onChanged, backLabel, onBack, detailPlantId,
  allPlants, onNavigate,
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

  const plants = useMemo(() => roundCandidates(state), [state]);
  const groups = useMemo(() => selectionGroups(plants, registry), [plants, registry]);
  const dueCount = useMemo(
    () => preselectFor('Water', plants).length,
    [plants],
  );

  const selected = new Set(draft.selected);
  const pending = state.pending_count;

  /* ----------------------------------------------------------- selection -- */

  const pickAction = (action: RoundAction) => {
    // Picking Water pre-selects what is past its interval — a starting point to
    // adjust, never a claim that those plants need water (rule 9).
    setFlash(null);
    setDraft(draft.action === action
      ? EMPTY_DRAFT
      : { action, selected: preselectFor(action, plants), note: draft.note });
  };

  const setSelection = (ids: readonly PlantId[]) => {
    setFlash(null);
    setDraft({ ...draft, selected: ids });
  };

  /* -------------------------------------------------------------- writes -- */

  const save = async () => {
    if (!draft.action || !draft.selected.length || busy) return;
    setBusy(true);
    try {
      const db = await openDeezPlants();
      const round = await logRound(db, draft, as_of);
      await onChanged();
      setFlash({ kind: 'logged', action: round.action, count: round.event_ids.length });
      setDraft({ action: draft.action, selected: [], note: '' });
    } catch (e: unknown) {
      setFlash({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const update = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const db = await openDeezPlants();
      const result = await commitUpdate(db, as_of);
      await onChanged();
      setFlash({
        kind: 'folded',
        events: result.folded_event_ids.length,
        plants: result.plants_touched,
      });
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
        />
      ) : onBack && (
        <button type="button" className="screen-back care-back" onClick={onBack}>‹ {backLabel ?? 'Back'}</button>
      )}

      <h1 className="care-title">Log care</h1>
      {detailPlant && <p className="care-whose">{detailPlant.name}</p>}

      {/* Two pages, not one screen with two moods (settled 2026-09-14).
          Everything from here to the end of the round belongs to the
          ALL-PLANTS page; the per-plant page shows the care grid and nothing
          else. The owner asked for both to exist and to stop pretending to be
          each other. */}
      {!detailPlant && (
      <>
      {/* A list, not a dropdown, and at the top rather than buried under the
          round: picking a plant LEAVES this page for that plant's own. */}
      <section className="care-which">
        <span className="care-detail-label">WHICH PLANT</span>
        <div className="care-which-list">
          {(allPlants ?? []).map((p) => (
            <button
              key={p.plant_id}
              type="button"
              className="care-which-row"
              onClick={() => onNavigate?.(p.plant_id)}
            >
              <span className="care-which-id">{p.plant_id}</span>
              <span className="care-which-name">{p.name}</span>
              <span className="care-which-go">›</span>
            </button>
          ))}
        </div>
      </section>

      {/* The collection score, rendered by the one score component. Nothing on
          this screen computes a health figure; it reads the one the ratings
          give and shows it in the same block as every other screen. */}
      <section className="care-score">
        <ScoreBlock {...collectionScore(state)} />
        <p className="care-score-note">
          {state.collection.rated_count} of {state.collection.active_count} plants rated
        </p>
      </section>

      <div className="care-actions">
        {ROUND_ACTIONS.map((action) => {
          const on = draft.action === action;
          return (
            <button
              key={action}
              type="button"
              className={on ? 'care-action on' : 'care-action'}
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
        })}
      </div>

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
                onClick={() => setSelection(preselectFor('Water', plants))}
              >
                Past interval
              </button>
            )}
            <button
              type="button"
              className="care-chip"
              onClick={() => setSelection(plants.map((p) => p.plant_id))}
            >
              All {plants.length}
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
                onClick={() => setSelection(addAll(draft.selected, g.ids))}
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
                    className={on ? 'care-row on' : 'care-row'}
                    aria-pressed={on}
                    onClick={() => setSelection(toggle(draft.selected, p.plant_id))}
                  >
                    <span className="care-box" aria-hidden="true">{on ? '✓' : ''}</span>
                    {url
                      ? <img className="care-thumb" src={url} alt="" width={52} height={52} />
                      : <span className="care-thumb care-thumb-empty" />}
                    <span className="care-row-body">
                      <span className="care-row-name">{p.name}</span>
                      {/* Rule 9: this states the calendar, never an instruction. */}
                      <span className={`care-row-status ${status.tone}`}>{status.text}</span>
                    </span>
                    {p.pending_event_ids.length > 0 && (
                      <span className="care-row-pending">{p.pending_event_ids.length} pending</span>
                    )}
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
                    <span className="care-flash-detail">
                      {flash.action} · saved, and not folded into the record until you tap Update.
                    </span>
                  </span>
                </>
              )}
              {flash.kind === 'folded' && (
                <>
                  <span className="care-flash-tick" aria-hidden="true">✓</span>
                  <span>
                    <b>
                      {flash.events
                        ? `${eventCount(flash.events)} folded in`
                        : 'Nothing was waiting'}
                    </b>
                    <span className="care-flash-detail">
                      {flash.events
                        ? `Across ${flash.plants} plant${flash.plants === 1 ? '' : 's'}. `
                          + 'Adherence, due dates, needs attention, calendars and history are all '
                          + 'recalculated. Your ratings are untouched.'
                        : 'Adherence, due dates and the calendars already match the log.'}
                    </span>
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
            <span>Routine</span>
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
            <span>Something else</span>
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
                      Saved, and not folded into the record until you tap Update.
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
          <p className="care-save-note">
            Saves one event — not folded in until you tap Update.
          </p>
          </>
        </section>
      )}

      {/* The commit. Present whether or not an action is picked — it is the same
          action as the Update button on Home, not a second implementation. */}
      <section className="care-commit">
        <div className="care-commit-head">
          <span className="care-commit-label">PENDING</span>
          <button
            type="button"
            className={pending ? 'care-update on' : 'care-update'}
            disabled={!pending || busy}
            onClick={() => void update()}
          >
            {pending ? `Update · ${pending}` : 'Up to date'}
          </button>
        </div>
        <p className="care-commit-note">
          {pending
            ? `${eventCount(pending)} logged and waiting. Update folds them into adherence, due `
              + 'dates, needs attention, calendars and history — never into your ratings.'
            : 'Everything is folded in. Adherence, due dates and the calendars are current.'}
        </p>
      </section>
    </main>
  );
}
