import type { SessionMarker } from '../db/schema';
import type { EventId, MediaId, PlantId, SessionId } from '../types/ids';

/**
 * The one place anything else asks "is a walk being recorded right now?".
 *
 * This module imports nothing but types, on purpose. `db/events.ts` stamps
 * every event it writes with the live session and offset, and
 * `capture/screenLog.ts` does the same for its entries — both reaching into
 * `recording.ts` directly would be a cycle, since the recorder owns the
 * database handle and the event writer. The recorder registers itself here
 * when a walk starts and clears it when the walk ends, so the dependency runs
 * one way: `recording.ts` -> here <- everyone who needs to know.
 */

export interface SessionStamp {
  session_id: SessionId;
  offset_s: number;
}

export interface LiveSession {
  stamp(): SessionStamp;
  /** The recorder fills in `offset_s` — only it knows the elapsed time. */
  mark(marker: Omit<SessionMarker, 'offset_s'>): void;
}

let live: LiveSession | null = null;

export function registerLiveSession(session: LiveSession | null): void {
  live = session;
}

/**
 * Null outside a recording. Section 6: "Entries outside a recording carry an
 * absolute `at` timestamp and no `offset_s`; entries inside one carry both."
 */
export function sessionStamp(): SessionStamp | null {
  return live ? live.stamp() : null;
}

/**
 * Section 6: "Every marker type above is recorded automatically: page opens,
 * care logged, photos taken." These three are the call sites. Each is a no-op
 * when no walk is being recorded, which is why the callers never have to ask.
 */
export function markPlantOpen(plant_id: PlantId): void {
  live?.mark({ type: 'plant_open', plant_id });
}

export function markCareLogged(plant_id: PlantId, event_id: EventId): void {
  live?.mark({ type: 'care_logged', plant_id, event_id });
}

export function markPhoto(plant_id: PlantId, media: MediaId): void {
  live?.mark({ type: 'photo', plant_id, media });
}
