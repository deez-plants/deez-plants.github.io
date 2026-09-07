import type { EventId, ISODate, MediaId, PlantId } from '../types/ids';
import type {
  Adherence, CareInstruction, Health, HealthSource, PlantBaseline, Season, StatusLabel,
} from '../types/plant';
import type { EditEvent, EventSource, RateEvent, StoredEvent } from '../types/event';
import type {
  AttentionReason, Derive, DerivedAdherence, DerivedHealth, DerivedPlant,
  DueDay, HealthReading, HistoryDay, WaterInterval,
} from '../types/derived';
import { addDays, daysBetween, seasonOf, toDay } from '../lib/dates';
import { decodeFieldValue } from './fieldCodec';

/**
 * The whole of the derived state, rebuilt from the event log. Pure and total:
 * no I/O, no clock, no randomness, no exceptions. Called twice on every render
 * pass — once with `include_pending: false` for the numbers you see, once with
 * `true` for what Update would produce.
 *
 * Nothing here is ever patched in place. It is 22 plants; performance is not a
 * consideration and correctness entirely is.
 */

/** Section 4: `health_confirmed` over 90 days old marks the rating stale. */
const STALE_DAYS = 90;
/** Section 3: 1-3 days past is a slip, more than 3 is behind. */
const SLIP_MAX_DAYS = 3;

/* -------------------------------------------------------------------------- */

interface IntervalPoint {
  from: ISODate;
  summer: number;
  winter: number | null;
}

interface WorkingFields {
  name: string;
  species: string;
  acquired: string | null;
  room: string;
  pot: string;
  planter: string | null;
  water_interval_days: number;
  water_interval_days_winter: number | null;
  feed: string | null;
  light: string | null;
  soil: string | null;
  notes_user: string;
  status_label: StatusLabel | null;
  do_next: string | null;
  hero_media: MediaId | null;
}

interface Provenance {
  source: string;
  date: ISODate;
  device_id: import('../types/ids').DeviceId;
}

interface Working {
  base: PlantBaseline;
  fields: WorkingFields;
  last_set_by: Record<string, Provenance>;
  intervals: IntervalPoint[];
  rates: (RateEvent & { pending: 0 | 1 })[];
  waters: ISODate[];
  instructions: CareInstruction[];
  photos: MediaId[];
  archive: { date: ISODate; reason: string } | null;
  last_event_date: ISODate | null;
}

const FIELD_NAMES = [
  'name', 'species', 'acquired', 'room', 'pot', 'planter',
  'water_interval_days', 'water_interval_days_winter',
  'feed', 'light', 'soil', 'notes_user', 'status_label', 'do_next', 'hero_media',
] as const;

function newWorking(base: PlantBaseline): Working {
  const provenance: Provenance = {
    source: base.origin,
    date: base.created,
    device_id: base.created_by,
  };
  const last_set_by: Record<string, Provenance> = {};
  for (const f of FIELD_NAMES) last_set_by[f] = provenance;

  return {
    base,
    fields: {
      name: base.name,
      species: base.species,
      acquired: base.acquired,
      room: base.room,
      pot: base.pot,
      planter: base.planter,
      water_interval_days: base.water_interval_days,
      water_interval_days_winter: base.water_interval_days_winter,
      feed: base.feed,
      light: base.light,
      soil: base.soil,
      notes_user: base.notes_user,
      status_label: base.status_label,
      do_next: base.do_next,
      hero_media: null,
    },
    last_set_by,
    intervals: [{
      from: base.created,
      summer: base.water_interval_days,
      winter: base.water_interval_days_winter,
    }],
    rates: [],
    waters: [],
    instructions: [],
    photos: [],
    archive: null,
    last_event_date: null,
  };
}

/**
 * The total order the fold runs in. `event_id` is the final tiebreak so that two
 * devices holding the same set of events produce identical state regardless of
 * the order the events arrived in — which is the whole basis of section 8's
 * "union by event_id, then recompute".
 */
export function compareEvents(a: StoredEvent, b: StoredEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.time !== b.time) return a.time < b.time ? -1 : 1;
  if (a.event_id === b.event_id) return 0;
  return a.event_id < b.event_id ? -1 : 1;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function healthSourceOf(source: EventSource): HealthSource {
  return source === 'ai' ? 'AI' : 'Me';
}

