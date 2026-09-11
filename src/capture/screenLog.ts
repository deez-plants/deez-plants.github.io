import {
  openDeezPlants,
  SCREEN_LOG_MAX_ENTRIES,
  SCREEN_LOG_MIN_DWELL_S,
  SCREEN_LOG_RETENTION_DAYS,
  type ScreenLogEntry,
} from '../db/schema';
import { markPlantOpen, sessionStamp } from './liveSession';
import { localStampDaysAgo, nowLocalStamp } from '../lib/dates';
import type { PlantId } from '../types/ids';

/**
 * The screen log. FIELD_DEFINITIONS.md section 6.
 *
 * It "runs always, not only while recording" — every screen opened is written
 * with its timestamp, and with an offset too when a walk is being recorded.
 * Two rules keep it from becoming noise, and both live here rather than at the
 * render edge:
 *
 * - **Pass-through visits are dropped.** A screen open for under five seconds
 *   was navigation, not looking, and is never written at all. **The same rule
 *   governs the `plant_open` marker**, which used to be placed the instant you
 *   arrived: flicking through plants during a walk left a route full of plants
 *   nobody had looked at, and the markers are the half of this the AI reads.
 * - **It is evidence, not fact.** Nothing here claims a plant was discussed,
 *   only that its page was open — see the note the export carries alongside it.
 *
 * Retention is the last 7 days or 500 entries, whichever comes first.
 */

interface Visit {
  screen: string;
  plant_id?: PlantId;
  /** When the screen opened. Absolute, always — this is the entry's `at`. */
  at: string;
  since: number;
  session_id?: string;
  offset_s?: number;
}

let visit: Visit | null = null;
/** Set while a `plant_open` marker is waiting out its five seconds. Cancelled
    if the screen changes first — that is the whole filter. */
let pendingMark: ReturnType<typeof setTimeout> | null = null;
/** What is on screen now, kept separately from the timing so a page that goes
    to the background and comes back can start a fresh visit on the same screen. */
let showing: { screen: string; plant_id?: PlantId } | null = null;
let listening = false;

/**
 * Called whenever the shell's current screen changes. Closes the previous
 * visit (writing it if it lasted long enough) and opens a new one.
 */
export function enterScreen(screen: string, plant_id?: PlantId): void {
  if (showing && showing.screen === screen && showing.plant_id === plant_id && visit) return;
  void closeVisit();
  cancelPendingMark();
  showing = { screen, plant_id };
  openVisit();
  if (plant_id) scheduleMark(plant_id);
  listen();
}

/**
 * Hold the marker for the same five seconds the log holds an entry for, and
 * place it only if that plant is still on screen when the time is up.
 *
 * The offset is captured now rather than when the timer fires, so the marker
 * lands at the moment the page opened. Someone who arrives and starts talking
 * straight away would otherwise have their first sentence attributed to the
 * plant they came from.
 */
function scheduleMark(plant_id: PlantId): void {
  const at = sessionStamp()?.offset_s;
  pendingMark = setTimeout(() => {
    pendingMark = null;
    if (showing?.plant_id !== plant_id) return;
    markPlantOpen(plant_id, at);
  }, SCREEN_LOG_MIN_DWELL_S * 1000);
}

function cancelPendingMark(): void {
  if (pendingMark !== null) clearTimeout(pendingMark);
  pendingMark = null;
}

function openVisit(): void {
  if (!showing) return;
  const stamp = sessionStamp();
  visit = {
    screen: showing.screen,
    plant_id: showing.plant_id,
    at: nowLocalStamp(),
    since: Date.now(),
    session_id: stamp?.session_id,
    offset_s: stamp?.offset_s,
  };
}

async function closeVisit(): Promise<void> {
  const done = visit;
  visit = null;
  if (!done) return;

  const dwell_s = Math.round((Date.now() - done.since) / 1000);
  // Section 6: "Anything on screen under 5 seconds was navigation, not looking."
  if (dwell_s < SCREEN_LOG_MIN_DWELL_S) return;

  const entry: ScreenLogEntry = {
    at: done.at,
    screen: done.screen,
    dwell_s,
    ...(done.plant_id ? { plant_id: done.plant_id } : {}),
    // Both, or neither: an entry inside a recording carries `session_id` and
    // `offset_s`; one outside carries only its absolute `at`.
    ...(done.session_id !== undefined && done.offset_s !== undefined
      ? { session_id: done.session_id as ScreenLogEntry['session_id'], offset_s: done.offset_s }
      : {}),
  };

  try {
    const db = await openDeezPlants();
    await db.add('screen_log', entry);
    await sweep();
  } catch {
    // The screen log is evidence, not the record. Losing an entry to a
    // storage hiccup must never take a navigation down with it.
  }
}

/** 7 days or 500 entries, whichever comes first. */
async function sweep(): Promise<void> {
  const db = await openDeezPlants();
  const cutoff = localStampDaysAgo(SCREEN_LOG_RETENTION_DAYS);

  const tx = db.transaction('screen_log', 'readwrite');
  const store = tx.store;
  for (const key of await store.index('by-at').getAllKeys(IDBKeyRange.upperBound(cutoff, true))) {
    await store.delete(key);
  }
  // Auto-increment keys, so key order is insertion order: the oldest are first.
  const keys = await store.getAllKeys();
  for (const key of keys.slice(0, Math.max(0, keys.length - SCREEN_LOG_MAX_ENTRIES))) {
    await store.delete(key);
  }
  await tx.done;
}

/**
 * A tab closed or backgrounded ends the visit — otherwise a phone left on a
 * plant page overnight would come back as a nine-hour dwell.
 */
function onVisibility(): void {
  if (document.visibilityState === 'hidden') {
    void closeVisit();
  } else if (!visit && showing) {
    openVisit();
  }
}

function onPageHide(): void {
  void closeVisit();
}

function listen(): void {
  if (listening) return;
  listening = true;
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
}

/** Newest first. What the export and any future screen-log view read. */
export async function readScreenLog(): Promise<ScreenLogEntry[]> {
  const db = await openDeezPlants();
  const all = await db.getAll('screen_log');
  return all.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** Oldest first, for one session — the objective track beside its markers. */
export async function screenLogForSession(session_id: string): Promise<ScreenLogEntry[]> {
  const all = await readScreenLog();
  return all.filter((e) => e.session_id === session_id).reverse();
}
