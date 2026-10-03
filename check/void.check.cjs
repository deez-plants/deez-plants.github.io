/**
 * Taking an entry back — `care/voidEntry.ts`.
 *
 * ## What is actually at risk here
 *
 * This is the one write in the app that **changes what past numbers say**.
 * Void an old watering and adherence recalculates: "on time 14 of 18" becomes
 * "13 of 17". That is correct and intended, which is exactly why the rules
 * around it have to be tight — a feature that quietly rewrites history is only
 * safe while it refuses everything it was not meant to touch.
 *
 * So the refusals are the point of this file, not the happy path. Voiding a
 * Void would leave the record asserting two opposite things. Voiding a rating
 * would roll health back to an earlier judgement when rating again is one tap.
 * Voiding an Edit tangles with the conflict rule. None of those is hypothetical
 * tidiness: each is a door that, once open, is hard to shut, because every
 * entry written through it is permanent.
 *
 * Run with `npm run check:void`.
 */

const {
  voidBlocker, voidedIds, recentEntries, VOID_REASONS, VOID_REASON_TEXT,
} = require('./build/care/voidEntry.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; }
  else { fail++; console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`); }
};
const ok = (name, cond) => eq(name, !!cond, true);

const ev = (event_id, type, over = {}) => ({
  event_id, plant_id: '013-OXA', type, date: '2026-10-02', time: '10:00',
  source: 'user', device_id: 'd1', pending: 0, ...over,
});

const none = new Set();

/* ----------------------------------------------- what may be taken back -- */

for (const t of ['Water', 'Feed', 'Inspect', 'Dead leaves', 'Rotate', 'Mist', 'Repot', 'Photo']) {
  eq(`a ${t} entry can be taken back`, voidBlocker(ev('E1', t), none), null);
}

// Retired from the pickers but not from the model: the owner's historic Prune
// entries still render, and a mis-tapped one must still be correctable.
eq('a retired type can still be taken back', voidBlocker(ev('E1', 'Prune'), none), null);

/* ------------------------------------------------------- what may not be -- */

{
  const r = voidBlocker(ev('E1', 'Void', { voids: 'E0' }), none);
  ok('a Void cannot be voided', r !== null);
  ok('and it says why rather than going grey', r.includes('two opposite things'));
}

{
  const r = voidBlocker(ev('E1', 'Water'), new Set(['E1']));
  ok('an entry already taken back cannot be taken back twice', r !== null);
  ok('and says so plainly', r.includes('already'));
}

{
  const r = voidBlocker(ev('E1', 'Rate', { to: 7 }), none);
  ok('a rating is refused', r !== null);
  ok('and points at the cheaper answer', r.includes('rate the plant again'));
}

{
  const r = voidBlocker(ev('E1', 'Edit', { field: 'light', from: null, to: 'Bright' }), none);
  ok('an edit is refused', r !== null);
  ok('and points at changing it again', r.includes('changing it again'));
}

ok('archiving is refused', voidBlocker(ev('E1', 'Archive', { note: 'died' }), none) !== null);

// Every refusal is a sentence the owner can read, not a bare false.
{
  const refusals = [
    voidBlocker(ev('E1', 'Void', { voids: 'E0' }), none),
    voidBlocker(ev('E1', 'Rate', { to: 7 }), none),
    voidBlocker(ev('E1', 'Edit'), none),
    voidBlocker(ev('E1', 'Archive', { note: 'x' }), none),
    voidBlocker(ev('E1', 'Water'), new Set(['E1'])),
  ];
  eq('every refusal explains itself', refusals.filter((r) => typeof r !== 'string' || r.length < 20), []);
}

/* ---------------------------------------------------------- the reasons -- */

eq('the owner’s three', [...VOID_REASONS], ['wrong_plant', 'didnt_do_it', 'mis_tapped']);
eq('each has wording', VOID_REASONS.filter((r) => !VOID_REASON_TEXT[r]), []);

/* ------------------------------------------------------ what is voided -- */

{
  const log = [
    ev('E1', 'Water'),
    ev('E2', 'Water'),
    ev('V1', 'Void', { voids: 'E1' }),
  ];
  eq('the voided set is read off the log', [...voidedIds(log)], ['E1']);
  ok('so the voided one is refused', voidBlocker(log[0], voidedIds(log)) !== null);
  eq('and the other is not', voidBlocker(log[1], voidedIds(log)), null);
}

/* ------------------------------------------------- the Recently list -- */

const named = (id) => (id === '013-OXA' ? 'Purple Shamrock' : 'Large Monstera');

{
  const log = [
    ev('E1', 'Water', { date: '2026-09-28', time: '09:00' }),
    ev('E2', 'Water', { date: '2026-10-02', time: '08:00', plant_id: '001-MON' }),
    ev('E3', 'Inspect', { date: '2026-10-02', time: '11:00', recheck_days: 2 }),
  ];
  const list = recentEntries(log, named, 10);
  eq('newest first, by date then time', list.map((r) => r.event.event_id), ['E3', 'E2', 'E1']);
  eq('each carries its plant’s name', list[1].plant_name, 'Large Monstera');
  eq('and the cap is respected', recentEntries(log, named, 2).length, 2);
}

{
  // A voided entry still appears, struck through, with its Void beside it.
  // Hiding it would make the correction invisible, which is the opposite of
  // what append-only is for.
  const log = [ev('E1', 'Water'), ev('V1', 'Void', { voids: 'E1' })];
  const list = recentEntries(log, named, 10);
  const original = list.find((r) => r.event.event_id === 'E1');
  ok('the taken-back entry is still listed', !!original);
  ok('and marked as taken back', original.voided);
  ok('and cannot be taken back again', original.blocked !== null);
}

{
  // A rating shows on the list too. Omitting what cannot be voided would make
  // the owner think it had never been saved.
  const log = [ev('E1', 'Rate', { to: 7 })];
  const list = recentEntries(log, named, 10);
  eq('a rating is listed', list.length, 1);
  ok('and says why it cannot be taken back', list[0].blocked !== null);
}

{
  // Collection-level entries have no plant and belong to no row here.
  const log = [ev('E1', 'Water'), { ...ev('E2', 'Edit'), plant_id: null }];
  eq('a collection entry is left off', recentEntries(log, named, 10).map((r) => r.event.event_id), ['E1']);
}

{
  // A correction is listed, because hiding it would make the record read as if
  // nothing had happened — but the screen gives it no button, since one that
  // always refuses is noise. The rule it relies on is pinned here.
  const log = [ev('E1', 'Water'), ev('V1', 'Void', { voids: 'E1' })];
  const list = recentEntries(log, named, 10);
  const correction = list.find((r) => r.event.event_id === 'V1');
  ok('the correction appears on the list', !!correction);
  ok('and is refused if anything ever asks', correction.blocked !== null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