/** The care spec as it stood on a given date, from the folded Edit history. */
function intervalAt(points: IntervalPoint[], on: ISODate): IntervalPoint {
  let chosen = points[0];
  const target = toDay(on);
  for (const p of points) {
    if (toDay(p.from) <= target) chosen = p;
    else break;
  }
  return chosen;
}

function intervalFor(point: IntervalPoint, season: Season): number {
  return season === 'winter' && point.winter !== null ? point.winter : point.summer;
}

/* -------------------------------------------------------------------------- */
/* Care instructions — section 6c. `delete` exists here and only here.         */
/* -------------------------------------------------------------------------- */

function applyInstructionOp(list: CareInstruction[], e: EditEvent): void {
  const op = e.op ?? 'add';

  if (op === 'delete') {
    if (!e.instruction_id) return;
    const at = list.findIndex((i) => i.instruction_id === e.instruction_id);
    if (at >= 0) list.splice(at, 1);
    return;
  }

  // `derive` is pure and cannot mint an id, so an add or replace that arrives
  // without one is ignored rather than guessed at. The writer assigns it.
  if (!e.instruction_id) return;

  if (op === 'replace' && e.replaces) {
    const at = list.findIndex((i) => i.instruction_id === e.replaces);
    if (at >= 0) list.splice(at, 1);
  }

  list.push({
    instruction_id: e.instruction_id,
    text: e.to ?? '',
    added: e.date,
    source: e.source === 'ai' ? 'ai' : 'user',
    package_id: e.package_id ?? null,
    replaces: e.replaces ?? null,
  });
}

/* -------------------------------------------------------------------------- */

function applyEdit(w: Working, e: EditEvent): void {
  const f = e.field;

  if (f === 'care_instructions') {
    applyInstructionOp(w.instructions, e);
    w.last_set_by[f] = { source: e.source, date: e.date, device_id: e.device_id };
    return;
  }

  // Collection-scoped fields have no meaning on a plant. Ignore rather than
  // guess which lane was intended.
  if (f === 'collection_notes_user' || f === 'collection_care_instructions') return;

  const v = decodeFieldValue(f, e.to);
  // Malformed value: leave the field alone. One bad event cannot corrupt a plant.
  if (v === undefined) return;

  switch (f) {
    case 'name': if (typeof v === 'string') w.fields.name = v; break;
    case 'species': if (typeof v === 'string') w.fields.species = v; break;
    case 'acquired': if (v === null || typeof v === 'string') w.fields.acquired = v; break;
    case 'room': if (typeof v === 'string') w.fields.room = v; break;
    case 'pot': if (typeof v === 'string') w.fields.pot = v; break;
    case 'planter': if (v === null || typeof v === 'string') w.fields.planter = v; break;
    case 'feed': if (v === null || typeof v === 'string') w.fields.feed = v; break;
    case 'light': if (v === null || typeof v === 'string') w.fields.light = v; break;
    case 'soil': if (v === null || typeof v === 'string') w.fields.soil = v; break;
    case 'notes_user': if (typeof v === 'string') w.fields.notes_user = v; break;
    case 'do_next': if (v === null || typeof v === 'string') w.fields.do_next = v; break;
    case 'hero_media':
      w.fields.hero_media = v === null ? null : (v as MediaId);
      break;
    case 'status_label':
      w.fields.status_label = v === null ? null : (v as StatusLabel);
      break;
    case 'water_interval_days':
      if (typeof v !== 'number') return;
      w.fields.water_interval_days = v;
      break;
    case 'water_interval_days_winter':
      if (v !== null && typeof v !== 'number') return;
      w.fields.water_interval_days_winter = v;
      break;
  }

  // A care-spec change opens a new interval from this date. Historical
  // adherence keeps being scored against the value that was in force then —
  // otherwise every past watering is re-judged every time you tune a schedule.
  if (f === 'water_interval_days' || f === 'water_interval_days_winter') {
    w.intervals.push({
      from: e.date,
      summer: w.fields.water_interval_days,
      winter: w.fields.water_interval_days_winter,
    });
  }

  w.last_set_by[f] = { source: e.source, date: e.date, device_id: e.device_id };
}

