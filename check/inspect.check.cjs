/**
 * Inspect: the reason, the defer table, and the live recheck —
 * `care/inspect.ts`.
 *
 * ## What this is actually protecting
 *
 * The defer numbers themselves are arbitrary in the sense that any table would
 * be; what is not arbitrary is **how they were arrived at**, and two wrong
 * answers were built and discarded before this one. A flat three days was
 * invented. A fraction of the plant's interval ignored where in the cycle the
 * check happened — and the owner caught that: a plant only reaches the
 * attention list once it is past due, so there is never a remaining interval
 * to wait out. What survived is the chip, scaled to the plant's own interval.
 *
 * The parts worth pinning hardest are the two that are not arithmetic:
 * **an undrained standing-water check never quiets a plant**, and **a voided
 * inspection cannot keep one quiet either**. Both are ways the board could
 * silently stop telling the owner something.
 *
 * Run with `npm run check:inspect`.
 */

const {
  deferDays,
  standingWaterNeedsAction,
  liveRecheck,
  liveRecheckFrom,
  isDeferred,
  INSPECT_REASONS,
  REASON_TEXT,
  RECHECK_CHOICES,
} = require('./build/care/inspect.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; }
  else { fail++; console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`); }
};
const ok = (name, cond) => eq(name, !!cond, true);

/* ------------------------------------------------------- the defer table -- */

// The agreed table, on the plant that prompted all of this: Purple Shamrock,
// a 7-day interval, four days past when the owner looked at it.
eq('7-day · still moist', deferDays('still_moist', 7), 4);
eq('7-day · looks fine', deferDays('looks_fine', 7), 2);
eq('7-day · drying normally', deferDays('drying_normally', 7), 2);
eq('7-day · no reason given', deferDays(null, 7), 2);
eq('7-day · needs watching', deferDays('needs_watching', 7), 2);
eq('7-day · standing water', deferDays('standing_water', 7), 2);

// A slow plant waits proportionally longer — the whole reason this scales to
// the interval rather than being one number for everything. Three days is
// pointless on a cactus.
eq('28-day · still moist hits the cap', deferDays('still_moist', 28), 10);
eq('28-day · looks fine hits the cap', deferDays('looks_fine', 28), 7);
eq('28-day · drying normally hits the cap', deferDays('drying_normally', 28), 4);

// And a fast one is held off the floor rather than being asked about daily.
eq('3-day fern · still moist takes the floor', deferDays('still_moist', 3), 3);
eq('3-day fern · looks fine takes the floor', deferDays('looks_fine', 3), 2);

// The two that describe something wrong are flat: how fast a problem develops
// has nothing to do with how often the plant is watered.
eq('needs watching ignores a long interval', deferDays('needs_watching', 28), 2);
eq('standing water ignores a long interval', deferDays('standing_water', 28), 2);

// A plant with no tracked interval has nothing to scale against. It takes the
// floor rather than an invented number.
eq('no interval · still moist', deferDays('still_moist', null), 3);
eq('no interval · looks fine', deferDays('looks_fine', null), 2);
eq('a zero interval is treated as none', deferDays('still_moist', 0), 3);

// Nothing may ever return a same-day or backwards recheck: that would put the
// plant straight back on the board and make the whole feature pointless.
for (const r of [...INSPECT_REASONS, null]) {
  for (const interval of [1, 2, 3, 5, 7, 10, 14, 21, 28, 60]) {
    const d = deferDays(r, interval);
    ok(`defer is at least 2 days · ${r} · ${interval}d`, d >= 2);
    ok(`defer is at most 10 days · ${r} · ${interval}d`, d <= 10);
  }
}

/* ------------------------------------------------------------ the chips -- */

eq('six reasons, in the owner’s order', [...INSPECT_REASONS],
  ['still_moist', 'looks_fine', 'drying_normally', 'needs_watching', 'standing_water', 'other']);
eq('every reason has wording', INSPECT_REASONS.filter((r) => !REASON_TEXT[r]), []);
eq('the override choices are the agreed five', [...RECHECK_CHOICES], [2, 3, 5, 7, 10]);

ok('standing water is the one that needs doing something about',
  standingWaterNeedsAction('standing_water'));
eq('nothing else does',
  INSPECT_REASONS.filter((r) => r !== 'standing_water').filter(standingWaterNeedsAction), []);
ok('and neither does an unexplained check', !standingWaterNeedsAction(null));

/* --------------------------------------------------- the live recheck -- */

const ins = (event_id, date, over = {}) => ({
  event_id, plant_id: '013-OXA', type: 'Inspect', date, time: '10:00',
  source: 'user', device_id: 'd1', pending: 0, ...over,
});

{
  const list = [ins('E1', '2026-10-02', { reason: 'still_moist', recheck_days: 4 })];
  const live = liveRecheckFrom(list, '2026-10-02');
  ok('a check made today is live', !!live);
  eq('and names the day it comes back', live.until, '2026-10-06');
  eq('carrying the reason', live.reason, 'still_moist');
  ok('so the plant sits out', isDeferred(live));
}

{
  // The day it names is the day it returns, not the day after.
  const list = [ins('E1', '2026-10-02', { recheck_days: 4 })];
  ok('still deferred the day before', isDeferred(liveRecheckFrom(list, '2026-10-05')));
  eq('and back on the board on the day itself', liveRecheckFrom(list, '2026-10-06'), null);
  eq('and after it', liveRecheckFrom(list, '2026-10-20'), null);
}

{
  // An inspection with no recheck says nothing about when to look again. It is
  // a record that the owner looked, and nothing more.
  eq('an inspection with no recheck defers nothing',
    liveRecheckFrom([ins('E1', '2026-10-02', { reason: 'looks_fine' })], '2026-10-02'), null);
  eq('and an empty history defers nothing', liveRecheckFrom([], '2026-10-02'), null);
}

{
  // The most recent check wins, even when an older one would run longer.
  const list = [
    ins('E1', '2026-09-20', { reason: 'still_moist', recheck_days: 10 }),
    ins('E2', '2026-10-01', { reason: 'drying_normally', recheck_days: 2 }),
  ];
  const live = liveRecheckFrom(list, '2026-10-02');
  eq('the latest check wins', live.event_id, 'E2');
  eq('so the long old defer does not hold the plant', live.until, '2026-10-03');
}

/* --------------------------- standing water that was never dealt with --- */

{
  // THE ONE THAT MUST NOT REGRESS. The owner said there was water sitting in
  // the saucer and that they had not tipped it out. A board that hid the plant
  // for two days on the strength of that would be hiding the one thing on it
  // that was actually wrong.
  const list = [ins('E1', '2026-10-02', { reason: 'standing_water', recheck_days: 2, resolved: false })];
  const live = liveRecheckFrom(list, '2026-10-02');
  ok('an undrained plant still has a recheck recorded', !!live);
  ok('it is marked unresolved', live.unresolved);
  ok('and it does NOT sit out', !isDeferred(live));

  // Nor does it ever fall silent by simply getting old.
  const later = liveRecheckFrom(list, '2027-01-01');
  ok('months later it is still showing', later !== null && !isDeferred(later));
}

{
  // Drained, and it behaves like any other check.
  const list = [ins('E1', '2026-10-02', { reason: 'standing_water', recheck_days: 2, resolved: true })];
  const live = liveRecheckFrom(list, '2026-10-02');
  ok('a drained plant is deferred like any other', isDeferred(live));
  ok('and is not flagged unresolved', !live.unresolved);
  eq('coming back in two days', live.until, '2026-10-04');
}

/* ------------------------------------------- reading off the whole log -- */

{
  const log = [
    ins('E1', '2026-10-02', { reason: 'still_moist', recheck_days: 4 }),
    ins('E2', '2026-10-02', { plant_id: '001-MON', recheck_days: 9 }),
    { event_id: 'E3', plant_id: '013-OXA', type: 'Water', date: '2026-10-02', time: '10:00', source: 'user', device_id: 'd1', pending: 0 },
  ];
  eq('one plant’s checks do not defer another',
    liveRecheck(log, '013-OXA', '2026-10-02').until, '2026-10-06');
  eq('and the other plant keeps its own',
    liveRecheck(log, '001-MON', '2026-10-02').until, '2026-10-11');
  eq('a plant with no checks has none', liveRecheck(log, '002-SNK', '2026-10-02'), null);

  // A check taken back cannot keep a plant quiet. Otherwise voiding a
  // mis-tapped inspection would leave the plant hidden with nothing explaining
  // why — the worst kind of bug, because nothing appears to be wrong.
  eq('a voided inspection defers nothing',
    liveRecheck(log, '013-OXA', '2026-10-02', new Set(['E1'])), null);
}

/* ---------------------------------------------------------------- misc -- */

ok('nothing is deferred by a null recheck', !isDeferred(null));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
