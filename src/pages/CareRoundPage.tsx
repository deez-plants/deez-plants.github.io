import { useMemo, useState } from 'react';
import type { ISODate, PlantId } from '../types/ids';
import type { StoredEvent } from '../types/event';
import type { DerivedState } from '../types/derived';
import type { Registry } from '../types/plant';
import { openDeezPlants } from '../db/schema';
import {
  EMPTY_DRAFT, NOTE_MAX, ROUND_ACTIONS, addAll, commitUpdate, eventCount, logRound,
  preselectFor, roundButtonLabel, roundCandidates, roundHeading, rowStatus, selectionGroups,
  toggle, type RoundAction, type RoundDraft,
} from '../care/careRound';
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
  onBack?: () => void;
}

type Flash =
  | { kind: 'logged'; action: RoundAction; count: number }
  | { kind: 'folded'; events: number; plants: number }
  | { kind: 'error'; message: string };

export default function CareRoundPage({
  state, events, registry, thumbs, as_of, onChanged, onBack,
}: CareRoundPageProps) {
  const [draft, setDraft] = useState<RoundDraft>(EMPTY_DRAFT);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [busy, setBusy] = useState(false);

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

  /* -------------------------------------------------------------- render -- */

  return (
    <main className="care">
      {onBack && (
        <button type="button" className="care-back" onClick={onBack}>‹ Back</button>
      )}

      <h1 className="care-title">Log care</h1>
      <p className="care-lede">
        Pick what you did, then who you did it to. A whole watering round takes two taps.
      </p>

      {/* The collection score, rendered by the one score component. Nothing on
          this screen computes a health figure; it reads the one the ratings
          give and shows it in the same block as every other screen. */}
      <section className="care-score">
        <ScoreBlock {...collectionScore(state)} />
        <p className="care-score-note">
          {state.collection.rated_count} of {state.collection.active_count} plants rated.
          Logging care never moves this — health is yours to set.
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
              <span className="care-action-sub">
                {action === 'Water'
                  ? (dueCount ? `${dueCount} past interval` : 'none past interval')
                  : 'pick plants'}
              </span>
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
                + {g.name} <span className="care-chip-n">{g.ids.length}</span>
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
