import { useState } from 'react';
import type { StoredEvent } from '../types/event';
import type { ISODate } from '../types/ids';
import type { DerivedState } from '../types/derived';
import { openDeezPlants } from '../db/schema';
import {
  recentEntries, voidEntry, VOID_REASONS, VOID_REASON_TEXT, type VoidReason,
} from '../care/voidEntry';
import { formatDayMonth } from '../lib/dates';
import { eventLabel } from '../lib/eventLabel';
import './RecentlyLogged.css';

/**
 * The last few entries across every plant, and the way to take one back.
 *
 * ## Why it is on Home
 *
 * The board makes logging six things as easy as logging one, which makes
 * mis-logging six things just as easy. The commit bar's Undo covers the mistake
 * noticed in the same breath; this covers the one noticed an hour later, or
 * next week — which is what the owner asked for three times before it was clear
 * that a longer undo, a list of past actions and a way to fix a mis-tap were
 * all the same feature.
 *
 * ## What it shows, and what it refuses
 *
 * Everything, including the entries that cannot be taken back. A list that
 * quietly omitted a rating would make the owner think it had not been saved.
 * What cannot be voided says why when asked, rather than going grey and leaving
 * them to guess.
 *
 * A taken-back entry stays on the list, struck through, with its correction
 * beneath it. Hiding it would make the correction invisible, which is the
 * opposite of what append-only is for.
 *
 * ## Shut by default
 *
 * It opened showing six rows on the first build, and the owner wanted it shut.
 * They are right, and the reason is worth keeping: this is not a log to read,
 * it is a tool you reach for when something went wrong. Most days it should be
 * a closed line with a count on it, the same shape as Coming up — two folds on
 * one screen that behave identically rather than two that each have their own
 * idea.
 */

const RECENT_CAP = 6;

export interface RecentlyLoggedProps {
  state: DerivedState;
  events: readonly StoredEvent[];
  as_of: ISODate;
  onChanged: () => Promise<void> | void;
}

export function RecentlyLogged({ state, events, as_of, onChanged }: RecentlyLoggedProps) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [asking, setAsking] = useState<StoredEvent | null>(null);
  const [reason, setReason] = useState<VoidReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const rows = recentEntries(
    events,
    (plant_id) => state.plants[plant_id]?.name ?? plant_id,
    more ? RECENT_CAP * 3 : RECENT_CAP,
  );
  if (rows.length === 0) return null;

  const takeBack = async () => {
    if (!asking || busy) return;
    setBusy(true);
    try {
      const db = await openDeezPlants();
      await voidEntry(db, asking, reason, as_of);
      setAsking(null);
      setReason(null);
      await onChanged();
    } catch (e: unknown) {
      setRefused(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="home-card">
      <button type="button" className="home-fold" onClick={() => setOpen(!open)}>
        <span className="home-label rec-label">Recently logged</span>
        <span className="home-fold-count">{rows.length}</span>
        <span className="home-fold-mark">{open ? '−' : '+'}</span>
      </button>

      {open && (
      <>
      <ul className="rec-list">
        {rows.map((row) => (
          <li key={row.event.event_id} className={row.voided ? 'rec voided' : 'rec'}>
            <span className="rec-body">
              <span className="rec-what">
                {eventLabel(row.event)} · {row.plant_name}
              </span>
              <span className="rec-when">
                {formatDayMonth(row.event.date)} {row.event.time}
                {row.voided && ' · taken back'}
              </span>
            </span>
            {/* A correction is listed — it is part of the record and hiding it
                would make the record read as if nothing had happened — but it
                gets no button. One that always refuses is noise. */}
            {!row.voided && row.event.type !== 'Void' && (
              <button
                type="button"
                className="rec-void"
                onClick={() => {
                  // A refusal is shown as a sentence rather than as a dead
                  // button: "why is this greyed out" is how a person decides an
                  // app is broken.
                  if (row.blocked) { setRefused(row.blocked); return; }
                  setRefused(null);
                  setReason(null);
                  setAsking(row.event);
                }}
              >
                Take back
              </button>
            )}
          </li>
        ))}
      </ul>

      {refused && <p className="rec-refused">{refused}</p>}

      {rows.length >= RECENT_CAP && (
        <button type="button" className="home-link" onClick={() => setMore(!more)}>
          {more ? 'Show fewer ›' : 'See more ›'}
        </button>
      )}

      {asking && (
        <div className="rec-confirm">
          <p className="rec-confirm-head">
            Take back <strong>{eventLabel(asking)} · {state.plants[asking.plant_id as string]?.name}</strong>,
            {' '}{formatDayMonth(asking.date)} at {asking.time}?
          </p>
          <p className="rec-confirm-body">
            The entry stays in your history, struck through, with this correction
            beneath it. Nothing is deleted — that is what lets the record be
            trusted in ten years.
          </p>
          <div className="rec-chips">
            {VOID_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={reason === r}
                className={reason === r ? 'rec-chip on' : 'rec-chip'}
                onClick={() => setReason(reason === r ? null : r)}
              >
                {VOID_REASON_TEXT[r]}
              </button>
            ))}
          </div>
          {/* Said before they commit, not discovered afterwards. */}
          {(asking.type === 'Water' || asking.type === 'Feed') && (
            <p className="rec-confirm-warn">
              Your care adherence figures will change — this watering stops counting.
            </p>
          )}
          <div className="rec-confirm-row">
            <button type="button" className="rec-yes" disabled={busy} onClick={() => void takeBack()}>
              {busy ? 'Taking it back…' : 'Take it back'}
            </button>
            <button type="button" className="rec-no" onClick={() => { setAsking(null); setReason(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
      </>
      )}
    </section>
  );
}
