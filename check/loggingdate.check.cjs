/**
 * The date care is being logged for — `care/loggingDate.ts`.
 *
 * ## What this is guarding
 *
 * The owner asked for a backdating date that **outlives the screen**: set it on
 * Log care, walk through several plants, and it is still Tuesday. That is the
 * convenient half. The dangerous half is the same sentence: a date that
 * outlives the screen can outlive the owner's memory of setting it, and an
 * entry written onto the wrong day is permanent.
 *
 * So the rules below are the safety, and they are what this file exists for:
 * it is spent at midnight, spent on restart, and can never point at the
 * future. Every one of those is a way a forgotten date could silently write
 * care onto a day it did not happen.
 *
 * Run with `npm run check:logdate`.
 */

const {
  loggingDate, isBackdated, setLoggingDate, resetLoggingDate, getSnapshot,
} = require('./build/care/loggingDate.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; }
  else { fail++; console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`); }
};
const ok = (name, cond) => eq(name, !!cond, true);

const TODAY = '2026-10-26';

/* ---------------------------------------------------------- the default -- */

resetLoggingDate();
eq('nothing chosen means today', loggingDate(TODAY), TODAY);
ok('and nothing to announce', !isBackdated(TODAY));

/* ------------------------------------------------------------ backdating -- */

{
  setLoggingDate('2026-10-20', TODAY);
  eq('a past date is taken', loggingDate(TODAY), '2026-10-20');
  ok('and the screens must say so', isBackdated(TODAY));
}

{
  // Choosing today is the same as choosing nothing — it must clear, not sit
  // there as a stale choice that expires at a different moment.
  setLoggingDate(TODAY, TODAY);
  eq('choosing today clears it', loggingDate(TODAY), TODAY);
  ok('and stops announcing', !isBackdated(TODAY));
  eq('with nothing left in the store', getSnapshot(), { date: null, chosen_on: null });
}

{
  setLoggingDate('2026-10-20', TODAY);
  resetLoggingDate();
  eq('Back to today clears it', loggingDate(TODAY), TODAY);
  ok('and stops announcing', !isBackdated(TODAY));
}

/* ------------------------------------------------- it cannot reach forward -- */

{
  // You cannot water tomorrow. Refused rather than clamped: silently moving
  // the owner's choice is worse than ignoring it, because they cannot see it
  // happen.
  setLoggingDate('2026-10-27', TODAY);
  eq('tomorrow is refused', loggingDate(TODAY), TODAY);
  ok('and nothing is announced', !isBackdated(TODAY));

  setLoggingDate('2027-01-01', TODAY);
  eq('next year is refused', loggingDate(TODAY), TODAY);
}

{
  // And a date that was legal when chosen cannot become illegal and still
  // apply — this is the same guard from the other side.
  setLoggingDate('2026-10-20', TODAY);
  eq('a past choice read against an earlier day is ignored', loggingDate('2026-10-19'), '2026-10-19');
}

/* ------------------------------------------------- midnight spends it -- */

{
  // THE ONE THAT MATTERS MOST. The owner sets Tuesday on Monday night, goes to
  // bed, opens the app on Tuesday morning and waters the lot. Without this,
  // Tuesday's care lands on Monday and nothing on screen looks wrong, because
  // the band would be saying exactly what it said last night.
  setLoggingDate('2026-10-20', TODAY);
  eq('still live on the day it was chosen', loggingDate(TODAY), '2026-10-20');

  const TOMORROW = '2026-10-27';
  eq('spent once the day rolls over', loggingDate(TOMORROW), TOMORROW);
  ok('and nothing is announced the next day', !isBackdated(TOMORROW));

  // It does not come back if the clock is read again on the original day —
  // once the owner has moved on, a stale choice should not resurrect.
  eq('and it is still live if read on the original day', loggingDate(TODAY), '2026-10-20');
}

resetLoggingDate();
eq('the store is left clean for the app', getSnapshot(), { date: null, chosen_on: null });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