function applyPlantEvent(w: Working, e: StoredEvent): void {
  switch (e.type) {
    case 'Rate':
      w.rates.push(e);
      w.last_set_by.health = { source: e.source, date: e.date, device_id: e.device_id };
      break;
    case 'Archive':
      // First one wins. A plant cannot be archived twice, and a duplicate
      // arriving from another device must not move the date.
      if (!w.archive) w.archive = { date: e.date, reason: e.note };
      break;
    case 'Edit':
      applyEdit(w, e);
      break;
    case 'Water':
      w.waters.push(e.date);
      break;
    default:
      break;
  }

  // Media rides on any event type, not just Photo.
  if (e.type !== 'Edit' && e.media) w.photos.push(...e.media);

  w.last_event_date = e.date;
}

/* -------------------------------------------------------------------------- */

function deriveHealth(w: Working, as_of: ISODate): DerivedHealth {
  const history: HealthReading[] = w.rates.map((e) => ({
    event_id: e.event_id,
    date: e.date,
    value: e.to,
    source: healthSourceOf(e.source),
    device_id: e.device_id,
  }));

  if (history.length === 0) {
    return {
      current: null, source: null, confirmed: null, changed: null, stale: false,
      previous: null, delta: null, elapsed_days: null, history, conflict: null,
    };
  }

  const last = history[history.length - 1];
  const previous = history.length >= 2 ? history[history.length - 2] : null;

  // `health_changed` is the first reading in the trailing run of equal values:
  // rating 7 again refreshes `confirmed` without moving `changed`.
  let i = history.length - 1;
  while (i > 0 && history[i - 1].value === last.value) i--;

  // Section 8: two devices rating the same plant in the same minute is the one
  // genuine conflict in the model. Surface it; never merge a judgement silently.
  const lastEvent = w.rates[w.rates.length - 1];
  const prevEvent = w.rates.length >= 2 ? w.rates[w.rates.length - 2] : null;
  const conflict = prevEvent
    && prevEvent.date === lastEvent.date
    && prevEvent.time === lastEvent.time
    && prevEvent.device_id !== lastEvent.device_id
    && previous
    ? { kept: last, other: previous }
    : null;

  return {
    current: last.value,
    source: last.source,
    confirmed: last.date,
    changed: history[i].date,
    stale: daysBetween(last.date, as_of) > STALE_DAYS,
    previous,
    delta: previous ? last.value - previous.value : null,
    elapsed_days: previous ? daysBetween(previous.date, last.date) : null,
    history,
    conflict,
  };
}

function deriveAdherence(w: Working, as_of: ISODate): DerivedAdherence {
  const points = [...w.intervals].sort((a, b) => toDay(a.from) - toDay(b.from));
  const waters = [...w.waters].sort((a, b) => toDay(a) - toDay(b));

  const intervals: WaterInterval[] = [];
  for (let i = 1; i < waters.length; i++) {
    const from = waters[i - 1];
    const to = waters[i];
    const season = seasonOf(from);
    const interval_days = intervalFor(intervalAt(points, from), season);
    const scheduled = addDays(from, interval_days);
    intervals.push({
      from,
      to,
      interval_days,
      season,
      days_late: Math.max(0, daysBetween(scheduled, to)),
    });
  }

  const late = intervals.filter((x) => x.days_late > 0);
  const on_time_count = intervals.length - late.length;
  // Averaged over the late intervals only: "on time 14 of 18" already carries
  // the frequency, so the second figure's job is magnitude, not a diluted mean.
  const avg_days_late = late.length
    ? round1(late.reduce((sum, x) => sum + x.days_late, 0) / late.length)
    : null;

  const last_water = waters.length ? waters[waters.length - 1] : null;

  if (!last_water) {
    return {
      state: 'on',
      last_water: null,
      interval_days: null,
      season: null,
      next_due: null,
      days_past: null,
      care_count: intervals.length,
      on_time_count,
      avg_days_late,
      intervals,
    };
  }

  const season = seasonOf(last_water);
  const interval_days = intervalFor(intervalAt(points, last_water), season);
  const next_due = addDays(last_water, interval_days);
  const days_past = daysBetween(next_due, as_of);

  const state: Adherence = days_past <= 0
    ? 'on'
    : days_past <= SLIP_MAX_DAYS ? 'slip' : 'behind';

  return {
    state,
    last_water,
    interval_days,
    season,
    next_due,
    days_past,
    care_count: intervals.length,
    on_time_count,
    avg_days_late,
    intervals,
  };
}

