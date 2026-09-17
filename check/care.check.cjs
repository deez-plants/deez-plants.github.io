/**
 * The care round's pure half, and the score block's adapters.
 *
 * Everything asserted here runs without a database: selection, the per-row
 * line, the copy, the events a round builds, and the three-line score block's
 * inputs. The parts that need IndexedDB — append and the Update commit — are
 * exercised in the browser; what is checkable in node is checked in node.
 *
 * Run with `npm run check:care`.
 */

const R = require('./build/care/careRound.js');
const Rate = require('./build/care/rate.js');
const S = require('./build/score/score.js');
const { derive } = require('./build/db/derive.js');
const { formatDayMonth, formatElapsed, daysBetween } = require('./build/lib/dates.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; }
  else { fail++; console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`); }
};
const throws = (name, fn) => {
  try { fn(); fail++; console.log(`FAIL ${name}\n  expected a throw`); }
  catch { pass++; }
};

const TODAY = '2026-08-20';

/* ------------------------------------------------------------- fixtures -- */

const plant = (plant_id, name, over = {}) => ({
  plant_id, name,
  species: 'Testus plantus', acquired: 'Mar 2024',
  room: over.room ?? 'Living room', pot: '9" pot', planter: over.planter ?? null,
  planter_shared_water: false,
  water_interval_days: 7, water_interval_days_winter: 14,
  feed: null, light: null, soil: null, notes_user: '',
  status_label: null, do_next: null,
  archived: over.archived ?? false, archived_date: null, archived_reason: null,
  health: over.health ?? {
    current: null, source: null, confirmed: null, changed: null, stale: false,
    previous: null, delta: null, elapsed_days: null, history: [], conflict: null,
  },
  adherence: {
    state: 'on', last_water: '2026-08-13', interval_days: 7, season: 'summer',
    next_due: '2026-08-20', days_past: 0, care_count: 3, on_time_count: 3,
    avg_days_late: null, intervals: [],
    ...(over.adherence ?? {}),
  },
  care_instructions: [], photos: [], hero: null,
  last_checked: '2026-08-13', attention: [], pending_event_ids: [], last_set_by: {},
});

const past = plant('001-MON', 'Large Monstera', {
  adherence: { days_past: 6, next_due: '2026-08-14', last_water: '2026-08-07' },
  planter: 'Star Wars planter',
});
const dueToday = plant('002-SNK', 'Large Snake Plant', { planter: 'Star Wars planter' });
const early = plant('006-FER', 'Kitchen Fern', {
  room: 'Kitchen',
  adherence: { days_past: -3, next_due: '2026-08-23', last_water: '2026-08-16' },
});
const never = plant('009-SPD', 'Spider Plant', {
  room: 'Kitchen',
  adherence: {
    last_water: null, interval_days: null, season: null, next_due: null, days_past: null,
    care_count: 0, on_time_count: 0,
  },
});
const gone = plant('022-CAC', 'Dead Cactus', { archived: true });

const plants = [past, dueToday, early, never];

const state = {
  as_of: TODAY, included_pending: false,
  plants: Object.fromEntries([...plants, gone].map((p) => [p.plant_id, p])),
  order: [past.plant_id, dueToday.plant_id, early.plant_id, never.plant_id, gone.plant_id],
  collection: {
    active_count: 4, archived_count: 1, rated_count: 2,
    average_health: 7.4,
    average_previous: { value: 6.9, date: '2026-06-28' },
    needs_attention: [], notes_user: '', care_instructions: [],
  },
  calendar_forward: [], calendar_backward: [], pending_count: 0, orphan_event_ids: [],
};

const registry = {
  rooms: ['Living room', 'Kitchen'],
  planters: [{ name: 'Star Wars planter', shared_water: true }],
  updated: '2026-06-01',
};

/* ------------------------------------------------------------ selection -- */

eq('candidates exclude the archived plant',
  R.roundCandidates(state).map((p) => p.plant_id),
  ['001-MON', '002-SNK', '006-FER', '009-SPD']);

// Past interval means days_past >= 0: the day the interval is up counts.
eq('water preselects past-interval and due-today',
  R.preselectFor('Water', plants), ['001-MON', '002-SNK']);
// Adherence counts waterings and nothing else, so there is no feed schedule to
// be late against and nothing is guessed at.
eq('feed preselects nothing', R.preselectFor('Feed', plants), []);
eq('prune preselects nothing', R.preselectFor('Prune', plants), []);

eq('toggle on', R.toggle(['a'], 'b'), ['a', 'b']);
eq('toggle off', R.toggle(['a', 'b'], 'a'), ['b']);
eq('addAll does not duplicate', R.addAll(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);

// Planters only: rooms were dropped as groups deliberately (see the comment on
// selectionGroups) because most of the collection shares one room, so a room
// chip would just be a second "All". Groups of one are dropped too.
eq('groups: shared planters only, singletons dropped',
  R.selectionGroups(plants, registry),
  [
    { name: 'Star Wars planter', ids: ['001-MON', '002-SNK'], shared_water: true },
  ]);

/* ------------------------------- already logged today (the 14 Sep duplicates) */

/**
 * The owner opened four plants one at a time, watered each, then reached for
 * the fast multi-select round and did not deselect those four. The round said
 * "6 days past the 7-day interval" for every one of them, because a care event
 * moves no derived number until Update folds it in. Four duplicate Water
 * events dated 2026-09-14.
 *
 * So the guard reads the RAW log, pending included — the only place the last
 * ten minutes exist yet.
 */
{
  const PENDING_TODAY = [
    { event_id: 'P1', plant_id: '001-MON', type: 'Water', date: TODAY, time: '09:10', source: 'user', device_id: 'D', pending: 1 },
    { event_id: 'P2', plant_id: '002-SNK', type: 'Photo', date: TODAY, time: '09:11', source: 'user', device_id: 'D', pending: 1 },
  ];

  eq('a pending Water today counts as done',
    [...R.loggedTodayIds('Water', plants, PENDING_TODAY, TODAY)], ['001-MON']);

  eq('Photo is never guarded — five in a morning all mean something',
    [...R.loggedTodayIds('Photo', plants, PENDING_TODAY, TODAY)], []);

  eq('and neither is Inspect',
    [...R.loggedTodayIds('Inspect', plants, PENDING_TODAY, TODAY)], []);

  eq('only Water and Feed are guarded', R.GUARD_DUPLICATES, ['Water', 'Feed']);

  // The four duplicates, prevented: 001-MON is past its interval and would
  // have been preselected.
  eq('preselect drops what was already watered today',
    R.preselectFor('Water', plants, R.loggedTodayIds('Water', plants, PENDING_TODAY, TODAY)),
    ['002-SNK']);

  eq('and without the guard it would still be there',
    R.preselectFor('Water', plants), ['001-MON', '002-SNK']);

  // A bulk gesture must not sweep it back in.
  eq('a planter chip skips what is already done',
    R.addAll([], ['001-MON', '002-SNK'], new Set(['001-MON'])), ['002-SNK']);

  eq('the row says so instead of quoting the interval',
    R.rowStatus('Water', past, PENDING_TODAY, TODAY),
    { text: 'watered today', tone: 'done' });

  eq('fed reads as fed, not watered',
    R.rowStatus('Feed', past, [
      { event_id: 'P3', plant_id: '001-MON', type: 'Feed', date: TODAY, time: '09:10', source: 'user', device_id: 'D', pending: 1 },
    ], TODAY),
    { text: 'fed today', tone: 'done' });

  // Nothing is ever silently dropped — a second one is a question, not a ban.
  eq('the prompt names the action', R.againPrompt('Water'), 'Water again today? Tap to confirm');
  eq('and reads right for feed', R.againPrompt('Feed'), 'Feed again today? Tap to confirm');
}

/* ---------------------------------------------------------- the row line -- */

// Rule 9: every one of these states the calendar. None of them instructs.
const events = [
  { event_id: 'E1', plant_id: '001-MON', type: 'Feed', date: '2026-07-21', time: '09:00', source: 'user', device_id: 'D', pending: 0 },
  { event_id: 'E2', plant_id: '001-MON', type: 'Feed', date: '2026-06-01', time: '09:00', source: 'user', device_id: 'D', pending: 0 },
  { event_id: 'E3', plant_id: '001-MON', type: 'Water', date: '2026-08-07', time: '09:00', source: 'round', device_id: 'D', pending: 0 },
];

eq('water · past interval',
  R.rowStatus('Water', past, events, TODAY),
  { text: '6 days past the 7-day interval', tone: 'past' });
eq('water · up today',
  R.rowStatus('Water', dueToday, events, TODAY),
  { text: '7-day interval is up today', tone: 'due' });
eq('water · early — the negation of days_past is days remaining, not elapsed',
  R.rowStatus('Water', early, events, TODAY),
  { text: '3 days left of a 7-day interval', tone: 'quiet' });
eq('water · watered today reads the whole interval as remaining',
  R.rowStatus('Water', plant('x', 'x', {
    adherence: { days_past: -7, next_due: '2026-08-27', last_water: TODAY },
  }), events, TODAY),
  { text: '7 days left of a 7-day interval', tone: 'quiet' });
eq('water · one day left is singular',
  R.rowStatus('Water', plant('y', 'y', {
    adherence: { days_past: -1, next_due: '2026-08-21', last_water: '2026-08-14' },
  }), events, TODAY),
  { text: '1 day left of a 7-day interval', tone: 'quiet' });
eq('water · never watered',
  R.rowStatus('Water', never, events, TODAY),
  { text: 'No watering logged yet', tone: 'quiet' });

eq('feed reads the latest Feed, not the latest event',
  R.rowStatus('Feed', past, events, TODAY),
  { text: 'Last fed 30 days ago', tone: 'quiet' });
eq('feed · never', R.rowStatus('Feed', early, events, TODAY),
  { text: 'Never fed', tone: 'quiet' });
eq('prune ignores Feed events', R.rowStatus('Prune', past, events, TODAY),
  { text: 'Never pruned', tone: 'quiet' });
eq('lastOfType', R.lastOfType(events, '001-MON', 'Feed'), '2026-07-21');

/* ------------------------------------------------------------- the copy -- */

eq('heading', R.roundHeading('Water'), 'Who did you water?');
eq('button · none picked', R.roundButtonLabel({ action: null, selected: [], note: '' }), 'Pick an action');
eq('button · nothing selected', R.roundButtonLabel({ action: 'Water', selected: [], note: '' }), 'Select at least one plant');
eq('button · one', R.roundButtonLabel({ action: 'Feed', selected: ['a'], note: '' }), 'Log feed for 1 plant');
eq('button · many', R.roundButtonLabel({ action: 'Water', selected: ['a', 'b'], note: '' }), 'Log water for 2 plants');
eq('event count singular', R.eventCount(1), '1 event');
eq('event count plural', R.eventCount(9), '9 events');

/* --------------------------------------------------------- round events -- */

const ctx = { device_id: 'DEV-PHONE-ABC', date: TODAY, time: '11:20' };
const round = R.buildRoundEvents(
  { action: 'Water', selected: ['001-MON', '006-FER'], note: '  Thorough soak.  ' },
  ctx,
);

eq('one event per plant, never a grouped one', round.length, 2);
eq('per-plant, in selection order', round.map((e) => e.plant_id), ['001-MON', '006-FER']);
eq('type', round.map((e) => e.type), ['Water', 'Water']);
eq('source is round (section 5)', round.map((e) => e.source), ['round', 'round']);
eq('date and time shared', round.map((e) => `${e.date} ${e.time}`), [`${TODAY} 11:20`, `${TODAY} 11:20`]);
eq('note trimmed and applied to every plant', round.map((e) => e.note), ['Thorough soak.', 'Thorough soak.']);
eq('event ids unique', new Set(round.map((e) => e.event_id)).size, 2);
eq('event id carries date and time for a stable sort',
  round.every((e) => e.event_id.startsWith(`EV-${TODAY}-1120-`)), true);
eq('an empty note is left off the event',
  'note' in R.buildRoundEvents({ action: 'Prune', selected: ['001-MON'], note: '   ' }, ctx)[0],
  false);

throws('a round with no action is refused',
  () => R.buildRoundEvents({ action: null, selected: ['001-MON'], note: '' }, ctx));
throws('a round with no plants is refused',
  () => R.buildRoundEvents({ action: 'Water', selected: [], note: '' }, ctx));
throws('a note over 400 chars is refused',
  () => R.buildRoundEvents({ action: 'Water', selected: ['001-MON'], note: 'x'.repeat(401) }, ctx));

/* ------------------------------------------------------- the score block -- */

eq('movement up', S.movement(7.4, 6.9), { text: '+0.5', tone: 'up' });
eq('movement down', S.movement(6.4, 6.9), { text: '-0.5', tone: 'down' });
// Section 3b: under 0.05 reads `no change`, never `+0.0`.
eq('movement flat', S.movement(7, 7), { text: 'no change', tone: 'flat' });
eq('movement under 0.05', S.movement(7.02, 7), { text: 'no change', tone: 'flat' });

const rated = {
  current: 7, source: 'Me', confirmed: '2026-08-14', changed: '2026-06-28', stale: false,
  previous: { event_id: 'R1', date: '2026-06-28', value: 6, source: 'Me', device_id: 'D' },
  delta: 1, elapsed_days: 47, history: [], conflict: null,
};

eq('plant adapter', S.healthScore(rated), {
  current: 7, confirmed: '2026-08-14',
  previous: { value: 6, date: '2026-06-28' },
  source: 'Me', stale: false, onRate: undefined,
});

eq('unrated adapter keeps null rather than inventing a figure',
  S.healthScore(plant('x', 'x').health).current, null);

// Line 3 as the block renders it: previous, its date, the delta, the elapsed.
const line3 = (props) => `${props.previous.value}   ${formatDayMonth(props.previous.date)}   `
  + `${S.movement(props.current, props.previous.value).text} · `
  + `${formatElapsed(daysBetween(props.previous.date, props.confirmed))}`;
eq('line 3', line3(S.healthScore(rated)), '6   Jun 28   +1.0 · 7wk');

const collection = S.collectionScore(state);
eq('collection current is the decimal average', collection.current, 7.4);
eq('collection previous is the previous average',
  collection.previous, { value: 6.9, date: '2026-06-28' });
eq('collection has no ME/AI tag', collection.source, null);
// Nothing in the fixture is rated, so there is no confirmed date to show.
eq('collection confirmed', collection.confirmed, null);
eq('collection is not stale without a confirmed date', collection.stale, false);

/* ------------------------------------------------------ the rating write path -- */

// buildRateEvent is the write path's pure half. There is deliberately no branch
// for "confirming vs changing" in it — section 4 says that distinction lives
// entirely in how derive.ts reads the log back, never in what gets written, so
// the same call produces all three scenarios below depending only on the log
// it lands in.

const rateCtx = { device_id: 'DEV-PHONE-ABC', date: '2026-08-14', time: '09:05' };
const firstRateEvent = Rate.buildRateEvent('001-MON', 7, rateCtx);

eq('rate event type', firstRateEvent.type, 'Rate');
eq('rate event carries the value in to', firstRateEvent.to, 7);
eq('rate event source is user, so health_source reads Me', firstRateEvent.source, 'user');
eq('rate event device_id', firstRateEvent.device_id, 'DEV-PHONE-ABC');
eq('rate event id carries date and time for a stable sort',
  firstRateEvent.event_id.startsWith('EV-2026-08-14-0905-'), true);

throws('a rating below 1 is refused', () => Rate.buildRateEvent('001-MON', 0, rateCtx));
throws('a rating above 10 is refused', () => Rate.buildRateEvent('001-MON', 11, rateCtx));
throws('a non-integer rating is refused', () => Rate.buildRateEvent('001-MON', 7.5, rateCtx));

const baseline = (id) => ({
  plant_id: id, name: id, species: 'Testus plantus', acquired: 'Mar 2024',
  room: 'Living room', pot: '9" pot', planter: null,
  water_interval_days: 7, water_interval_days_winter: 14,
  feed: null, light: null, soil: null, notes_user: '',
  status_label: null, do_next: null,
  created: '2026-01-01', created_by: 'DEV-A', origin: 'seed',
});

const runRated = (rateEvents, as_of) => derive({
  baselines: [baseline('001-MON')], events: rateEvents, registry, as_of, include_pending: false,
}).plants['001-MON'].health;

{
  // A first rating: nothing to confirm against yet, so changed equals confirmed
  // and the confirmation line has nothing to compare it with.
  const h = runRated(
    [Rate.buildRateEvent('001-MON', 7, { device_id: 'DEV-A', date: '2026-06-28', time: '10:00' })],
    '2026-06-28',
  );
  eq('first rating: current', h.current, 7);
  eq('first rating: confirmed', h.confirmed, '2026-06-28');
  eq('first rating: changed equals confirmed', h.changed, h.confirmed);
  eq('first rating: no previous reading', h.previous, null);
  eq('first rating: source', h.source, 'Me');
  eq('first rating: confirmation line', S.confirmationLine(h), 'confirmed Jun 28');
}

{
  // A confirmation: the same value written again later. Section 4's whole
  // point — this is a real event, so `confirmed` moves to the new date, but
  // `changed` must not, and a single tap on the sheet is what produces it.
  const h = runRated([
    Rate.buildRateEvent('001-MON', 7, { device_id: 'DEV-A', date: '2026-06-28', time: '10:00' }),
    Rate.buildRateEvent('001-MON', 7, { device_id: 'DEV-A', date: '2026-08-14', time: '09:05' }),
  ], '2026-08-14');
  eq('confirm: current is unchanged', h.current, 7);
  eq('confirm: confirmed moves to the new date', h.confirmed, '2026-08-14');
  eq('confirm: changed stays at the original date', h.changed, '2026-06-28');
  eq('confirm: previous reading is the same value', h.previous.value, 7);
  eq('confirm: previous reading is the original date', h.previous.date, '2026-06-28');
  eq('confirm: movement reads no change, never +0.0',
    S.movement(h.current, h.previous.value).text, 'no change');
  // The spec's own worked example (section 4): confirmed vs. unchanged since.
  eq('confirm: the signal beside the score block',
    S.confirmationLine(h), 'confirmed Aug 14 · unchanged since Jun 28');
}

{
  // A genuine change: a different value. Both dates move together — there is
  // no gap left to report, so the confirmation line drops the second clause.
  const h = runRated([
    Rate.buildRateEvent('001-MON', 7, { device_id: 'DEV-A', date: '2026-06-28', time: '10:00' }),
    Rate.buildRateEvent('001-MON', 9, { device_id: 'DEV-A', date: '2026-08-14', time: '09:05' }),
  ], '2026-08-14');
  eq('change: current is the new value', h.current, 9);
  eq('change: confirmed moves', h.confirmed, '2026-08-14');
  eq('change: changed moves with it', h.changed, '2026-08-14');
  eq('change: previous is the old value', h.previous.value, 7);
  eq('change: previous is the old date', h.previous.date, '2026-06-28');
  eq('change: movement is up', S.movement(h.current, h.previous.value).tone, 'up');
  eq('change: confirmation line has no residual gap to report',
    S.confirmationLine(h), 'confirmed Aug 14');
}

/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------- archiving -- */

// Rule 8: archiving is an event, never a state patch. These check the event a
// button would write, not the button.
{
  const A = require('./build/care/archive.js');
  const ctx = { date: '2026-09-11', time: '21:30', device_id: 'DEV-TEST-1' };

  const ev = A.buildArchiveEvent('009-SPD', '  Died over the winter  ', ctx);
  eq('archive builds an Archive event for the plant',
    [ev.type, ev.plant_id, ev.source], ['Archive', '009-SPD', 'user']);
  eq('the reason is trimmed and kept as the note', ev.note, 'Died over the winter');
  eq('it carries the date and time it was made', [ev.date, ev.time], ['2026-09-11', '21:30']);

  // Section 4 caps `archived_reason`, and an archived plant with no reason
  // answers "what happened to this one?" with silence.
  throws('a blank reason is refused', () => A.buildArchiveEvent('009-SPD', '   ', ctx));
  throws('a reason over 120 characters is refused',
    () => A.buildArchiveEvent('009-SPD', 'x'.repeat(121), ctx));
  eq('exactly 120 characters is allowed',
    A.buildArchiveEvent('009-SPD', 'x'.repeat(120), ctx).note.length, 120);
}

/* ------------------------------------------------------- what works -- */

// Screen 18, the screen the owner calls the point of the app. These check what
// counts as an intervention, and — the reason this section exists — what does
// NOT.
{
  const W = require('./build/score/whatWorks.js');

  const readings = [
    { event_id: 'R1', date: '2026-06-01', value: 5, source: 'user', device_id: 'D' },
    { event_id: 'R2', date: '2026-08-01', value: 8, source: 'user', device_id: 'D' },
  ];
  const st = {
    plants: {
      '001-MON': { plant_id: '001-MON', name: 'Large Monstera', health: { history: readings } },
    },
  };
  const ev = (over) => ({ event_id: 'E', plant_id: '001-MON', date: '2026-07-01', time: '09:00', source: 'user', ...over });

  const spec = W.careChanges(st, [ev({ event_id: 'E1', type: 'Edit', field: 'water_interval_days', from: '7', to: '10' })]);
  eq('a spec change is an intervention', [spec.length, spec[0].label, spec[0].kind],
    [1, 'Watering interval', 'change']);
  eq('with the ratings that bracket it', [spec[0].before.value, spec[0].after.value, spec[0].delta],
    [5, 8, 3]);
  eq('and the elapsed days, never the delta alone', spec[0].elapsed_days, 61);

  // Moving a plant is the owner's most common intervention and was missing.
  eq('moving a plant counts',
    W.careChanges(st, [ev({ event_id: 'E2', type: 'Edit', field: 'spot', from: 'shelf', to: 'windowsill' })]).length, 1);

  // Things done, not settings changed — a repot is bigger than any spec edit.
  const repot = W.careChanges(st, [ev({ event_id: 'E3', type: 'Repot', note: 'up a pot size' })]);
  eq('a repot counts, as an action', [repot.length, repot[0].label, repot[0].kind, repot[0].to],
    [1, 'Repotted', 'action', 'up a pot size']);

  // Routine is not an intervention. A rating either side of one watering out of
  // hundreds means nothing, and including them would bury the repot.
  eq('watering and feeding are not interventions',
    W.careChanges(st, [
      ev({ event_id: 'E4', type: 'Water' }),
      ev({ event_id: 'E5', type: 'Feed' }),
    ]).length, 0);

  // The room/spot migration wrote a pair of edits per plant that left every
  // plant exactly where it was. Left in, they filled this screen with moves
  // that never happened — the first thing it showed on the owner's own record.
  const migrated = W.careChanges(st, [
    ev({ event_id: 'M1', type: 'Edit', field: 'room', from: 'Living room, by the window', to: 'Living Room' }),
    ev({ event_id: 'M2', type: 'Edit', field: 'spot', from: '', to: 'by the window' }),
  ]);
  eq('splitting room from spot is not a move', migrated.length, 0);

  // But a real move made the same way still counts.
  const realMove = W.careChanges(st, [
    ev({ event_id: 'M3', type: 'Edit', field: 'room', from: 'Living room, by the window', to: 'Kitchen' }),
    ev({ event_id: 'M4', type: 'Edit', field: 'spot', from: '', to: 'on the sill' }),
  ]);
  eq('an actual move is not mistaken for the migration', realMove.length, 2);

  // Scoping to one plant, which is how it is reached from that plant's page.
  const two = { plants: { ...st.plants, '002-SNK': { plant_id: '002-SNK', name: 'Snake', health: { history: [] } } } };
  const both = [
    ev({ event_id: 'E6', type: 'Repot' }),
    ev({ event_id: 'E7', type: 'Repot', plant_id: '002-SNK' }),
  ];
  eq('unscoped sees every plant', W.careChanges(two, both).length, 2);
  eq('scoped sees one', W.careChanges(two, both, '002-SNK').map((c) => c.plant_id), ['002-SNK']);
}

/* ------------------------------------------ the compared photographs -- */

// The owner's rule, 2026-09-12: the last two full-plant photographs, because
// that is what shows the work they have done.
{
  const W = require('./build/score/whatWorks.js');
  const ph = (media_id, date, label) => ({ media_id, date, label });

  const shots = [
    ph('m1', '2026-01-10', 'whole'),
    ph('m2', '2026-03-02', 'leaf'),
    ph('m3', '2026-05-04', 'whole'),
    ph('m4', '2026-07-08', 'whole'),
    ph('m5', '2026-08-01', 'soil'),
  ];

  const auto = W.comparePhotos({ compare: null }, shots);
  eq('the last two whole-plant shots, oldest first',
    [auto.pair.map((p) => p.media_id), auto.chosen], [['m3', 'm4'], false]);

  // Comparing like with like is the whole point: a whole plant beside a leaf
  // close-up looks like change without being it.
  eq('close-ups are never paired with a whole plant',
    auto.pair.every((p) => p.label === 'whole'), true);

  // One whole-plant photo is not a comparison, and padding it would show
  // change that is not there.
  eq('one whole-plant photo gives no pair',
    W.comparePhotos({ compare: null }, [ph('m1', '2026-01-10', 'whole'), ph('m2', '2026-02-01', 'leaf')]).pair.length, 0);
  eq('no photos at all gives no pair', W.comparePhotos({ compare: null }, []).pair.length, 0);

  // An explicit choice wins, and does not expire because a newer photo landed.
  const picked = W.comparePhotos({ compare: ['m1', 'm4'] }, shots);
  eq('the pair the owner chose wins',
    [picked.pair.map((p) => p.media_id), picked.chosen], [['m1', 'm4'], true]);
  eq('their pair may cross labels if they say so',
    W.comparePhotos({ compare: ['m2', 'm5'] }, shots).pair.map((p) => p.media_id), ['m2', 'm5']);

  // A chosen photo that has since been deleted must not strand the pair.
  eq('a deleted choice falls back rather than breaking',
    W.comparePhotos({ compare: ['gone', 'alsogone'] }, shots).pair.map((p) => p.media_id), ['m3', 'm4']);

  // Always oldest first, so the pair reads then -> now.
  eq('order is always then, then now',
    W.comparePhotos({ compare: ['m4', 'm1'] }, shots).pair.map((p) => p.media_id), ['m1', 'm4']);
}


/* ------------------------------------------- the tiers, and the routine band */

{
  const W = require('./build/score/whatWorks.js');
  const C = require('./build/lib/careTypeStyle.js');
  const L = require('./build/lib/eventLabel.js');

  // Every care type must appear in exactly one tier. A type that exists in the
  // model but in no tier would be unloggable, and nothing else in the app
  // would notice - the screen would simply never offer it.
  const tiers = [...R.COMMON_TIER, ...R.ROUTINE_TIER, ...R.RARE_TIER];
  eq('the tiers hold every care type once', tiers.length, new Set(tiers).size);
  eq('the tiers and CARE_TYPES agree', [...R.CARE_TYPES].sort(), [...tiers].sort());
  eq('every care type has a calendar style',
    tiers.filter((t) => !C.CARE_TYPE_STYLE[t]), []);

  // Retired types are the exception, and the reason matters: entries are
  // append-only, so a type can stop being OFFERED but must never stop being
  // RENDERABLE. Prune was retired when Dead leaves, Trim back and Hard prune
  // replaced it; the owner's historic Prune events still have to read.
  eq('Prune is retired, not deleted', [...R.RETIRED_TYPES], ['Prune']);
  for (const t of R.RETIRED_TYPES) {
    eq(`a retired type is off the pickers · ${t}`, tiers.includes(t), false);
    eq(`but still has a calendar style · ${t}`, !!C.CARE_TYPE_STYLE[t], true);
    eq(`and still has a history label · ${t}`, !!L.eventLabel({ type: t }), true);
  }

  eq('the calendar order covers the tiers plus anything retired',
    [...C.CARE_TYPE_ORDER].sort(), [...tiers, ...R.RETIRED_TYPES].sort());

  // The owner's own order, most frequent first. Not alphabetical, and not the
  // order CareEventType happens to declare: dead leaves leads because that is
  // what they actually do most.
  eq('routine is in the owner’s order', [...R.ROUTINE_TIER],
    ['Dead leaves', 'Trim back', 'Rotate', 'Wipe leaves', 'Mist', 'Inspect']);

  const ev = (event_id, type, date, over = {}) => ({
    event_id, plant_id: '001-MON', type, date, time: '09:00',
    source: 'user', device_id: 'd1', ...over,
  });

  const log = [
    ev('r1', 'Rotate', '2026-06-01'),
    ev('r2', 'Rotate', '2026-07-01'),
    ev('r3', 'Rotate', '2026-08-01'),
    ev('m1', 'Mist', '2026-07-15'),
    ev('d1', 'Dead leaves', '2026-08-10'),
    ev('h1', 'Hard prune', '2026-05-01'),
    ev('w1', 'Water', '2026-08-12'),
    ev('x1', 'Rotate', '2026-06-02', { plant_id: '002-FIC' }),
  ];

  const counts = W.routineCounts(log, '001-MON');
  eq('routine counts, most frequent first',
    counts.map((c) => [c.type, c.count]),
    [['Rotate', 3], ['Dead leaves', 1], ['Mist', 1]]);
  eq('a routine count carries when you last did it',
    counts[0].last, '2026-08-01');

  // The whole reason the split exists: routine must never reach the story.
  eq('routine is not counted as a change',
    W.careChanges({ plants: { '001-MON': {
      name: 'Large Monstera', health: { history: [] },
    } } }, log, '001-MON').map((c) => c.field),
    ['Hard prune']);
  eq('watering is not routine either',
    counts.some((c) => c.type === 'Water'), false);
  eq('another plant’s routine stays its own',
    W.routineCounts(log, '002-FIC').map((c) => c.count), [1]);
  // Ties fall back to the label, alphabetically. Arbitrary but stable, which
  // is what matters: the band must not reshuffle itself between renders.
  eq('a window drops what falls outside it',
    W.routineCounts(log, '001-MON', '2026-07-05').map((c) => [c.type, c.count]),
    [['Dead leaves', 1], ['Mist', 1], ['Rotate', 1]]);
}

/* ---------------------------------------------------- what you said --------- */

{
  const W = require('./build/score/whatWorks.js');

  const said = W.saidThings([
    { event_id: 'n1', plant_id: '001-MON', type: 'Edit', field: 'notes_user',
      from: '', to: 'Leaves drooping again', date: '2026-03-14', time: '09:00',
      source: 'user', device_id: 'd1' },
    { event_id: 'n2', plant_id: '001-MON', type: 'Edit', field: 'notes_user',
      from: 'Leaves drooping again', to: 'Looking much better', date: '2026-06-02',
      time: '09:00', source: 'user', device_id: 'd1' },
    { event_id: 'n3', plant_id: '001-MON', type: 'Edit', field: 'notes_user',
      from: 'Looking much better', to: '   ', date: '2026-06-03', time: '09:00',
      source: 'user', device_id: 'd1' },
    { event_id: 'c1', plant_id: '001-MON', type: 'Repot', note: 'Moved up a pot size',
      date: '2026-05-01', time: '09:00', source: 'user', device_id: 'd1' },
    { event_id: 'e1', plant_id: '001-MON', type: 'Edit', field: 'room',
      from: 'A', to: 'B', note: 'not a thing you said', date: '2026-05-02',
      time: '09:00', source: 'user', device_id: 'd1' },
    { event_id: 'o1', plant_id: '002-FIC', type: 'Edit', field: 'notes_user',
      from: '', to: 'Someone else', date: '2026-05-03', time: '09:00',
      source: 'user', device_id: 'd1' },
  ], '001-MON');

  // Newest first, and every version kept: the note history is already in the
  // log because notes_user is written as an ordinary Edit event.
  eq('what you said, newest first',
    said.map((s) => [s.date, s.text, s.kind]),
    [['2026-06-02', 'Looking much better', 'note'],
     ['2026-05-01', 'Moved up a pot size', 'care'],
     ['2026-03-14', 'Leaves drooping again', 'note']]);
  eq('a care note says what it was about', said[1].about, 'Repotted');
  eq('clearing a note is not something you said',
    said.some((s) => s.event_id === 'n3'), false);
  eq('a field edit’s note is not something you said',
    said.some((s) => s.event_id === 'e1'), false);
  eq('another plant’s notes stay its own',
    said.some((s) => s.event_id === 'o1'), false);
}


/* ------------------------------------------- the round, widened to routine */

{
  // One interface across both Log care screens, at the owner's request: the
  // round offers exactly what a single plant's page offers. The rule that
  // interventions "deserve" no batch was mine, not theirs, and a round writes
  // one event per plant whatever the type.
  eq('the round offers the same actions as a plant page',
    [...R.ROUND_ACTIONS], [...R.CARE_TYPES]);

  for (const a of R.ROUND_ACTIONS) {
    const h = R.roundHeading(a);
    // A template would produce "Who did you dead leaves?" - every action needs
    // copy written for it, and a missing entry must fail here rather than ship.
    eq(`heading reads as English for ${a}`, /^Wh[oa].+\?$/.test(h) && !/undefined/.test(h), true);
    const label = R.roundButtonLabel({ action: a, selected: ['001-MON'], note: '' });
    eq(`button label is written for ${a}`, /undefined/.test(label), false);
  }

  // Rule 9 by the back door: nothing in the record says how often a plant
  // should be rotated, so no routine action may pre-select anything.
  const past = { plant_id: '001-MON', adherence: { days_past: 9, interval_days: 7 } };
  eq('only water pre-selects',
    R.ROUND_ACTIONS.filter((a) => R.preselectFor(a, [past]).length), ['Water']);

  // A retired type cannot be logged from either screen.
  eq('a retired type is not a round action',
    R.RETIRED_TYPES.filter((t) => R.ROUND_ACTIONS.includes(t)), []);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
