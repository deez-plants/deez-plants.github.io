/**
 * What Home shows, and what a tick means — `care/board.ts`.
 *
 * ## The two things this is really guarding
 *
 * **Nothing falls off the board.** The merge took three lists down to one, and
 * the failure mode of a merge is a plant that belongs on it appearing nowhere.
 * So every plant with a schedule lands in exactly one of needs-attention,
 * coming-up, deferred, or further out than a week — and that is asserted as a
 * partition, not row by row.
 *
 * **Rule 9.** The lists are a prompt to look; a tick records what the owner did
 * after looking. The wording checks below exist because that rule is broken by
 * a single careless verb, and a screen that reads as instructions is the one
 * thing this project has said most consistently it must not become.
 *
 * Run with `npm run check:board`.
 */

const {
  buildBoard, toggle, counts, commitLabel, rowReason, ratingReason, ratingsLine,
  restingLine, COMING_UP_DAYS, SECTION_CAP,
} = require('./build/care/board.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; }
  else { fail++; console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`); }
};
const ok = (name, cond) => eq(name, !!cond, true);

/* --------------------------------------------------------------- fixture -- */

const plant = (plant_id, over = {}) => ({
  plant_id,
  name: plant_id,
  archived: false,
  attention: [],
  recheck: null,
  health: { current: 7, confirmed: '2026-06-01', stale: false },
  adherence: { days_past: null, interval_days: 7, last_water: '2026-09-01', next_due: null, state: 'on' },
  ...over,
});

const due = (plant_id, days_past, over = {}) => plant(plant_id, {
  ...over,
  adherence: { days_past, interval_days: over.interval ?? 7, last_water: '2026-09-01', next_due: null, state: 'on' },
});

const stateOf = (plants) => ({
  order: plants.map((p) => p.plant_id),
  plants: Object.fromEntries(plants.map((p) => [p.plant_id, p])),
  collection: {},
});

const ids = (rows) => rows.map((r) => r.plant.plant_id);

/* ------------------------------------------------------ which list, and why -- */

{
  const b = buildBoard(stateOf([
    due('A', 4),                       // past
    due('B', 0),                       // due today
    due('C', -1),                      // tomorrow
    due('D', -7),                      // the far edge of the week
    due('E', -8),                      // beyond it
    plant('F'),                        // never watered: no schedule to be past
  ]));

  eq('past and due-today need attention', ids(b.needs_attention), ['A', 'B']);
  eq('the next week is coming up', ids(b.coming_up), ['C', 'D']);
  eq('further out than a week is on neither', ids(b.coming_up).includes('E'), false);
  ok('and a plant with no schedule is on neither',
    !ids(b.needs_attention).includes('F') && !ids(b.coming_up).includes('F'));
}

{
  // The partition. A merged board's failure mode is a plant that belongs on it
  // appearing nowhere at all, so this is asserted as a whole rather than case
  // by case.
  const plants = [];
  for (let d = -12; d <= 12; d += 1) plants.push(due(`P${d + 12}`, d));
  const b = buildBoard(stateOf(plants));

  const placed = new Set([...ids(b.needs_attention), ...ids(b.coming_up), ...ids(b.deferred)]);
  const missing = plants
    .filter((p) => p.adherence.days_past >= -COMING_UP_DAYS)
    .filter((p) => !placed.has(p.plant_id))
    .map((p) => p.plant_id);
  eq('every plant due within the week is on exactly one list', missing, []);

  const twice = [...ids(b.needs_attention), ...ids(b.coming_up), ...ids(b.deferred)];
  eq('and none of them is on two', twice.length, new Set(twice).size);
}

{
  // Worst first on one, soonest first on the other. Both are "most pressing at
  // the top", which is the only ordering a thumb wants.
  const b = buildBoard(stateOf([due('A', 1), due('B', 9), due('C', 4), due('D', -5), due('E', -1)]));
  eq('needs attention leads with the worst', ids(b.needs_attention), ['B', 'C', 'A']);
  eq('coming up leads with the soonest', ids(b.coming_up), ['E', 'D']);
}

/* ------------------------------------------------- a checked plant rests -- */

{
  const checked = due('A', 4, {
    attention: ['behind'],
    recheck: { event_id: 'E1', checked: '2026-10-02', until: '2026-10-06', reason: 'still_moist', unresolved: false },
  });
  const b = buildBoard(stateOf([checked, due('B', 2)]));

  eq('a checked plant leaves the list', ids(b.needs_attention), ['B']);
  eq('and is counted as resting', ids(b.deferred), ['A']);
  eq('which the screen can say out loud',
    restingLine(b, '2026-10-02'), '1 plant you have already checked, next one back on 2026-10-06');
}

{
  // Standing water nobody dealt with. `isDeferred` is false for it, so it stays
  // on the board — the one case where a recheck does not make a plant quiet.
  const undrained = due('A', 4, {
    recheck: { event_id: 'E1', checked: '2026-10-02', until: '2026-10-04', reason: 'standing_water', unresolved: true },
  });
  const b = buildBoard(stateOf([undrained]));
  eq('an undrained plant stays on the board', ids(b.needs_attention), ['A']);
  eq('and is not counted as resting', b.deferred.length, 0);
  eq('so there is nothing resting to report', restingLine(b, '2026-10-02'), null);
}

/* ------------------------------------------------------ the ratings line -- */

{
  const b = buildBoard(stateOf([
    plant('A', { attention: ['health_stale'], health: { current: 7, confirmed: '2026-06-20', stale: true } }),
    plant('B', { attention: ['health_stale'], health: { current: 5, confirmed: '2026-05-02', stale: true } }),
    plant('C'),
  ]));
  eq('oldest confirmation first', b.stale_ratings.map((p) => p.plant_id), ['B', 'A']);
  eq('one line, not a list', ratingsLine(b, 22), 'Ratings · 2 of 22 not confirmed in 3 months');
  eq('and nothing at all when none are stale', ratingsLine(buildBoard(stateOf([plant('C')])), 22), null);
}

{
  // Both reasons on one row. The owner asked for this: letting water win is how
  // the rating problem stayed invisible.
  const row = { plant: plant('A', { attention: ['behind', 'health_stale'] }), days_past: 4, stale_rating: true };
  eq('the water reason', rowReason({ ...row, plant: due('A', 4) }), '4 days past its 7-day interval');
  eq('and the rating reason beside it',
    ratingReason(plant('A', { attention: ['health_stale'] })), 'You said 7 — not confirmed in three months');
  eq('an unrated stale plant says so without inventing a number',
    ratingReason(plant('A', { attention: ['health_stale'], health: { current: null, confirmed: null, stale: true } })),
    'Not looked at in three months');
  eq('and a plant with a fresh rating has no second line', ratingReason(plant('A')), null);
}

/* ------------------------------------------------------------ the basket -- */

{
  let b = new Map();
  b = toggle(b, 'A', 'watered');
  b = toggle(b, 'B', 'checked');
  eq('two ticks, two kinds', counts(b), { watered: 1, checked: 1, total: 2 });

  // Changing your mind replaces rather than stacks: the owner did one of these
  // things, not both.
  b = toggle(b, 'A', 'checked');
  eq('watered then checked is one check', counts(b), { watered: 0, checked: 2, total: 2 });
  eq('and the plant is listed once', b.size, 2);

  // Tapping the same thing again takes it off.
  b = toggle(b, 'A', 'checked');
  eq('untick', counts(b), { watered: 0, checked: 1, total: 1 });

  // One basket across the whole screen: a plant on two lists cannot be ticked
  // twice, because the key is the plant.
  let c = toggle(new Map(), 'A', 'watered');
  c = toggle(c, 'A', 'watered');
  eq('a plant in two sections is still one entry', counts(c).total, 0);
}

/* ------------------------------------------------- rule 9, in the wording -- */

eq('nothing ticked', commitLabel(counts(new Map())), 'Nothing ticked yet');
eq('one watering', commitLabel({ watered: 1, checked: 0, total: 1 }), 'Log 1 watering');
eq('six and two, named separately', commitLabel({ watered: 6, checked: 2, total: 8 }),
  'Log 6 waterings · 2 checks');
eq('checks alone', commitLabel({ watered: 0, checked: 3, total: 3 }), 'Log 3 checks');

{
  // Rule 9: a date is a fact, "water this" is an instruction. The screen may
  // only ever say the first.
  const banned = /\b(must|need to|should|water it|overdue|do this|required)\b/i;
  const phrases = [
    rowReason({ plant: due('A', 4), days_past: 4, stale_rating: false }),
    rowReason({ plant: due('A', 0), days_past: 0, stale_rating: false }),
    rowReason({ plant: due('A', -1), days_past: -1, stale_rating: false }),
    rowReason({ plant: due('A', -4), days_past: -4, stale_rating: false }),
    commitLabel({ watered: 6, checked: 2, total: 8 }),
    ratingReason(plant('A', { attention: ['health_stale'] })),
  ];
  eq('nothing on the board reads as an instruction', phrases.filter((p) => banned.test(p)), []);

  eq('due today says so plainly', rowReason({ plant: due('A', 0), days_past: 0, stale_rating: false }),
    'Due today on its 7-day interval');
  eq('tomorrow', rowReason({ plant: due('A', -1), days_past: -1, stale_rating: false }), 'Due tomorrow');
  eq('later this week', rowReason({ plant: due('A', -4), days_past: -4, stale_rating: false }), 'Due in 4 days');
  eq('one day past reads singular', rowReason({ plant: due('A', 1), days_past: 1, stale_rating: false }),
    '1 day past its 7-day interval');
}

/* ------------------------------------------------------------------ caps -- */

eq('five rows then See all', SECTION_CAP, 5);
eq('coming up is a week', COMING_UP_DAYS, 7);

{
  // An archived plant is never on the board, whatever its dates say.
  const b = buildBoard(stateOf([due('A', 9, { archived: true }), due('B', 1)]));
  eq('archived plants are off the board', ids(b.needs_attention), ['B']);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
