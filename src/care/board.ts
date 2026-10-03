import type { DerivedPlant, DerivedState } from '../types/derived';
import type { ISODate, PlantId } from '../types/ids';
import { isDeferred } from './inspect';

/**
 * What Home actually shows, and what a tick means.
 *
 * ## Why this exists at all
 *
 * Home was three cards saying the same thing. The owner's own screenshot, 1
 * Oct: **Due 8**, **Needs attention 1**, **Most urgent 1** — and all three were
 * about one plant, Purple Shamrock, four days past. Three cards, one plant,
 * most of a screen. Their words: it should be a clipboard they can carry round
 * the flat, not a noticeboard that sends them somewhere else to act.
 *
 * So the lists merge, every row carries its actions, and the arithmetic that
 * decides which plant is on which list lives here — pure, so the rules can be
 * checked without a browser.
 *
 * ## Rule 9, which governs every word on that screen
 *
 * *Never render elapsed interval as proof a plant needs care.* A list here is a
 * **prompt to look**. A tick records what the owner did **after** looking. That
 * is why the two actions are equal in weight: the app's guess comes from a
 * date, and the person is the one holding the watering can. Nothing this module
 * produces may be worded as an instruction.
 */

/** Plants due within this many days make up "Coming up". A week, because that
    is the rhythm the owner actually works in. */
export const COMING_UP_DAYS = 7;

/** Rows shown before "See all" — the owner's rule, and the same everywhere. */
export const SECTION_CAP = 5;

export interface BoardRow {
  plant: DerivedPlant;
  /** Days past the interval. Negative means days still to go. */
  days_past: number;
  /** Behind on water AND a rating nobody has confirmed in three months. Both
      reasons show; the owner asked for that explicitly. */
  stale_rating: boolean;
}

export interface Board {
  /** Past due or due today, minus anything the owner has already looked at. */
  needs_attention: BoardRow[];
  /** Due inside the next week, not yet due. */
  coming_up: BoardRow[];
  /** Deferred by a check, with the date each comes back. Not shown as rows —
      this is what the screen uses to say how many are resting. */
  deferred: BoardRow[];
  /** Ratings not confirmed in 90 days, oldest first. One line, not a list. */
  stale_ratings: DerivedPlant[];
}

const rowFor = (plant: DerivedPlant): BoardRow => ({
  plant,
  days_past: plant.adherence.days_past ?? 0,
  stale_rating: plant.attention.includes('health_stale'),
});

/** Worst first: the plant furthest past its interval leads. */
const byUrgency = (a: BoardRow, b: BoardRow) => b.days_past - a.days_past;

/** Soonest first. */
const bySoonest = (a: BoardRow, b: BoardRow) => b.days_past - a.days_past;

export function buildBoard(state: DerivedState): Board {
  const active = state.order.map((id) => state.plants[id]).filter((p) => !p.archived);

  const needs_attention: BoardRow[] = [];
  const coming_up: BoardRow[] = [];
  const deferred: BoardRow[] = [];

  for (const plant of active) {
    const past = plant.adherence.days_past;
    // A plant that has never been watered has no schedule to be past. It shows
    // on its own terms elsewhere rather than being invented a due date here.
    if (past === null) continue;

    if (past >= 0) {
      // The owner looked at it and said come back later. The fact that it is
      // past its interval has not changed and `attention` still says so — what
      // changed is whether the app keeps raising it. See `care/inspect.ts`.
      if (isDeferred(plant.recheck)) deferred.push(rowFor(plant));
      else needs_attention.push(rowFor(plant));
    } else if (-past <= COMING_UP_DAYS) {
      coming_up.push(rowFor(plant));
    }
  }

  /**
   * Oldest confirmation first.
   *
   * The owner's design, and better than the one it replaced. Rate twenty-two
   * plants in a sitting and ninety days later all twenty-two go stale on the
   * same day — a wall of rows that teaches you to ignore the whole thing. One
   * line standing for nine plants holds the first wave; confirming resets each
   * plant's own ninety days, so the cluster breaks itself apart after one pass
   * and never re-forms.
   */
  const stale_ratings = active
    .filter((p) => p.attention.includes('health_stale'))
    .sort((a, b) => ((a.health.confirmed ?? '') < (b.health.confirmed ?? '') ? -1 : 1));

  return {
    needs_attention: needs_attention.sort(byUrgency),
    coming_up: coming_up.sort(bySoonest),
    deferred: deferred.sort(byUrgency),
    stale_ratings,
  };
}