function finalizePlant(
  w: Working,
  as_of: ISODate,
  sharedWater: Map<string, boolean>,
  pendingByPlant: Map<string, EventId[]>,
): DerivedPlant {
  const health = deriveHealth(w, as_of);
  const adherence = deriveAdherence(w, as_of);
  const archived = w.archive !== null;

  // Rule 9 lives in the consumers, not here: none of these reasons may be
  // rendered as an instruction. `behind` means look at it, not "water overdue".
  const attention: AttentionReason[] = [];
  if (!archived) {
    if (adherence.state === 'behind') attention.push('behind');
    else if (adherence.state === 'slip') attention.push('slip');
    if (!adherence.last_water) attention.push('never_watered');
    if (health.stale) attention.push('health_stale');
    if (health.current === null) attention.push('unrated');
  }

  return {
    plant_id: w.base.plant_id,
    ...w.fields,
    planter_shared_water: w.fields.planter !== null
      && (sharedWater.get(w.fields.planter) ?? false),
    archived,
    archived_date: w.archive?.date ?? null,
    archived_reason: w.archive?.reason ?? null,
    health,
    adherence,
    care_instructions: w.instructions,
    photos: w.photos,
    hero: w.fields.hero_media,
    last_checked: w.last_event_date,
    attention,
    pending_event_ids: pendingByPlant.get(w.base.plant_id) ?? [],
    last_set_by: w.last_set_by,
  };
}

/* -------------------------------------------------------------------------- */

