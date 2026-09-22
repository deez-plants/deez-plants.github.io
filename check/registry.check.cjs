/**
 * The package registry — `package/registry.ts`.
 *
 * ## Why this file exists
 *
 * `PKG-2026-09-21-1` was built, saved, reviewed by the AI and answered, and
 * then refused by the app: "doesn't match any package this app exported." The
 * record was only ever written inside a closure held in React state, so losing
 * the screen lost the package, permanently and silently.
 *
 * The rules that fix that are the ones most worth checking, because getting
 * them wrong the other way is worse than the bug: read absence of `sent` as
 * "unconfirmed" and the Sep 15 and Sep 17 rounds unsend themselves and can be
 * answered twice. So the legacy-record case is the first thing here.
 *
 * Run with `npm run check:registry`.
 */

const {
  isConfirmedSent,
  confirmedSent,
  builtNotSent,
  consumedEventIds,
  consumedSessionIds,
  reconstructFromZip,
  recoveryBlocker,
} = require('./build/package/registry.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; }
  else { fail++; console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`); }
};
const ok = (name, cond) => eq(name, !!cond, true);

/* --------------------------------------------------------------- fixture -- */

const pkg = (package_id, over = {}) => ({
  package_id,
  generated: '2026-09-21',
  event_ids: [],
  plant_ids: ['001-MON'],
  transcript_tier: null,
  verified: false,
  session_ids: [],
  ...over,
});

const session = (session_id, over = {}) => ({
  session_id,
  started: '2026-09-21T10:00:00',
  duration_s: 170,
  markers: [],
  transcript: 'words',
  transcript_tier: 'verified',
  coverage: { passed: true, failures: [] },
  ...over,
});

/* ------------------------------------------- absence of `sent` means sent -- */

// The whole record written before 2026-09-21 has no `sent` field, and every
// one of those rows was written by `confirmSent` and by nothing else. Reading
// them as unconfirmed would retroactively unsend real rounds.
ok('a legacy record with no sent field counts as sent', isConfirmedSent(pkg('PKG-2026-09-17-1')));
ok('sent: null is not sent', !isConfirmedSent(pkg('PKG-2026-09-21-1', { sent: null })));
ok('sent: a date is sent', isConfirmedSent(pkg('PKG-2026-09-21-1', { sent: '2026-09-21' })));

{
  const all = [
    pkg('PKG-2026-09-15-1'),                            // legacy, sent
    pkg('PKG-2026-09-21-1', { sent: null }),            // built only
    pkg('PKG-2026-09-21-2', { sent: '2026-09-21' }),    // confirmed
  ];
  eq('confirmedSent keeps legacy and confirmed', confirmedSent(all).map((p) => p.package_id),
    ['PKG-2026-09-15-1', 'PKG-2026-09-21-2']);
  eq('builtNotSent keeps only the unconfirmed', builtNotSent(all).map((p) => p.package_id),
    ['PKG-2026-09-21-1']);
}

/* ------------------------------------- only a sent package consumes things -- */

// This is the property that kept cancelling the iOS share sheet harmless, and
// it has to survive the record being written earlier. A built package holds
// entries and walks without using them up.
{
  const all = [
    pkg('PKG-2026-09-15-1', { event_ids: ['E1', 'E2'], session_ids: ['SES-1'] }),
    pkg('PKG-2026-09-21-1', { event_ids: ['E3', 'E4'], session_ids: ['SES-2'], sent: null }),
  ];
  eq('a built package consumes no events', [...consumedEventIds(all)].sort(), ['E1', 'E2']);
  eq('a built package consumes no walks', [...consumedSessionIds(all)].sort(), ['SES-1']);

  const confirmed = all.map((p) => (p.sent === null ? { ...p, sent: '2026-09-21' } : p));
  eq('confirming releases its events into the consumed set',
    [...consumedEventIds(confirmed)].sort(), ['E1', 'E2', 'E3', 'E4']);
  eq('confirming releases its walks too',
    [...consumedSessionIds(confirmed)].sort(), ['SES-1', 'SES-2']);
}

// Discard is deleting the row, so the check is that removal restores
// eligibility — the same arithmetic from the other direction.
{
  const before = [pkg('PKG-A', { event_ids: ['E1'] }), pkg('PKG-B', { event_ids: ['E2'], sent: null })];
  const after = before.filter((p) => p.package_id !== 'PKG-B');
  eq('discarding a built package leaves the consumed set untouched',
    [...consumedEventIds(after)].sort(), [...consumedEventIds(before)].sort());
}

/* ------------------------------------------------- rebuilding from the ZIP -- */

const evidence = (over = {}) => ({
  manifest: {
    package_id: 'PKG-2026-09-21-1',
    generated: '2026-09-21',
    plants: [{ plant_id: '001-MON' }, { plant_id: '002-SNK' }],
  },
  events: [{ event_id: 'E1' }, { event_id: 'E2' }, { event_id: 'E3' }],
  markers: { sessions: [{ session_id: 'SES-2026-09-21-1' }] },
  ...over,
});

{
  const r = reconstructFromZip(evidence(), [session('SES-2026-09-21-1')]);
  ok('a sound ZIP reconstructs', r.ok);
  const rec = r.value.record;
  eq('the original package_id is preserved', rec.package_id, 'PKG-2026-09-21-1');
  eq('generated comes from the manifest', rec.generated, '2026-09-21');
  eq('plant_ids come from the manifest', rec.plant_ids, ['001-MON', '002-SNK']);
  eq('event_ids come from events.json', rec.event_ids, ['E1', 'E2', 'E3']);
  eq('session_ids come from markers.json', rec.session_ids, ['SES-2026-09-21-1']);
  eq('tier is recomputed from the live session', rec.transcript_tier, 'verified');
  eq('verified is recomputed from live coverage', rec.verified, true);
  // Recovery proves a package was BUILT. Whether it reached anyone is the
  // owner's answer, even when an update file citing it is sitting right there.
  eq('a recovered package lands unconfirmed', rec.sent, null);
  eq('and is marked as recovered', rec.recovered, true);
  eq('nothing is reported missing', r.value.missing_sessions, []);
}

{
  // A walk named in the ZIP that the device no longer holds is left out and
  // said out loud, rather than written into the record as if it were there.
  const r = reconstructFromZip(evidence(), []);
  ok('a ZIP whose walk is gone still reconstructs', r.ok);
  eq('the absent walk is not claimed', r.value.record.session_ids, []);
  eq('the absent walk is reported', r.value.missing_sessions, ['SES-2026-09-21-1']);
  eq('with no walk present there is nothing verified', r.value.record.verified, false);
  eq('and no tier', r.value.record.transcript_tier, null);
}

{
  // One unverified walk makes the package unverified — the same roll-up the
  // build applies, so a recovered record reads identically to a built one.
  const r = reconstructFromZip(
    evidence({ markers: { sessions: [{ session_id: 'A' }, { session_id: 'B' }] } }),
    [session('A'), session('B', { transcript_tier: 'unverified', coverage: { passed: false, failures: [] } })],
  );
  eq('the weakest transcript sets the tier', r.value.record.transcript_tier, 'unverified');
  eq('one failed coverage makes the package unverified', r.value.record.verified, false);
}

{
  // A package from before recording existed has no markers.json at all. That
  // is a package with no walks, not a broken file.
  const r = reconstructFromZip(evidence({ markers: null }), []);
  ok('a ZIP with no markers.json reconstructs', r.ok);
  eq('and carries no walks', r.value.record.session_ids, []);
}

ok('a ZIP with no package_id is refused',
  !reconstructFromZip(evidence({ manifest: { generated: '2026-09-21', plants: [] } }), []).ok);
ok('a malformed package_id is refused',
  !reconstructFromZip(evidence({ manifest: { package_id: 'PKG-nope', generated: '2026-09-21', plants: [] } }), []).ok);
ok('a missing generated date is refused',
  !reconstructFromZip(evidence({ manifest: { package_id: 'PKG-2026-09-21-1', plants: [] } }), []).ok);
ok('events.json that is not an array is refused',
  !reconstructFromZip(evidence({ events: { E1: true } }), []).ok);
ok('an entry with no event_id is refused',
  !reconstructFromZip(evidence({ events: [{ event_id: 'E1' }, { date: '2026-09-21' }] }), []).ok);
ok('a plant with no plant_id is refused',
  !reconstructFromZip(evidence({ manifest: { package_id: 'PKG-2026-09-21-1', generated: '2026-09-21', plants: [{ name: 'Monstera' }] } }), []).ok);

/* -------------------------------------------- the recovery precondition -- */

const candidate = reconstructFromZip(evidence(), [session('SES-2026-09-21-1')]).value.record;

eq('recovery is allowed against an unrelated history', recoveryBlocker(candidate, [
  pkg('PKG-2026-09-15-1', { event_ids: ['X1'], session_ids: ['SES-OLD'] }),
]), null);

ok('recovery is refused when the id is already registered',
  recoveryBlocker(candidate, [pkg('PKG-2026-09-21-1', { sent: null })]) !== null);

// The double-send case, which is the one the owner named. A confirmed package
// already holding one of these entries means registering this one would claim
// the AI was sent the same entry twice under two ids.
ok('recovery is refused when a sent package already carried one of its entries',
  recoveryBlocker(candidate, [pkg('PKG-2026-09-21-2', { event_ids: ['E2'], sent: '2026-09-21' })]) !== null);
ok('recovery is refused when a sent package already carried its walk',
  recoveryBlocker(candidate, [pkg('PKG-2026-09-21-2', { session_ids: ['SES-2026-09-21-1'], sent: '2026-09-21' })]) !== null);
ok('a legacy record counts as sent for the overlap check',
  recoveryBlocker(candidate, [pkg('PKG-2026-09-17-1', { event_ids: ['E1'] })]) !== null);

// An overlap with an UNCONFIRMED package is expected — rebuilding after the
// failure produces exactly that — and consumes nothing, so it is not a blocker.
eq('an overlap with a built-but-unsent package does not block recovery',
  recoveryBlocker(candidate, [pkg('PKG-2026-09-21-9', { event_ids: ['E1', 'E2'], session_ids: ['SES-2026-09-21-1'], sent: null })]),
  null);

/* ------------------------------------------------------------------------- */

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