/* -------------------------------------------------------------------------- */
/* The basket                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What has been ticked, across every section.
 *
 * **One basket, not one per section.** A plant can sit in two lists at once,
 * and being asked about it twice is exactly the kind of thing that makes a
 * screen tiring to use. Keyed by plant, so ticking Watered after Checked
 * replaces rather than stacks — the owner changed their mind, they did not do
 * both.
 */
export type BasketAction = 'watered' | 'checked';

export type Basket = ReadonlyMap<PlantId, BasketAction>;

export function toggle(basket: Basket, plant_id: PlantId, action: BasketAction): Map<PlantId, BasketAction> {
  const next = new Map(basket);
  if (next.get(plant_id) === action) next.delete(plant_id);
  else next.set(plant_id, action);
  return next;
}

export interface BasketCounts {
  watered: number;
  checked: number;
  total: number;
}

export function counts(basket: Basket): BasketCounts {
  let watered = 0;
  let checked = 0;
  for (const a of basket.values()) {
    if (a === 'watered') watered += 1;
    else checked += 1;
  }
  return { watered, checked, total: watered + checked };
}

/**
 * What the commit bar says.
 *
 * **"Log" and not "Do"**: it records what the owner did after looking, and
 * rule 9 forbids the screen from reading as an instruction. The counts are
 * named separately because six waterings and two checks are different facts,
 * and a single total would hide which.
 */
export function commitLabel(c: BasketCounts): string {
  if (c.total === 0) return 'Nothing ticked yet';
  const parts: string[] = [];
  if (c.watered) parts.push(`${c.watered} watering${c.watered === 1 ? '' : 's'}`);
  if (c.checked) parts.push(`${c.checked} check${c.checked === 1 ? '' : 's'}`);
  return `Log ${parts.join(' · ')}`;
}

/** How a row explains itself. Rule 9: a fact about a date, never an order. */
export function rowReason(row: BoardRow): string {
  const interval = row.plant.adherence.interval_days;
  const suffix = interval ? ` its ${interval}-day interval` : ' its interval';
  if (row.days_past === 0) return `Due today on${suffix}`;
  if (row.days_past > 0) {
    return `${row.days_past} day${row.days_past === 1 ? '' : 's'} past${suffix}`;
  }
  const inDays = -row.days_past;
  return inDays === 1 ? 'Due tomorrow' : `Due in ${inDays} days`;
}

/** The second line, when a plant is also carrying a stale rating. Both show —
    the owner asked for that, and hiding one behind the other is how the
    rating problem stayed invisible. */
export function ratingReason(plant: DerivedPlant): string | null {
  if (!plant.attention.includes('health_stale')) return null;
  const said = plant.health.current;
  return said === null
    ? 'Not looked at in three months'
    : `You said ${said} — not confirmed in three months`;
}

/** "9 of 22 not confirmed in 3 months", or null when there is nothing to say. */
export function ratingsLine(board: Board, active_count: number): string | null {
  const n = board.stale_ratings.length;
  if (n === 0) return null;
  return `Ratings · ${n} of ${active_count} not confirmed in 3 months`;
}

/** "3 resting until you look again" — what the deferred plants come to. Said
    rather than hidden, so a quiet board never looks like an empty one. */
export function restingLine(board: Board, as_of: ISODate): string | null {
  const n = board.deferred.length;
  if (n === 0) return null;
  const next = board.deferred
    .map((r) => r.plant.recheck?.until)
    .filter((d): d is ISODate => !!d)
    .sort()[0];
  const when = next && next > as_of ? next : null;
  return `${n} plant${n === 1 ? '' : 's'} you have already checked`
    + (when ? `, next one back on ${when}` : '');
}