export const derive: Derive = ({ baselines, events, registry, as_of, include_pending }) => {
  const sharedWater = new Map(registry.planters.map((p) => [p.name, p.shared_water]));

  const working = new Map<string, Working>();
  for (const b of baselines) working.set(b.plant_id, newWorking(b));

  // Section 8 merges by taking the union of events by `event_id`. Doing that
  // union carelessly - concatenating two devices' logs - delivers shared events
  // twice, and a watering counted twice moves adherence. Dedupe here as well as
  // in the merge: this is the layer that must hold the guarantee, and after the
  // sort the survivor is deterministic whichever list an event arrived on.
  const ordered: StoredEvent[] = [];
  const seen = new Set<string>();
  for (const e of [...events].sort(compareEvents)) {
    if (seen.has(e.event_id)) continue;
    seen.add(e.event_id);
    ordered.push(e);
  }

  // Pending ids come off the full list whatever `include_pending` says: the
  // screens show the committed numbers with a pending badge beside them, so
  // both facts are needed at once.
  const pendingByPlant = new Map<string, EventId[]>();
  let pending_count = 0;
  for (const e of ordered) {
    if (e.pending !== 1) continue;
    pending_count++;
    if (e.plant_id === null) continue;
    const list = pendingByPlant.get(e.plant_id);
    if (list) list.push(e.event_id);
    else pendingByPlant.set(e.plant_id, [e.event_id]);
  }

  const collection = { notes_user: '', instructions: [] as CareInstruction[] };
  const orphan_event_ids: EventId[] = [];
  const applied: StoredEvent[] = [];

  for (const e of ordered) {
    if (e.plant_id !== null && !working.has(e.plant_id)) {
      orphan_event_ids.push(e.event_id);
      continue;
    }

    // Section 5: ratings are never touched by Update, and archiving a plant is
    // not a care action to be batched — both land the moment they are written.
    // Everything else waits for the commit.
    if (e.pending === 1 && !include_pending && e.type !== 'Rate' && e.type !== 'Archive') {
      continue;
    }

    if (e.plant_id === null) {
      if (e.type === 'Edit') {
        if (e.field === 'collection_notes_user') collection.notes_user = e.to ?? '';
        else if (e.field === 'collection_care_instructions') {
          applyInstructionOp(collection.instructions, e);
        }
      }
    } else {
      applyPlantEvent(working.get(e.plant_id)!, e);
    }
    applied.push(e);
  }

  const plants: Record<string, DerivedPlant> = {};
  for (const [id, w] of working) {
    plants[id] = finalizePlant(w, as_of, sharedWater, pendingByPlant);
  }

  const all = Object.values(plants).sort((a, b) => (a.plant_id < b.plant_id ? -1 : 1));
  const active = all.filter((p) => !p.archived);
  const archivedPlants = all.filter((p) => p.archived);

  /* --- collection average, and the average as it stood before the last one --- */

  const rated = active.filter((p) => p.health.current !== null);
  const average_health = rated.length
    ? round1(rated.reduce((s, p) => s + (p.health.current as Health), 0) / rated.length)
    : null;

  const healthAt = new Map<string, number>();
  const archivedAt = new Set<string>();
  const series: { value: number; date: ISODate }[] = [];
  for (const e of applied) {
    if (e.type === 'Archive' && e.plant_id !== null) archivedAt.add(e.plant_id);
    else if (e.type === 'Rate' && e.plant_id !== null) healthAt.set(e.plant_id, e.to);
    else continue;

    const values = [...healthAt].filter(([id]) => !archivedAt.has(id)).map(([, v]) => v);
    if (!values.length) continue;
    const value = round1(values.reduce((s, v) => s + v, 0) / values.length);
    // Consecutive equal averages are collapsed, so that archiving an unrated
    // plant after the last rating cannot make "previous" a copy of "current".
    // The entry keeps the date the value was first reached rather than the
    // latest date it still held: line 3 of the score block pairs the previous
    // value with the elapsed time since it, and "was 7, as of today" is not
    // news. This is the collection's answer to `health_changed`.
    if (series.length && series[series.length - 1].value === value) continue;
    series.push({ value, date: e.date });
  }
  const average_previous = series.length >= 2 ? series[series.length - 2] : null;

  /* --- calendars --- */

  const dueByDate = new Map<string, PlantId[]>();
  for (const p of active) {
    if (!p.adherence.next_due) continue;
    const list = dueByDate.get(p.adherence.next_due);
    if (list) list.push(p.plant_id);
    else dueByDate.set(p.adherence.next_due, [p.plant_id]);
  }
  const calendar_forward: DueDay[] = [...dueByDate]
    .map(([date, ids]) => ({ date: date as ISODate, plants: ids }))
    .sort((a, b) => toDay(a.date) - toDay(b.date));

  const eventsByDate = new Map<string, EventId[]>();
  for (const e of applied) {
    const list = eventsByDate.get(e.date);
    if (list) list.push(e.event_id);
    else eventsByDate.set(e.date, [e.event_id]);
  }
  // Backward reads newest first — it answers "what happened", and the answer
  // you want is usually the most recent one.
  const calendar_backward: HistoryDay[] = [...eventsByDate]
    .map(([date, ids]) => ({ date: date as ISODate, event_ids: ids }))
    .sort((a, b) => toDay(b.date) - toDay(a.date));

  /* --- needs attention --- */

  // `slip`, `unrated` and `never_watered` stay as per-plant markers. Escalating
  // them here would put all 22 plants on the list on day one and teach you to
  // ignore it. Only `behind` and a stale rating reach the collection list.
  const needs_attention = active
    .filter((p) => p.attention.includes('behind') || p.attention.includes('health_stale'))
    .map((p) => p.plant_id);

  return {
    as_of,
    included_pending: include_pending,
    plants,
    order: [...active, ...archivedPlants].map((p) => p.plant_id),
    collection: {
      active_count: active.length,
      archived_count: archivedPlants.length,
      rated_count: rated.length,
      average_health,
      average_previous,
      needs_attention,
      notes_user: collection.notes_user,
      care_instructions: collection.instructions,
    },
    calendar_forward,
    calendar_backward,
    pending_count,
    orphan_event_ids,
  };
};
